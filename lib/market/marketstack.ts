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

const MARKETSTACK_EOD_ENDPOINT =
  "https://api.marketstack.com/v2/eod";
const MARKETSTACK_MAX_PAGE_SIZE = 1_000;

interface MarketstackEodRow {
  date?: string;
  symbol?: string;
  exchange?: string;
  open?: number | string;
  high?: number | string;
  low?: number | string;
  close?: number | string;
  volume?: number | string | null;
  adj_open?: number | string | null;
  adj_high?: number | string | null;
  adj_low?: number | string | null;
  adj_close?: number | string | null;
  adj_volume?: number | string | null;
}

interface MarketstackEodResponse {
  data?: MarketstackEodRow[];
  error?: {
    code?: string;
    message?: string;
  };
}

function configuredApiKey(): string | null {
  if (typeof process === "undefined") return null;
  const key = process.env.MARKETSTACK_API_KEY?.trim();
  return key ? key : null;
}

export function hasMarketstackApiKey(): boolean {
  return configuredApiKey() !== null;
}

function numeric(value: number | string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function parseMarketstackEodRows(
  rows: readonly MarketstackEodRow[],
  instrument: MarketInstrument,
  fetchedAt = new Date(),
): MarketSeries {
  const accepted = rows
    .map((row) => {
      const time = row.date?.slice(0, 10) ?? "";
      const adjusted = [
        row.adj_open,
        row.adj_high,
        row.adj_low,
        row.adj_close,
      ].every((value) => numeric(value) > 0);
      return {
        time,
        timestamp: Date.parse(`${time}T00:00:00Z`),
        symbol: row.symbol?.trim() ?? "",
        exchange: row.exchange?.trim() ?? "",
        open: numeric(adjusted ? row.adj_open : row.open),
        high: numeric(adjusted ? row.adj_high : row.high),
        low: numeric(adjusted ? row.adj_low : row.low),
        close: numeric(adjusted ? row.adj_close : row.close),
        volume:
          numeric(adjusted ? row.adj_volume : row.volume) || 0,
        adjusted,
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
    throw new Error("Marketstack returned no parseable daily bars");
  }
  const responseExchange = exchangeFromProviderLabels(
    accepted.at(-1)?.exchange ?? "",
    accepted.at(-1)?.symbol,
  );
  if (
    normalizeMarketCode(accepted.at(-1)?.symbol ?? "") !==
      normalizeMarketCode(instrument.code) ||
    (instrument.exchange !== "OTHER" &&
      responseExchange !== instrument.exchange)
  ) {
    throw new Error(
      "Marketstack returned a different exchange-local instrument",
    );
  }
  const bars: MarketBar[] = [];
  for (const row of accepted) {
    const previousClose = bars.at(-1)?.close ?? row.open;
    const change = row.close - previousClose;
    bars.push({
      time: row.time,
      timestamp: row.timestamp,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
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
  const allAdjusted = accepted.every((row) => row.adjusted);
  return {
    instrument: {
      ...instrument,
      secid: accepted.at(-1)!.symbol,
      exchange: responseExchange,
      provider: "marketstack",
    },
    interval: "1d",
    priceAdjustment: allAdjusted
      ? "corporate-action-adjusted"
      : "raw",
    previousClose: bars[0].open,
    bars,
    latestBarStatus: resolveLatestDailyBarStatus(
      bars.at(-1)!.time,
      responseExchange,
      fetchedAt,
    ),
    source: "marketstack",
    fetchedAt: fetchedAt.toISOString(),
  };
}

export async function fetchMarketstackDailySeries(
  instrument: MarketInstrument,
  requestedLimit = 250,
  fetchImpl: typeof fetch = fetch,
  requestCache: RequestCache = "default",
  apiKey: string | null = configuredApiKey(),
): Promise<MarketSeries> {
  if (!apiKey) throw new Error("Marketstack is not configured");
  if (instrument.assetType !== "etf") {
    throw new Error(
      "Marketstack fallback is enabled only for exchange-traded funds",
    );
  }
  const limit = clampMarketSeriesLimit(requestedLimit, "1d");
  const url = new URL(MARKETSTACK_EOD_ENDPOINT);
  url.searchParams.set("symbols", instrument.code);
  url.searchParams.set(
    "limit",
    String(Math.min(limit, MARKETSTACK_MAX_PAGE_SIZE)),
  );
  url.searchParams.set("sort", "ASC");
  url.searchParams.set("access_key", apiKey);
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
      `Marketstack request failed with status ${response.status}`,
    );
  }
  const payload = (await response.json()) as MarketstackEodResponse;
  if (payload.error) {
    throw new Error(
      payload.error.message || "Marketstack returned an error",
    );
  }
  return parseMarketstackEodRows(
    payload.data ?? [],
    instrument,
    new Date(),
  );
}
