import type { MarketBar, MarketInterval } from "@/lib/market/types";
import {
  runBacktestFromTarget,
  type BacktestPerformance,
  type BacktestResult,
  type BacktestSettings,
} from "./backtest";
import {
  STRATEGIES,
  getStrategy,
  type StrategyId,
  type StrategyHorizon,
  type StrategyParameters,
} from "./strategies";
import { buildStrategyOrderTimeline } from "./strategy-execution";
import {
  applyMovingAverageSlopeEntryFilter,
  resolveMovingAverageEntryAllowedSeries,
} from "./entry-filter";

export const DEFAULT_SCREENING_YIELD_EVERY = 8;

const INTEGER_STRATEGY_PARAMETER_KEYS = new Set([
  "fast",
  "slow",
  "period",
  "signal",
  "length",
  "upBars",
  "downBars",
  "leftBars",
  "rightBars",
  "smoothK",
  "smoothD",
  "threshold",
]);

export function isIntegerStrategyParameterKey(key: string): boolean {
  return (
    key.endsWith("Period") || INTEGER_STRATEGY_PARAMETER_KEYS.has(key)
  );
}

export function normalizeStrategyParameterInput(
  key: string,
  value: number,
): number {
  if (!isIntegerStrategyParameterKey(key)) return value;
  return Math.max(1, Math.round(Number.isFinite(value) ? value : 1));
}

export const SCREENING_OBJECTIVES = [
  "balanced",
  "totalReturn",
  "sharpe",
] as const;

export type ScreeningObjective = (typeof SCREENING_OBJECTIVES)[number];

export interface ScreeningCandidate {
  strategyId: StrategyId;
  parameters: StrategyParameters;
}

export interface ScreeningProgress {
  completed: number;
  total: number;
  failed: number;
  strategyId: StrategyId | null;
}

export interface ScreeningOptimizationResult {
  results: BacktestResult[];
  evaluatedCount: number;
  totalCandidates: number;
  failedCount: number;
  cancelled: boolean;
}

interface OptimizeStrategiesOptions {
  candidates?: readonly ScreeningCandidate[];
  objective?: ScreeningObjective;
  signal?: AbortSignal;
  yieldEvery?: number;
  onProgress?: (progress: ScreeningProgress) => void;
}

interface ParameterDomain {
  key: string;
  values: number[];
}

interface ParameterSpace {
  domains: ParameterDomain[];
  isValid?: (parameters: StrategyParameters) => boolean;
}

function integerRange(start: number, end: number, step = 1): number[] {
  const values: number[] = [];
  for (let value = start; value <= end; value += step) values.push(value);
  return values;
}

function decimalRange(start: number, end: number, step: number): number[] {
  const precision = Math.max(
    String(start).split(".")[1]?.length ?? 0,
    String(end).split(".")[1]?.length ?? 0,
    String(step).split(".")[1]?.length ?? 0,
  );
  const scale = 10 ** precision;
  const values: number[] = [];
  const scaledStart = Math.round(start * scale);
  const scaledEnd = Math.round(end * scale);
  const scaledStep = Math.round(step * scale);
  for (
    let value = scaledStart;
    value <= scaledEnd;
    value += scaledStep
  ) {
    values.push(value / scale);
  }
  return values;
}

const movingAverageCrossSpace: ParameterSpace = {
  domains: [
    { key: "fast", values: integerRange(2, 50, 2) },
    { key: "slow", values: integerRange(10, 200, 5) },
  ],
  isValid: ({ fast, slow }) => fast < slow,
};

const oscillatorReversalSpace: ParameterSpace = {
  domains: [
    { key: "period", values: integerRange(5, 30) },
    { key: "entry", values: integerRange(15, 40, 5) },
    { key: "exit", values: integerRange(55, 80, 5) },
  ],
  isValid: ({ entry, exit }) => entry < exit,
};

const macdSpace: ParameterSpace = {
  domains: [
    { key: "fast", values: integerRange(4, 20) },
    { key: "slow", values: integerRange(16, 52, 2) },
    { key: "signal", values: integerRange(3, 15) },
  ],
  isValid: ({ fast, slow }) => fast < slow,
};

const bollingerSpace: ParameterSpace = {
  domains: [
    { key: "period", values: integerRange(5, 60) },
    { key: "width", values: decimalRange(1, 3, 0.1) },
  ],
};

