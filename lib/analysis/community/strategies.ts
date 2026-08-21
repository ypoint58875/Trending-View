import type { MarketBar } from "@/lib/market/types";
import type { IndicatorId } from "../indicator-registry";
import {
  atr,
  bollingerBands,
  ema,
  rollingHighLow,
  rsi,
  sma,
  supertrend,
  wma,
  mfi,
} from "../indicators";
import {
  fractionalEmaKalman,
  halfTrend,
  nadarayaWatsonTrend,
  qqeMod,
  schaffTrendCycle,
  squeezeMomentum,
  trendlineBreaks,
  utBotTrail,
  waveTrend,
} from "./indicators";

export const COMMUNITY_STRATEGY_IDS = [
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
  "community-half-trend",
  "community-qqe-mod",
  "community-schaff-trend-cycle",
] as const;

export type CommunityStrategyId = (typeof COMMUNITY_STRATEGY_IDS)[number];
type StrategyParameters = Record<string, number>;

export interface CommunityStrategyDefinition {
  id: CommunityStrategyId;
  horizon: "long" | "short";
  indicatorId: string;
  paneIndicatorId?: IndicatorId;
  defaultParameters: StrategyParameters;
  buildTarget: (bars: MarketBar[], parameters: StrategyParameters) => number[];
}

function crossedAbove(
  current: number | null,
  previous: number | null,
  currentReference: number | null,
  previousReference: number | null,
) {
  return current !== null && previous !== null && currentReference !== null && previousReference !== null && current > currentReference && previous <= previousReference;
}

function crossedBelow(
  current: number | null,
  previous: number | null,
  currentReference: number | null,
  previousReference: number | null,
) {
  return current !== null && previous !== null && currentReference !== null && previousReference !== null && current < currentReference && previous >= previousReference;
}

function bollingerRsiTarget(bars: MarketBar[], parameters: StrategyParameters) {
  const closes = bars.map((bar) => bar.close);
  const oscillator = rsi(closes, parameters.rsiPeriod);
  const bands = bollingerBands(closes, parameters.bbPeriod, parameters.bbWidth);
  const target = new Array(bars.length).fill(0);
  let invested = false;
  for (let index = 1; index < bars.length; index += 1) {
    const buy = crossedAbove(oscillator[index], oscillator[index - 1], 50, 50) && crossedAbove(closes[index], closes[index - 1], bands.lower[index], bands.lower[index - 1]);
    const sell = crossedBelow(oscillator[index], oscillator[index - 1], 50, 50) && crossedBelow(closes[index], closes[index - 1], bands.upper[index], bands.upper[index - 1]);
    if (!invested && buy) invested = true;
    else if (invested && sell) invested = false;
    target[index] = invested ? 1 : 0;
  }
  return target;
}

function squeezeMomentumTarget(bars: MarketBar[], parameters: StrategyParameters) {
  const values = squeezeMomentum(
    bars,
    parameters.bbPeriod,
    parameters.bbWidth,
    parameters.kcPeriod,
    parameters.kcWidth,
  );
  const closes = bars.map((bar) => bar.close);
  const trend = ema(closes, parameters.trendPeriod);
  const target = new Array(bars.length).fill(0);
  let invested = false;
  for (let index = 1; index < bars.length; index += 1) {
    const currentMomentum = values.momentum[index];
    const previousMomentum = values.momentum[index - 1];
    const previousWindow = values.momentum
      .slice(Math.max(0, index - 100), index)
      .filter((value): value is number => value !== null);
    const release = values.squeezeOff[index] && values.squeezeOn[index - 1];
    const entry = release && currentMomentum !== null && previousMomentum !== null && currentMomentum > previousMomentum && currentMomentum > Math.min(...previousWindow, currentMomentum) && closes[index] > closes[index - 1] && trend[index] !== null && closes[index] > trend[index]!;
    const exit = currentMomentum !== null && previousMomentum !== null && currentMomentum < previousMomentum;
    if (!invested && entry) invested = true;
    else if (invested && exit) invested = false;
    target[index] = invested ? 1 : 0;
  }
  return target;
}

