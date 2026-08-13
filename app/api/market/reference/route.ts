import { NextResponse } from "next/server";
import { fetchFredNikkei225Reference } from "@/lib/market/fred";
import {
  DAILY_HISTORY_LIMIT,
  clampMarketSeriesLimit,
} from "@/lib/market/history";
import type { MarketInstrument } from "@/lib/market/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider") ?? "";
  const code = (url.searchParams.get("code") ?? "").slice(0, 24);
  const mode =
    url.searchParams.get("mode") === "latest" ? "latest" : "history";
  const audit = url.searchParams.get("audit") === "1";
  const requestedLimit = Number(
    url.searchParams.get("limit") ??
      (mode === "latest" ? 10 : DAILY_HISTORY_LIMIT),
  );
  const limit = clampMarketSeriesLimit(
    Number.isFinite(requestedLimit)
      ? requestedLimit
      : mode === "latest"
        ? 10
        : DAILY_HISTORY_LIMIT,
    "1d",
  );

  if (provider !== "fred" || code.toUpperCase() !== "N225") {
    return NextResponse.json(
      { error: "UNSUPPORTED_REFERENCE" },
      { status: 400 },
    );
  }

  const instrument: MarketInstrument = {
    secid: "100.N225",
    code: "N225",
    name: "Nikkei 225",
    exchange: "JPX",
    assetType: "index",
    provider: "eastmoney",
  };
  try {
    const series = await fetchFredNikkei225Reference(
      instrument,
      limit,
      fetch,
      mode === "latest" ? "no-store" : "default",
    );
    return NextResponse.json(series, {
      headers: {
        "Cache-Control":
          mode === "latest"
            ? "no-store, no-cache, must-revalidate, max-age=0"
            : "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("Market reference request failed", {
      provider,
      code,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { error: "UPSTREAM_UNAVAILABLE" },
      { status: audit ? 200 : 502 },
    );
  }
}
