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

const ALPHA_VANTAGE_ENDPOINT = "https://www.alphavantage.co/query";

interface AlphaVantageMatch {
  "1. symbol"?: string;
  "2. name"?: string;
  "3. type"?: string;
  "4. region"?: string;
  "8. currency"?: string;
}

interface AlphaVantageSearchResponse {
  bestMatches?: AlphaVantageMatch[];
  Note?: string;
  Information?: string;
  "Error Message"?: string;
}

const resolutionCache = new Map<string, MarketInstrument>();

function configuredApiKey(): string | null {
  if (typeof process === "undefined") return null;
  const key = process.env.ALPHA_VANTAGE_API_KEY?.trim();
  return key ? key : null;
}

export function hasAlphaVantageApiKey(): boolean {
  return configuredApiKey() !== null;
}

function assetTypeFromAlphaVantage(
  value: string | undefined,
): MarketInstrument["assetType"] | null {
  const type = value?.toLowerCase() ?? "";
  if (type.includes("index")) return "index";
  if (type.includes("etf")) return "etf";
  return null;
}

function alphaCode(symbol: string): string {
  return normalizeMarketCode(
    symbol.replace(/\.(SHH|SHZ|LON|TRT|DEX|PAR)$/i, ""),
  );
}

async function searchRawAlphaVantage(
  query: string,
  fetchImpl: typeof fetch,
  apiKey: string,
): Promise<AlphaVantageMatch[]> {
  const url = new URL(ALPHA_VANTAGE_ENDPOINT);
  url.searchParams.set("function", "SYMBOL_SEARCH");
  url.searchParams.set("keywords", query.slice(0, 40));
  url.searchParams.set("apikey", apiKey);
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "QuantScope/1.0 market-research-dashboard",
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    throw new Error(
      `Alpha Vantage search failed with status ${response.status}`,
    );
  }
  const payload = (await response.json()) as AlphaVantageSearchResponse;
  if (payload.Note || payload.Information || payload["Error Message"]) {
    throw new Error("Alpha Vantage search quota or symbol lookup failed");
  }
  return payload.bestMatches ?? [];
}

function materializeMatch(
  item: AlphaVantageMatch,
  forcedAssetType?: MarketInstrument["assetType"],
): MarketInstrument | null {
  const symbol = item["1. symbol"]?.trim();
  const assetType =
    forcedAssetType ?? assetTypeFromAlphaVantage(item["3. type"]);
  if (!symbol || !assetType) return null;
  return {
    secid: symbol,
    code: alphaCode(symbol),
    name: item["2. name"]?.trim() || symbol,
    exchange: exchangeFromProviderLabels(
      item["4. region"] ?? "",
      symbol,
    ),
    assetType,
    provider: "alpha-vantage",
  };
}

export async function searchAlphaVantage(
  query: string,
  fetchImpl: typeof fetch = fetch,
  apiKey: string | null = configuredApiKey(),
): Promise<MarketInstrument[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery || !apiKey) return [];
  const matches = await searchRawAlphaVantage(
    normalizedQuery,
    fetchImpl,
    apiKey,
  );
  return matches
    .map((item) => materializeMatch(item))
    .filter(
      (instrument): instrument is MarketInstrument => instrument !== null,
    )
    .slice(0, 8);
}

async function resolveAlphaVantageInstrument(
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
    instrument.provider === "alpha-vantage" &&
    instrument.secid.trim()
  ) {
    resolutionCache.set(cacheKey, instrument);
    return instrument;
  }
  const normalizedCode = normalizeMarketCode(instrument.code);
  const matches = (
    await searchRawAlphaVantage(instrument.code, fetchImpl, apiKey)
  )
    .map((item) => materializeMatch(item, instrument.assetType))
    .filter(
      (candidate): candidate is MarketInstrument => candidate !== null,
    )
    .filter((candidate) => alphaCode(candidate.secid) === normalizedCode);
  const resolved =
    matches.find(
      (candidate) =>
        instrument.exchange === "OTHER" ||
        candidate.exchange === instrument.exchange,
    ) ?? (matches.length === 1 ? matches[0] : null);
  if (!resolved) {
    throw new Error(
      "Alpha Vantage could not resolve an exact exchange-local instrument",
    );
  }
  resolutionCache.set(cacheKey, resolved);
  return resolved;
}

