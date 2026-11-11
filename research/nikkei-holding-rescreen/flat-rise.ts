/** Compare v12 with full screening restored on normally skipped flat rising candles. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { availableParallelism, freemem } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AllocationRebalance, BacktestSettings } from "../../lib/analysis/backtest";
import { buildCheckpointIdentity } from "../../lib/analysis/screening-worker-client";
import { LOCAL_SCREENING_ENGINE_VERSION } from "../../lib/analysis/screening-local-engine-protocol";
import { screeningResultPlan } from "../../lib/analysis/screening-plan";
import type { ScreeningValidationOutcome } from "../../lib/analysis/screening-validation";
import { selectBestShortcutScreeningResult } from "../../lib/analysis/shortcut-batch-screening";
import { SMA11_CLEAR_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import {
  buildStrategyCycleRollingReport, shouldScreenStrategyCycleAtIndex, strategyCyclePlanKey,
  strategyCycleRecentSignals, strategyCycleSignalDirection,
  type StrategyCycleSelectionSnapshot,
} from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import { Stepper, type State } from "../nikkei-screening-skip-audit/model";
import { needsHoldingScreen } from "./model";

const root = dirname(fileURLToPath(import.meta.url));
const project = join(root, "../..");
const sessions = 2000;
const screeningWindow = 10;
const maxCombinationStrategies = 6;
const epsilon = 1e-10;
const gib = 1024 ** 3;
const maxWorkers = Math.max(1, Math.min(6, availableParallelism() - 2));

async function readJson<T>(path: string): Promise<T> {
  assert.ok((await stat(path)).size <= 16 * 1024 ** 2, path);
  return JSON.parse(await readFile(path, "utf8"));
}

async function optionalJson<T>(path: string): Promise<T | undefined> {
  try {
    return await readJson<T>(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function saveJson(path: string, value: unknown) {
  await writeFile(path + ".tmp", JSON.stringify(value));
  await replaceFileAtomically(path + ".tmp", path);
}

const source = await readJson<{ data: string; output: string; identity: string; status: string }>(
  join(root, "output/latest.json"),
);
assert.equal(source.status, "complete");
const { bars, settings: frozenSettings, snapshots } = await readJson<{
  bars: MarketBar[];
  settings: BacktestSettings;
  snapshots: StrategyCycleSelectionSnapshot[];
}>(join(source.data, "input.json"));
const start = bars.length - sessions;
assert.ok(start >= screeningWindow && bars.length <= 10_000);
const settings = { ...frozenSettings, positionOverlay: DEFAULT_POSITION_OVERLAY_OPTIONS };
const regular = new Map(snapshots.map(snapshot => [snapshot.decisionIndex, snapshot]));
const holdingWinners = await readJson<StrategyCycleSelectionSnapshot[]>(join(source.output, "snapshots.json"));
const winners = new Map(holdingWinners.map(snapshot => [snapshot.decisionIndex, snapshot]));
const output = join(source.output, "flat-rise");
const jobs = join(source.data, "flat-rise-jobs");
await mkdir(output, { recursive: true });

const rising = new Set<number>();
for (let index = start + 1; index < bars.length; index++) {
  const today = bars[index], yesterday = bars[index - 1];
  if (!regular.has(index) && !shouldScreenStrategyCycleAtIndex(bars, index) &&
    today.close > today.open && yesterday.close > yesterday.open && today.close > yesterday.close) {
    rising.add(index);
  }
}

let interrupted = false;
process.on("SIGINT", () => { interrupted = true; });
process.on("SIGTERM", () => { interrupted = true; });
const inFlight = new Map<number, Promise<void>>();
let optimizerError: unknown;

async function loadWinner(index: number) {
  const prefix = bars.slice(0, index + 1);
  const endTime = bars[index].time;
  const search = {
    initialCash: settings.initialCash, commissionRate: settings.commissionRate,
    slippageRate: settings.slippageRate, interval: "1d" as const, executionPolicy: settings.executionPolicy,
    startTime: bars[index - screeningWindow + 1].time, endTime,
  };
  const config = { mode: "sample" as const, periods: [{ sessions: screeningWindow, weight: 100 }] };
  const objective = "totalReturn" as const;
  const request = {
    version: LOCAL_SCREENING_ENGINE_VERSION, settings: search, config,
    checkpoint: buildCheckpointIdentity(prefix, search, config, {
      objective, maxCombinationStrategies,
      checkpointNamespace: `cycle:holding-rescreen:${source.identity}:${index}:${screeningWindow}`,
    }),
    options: { objective, maxCombinationStrategies },
    barCount: prefix.length, sharedBarsPath: join(source.data, "bars.bin"),
  };
  let result: ScreeningValidationOutcome | undefined;
  for (const directory of [jobs, ...["jobs", "prefetch/jobs", "exit-timing-jobs"].map(path => join(source.data, path))]) {
    const job = join(directory, String(index));
    result = await optionalJson<ScreeningValidationOutcome>(join(job, "result.json"));
    if (!result) continue;
    assert.deepEqual(await readJson(join(job, "request.json")), request);
    break;
  }
  if (!result) {
    const job = join(jobs, String(index));
    await mkdir(job, { recursive: true });
    const path = join(job, "request.json");
    const saved = await optionalJson(path);
    if (saved) assert.deepEqual(saved, request);
    else await saveJson(path, request);
    console.log(`Optimizing ${endTime} (${index})`);
    for (let restart = 0; ; restart++) {
      assert.ok(!interrupted && !optimizerError, "Stopped at an optimizer checkpoint");
      assert.ok(restart < 4096, "Optimizer restart limit reached");
      const code = await new Promise<number | null>((accept, reject) => {
        const child = spawn(process.execPath, ["--import", "tsx", join(project, "scripts/screening-engine-child.ts"), job],
          { cwd: project, windowsHide: true, stdio: ["ignore", "ignore", "inherit"] });
        child.on("error", reject);
        child.on("exit", accept);
      });
      if (code === 75) continue;
      assert.equal(code, 0, `Optimizer failed for ${endTime}: ${job}`);
      result = await readJson<ScreeningValidationOutcome>(join(job, "result.json"));
      console.log(`Finished optimizer for ${endTime}`);
      break;
    }
  }
  assert.equal(result.cancelled, false);
  assert.equal(result.failedCount, 0);
  const best = selectBestShortcutScreeningResult(result.singleResults, result.results, objective);
  assert.ok(best, endTime);
  winners.set(index, {
    decisionIndex: index, decisionTime: endTime, screeningWindow, plan: screeningResultPlan(best.result),
    fixedRelativeLongStrategy: best.kind === "combination" ? best.result.relativeLongStrategy : null, label: endTime,
  });
}

function launch(index: number) {
  if (!winners.has(index) && !inFlight.has(index)) {
    inFlight.set(index, loadWinner(index).catch(error => {
      optimizerError ??= error;
    }).finally(() => {
      inFlight.delete(index);
    }));
  }
}

const baselineFlatRises: number[] = [];

async function replay(
  baselineDays?: readonly { target: number; equity: number }[],
  probeStates?: Map<number, State | null>,
) {
  const restoreFlatRises = baselineDays !== undefined;
  const stepper = new Stepper(bars, settings, undefined, DEFAULT_POSITION_OVERLAY_OPTIONS);
  let state = stepper.initial(start);
  const days = [], selections = [], flatScreens = [];
  const fills: AllocationRebalance[] = [];
  let holdingScreens = 0;
  for (let index = start; index < bars.length; index++) {
    assert.ok(!interrupted, "Interrupted; completed optimizer jobs remain reusable");
    if (optimizerError) throw optimizerError;
    const bar = bars[index];
    if (probeStates?.has(index)) probeStates.set(index, state);
    const isRegular = regular.has(index);
    const isHoldingScreen = !isRegular && needsHoldingScreen(bars, index, state.account.units);
    const isFlatRise = rising.has(index) && state.account.units <= epsilon;
    if (!restoreFlatRises && isFlatRise) baselineFlatRises.push(index);
    const isFlatScreen = restoreFlatRises && isFlatRise;
    let selected = regular.get(index);
    if (isHoldingScreen || isFlatScreen) {
      if (!winners.has(index)) {
        // Eligibility is always decided by this account. Baseline dates only prioritize precomputation.
        if (inFlight.size >= maxWorkers && !inFlight.has(index)) await Promise.race(inFlight.values());
        if (optimizerError) throw optimizerError;
        launch(index);
        if (restoreFlatRises && freemem() >= 8 * gib) {
          for (const ahead of baselineFlatRises) {
            if (inFlight.size >= maxWorkers) break;
            if (ahead > index) launch(ahead);
          }
        }
        await inFlight.get(index);
        if (optimizerError) throw optimizerError;
      }
      selected = winners.get(index);
      assert.ok(selected, bar.time);
    }
    const signals = selected ? strategyCycleRecentSignals(bars, selected, index) : [];
    const result = stepper.step(state, index, signals, selected ? strategyCyclePlanKey(selected) : state.planKey);
    if (selected) selections.push(selected);
    if (isHoldingScreen) holdingScreens++;
    if (isFlatScreen) {
      const omitted = stepper.step(state, index, []);
      flatScreens.push({
        time: bar.time, direction: strategyCycleSignalDirection(signals), target: result.state.target,
        targetWithoutScreen: omitted.state.target, baselineTarget: baselineDays[index - start].target,
        screenedEntry: result.state.account.units > epsilon,
        entryWithoutScreen: omitted.state.account.units > epsilon,
        signalBars: signals,
      });
    }
    state = result.state;
    fills.push(...result.fills);
    days.push({ time: bar.time, index, ...state.account, target: state.target,
      equity: state.account.cash + state.account.units * bar.close, fills: result.fills });
    if (restoreFlatRises && (isFlatScreen || (index - start) % 64 === 0)) {
      await saveJson(join(output, "progress.json"), {
        sourceIdentity: source.identity, through: bar.time, completedDays: days.length, sessions,
        flatScreens, holdingScreens, updatedAt: new Date().toISOString(),
        ...metrics(days), comparableBaseline: metrics(baselineDays.slice(0, days.length)),
      });
    }
  }
  const report = buildStrategyCycleRollingReport(bars, selections, sessions, screeningWindow,
    settings, selections.map(snapshot => snapshot.decisionIndex));
  assert.deepEqual(report.checkpoint!.current, state.account);
  assert.deepEqual(report.checkpoint!.currentOverlay, state.overlay);
  const economic = ({ time, fillPrice, fromAllocation, targetAllocation }: AllocationRebalance) =>
    ({ time, fillPrice, fromAllocation, targetAllocation });
  assert.deepEqual(report.rebalances.map(economic), fills.map(economic));
  const summary = { ...metrics(days), holdingScreens, flatScreens: flatScreens.length, fills: fills.length,
    entries: fills.filter(fill => fill.fromAllocation <= epsilon && fill.targetAllocation > epsilon).length };
  assert.ok(Math.abs(report.updateReturn - summary.net) < 1e-9);
  return { summary, days, flatScreens, selections };
}

function metrics(days: readonly { equity: number }[]) {
  let peak = settings.initialCash, maxDrawdown = 0;
  for (const { equity } of days) {
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, 100 * (1 - equity / peak));
  }
  const final = days.at(-1)!.equity;
  const trailing = (count: number) => days.length >= count
    ? 100 * (final / (days[days.length - count - 1]?.equity ?? settings.initialCash) - 1)
    : null;
  return { net: 100 * (final / settings.initialCash - 1), maxDrawdown, last500: trailing(500), last250: trailing(250) };
}

// Each restart cheaply replays the committed prefix, reusing durable per-date results.
try {
  const probeStates = new Map<number, State | null>();
  const probeDates = process.argv.slice(2);
  if (probeDates.length) {
    assert.ok(probeDates.length <= 2, "Pass at most two dates for a rebound probe");
    for (const date of probeDates) {
      const index = bars.findIndex(bar => bar.time === date);
      assert.ok(rising.has(index), `Not a skipped rising candle: ${date}`);
      probeStates.set(index, null);
    }
  }
  const baseline = await replay(undefined, probeStates);
  assert.ok(Math.abs(baseline.summary.net - 434.0252950540007) < 1e-9);
  assert.equal(baseline.summary.holdingScreens, 134);
  assert.equal(baseline.summary.fills, 135);
  if (probeDates.length) {
    for (const index of probeStates.keys()) launch(index);
    await Promise.all(inFlight.values());
    if (optimizerError) throw optimizerError;
    const stepper = new Stepper(bars, settings, undefined, DEFAULT_POSITION_OVERLAY_OPTIONS);
    const rows = [];
    for (const [index, state] of probeStates) {
      assert.ok(state && state.account.units <= epsilon);
      const winner = winners.get(index)!;
      const signals = strategyCycleRecentSignals(bars, winner, index);
      const screened = stepper.step(state, index, signals, strategyCyclePlanKey(winner));
      const skipped = stepper.step(state, index, []);
      rows.push({
        time: bars[index].time, signals, target: screened.state.target, targetWithoutScreen: skipped.state.target,
        filled: screened.state.account.units > epsilon, filledWithoutScreen: skipped.state.account.units > epsilon,
      });
    }
    await saveJson(join(output, `probe-${probeDates.join("_")}.json`), rows);
    console.log(JSON.stringify(rows));
  } else {
    await saveJson(join(output, "baseline.json"), baseline);
    console.log(`Baseline verified: ${baselineFlatRises.length} flat rising candidates out of ${rising.size}`);
    const alternative = await replay(baseline.days);
    await saveJson(join(output, "alternative.json"), alternative);
    const summary = {
      sourceIdentity: source.identity, start: bars[start].time, end: bars.at(-1)!.time, sessions,
      baseline: baseline.summary, alternative: alternative.summary,
      changedTargetDays: alternative.days.filter((day, offset) => day.target !== baseline.days[offset].target).length,
      entryDates: alternative.flatScreens.filter(row => row.screenedEntry && !row.entryWithoutScreen),
      suppressedEntryDates: alternative.flatScreens.filter(row => !row.screenedEntry && row.entryWithoutScreen),
    };
    await saveJson(join(output, "summary.json"), summary);
    console.log(JSON.stringify(summary));
  }
} finally {
  interrupted = true;
  await Promise.all(inFlight.values());
}
