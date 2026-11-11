/** Replay the effect of promoting the existing v12 bullish-engulfing entry. */
import assert from "node:assert/strict";
import { readFile, stat, writeFile } from "node:fs/promises";
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
  strategyCyclePlanKey, strategyCycleRecentSignals, strategyCycleSignalDirection,
  type StrategyCycleRecentSignal, type StrategyCycleSelectionSnapshot,
} from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import { Stepper } from "../nikkei-screening-skip-audit/model";
import { needsHoldingScreen } from "./model";

const root = dirname(fileURLToPath(import.meta.url));
async function read<T>(path: string): Promise<T> {
  assert.ok((await stat(path)).size <= 16 * 1024 ** 2);
  return JSON.parse(await readFile(path, "utf8"));
}

const source = await read<{ data: string; output: string; identity: string }>(join(root, "output/latest.json"));
const { bars, settings, snapshots } = await read<{
  bars: MarketBar[];
  settings: BacktestSettings;
  snapshots: StrategyCycleSelectionSnapshot[];
}>(join(source.data, "input.json"));
const out = join(source.output, "flat-rise");
const baseline = await read<{ selections: StrategyCycleSelectionSnapshot[] }>(join(out, "baseline.json"));
const oldSelections = await read<StrategyCycleSelectionSnapshot[]>(join(source.output, "snapshots.json"));
const winners = new Map([...oldSelections, ...baseline.selections].map(snapshot => [snapshot.decisionIndex, snapshot]));
const regular = new Set(snapshots.map(snapshot => snapshot.decisionIndex));
const fixed = new Set(baseline.selections.map(snapshot => snapshot.decisionIndex));
const start = bars.length - 2000;
assert.ok(start >= 10 && bars.length <= 10_000);
const epsilon = 1e-10;

