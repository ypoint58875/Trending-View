import type { MarketInterval } from "./types";

export const DAILY_HISTORY_START_DATE = "2000-01-01";
export const DAILY_HISTORY_START_COMPACT = "20000101";
export const DAILY_HISTORY_START_TIMESTAMP_SECONDS = 946_684_800;
export const DAILY_HISTORY_COVERAGE_CUTOFF_DATE = "2000-01-31";
export const DAILY_HISTORY_LIMIT = 10_000;
export const STANDARD_PROVIDER_LIMIT = 1_500;

export function clampMarketSeriesLimit(
  requestedLimit: number,
  interval: MarketInterval,
): number {
  const fallback = interval === "1d" ? DAILY_HISTORY_LIMIT : 1_000;
  const normalized = Number.isFinite(requestedLimit)
    ? Math.trunc(requestedLimit)
    : fallback;
  const maximum =
    interval === "1d" ? DAILY_HISTORY_LIMIT : STANDARD_PROVIDER_LIMIT;
  return Math.min(Math.max(normalized, 2), maximum);
}

export function requestsExtendedDailyHistory(
  interval: MarketInterval,
  requestedLimit: number,
): boolean {
  return (
    interval === "1d" &&
    clampMarketSeriesLimit(requestedLimit, interval) >
      STANDARD_PROVIDER_LIMIT
  );
}
