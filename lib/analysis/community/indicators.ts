import type { MarketBar } from "@/lib/market/types";
import {
  atr,
  ema,
  rollingHighLow,
  rsi,
  sma,
  supportResistanceBreaks,
  type NumericSeries,
  type SupportResistanceBreakSeries,
} from "../indicators";

function normalizedPeriod(value: number, fallback: number): number {
  return Math.max(Math.round(Number.isFinite(value) ? value : fallback), 1);
}

function finiteValue(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function standardDeviation(values: readonly number[], start: number, end: number) {
  const length = end - start + 1;
  if (length < 1) return 0;
  let sum = 0;
  for (let index = start; index <= end; index += 1) sum += values[index];
  const mean = sum / length;
  let squared = 0;
  for (let index = start; index <= end; index += 1) {
    const delta = values[index] - mean;
    squared += delta * delta;
  }
  return Math.sqrt(squared / length);
}

function rollingStandardDeviation(values: readonly number[], period: number): NumericSeries {
  const output: NumericSeries = new Array(values.length).fill(null);
  for (let index = period - 1; index < values.length; index += 1) {
    output[index] = standardDeviation(values, index - period + 1, index);
  }
  return output;
}

function linearRegressionEndpoint(values: readonly number[], period: number): NumericSeries {
  const output: NumericSeries = new Array(values.length).fill(null);
  const xMean = (period - 1) / 2;
  let xVariance = 0;
  for (let x = 0; x < period; x += 1) xVariance += (x - xMean) ** 2;
  for (let index = period - 1; index < values.length; index += 1) {
    const start = index - period + 1;
    let yMean = 0;
    for (let offset = 0; offset < period; offset += 1) yMean += values[start + offset];
    yMean /= period;
    let covariance = 0;
    for (let offset = 0; offset < period; offset += 1) {
      covariance += (offset - xMean) * (values[start + offset] - yMean);
    }
    const slope = xVariance > 0 ? covariance / xVariance : 0;
    output[index] = yMean + slope * xMean;
  }
  return output;
}

function nullableEma(values: NumericSeries, period: number): NumericSeries {
  const output: NumericSeries = new Array(values.length).fill(null);
  const multiplier = 2 / (period + 1);
  let previous: number | null = null;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === null) continue;
    previous = previous === null ? value : previous + multiplier * (value - previous);
    output[index] = previous;
  }
  return output;
}

function rma(values: readonly number[], period: number, fallback: number): number[] {
  const output = new Array(values.length).fill(fallback);
  if (values.length === 0) return output;
  let previous = values[0];
  output[0] = previous;
  for (let index = 1; index < values.length; index += 1) {
    previous = (previous * (period - 1) + values[index]) / period;
    output[index] = previous;
  }
  return output;
}

function trueRanges(bars: readonly MarketBar[]): number[] {
  return bars.map((bar, index) => {
    const previousClose = bars[index - 1]?.close ?? bar.close;
    return Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - previousClose),
      Math.abs(bar.low - previousClose),
    );
  });
}

function isConfirmedPivot(
  values: readonly number[],
  pivotIndex: number,
  leftBars: number,
  rightBars: number,
  mode: "high" | "low",
): boolean {
  if (pivotIndex < leftBars || pivotIndex + rightBars >= values.length) return false;
  const pivot = values[pivotIndex];
  for (let index = pivotIndex - leftBars; index <= pivotIndex + rightBars; index += 1) {
    if (index === pivotIndex) continue;
    if (mode === "high" ? values[index] >= pivot : values[index] <= pivot) return false;
  }
  return true;
}

export interface AdaptiveRegressionBreakoutSeries {
  basis: NumericSeries;
  upper: NumericSeries;
  lower: NumericSeries;
  bullishBreaks: NumericSeries;
  bearishBreaks: NumericSeries;
  squeeze: boolean[];
}

export function adaptiveRegressionBreakout(
  bars: readonly MarketBar[],
  regressionPeriod = 50,
  deviationMultiplier = 2,
  squeezeLookback = 100,
  squeezeThreshold = 20,
): AdaptiveRegressionBreakoutSeries {
  const closes = bars.map((bar) => bar.close);
  const period = normalizedPeriod(regressionPeriod, 50);
  const basis = linearRegressionEndpoint(closes, period);
  const deviations = rollingStandardDeviation(closes, period);
  const upper = basis.map((value, index) =>
    value === null || deviations[index] === null
      ? null
      : value + deviations[index]! * deviationMultiplier,
  );
  const lower = basis.map((value, index) =>
    value === null || deviations[index] === null
      ? null
      : value - deviations[index]! * deviationMultiplier,
  );
  const widths = upper.map((value, index) =>
    value === null || lower[index] === null ? null : value - lower[index]!,
  );
  const squeeze = new Array(bars.length).fill(false);
  const lookback = normalizedPeriod(squeezeLookback, 100);
  for (let index = 0; index < bars.length; index += 1) {
    const start = Math.max(0, index - lookback + 1);
    const window = widths.slice(start, index + 1).filter((value): value is number => value !== null);
    const width = widths[index];
    if (width === null || window.length < lookback) continue;
    const minimum = Math.min(...window);
    const maximum = Math.max(...window);
    const percentile = ((width - minimum) / Math.max(maximum - minimum, 1e-9)) * 100;
    squeeze[index] = percentile <= squeezeThreshold;
  }
  const bullishBreaks: NumericSeries = new Array(bars.length).fill(null);
  const bearishBreaks: NumericSeries = new Array(bars.length).fill(null);
  for (let index = 1; index < bars.length; index += 1) {
    if (upper[index] !== null && upper[index - 1] !== null && squeeze[index - 1] && closes[index] > upper[index]! && closes[index - 1] <= upper[index - 1]!) {
      bullishBreaks[index] = bars[index].low;
    }
    if (lower[index] !== null && lower[index - 1] !== null && squeeze[index - 1] && closes[index] < lower[index]! && closes[index - 1] >= lower[index - 1]!) {
      bearishBreaks[index] = bars[index].high;
    }
  }
  return { basis, upper, lower, bullishBreaks, bearishBreaks, squeeze };
}

