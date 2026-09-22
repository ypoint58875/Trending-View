import {
  readCanonicalMarketSeriesEntry,
  readMarketSourceHealth,
  recordMarketSourceAttempt,
  writeCanonicalMarketSeries,
  writeMarketSourceSnapshot,
} from "./canonical-cache";
import {
  canonicalSeriesNeedsFullHistoryReplacement,
  resolveCanonicalMarketProfile,
  type CanonicalMarketSourceDefinition,
} from "./canonical";
import { DAILY_HISTORY_LIMIT } from "./history";
import { measureMarketSeriesQuality } from "./quality";
import {
  mergeCanonicalMarketSeries,
  mergePreferredTemporaryQuote,
  selectCanonicalFallbackSeries,
  temporaryQuoteFromMarketSeries,
  type CanonicalFallbackCandidate,
} from "./series";
import {
  orderMarketRecoveryDefinitions,
  selectMarketSourceByRollingHealth,
} from "./source-health";
import type {
  MarketInstrument,
  MarketSeries,
  MarketTemporaryQuote,
} from "./types";

const DAILY_INTERVAL = "1d";

export interface ShortcutMarketRefreshResult {
  canonicalSeries: MarketSeries;
  displayedSeries: MarketSeries;
  temporaryQuote: MarketTemporaryQuote | null;
  status: "primary" | "backup" | "retained";
}

export interface ShortcutMarketRefreshOptions {
  signal: AbortSignal;
  previousTemporaryQuote?: MarketTemporaryQuote | null;
  fetcher?: typeof fetch;
}

function isMarketSeries(value: unknown): value is MarketSeries {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<MarketSeries>;
  return (
    Boolean(candidate.instrument) &&
    candidate.interval === DAILY_INTERVAL &&
    Array.isArray(candidate.bars) &&
    candidate.bars.length > 0 &&
    typeof candidate.source === "string" &&
    typeof candidate.fetchedAt === "string"
  );
}

async function requestMarketSeries(
  definition: CanonicalMarketSourceDefinition & {
    instrument: MarketInstrument;
  },
  mode: "history" | "latest",
  limit: number,
  options: ShortcutMarketRefreshOptions,
): Promise<MarketSeries> {
  const params = new URLSearchParams({
    secid: definition.instrument.secid,
    code: definition.instrument.code,
    name: definition.instrument.name,
    exchange: definition.instrument.exchange,
    provider: definition.instrument.provider,
    assetType: definition.instrument.assetType,
    interval: DAILY_INTERVAL,
    limit: String(limit),
    mode,
    strictProvider: "1",
    audit: "1",
  });
  const response = await (options.fetcher ?? fetch)(
    `/api/market?${params}`,
    {
      signal: options.signal,
      cache: mode === "latest" ? "no-store" : "no-cache",
    },
  );
  const payload = (await response.json()) as unknown;
  if (
    !response.ok ||
    !isMarketSeries(payload) ||
    "error" in payload
  ) {
    throw new Error(
      payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof payload.error === "string"
        ? payload.error
        : "UPSTREAM_UNAVAILABLE",
    );
  }
  return payload;
}

