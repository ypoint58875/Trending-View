import type {
  MarketBar,
  MarketExchange,
  MarketInstrument,
  MarketSeries,
} from "./types";
import {
  DAILY_HISTORY_START_DATE,
  clampMarketSeriesLimit,
  requestsExtendedDailyHistory,
} from "./history";
import { resolveLatestDailyBarStatus } from "./session";

const EODHD_BASE_URL = "https://eodhd.com/api";
const EODHD_REQUEST_TIMEOUT_MS = 12_000;
const EODHD_RETRY_DELAY_MS = 250;

interface EodhdSearchItem {
  Code?: string;
  Exchange?: string;
  Name?: string;
  Type?: string;
  Country?: string;
}

export interface EodhdDailyRow {
  date?: string;
  open?: number | string;
  high?: number | string;
  low?: number | string;
  close?: number | string;
  adjusted_close?: number | string;
  volume?: number | string | null;
}

interface EodhdErrorPayload {
  code?: number;
  message?: string;
}

function configuredToken(): string | null {
  if (typeof process === "undefined") return null;
  const token = process.env.EODHD_API_TOKEN?.trim();
  return token ? token : null;
}

export function hasEodhdApiToken(): boolean {
  return configuredToken() !== null;
}

function normalizeCode(value: string): string {
  return value
    .replace(/^\^/, "")
    .replace(/\.(SS|SZ|HK|US|INDX)$/i, "")
    .toUpperCase();
}

function exchangeFromEodhd(
  exchange: string | undefined,
  country: string | undefined,
  code: string | undefined,
): MarketExchange {
  const value = `${exchange ?? ""} ${country ?? ""}`.toUpperCase();
  if (
    value.includes("JP") ||
    value.includes("TOKYO") ||
    value.includes("JAPAN") ||
    normalizeCode(code ?? "") === "N225"
  ) {
    return "JPX";
  }
  if (value.includes("NASDAQ")) return "NASDAQ";
  if (value.includes("NYSE ARCA")) return "NYSE_ARCA";
  if (value.includes("HONG KONG") || value.includes("HK")) return "HKEX";
  if (value.includes("SHANGHAI") || value.includes("SHH")) return "SSE";
  if (value.includes("SHENZHEN") || value.includes("SHZ")) return "SZSE";
  if (value.includes("PHLX")) return "PHLX";
  return "OTHER";
}

function assetTypeFromEodhd(
  value: string | undefined,
): MarketInstrument["assetType"] | null {
  const type = value?.toLowerCase() ?? "";
  if (type.includes("index")) return "index";
  if (type.includes("etf")) return "etf";
  return null;
}

function buildEodhdSymbol(item: EodhdSearchItem): string | null {
  const code = item.Code?.trim();
  const exchange = item.Exchange?.trim();
  if (!code) return null;
  if (code.includes(".") || !exchange) return code;
  return `${code}.${exchange}`;
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchEodhdJson<T>(
  url: URL,
  fetchImpl: typeof fetch,
  requestCache: RequestCache,
): Promise<T> {
  let lastStatus = 0;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "QuantScope/1.0 market-research-dashboard",
        },
        signal: AbortSignal.timeout(EODHD_REQUEST_TIMEOUT_MS),
        ...(requestCache === "no-store" ? { cache: requestCache } : {}),
      });
      if (response.ok) return (await response.json()) as T;
      lastStatus = response.status;
      if (response.status !== 429 && response.status < 500) break;
    } catch (error) {
      lastError = error;
    }
    if (attempt === 0) await delay(EODHD_RETRY_DELAY_MS);
  }

  if (lastStatus > 0) {
    throw new Error(`EODHD request failed with status ${lastStatus}`);
  }
  throw new Error(
    lastError
      ? "EODHD request failed due to a network error"
      : "EODHD request failed",
  );
}

