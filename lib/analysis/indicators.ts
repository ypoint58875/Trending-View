import type { MarketBar } from "@/lib/market/types";

export type NumericSeries = Array<number | null>;

export interface RollingHighLow {
  highest: NumericSeries;
  lowest: NumericSeries;
}

export function rollingHighLow(
  bars: readonly MarketBar[],
  period: number,
): RollingHighLow {
  const highest: NumericSeries = new Array(bars.length).fill(null);
  const lowest: NumericSeries = new Array(bars.length).fill(null);
  const windowLength = Math.max(Math.round(period), 1);
  const highIndexes: number[] = [];
  const lowIndexes: number[] = [];
  let highStart = 0;
  let lowStart = 0;

  for (let index = 0; index < bars.length; index += 1) {
    while (
      highIndexes.length > highStart &&
      bars[highIndexes.at(-1)!].high <= bars[index].high
    ) {
      highIndexes.pop();
    }
    while (
      lowIndexes.length > lowStart &&
      bars[lowIndexes.at(-1)!].low >= bars[index].low
    ) {
      lowIndexes.pop();
    }
    highIndexes.push(index);
    lowIndexes.push(index);

    const expiredIndex = index - windowLength;
    if (highIndexes[highStart] <= expiredIndex) highStart += 1;
    if (lowIndexes[lowStart] <= expiredIndex) lowStart += 1;

    if (index >= windowLength - 1) {
      highest[index] = bars[highIndexes[highStart]].high;
      lowest[index] = bars[lowIndexes[lowStart]].low;
    }
  }

  return { highest, lowest };
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function sma(values: number[], period: number): NumericSeries {
  const output: NumericSeries = new Array(values.length).fill(null);
  if (period <= 0) return output;

  let rollingSum = 0;
  for (let index = 0; index < values.length; index += 1) {
    rollingSum += values[index];
    if (index >= period) rollingSum -= values[index - period];
    if (index >= period - 1) output[index] = rollingSum / period;
  }
  return output;
}

export function ema(values: number[], period: number): NumericSeries {
  const output: NumericSeries = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return output;

  const seed = average(values.slice(0, period));
  const multiplier = 2 / (period + 1);
  output[period - 1] = seed;

  let previous = seed;
  for (let index = period; index < values.length; index += 1) {
    previous = (values[index] - previous) * multiplier + previous;
    output[index] = previous;
  }
  return output;
}

export function wma(values: number[], period: number): NumericSeries {
  const output: NumericSeries = new Array(values.length).fill(null);
  if (period <= 0) return output;
  const denominator = (period * (period + 1)) / 2;

  for (let index = period - 1; index < values.length; index += 1) {
    let weightedSum = 0;
    for (let offset = 0; offset < period; offset += 1) {
      weightedSum += values[index - period + 1 + offset] * (offset + 1);
    }
    output[index] = weightedSum / denominator;
  }
  return output;
}

export function dema(values: number[], period: number): NumericSeries {
  const first = ema(values, period);
  const validFirst = first.slice(period - 1).map((value) => value ?? 0);
  const secondCompact = ema(validFirst, period);
  const second: NumericSeries = new Array(values.length).fill(null);
  secondCompact.forEach((value, index) => {
    if (value !== null) second[index + period - 1] = value;
  });
  return first.map((value, index) => {
    if (value === null || second[index] === null) return null;
    return value * 2 - second[index]!;
  });
}

export function rsi(values: number[], period = 14): NumericSeries {
  const output: NumericSeries = new Array(values.length).fill(null);
  if (period <= 0 || values.length <= period) return output;

  let gains = 0;
  let losses = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = values[index] - values[index - 1];
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;
  output[period] =
    averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);

  for (let index = period + 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    averageGain =
      (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss =
      (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
    output[index] =
      averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
  }

  return output;
}

export function macd(
  values: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
) {
  const fast = ema(values, fastPeriod);
  const slow = ema(values, slowPeriod);
  const line: NumericSeries = values.map((_, index) => {
    if (fast[index] === null || slow[index] === null) return null;
    return fast[index]! - slow[index]!;
  });

  const compactLine = line.map((value) => value ?? 0);
  const signalSeed = ema(compactLine.slice(slowPeriod - 1), signalPeriod);
  const signal: NumericSeries = new Array(values.length).fill(null);

  signalSeed.forEach((value, index) => {
    if (value !== null) signal[index + slowPeriod - 1] = value;
  });

  const histogram: NumericSeries = line.map((value, index) => {
    if (value === null || signal[index] === null) return null;
    return (value - signal[index]!) * 2;
  });

  return { line, signal, histogram };
}

export function bollingerBands(values: number[], period = 20, width = 2) {
  const middle = sma(values, period);
  const upper: NumericSeries = new Array(values.length).fill(null);
  const lower: NumericSeries = new Array(values.length).fill(null);

  for (let index = period - 1; index < values.length; index += 1) {
    const window = values.slice(index - period + 1, index + 1);
    const mean = middle[index]!;
    const variance =
      window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / period;
    const deviation = Math.sqrt(variance);
    upper[index] = mean + width * deviation;
    lower[index] = mean - width * deviation;
  }

  return { middle, upper, lower };
}

export function atr(bars: MarketBar[], period = 14): NumericSeries {
  const trueRanges = bars.map((bar, index) => {
    if (index === 0) return bar.high - bar.low;
    const previousClose = bars[index - 1].close;
    return Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - previousClose),
      Math.abs(bar.low - previousClose),
    );
  });

  const output: NumericSeries = new Array(bars.length).fill(null);
  if (bars.length < period) return output;

  let current = average(trueRanges.slice(0, period));
  output[period - 1] = current;
  for (let index = period; index < bars.length; index += 1) {
    current = (current * (period - 1) + trueRanges[index]) / period;
    output[index] = current;
  }
  return output;
}

