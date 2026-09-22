import {
  canonicalSeriesNeedsFullHistoryReplacement,
  canonicalMarketInstrumentKey,
  type CanonicalMarketSourceDefinition,
  type CanonicalMarketProfile,
} from "./canonical";
import type {
  MarketSeries,
  MarketTemporaryQuote,
} from "./types";

export interface CanonicalFallbackCandidate {
  definition: CanonicalMarketSourceDefinition & {
    role: "backup";
    capability: "ohlcv";
    instrument: MarketSeries["instrument"];
    promotionPolicy: "verified-identity" | "overlap-required";
  };
  series: MarketSeries;
}

function preservePublishedVolume(
  previous: MarketSeries["bars"][number] | undefined,
  incoming: MarketSeries["bars"][number],
): MarketSeries["bars"][number] {
  if (incoming.volume > 0 || !previous || previous.volume <= 0) {
    return incoming;
  }
  return {
    ...incoming,
    volume: previous.volume,
  };
}

function backfillMissingPublishedVolume(
  previous: MarketSeries["bars"][number],
  incoming: MarketSeries["bars"][number],
): MarketSeries["bars"][number] {
  if (
    previous.time !== incoming.time ||
    previous.volume > 0 ||
    incoming.volume <= 0
  ) {
    return previous;
  }
  return {
    ...previous,
    volume: incoming.volume,
  };
}

export function compareMarketBarsByTime(
  left: MarketSeries["bars"][number],
  right: MarketSeries["bars"][number],
): number {
  return left.time.localeCompare(right.time) || left.timestamp - right.timestamp;
}

export function normalizeMarketBars(
  bars: readonly MarketSeries["bars"][number][],
  limit = Number.MAX_SAFE_INTEGER,
): MarketSeries["bars"] {
  const barsByTime = new Map<string, MarketSeries["bars"][number]>();
  bars.forEach((bar) => barsByTime.set(bar.time, bar));
  return [...barsByTime.values()]
    .sort(compareMarketBarsByTime)
    .slice(-Math.max(Math.trunc(limit), 1));
}

function latestMarketBar(bars: readonly MarketSeries["bars"][number][]) {
  return normalizeMarketBars(bars).at(-1);
}

export function canMergeLatestMarketSeries(
  history: MarketSeries,
  latest: MarketSeries,
): boolean {
  return (
    history.interval === latest.interval &&
    history.source === latest.source &&
    history.priceAdjustment === latest.priceAdjustment
  );
}

export function mergeLatestMarketSeries(
  history: MarketSeries,
  latest: MarketSeries,
  limit: number,
): MarketSeries {
  if (!canMergeLatestMarketSeries(history, latest)) {
    throw new Error(
      "Market series must share an interval, source, and price adjustment",
    );
  }

  const barsByTime = new Map(
    history.bars.map((bar) => [bar.time, bar] as const),
  );
  latest.bars.forEach((bar) =>
    barsByTime.set(
      bar.time,
      preservePublishedVolume(barsByTime.get(bar.time), bar),
    ),
  );
  const bars = normalizeMarketBars(
    Array.from(barsByTime.values()),
    limit,
  );
  return {
    ...history,
    instrument: latest.instrument,
    previousClose: latest.previousClose || history.previousClose,
    bars,
    latestBarStatus: latest.latestBarStatus,
    source: latest.source,
    fetchedAt: latest.fetchedAt,
  };
}

export function mergeCanonicalMarketSeries(
  existing: MarketSeries | null,
  primary: MarketSeries,
  limit: number,
  profile: CanonicalMarketProfile,
): MarketSeries {
  if (
    primary.source !== profile.primary.provider ||
    canonicalMarketInstrumentKey(primary.instrument) !== profile.key
  ) {
    throw new Error(
      "Primary market series does not match the canonical market profile",
    );
  }
  if (!existing) {
    return {
      ...primary,
      instrument: profile.primary.instrument,
      bars: normalizeMarketBars(primary.bars, limit),
    };
  }
  if (
    existing.interval !== primary.interval ||
    canonicalMarketInstrumentKey(existing.instrument) !== profile.key
  ) {
    throw new Error(
      "Existing market series does not match the canonical market profile",
    );
  }
  if (existing.priceAdjustment !== primary.priceAdjustment) {
    return {
      ...primary,
      instrument: profile.primary.instrument,
      bars: normalizeMarketBars(primary.bars, limit),
    };
  }

  const mutableDate =
    existing.latestBarStatus !== "complete"
      ? latestMarketBar(existing.bars)?.time ?? null
      : null;
  const barsByTime = new Map(
    existing.bars.map((bar) => [bar.time, bar] as const),
  );
  for (const bar of primary.bars) {
    const existingBar = barsByTime.get(bar.time);
    if (!existingBar || bar.time === mutableDate) {
      barsByTime.set(
        bar.time,
        preservePublishedVolume(existingBar, bar),
      );
    } else if (existing.source === primary.source) {
      barsByTime.set(
        bar.time,
        backfillMissingPublishedVolume(existingBar, bar),
      );
    }
  }
  const bars = normalizeMarketBars(
    Array.from(barsByTime.values()),
    limit,
  );
  const primaryLatestDate = latestMarketBar(primary.bars)?.time;
  const mergedLatestDate = bars.at(-1)?.time;

  return {
    ...primary,
    instrument: profile.primary.instrument,
    previousClose: existing.previousClose || primary.previousClose,
    bars,
    latestBarStatus:
      primaryLatestDate === mergedLatestDate
        ? primary.latestBarStatus
        : existing.latestBarStatus,
  };
}

