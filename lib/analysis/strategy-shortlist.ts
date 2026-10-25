import type { MarketBar } from "@/lib/market/types";
import type {
  AllocationBacktestResult,
  BacktestPerformance,
  BacktestResult,
  EquityPoint,
} from "./backtest";
import {
  compareScreeningResults,
  screeningObjectiveValue,
  type ScreeningObjective,
} from "./screening";
import type {
  StrategyCombinationResult,
  StrategyAllocationPlan,
} from "./strategy-combinations";
import {
  DEFAULT_TACTICAL_ALLOCATION_MODE,
  STRATEGY_SLOTS,
  resolveTacticalAllocationMode,
} from "./strategy-combinations";
import type { StrategyId } from "./strategies";

const DEFAULT_SHORTLIST_SIZE = 3;
const RECENT_REVIEW_SESSIONS = 30;
const CONFIRMATION_REVIEW_SESSIONS = 63;
const HIGH_CORRELATION_THRESHOLD = 0.9;
const MODERATE_CORRELATION_THRESHOLD = 0.75;

export const DEFAULT_STRATEGY_SHORTLIST_DEPUTY_COUNT =
  DEFAULT_SHORTLIST_SIZE - 1;

export type StrategyShortlistRole =
  | "primary"
  | "secondary"
  | "alternative";
export type StrategyShortlistSimilarity =
  | "not-applicable"
  | "low"
  | "medium"
  | "high"
  | "unknown";
export type RecentEffectivenessStatus =
  | "favorable"
  | "mixed"
  | "review"
  | "insufficient";

export interface RecentEffectivenessReview {
  status: RecentEffectivenessStatus;
  windowStartTime: string | null;
  windowEndTime: string | null;
  executionCount: number;
  recentReturn: number | null;
  benchmarkReturn: number | null;
  recentExcessReturn: number | null;
  recentMaxDrawdown: number | null;
  benchmarkMaxDrawdown: number | null;
  confirmationExcessReturn: number | null;
}

interface StrategyShortlistEntryBase {
  key: string;
  role: StrategyShortlistRole;
  roleIndex: number;
  qualityRank: number;
  objectiveValue: number;
  strategyIds: readonly StrategyId[];
  correlationToPrimary: number | null;
  maxCorrelationToSelected: number | null;
  sharesStrategyComponent: boolean;
  similarity: StrategyShortlistSimilarity;
  recentReview: RecentEffectivenessReview;
}

export type StrategyShortlistEntry =
  | (StrategyShortlistEntryBase & {
      kind: "single";
      result: BacktestResult;
      plan: StrategyAllocationPlan;
    })
  | (StrategyShortlistEntryBase & {
      kind: "combination";
      result: StrategyCombinationResult;
      plan: StrategyAllocationPlan;
    });

type StrategyShortlistCandidate =
  | {
      key: string;
      kind: "single";
      result: BacktestResult;
      plan: StrategyAllocationPlan;
      strategyIds: readonly StrategyId[];
      qualityRank: number;
      selectionScore?: number | null;
    }
  | {
      key: string;
      kind: "combination";
      result: StrategyCombinationResult;
      plan: StrategyAllocationPlan;
      strategyIds: readonly StrategyId[];
      qualityRank: number;
      selectionScore?: number | null;
    };

export interface StrategyShortlistOptions {
  objective: ScreeningObjective;
  size?: number;
  selectionScore?: (
    result: BacktestResult | StrategyCombinationResult,
  ) => number | null;
}

