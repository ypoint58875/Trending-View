import type { MarketBar } from "@/lib/market/types";
import {
  adx,
  atr,
  bollingerBands,
  ema,
  macd,
  parabolicSar,
  rsi,
  sma,
  stochasticSlow,
  supertrend,
} from "./indicators";

export const TRADINGVIEW_BUILT_IN_STRATEGY_IDS = [
  "tv-bar-up-down",
  "tv-bollinger-bands",
  "tv-bollinger-directed",
  "tv-channel-breakout",
  "tv-consecutive-up-down",
  "tv-greedy",
  "tv-inside-bar",
  "tv-keltner-channels",
  "tv-macd",
  "tv-momentum",
  "tv-outside-bar",
  "tv-parabolic-sar",
  "tv-pivot-extension",
  "tv-pivot-reversal",
  "tv-price-channel",
  "tv-rsi",
  "tv-stochastic-slow",
  "tv-supertrend",
  "tv-technical-ratings",
  "tv-volty-expan-close",
] as const;

export type TradingViewBuiltInStrategyId =
  (typeof TRADINGVIEW_BUILT_IN_STRATEGY_IDS)[number];

type StrategyParameters = Record<string, number>;

export interface BuiltInStrategyDefinition {
  id: TradingViewBuiltInStrategyId;
  indicatorId: string;
  defaultParameters: StrategyParameters;
  buildTarget: (
    bars: MarketBar[],
    parameters: StrategyParameters,
  ) => number[];
}

function period(parameters: StrategyParameters, key: string, fallback: number) {
  const value = parameters[key];
  return Math.max(Math.round(Number.isFinite(value) ? value : fallback), 1);
}

function value(parameters: StrategyParameters, key: string, fallback: number) {
  return Number.isFinite(parameters[key]) ? parameters[key] : fallback;
}

function holdTarget(length: number) {
  return new Array<number>(length).fill(0);
}

function carry(target: number[], index: number) {
  target[index] = index > 0 ? target[index - 1] : 0;
}

function asLongOnlyStrategy(
  strategy: BuiltInStrategyDefinition,
): BuiltInStrategyDefinition {
  return {
    ...strategy,
    buildTarget: (bars, parameters) =>
      strategy
        .buildTarget(bars, parameters)
        .map((signal) => (signal > 0 ? 1 : 0)),
  };
}

function barUpDown(bars: MarketBar[]): number[] {
  const target = holdTarget(bars.length);
  for (let index = 1; index < bars.length; index += 1) {
    carry(target, index);
    const current = bars[index];
    const previous = bars[index - 1];
    if (current.close > current.open && current.open > previous.close) {
      target[index] = 1;
    } else if (
      current.close < current.open &&
      current.open < previous.close
    ) {
      target[index] = 0;
    }
  }
  return target;
}

function bollingerBandsStrategy(
  bars: MarketBar[],
  parameters: StrategyParameters,
): number[] {
  const closes = bars.map((bar) => bar.close);
  const bands = bollingerBands(
    closes,
    period(parameters, "period", 20),
    value(parameters, "width", 2),
  );
  const target = holdTarget(bars.length);

  for (let index = 1; index < bars.length; index += 1) {
    carry(target, index);
    const lower = bands.lower[index];
    const previousLower = bands.lower[index - 1];
    const upper = bands.upper[index];
    const previousUpper = bands.upper[index - 1];
    if (
      lower !== null &&
      previousLower !== null &&
      closes[index] < lower &&
      closes[index - 1] >= previousLower
    ) {
      target[index] = 1;
    } else if (
      upper !== null &&
      previousUpper !== null &&
      closes[index] > upper &&
      closes[index - 1] <= previousUpper
    ) {
      target[index] = 0;
    }
  }
  return target;
}

function bollingerDirected(
  bars: MarketBar[],
  parameters: StrategyParameters,
): number[] {
  const closes = bars.map((bar) => bar.close);
  const bands = bollingerBands(
    closes,
    period(parameters, "period", 20),
    value(parameters, "width", 2),
  );
  const target = holdTarget(bars.length);

  for (let index = 1; index < bars.length; index += 1) {
    carry(target, index);
    const lower = bands.lower[index];
    const previousLower = bands.lower[index - 1];
    const upper = bands.upper[index];
    const previousUpper = bands.upper[index - 1];
    if (
      lower !== null &&
      previousLower !== null &&
      closes[index] > lower &&
      closes[index - 1] <= previousLower
    ) {
      target[index] = 1;
    } else if (
      upper !== null &&
      previousUpper !== null &&
      closes[index] < upper &&
      closes[index - 1] >= previousUpper
    ) {
      target[index] = 0;
    }
  }
  return target;
}

