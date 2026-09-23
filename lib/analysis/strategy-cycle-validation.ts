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
export const CYCLE_REFERENCE_INTERVAL = 5;
export const CYCLE_EVENT_MATCH_TOLERANCE = 10;
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

export interface StrategyCycleEventMetrics {
  referenceEventCount: number;
  predictedEventCount: number;
  matchedEventCount: number;
  oppositeDirectionEventCount: number;
  missedEventCount: number;
  extraEventCount: number;
  directionAgreementRate: number | null;
  lateEventRate: number | null;
  medianSignedTimingError: number | null;
  medianAbsoluteTimingError: number | null;
  p90AbsoluteTimingError: number | null;
  withinTwoSessionsRate: number | null;
  withinFiveSessionsRate: number | null;
  meanTargetAllocationError: number | null;
  medianTimingReturnDifferenceBps: number | null;
}

export interface StrategyCycleEventValidationResult {
  screeningWindow: number;
  updateInterval: number;
  metrics: StrategyCycleEventMetrics;
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
  for (const interval of [...new Set([...intervals, CYCLE_REFERENCE_INTERVAL])]) {
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

function buildStrategyCycleTimeline(
  bars: MarketBar[],
  selected: readonly StrategyCycleSelectionSnapshot[],
  evaluationEndIndex: number,
): {
  target: number[];
  signalEvents: AllocationSignalEvent[][];
  intrabarExecutions: AllocationIntrabarExecution[][];
} {
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
  return { target, signalEvents, intrabarExecutions };
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
  const { target, signalEvents, intrabarExecutions } = buildStrategyCycleTimeline(
    bars,
    selected,
    evaluationEndIndex,
  );

  return runAllocationBacktest(bars, target, {
    ...settings,
    startTime: bars[firstDecisionIndex]!.time,
    endTime: bars[evaluationEndIndex]!.time,
  }, signalEvents, intrabarExecutions);
}

export function runStrategyCycleNextVintageReference(
  bars: MarketBar[],
  snapshots: readonly StrategyCycleSelectionSnapshot[],
  screeningWindow: number,
  evaluationStartIndex: number,
  evaluationEndIndex: number,
  settings: Pick<
    BacktestSettings,
    "initialCash" | "commissionRate" | "slippageRate" | "executionPolicy"
  > & { interval: MarketInterval },
): AllocationBacktestResult {
  const firstDecisionIndex = evaluationStartIndex - 1;
  const denseSnapshots = snapshotsForConfiguration(
    snapshots,
    screeningWindow,
    CYCLE_REFERENCE_INTERVAL,
    firstDecisionIndex,
  );
  if (denseSnapshots.length < 2) {
    throw new Error("Cycle validation needs a following selection vintage");
  }
  const retrospectiveSnapshots = denseSnapshots.slice(0, -1).map(
    (snapshot, index) => ({
      ...denseSnapshots[index + 1]!,
      decisionIndex: snapshot.decisionIndex,
      decisionTime: snapshot.decisionTime,
    }),
  );
  const referenceEndIndex = Math.min(
    denseSnapshots.at(-1)!.decisionIndex,
    evaluationEndIndex,
  );
  const { target, signalEvents, intrabarExecutions } = buildStrategyCycleTimeline(
    bars,
    retrospectiveSnapshots,
    referenceEndIndex,
  );
  return runAllocationBacktest(bars, target, {
    ...settings,
    startTime: bars[firstDecisionIndex]!.time,
    endTime: bars[referenceEndIndex]!.time,
  }, signalEvents, intrabarExecutions);
}

function percentile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]!;
}

function medianOrNull(values: number[]): number | null {
  return values.length ? median(values) : null;
}

