import type { MarketBar, MarketInterval } from "@/lib/market/types";
import {
  runAllocationBacktest,
  runBacktest,
  type AllocationBacktestResult,
  type BacktestResult,
  type BacktestSettings,
} from "./backtest";
import {
  buildScreeningCandidates,
  compareScreeningResults,
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
export const POSITION_LAYER_CANDIDATES = [
  0.2,
  0.4,
  0.6,
  0.8,
  1,
] as const;
export const COMBINATION_FINALISTS_PER_STRATEGY = 2;
export const MAX_COMBINATION_RESULTS = 32;

export interface TwoLayerAllocation {
  longAllocation: number;
  shortAllocation: number;
}

export const TWO_LAYER_ALLOCATION_CANDIDATES: readonly TwoLayerAllocation[] =
  POSITION_LAYER_CANDIDATES.flatMap((longAllocation) =>
    POSITION_LAYER_CANDIDATES.filter(
      (shortAllocation) => longAllocation + shortAllocation <= 1 + 1e-10,
    ).map((shortAllocation) => ({
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

export type CombinationScreeningStage = "strategies" | "combinations";

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
  signal?: AbortSignal;
  yieldEvery?: number;
  onProgress?: (progress: CombinationScreeningProgress) => void;
}

interface StrategyFinalist {
  result: BacktestResult;
  target: number[];
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
  return buildStrategyPlanAllocationTarget(
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

export async function optimizeStrategyCombinations(
  bars: MarketBar[],
  settings: Omit<BacktestSettings, "interval"> & {
    interval: MarketInterval;
  },
  options: OptimizeStrategyCombinationsOptions = {},
): Promise<CombinationOptimizationResult> {
  const candidates = buildScreeningCandidates(options.maxPerStrategy);
  const objective = options.objective ?? "balanced";
  const allocationCandidates =
    options.allocationCandidates ?? TWO_LAYER_ALLOCATION_CANDIDATES;
  const yieldEvery = Math.max(Math.floor(options.yieldEvery ?? 24), 1);
  const finalistsByStrategy = new Map<StrategyId, BacktestResult[]>();
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
          bars,
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
      bars,
      finalistsByStrategy,
      LONG_HORIZON_STRATEGY_IDS,
    );
    const shortFinalists = buildFinalists(
      bars,
      finalistsByStrategy,
      SHORT_HORIZON_STRATEGY_IDS,
    );
    const pairCount =
      longFinalists.length *
      shortFinalists.length *
      allocationCandidates.length;
    totalCandidates = candidates.length + pairCount;

    options.onProgress?.({
      completed: evaluatedCount,
      total: totalCandidates,
      failed: failedCount,
      stage: "combinations",
      longStrategyId: null,
      shortStrategyId: null,
    });

    pairLoop: for (const longFinalist of longFinalists) {
      for (const shortFinalist of shortFinalists) {
        for (const allocation of allocationCandidates) {
          if (options.signal?.aborted) break pairLoop;
          try {
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
            retainCombinationResult(
              results,
              {
                ...performance,
                longStrategyId: longFinalist.result.strategyId,
                longParameters: longFinalist.result.parameters,
                shortStrategyId: shortFinalist.result.strategyId,
                shortParameters: shortFinalist.result.parameters,
                longAllocation: allocation.longAllocation,
                shortAllocation: allocation.shortAllocation,
              },
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
              stage: "combinations",
              longStrategyId: longFinalist.result.strategyId,
              shortStrategyId: shortFinalist.result.strategyId,
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
