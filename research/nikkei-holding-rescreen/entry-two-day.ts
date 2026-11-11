/** Two-session low rebound sensitivity with the current v12 overlay. */
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
import { strategyCyclePlanKey, strategyCycleRecentSignals, buildStrategyCycleRollingReport,
  type StrategyCycleSelectionSnapshot, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { ScreeningValidationOutcome } from "../../lib/analysis/screening-validation";
import type { BacktestSettings } from "../../lib/analysis/backtest";
import type { MarketBar } from "../../lib/market/types";
import { Stepper } from "../nikkei-screening-skip-audit/model";
import { needsHoldingScreen } from "./model";
import { SMA11_CLEAR_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";

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

const originalPlans = new Map(snapshots.map(row => [row.decisionIndex, row]));
const originalSignals = new Map(original.rows.map(row => [row.index, row.signals]));
const screened = await load<StrategyCycleSelectionSnapshot[]>(join(latest.output, "snapshots.json"));
const winners = new Map(screened.map(row => [row.decisionIndex, row]));
const signalCache = new Map<number, StrategyCycleRecentSignal[]>();
const output = join(latest.output, "entry-two-day");
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

const candidates = bars.map((bar, index) => {
  if (index < 11) return null;
  let lowIndex = index;
  for (let cursor = index - 4; cursor <= index; cursor++) {
    if (bars[cursor].open <= bars[lowIndex].open) lowIndex = cursor;
  }
  const age = index - lowIndex;
  if (age < 1 || age > 2) return null;
  const low = bars[lowIndex].open;
  const peak = Math.max(...bars.slice(Math.max(0, lowIndex - 10), lowIndex).map(day => day.close));
  if (low <= 0 || peak <= 0 || 1 - low / peak < 0.05 || bar.close / low - 1 <= 0.04) return null;
  return { lowIndex, lowTime: bars[lowIndex].time, low, peak, age,
    decline: 100 * (1 - low / peak), rebound: 100 * (bar.close / low - 1) };
});

async function replay(added: boolean) {
  const policy = added ? "v12-add-two-day" : "v12-baseline";
  const stepper = new Stepper(bars, settings, added ? overlay => {
    // Replace only the instance-owned mask. Never mutate the shared feature cache.
    Object.assign(overlay, { reversalEntry: overlay["reversalEntry"].map((value, index) => value || candidates[index] !== null) });
  } : undefined, DEFAULT_POSITION_OVERLAY_OPTIONS);
  const nativeStepper = new Stepper(bars, settings, undefined, DEFAULT_POSITION_OVERLAY_OPTIONS);
  let state = stepper.initial(start), extras = 0;
  const days = [], fills = [], entries = [], selections = [];
  for (let index = start; index < bars.length; index++) {
    const regular = originalPlans.has(index);
    const extra = !regular && needsHoldingScreen(bars, index, state.account.units);
    const winner = regular ? originalPlans.get(index) : extra ? await getWinner(index) : undefined;
    let signals = regular ? originalSignals.get(index)! : [];
    if (extra && winner) {
      extras++;
      if (!signalCache.has(index)) signalCache.set(index, strategyCycleRecentSignals(bars, winner, index));
      signals = signalCache.get(index)!;
    }
    if (winner) selections.push(winner);
    const key = winner ? strategyCyclePlanKey(winner) : state.planKey;
    const next = stepper.step(state, index, signals, key);
    const candidate = candidates[index];
    let addedEntry = false;
    if (added && candidate && next.state.target > 1e-10 &&
      nativeStepper.step(state, index, signals, key).state.target <= 1e-10) {
      assert.equal(signals.length, 0);
      assert.ok(index >= state.overlay.blockedUntil);
      assert.ok(state.account.units <= 1e-10);
      assert.equal(next.state.target, 1);
      addedEntry = true;
      entries.push({ time: bars[index].time, index, ...candidate });
    }
    state = next.state;
    fills.push(...next.fills);
    days.push({ index, time: bars[index].time, equity: state.account.cash + state.account.units * bars[index].close,
      target: state.target, cash: state.account.cash, units: state.account.units,
      extra, addedEntry, fills: next.fills, pending: state.overlay.pending });
  }
  const equity = days.map(day => day.equity), final = equity.at(-1)!;
  let peak = settings.initialCash, maxDrawdown = 0;
  for (const value of equity) {
    peak = Math.max(peak, value);
    maxDrawdown = Math.max(maxDrawdown, 100 * (1 - value / peak));
  }
  const summary = { policy, extras, fills: fills.length,
    clears: fills.filter(fill => fill.fromAllocation > 1e-10 && fill.targetAllocation <= 1e-10).length,
    maxDrawdown, addedEntries: entries.length, entries,
    net: 100 * (final / settings.initialCash - 1),
    last500: 100 * (final / equity[equity.length - 501] - 1),
    last250: 100 * (final / equity[equity.length - 251] - 1) };
  if (!added) {
    assert.ok(Math.abs(summary.net - 434.025295) < 0.000001, "Current v12 frozen baseline parity");
    assert.equal(summary.fills, 135);
    assert.equal(extras, 134);
    const report = buildStrategyCycleRollingReport(bars, selections, 2000, 10,
      { ...settings, positionOverlay: DEFAULT_POSITION_OVERLAY_OPTIONS }, selections.map(row => row.decisionIndex));
    assert.ok(Math.abs(report.updateReturn - summary.net) < 1e-9);
    assert.deepEqual(report.checkpoint!.current, state.account);
    assert.deepEqual(report.checkpoint!.currentOverlay, state.overlay);
  }
  await atomic(join(output, policy + ".json"), { summary, days, selections });
  console.log(JSON.stringify(summary));
  return { summary, days };
}

const baseline = await replay(false);
const alternative = await replay(true);
const changed = alternative.days.filter((day, index) => Math.abs(day.target - baseline.days[index].target) > 1e-10);
const summaries = [baseline.summary, alternative.summary];
await atomic(join(output, "summary.json"), { sourceIdentity: latest.identity,
  start: bars[start].time, end: bars.at(-1)!.time, sessions: 2000,
  definition: "Add empty-account entry: trailing-five latest lowest open, preceding-ten-close decline >=5%, first or second subsequent bar closes >4% above low. Existing entries retained.",
  summaries, differentTargetDays: changed.map(day => day.time) });
console.log(`Completed; ${changed.length} different target days. Output: ${output}`);