export function compareStrategyCycleRebalanceEvents(
  bars: readonly MarketBar[],
  candidate: AllocationBacktestResult,
  reference: AllocationBacktestResult,
  toleranceSessions = CYCLE_EVENT_MATCH_TOLERANCE,
  eventStartTime?: string,
): StrategyCycleEventMetrics {
  const barIndexByTime = new Map(bars.map((bar, index) => [bar.time, index]));
  const eventStartIndex = eventStartTime === undefined
    ? 0
    : (barIndexByTime.get(eventStartTime) ?? 0);
  const isScoredEvent = (event: AllocationBacktestResult["rebalances"][number]) =>
    event.reason === "strategy" &&
    (barIndexByTime.get(event.time) ?? -1) >= eventStartIndex;
  const candidateEvents = candidate.rebalances.filter(isScoredEvent);
  const referenceEvents = reference.rebalances.filter(isScoredEvent);
  const pairedTimingReturnDifferenceBps = (
    anchorEvent: AllocationBacktestResult["rebalances"][number] | undefined,
    candidateEvent: AllocationBacktestResult["rebalances"][number],
    referenceEvent: AllocationBacktestResult["rebalances"][number],
  ): number | null => {
    if (!anchorEvent || anchorEvent.fillPrice <= 0) return null;
    const anchorIndex = barIndexByTime.get(anchorEvent.time);
    const candidateIndex = barIndexByTime.get(candidateEvent.time);
    const referenceIndex = barIndexByTime.get(referenceEvent.time);
    if (
      anchorIndex === undefined ||
      candidateIndex === undefined ||
      referenceIndex === undefined ||
      anchorIndex >= candidateIndex ||
      anchorIndex >= referenceIndex
    ) {
      return null;
    }
    const endPrice = bars[Math.max(candidateIndex, referenceIndex)]?.close;
    if (!endPrice || candidateEvent.fillPrice <= 0 || referenceEvent.fillPrice <= 0) {
      return null;
    }
    const startAllocation = Math.max(0, Math.min(1, anchorEvent.targetAllocation));
    const targetAllocation = Math.max(0, Math.min(1, referenceEvent.targetAllocation));
    const pathReturn = (eventPrice: number) => {
      const equityAtEvent = 1 +
        startAllocation * (eventPrice / anchorEvent.fillPrice - 1);
      return equityAtEvent *
        (1 + targetAllocation * (endPrice / eventPrice - 1)) -
        1;
    };
    return (
      pathReturn(candidateEvent.fillPrice) -
      pathReturn(referenceEvent.fillPrice)
    ) * 10_000;
  };
  const unusedCandidateIndexes = new Set(candidateEvents.map((_, index) => index));
  const matches: Array<{
    timingError: number;
    directionMatches: boolean;
    allocationError: number;
    timingReturnDifferenceBps: number | null;
  }> = [];
  let minimumCandidateIndex = 0;

  for (
    let referenceEventPosition = 0;
    referenceEventPosition < referenceEvents.length;
    referenceEventPosition += 1
  ) {
    const referenceEvent = referenceEvents[referenceEventPosition]!;
    const referenceIndex = barIndexByTime.get(referenceEvent.time);
    if (referenceIndex === undefined) continue;
    const nearest = [...unusedCandidateIndexes]
      .filter((candidateIndex) => candidateIndex >= minimumCandidateIndex)
      .map((candidateIndex) => {
        const event = candidateEvents[candidateIndex]!;
        const barIndex = barIndexByTime.get(event.time);
        return barIndex === undefined
          ? null
          : { candidateIndex, event, timingError: barIndex - referenceIndex };
      })
      .filter((value): value is NonNullable<typeof value> =>
        value !== null && Math.abs(value.timingError) <= toleranceSessions)
      .sort((left, right) =>
        Math.abs(left.timingError) - Math.abs(right.timingError))[0];
    if (!nearest) continue;
    unusedCandidateIndexes.delete(nearest.candidateIndex);
    minimumCandidateIndex = nearest.candidateIndex + 1;
    const referenceChange =
      referenceEvent.targetAllocation - referenceEvent.fromAllocation;
    const candidateChange =
      nearest.event.targetAllocation - nearest.event.fromAllocation;
    const directionMatches = Math.sign(referenceChange) === Math.sign(candidateChange);
    matches.push({
      timingError: nearest.timingError,
      directionMatches,
      allocationError: Math.abs(
        nearest.event.targetAllocation - referenceEvent.targetAllocation,
      ),
      timingReturnDifferenceBps: directionMatches
        ? pairedTimingReturnDifferenceBps(
            referenceEvents[referenceEventPosition - 1],
            nearest.event,
            referenceEvent,
          )
        : null,
    });
  }

  const directionMatches = matches.filter((match) => match.directionMatches);
  const timingErrors = directionMatches.map((match) => match.timingError);
  const absoluteTimingErrors = timingErrors.map(Math.abs);
  const timingReturnDifferences = directionMatches.flatMap((match) =>
    match.timingReturnDifferenceBps === null
      ? []
      : [match.timingReturnDifferenceBps]);
  return {
    referenceEventCount: referenceEvents.length,
    predictedEventCount: candidateEvents.length,
    matchedEventCount: directionMatches.length,
    oppositeDirectionEventCount: matches.length - directionMatches.length,
    missedEventCount: referenceEvents.length - matches.length,
    extraEventCount: unusedCandidateIndexes.size,
    directionAgreementRate: matches.length
      ? directionMatches.length / matches.length
      : null,
    lateEventRate: directionMatches.length
      ? directionMatches.filter((match) => match.timingError > 0).length /
        directionMatches.length
      : null,
    medianSignedTimingError: medianOrNull(timingErrors),
    medianAbsoluteTimingError: medianOrNull(absoluteTimingErrors),
    p90AbsoluteTimingError: percentile(absoluteTimingErrors, 0.9),
    withinTwoSessionsRate: referenceEvents.length
      ? absoluteTimingErrors.filter((value) => value <= 2).length /
        referenceEvents.length
      : null,
    withinFiveSessionsRate: referenceEvents.length
      ? absoluteTimingErrors.filter((value) => value <= 5).length /
        referenceEvents.length
      : null,
    meanTargetAllocationError: directionMatches.length
      ? directionMatches.reduce((sum, match) => sum + match.allocationError, 0) /
        directionMatches.length
      : null,
    medianTimingReturnDifferenceBps: medianOrNull(timingReturnDifferences),
  };
}

export function buildStrategyCycleEventValidation(
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
): StrategyCycleEventValidationResult[] {
  return normalizeCycleValues(screeningWindows, 20, 2_000).flatMap(
    (screeningWindow) => {
      const reference = runStrategyCycleNextVintageReference(
        bars,
        snapshots,
        screeningWindow,
        evaluationStartIndex,
        evaluationEndIndex,
        settings,
      );
      const referenceEndTime = reference.equity.at(-1)?.time;
      const comparisonEndIndex = referenceEndTime
        ? bars.findIndex((bar) => bar.time === referenceEndTime)
        : evaluationEndIndex;
      return normalizeCycleValues(updateIntervals, 1, 252).map((updateInterval) => {
        const performance = runStrategyCycleConfiguration(
          bars,
          snapshots,
          screeningWindow,
          updateInterval,
          evaluationStartIndex,
          comparisonEndIndex >= evaluationStartIndex
            ? comparisonEndIndex
            : evaluationEndIndex,
          settings,
        );
        return {
          screeningWindow,
          updateInterval,
          metrics: compareStrategyCycleRebalanceEvents(
            bars,
            performance,
            reference,
            CYCLE_EVENT_MATCH_TOLERANCE,
            bars[Math.min(evaluationStartIndex + 1, comparisonEndIndex)]?.time,
          ),
        };
      });
    },
  );
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
