import {
  runAllocationBacktest,
  type AllocationBacktestResult,
  type AllocationIntrabarExecution,
  type AllocationRebalance,
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
export const CYCLE_DAILY_SCREENING_WINDOW = 128;
export const CYCLE_DAILY_UPDATE_INTERVAL = 1;
export const CYCLE_TRANSITION_HORIZONS = [5, 10, 15, 20] as const;
export const CYCLE_TRANSITION_ANALYSIS_BASE_SESSIONS = 148;
export const MIN_CYCLE_DAILY_EVALUATION_SESSIONS =
  CYCLE_DAILY_SCREENING_WINDOW + Math.max(...CYCLE_TRANSITION_HORIZONS);
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
  events: StrategyCycleEventDetail[];
  evaluationStartTime: string;
  evaluationEndTime: string;
}

export type StrategyCycleEventStatus = "matched" | "opposite" | "missed" | "extra";

export interface StrategyCycleEventDetail {
  status: StrategyCycleEventStatus;
  reference: AllocationRebalance | null;
  candidate: AllocationRebalance | null;
  timingErrorSessions: number | null;
}

export interface StrategyCycleEventComparison {
  metrics: StrategyCycleEventMetrics;
  events: StrategyCycleEventDetail[];
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

export interface StrategyCycleStabilityRun {
  strategyKey: string;
  label: string;
  startTime: string;
  endTime: string;
  sessions: number;
  complete: boolean;
}

export interface StrategyCycleStabilitySummary {
  strategyKey: string;
  label: string;
  episodeCount: number;
  completedEpisodeCount: number;
  averageSessions: number;
  medianSessions: number;
  maximumSessions: number;
  survivalRates: Array<{ sessions: number; rate: number }>;
}

export interface StrategyCycleTransitionHorizonResult {
  sessions: number;
  oldReturn: number | null;
  newReturn: number | null;
  returnDifference: number | null;
}

export interface StrategyCycleTransitionResult {
  decisionTime: string;
  oldStrategyKey: string;
  oldLabel: string;
  newStrategyKey: string;
  newLabel: string;
  oldDurationSessions: number;
  requestedPerformanceSessions: number;
  performanceStartTime: string;
  performanceEndTime: string;
  performance: StrategyCycleTransitionPerformancePoint[];
  oldRebalances: StrategyCycleTransitionRebalance[];
  newRebalances: StrategyCycleTransitionRebalance[];
  screeningOldReturn: number;
  screeningNewReturn: number;
  screeningReturnDifference: number;
  horizons: StrategyCycleTransitionHorizonResult[];
}

export interface StrategyCycleTransitionPerformancePoint {
  time: string;
  oldReturn: number;
  newReturn: number;
  returnDifference: number;
}

export interface StrategyCycleTransitionRebalance {
  time: string;
  fromAllocation: number;
  targetAllocation: number;
  returnValue: number;
}

export interface StrategyCycleTransitionSummary {
  sessions: number;
  sampleCount: number;
  oldPositiveRate: number | null;
  newPositiveRate: number | null;
  newWinRate: number | null;
  medianOldReturn: number | null;
  medianNewReturn: number | null;
  medianReturnDifference: number | null;
  meanReturnDifference: number | null;
  minimumReturnDifference: number | null;
  maximumReturnDifference: number | null;
  newBetterCount: number;
  oldBetterCount: number;
  equalCount: number;
  screeningNewLedCount: number;
  screeningNewLedMedianDifference: number | null;
  screeningNewLedMeanDifference: number | null;
  screeningOldLedCount: number;
  screeningOldLedMedianDifference: number | null;
  screeningOldLedMeanDifference: number | null;
}

export type StrategyCycleAdjustmentRecommendation =
  | "switch-after"
  | "keep-old"
  | "avoid-both"
  | "observe-longer"
  | "insufficient-evidence";

export interface StrategyCycleDailyValidationReport {
  screeningWindow: typeof CYCLE_DAILY_SCREENING_WINDOW;
  stabilityRuns: StrategyCycleStabilityRun[];
  stabilitySummaries: StrategyCycleStabilitySummary[];
  transitions: StrategyCycleTransitionResult[];
  transitionSummaries: StrategyCycleTransitionSummary[];
  recommendation: StrategyCycleAdjustmentRecommendation;
  recommendedDelaySessions: number | null;
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

export function buildStrategyCycleDailySchedule(
  barsLength: number,
  evaluationSessions: number,
): StrategyCycleSchedule | null {
  const resolvedEvaluationSessions = Math.min(
    barsLength,
    Math.round(evaluationSessions),
  );
  if (
    !Number.isFinite(evaluationSessions) ||
    evaluationSessions < MIN_CYCLE_DAILY_EVALUATION_SESSIONS ||
    barsLength < MIN_CYCLE_DAILY_EVALUATION_SESSIONS
  ) {
    return null;
  }
  const optimizationUnits =
    resolvedEvaluationSessions - MIN_CYCLE_DAILY_EVALUATION_SESSIONS;
  const evaluationStartIndex =
    barsLength - resolvedEvaluationSessions + CYCLE_DAILY_SCREENING_WINDOW;
  const evaluationEndIndex = barsLength - 1;
  return {
    evaluationStartIndex,
    evaluationEndIndex,
    decisionIndexes: Array.from(
      { length: optimizationUnits },
      (_, offset) => evaluationStartIndex + offset,
    ),
    optimizationUnits,
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

export function compareStrategyCycleRebalanceEventsDetailed(
  bars: readonly MarketBar[],
  candidate: AllocationBacktestResult,
  reference: AllocationBacktestResult,
  toleranceSessions = CYCLE_EVENT_MATCH_TOLERANCE,
  eventStartTime?: string,
): StrategyCycleEventComparison {
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
    referenceEventPosition: number;
    candidateIndex: number;
    candidateEvent: AllocationRebalance;
    referenceEvent: AllocationRebalance;
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
      referenceEventPosition,
      candidateIndex: nearest.candidateIndex,
      candidateEvent: nearest.event,
      referenceEvent,
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
  const metrics = {
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
  const matchedReferencePositions = new Set(
    matches.map((match) => match.referenceEventPosition),
  );
  const events: StrategyCycleEventDetail[] = [
    ...matches.map((match) => ({
      status: match.directionMatches ? "matched" as const : "opposite" as const,
      reference: match.referenceEvent,
      candidate: match.candidateEvent,
      timingErrorSessions: match.timingError,
    })),
    ...referenceEvents.flatMap((event, index) =>
      matchedReferencePositions.has(index)
        ? []
        : [{
            status: "missed" as const,
            reference: event,
            candidate: null,
            timingErrorSessions: null,
          }]),
    ...[...unusedCandidateIndexes].map((index) => ({
      status: "extra" as const,
      reference: null,
      candidate: candidateEvents[index]!,
      timingErrorSessions: null,
    })),
  ].sort((left, right) => {
    const leftTime = left.reference?.time ?? left.candidate?.time ?? "";
    const rightTime = right.reference?.time ?? right.candidate?.time ?? "";
    return leftTime.localeCompare(rightTime);
  });
  return { metrics, events };
}

export function compareStrategyCycleRebalanceEvents(
  bars: readonly MarketBar[],
  candidate: AllocationBacktestResult,
  reference: AllocationBacktestResult,
  toleranceSessions = CYCLE_EVENT_MATCH_TOLERANCE,
  eventStartTime?: string,
): StrategyCycleEventMetrics {
  return compareStrategyCycleRebalanceEventsDetailed(
    bars,
    candidate,
    reference,
    toleranceSessions,
    eventStartTime,
  ).metrics;
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
      const resolvedComparisonEndIndex = comparisonEndIndex >= evaluationStartIndex
        ? comparisonEndIndex
        : evaluationEndIndex;
      return normalizeCycleValues(updateIntervals, 1, 252).map((updateInterval) => {
        const performance = runStrategyCycleConfiguration(
          bars,
          snapshots,
          screeningWindow,
          updateInterval,
          evaluationStartIndex,
          resolvedComparisonEndIndex,
          settings,
        );
        const comparison = compareStrategyCycleRebalanceEventsDetailed(
          bars,
          performance,
          reference,
          CYCLE_EVENT_MATCH_TOLERANCE,
          bars[Math.min(evaluationStartIndex + 1, resolvedComparisonEndIndex)]?.time,
        );
        return {
          screeningWindow,
          updateInterval,
          metrics: comparison.metrics,
          events: comparison.events,
          evaluationStartTime: bars[evaluationStartIndex]?.time ?? "",
          evaluationEndTime: bars[resolvedComparisonEndIndex]?.time ?? "",
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

function stableCycleValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableCycleValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableCycleValue(entry)]),
    );
  }
  return value;
}

export function strategyCyclePlanKey(
  snapshot: Pick<StrategyCycleSelectionSnapshot, "plan" | "fixedRelativeLongStrategy">,
): string {
  return JSON.stringify(stableCycleValue({
    plan: snapshot.plan,
    fixedRelativeLongStrategy: snapshot.fixedRelativeLongStrategy,
  }));
}

function buildStrategyCycleStabilityRuns(
  snapshots: readonly StrategyCycleSelectionSnapshot[],
): StrategyCycleStabilityRun[] {
  const ordered = [...snapshots].sort(
    (left, right) => left.decisionIndex - right.decisionIndex,
  );
  const runs: StrategyCycleStabilityRun[] = [];
  for (let index = 0; index < ordered.length; index += 1) {
    const snapshot = ordered[index]!;
    const strategyKey = strategyCyclePlanKey(snapshot);
    const previousSnapshot = ordered[index - 1];
    const current = runs.at(-1);
    if (
      current &&
      current.strategyKey === strategyKey &&
      previousSnapshot?.decisionIndex === snapshot.decisionIndex - 1
    ) {
      current.endTime = snapshot.decisionTime;
      current.sessions += 1;
      continue;
    }
    if (current) current.complete = true;
    runs.push({
      strategyKey,
      label: snapshot.label,
      startTime: snapshot.decisionTime,
      endTime: snapshot.decisionTime,
      sessions: 1,
      complete: false,
    });
  }
  return runs;
}

function buildStrategyCycleStabilitySummaries(
  runs: readonly StrategyCycleStabilityRun[],
): StrategyCycleStabilitySummary[] {
  const grouped = new Map<string, StrategyCycleStabilityRun[]>();
  for (const run of runs) {
    const values = grouped.get(run.strategyKey) ?? [];
    values.push(run);
    grouped.set(run.strategyKey, values);
  }
  return [...grouped.entries()]
    .map(([strategyKey, strategyRuns]) => {
      const completed = strategyRuns.filter((run) => run.complete);
      const measured = completed.length ? completed : strategyRuns;
      const durations = measured.map((run) => run.sessions);
      return {
        strategyKey,
        label: strategyRuns[0]!.label,
        episodeCount: strategyRuns.length,
        completedEpisodeCount: completed.length,
        averageSessions:
          durations.reduce((sum, duration) => sum + duration, 0) / durations.length,
        medianSessions: median(durations),
        maximumSessions: Math.max(...strategyRuns.map((run) => run.sessions)),
        survivalRates: CYCLE_TRANSITION_HORIZONS.map((sessions) => ({
          sessions,
          rate: durations.filter((duration) => duration >= sessions).length / durations.length,
        })),
      };
    })
    .sort((left, right) =>
      right.medianSessions - left.medianSessions ||
      right.episodeCount - left.episodeCount ||
      left.label.localeCompare(right.label));
}

function prepareFrozenPlanTimeline(
  bars: MarketBar[],
  snapshot: StrategyCycleSelectionSnapshot,
  decisionIndex: number,
  preparedTimeline?: ReturnType<typeof buildStrategyPlanTimeline>,
): ReturnType<typeof buildStrategyPlanTimeline> {
  const timeline = preparedTimeline ?? buildStrategyPlanTimeline(
      bars,
      snapshot.plan,
      undefined,
      snapshot.fixedRelativeLongStrategy ?? undefined,
    );
  const target = [...timeline.target];
  target[decisionIndex - 1] = 0;
  const intrabarExecutions = timeline.intrabarExecutions
    ? [...timeline.intrabarExecutions]
    : undefined;
  if (intrabarExecutions) intrabarExecutions[decisionIndex] = [];
  return { ...timeline, target, intrabarExecutions };
}

function frozenPlanForwardReturn(
  bars: MarketBar[],
  timeline: ReturnType<typeof buildStrategyPlanTimeline>,
  decisionIndex: number,
  horizonSessions: number,
  settings: Pick<
    BacktestSettings,
    "initialCash" | "commissionRate" | "slippageRate" | "executionPolicy"
  > & { interval: MarketInterval },
): number | null {
  const endIndex = decisionIndex + horizonSessions;
  if (decisionIndex < 1 || endIndex >= bars.length) return null;
  return runAllocationBacktest(
    bars,
    timeline.target,
    {
      ...settings,
      startTime: bars[decisionIndex]!.time,
      endTime: bars[endIndex]!.time,
    },
    timeline.signalEvents,
    timeline.intrabarExecutions,
  ).totalReturn;
}

function historicalPlanPerformance(
  bars: MarketBar[],
  snapshot: StrategyCycleSelectionSnapshot,
  startIndex: number,
  endIndex: number,
  settings: Pick<
    BacktestSettings,
    "initialCash" | "commissionRate" | "slippageRate" | "executionPolicy"
  > & { interval: MarketInterval },
  preparedTimeline?: ReturnType<typeof buildStrategyPlanTimeline>,
): {
  returns: Map<string, number>;
  rebalances: AllocationRebalance[];
  totalReturn: number;
} {
  const timeline = preparedTimeline ?? buildStrategyPlanTimeline(
      bars,
      snapshot.plan,
      undefined,
      snapshot.fixedRelativeLongStrategy ?? undefined,
    );
  const result = runAllocationBacktest(
    bars,
    timeline.target,
    {
      ...settings,
      startTime: bars[startIndex]!.time,
      endTime: bars[endIndex]!.time,
    },
    timeline.signalEvents,
    timeline.intrabarExecutions,
  );
  return {
    returns: new Map(result.equity.map((point) => [
      point.time,
      (point.equity / settings.initialCash - 1) * 100,
    ])),
    rebalances: result.rebalances,
    totalReturn: result.totalReturn,
  };
}

function buildStrategyCycleTransitions(
  bars: MarketBar[],
  snapshots: readonly StrategyCycleSelectionSnapshot[],
  settings: Pick<
    BacktestSettings,
    "initialCash" | "commissionRate" | "slippageRate" | "executionPolicy"
  > & { interval: MarketInterval },
): StrategyCycleTransitionResult[] {
  const ordered = [...snapshots].sort(
    (left, right) => left.decisionIndex - right.decisionIndex,
  );
  const timelineByStrategyKey = new Map<
    string,
    ReturnType<typeof buildStrategyPlanTimeline>
  >();
  const timelineFor = (snapshot: StrategyCycleSelectionSnapshot) => {
    const key = strategyCyclePlanKey(snapshot);
    const cached = timelineByStrategyKey.get(key);
    if (cached) return cached;
    const timeline = buildStrategyPlanTimeline(
      bars,
      snapshot.plan,
      undefined,
      snapshot.fixedRelativeLongStrategy ?? undefined,
    );
    timelineByStrategyKey.set(key, timeline);
    return timeline;
  };
  return ordered.slice(1).flatMap((newSnapshot, index) => {
    const oldSnapshot = ordered[index]!;
    const oldStrategyKey = strategyCyclePlanKey(oldSnapshot);
    const newStrategyKey = strategyCyclePlanKey(newSnapshot);
    if (
      oldStrategyKey === newStrategyKey ||
      newSnapshot.decisionIndex !== oldSnapshot.decisionIndex + 1
    ) {
      return [];
    }
    const oldTimeline = prepareFrozenPlanTimeline(
      bars,
      oldSnapshot,
      newSnapshot.decisionIndex,
      timelineFor(oldSnapshot),
    );
    const newTimeline = prepareFrozenPlanTimeline(
      bars,
      newSnapshot,
      newSnapshot.decisionIndex,
      timelineFor(newSnapshot),
    );
    let oldRunStart = index;
    while (oldRunStart > 0) {
      const previous = ordered[oldRunStart - 1]!;
      const current = ordered[oldRunStart]!;
      if (
        strategyCyclePlanKey(previous) !== oldStrategyKey ||
        current.decisionIndex !== previous.decisionIndex + 1
      ) {
        break;
      }
      oldRunStart -= 1;
    }
    const oldDurationSessions = index - oldRunStart + 1;
    const requestedPerformanceSessions =
      CYCLE_TRANSITION_ANALYSIS_BASE_SESSIONS + oldDurationSessions + 1;
    const markerEndIndex = newSnapshot.decisionIndex;
    const performanceEndIndex = Math.min(
      bars.length - 1,
      markerEndIndex + Math.max(...CYCLE_TRANSITION_HORIZONS),
    );
    const performanceStartIndex = Math.max(
      0,
      markerEndIndex - requestedPerformanceSessions + 1,
    );
    const oldPerformance = historicalPlanPerformance(
      bars,
      oldSnapshot,
      performanceStartIndex,
      performanceEndIndex,
      settings,
      timelineFor(oldSnapshot),
    );
    const newPerformance = historicalPlanPerformance(
      bars,
      newSnapshot,
      performanceStartIndex,
      performanceEndIndex,
      settings,
      timelineFor(newSnapshot),
    );
    const screeningStartIndex = Math.max(
      0,
      markerEndIndex - CYCLE_DAILY_SCREENING_WINDOW + 1,
    );
    const screeningOldReturn = historicalPlanPerformance(
      bars,
      oldSnapshot,
      screeningStartIndex,
      markerEndIndex,
      settings,
      timelineFor(oldSnapshot),
    ).totalReturn;
    const screeningNewReturn = historicalPlanPerformance(
      bars,
      newSnapshot,
      screeningStartIndex,
      markerEndIndex,
      settings,
      timelineFor(newSnapshot),
    ).totalReturn;
    const performance = bars
      .slice(performanceStartIndex, performanceEndIndex + 1)
      .flatMap((bar) => {
        const oldReturn = oldPerformance.returns.get(bar.time);
        const newReturn = newPerformance.returns.get(bar.time);
        return oldReturn === undefined || newReturn === undefined
          ? []
          : [{
              time: bar.time,
              oldReturn,
              newReturn,
              returnDifference: newReturn - oldReturn,
            }];
      });
    return [{
      decisionTime: newSnapshot.decisionTime,
      oldStrategyKey,
      oldLabel: oldSnapshot.label,
      newStrategyKey,
      newLabel: newSnapshot.label,
      oldDurationSessions,
      requestedPerformanceSessions,
      performanceStartTime: bars[performanceStartIndex]!.time,
      performanceEndTime: bars[performanceEndIndex]!.time,
      performance,
      oldRebalances: oldPerformance.rebalances.flatMap((rebalance) => {
        const returnValue = oldPerformance.returns.get(rebalance.time);
        return rebalance.time <= newSnapshot.decisionTime && returnValue !== undefined
          ? [{
              time: rebalance.time,
              fromAllocation: rebalance.fromAllocation,
              targetAllocation: rebalance.targetAllocation,
              returnValue,
            }]
          : [];
      }),
      newRebalances: newPerformance.rebalances.flatMap((rebalance) => {
        const returnValue = newPerformance.returns.get(rebalance.time);
        return rebalance.time <= newSnapshot.decisionTime && returnValue !== undefined
          ? [{
              time: rebalance.time,
              fromAllocation: rebalance.fromAllocation,
              targetAllocation: rebalance.targetAllocation,
              returnValue,
            }]
          : [];
      }),
      screeningOldReturn,
      screeningNewReturn,
      screeningReturnDifference: screeningNewReturn - screeningOldReturn,
      horizons: CYCLE_TRANSITION_HORIZONS.map((sessions) => {
        const oldReturn = frozenPlanForwardReturn(
          bars,
          oldTimeline,
          newSnapshot.decisionIndex,
          sessions,
          settings,
        );
        const newReturn = frozenPlanForwardReturn(
          bars,
          newTimeline,
          newSnapshot.decisionIndex,
          sessions,
          settings,
        );
        return {
          sessions,
          oldReturn,
          newReturn,
          returnDifference:
            oldReturn === null || newReturn === null
              ? null
              : newReturn - oldReturn,
        };
      }),
    }];
  });
}

function buildStrategyCycleTransitionSummaries(
  transitions: readonly StrategyCycleTransitionResult[],
): StrategyCycleTransitionSummary[] {
  const isNonZero = (value: number) => Math.abs(value) > 1e-12;
  return CYCLE_TRANSITION_HORIZONS.map((sessions) => {
    const complete = transitions.flatMap((transition) => {
      const result = transition.horizons.find((entry) => entry.sessions === sessions);
      return result?.oldReturn === null || result?.newReturn === null ||
        result?.returnDifference === null || !result
        ? []
        : [{
            oldReturn: result.oldReturn,
            newReturn: result.newReturn,
            returnDifference: result.returnDifference,
            screeningReturnDifference: transition.screeningReturnDifference,
          }];
    });
    const comparable = complete.filter((entry) => isNonZero(entry.returnDifference));
    const nonZeroOldReturns = complete
      .map((entry) => entry.oldReturn)
      .filter(isNonZero);
    const nonZeroNewReturns = complete
      .map((entry) => entry.newReturn)
      .filter(isNonZero);
    const screeningNewLed = comparable.filter(
      (entry) => entry.screeningReturnDifference > 0,
    );
    const screeningOldLed = comparable.filter(
      (entry) => entry.screeningReturnDifference < 0,
    );
    return {
      sessions,
      sampleCount: comparable.length,
      oldPositiveRate: nonZeroOldReturns.length
        ? nonZeroOldReturns.filter((value) => value > 0).length / nonZeroOldReturns.length
        : null,
      newPositiveRate: nonZeroNewReturns.length
        ? nonZeroNewReturns.filter((value) => value > 0).length / nonZeroNewReturns.length
        : null,
      newWinRate: comparable.length
        ? comparable.filter((entry) => entry.returnDifference > 0).length / comparable.length
        : null,
      medianOldReturn: nonZeroOldReturns.length
        ? median(nonZeroOldReturns)
        : null,
      medianNewReturn: nonZeroNewReturns.length
        ? median(nonZeroNewReturns)
        : null,
      medianReturnDifference: comparable.length
        ? median(comparable.map((entry) => entry.returnDifference))
        : null,
      meanReturnDifference: comparable.length
        ? comparable.reduce((sum, entry) => sum + entry.returnDifference, 0) /
          comparable.length
        : null,
      minimumReturnDifference: comparable.length
        ? Math.min(...comparable.map((entry) => entry.returnDifference))
        : null,
      maximumReturnDifference: comparable.length
        ? Math.max(...comparable.map((entry) => entry.returnDifference))
        : null,
      newBetterCount: comparable.filter((entry) => entry.returnDifference > 0).length,
      oldBetterCount: comparable.filter((entry) => entry.returnDifference < 0).length,
      equalCount: 0,
      screeningNewLedCount: screeningNewLed.length,
      screeningNewLedMedianDifference: screeningNewLed.length
        ? median(screeningNewLed.map((entry) => entry.returnDifference))
        : null,
      screeningNewLedMeanDifference: screeningNewLed.length
        ? screeningNewLed.reduce((sum, entry) => sum + entry.returnDifference, 0) /
          screeningNewLed.length
        : null,
      screeningOldLedCount: screeningOldLed.length,
      screeningOldLedMedianDifference: screeningOldLed.length
        ? median(screeningOldLed.map((entry) => entry.returnDifference))
        : null,
      screeningOldLedMeanDifference: screeningOldLed.length
        ? screeningOldLed.reduce((sum, entry) => sum + entry.returnDifference, 0) /
          screeningOldLed.length
        : null,
    };
  });
}

function strategyCycleRecommendation(
  summaries: readonly StrategyCycleTransitionSummary[],
): Pick<
  StrategyCycleDailyValidationReport,
  "recommendation" | "recommendedDelaySessions"
> {
  const sufficientlySampled = summaries.filter((summary) => summary.sampleCount >= 5);
  if (sufficientlySampled.length === 0) {
    return { recommendation: "insufficient-evidence", recommendedDelaySessions: null };
  }
  const switchPoint = sufficientlySampled.find((summary) =>
    (summary.newWinRate ?? 0) >= 0.6 &&
    (summary.newPositiveRate ?? 0) >= 0.55 &&
    (summary.medianReturnDifference ?? 0) > 0);
  if (switchPoint) {
    return {
      recommendation: "switch-after",
      recommendedDelaySessions: switchPoint.sessions,
    };
  }
  const longest = sufficientlySampled.at(-1)!;
  if (
    (longest.oldPositiveRate ?? 0) < 0.5 &&
    (longest.newPositiveRate ?? 0) < 0.5
  ) {
    return { recommendation: "avoid-both", recommendedDelaySessions: null };
  }
  if (
    (longest.newWinRate ?? 1) <= 0.45 &&
    (longest.medianReturnDifference ?? 0) <= 0
  ) {
    return { recommendation: "keep-old", recommendedDelaySessions: null };
  }
  return { recommendation: "observe-longer", recommendedDelaySessions: null };
}

export function buildStrategyCycleDailyValidationReport(
  bars: MarketBar[],
  snapshots: readonly StrategyCycleSelectionSnapshot[],
  settings: Pick<
    BacktestSettings,
    "initialCash" | "commissionRate" | "slippageRate" | "executionPolicy"
  > & { interval: MarketInterval },
): StrategyCycleDailyValidationReport {
  const dailySnapshots = snapshots.filter(
    (snapshot) => snapshot.screeningWindow === CYCLE_DAILY_SCREENING_WINDOW,
  );
  const stabilityRuns = buildStrategyCycleStabilityRuns(dailySnapshots);
  const transitions = buildStrategyCycleTransitions(bars, dailySnapshots, settings);
  const transitionSummaries = buildStrategyCycleTransitionSummaries(transitions);
  return {
    screeningWindow: CYCLE_DAILY_SCREENING_WINDOW,
    stabilityRuns,
    stabilitySummaries: buildStrategyCycleStabilitySummaries(stabilityRuns),
    transitions,
    transitionSummaries,
    ...strategyCycleRecommendation(transitionSummaries),
  };
}