export interface AutoAtrTrendSeries {
  trailingStop: NumericSeries;
  bullishSpikes: NumericSeries;
  bearishSpikes: NumericSeries;
  direction: number[];
}

export function autoAtrTrendTracker(
  bars: MarketBar[],
  atrPeriod = 14,
  spikeMultiplier = 2,
  trailingMultiplier = 3,
): AutoAtrTrendSeries {
  const atrValues = atr(bars, normalizedPeriod(atrPeriod, 14));
  const trailingStop: NumericSeries = new Array(bars.length).fill(null);
  const bullishSpikes: NumericSeries = new Array(bars.length).fill(null);
  const bearishSpikes: NumericSeries = new Array(bars.length).fill(null);
  const direction = new Array(bars.length).fill(0);
  let state = 0;
  let stop: number | null = null;
  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index];
    const currentAtr = atrValues[index];
    if (currentAtr === null) continue;
    const body = Math.abs(bar.close - bar.open);
    const upSpike = body > currentAtr * spikeMultiplier && bar.close > bar.open && state !== 1;
    const downSpike = body > currentAtr * spikeMultiplier && bar.close < bar.open && state !== -1;
    if (upSpike && state <= 0) {
      state = 1;
      stop = bar.low - currentAtr * trailingMultiplier;
      bullishSpikes[index] = bar.low;
    } else if (downSpike && state >= 0) {
      state = -1;
      stop = bar.high + currentAtr * trailingMultiplier;
      bearishSpikes[index] = bar.high;
    }
    if (state === 1 && stop !== null) {
      stop = Math.max(stop, bar.low - currentAtr * trailingMultiplier);
      if (bar.close < stop) {
        state = 0;
        stop = null;
      }
    } else if (state === -1 && stop !== null) {
      stop = Math.min(stop, bar.high + currentAtr * trailingMultiplier);
      if (bar.close > stop) {
        state = 0;
        stop = null;
      }
    }
    direction[index] = state;
    trailingStop[index] = stop;
  }
  return { trailingStop, bullishSpikes, bearishSpikes, direction };
}

function fractionalEma(values: readonly number[], factor: number): number[] {
  const alpha = 2 / (Math.max(factor, 0.1) + 1);
  const output = new Array(values.length).fill(0);
  let previous = 0;
  for (let index = 0; index < values.length; index += 1) {
    previous = alpha * values[index] + (1 - alpha) * previous;
    output[index] = previous;
  }
  return output;
}

function kalmanPath(
  measurement: readonly number[],
  atrValues: NumericSeries,
  rPeriod: number,
  qRatio: number,
  gateMultiplier: number,
  smoothFactor: number,
): NumericSeries {
  const residualVariance = new Array(measurement.length).fill(0);
  let previewState = measurement[0] ?? 0;
  for (let index = 0; index < measurement.length; index += 1) {
    const scale = Math.max(atrValues[index] ?? 1e-6, 1e-6);
    residualVariance[index] = ((measurement[index] - previewState) / scale) ** 2;
    previewState = measurement[index];
  }
  const rRaw = rma(residualVariance, normalizedPeriod(rPeriod, 50), 1);
  const qRaw = rma(residualVariance, 5, 0.1);
  const states: number[] = new Array(measurement.length).fill(0);
  let state = measurement[0] ?? 0;
  let covariance = 1;
  for (let index = 0; index < measurement.length; index += 1) {
    const processNoise = Math.min(Math.max(qRaw[index], 0.001), 10) * qRatio;
    const adaptiveNoise = Math.max(rRaw[index], residualVariance[index] * gateMultiplier);
    covariance += processNoise;
    const gain = covariance / (covariance + adaptiveNoise + 1e-10);
    state += gain * (measurement[index] - state);
    covariance = (1 - gain) * covariance;
    states[index] = state;
  }
  return fractionalEma(states, smoothFactor);
}

export function fractionalEmaKalman(
  bars: MarketBar[],
  factor = 0.5,
  secondFactor = 0.5,
  rPeriod = 50,
  baseQ = 0.002,
  fastQ = 0.005,
  gateMultiplier = 1,
) {
  const closes = bars.map((bar) => bar.close);
  const measurement = fractionalEma(fractionalEma(closes, factor), secondFactor);
  const atrValues = atr(bars, 14);
  return {
    baseline: kalmanPath(measurement, atrValues, rPeriod, baseQ, gateMultiplier, 3),
    fast: kalmanPath(measurement, atrValues, rPeriod, fastQ, gateMultiplier, 5),
  };
}

