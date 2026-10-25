import type { MarketBar, MarketInterval } from "@/lib/market/types";
import type { IndicatorId } from "./indicator-registry";
import {
  bollingerBands,
  ema,
  ichimoku,
  kdj,
  macd,
  mfi,
  rollingHighLow,
  roc,
  rsi,
  sma,
  supertrend,
  vwap,
} from "./indicators";
import {
  INTRABAR_PRICE_ORDER_STRATEGY_IDS as TRADINGVIEW_INTRABAR_PRICE_ORDER_STRATEGY_IDS,
  TRADINGVIEW_BUILT_IN_STRATEGIES,
  type TradingViewBuiltInStrategyId,
} from "./built-in-strategies";
import {
  COMMUNITY_STRATEGIES,
  type CommunityStrategyId,
} from "./community/strategies";
import { buildStrategyOrderTimeline } from "./strategy-execution";
import {
  emptyOrderSeries,
  type StrategyOrderSeries,
} from "./strategy-orders";

export type StrategyId =
  | "sma-cross"
  | "ema-cross"
  | "rsi-reversal"
  | "macd-momentum"
  | "bollinger-reversion"
  | "donchian-breakout"
  | "donchian-intrabar"
  | "kdj-reversal"
  | "supertrend-trend"
  | "supertrend-stop"
  | "ichimoku-trend"
  | "mfi-reversal"
  | "roc-momentum"
  | "vwap-reversion"
  | CommunityStrategyId
  | TradingViewBuiltInStrategyId;

export const VOLUME_REQUIRED_STRATEGY_IDS = [
  "mfi-reversal",
  "vwap-reversion",
  "community-volume-weighted-macd",
  "community-mfi-rsi",
] as const satisfies readonly StrategyId[];

const volumeRequiredStrategyIds = new Set<StrategyId>(
  VOLUME_REQUIRED_STRATEGY_IDS,
);

export function strategyRequiresVolume(id: StrategyId): boolean {
  return volumeRequiredStrategyIds.has(id);
}

export const INTRADAY_STRATEGY_IDS = [
  "ema-cross",
  "rsi-reversal",
  "macd-momentum",
  "bollinger-reversion",
  "donchian-intrabar",
  "kdj-reversal",
  "supertrend-stop",
  "mfi-reversal",
  "roc-momentum",
  "vwap-reversion",
  "tv-bar-up-down",
  "tv-bollinger-bands",
  "tv-channel-breakout",
  "tv-consecutive-up-down",
  "tv-greedy",
  "tv-inside-bar",
  "tv-keltner-channels",
  "tv-macd",
  "tv-momentum",
  "tv-outside-bar",
  "tv-parabolic-sar",
  "tv-price-channel",
  "tv-rsi",
  "tv-stochastic-slow",
  "tv-supertrend",
  "tv-volty-expan-close",
  "community-bollinger-rsi",
  "community-squeeze-momentum",
  "community-ut-bot",
  "community-hull-suite",
  "community-chandelier-exit",
  "community-ssl-channel",
  "community-range-filter",
  "community-kama-trend",
  "community-dual-supertrend",
  "community-alligator-fractal",
  "community-wave-trend",
  "community-trendline-break",
  "community-nadaraya-watson",
  "community-kalman-velocity",
  "community-mcginley-dynamic",
  "community-vortex",
  "community-volume-weighted-macd",
  "community-elder-ray",
  "community-tma-bands",
  "community-mfi-rsi",
] as const satisfies readonly StrategyId[];

const intradayStrategyIds = new Set<StrategyId>(INTRADAY_STRATEGY_IDS);

export function strategySupportsInterval(
  id: StrategyId,
  interval: MarketInterval,
): boolean {
  return interval === "1d" || intradayStrategyIds.has(id);
}

export interface StrategyParameters {
  [key: string]: number;
}

export type StrategyHorizon = "long" | "short";
export type StrategyEquivalenceGroup = "macd-cross" | "supertrend-close";

