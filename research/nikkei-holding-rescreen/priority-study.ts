/** Compare entry, exit and post-stop precedence on the frozen v12 account. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BacktestSettings } from "../../lib/analysis/backtest";
import { LOCAL_SCREENING_ENGINE_VERSION } from "../../lib/analysis/screening-local-engine-protocol";
import { buildCheckpointIdentity } from "../../lib/analysis/screening-worker-client";
import { screeningResultPlan } from "../../lib/analysis/screening-plan";
import type { ScreeningValidationOutcome } from "../../lib/analysis/screening-validation";
import { selectBestShortcutScreeningResult } from "../../lib/analysis/shortcut-batch-screening";
import {
  SMA11_CLEAR_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS, EARLY_POSITION_STOP_BARS, EARLY_POSITION_STOP_FRACTION,
  POST_STOP_WAIT_BARS, SmaPositionOverlay,
} from "../../lib/analysis/sma-position-overlay";
import {
  strategyCyclePlanKey, strategyCycleRecentSignals, strategyCycleSignalDirection,
  type StrategyCycleSelectionSnapshot,
} from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import { Stepper } from "../nikkei-screening-skip-audit/model";
import { needsHoldingScreen } from "./model";

const root = dirname(fileURLToPath(import.meta.url));
const epsilon = 1e-10;
const sessions = 2000;
async function read<T>(path: string): Promise<T> {
  assert.ok((await stat(path)).size <= 16 * 1024 ** 2, path);
  return JSON.parse(await readFile(path, "utf8"));
}

const source = await read<{ data: string; output: string; identity: string; status: string }>(join(root, "output/latest.json"));
assert.equal(source.status, "complete");
const { bars, settings, snapshots } = await read<{
  bars: MarketBar[];
  settings: BacktestSettings;
  snapshots: StrategyCycleSelectionSnapshot[];
}>(join(source.data, "input.json"));
const start = bars.length - sessions;
assert.ok(start >= 10 && bars.length <= 10_000);
const baseline = await read<{
  selections: StrategyCycleSelectionSnapshot[];
  days: { time: string; target: number; equity: number; units: number }[];
}>(join(source.output, "flat-rise/baseline.json"));
const prior = await read<StrategyCycleSelectionSnapshot[]>(join(source.output, "snapshots.json"));
const original = new Set(snapshots.map(row => row.decisionIndex));
const fixed = new Set(baseline.selections.map(row => row.decisionIndex));
const winners = new Map([...prior, ...baseline.selections].map(row => [row.decisionIndex, row]));
const misses = new Set<number>();
const signalCache = new Map<number, ReturnType<typeof strategyCycleRecentSignals>>();
const signalKey = new Map<number, string>();
const output = join(source.output, "priority-study");
await mkdir(output, { recursive: true });

async function loadWinner(index: number) {
  if (winners.has(index)) return winners.get(index);
  if (misses.has(index)) return undefined;
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
    const snapshot = {
      decisionIndex: index, decisionTime: endTime, screeningWindow: 10,
      plan: screeningResultPlan(best.result), label: endTime,
      fixedRelativeLongStrategy: best.kind === "combination" ? best.result.relativeLongStrategy : null,
    };
    winners.set(index, snapshot);
    return snapshot;
  }
  misses.add(index);
}

const waitModes = ["strict", "e-final-two", "e-any-day", "recovery-final-two"] as const;
const fixedWaitDays = [0, 1, 2, 3, 4] as const;
const entryModes = ["native", "engulf-before-reduce", "e-before-reduce", "both-before-reduce"] as const;
const exitModes = ["native", "ready-clear-before-buy", "keep-clear-on-no-add"] as const;
const narrowExitModes = ["ready-pending-clear-before-buy", "keep-clear-on-blocked-increase"] as const;
const riskModes = ["native", "record-risk-first"] as const;
interface Policy {
  wait: typeof waitModes[number] | typeof fixedWaitDays[number];
  entry: typeof entryModes[number];
  exit: typeof exitModes[number] | typeof narrowExitModes[number];
  risk: typeof riskModes[number];
}
const control: Policy = { wait: "strict", entry: "native", exit: "native", risk: "native" };
const id = ({ wait, entry, exit, risk }: Policy) => [wait, entry, exit, risk].join("/");
const features = new SmaPositionOverlay(bars, DEFAULT_POSITION_OVERLAY_OPTIONS, 0, 1);
const market = bars.map((_, index) => ({
  e: features["features"].policy?.shapeEntry[index] === true && features["features"].entryAllowed[index],
  engulf: features["reversalEntry"][index],
  recovery: features["recoveryAllowed"][index],
  atr: features["features"].policy?.shockExit[index] === true,
}));

function keepClearOnNoAdd(overlay: SmaPositionOverlay, requireLargerTarget: boolean) {
  const request = overlay.request.bind(overlay);
  overlay.request = (direction, target, index) => {
    const pending = overlay["pending"];
    const before = overlay.allocation;
    const allocation = request(direction, target, index);
    if (direction === "increase" && pending === 0 && before > epsilon && allocation <= before + epsilon &&
      (!requireLargerTarget || target > before + epsilon)) {
      // Preserve the range transaction opened by the original request.
      Object.assign(overlay, { pending });
    }
    return allocation;
  };
}

async function replay(policy: Policy, dynamic: boolean) {
  const narrowNoAdd = policy.exit === "keep-clear-on-blocked-increase";
  const keepPending = narrowNoAdd || policy.exit === "keep-clear-on-no-add";
  const stepper = new Stepper(bars, settings,
    keepPending ? overlay => keepClearOnNoAdd(overlay, narrowNoAdd) : undefined, DEFAULT_POSITION_OVERLAY_OPTIONS);
  let state = stepper.initial(start);
  const equity: number[] = [];
  const targets: number[] = [];
  const events: { time: string; type: string; target: number }[] = [];
  let fills = 0, screens = 0, pendingDays = 0, stops = 0;
  let earlyStops = 0, waitingDays = 0, eWhileWaiting = 0, recoveryWhileWaiting = 0;
  let peak = settings.initialCash, maxDrawdown = 0;
  for (let i = start; i < bars.length; i++) {
    const bar = bars[i], previous = state.overlay;
    const held = state.account.units > epsilon;
    const isScreen = dynamic ? original.has(i) || needsHoldingScreen(bars, i, state.account.units) : fixed.has(i);
    const snapshot = isScreen ? await loadWinner(i) : undefined;
    if (isScreen && !snapshot) return { missing: bar.time } as const;
    if (snapshot) {
      screens++;
      if (!signalCache.has(i)) {
        signalCache.set(i, strategyCycleRecentSignals(bars, snapshot, i));
        signalKey.set(i, strategyCyclePlanKey(snapshot));
      }
    }
    let signals = snapshot ? signalCache.get(i)! : [];
    const planKey = snapshot ? signalKey.get(i)! : state.planKey;
    const direction = strategyCycleSignalDirection(signals);
    const shape = market[i];
    const canPromote = previous.pending === null &&
      ((shape.engulf && (policy.entry === "engulf-before-reduce" || policy.entry === "both-before-reduce")) ||
        (shape.e && (policy.entry === "e-before-reduce" || policy.entry === "both-before-reduce")));
    const waiting = i < previous.blockedUntil;
    if (!held && waiting && previous.recoveryTarget !== null) {
      waitingDays++;
      if (shape.e && signals.length === 0 && previous.pending === null) eWhileWaiting++;
      if (shape.recovery && signals.length === 0 && previous.pending === null) recoveryWhileWaiting++;
    }
    const earlyRisk = held && previous.entryIndex !== null && i - previous.entryIndex <= EARLY_POSITION_STOP_BARS &&
      previous.entryClose > 0 && bar.close <= previous.entryClose * (1 - EARLY_POSITION_STOP_FRACTION);
    let event: string | undefined;
    if (!held && !waiting && canPromote && direction === "reduce") {
      signals = [];
      event = "entry-before-reduce";
    }
    let before = state;
    if (!held && waiting && typeof policy.wait === "number" &&
      previous.recoveryTarget !== null && i - previous.stoppedAt > policy.wait) {
      before = { ...state, overlay: { ...previous, blockedUntil: i } };
      event = "fixed-wait-ended";
    } else if (!held && waiting && signals.length === 0 && previous.pending === null) {
      const finalTwo = i - previous.stoppedAt >= POST_STOP_WAIT_BARS - 1;
      const allow = ((policy.wait === "e-any-day" || policy.wait === "e-final-two" && finalTwo) && shape.e) ||
        (policy.wait === "recovery-final-two" && finalTwo && previous.recoveryTarget !== null && shape.recovery);
      if (allow) {
        before = { ...state, overlay: { ...previous, blockedUntil: i } };
        event = "entry-during-wait";
      }
    }
    const clearFirst = policy.exit === "ready-clear-before-buy" ||
      policy.exit === "ready-pending-clear-before-buy" && previous.pending === 0;
    if (held && direction === "increase" && clearFirst && !earlyRisk && !shape.atr) {
      const withoutBuy = stepper.step(before, i, [], planKey);
      if (withoutBuy.state.target <= epsilon) {
        signals = [];
        event = "ready-clear-before-buy";
      }
    }
    const next = stepper.step(before, i, signals, planKey);
    state = next.state;
    if (event) events.push({ time: bar.time, type: event, target: state.target });
    if (held && direction === "increase" && previous.pending === 0 && keepPending &&
      (!narrowNoAdd || signals.at(-1)!.targetAllocation > before.target + epsilon) &&
      state.target <= before.target + epsilon && (state.overlay.pending === 0 || state.target <= epsilon)) {
      events.push({ time: bar.time, type: "clear-survives-no-add", target: state.target });
    }
    if (held && state.target <= epsilon && (earlyRisk || shape.atr) &&
      (state.overlay.stoppedAt !== i || earlyRisk && state.overlay.blockedUntil < i + POST_STOP_WAIT_BARS + 1)) {
      events.push({ time: bar.time, type: earlyRisk ? "early-stop-metadata-collision" : "atr-metadata-collision",
        target: state.target });
      if (policy.risk === "record-risk-first") {
        state.overlay = { ...state.overlay, pending: null, lastSupplement: null, entryIndex: null,
          entryClose: earlyRisk ? previous.entryClose : 0, stoppedAt: i,
          blockedUntil: Math.max(previous.blockedUntil, i + (earlyRisk ? POST_STOP_WAIT_BARS : 0) + 1),
          recoveryTarget: earlyRisk ? previous.allocation : null };
      }
    }
    if (state.overlay.stoppedAt === i) {
      stops++;
      if (state.overlay.recoveryTarget !== null) earlyStops++;
    }
    if (state.overlay.pending === 0) pendingDays++;
    fills += next.fills.length;
    const value = state.account.cash + state.account.units * bar.close;
    equity.push(value);
    targets.push(state.target);
    peak = Math.max(peak, value);
    maxDrawdown = Math.max(maxDrawdown, 100 * (1 - value / peak));
  }
  const at = (offset: number) => offset === 0 ? settings.initialCash : equity[offset - 1];
  const pct = (from: number, to: number) => 100 * (at(to) / at(from) - 1);
  const pathHash = createHash("sha256").update(JSON.stringify([equity, targets])).digest("hex");
  return { metrics: {
    net: pct(0, sessions), last500: pct(1500, sessions), last250: pct(1750, sessions),
    first1500: pct(0, 1500), blocks: [0, 500, 1000, 1500].map(from => pct(from, from + 500)),
    maxDrawdown, fills, screens, pendingDays, stops, earlyStops, waitingDays, eWhileWaiting, recoveryWhileWaiting,
    changedTargets: targets.filter((target, offset) => Math.abs(target - baseline.days[offset].target) > epsilon).length,
  }, equity, targets, events, pathHash } as const;
}

const baselineCheck = await replay(control, true);
assert.ok(baselineCheck.metrics);
assert.equal(baselineCheck.metrics.fills, 135);
assert.equal(baselineCheck.metrics.screens, 1427);
assert.deepEqual(baselineCheck.equity, baseline.days.map(day => day.equity));
assert.deepEqual(baselineCheck.targets, baseline.days.map(day => day.target));

const rows = [];
const traces = [];
const policies: Policy[] = [];
for (const wait of waitModes) for (const entry of entryModes) for (const exit of exitModes) for (const risk of riskModes) {
  policies.push({ wait, entry, exit, risk });
}
for (const wait of fixedWaitDays) policies.push({ ...control, wait });
for (const exit of narrowExitModes) policies.push({ ...control, exit });
for (const policy of policies) {
  const fixedPath = await replay(policy, false);
  assert.ok(fixedPath.metrics);
  const dynamic = await replay(policy, true);
  const changedAxes = Number(policy.wait !== control.wait) + Number(policy.entry !== control.entry) +
    Number(policy.exit !== control.exit) + Number(policy.risk !== control.risk);
  if (dynamic.metrics && changedAxes <= 1) {
    traces.push({ id: id(policy), equity: dynamic.equity, targets: dynamic.targets });
  }
  rows.push({
    id: id(policy), policy, fixed: fixedPath.metrics, fixedEvents: fixedPath.events, fixedPathHash: fixedPath.pathHash,
    dynamic: dynamic.metrics ?? null, dynamicEvents: dynamic.events ?? null, dynamicPathHash: dynamic.pathHash ?? null,
    firstMissing: dynamic.missing ?? null,
  });
}
const report = { sourceIdentity: source.identity, start: bars[start].time, end: bars.at(-1)!.time, sessions,
  control: id(control), configurations: rows.length, rows };
const tracePath = join(output, "traces.json");
await writeFile(tracePath + ".tmp", JSON.stringify({
  sourceIdentity: source.identity, initialCash: settings.initialCash, dates: bars.slice(start).map(bar => bar.time), traces,
}));
await replaceFileAtomically(tracePath + ".tmp", tracePath);
const target = join(output, "summary.json");
await writeFile(target + ".tmp", JSON.stringify(report));
await replaceFileAtomically(target + ".tmp", target);
console.log(`Verified ${rows.length} fixed-calendar and ${rows.filter(row => row.dynamic).length} dynamic-calendar replays: ${target}`);
