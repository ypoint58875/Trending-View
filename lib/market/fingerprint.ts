import type { MarketReferenceSeries, MarketSeries } from "./types";

async function sha256(payload: string): Promise<string> {
  const bytes = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function fingerprintMarketSeries(
  series: MarketSeries,
): Promise<string> {
  return sha256(
    JSON.stringify({
      interval: series.interval,
      source: series.source,
      priceAdjustment: series.priceAdjustment,
      bars: series.bars.map((bar) => [
        bar.time,
        bar.open,
        bar.high,
        bar.low,
        bar.close,
        bar.volume,
      ]),
    }),
  );
}

export async function fingerprintMarketReferenceSeries(
  series: MarketReferenceSeries,
): Promise<string> {
  return sha256(
    JSON.stringify({
      interval: series.interval,
      source: series.source,
      observations: series.observations.map((observation) => [
        observation.time,
        observation.value,
      ]),
    }),
  );
}