function utBotTarget(bars: MarketBar[], parameters: StrategyParameters) {
  const closes = bars.map((bar) => bar.close);
  const trail = utBotTrail(bars, parameters.keyValue, parameters.atrPeriod);
  const trend = ema(closes, parameters.trendPeriod);
  const target = new Array(bars.length).fill(0);
  let invested = false;
  for (let index = 1; index < bars.length; index += 1) {
    const buy = crossedAbove(closes[index], closes[index - 1], trail[index], trail[index - 1]) && trend[index] !== null && closes[index] > trend[index]!;
    const sell = crossedBelow(closes[index], closes[index - 1], trail[index], trail[index - 1]);
    if (!invested && buy) invested = true;
    else if (invested && sell) invested = false;
    target[index] = invested ? 1 : 0;
  }
  return target;
}

function normalizedPeriod(value: number, fallback: number): number {
  return Math.max(1, Math.round(Number.isFinite(value) ? value : fallback));
}

function hullSuiteTarget(bars: MarketBar[], parameters: StrategyParameters) {
  const closes = bars.map((bar) => bar.close);
  const period = normalizedPeriod(parameters.period, 55);
  const half = wma(closes, Math.max(1, Math.floor(period / 2)));
  const full = wma(closes, period);
  const raw = closes.map((_, index) =>
    half[index] === null || full[index] === null
      ? 0
      : 2 * half[index]! - full[index]!,
  );
  const hull = wma(raw, Math.max(1, Math.round(Math.sqrt(period))));
  const target = new Array(bars.length).fill(0);
  let invested = false;
  for (let index = period + 2; index < bars.length; index += 1) {
    if (hull[index] === null || hull[index - 2] === null) continue;
    if (!invested && hull[index]! > hull[index - 2]!) invested = true;
    else if (invested && hull[index]! < hull[index - 2]!) invested = false;
    target[index] = invested ? 1 : 0;
  }
  return target;
}

function chandelierExitTarget(bars: MarketBar[], parameters: StrategyParameters) {
  const period = normalizedPeriod(parameters.period, 22);
  const extremes = rollingHighLow(bars, period);
  const ranges = atr(bars, period);
  const target = new Array(bars.length).fill(0);
  let invested = false;
  for (let index = period + 1; index < bars.length; index += 1) {
    const averageRange = ranges[index - 1];
    const highest = extremes.highest[index - 1];
    const lowest = extremes.lowest[index - 1];
    if (averageRange === null || highest === null || lowest === null) continue;
    const longStop = highest - averageRange * parameters.multiplier;
    const shortStop = lowest + averageRange * parameters.multiplier;
    if (!invested && bars[index].close > shortStop) invested = true;
    else if (invested && bars[index].close < longStop) invested = false;
    target[index] = invested ? 1 : 0;
  }
  return target;
}

function sslChannelTarget(bars: MarketBar[], parameters: StrategyParameters) {
  const period = normalizedPeriod(parameters.period, 10);
  const highAverage = sma(bars.map((bar) => bar.high), period);
  const lowAverage = sma(bars.map((bar) => bar.low), period);
  const target = new Array(bars.length).fill(0);
  let invested = false;
  for (let index = period; index < bars.length; index += 1) {
    if (highAverage[index] === null || lowAverage[index] === null) continue;
    if (bars[index].close > highAverage[index]!) invested = true;
    else if (bars[index].close < lowAverage[index]!) invested = false;
    target[index] = invested ? 1 : 0;
  }
  return target;
}

function rangeFilterTarget(bars: MarketBar[], parameters: StrategyParameters) {
  const closes = bars.map((bar) => bar.close);
  const period = normalizedPeriod(parameters.period, 20);
  const movement = closes.map((close, index) =>
    index === 0 ? 0 : Math.abs(close - closes[index - 1]),
  );
  const firstSmooth = ema(movement, period);
  const smoothRange = ema(firstSmooth.map((value) => value ?? 0), period * 2 - 1);
  const filter = new Array(bars.length).fill(closes[0] ?? 0);
  const target = new Array(bars.length).fill(0);
  let invested = false;
  for (let index = 1; index < bars.length; index += 1) {
    const range = (smoothRange[index] ?? 0) * parameters.multiplier;
    const previous = filter[index - 1];
    filter[index] = closes[index] > previous
      ? Math.max(previous, closes[index] - range)
      : Math.min(previous, closes[index] + range);
    if (!invested && closes[index] > filter[index] && filter[index] > previous) {
      invested = true;
    } else if (invested && (closes[index] < filter[index] || filter[index] < previous)) {
      invested = false;
    }
    target[index] = invested ? 1 : 0;
  }
  return target;
}