export function nadarayaWatsonTrend(
  values: readonly number[],
  lookback = 50,
  bandwidth = 8,
  bandwidthMultiplier = 2,
  bandMultiplier = 1.5,
) {
  const trend: NumericSeries = new Array(values.length).fill(null);
  const upper: NumericSeries = new Array(values.length).fill(null);
  const lower: NumericSeries = new Array(values.length).fill(null);
  const windowLength = normalizedPeriod(lookback, 50);
  const effectiveBandwidth = Math.max(bandwidth * bandwidthMultiplier, 0.1);
  for (let index = windowLength; index < values.length; index += 1) {
    let weighted = 0;
    let weightSum = 0;
    for (let offset = 0; offset <= windowLength; offset += 1) {
      const weight = Math.exp(-0.5 * (offset / effectiveBandwidth) ** 2);
      weighted += values[index - offset] * weight;
      weightSum += weight;
    }
    const estimate = weighted / weightSum;
    let residual = 0;
    for (let offset = 0; offset <= windowLength; offset += 1) {
      const weight = Math.exp(-0.5 * (offset / effectiveBandwidth) ** 2);
      residual += Math.abs(values[index - offset] - estimate) * weight;
    }
    residual /= weightSum;
    trend[index] = estimate;
    upper[index] = estimate + residual * bandMultiplier;
    lower[index] = estimate - residual * bandMultiplier;
  }
  return { trend, upper, lower };
}

export interface RsiDivergenceSeries {
  value: NumericSeries;
  bullish: NumericSeries;
  bearish: NumericSeries;
}

export function rsiDivergenceEngine(
  bars: MarketBar[],
  period = 14,
  leftBars = 47,
  rightBars = 1,
): RsiDivergenceSeries {
  const closes = bars.map((bar) => bar.close);
  const values = rsi(closes, normalizedPeriod(period, 14));
  const comparableValues = values.map((value) => value ?? Number.NaN);
  const bullish: NumericSeries = new Array(bars.length).fill(null);
  const bearish: NumericSeries = new Array(bars.length).fill(null);
  const left = normalizedPeriod(leftBars, 47);
  const right = normalizedPeriod(rightBars, 1);
  let previousLow: { index: number; oscillator: number; price: number } | null = null;
  let previousHigh: { index: number; oscillator: number; price: number } | null = null;
  for (let confirmationIndex = left + right; confirmationIndex < bars.length; confirmationIndex += 1) {
    const pivotIndex = confirmationIndex - right;
    const oscillator = values[pivotIndex];
    if (oscillator === null) continue;
    if (isConfirmedPivot(comparableValues, pivotIndex, left, right, "low")) {
      const distance = previousLow ? pivotIndex - previousLow.index : 0;
      if (previousLow && distance >= 5 && distance <= 60 && oscillator > previousLow.oscillator && bars[pivotIndex].low < previousLow.price) {
        bullish[confirmationIndex] = values[confirmationIndex] ?? oscillator;
      }
      previousLow = { index: pivotIndex, oscillator, price: bars[pivotIndex].low };
    }
    if (isConfirmedPivot(comparableValues, pivotIndex, left, right, "high")) {
      const distance = previousHigh ? pivotIndex - previousHigh.index : 0;
      if (previousHigh && distance >= 5 && distance <= 60 && oscillator < previousHigh.oscillator && bars[pivotIndex].high > previousHigh.price) {
        bearish[confirmationIndex] = values[confirmationIndex] ?? oscillator;
      }
      previousHigh = { index: pivotIndex, oscillator, price: bars[pivotIndex].high };
    }
  }
  return { value: values, bullish, bearish };
}

export interface SqueezeMomentumSeries {
  momentum: NumericSeries;
  squeezeOn: boolean[];
  squeezeOff: boolean[];
}

