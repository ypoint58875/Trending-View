import {
  runAllocationBacktest,
  type AllocationBacktestResult,
  type AllocationIntrabarExecution,
  type AllocationSignalEvent,
  type BacktestSettings,
} from "./backtest";
import {
  buildStrategyPlanTimeline,
  type StrategyAllocationPlan,
  type StrategySlot,
} from "./strategy-combinations";
import type { MarketBar, MarketInterval } from "@/lib/market/types";

export const DEFAULT_CYCLE_SCREENING_WINDOWS = [64, 128, 256] as const;
export const DEFAULT_CYCLE_UPDATE_INTERVALS = [5, 10, 20, 40, 60] as const;
export const DEFAULT_CYCLE_EVALUATION_SESSIONS = 504;
export const DEFAULT_CYCLE_FORWARD_HORIZONS = [5, 10, 20, 40, 60] as const;
export const MAX_CYCLE_OPTIMIZATION_UNITS = 512;
export const MAX_CYCLE_VALUE_COUNT = 8;

export interface StrategyCycleSelectionSnapshot {
  decisionIndex: number;
  decisionTime: string;
  screeningWindow: number;
  plan: StrategyAllocationPlan;
  fixedRelativeLongStrategy: StrategySlot | null;
  label: string;
}

export interface StrategyCycleMatrixResult {
  screeningWindow: number;
  updateInterval: number;
  performance: AllocationBacktestResult;
}

export interface StrategyCycleSchedule {
  evaluationStartIndex: number;
  evaluationEndIndex: number;
  decisionIndexes: number[];
  optimizationUnits: number;
}

export interface StrategyCycleEffectivenessPoint {
  sessions: number;
  sampleCount: number;
  medianReturn: number;
  positiveRate: number;
  medianExcessReturn: number;
}

export function barsAvailableAtCycleDecision(
  bars: readonly MarketBar[],
  decisionIndex: number,
): MarketBar[] {
  if (!Number.isInteger(decisionIndex) || decisionIndex < 0 || decisionIndex >= bars.length) {
    throw new RangeError("Cycle decision index is outside the market series");
  }
  return bars.slice(0, decisionIndex + 1);
}

export function normalizeCycleValues(
  values: readonly number[],
  minimum: number,
  maximum: number,
): number[] {
  return [...new Set(values.map((value) => Math.round(value)))]
    .filter((value) => Number.isFinite(value) && value >= minimum && value <= maximum)
    .sort((left, right) => left - right)
    .slice(0, MAX_CYCLE_VALUE_COUNT);
}

export function buildStrategyCycleSchedule(
  barsLength: number,
  screeningWindows: readonly number[],
  updateIntervals: readonly number[],
  evaluationSessions: number,
): StrategyCycleSchedule | null {
  const windows = normalizeCycleValues(screeningWindows, 20, 2_000);
  const intervals = normalizeCycleValues(updateIntervals, 1, 252);
  if (windows.length === 0 || intervals.length === 0 || barsLength < 3) return null;
  const evaluationEndIndex = barsLength - 1;
  const requestedStart = Math.max(1, barsLength - Math.max(20, Math.round(evaluationSessions)));
  const evaluationStartIndex = Math.max(requestedStart, Math.max(...windows));
  if (evaluationStartIndex >= evaluationEndIndex) return null;
  const firstDecisionIndex = evaluationStartIndex - 1;
  const decisionIndexSet = new Set<number>();
  for (const interval of intervals) {
    for (
      let index = firstDecisionIndex;
      index < evaluationEndIndex;
      index += interval
    ) {
      decisionIndexSet.add(index);
    }
  }
  const decisionIndexes = [...decisionIndexSet].sort((left, right) => left - right);
  return {
    evaluationStartIndex,
    evaluationEndIndex,
    decisionIndexes,
    optimizationUnits: decisionIndexes.length * windows.length,
  };
}

function snapshotsForConfiguration(
  snapshots: readonly StrategyCycleSelectionSnapshot[],
  screeningWindow: number,
  updateInterval: number,
  firstDecisionIndex: number,
): StrategyCycleSelectionSnapshot[] {
  return snapshots
    .filter(
      (snapshot) =>
        snapshot.screeningWindow === screeningWindow &&
        snapshot.decisionIndex >= firstDecisionIndex &&
        (snapshot.decisionIndex - firstDecisionIndex) % updateInterval === 0,
    )
    .sort((left, right) => left.decisionIndex - right.decisionIndex);
}