async function cachedWinner(index: number) {
  const winner = winners.get(index);
  if (winner) return winner;
  const endTime = bars[index].time;
  const search = {
    initialCash: settings.initialCash, commissionRate: settings.commissionRate,
    slippageRate: settings.slippageRate, interval: "1d" as const, executionPolicy: settings.executionPolicy,
    startTime: bars[index - 9].time, endTime,
  };
  const config = { mode: "sample" as const, periods: [{ sessions: 10, weight: 100 }] };
  const options = { objective: "totalReturn" as const, maxCombinationStrategies: 6 };
  for (const directory of ["jobs", "prefetch/jobs", "exit-timing-jobs", "flat-rise-jobs"]) {
    const path = join(source.data, directory, String(index));
    let result: ScreeningValidationOutcome;
    try {
      result = await read<ScreeningValidationOutcome>(join(path, "result.json"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      continue;
    }
    assert.deepEqual(await read(join(path, "request.json")), {
      version: LOCAL_SCREENING_ENGINE_VERSION, settings: search, config, options,
      checkpoint: buildCheckpointIdentity(bars.slice(0, index + 1), search, config, {
        ...options, checkpointNamespace: `cycle:holding-rescreen:${source.identity}:${index}:10`,
      }),
      barCount: index + 1, sharedBarsPath: join(source.data, "bars.bin"),
    });
    assert.equal(result.cancelled, false);
    assert.equal(result.failedCount, 0);
    const best = selectBestShortcutScreeningResult(result.singleResults, result.results, options.objective);
    assert.ok(best, endTime);
    const selected = {
      decisionIndex: index, decisionTime: endTime, screeningWindow: 10, plan: screeningResultPlan(best.result),
      fixedRelativeLongStrategy: best.kind === "combination" ? best.result.relativeLongStrategy : null, label: endTime,
    };
    winners.set(index, selected);
    return selected;
  }
}

const signalsByIndex = new Map<number, StrategyCycleRecentSignal[]>();
const patterns: boolean[] = [];
function stepperForReplay() {
  return new Stepper(bars, settings, overlay => {
    if (!patterns.length) patterns.push(...overlay["reversalEntry"]);
  }, DEFAULT_POSITION_OVERLAY_OPTIONS);
}

async function replay(priority: "current" | "before-reductions" | "before-all-signals", dynamic: boolean) {
  const stepper = stepperForReplay();
  let state = stepper.initial(start);
  const days: { time: string; equity: number; target: number; fills: AllocationRebalance[] }[] = [];
  const affected = [], overlaps = [], missing = [];
  let fills = 0, holdingScreens = 0, peak = settings.initialCash, maxDrawdown = 0;
  for (let index = start; index < bars.length; index++) {
    const time = bars[index].time;
    const selected = dynamic ? regular.has(index) || needsHoldingScreen(bars, index, state.account.units) : fixed.has(index);
    const winner = selected ? await cachedWinner(index) : undefined;
    if (selected && !winner) {
      missing.push({ index, time });
      break;
    }
    if (selected && !regular.has(index)) holdingScreens++;
    const key = winner ? strategyCyclePlanKey(winner) : state.planKey;
    if (winner && !signalsByIndex.has(index)) signalsByIndex.set(index, strategyCycleRecentSignals(bars, winner, index));
    const signals = winner ? signalsByIndex.get(index)! : [];
    const direction = strategyCycleSignalDirection(signals);
    const eligible = patterns[index] && state.account.units <= epsilon && index >= state.overlay.blockedUntil;
    const native = stepper.step(state, index, signals, key);
    const promote = eligible && signals.length > 0 &&
      (priority === "before-all-signals" || (priority === "before-reductions" && direction === "reduce"));
    const next = promote ? stepper.step(state, index, [], key) : native;
    if (promote) {
      assert.equal(next.state.target, 1);
      assert.equal(next.state.overlay.lastSupplement, index);
      affected.push({ time, direction, priorTarget: native.state.target, target: next.state.target,
        nativeProtection: native.state.overlay.lastSupplement, promotedProtection: next.state.overlay.lastSupplement });
    }
    if (eligible) overlaps.push({ time, direction, signals, nativeTarget: native.state.target });
    state = next.state;
    fills += next.fills.length;
    const equity = state.account.cash + state.account.units * bars[index].close;
    days.push({ time, equity, target: state.target, fills: next.fills });
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, 100 * (1 - equity / peak));
  }
  const final = days.at(-1)!.equity;
  const trailing = (count: number) => days.length === 2000
    ? 100 * (final / days.at(-1 - count)!.equity - 1)
    : null;
  return { priority, dynamic, sessions: days.length, missing, net: 100 * (final / settings.initialCash - 1),
    maxDrawdown, last500: trailing(500), last250: trailing(250), fills, holdingScreens, affected, overlaps, days };
}

const priorities = ["current", "before-reductions", "before-all-signals"] as const;
const comparison = [];
for (const priority of priorities) {
  const chronological = await replay(priority, true);
  comparison.push(chronological.missing.length
    ? { chronological, fixedCalendar: await replay(priority, false) }
    : { chronological });
}
const control = comparison[0].chronological;
assert.equal(control.sessions, 2000);
assert.ok(Math.abs(control.net - 434.0252950540007) < 1e-9);
assert.equal(control.fills, 135);
assert.equal(control.holdingScreens, 134);
assert.deepEqual((await replay("current", false)).days, control.days);
const output = { sourceIdentity: source.identity, start: bars[start].time, end: bars.at(-1)!.time, comparison };
const path = join(out, "engulfing-priority.json");
await writeFile(path + ".tmp", JSON.stringify(output));
await replaceFileAtomically(path + ".tmp", path);
for (const { chronological, fixedCalendar } of comparison) {
  const { days, ...summary } = fixedCalendar ?? chronological;
  assert.ok(days.length > 0);
  console.log(JSON.stringify({ ...summary, firstMissingWinner: chronological.missing[0] }));
}
