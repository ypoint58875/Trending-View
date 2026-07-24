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

export const DEFAULT_CORE_ALLOCATION = 0.6;
export const COMBINATION_FINALISTS_PER_STRATEGY = 2;
export const MAX_COMBINATION_RESULTS = 32;

export interface StrategyCombination {
  longStrategyId: StrategyId;
  longParameters: StrategyParameters;
  shortStrategyId: StrategyId;
  shortParameters: StrategyParameters;
  coreAllocation: number;
}

export interface StrategyCombinationResult extends AllocationBacktestResult {
  longStrategyId: StrategyId;
  longParameters: StrategyParameters;
  shortStrategyId: StrategyId;
  shortParameters: StrategyParameters;
  coreAllocation: number;
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
  coreAllocation?: number;
  signal?: AbortSignal;
  yieldEvery?: number;
  onProgress?: (progress: CombinationScreeningProgress) => void;
}

interface StrategyFinalist {
  result: BacktestResult;
  target: number[];
}

function normalizeCoreAllocation(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CORE_ALLOCATION;
  return Math.min(Math.max(value, 0), 1);
}

export function buildHierarchicalAllocationTarget(
  longTarget: readonly number[],
  shortTarget: readonly number[],
  coreAllocation = DEFAULT_CORE_ALLOCATION,
): number[] {
  if (longTarget.length !== shortTarget.length) {
    throw new Error("Long and short targets must align");
  }
  const normalizedCore = normalizeCoreAllocation(coreAllocation);
  return longTarget.map((longState, index) => {
    if (!(longState > 0)) return 0;
    return shortTarget[index] > 0 ? 1 : normalizedCore;
  });
}

export function buildStrategyCombinationTarget(
  bars: MarketBar[],
  combination: StrategyCombination,
): number[] {
  const longStrategy = getStrategy(combination.longStrategyId);
  const shortStrategy = getStrategy(combination.shortStrategyId);
  if (longStrategy.horizon !== "long") {
    throw new Error("Combination long strategy must use the long horizon");
  }
  if (shortStrategy.horizon !== "short") {
    throw new Error("Combination short strategy must use the short horizon");
  }
  return buildHierarchicalAllocationTarget(
    longStrategy.buildTarget(bars, combination.longParameters),
    shortStrategy.buildTarget(bars, combination.shortParameters),
    combination.coreAllocation,
  );
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
  const coreAllocation = normalizeCoreAllocation(
    options.coreAllocation ?? DEFAULT_CORE_ALLOCATION,
  );
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
    const pairCount = longFinalists.length * shortFinalists.length;
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
        if (options.signal?.aborted) break pairLoop;
        try {
          const performance = runAllocationBacktest(
            bars,
            buildHierarchicalAllocationTarget(
              longFinalist.target,
              shortFinalist.target,
              coreAllocation,
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
              coreAllocation,
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

  return {
    results,
    evaluatedCount,
    totalCandidates,
    failedCount,
    cancelled: Boolean(options.signal?.aborted),
  };
}