export function squeezeMomentum(
  bars: MarketBar[],
  bbPeriod = 20,
  bbMultiplier = 2,
  kcPeriod = 20,
  kcMultiplier = 1.5,
): SqueezeMomentumSeries {
  const closes = bars.map((bar) => bar.close);
  const normalizedBbPeriod = normalizedPeriod(bbPeriod, 20);
  const normalizedKcPeriod = normalizedPeriod(kcPeriod, 20);
  const bbBasis = sma(closes, normalizedBbPeriod);
  const deviation = rollingStandardDeviation(closes, normalizedBbPeriod);
  // Honor the exposed BB multiplier. The downloaded source declared this
  // input but accidentally used the Keltner multiplier in its deviation.
  const upperBb = bbBasis.map((value, index) => value === null || deviation[index] === null ? null : value + deviation[index]! * bbMultiplier);
  const lowerBb = bbBasis.map((value, index) => value === null || deviation[index] === null ? null : value - deviation[index]! * bbMultiplier);
  const kcBasis = sma(closes, normalizedKcPeriod);
  const rangeAverage = sma(trueRanges(bars), normalizedKcPeriod);
  const ranges = rollingHighLow(bars, normalizedKcPeriod);
  const momentumInput = closes.map((close, index) => {
    const high = ranges.highest[index];
    const low = ranges.lowest[index];
    const averageClose = kcBasis[index];
    return high === null || low === null || averageClose === null
      ? 0
      : close - ((high + low) / 2 + averageClose) / 2;
  });
  const momentum = linearRegressionEndpoint(momentumInput, normalizedKcPeriod);
  const squeezeOn = new Array(bars.length).fill(false);
  const squeezeOff = new Array(bars.length).fill(false);
  for (let index = 0; index < bars.length; index += 1) {
    const basis = kcBasis[index];
    const range = rangeAverage[index];
    if (basis === null || range === null || upperBb[index] === null || lowerBb[index] === null) continue;
    const upperKc = basis + range * kcMultiplier;
    const lowerKc = basis - range * kcMultiplier;
    squeezeOn[index] = lowerBb[index]! > lowerKc && upperBb[index]! < upperKc;
    squeezeOff[index] = lowerBb[index]! < lowerKc && upperBb[index]! > upperKc;
  }
  return { momentum, squeezeOn, squeezeOff };
}

export function supportResistanceSignals(
  bars: MarketBar[],
  detectionPeriod = 15,
  margin = 2,
): SupportResistanceBreakSeries & {
  supportZoneUpper: NumericSeries;
  resistanceZoneLower: NumericSeries;
} {
  const period = normalizedPeriod(detectionPeriod, 15);
  const core = supportResistanceBreaks(bars, period, period);
  const range = rollingHighLow(bars, period);
  const zoneRatio = Math.max(margin, 0) * 0.17;
  return {
    ...core,
    supportZoneUpper: core.support.map((value, index) => {
      const high = range.highest[index];
      const low = range.lowest[index];
      return value === null || high === null || low === null || high === 0
        ? null
        : value * (1 + ((high - low) / high) * zoneRatio);
    }),
    resistanceZoneLower: core.resistance.map((value, index) => {
      const high = range.highest[index];
      const low = range.lowest[index];
      return value === null || high === null || low === null || high === 0
        ? null
        : value * (1 - ((high - low) / high) * zoneRatio);
    }),
  };
}

export interface TrendlineBreakSeries {
  upper: NumericSeries;
  lower: NumericSeries;
  bullishBreaks: NumericSeries;
  bearishBreaks: NumericSeries;
}

export function trendlineBreaks(
  bars: MarketBar[],
  swingPeriod = 14,
  slopeMultiplier = 1,
): TrendlineBreakSeries {
  const period = normalizedPeriod(swingPeriod, 14);
  const highs = bars.map((bar) => bar.high);
  const lows = bars.map((bar) => bar.low);
  const atrValues = atr(bars, period);
  const upper: NumericSeries = new Array(bars.length).fill(null);
  const lower: NumericSeries = new Array(bars.length).fill(null);
  const bullishBreaks: NumericSeries = new Array(bars.length).fill(null);
  const bearishBreaks: NumericSeries = new Array(bars.length).fill(null);
  let currentUpper: number | null = null;
  let currentLower: number | null = null;
  let upperSlope = 0;
  let lowerSlope = 0;
  let above = false;
  let below = false;
  for (let index = 0; index < bars.length; index += 1) {
    const pivotIndex = index - period;
    if (pivotIndex >= period && isConfirmedPivot(highs, pivotIndex, period, period, "high")) {
      upperSlope = ((atrValues[index] ?? 0) / period) * slopeMultiplier;
      currentUpper = highs[pivotIndex] - upperSlope * period;
      above = false;
    } else if (currentUpper !== null) {
      currentUpper -= upperSlope;
    }
    if (pivotIndex >= period && isConfirmedPivot(lows, pivotIndex, period, period, "low")) {
      lowerSlope = ((atrValues[index] ?? 0) / period) * slopeMultiplier;
      currentLower = lows[pivotIndex] + lowerSlope * period;
      below = false;
    } else if (currentLower !== null) {
      currentLower += lowerSlope;
    }
    upper[index] = currentUpper;
    lower[index] = currentLower;
    if (!above && currentUpper !== null && bars[index].close > currentUpper) {
      above = true;
      bullishBreaks[index] = bars[index].low;
    }
    if (!below && currentLower !== null && bars[index].close < currentLower) {
      below = true;
      bearishBreaks[index] = bars[index].high;
    }
  }
  return { upper, lower, bullishBreaks, bearishBreaks };
}

export function waveTrend(
  bars: MarketBar[],
  channelPeriod = 10,
  averagePeriod = 21,
) {
  const typical = bars.map((bar) => (bar.high + bar.low + bar.close) / 3);
  const channel = ema(typical, normalizedPeriod(channelPeriod, 10));
  const deviations = typical.map((value, index) => Math.abs(value - (channel[index] ?? value)));
  const smoothedDeviation = ema(deviations, normalizedPeriod(channelPeriod, 10));
  const channelIndex: NumericSeries = typical.map((value, index) => {
    const baseline = channel[index];
    const deviation = smoothedDeviation[index];
    return baseline === null || deviation === null || deviation === 0
      ? null
      : (value - baseline) / (0.015 * deviation);
  });
  const wt1 = nullableEma(channelIndex, normalizedPeriod(averagePeriod, 21));
  const wt2: NumericSeries = new Array(bars.length).fill(null);
  for (let index = 3; index < bars.length; index += 1) {
    const window = wt1.slice(index - 3, index + 1);
    if (window.every((value): value is number => value !== null)) {
      wt2[index] = window.reduce((sum, value) => sum + value, 0) / 4;
    }
  }
  return {
    wt1,
    wt2,
    difference: wt1.map((value, index) => value === null || wt2[index] === null ? null : value - wt2[index]!),
  };
}

