import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildStrategyPlanTimeline } from "../../lib/analysis/strategy-combinations";
import {
  barsAvailableAtCycleDecision, NIKKEI_CYCLE_MODEL,
  resolveStrategyCycleRecentSignals, runStrategyCycleCloseBacktest,
  shouldScreenStrategyCycleAtIndex, strategyCycleSignalsOppose,
  type StrategyCycleRecentSignal, type StrategyCycleSelectionSnapshot,
} from "../../lib/analysis/strategy-cycle-validation";
import type { AllocationSignalEvent } from "../../lib/analysis/backtest";
import type { MarketBar } from "../../lib/market/types";
import { replaceFileAtomically } from "../../scripts/atomic-file";

const root = dirname(fileURLToPath(import.meta.url));
const STUDY_MODEL = "conflict-only-next-session-three-bars-v1";
const policies = ["new", "old-on-conflict", "delay-two", "delay-three"] as const;
type Policy = typeof policies[number];
type Snapshot = StrategyCycleSelectionSnapshot & { cohort: string; job: string };
interface Input { version: number; barsHash: string; bars: MarketBar[]; snapshots: Snapshot[] }
interface Signals { two: StrategyCycleRecentSignal[]; three: StrategyCycleRecentSignal[] }
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
let interrupted = false;

export function recentSignalsFromTargets(
  target: readonly number[], events: readonly AllocationSignalEvent[][],
  index: number, lookback: 2 | 3,
): StrategyCycleRecentSignal[] {
  if (!Number.isInteger(index) || index < 0 || index >= target.length) throw new Error("Invalid signal index");
  const signals: StrategyCycleRecentSignal[] = [];
  for (let i = Math.max(1, index - lookback + 1); i <= index; i += 1) {
    const previous = target[i - 1] ?? 0;
    const next = target[i] ?? previous;
    if (Math.abs(next - previous) > 1e-10) signals.push({
      direction: next > previous ? "increase" : "reduce",
      targetAllocation: next, signals: [...(events[i] ?? [])],
    });
  }
  return signals;
}

function readSignals(bars: MarketBar[], snapshot: Snapshot, index: number): Signals {
  const timeline = buildStrategyPlanTimeline(barsAvailableAtCycleDecision(bars, index),
    snapshot.plan, undefined, snapshot.fixedRelativeLongStrategy ?? undefined);
  return {
    two: recentSignalsFromTargets(timeline.target, timeline.signalEvents, index, 2),
    three: recentSignalsFromTargets(timeline.target, timeline.signalEvents, index, 3),
  };
}

export function delayedDecision(
  inherited: number, conflict: boolean, confirmationDue: boolean,
  signals: Signals, lookback: 2 | 3,
): { allocation: number; pending: boolean } {
  // A due confirmation takes priority over opening another wait on the same day.
  if (confirmationDue) return {
    allocation: resolveStrategyCycleRecentSignals(inherited, lookback === 3 ? signals.three : signals.two).targetAllocation,
    pending: false,
  };
  if (conflict) return { allocation: inherited, pending: true };
  return { allocation: resolveStrategyCycleRecentSignals(inherited, signals.two).targetAllocation, pending: false };
}

export function eventPolicyReturn(
  bars: MarketBar[], index: number, sessions: number, inherited: number,
  target: number, delayed: boolean, cost: number,
): number {
  if (index < 2 || sessions < 1 || index + sessions >= bars.length) throw new Error("Incomplete event horizon");
  const price = bars[index]!.close;
  const seed = (bar: MarketBar): MarketBar => ({ ...bar, open: price, high: price, low: price, close: price });
  // Establish identical inherited exposure for free at the event close's price.
  // The seed day contributes no return and supports the shared three-bar minimum.
  const sample = [seed(bars[index - 2]!), seed(bars[index - 1]!), ...bars.slice(index, index + sessions + 1)];
  const targets = sample.map((_, i) => i >= (delayed ? 3 : 2) ? target : inherited);
  return runStrategyCycleCloseBacktest(sample, targets, {
    initialCash: 100_000, commissionRate: cost, slippageRate: cost,
    interval: "1d", startTime: sample[1]!.time,
  }).totalReturn;
}

interface Event {
  time: string; confirmationTime: string | null; cohort: string; window: number;
  incomingJob: string; nextJob: string | null;
  eligible: boolean; reason: string | null;
  threeBarSignals: StrategyCycleRecentSignal[];
  outcomes: Array<{ inherited: number; costBps: number; sessions: number; returns: Record<Policy, number> }>;
}
interface Continuous {
  cohort: string; window: number; first: string; last: string;
  conflicts: number; initiatedWaits: number; completedConfirmations: number; pendingAtEnd: boolean;
  eligible: boolean; missingNextDay: string[]; returns: Record<Policy, number> | null;
}
interface State {
  inputHash: string; cycleModel: string; studyModel: string; completed: string[];
  events: Event[]; continuous: Continuous[];
}

