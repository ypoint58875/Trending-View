import type { MarketBar } from "@/lib/market/types";
import { bollingerBands, ema, macd, rsi, sma } from "./indicators";

export type StrategyId =
  | "sma-cross"
  | "ema-cross"
  | "rsi-reversal"
  | "macd-momentum"
  | "bollinger-reversion"
  | "donchian-breakout";

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
];

export function getStrategy(id: StrategyId): StrategyDefinition {
  const strategy = STRATEGIES.find((candidate) => candidate.id === id);
  if (!strategy) throw new Error(`Unknown strategy: ${id}`);
  return strategy;
}