export function keltnerChannels(
  bars: MarketBar[],
  periodValue = 20,
  multiplier = 1.5,
) {
  const period = normalizedPeriod(periodValue, 20);
  const basis = ema(bars.map((bar) => bar.close), period);
  const ranges = atr(bars, period);
  return {
    basis,
    upper: basis.map((value, index) =>
      value === null || ranges[index] === null
        ? null
        : value + ranges[index]! * multiplier,
    ),
    lower: basis.map((value, index) =>
      value === null || ranges[index] === null
        ? null
        : value - ranges[index]! * multiplier,
    ),
  };
}

export function donchianChannels(bars: MarketBar[], periodValue = 20) {
  const range = rollingHighLow(bars, normalizedPeriod(periodValue, 20));
  return {
    upper: range.highest,
    lower: range.lowest,
    middle: range.highest.map((value, index) =>
      value === null || range.lowest[index] === null
        ? null
        : (value + range.lowest[index]!) / 2,
    ),
  };
}

export function choppinessIndex(bars: MarketBar[], periodValue = 14) {
  const period = normalizedPeriod(periodValue, 14);
  const ranges = rollingHighLow(bars, period);
  const trueRange = bars.map((bar, index) => {
    const previousClose = bars[index - 1]?.close ?? bar.close;
    return Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - previousClose),
      Math.abs(bar.low - previousClose),
    );
  });
  const output: NumericSeries = new Array(bars.length).fill(null);
  for (let index = period - 1; index < bars.length; index += 1) {
    const highest = ranges.highest[index];
    const lowest = ranges.lowest[index];
    if (highest === null || lowest === null || highest === lowest) continue;
    let sum = 0;
    for (let offset = index - period + 1; offset <= index; offset += 1) {
      sum += trueRange[offset];
    }
    output[index] =
      (100 * Math.log10(sum / (highest - lowest))) / Math.log10(period);
  }
  return output;
}

export function aroon(bars: MarketBar[], periodValue = 14) {
  const period = normalizedPeriod(periodValue, 14);
  const up: NumericSeries = new Array(bars.length).fill(null);
  const down: NumericSeries = new Array(bars.length).fill(null);
  if (period === 1) return { up, down };
  for (let index = period - 1; index < bars.length; index += 1) {
    const start = index - period + 1;
    let highIndex = start;
    let lowIndex = start;
    for (let cursor = start + 1; cursor <= index; cursor += 1) {
      if (bars[cursor].high >= bars[highIndex].high) highIndex = cursor;
      if (bars[cursor].low <= bars[lowIndex].low) lowIndex = cursor;
    }
    up[index] = (100 * (period - 1 - (index - highIndex))) / (period - 1);
    down[index] = (100 * (period - 1 - (index - lowIndex))) / (period - 1);
  }
  return { up, down };
}

export function trix(bars: MarketBar[], periodValue = 18, signalPeriodValue = 9) {
  const period = normalizedPeriod(periodValue, 18);
  const first = ema(bars.map((bar) => bar.close), period);
  const second = nullableEma(first, period);
  const third = nullableEma(second, period);
  const value: NumericSeries = new Array(bars.length).fill(null);
  for (let index = 1; index < bars.length; index += 1) {
    const current = third[index];
    const previous = third[index - 1];
    if (current !== null && previous !== null && previous !== 0) {
      value[index] = ((current - previous) / previous) * 100;
    }
  }
  const signal = sma(
    value.map((item) => item ?? 0),
    normalizedPeriod(signalPeriodValue, 9),
  ).map((item, index) => (value[index] === null ? null : item));
  return { value, signal };
}

export function utBotTrail(
  bars: MarketBar[],
  keyValue = 3,
  atrPeriod = 1,
): NumericSeries {
  const closes = bars.map((bar) => bar.close);
  const atrValues = atr(bars, normalizedPeriod(atrPeriod, 1));
  const output: NumericSeries = new Array(bars.length).fill(null);
  let previousStop = 0;
  for (let index = 0; index < bars.length; index += 1) {
    const source = closes[index];
    const previousSource = closes[index - 1] ?? source;
    const loss = finiteValue(keyValue, 3) * (atrValues[index] ?? 0);
    let stop: number;
    if (source > previousStop && previousSource > previousStop) {
      stop = Math.max(previousStop, source - loss);
    } else if (source < previousStop && previousSource < previousStop) {
      stop = Math.min(previousStop, source + loss);
    } else {
      stop = source > previousStop ? source - loss : source + loss;
    }
    output[index] = stop;
    previousStop = stop;
  }
  return output;
}