export async function searchEodhd(
  query: string,
  fetchImpl: typeof fetch = fetch,
  apiToken: string | null = configuredToken(),
): Promise<MarketInstrument[]> {
  const normalizedQuery = query.trim().slice(0, 40);
  if (!normalizedQuery || !apiToken) return [];

  const url = new URL(
    `${EODHD_BASE_URL}/search/${encodeURIComponent(normalizedQuery)}`,
  );
  url.searchParams.set("api_token", apiToken);
  url.searchParams.set("fmt", "json");
  url.searchParams.set("limit", "12");

  const payload = await fetchEodhdJson<
    EodhdSearchItem[] | EodhdErrorPayload
  >(url, fetchImpl, "default");
  if (!Array.isArray(payload)) return [];

  return payload
    .map((item) => ({
      item,
      assetType: assetTypeFromEodhd(item.Type),
      secid: buildEodhdSymbol(item),
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        item: EodhdSearchItem & { Code: string };
        assetType: "index" | "etf";
        secid: string;
      } =>
        Boolean(
          candidate.item.Code &&
            candidate.assetType &&
            candidate.secid,
        ),
    )
    .map(({ item, assetType, secid }) => ({
      secid,
      code: normalizeCode(item.Code),
      name: item.Name?.trim() || item.Code,
      exchange: exchangeFromEodhd(
        item.Exchange,
        item.Country,
        item.Code,
      ),
      assetType,
      provider: "eodhd" as const,
    }))
    .slice(0, 8);
}

async function resolveEodhdInstrument(
  instrument: MarketInstrument,
  fetchImpl: typeof fetch,
  apiToken: string,
): Promise<MarketInstrument> {
  if (instrument.provider === "eodhd" && instrument.secid.includes(".")) {
    return instrument;
  }
  const matches = await searchEodhd(
    instrument.code,
    fetchImpl,
    apiToken,
  );
  const exact =
    matches.find(
      (candidate) =>
        candidate.assetType === instrument.assetType &&
        normalizeCode(candidate.code) === normalizeCode(instrument.code),
    ) ??
    matches.find(
      (candidate) => candidate.assetType === instrument.assetType,
    );
  if (!exact) {
    throw new Error("EODHD could not resolve the requested instrument");
  }
  return exact;
}

function numeric(value: number | string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function parseEodhdDailyRows(
  rows: readonly EodhdDailyRow[],
  instrument: MarketInstrument,
  fetchedAt = new Date(),
): MarketSeries {
  const accepted = rows
    .map((row) => {
      const date = row.date?.slice(0, 10) ?? "";
      const timestamp = Date.parse(`${date}T00:00:00Z`);
      const open = numeric(row.open);
      const high = numeric(row.high);
      const low = numeric(row.low);
      const close = numeric(row.close);
      const adjustedClose = numeric(row.adjusted_close);
      return {
        date,
        timestamp,
        open,
        high,
        low,
        close,
        volume: numeric(row.volume) || 0,
        adjustmentFactor:
          close > 0 && adjustedClose > 0
            ? adjustedClose / close
            : Number.NaN,
      };
    })
    .filter(
      (row) =>
        row.date.length === 10 &&
        Number.isFinite(row.timestamp) &&
        [row.open, row.high, row.low, row.close].every(
          (value) => Number.isFinite(value) && value > 0,
        ),
    )
    .sort((left, right) => left.timestamp - right.timestamp);

  if (accepted.length === 0) {
    throw new Error("EODHD returned no parseable daily data");
  }

  const allAdjusted = accepted.every(
    (row) =>
      Number.isFinite(row.adjustmentFactor) &&
      row.adjustmentFactor > 0,
  );
  const bars: MarketBar[] = [];
  for (const row of accepted) {
    const factor = allAdjusted ? row.adjustmentFactor : 1;
    const open = row.open * factor;
    const high = row.high * factor;
    const low = row.low * factor;
    const close = row.close * factor;
    const previousClose = bars.at(-1)?.close ?? open;
    const change = close - previousClose;
    bars.push({
      time: row.date,
      timestamp: row.timestamp,
      open,
      high,
      low,
      close,
      volume: row.volume,
      amount: 0,
      amplitude:
        previousClose === 0
          ? 0
          : ((high - low) / previousClose) * 100,
      changePercent:
        previousClose === 0 ? 0 : (change / previousClose) * 100,
      change,
      turnoverRate: 0,
    });
  }

  return {
    instrument: {
      ...instrument,
      provider: "eodhd",
    },
    interval: "1d",
    priceAdjustment: allAdjusted
      ? "corporate-action-adjusted"
      : "raw",
    previousClose: bars[0].open,
    bars,
    latestBarStatus: resolveLatestDailyBarStatus(
      bars.at(-1)!.time,
      instrument.exchange,
      fetchedAt,
    ),
    source: "eodhd",
    fetchedAt: fetchedAt.toISOString(),
  };
}

export async function fetchEodhdDailySeries(
  instrument: MarketInstrument,
  requestedLimit = 1_000,
  fetchImpl: typeof fetch = fetch,
  requestCache: RequestCache = "default",
  apiToken: string | null = configuredToken(),
): Promise<MarketSeries> {
  if (!apiToken) throw new Error("EODHD is not configured");
  if (instrument.assetType === "commodity") {
    throw new Error("EODHD commodity fallback is not enabled");
  }

  const resolvedInstrument = await resolveEodhdInstrument(
    instrument,
    fetchImpl,
    apiToken,
  );
  const end = new Date();
  const start = requestsExtendedDailyHistory("1d", requestedLimit)
    ? new Date(`${DAILY_HISTORY_START_DATE}T00:00:00Z`)
    : new Date(end);
  if (!requestsExtendedDailyHistory("1d", requestedLimit)) {
    start.setUTCDate(start.getUTCDate() - 60);
  }

  const url = new URL(
    `${EODHD_BASE_URL}/eod/${encodeURIComponent(
      resolvedInstrument.secid,
    )}`,
  );
  url.searchParams.set("from", start.toISOString().slice(0, 10));
  url.searchParams.set("to", end.toISOString().slice(0, 10));
  url.searchParams.set("period", "d");
  url.searchParams.set("order", "a");
  url.searchParams.set("fmt", "json");
  url.searchParams.set("api_token", apiToken);

  const payload = await fetchEodhdJson<
    EodhdDailyRow[] | EodhdErrorPayload
  >(url, fetchImpl, requestCache);
  if (!Array.isArray(payload)) {
    throw new Error(payload.message || "EODHD returned an invalid response");
  }

  const series = parseEodhdDailyRows(
    payload,
    resolvedInstrument,
    new Date(),
  );
  const limit = clampMarketSeriesLimit(requestedLimit, "1d");
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