function channelBreakout(
  bars: MarketBar[],
  parameters: StrategyParameters,
): number[] {
  const length = period(parameters, "length", 5);
  const target = holdTarget(bars.length);

  for (let index = length; index < bars.length; index += 1) {
    carry(target, index);
    const previousWindow = bars.slice(index - length, index);
    const upper = Math.max(...previousWindow.map((bar) => bar.high));
    const lower = Math.min(...previousWindow.map((bar) => bar.low));
    if (bars[index].high > upper) target[index] = 1;
    if (bars[index].low < lower) target[index] = 0;
  }
  return target;
}

function consecutiveUpDown(
  bars: MarketBar[],
  parameters: StrategyParameters,
): number[] {
  const upBars = period(parameters, "upBars", 3);
  const downBars = period(parameters, "downBars", 3);
  const target = holdTarget(bars.length);
  let rising = 0;
  let falling = 0;

  for (let index = 1; index < bars.length; index += 1) {
    carry(target, index);
    rising =
      bars[index].close > bars[index - 1].close ? rising + 1 : 0;
    falling =
      bars[index].close < bars[index - 1].close ? falling + 1 : 0;
    if (rising >= upBars) target[index] = 1;
    if (falling >= downBars) target[index] = 0;
  }
  return target;
}

function greedy(bars: MarketBar[]): number[] {
  const target = holdTarget(bars.length);
  for (let index = 1; index < bars.length; index += 1) {
    carry(target, index);
    const current = bars[index];
    const previous = bars[index - 1];
    if (current.open > previous.high || current.close > current.open) {
      target[index] = 1;
    } else if (
      current.open < previous.low ||
      current.close < current.open
    ) {
      target[index] = 0;
    }
  }
  return target;
}

function insideBar(bars: MarketBar[]): number[] {
  const target = holdTarget(bars.length);
  for (let index = 1; index < bars.length; index += 1) {
    carry(target, index);
    const current = bars[index];
    const previous = bars[index - 1];
    if (current.high <= previous.high && current.low >= previous.low) {
      if (current.close > current.open) target[index] = 1;
      if (current.close < current.open) target[index] = 0;
    }
  }
  return target;
}

function keltnerChannels(
  bars: MarketBar[],
  parameters: StrategyParameters,
): number[] {
  const length = period(parameters, "period", 20);
  const closes = bars.map((bar) => bar.close);
  const basis = ema(closes, length);
  const volatility = atr(bars, length);
  const multiplier = value(parameters, "multiplier", 2);
  const target = holdTarget(bars.length);

  for (let index = 1; index < bars.length; index += 1) {
    carry(target, index);
    if (
      basis[index] === null ||
      basis[index - 1] === null ||
      volatility[index] === null ||
      volatility[index - 1] === null
    ) {
      continue;
    }
    const upper = basis[index]! + volatility[index]! * multiplier;
    const previousUpper =
      basis[index - 1]! + volatility[index - 1]! * multiplier;
    const lower = basis[index]! - volatility[index]! * multiplier;
    const previousLower =
      basis[index - 1]! - volatility[index - 1]! * multiplier;
    if (closes[index] > upper && closes[index - 1] <= previousUpper) {
      target[index] = 1;
    } else if (
      closes[index] < lower &&
      closes[index - 1] >= previousLower
    ) {
      target[index] = 0;
    }
  }
  return target;
}

function macdStrategy(
  bars: MarketBar[],
  parameters: StrategyParameters,
): number[] {
  const values = macd(
    bars.map((bar) => bar.close),
    period(parameters, "fast", 12),
    period(parameters, "slow", 26),
    period(parameters, "signal", 9),
  );
  const target = holdTarget(bars.length);
  for (let index = 1; index < bars.length; index += 1) {
    carry(target, index);
    const current = values.histogram[index];
    const previous = values.histogram[index - 1];
    if (current === null || previous === null) continue;
    if (current > 0 && previous <= 0) target[index] = 1;
    if (current < 0 && previous >= 0) target[index] = 0;
  }
  return target;
}