function mean(values: readonly number[]): number {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : Number.POSITIVE_INFINITY;
}

function relativeErrorPercent(reference: number, candidate: number): number {
  return reference === 0
    ? Number.POSITIVE_INFINITY
    : (Math.abs(candidate - reference) / Math.abs(reference)) * 100;
}

function fallbackOverlapQuality(
  existing: MarketSeries,
  candidate: MarketSeries,
) {
  const existingByDate = new Map(
    existing.bars.map((bar) => [bar.time, bar] as const),
  );
  const overlap = candidate.bars
    .map((bar) => {
      const reference = existingByDate.get(bar.time);
      return reference ? { reference, candidate: bar } : null;
    })
    .filter(
      (
        value,
      ): value is {
        reference: MarketSeries["bars"][number];
        candidate: MarketSeries["bars"][number];
      } => value !== null,
    )
    .slice(-60);
  return {
    count: overlap.length,
    meanCloseErrorPercent: mean(
      overlap.map(({ reference, candidate: bar }) =>
        relativeErrorPercent(reference.close, bar.close),
      ),
    ),
    meanOhlcErrorPercent: mean(
      overlap.flatMap(({ reference, candidate: bar }) => [
        relativeErrorPercent(reference.open, bar.open),
        relativeErrorPercent(reference.high, bar.high),
        relativeErrorPercent(reference.low, bar.low),
        relativeErrorPercent(reference.close, bar.close),
      ]),
    ),
  };
}

function isPromotableFallback(
  existing: MarketSeries | null,
  candidate: CanonicalFallbackCandidate,
  profile: CanonicalMarketProfile,
): boolean {
  const { definition, series } = candidate;
  if (
    series.source !== definition.provider ||
    canonicalMarketInstrumentKey(series.instrument) !== profile.key ||
    series.bars.length < 2
  ) {
    return false;
  }
  if (!existing) {
    return definition.promotionPolicy === "verified-identity";
  }
  if (
    existing.interval !== series.interval ||
    canonicalMarketInstrumentKey(existing.instrument) !== profile.key ||
    (latestMarketBar(series.bars)?.time ?? "") <
      (latestMarketBar(existing.bars)?.time ?? "")
  ) {
    return false;
  }

  const quality = fallbackOverlapQuality(existing, series);
  if (
    definition.promotionPolicy === "verified-identity" &&
    canonicalSeriesNeedsFullHistoryReplacement(profile, existing) &&
    !canonicalSeriesNeedsFullHistoryReplacement(profile, series) &&
    series.bars.length >= existing.bars.length
  ) {
    return true;
  }
  if (
    existing.instrument.assetType === "etf" &&
    existing.priceAdjustment !== series.priceAdjustment &&
    (quality.count < 10 || quality.meanCloseErrorPercent > 1)
  ) {
    return false;
  }
  if (definition.promotionPolicy === "verified-identity") {
    return (
      quality.count === 0 ||
      (quality.meanCloseErrorPercent <= 5 &&
        quality.meanOhlcErrorPercent <= 7)
    );
  }
  return (
    quality.count >= 5 &&
    quality.meanCloseErrorPercent <= 2 &&
    quality.meanOhlcErrorPercent <= 3
  );
}

export function mergeVerifiedFallbackMarketSeries(
  existing: MarketSeries | null,
  fallback: MarketSeries,
  limit: number,
): MarketSeries {
  if (!existing || existing.priceAdjustment !== fallback.priceAdjustment) {
    return {
      ...fallback,
      bars: normalizeMarketBars(fallback.bars, limit),
    };
  }
  const mutableDate =
    existing.latestBarStatus === "complete"
      ? null
      : latestMarketBar(existing.bars)?.time ?? null;
  const barsByTime = new Map(
    existing.bars.map((bar) => [bar.time, bar] as const),
  );
  for (const bar of fallback.bars) {
    if (!barsByTime.has(bar.time) || bar.time === mutableDate) {
      barsByTime.set(
        bar.time,
        preservePublishedVolume(barsByTime.get(bar.time), bar),
      );
    }
  }
  const bars = normalizeMarketBars(
    Array.from(barsByTime.values()),
    limit,
  );
  const fallbackLatestDate = latestMarketBar(fallback.bars)?.time;
  const mergedLatestDate = bars.at(-1)?.time;
  return {
    ...fallback,
    previousClose: existing.previousClose || fallback.previousClose,
    bars,
    latestBarStatus:
      fallbackLatestDate === mergedLatestDate
        ? fallback.latestBarStatus
        : existing.latestBarStatus,
  };
}

