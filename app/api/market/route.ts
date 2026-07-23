import { NextResponse } from "next/server";
import { fetchEastmoneySeries } from "@/lib/market/eastmoney";
import type {
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
  const secid = (url.searchParams.get("secid") || "1.688484").slice(0, 32);
  const code = (url.searchParams.get("code") || "688484").slice(0, 20);
  const name = (url.searchParams.get("name") || code).slice(0, 40);
  const exchange = (url.searchParams.get("exchange") ||
    "SSE") as MarketInstrument["exchange"];
  const requestedInterval = (url.searchParams.get("interval") ||
    "1d") as MarketInterval;
  const interval = allowedIntervals.has(requestedInterval)
    ? requestedInterval
    : "1d";
  const limit = Number(url.searchParams.get("limit") || 1000);

  if (!/^\d+\.\d+$/.test(secid)) {
    return NextResponse.json({ error: "INVALID_SYMBOL" }, { status: 400 });
  }

  try {
    const series = await fetchEastmoneySeries(
      {
        secid,
        code,
        name,
        exchange: ["SSE", "SZSE", "BSE", "OTHER"].includes(exchange)
          ? exchange
          : "OTHER",
        kind: "Security",
      },
      interval,
      Number.isFinite(limit) ? limit : 1000,
    );

    return NextResponse.json(series, {
      headers: {
        "Cache-Control":
          interval === "1d"
            ? "public, max-age=300, stale-while-revalidate=1800"
            : "public, max-age=15, stale-while-revalidate=60",
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