function momentum(
  bars: MarketBar[],
  parameters: StrategyParameters,
): number[] {
  const length = period(parameters, "period", 12);
  const target = holdTarget(bars.length);
  const momentumValues = bars.map((bar, index) =>
    index < length ? null : bar.close - bars[index - length].close,
  );

  for (let index = length + 1; index < bars.length; index += 1) {
    carry(target, index);
    const current = momentumValues[index]!;
    const previous = momentumValues[index - 1]!;
    if (current > 0 && current > previous) target[index] = 1;
    if (current < 0 && current < previous) target[index] = 0;
  }
  return target;
}

function outsideBar(bars: MarketBar[]): number[] {
  const target = holdTarget(bars.length);
  for (let index = 1; index < bars.length; index += 1) {
    carry(target, index);
    const current = bars[index];
    const previous = bars[index - 1];
    if (current.high > previous.high && current.low < previous.low) {
      if (current.close > current.open) target[index] = 1;
      if (current.close < current.open) target[index] = 0;
    }
  }
  return target;
}

function parabolicSarStrategy(
  bars: MarketBar[],
  parameters: StrategyParameters,
): number[] {
  const sar = parabolicSar(
    bars,
    value(parameters, "start", 0.02),
    value(parameters, "increment", 0.02),
    value(parameters, "maximum", 0.2),
  );
  const target = holdTarget(bars.length);

  for (let index = 2; index < bars.length; index += 1) {
    carry(target, index);
    if (sar[index] === null || sar[index - 1] === null) continue;
    if (
      bars[index].close > sar[index]! &&
      bars[index - 1].close <= sar[index - 1]!
    ) {
      target[index] = 1;
    } else if (
      bars[index].close < sar[index]! &&
      bars[index - 1].close >= sar[index - 1]!
    ) {
      target[index] = 0;
    }
  }
  return target;
}

function isPivotHigh(
  bars: MarketBar[],
  center: number,
  left: number,
  right: number,
) {
  const pivot = bars[center].high;
  return bars
    .slice(center - left, center + right + 1)
    .every((bar, index) => index === left || bar.high < pivot);
}

function isPivotLow(
  bars: MarketBar[],
  center: number,
  left: number,
  right: number,
) {
  const pivot = bars[center].low;
  return bars
    .slice(center - left, center + right + 1)
    .every((bar, index) => index === left || bar.low > pivot);
}

function pivotExtension(
  bars: MarketBar[],
  parameters: StrategyParameters,
): number[] {
  const left = period(parameters, "leftBars", 4);
  const right = period(parameters, "rightBars", 2);
  const target = holdTarget(bars.length);

  for (let index = left + right; index < bars.length; index += 1) {
    carry(target, index);
    const center = index - right;
    if (isPivotHigh(bars, center, left, right)) target[index] = 0;
    if (isPivotLow(bars, center, left, right)) target[index] = 1;
  }
  return target;
}

function pivotReversal(
  bars: MarketBar[],
  parameters: StrategyParameters,
): number[] {
  const left = period(parameters, "leftBars", 4);
  const right = period(parameters, "rightBars", 2);
  const target = holdTarget(bars.length);
  let pivotHigh: number | null = null;
  let pivotLow: number | null = null;

  for (let index = left + right; index < bars.length; index += 1) {
    carry(target, index);
    const center = index - right;
    if (isPivotHigh(bars, center, left, right)) {
      pivotHigh = bars[center].high;
    }
    if (isPivotLow(bars, center, left, right)) {
      pivotLow = bars[center].low;
    }
    if (
      pivotHigh !== null &&
      bars[index].high > pivotHigh &&
      bars[index - 1].high <= pivotHigh
    ) {
      target[index] = 1;
      pivotHigh = null;
    } else if (
      pivotLow !== null &&
      bars[index].low < pivotLow &&
      bars[index - 1].low >= pivotLow
    ) {
      target[index] = 0;
      pivotLow = null;
    }
  }
  return target;
}

