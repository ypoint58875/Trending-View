import { NextResponse } from "next/server";
import snapshot from "@/data/processed/trend-auxiliary.json";

/** Shared, versioned historical auxiliary inputs; never an alternative price feed. */
export async function GET() {
  return NextResponse.json(snapshot, { headers: { "Cache-Control": "public, max-age=3600", "X-Trend-Auxiliary-Identity": snapshot.metadata.identity } });
}
