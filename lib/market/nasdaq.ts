import type {
  MarketBar,
  MarketInstrument,
  MarketSeries,
} from "./types";

const HISTORICAL_ENDPOINT = "https://api.nasdaq.com/api/quote";
const DEFAULT_HEADERS = {
  Accept: "application/json, text/plain, */*",
  Origin: "https://www.nasdaq.com",
  Referer: "https://www.nasdaq.com/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
};

interface NasdaqHistoricalRow {
  date?: string;
  close?: string;
  volume?: string;
  open?: string;
  high?: string;
  low?: string;
}

interface NasdaqHistoricalResponse {
  data?: {
    tradesTable?: {
      rows?: NasdaqHistoricalRow[];
    };
  } | null;
  status?: {
    rCode?: number;
    bCodeMessage?: Array<{ errorMessage?: string }>;
  };
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function numeric(value: string | undefined) {
  if (!value || value === "--") return 0;
  const parsed = Number(value.replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function timestampFromDate(value: string) {
  const [month, day, year] = value.split("/").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function parseNasdaqRows(rows: NasdaqHistoricalRow[]): MarketBar[] {
  const chronological = [...rows].reverse();
  const bars: MarketBar[] = [];

  chronological.forEach((row) => {
    if (!row.date || !row.open || !row.close || !row.high || !row.low) return;
    const timestamp = timestampFromDate(row.date);
    const open = numeric(row.open);
    const close = numeric(row.close);
    const high = numeric(row.high);
    const low = numeric(row.low);
    if (
      !Number.isFinite(timestamp) ||
      ![open, close, high, low].every(Number.isFinite)
    ) {
      return;
    }

    const previousClose = bars.at(-1)?.close ?? open;
    const change = close - previousClose;
    bars.push({
      time: new Date(timestamp).toISOString().slice(0, 10),
      timestamp,
      open,
      close,
      high,
      low,
      volume: numeric(row.volume),
      amount: 0,
      amplitude: previousClose === 0 ? 0 : ((high - low) / previousClose) * 100,
      changePercent: previousClose === 0 ? 0 : (change / previousClose) * 100,
      change,
      turnoverRate: 0,
    });
  });

  return bars;
}

export async function fetchNasdaqDailySeries(
  instrument: MarketInstrument,
  requestedLimit = 1000,
  fetchImpl: typeof fetch = fetch,
): Promise<MarketSeries> {
  const limit = Math.min(Math.max(Math.trunc(requestedLimit), 60), 1500);
  const end = new Date();
  const start = new Date(end);
  start.setUTCFullYear(start.getUTCFullYear() - 5);
  const code = instrument.code.replace(/^\^/, "").replace(/\..*$/, "");
  const url = new URL(
    `${HISTORICAL_ENDPOINT}/${encodeURIComponent(code)}/historical`,
  );
  url.searchParams.set("assetclass", instrument.assetType);
  url.searchParams.set("fromdate", formatDate(start));
  url.searchParams.set("todate", formatDate(end));
  url.searchParams.set("limit", String(limit));

  const response = await fetchImpl(url, {
    headers: DEFAULT_HEADERS,
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    throw new Error(`Nasdaq request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as NasdaqHistoricalResponse;
  const bars = parseNasdaqRows(payload.data?.tradesTable?.rows ?? []);
  if (bars.length === 0) {
    const message = payload.status?.bCodeMessage?.[0]?.errorMessage;
    throw new Error(message || "Nasdaq returned no historical data");
  }

  return {
    instrument,
    interval: "1d",
    previousClose: bars[0].open,
    bars,
    source: "nasdaq",
    fetchedAt: new Date().toISOString(),
  };
}
