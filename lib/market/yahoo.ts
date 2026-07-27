import type {
  MarketBar,
  MarketExchange,
  MarketInstrument,
  MarketInterval,
  MarketSeries,
} from "./types";
import {
  DAILY_HISTORY_START_TIMESTAMP_SECONDS,
  clampMarketSeriesLimit,
  requestsExtendedDailyHistory,
} from "./history";
import { resolveLatestDailyBarStatus } from "./session";

const SEARCH_ENDPOINT = "https://query1.finance.yahoo.com/v1/finance/search";
const CHART_ENDPOINT = "https://query1.finance.yahoo.com/v8/finance/chart";
const DEFAULT_HEADERS = {
  Accept: "application/json,text/plain,*/*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://finance.yahoo.com/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
};

const intervalSettings: Record<
  MarketInterval,
  { interval: string; range: string }
> = {
  "1m": { interval: "1m", range: "5d" },
  "5m": { interval: "5m", range: "1mo" },
  "15m": { interval: "15m", range: "1mo" },
  "30m": { interval: "30m", range: "1mo" },
  "60m": { interval: "60m", range: "1y" },
  "1d": { interval: "1d", range: "5y" },
};

const yahooIndexAliases: Record<string, string> = {
  N225: "^N225",
  SOX: "^SOX",
  DJI: "^DJI",
  DJIA: "^DJI",
  SPX: "^GSPC",
  GSPC: "^GSPC",
  NDX: "^NDX",
  IXIC: "^IXIC",
  HSI: "^HSI",
  HSCEI: "^HSCE",
  FTSE: "^FTSE",
  GDAXI: "^GDAXI",
  FCHI: "^FCHI",
  STOXX50E: "^STOXX50E",
  KS11: "^KS11",
  TWII: "^TWII",
  AXJO: "^AXJO",
};

interface YahooSearchQuote {
  symbol?: string;
  shortname?: string;
  longname?: string;
  quoteType?: string;
  exchange?: string;
  exchDisp?: string;
}

interface YahooSearchResponse {
  quotes?: YahooSearchQuote[];
}

interface YahooChartQuote {
  open?: Array<number | null>;
  close?: Array<number | null>;
  high?: Array<number | null>;
  low?: Array<number | null>;
  volume?: Array<number | null>;
}

interface YahooChartAdjustedClose {
  adjclose?: Array<number | null>;
}

interface YahooChartResult {
  meta?: {
    symbol?: string;
    shortName?: string;
    longName?: string;
    chartPreviousClose?: number;
    previousClose?: number;
    exchangeTimezoneName?: string;
    exchangeName?: string;
    currentTradingPeriod?: {
      regular?: {
        end?: number;
      };
    };
  };
  timestamp?: number[];
  indicators?: {
    quote?: YahooChartQuote[];
    adjclose?: YahooChartAdjustedClose[];
  };
}

interface YahooChartResponse {
  chart?: {
    result?: YahooChartResult[] | null;
    error?: { description?: string } | null;
  };
}

function exchangeFromYahoo(
  exchange: string | undefined,
  display: string | undefined,
): MarketExchange {
  const value = `${exchange ?? ""} ${display ?? ""}`.toUpperCase();
  if (value.includes("TOKYO") || value.includes("JPX")) return "JPX";
  if (value.includes("NASDAQ") || value.includes("NGM")) return "NASDAQ";
  if (
    value.includes("NYSE ARCA") ||
    value.includes("PCX") ||
    value.includes("ARCX")
  ) {
    return "NYSE_ARCA";
  }
  if (value.includes("HONG KONG") || value.includes("HKG")) return "HKEX";
  if (value.includes("SHANGHAI") || value.includes("SHH")) return "SSE";
  if (value.includes("SHENZHEN") || value.includes("SHZ")) return "SZSE";
  if (value.includes("PHLX") || value.includes("NIM")) return "PHLX";
  return "OTHER";
}