const donchianSpace: ParameterSpace = {
  domains: [
    { key: "entryPeriod", values: integerRange(5, 100, 5) },
    { key: "exitPeriod", values: integerRange(2, 50, 2) },
  ],
  isValid: ({ entryPeriod, exitPeriod }) => exitPeriod < entryPeriod,
};

const supertrendSpace: ParameterSpace = {
  domains: [
    { key: "period", values: integerRange(5, 50) },
    { key: "multiplier", values: decimalRange(1, 6, 0.25) },
  ],
};

const candleFilterSpace: ParameterSpace = {
  domains: [
    {
      key: "minimumBodyPercent",
      values: decimalRange(0, 3, 0.05),
    },
  ],
};

const volatilityChannelSpace: ParameterSpace = {
  domains: [
    { key: "period", values: integerRange(5, 60) },
    { key: "multiplier", values: decimalRange(1, 5, 0.25) },
  ],
};

const tickValues = [0.01, 0.05, 0.1, 0.5, 1, 5, 10];

const PARAMETER_SPACES: Record<StrategyId, ParameterSpace> = {
  "sma-cross": movingAverageCrossSpace,
  "ema-cross": movingAverageCrossSpace,
  "rsi-reversal": oscillatorReversalSpace,
  "macd-momentum": macdSpace,
  "bollinger-reversion": bollingerSpace,
  "donchian-breakout": donchianSpace,
  "donchian-intrabar": donchianSpace,
  "kdj-reversal": {
    domains: [
      { key: "period", values: integerRange(5, 30) },
      { key: "entry", values: integerRange(15, 45, 5) },
      { key: "exit", values: integerRange(55, 85, 5) },
    ],
    isValid: ({ entry, exit }) => entry < exit,
  },
  "supertrend-trend": supertrendSpace,
  "supertrend-stop": supertrendSpace,
  "ichimoku-trend": {
    domains: [
      { key: "conversionPeriod", values: integerRange(5, 20) },
      { key: "basePeriod", values: integerRange(15, 60, 3) },
      { key: "spanPeriod", values: integerRange(30, 120, 6) },
    ],
    isValid: ({ conversionPeriod, basePeriod, spanPeriod }) =>
      conversionPeriod < basePeriod && basePeriod < spanPeriod,
  },
  "mfi-reversal": oscillatorReversalSpace,
  "roc-momentum": {
    domains: [
      { key: "period", values: integerRange(3, 60, 2) },
      { key: "entry", values: decimalRange(0, 5, 0.5) },
      { key: "exit", values: decimalRange(-3, 2, 0.5) },
    ],
    isValid: ({ entry, exit }) => exit < entry,
  },
  "vwap-reversion": {
    domains: [
      {
        key: "entryPercent",
        values: decimalRange(0.25, 5, 0.25),
      },
      { key: "exitPercent", values: decimalRange(0, 2, 0.25) },
    ],
  },
  "tv-bar-up-down": candleFilterSpace,
  "tv-bollinger-bands": bollingerSpace,
  "tv-bollinger-directed": bollingerSpace,
  "tv-channel-breakout": {
    domains: [
      { key: "length", values: integerRange(2, 200) },
      { key: "tick", values: tickValues },
    ],
  },
  "tv-consecutive-up-down": {
    domains: [
      { key: "upBars", values: integerRange(1, 20) },
      { key: "downBars", values: integerRange(1, 20) },
    ],
  },
  "tv-greedy": candleFilterSpace,
  "tv-inside-bar": candleFilterSpace,
  "tv-keltner-channels": volatilityChannelSpace,
  "tv-macd": macdSpace,
  "tv-momentum": {
    domains: [
      { key: "period", values: integerRange(2, 200) },
      { key: "tick", values: tickValues },
    ],
  },
  "tv-outside-bar": candleFilterSpace,
  "tv-parabolic-sar": {
    domains: [
      { key: "start", values: decimalRange(0.005, 0.05, 0.005) },
      {
        key: "increment",
        values: decimalRange(0.005, 0.05, 0.005),
      },
      { key: "maximum", values: decimalRange(0.1, 0.5, 0.05) },
    ],
  },
  "tv-pivot-extension": {
    domains: [
      { key: "leftBars", values: integerRange(1, 20) },
      { key: "rightBars", values: integerRange(1, 10) },
    ],
  },
  "tv-pivot-reversal": {
    domains: [
      { key: "leftBars", values: integerRange(1, 20) },
      { key: "rightBars", values: integerRange(1, 10) },
      { key: "tick", values: tickValues },
    ],
  },
  "tv-price-channel": {
    domains: [{ key: "length", values: integerRange(2, 200) }],
  },
  "tv-rsi": {
    domains: [
      { key: "period", values: integerRange(5, 30) },
      { key: "oversold", values: integerRange(15, 40, 5) },
      { key: "overbought", values: integerRange(60, 85, 5) },
    ],
    isValid: ({ oversold, overbought }) => oversold < overbought,
  },
  "tv-stochastic-slow": {
    domains: [
      { key: "period", values: integerRange(5, 30) },
      { key: "smoothK", values: integerRange(1, 7) },
      { key: "smoothD", values: integerRange(1, 7) },
    ],
  },
  "tv-supertrend": supertrendSpace,
  "tv-technical-ratings": {
    domains: [{ key: "threshold", values: integerRange(1, 6) }],
  },
  "tv-volty-expan-close": volatilityChannelSpace,
};

