import {
  exchangeFromProviderLabels,
  normalizeMarketCode,
} from "./exchanges";
import { clampMarketSeriesLimit } from "./history";
import { resolveLatestDailyBarStatus } from "./session";
import type {
  MarketBar,
  MarketInstrument,
  MarketSeries,
} from "./types";

const TWELVE_DATA_BASE_URL = "https://api.twelvedata.com";
const TWELVE_DATA_MAX_OUTPUT_SIZE = 5_000;

interface TwelveDataSearchItem {
  symbol?: string;
  instrument_name?: string;
  exchange?: string;
  mic_code?: string;
  exchange_timezone?: string;
  instrument_type?: string;
  country?: string;
}

interface TwelveDataSearchResponse {
  data?: TwelveDataSearchItem[];
  status?: string;
  code?: number;
  message?: string;
}

interface TwelveDataValue {
  datetime?: string;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  volume?: string;
}

interface TwelveDataSeriesResponse {
  meta?: {
    symbol?: string;
    exchange?: string;
    mic_code?: string;
    type?: string;
  };
  values?: TwelveDataValue[];
  status?: string;
  code?: number;
  message?: string;
}

const resolutionCache = new Map<string, MarketInstrument>();

function configuredApiKey(): string | null {
  if (typeof process === "undefined") return null;
  const key = process.env.TWELVE_DATA_API_KEY?.trim();
  return key ? key : null;
}

export function hasTwelveDataApiKey(): boolean {
  return configuredApiKey() !== null;
}

function assetTypeFromTwelveData(
  value: string | undefined,
): MarketInstrument["assetType"] | null {
  const type = value?.toLowerCase() ?? "";
  if (type.includes("index")) return "index";
  if (
    type.includes("etf") ||
    type.includes("exchange-traded fund")
  ) {
    return "etf";
  }
  return null;
}

function exchangeFromTwelveData(item: TwelveDataSearchItem) {
  return exchangeFromProviderLabels(
    `${item.exchange ?? ""} ${item.mic_code ?? ""} ${
      item.country ?? ""
    }`,
    item.symbol,
  );
}

async function fetchTwelveDataJson<T>(
  url: URL,
  fetchImpl: typeof fetch,
  requestCache: RequestCache,
): Promise<T> {
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "QuantScope/1.0 market-research-dashboard",
    },
    signal: AbortSignal.timeout(12_000),
    ...(requestCache === "no-store" ? { cache: requestCache } : {}),
  });
  if (!response.ok) {
    throw new Error(
      `Twelve Data request failed with status ${response.status}`,
    );
  }
  return (await response.json()) as T;
}

export async function searchTwelveData(
  query: string,
  fetchImpl: typeof fetch = fetch,
  apiKey: string | null = configuredApiKey(),
): Promise<MarketInstrument[]> {
  const normalizedQuery = query.trim().slice(0, 40);
  if (!normalizedQuery || !apiKey) return [];
  const url = new URL(`${TWELVE_DATA_BASE_URL}/symbol_search`);
  url.searchParams.set("symbol", normalizedQuery);
  url.searchParams.set("outputsize", "12");
  url.searchParams.set("apikey", apiKey);
  const payload = await fetchTwelveDataJson<TwelveDataSearchResponse>(
    url,
    fetchImpl,
    "default",
  );
  if (payload.status === "error") return [];

  return (payload.data ?? [])
    .map<MarketInstrument | null>((item) => {
      const assetType = assetTypeFromTwelveData(item.instrument_type);
      const symbol = item.symbol?.trim();
      return assetType && symbol
        ? {
            secid: symbol,
            code: normalizeMarketCode(symbol),
            name: item.instrument_name?.trim() || symbol,
            exchange: exchangeFromTwelveData(item),
            assetType,
            provider: "twelve-data" as const,
          }
        : null;
    })
    .filter(
      (instrument): instrument is MarketInstrument => instrument !== null,
    )
    .slice(0, 8);
}

