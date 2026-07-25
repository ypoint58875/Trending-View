import type { MarketBar, MarketInterval } from "@/lib/market/types";
import {
  runAllocationBacktest,
  runBacktest,
  type AllocationSignalEvent,
  type AllocationBacktestResult,
  type BacktestResult,
  type BacktestSettings,
} from "./backtest";
import {
  buildScreeningCandidates,
  compareScreeningResults,
  selectScreeningBars,
  type ScreeningObjective,
} from "./screening";
import {
  LONG_HORIZON_STRATEGY_IDS,
  SHORT_HORIZON_STRATEGY_IDS,
  getStrategy,
  type StrategyId,
  type StrategyParameters,
} from "./strategies";

export const DEFAULT_LONG_ALLOCATION = 0.6;
export const DEFAULT_SHORT_ALLOCATION = 0.4;
export const ALLOWED_POSITION_LEVELS = [
  0,
  0.4,
  0.6,
  1,
] as const;
export const LONG_LAYER_ALLOCATION_CANDIDATES = ALLOWED_POSITION_LEVELS;
export const SHORT_LAYER_ALLOCATION_CANDIDATES = [0.4, 0.6] as const;
export const COMBINATION_FINALISTS_PER_STRATEGY = 2;
export const MAX_COMBINATION_PAIR_FINALISTS = 1_024;
export const MAX_COMBINATION_RESULTS = 32;

export interface TwoLayerAllocation {
  longAllocation: number;
  shortAllocation: number;
}

export const TWO_LAYER_ALLOCATION_CANDIDATES: readonly TwoLayerAllocation[] =
  LONG_LAYER_ALLOCATION_CANDIDATES.flatMap((longAllocation) =>
    SHORT_LAYER_ALLOCATION_CANDIDATES.filter((shortAllocation) => {
      const combinedAllocation = longAllocation + shortAllocation;
      return (
        combinedAllocation <= 1 + 1e-10 &&
        ALLOWED_POSITION_LEVELS.some(
          (level) => Math.abs(combinedAllocation - level) < 1e-10,
        )
      );
    }).map((shortAllocation) => ({
      longAllocation,
      shortAllocation,
    })),
  );

export interface StrategySelection {
  strategyId: StrategyId;
  parameters: StrategyParameters;
}

export interface StrategyAllocationPlan {
  long: StrategySelection | null;
  short: StrategySelection | null;
  longAllocation: number;
  shortAllocation: number;
}

export interface StrategyCombination {
  longStrategyId: StrategyId;
  longParameters: StrategyParameters;
  shortStrategyId: StrategyId;
  shortParameters: StrategyParameters;
  longAllocation: number;
  shortAllocation: number;
}

export interface StrategyCombinationResult extends AllocationBacktestResult {
  longStrategyId: StrategyId;
  longParameters: StrategyParameters;
  shortStrategyId: StrategyId;
  shortParameters: StrategyParameters;
  longAllocation: number;
  shortAllocation: number;
}

export type CombinationScreeningStage =
  | "strategies"
  | "pairs"
  | "allocations";

export interface CombinationScreeningProgress {
  completed: number;
  total: number;
  failed: number;
  stage: CombinationScreeningStage;
  longStrategyId: StrategyId | null;
  shortStrategyId: StrategyId | null;
}

export interface CombinationOptimizationResult {
  results: StrategyCombinationResult[];
  evaluatedCount: number;
  totalCandidates: number;
  failedCount: number;
  cancelled: boolean;
}

interface OptimizeStrategyCombinationsOptions {
  maxPerStrategy?: number;
  objective?: ScreeningObjective;
  allocationCandidates?: readonly TwoLayerAllocation[];
  maxPairFinalists?: number;
  signal?: AbortSignal;
  yieldEvery?: number;
  onProgress?: (progress: CombinationScreeningProgress) => void;
}

interface StrategyFinalist {
  result: BacktestResult;
  target: number[];
}

interface StrategyPairFinalist {
  long: StrategyFinalist;
  short: StrategyFinalist;
  referenceResult: StrategyCombinationResult;
}

function normalizeAllocation(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, 0), 1);
}

function assertAllocationPlanBounds(
  longAllocation: number,
  shortAllocation: number,
) {
  if (
    !Number.isFinite(longAllocation) ||
    !Number.isFinite(shortAllocation) ||
    longAllocation < 0 ||
    shortAllocation < 0 ||
    longAllocation > 1 ||
    shortAllocation > 1 ||
    longAllocation + shortAllocation > 1 + 1e-10
  ) {
    throw new Error(
      "Long and short allocations must be between zero and one and their sum cannot exceed one",
    );
  }
}