function priceChannel(
  bars: MarketBar[],
  parameters: StrategyParameters,
): number[] {
  const length = period(parameters, "length", 20);
  const target = holdTarget(bars.length);
  for (let index = length; index < bars.length; index += 1) {
    carry(target, index);
    const previousWindow = bars.slice(index - length, index);
    const upper = Math.max(...previousWindow.map((bar) => bar.high));
    const lower = Math.min(...previousWindow.map((bar) => bar.low));
    if (bars[index].high >= upper) target[index] = 1;
    if (bars[index].low <= lower) target[index] = 0;
  }
  return target;
}

function rsiStrategy(
  bars: MarketBar[],
  parameters: StrategyParameters,
): number[] {
  const strength = rsi(
    bars.map((bar) => bar.close),
    period(parameters, "period", 14),
  );
  const oversold = value(parameters, "oversold", 30);
  const overbought = value(parameters, "overbought", 70);
  const target = holdTarget(bars.length);

  for (let index = 1; index < bars.length; index += 1) {
    carry(target, index);
    if (strength[index] === null || strength[index - 1] === null) continue;
    if (strength[index]! > oversold && strength[index - 1]! <= oversold) {
      target[index] = 1;
    } else if (
      strength[index]! < overbought &&
      strength[index - 1]! >= overbought
    ) {
      target[index] = 0;
    }
  }
  return target;
}

function stochasticSlowStrategy(
  bars: MarketBar[],
  parameters: StrategyParameters,
): number[] {
  const oscillator = stochasticSlow(
    bars,
    period(parameters, "period", 14),
    period(parameters, "smoothK", 3),
    period(parameters, "smoothD", 3),
  );
  const target = holdTarget(bars.length);

  for (let index = 1; index < bars.length; index += 1) {
    carry(target, index);
    const currentK = oscillator.k[index];
    const currentD = oscillator.d[index];
    const previousK = oscillator.k[index - 1];
    const previousD = oscillator.d[index - 1];
    if (
      currentK === null ||
      currentD === null ||
      previousK === null ||
      previousD === null
    ) {
      continue;
    }
    if (currentK > currentD && previousK <= previousD) target[index] = 1;
    if (currentK < currentD && previousK >= previousD) target[index] = 0;
  }
  return target;
}

function supertrendStrategy(
  bars: MarketBar[],
  parameters: StrategyParameters,
): number[] {
  const result = supertrend(
    bars,
    period(parameters, "period", 10),
    value(parameters, "multiplier", 3),
  );
  return result.direction.map((direction) => (direction > 0 ? 1 : 0));
}

function technicalRatings(
  bars: MarketBar[],
  parameters: StrategyParameters,
): number[] {
  const closes = bars.map((bar) => bar.close);
  const shortAverage = ema(closes, 20);
  const longAverage = sma(closes, 50);
  const strength = rsi(closes, 14);
  const convergence = macd(closes);
  const directional = adx(bars, 14);
  const stochastic = stochasticSlow(bars);
  const threshold = Math.max(value(parameters, "threshold", 4), 1);
  const target = holdTarget(bars.length);

  for (let index = 1; index < bars.length; index += 1) {
    carry(target, index);
    const votes = [
      strength[index] === null
        ? 0
        : strength[index]! > 55
          ? 1
          : strength[index]! < 45
            ? -1
            : 0,
      convergence.histogram[index] === null
        ? 0
        : Math.sign(convergence.histogram[index]!),
      shortAverage[index] === null
        ? 0
        : Math.sign(closes[index] - shortAverage[index]!),
      longAverage[index] === null
        ? 0
        : Math.sign(closes[index] - longAverage[index]!),
      directional.plusDi[index] === null ||
      directional.minusDi[index] === null
        ? 0
        : Math.sign(
            directional.plusDi[index]! - directional.minusDi[index]!,
          ),
      stochastic.k[index] === null || stochastic.d[index] === null
        ? 0
        : Math.sign(stochastic.k[index]! - stochastic.d[index]!),
    ];
    const rating = votes.reduce((sum, vote) => sum + vote, 0);
    if (rating >= threshold) target[index] = 1;
    if (rating <= -threshold) target[index] = 0;
  }
  return target;
}

