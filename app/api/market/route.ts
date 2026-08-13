import { NextResponse } from "next/server";
import { fetchMarketSeries } from "@/lib/market";
import {
  DAILY_HISTORY_LIMIT,
  clampMarketSeriesLimit,
} from "@/lib/market/history";
import {
  MARKET_DATA_PROVIDERS,
  MAX_MARKET_INSTRUMENT_NAME_LENGTH,
  type MarketAssetType,
  type MarketDataProvider,
  type MarketInstrument,
  type MarketInterval,
} from "@/lib/market/types";
import { MARKET_EXCHANGES } from "@/lib/market/exchanges";
import { classifyMarketProviderError } from "@/lib/market/provider-errors";

export const dynamic = "force-dynamic";

const allowedIntervals = new Set<MarketInterval>([
  "1m",
  "5m",
  "15m",
  "30m",
  "60m",
  "1d",
]);
const allowedProviders = new Set<MarketDataProvider>(
  MARKET_DATA_PROVIDERS,
);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secid = (url.searchParams.get("secid") || "^N225").slice(0, 40);
  const code = (url.searchParams.get("code") || "N225").slice(0, 24);
  const name = (url.searchParams.get("name") || code).slice(
    0,
    MAX_MARKET_INSTRUMENT_NAME_LENGTH,
  );
  const exchange = (url.searchParams.get("exchange") ||
    "JPX") as MarketInstrument["exchange"];
  const provider = (url.searchParams.get("provider") ||
    "yahoo") as MarketDataProvider;
  const assetType = (url.searchParams.get("assetType") ||
    "index") as MarketAssetType;
  const requestedInterval = (url.searchParams.get("interval") ||
    "1d") as MarketInterval;
  const interval = allowedIntervals.has(requestedInterval)
    ? requestedInterval
    : "1d";
  const mode =
    url.searchParams.get("mode") === "latest" ? "latest" : "history";
  const strictProvider = url.searchParams.get("strictProvider") === "1";
  const audit = url.searchParams.get("audit") === "1";
  const bypassCache = mode === "latest";
  const limit = Number(
    url.searchParams.get("limit") ||
      (mode === "latest" ? 5 : DAILY_HISTORY_LIMIT),
  );
  const finiteLimit = Number.isFinite(limit)
    ? limit
    : mode === "latest"
      ? 5
      : DAILY_HISTORY_LIMIT;
  const effectiveLimit =
    mode === "latest"
      ? Math.min(Math.max(Math.trunc(finiteLimit), 2), 10)
      : clampMarketSeriesLimit(finiteLimit, interval);

  const validProvider = allowedProviders.has(provider);
  const validAssetType =
    assetType === "index" ||
    assetType === "etf" ||
    assetType === "commodity";
  const validSecid =
    provider === "eastmoney"
      ? /^\d+\.[A-Za-z0-9._-]+$/.test(secid)
      : /^[A-Za-z0-9^=._-]{1,40}$/.test(secid);

  if (!validProvider || !validAssetType || !validSecid) {
    return NextResponse.json({ error: "INVALID_SYMBOL" }, { status: 400 });
  }

  try {
    const series = await fetchMarketSeries(
      {
        secid,
        code,
        name,
        exchange: MARKET_EXCHANGES.includes(exchange)
          ? exchange
          : "OTHER",
        assetType,
        provider,
      },
      interval,
      effectiveLimit,
      {
        preferLongHistory: mode !== "latest",
        requestCache: bypassCache ? "no-store" : "default",
        strictProvider,
      },
    );

    return NextResponse.json(series, {
      headers: {
        "Cache-Control":
          bypassCache
            ? "no-store, no-cache, must-revalidate, max-age=0"
            : "no-cache, must-revalidate, max-age=0",
        "CDN-Cache-Control":
          bypassCache
            ? "no-store"
            : "no-cache, must-revalidate",
        "Cloudflare-CDN-Cache-Control":
          bypassCache
            ? "no-store"
            : "no-cache, must-revalidate",
      },
    });
  } catch (error) {
    const errorCode = classifyMarketProviderError(error);
    console.error("Market series request failed", {
      secid,
      provider,
      interval,
      errorCode,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { error: errorCode },
      { status: audit ? 200 : 502 },
    );
  }
}
