import { NextResponse } from "next/server";
import { searchMarketAssets } from "@/lib/market";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim();

  if (query.length < 1) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results = await searchMarketAssets(query);
    return NextResponse.json(
      { results },
      {
        headers: {
          "Cache-Control": "public, max-age=30, stale-while-revalidate=120",
        },
      },
    );
  } catch (error) {
    console.error("Market search failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { error: "UPSTREAM_UNAVAILABLE", results: [] },
      { status: 502 },
    );
  }
}
