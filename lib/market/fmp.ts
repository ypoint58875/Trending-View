import {
  exchangeFromProviderLabels,
  normalizeMarketCode,
} from "./exchanges";
import {
  DAILY_HISTORY_START_DATE,
  clampMarketSeriesLimit,
  requestsExtendedDailyHistory,
} from "./history";
import { resolveLatestDailyBarStatus } from "./session";
import type {
  MarketBar,
  MarketInstrument,
  MarketSeries,
} from "./types";

const FMP_BASE_URL = "https://financialmodelingprep.com/stable";
const FMP_COMMODITY_SYMBOLS: Readonly<Record<string, string>> = {
  "GC=F": "GCUSD",
};

interface FmpSearchItem {
  symbol?: string;
  name?: string;
  exchange?: string;
  exchangeFullName?: string;
  currency?: string;
}

interface FmpDailyRow {
  date?: string;
  open?: number | string;
  high?: number | string;
  low?: number | string;
  close?: number | string;
  volume?: number | string | null;
}

const resolutionCache = new Map<string, MarketInstrument>();

function configuredApiKey(): string | null {
  if (typeof process === "undefined") return null;
  const key = process.env.FMP_API_KEY?.trim();
  return key ? key : null;
}

export function hasFmpApiKey(): boolean {
  return configuredApiKey() !== null;
}

