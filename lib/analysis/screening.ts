import type { MarketBar, MarketInterval } from "@/lib/market/types";
import {
  runBacktest,
  type BacktestResult,
  type BacktestSettings,
} from "./backtest";
import {
  STRATEGIES,
  getStrategy,
  type StrategyId,
  type StrategyParameters,
} from "./strategies";

export const MAX_PARAMETER_SETS_PER_STRATEGY = 2_500;
export const DEFAULT_PARAMETER_SETS_PER_STRATEGY =
  MAX_PARAMETER_SETS_PER_STRATEGY;

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
  maxPerStrategy?: number;
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

const PARAMETER_SPACES: Record<StrategyId, ParameterSpace> = {
  "sma-cross": movingAverageCrossSpace,
  "ema-cross": movingAverageCrossSpace,
  "rsi-reversal": oscillatorReversalSpace,
  "macd-momentum": macdSpace,
  "bollinger-reversion": bollingerSpace,
  "donchian-breakout": {
    domains: [
      { key: "entryPeriod", values: integerRange(5, 100, 5) },
      { key: "exitPeriod", values: integerRange(2, 50, 2) },
    ],
    isValid: ({ entryPeriod, exitPeriod }) => exitPeriod < entryPeriod,
  },
  "kdj-reversal": {
    domains: [
      { key: "period", values: integerRange(5, 30) },
      { key: "entry", values: integerRange(15, 45, 5) },
      { key: "exit", values: integerRange(55, 85, 5) },
    ],
    isValid: ({ entry, exit }) => entry < exit,
  },
  "supertrend-trend": supertrendSpace,
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
    domains: [{ key: "length", values: integerRange(2, 200) }],
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
    domains: [{ key: "period", values: integerRange(2, 200) }],
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

function clampCandidateLimit(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PARAMETER_SETS_PER_STRATEGY;
  return Math.min(
    Math.max(Math.floor(value), 1),
    MAX_PARAMETER_SETS_PER_STRATEGY,
  );
}

function selectEvenly(
  parameters: StrategyParameters[],
  limit: number,
  defaultParameters: StrategyParameters,
): StrategyParameters[] {
  const defaultKey = JSON.stringify(defaultParameters);
  if (parameters.length <= limit) {
    if (
      parameters.some((candidate) => JSON.stringify(candidate) === defaultKey)
    ) {
      return parameters;
    }
    return [defaultParameters, ...parameters].slice(0, limit);
  }

  const selected = new Map<string, StrategyParameters>();
  selected.set(defaultKey, defaultParameters);

  for (let index = 0; index < limit && selected.size < limit; index += 1) {
    const sourceIndex = Math.round(
      (index * (parameters.length - 1)) / Math.max(limit - 1, 1),
    );
    const candidate = parameters[sourceIndex];
    selected.set(JSON.stringify(candidate), candidate);
  }

  for (const candidate of parameters) {
    if (selected.size >= limit) break;
    selected.set(JSON.stringify(candidate), candidate);
  }

  return [...selected.values()].slice(0, limit);
}

export function buildScreeningCandidates(
  maxPerStrategy = DEFAULT_PARAMETER_SETS_PER_STRATEGY,
): ScreeningCandidate[] {
  const limit = clampCandidateLimit(maxPerStrategy);
  return STRATEGIES.flatMap((strategy) => {
    const parameterSets = selectEvenly(
      buildParameterSets(PARAMETER_SPACES[strategy.id]),
      limit,
      getStrategy(strategy.id).defaultParameters,
    );
    return parameterSets.map((parameters) => ({
      strategyId: strategy.id,
      parameters,
    }));
  });
}

function scoreValue(result: BacktestResult): number {
  return Number.isFinite(result.score)
    ? result.score
    : Number.NEGATIVE_INFINITY;
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function optimizeStrategies(
  bars: MarketBar[],
  settings: Omit<BacktestSettings, "interval"> & {
    interval: MarketInterval;
  },
  options: OptimizeStrategiesOptions = {},
): Promise<ScreeningOptimizationResult> {
  const candidates = buildScreeningCandidates(options.maxPerStrategy);
  const yieldEvery = Math.max(Math.floor(options.yieldEvery ?? 24), 1);
  const bestByStrategy = new Map<StrategyId, BacktestResult>();
  let evaluatedCount = 0;
  let failedCount = 0;

  options.onProgress?.({
    completed: 0,
    total: candidates.length,
    failed: 0,
    strategyId: candidates[0]?.strategyId ?? null,
  });

  for (const candidate of candidates) {
    if (options.signal?.aborted) break;
    try {
      const result = runBacktest(
        bars,
        candidate.strategyId,
        candidate.parameters,
        settings,
      );
      const currentBest = bestByStrategy.get(candidate.strategyId);
      if (!currentBest || scoreValue(result) > scoreValue(currentBest)) {
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
      await yieldToMainThread();
    }
  }

  return {
    results: [...bestByStrategy.values()].sort(
      (left, right) => scoreValue(right) - scoreValue(left),
    ),
    evaluatedCount,
    totalCandidates: candidates.length,
    failedCount,
    cancelled: Boolean(options.signal?.aborted),
  };
}