export interface HalfTrendSeries {
  trend: number[];
  line: NumericSeries;
  atrHigh: NumericSeries;
  atrLow: NumericSeries;
  bullishTurns: NumericSeries;
  bearishTurns: NumericSeries;
}

export function halfTrend(
  bars: MarketBar[],
  amplitudeValue = 2,
  channelDeviation = 2,
): HalfTrendSeries {
  const amplitude = normalizedPeriod(amplitudeValue, 2);
  const highAverage = sma(bars.map((bar) => bar.high), amplitude);
  const lowAverage = sma(bars.map((bar) => bar.low), amplitude);
  const ranges = atr(bars, 100);
  const trend = new Array(bars.length).fill(0);
  const line: NumericSeries = new Array(bars.length).fill(null);
  const atrHigh: NumericSeries = new Array(bars.length).fill(null);
  const atrLow: NumericSeries = new Array(bars.length).fill(null);
  const bullishTurns: NumericSeries = new Array(bars.length).fill(null);
  const bearishTurns: NumericSeries = new Array(bars.length).fill(null);
  let currentTrend = 0;
  let nextTrend = 0;
  let maxLowPrice = bars[0]?.low ?? 0;
  let minHighPrice = bars[0]?.high ?? 0;
  let up = bars[0]?.low ?? 0;
  let down = bars[0]?.high ?? 0;

  for (let index = 0; index < bars.length; index += 1) {
    const start = Math.max(0, index - amplitude + 1);
    let highPrice = bars[start].high;
    let lowPrice = bars[start].low;
    for (let cursor = start + 1; cursor <= index; cursor += 1) {
      highPrice = Math.max(highPrice, bars[cursor].high);
      lowPrice = Math.min(lowPrice, bars[cursor].low);
    }
    if (nextTrend === 1) {
      maxLowPrice = Math.max(lowPrice, maxLowPrice);
      if (
        highAverage[index] !== null &&
        highAverage[index]! < maxLowPrice &&
        bars[index].close < (bars[index - 1]?.low ?? bars[index].low)
      ) {
        currentTrend = 1;
        nextTrend = 0;
        minHighPrice = highPrice;
      }
    } else {
      minHighPrice = Math.min(highPrice, minHighPrice);
      if (
        lowAverage[index] !== null &&
        lowAverage[index]! > minHighPrice &&
        bars[index].close > (bars[index - 1]?.high ?? bars[index].high)
      ) {
        currentTrend = 0;
        nextTrend = 1;
        maxLowPrice = lowPrice;
      }
    }

    const previousTrend = trend[index - 1] ?? currentTrend;
    if (currentTrend === 0) {
      up = previousTrend !== 0 ? (line[index - 1] ?? maxLowPrice) : Math.max(maxLowPrice, up);
      line[index] = up;
      if (previousTrend === 1) bullishTurns[index] = bars[index].low;
    } else {
      down = previousTrend !== 1 ? (line[index - 1] ?? minHighPrice) : Math.min(minHighPrice, down);
      line[index] = down;
      if (previousTrend === 0) bearishTurns[index] = bars[index].high;
    }
    trend[index] = currentTrend;
    const deviation = (ranges[index] ?? 0) * 0.5 * finiteValue(channelDeviation, 2);
    atrHigh[index] = line[index] === null ? null : line[index]! + deviation;
    atrLow[index] = line[index] === null ? null : line[index]! - deviation;
  }
  return { trend, line, atrHigh, atrLow, bullishTurns, bearishTurns };
}

function nullableRollingRange(values: NumericSeries, period: number) {
  const minimum: NumericSeries = new Array(values.length).fill(null);
  const maximum: NumericSeries = new Array(values.length).fill(null);
  for (let index = period - 1; index < values.length; index += 1) {
    const window = values.slice(index - period + 1, index + 1);
    if (!window.every((value): value is number => value !== null)) continue;
    minimum[index] = Math.min(...window);
    maximum[index] = Math.max(...window);
  }
  return { minimum, maximum };
}

