import { replayContextDirections, type ContextCurves } from "./context-replay";
import type { NumericSeries } from "./indicators";
import { DAILY_HISTORY_LIMIT } from "@/lib/market/history";
import type { MarketBar } from "@/lib/market/types";

export const WEEKLY_CONTEXT_PERIODS = [4, 12, 40] as const;
export const WEEKLY_CONTEXT_MODEL = "weekly-4-12-40-daily-3-v1";

/** Developing weekly values use only earlier completed weeks and today's close. */
export function buildRawWeeklyContext(bars: readonly MarketBar[]) {
  if (bars.length > DAILY_HISTORY_LIMIT) throw new Error("Market context exceeds daily history limit");
  const bias: ContextCurves["bias"] = [[], [], []], slope: ContextCurves["slope"] = [[], [], []];
  const means: Array<Array<number | null>> = [];
  const completed: number[] = [];
  let currentWeek = "", lastClose = 0, includeWeek = false;
  for (const [index, bar] of bars.entries()) {
    const date = new Date(`${bar.time}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== bar.time || index && bar.time <= bars[index - 1].time)
      throw new Error("Market context requires ordered valid daily dates");
    if (!Number.isFinite(bar.close) || bar.close <= 0) throw new Error("Market context requires positive finite closes");
    const day = date.getUTCDay();
    if(day===0||day===6)throw new Error("Weekly context requires weekday bars");
    date.setUTCDate(date.getUTCDate() - (day + 6) % 7);
    const week = date.toISOString().slice(0, 10);
    if (week !== currentWeek) {
      if (currentWeek && includeWeek) { completed.push(lastClose); if (completed.length > 40) completed.shift(); }
      includeWeek = Boolean(currentWeek) || bar.time === week;
      currentWeek = week;
    }
    means.push(WEEKLY_CONTEXT_PERIODS.map((period, slot) => {
      const mean = completed.length >= period - 1 ? (completed.slice(-(period - 1)).reduce((sum, value) => sum + value, 0) + bar.close) / period : null;
      const previous = completed.length >= period ? completed.slice(-period).reduce((sum, value) => sum + value, 0) / period : null;
      bias[slot].push(mean === null ? null : 100 * (bar.close / mean - 1));
      slope[slot].push(mean === null || previous === null ? null : mean - previous);
      return mean;
    }));
    lastClose = bar.close;
  }
  return { bias, slope, means };
}

export function smoothWeeklyContext(values: NumericSeries): NumericSeries {
  return values.map((v,i)=>i<2||v===null||values[i-1]===null||values[i-2]===null?null:(v+values[i-1]!+values[i-2]!)/3);
}

export function buildWeeklyMarketContext(bars: readonly MarketBar[]) {
  const raw = buildRawWeeklyContext(bars);
  const curves = { bias: raw.bias.map(smoothWeeklyContext), slope: raw.slope.map(smoothWeeklyContext) };
  return { model: WEEKLY_CONTEXT_MODEL, raw, curves,
    observations: replayContextDirections(bars.map(bar => bar.time), curves) };
}
