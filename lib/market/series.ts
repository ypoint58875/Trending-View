import type { MarketSeries } from "./types";

export function mergeLatestMarketSeries(
  history: MarketSeries,
  latest: MarketSeries,
  limit: number,
): MarketSeries {
  if (
    history.interval !== latest.interval ||
    history.source !== latest.source ||
    history.priceAdjustment !== latest.priceAdjustment
  ) {
    throw new Error(
      "Market series must share an interval, source, and price adjustment",
    );
  }

  const barsByTime = new Map(
    history.bars.map((bar) => [bar.time, bar] as const),
  );
  latest.bars.forEach((bar) => barsByTime.set(bar.time, bar));
  const bars = Array.from(barsByTime.values())
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(-Math.max(Math.trunc(limit), 1));
  return {
    ...history,
    instrument: latest.instrument,
    previousClose: latest.previousClose || history.previousClose,
    bars,
    source: latest.source,
    fetchedAt: latest.fetchedAt,
  };
}