export async function refreshShortcutMarketInstrument(
  instrument: MarketInstrument,
  options: ShortcutMarketRefreshOptions,
): Promise<ShortcutMarketRefreshResult | null> {
  const profile = resolveCanonicalMarketProfile(instrument);
  const cached = await readCanonicalMarketSeriesEntry(
    profile.primary.instrument,
    DAILY_INTERVAL,
  );
  let canonical = cached?.series ?? null;
  const replacesHistory = canonical
    ? canonicalSeriesNeedsFullHistoryReplacement(profile, canonical)
    : false;
  const mode = canonical && !replacesHistory ? "latest" : "history";
  const limit = canonical && !replacesHistory ? 5 : DAILY_HISTORY_LIMIT;
  let knownHealth = await readMarketSourceHealth(profile.key);

  const loadTrackedSeries = async (
    definition: CanonicalMarketSourceDefinition & {
      instrument: MarketInstrument;
    },
    requestMode: "history" | "latest",
    requestLimit: number,
  ) => {
    const startedAt = performance.now();
    try {
      const source = await requestMarketSeries(
        definition,
        requestMode,
        requestLimit,
        options,
      );
      const latencyMs = performance.now() - startedAt;
      await writeMarketSourceSnapshot(source, profile, requestMode);
      await recordMarketSourceAttempt({
        instrumentKey: profile.key,
        provider: definition.provider,
        success: true,
        latencyMs,
        quality: measureMarketSeriesQuality(
          canonical,
          source,
          definition,
          latencyMs,
        ),
      });
      knownHealth = await readMarketSourceHealth(profile.key);
      return source;
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        await recordMarketSourceAttempt({
          instrumentKey: profile.key,
          provider: definition.provider,
          success: false,
          latencyMs: performance.now() - startedAt,
          errorCode: (error as Error).message || "UNKNOWN",
        });
        knownHealth = await readMarketSourceHealth(profile.key);
      }
      throw error;
    }
  };

  const initialSelection = selectMarketSourceByRollingHealth(
    profile,
    knownHealth,
  );
  if (
    !initialSelection.configuredPrimaryDegraded ||
    initialSelection.shouldProbeConfiguredPrimary
  ) {
    try {
      const primary = await loadTrackedSeries(profile.primary, mode, limit);
      canonical = mergeCanonicalMarketSeries(
        canonical,
        primary,
        DAILY_HISTORY_LIMIT,
        profile,
      );
      await writeCanonicalMarketSeries(canonical, profile);
      return {
        canonicalSeries: canonical,
        displayedSeries: canonical,
        temporaryQuote: null,
        status: "primary",
      };
    } catch (error) {
      if ((error as Error).name === "AbortError") throw error;
    }
  }

  const temporaryQuotes: MarketTemporaryQuote[] = [];
  const candidates: CanonicalFallbackCandidate[] = [];
  const recoveryDefinitions = orderMarketRecoveryDefinitions(
    profile,
    knownHealth,
  );
  for (const definition of recoveryDefinitions) {
    try {
      const source = await loadTrackedSeries(
        definition,
        canonical && !replacesHistory ? "latest" : "history",
        canonical && !replacesHistory ? 10 : DAILY_HISTORY_LIMIT,
      );
      candidates.push({ definition, series: source });
      const quote = canonical
        ? temporaryQuoteFromMarketSeries(
            source,
            canonical,
            profile,
          )
        : null;
      if (quote) temporaryQuotes.push(quote);
    } catch (error) {
      if ((error as Error).name === "AbortError") throw error;
    }
  }

  const promoted = selectCanonicalFallbackSeries(
    canonical,
    candidates,
    DAILY_HISTORY_LIMIT,
    profile,
  );
  if (promoted) {
    canonical = promoted;
    await writeCanonicalMarketSeries(canonical, profile);
    const displayed = mergePreferredTemporaryQuote(
      canonical,
      [
        ...temporaryQuotes,
        options.previousTemporaryQuote,
      ],
      DAILY_HISTORY_LIMIT,
    );
    return {
      canonicalSeries: canonical,
      displayedSeries: displayed.series,
      temporaryQuote: displayed.quote,
      status: "backup",
    };
  }

  if (!canonical) return null;
  const displayed = mergePreferredTemporaryQuote(
    canonical,
    [...temporaryQuotes, options.previousTemporaryQuote],
    DAILY_HISTORY_LIMIT,
  );
  return {
    canonicalSeries: canonical,
    displayedSeries: displayed.series,
    temporaryQuote: displayed.quote,
    status: temporaryQuotes.length > 0 ? "backup" : "retained",
  };
}