function kamaTrendTarget(bars: MarketBar[], parameters: StrategyParameters) {
  const closes = bars.map((bar) => bar.close);
  const period = normalizedPeriod(parameters.period, 10);
  const fast = 2 / (normalizedPeriod(parameters.fastPeriod, 2) + 1);
  const slow = 2 / (normalizedPeriod(parameters.slowPeriod, 30) + 1);
  const values = new Array<number | null>(bars.length).fill(null);
  const target = new Array(bars.length).fill(0);
  let current = closes[0] ?? 0;
  let invested = false;
  for (let index = period; index < bars.length; index += 1) {
    const change = Math.abs(closes[index] - closes[index - period]);
    let volatility = 0;
    for (let offset = index - period + 1; offset <= index; offset += 1) {
      volatility += Math.abs(closes[offset] - closes[offset - 1]);
    }
    const efficiency = volatility === 0 ? 0 : change / volatility;
    const smoothing = (efficiency * (fast - slow) + slow) ** 2;
    current += smoothing * (closes[index] - current);
    values[index] = current;
    const previous = values[index - 1];
    if (previous !== null && !invested && closes[index] > current && current > previous) {
      invested = true;
    } else if (previous !== null && invested && (closes[index] < current || current < previous)) {
      invested = false;
    }
    target[index] = invested ? 1 : 0;
  }
  return target;
}

function dualSupertrendTarget(bars: MarketBar[], parameters: StrategyParameters) {
  const fast = supertrend(
    bars,
    normalizedPeriod(parameters.fastPeriod, 10),
    parameters.fastMultiplier,
  );
  const slow = supertrend(
    bars,
    normalizedPeriod(parameters.slowPeriod, 20),
    parameters.slowMultiplier,
  );
  return bars.map((_, index) =>
    fast.direction[index] > 0 && slow.direction[index] > 0 ? 1 : 0,
  );
}

function smoothedAverage(values: number[], periodValue: number): number[] {
  const period = normalizedPeriod(periodValue, 5);
  const output = new Array(values.length).fill(0);
  let current = values[0] ?? 0;
  for (let index = 0; index < values.length; index += 1) {
    current = index === 0
      ? values[index]
      : (current * (period - 1) + values[index]) / period;
    output[index] = current;
  }
  return output;
}

function alligatorFractalTarget(bars: MarketBar[], parameters: StrategyParameters) {
  const median = bars.map((bar) => (bar.high + bar.low) / 2);
  const jaw = smoothedAverage(median, parameters.jawPeriod);
  const teeth = smoothedAverage(median, parameters.teethPeriod);
  const lips = smoothedAverage(median, parameters.lipsPeriod);
  const fractalPeriod = normalizedPeriod(parameters.fractalPeriod, 2);
  const target = new Array(bars.length).fill(0);
  let resistance: number | null = null;
  let invested = false;
  for (let index = fractalPeriod * 2; index < bars.length; index += 1) {
    const pivotIndex = index - fractalPeriod;
    const window = bars.slice(
      pivotIndex - fractalPeriod,
      pivotIndex + fractalPeriod + 1,
    );
    if (window.every((bar) => bar.high <= bars[pivotIndex].high)) {
      resistance = bars[pivotIndex].high;
    }
    const aligned = lips[index] > teeth[index] && teeth[index] > jaw[index];
    if (!invested && aligned && resistance !== null && bars[index].close > resistance) {
      invested = true;
    } else if (invested && !aligned) {
      invested = false;
    }
    target[index] = invested ? 1 : 0;
  }
  return target;
}

