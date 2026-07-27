import type { MarketBar } from "@/lib/market/types";
import { ema, sma, wma, type NumericSeries } from "./indicators";
import type { StrategyId } from "./strategies";

export const MOVING_AVERAGE_SLOPE_TYPES = ["sma", "ema", "wma"] as const;
export const MAX_MOVING_AVERAGE_SLOPE_PERIOD = 10_000;
export const SCREENING_MOVING_AVERAGE_SLOPE_PERIODS = [
  5,
  6,
  7,
  8,
] as const;
export const SCREENING_MOVING_AVERAGE_SLOPE_MINIMUM_PERCENT = 0;
export const SCREENING_MOVING_AVERAGE_SLOPE_STRATEGY_IDS = [
  "sma-cross",
  "ema-cross",
  "macd-momentum",
  "donchian-breakout",
  "donchian-intrabar",
  "supertrend-trend",
  "supertrend-stop",
  "ichimoku-trend",
  "roc-momentum",
  "tv-bollinger-directed",
  "tv-channel-breakout",
  "tv-keltner-channels",
  "tv-macd",
  "tv-momentum",
  "tv-parabolic-sar",
  "tv-price-channel",
  "tv-supertrend",
  "tv-technical-ratings",
  "tv-volty-expan-close",
] as const satisfies readonly StrategyId[];

const SCREENING_MOVING_AVERAGE_SLOPE_STRATEGY_ID_SET =
  new Set<StrategyId>(SCREENING_MOVING_AVERAGE_SLOPE_STRATEGY_IDS);

export type MovingAverageSlopeType =
  (typeof MOVING_AVERAGE_SLOPE_TYPES)[number];

export interface MovingAverageSlopeFilter {
  movingAverageType: MovingAverageSlopeType;
  period: number;
  minimumSlopePercent: number;
}

export const DEFAULT_MOVING_AVERAGE_SLOPE_FILTER: MovingAverageSlopeFilter = {
  movingAverageType: "ema",
  period: 7,
  minimumSlopePercent: 0,
};

export function buildScreeningMovingAverageSlopeFilters():
  MovingAverageSlopeFilter[] {
  return SCREENING_MOVING_AVERAGE_SLOPE_PERIODS.map((period) => ({
    movingAverageType: "ema",
    period,
    minimumSlopePercent:
      SCREENING_MOVING_AVERAGE_SLOPE_MINIMUM_PERCENT,
  }));
}

export function supportsScreeningMovingAverageSlopeFilter(
  strategyId: StrategyId,
): boolean {
  return SCREENING_MOVING_AVERAGE_SLOPE_STRATEGY_ID_SET.has(strategyId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isValidMovingAverageSlopeFilter(
  value: unknown,
): value is MovingAverageSlopeFilter {
  if (!isRecord(value)) return false;
  return (
    MOVING_AVERAGE_SLOPE_TYPES.includes(
      value.movingAverageType as MovingAverageSlopeType,
    ) &&
    Number.isInteger(value.period) &&
    (value.period as number) >= 2 &&
    (value.period as number) <= MAX_MOVING_AVERAGE_SLOPE_PERIOD &&
    typeof value.minimumSlopePercent === "number" &&
    Number.isFinite(value.minimumSlopePercent)
  );
}

export function parseMovingAverageSlopeFilter(
  value: unknown,
): MovingAverageSlopeFilter | null {
  return isValidMovingAverageSlopeFilter(value)
    ? {
        movingAverageType: value.movingAverageType,
        period: value.period,
        minimumSlopePercent: value.minimumSlopePercent,
      }
    : null;
}

export function cloneMovingAverageSlopeFilter(
  filter: MovingAverageSlopeFilter | null | undefined,
): MovingAverageSlopeFilter | null {
  return filter ? { ...filter } : null;
}

export function movingAverageSlopeFiltersEqual(
  left: MovingAverageSlopeFilter | null | undefined,
  right: MovingAverageSlopeFilter | null | undefined,
): boolean {
  if (!left || !right) return !left && !right;
  return (
    left.movingAverageType === right.movingAverageType &&
    left.period === right.period &&
    Math.abs(left.minimumSlopePercent - right.minimumSlopePercent) < 1e-12
  );
}

function buildMovingAverage(
  values: number[],
  filter: MovingAverageSlopeFilter,
): NumericSeries {
  if (filter.movingAverageType === "sma") {
    return sma(values, filter.period);
  }
  if (filter.movingAverageType === "wma") {
    return wma(values, filter.period);
  }
  return ema(values, filter.period);
}

export function buildMovingAverageSlopeSeries(
  bars: readonly MarketBar[],
  filter: MovingAverageSlopeFilter,
): NumericSeries {
  if (!isValidMovingAverageSlopeFilter(filter)) {
    throw new Error("Invalid moving-average slope entry filter");
  }
  const movingAverage = buildMovingAverage(
    bars.map((bar) => bar.close),
    filter,
  );
  return movingAverage.map((current, index) => {
    const previous = index > 0 ? movingAverage[index - 1] : null;
    if (
      current === null ||
      previous === null ||
      !Number.isFinite(current) ||
      !Number.isFinite(previous) ||
      previous === 0
    ) {
      return null;
    }
    return (current / previous - 1) * 100;
  });
}

export function buildMovingAverageEntryAllowedSeries(
  bars: readonly MarketBar[],
  filter: MovingAverageSlopeFilter | null | undefined,
): boolean[] | null {
  if (!filter) return null;
  return buildMovingAverageSlopeSeries(bars, filter).map(
    (slope) =>
      slope !== null &&
      Number.isFinite(slope) &&
      slope >= filter.minimumSlopePercent,
  );
}

export function resolveMovingAverageEntryAllowedSeries(
  bars: readonly MarketBar[],
  filter: MovingAverageSlopeFilter | null | undefined,
  cached?: readonly boolean[],
): boolean[] | null {
  if (!filter) return null;
  if (cached) {
    if (cached.length !== bars.length) {
      throw new Error("Entry-filter state must align with market bars");
    }
    return [...cached];
  }
  return buildMovingAverageEntryAllowedSeries(bars, filter);
}

export function applyMovingAverageSlopeEntryFilter(
  target: readonly number[],
  entryAllowed: readonly boolean[] | null,
): number[] {
  if (!entryAllowed) return target.map((state) => (state > 0 ? 1 : 0));
  if (target.length !== entryAllowed.length) {
    throw new Error("Entry-filter state must align with strategy target");
  }

  let active = false;
  return target.map((state, index) => {
    const strategyWantsLong = state > 0;
    if (!strategyWantsLong) {
      active = false;
    } else if (!active && entryAllowed[index]) {
      active = true;
    }
    return active ? 1 : 0;
  });
}