export interface StrategyDefinition {
  id: StrategyId;
  horizon: StrategyHorizon;
  indicatorId: string;
  paneIndicatorId?: IndicatorId;
  equivalenceGroup?: StrategyEquivalenceGroup;
  defaultParameters: StrategyParameters;
  buildTarget: (
    bars: MarketBar[],
    parameters: StrategyParameters,
  ) => number[];
  buildOrders?: (
    bars: MarketBar[],
    parameters: StrategyParameters,
  ) => StrategyOrderSeries;
  buildPendingNextOpenAction?: (
    bars: MarketBar[],
    parameters: StrategyParameters,
  ) => "buy" | "sell" | null;
}

const LONG_HORIZON_IDS = new Set<StrategyId>([
  "sma-cross",
  "ema-cross",
  "macd-momentum",
  "donchian-breakout",
  "donchian-intrabar",
  "supertrend-trend",
  "supertrend-stop",
  "ichimoku-trend",
  "roc-momentum",
  "tv-bollinger-directed",
  "tv-keltner-channels",
  "tv-macd",
  "tv-momentum",
  "tv-parabolic-sar",
  "tv-price-channel",
  "tv-supertrend",
  "tv-technical-ratings",
  "community-squeeze-momentum",
  "community-ut-bot",
]);

function strategyHorizon(id: StrategyId): StrategyHorizon {
  return LONG_HORIZON_IDS.has(id) ? "long" : "short";
}

function builtInEquivalenceGroup(
  id: TradingViewBuiltInStrategyId,
): StrategyEquivalenceGroup | undefined {
  if (id === "tv-macd") return "macd-cross";
  if (id === "tv-supertrend") return "supertrend-close";
  return undefined;
}

function crossingTarget(
  positiveSeries: Array<number | null>,
  negativeSeries: Array<number | null>,
) {
  const target = new Array(positiveSeries.length).fill(0);
  let inPosition = false;

  for (let index = 1; index < positiveSeries.length; index += 1) {
    const positive = positiveSeries[index];
    const negative = negativeSeries[index];
    const previousPositive = positiveSeries[index - 1];
    const previousNegative = negativeSeries[index - 1];

    if (
      positive !== null &&
      negative !== null &&
      previousPositive !== null &&
      previousNegative !== null
    ) {
      if (positive > negative && previousPositive <= previousNegative) {
        inPosition = true;
      } else if (
        positive < negative &&
        previousPositive >= previousNegative
      ) {
        inPosition = false;
      }
    }
    target[index] = inPosition ? 1 : 0;
  }
  return target;
}

function smaCross(
  bars: MarketBar[],
  parameters: StrategyParameters,
): number[] {
  const closes = bars.map((bar) => bar.close);
  return crossingTarget(
    sma(closes, parameters.fast),
    sma(closes, parameters.slow),
  );
}

function emaCross(
  bars: MarketBar[],
  parameters: StrategyParameters,
): number[] {
  const closes = bars.map((bar) => bar.close);
  return crossingTarget(
    ema(closes, parameters.fast),
    ema(closes, parameters.slow),
  );
}

function rsiReversal(
  bars: MarketBar[],
  parameters: StrategyParameters,
): number[] {
  const values = rsi(
    bars.map((bar) => bar.close),
    parameters.period,
  );
  const target = new Array(bars.length).fill(0);
  let inPosition = false;

  values.forEach((value, index) => {
    if (value !== null) {
      if (!inPosition && value <= parameters.entry) inPosition = true;
      if (inPosition && value >= parameters.exit) inPosition = false;
    }
    target[index] = inPosition ? 1 : 0;
  });

  return target;
}

function macdMomentum(
  bars: MarketBar[],
  parameters: StrategyParameters,
): number[] {
  const values = macd(
    bars.map((bar) => bar.close),
    parameters.fast,
    parameters.slow,
    parameters.signal,
  );
  return crossingTarget(values.line, values.signal);
}

function bollingerReversion(
  bars: MarketBar[],
  parameters: StrategyParameters,
): number[] {
  const closes = bars.map((bar) => bar.close);
  const bands = bollingerBands(closes, parameters.period, parameters.width);
  const target = new Array(bars.length).fill(0);
  let inPosition = false;

  bars.forEach((bar, index) => {
    if (bands.lower[index] !== null && bands.middle[index] !== null) {
      if (!inPosition && bar.close < bands.lower[index]!) inPosition = true;
      if (inPosition && bar.close >= bands.middle[index]!) inPosition = false;
    }
    target[index] = inPosition ? 1 : 0;
  });

  return target;
}