export function runStrategyCycleConfiguration(
  bars: MarketBar[],
  snapshots: readonly StrategyCycleSelectionSnapshot[],
  screeningWindow: number,
  updateInterval: number,
  evaluationStartIndex: number,
  evaluationEndIndex: number,
  settings: Pick<
    BacktestSettings,
    "initialCash" | "commissionRate" | "slippageRate" | "executionPolicy"
  > & { interval: MarketInterval },
): AllocationBacktestResult {
  const firstDecisionIndex = evaluationStartIndex - 1;
  const selected = snapshotsForConfiguration(
    snapshots,
    screeningWindow,
    updateInterval,
    firstDecisionIndex,
  );
  if (selected.length === 0) {
    throw new Error("Cycle validation has no selection snapshot");
  }
  const target = new Array<number>(bars.length).fill(0);
  const signalEvents = Array.from<unknown, AllocationSignalEvent[]>(
    { length: bars.length },
    () => [],
  );
  const intrabarExecutions = Array.from<unknown, AllocationIntrabarExecution[]>(
    { length: bars.length },
    () => [],
  );

  selected.forEach((snapshot, snapshotIndex) => {
    const nextDecisionIndex = selected[snapshotIndex + 1]?.decisionIndex;
    const segmentEnd = Math.min(
      nextDecisionIndex === undefined ? evaluationEndIndex : nextDecisionIndex - 1,
      evaluationEndIndex,
    );
    const timeline = buildStrategyPlanTimeline(
      bars,
      snapshot.plan,
      undefined,
      snapshot.fixedRelativeLongStrategy ?? undefined,
    );
    for (
      let index = snapshot.decisionIndex;
      index <= segmentEnd && index < bars.length;
      index += 1
    ) {
      target[index] = timeline.target[index] ?? 0;
      signalEvents[index] = [...(timeline.signalEvents[index] ?? [])];
      if (index > snapshot.decisionIndex) {
        intrabarExecutions[index] = [
          ...(timeline.intrabarExecutions?.[index] ?? []),
        ];
      }
    }
  });

  return runAllocationBacktest(bars, target, {
    ...settings,
    startTime: bars[firstDecisionIndex]!.time,
    endTime: bars[evaluationEndIndex]!.time,
  }, signalEvents, intrabarExecutions);
}

export function buildStrategyCycleMatrix(
  bars: MarketBar[],
  snapshots: readonly StrategyCycleSelectionSnapshot[],
  screeningWindows: readonly number[],
  updateIntervals: readonly number[],
  evaluationStartIndex: number,
  evaluationEndIndex: number,
  settings: Pick<
    BacktestSettings,
    "initialCash" | "commissionRate" | "slippageRate" | "executionPolicy"
  > & { interval: MarketInterval },
): StrategyCycleMatrixResult[] {
  return normalizeCycleValues(screeningWindows, 20, 2_000).flatMap(
    (screeningWindow) =>
      normalizeCycleValues(updateIntervals, 1, 252).map((updateInterval) => ({
        screeningWindow,
        updateInterval,
        performance: runStrategyCycleConfiguration(
          bars,
          snapshots,
          screeningWindow,
          updateInterval,
          evaluationStartIndex,
          evaluationEndIndex,
          settings,
        ),
      })),
  );
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

export function evaluateStrategyCycleEffectiveness(
  bars: MarketBar[],
  snapshots: readonly StrategyCycleSelectionSnapshot[],
  horizons: readonly number[],
  settings: Pick<
    BacktestSettings,
    "initialCash" | "commissionRate" | "slippageRate" | "executionPolicy"
  > & { interval: MarketInterval },
): StrategyCycleEffectivenessPoint[] {
  return normalizeCycleValues(horizons, 2, 252).map((sessions) => {
    const observations = snapshots.flatMap((snapshot) => {
      const endIndex = snapshot.decisionIndex + sessions;
      if (endIndex >= bars.length) return [];
      const timeline = buildStrategyPlanTimeline(
        bars,
        snapshot.plan,
        undefined,
        snapshot.fixedRelativeLongStrategy ?? undefined,
      );
      const performance = runAllocationBacktest(
        bars,
        timeline.target,
        {
          ...settings,
          startTime: bars[snapshot.decisionIndex]!.time,
          endTime: bars[endIndex]!.time,
        },
        timeline.signalEvents,
        timeline.intrabarExecutions?.map((executions, index) =>
          index === snapshot.decisionIndex ? [] : executions,
        ),
      );
      return [{
        totalReturn: performance.totalReturn,
        excessReturn: performance.totalReturn - performance.benchmarkReturn,
      }];
    });
    return {
      sessions,
      sampleCount: observations.length,
      medianReturn: observations.length
        ? median(observations.map((observation) => observation.totalReturn))
        : 0,
      positiveRate: observations.length
        ? observations.filter((observation) => observation.totalReturn > 0).length /
          observations.length
        : 0,
      medianExcessReturn: observations.length
        ? median(observations.map((observation) => observation.excessReturn))
        : 0,
    };
  });
}