async function fetchFmpJson<T>(
  url: URL,
  apiKey: string,
  fetchImpl: typeof fetch,
  requestCache: RequestCache,
): Promise<T> {
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      apikey: apiKey,
      "User-Agent": "QuantScope/1.0 market-research-dashboard",
    },
    signal: AbortSignal.timeout(12_000),
    ...(requestCache === "no-store" ? { cache: requestCache } : {}),
  });
  if (!response.ok) {
    throw new Error(`FMP request failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

async function searchRawFmp(
  query: string,
  fetchImpl: typeof fetch,
  apiKey: string,
): Promise<FmpSearchItem[]> {
  const url = new URL(`${FMP_BASE_URL}/search-symbol`);
  url.searchParams.set("query", query.slice(0, 40));
  url.searchParams.set("limit", "12");
  const payload = await fetchFmpJson<
    FmpSearchItem[] | { message?: string }
  >(url, apiKey, fetchImpl, "default");
  return Array.isArray(payload) ? payload : [];
}

function materializeFmpInstrument(
  item: FmpSearchItem,
  assetType: MarketInstrument["assetType"],
): MarketInstrument | null {
  const symbol = item.symbol?.trim();
  if (!symbol) return null;
  return {
    secid: symbol,
    code: normalizeMarketCode(symbol),
    name: item.name?.trim() || symbol,
    exchange: exchangeFromProviderLabels(
      `${item.exchange ?? ""} ${item.exchangeFullName ?? ""}`,
      symbol,
    ),
    assetType,
    provider: "fmp",
  };
}

export async function searchFmpIndexes(
  query: string,
  fetchImpl: typeof fetch = fetch,
  apiKey: string | null = configuredApiKey(),
): Promise<MarketInstrument[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery || !apiKey) return [];
  return (await searchRawFmp(normalizedQuery, fetchImpl, apiKey))
    .filter((item) => item.symbol?.startsWith("^"))
    .map((item) => materializeFmpInstrument(item, "index"))
    .filter(
      (instrument): instrument is MarketInstrument => instrument !== null,
    )
    .slice(0, 8);
}

async function resolveFmpInstrument(
  instrument: MarketInstrument,
  fetchImpl: typeof fetch,
  apiKey: string,
): Promise<MarketInstrument> {
  if (instrument.assetType === "commodity") {
    const commoditySymbol =
      FMP_COMMODITY_SYMBOLS[normalizeMarketCode(instrument.code)];
    if (!commoditySymbol) {
      throw new Error("FMP does not support this commodity mapping");
    }
    return {
      ...instrument,
      secid: commoditySymbol,
      code: normalizeMarketCode(instrument.code),
      exchange: "COMEX",
      assetType: "commodity",
      provider: "fmp",
    };
  }
  const cacheKey = `${instrument.assetType}:${normalizeMarketCode(
    instrument.code,
  )}:${instrument.exchange}`;
  const cached = resolutionCache.get(cacheKey);
  if (cached) return cached;
  if (instrument.provider === "fmp" && instrument.secid.trim()) {
    resolutionCache.set(cacheKey, instrument);
    return instrument;
  }
  const normalizedCode = normalizeMarketCode(instrument.code);
  const matches = (await searchRawFmp(
    instrument.code,
    fetchImpl,
    apiKey,
  ))
    .map((item) => materializeFmpInstrument(item, instrument.assetType))
    .filter(
      (candidate): candidate is MarketInstrument => candidate !== null,
    )
    .filter(
      (candidate) =>
        normalizeMarketCode(candidate.code) === normalizedCode,
    );
  const resolved =
    matches.find(
      (candidate) =>
        instrument.exchange === "OTHER" ||
        candidate.exchange === instrument.exchange,
    ) ?? (matches.length === 1 ? matches[0] : null);
  if (!resolved) {
    throw new Error(
      "FMP could not resolve an exact exchange-local instrument",
    );
  }
  resolutionCache.set(cacheKey, resolved);
  return resolved;
}

function numeric(value: number | string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function parseFmpDailyRows(
  rows: readonly FmpDailyRow[],
  instrument: MarketInstrument,
  fetchedAt = new Date(),
): MarketSeries {
  const accepted = rows
    .map((row) => {
      const time = row.date?.slice(0, 10) ?? "";
      return {
        time,
        timestamp: Date.parse(`${time}T00:00:00Z`),
        open: numeric(row.open),
        high: numeric(row.high),
        low: numeric(row.low),
        close: numeric(row.close),
        volume: numeric(row.volume) || 0,
      };
    })
    .filter(
      (row) =>
        /^\d{4}-\d{2}-\d{2}$/.test(row.time) &&
        Number.isFinite(row.timestamp) &&
        [row.open, row.high, row.low, row.close].every(
          (value) => Number.isFinite(value) && value > 0,
        ),
    )
    .sort((left, right) => left.timestamp - right.timestamp);
  if (accepted.length === 0) {
    throw new Error("FMP returned no parseable daily bars");
  }
  const bars: MarketBar[] = [];
  for (const row of accepted) {
    const previousClose = bars.at(-1)?.close ?? row.open;
    const change = row.close - previousClose;
    bars.push({
      ...row,
      amount: 0,
      amplitude:
        previousClose === 0
          ? 0
          : ((row.high - row.low) / previousClose) * 100,
      changePercent:
        previousClose === 0 ? 0 : (change / previousClose) * 100,
      change,
      turnoverRate: 0,
    });
  }
  return {
    instrument: {
      ...instrument,
      provider: "fmp",
    },
    interval: "1d",
    priceAdjustment: "raw",
    previousClose: bars[0].open,
    bars,
    latestBarStatus: resolveLatestDailyBarStatus(
      bars.at(-1)!.time,
      instrument.exchange,
      fetchedAt,
    ),
    source: "fmp",
    fetchedAt: fetchedAt.toISOString(),
  };
}

export async function fetchFmpDailySeries(
  instrument: MarketInstrument,
  requestedLimit = 1_000,
  fetchImpl: typeof fetch = fetch,
  requestCache: RequestCache = "default",
  apiKey: string | null = configuredApiKey(),
): Promise<MarketSeries> {
  if (!apiKey) throw new Error("FMP is not configured");
  const resolved = await resolveFmpInstrument(
    instrument,
    fetchImpl,
    apiKey,
  );
  const limit = clampMarketSeriesLimit(requestedLimit, "1d");
  const url = new URL(`${FMP_BASE_URL}/historical-price-eod/full`);
  url.searchParams.set("symbol", resolved.secid);
  const end = new Date();
  const start = requestsExtendedDailyHistory("1d", requestedLimit)
    ? new Date(`${DAILY_HISTORY_START_DATE}T00:00:00Z`)
    : new Date(end);
  if (!requestsExtendedDailyHistory("1d", requestedLimit)) {
    start.setUTCFullYear(start.getUTCFullYear() - 2);
  }
  url.searchParams.set("from", start.toISOString().slice(0, 10));
  url.searchParams.set("to", end.toISOString().slice(0, 10));
  const payload = await fetchFmpJson<
    FmpDailyRow[] | { message?: string }
  >(url, apiKey, fetchImpl, requestCache);
  if (!Array.isArray(payload)) {
    throw new Error(payload.message || "FMP returned an invalid response");
  }
  const series = parseFmpDailyRows(payload, resolved, new Date());
  return {
    ...series,
    bars: series.bars.slice(-limit),
  };
}