function waveTrendTarget(bars: MarketBar[], parameters: StrategyParameters) {
  const values = waveTrend(bars, parameters.channelPeriod, parameters.averagePeriod);
  const target = new Array(bars.length).fill(0);
  let invested = false;
  for (let index = 1; index < bars.length; index += 1) {
    const current = values.wt1[index];
    const signal = values.wt2[index];
    const previous = values.wt1[index - 1];
    const previousSignal = values.wt2[index - 1];
    if (
      !invested &&
      crossedAbove(current, previous, signal, previousSignal) &&
      current! <= parameters.entry
    ) {
      invested = true;
    } else if (
      invested &&
      (crossedBelow(current, previous, signal, previousSignal) ||
        (current !== null && current >= parameters.exit))
    ) {
      invested = false;
    }
    target[index] = invested ? 1 : 0;
  }
  return target;
}

function trendlineBreakTarget(bars: MarketBar[], parameters: StrategyParameters) {
  const values = trendlineBreaks(
    bars,
    parameters.swingPeriod,
    parameters.slopeMultiplier,
  );
  const target = new Array(bars.length).fill(0);
  let invested = false;
  for (let index = 0; index < bars.length; index += 1) {
    if (!invested && values.bullishBreaks[index] !== null) invested = true;
    else if (invested && values.bearishBreaks[index] !== null) invested = false;
    target[index] = invested ? 1 : 0;
  }
  return target;
}

function nadarayaWatsonTarget(bars: MarketBar[], parameters: StrategyParameters) {
  const closes = bars.map((bar) => bar.close);
  const values = nadarayaWatsonTrend(
    closes,
    parameters.lookback,
    parameters.bandwidth,
    parameters.bandwidthMultiplier,
    parameters.bandMultiplier,
  );
  const target = new Array(bars.length).fill(0);
  let invested = false;
  for (let index = 1; index < bars.length; index += 1) {
    const trend = values.trend[index];
    const previousTrend = values.trend[index - 1];
    if (trend === null || previousTrend === null) continue;
    if (!invested && closes[index] > trend && trend > previousTrend) invested = true;
    else if (invested && (closes[index] < trend || trend < previousTrend)) invested = false;
    target[index] = invested ? 1 : 0;
  }
  return target;
}

function kalmanVelocityTarget(bars: MarketBar[], parameters: StrategyParameters) {
  const values = fractionalEmaKalman(
    bars,
    parameters.factor,
    parameters.secondFactor,
    parameters.rPeriod,
    parameters.baseQ,
    parameters.fastQ,
    parameters.gateMultiplier,
  );
  return values.fast.map((value, index) =>
    value !== null && values.baseline[index] !== null &&
    value > values.baseline[index]!
      ? 1
      : 0,
  );
}

function mcGinleyTarget(bars: MarketBar[], parameters: StrategyParameters) {
  const period = normalizedPeriod(parameters.period, 14);
  const values = new Array(bars.length).fill(0);
  const target = new Array(bars.length).fill(0);
  let current = bars[0]?.close ?? 0;
  let invested = false;
  for (let index = 0; index < bars.length; index += 1) {
    const close = bars[index].close;
    const ratio = current === 0 ? 1 : close / current;
    current += (close - current) / Math.max(period * ratio ** 4, 1e-9);
    values[index] = current;
    if (index > 0 && !invested && close > current && current > values[index - 1]) {
      invested = true;
    } else if (index > 0 && invested && (close < current || current < values[index - 1])) {
      invested = false;
    }
    target[index] = invested ? 1 : 0;
  }
  return target;
}

function vortexTarget(bars: MarketBar[], parameters: StrategyParameters) {
  const period = normalizedPeriod(parameters.period, 14);
  const positive = new Array(bars.length).fill(0);
  const negative = new Array(bars.length).fill(0);
  const trueRange = new Array(bars.length).fill(0);
  const target = new Array(bars.length).fill(0);
  let invested = false;
  for (let index = 1; index < bars.length; index += 1) {
    positive[index] = Math.abs(bars[index].high - bars[index - 1].low);
    negative[index] = Math.abs(bars[index].low - bars[index - 1].high);
    trueRange[index] = Math.max(
      bars[index].high - bars[index].low,
      Math.abs(bars[index].high - bars[index - 1].close),
      Math.abs(bars[index].low - bars[index - 1].close),
    );
    if (index < period) continue;
    let positiveSum = 0;
    let negativeSum = 0;
    let rangeSum = 0;
    for (let offset = index - period + 1; offset <= index; offset += 1) {
      positiveSum += positive[offset];
      negativeSum += negative[offset];
      rangeSum += trueRange[offset];
    }
    if (rangeSum > 0) {
      if (!invested && positiveSum > negativeSum) invested = true;
      else if (invested && positiveSum < negativeSum) invested = false;
    }
    target[index] = invested ? 1 : 0;
  }
  return target;
}