export function vwap(bars: MarketBar[]): NumericSeries {
  const output: NumericSeries = new Array(bars.length).fill(null);
  let cumulativeValue = 0;
  let cumulativeVolume = 0;

  bars.forEach((bar, index) => {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    cumulativeValue += typicalPrice * bar.volume;
    cumulativeVolume += bar.volume;
    output[index] =
      cumulativeVolume === 0 ? null : cumulativeValue / cumulativeVolume;
  });
  return output;
}

export function kdj(
  bars: MarketBar[],
  period = 9,
  smoothK = 3,
  smoothD = 3,
) {
  const k: NumericSeries = new Array(bars.length).fill(null);
  const d: NumericSeries = new Array(bars.length).fill(null);
  const j: NumericSeries = new Array(bars.length).fill(null);
  let currentK = 50;
  let currentD = 50;
  const normalizedPeriod = Math.max(Math.round(period), 1);
  const normalizedSmoothK = Math.max(Math.round(smoothK), 1);
  const normalizedSmoothD = Math.max(Math.round(smoothD), 1);
  const highLow = rollingHighLow(bars, normalizedPeriod);

  for (
    let index = normalizedPeriod - 1;
    index < bars.length;
    index += 1
  ) {
    const highest = highLow.highest[index]!;
    const lowest = highLow.lowest[index]!;
    const priceRange = highest - lowest;
    const rsv =
      priceRange === 0
        ? 50
        : ((bars[index].close - lowest) / priceRange) * 100;
    currentK =
      ((normalizedSmoothK - 1) * currentK + rsv) /
      normalizedSmoothK;
    currentD =
      ((normalizedSmoothD - 1) * currentD + currentK) /
      normalizedSmoothD;
    k[index] = currentK;
    d[index] = currentD;
    j[index] = 3 * currentK - 2 * currentD;
  }

  return { k, d, j };
}

export function obv(bars: MarketBar[]): NumericSeries {
  if (!bars.some((bar) => bar.volume > 0)) {
    return new Array(bars.length).fill(null);
  }
  const output: NumericSeries = new Array(bars.length).fill(0);
  let current = 0;

  for (let index = 1; index < bars.length; index += 1) {
    if (bars[index].close > bars[index - 1].close) {
      current += bars[index].volume;
    } else if (bars[index].close < bars[index - 1].close) {
      current -= bars[index].volume;
    }
    output[index] = current;
  }
  return output;
}

