import { fetchEastmoneySeries, searchEastmoney } from "./eastmoney";
import {
  fetchEodhdDailySeries,
  searchEodhd,
} from "./eodhd";
import { fetchNasdaqDailySeries } from "./nasdaq";
import { fetchNikkei225DailySeries } from "./nikkei";
import {
  fetchTwelveDataDailySeries,
  searchTwelveData,
} from "./twelve-data";
import {
  fetchAlphaVantageDailySeries,
} from "./alpha-vantage";
import {
  fetchFmpDailySeries,
  searchFmpIndexes,
} from "./fmp";
import { fetchAllTickDailySeries } from "./alltick";
import { fetchMarketstackDailySeries } from "./marketstack";
import { fetchZhituDailyIndexSeries } from "./zhitu";
import {
  fetchTencentDailySeries,
  fetchTencentQuoteSeries,
} from "./tencent";
import { fetchJuheQuoteSeries } from "./juhe";
import type {
  MarketInstrument,
  MarketInterval,
  MarketSeries,
} from "./types";
import { fetchYahooSeries, searchYahoo } from "./yahoo";
import { searchCommodityCatalog } from "./commodities";
import { searchIndexCatalog } from "./index-catalog";
import { searchFundCatalog } from "./fund-catalog";
import {
  DAILY_HISTORY_COVERAGE_CUTOFF_DATE,
  requestsExtendedDailyHistory,
} from "./history";
import { canonicalMarketInstrumentKey } from "./canonical";

export {
  exchangeFromProviderLabels,
  knownIndexExchange,
  MARKET_EXCHANGES,
  normalizeMarketCode,
} from "./exchanges";

function instrumentKey(instrument: MarketInstrument) {
  return canonicalMarketInstrumentKey(instrument);
}

const SEARCH_PROVIDER_DEADLINE_MS = 4_000;

async function collectSearchProviderResults(
  searches: readonly (() => Promise<MarketInstrument[]>)[],
  timeoutMs = SEARCH_PROVIDER_DEADLINE_MS,
): Promise<MarketInstrument[][]> {
  if (searches.length === 0) return [];
  return new Promise((resolve) => {
    const results = searches.map(() => [] as MarketInstrument[]);
    let remaining = searches.length;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(results);
    };
    const timer = setTimeout(finish, Math.max(timeoutMs, 1));
    searches.forEach((search, index) => {
      void search()
        .then((instruments) => {
          results[index] = instruments;
          if (index === 0 && instruments.length > 0) finish();
        })
        .catch(() => {
          results[index] = [];
        })
        .finally(() => {
          remaining -= 1;
          if (remaining === 0) finish();
        });
    });
  });
}

export async function searchMarketAssets(
  query: string,
): Promise<MarketInstrument[]> {
  const localCandidates = [
    ...searchFundCatalog(query),
    ...searchIndexCatalog(query),
    ...searchCommodityCatalog(query),
  ];
  if (localCandidates.length > 0) return localCandidates.slice(0, 12);

  const publicResponses = await collectSearchProviderResults([
    () => searchYahoo(query),
    () => searchEastmoney(query),
  ]);
  const publicCandidates = publicResponses.flat();
  const credentialedResponses = publicCandidates.length
    ? []
    : await collectSearchProviderResults([
        () => searchEodhd(query),
        () => searchTwelveData(query),
        () => searchFmpIndexes(query),
      ]);
  const candidates = [
    ...publicCandidates,
    ...credentialedResponses.flat(),
  ];
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
  strictProvider?: boolean;
}