async function fetchJson<T>(
  url: URL,
  fetchImpl: typeof fetch = fetch,
  requestCache: RequestCache = "default",
): Promise<T> {
  const endpoints = [
    url,
    new URL(url.toString().replace("//query1.", "//query2.")),
  ];
  let lastStatus = 0;
  let lastError: unknown = null;

  for (const endpoint of endpoints) {
    try {
      const response = await fetchImpl(endpoint, {
        headers: DEFAULT_HEADERS,
        signal: AbortSignal.timeout(12_000),
        ...(requestCache === "no-store" ? { cache: requestCache } : {}),
      });
      if (response.ok) return (await response.json()) as T;
      lastStatus = response.status;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastStatus === 0 && lastError instanceof Error) {
    throw new Error(`Yahoo request failed: ${lastError.message}`);
  }
  throw new Error(`Yahoo request failed with status ${lastStatus}`);
}

export function yahooSymbolForInstrument(instrument: MarketInstrument): string {
  const legacyEastmoneyIdentity =
    /^(?:0|1|100|105|107|251)\./.test(instrument.secid);
  if (instrument.provider === "yahoo" && !legacyEastmoneyIdentity) {
    return instrument.secid;
  }
  if (instrument.assetType === "index") {
    const alias = yahooIndexAliases[instrument.code.toUpperCase()];
    if (alias) return alias;
    if (instrument.exchange === "SSE") return `${instrument.code}.SS`;
    if (instrument.exchange === "SZSE") return `${instrument.code}.SZ`;
    return `^${instrument.code}`;
  }
  if (instrument.exchange === "SSE") return `${instrument.code}.SS`;
  if (instrument.exchange === "SZSE") return `${instrument.code}.SZ`;
  return instrument.code;
}

export async function searchYahoo(
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MarketInstrument[]> {
  const normalizedQuery = query.trim().slice(0, 40);
  if (!normalizedQuery) return [];

  const url = new URL(SEARCH_ENDPOINT);
  url.searchParams.set("q", normalizedQuery);
  url.searchParams.set("quotesCount", "16");
  url.searchParams.set("newsCount", "0");

  const payload = await fetchJson<YahooSearchResponse>(url, fetchImpl);
  return (payload.quotes ?? [])
    .filter(
      (item) =>
        item.symbol &&
        (item.quoteType === "INDEX" ||
          item.quoteType === "ETF" ||
          item.quoteType === "FUTURE"),
    )
    .map((item) => ({
      secid: item.symbol!,
      code: item.symbol!.replace(/^\^/, ""),
      name: item.longname || item.shortname || item.symbol!,
      exchange: exchangeFromYahoo(item.exchange, item.exchDisp),
      assetType:
        item.quoteType === "INDEX"
          ? ("index" as const)
          : item.quoteType === "FUTURE"
            ? ("commodity" as const)
            : ("etf" as const),
      provider: "yahoo" as const,
    }))
    .slice(0, 8);
}

function formatTimestamp(
  timestamp: number,
  interval: MarketInterval,
  timeZone: string,
) {
  const date = new Date(timestamp * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(interval === "1d"
      ? {}
      : {
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }),
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const day = `${values.year}-${values.month}-${values.day}`;
  return interval === "1d" ? day : `${day} ${values.hour}:${values.minute}`;
}

export function parseYahooChart(
  payload: YahooChartResponse,
  instrument: MarketInstrument,
  interval: MarketInterval,
  fetchedAt = new Date(),
): MarketSeries {
  const result = payload.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const adjustedCloses = result?.indicators?.adjclose?.[0]?.adjclose;
  const timestamps = result?.timestamp ?? [];
  if (!result || !quote || timestamps.length === 0) {
    throw new Error(
      payload.chart?.error?.description || "Yahoo returned no chart data",
    );
  }

  const timeZone = result.meta?.exchangeTimezoneName || "UTC";
  const acceptedRows: Array<{
    timestamp: number;
    open: number;
    close: number;
    high: number;
    low: number;
    volume: number;
    adjustmentFactor: number;
  }> = [];
  timestamps.forEach((timestamp, index) => {
    const open = quote.open?.[index];
    const close = quote.close?.[index];
    const high = quote.high?.[index];
    const low = quote.low?.[index];
    if (
      open == null ||
      close == null ||
      high == null ||
      low == null ||
      ![open, close, high, low].every(Number.isFinite)
    ) {
      return;
    }
    const adjustedClose = adjustedCloses?.[index];
    const adjustmentFactor =
      interval === "1d" &&
      adjustedClose != null &&
      Number.isFinite(adjustedClose) &&
      adjustedClose > 0 &&
      close > 0
        ? adjustedClose / close
        : Number.NaN;
    const useAdjustedDailyPrice =
      Number.isFinite(adjustmentFactor) && adjustmentFactor > 0;
    acceptedRows.push({
      timestamp,
      open,
      close,
      high,
      low,
      volume: Number(quote.volume?.[index]) || 0,
      adjustmentFactor: useAdjustedDailyPrice
        ? adjustmentFactor
        : Number.NaN,
    });
  });

  if (acceptedRows.length === 0) {
    throw new Error("Yahoo chart data could not be parsed");
  }

  const allParsedDailyPricesAdjusted =
    interval === "1d" &&
    acceptedRows.every(
      ({ adjustmentFactor }) =>
        Number.isFinite(adjustmentFactor) && adjustmentFactor > 0,
    );
  const firstAcceptedAdjustmentFactor = allParsedDailyPricesAdjusted
    ? acceptedRows[0].adjustmentFactor
    : null;
  const bars: MarketBar[] = [];
  acceptedRows.forEach((row) => {
    const priceFactor = allParsedDailyPricesAdjusted
      ? row.adjustmentFactor
      : 1;
    const normalizedOpen = row.open * priceFactor;
    const normalizedClose = row.close * priceFactor;
    const normalizedHigh = row.high * priceFactor;
    const normalizedLow = row.low * priceFactor;
    const previousClose = bars.at(-1)?.close ?? normalizedOpen;
    const change = normalizedClose - previousClose;
    bars.push({
      time: formatTimestamp(row.timestamp, interval, timeZone),
      timestamp: row.timestamp * 1000,
      open: normalizedOpen,
      close: normalizedClose,
      high: normalizedHigh,
      low: normalizedLow,
      volume: row.volume,
      amount: 0,
      amplitude:
        previousClose === 0
          ? 0
          : ((normalizedHigh - normalizedLow) / previousClose) * 100,
      changePercent: previousClose === 0 ? 0 : (change / previousClose) * 100,
      change,
      turnoverRate: 0,
    });
  });

  const providerPreviousClose = Number(
    result.meta?.chartPreviousClose ?? result.meta?.previousClose,
  );
  const normalizedProviderPreviousClose =
    allParsedDailyPricesAdjusted &&
    firstAcceptedAdjustmentFactor !== null &&
    Number.isFinite(providerPreviousClose)
      ? providerPreviousClose * firstAcceptedAdjustmentFactor
      : providerPreviousClose;
  const exchange = exchangeFromYahoo(result.meta?.exchangeName, "");
  return {
    instrument: {
      ...instrument,
      secid: result.meta?.symbol || yahooSymbolForInstrument(instrument),
      code: result.meta?.symbol?.replace(/^\^/, "") || instrument.code,
      name: result.meta?.longName || result.meta?.shortName || instrument.name,
      exchange,
      provider: "yahoo",
    },
    interval,
    priceAdjustment: allParsedDailyPricesAdjusted
      ? "corporate-action-adjusted"
      : "raw",
    previousClose:
      (Number.isFinite(normalizedProviderPreviousClose)
        ? normalizedProviderPreviousClose
        : 0) ||
      bars[0].open,
    bars,
    latestBarStatus:
      interval === "1d"
        ? resolveLatestDailyBarStatus(
            bars.at(-1)!.time,
            exchange,
            fetchedAt,
            result.meta?.currentTradingPeriod?.regular?.end,
          )
        : "unknown",
    source: "yahoo",
    fetchedAt: fetchedAt.toISOString(),
  };
}

export async function fetchYahooSeries(
  instrument: MarketInstrument,
  interval: MarketInterval,
  requestedLimit = 1000,
  fetchImpl: typeof fetch = fetch,
  requestCache: RequestCache = "default",
): Promise<MarketSeries> {
  const symbol = yahooSymbolForInstrument(instrument);
  const settings = intervalSettings[interval];
  const url = new URL(`${CHART_ENDPOINT}/${encodeURIComponent(symbol)}`);
  url.searchParams.set("interval", settings.interval);
  if (requestsExtendedDailyHistory(interval, requestedLimit)) {
    url.searchParams.set(
      "period1",
      String(DAILY_HISTORY_START_TIMESTAMP_SECONDS),
    );
    url.searchParams.set(
      "period2",
      String(Math.floor(Date.now() / 1000) + 2 * 24 * 60 * 60),
    );
  } else {
    url.searchParams.set("range", settings.range);
  }
  url.searchParams.set("includePrePost", "false");
  url.searchParams.set("events", "div,splits");

  const payload = await fetchJson<YahooChartResponse>(
    url,
    fetchImpl,
    requestCache,
  );
  const series = parseYahooChart(payload, instrument, interval);
  const limit = clampMarketSeriesLimit(requestedLimit, interval);
  const sliceStart = Math.max(series.bars.length - limit, 0);
  return {
    ...series,
    previousClose:
      sliceStart > 0
        ? series.bars[sliceStart - 1].close
        : series.previousClose,
    bars: series.bars.slice(sliceStart),
  };
}