export function schaffTrendCycle(
  bars: MarketBar[],
  cyclePeriodValue = 10,
  fastPeriodValue = 23,
  slowPeriodValue = 50,
  smoothingFactorValue = 0.5,
) {
  const cyclePeriod = normalizedPeriod(cyclePeriodValue, 10);
  const fastPeriod = normalizedPeriod(fastPeriodValue, 23);
  const slowPeriod = normalizedPeriod(slowPeriodValue, 50);
  const factor = Math.min(Math.max(finiteValue(smoothingFactorValue, 0.5), 0), 1);
  const closes = bars.map((bar) => bar.close);
  const fast = ema(closes, fastPeriod);
  const slow = ema(closes, slowPeriod);
  const macd: NumericSeries = closes.map((_, index) =>
    fast[index] === null || slow[index] === null ? null : fast[index]! - slow[index]!,
  );
  const firstRange = nullableRollingRange(macd, cyclePeriod);
  const first: NumericSeries = new Array(bars.length).fill(null);
  const firstSmoothed: NumericSeries = new Array(bars.length).fill(null);
  let previousFirst = 0;
  let previousFirstSmoothed = 0;
  for (let index = 0; index < bars.length; index += 1) {
    if (macd[index] === null || firstRange.minimum[index] === null || firstRange.maximum[index] === null) continue;
    const span = firstRange.maximum[index]! - firstRange.minimum[index]!;
    const raw = span > 0 ? ((macd[index]! - firstRange.minimum[index]!) / span) * 100 : previousFirst;
    previousFirst = raw;
    previousFirstSmoothed += factor * (raw - previousFirstSmoothed);
    first[index] = raw;
    firstSmoothed[index] = previousFirstSmoothed;
  }
  const secondRange = nullableRollingRange(firstSmoothed, cyclePeriod);
  const value: NumericSeries = new Array(bars.length).fill(null);
  let previousSecond = 0;
  let previousValue = 0;
  for (let index = 0; index < bars.length; index += 1) {
    if (firstSmoothed[index] === null || secondRange.minimum[index] === null || secondRange.maximum[index] === null) continue;
    const span = secondRange.maximum[index]! - secondRange.minimum[index]!;
    const raw = span > 0 ? ((firstSmoothed[index]! - secondRange.minimum[index]!) / span) * 100 : previousSecond;
    previousSecond = raw;
    previousValue += factor * (raw - previousValue);
    value[index] = previousValue;
  }
  return { value, macd, first, firstSmoothed };
}

interface QqePath {
  rsiMa: NumericSeries;
  trailingLevel: NumericSeries;
  trend: number[];
}

function qqePath(
  closes: readonly number[],
  rsiPeriodValue: number,
  smoothingPeriodValue: number,
  multiplier: number,
): QqePath {
  const rsiPeriod = normalizedPeriod(rsiPeriodValue, 6);
  const smoothingPeriod = normalizedPeriod(smoothingPeriodValue, 5);
  const rsiValues = rsi([...closes], rsiPeriod);
  const rsiMa = nullableEma(rsiValues, smoothingPeriod);
  const changes: NumericSeries = rsiMa.map((value, index) =>
    value === null || rsiMa[index - 1] === null ? null : Math.abs(value - rsiMa[index - 1]!),
  );
  const wildersPeriod = rsiPeriod * 2 - 1;
  const smoothedChanges = nullableEma(nullableEma(changes, wildersPeriod), wildersPeriod);
  const trailingLevel: NumericSeries = new Array(closes.length).fill(null);
  const trend = new Array(closes.length).fill(1);
  let longBand = 0;
  let shortBand = 0;
  let currentTrend = 1;
  for (let index = 0; index < closes.length; index += 1) {
    const current = rsiMa[index];
    const previous = rsiMa[index - 1];
    const range = smoothedChanges[index];
    if (current === null || range === null) continue;
    const newLongBand = current - range * multiplier;
    const newShortBand = current + range * multiplier;
    const previousLongBand = longBand;
    const previousShortBand = shortBand;
    longBand = previous !== null && previous > previousLongBand && current > previousLongBand
      ? Math.max(previousLongBand, newLongBand)
      : newLongBand;
    shortBand = previous !== null && previous < previousShortBand && current < previousShortBand
      ? Math.min(previousShortBand, newShortBand)
      : newShortBand;
    if (previous !== null && previous <= previousShortBand && current > previousShortBand) currentTrend = 1;
    else if (previous !== null && previous >= previousLongBand && current < previousLongBand) currentTrend = -1;
    trend[index] = currentTrend;
    trailingLevel[index] = currentTrend === 1 ? longBand : shortBand;
  }
  return { rsiMa, trailingLevel, trend };
}

export function qqeMod(
  bars: MarketBar[],
  rsiPeriod = 6,
  smoothingPeriod = 5,
  primaryMultiplier = 3,
  secondaryMultiplier = 1.61,
  bollingerPeriodValue = 50,
  bollingerMultiplier = 0.35,
) {
  const closes = bars.map((bar) => bar.close);
  const primary = qqePath(closes, rsiPeriod, smoothingPeriod, primaryMultiplier);
  const secondary = qqePath(closes, rsiPeriod, smoothingPeriod, secondaryMultiplier);
  const centeredPrimary: NumericSeries = primary.trailingLevel.map((value) => value === null ? null : value - 50);
  const centeredSecondary: NumericSeries = secondary.rsiMa.map((value) => value === null ? null : value - 50);
  const bollingerPeriod = normalizedPeriod(bollingerPeriodValue, 50);
  const basis = sma(centeredPrimary.map((value) => value ?? 0), bollingerPeriod);
  const upper: NumericSeries = new Array(bars.length).fill(null);
  const lower: NumericSeries = new Array(bars.length).fill(null);
  for (let index = bollingerPeriod - 1; index < bars.length; index += 1) {
    if (centeredPrimary[index] === null) continue;
    const window = centeredPrimary.slice(index - bollingerPeriod + 1, index + 1);
    if (!window.every((value): value is number => value !== null)) continue;
    const deviation = standardDeviation(window, 0, window.length - 1) * bollingerMultiplier;
    upper[index] = basis[index] === null ? null : basis[index]! + deviation;
    lower[index] = basis[index] === null ? null : basis[index]! - deviation;
  }
  const bullish = new Array(bars.length).fill(false);
  const bearish = new Array(bars.length).fill(false);
  for (let index = 0; index < bars.length; index += 1) {
    bullish[index] = centeredSecondary[index] !== null && upper[index] !== null && centeredSecondary[index]! > 3 && centeredPrimary[index]! > upper[index]!;
    bearish[index] = centeredSecondary[index] !== null && lower[index] !== null && centeredSecondary[index]! < -3 && centeredPrimary[index]! < lower[index]!;
  }
  return { primary: centeredPrimary, secondary: centeredSecondary, upper, lower, bullish, bearish };
}

