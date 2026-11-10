import { smoothContext, replayContextDirections, type ContextCurves, type ContextObservation } from "./context-replay";
export { smoothContext, replayContextDirections, type ContextCurves, type ContextObservation, type ContextDirection } from "./context-replay";
import { sma, type NumericSeries } from "./indicators";
import { completedNikkeiCycleSeries } from "./strategy-cycle-validation";
import { DAILY_HISTORY_LIMIT } from "@/lib/market/history";
import type { MarketBar, MarketSeries } from "@/lib/market/types";
import { buildWeeklyMarketContext } from "./weekly-market-context";

export const CONTEXT_PERIODS = [20, 60, 200] as const;
export const CONTEXT_QUANTILES = [0.05, 0.10, 0.90, 0.95] as const;

export function buildRawContextCurves(bars: readonly MarketBar[]): ContextCurves {
  if (bars.length > DAILY_HISTORY_LIMIT) throw new Error("Market context exceeds daily history limit");
  const closes = bars.map((bar) => {
    if (!Number.isFinite(bar.close) || bar.close <= 0) throw new Error("Market context requires positive finite closes");
    return bar.close;
  });
  const bias: NumericSeries[] = [];
  const slope: NumericSeries[] = [];
  for (const period of CONTEXT_PERIODS) {
    const mean = sma(closes, period);
    bias.push(mean.map((value, index) => value === null ? null : (closes[index] / value - 1) * 100));
    slope.push(mean.map((value, index) => value === null || mean[index - 1] == null ? null : value - mean[index - 1]!));
  }
  return { bias, slope };
}

/** Linear-interpolated percentiles over the preceding three calendar years. */
export function buildContextQuantiles(times: readonly string[], values: NumericSeries): NumericSeries[] {
  if (times.length !== values.length || times.length > DAILY_HISTORY_LIMIT) throw new Error("Invalid context quantile input length");
  const result = CONTEXT_QUANTILES.map(() => new Array<number | null>(times.length).fill(null));
  const sorted: number[] = [];
  let start = 0;
  const insertionIndex = (value: number) => {
    let low = 0;
    let high = sorted.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (sorted[middle] < value) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  for (let index = 0; index < times.length; index++) {
    const time = times[index];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(time) || (index && time <= times[index - 1])) throw new Error("Context quantiles require ordered daily dates");
    const [year, month, day] = time.split("-").map(Number);
    const cutoffYear = year - 3;
    const cutoffDay = Math.min(day, new Date(Date.UTC(cutoffYear, month, 0)).getUTCDate());
    const cutoff = `${cutoffYear}-${String(month).padStart(2, "0")}-${String(cutoffDay).padStart(2, "0")}`;
    while (start < index && times[start] < cutoff) {
      const expired = values[start++];
      if (expired !== null) sorted.splice(insertionIndex(expired), 1);
    }
    if (sorted.length >= 252) {
      CONTEXT_QUANTILES.forEach((fraction, slot) => {
        const rank = (sorted.length - 1) * fraction;
        const low = Math.floor(rank);
        const high = Math.ceil(rank);
        result[slot][index] = sorted[low] + (sorted[high] - sorted[low]) * (rank - low);
      });
    }
    const value = values[index];
    if (value !== null) {
      if (!Number.isFinite(value)) throw new Error("Context quantiles require finite values");
      sorted.splice(insertionIndex(value), 0, value);
    }
  }
  return result;
}

export function buildContextCurves(bars: readonly MarketBar[]): ContextCurves {
  const raw = buildRawContextCurves(bars);
  return { bias: raw.bias.map(smoothContext), slope: raw.slope.map(smoothContext) };
}

export function completedContextSeries(series: MarketSeries, now = new Date()): MarketSeries {
  if (series.bars.length > DAILY_HISTORY_LIMIT) throw new Error("Market context exceeds daily history limit");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  // Earlier sessions are already complete. Apply the shared close gate only to
  // today's/future tail, avoiding thousands of expensive timezone conversions.
  const confirmedTail = new Set(completedNikkeiCycleSeries({
    ...series, bars: series.bars.filter((bar) => bar.time >= today),
  }, now).bars.map((bar) => bar.time));
  const bars = series.bars.filter((bar) => bar.time < today || confirmedTail.has(bar.time));
  return { ...series, bars };
}

export function buildNikkeiContextMonitor(series: MarketSeries, now = new Date()): ContextObservation | null {
  return buildWeeklyMarketContext(completedContextSeries(series, now).bars).observations.at(-1) ?? null;
}
