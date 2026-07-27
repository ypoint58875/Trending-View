import { fetchEastmoneySeries, searchEastmoney } from "./eastmoney";
import {
  fetchEodhdDailySeries,
  searchEodhd,
} from "./eodhd";
import { fetchNasdaqDailySeries } from "./nasdaq";
import type {
  MarketInstrument,
  MarketInterval,
  MarketSeries,
} from "./types";
import { fetchYahooSeries, searchYahoo } from "./yahoo";
import { searchCommodityCatalog } from "./commodities";
import {
  DAILY_HISTORY_COVERAGE_CUTOFF_DATE,
  requestsExtendedDailyHistory,
} from "./history";

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
    searchEodhd(query),
    searchYahoo(query),
  ]);
  const candidates = responses.flatMap((response) =>
    response.status === "fulfilled" ? response.value : [],
  );
  candidates.unshift(...searchCommodityCatalog(query));
  const unique = new Map<string, MarketInstrument>();
  candidates.forEach((instrument) => {
    const key = instrumentKey(instrument);
    if (!unique.has(key)) unique.set(key, instrument);
  });
  return Array.from(unique.values()).slice(0, 12);
}

function shouldTryLongerYahooHistory(
  instrument: MarketInstrument,
  interval: MarketInterval,
  series: MarketSeries,
  requestedLimit: number,
) {
  const firstDate = series.bars[0]?.time;
  return (
    instrument.assetType !== "commodity" &&
    interval === "1d" &&
    requestsExtendedDailyHistory(interval, requestedLimit) &&
    Boolean(firstDate && firstDate > DAILY_HISTORY_COVERAGE_CUTOFF_DATE)
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
  const tryEodhd = async (): Promise<MarketSeries | null> => {
    if (interval !== "1d" || instrument.assetType === "commodity") {
      return null;
    }
    try {
      return await fetchEodhdDailySeries(
        instrument,
        limit,
        fetch,
        requestCache,
      );
    } catch {
      return null;
    }
  };

  if (instrument.provider === "eodhd") {
    try {
      return await fetchEodhdDailySeries(
        instrument,
        limit,
        fetch,
        requestCache,
      );
    } catch (eodhdError) {
      try {
        return await fetchYahooSeries(
          instrument,
          interval,
          limit,
          fetch,
          requestCache,
        );
      } catch {
        if (interval === "1d" && instrument.assetType !== "commodity") {
          try {
            return await fetchNasdaqDailySeries(
              instrument,
              limit,
              fetch,
              requestCache,
            );
          } catch {
            // Preserve the original configured-provider error below.
          }
        }
        throw eodhdError;
      }
    }
  }

  if (instrument.provider === "nasdaq") {
    if (interval === "1d") {
      try {
        return await fetchNasdaqDailySeries(
          instrument,
          limit,
          fetch,
          requestCache,
        );
      } catch (nasdaqError) {
        const eodhdSeries = await tryEodhd();
        if (eodhdSeries) return eodhdSeries;
        try {
          return await fetchYahooSeries(
            instrument,
            interval,
            limit,
            fetch,
            requestCache,
          );
        } catch {
          throw nasdaqError;
        }
      }
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
      if (interval === "1d" && instrument.assetType !== "commodity") {
        const eodhdSeries = await tryEodhd();
        if (eodhdSeries) return eodhdSeries;
        try {
          return await fetchNasdaqDailySeries(
            instrument,
            limit,
            fetch,
            requestCache,
          );
        } catch {
          // Preserve the original Yahoo error below.
        }
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
      !shouldTryLongerYahooHistory(
        instrument,
        interval,
        eastmoneySeries,
        limit,
      )
    ) {
      return eastmoneySeries;
    }
  } catch {
    // A supported global index or ETF can fall back below.
  }

  const eodhdSeries = await tryEodhd();
  if (
    eodhdSeries &&
    (!eastmoneySeries ||
      eodhdSeries.bars.length >= eastmoneySeries.bars.length)
  ) {
    return eodhdSeries;
  }

  try {
    const yahooSeries = await fetchYahooSeries(
      instrument,
      interval,
      limit,
      fetch,
      requestCache,
    );
    const availableSeries = [eastmoneySeries, eodhdSeries, yahooSeries]
      .filter((series): series is MarketSeries => series !== null)
      .sort((left, right) => right.bars.length - left.bars.length);
    if (availableSeries[0]) {
      return availableSeries[0];
    }
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
        // Preserve a shorter valid series when no long-history source works.
      }
    }
    if (eodhdSeries) return eodhdSeries;
    if (eastmoneySeries) return eastmoneySeries;
    throw error;
  }

  if (eodhdSeries) return eodhdSeries;
  if (eastmoneySeries) return eastmoneySeries;
  throw new Error("No market data source returned a usable series");
}

export type {
  MarketAssetType,
  MarketBar,
  MarketDataProvider,
  MarketExchange,
  MarketInstrument,
  MarketInterval,
  MarketLatestBarStatus,
  MarketPriceAdjustment,
  MarketSeries,
} from "./types";
export {
  DAILY_HISTORY_LIMIT,
  DAILY_HISTORY_START_DATE,
} from "./history";