function buildParameterSets(space: ParameterSpace): StrategyParameters[] {
  let combinations: StrategyParameters[] = [{}];
  for (const domain of space.domains) {
    combinations = combinations.flatMap((parameters) =>
      domain.values.map((value) => ({
        ...parameters,
        [domain.key]: value,
      })),
    );
  }
  return space.isValid
    ? combinations.filter(space.isValid)
    : combinations;
}

export function isValidStrategyParameters(
  strategyId: StrategyId,
  parameters: StrategyParameters,
): boolean {
  const space = PARAMETER_SPACES[strategyId];
  const expectedKeys = space.domains.map((domain) => domain.key);
  const actualKeys = Object.keys(parameters);
  if (
    actualKeys.length !== expectedKeys.length ||
    !expectedKeys.every((key) => actualKeys.includes(key))
  ) {
    return false;
  }

  for (const domain of space.domains) {
    const value = parameters[domain.key];
    const minimum = domain.values[0];
    const maximum = domain.values.at(-1);
    if (
      !Number.isFinite(value) ||
      (isIntegerStrategyParameterKey(domain.key) &&
        !Number.isInteger(value)) ||
      minimum === undefined ||
      maximum === undefined ||
      value < minimum ||
      value > maximum
    ) {
      return false;
    }
  }

  return space.isValid ? space.isValid(parameters) : true;
}

export function buildNearbyParameterSets(
  strategyId: StrategyId,
  baseParameters: StrategyParameters,
): StrategyParameters[] {
  if (!isValidStrategyParameters(strategyId, baseParameters)) return [];

  const space = PARAMETER_SPACES[strategyId];
  const parameterSets = new Map<string, StrategyParameters>();
  const base = { ...baseParameters };
  parameterSets.set(JSON.stringify(base), base);

  for (const domain of space.domains) {
    const currentValue = baseParameters[domain.key];
    const lowerValues = domain.values.filter(
      (value) => value < currentValue,
    );
    const lower = lowerValues.at(-1);
    const higher = domain.values.find((value) => value > currentValue);

    for (const value of [lower, higher]) {
      if (value === undefined) continue;
      const candidate = {
        ...baseParameters,
        [domain.key]: value,
      };
      if (!isValidStrategyParameters(strategyId, candidate)) continue;
      parameterSets.set(JSON.stringify(candidate), candidate);
    }
  }

  return [...parameterSets.values()];
}

export function buildScreeningCandidates(
  horizons: readonly StrategyHorizon[] = ["long", "short"],
): ScreeningCandidate[] {
  const includedHorizons = new Set(horizons);
  return STRATEGIES.filter((strategy) =>
    includedHorizons.has(strategy.horizon),
  ).flatMap((strategy) => {
    const parameterSets = buildParameterSets(
      PARAMETER_SPACES[strategy.id],
    );
    return parameterSets.map((parameters) => ({
      strategyId: strategy.id,
      parameters,
    }));
  });
}