async function resolveTwelveDataInstrument(
  instrument: MarketInstrument,
  fetchImpl: typeof fetch,
  apiKey: string,
): Promise<MarketInstrument> {
  const cacheKey = `${instrument.assetType}:${normalizeMarketCode(
    instrument.code,
  )}:${instrument.exchange}`;
  const cached = resolutionCache.get(cacheKey);
  if (cached) return cached;
  if (
    instrument.provider === "twelve-data" &&
    instrument.secid.trim()
  ) {
    resolutionCache.set(cacheKey, instrument);
    return instrument;
  }
  const matches = await searchTwelveData(
    instrument.code,
    fetchImpl,
    apiKey,
  );
  const normalizedCode = normalizeMarketCode(instrument.code);
  const exact = matches.filter(
    (candidate) =>
      candidate.assetType === instrument.assetType &&
      normalizeMarketCode(candidate.code) === normalizedCode,
  );
  const resolved =
    exact.find(
      (candidate) =>
        instrument.exchange === "OTHER" ||
        candidate.exchange === instrument.exchange,
    ) ?? (exact.length === 1 ? exact[0] : null);
  if (!resolved) {
    throw new Error(
      "Twelve Data could not resolve an exact exchange-local instrument",
    );
  }
  resolutionCache.set(cacheKey, resolved);
  return resolved;
}

function numeric(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function parseTwelveDataValues(
  values: readonly TwelveDataValue[],
  instrument: MarketInstrument,
  fetchedAt = new Date(),
): MarketSeries {
  const accepted = values
    .map((value) => {
      const time = value.datetime?.slice(0, 10) ?? "";
      return {
        time,
        timestamp: Date.parse(`${time}T00:00:00Z`),
        open: numeric(value.open),
        high: numeric(value.high),
        low: numeric(value.low),
        close: numeric(value.close),
        volume: numeric(value.volume) || 0,
      };
    })
    .filter(
      (row) =>
        /^\d{4}-\d{2}-\d{2}$/.test(row.time) &&
        Number.isFinite(row.timestamp) &&
        [row.open, row.high, row.low, row.close].every(
          (number) => Number.isFinite(number) && number > 0,
        ),
    )
    .sort((left, right) => left.timestamp - right.timestamp);
  if (accepted.length === 0) {
    throw new Error("Twelve Data returned no parseable daily bars");
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
      provider: "twelve-data",
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
    source: "twelve-data",
    fetchedAt: fetchedAt.toISOString(),
  };
}

export async function fetchTwelveDataDailySeries(
  instrument: MarketInstrument,
  requestedLimit = 1_000,
  fetchImpl: typeof fetch = fetch,
  requestCache: RequestCache = "default",
  apiKey: string | null = configuredApiKey(),
): Promise<MarketSeries> {
  if (!apiKey) throw new Error("Twelve Data is not configured");
  if (instrument.assetType === "commodity") {
    throw new Error("Twelve Data commodity fallback is not enabled");
  }
  const resolved = await resolveTwelveDataInstrument(
    instrument,
    fetchImpl,
    apiKey,
  );
  const limit = clampMarketSeriesLimit(requestedLimit, "1d");
  const url = new URL(`${TWELVE_DATA_BASE_URL}/time_series`);
  url.searchParams.set("symbol", resolved.secid);
  url.searchParams.set("interval", "1day");
  url.searchParams.set(
    "outputsize",
    String(Math.min(limit, TWELVE_DATA_MAX_OUTPUT_SIZE)),
  );
  url.searchParams.set("order", "ASC");
  url.searchParams.set("format", "JSON");
  if (resolved.exchange !== "OTHER") {
    url.searchParams.set("exchange", resolved.exchange);
  }
  url.searchParams.set("apikey", apiKey);
  const payload = await fetchTwelveDataJson<TwelveDataSeriesResponse>(
    url,
    fetchImpl,
    requestCache,
  );
  if (payload.status === "error") {
    throw new Error(payload.message || "Twelve Data returned an error");
  }
  const series = parseTwelveDataValues(
    payload.values ?? [],
    resolved,
    new Date(),
  );
  return {
    ...series,
    bars: series.bars.slice(-limit),
  };
}
