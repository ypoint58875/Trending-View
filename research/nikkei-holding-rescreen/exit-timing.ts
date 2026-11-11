/** Counterfactual close timing for supplemental full-clear signals only. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { availableParallelism } from "node:os";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import { buildCheckpointIdentity } from "../../lib/analysis/screening-worker-client";
import { LOCAL_SCREENING_ENGINE_VERSION } from "../../lib/analysis/screening-local-engine-protocol";
import { selectBestShortcutScreeningResult } from "../../lib/analysis/shortcut-batch-screening";
import { screeningResultPlan } from "../../lib/analysis/screening-plan";
import { strategyCyclePlanKey, strategyCycleRecentSignals, strategyCycleSignalDirection,
  type StrategyCycleSelectionSnapshot, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { ScreeningValidationOutcome } from "../../lib/analysis/screening-validation";
import type { BacktestSettings } from "../../lib/analysis/backtest";
import type { MarketBar } from "../../lib/market/types";
import { Stepper } from "../nikkei-screening-skip-audit/model";
import { needsHoldingScreen } from "./model";
import { configureClearSlope, slopeLines, slopeModes, slopeSeries, slopeThresholds } from "./clear-slope";

const root = dirname(fileURLToPath(import.meta.url)), project = resolve(root, "../..");
async function load<T>(path: string): Promise<T> {
  assert.ok((await stat(path)).size <= 16 * 1024 ** 2, path);
  return JSON.parse(await readFile(path, "utf8"));
}
async function optional<T>(path: string): Promise<T | undefined> {
  try { return await load<T>(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
async function atomic(path: string, value: unknown) {
  await writeFile(path + ".tmp", JSON.stringify(value));
  await replaceFileAtomically(path + ".tmp", path);
}
const latest = await load<{ data: string; output: string; identity: string; status: string }>(join(root, "output/latest.json"));
assert.equal(latest.status, "complete");
const { bars, settings, snapshots } = await load<{ bars: MarketBar[]; settings: BacktestSettings;
  snapshots: StrategyCycleSelectionSnapshot[] }>(join(latest.data, "input.json"));
const original = await load<{ rows: Array<{ index: number; signals: StrategyCycleRecentSignal[] }> }>(join(latest.data, "original-signals.json"));
const reference = await load<{ alternative: { net: number; fills: number } }>(join(latest.output, "summary.json"));
const originalPlans = new Map(snapshots.map(row => [row.decisionIndex, row]));
const originalSignals = new Map(original.rows.map(row => [row.index, row.signals]));
const screened = await load<StrategyCycleSelectionSnapshot[]>(join(latest.output, "snapshots.json"));
const winners = new Map(screened.map(row => [row.decisionIndex, row]));
const signalCache = new Map<number, StrategyCycleRecentSignal[]>();
const delayStudy = process.argv.includes("--delay");
const candleStudy = process.argv.includes("--candle");
const slopeStudy = process.argv.includes("--slope");
assert.ok(Number(delayStudy) + Number(candleStudy) + Number(slopeStudy) <= 1);
const output = join(latest.output, slopeStudy ? "exit-slope" : candleStudy ? "exit-candle" : delayStudy ? "exit-delay" : "exit-timing");
await mkdir(output, { recursive: true });
const newJobs = join(latest.data, "exit-timing-jobs");
const start = bars.length - 2000;
assert.ok(start >= 10 && bars.length <= 10_000);

const pendingWinners = new Map<number, Promise<StrategyCycleSelectionSnapshot>>();
const workerLimit = Math.max(1, Math.min(5, availableParallelism() - 2));
let runningOptimizers = 0;
const optimizerWaiters: Array<() => void> = [];
async function withOptimizerSlot<T>(run: () => Promise<T>): Promise<T> {
  if (runningOptimizers >= workerLimit) await new Promise<void>(accept => optimizerWaiters.push(accept));
  else runningOptimizers++;
  try { return await run(); }
  finally {
    const next = optimizerWaiters.shift();
    if (next) next(); else runningOptimizers--;
  }
}
async function getWinner(index: number) {
  const cached = winners.get(index);
  if (cached) return cached;
  let pending = pendingWinners.get(index);
  if (!pending) {
    pending = loadWinner(index);
    pendingWinners.set(index, pending);
  }
  return pending;
}
async function loadWinner(index: number) {
  const cached = winners.get(index);
  if (cached) return cached;
  const endTime = bars[index].time, prefix = bars.slice(0, index + 1);
  const search = { initialCash: settings.initialCash, commissionRate: settings.commissionRate,
    slippageRate: settings.slippageRate, interval: "1d" as const, executionPolicy: settings.executionPolicy,
    startTime: bars[index - 9].time, endTime };
  const config = { mode: "sample" as const, periods: [{ sessions: 10, weight: 100 }] };
  const options = { objective: "totalReturn" as const, maxCombinationStrategies: 6,
    checkpointNamespace: `cycle:holding-rescreen:${latest.identity}:${index}:10` };
  const checkpoint = buildCheckpointIdentity(prefix, search, config, options);
  const request = { version: LOCAL_SCREENING_ENGINE_VERSION, settings: search, config, checkpoint,
    options: { objective: options.objective, maxCombinationStrategies: 6 },
    barCount: prefix.length, sharedBarsPath: join(latest.data, "bars.bin") };
  let result: ScreeningValidationOutcome | undefined;
  for (const base of [join(latest.data, "jobs"), join(latest.data, "prefetch/jobs"), newJobs]) {
    const job = join(base, String(index));
    result = await optional<ScreeningValidationOutcome>(join(job, "result.json"));
    if (!result) continue;
    assert.deepEqual(await load(join(job, "request.json")), request);
    break;
  }
  if (!result) result = await withOptimizerSlot(async () => {
    const job = join(newJobs, String(index));
    await mkdir(job, { recursive: true });
    const path = join(job, "request.json"), saved = await optional(path);
    if (saved) assert.deepEqual(saved, request); else await atomic(path, request);
    console.log(`Full optimizer required for ${endTime}; durable job ${index}`);
    for (let restart = 0; ; restart++) {
      assert.ok(restart < 4096, "Optimizer restart limit reached");
      const code = await new Promise<number | null>((accept, reject) => {
        const child = spawn(process.execPath, ["--import", "tsx", join(project, "scripts/screening-engine-child.ts"), job],
          { cwd: project, windowsHide: true, stdio: ["ignore", "ignore", "inherit"] });
        child.on("error", reject); child.on("exit", accept);
      });
      if (code === 75) continue;
      assert.equal(code, 0, `Optimizer failed on ${endTime}`);
      return load<ScreeningValidationOutcome>(join(job, "result.json"));
    }
  });
  assert.equal(result.cancelled, false); assert.equal(result.failedCount, 0);
  const best = selectBestShortcutScreeningResult(result.singleResults, result.results, options.objective);
  assert.ok(best);
  const selected: StrategyCycleSelectionSnapshot = { decisionIndex: index, decisionTime: endTime, screeningWindow: 10,
    plan: screeningResultPlan(best.result), fixedRelativeLongStrategy: best.kind === "combination" ? best.result.relativeLongStrategy : null,
    label: String(index) };
  winners.set(index, selected);
  return selected;
}

const slopeCases = slopeModes.flatMap(mode => slopeLines
  .filter(line => (mode === "all-three" || mode === "two-of-three") ? line === "ema7" : true)
  .flatMap(line => slopeThresholds.map(threshold => ({ mode, line, threshold,
    id: `${mode}-${line}-${threshold}` }))));
const slopes = slopeStudy ? slopeSeries(bars) : undefined;
const policies = slopeStudy
  ? ["original-filter", "standard-rescreen", ...slopeCases.map(item => item.id)]
  : candleStudy
  ? ["original-filter", "standard-rescreen", "bearish-lower", "bullish-lower", "bearish-higher", "bullish-higher"]
  : delayStudy
  ? ["original-filter", "standard-rescreen", "delay-1", "delay-2", "delay-3"]
  : ["original-filter", "standard-rescreen", "same-close", "next-close-accelerator", "next-close-only"];
async function replay(policy: string) {
  const slopeCase = slopeStudy ? slopeCases.find(item => item.id === policy) : undefined;
  const stepper = new Stepper(bars, settings, slopeCase && slopes
    ? overlay => configureClearSlope(overlay, slopeCase.mode, slopes[slopeCase.line], slopeCase.threshold)
    : undefined);
  let state = stepper.initial(start), nextCheck = -1;
  const candle = /^(bearish|bullish)-(lower|higher)$/.test(policy);
  const delay = candle ? 3 : policy.startsWith("delay-") ? Number(policy.slice(6)) : 0;
  let deferred: { source: number; due: number } | undefined;
  let extras = 0, fills = 0, clears = 0, pendingClearDays = 0;
  const days = [], signalsFound = [], overridden = [], deferredEvents = [];
  for (let i = start; i < bars.length; i++) {
    const regular = originalPlans.has(i), held = state.account.units > 1e-10;
    const extra = policy !== "original-filter" && !regular && needsHoldingScreen(bars, i, state.account.units);
    const winner = regular ? originalPlans.get(i) : extra ? await getWinner(i) : undefined;
    let signals = regular ? originalSignals.get(i)! : [];
    if (extra && winner) {
      extras++;
      if (!signalCache.has(i)) signalCache.set(i, strategyCycleRecentSignals(bars, winner, i));
      signals = signalCache.get(i)!;
    }
    const clearSignal = extra && strategyCycleSignalDirection(signals) === "reduce" &&
      signals.at(-1)!.targetAllocation <= 1e-10;
    if (clearSignal) signalsFound.push(bars[i].time);
    const confirmation = i === nextCheck && held && bars[i].close < bars[i].open && bars[i].close < bars[i - 1].close;
    const force = (policy === "same-close" && clearSignal) || confirmation;
    if (policy === "next-close-only" && clearSignal) signals = [];
    if (delay) {
      if (deferred && strategyCycleSignalDirection(signals) === "increase") {
        deferredEvents.push({ source: bars[deferred.source].time, time: bars[i].time, action: "canceled-by-entry" });
        deferred = undefined;
      }
      if (clearSignal) {
        signals = [];
        deferred ??= { source: i, due: i + delay };
      }
      const matchesCandle = candle && deferred && i > deferred.source &&
        (policy.startsWith("bearish") ? bars[i].close < bars[i].open : bars[i].close > bars[i].open) &&
        (policy.endsWith("lower") ? bars[i].close < bars[deferred.source].close : bars[i].close > bars[deferred.source].close);
      if (deferred && (deferred.due === i || matchesCandle)) {
        signals = [{ direction: "reduce", targetAllocation: 0, signals: ["long-exit"] }];
        deferredEvents.push({ source: bars[deferred.source].time, time: bars[i].time,
          action: matchesCandle ? "candle-matched" : "submitted" });
        deferred = undefined;
      }
    }
    const key = winner ? strategyCyclePlanKey(winner) : state.planKey;
    if (force && stepper.step(state, i, signals, key).state.target > 1e-10) overridden.push(bars[i].time);
    const next = stepper.step(state, i, signals, key, force);
    if (deferred && next.state.account.units <= 1e-10) {
      deferredEvents.push({ source: bars[deferred.source].time, time: bars[i].time, action: "already-flat" });
      deferred = undefined;
    }
    if (i === nextCheck) nextCheck = -1;
    if (clearSignal && next.state.account.units > 1e-10 &&
      (policy === "next-close-accelerator" || policy === "next-close-only")) nextCheck = i + 1;
    fills += next.fills.length;
    clears += next.fills.filter(fill => fill.fromAllocation > 1e-10 && fill.targetAllocation <= 1e-10).length;
    state = next.state;
    if (state.overlay.pending !== null && state.overlay.pending <= 1e-10 && state.account.units > 1e-10) pendingClearDays++;
    days.push({ time: bars[i].time, target: state.target, equity: state.account.cash + state.account.units * bars[i].close,
      extra, clearSignal, forced: force, confirmed: confirmation, fills: next.fills,
      pending: state.overlay.pending });
  }
  const equity = days.map(day => day.equity), final = equity.at(-1)!;
  let peak = settings.initialCash, maxDrawdown = 0;
  for (const value of equity) { peak = Math.max(peak, value); maxDrawdown = Math.max(maxDrawdown, 100 * (1 - value / peak)); }
  const summary = { policy, slopeCase, extras, fills, clears, pendingClearDays, signalsFound, overridden, deferredEvents, maxDrawdown,
    net: 100 * (final / settings.initialCash - 1),
    first1500: 100 * (equity[1499] / settings.initialCash - 1),
    last500: 100 * (final / equity[equity.length - 501] - 1),
    last250: 100 * (final / equity[equity.length - 251] - 1) };
  if (policy === "standard-rescreen") {
    assert.ok(Math.abs(summary.net - reference.alternative.net) < 1e-9);
    assert.equal(fills, reference.alternative.fills);
  }
  await atomic(join(output, policy + ".json"), { summary, days });
  console.log(JSON.stringify(summary));
  return summary;
}
const prefetch = process.argv.find(argument => argument.startsWith("--prefetch="));
if (prefetch) {
  const indexes = prefetch.slice("--prefetch=".length).split(",").map(Number);
  assert.ok(slopeStudy && indexes.length <= 4 && new Set(indexes).size === indexes.length &&
    indexes.every(i => Number.isInteger(i) && i >= start && i < bars.length &&
      !originalPlans.has(i) && needsHoldingScreen(bars, i, 1)));
  for (const index of indexes) void getWinner(index).catch(error => console.error(error));
}
const summaries = slopeStudy ? await Promise.all(policies.map(replay)) :
  await (async () => { const rows = []; for (const policy of policies) rows.push(await replay(policy)); return rows; })();
await atomic(join(output, "summary.json"), { sourceIdentity: latest.identity, summaries });