export function stochasticRsi(
  values: number[],
  rsiPeriod = 14,
  stochasticPeriod = 14,
  smoothPeriod = 3,
) {
  const strength = rsi(values, rsiPeriod);
  const raw: NumericSeries = new Array(values.length).fill(null);

  for (
    let index = rsiPeriod + stochasticPeriod - 1;
    index < values.length;
    index += 1
  ) {
    const window = strength
      .slice(index - stochasticPeriod + 1, index + 1)
      .filter((value): value is number => value !== null);
    if (window.length !== stochasticPeriod || strength[index] === null) continue;
    const highest = Math.max(...window);
    const lowest = Math.min(...window);
    raw[index] =
      highest === lowest ? 50 : ((strength[index]! - lowest) / (highest - lowest)) * 100;
  }

  const k: NumericSeries = new Array(values.length).fill(null);
  const d: NumericSeries = new Array(values.length).fill(null);
  for (let index = 0; index < values.length; index += 1) {
    const kWindow = raw
      .slice(Math.max(0, index - smoothPeriod + 1), index + 1)
      .filter((value): value is number => value !== null);
    if (kWindow.length === smoothPeriod) k[index] = average(kWindow);
    const dWindow = k
      .slice(Math.max(0, index - smoothPeriod + 1), index + 1)
      .filter((value): value is number => value !== null);
    if (dWindow.length === smoothPeriod) d[index] = average(dWindow);
  }
  return { k, d };
}

export function stochasticSlow(
  bars: MarketBar[],
  period = 14,
  smoothK = 3,
  smoothD = 3,
) {
  const raw: NumericSeries = new Array(bars.length).fill(null);
  const range = rollingHighLow(bars, period);

  for (let index = period - 1; index < bars.length; index += 1) {
    const highest = range.highest[index]!;
    const lowest = range.lowest[index]!;
    raw[index] =
      highest === lowest
        ? 50
        : ((bars[index].close - lowest) / (highest - lowest)) * 100;
  }

  const smooth = (source: NumericSeries, length: number) => {
    const output: NumericSeries = new Array(source.length).fill(null);
    for (let index = length - 1; index < source.length; index += 1) {
      const window = source
        .slice(index - length + 1, index + 1)
        .filter((value): value is number => value !== null);
      if (window.length === length) output[index] = average(window);
    }
    return output;
  };

  const k = smooth(raw, Math.max(Math.round(smoothK), 1));
  const d = smooth(k, Math.max(Math.round(smoothD), 1));
  return { k, d };
}

export interface ParabolicSarState {
  value: NumericSeries;
  direction: number[];
  trigger: NumericSeries;
  triggerDirection: number[];
}

export function parabolicSarState(
  bars: MarketBar[],
  start = 0.02,
  increment = 0.02,
  maximum = 0.2,
): ParabolicSarState {
  const output: NumericSeries = new Array(bars.length).fill(null);
  const direction = new Array<number>(bars.length).fill(0);
  const trigger: NumericSeries = new Array(bars.length).fill(null);
  const triggerDirection = new Array<number>(bars.length).fill(0);
  if (bars.length < 2) {
    return { value: output, direction, trigger, triggerDirection };
  }

  const initialAcceleration = Math.max(start, 0.0001);
  const accelerationStep = Math.max(increment, 0);
  const accelerationLimit = Math.max(maximum, initialAcceleration);
  let isLong = bars[1].close >= bars[0].close;
  let acceleration = initialAcceleration;
  let extreme = isLong
    ? Math.max(bars[0].high, bars[1].high)
    : Math.min(bars[0].low, bars[1].low);
  let current = isLong
    ? Math.min(bars[0].low, bars[1].low)
    : Math.max(bars[0].high, bars[1].high);
  output[1] = current;
  direction[1] = isLong ? 1 : -1;

  for (let index = 2; index < bars.length; index += 1) {
    current += acceleration * (extreme - current);

    if (isLong) {
      current = Math.min(current, bars[index - 1].low, bars[index - 2].low);
      trigger[index] = current;
      triggerDirection[index] = 1;
      if (bars[index].low <= current) {
        isLong = false;
        current = extreme;
        extreme = bars[index].low;
        acceleration = initialAcceleration;
      } else if (bars[index].high > extreme) {
        extreme = bars[index].high;
        acceleration = Math.min(
          acceleration + accelerationStep,
          accelerationLimit,
        );
      }
    } else {
      current = Math.max(current, bars[index - 1].high, bars[index - 2].high);
      trigger[index] = current;
      triggerDirection[index] = -1;
      if (bars[index].high >= current) {
        isLong = true;
        current = extreme;
        extreme = bars[index].high;
        acceleration = initialAcceleration;
      } else if (bars[index].low < extreme) {
        extreme = bars[index].low;
        acceleration = Math.min(
          acceleration + accelerationStep,
          accelerationLimit,
        );
      }
    }

    output[index] = current;
    direction[index] = isLong ? 1 : -1;
  }

  return { value: output, direction, trigger, triggerDirection };
}