function assertAlignedTargets(
  longTarget: readonly number[] | null,
  shortTarget: readonly number[] | null,
) {
  if (!longTarget && !shortTarget) {
    throw new Error("At least one strategy target is required");
  }
  if (
    longTarget &&
    shortTarget &&
    longTarget.length !== shortTarget.length
  ) {
    throw new Error("Long and short targets must align");
  }
}

export function buildStrategyPlanAllocationTarget(
  longTarget: readonly number[] | null,
  shortTarget: readonly number[] | null,
  longAllocation: number,
  shortAllocation: number,
): number[] {
  assertAlignedTargets(longTarget, shortTarget);
  assertAllocationPlanBounds(longAllocation, shortAllocation);

  if (longTarget && shortTarget) {
    return longTarget.map((longState, index) => {
      if (!(longState > 0)) return 0;
      return longAllocation +
        (shortTarget[index] > 0 ? shortAllocation : 0);
    });
  }

  const target = longTarget ?? shortTarget ?? [];
  const selectedAllocation = longTarget
    ? longAllocation
    : shortAllocation;
  return target.map((state) => (state > 0 ? selectedAllocation : 0));
}

function buildSelectionTarget(
  bars: MarketBar[],
  selection: StrategySelection | null,
  expectedHorizon: "long" | "short",
): number[] | null {
  if (!selection) return null;
  const strategy = getStrategy(selection.strategyId);
  if (strategy.horizon !== expectedHorizon) {
    throw new Error(
      `${expectedHorizon === "long" ? "Long" : "Short"} strategy must use the ${expectedHorizon} horizon`,
    );
  }
  return strategy.buildTarget(bars, selection.parameters);
}

export function buildStrategyPlanTarget(
  bars: MarketBar[],
  plan: StrategyAllocationPlan,
): number[] {
  return buildStrategyPlanTimeline(bars, plan).target;
}

export interface StrategyPlanTimeline {
  target: number[];
  signalEvents: AllocationSignalEvent[][];
}

export function buildStrategyPlanTimelineFromTargets(
  longTarget: readonly number[] | null,
  shortTarget: readonly number[] | null,
  longAllocation: number,
  shortAllocation: number,
): StrategyPlanTimeline {
  const target = buildStrategyPlanAllocationTarget(
    longTarget,
    shortTarget,
    longAllocation,
    shortAllocation,
  );
  const signalEvents = target.map((_, index) => {
    const previousLongActive =
      index > 0 && Boolean(longTarget?.[index - 1] > 0);
    const longActive = Boolean(longTarget?.[index] > 0);
    const previousShortActive =
      index > 0 &&
      Boolean(shortTarget?.[index - 1] > 0) &&
      (!longTarget || previousLongActive);
    const shortActive =
      Boolean(shortTarget?.[index] > 0) && (!longTarget || longActive);
    const events: AllocationSignalEvent[] = [];

    if (!previousLongActive && longActive) events.push("long-entry");
    if (previousLongActive && !longActive) events.push("long-exit");
    if (!previousShortActive && shortActive) events.push("short-entry");
    if (previousShortActive && !shortActive) events.push("short-exit");
    return events;
  });

  return { target, signalEvents };
}

export function buildStrategyPlanTimeline(
  bars: MarketBar[],
  plan: StrategyAllocationPlan,
): StrategyPlanTimeline {
  return buildStrategyPlanTimelineFromTargets(
    buildSelectionTarget(bars, plan.long, "long"),
    buildSelectionTarget(bars, plan.short, "short"),
    plan.longAllocation,
    plan.shortAllocation,
  );
}

export interface LiveAllocationGuidance {
  action: "increase" | "reduce" | "hold" | "wait";
  previousAllocation: number;
  targetAllocation: number;
}

export function buildLiveAllocationGuidance(
  bars: MarketBar[],
  plan: StrategyAllocationPlan,
): LiveAllocationGuidance | null {
  if (bars.length === 0 || (!plan.long && !plan.short)) return null;
  const target = buildStrategyPlanTarget(bars, plan);
  const targetAllocation = target.at(-1) ?? 0;
  const previousAllocation = target.at(-2) ?? 0;
  const action =
    targetAllocation > previousAllocation
      ? "increase"
      : targetAllocation < previousAllocation
        ? "reduce"
        : targetAllocation > 0
          ? "hold"
          : "wait";
  return { action, previousAllocation, targetAllocation };
}