async function atomicJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`, "utf8");
  await replaceFileAtomically(temporary, path);
}

function hasMissingTriggers(bars: MarketBar[], snapshots: Snapshot[]): boolean {
  return snapshots.some((snapshot, i) => i > 0 &&
    bars.slice(snapshots[i - 1]!.decisionIndex + 1, snapshot.decisionIndex).some((_, offset) =>
      shouldScreenStrategyCycleAtIndex(bars, snapshots[i - 1]!.decisionIndex + 1 + offset)));
}

async function main() {
  const inputPath = join(root, "data/input.json");
  if ((await stat(inputPath)).size > 32 * 1024 * 1024) throw new Error("Frozen input exceeds 32 MiB");
  const inputText = await readFile(inputPath, "utf8");
  const input = JSON.parse(inputText) as Input;
  if (input.version !== 1 || sha(JSON.stringify(input.bars)) !== input.barsHash ||
    input.bars.length > 10_000 || input.snapshots.length > 4_096) throw new Error("Invalid or oversized frozen input");
  const inputHash = sha(inputText);
  const statePath = join(root, "data/delayed-state.json");
  let state: State = { inputHash, cycleModel: NIKKEI_CYCLE_MODEL, studyModel: STUDY_MODEL,
    completed: [], events: [], continuous: [] };
  try {
    state = JSON.parse(await readFile(statePath, "utf8"));
    if (state.inputHash !== inputHash || state.cycleModel !== NIKKEI_CYCLE_MODEL || state.studyModel !== STUDY_MODEL) {
      throw new Error("Delayed confirmation checkpoint is incompatible");
    }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const groups = new Map<string, Snapshot[]>();
  for (const snapshot of input.snapshots) {
    const key = `${snapshot.cohort}|${snapshot.screeningWindow}`;
    const group = groups.get(key) ?? []; group.push(snapshot); groups.set(key, group);
  }
  for (const [key, snapshots] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    if (state.completed.includes(key)) continue;
    snapshots.sort((a, b) => a.decisionIndex - b.decisionIndex);
    const byIndex = new Map(snapshots.map((snapshot) => [snapshot.decisionIndex, snapshot]));
    const actions = new Map<number, { current: Signals; previous: Signals; conflict: boolean }>();
    for (let position = 0; position < snapshots.length; position += 1) {
      const current = snapshots[position]!;
      const previous = snapshots[position - 1];
      const currentSignals = readSignals(input.bars, current, current.decisionIndex);
      const previousSignals = previous ? readSignals(input.bars, previous, current.decisionIndex) : { two: [], three: [] };
      const conflict = strategyCycleSignalsOppose(currentSignals.two, previousSignals.two);
      actions.set(current.decisionIndex, { current: currentSignals, previous: previousSignals, conflict });
      if (!conflict || !previous || hasMissingTriggers(input.bars, [previous, current])) continue;
      const next = byIndex.get(current.decisionIndex + 1);
      const nextSignals = next ? readSignals(input.bars, next, next.decisionIndex) : null;
      const event: Event = {
        time: current.decisionTime, confirmationTime: next?.decisionTime ?? null,
        cohort: current.cohort, window: current.screeningWindow, incomingJob: current.job,
        nextJob: next?.job ?? null, eligible: Boolean(next),
        reason: next ? null : "No archived winner for the exact next trading session",
        threeBarSignals: nextSignals?.three ?? [], outcomes: [],
      };
      if (nextSignals) for (const inherited of [0, 0.5, 1]) for (const cost of [0, 0.0005, 0.001]) {
        const target: Record<Policy, number> = {
          new: resolveStrategyCycleRecentSignals(inherited, currentSignals.two).targetAllocation,
          "old-on-conflict": resolveStrategyCycleRecentSignals(inherited, previousSignals.two).targetAllocation,
          "delay-two": resolveStrategyCycleRecentSignals(inherited, nextSignals.two).targetAllocation,
          "delay-three": resolveStrategyCycleRecentSignals(inherited, nextSignals.three).targetAllocation,
        };
        for (const sessions of [1, 5, 10, 20]) {
          if (current.decisionIndex + sessions >= input.bars.length) continue;
          event.outcomes.push({ inherited, costBps: cost * 10_000, sessions,
            returns: Object.fromEntries(policies.map((policy) => [policy,
              eventPolicyReturn(input.bars, current.decisionIndex, sessions, inherited, target[policy],
                policy.startsWith("delay"), cost),
            ])) as Record<Policy, number> });
        }
      }
      state.events.push(event);
    }
    const first = snapshots[0]!.decisionIndex;
    const last = snapshots.at(-1)!.decisionIndex;
    if (last - first >= 2 && !hasMissingTriggers(input.bars, snapshots)) {
      const targets = Object.fromEntries(policies.map((policy) => [policy, new Array<number>(last + 1).fill(0)])) as Record<Policy, number[]>;
      const inherited: Record<Policy, number> = { new: 0, "old-on-conflict": 0, "delay-two": 0, "delay-three": 0 };
      let pending = false;
      let initiatedWaits = 0;
      let completedConfirmations = 0;
      const missingNextDay: string[] = [];
      for (let index = first; index <= last; index += 1) {
        const action = actions.get(index);
        const due = pending;
        if (due && !action) { missingNextDay.push(input.bars[index]!.time); break; }
        if (action) {
          inherited.new = resolveStrategyCycleRecentSignals(inherited.new, action.current.two).targetAllocation;
          inherited["old-on-conflict"] = resolveStrategyCycleRecentSignals(inherited["old-on-conflict"],
            action.conflict ? action.previous.two : action.current.two).targetAllocation;
          for (const [policy, days] of [["delay-two", 2], ["delay-three", 3]] as const) {
            const decision = delayedDecision(inherited[policy], action.conflict, due, action.current, days);
            inherited[policy] = decision.allocation;
          }
          if (due) { completedConfirmations += 1; pending = false; }
          else if (action.conflict) { initiatedWaits += 1; pending = true; }
        }
        for (const policy of policies) targets[policy][index] = inherited[policy];
      }
      state.continuous.push({ cohort: snapshots[0]!.cohort, window: snapshots[0]!.screeningWindow,
        first: input.bars[first]!.time, last: input.bars[last]!.time,
        conflicts: [...actions.values()].filter((action) => action.conflict).length,
        initiatedWaits, completedConfirmations, pendingAtEnd: pending, eligible: !missingNextDay.length,
        missingNextDay, returns: missingNextDay.length ? null : Object.fromEntries(policies.map((policy) =>
          [policy, runStrategyCycleCloseBacktest(input.bars.slice(0, last + 1), targets[policy], {
            initialCash: 100_000, commissionRate: 0.0005, slippageRate: 0.0005,
            interval: "1d", startTime: input.bars[first]!.time, endTime: input.bars[last]!.time,
          }).totalReturn])) as Record<Policy, number>,
      });
    }
    state.completed.push(key);
    await atomicJson(statePath, state);
    process.stdout.write(`Replayed ${state.completed.length}/${groups.size} delayed-confirmation groups\n`);
    if (interrupted) { process.stdout.write("Interrupted safely; rerun to resume.\n"); return; }
  }
  const eligible = state.events.filter((event) => event.eligible);
  const summaries = [];
  for (const inherited of [0, 0.5, 1]) for (const costBps of [0, 5, 10]) for (const sessions of [1, 5, 10, 20]) {
    const rows = eligible.flatMap((event) => event.outcomes.filter((value) => value.inherited === inherited &&
      value.costBps === costBps && value.sessions === sessions).map((value) => ({ ...value, time: event.time })));
    const comparisons = Object.fromEntries((["new", "old-on-conflict", "delay-two"] as const).map((baseline) => {
      const differences = rows.map((row) => row.returns["delay-three"] - row.returns[baseline]).sort((a, b) => a - b);
      const dates = [...new Set(rows.map((row) => row.time))].sort();
      const byDate = dates.map((time) => {
        const values = rows.filter((row) => row.time === time);
        return values.reduce((sum, row) => sum + row.returns["delay-three"] - row.returns[baseline], 0) / values.length;
      });
      const average = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
      return [baseline, {
        wins: differences.filter((value) => value > 1e-10).length,
        losses: differences.filter((value) => value < -1e-10).length,
        ties: differences.filter((value) => Math.abs(value) <= 1e-10).length,
        meanDifference: average(differences), dateWeightedMeanDifference: average(byDate),
        medianDifference: differences.length ? (differences[Math.floor((differences.length - 1) / 2)]! +
          differences[Math.floor(differences.length / 2)]!) / 2 : null,
        earlierHalfDifference: average(byDate.slice(0, Math.floor(byDate.length / 2))),
        laterHalfDifference: average(byDate.slice(Math.floor(byDate.length / 2))),
      }];
    }));
    summaries.push({ inherited, commissionBps: costBps, slippageBps: costBps, sessions,
      samples: rows.length, uniqueDates: new Set(rows.map((row) => row.time)).size, comparisons });
  }
  const summary = { generatedAt: new Date().toISOString(), inputHash,
    cycleModel: NIKKEI_CYCLE_MODEL, studyModel: STUDY_MODEL,
    rule: "Only conflicts trigger a one-session hold, then the exact next-session winner's final three bars; ordinary decisions use two bars",
    sequenceRule: "Any reduce followed later by increase holds; otherwise use the latest target with directional clamps",
    totalConflicts: state.events.length, eligibleConflicts: eligible.length,
    excludedConflicts: state.events.length - eligible.length,
    summaries, continuous: state.continuous };
  await atomicJson(join(root, "output/delayed-events.json"), state.events);
  await atomicJson(join(root, "output/delayed-summary.json"), summary);
  process.stdout.write(`${JSON.stringify({ total: summary.totalConflicts, eligible: summary.eligibleConflicts,
    excluded: summary.excludedConflicts, base: summaries.filter((value) => value.inherited === 0.5 && value.commissionBps === 5),
    continuous: state.continuous.length }, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.on("SIGINT", () => { interrupted = true; });
  await main();
}