export function parabolicSar(
  bars: MarketBar[],
  start = 0.02,
  increment = 0.02,
  maximum = 0.2,
): NumericSeries {
  return parabolicSarState(bars, start, increment, maximum).value;
}

export function cci(bars: MarketBar[], period = 20): NumericSeries {
  const typicalPrices = bars.map(
    (bar) => (bar.high + bar.low + bar.close) / 3,
  );
  const middle = sma(typicalPrices, period);
  const output: NumericSeries = new Array(bars.length).fill(null);

  for (let index = period - 1; index < bars.length; index += 1) {
    const window = typicalPrices.slice(index - period + 1, index + 1);
    const mean = middle[index]!;
    const meanDeviation =
      window.reduce((sum, value) => sum + Math.abs(value - mean), 0) / period;
    output[index] =
      meanDeviation === 0 ? 0 : (typicalPrices[index] - mean) / (0.015 * meanDeviation);
  }
  return output;
}

export function williamsR(bars: MarketBar[], period = 14): NumericSeries {
  const output: NumericSeries = new Array(bars.length).fill(null);
  const range = rollingHighLow(bars, period);
  for (let index = period - 1; index < bars.length; index += 1) {
    const highest = range.highest[index]!;
    const lowest = range.lowest[index]!;
    output[index] =
      highest === lowest
        ? -50
        : ((highest - bars[index].close) / (highest - lowest)) * -100;
  }
  return output;
}

export function roc(values: number[], period = 12): NumericSeries {
  const output: NumericSeries = new Array(values.length).fill(null);
  for (let index = period; index < values.length; index += 1) {
    const previous = values[index - period];
    output[index] = previous === 0 ? 0 : ((values[index] - previous) / previous) * 100;
  }
  return output;
}

export function mfi(bars: MarketBar[], period = 14): NumericSeries {
  const output: NumericSeries = new Array(bars.length).fill(null);
  const typicalPrices = bars.map(
    (bar) => (bar.high + bar.low + bar.close) / 3,
  );
  const positive = new Array(bars.length).fill(0);
  const negative = new Array(bars.length).fill(0);

  for (let index = 1; index < bars.length; index += 1) {
    const flow = typicalPrices[index] * bars[index].volume;
    if (typicalPrices[index] > typicalPrices[index - 1]) positive[index] = flow;
    if (typicalPrices[index] < typicalPrices[index - 1]) negative[index] = flow;
  }
  for (let index = period; index < bars.length; index += 1) {
    const positiveFlow = positive
      .slice(index - period + 1, index + 1)
      .reduce((sum, value) => sum + value, 0);
    const negativeFlow = negative
      .slice(index - period + 1, index + 1)
      .reduce((sum, value) => sum + value, 0);
    output[index] =
      positiveFlow === 0 && negativeFlow === 0
        ? null
        : negativeFlow === 0
          ? 100
          : 100 - 100 / (1 + positiveFlow / negativeFlow);
  }
  return output;
}

export function cmf(bars: MarketBar[], period = 20): NumericSeries {
  const output: NumericSeries = new Array(bars.length).fill(null);
  const moneyFlowVolumes = bars.map((bar) => {
    const range = bar.high - bar.low;
    const multiplier =
      range === 0 ? 0 : ((bar.close - bar.low) - (bar.high - bar.close)) / range;
    return multiplier * bar.volume;
  });

  for (let index = period - 1; index < bars.length; index += 1) {
    const flow = moneyFlowVolumes
      .slice(index - period + 1, index + 1)
      .reduce((sum, value) => sum + value, 0);
    const volume = bars
      .slice(index - period + 1, index + 1)
      .reduce((sum, bar) => sum + bar.volume, 0);
    output[index] = volume === 0 ? null : flow / volume;
  }
  return output;
}