function parseCsvCell(value: string | undefined): string {
  return (value ?? "").trim().replace(/^"|"$/g, "");
}

function numeric(value: string | undefined): number {
  const parsed = Number(parseCsvCell(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function parseAlphaVantageDailyCsv(
  text: string,
  instrument: MarketInstrument,
  fetchedAt = new Date(),
): MarketSeries {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const header = lines[0]?.trim().toLowerCase() ?? "";
  if (
    header !== "timestamp,open,high,low,close,volume" &&
    header !== "timestamp,open,high,low,close"
  ) {
    throw new Error("Alpha Vantage returned an unexpected daily CSV");
  }
  const accepted = lines
    .slice(1)
    .map((line) => {
      const [date, open, high, low, close, volume] = line.split(",");
      const time = parseCsvCell(date).slice(0, 10);
      return {
        time,
        timestamp: Date.parse(`${time}T00:00:00Z`),
        open: numeric(open),
        high: numeric(high),
        low: numeric(low),
        close: numeric(close),
        volume: numeric(volume) || 0,
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
    throw new Error("Alpha Vantage returned no parseable daily bars");
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
      provider: "alpha-vantage",
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
    source: "alpha-vantage",
    fetchedAt: fetchedAt.toISOString(),
  };
}

async function fetchAlphaVantageCsv(
  instrument: MarketInstrument,
  apiKey: string,
  fetchImpl: typeof fetch,
  requestCache: RequestCache,
): Promise<string> {
  const url = new URL(ALPHA_VANTAGE_ENDPOINT);
  url.searchParams.set(
    "function",
    instrument.assetType === "index"
      ? "INDEX_DATA"
      : "TIME_SERIES_DAILY",
  );
  url.searchParams.set("symbol", instrument.secid);
  if (instrument.assetType === "index") {
    url.searchParams.set("interval", "daily");
  } else {
    url.searchParams.set("outputsize", "compact");
  }
  url.searchParams.set("datatype", "csv");
  url.searchParams.set("apikey", apiKey);
  const response = await fetchImpl(url, {
    headers: {
      Accept: "text/csv,application/json;q=0.9,*/*;q=0.8",
      "User-Agent": "QuantScope/1.0 market-research-dashboard",
    },
    signal: AbortSignal.timeout(12_000),
    ...(requestCache === "no-store" ? { cache: requestCache } : {}),
  });
  if (!response.ok) {
    throw new Error(
      `Alpha Vantage history failed with status ${response.status}`,
    );
  }
  const text = await response.text();
  if (text.trimStart().startsWith("{")) {
    throw new Error("Alpha Vantage history quota or entitlement failed");
  }
  return text;
}

export async function fetchAlphaVantageDailySeries(
  instrument: MarketInstrument,
  requestedLimit = 100,
  fetchImpl: typeof fetch = fetch,
  requestCache: RequestCache = "default",
  apiKey: string | null = configuredApiKey(),
): Promise<MarketSeries> {
  if (!apiKey) throw new Error("Alpha Vantage is not configured");
  if (instrument.assetType === "commodity") {
    throw new Error("Alpha Vantage commodity fallback is not enabled");
  }
  const resolved = await resolveAlphaVantageInstrument(
    instrument,
    fetchImpl,
    apiKey,
  );
  const series = parseAlphaVantageDailyCsv(
    await fetchAlphaVantageCsv(
      resolved,
      apiKey,
      fetchImpl,
      requestCache,
    ),
    resolved,
    new Date(),
  );
  const limit = clampMarketSeriesLimit(requestedLimit, "1d");
  return {
    ...series,
    bars: series.bars.slice(-limit),
  };
}