function voltyExpanClose(
  bars: MarketBar[],
  parameters: StrategyParameters,
): number[] {
  const length = period(parameters, "period", 5);
  const multiplier = value(parameters, "multiplier", 1.5);
  const volatility = atr(bars, length);
  const target = holdTarget(bars.length);

  for (let index = 1; index < bars.length; index += 1) {
    carry(target, index);
    if (volatility[index - 1] === null) continue;
    const upper =
      bars[index - 1].close + volatility[index - 1]! * multiplier;
    const lower =
      bars[index - 1].close - volatility[index - 1]! * multiplier;
    if (bars[index].close > upper) target[index] = 1;
    if (bars[index].close < lower) target[index] = 0;
  }
  return target;
}

const TRADINGVIEW_REFERENCE_STRATEGIES: BuiltInStrategyDefinition[] = [
  {
    id: "tv-bar-up-down",
    indicatorId: "sma",
    defaultParameters: {},
    buildTarget: barUpDown,
  },
  {
    id: "tv-bollinger-bands",
    indicatorId: "bollinger",
    defaultParameters: { period: 20, width: 2 },
    buildTarget: bollingerBandsStrategy,
  },
  {
    id: "tv-bollinger-directed",
    indicatorId: "bollinger",
    defaultParameters: { period: 20, width: 2 },
    buildTarget: bollingerDirected,
  },
  {
    id: "tv-channel-breakout",
    indicatorId: "atr",
    defaultParameters: { length: 5 },
    buildTarget: channelBreakout,
  },
  {
    id: "tv-consecutive-up-down",
    indicatorId: "sma",
    defaultParameters: { upBars: 3, downBars: 3 },
    buildTarget: consecutiveUpDown,
  },
  {
    id: "tv-greedy",
    indicatorId: "atr",
    defaultParameters: {},
    buildTarget: greedy,
  },
  {
    id: "tv-inside-bar",
    indicatorId: "atr",
    defaultParameters: {},
    buildTarget: insideBar,
  },
  {
    id: "tv-keltner-channels",
    indicatorId: "atr",
    defaultParameters: { period: 20, multiplier: 2 },
    buildTarget: keltnerChannels,
  },
  {
    id: "tv-macd",
    indicatorId: "macd",
    defaultParameters: { fast: 12, slow: 26, signal: 9 },
    buildTarget: macdStrategy,
  },
  {
    id: "tv-momentum",
    indicatorId: "roc",
    defaultParameters: { period: 12 },
    buildTarget: momentum,
  },
  {
    id: "tv-outside-bar",
    indicatorId: "atr",
    defaultParameters: {},
    buildTarget: outsideBar,
  },
  {
    id: "tv-parabolic-sar",
    indicatorId: "supertrend",
    defaultParameters: { start: 0.02, increment: 0.02, maximum: 0.2 },
    buildTarget: parabolicSarStrategy,
  },
  {
    id: "tv-pivot-extension",
    indicatorId: "atr",
    defaultParameters: { leftBars: 4, rightBars: 2 },
    buildTarget: pivotExtension,
  },
  {
    id: "tv-pivot-reversal",
    indicatorId: "atr",
    defaultParameters: { leftBars: 4, rightBars: 2 },
    buildTarget: pivotReversal,
  },
  {
    id: "tv-price-channel",
    indicatorId: "atr",
    defaultParameters: { length: 20 },
    buildTarget: priceChannel,
  },
  {
    id: "tv-rsi",
    indicatorId: "rsi",
    defaultParameters: { period: 14, oversold: 30, overbought: 70 },
    buildTarget: rsiStrategy,
  },
  {
    id: "tv-stochastic-slow",
    indicatorId: "kdj",
    defaultParameters: { period: 14, smoothK: 3, smoothD: 3 },
    buildTarget: stochasticSlowStrategy,
  },
  {
    id: "tv-supertrend",
    indicatorId: "supertrend",
    defaultParameters: { period: 10, multiplier: 3 },
    buildTarget: supertrendStrategy,
  },
  {
    id: "tv-technical-ratings",
    indicatorId: "adx",
    defaultParameters: { threshold: 4 },
    buildTarget: technicalRatings,
  },
  {
    id: "tv-volty-expan-close",
    indicatorId: "atr",
    defaultParameters: { period: 5, multiplier: 1.5 },
    buildTarget: voltyExpanClose,
  },
];

export const TRADINGVIEW_BUILT_IN_STRATEGIES =
  TRADINGVIEW_REFERENCE_STRATEGIES.map(asLongOnlyStrategy);
