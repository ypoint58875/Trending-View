import type { CanonicalMarketSourceDefinition } from "./canonical";
import type {
  MarketBar,
  MarketReferenceSeries,
  MarketSeries,
  MarketSourceProvider,
} from "./types";

export const MINIMUM_RELIABLE_VOLUME_BARS = 20;
export const MINIMUM_RELIABLE_VOLUME_COVERAGE_PERCENT = 90;
export const MISSING_VOLUME_REPAIR_LOOKBACK_BARS = 128;

export type MarketVolumeCoverageStatus =
  | "reliable"
  | "partial"
  | "unavailable"
  | "insufficient-history";

export interface MarketVolumeCoverage {
  barCount: number;
  positiveVolumeBarCount: number;
  coveragePercent: number;
  status: MarketVolumeCoverageStatus;
  reliable: boolean;
}

export function assessMarketVolumeCoverage(
  bars: readonly Pick<MarketBar, "volume">[],
): MarketVolumeCoverage {
  const barCount = bars.length;
  const positiveVolumeBarCount = bars.filter(
    (bar) => Number.isFinite(bar.volume) && bar.volume > 0,
  ).length;
  const coveragePercent =
    barCount > 0 ? (positiveVolumeBarCount / barCount) * 100 : 0;
  const status: MarketVolumeCoverageStatus =
    barCount < MINIMUM_RELIABLE_VOLUME_BARS
      ? "insufficient-history"
      : positiveVolumeBarCount === 0
        ? "unavailable"
        : coveragePercent >= MINIMUM_RELIABLE_VOLUME_COVERAGE_PERCENT
          ? "reliable"
          : "partial";
  return {
    barCount,
    positiveVolumeBarCount,
    coveragePercent,
    status,
    reliable: status === "reliable",
  };
}

export function missingPublishedVolumeRepairKey(
  bars: readonly Pick<MarketBar, "time" | "volume">[],
  lookbackBars = MISSING_VOLUME_REPAIR_LOOKBACK_BARS,
): string {
  const completedCandidates = bars.slice(
    -Math.max(Math.trunc(lookbackBars), MINIMUM_RELIABLE_VOLUME_BARS) - 1,
    -1,
  );
  if (!assessMarketVolumeCoverage(completedCandidates).reliable) return "";
  return completedCandidates
    .filter((bar) => !Number.isFinite(bar.volume) || bar.volume <= 0)
    .map((bar) => bar.time)
    .join(",");
}

export interface MarketSourceQualitySnapshot {
  provider: MarketSourceProvider;
  latencyMs: number;
  barCount: number;
  historyBarCount?: number | null;
  firstDate: string;
  lastDate: string;
  missingDatePercent: number | null;
  meanOpenErrorPercent: number | null;
  meanHighErrorPercent: number | null;
  meanLowErrorPercent: number | null;
  meanCloseErrorPercent: number | null;
  latestDateMatches: boolean | null;
  adjustmentMatches: boolean | null;
  positiveVolumeBarCount?: number | null;
  volumeCoveragePercent?: number | null;
  methodology: string;
  networkRoute: CanonicalMarketSourceDefinition["networkRoute"];
}

function mean(values: readonly number[]): number | null {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function absolutePercentError(reference: number, candidate: number): number {
  return reference === 0
    ? 0
    : (Math.abs(candidate - reference) / Math.abs(reference)) * 100;
}

export function measureMarketSeriesQuality(
  canonical: MarketSeries | null,
  source: MarketSeries,
  definition: CanonicalMarketSourceDefinition,
  latencyMs: number,
): MarketSourceQualitySnapshot {
  const volumeCoverage = assessMarketVolumeCoverage(source.bars);
  const canonicalByDate = new Map(
    canonical?.bars.map((bar) => [bar.time, bar] as const) ?? [],
  );
  const overlap = source.bars
    .map((bar) => {
      const reference = canonicalByDate.get(bar.time);
      return reference ? { reference, source: bar } : null;
    })
    .filter(
      (
        value,
      ): value is {
        reference: MarketSeries["bars"][number];
        source: MarketSeries["bars"][number];
      } => value !== null,
    )
    .slice(-60);
  const sourceDates = new Set(source.bars.map((bar) => bar.time));
  const firstDate = source.bars[0]?.time ?? "";
  const lastDate = source.bars.at(-1)?.time ?? "";
  const referenceDates =
    canonical?.bars
      .filter((bar) => bar.time >= firstDate && bar.time <= lastDate)
      .map((bar) => bar.time) ?? [];
  const missingDates = referenceDates.filter(
    (date) => !sourceDates.has(date),
  ).length;

  return {
    provider: source.source,
    latencyMs,
    barCount: source.bars.length,
    historyBarCount: source.bars.length,
    firstDate,
    lastDate,
    missingDatePercent:
      referenceDates.length > 0
        ? (missingDates / referenceDates.length) * 100
        : null,
    meanOpenErrorPercent: mean(
      overlap.map(({ reference, source: candidate }) =>
        absolutePercentError(reference.open, candidate.open),
      ),
    ),
    meanHighErrorPercent: mean(
      overlap.map(({ reference, source: candidate }) =>
        absolutePercentError(reference.high, candidate.high),
      ),
    ),
    meanLowErrorPercent: mean(
      overlap.map(({ reference, source: candidate }) =>
        absolutePercentError(reference.low, candidate.low),
      ),
    ),
    meanCloseErrorPercent: mean(
      overlap.map(({ reference, source: candidate }) =>
        absolutePercentError(reference.close, candidate.close),
      ),
    ),
    latestDateMatches: canonical
      ? canonical.bars.at(-1)?.time === lastDate
      : null,
    adjustmentMatches: canonical
      ? canonical.priceAdjustment === source.priceAdjustment
      : null,
    positiveVolumeBarCount: volumeCoverage.positiveVolumeBarCount,
    volumeCoveragePercent: volumeCoverage.coveragePercent,
    methodology: definition.methodology,
    networkRoute: definition.networkRoute,
  };
}

export function measureMarketReferenceQuality(
  canonical: MarketSeries | null,
  source: MarketReferenceSeries,
  definition: CanonicalMarketSourceDefinition,
  latencyMs: number,
): MarketSourceQualitySnapshot {
  const canonicalByDate = new Map(
    canonical?.bars.map((bar) => [bar.time, bar.close] as const) ?? [],
  );
  const overlapErrors = source.observations
    .map((observation) => {
      const reference = canonicalByDate.get(observation.time);
      return reference === undefined
        ? null
        : absolutePercentError(reference, observation.value);
    })
    .filter((value): value is number => value !== null)
    .slice(-60);
  const firstDate = source.observations[0]?.time ?? "";
  const lastDate = source.observations.at(-1)?.time ?? "";

  return {
    provider: source.source,
    latencyMs,
    barCount: source.observations.length,
    historyBarCount: source.observations.length,
    firstDate,
    lastDate,
    missingDatePercent: null,
    meanOpenErrorPercent: null,
    meanHighErrorPercent: null,
    meanLowErrorPercent: null,
    meanCloseErrorPercent: mean(overlapErrors),
    latestDateMatches: canonical
      ? canonical.bars.at(-1)?.time === lastDate
      : null,
    adjustmentMatches: null,
    positiveVolumeBarCount: null,
    volumeCoveragePercent: null,
    methodology: definition.methodology,
    networkRoute: definition.networkRoute,
  };
}