async function fetchStrictProviderSeries(
  instrument: MarketInstrument,
  interval: MarketInterval,
  limit: number,
  requestCache: RequestCache,
): Promise<MarketSeries> {
  if (instrument.provider === "eastmoney") {
    return fetchEastmoneySeries(
      instrument,
      interval,
      limit,
      fetch,
      requestCache,
    );
  }
  if (instrument.provider === "eodhd") {
    if (interval !== "1d") {
      throw new Error("EODHD strict-provider requests require daily bars");
    }
    return fetchEodhdDailySeries(
      instrument,
      limit,
      fetch,
      requestCache,
    );
  }
  if (instrument.provider === "nikkei") {
    if (interval !== "1d") {
      throw new Error("Nikkei official requests require daily bars");
    }
    return fetchNikkei225DailySeries(
      instrument,
      limit,
      fetch,
      requestCache,
    );
  }
  if (instrument.provider === "twelve-data") {
    if (interval !== "1d") {
      throw new Error("Twelve Data requests require daily bars");
    }
    return fetchTwelveDataDailySeries(
      instrument,
      limit,
      fetch,
      requestCache,
    );
  }
  if (instrument.provider === "alpha-vantage") {
    if (interval !== "1d") {
      throw new Error("Alpha Vantage requests require daily bars");
    }
    return fetchAlphaVantageDailySeries(
      instrument,
      limit,
      fetch,
      requestCache,
    );
  }
  if (instrument.provider === "fmp") {
    if (interval !== "1d") {
      throw new Error("FMP requests require daily bars");
    }
    return fetchFmpDailySeries(
      instrument,
      limit,
      fetch,
      requestCache,
    );
  }
  if (instrument.provider === "alltick") {
    if (interval !== "1d") {
      throw new Error("AllTick requests require daily bars");
    }
    return fetchAllTickDailySeries(
      instrument,
      limit,
      fetch,
      requestCache,
    );
  }
  if (instrument.provider === "marketstack") {
    if (interval !== "1d") {
      throw new Error("Marketstack requests require daily bars");
    }
    return fetchMarketstackDailySeries(
      instrument,
      limit,
      fetch,
      requestCache,
    );
  }
  if (instrument.provider === "zhitu") {
    if (interval !== "1d") {
      throw new Error("Zhitu requests require daily bars");
    }
    return fetchZhituDailyIndexSeries(
      instrument,
      limit,
      fetch,
      requestCache,
    );
  }
  if (instrument.provider === "tencent") {
    if (interval !== "1d") {
      throw new Error("Tencent requests require daily bars");
    }
    return limit <= 10
      ? fetchTencentQuoteSeries(instrument, fetch, requestCache)
      : fetchTencentDailySeries(
          instrument,
          limit,
          fetch,
          requestCache,
        );
  }
  if (instrument.provider === "juhe") {
    if (interval !== "1d") {
      throw new Error("Juhe quote requests require daily bars");
    }
    return fetchJuheQuoteSeries(
      instrument,
      fetch,
      requestCache,
    );
  }
  if (instrument.provider === "yahoo") {
    return fetchYahooSeries(
      instrument,
      interval,
      limit,
      fetch,
      requestCache,
    );
  }
  if (interval !== "1d") {
    throw new Error("Nasdaq strict-provider requests require daily bars");
  }
  return fetchNasdaqDailySeries(
    instrument,
    limit,
    fetch,
    requestCache,
  );
}

export async function fetchMarketSeries(
  instrument: MarketInstrument,
  interval: MarketInterval,
  limit: number,
  options: MarketSeriesFetchOptions = {},
): Promise<MarketSeries> {
  const requestCache = options.requestCache ?? "default";
  if (options.strictProvider) {
    return fetchStrictProviderSeries(
      instrument,
      interval,
      limit,
      requestCache,
    );
  }
  if (instrument.provider === "nikkei") {
    return fetchNikkei225DailySeries(
      instrument,
      limit,
      fetch,
      requestCache,
    );
  }
  if (instrument.provider === "twelve-data") {
    return fetchTwelveDataDailySeries(
      instrument,
      limit,
      fetch,
      requestCache,
    );
  }
  if (instrument.provider === "alpha-vantage") {
    return fetchAlphaVantageDailySeries(
      instrument,
      limit,
      fetch,
      requestCache,
    );
  }
  if (instrument.provider === "fmp") {
    return fetchFmpDailySeries(
      instrument,
      limit,
      fetch,
      requestCache,
    );
  }
  if (instrument.provider === "alltick") {
    return fetchAllTickDailySeries(
      instrument,
      limit,
      fetch,
      requestCache,
    );
  }
  if (instrument.provider === "marketstack") {
    return fetchMarketstackDailySeries(
      instrument,
      limit,
      fetch,
      requestCache,
    );
  }
  if (instrument.provider === "zhitu") {
    return fetchZhituDailyIndexSeries(
      instrument,
      limit,
      fetch,
      requestCache,
    );
  }
  if (instrument.provider === "tencent") {
    return interval === "1d" && limit > 10
      ? fetchTencentDailySeries(
          instrument,
          limit,
          fetch,
          requestCache,
        )
      : fetchTencentQuoteSeries(instrument, fetch, requestCache);
  }
  if (instrument.provider === "juhe") {
    return fetchJuheQuoteSeries(
      instrument,
      fetch,
      requestCache,
    );
  }
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
    options.preferLongHistory === false &&
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
  MarketNetworkRoute,
  MarketPriceAdjustment,
  MarketReferenceObservation,
  MarketReferenceProvider,
  MarketReferenceSeries,
  MarketSeries,
  MarketSourceProvider,
  MarketTemporaryQuote,
} from "./types";
export {
  DAILY_HISTORY_LIMIT,
  DAILY_HISTORY_START_DATE,
} from "./history";