function volumeWeightedAverage(
  bars: MarketBar[],
  periodValue: number,
): Array<number | null> {
  const period = normalizedPeriod(periodValue, 12);
  const output = new Array<number | null>(bars.length).fill(null);
  for (let index = period - 1; index < bars.length; index += 1) {
    let weighted = 0;
    let volume = 0;
    for (let offset = index - period + 1; offset <= index; offset += 1) {
      weighted += bars[offset].close * bars[offset].volume;
      volume += bars[offset].volume;
    }
    output[index] = volume === 0 ? null : weighted / volume;
  }
  return output;
}

function volumeWeightedMacdTarget(bars: MarketBar[], parameters: StrategyParameters) {
  const fast = volumeWeightedAverage(bars, parameters.fast);
  const slow = volumeWeightedAverage(bars, parameters.slow);
  const line = fast.map((value, index) =>
    value === null || slow[index] === null ? null : value - slow[index]!,
  );
  const signal = ema(line.map((value) => value ?? 0), parameters.signal);
  const target = new Array(bars.length).fill(0);
  let invested = false;
  for (let index = 1; index < bars.length; index += 1) {
    if (line[index] === null || signal[index] === null) continue;
    if (!invested && line[index]! > signal[index]!) invested = true;
    else if (invested && line[index]! < signal[index]!) invested = false;
    target[index] = invested ? 1 : 0;
  }
  return target;
}

function elderRayTarget(bars: MarketBar[], parameters: StrategyParameters) {
  const basis = ema(bars.map((bar) => bar.close), parameters.period);
  const target = new Array(bars.length).fill(0);
  let invested = false;
  for (let index = 1; index < bars.length; index += 1) {
    if (basis[index] === null || basis[index - 1] === null) continue;
    const bull = bars[index].high - basis[index]!;
    const bear = bars[index].low - basis[index]!;
    const previousBear = bars[index - 1].low - basis[index - 1]!;
    if (!invested && bull > 0 && bear < 0 && bear > previousBear) invested = true;
    else if (invested && bull < 0) invested = false;
    target[index] = invested ? 1 : 0;
  }
  return target;
}

function tmaBandsTarget(bars: MarketBar[], parameters: StrategyParameters) {
  const closes = bars.map((bar) => bar.close);
  const period = normalizedPeriod(parameters.period, 20);
  const first = sma(closes, Math.ceil((period + 1) / 2));
  const middle = sma(first.map((value) => value ?? 0), Math.floor((period + 1) / 2));
  const ranges = atr(bars, period);
  const target = new Array(bars.length).fill(0);
  let invested = false;
  for (let index = period; index < bars.length; index += 1) {
    if (middle[index] === null || ranges[index] === null) continue;
    const lower = middle[index]! - ranges[index]! * parameters.multiplier;
    if (!invested && closes[index] < lower) invested = true;
    else if (invested && closes[index] >= middle[index]!) invested = false;
    target[index] = invested ? 1 : 0;
  }
  return target;
}

function mfiRsiTarget(bars: MarketBar[], parameters: StrategyParameters) {
  const moneyFlow = mfi(bars, parameters.period);
  const momentum = rsi(bars.map((bar) => bar.close), parameters.period);
  const target = new Array(bars.length).fill(0);
  let invested = false;
  for (let index = 0; index < bars.length; index += 1) {
    if (moneyFlow[index] === null || momentum[index] === null) continue;
    if (!invested && moneyFlow[index]! <= parameters.entry && momentum[index]! <= parameters.entry) {
      invested = true;
    } else if (invested && (moneyFlow[index]! >= parameters.exit || momentum[index]! >= parameters.exit)) {
      invested = false;
    }
    target[index] = invested ? 1 : 0;
  }
  return target;
}