function donchianBreakout(
  bars: MarketBar[],
  parameters: StrategyParameters,
): number[] {
  const target = new Array(bars.length).fill(0);
  let inPosition = false;
  const entryPeriod = parameters.entryPeriod;
  const exitPeriod = parameters.exitPeriod;
  const entryRange = rollingHighLow(bars, entryPeriod);
  const exitRange = rollingHighLow(bars, exitPeriod);

  for (let index = 1; index < bars.length; index += 1) {
    if (!inPosition && index >= entryPeriod) {
      const previousHigh = entryRange.highest[index - 1]!;
      if (bars[index].close > previousHigh) inPosition = true;
    } else if (inPosition && index >= exitPeriod) {
      const previousLow = exitRange.lowest[index - 1]!;
      if (bars[index].close < previousLow) inPosition = false;
    }
    target[index] = inPosition ? 1 : 0;
  }

  return target;
}

function donchianIntrabarOrders(
  bars: MarketBar[],
  parameters: StrategyParameters,
): StrategyOrderSeries {
  const entryPeriod = Math.max(Math.round(parameters.entryPeriod), 1);
  const exitPeriod = Math.max(Math.round(parameters.exitPeriod), 1);
  const orders = emptyOrderSeries(bars.length);
  const entryRange = rollingHighLow(bars, entryPeriod);
  const exitRange = rollingHighLow(bars, exitPeriod);

  for (let index = 1; index < bars.length; index += 1) {
    orders[index] = {
      entryStop:
        index >= entryPeriod ? entryRange.highest[index - 1] : null,
      exitStop:
        index >= exitPeriod ? exitRange.lowest[index - 1] : null,
    };
  }

  return orders;
}

function donchianIntrabar(
  bars: MarketBar[],
  parameters: StrategyParameters,
): number[] {
  return buildStrategyOrderTimeline(
    bars,
    donchianIntrabarOrders(bars, parameters),
  ).target;
}

function kdjReversal(
  bars: MarketBar[],
  parameters: StrategyParameters,
): number[] {
  const values = kdj(bars, parameters.period);
  const target = new Array(bars.length).fill(0);
  let inPosition = false;

  for (let index = 1; index < bars.length; index += 1) {
    const currentK = values.k[index];
    const currentD = values.d[index];
    const previousK = values.k[index - 1];
    const previousD = values.d[index - 1];
    if (
      currentK !== null &&
      currentD !== null &&
      previousK !== null &&
      previousD !== null
    ) {
      if (
        !inPosition &&
        currentK > currentD &&
        previousK <= previousD &&
        currentK <= parameters.entry
      ) {
        inPosition = true;
      } else if (
        inPosition &&
        currentK < currentD &&
        previousK >= previousD &&
        currentK >= parameters.exit
      ) {
        inPosition = false;
      }
    }
    target[index] = inPosition ? 1 : 0;
  }
  return target;
}

function supertrendTrend(
  bars: MarketBar[],
  parameters: StrategyParameters,
): number[] {
  const values = supertrend(
    bars,
    parameters.period,
    parameters.multiplier,
  );
  return values.direction.map((direction) => (direction > 0 ? 1 : 0));
}

function supertrendStopOrders(
  bars: MarketBar[],
  parameters: StrategyParameters,
): StrategyOrderSeries {
  const period = Math.max(Math.round(parameters.period), 1);
  const values = supertrend(bars, period, parameters.multiplier);
  const orders = emptyOrderSeries(bars.length);

  for (let index = period; index < bars.length; index += 1) {
    orders[index] = {
      entryStop: values.upper[index - 1],
      exitStop: values.lower[index - 1],
    };
  }

  return orders;
}

function supertrendStop(
  bars: MarketBar[],
  parameters: StrategyParameters,
): number[] {
  return buildStrategyOrderTimeline(
    bars,
    supertrendStopOrders(bars, parameters),
  ).target;
}