export function selectCanonicalFallbackSeries(
  existing: MarketSeries | null,
  candidates: readonly CanonicalFallbackCandidate[],
  limit: number,
  profile: CanonicalMarketProfile,
): MarketSeries | null {
  const eligible = candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) =>
      isPromotableFallback(existing, candidate, profile),
    )
    .sort(
      (left, right) =>
        (latestMarketBar(right.candidate.series.bars)?.time ?? "").localeCompare(
          latestMarketBar(left.candidate.series.bars)?.time ?? "",
        ) ||
        (existing
          ? left.index - right.index ||
            right.candidate.series.bars.length -
              left.candidate.series.bars.length
          : right.candidate.series.bars.length -
              left.candidate.series.bars.length ||
            left.index - right.index),
    );
  const selected = eligible[0]?.candidate.series;
  return selected
    ? mergeVerifiedFallbackMarketSeries(
        existing,
        selected,
        limit,
      )
    : null;
}

export function temporaryQuoteFromMarketSeries(
  source: MarketSeries,
  canonical: MarketSeries,
  profile: CanonicalMarketProfile,
  maximumRelativeDifference = 0.2,
): MarketTemporaryQuote | null {
  if (
    source.source === profile.primary.provider ||
    canonicalMarketInstrumentKey(source.instrument) !== profile.key
  ) {
    return null;
  }
  const sourceBar = latestMarketBar(source.bars);
  const canonicalBar = latestMarketBar(canonical.bars);
  if (
    !sourceBar ||
    !canonicalBar ||
    sourceBar.time < canonicalBar.time ||
    (sourceBar.time === canonicalBar.time &&
      canonical.latestBarStatus === "complete") ||
    !Number.isFinite(sourceBar.close) ||
    sourceBar.close <= 0 ||
    ![
      sourceBar.open,
      sourceBar.high,
      sourceBar.low,
      source.previousClose,
    ].every((value) => Number.isFinite(value) && value > 0) ||
    sourceBar.high < Math.max(sourceBar.open, sourceBar.close) ||
    sourceBar.low > Math.min(sourceBar.open, sourceBar.close)
  ) {
    return null;
  }
  const relativeDifference =
    Math.abs(sourceBar.close - canonicalBar.close) /
    Math.abs(canonicalBar.close);
  if (
    !Number.isFinite(relativeDifference) ||
    relativeDifference > maximumRelativeDifference
  ) {
    return null;
  }
  return {
    instrumentKey: profile.key,
    provider: source.source,
    time: sourceBar.time,
    price: sourceBar.close,
    bar: { ...sourceBar },
    previousClose: source.previousClose,
    latestBarStatus: source.latestBarStatus,
    fetchedAt: source.fetchedAt,
  };
}

export function mergeTemporaryQuoteIntoMarketSeries(
  canonical: MarketSeries,
  quote: MarketTemporaryQuote,
  limit: number,
): MarketSeries {
  const latest = latestMarketBar(canonical.bars);
  if (
    !latest ||
    quote.instrumentKey !== canonicalMarketInstrumentKey(canonical.instrument) ||
    quote.time < latest.time ||
    (quote.time === latest.time &&
      canonical.latestBarStatus === "complete") ||
    quote.bar.time !== quote.time
  ) {
    return canonical;
  }

  const barsByTime = new Map(
    canonical.bars.map((bar) => [bar.time, bar] as const),
  );
  barsByTime.set(
    quote.time,
    preservePublishedVolume(barsByTime.get(quote.time), {
      ...quote.bar,
    }),
  );
  return {
    ...canonical,
    bars: normalizeMarketBars(Array.from(barsByTime.values()), limit),
    latestBarStatus: quote.latestBarStatus,
    fetchedAt: quote.fetchedAt,
  };
}

export interface PreferredTemporaryQuoteResult {
  series: MarketSeries;
  quote: MarketTemporaryQuote | null;
}

export function mergePreferredTemporaryQuote(
  canonical: MarketSeries,
  candidates: readonly (
    | MarketTemporaryQuote
    | null
    | undefined
  )[],
  limit: number,
): PreferredTemporaryQuoteResult {
  const uniqueCandidates = new Map<string, MarketTemporaryQuote>();
  for (const candidate of candidates) {
    if (!candidate) continue;
    const key = `${candidate.instrumentKey}:${candidate.provider}:${candidate.time}`;
    const previous = uniqueCandidates.get(key);
    if (!previous || candidate.fetchedAt > previous.fetchedAt) {
      uniqueCandidates.set(key, candidate);
    }
  }
  const orderedCandidates = [...uniqueCandidates.values()].sort(
    (left, right) =>
      right.time.localeCompare(left.time) ||
      right.fetchedAt.localeCompare(left.fetchedAt),
  );
  for (const quote of orderedCandidates) {
    const series = mergeTemporaryQuoteIntoMarketSeries(
      canonical,
      quote,
      limit,
    );
    if (series !== canonical) return { series, quote };
  }
  return { series: canonical, quote: null };
}