function halfTrendTarget(bars: MarketBar[], parameters: StrategyParameters) {
  const values = halfTrend(bars, parameters.amplitude, parameters.channelDeviation);
  return values.trend.map((trend) => trend === 0 ? 1 : 0);
}

function qqeModTarget(bars: MarketBar[], parameters: StrategyParameters) {
  const values = qqeMod(
    bars,
    parameters.rsiPeriod,
    parameters.smoothingPeriod,
    parameters.primaryMultiplier,
    parameters.secondaryMultiplier,
    parameters.bollingerPeriod,
    parameters.bollingerMultiplier,
  );
  const target = new Array(bars.length).fill(0);
  let invested = false;
  for (let index = 0; index < bars.length; index += 1) {
    if (!invested && values.bullish[index]) invested = true;
    else if (invested && values.bearish[index]) invested = false;
    target[index] = invested ? 1 : 0;
  }
  return target;
}

function schaffTrendCycleTarget(bars: MarketBar[], parameters: StrategyParameters) {
  const values = schaffTrendCycle(
    bars,
    parameters.cyclePeriod,
    parameters.fastPeriod,
    parameters.slowPeriod,
    parameters.smoothingFactor,
  ).value;
  const target = new Array(bars.length).fill(0);
  let invested = false;
  for (let index = 1; index < bars.length; index += 1) {
    if (values[index] === null || values[index - 1] === null) continue;
    const risingFromOversold = values[index]! > values[index - 1]! && values[index - 1]! <= parameters.entry;
    const fallingFromOverbought = values[index]! < values[index - 1]! && values[index - 1]! >= parameters.exit;
    if (!invested && risingFromOversold) invested = true;
    else if (invested && fallingFromOverbought) invested = false;
    target[index] = invested ? 1 : 0;
  }
  return target;
}