function stableParameterKey(parameters: Record<string, number>): string {
  return Object.entries(parameters)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${value}`)
    .join(",");
}

function filterKey(
  filter: BacktestResult["entryFilter"],
): string | null {
  return filter
    ? `${filter.movingAverageType}:${filter.period}:${filter.minimumSlopePercent}`
    : null;
}

function singleCandidate(
  result: BacktestResult,
): StrategyShortlistCandidate {
  const entryFilterKey = filterKey(result.entryFilter);
  return {
    key: [
      "single",
      result.strategyId,
      stableParameterKey(result.parameters),
      ...(entryFilterKey ? [entryFilterKey] : []),
    ].join(":"),
    kind: "single",
    result,
    plan: {
      ...(result.positionOverlay ? { positionOverlay: { ...result.positionOverlay } } : {}),
      strategyA: {
        strategyId: result.strategyId,
        parameters: { ...result.parameters },
      },
      strategyB: null,
      strategyAAllocation: 1,
      strategyBAllocation: 0,
      strategyAEntryFilter: result.entryFilter ?? null,
      strategyBEntryFilter: null,
    },
    strategyIds: [result.strategyId],
    qualityRank: 0,
  };
}

function combinationCandidate(
  result: StrategyCombinationResult,
): StrategyShortlistCandidate {
  const source = result as unknown as Record<string, unknown>;
  const legs = STRATEGY_SLOTS.flatMap((slot) => {
    const strategyId = source[`${slot}Id`] as StrategyId | undefined;
    const parameters = source[`${slot}Parameters`] as
      | Record<string, number>
      | undefined;
    if (!strategyId || !parameters) return [];
    return [{
      slot,
      strategyId,
      parameters,
      allocation: (source[`${slot}Allocation`] as number | undefined) ?? 0,
      entryFilter: source[`${slot}EntryFilter`] as
        | StrategyAllocationPlan["strategyAEntryFilter"]
        | undefined,
    }];
  });
  const first = legs[0]!;
  const second = legs[1]!;
  const plan: StrategyAllocationPlan = {
    ...(result.positionOverlay ? { positionOverlay: { ...result.positionOverlay } } : {}),
    strategyA: { strategyId: first.strategyId, parameters: { ...first.parameters } },
    strategyB: { strategyId: second.strategyId, parameters: { ...second.parameters } },
    strategyAAllocation: first.allocation,
    strategyBAllocation: second.allocation,
    tacticalMode: resolveTacticalAllocationMode(result.tacticalMode),
  };
  const mutablePlan = plan as unknown as Record<string, unknown>;
  for (const leg of legs) {
    mutablePlan[leg.slot] = {
      strategyId: leg.strategyId,
      parameters: { ...leg.parameters },
    };
    mutablePlan[`${leg.slot}Allocation`] = leg.allocation;
    mutablePlan[`${leg.slot}EntryFilter`] = leg.entryFilter ?? null;
  }
  const entryFilterKeys = legs.map((leg) => filterKey(leg.entryFilter));
  return {
    key: [
      "combination",
      ...legs.flatMap((leg) => [
        leg.strategyId,
        stableParameterKey(leg.parameters),
      ]),
      ...legs.map((leg) => leg.allocation),
      ...(resolveTacticalAllocationMode(result.tacticalMode) ===
      DEFAULT_TACTICAL_ALLOCATION_MODE
        ? []
        : [resolveTacticalAllocationMode(result.tacticalMode)]),
      ...(entryFilterKeys.some(Boolean)
        ? entryFilterKeys.map((key) => key ?? "none")
        : []),
    ].join(":"),
    kind: "combination",
    result,
    plan,
    strategyIds: legs.map((leg) => leg.strategyId),
    qualityRank: 0,
  };
}

function isScreeningCandidate(result: BacktestPerformance): boolean {
  return result.totalReturn > 0 && result.sharpe > 0 && result.tradeCount >= 2;
}

function equityReturns(equity: readonly EquityPoint[]): Map<string, number> {
  const returns = new Map<string, number>();
  for (let index = 1; index < equity.length; index += 1) {
    const previous = equity[index - 1]?.equity;
    const current = equity[index]?.equity;
    if (
      !Number.isFinite(previous) ||
      !Number.isFinite(current) ||
      previous <= 0
    ) {
      continue;
    }
    returns.set(equity[index].time, current / previous - 1);
  }
  return returns;
}

export function equityReturnCorrelation(
  left: BacktestPerformance,
  right: BacktestPerformance,
): number | null {
  const leftReturns = equityReturns(left.equity);
  const rightReturns = equityReturns(right.equity);
  const sharedTimes = [...leftReturns.keys()].filter((time) =>
    rightReturns.has(time),
  );
  if (sharedTimes.length < 3) return null;

  const leftValues = sharedTimes.map((time) => leftReturns.get(time) ?? 0);
  const rightValues = sharedTimes.map((time) => rightReturns.get(time) ?? 0);
  const leftMean =
    leftValues.reduce((sum, value) => sum + value, 0) / leftValues.length;
  const rightMean =
    rightValues.reduce((sum, value) => sum + value, 0) / rightValues.length;
  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;

  for (let index = 0; index < leftValues.length; index += 1) {
    const leftDelta = leftValues[index] - leftMean;
    const rightDelta = rightValues[index] - rightMean;
    covariance += leftDelta * rightDelta;
    leftVariance += leftDelta * leftDelta;
    rightVariance += rightDelta * rightDelta;
  }

  if (leftVariance <= 0 || rightVariance <= 0) return null;
  return Math.max(
    -1,
    Math.min(1, covariance / Math.sqrt(leftVariance * rightVariance)),
  );
}

function sharesStrategyComponent(
  left: StrategyShortlistCandidate,
  right: StrategyShortlistCandidate,
): boolean {
  return left.strategyIds.some((strategyId) =>
    right.strategyIds.includes(strategyId),
  );
}

function percentageReturn(values: readonly number[]): number | null {
  const first = values[0];
  const last = values.at(-1);
  if (
    values.length < 2 ||
    first === undefined ||
    last === undefined ||
    !Number.isFinite(first) ||
    !Number.isFinite(last) ||
    first <= 0
  ) {
    return null;
  }
  return (last / first - 1) * 100;
}

function maximumDrawdown(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  let peak = values[0];
  let drawdown = 0;
  for (const value of values) {
    if (!Number.isFinite(value) || value <= 0) continue;
    peak = Math.max(peak, value);
    drawdown = Math.min(drawdown, ((value - peak) / peak) * 100);
  }
  return drawdown;
}

function strategyExecutionTimes(
  result: BacktestResult | AllocationBacktestResult,
): string[] {
  if ("trades" in result) {
    return result.trades.flatMap((trade) => [
      trade.entryTime,
      ...(trade.exitReason === "strategy" ? [trade.exitTime] : []),
    ]);
  }
  return result.rebalances
    .filter((rebalance) => rebalance.reason === "strategy")
    .map((rebalance) => rebalance.time);
}

export function evaluateRecentStrategyEffectiveness(
  result: BacktestResult | AllocationBacktestResult,
  bars: readonly MarketBar[],
): RecentEffectivenessReview {
  const barByTime = new Map(bars.map((bar) => [bar.time, bar]));
  const aligned = result.equity
    .map((point) => {
      const bar = barByTime.get(point.time);
      return bar ? { point, bar } : null;
    })
    .filter(
      (
        item,
      ): item is {
        point: EquityPoint;
        bar: MarketBar;
      } => item !== null,
    );
  const recent = aligned.slice(-RECENT_REVIEW_SESSIONS);
  const confirmation = aligned.slice(-CONFIRMATION_REVIEW_SESSIONS);
  const windowStartTime = recent[0]?.point.time ?? null;
  const windowEndTime = recent.at(-1)?.point.time ?? null;
  const executionCount =
    windowStartTime && windowEndTime
      ? strategyExecutionTimes(result).filter(
          (time) => time >= windowStartTime && time <= windowEndTime,
        ).length
      : 0;
  const recentReturn = percentageReturn(
    recent.map(({ point }) => point.equity),
  );
  const benchmarkReturn = percentageReturn(
    recent.map(({ bar }) => bar.close),
  );
  const recentExcessReturn =
    recentReturn !== null && benchmarkReturn !== null
      ? recentReturn - benchmarkReturn
      : null;
  const recentMaxDrawdown = maximumDrawdown(
    recent.map(({ point }) => point.equity),
  );
  const benchmarkMaxDrawdown = maximumDrawdown(
    recent.map(({ bar }) => bar.close),
  );
  const confirmationStrategyReturn =
    confirmation.length >= CONFIRMATION_REVIEW_SESSIONS
      ? percentageReturn(confirmation.map(({ point }) => point.equity))
      : null;
  const confirmationBenchmarkReturn =
    confirmation.length >= CONFIRMATION_REVIEW_SESSIONS
      ? percentageReturn(confirmation.map(({ bar }) => bar.close))
      : null;
  const confirmationExcessReturn =
    confirmationStrategyReturn !== null &&
    confirmationBenchmarkReturn !== null
      ? confirmationStrategyReturn - confirmationBenchmarkReturn
      : null;

  let status: RecentEffectivenessStatus = "mixed";
  if (
    recent.length < RECENT_REVIEW_SESSIONS ||
    executionCount < 2 ||
    recentExcessReturn === null ||
    recentMaxDrawdown === null ||
    benchmarkMaxDrawdown === null
  ) {
    status = "insufficient";
  } else if (
    recentExcessReturn >= 0 &&
    recentMaxDrawdown >= benchmarkMaxDrawdown
  ) {
    status = "favorable";
  } else if (
    recentExcessReturn < 0 &&
    confirmationExcessReturn !== null &&
    confirmationExcessReturn < 0 &&
    recentMaxDrawdown < benchmarkMaxDrawdown
  ) {
    status = "review";
  }

  return {
    status,
    windowStartTime,
    windowEndTime,
    executionCount,
    recentReturn,
    benchmarkReturn,
    recentExcessReturn,
    recentMaxDrawdown,
    benchmarkMaxDrawdown,
    confirmationExcessReturn,
  };
}

function shortlistSimilarity(
  correlation: number | null,
  componentOverlap: boolean,
): StrategyShortlistSimilarity {
  if (componentOverlap) return "high";
  if (correlation === null) return "unknown";
  if (correlation >= HIGH_CORRELATION_THRESHOLD) return "high";
  if (correlation >= MODERATE_CORRELATION_THRESHOLD) return "medium";
  return "low";
}

function candidateSelectionScore(
  candidate: StrategyShortlistCandidate,
  selected: readonly StrategyShortlistCandidate[],
  candidateCount: number,
): number {
  const quality =
    candidateCount <= 1
      ? 1
      : 1 - (candidate.qualityRank - 1) / (candidateCount - 1);
  const correlations = selected
    .map((entry) => equityReturnCorrelation(candidate.result, entry.result))
    .filter((value): value is number => value !== null);
  const maxPositiveCorrelation =
    correlations.length > 0 ? Math.max(0, ...correlations) : 0.75;
  const diversity = 1 - maxPositiveCorrelation;
  const componentOverlap = selected.some((entry) =>
    sharesStrategyComponent(candidate, entry),
  );
  return quality * 0.68 + diversity * 0.32 - (componentOverlap ? 0.28 : 0);
}

function similarityToSelected(
  candidate: StrategyShortlistCandidate,
  selected: readonly StrategyShortlistCandidate[],
): {
  correlation: number | null;
  componentOverlap: boolean;
  similarity: StrategyShortlistSimilarity;
} {
  const correlations = selected
    .map((entry) => equityReturnCorrelation(candidate.result, entry.result))
    .filter((value): value is number => value !== null);
  const correlation =
    correlations.length > 0 ? Math.max(...correlations) : null;
  const componentOverlap = selected.some((entry) =>
    sharesStrategyComponent(candidate, entry),
  );
  return {
    correlation,
    componentOverlap,
    similarity: shortlistSimilarity(correlation, componentOverlap),
  };
}

function buildShortlistEntry(
  candidate: StrategyShortlistCandidate,
  comparedWith: readonly StrategyShortlistCandidate[],
  primary: StrategyShortlistCandidate,
  bars: readonly MarketBar[],
  objective: ScreeningObjective,
  role: StrategyShortlistRole,
  roleIndex: number,
): StrategyShortlistEntry {
  const correlationToPrimary =
    candidate.key === primary.key
      ? null
      : equityReturnCorrelation(candidate.result, primary.result);
  const comparison = similarityToSelected(candidate, comparedWith);
  const base: StrategyShortlistEntryBase = {
    key: candidate.key,
    role,
    roleIndex,
    qualityRank: candidate.qualityRank,
    objectiveValue:
      candidate.selectionScore ??
      screeningObjectiveValue(candidate.result, objective),
    strategyIds: candidate.strategyIds,
    correlationToPrimary,
    maxCorrelationToSelected: comparison.correlation,
    sharesStrategyComponent: comparison.componentOverlap,
    similarity:
      role === "primary" ? ("not-applicable" as const) : comparison.similarity,
    recentReview: evaluateRecentStrategyEffectiveness(candidate.result, bars),
  };
  if (candidate.kind === "single") {
    return {
      ...base,
      kind: "single",
      result: candidate.result,
      plan: candidate.plan,
    };
  }
  return {
    ...base,
    kind: "combination",
    result: candidate.result,
    plan: candidate.plan,
  };
}

export function selectStrategyShortlist(
  singleResults: readonly BacktestResult[],
  combinationResults: readonly StrategyCombinationResult[],
  bars: readonly MarketBar[],
  options: StrategyShortlistOptions,
): StrategyShortlistEntry[] {
  const requestedSize = Math.max(
    1,
    Math.floor(options.size ?? DEFAULT_SHORTLIST_SIZE),
  );
  const ranked = [
    ...singleResults.map(singleCandidate),
    ...combinationResults.map(combinationCandidate),
  ]
    .map((candidate) => ({
      ...candidate,
      selectionScore:
        options.selectionScore?.(candidate.result) ?? null,
    }))
    .filter((candidate) => isScreeningCandidate(candidate.result))
    .sort((left, right) => {
      if (
        left.selectionScore !== null &&
        right.selectionScore !== null
      ) {
        const scoreDifference =
          right.selectionScore - left.selectionScore;
        if (Math.abs(scoreDifference) > 1e-12) {
          return scoreDifference;
        }
      } else if (left.selectionScore !== null) {
        return -1;
      } else if (right.selectionScore !== null) {
        return 1;
      }
      const comparison = compareScreeningResults(
        left.result,
        right.result,
        options.objective,
      );
      return comparison !== 0 ? comparison : left.key.localeCompare(right.key);
    })
    .map((candidate, index) => ({
      ...candidate,
      qualityRank: index + 1,
    }));
  const primary = ranked[0];
  if (!primary) return [];

  const deputyTarget = requestedSize - 1;
  const recommendations: StrategyShortlistCandidate[] = [primary];
  while (
    recommendations.length - 1 < deputyTarget &&
    recommendations.length < ranked.length
  ) {
    const remaining = ranked
      .filter(
        (candidate) =>
          !recommendations.some((entry) => entry.key === candidate.key) &&
          similarityToSelected(candidate, recommendations).similarity ===
            "low",
      )
      .sort((left, right) => {
        const scoreDifference =
          candidateSelectionScore(
            right,
            recommendations,
            ranked.length,
          ) -
          candidateSelectionScore(left, recommendations, ranked.length);
        if (Math.abs(scoreDifference) > 1e-12) return scoreDifference;
        const comparison = compareScreeningResults(
          left.result,
          right.result,
          options.objective,
        );
        return comparison !== 0 ? comparison : left.key.localeCompare(right.key);
    });
    const next = remaining[0];
    if (!next) break;
    recommendations.push(next);
  }

  const missingDeputyCount =
    deputyTarget - Math.max(recommendations.length - 1, 0);
  const alternatives = ranked
    .filter(
      (candidate) =>
        !recommendations.some((entry) => entry.key === candidate.key) &&
        similarityToSelected(candidate, recommendations).similarity === "high",
    )
    .slice(0, missingDeputyCount);

  const primaryEntry = buildShortlistEntry(
    primary,
    [],
    primary,
    bars,
    options.objective,
    "primary",
    0,
  );
  const deputyEntries = recommendations.slice(1).map((candidate, index) =>
    buildShortlistEntry(
      candidate,
      recommendations.slice(0, index + 1),
      primary,
      bars,
      options.objective,
      "secondary",
      index + 1,
    ),
  );
  const alternativeEntries = alternatives.map((candidate, index) =>
    buildShortlistEntry(
      candidate,
      recommendations,
      primary,
      bars,
      options.objective,
      "alternative",
      index + 1,
    ),
  );

  return [primaryEntry, ...deputyEntries, ...alternativeEntries];
}
