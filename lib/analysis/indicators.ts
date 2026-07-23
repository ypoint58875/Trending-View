import type { MarketBar } from "@/lib/market/types";

export type NumericSeries = Array<number | null>;

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

export function kdj(bars: MarketBar[], period = 9) {
  const k: NumericSeries = new Array(bars.length).fill(null);
  const d: NumericSeries = new Array(bars.length).fill(null);
  const j: NumericSeries = new Array(bars.length).fill(null);
  let currentK = 50;
  let currentD = 50;

  for (let index = period - 1; index < bars.length; index += 1) {
    const window = bars.slice(index - period + 1, index + 1);
    const highest = Math.max(...window.map((bar) => bar.high));
    const lowest = Math.min(...window.map((bar) => bar.low));
    const range = highest - lowest;
    const rsv = range === 0 ? 50 : ((bars[index].close - lowest) / range) * 100;
    currentK = (2 * currentK + rsv) / 3;
    currentD = (2 * currentD + currentK) / 3;
    k[index] = currentK;
    d[index] = currentD;
    j[index] = 3 * currentK - 2 * currentD;
  }

  return { k, d, j };
}

export function obv(bars: MarketBar[]): NumericSeries {
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