export const COMMUNITY_STRATEGIES: readonly CommunityStrategyDefinition[] = [
  {
    id: "community-bollinger-rsi",
    horizon: "short",
    indicatorId: "bollinger",
    paneIndicatorId: "rsi",
    defaultParameters: { rsiPeriod: 6, bbPeriod: 200, bbWidth: 2 },
    buildTarget: bollingerRsiTarget,
  },
  {
    id: "community-squeeze-momentum",
    horizon: "long",
    indicatorId: "squeezeMomentum",
    paneIndicatorId: "squeezeMomentum",
    defaultParameters: { bbPeriod: 20, bbWidth: 2, kcPeriod: 20, kcWidth: 1.5, trendPeriod: 100 },
    buildTarget: squeezeMomentumTarget,
  },
  {
    id: "community-ut-bot",
    horizon: "long",
    indicatorId: "autoAtrTrendTracker",
    defaultParameters: { keyValue: 3, atrPeriod: 1, trendPeriod: 200 },
    buildTarget: utBotTarget,
  },
  {
    id: "community-hull-suite",
    horizon: "long",
    indicatorId: "hull-suite",
    defaultParameters: { period: 55 },
    buildTarget: hullSuiteTarget,
  },
  {
    id: "community-chandelier-exit",
    horizon: "long",
    indicatorId: "chandelier-exit",
    defaultParameters: { period: 22, multiplier: 3 },
    buildTarget: chandelierExitTarget,
  },
  {
    id: "community-ssl-channel",
    horizon: "long",
    indicatorId: "ssl-channel",
    defaultParameters: { period: 10 },
    buildTarget: sslChannelTarget,
  },
  {
    id: "community-range-filter",
    horizon: "long",
    indicatorId: "range-filter",
    defaultParameters: { period: 20, multiplier: 3 },
    buildTarget: rangeFilterTarget,
  },
  {
    id: "community-kama-trend",
    horizon: "long",
    indicatorId: "kama",
    defaultParameters: { period: 10, fastPeriod: 2, slowPeriod: 30 },
    buildTarget: kamaTrendTarget,
  },
  {
    id: "community-dual-supertrend",
    horizon: "long",
    indicatorId: "dual-supertrend",
    defaultParameters: {
      fastPeriod: 10,
      fastMultiplier: 2,
      slowPeriod: 20,
      slowMultiplier: 3,
    },
    buildTarget: dualSupertrendTarget,
  },
  {
    id: "community-alligator-fractal",
    horizon: "long",
    indicatorId: "alligator-fractal",
    defaultParameters: {
      jawPeriod: 13,
      teethPeriod: 8,
      lipsPeriod: 5,
      fractalPeriod: 2,
    },
    buildTarget: alligatorFractalTarget,
  },
  {
    id: "community-wave-trend",
    horizon: "short",
    indicatorId: "waveTrend",
    paneIndicatorId: "waveTrend",
    defaultParameters: { channelPeriod: 10, averagePeriod: 21, entry: -50, exit: 50 },
    buildTarget: waveTrendTarget,
  },
  {
    id: "community-trendline-break",
    horizon: "long",
    indicatorId: "trendlineBreaks",
    defaultParameters: { swingPeriod: 14, slopeMultiplier: 1 },
    buildTarget: trendlineBreakTarget,
  },
  {
    id: "community-nadaraya-watson",
    horizon: "long",
    indicatorId: "nadarayaWatsonTrend",
    defaultParameters: {
      lookback: 50,
      bandwidth: 8,
      bandwidthMultiplier: 2,
      bandMultiplier: 1.5,
    },
    buildTarget: nadarayaWatsonTarget,
  },
  {
    id: "community-kalman-velocity",
    horizon: "long",
    indicatorId: "fractionalEmaKalman",
    defaultParameters: {
      factor: 0.5,
      secondFactor: 0.5,
      rPeriod: 50,
      baseQ: 0.002,
      fastQ: 0.005,
      gateMultiplier: 1,
    },
    buildTarget: kalmanVelocityTarget,
  },
  {
    id: "community-mcginley-dynamic",
    horizon: "long",
    indicatorId: "mcginley",
    defaultParameters: { period: 14 },
    buildTarget: mcGinleyTarget,
  },
  {
    id: "community-vortex",
    horizon: "long",
    indicatorId: "vortex",
    defaultParameters: { period: 14 },
    buildTarget: vortexTarget,
  },
  {
    id: "community-volume-weighted-macd",
    horizon: "long",
    indicatorId: "volume-weighted-macd",
    defaultParameters: { fast: 12, slow: 26, signal: 9 },
    buildTarget: volumeWeightedMacdTarget,
  },
  {
    id: "community-elder-ray",
    horizon: "short",
    indicatorId: "elder-ray",
    defaultParameters: { period: 13 },
    buildTarget: elderRayTarget,
  },
  {
    id: "community-tma-bands",
    horizon: "short",
    indicatorId: "tma-bands",
    defaultParameters: { period: 20, multiplier: 2 },
    buildTarget: tmaBandsTarget,
  },
  {
    id: "community-mfi-rsi",
    horizon: "short",
    indicatorId: "mfi-rsi",
    paneIndicatorId: "mfi",
    defaultParameters: { period: 14, entry: 25, exit: 65 },
    buildTarget: mfiRsiTarget,
  },
  {
    id: "community-half-trend",
    horizon: "long",
    indicatorId: "halfTrend",
    defaultParameters: { amplitude: 2, channelDeviation: 2 },
    buildTarget: halfTrendTarget,
  },
  {
    id: "community-qqe-mod",
    horizon: "short",
    indicatorId: "qqeMod",
    paneIndicatorId: "qqeMod",
    defaultParameters: {
      rsiPeriod: 6,
      smoothingPeriod: 5,
      primaryMultiplier: 3,
      secondaryMultiplier: 1.61,
      bollingerPeriod: 50,
      bollingerMultiplier: 0.35,
    },
    buildTarget: qqeModTarget,
  },
  {
    id: "community-schaff-trend-cycle",
    horizon: "short",
    indicatorId: "schaffTrendCycle",
    paneIndicatorId: "schaffTrendCycle",
    defaultParameters: {
      cyclePeriod: 10,
      fastPeriod: 23,
      slowPeriod: 50,
      smoothingFactor: 0.5,
      entry: 25,
      exit: 75,
    },
    buildTarget: schaffTrendCycleTarget,
  },
];
