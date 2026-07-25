import { NextResponse } from "next/server";
import { fetchMarketSeries } from "@/lib/market";
import type {
  MarketAssetType,
  MarketDataProvider,
  MarketInstrument,
  MarketInterval,
} from "@/lib/market/types";

export const dynamic = "force-dynamic";

const allowedIntervals = new Set<MarketInterval>([
  "1m",
  "5m",
  "15m",
  "30m",
  "60m",
  "1d",
]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secid = (url.searchParams.get("secid") || "100.N225").slice(0, 40);
  const code = (url.searchParams.get("code") || "N225").slice(0, 24);
  const name = (url.searchParams.get("name") || code).slice(0, 40);
  const exchange = (url.searchParams.get("exchange") ||
    "JPX") as MarketInstrument["exchange"];
  const provider = (url.searchParams.get("provider") ||
    "eastmoney") as MarketDataProvider;
  const assetType = (url.searchParams.get("assetType") ||
    "index") as MarketAssetType;
  const requestedInterval = (url.searchParams.get("interval") ||
    "1d") as MarketInterval;
  const interval = allowedIntervals.has(requestedInterval)
    ? requestedInterval
    : "1d";
  const limit = Number(url.searchParams.get("limit") || 1000);
  const mode =
    url.searchParams.get("mode") === "latest" ? "latest" : "history";
  const effectiveLimit =
    mode === "latest"
      ? Math.min(Math.max(Math.trunc(limit), 2), 10)
      : Number.isFinite(limit)
        ? limit
        : 1000;

  const validProvider =
    provider === "eastmoney" ||
    provider === "yahoo" ||
    provider === "nasdaq";
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
        exchange: [
          "SSE",
          "SZSE",
          "JPX",
          "PHLX",
          "NYSE_ARCA",
          "NASDAQ",
          "HKEX",
          "OTHER",
        ].includes(exchange)
          ? exchange
          : "OTHER",
        assetType,
        provider,
      },
      interval,
      effectiveLimit,
      {
        preferLongHistory: mode !== "latest",
        requestCache: mode === "latest" ? "no-store" : "default",
      },
    );

    return NextResponse.json(series, {
      headers: {
        "Cache-Control":
          mode === "latest"
            ? "no-store, no-cache, must-revalidate, max-age=0"
            : "public, max-age=3600, stale-while-revalidate=86400",
        "CDN-Cache-Control":
          mode === "latest"
            ? "no-store"
            : "public, max-age=3600, stale-while-revalidate=86400",
        "Cloudflare-CDN-Cache-Control":
          mode === "latest"
            ? "no-store"
            : "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("Market series request failed", {
      secid,
      interval,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { error: "UPSTREAM_UNAVAILABLE" },
      { status: 502 },
    );
  }
}
