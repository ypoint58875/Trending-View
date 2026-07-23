import type { MarketBar } from "@/lib/market/types";
import {
  bollingerBands,
  ema,
  ichimoku,
  kdj,
  macd,
  mfi,
  roc,
  rsi,
  sma,
  supertrend,
  vwap,
} from "./indicators";

export type StrategyId =
  | "sma-cross"
  | "ema-cross"
  | "rsi-reversal"
  | "macd-momentum"
  | "bollinger-reversion"
  | "donchian-breakout"
  | "kdj-reversal"
  | "supertrend-trend"
  | "ichimoku-trend"
  | "mfi-reversal"
  | "roc-momentum"
  | "vwap-reversion";

export interface StrategyParameters {
  [key: string]: number;
}

export interface StrategyDefinition {
  id: StrategyId;
  indicatorId: string;
  defaultParameters: StrategyParameters;
  buildTarget: (
    bars: MarketBar[],
    parameters: StrategyParameters,
  ) => number[];
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

  for (let index = 1; index < bars.length; index += 1) {
    if (!inPosition && index >= entryPeriod) {
      const previousHigh = Math.max(
        ...bars
          .slice(index - entryPeriod, index)
          .map((bar) => bar.high),
      );
      if (bars[index].close > previousHigh) inPosition = true;
    } else if (inPosition && index >= exitPeriod) {
      const previousLow = Math.min(
        ...bars.slice(index - exitPeriod, index).map((bar) => bar.low),
      );
      if (bars[index].close < previousLow) inPosition = false;
    }
    target[index] = inPosition ? 1 : 0;
  }

  return target;
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

export const STRATEGIES: StrategyDefinition[] = [
  {
    id: "sma-cross",
    indicatorId: "sma",
    defaultParameters: { fast: 10, slow: 30 },
    buildTarget: smaCross,
  },
  {
    id: "ema-cross",
    indicatorId: "ema",
    defaultParameters: { fast: 12, slow: 26 },
    buildTarget: emaCross,
  },
  {
    id: "rsi-reversal",
    indicatorId: "rsi",
    defaultParameters: { period: 14, entry: 30, exit: 65 },
    buildTarget: rsiReversal,
  },
  {
    id: "macd-momentum",
    indicatorId: "macd",
    defaultParameters: { fast: 12, slow: 26, signal: 9 },
    buildTarget: macdMomentum,
  },
  {
    id: "bollinger-reversion",
    indicatorId: "bollinger",
    defaultParameters: { period: 20, width: 2 },
    buildTarget: bollingerReversion,
  },
  {
    id: "donchian-breakout",
    indicatorId: "atr",
    defaultParameters: { entryPeriod: 20, exitPeriod: 10 },
    buildTarget: donchianBreakout,
  },
  {
    id: "kdj-reversal",
    indicatorId: "kdj",
    defaultParameters: { period: 9, entry: 35, exit: 65 },
    buildTarget: kdjReversal,
  },
  {
    id: "supertrend-trend",
    indicatorId: "supertrend",
    defaultParameters: { period: 10, multiplier: 3 },
    buildTarget: supertrendTrend,
  },
  {
    id: "ichimoku-trend",
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
    indicatorId: "mfi",
    defaultParameters: { period: 14, entry: 20, exit: 60 },
    buildTarget: mfiReversal,
  },
  {
    id: "roc-momentum",
    indicatorId: "roc",
    defaultParameters: { period: 12, entry: 2, exit: 0 },
    buildTarget: rocMomentum,
  },
  {
    id: "vwap-reversion",
    indicatorId: "vwap",
    defaultParameters: { entryPercent: 1.5, exitPercent: 0 },
    buildTarget: vwapReversion,
  },
];

export function getStrategy(id: StrategyId): StrategyDefinition {
  const strategy = STRATEGIES.find((candidate) => candidate.id === id);
  if (!strategy) throw new Error(`Unknown strategy: ${id}`);
  return strategy;
}