export function buildStrategyCombinationTarget(
  bars: MarketBar[],
  combination: StrategyCombination,
): number[] {
  return buildStrategyPlanTarget(bars, {
    long: {
      strategyId: combination.longStrategyId,
      parameters: combination.longParameters,
    },
    short: {
      strategyId: combination.shortStrategyId,
      parameters: combination.shortParameters,
    },
    longAllocation: normalizeAllocation(
      combination.longAllocation,
      DEFAULT_LONG_ALLOCATION,
    ),
    shortAllocation: normalizeAllocation(
      combination.shortAllocation,
      DEFAULT_SHORT_ALLOCATION,
    ),
  });
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function retainFinalist(
  finalistsByStrategy: Map<StrategyId, BacktestResult[]>,
  result: BacktestResult,
  objective: ScreeningObjective,
) {
  const finalists = finalistsByStrategy.get(result.strategyId) ?? [];
  finalists.push(result);
  finalists.sort((left, right) =>
    compareScreeningResults(left, right, objective),
  );
  finalistsByStrategy.set(
    result.strategyId,
    finalists.slice(0, COMBINATION_FINALISTS_PER_STRATEGY),
  );
}

function buildFinalists(
  bars: MarketBar[],
  finalistsByStrategy: Map<StrategyId, BacktestResult[]>,
  strategyIds: readonly StrategyId[],
): StrategyFinalist[] {
  return strategyIds.flatMap((strategyId) => {
    const strategy = getStrategy(strategyId);
    return (finalistsByStrategy.get(strategyId) ?? []).map((result) => ({
      result,
      target: strategy.buildTarget(bars, result.parameters),
    }));
  });
}

function retainCombinationResult(
  results: StrategyCombinationResult[],
  result: StrategyCombinationResult,
  objective: ScreeningObjective,
) {
  results.push(result);
  results.sort((left, right) =>
    compareScreeningResults(left, right, objective),
  );
  if (results.length > MAX_COMBINATION_RESULTS) {
    results.length = MAX_COMBINATION_RESULTS;
  }
}

function retainPairFinalist(
  finalists: StrategyPairFinalist[],
  finalist: StrategyPairFinalist,
  objective: ScreeningObjective,
  limit: number,
) {
  finalists.push(finalist);
  finalists.sort((left, right) =>
    compareScreeningResults(
      left.referenceResult,
      right.referenceResult,
      objective,
    ),
  );
  if (finalists.length > limit) finalists.length = limit;
}

function sameAllocation(
  left: TwoLayerAllocation,
  right: TwoLayerAllocation,
): boolean {
  return (
    Math.abs(left.longAllocation - right.longAllocation) < 1e-10 &&
    Math.abs(left.shortAllocation - right.shortAllocation) < 1e-10
  );
}

function runCombinationCandidate(
  bars: MarketBar[],
  longFinalist: StrategyFinalist,
  shortFinalist: StrategyFinalist,
  allocation: TwoLayerAllocation,
  settings: Omit<BacktestSettings, "interval"> & {
    interval: MarketInterval;
  },
): StrategyCombinationResult {
  const performance = runAllocationBacktest(
    bars,
    buildStrategyPlanAllocationTarget(
      longFinalist.target,
      shortFinalist.target,
      allocation.longAllocation,
      allocation.shortAllocation,
    ),
    settings,
  );
  return {
    ...performance,
    longStrategyId: longFinalist.result.strategyId,
    longParameters: longFinalist.result.parameters,
    shortStrategyId: shortFinalist.result.strategyId,
    shortParameters: shortFinalist.result.parameters,
    longAllocation: allocation.longAllocation,
    shortAllocation: allocation.shortAllocation,
  };
}

export async function optimizeStrategyCombinations(
  bars: MarketBar[],
  settings: Omit<BacktestSettings, "interval"> & {
    interval: MarketInterval;
  },
  options: OptimizeStrategyCombinationsOptions = {},
): Promise<CombinationOptimizationResult> {
  const candidates = buildScreeningCandidates(options.maxPerStrategy);
  const analysisBars = selectScreeningBars(bars, settings);
  const objective = options.objective ?? "balanced";
  const allocationCandidates =
    options.allocationCandidates ?? TWO_LAYER_ALLOCATION_CANDIDATES;
  const referenceAllocation =
    allocationCandidates.find(
      (allocation) =>
        Math.abs(allocation.longAllocation - DEFAULT_LONG_ALLOCATION) <
          1e-10 &&
        Math.abs(allocation.shortAllocation - DEFAULT_SHORT_ALLOCATION) <
          1e-10,
    ) ?? allocationCandidates[0];
  const remainingAllocations = referenceAllocation
    ? allocationCandidates.filter(
        (allocation) => !sameAllocation(allocation, referenceAllocation),
      )
    : [];
  const requestedPairFinalistLimit =
    options.maxPairFinalists ?? MAX_COMBINATION_PAIR_FINALISTS;
  const pairFinalistLimit = Number.isFinite(requestedPairFinalistLimit)
    ? Math.max(Math.floor(requestedPairFinalistLimit), 1)
    : MAX_COMBINATION_PAIR_FINALISTS;
  const yieldEvery = Math.max(Math.floor(options.yieldEvery ?? 24), 1);
  const finalistsByStrategy = new Map<StrategyId, BacktestResult[]>();
  const pairFinalists: StrategyPairFinalist[] = [];
  const results: StrategyCombinationResult[] = [];
  let evaluatedCount = 0;
  let failedCount = 0;
  let totalCandidates = candidates.length;

  options.onProgress?.({
    completed: 0,
    total: totalCandidates,
    failed: 0,
    stage: "strategies",
    longStrategyId: null,
    shortStrategyId: null,
  });

  for (const candidate of candidates) {
    if (options.signal?.aborted) break;
    try {
      retainFinalist(
        finalistsByStrategy,
        runBacktest(
          analysisBars,
          candidate.strategyId,
          candidate.parameters,
          settings,
        ),
        objective,
      );
    } catch {
      failedCount += 1;
    }
    evaluatedCount += 1;

    if (
      evaluatedCount % yieldEvery === 0 ||
      evaluatedCount === candidates.length
    ) {
      options.onProgress?.({
        completed: evaluatedCount,
        total: totalCandidates,
        failed: failedCount,
        stage: "strategies",
        longStrategyId: null,
        shortStrategyId: null,
      });
      await yieldToMainThread();
    }
  }

  if (!options.signal?.aborted) {
    const longFinalists = buildFinalists(
      analysisBars,
      finalistsByStrategy,
      LONG_HORIZON_STRATEGY_IDS,
    );
    const shortFinalists = buildFinalists(
      analysisBars,
      finalistsByStrategy,
      SHORT_HORIZON_STRATEGY_IDS,
    );
    const pairCount = referenceAllocation
      ? longFinalists.length * shortFinalists.length
      : 0;
    totalCandidates = candidates.length + pairCount;

    options.onProgress?.({
      completed: evaluatedCount,
      total: totalCandidates,
      failed: failedCount,
      stage: "pairs",
      longStrategyId: null,
      shortStrategyId: null,
    });

    pairLoop: for (const longFinalist of longFinalists) {
      for (const shortFinalist of shortFinalists) {
        if (options.signal?.aborted || !referenceAllocation) break pairLoop;
        try {
          const referenceResult = runCombinationCandidate(
            analysisBars,
            longFinalist,
            shortFinalist,
            referenceAllocation,
            settings,
          );
          retainPairFinalist(
            pairFinalists,
            { long: longFinalist, short: shortFinalist, referenceResult },
            objective,
            pairFinalistLimit,
          );
        } catch {
          failedCount += 1;
        }
        evaluatedCount += 1;

        if (
          evaluatedCount % yieldEvery === 0 ||
          evaluatedCount === totalCandidates
        ) {
          options.onProgress?.({
            completed: evaluatedCount,
            total: totalCandidates,
            failed: failedCount,
            stage: "pairs",
            longStrategyId: longFinalist.result.strategyId,
            shortStrategyId: shortFinalist.result.strategyId,
          });
          await yieldToMainThread();
        }
      }
    }

    if (!options.signal?.aborted) {
      totalCandidates += pairFinalists.length * remainingAllocations.length;
      options.onProgress?.({
        completed: evaluatedCount,
        total: totalCandidates,
        failed: failedCount,
        stage: "allocations",
        longStrategyId: null,
        shortStrategyId: null,
      });

      allocationLoop: for (const finalist of pairFinalists) {
        retainCombinationResult(
          results,
          finalist.referenceResult,
          objective,
        );
        for (const allocation of remainingAllocations) {
          if (options.signal?.aborted) break allocationLoop;
          try {
            retainCombinationResult(
              results,
              runCombinationCandidate(
                analysisBars,
                finalist.long,
                finalist.short,
                allocation,
                settings,
              ),
              objective,
            );
          } catch {
            failedCount += 1;
          }
          evaluatedCount += 1;

          if (
            evaluatedCount % yieldEvery === 0 ||
            evaluatedCount === totalCandidates
          ) {
            options.onProgress?.({
              completed: evaluatedCount,
              total: totalCandidates,
              failed: failedCount,
              stage: "allocations",
              longStrategyId: finalist.long.result.strategyId,
              shortStrategyId: finalist.short.result.strategyId,
            });
            await yieldToMainThread();
          }
        }
      }
    }
  }

  return {
    results,
    evaluatedCount,
    totalCandidates,
    failedCount,
    cancelled: Boolean(options.signal?.aborted),
  };
}
