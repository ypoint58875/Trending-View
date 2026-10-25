import { canonicalMarketInstrumentKey } from "./canonical";
import { classifyMarketProviderError } from "./provider-errors";
import { normalizeMarketBars } from "./series";
import { resolveLatestDailyBarStatus } from "./session";
import type { MarketBar, MarketSeries } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_BAR_COUNT = 10;
const MAX_OVERLAP_ERROR = 0.0001;

function tokyoParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`,
    minute: Number(values.hour) * 60 + Number(values.minute) };
}

function weekday(time: number) {
  const day = new Date(time).getUTCDay();
  return day !== 0 && day !== 6;
}

/** Weekdays are probe hints only. Official data, never this hint, proves a session existed. */
export function nikkeiNeedsMissingBarProbe(series: MarketSeries, now = new Date()): boolean {
  if (series.interval !== "1d" || canonicalMarketInstrumentKey(series.instrument) !== "index:N225") return false;
  const bars = normalizeMarketBars(series.bars);
  if (bars.length < 2) return false;
  const current = tokyoParts(now);
  let expected = Date.parse(`${current.date}T00:00:00Z`);
  if (current.minute < 15 * 60 + 30) expected -= DAY_MS;
  while (!weekday(expected)) expected -= DAY_MS;
  if (bars.at(-1)!.time < new Date(expected).toISOString().slice(0, 10)) return true;
  const recent = bars.slice(-RECENT_BAR_COUNT);
  for (let i = 1; i < recent.length; i += 1) {
    const previous = Date.parse(`${recent[i - 1]!.time}T00:00:00Z`);
    const next = Date.parse(`${recent[i]!.time}T00:00:00Z`);
    // Only bounded recent gaps are probe candidates; do not walk years of history.
    if (next - previous > 30 * DAY_MS) return true;
    for (let time = previous + DAY_MS; time < next; time += DAY_MS) if (weekday(time)) return true;
  }
  return false;
}

function validOhlc(bar: MarketBar): boolean {
  return [bar.open, bar.high, bar.low, bar.close].every((value) => Number.isFinite(value) && value > 0) &&
    bar.high >= Math.max(bar.open, bar.close) && bar.low <= Math.min(bar.open, bar.close);
}

export function mergeNikkeiMissingBars(
  primary: MarketSeries, official: MarketSeries, now = new Date(),
): MarketSeries {
  if (primary.interval !== "1d" || official.interval !== "1d" || official.source !== "nikkei" ||
    canonicalMarketInstrumentKey(primary.instrument) !== "index:N225" ||
    canonicalMarketInstrumentKey(official.instrument) !== "index:N225") return primary;
  const existing = new Map(primary.bars.map((bar) => [bar.time, bar]));
  const currentDate = tokyoParts(now).date;
  const completed = official.bars.filter((bar) => validOhlc(bar) &&
    resolveLatestDailyBarStatus(bar.time, "JPX", now) === "complete" &&
    (bar.time < currentDate || official.latestBarStatus === "complete"));
  const overlap = completed.filter((bar) => existing.has(bar.time)).slice(-RECENT_BAR_COUNT);
  if (overlap.length < 2 || overlap.some((bar) => {
    const reference = existing.get(bar.time)!;
    return (["open", "high", "low", "close"] as const).some((field) =>
      !Number.isFinite(reference[field]) || reference[field] <= 0 ||
      Math.abs(bar[field] / reference[field] - 1) > MAX_OVERLAP_ERROR);
  })) return primary;
  const firstTime = primary.bars[0]!.time;
  const additions = completed.filter((bar) => bar.time >= firstTime && !existing.has(bar.time));
  if (!additions.length) return primary;
  const allBars = normalizeMarketBars([...primary.bars, ...additions.map((bar) => ({
    ...bar, ohlcSource: { provider: "nikkei" as const, fetchedAt: official.fetchedAt },
  }))]);
  const sliceStart = Math.max(0, allBars.length - 10_000);
  const bars = allBars.slice(sliceStart);
  return {
    ...primary, bars, fetchedAt: official.fetchedAt,
    previousClose: sliceStart > 0 ? allBars[sliceStart - 1]!.close : primary.previousClose,
    latestBarStatus: bars.at(-1)!.time > primary.bars.at(-1)!.time ? "complete" : primary.latestBarStatus,
  };
}

export async function supplementNikkeiMissingBars(
  series: MarketSeries, loadOfficial: () => Promise<MarketSeries>, now = new Date(),
): Promise<MarketSeries> {
  if (!nikkeiNeedsMissingBarProbe(series, now)) return series;
  try {
    return mergeNikkeiMissingBars(series, await loadOfficial(), now);
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    console.warn("Nikkei missing-date supplement unavailable", { errorCode: classifyMarketProviderError(error) });
    return series;
  }
}