function finiteOrNegativeInfinity(value: number): number {
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

export function screeningObjectiveValue(
  result: BacktestPerformance,
  objective: ScreeningObjective,
): number {
  if (objective === "totalReturn") {
    return finiteOrNegativeInfinity(result.totalReturn);
  }
  if (objective === "sharpe") {
    return finiteOrNegativeInfinity(result.sharpe);
  }
  return finiteOrNegativeInfinity(result.score);
}

function compareDescending(left: number, right: number): number {
  if (left === right) return 0;
  return left > right ? -1 : 1;
}

export function compareScreeningResults(
  left: BacktestPerformance,
  right: BacktestPerformance,
  objective: ScreeningObjective,
): number {
  const comparisons = [
    compareDescending(
      screeningObjectiveValue(left, objective),
      screeningObjectiveValue(right, objective),
    ),
    compareDescending(
      finiteOrNegativeInfinity(left.totalReturn),
      finiteOrNegativeInfinity(right.totalReturn),
    ),
    compareDescending(
      finiteOrNegativeInfinity(left.maxDrawdown),
      finiteOrNegativeInfinity(right.maxDrawdown),
    ),
    compareDescending(
      finiteOrNegativeInfinity(left.sharpe),
      finiteOrNegativeInfinity(right.sharpe),
    ),
    compareDescending(
      finiteOrNegativeInfinity(left.score),
      finiteOrNegativeInfinity(right.score),
    ),
  ];
  return comparisons.find((comparison) => comparison !== 0) ?? 0;
}

interface CooperativeScheduler {
  yield?: () => Promise<void>;
}

export function yieldForScreening(): Promise<void> {
  const cooperativeScheduler = (
    globalThis as typeof globalThis & {
      scheduler?: CooperativeScheduler;
    }
  ).scheduler;
  return (async () => {
    if (cooperativeScheduler?.yield) {
      await cooperativeScheduler.yield();
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  })();
}

export async function optimizeStrategies(
  bars: MarketBar[],
  settings: Omit<BacktestSettings, "interval"> & {
    interval: MarketInterval;
  },
  options: OptimizeStrategiesOptions = {},
): Promise<ScreeningOptimizationResult> {
  const entryAllowed = resolveMovingAverageEntryAllowedSeries(
    bars,
    settings.entryFilter,
    settings.entryFilterAllowed,
  );
  const evaluationSettings = {
    ...settings,
    entryFilterAllowed: entryAllowed ?? undefined,
  };
  const candidates = options.candidates
    ? [...options.candidates]
    : buildScreeningCandidates();
  const objective = options.objective ?? "balanced";
  const yieldEvery = Math.max(
    Math.floor(options.yieldEvery ?? DEFAULT_SCREENING_YIELD_EVERY),
    1,
  );
  const bestByStrategy = new Map<StrategyId, BacktestResult>();
  let evaluatedCount = 0;
  let failedCount = 0;

  options.onProgress?.({
    completed: 0,
    total: candidates.length,
    failed: 0,
    strategyId: candidates[0]?.strategyId ?? null,
  });
  await yieldForScreening();

  for (const candidate of candidates) {
    if (options.signal?.aborted) break;
    try {
      const strategy = getStrategy(candidate.strategyId);
      const orders =
        settings.executionPolicy === "next-open"
          ? undefined
          : strategy.buildOrders?.(bars, candidate.parameters);
      const target = orders
        ? buildStrategyOrderTimeline(bars, orders, entryAllowed).target
        : applyMovingAverageSlopeEntryFilter(
            strategy.buildTarget(bars, candidate.parameters),
            entryAllowed,
          );
      const result = runBacktestFromTarget(
        bars,
        candidate.strategyId,
        candidate.parameters,
        target,
        evaluationSettings,
        orders,
      );
      const currentBest = bestByStrategy.get(candidate.strategyId);
      if (
        !currentBest ||
        compareScreeningResults(result, currentBest, objective) < 0
      ) {
        bestByStrategy.set(candidate.strategyId, result);
      }
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
        total: candidates.length,
        failed: failedCount,
        strategyId: candidate.strategyId,
      });
      await yieldForScreening();
    }
  }

  return {
    results: [...bestByStrategy.values()].sort((left, right) =>
      compareScreeningResults(left, right, objective),
    ),
    evaluatedCount,
    totalCandidates: candidates.length,
    failedCount,
    cancelled: Boolean(options.signal?.aborted),
  };
}