function ichimokuTrend(
  bars: MarketBar[],
  parameters: StrategyParameters,
): number[] {
  const values = ichimoku(
    bars,
    parameters.conversionPeriod,
    parameters.basePeriod,
    parameters.spanPeriod,
  );
  const target = new Array(bars.length).fill(0);
  let inPosition = false;

  bars.forEach((bar, index) => {
    const conversion = values.conversion[index];
    const base = values.base[index];
    const spanA = values.spanA[index];
    const spanB = values.spanB[index];
    if (
      conversion !== null &&
      base !== null &&
      spanA !== null &&
      spanB !== null
    ) {
      const cloudTop = Math.max(spanA, spanB);
      const cloudBottom = Math.min(spanA, spanB);
      if (!inPosition && bar.close > cloudTop && conversion > base) {
        inPosition = true;
      } else if (
        inPosition &&
        (bar.close < cloudBottom || conversion < base)
      ) {
        inPosition = false;
      }
    }
    target[index] = inPosition ? 1 : 0;
  });
  return target;
}

function mfiReversal(
  bars: MarketBar[],
  parameters: StrategyParameters,
): number[] {
  const values = mfi(bars, parameters.period);
  const target = new Array(bars.length).fill(0);
  let inPosition = false;

  values.forEach((value, index) => {
    if (value !== null) {
      if (!inPosition && value <= parameters.entry) inPosition = true;
      if (inPosition && value >= parameters.exit) inPosition = false;
    }
    target[index] = inPosition ? 1 : 0;
  });
  return target;
}

function rocMomentum(
  bars: MarketBar[],
  parameters: StrategyParameters,
): number[] {
  const values = roc(
    bars.map((bar) => bar.close),
    parameters.period,
  );
  const target = new Array(bars.length).fill(0);
  let inPosition = false;

  values.forEach((value, index) => {
    if (value !== null) {
      if (!inPosition && value > parameters.entry) inPosition = true;
      if (inPosition && value < parameters.exit) inPosition = false;
    }
    target[index] = inPosition ? 1 : 0;
  });
  return target;
}

function vwapReversion(
  bars: MarketBar[],
  parameters: StrategyParameters,
): number[] {
  const values = vwap(bars);
  const target = new Array(bars.length).fill(0);
  let inPosition = false;

  bars.forEach((bar, index) => {
    const value = values[index];
    if (value !== null) {
      const entryLevel = value * (1 - parameters.entryPercent / 100);
      const exitLevel = value * (1 + parameters.exitPercent / 100);
      if (!inPosition && bar.close <= entryLevel) inPosition = true;
      if (inPosition && bar.close >= exitLevel) inPosition = false;
    }
    target[index] = inPosition ? 1 : 0;
  });
  return target;
}

/** Historical IDs remain executable but are not offered for new selections. */
export const LEGACY_STRATEGY_ALIASES = {
  "macd-momentum": "tv-macd",
  "supertrend-trend": "tv-supertrend",
} as const satisfies Partial<Record<StrategyId, StrategyId>>;

