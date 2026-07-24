import { fetchEastmoneySeries, searchEastmoney } from "./eastmoney";
import { fetchNasdaqDailySeries } from "./nasdaq";
import type {
  MarketInstrument,
  MarketInterval,
  MarketSeries,
} from "./types";
import { fetchYahooSeries, searchYahoo } from "./yahoo";

function instrumentKey(instrument: MarketInstrument) {
  return `${instrument.assetType}:${instrument.code
    .replace(/^\^/, "")
    .replace(/\.(SS|SZ)$/i, "")
    .toUpperCase()}`;
}

export async function searchMarketAssets(
  query: string,
): Promise<MarketInstrument[]> {
  const responses = await Promise.allSettled([
    searchEastmoney(query),
    searchYahoo(query),
  ]);
  const candidates = responses.flatMap((response) =>
    response.status === "fulfilled" ? response.value : [],
  );
  const unique = new Map<string, MarketInstrument>();
  candidates.forEach((instrument) => {
    const key = instrumentKey(instrument);
    if (!unique.has(key)) unique.set(key, instrument);
  });
  return Array.from(unique.values()).slice(0, 12);
}

function shouldUseYahooHistory(
  instrument: MarketInstrument,
  interval: MarketInterval,
  series: MarketSeries,
) {
  return (
    instrument.assetType === "index" &&
    interval === "1d" &&
    series.bars.length < 60
  );
}

export interface MarketSeriesFetchOptions {
  preferLongHistory?: boolean;
  requestCache?: RequestCache;
}

export async function fetchMarketSeries(
  instrument: MarketInstrument,
  interval: MarketInterval,
  limit: number,
  options: MarketSeriesFetchOptions = {},
): Promise<MarketSeries> {
  const requestCache = options.requestCache ?? "default";
  if (instrument.provider === "nasdaq") {
    if (interval === "1d") {
      return fetchNasdaqDailySeries(
        instrument,
        limit,
        fetch,
        requestCache,
      );
    }
    return fetchYahooSeries(
      instrument,
      interval,
      limit,
      fetch,
      requestCache,
    );
  }

  if (instrument.provider === "yahoo") {
    try {
      return await fetchYahooSeries(
        instrument,
        interval,
        limit,
        fetch,
        requestCache,
      );
    } catch (error) {
      if (interval === "1d") {
        return fetchNasdaqDailySeries(
          instrument,
          limit,
          fetch,
          requestCache,
        );
      }
      throw error;
    }
  }

  let eastmoneySeries: MarketSeries | null = null;
  try {
    eastmoneySeries = await fetchEastmoneySeries(
      instrument,
      interval,
      limit,
      fetch,
      requestCache,
    );
    if (
      options.preferLongHistory === false ||
      !shouldUseYahooHistory(instrument, interval, eastmoneySeries)
    ) {
      return eastmoneySeries;
    }
  } catch {
    // A supported global index or ETF can fall back to Yahoo below.
  }

  try {
    return await fetchYahooSeries(
      instrument,
      interval,
      limit,
      fetch,
      requestCache,
    );
  } catch (error) {
    if (interval === "1d") {
      try {
        return await fetchNasdaqDailySeries(
          instrument,
          limit,
          fetch,
          requestCache,
        );
      } catch {
        // Preserve a shorter Eastmoney series when no long-history source works.
      }
    }
    if (eastmoneySeries) return eastmoneySeries;
    throw error;
  }
}

export type {
  MarketAssetType,
  MarketBar,
  MarketDataProvider,
  MarketExchange,
  MarketInstrument,
  MarketInterval,
  MarketSeries,
} from "./types";
