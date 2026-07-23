import type {
  MarketBar,
  MarketExchange,
  MarketInstrument,
  MarketInterval,
  MarketSeries,
} from "./types";

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

interface YahooChartResult {
  meta?: {
    symbol?: string;
    shortName?: string;
    longName?: string;
    chartPreviousClose?: number;
    previousClose?: number;
    exchangeTimezoneName?: string;
    exchangeName?: string;
  };
  timestamp?: number[];
  indicators?: {
    quote?: YahooChartQuote[];
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
): Promise<T> {
  const endpoints = [
    url,
    new URL(url.toString().replace("//query1.", "//query2.")),
  ];
  let lastStatus = 0;

  for (const endpoint of endpoints) {
    const response = await fetchImpl(endpoint, {
      headers: DEFAULT_HEADERS,
      signal: AbortSignal.timeout(12_000),
    });
    if (response.ok) return (await response.json()) as T;
    lastStatus = response.status;
  }

  throw new Error(`Yahoo request failed with status ${lastStatus}`);
}

export function yahooSymbolForInstrument(instrument: MarketInstrument): string {
  if (instrument.provider === "yahoo") return instrument.secid;
  if (instrument.assetType === "index") {
    return yahooIndexAliases[instrument.code.toUpperCase()] ?? `^${instrument.code}`;
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
        (item.quoteType === "INDEX" || item.quoteType === "ETF"),
    )
    .map((item) => ({
      secid: item.symbol!,
      code: item.symbol!.replace(/^\^/, ""),
      name: item.longname || item.shortname || item.symbol!,
      exchange: exchangeFromYahoo(item.exchange, item.exchDisp),
      assetType: item.quoteType === "INDEX" ? ("index" as const) : ("etf" as const),
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
): MarketSeries {
  const result = payload.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const timestamps = result?.timestamp ?? [];
  if (!result || !quote || timestamps.length === 0) {
    throw new Error(
      payload.chart?.error?.description || "Yahoo returned no chart data",
    );
  }

  const timeZone = result.meta?.exchangeTimezoneName || "UTC";
  const bars: MarketBar[] = [];
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
    const previousClose = bars.at(-1)?.close ?? open;
    const change = close - previousClose;
    bars.push({
      time: formatTimestamp(timestamp, interval, timeZone),
      timestamp: timestamp * 1000,
      open,
      close,
      high,
      low,
      volume: Number(quote.volume?.[index]) || 0,
      amount: 0,
      amplitude: previousClose === 0 ? 0 : ((high - low) / previousClose) * 100,
      changePercent: previousClose === 0 ? 0 : (change / previousClose) * 100,
      change,
      turnoverRate: 0,
    });
  });

  if (bars.length === 0) throw new Error("Yahoo chart data could not be parsed");
  return {
    instrument: {
      ...instrument,
      code: result.meta?.symbol?.replace(/^\^/, "") || instrument.code,
      name: result.meta?.longName || result.meta?.shortName || instrument.name,
      exchange: exchangeFromYahoo(result.meta?.exchangeName, ""),
      provider: "yahoo",
    },
    interval,
    previousClose:
      Number(result.meta?.chartPreviousClose ?? result.meta?.previousClose) ||
      bars[0].open,
    bars,
    source: "yahoo",
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchYahooSeries(
  instrument: MarketInstrument,
  interval: MarketInterval,
  requestedLimit = 1000,
  fetchImpl: typeof fetch = fetch,
): Promise<MarketSeries> {
  const symbol = yahooSymbolForInstrument(instrument);
  const settings = intervalSettings[interval];
  const url = new URL(`${CHART_ENDPOINT}/${encodeURIComponent(symbol)}`);
  url.searchParams.set("interval", settings.interval);
  url.searchParams.set("range", settings.range);
  url.searchParams.set("includePrePost", "false");
  url.searchParams.set("events", "div,splits");

  const payload = await fetchJson<YahooChartResponse>(url, fetchImpl);
  const series = parseYahooChart(payload, instrument, interval);
  const limit = Math.min(Math.max(Math.trunc(requestedLimit), 60), 1500);
  return {
    ...series,
    bars: series.bars.slice(-limit),
  };
}