const strategyDefinitions: StrategyDefinition[] = [
  {
    id: "sma-cross",
    horizon: "long",
    indicatorId: "sma",
    defaultParameters: { fast: 10, slow: 30 },
    buildTarget: smaCross,
  },
  {
    id: "ema-cross",
    horizon: "long",
    indicatorId: "ema",
    defaultParameters: { fast: 12, slow: 26 },
    buildTarget: emaCross,
  },
  {
    id: "rsi-reversal",
    horizon: "short",
    indicatorId: "rsi",
    paneIndicatorId: "rsi",
    defaultParameters: { period: 14, entry: 30, exit: 65 },
    buildTarget: rsiReversal,
  },
  {
    id: "macd-momentum",
    horizon: "long",
    indicatorId: "macd",
    paneIndicatorId: "macd",
    equivalenceGroup: "macd-cross",
    defaultParameters: { fast: 12, slow: 26, signal: 9 },
    buildTarget: macdMomentum,
  },
  {
    id: "bollinger-reversion",
    horizon: "short",
    indicatorId: "bollinger",
    defaultParameters: { period: 20, width: 2 },
    buildTarget: bollingerReversion,
  },
  {
    id: "donchian-breakout",
    horizon: "long",
    indicatorId: "atr",
    defaultParameters: { entryPeriod: 20, exitPeriod: 10 },
    buildTarget: donchianBreakout,
  },
  {
    id: "donchian-intrabar",
    horizon: "long",
    indicatorId: "atr",
    defaultParameters: { entryPeriod: 20, exitPeriod: 10 },
    buildTarget: donchianIntrabar,
    buildOrders: donchianIntrabarOrders,
  },
  {
    id: "kdj-reversal",
    horizon: "short",
    indicatorId: "kdj",
    paneIndicatorId: "kdj",
    defaultParameters: { period: 9, entry: 35, exit: 65 },
    buildTarget: kdjReversal,
  },
  {
    id: "supertrend-trend",
    horizon: "long",
    indicatorId: "supertrend",
    equivalenceGroup: "supertrend-close",
    defaultParameters: { period: 10, multiplier: 3 },
    buildTarget: supertrendTrend,
  },
  {
    id: "supertrend-stop",
    horizon: "long",
    indicatorId: "supertrend",
    defaultParameters: { period: 10, multiplier: 3 },
    buildTarget: supertrendStop,
    buildOrders: supertrendStopOrders,
  },
  {
    id: "ichimoku-trend",
    horizon: "long",
    indicatorId: "ichimoku",
    defaultParameters: {
      conversionPeriod: 9,
      basePeriod: 26,
      spanPeriod: 52,
    },
    buildTarget: ichimokuTrend,
  },
  {
    id: "mfi-reversal",
    horizon: "short",
    indicatorId: "mfi",
    paneIndicatorId: "mfi",
    defaultParameters: { period: 14, entry: 20, exit: 60 },
    buildTarget: mfiReversal,
  },
  {
    id: "roc-momentum",
    horizon: "long",
    indicatorId: "roc",
    paneIndicatorId: "roc",
    defaultParameters: { period: 12, entry: 2, exit: 0 },
    buildTarget: rocMomentum,
  },
  {
    id: "vwap-reversion",
    horizon: "short",
    indicatorId: "vwap",
    defaultParameters: { entryPercent: 1.5, exitPercent: 0 },
    buildTarget: vwapReversion,
  },
  ...TRADINGVIEW_BUILT_IN_STRATEGIES.map((strategy) => ({
    ...strategy,
    horizon: strategyHorizon(strategy.id),
    equivalenceGroup: builtInEquivalenceGroup(strategy.id),
  })),
  ...COMMUNITY_STRATEGIES,
];

export const STRATEGIES: StrategyDefinition[] = strategyDefinitions.filter(
  (strategy) => !Object.hasOwn(LEGACY_STRATEGY_ALIASES, strategy.id),
);

/** Persistence accepts archived IDs as well as the active catalog. */
export const KNOWN_STRATEGY_IDS = new Set<StrategyId>(
  strategyDefinitions.map((strategy) => strategy.id),
);

export const LONG_HORIZON_STRATEGY_IDS: StrategyId[] = STRATEGIES.filter(
  (strategy) => strategy.horizon === "long",
).map((strategy) => strategy.id);

export const SHORT_HORIZON_STRATEGY_IDS: StrategyId[] = STRATEGIES.filter(
  (strategy) => strategy.horizon === "short",
).map((strategy) => strategy.id);

export const INTRABAR_PRICE_ORDER_STRATEGY_IDS = [
  "donchian-intrabar",
  "supertrend-stop",
  ...TRADINGVIEW_INTRABAR_PRICE_ORDER_STRATEGY_IDS,
] as const satisfies readonly StrategyId[];

export function getStrategiesByHorizon(
  horizon: StrategyHorizon,
): StrategyDefinition[] {
  return STRATEGIES.filter((strategy) => strategy.horizon === horizon);
}

export function getStrategiesForInterval(
  interval: MarketInterval,
): StrategyDefinition[] {
  return STRATEGIES.filter((strategy) =>
    strategySupportsInterval(strategy.id, interval),
  );
}

export function getStrategy(id: StrategyId): StrategyDefinition {
  const strategy = strategyDefinitions.find((candidate) => candidate.id === id);
  if (!strategy) throw new Error(`Unknown strategy: ${id}`);
  return strategy;
}

export function areStrategiesEquivalent(
  left: StrategyId,
  right: StrategyId,
): boolean {
  if (left === right) return true;
  const leftGroup = getStrategy(left).equivalenceGroup;
  const rightGroup = getStrategy(right).equivalenceGroup;
  return Boolean(leftGroup && leftGroup === rightGroup);
}