export function adx(bars: MarketBar[], period = 14) {
  const plusDm = new Array(bars.length).fill(0);
  const minusDm = new Array(bars.length).fill(0);
  const trueRange = new Array(bars.length).fill(0);

  for (let index = 1; index < bars.length; index += 1) {
    const upMove = bars[index].high - bars[index - 1].high;
    const downMove = bars[index - 1].low - bars[index].low;
    plusDm[index] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDm[index] = downMove > upMove && downMove > 0 ? downMove : 0;
    trueRange[index] = Math.max(
      bars[index].high - bars[index].low,
      Math.abs(bars[index].high - bars[index - 1].close),
      Math.abs(bars[index].low - bars[index - 1].close),
    );
  }

  const plusDi: NumericSeries = new Array(bars.length).fill(null);
  const minusDi: NumericSeries = new Array(bars.length).fill(null);
  const strength: NumericSeries = new Array(bars.length).fill(null);
  if (bars.length <= period) return { adx: strength, plusDi, minusDi };

  let smoothedTr = trueRange.slice(1, period + 1).reduce((a, b) => a + b, 0);
  let smoothedPlus = plusDm.slice(1, period + 1).reduce((a, b) => a + b, 0);
  let smoothedMinus = minusDm.slice(1, period + 1).reduce((a, b) => a + b, 0);
  const dx: NumericSeries = new Array(bars.length).fill(null);

  for (let index = period; index < bars.length; index += 1) {
    if (index > period) {
      smoothedTr = smoothedTr - smoothedTr / period + trueRange[index];
      smoothedPlus =
        smoothedPlus - smoothedPlus / period + plusDm[index];
      smoothedMinus =
        smoothedMinus - smoothedMinus / period + minusDm[index];
    }
    plusDi[index] = smoothedTr === 0 ? 0 : (smoothedPlus / smoothedTr) * 100;
    minusDi[index] = smoothedTr === 0 ? 0 : (smoothedMinus / smoothedTr) * 100;
    const sum = plusDi[index]! + minusDi[index]!;
    dx[index] =
      sum === 0 ? 0 : (Math.abs(plusDi[index]! - minusDi[index]!) / sum) * 100;
  }

  const firstAdxIndex = period * 2 - 1;
  if (bars.length > firstAdxIndex) {
    let current = average(
      dx.slice(period, firstAdxIndex + 1).filter((value): value is number => value !== null),
    );
    strength[firstAdxIndex] = current;
    for (let index = firstAdxIndex + 1; index < bars.length; index += 1) {
      current = (current * (period - 1) + (dx[index] ?? 0)) / period;
      strength[index] = current;
    }
  }
  return { adx: strength, plusDi, minusDi };
}

export function supertrend(
  bars: MarketBar[],
  period = 10,
  multiplier = 3,
) {
  const volatility = atr(bars, period);
  const trend: NumericSeries = new Array(bars.length).fill(null);
  const direction = new Array(bars.length).fill(0);
  const upper = new Array<number>(bars.length).fill(0);
  const lower = new Array<number>(bars.length).fill(0);

  for (let index = period - 1; index < bars.length; index += 1) {
    const middle = (bars[index].high + bars[index].low) / 2;
    const basicUpper = middle + multiplier * volatility[index]!;
    const basicLower = middle - multiplier * volatility[index]!;
    upper[index] =
      index === period - 1 ||
      basicUpper < upper[index - 1] ||
      bars[index - 1].close > upper[index - 1]
        ? basicUpper
        : upper[index - 1];
    lower[index] =
      index === period - 1 ||
      basicLower > lower[index - 1] ||
      bars[index - 1].close < lower[index - 1]
        ? basicLower
        : lower[index - 1];

    if (index === period - 1) {
      direction[index] = bars[index].close >= middle ? 1 : -1;
    } else if (bars[index].close > upper[index - 1]) {
      direction[index] = 1;
    } else if (bars[index].close < lower[index - 1]) {
      direction[index] = -1;
    } else {
      direction[index] = direction[index - 1];
    }
    trend[index] = direction[index] === 1 ? lower[index] : upper[index];
  }
  return { trend, direction, upper, lower };
}