export interface VolumeProfileBin {
  price: number;
  low: number;
  high: number;
  volume: number;
  inValueArea: boolean;
  isPointOfControl: boolean;
}

function profileForBars(bars: readonly MarketBar[], rows: number, valueAreaPercent: number) {
  if (bars.length === 0) return { poc: null, vah: null, val: null, bins: [] as VolumeProfileBin[] };
  const low = Math.min(...bars.map((bar) => bar.low));
  const high = Math.max(...bars.map((bar) => bar.high));
  const step = Math.max((high - low) / rows, Number.EPSILON);
  const volumes = new Array(rows).fill(0);
  for (const bar of bars) {
    const barRange = bar.high - bar.low;
    if (barRange <= 0) {
      const row = Math.min(rows - 1, Math.max(0, Math.floor(((bar.close - low) / step))));
      volumes[row] += bar.volume;
      continue;
    }
    for (let row = 0; row < rows; row += 1) {
      const rowLow = low + row * step;
      const rowHigh = row === rows - 1 ? high : rowLow + step;
      const overlap = Math.max(0, Math.min(bar.high, rowHigh) - Math.max(bar.low, rowLow));
      if (overlap > 0) volumes[row] += bar.volume * (overlap / barRange);
    }
  }
  let pocIndex = 0;
  for (let row = 1; row < rows; row += 1) if (volumes[row] > volumes[pocIndex]) pocIndex = row;
  const target = volumes.reduce((sum, value) => sum + value, 0) * Math.min(Math.max(valueAreaPercent, 1), 100) / 100;
  let lowerIndex = pocIndex;
  let upperIndex = pocIndex;
  let covered = volumes[pocIndex];
  while (covered < target && (lowerIndex > 0 || upperIndex < rows - 1)) {
    const below = lowerIndex > 0 ? volumes[lowerIndex - 1] : -1;
    const above = upperIndex < rows - 1 ? volumes[upperIndex + 1] : -1;
    if (above >= below) {
      upperIndex += 1;
      covered += volumes[upperIndex];
    } else {
      lowerIndex -= 1;
      covered += volumes[lowerIndex];
    }
  }
  const bins = volumes.map((volume, row) => ({
    price: low + (row + 0.5) * step,
    low: low + row * step,
    high: row === rows - 1 ? high : low + (row + 1) * step,
    volume,
    inValueArea: row >= lowerIndex && row <= upperIndex,
    isPointOfControl: row === pocIndex,
  }));
  return {
    poc: bins[pocIndex].price,
    vah: bins[upperIndex].high,
    val: bins[lowerIndex].low,
    bins,
  };
}

function sessionKey(bar: MarketBar, intraday: boolean): string {
  const date = bar.time.slice(0, 10);
  return intraday ? date : date.slice(0, 7);
}

export function sessionVolumeProfile(
  bars: MarketBar[],
  rowsValue = 24,
  valueAreaPercent = 70,
) {
  const rows = Math.min(Math.max(normalizedPeriod(rowsValue, 24), 5), 200);
  const poc: NumericSeries = new Array(bars.length).fill(null);
  const vah: NumericSeries = new Array(bars.length).fill(null);
  const val: NumericSeries = new Array(bars.length).fill(null);
  const intraday = bars.some((bar) => bar.time.length > 10);
  let start = 0;
  let key = bars[0] ? sessionKey(bars[0], intraday) : "";
  let latest = { poc: null as number | null, vah: null as number | null, val: null as number | null, bins: [] as VolumeProfileBin[] };
  for (let index = 0; index < bars.length; index += 1) {
    const nextKey = sessionKey(bars[index], intraday);
    if (nextKey !== key) {
      start = index;
      key = nextKey;
    }
    latest = profileForBars(bars.slice(start, index + 1), rows, valueAreaPercent);
    poc[index] = latest.poc;
    vah[index] = latest.vah;
    val[index] = latest.val;
  }
  return { poc, vah, val, bins: latest.bins };
}

export function anchoredVwap(bars: MarketBar[], anchorTimestamp = 0): NumericSeries {
  const output: NumericSeries = new Array(bars.length).fill(null);
  let weighted = 0;
  let volume = 0;
  for (let index = 0; index < bars.length; index += 1) {
    const timestamp = bars[index].timestamp < 1e12 ? bars[index].timestamp * 1000 : bars[index].timestamp;
    if (anchorTimestamp > 0 && timestamp < anchorTimestamp) continue;
    const typical = (bars[index].high + bars[index].low + bars[index].close) / 3;
    weighted += typical * bars[index].volume;
    volume += bars[index].volume;
    output[index] = volume > 0 ? weighted / volume : null;
  }
  return output;
}