export function ichimoku(
  bars: MarketBar[],
  conversionPeriod = 9,
  basePeriod = 26,
  spanPeriod = 52,
) {
  const conversion: NumericSeries = new Array(bars.length).fill(null);
  const base: NumericSeries = new Array(bars.length).fill(null);
  const spanA: NumericSeries = new Array(bars.length).fill(null);
  const spanB: NumericSeries = new Array(bars.length).fill(null);
  const conversionRange = rollingHighLow(bars, conversionPeriod);
  const baseRange = rollingHighLow(bars, basePeriod);
  const spanRange = rollingHighLow(bars, spanPeriod);

  for (let index = 0; index < bars.length; index += 1) {
    if (
      conversionRange.highest[index] !== null &&
      conversionRange.lowest[index] !== null
    ) {
      conversion[index] =
        (conversionRange.highest[index]! +
          conversionRange.lowest[index]!) /
        2;
    }
    if (
      baseRange.highest[index] !== null &&
      baseRange.lowest[index] !== null
    ) {
      base[index] =
        (baseRange.highest[index]! + baseRange.lowest[index]!) / 2;
    }
    if (
      spanRange.highest[index] !== null &&
      spanRange.lowest[index] !== null
    ) {
      spanB[index] =
        (spanRange.highest[index]! + spanRange.lowest[index]!) / 2;
    }
    if (conversion[index] !== null && base[index] !== null) {
      spanA[index] = (conversion[index]! + base[index]!) / 2;
    }
  }
  return { conversion, base, spanA, spanB };
}

export interface SupportResistanceBreakSeries {
  support: NumericSeries;
  resistance: NumericSeries;
  bullishBreaks: NumericSeries;
  bearishBreaks: NumericSeries;
}

/**
 * Builds confirmed pivot levels without backpainting. A pivot becomes visible
 * only after `rightBars` later bars have closed, so every plotted value was
 * knowable at that point in time.
 */
export function supportResistanceBreaks(
  bars: readonly MarketBar[],
  leftBars = 15,
  rightBars = 15,
): SupportResistanceBreakSeries {
  const normalizedLeftBars = Math.max(1, Math.floor(leftBars));
  const normalizedRightBars = Math.max(1, Math.floor(rightBars));
  const support: NumericSeries = new Array(bars.length).fill(null);
  const resistance: NumericSeries = new Array(bars.length).fill(null);
  const bullishBreaks: NumericSeries = new Array(bars.length).fill(null);
  const bearishBreaks: NumericSeries = new Array(bars.length).fill(null);
  const pivotRange = rollingHighLow(
    bars,
    normalizedLeftBars + normalizedRightBars + 1,
  );
  let currentSupport: number | null = null;
  let currentResistance: number | null = null;

  for (let confirmationIndex = 0; confirmationIndex < bars.length; confirmationIndex += 1) {
    const bar = bars[confirmationIndex];
    const previousClose = bars[confirmationIndex - 1]?.close;
    if (
      currentResistance !== null &&
      previousClose !== undefined &&
      previousClose <= currentResistance &&
      bar.close > currentResistance
    ) {
      bullishBreaks[confirmationIndex] = bar.close;
    }
    if (
      currentSupport !== null &&
      previousClose !== undefined &&
      previousClose >= currentSupport &&
      bar.close < currentSupport
    ) {
      bearishBreaks[confirmationIndex] = bar.close;
    }

    const pivotIndex = confirmationIndex - normalizedRightBars;
    if (pivotIndex >= normalizedLeftBars) {
      const pivot = bars[pivotIndex];
      if (pivot.high === pivotRange.highest[confirmationIndex]) {
        currentResistance = pivot.high;
      }
      if (pivot.low === pivotRange.lowest[confirmationIndex]) {
        currentSupport = pivot.low;
      }
    }

    support[confirmationIndex] = currentSupport;
    resistance[confirmationIndex] = currentResistance;
  }

  return { support, resistance, bullishBreaks, bearishBreaks };
}
