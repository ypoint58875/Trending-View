import assert from "node:assert/strict";
import test from "node:test";
import {
  runAllocationBacktest,
  runBacktest,
  runBacktestFromTarget,
  type BacktestResult,
} from "../lib/analysis/backtest";
import {
  adx,
  atr,
  bollingerBands,
  cci,
  cmf,
  dema,
  ema,
  ichimoku,
  kdj,
  macd,
  mfi,
  obv,
  parabolicSar,
  roc,
  rsi,
  sma,
  stochasticRsi,
  stochasticSlow,
  supertrend,
  vwap,
  williamsR,
  wma,
  type NumericSeries,
} from "../lib/analysis/indicators";
import {
  DEFAULT_SCREENING_YIELD_EVERY,
  SCREENING_OBJECTIVES,
  buildNearbyParameterSets,
  buildScreeningCandidates,
  compareScreeningResults,
  isIntegerStrategyParameterKey,
  isValidStrategyParameters,
  normalizeStrategyParameterInput,
  optimizeStrategies,
  screeningObjectiveValue,
} from "../lib/analysis/screening";
import {
  MAX_SAVED_BACKTEST_SCROLL_RECORDS,
  groupSavedBacktests,
  parseSaveBacktestInput,
  parseSavedBacktestOrderInput,
  reorderSavedBacktestGroups,
  reorderSavedBacktestsWithinGroup,
  savedBacktestInstrumentKey,
  shouldReplaceSavedBacktest,
  strategyPlansEqual,
  type SavedBacktestRecord,
} from "../lib/analysis/saved-backtests";
import {
  compareScreeningRuns,
  createSaveScreeningRunInput,
  fingerprintMarketSeries,
  parseSaveScreeningRunInput,
} from "../lib/analysis/screening-runs";
import {
  INTRABAR_PRICE_ORDER_STRATEGY_IDS,
  LONG_HORIZON_STRATEGY_IDS,
  SHORT_HORIZON_STRATEGY_IDS,
  areStrategiesEquivalent,
  getStrategy,
  getStrategiesByHorizon,
  STRATEGIES,
} from "../lib/analysis/strategies";
import {
  COMBINATION_FINALISTS_PER_STRATEGY,
  MAX_COMBINATION_PAIR_FINALISTS,
  MAX_COMBINATION_RESULTS,
  SCREENING_ENTRY_FILTER_FINALISTS_PER_STRATEGY,
  STRATEGY_LAYER_ALLOCATION_CANDIDATES,
  TWO_STRATEGY_ALLOCATION_CANDIDATES,
  buildLiveAllocationGuidance,
  buildStrategyPlanAllocationTarget,
  buildStrategyPlanTimeline,
  buildStrategyPlanTimelineFromTargets,
  buildStrategyCombinationTarget,
  optimizeStrategyCombinations,
  resolveRelativeLongStrategy,
  summarizeStrategySignalHorizon,
  type CombinationScreeningProgress,
} from "../lib/analysis/strategy-combinations";
import {
  TRADINGVIEW_BUILT_IN_STRATEGY_IDS,
} from "../lib/analysis/built-in-strategies";
import { buildLiveStrategyGuidance } from "../lib/analysis/live-guidance";
import { buildStrategyOrderTimeline } from "../lib/analysis/strategy-execution";
import type { StrategyOrderSeries } from "../lib/analysis/strategy-orders";
import {
  DEFAULT_MOVING_AVERAGE_SLOPE_FILTER,
  SCREENING_MOVING_AVERAGE_SLOPE_PERIODS,
  SCREENING_MOVING_AVERAGE_SLOPE_STRATEGY_IDS,
  applyMovingAverageSlopeEntryFilter,
  buildMovingAverageEntryAllowedSeries,
  buildMovingAverageSlopeSeries,
  buildScreeningMovingAverageSlopeFilters,
  supportsScreeningMovingAverageSlopeFilter,
} from "../lib/analysis/entry-filter";
import {
  MINIMUM_STABILITY_OBSERVATIONS,
  MINIMUM_STABILITY_TRADES,
  STABILITY_THRESHOLDS,
  analyzeStrategyStability,
  classifyMarketRegimes,
  summarizeNearbyBacktests,
  summarizeRegimeReturns,
} from "../lib/analysis/stability";
import {
  buildStrategyOrders,
  buildStrategyPriceLines,
} from "../lib/analysis/strategy-visuals";
import {
  buildAllocationTradeMarkers,
  buildTradeMarkers,
} from "../lib/analysis/trade-markers";
import {
  COMMODITY_CATALOG,
  searchCommodityCatalog,
} from "../lib/market/commodities";
import {
  fetchEastmoneySeries,
  parseKlineRow,
  searchEastmoney,
} from "../lib/market/eastmoney";
import {
  fetchNasdaqDailySeries,
  parseNasdaqRows,
} from "../lib/market/nasdaq";
import {
  DAILY_HISTORY_LIMIT,
  DAILY_HISTORY_START_DATE,
  DAILY_HISTORY_START_TIMESTAMP_SECONDS,
  clampMarketSeriesLimit,
  requestsExtendedDailyHistory,
} from "../lib/market/history";
import type { MarketPriceAdjustment } from "../lib/market";
import type {
  MarketBar,
  MarketInstrument,
} from "../lib/market/types";
import { mergeLatestMarketSeries } from "../lib/market/series";
import {
  marketSeriesCacheKey,
  readCachedMarketSeries,
  readCachedMarketSeriesEntry,
  writeCachedMarketSeries,
} from "../lib/market/client-cache";
import { resolveLatestDailyBarStatus } from "../lib/market/session";
import {
  fetchYahooSeries,
  parseYahooChart,
  searchYahoo,
  yahooSymbolForInstrument,
} from "../lib/market/yahoo";

function firstScreeningCandidatesPerStrategy(limit: number) {
  const counts = new Map<string, number>();
  return buildScreeningCandidates().filter((candidate) => {
    const count = counts.get(candidate.strategyId) ?? 0;
    if (count >= limit) return false;
    counts.set(candidate.strategyId, count + 1);
    return true;
  });
}

function makeBars(closes: number[]): MarketBar[] {
  return closes.map((close, index) => {
    const date = new Date(Date.UTC(2025, 0, index + 1));
    const time = date.toISOString().slice(0, 10);
    return {
      time,
      timestamp: date.getTime(),
      open: close + 0.1,
      close,
      high: close + 0.5,
      low: close - 0.5,
      volume: 1000 + index * 10,
      amount: close * (1000 + index * 10),
      amplitude: 0,
      changePercent: 0,
      change: 0,
      turnoverRate: 0,
    };
  });
}

function makeOhlcBars(
  rows: Array<{
    open: number;
    high: number;
    low: number;
    close: number;
  }>,
): MarketBar[] {
  return rows.map((row, index) => {
    const date = new Date(Date.UTC(2025, 0, index + 1));
    return {
      ...row,
      time: date.toISOString().slice(0, 10),
      timestamp: date.getTime(),
      volume: 1_000,
      amount: row.close * 1_000,
      amplitude: 0,
      changePercent: 0,
      change: 0,
      turnoverRate: 0,
    };
  });
}

const yahooInstrument: MarketInstrument = {
  secid: "^SOX",
  code: "SOX",
  name: "SOX",
  exchange: "PHLX",
  assetType: "index",
  provider: "yahoo",
};

const yahooCorporateActionFixture = {
  chart: {
    result: [
      {
        meta: {
          symbol: "^SOX",
          longName: "PHLX Semiconductor Sector",
          chartPreviousClose: 100,
          exchangeTimezoneName: "America/New_York",
          exchangeName: "NIM",
        },
        timestamp: [1_752_710_400, 1_752_796_800],
        indicators: {
          quote: [
            {
              open: [98, 49],
              close: [100, 50],
              high: [104, 52],
              low: [96, 48],
              volume: [1_000, 2_000],
            },
          ],
          adjclose: [{ adjclose: [50, 50] }],
        },
      },
    ],
  },
};

test("calculates common indicators without future values", () => {
  const values = [1, 2, 3, 4, 5, 6];
  assert.deepEqual(sma(values, 3), [null, null, 2, 3, 4, 5]);

  const exponential = ema(values, 3);
  assert.deepEqual(exponential.slice(0, 3), [null, null, 2]);
  assert.equal(exponential[3], 3);

  const strength = rsi(values, 3);
  assert.equal(strength[3], 100);
  assert.equal(strength[5], 100);
});

test("normalizes moving-average slope and delays only new entries", () => {
  const bars = makeBars([10, 9, 8, 9, 10, 9, 8]);
  const filter = {
    movingAverageType: "ema" as const,
    period: 2,
    minimumSlopePercent: 0,
  };
  const slopes = buildMovingAverageSlopeSeries(bars, filter);
  const entryAllowed = buildMovingAverageEntryAllowedSeries(bars, filter);

  assert.deepEqual(slopes.slice(0, 3), [null, null, slopes[2]]);
  assert.ok(slopes[2] !== null && slopes[2] < 0);
  assert.ok(slopes[3] !== null && slopes[3] > 0);
  assert.deepEqual(entryAllowed, [
    false,
    false,
    false,
    true,
    true,
    false,
    false,
  ]);
  assert.deepEqual(
    applyMovingAverageSlopeEntryFilter(
      [0, 1, 1, 1, 1, 0, 0],
      entryAllowed,
    ),
    [0, 0, 0, 1, 1, 0, 0],
  );

  const result = runBacktestFromTarget(
    bars,
    "sma-cross",
    { fast: 2, slow: 3 },
    [0, 1, 1, 1, 1, 0, 0],
    {
      initialCash: 100_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
      executionPolicy: "next-open",
      entryFilter: filter,
    },
  );
  assert.equal(result.trades[0]?.entryTime, bars[4].time);
  assert.equal(result.trades[0]?.exitTime, bars[6].time);
  assert.deepEqual(result.entryFilter, filter);
});

test("uses the previous completed slope for intrabar entry orders", () => {
  const bars = makeOhlcBars([
    { open: 10, high: 11, low: 9, close: 10 },
    { open: 9, high: 10, low: 8, close: 9 },
    { open: 8, high: 9, low: 7, close: 8 },
    { open: 9, high: 10, low: 8, close: 9 },
    { open: 10, high: 11, low: 9, close: 10 },
  ]);
  const entryAllowed = buildMovingAverageEntryAllowedSeries(bars, {
    ...DEFAULT_MOVING_AVERAGE_SLOPE_FILTER,
    period: 2,
  });
  const orders: StrategyOrderSeries = bars.map(() => ({
    entryStop: 1,
    exitStop: null,
  }));
  const timeline = buildStrategyOrderTimeline(
    bars,
    orders,
    entryAllowed,
  );

  assert.deepEqual(timeline.target, [0, 0, 0, 0, 1]);
  assert.equal(timeline.fills[4][0]?.action, "buy");
});

test("parses daily and intraday Eastmoney rows", () => {
  const daily = parseKlineRow(
    "2026-07-23,34.80,33.36,35.10,33.20,83369,281930489.00,5.50,-3.50,-1.21,1.95",
  );
  const minute = parseKlineRow(
    "2026-07-23 09:31,34.80,34.49,34.88,34.26,2605,9025544.00,1.79,-0.23,-0.08,0.06",
  );

  assert.equal(daily?.close, 33.36);
  assert.equal(daily?.time, "2026-07-23");
  assert.ok(Number.isFinite(daily?.timestamp));
  assert.equal(minute?.volume, 2605);
  assert.ok(Number.isFinite(minute?.timestamp));
});

test("keeps only indexes and ETFs in Eastmoney search results", async () => {
  const mockFetch = (async () =>
    new Response(
      JSON.stringify({
        QuotationCodeTable: {
          Data: [
            {
              Code: "N225",
              Name: "Nikkei 225",
              QuoteID: "100.N225",
              MktNum: "100",
              SecurityTypeName: "指数",
              SecurityType: "11",
            },
            {
              Code: "510300",
              Name: "CSI 300 ETF",
              QuoteID: "1.510300",
              MktNum: "1",
              SecurityTypeName: "ETF",
              SecurityType: "8",
            },
            {
              Code: "688484",
              Name: "Example Equity",
              QuoteID: "1.688484",
              MktNum: "1",
              SecurityTypeName: "沪A",
              SecurityType: "1",
            },
          ],
        },
      }),
      { status: 200 },
    )) as typeof fetch;

  const results = await searchEastmoney("N225", mockFetch);
  assert.deepEqual(
    results.map((item) => [item.code, item.assetType]),
    [
      ["N225", "index"],
      ["510300", "etf"],
    ],
  );
});

test("keeps only indexes, ETFs, and commodity futures in Yahoo search results", async () => {
  const mockFetch = (async () =>
    new Response(
      JSON.stringify({
        quotes: [
          {
            symbol: "^SOX",
            longname: "PHLX Semiconductor Sector",
            quoteType: "INDEX",
            exchange: "NIM",
          },
          {
            symbol: "SPY",
            longname: "SPDR S&P 500 ETF Trust",
            quoteType: "ETF",
            exchange: "PCX",
          },
          {
            symbol: "NVDA",
            longname: "NVIDIA Corporation",
            quoteType: "EQUITY",
            exchange: "NMS",
          },
          {
            symbol: "GC=F",
            longname: "Gold Futures",
            quoteType: "FUTURE",
            exchange: "CMX",
          },
        ],
      }),
      { status: 200 },
    )) as typeof fetch;

  const results = await searchYahoo("sox", mockFetch);
  assert.deepEqual(
    results.map((item) => [item.code, item.assetType]),
    [
      ["SOX", "index"],
      ["SPY", "etf"],
      ["GC=F", "commodity"],
    ],
  );
});

test("finds deterministic commodity proxies without remote search", () => {
  assert.deepEqual(
    COMMODITY_CATALOG.map(({ code, assetType, provider }) => [
      code,
      assetType,
      provider,
    ]),
    [
      ["GC=F", "commodity", "yahoo"],
      ["SI=F", "commodity", "yahoo"],
      ["CL=F", "commodity", "yahoo"],
      ["HG=F", "commodity", "yahoo"],
    ],
  );
  assert.deepEqual(
    searchCommodityCatalog("silver").map((instrument) => instrument.code),
    ["SI=F"],
  );
  assert.deepEqual(
    searchCommodityCatalog("GC=F").map((instrument) => instrument.code),
    ["GC=F"],
  );
  assert.deepEqual(searchCommodityCatalog("bank"), []);
});

test("adjusts daily Yahoo OHLC and derived changes without rescaling volume", () => {
  const series = parseYahooChart(
    yahooCorporateActionFixture,
    yahooInstrument,
    "1d",
  );

  assert.equal(series.priceAdjustment, "corporate-action-adjusted");
  assert.equal(series.previousClose, 50);
  assert.deepEqual(
    series.bars.map(({ open, close, high, low, volume, change, changePercent }) => ({
      open,
      close,
      high,
      low,
      volume,
      change,
      changePercent,
    })),
    [
      {
        open: 49,
        close: 50,
        high: 52,
        low: 48,
        volume: 1_000,
        change: 1,
        changePercent: (1 / 49) * 100,
      },
      {
        open: 49,
        close: 50,
        high: 52,
        low: 48,
        volume: 2_000,
        change: 0,
        changePercent: 0,
      },
    ],
  );
});

test("marks mixed daily Yahoo prices raw when any parsed bar is unadjusted", () => {
  const series = parseYahooChart(
    {
      chart: {
        result: [
          {
            ...yahooCorporateActionFixture.chart.result[0],
            indicators: {
              quote: [
                {
                  open: [98, 59],
                  close: [100, 60],
                  high: [104, 62],
                  low: [96, 58],
                  volume: [1_000, 2_000],
                },
              ],
              adjclose: [{ adjclose: [50, null] }],
            },
          },
        ],
      },
    },
    yahooInstrument,
    "1d",
  );

  assert.equal(series.bars.length, 2);
  assert.equal(series.priceAdjustment, "raw");
  assert.equal(series.previousClose, 100);
  assert.deepEqual(
    series.bars.map(({ open, close, high, low }) => ({
      open,
      close,
      high,
      low,
    })),
    [
      { open: 98, close: 100, high: 104, low: 96 },
      { open: 59, close: 60, high: 62, low: 58 },
    ],
  );
});

test("rejects invalid computed Yahoo daily adjustment ratios", () => {
  const series = parseYahooChart(
    {
      chart: {
        result: [
          {
            ...yahooCorporateActionFixture.chart.result[0],
            indicators: {
              quote: [
                {
                  open: [Number.MIN_VALUE, Number.MAX_VALUE],
                  close: [Number.MIN_VALUE, Number.MAX_VALUE],
                  high: [Number.MIN_VALUE, Number.MAX_VALUE],
                  low: [Number.MIN_VALUE, Number.MAX_VALUE],
                  volume: [1_000, 2_000],
                },
              ],
              adjclose: [
                { adjclose: [Number.MAX_VALUE, Number.MIN_VALUE] },
              ],
            },
          },
        ],
      },
    },
    yahooInstrument,
    "1d",
  );

  assert.equal(series.bars.length, 2);
  assert.equal(series.priceAdjustment, "raw");
  assert.deepEqual(
    series.bars.map(({ open, close, high, low }) => ({
      open,
      close,
      high,
      low,
    })),
    [
      {
        open: Number.MIN_VALUE,
        close: Number.MIN_VALUE,
        high: Number.MIN_VALUE,
        low: Number.MIN_VALUE,
      },
      {
        open: Number.MAX_VALUE,
        close: Number.MAX_VALUE,
        high: Number.MAX_VALUE,
        low: Number.MAX_VALUE,
      },
    ],
  );
});

test("keeps intraday Yahoo OHLC raw when adjusted closes are present", () => {
  const series = parseYahooChart(
    yahooCorporateActionFixture,
    yahooInstrument,
    "5m",
  );

  assert.equal(series.priceAdjustment, "raw");
  assert.deepEqual(
    series.bars.map(({ open, close, high, low, volume }) => ({
      open,
      close,
      high,
      low,
      volume,
    })),
    [
      { open: 98, close: 100, high: 104, low: 96, volume: 1_000 },
      { open: 49, close: 50, high: 52, low: 48, volume: 2_000 },
    ],
  );
});

test("falls back to raw Yahoo OHLC when adjusted close is absent or invalid", () => {
  for (const adjustedClose of [undefined, -1]) {
    const series = parseYahooChart(
      {
        chart: {
          result: [
            {
              meta: {
                symbol: "^SOX",
                longName: "PHLX Semiconductor Sector",
                chartPreviousClose: 5200,
                exchangeTimezoneName: "America/New_York",
                exchangeName: "NIM",
              },
              timestamp: [1_752_710_400, 1_752_796_800],
              indicators: {
                quote: [
                  {
                    open: [5300, null],
                    close: [5350, 5400],
                    high: [5380, 5420],
                    low: [5280, 5360],
                    volume: [0, 0],
                  },
                ],
                ...(adjustedClose === undefined
                  ? {}
                  : { adjclose: [{ adjclose: [adjustedClose, null] }] }),
              },
            },
          ],
        },
      },
      yahooInstrument,
      "1d",
    );

    assert.equal(series.bars.length, 1);
    assert.equal(series.priceAdjustment, "raw");
    assert.deepEqual(
      {
        open: series.bars[0].open,
        close: series.bars[0].close,
        high: series.bars[0].high,
        low: series.bars[0].low,
      },
      { open: 5300, close: 5350, high: 5380, low: 5280 },
    );
    assert.equal(series.source, "yahoo");
    assert.equal(series.instrument.code, "SOX");
  }
});

test("uses the preceding normalized Yahoo bar after applying the fetch limit", async () => {
  const payload = {
    chart: {
      result: [
        {
          meta: {
            symbol: "^SOX",
            longName: "PHLX Semiconductor Sector",
            chartPreviousClose: 98,
            exchangeTimezoneName: "America/New_York",
            exchangeName: "NIM",
          },
          timestamp: [
            1_752_710_400,
            1_752_796_800,
            1_752_883_200,
            1_752_969_600,
          ],
          indicators: {
            quote: [
              {
                open: [98, 100, 102, 104],
                close: [100, 102, 104, 106],
                high: [102, 104, 106, 108],
                low: [96, 98, 100, 102],
                volume: [1_000, 2_000, 3_000, 4_000],
              },
            ],
            adjclose: [{ adjclose: [50, 51, 52, 53] }],
          },
        },
      ],
    },
  };
  const mockFetch = (async () =>
    new Response(JSON.stringify(payload), { status: 200 })) as typeof fetch;

  const series = await fetchYahooSeries(
    yahooInstrument,
    "1d",
    2,
    mockFetch,
  );

  assert.equal(series.priceAdjustment, "corporate-action-adjusted");
  assert.deepEqual(
    series.bars.map((bar) => bar.close),
    [52, 53],
  );
  assert.equal(series.previousClose, 51);
});

test("uses the Yahoo backup host after a primary network failure", async () => {
  const requestedHosts: string[] = [];
  const mockFetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    requestedHosts.push(url.hostname);
    if (url.hostname === "query1.finance.yahoo.com") {
      throw new TypeError("Simulated network failure");
    }
    return new Response(JSON.stringify(yahooCorporateActionFixture), {
      status: 200,
    });
  }) as typeof fetch;

  const series = await fetchYahooSeries(
    yahooInstrument,
    "1d",
    2,
    mockFetch,
    "no-store",
  );

  assert.deepEqual(requestedHosts, [
    "query1.finance.yahoo.com",
    "query2.finance.yahoo.com",
  ]);
  assert.equal(series.source, "yahoo");
  assert.equal(series.bars.length, 2);
});

test("normalizes Yahoo fallback identity for later latest refreshes", async () => {
  const fallbackInstrument: MarketInstrument = {
    secid: "100.N225",
    code: "N225",
    name: "Nikkei 225",
    exchange: "JPX",
    assetType: "index",
    provider: "eastmoney",
  };
  const legacySavedInstrument: MarketInstrument = {
    ...fallbackInstrument,
    provider: "yahoo",
  };
  const payload = {
    chart: {
      result: [
        {
          ...yahooCorporateActionFixture.chart.result[0],
          meta: {
            ...yahooCorporateActionFixture.chart.result[0].meta,
            symbol: "^N225",
            longName: "Nikkei 225",
          },
        },
      ],
    },
  };
  let requestedSymbol = "";
  const mockFetch = (async (input: string | URL | Request) => {
    requestedSymbol = decodeURIComponent(new URL(String(input)).pathname);
    return new Response(JSON.stringify(payload), {
      status: 200,
    });
  }) as typeof fetch;

  const series = await fetchYahooSeries(
    fallbackInstrument,
    "1d",
    2,
    mockFetch,
  );

  assert.equal(yahooSymbolForInstrument(legacySavedInstrument), "^N225");
  assert.match(requestedSymbol, /\/\^N225$/);
  assert.equal(series.source, "yahoo");
  assert.equal(series.instrument.provider, "yahoo");
  assert.equal(series.instrument.secid, "^N225");
});

test("bounds extended daily history without expanding intraday requests", () => {
  assert.equal(DAILY_HISTORY_START_DATE, "2000-01-01");
  assert.equal(DAILY_HISTORY_LIMIT, 10_000);
  assert.equal(clampMarketSeriesLimit(50_000, "1d"), 10_000);
  assert.equal(clampMarketSeriesLimit(50_000, "5m"), 1_500);
  assert.equal(requestsExtendedDailyHistory("1d", 10_000), true);
  assert.equal(requestsExtendedDailyHistory("1d", 1_500), false);
  assert.equal(requestsExtendedDailyHistory("5m", 10_000), false);
});

test("requests Yahoo daily history from 2000 for the extended workspace", async () => {
  let requestedUrl = "";
  const mockFetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify(yahooCorporateActionFixture), {
      status: 200,
    });
  }) as typeof fetch;

  const series = await fetchYahooSeries(
    yahooInstrument,
    "1d",
    DAILY_HISTORY_LIMIT,
    mockFetch,
  );
  const url = new URL(requestedUrl);

  assert.equal(
    url.searchParams.get("period1"),
    String(DAILY_HISTORY_START_TIMESTAMP_SECONDS),
  );
  assert.ok(Number(url.searchParams.get("period2")) > 0);
  assert.equal(url.searchParams.has("range"), false);
  assert.equal(series.bars.length, 2);
});

test("requests Eastmoney daily history from the shared 2000 boundary", async () => {
  let requestedUrl = "";
  const payload = {
    data: {
      code: "000001",
      market: 1,
      name: "SSE Composite",
      preKPrice: 99,
      klines: [
        "2000-01-04,100,101,102,99,1000,100000,3,1,1,0.5",
        "2000-01-05,101,102,103,100,1100,110000,3,1,1,0.5",
      ],
    },
  };
  const mockFetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify(payload), { status: 200 });
  }) as typeof fetch;

  const series = await fetchEastmoneySeries(
    {
      secid: "1.000001",
      code: "000001",
      name: "SSE Composite",
      exchange: "SSE",
      assetType: "index",
      provider: "eastmoney",
    },
    "1d",
    DAILY_HISTORY_LIMIT,
    mockFetch,
  );
  const url = new URL(requestedUrl);

  assert.equal(url.searchParams.get("beg"), "20000101");
  assert.equal(url.searchParams.get("lmt"), String(DAILY_HISTORY_LIMIT));
  assert.equal(series.bars[0].time, "2000-01-04");
});

test("re-exports the market price-adjustment type from the market barrel", () => {
  const adjustment: MarketPriceAdjustment = "corporate-action-adjusted";
  assert.equal(adjustment, "corporate-action-adjusted");
});

test("parses Nasdaq history into chronological index bars", () => {
  const bars = parseNasdaqRows([
    {
      date: "07/22/2026",
      close: "12,410.66",
      volume: "--",
      open: "12,356.16",
      high: "12,525.70",
      low: "12,113.95",
    },
    {
      date: "07/21/2026",
      close: "12,356.16",
      volume: "--",
      open: "12,300.00",
      high: "12,404.11",
      low: "12,085.99",
    },
  ]);

  assert.equal(bars.length, 2);
  assert.equal(bars[0].time, "2026-07-21");
  assert.equal(bars[1].close, 12_410.66);
  assert.equal(bars[1].volume, 0);
});

test("requests Nasdaq daily fallback history from 2000", async () => {
  let requestedUrl = "";
  const payload = {
    data: {
      tradesTable: {
        rows: [
          {
            date: "01/05/2000",
            close: "102",
            volume: "1100",
            open: "101",
            high: "103",
            low: "100",
          },
          {
            date: "01/04/2000",
            close: "101",
            volume: "1000",
            open: "100",
            high: "102",
            low: "99",
          },
        ],
      },
    },
    status: { rCode: 200 },
  };
  const mockFetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify(payload), { status: 200 });
  }) as typeof fetch;

  const series = await fetchNasdaqDailySeries(
    {
      secid: "^SOX",
      code: "SOX",
      name: "SOX",
      exchange: "PHLX",
      assetType: "index",
      provider: "nasdaq",
    },
    DAILY_HISTORY_LIMIT,
    mockFetch,
  );
  const url = new URL(requestedUrl);

  assert.equal(url.searchParams.get("fromdate"), DAILY_HISTORY_START_DATE);
  assert.equal(url.searchParams.get("limit"), String(DAILY_HISTORY_LIMIT));
  assert.equal(series.bars[0].time, "2000-01-04");
});

test("resolves exchange close status conservatively for daily bars", () => {
  assert.equal(
    resolveLatestDailyBarStatus(
      "2026-07-24",
      "JPX",
      new Date("2026-07-24T06:29:00.000Z"),
    ),
    "in-progress",
  );
  assert.equal(
    resolveLatestDailyBarStatus(
      "2026-07-24",
      "JPX",
      new Date("2026-07-24T06:30:00.000Z"),
    ),
    "complete",
  );
  assert.equal(
    resolveLatestDailyBarStatus(
      "2026-07-23",
      "OTHER",
      new Date("2026-07-24T06:30:00.000Z"),
    ),
    "complete",
  );
  assert.equal(
    resolveLatestDailyBarStatus(
      "2026-07-24",
      "OTHER",
      new Date("2026-07-24T06:30:00.000Z"),
    ),
    "unknown",
  );
  assert.equal(
    resolveLatestDailyBarStatus(
      "2026-07-24",
      "HKEX",
      new Date("2026-07-24T04:01:00.000Z"),
      Date.parse("2026-07-24T04:00:00.000Z") / 1000,
    ),
    "complete",
  );
});

test("builds isolated persistent cache keys per provider, instrument, and interval", () => {
  const instrument: MarketInstrument = {
    secid: "100.N225",
    code: "N225",
    name: "N225",
    exchange: "JPX",
    assetType: "index",
    provider: "eastmoney",
  };
  assert.equal(
    marketSeriesCacheKey(instrument, "1d"),
    "eastmoney:100.N225:1d",
  );
  assert.notEqual(
    marketSeriesCacheKey(
      { ...instrument, provider: "yahoo", secid: "^N225" },
      "1d",
    ),
    marketSeriesCacheKey(instrument, "1d"),
  );
});

test("groups and reorders the bounded saved-backtest scroll list", () => {
  const makeSavedRecord = (
    id: number,
    instrument: SavedBacktestRecord["instrument"],
  ): SavedBacktestRecord => ({
    id,
    instrument,
    interval: "1d",
    strategyId: "sma-cross",
    parameters: { fast: 10, slow: 30 },
    plan: {
      strategyA: {
        strategyId: "sma-cross",
        parameters: { fast: 10, slow: 30 },
      },
      strategyB: null,
      strategyAAllocation: 1,
      strategyBAllocation: 0,
    },
    indicators: [{ id: "sma", parameters: { fast: 5, slow: 20 } }],
    startDate: "2024-01-01",
    endDate: "2025-01-01",
    initialCash: 100_000,
    commissionPercent: 0.03,
    slippagePercent: 0.02,
    metrics: {
      totalReturn: 12.3,
      maxDrawdown: 8.1,
      sharpe: 1.2,
      tradeCount: 10,
      score: 42,
    },
    createdAt: "2026-07-26T00:00:00.000Z",
    updatedAt: "2026-07-26T00:00:00.000Z",
  });
  const nikkei = makeSavedRecord(1, {
    secid: "100.N225",
    code: "N225",
    name: "Nikkei 225",
    exchange: "JPX",
    assetType: "index",
    provider: "eastmoney",
  });
  const gold = makeSavedRecord(2, {
    secid: "GC=F",
    code: "GC=F",
    name: "Gold Futures Proxy",
    exchange: "OTHER",
    assetType: "commodity",
    provider: "yahoo",
  });
  const nikkeiFallback = makeSavedRecord(3, {
    secid: "^N225",
    code: "^N225",
    name: "Nikkei 225",
    exchange: "JPX",
    assetType: "index",
    provider: "yahoo",
  });
  const records = [nikkei, gold, nikkeiFallback];
  const nikkeiKey = savedBacktestInstrumentKey(nikkei.instrument);
  const goldKey = savedBacktestInstrumentKey(gold.instrument);

  assert.equal(MAX_SAVED_BACKTEST_SCROLL_RECORDS, 200);
  assert.equal(
    nikkeiKey,
    savedBacktestInstrumentKey(nikkeiFallback.instrument),
  );
  assert.deepEqual(
    groupSavedBacktests(records).map((group) => ({
      key: group.key,
      ids: group.records.map((record) => record.id),
    })),
    [
      { key: nikkeiKey, ids: [1, 3] },
      { key: goldKey, ids: [2] },
    ],
  );
  assert.deepEqual(
    reorderSavedBacktestGroups(records, nikkeiKey, goldKey).map(
      (record) => record.id,
    ),
    [2, 1, 3],
  );
  assert.deepEqual(
    reorderSavedBacktestsWithinGroup(records, nikkeiKey, 1, 3).map(
      (record) => record.id,
    ),
    [3, 1, 2],
  );
  assert.deepEqual(parseSavedBacktestOrderInput({ orderedIds: [3, 1, 2] }), {
    orderedIds: [3, 1, 2],
  });
  assert.equal(
    parseSavedBacktestOrderInput({ orderedIds: [1, 1] }),
    null,
  );
  assert.equal(
    parseSavedBacktestOrderInput({
      orderedIds: Array.from(
        { length: MAX_SAVED_BACKTEST_SCROLL_RECORDS + 1 },
        (_, index) => index + 1,
      ),
    }),
    null,
  );
});

test("keeps an in-memory history fallback when persistent browser storage is unavailable", async () => {
  const instrument: MarketInstrument = {
    secid: "100.N225-memory-cache",
    code: "N225",
    name: "N225 memory cache",
    exchange: "JPX",
    assetType: "index",
    provider: "eastmoney",
  };
  const bars = makeBars([10, 11, 12]);
  await writeCachedMarketSeries({
    instrument,
    interval: "1d",
    priceAdjustment: "corporate-action-adjusted",
    previousClose: 9,
    bars,
    latestBarStatus: "unknown",
    source: "eastmoney",
    fetchedAt: "2026-07-26T00:00:00.000Z",
  });

  const cached = await readCachedMarketSeries(instrument, "1d");
  assert.deepEqual(cached?.bars, bars);
  assert.equal(cached?.instrument.secid, instrument.secid);
});

test("keeps an old cached history available without a time expiry", async () => {
  const instrument: MarketInstrument = {
    secid: "100.N225-old-cache",
    code: "N225",
    name: "N225 old cache",
    exchange: "JPX",
    assetType: "index",
    provider: "eastmoney",
  };
  const originalDateNow = Date.now;
  const cachedAt = Date.parse("2020-01-02T03:04:00.000Z");
  try {
    Date.now = () => cachedAt;
    await writeCachedMarketSeries({
      instrument,
      interval: "1d",
      priceAdjustment: "corporate-action-adjusted",
      previousClose: 9,
      bars: makeBars([10, 11, 12]),
      latestBarStatus: "complete",
      source: "eastmoney",
      fetchedAt: "2020-01-02T03:04:00.000Z",
    });
    Date.now = () => Date.parse("2026-07-26T00:00:00.000Z");

    const cached = await readCachedMarketSeriesEntry(instrument, "1d");
    assert.equal(cached?.cachedAt, cachedAt);
    assert.equal(cached?.series.instrument.secid, instrument.secid);
    assert.equal(cached?.series.bars.length, 3);
  } finally {
    Date.now = originalDateNow;
  }
});

test("reads provider-fallback history through the originally requested instrument key", async () => {
  const requestedInstrument: MarketInstrument = {
    secid: "251.SOX-cache-alias",
    code: "SOX",
    name: "SOX request",
    exchange: "PHLX",
    assetType: "index",
    provider: "eastmoney",
  };
  const resolvedInstrument: MarketInstrument = {
    ...requestedInstrument,
    secid: "^SOX-cache-alias",
    name: "SOX resolved",
    provider: "yahoo",
  };
  await writeCachedMarketSeries(
    {
      instrument: resolvedInstrument,
      interval: "1d",
      priceAdjustment: "corporate-action-adjusted",
      previousClose: 9,
      bars: makeBars([10, 11, 12]),
      latestBarStatus: "complete",
      source: "yahoo",
      fetchedAt: "2026-07-26T00:00:00.000Z",
    },
    [requestedInstrument],
  );

  const cached = await readCachedMarketSeries(requestedInstrument, "1d");
  assert.equal(cached?.instrument.provider, "yahoo");
  assert.equal(cached?.instrument.secid, resolvedInstrument.secid);
});

test("merges overlapping latest bars idempotently only for one adjustment mode", () => {
  const instrument: MarketInstrument = {
    secid: "100.N225",
    code: "N225",
    name: "N225",
    exchange: "JPX",
    assetType: "index",
    provider: "eastmoney",
  };
  const historyBars = makeBars([10, 11, 12, 13]);
  const latestBars = makeBars([12, 15]).map((bar, index) => ({
    ...bar,
    time: historyBars[index + 2].time,
    timestamp: historyBars[index + 2].timestamp,
  }));
  const history = {
    instrument,
    interval: "1d" as const,
    priceAdjustment: "corporate-action-adjusted" as const,
    previousClose: 9,
    bars: historyBars,
    source: "eastmoney" as const,
    fetchedAt: "2026-07-24T01:00:00.000Z",
    latestBarStatus: "complete" as const,
  };
  for (const priceAdjustment of [
    "corporate-action-adjusted",
    "raw",
  ] as const) {
    const scenarioHistory = {
      ...history,
      priceAdjustment,
    };
    const latest = {
      ...scenarioHistory,
      bars: latestBars,
      fetchedAt: "2026-07-24T01:01:00.000Z",
    };

    const merged = mergeLatestMarketSeries(scenarioHistory, latest, 1000);
    const remerged = mergeLatestMarketSeries(merged, latest, 1000);

    assert.equal(
      merged.priceAdjustment,
      priceAdjustment,
      priceAdjustment,
    );
    assert.deepEqual(
      merged.bars.map((bar) => bar.close),
      [10, 11, 12, 15],
      priceAdjustment,
    );
    assert.equal(merged.bars[0], historyBars[0], priceAdjustment);
    assert.equal(merged.bars[2], latestBars[0], priceAdjustment);
    assert.equal(merged.bars[3], latestBars[1], priceAdjustment);
    assert.deepEqual(remerged, merged, priceAdjustment);
    assert.equal(merged.fetchedAt, latest.fetchedAt, priceAdjustment);
  }
});

test("rejects adjusted/raw market-series merges in either direction", () => {
  const instrument: MarketInstrument = {
    secid: "100.N225",
    code: "N225",
    name: "N225",
    exchange: "JPX",
    assetType: "index",
    provider: "eastmoney",
  };
  const adjusted = {
    instrument,
    interval: "1d" as const,
    priceAdjustment: "corporate-action-adjusted" as const,
    previousClose: 9,
    bars: makeBars([10, 11, 12]),
    source: "eastmoney" as const,
    fetchedAt: "2026-07-24T01:00:00.000Z",
    latestBarStatus: "complete" as const,
  };
  const raw = {
    ...adjusted,
    priceAdjustment: "raw" as const,
  };

  for (const [history, latest] of [
    [adjusted, raw],
    [raw, adjusted],
  ] as const) {
    assert.throws(
      () => mergeLatestMarketSeries(history, latest, 1_000),
      /price adjustment/i,
    );
  }
});

test("calculates every catalog indicator with aligned finite output", () => {
  const bars = makeBars(
    Array.from({ length: 240 }, (_, index) => {
      return 100 + index * 0.08 + Math.sin(index / 6) * 4;
    }),
  );
  const closes = bars.map((bar) => bar.close);
  const series: NumericSeries[] = [
    sma(closes, 20),
    ema(closes, 20),
    wma(closes, 20),
    dema(closes, 20),
    bollingerBands(closes).middle,
    vwap(bars),
    supertrend(bars).trend,
    ichimoku(bars).spanB,
    rsi(closes),
    macd(closes).histogram,
    kdj(bars).j,
    stochasticRsi(closes).d,
    cci(bars),
    williamsR(bars),
    adx(bars).adx,
    roc(closes),
    mfi(bars),
    cmf(bars),
    atr(bars),
    obv(bars),
  ];

  assert.equal(series.length, 20);
  series.forEach((values) => {
    assert.equal(values.length, bars.length);
    assert.ok(values.some((value) => value !== null && Number.isFinite(value)));
  });

  [stochasticSlow(bars).d, parabolicSar(bars)].forEach((values) => {
    assert.equal(values.length, bars.length);
    assert.ok(values.some((value) => value !== null && Number.isFinite(value)));
  });
});

test("builds aligned long-only signals for every strategy", () => {
  const bars = makeBars(
    Array.from({ length: 240 }, (_, index) => {
      return 50 + index * 0.03 + Math.sin(index / 4) * 3;
    }),
  );

  assert.equal(STRATEGIES.length, 34);
  assert.equal(TRADINGVIEW_BUILT_IN_STRATEGY_IDS.length, 20);
  assert.deepEqual(
    STRATEGIES.filter((strategy) => strategy.id.startsWith("tv-")).map(
      (strategy) => strategy.id,
    ),
    [...TRADINGVIEW_BUILT_IN_STRATEGY_IDS],
  );
  STRATEGIES.forEach((strategy) => {
    const target = strategy.buildTarget(
      bars,
      strategy.defaultParameters,
    );
    assert.equal(target.length, bars.length);
    assert.ok(target.every((value) => value === 0 || value === 1));
  });

  assert.deepEqual(
    STRATEGIES.filter((strategy) => strategy.buildOrders).map(
      (strategy) => strategy.id,
    ),
    [...INTRABAR_PRICE_ORDER_STRATEGY_IDS],
  );
});

test("classifies every registered strategy into one explicit holding horizon", () => {
  assert.deepEqual(LONG_HORIZON_STRATEGY_IDS, [
    "sma-cross",
    "ema-cross",
    "macd-momentum",
    "donchian-breakout",
    "donchian-intrabar",
    "supertrend-trend",
    "supertrend-stop",
    "ichimoku-trend",
    "roc-momentum",
    "tv-bollinger-directed",
    "tv-keltner-channels",
    "tv-macd",
    "tv-momentum",
    "tv-parabolic-sar",
    "tv-price-channel",
    "tv-supertrend",
    "tv-technical-ratings",
  ]);
  assert.deepEqual(SHORT_HORIZON_STRATEGY_IDS, [
    "rsi-reversal",
    "bollinger-reversion",
    "kdj-reversal",
    "mfi-reversal",
    "vwap-reversion",
    "tv-bar-up-down",
    "tv-bollinger-bands",
    "tv-channel-breakout",
    "tv-consecutive-up-down",
    "tv-greedy",
    "tv-inside-bar",
    "tv-outside-bar",
    "tv-pivot-extension",
    "tv-pivot-reversal",
    "tv-rsi",
    "tv-stochastic-slow",
    "tv-volty-expan-close",
  ]);

  const categorizedIds = [
    ...LONG_HORIZON_STRATEGY_IDS,
    ...SHORT_HORIZON_STRATEGY_IDS,
  ];
  assert.equal(categorizedIds.length, STRATEGIES.length);
  assert.equal(new Set(categorizedIds).size, STRATEGIES.length);
  assert.deepEqual(
    getStrategiesByHorizon("long").map((strategy) => strategy.id),
    LONG_HORIZON_STRATEGY_IDS,
  );
  assert.deepEqual(
    getStrategiesByHorizon("short").map((strategy) => strategy.id),
    SHORT_HORIZON_STRATEGY_IDS,
  );
  for (const strategy of STRATEGIES) {
    assert.ok(
      strategy.horizon === "long" || strategy.horizon === "short",
      strategy.id,
    );
  }
});

test("builds gated zero, A, and A plus B allocation targets", () => {
  const combined = buildStrategyPlanAllocationTarget(
    [0, 1, 1, 1, 0],
    [1, 0, 1, 0, 1],
    0.6,
    0.4,
  );
  assert.deepEqual(combined, [0, 0.6, 1, 0.6, 0]);
  assert.throws(
    () =>
      buildStrategyPlanAllocationTarget([1], [1, 0], 0.6, 0.4),
    /align/i,
  );
  assert.throws(
    () => buildStrategyPlanAllocationTarget([1], [1], -0.1, 0.4),
    /between zero and one/i,
  );
});

test("builds optional A, optional B, and hierarchical dual-strategy allocations", () => {
  assert.deepEqual(
    buildStrategyPlanAllocationTarget([0, 1, 1], [1, 0, 1], 0.4, 0.3),
    [0, 0.4, 0.7],
  );
  assert.deepEqual(
    buildStrategyPlanAllocationTarget([0, 1, 1], null, 0.4, 0.3),
    [0, 1, 1],
  );
  assert.deepEqual(
    buildStrategyPlanAllocationTarget(null, [0, 1, 0], 0.4, 0.3),
    [0, 1, 0],
  );
  assert.throws(
    () => buildStrategyPlanAllocationTarget(null, null, 0.4, 0.3),
    /strategy/i,
  );
  assert.throws(
    () => buildStrategyPlanAllocationTarget([1], [1], 0.9, 0.2),
    /sum/i,
  );
});

test("builds five full-allocation strategy assignments", () => {
  assert.deepEqual(
    STRATEGY_LAYER_ALLOCATION_CANDIDATES,
    [0.3, 0.4, 0.5, 0.6, 0.7],
  );
  assert.deepEqual(TWO_STRATEGY_ALLOCATION_CANDIDATES, [
    { strategyAAllocation: 0.6, strategyBAllocation: 0.4 },
    { strategyAAllocation: 0.4, strategyBAllocation: 0.6 },
    { strategyAAllocation: 0.5, strategyBAllocation: 0.5 },
    { strategyAAllocation: 0.7, strategyBAllocation: 0.3 },
    { strategyAAllocation: 0.3, strategyBAllocation: 0.7 },
  ]);
  assert.ok(
    TWO_STRATEGY_ALLOCATION_CANDIDATES.every(
      ({ strategyAAllocation, strategyBAllocation }) =>
        [0.3, 0.4, 0.5, 0.6, 0.7].includes(strategyAAllocation) &&
        [0.3, 0.4, 0.5, 0.6, 0.7].includes(strategyBAllocation) &&
        strategyAAllocation + strategyBAllocation === 1,
    ),
  );
});

test("classifies the relatively longer signal by average active duration", () => {
  assert.deepEqual(
    summarizeStrategySignalHorizon([0, 1, 1, 1, 0, 1, 1]),
    {
      averageActiveBars: 2.5,
      activeRunCount: 2,
      transitionCount: 3,
    },
  );
  assert.equal(
    resolveRelativeLongStrategy(
      [0, 1, 0, 1, 0],
      [0, 1, 1, 1, 0],
    ),
    "strategyB",
  );
  assert.equal(
    resolveRelativeLongStrategy(
      [0, 1, 1, 0],
      [0, 1, 1, 0],
    ),
    "strategyA",
  );
});

test("pairs short entries with exits and attributes a gated final clear to both relative roles", () => {
  const timeline = buildStrategyPlanTimelineFromTargets(
    [0, 1, 1, 0, 0],
    [0, 0, 1, 1, 0],
    0.6,
    0.4,
  );

  assert.deepEqual(timeline.target, [0, 0.6, 1, 0, 0]);
  assert.deepEqual(timeline.signalEvents, [
    [],
    ["long-entry"],
    ["short-entry"],
    ["long-exit", "short-exit"],
    [],
  ]);
  assert.equal(timeline.relativeLongStrategy, "strategyA");
  const shortEntries = timeline.signalEvents.flat().filter(
    (event) => event === "short-entry",
  ).length;
  const shortExits = timeline.signalEvents.flat().filter(
    (event) => event === "short-exit",
  ).length;
  assert.equal(shortEntries, shortExits);
});

test("does not inherit an already-active short signal at the first long entry", () => {
  const timeline = buildStrategyPlanTimelineFromTargets(
    [0, 1, 1, 1, 0],
    [1, 1, 0, 1, 1],
    0.4,
    0.6,
  );

  assert.deepEqual(timeline.target, [0, 0.4, 0.4, 1, 0]);
  assert.deepEqual(timeline.signalEvents, [
    [],
    ["long-entry"],
    [],
    ["short-entry"],
    ["long-exit", "short-exit"],
  ]);
});

test("lets strategy B become the relative long-cycle gate", () => {
  const timeline = buildStrategyPlanTimelineFromTargets(
    [0, 0, 1, 0, 1, 0],
    [0, 1, 1, 1, 1, 0],
    0.4,
    0.6,
  );

  assert.equal(timeline.relativeLongStrategy, "strategyB");
  assert.deepEqual(timeline.target, [0, 0.6, 1, 0.6, 1, 0]);
  assert.deepEqual(timeline.signalEvents, [
    [],
    ["long-entry"],
    ["short-entry"],
    ["short-exit"],
    ["short-entry"],
    ["long-exit", "short-exit"],
  ]);
});

test("executes attributed long and short signals at the following open", () => {
  const bars = makeOhlcBars([
    { open: 10, high: 10, low: 10, close: 10 },
    { open: 11, high: 11, low: 11, close: 11 },
    { open: 12, high: 12, low: 12, close: 12 },
    { open: 13, high: 13, low: 13, close: 13 },
    { open: 14, high: 14, low: 14, close: 14 },
  ]);
  const timeline = buildStrategyPlanTimelineFromTargets(
    [0, 1, 1, 0, 0],
    [0, 0, 1, 1, 0],
    0.6,
    0.4,
  );
  const result = runAllocationBacktest(
    bars,
    timeline.target,
    {
      initialCash: 10_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
    },
    timeline.signalEvents,
  );

  assert.deepEqual(
    result.rebalances.map((rebalance) => rebalance.signals),
    [
      ["long-entry"],
      ["short-entry"],
      ["long-exit", "short-exit"],
    ],
  );
  assert.equal(result.rebalances.at(-1)?.targetAllocation, 0);
  assert.equal(result.rebalances.at(-1)?.reason, "strategy");
});

test("reports current plan allocation and increase, reduce, hold, or wait", () => {
  const bars = makeOhlcBars([
    { open: 10, high: 10.5, low: 9.5, close: 10 },
    { open: 11, high: 12.5, low: 10.8, close: 12 },
    { open: 12, high: 13.5, low: 11.8, close: 13 },
    { open: 12, high: 12.2, low: 10.8, close: 11 },
    { open: 11, high: 11.2, low: 10.8, close: 11 },
  ]);
  const strategyBOnly = {
    strategyA: null,
    strategyB: {
      strategyId: "tv-bar-up-down" as const,
      parameters: { minimumBodyPercent: 0 },
    },
    strategyAAllocation: 0,
    strategyBAllocation: 0.4,
  };

  assert.deepEqual(
    buildLiveAllocationGuidance(bars.slice(0, 2), strategyBOnly),
    {
      action: "increase",
      previousAllocation: 0,
      targetAllocation: 1,
    },
  );
  assert.equal(
    buildLiveAllocationGuidance(bars.slice(0, 3), strategyBOnly)?.action,
    "hold",
  );
  assert.deepEqual(
    buildLiveAllocationGuidance(bars.slice(0, 4), strategyBOnly),
    {
      action: "reduce",
      previousAllocation: 1,
      targetAllocation: 0,
    },
  );
  assert.equal(
    buildLiveAllocationGuidance(bars, strategyBOnly)?.action,
    "wait",
  );
});

test("accepts two strategies from the same catalog horizon", () => {
  const bars = makeBars(
    Array.from({ length: 180 }, (_, index) => {
      return 100 + index * 0.08 + Math.sin(index / 5) * 4;
    }),
  );
  const combination = {
    strategyAId: "sma-cross" as const,
    strategyAParameters: { fast: 10, slow: 30 },
    strategyBId: "ema-cross" as const,
    strategyBParameters: { fast: 8, slow: 25 },
    strategyAAllocation: 0.6,
    strategyBAllocation: 0.4,
  };
  const fullTarget = buildStrategyCombinationTarget(bars, combination);

  assert.equal(getStrategy(combination.strategyAId).horizon, "long");
  assert.equal(getStrategy(combination.strategyBId).horizon, "long");
  assert.equal(fullTarget.length, bars.length);
  assert.ok(
    fullTarget.every(
      (allocation) =>
        allocation === 0 ||
        allocation === 0.4 ||
        allocation === 0.6 ||
        allocation === 1,
    ),
  );
});

test("groups mathematically equivalent strategies and rejects duplicate pairs", () => {
  assert.equal(areStrategiesEquivalent("macd-momentum", "tv-macd"), true);
  assert.equal(
    areStrategiesEquivalent("supertrend-trend", "tv-supertrend"),
    true,
  );
  assert.equal(areStrategiesEquivalent("sma-cross", "ema-cross"), false);

  const bars = makeBars(Array.from({ length: 120 }, (_, index) => 100 + index));
  assert.throws(
    () =>
      buildStrategyPlanTimeline(bars, {
        strategyA: {
          strategyId: "macd-momentum",
          parameters: { fast: 12, slow: 26, signal: 9 },
        },
        strategyB: {
          strategyId: "tv-macd",
          parameters: { fast: 12, slow: 26, signal: 9 },
        },
        strategyAAllocation: 0.6,
        strategyBAllocation: 0.4,
      }),
    /equivalent/i,
  );
});

test("rebalances hierarchical allocations at the next open and applies costs", () => {
  const bars = makeOhlcBars([
    { open: 10, high: 10, low: 10, close: 10 },
    { open: 11, high: 11, low: 11, close: 11 },
    { open: 12, high: 12, low: 12, close: 12 },
    { open: 13, high: 13, low: 13, close: 13 },
    { open: 14, high: 14, low: 14, close: 14 },
  ]);
  const target = [0, 1, 0.6, 1, 0];
  const result = runAllocationBacktest(bars, target, {
    initialCash: 10_000,
    commissionRate: 0.001,
    slippageRate: 0.001,
    interval: "1d",
  });

  assert.equal(result.rebalances[0].time, bars[2].time);
  assert.equal(result.rebalances[0].targetAllocation, 1);
  assert.equal(result.rebalances[1].time, bars[3].time);
  assert.equal(result.rebalances[1].targetAllocation, 0.6);
  assert.equal(result.rebalances[2].time, bars[4].time);
  assert.equal(result.rebalances[2].targetAllocation, 1);
  assert.equal(result.rebalances.at(-1)?.reason, "strategy");
  assert.equal(result.rebalances.length, 3);
  assert.equal(result.tradeCount, result.rebalances.length);
  assert.ok(result.finalEquity > 10_000);
  assert.ok(result.finalEquity < 12_000);
  assert.ok(result.maxDrawdown <= 0);
});

test("does not trade again while a planned allocation state is unchanged", () => {
  const bars = makeOhlcBars([
    { open: 10, high: 10, low: 10, close: 10 },
    { open: 11, high: 11, low: 11, close: 11 },
    { open: 12, high: 12, low: 12, close: 12 },
    { open: 13, high: 13, low: 13, close: 13 },
    { open: 14, high: 14, low: 14, close: 14 },
    { open: 15, high: 15, low: 15, close: 15 },
  ]);
  const result = runAllocationBacktest(
    bars,
    [0, 0.6, 0.6, 0.6, 0, 0],
    {
      initialCash: 10_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
    },
  );

  assert.deepEqual(
    result.rebalances.map(({ time, targetAllocation, reason }) => ({
      time,
      targetAllocation,
      reason,
    })),
    [
      {
        time: bars[2].time,
        targetAllocation: 0.6,
        reason: "strategy",
      },
      {
        time: bars[5].time,
        targetAllocation: 0,
        reason: "strategy",
      },
    ],
  );
});

test("Channel BreakOut sells to flat on a lower-channel break", () => {
  const bars = makeBars([10, 10, 10, 10, 10, 12, 9]);
  const strategy = STRATEGIES.find(
    (candidate) => candidate.id === "tv-channel-breakout",
  );
  assert.ok(strategy);

  const target = strategy.buildTarget(bars, { length: 3 });
  assert.equal(target[5], 1);
  assert.equal(target[6], 0);
});

test("executes a close signal at the next bar open and applies costs", () => {
  const bars = makeBars([10, 9, 8, 9, 10, 11, 10, 9, 8]);
  const result = runBacktest(
    bars,
    "sma-cross",
    { fast: 2, slow: 3 },
    {
      initialCash: 10_000,
      commissionRate: 0.001,
      slippageRate: 0.001,
      interval: "1d",
    },
  );

  assert.equal(result.tradeCount, 1);
  assert.equal(result.trades[0].entryTime, bars[5].time);
  assert.ok(result.trades[0].entryPrice > bars[5].open);
  assert.ok(result.finalEquity < 10_000);
  assert.ok(result.maxDrawdown <= 0);
});

test("fills Channel BreakOut stops on the touched bar using the configured tick", () => {
  const bars = makeOhlcBars([
    { open: 9.5, high: 10, low: 9, close: 9.5 },
    { open: 10, high: 11, low: 9.5, close: 10.5 },
    { open: 11, high: 12, low: 10, close: 11.5 },
    { open: 9.8, high: 10, low: 9, close: 9.2 },
    { open: 9.2, high: 9.5, low: 8.8, close: 9 },
  ]);
  const result = runBacktest(
    bars,
    "tv-channel-breakout",
    { length: 2, tick: 0.1 },
    {
      initialCash: 10_000,
      commissionRate: 0,
      slippageRate: 0,
      startTime: bars[2].time,
      endTime: bars[4].time,
      interval: "1d",
    },
  );

  assert.equal(result.tradeCount, 1);
  assert.equal(result.trades[0].entryTime, bars[2].time);
  assert.equal(result.trades[0].entryPrice, 11.1);
  assert.equal(result.trades[0].exitTime, bars[3].time);
  assert.equal(result.trades[0].exitPrice, 9.4);
});

test("aligns selected-range capital to the complete-history opening state", () => {
  const bars = makeOhlcBars([
    { open: 10, high: 11, low: 9, close: 10 },
    { open: 11, high: 12, low: 10, close: 11 },
    { open: 12, high: 13, low: 11, close: 12 },
    { open: 13, high: 14, low: 12, close: 13 },
    { open: 14, high: 15, low: 13, close: 14 },
    { open: 15, high: 16, low: 14, close: 15 },
  ]);
  const settings = {
    initialCash: 10_000,
    commissionRate: 0,
    slippageRate: 0,
    startTime: bars[3].time,
    endTime: bars[5].time,
    interval: "1d" as const,
    executionPolicy: "hybrid" as const,
  };
  const fullTarget = [0, 1, 1, 1, 1, 0];
  const direct = runBacktestFromTarget(
    bars,
    "sma-cross",
    { fast: 2, slow: 3 },
    fullTarget,
    settings,
  );
  const allocation = runAllocationBacktest(bars, fullTarget, settings);

  assert.equal(direct.tradeCount, 0);
  assert.equal(direct.trades.length, 0);
  assert.equal(allocation.tradeCount, 0);
  assert.equal(allocation.rebalances.length, 0);
  assert.equal(direct.finalEquity, allocation.finalEquity);
  assert.ok(direct.finalEquity > settings.initialCash);
});

test("carries a price-order position into a selected range before resolving exits", () => {
  const bars = makeOhlcBars([
    { open: 10, high: 11, low: 9, close: 10 },
    { open: 11, high: 12, low: 10, close: 11 },
    { open: 12, high: 13, low: 11, close: 12 },
    { open: 13, high: 14, low: 12, close: 13 },
    { open: 14, high: 15, low: 13, close: 14 },
    { open: 15, high: 16, low: 14, close: 15 },
  ]);
  const orders: StrategyOrderSeries = bars.map(() => ({
    entryStop: null,
    exitStop: null,
  }));
  orders[1] = { entryStop: 11.5, exitStop: null };
  orders[4] = { entryStop: null, exitStop: 13.5 };
  const result = runBacktestFromTarget(
    bars,
    "tv-channel-breakout",
    { length: 2, tick: 0 },
    [0, 1, 1, 1, 0, 0],
    {
      initialCash: 10_000,
      commissionRate: 0,
      slippageRate: 0,
      startTime: bars[3].time,
      endTime: bars[5].time,
      interval: "1d",
      executionPolicy: "hybrid",
    },
    orders,
  );

  assert.equal(result.tradeCount, 0);
  assert.equal(result.trades.length, 0);
  assert.ok(result.finalEquity > 10_000);
});

test("executes price-reference strategies at following opens in manual history", () => {
  const bars = makeBars([10, 10, 10, 10, 10, 12, 11, 9, 9]);
  const result = runBacktest(
    bars,
    "tv-channel-breakout",
    { length: 3, tick: 0.1 },
    {
      initialCash: 10_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
      executionPolicy: "next-open",
    },
  );

  assert.equal(result.tradeCount, 1);
  assert.equal(result.trades[0].entryTime, bars[6].time);
  assert.equal(result.trades[0].entryPrice, bars[6].open);
  assert.equal(result.trades[0].exitTime, bars[8].time);
  assert.equal(result.trades[0].exitPrice, bars[8].open);
});

test("fills intrabar stop gaps at the bar open", () => {
  const bars = makeOhlcBars([
    { open: 9.5, high: 10, low: 9, close: 9.5 },
    { open: 10, high: 11, low: 9.5, close: 10.5 },
    { open: 12, high: 12.5, low: 11.5, close: 12 },
    { open: 8, high: 8.5, low: 7.5, close: 8 },
    { open: 8, high: 8.2, low: 7.8, close: 8 },
  ]);
  const result = runBacktest(
    bars,
    "tv-channel-breakout",
    { length: 2, tick: 0.1 },
    {
      initialCash: 10_000,
      commissionRate: 0,
      slippageRate: 0,
      startTime: bars[2].time,
      endTime: bars[4].time,
      interval: "1d",
    },
  );

  assert.equal(result.tradeCount, 1);
  assert.equal(result.trades[0].entryPrice, 12);
  assert.equal(result.trades[0].exitPrice, 8);
});

test("executes Greedy gaps immediately and candle colors at the next open", () => {
  const gapBars = makeOhlcBars([
    { open: 10, high: 10.5, low: 9.5, close: 10 },
    { open: 11, high: 11.5, low: 10.8, close: 11 },
    { open: 10, high: 10.2, low: 9.8, close: 10 },
  ]);
  const gapResult = runBacktest(
    gapBars,
    "tv-greedy",
    { minimumBodyPercent: 3 },
    {
      initialCash: 10_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
    },
  );

  assert.equal(gapResult.trades[0].entryTime, gapBars[1].time);
  assert.equal(gapResult.trades[0].entryPrice, gapBars[1].open);
  assert.equal(gapResult.trades[0].exitTime, gapBars[2].time);
  assert.equal(gapResult.trades[0].exitPrice, gapBars[2].open);

  const candleBars = makeOhlcBars([
    { open: 10, high: 10.6, low: 9.8, close: 10.5 },
    { open: 10.4, high: 10.6, low: 10, close: 10.1 },
    { open: 10.2, high: 10.3, low: 9.9, close: 10.2 },
  ]);
  const candleResult = runBacktest(
    candleBars,
    "tv-greedy",
    { minimumBodyPercent: 0 },
    {
      initialCash: 10_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
    },
  );

  assert.equal(candleResult.trades[0].entryTime, candleBars[1].time);
  assert.equal(candleResult.trades[0].entryPrice, candleBars[1].open);
  assert.equal(candleResult.trades[0].exitTime, candleBars[2].time);
  assert.equal(candleResult.trades[0].exitPrice, candleBars[2].open);
});

test("executes Parabolic SAR reversals on the touched bar", () => {
  const bars = makeOhlcBars([
    { open: 10, high: 11, low: 9, close: 10 },
    { open: 9.5, high: 10, low: 8, close: 9 },
    { open: 10, high: 11.5, low: 9.5, close: 11 },
    { open: 9, high: 9.5, low: 7.5, close: 8 },
  ]);
  const result = runBacktest(
    bars,
    "tv-parabolic-sar",
    { start: 0.02, increment: 0.02, maximum: 0.2 },
    {
      initialCash: 10_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
    },
  );

  assert.equal(result.trades[0].entryTime, bars[2].time);
  assert.equal(result.trades[0].entryPrice, 11);
  assert.equal(result.trades[0].exitTime, bars[3].time);
  assert.equal(result.trades[0].exitPrice, 8);
});

test("keeps Donchian close confirmation and adds a touched-bar variant", () => {
  const bars = makeOhlcBars([
    { open: 9.5, high: 10, low: 9, close: 9.5 },
    { open: 10, high: 11, low: 9.5, close: 10.5 },
    { open: 10.5, high: 12, low: 10, close: 10.8 },
    { open: 10.8, high: 11, low: 10.2, close: 10.7 },
  ]);
  const settings = {
    initialCash: 10_000,
    commissionRate: 0,
    slippageRate: 0,
    interval: "1d" as const,
  };
  const intrabar = runBacktest(
    bars,
    "donchian-intrabar",
    { entryPeriod: 2, exitPeriod: 1 },
    settings,
  );
  const closeConfirmed = runBacktest(
    bars,
    "donchian-breakout",
    { entryPeriod: 2, exitPeriod: 1 },
    settings,
  );

  assert.equal(intrabar.tradeCount, 0);
  assert.ok(intrabar.finalEquity < settings.initialCash);
  assert.equal(closeConfirmed.finalEquity, settings.initialCash);
  assert.equal(closeConfirmed.tradeCount, 0);
});

test("executes the Supertrend stop variant at prior completed bands", () => {
  const bars = makeOhlcBars([
    { open: 10, high: 11, low: 9, close: 10 },
    { open: 10, high: 11, low: 9, close: 10 },
    { open: 11, high: 12.5, low: 10, close: 12 },
    { open: 10, high: 10.5, low: 8.5, close: 9 },
  ]);
  const result = runBacktest(
    bars,
    "supertrend-stop",
    { period: 2, multiplier: 1 },
    {
      initialCash: 10_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
    },
  );

  assert.equal(result.trades[0].entryTime, bars[2].time);
  assert.equal(result.trades[0].entryPrice, 12);
  assert.equal(result.trades[0].exitTime, bars[3].time);
  assert.equal(result.trades[0].exitPrice, 9);
});

test("builds price orders only from information available before each bar", () => {
  const bars = makeBars(
    Array.from({ length: 80 }, (_, index) => {
      return 100 + index * 0.08 + Math.sin(index / 4) * 5;
    }),
  );

  for (const strategyId of INTRABAR_PRICE_ORDER_STRATEGY_IDS) {
    const strategy = getStrategy(strategyId);
    assert.ok(strategy.buildOrders, strategyId);
    const fullOrders = strategy.buildOrders(
      bars,
      strategy.defaultParameters,
    );
    assert.ok(
      fullOrders.some(
        (orders) => orders.entryStop !== null || orders.entryAtOpen,
      ),
      `${strategyId}:entry`,
    );
    assert.ok(
      fullOrders.some(
        (orders) => orders.exitStop !== null || orders.exitAtOpen,
      ),
      `${strategyId}:exit`,
    );

    for (const prefixLength of [20, 40, 60]) {
      const prefixOrders = strategy.buildOrders(
        bars.slice(0, prefixLength),
        strategy.defaultParameters,
      );
      assert.deepEqual(
        fullOrders.slice(0, prefixLength),
        prefixOrders,
        `${strategyId}:${prefixLength}`,
      );
    }
  }
});

test("initializes every price-order selected range from executed order state", () => {
  const bars = makeOhlcBars(
    Array.from({ length: 240 }, (_, index) => {
      const close =
        100 +
        index * 0.03 +
        Math.sin(index / 5) * 8 +
        Math.sin(index / 17) * 4;
      const open = close + Math.sin(index) * 1.2;
      return {
        open,
        high: Math.max(open, close) + 2.4,
        low: Math.min(open, close) - 2.4,
        close,
      };
    }),
  );
  const settings = {
    initialCash: 10_000,
    commissionRate: 0.0003,
    slippageRate: 0.0002,
    startTime: bars[120].time,
    endTime: bars.at(-1)!.time,
    interval: "1d" as const,
    executionPolicy: "hybrid" as const,
  };
  let distinctSignalTargetCount = 0;

  for (const strategyId of INTRABAR_PRICE_ORDER_STRATEGY_IDS) {
    const strategy = getStrategy(strategyId);
    const orders = strategy.buildOrders!(
      bars,
      strategy.defaultParameters,
    );
    const executedTarget = buildStrategyOrderTimeline(bars, orders).target;
    const signalTarget = strategy.buildTarget(
      bars,
      strategy.defaultParameters,
    );
    if (signalTarget.some((value, index) => value !== executedTarget[index])) {
      distinctSignalTargetCount += 1;
    }
    const expected = runBacktestFromTarget(
      bars,
      strategyId,
      strategy.defaultParameters,
      executedTarget,
      settings,
      orders,
    );
    const actual = runBacktest(
      bars,
      strategyId,
      strategy.defaultParameters,
      settings,
    );

    assert.deepEqual(actual.trades, expected.trades, strategyId);
    assert.equal(actual.finalEquity, expected.finalEquity, strategyId);
  }
  assert.ok(distinctSignalTargetCount >= 2);
});

test("builds Channel BreakOut entry and exit visuals from its order plan", () => {
  const bars = makeOhlcBars([
    { open: 9.5, high: 10, low: 9, close: 9.5 },
    { open: 10, high: 11, low: 9.5, close: 10.5 },
    { open: 11, high: 12, low: 10, close: 11.5 },
    { open: 9.8, high: 10, low: 9, close: 9.2 },
  ]);
  const parameters = { length: 2, tick: 0.1 };
  const orders = buildStrategyOrders(
    bars,
    "tv-channel-breakout",
    parameters,
  );

  assert.ok(orders);
  assert.deepEqual(
    buildStrategyPriceLines(
      bars,
      "tv-channel-breakout",
      parameters,
    ),
    [
      {
        id: "tv-channel-breakout:entry",
        role: "entry",
        data: orders.map((order) => order.entryStop),
      },
      {
        id: "tv-channel-breakout:exit",
        role: "exit",
        data: orders.map((order) => order.exitStop),
      },
    ],
  );
});

test("builds every price-order visual directly from its aligned order plan", () => {
  const bars = makeBars(
    Array.from({ length: 100 }, (_, index) => {
      return 100 + index * 0.08 + Math.sin(index / 4) * 5;
    }),
  );

  for (const strategyId of INTRABAR_PRICE_ORDER_STRATEGY_IDS) {
    const strategy = getStrategy(strategyId);
    const orders = buildStrategyOrders(
      bars,
      strategyId,
      strategy.defaultParameters,
    );
    const lines = buildStrategyPriceLines(
      bars,
      strategyId,
      strategy.defaultParameters,
    );

    assert.ok(orders, strategyId);
    if (strategyId === "tv-greedy") {
      assert.deepEqual(
        lines.map((line) => line.data),
        [
          [null, ...bars.slice(0, -1).map((bar) => bar.high)],
          [null, ...bars.slice(0, -1).map((bar) => bar.low)],
        ],
      );
      continue;
    }
    assert.deepEqual(
      lines.map((line) => line.data),
      [
        orders.map((order) => order.entryStop),
        orders.map((order) => order.exitStop),
      ],
      strategyId,
    );
  }
});

test("builds strategy price references from the same indicator calculations", () => {
  const bars = makeBars(
    Array.from({ length: 80 }, (_, index) => {
      return 100 + index * 0.1 + Math.sin(index / 3) * 4;
    }),
  );
  const closes = bars.map((bar) => bar.close);

  const smaParameters = { fast: 5, slow: 12 };
  assert.deepEqual(
    buildStrategyPriceLines(bars, "sma-cross", smaParameters),
    [
      {
        id: "sma-cross:fast",
        role: "fast",
        data: sma(closes, smaParameters.fast),
      },
      {
        id: "sma-cross:slow",
        role: "slow",
        data: sma(closes, smaParameters.slow),
      },
    ],
  );

  const bollingerParameters = { period: 10, width: 1.5 };
  const bands = bollingerBands(
    closes,
    bollingerParameters.period,
    bollingerParameters.width,
  );
  assert.deepEqual(
    buildStrategyPriceLines(
      bars,
      "tv-bollinger-bands",
      bollingerParameters,
    ),
    [
      {
        id: "tv-bollinger-bands:middle",
        role: "middle",
        data: bands.middle,
      },
      {
        id: "tv-bollinger-bands:upper",
        role: "upper",
        data: bands.upper,
      },
      {
        id: "tv-bollinger-bands:lower",
        role: "lower",
        data: bands.lower,
      },
    ],
  );

  const supertrendParameters = { period: 7, multiplier: 2.5 };
  assert.deepEqual(
    buildStrategyPriceLines(
      bars,
      "supertrend-trend",
      supertrendParameters,
    ),
    [
      {
        id: "supertrend-trend:trend",
        role: "trend",
        data: supertrend(
          bars,
          supertrendParameters.period,
          supertrendParameters.multiplier,
        ).trend,
      },
    ],
  );
  assert.deepEqual(
    buildStrategyPriceLines(
      bars,
      "rsi-reversal",
      getStrategy("rsi-reversal").defaultParameters,
    ),
    [],
  );
});

test("uses the exact Technical Ratings EMA-20 and SMA-50 price votes", () => {
  const bars = makeBars(
    Array.from({ length: 80 }, (_, index) => {
      return 100 + index * 0.1 + Math.sin(index / 3) * 4;
    }),
  );
  const closes = bars.map((bar) => bar.close);

  assert.deepEqual(
    buildStrategyPriceLines(
      bars,
      "tv-technical-ratings",
      getStrategy("tv-technical-ratings").defaultParameters,
    ),
    [
      {
        id: "tv-technical-ratings:ema-20",
        role: "fast",
        data: ema(closes, 20),
      },
      {
        id: "tv-technical-ratings:sma-50",
        role: "slow",
        data: sma(closes, 50),
      },
    ],
  );
});

test("aligns Donchian, VWAP, Keltner, and SAR price references", () => {
  const bars = makeOhlcBars([
    { open: 9, high: 10, low: 8, close: 9 },
    { open: 10, high: 12, low: 9, close: 11 },
    { open: 9, high: 11, low: 7, close: 10 },
    { open: 12, high: 13, low: 10, close: 12 },
    { open: 11, high: 12, low: 9, close: 11 },
    { open: 13, high: 14, low: 11, close: 13 },
  ]);

  const donchian = buildStrategyPriceLines(
    bars,
    "donchian-breakout",
    { entryPeriod: 2, exitPeriod: 3 },
  );
  assert.deepEqual(donchian[0].data, [null, null, 12, 12, 13, 13]);
  assert.deepEqual(donchian[1].data, [null, null, null, 7, 7, 7]);

  const vwapParameters = { entryPercent: 2, exitPercent: 1 };
  const vwapValues = vwap(bars);
  assert.deepEqual(
    buildStrategyPriceLines(bars, "vwap-reversion", vwapParameters),
    [
      {
        id: "vwap-reversion:vwap",
        role: "reference",
        data: vwapValues,
      },
      {
        id: "vwap-reversion:entry",
        role: "entry",
        data: vwapValues.map((value) =>
          value === null
            ? null
            : value * (1 - vwapParameters.entryPercent / 100),
        ),
      },
      {
        id: "vwap-reversion:exit",
        role: "exit",
        data: vwapValues.map((value) =>
          value === null
            ? null
            : value * (1 + vwapParameters.exitPercent / 100),
        ),
      },
    ],
  );

  const keltnerParameters = { period: 3, multiplier: 1.5 };
  const middle = ema(
    bars.map((bar) => bar.close),
    keltnerParameters.period,
  );
  const volatility = atr(bars, keltnerParameters.period);
  assert.deepEqual(
    buildStrategyPriceLines(
      bars,
      "tv-keltner-channels",
      keltnerParameters,
    ),
    [
      {
        id: "tv-keltner-channels:middle",
        role: "middle",
        data: middle,
      },
      {
        id: "tv-keltner-channels:upper",
        role: "upper",
        data: middle.map((value, index) =>
          value === null || volatility[index] === null
            ? null
            : value + volatility[index]! * keltnerParameters.multiplier,
        ),
      },
      {
        id: "tv-keltner-channels:lower",
        role: "lower",
        data: middle.map((value, index) =>
          value === null || volatility[index] === null
            ? null
            : value - volatility[index]! * keltnerParameters.multiplier,
        ),
      },
    ],
  );

  const sarParameters = {
    start: 0.03,
    increment: 0.02,
    maximum: 0.25,
  };
  const sarOrders = buildStrategyOrders(
    bars,
    "tv-parabolic-sar",
    sarParameters,
  );
  assert.ok(sarOrders);
  assert.deepEqual(
    buildStrategyPriceLines(bars, "tv-parabolic-sar", sarParameters).map(
      (line) => line.data,
    ),
    [
      sarOrders.map((order) => order.entryStop),
      sarOrders.map((order) => order.exitStop),
    ],
  );
});

test("returns only declared aligned finite price lines for every strategy", () => {
  const bars = makeBars(
    Array.from({ length: 100 }, (_, index) => {
      return 100 + index * 0.08 + Math.sin(index / 4) * 5;
    }),
  );
  const expectedLineSuffixes = new Map<string, string[]>([
    ["sma-cross", ["fast", "slow"]],
    ["ema-cross", ["fast", "slow"]],
    ["bollinger-reversion", ["middle", "upper", "lower"]],
    ["donchian-breakout", ["entry", "exit"]],
    ["donchian-intrabar", ["entry", "exit"]],
    ["supertrend-trend", ["trend"]],
    ["supertrend-stop", ["entry", "exit"]],
    ["ichimoku-trend", ["conversion", "base", "span-a", "span-b"]],
    ["vwap-reversion", ["vwap", "entry", "exit"]],
    ["tv-bollinger-bands", ["middle", "upper", "lower"]],
    ["tv-bollinger-directed", ["middle", "upper", "lower"]],
    ["tv-channel-breakout", ["entry", "exit"]],
    ["tv-greedy", ["entry", "exit"]],
    ["tv-keltner-channels", ["middle", "upper", "lower"]],
    ["tv-momentum", ["entry", "exit"]],
    ["tv-parabolic-sar", ["entry", "exit"]],
    ["tv-pivot-reversal", ["entry", "exit"]],
    ["tv-price-channel", ["entry", "exit"]],
    ["tv-supertrend", ["trend"]],
    ["tv-technical-ratings", ["ema-20", "sma-50"]],
    ["tv-volty-expan-close", ["entry", "exit"]],
  ]);

  for (const strategy of STRATEGIES) {
    const lines = buildStrategyPriceLines(
      bars,
      strategy.id,
      strategy.defaultParameters,
    );
    assert.deepEqual(
      lines.map((line) => line.id),
      (expectedLineSuffixes.get(strategy.id) ?? []).map(
        (suffix) => `${strategy.id}:${suffix}`,
      ),
      strategy.id,
    );
    assert.equal(
      new Set(lines.map((line) => line.id)).size,
      lines.length,
      strategy.id,
    );
    for (const line of lines) {
      assert.equal(line.data.length, bars.length, line.id);
      assert.ok(
        line.data.every(
          (value) => value === null || Number.isFinite(value),
        ),
        line.id,
      );
    }
  }
});

test("keeps every strategy price line invariant across input prefixes", () => {
  const bars = makeBars(
    Array.from({ length: 100 }, (_, index) => {
      return 100 + index * 0.08 + Math.sin(index / 4) * 5;
    }),
  );

  for (const strategy of STRATEGIES) {
    const fullLines = buildStrategyPriceLines(
      bars,
      strategy.id,
      strategy.defaultParameters,
    );
    for (const prefixLength of [20, 40, 80]) {
      const prefixLines = buildStrategyPriceLines(
        bars.slice(0, prefixLength),
        strategy.id,
        strategy.defaultParameters,
      );
      assert.deepEqual(
        prefixLines,
        fullLines.map((line) => ({
          ...line,
          data: line.data.slice(0, prefixLength),
        })),
        `${strategy.id}:${prefixLength}`,
      );
    }
  }
});

test("executes only long trades and maps entries and exits to buy/sell markers", () => {
  const bars = makeBars([10, 10, 10, 12, 13, 8, 7, 9, 11]);
  const result = runBacktest(
    bars,
    "tv-channel-breakout",
    { length: 2 },
    {
      initialCash: 10_000,
      commissionRate: 0.001,
      slippageRate: 0.001,
      interval: "1d",
    },
  );

  assert.ok(result.tradeCount > 0);
  assert.ok(
    result.trades.every(
      (trade) => !Object.prototype.hasOwnProperty.call(trade, "direction"),
    ),
  );

  const markers = buildTradeMarkers(result.trades);
  assert.equal(markers.buys.length, result.tradeCount);
  assert.equal(
    markers.sells.length + markers.rangeExits.length,
    result.tradeCount,
  );
  assert.ok(markers.buys.every((marker) => marker.event === "entry"));
  assert.ok(markers.sells.every((marker) => marker.event === "exit"));
  assert.ok(
    markers.rangeExits.every((marker) => marker.event === "range-exit"),
  );
});

test("reports live buy, hold, sell, and flat guidance from the latest bar", () => {
  const bars = makeOhlcBars([
    { open: 10, high: 10.5, low: 9.5, close: 10 },
    { open: 11, high: 12.5, low: 10.8, close: 12 },
    { open: 12, high: 13.5, low: 11.8, close: 13 },
    { open: 12, high: 12.2, low: 10.8, close: 11 },
    { open: 11, high: 11.2, low: 10.8, close: 11 },
  ]);
  const parameters = { minimumBodyPercent: 0 };

  assert.equal(
    buildLiveStrategyGuidance(
      bars.slice(0, 2),
      "tv-bar-up-down",
      parameters,
    )?.action,
    "buy",
  );
  assert.equal(
    buildLiveStrategyGuidance(
      bars.slice(0, 2),
      "tv-bar-up-down",
      parameters,
    )?.executionMode,
    "next-open",
  );
  assert.equal(
    buildLiveStrategyGuidance(
      bars.slice(0, 3),
      "tv-bar-up-down",
      parameters,
    )?.action,
    "hold",
  );
  assert.equal(
    buildLiveStrategyGuidance(
      bars.slice(0, 4),
      "tv-bar-up-down",
      parameters,
    )?.action,
    "sell",
  );
  assert.equal(
    buildLiveStrategyGuidance(
      bars,
      "tv-bar-up-down",
      parameters,
    )?.action,
    "wait",
  );
});

test("uses touched stop orders for live price-strategy guidance", () => {
  const bars = makeOhlcBars([
    { open: 9.5, high: 10, low: 9, close: 9.5 },
    { open: 10, high: 11, low: 9.5, close: 10.5 },
    { open: 11, high: 12, low: 10, close: 11.5 },
    { open: 9.8, high: 10, low: 9, close: 9.2 },
  ]);

  const entry = buildLiveStrategyGuidance(
    bars.slice(0, 3),
    "tv-channel-breakout",
    { length: 2, tick: 0.1 },
  );
  const exit = buildLiveStrategyGuidance(
    bars,
    "tv-channel-breakout",
    { length: 2, tick: 0.1 },
  );

  assert.equal(entry?.action, "buy");
  assert.equal(entry?.triggerPrice, 11.1);
  assert.equal(entry?.todayEntryPrice, 11.1);
  assert.equal(entry?.executionMode, "intrabar-order");
  assert.equal(exit?.action, "sell");
  assert.equal(exit?.triggerPrice, 9.4);
  assert.equal(exit?.todayExitPrice, 9.4);
  assert.equal(exit?.executionMode, "intrabar-order");
});

test("ignores incomplete close signals while retaining intrabar stop fills", () => {
  const closeSignalBars = makeOhlcBars([
    { open: 10, high: 10.5, low: 9.5, close: 10 },
    { open: 11, high: 12.5, low: 10.8, close: 12 },
  ]);
  assert.equal(
    buildLiveStrategyGuidance(
      closeSignalBars,
      "tv-bar-up-down",
      { minimumBodyPercent: 0 },
      "complete",
    )?.action,
    "buy",
  );
  assert.equal(
    buildLiveStrategyGuidance(
      closeSignalBars,
      "tv-bar-up-down",
      { minimumBodyPercent: 0 },
      "in-progress",
    )?.action,
    "wait",
  );

  const stopBars = makeOhlcBars([
    { open: 9.5, high: 10, low: 9, close: 9.5 },
    { open: 10, high: 11, low: 9.5, close: 10.5 },
    { open: 11, high: 12, low: 10, close: 11.5 },
  ]);
  assert.equal(
    buildLiveStrategyGuidance(
      stopBars,
      "tv-channel-breakout",
      { length: 2, tick: 0.1 },
      "in-progress",
    )?.action,
    "buy",
  );
  assert.equal(
    buildLiveAllocationGuidance(
      closeSignalBars,
      {
        strategyA: {
          strategyId: "tv-bar-up-down",
          parameters: { minimumBodyPercent: 0 },
        },
        strategyB: null,
        strategyAAllocation: 1,
        strategyBAllocation: 0,
      },
      undefined,
      "in-progress",
    )?.action,
    "wait",
  );
  assert.equal(
    buildLiveAllocationGuidance(
      stopBars,
      {
        strategyA: {
          strategyId: "tv-channel-breakout",
          parameters: { length: 2, tick: 0.1 },
        },
        strategyB: null,
        strategyAAllocation: 1,
        strategyBAllocation: 0,
      },
      undefined,
      "in-progress",
    )?.action,
    "increase",
  );
});

test("reports open-only Greedy and projected SAR prices in live guidance", () => {
  const greedyBars = makeOhlcBars([
    { open: 10, high: 10.5, low: 9.5, close: 10 },
    { open: 11, high: 11.5, low: 10.8, close: 11 },
  ]);
  const greedy = buildLiveStrategyGuidance(
    greedyBars,
    "tv-greedy",
    { minimumBodyPercent: 3 },
  );

  assert.equal(greedy?.action, "buy");
  assert.equal(greedy?.triggerPrice, 11);
  assert.equal(greedy?.todayEntryPrice, 11);
  assert.equal(greedy?.executionMode, "intrabar-order");

  const pendingGreedy = buildLiveStrategyGuidance(
    makeOhlcBars([
      { open: 10, high: 10.5, low: 9.5, close: 10 },
      { open: 10, high: 11.2, low: 9.9, close: 11 },
    ]),
    "tv-greedy",
    { minimumBodyPercent: 3 },
  );
  assert.equal(pendingGreedy?.action, "wait");
  assert.equal(pendingGreedy?.position, "flat");
  assert.equal(pendingGreedy?.pendingNextOpenAction, "buy");

  const sarBars = makeOhlcBars([
    { open: 10, high: 11, low: 9, close: 10 },
    { open: 9.5, high: 10, low: 8, close: 9 },
    { open: 10, high: 11.5, low: 9.5, close: 11 },
  ]);
  const sar = buildLiveStrategyGuidance(
    sarBars,
    "tv-parabolic-sar",
    { start: 0.02, increment: 0.02, maximum: 0.2 },
  );

  assert.equal(sar?.action, "buy");
  assert.equal(sar?.triggerPrice, 11);
  assert.equal(sar?.todayEntryPrice, 11);
  assert.equal(sar?.executionMode, "intrabar-order");
});

test("executes allocation price orders on the touched bar", () => {
  const bars = makeOhlcBars([
    { open: 9.5, high: 10, low: 9, close: 9.5 },
    { open: 10, high: 11, low: 9.5, close: 10.5 },
    { open: 11, high: 12, low: 10, close: 11.5 },
    { open: 9.8, high: 10, low: 9, close: 9.2 },
    { open: 9.2, high: 9.5, low: 8.8, close: 9 },
  ]);
  const timeline = buildStrategyPlanTimeline(bars, {
    strategyA: {
      strategyId: "tv-channel-breakout",
      parameters: { length: 2, tick: 0.1 },
    },
    strategyB: null,
    strategyAAllocation: 1,
    strategyBAllocation: 0,
  });
  const result = runAllocationBacktest(
    bars,
    timeline.target,
    {
      initialCash: 10_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
      executionPolicy: "hybrid",
    },
    timeline.signalEvents,
    timeline.intrabarExecutions,
  );

  assert.equal(result.rebalances[0].time, bars[2].time);
  assert.equal(result.rebalances[0].fillPrice, 11.1);
  assert.equal(result.rebalances[1].time, bars[3].time);
  assert.equal(result.rebalances[1].fillPrice, 9.4);
});

test("orders different same-bar combination stops without discarding fills", () => {
  const bars = makeOhlcBars([
    { open: 9.5, high: 10, low: 9, close: 9.5 },
    { open: 10, high: 11, low: 9.5, close: 10.5 },
    { open: 10.8, high: 12, low: 10.7, close: 11.5 },
  ]);
  const timeline = buildStrategyPlanTimeline(bars, {
    strategyA: {
      strategyId: "tv-channel-breakout",
      parameters: { length: 2, tick: 0.1 },
    },
    strategyB: {
      strategyId: "tv-price-channel",
      parameters: { length: 2 },
    },
    strategyAAllocation: 0.6,
    strategyBAllocation: 0.4,
  });

  assert.equal(timeline.relativeLongStrategy, "strategyA");
  assert.deepEqual(timeline.intrabarExecutions?.[2], [
    {
      targetAllocation: 0.6,
      fillPrice: 11.1,
      signals: ["long-entry"],
    },
  ]);
});

test("uses a conservative entry-then-exit path when both channel stops touch", () => {
  const bars = makeOhlcBars([
    { open: 9.5, high: 10, low: 9, close: 9.5 },
    { open: 10, high: 11, low: 9.5, close: 10.5 },
    { open: 10, high: 12, low: 8, close: 10 },
  ]);
  const timeline = buildStrategyPlanTimeline(bars, {
    strategyA: {
      strategyId: "tv-channel-breakout",
      parameters: { length: 2, tick: 0.1 },
    },
    strategyB: null,
    strategyAAllocation: 1,
    strategyBAllocation: 0,
  });

  assert.equal(timeline.target[2], 0);
  assert.deepEqual(timeline.intrabarExecutions?.[2], [
    {
      targetAllocation: 1,
      fillPrice: 11.1,
      signals: ["long-entry"],
    },
    {
      targetAllocation: 0,
      fillPrice: 8.9,
      signals: ["long-exit"],
    },
  ]);
  const result = runAllocationBacktest(
    bars,
    timeline.target,
    {
      initialCash: 10_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
      executionPolicy: "hybrid",
    },
    timeline.signalEvents,
    timeline.intrabarExecutions,
  );
  assert.equal(result.rebalances.length, 2);
  assert.ok(result.totalReturn < 0);

  const direct = runBacktest(
    bars,
    "tv-channel-breakout",
    { length: 2, tick: 0.1 },
    {
      initialCash: 10_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
      executionPolicy: "hybrid",
    },
  );
  assert.equal(direct.tradeCount, 1);
  assert.equal(direct.trades[0].entryTime, bars[2].time);
  assert.equal(direct.trades[0].exitTime, bars[2].time);
  assert.ok(direct.totalReturn < 0);
});

test("marks an open final position to market without a synthetic sell", () => {
  const bars = makeOhlcBars([
    { open: 10, high: 10.5, low: 9.5, close: 10 },
    { open: 11, high: 12.5, low: 10.8, close: 12 },
    { open: 12, high: 13.5, low: 11.8, close: 13 },
  ]);
  const result = runBacktest(
    bars,
    "tv-bar-up-down",
    { minimumBodyPercent: 0 },
    {
      initialCash: 10_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
    },
  );

  assert.equal(result.tradeCount, 0);
  assert.ok(result.finalEquity > 10_000);
  const markers = buildTradeMarkers(result.trades);
  assert.equal(markers.sells.length, 0);
  assert.equal(markers.rangeExits.length, 0);
});

test("maps allocation increases, reductions, and valuation exits to markers", () => {
  const markers = buildAllocationTradeMarkers([
    {
      time: "2026-01-02",
      fromAllocation: 0,
      targetAllocation: 0.6,
      fillPrice: 101,
      reason: "strategy",
      signals: ["long-entry"],
    },
    {
      time: "2026-01-03",
      fromAllocation: 0.6,
      targetAllocation: 1,
      fillPrice: 103,
      reason: "strategy",
      signals: ["short-entry"],
    },
    {
      time: "2026-01-04",
      fromAllocation: 1,
      targetAllocation: 0.6,
      fillPrice: 99,
      reason: "strategy",
      signals: ["short-exit"],
    },
    {
      time: "2026-01-05",
      fromAllocation: 0.6,
      targetAllocation: 0,
      fillPrice: 98,
      reason: "range-end",
    },
  ]);

  assert.equal(markers.buys.length, 2);
  assert.equal(markers.sells.length, 1);
  assert.equal(markers.rangeExits.length, 1);
  assert.deepEqual(markers.buys.map((marker) => marker.price), [101, 103]);
  assert.deepEqual(markers.buys.map((marker) => marker.signals), [
    ["long-entry"],
    ["short-entry"],
  ]);
  assert.deepEqual(markers.buys.map((marker) => marker.action), [
    "open",
    "short-buy",
  ]);
  assert.equal(markers.sells[0].price, 99);
  assert.deepEqual(markers.sells[0].signals, ["short-exit"]);
  assert.equal(markers.sells[0].action, "short-sell");
  assert.equal(markers.rangeExits[0].price, 98);
});

test("classifies a simultaneous long and short exit as one close marker", () => {
  const markers = buildAllocationTradeMarkers([
    {
      time: "2026-01-05",
      fromAllocation: 1,
      targetAllocation: 0,
      fillPrice: 98,
      reason: "strategy",
      signals: ["long-exit", "short-exit"],
    },
  ]);

  assert.equal(markers.sells.length, 1);
  assert.equal(markers.sells[0].action, "close");
});

test("optimizes every strategy and sorts best results by score", async () => {
  const bars = makeBars(
    Array.from({ length: 180 }, (_, index) => {
      return 20 + index * 0.04 + Math.sin(index / 5) * 1.8;
    }),
  );
  const progress: number[] = [];
  const outcome = await optimizeStrategies(
    bars,
    {
      initialCash: 100_000,
      commissionRate: 0.0003,
      slippageRate: 0.0002,
      interval: "1d",
    },
    {
      candidates: firstScreeningCandidatesPerStrategy(3),
      yieldEvery: 24,
      onProgress: (update) => progress.push(update.completed),
    },
  );

  assert.equal(outcome.totalCandidates, STRATEGIES.length * 3);
  assert.equal(outcome.evaluatedCount, outcome.totalCandidates);
  assert.equal(outcome.results.length, STRATEGIES.length);
  assert.equal(outcome.cancelled, false);
  assert.equal(outcome.failedCount, 0);
  assert.equal(progress.at(0), 0);
  assert.equal(progress.at(-1), outcome.totalCandidates);
  assert.equal(
    new Set(outcome.results.map((result) => result.strategyId)).size,
    STRATEGIES.length,
  );
  for (let index = 1; index < outcome.results.length; index += 1) {
    assert.ok(
      outcome.results[index - 1].score >= outcome.results[index].score,
    );
  }
});

test("builds complete horizon-filtered screening candidates", () => {
  const longCandidates = buildScreeningCandidates(["long"]);
  const shortCandidates = buildScreeningCandidates(["short"]);

  assert.ok(longCandidates.length > LONG_HORIZON_STRATEGY_IDS.length);
  assert.ok(shortCandidates.length > SHORT_HORIZON_STRATEGY_IDS.length);
  assert.ok(
    longCandidates.every(
      (candidate) => getStrategy(candidate.strategyId).horizon === "long",
    ),
  );
  assert.ok(
    shortCandidates.every(
      (candidate) => getStrategy(candidate.strategyId).horizon === "short",
    ),
  );
});

test("keeps screening cards identical to applying the same full-history strategy", async () => {
  const bars = makeOhlcBars(
    Array.from({ length: 1_200 }, (_, index) => {
      if (index === 100) {
        return { open: 101, high: 111, low: 100, close: 110 };
      }
      if (index === 950) {
        return { open: 99, high: 100, low: 89, close: 90 };
      }
      return { open: 100, high: 101, low: 99, close: 100 };
    }),
  );
  const settings = {
    initialCash: 100_000,
    commissionRate: 0,
    slippageRate: 0,
    startTime: bars[900].time,
    endTime: bars[999].time,
    interval: "1d" as const,
    executionPolicy: "hybrid" as const,
  };
  const outcome = await optimizeStrategies(bars, settings, {
    candidates: firstScreeningCandidatesPerStrategy(1),
    yieldEvery: 10_000,
  });
  const screened = outcome.results.find(
    (result) => result.strategyId === "tv-bar-up-down",
  );
  assert.ok(screened);

  const applied = runBacktest(
    bars,
    screened.strategyId,
    screened.parameters,
    settings,
  );
  assert.deepEqual(screened, applied);
  assert.equal(screened.tradeCount, 0);

  const combinedOutcome = await optimizeStrategyCombinations(
    bars,
    settings,
    {
      candidates: firstScreeningCandidatesPerStrategy(1),
      maxPairFinalists: 1,
      allocationCandidates: [TWO_STRATEGY_ALLOCATION_CANDIDATES[0]],
      yieldEvery: 10_000,
    },
  );
  const combinedScreened = combinedOutcome.singleResults.find(
    (result) => result.strategyId === "tv-bar-up-down",
  );
  assert.ok(combinedScreened);
  assert.deepEqual(
    combinedScreened,
    runBacktest(
      bars,
      combinedScreened.strategyId,
      combinedScreened.parameters,
      settings,
    ),
  );
});

test("optimizes automatic unique-winner two-strategy combinations", async () => {
  const bars = makeBars(
    Array.from({ length: 180 }, (_, index) => {
      return 30 + index * 0.05 + Math.sin(index / 5) * 2.4;
    }),
  );
  const progress: CombinationScreeningProgress[] = [];
  const outcome = await optimizeStrategyCombinations(
    bars,
    {
      initialCash: 100_000,
      commissionRate: 0.0003,
      slippageRate: 0.0002,
      interval: "1d",
    },
    {
      candidates: firstScreeningCandidatesPerStrategy(1),
      yieldEvery: 16,
      onProgress: (update) => progress.push({ ...update }),
    },
  );

  assert.equal(COMBINATION_FINALISTS_PER_STRATEGY, 1);
  const distinctStrategyPairCount = STRATEGIES.reduce(
    (count, strategyA, strategyAIndex) =>
      count +
      STRATEGIES.slice(strategyAIndex + 1).filter(
        (strategyB) =>
          !areStrategiesEquivalent(strategyA.id, strategyB.id),
      ).length,
    0,
  );
  assert.ok(
    MAX_COMBINATION_PAIR_FINALISTS >=
      distinctStrategyPairCount *
        COMBINATION_FINALISTS_PER_STRATEGY ** 2,
  );
  assert.equal(
    outcome.totalCandidates,
    STRATEGIES.length +
      distinctStrategyPairCount *
        TWO_STRATEGY_ALLOCATION_CANDIDATES.length,
  );
  assert.equal(outcome.evaluatedCount, outcome.totalCandidates);
  assert.equal(outcome.failedCount, 0);
  assert.equal(outcome.cancelled, false);
  assert.equal(outcome.singleResults.length, STRATEGIES.length);
  assert.equal(
    new Set(outcome.singleResults.map((result) => result.strategyId)).size,
    outcome.singleResults.length,
  );
  assert.equal(
    outcome.results.length,
    MAX_COMBINATION_RESULTS,
  );
  assert.equal(progress.at(0)?.completed, 0);
  assert.equal(progress.at(-1)?.completed, outcome.totalCandidates);
  assert.deepEqual(
    new Set(progress.map((update) => update.stage)),
    new Set(["strategies", "pairs", "allocations"]),
  );
  const stageIndex = {
    strategies: 0,
    entryFilters: 1,
    pairs: 2,
    allocations: 3,
  } as const;
  const segmentedProgress = progress.map(
    (update) =>
      stageIndex[update.stage] +
      (update.stageTotal > 0
        ? update.stageCompleted / update.stageTotal
        : 1),
  );
  assert.ok(
    progress.every(
      (update) =>
        update.stageCompleted >= 0 &&
        update.stageCompleted <= update.stageTotal,
    ),
  );
  assert.ok(
    segmentedProgress.every(
      (value, index) =>
        index === 0 || value >= segmentedProgress[index - 1],
    ),
  );
  assert.equal(
    new Set(
      outcome.results.map(
        (result) => `${result.strategyAId}:${result.strategyBId}`,
      ),
    ).size,
    outcome.results.length,
  );
  assert.ok(
    outcome.results.every(
      (result) =>
        !areStrategiesEquivalent(result.strategyAId, result.strategyBId),
    ),
  );

  for (const result of outcome.results) {
    assert.notEqual(result.strategyAId, result.strategyBId);
    assert.ok(
      result.relativeLongStrategy === "strategyA" ||
        result.relativeLongStrategy === "strategyB",
    );
    assert.ok(
      TWO_STRATEGY_ALLOCATION_CANDIDATES.some(
        (candidate) =>
          candidate.strategyAAllocation === result.strategyAAllocation &&
          candidate.strategyBAllocation === result.strategyBAllocation,
      ),
    );
    assert.equal(
      result.strategyAAllocation + result.strategyBAllocation,
      1,
    );
    assert.deepEqual(
      result.strategyAParameters,
      outcome.singleResults.find(
        (single) => single.strategyId === result.strategyAId,
      )?.parameters,
    );
    assert.deepEqual(
      result.strategyBParameters,
      outcome.singleResults.find(
        (single) => single.strategyId === result.strategyBId,
      )?.parameters,
    );
    assert.equal(result.tradeCount, result.rebalances.length);
    const appliedTimeline = buildStrategyPlanTimeline(bars, {
      strategyA: {
        strategyId: result.strategyAId,
        parameters: result.strategyAParameters,
      },
      strategyB: {
        strategyId: result.strategyBId,
        parameters: result.strategyBParameters,
      },
      strategyAAllocation: result.strategyAAllocation,
      strategyBAllocation: result.strategyBAllocation,
    });
    const applied = runAllocationBacktest(
      bars,
      appliedTimeline.target,
      {
        initialCash: 100_000,
        commissionRate: 0.0003,
        slippageRate: 0.0002,
        interval: "1d",
      },
      appliedTimeline.signalEvents,
      appliedTimeline.intrabarExecutions,
    );
    assert.equal(result.totalReturn, applied.totalReturn);
    assert.equal(result.maxDrawdown, applied.maxDrawdown);
    assert.deepEqual(result.rebalances, applied.rebalances);
  }
  for (let index = 1; index < outcome.results.length; index += 1) {
    assert.ok(
      compareScreeningResults(
        outcome.results[index - 1],
        outcome.results[index],
        "balanced",
      ) <= 0,
    );
  }
});

test("screens EMA 5-8 only for the top 60 eligible-family parameter sets", async () => {
  assert.ok(
    SCREENING_MOVING_AVERAGE_SLOPE_STRATEGY_IDS.includes(
      "tv-channel-breakout",
    ),
  );
  assert.ok(
    SCREENING_MOVING_AVERAGE_SLOPE_STRATEGY_IDS.includes(
      "tv-price-channel",
    ),
  );
  assert.equal(
    supportsScreeningMovingAverageSlopeFilter("rsi-reversal"),
    false,
  );
  const bars = makeBars(
    Array.from({ length: 120 }, (_, index) => {
      return 40 + index * 0.04 + Math.sin(index / 4) * 1.8;
    }),
  );
  const progress: CombinationScreeningProgress[] = [];
  const completeCandidates = buildScreeningCandidates();
  const candidates = [
    ...completeCandidates
      .filter((candidate) => candidate.strategyId === "sma-cross")
      .slice(0, 75),
    ...completeCandidates
      .filter((candidate) => candidate.strategyId === "rsi-reversal")
      .slice(0, 1),
  ];
  const outcome = await optimizeStrategyCombinations(
    bars,
    {
      initialCash: 100_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
    },
    {
      candidates,
      entryFilters: buildScreeningMovingAverageSlopeFilters(),
      allocationCandidates: [
        {
          strategyAAllocation: 0.6,
          strategyBAllocation: 0.4,
        },
      ],
      maxPairFinalists: 16,
      yieldEvery: 10_000,
      onProgress: (update) => progress.push({ ...update }),
    },
  );

  assert.deepEqual(
    buildScreeningMovingAverageSlopeFilters().map((filter) => filter.period),
    SCREENING_MOVING_AVERAGE_SLOPE_PERIODS,
  );
  assert.equal(
    progress.find((update) => update.stage === "entryFilters")
      ?.stageTotal,
    SCREENING_ENTRY_FILTER_FINALISTS_PER_STRATEGY *
      SCREENING_MOVING_AVERAGE_SLOPE_PERIODS.length,
  );
  const rsiResult = outcome.singleResults.find(
    (result) => result.strategyId === "rsi-reversal",
  );
  assert.equal(rsiResult?.entryFilter, undefined);
  const smaResult = outcome.singleResults.find(
    (result) => result.strategyId === "sma-cross",
  );
  assert.ok(smaResult);
  if (smaResult.entryFilter) {
    assert.equal(smaResult.entryFilter.movingAverageType, "ema");
    assert.equal(smaResult.entryFilter.minimumSlopePercent, 0);
    assert.ok(
      SCREENING_MOVING_AVERAGE_SLOPE_PERIODS.includes(
        smaResult.entryFilter.period as
          (typeof SCREENING_MOVING_AVERAGE_SLOPE_PERIODS)[number],
      ),
    );
  }
  for (const result of outcome.results) {
    const strategyAResult = outcome.singleResults.find(
      (single) => single.strategyId === result.strategyAId,
    );
    const strategyBResult = outcome.singleResults.find(
      (single) => single.strategyId === result.strategyBId,
    );
    assert.deepEqual(
      result.strategyAParameters,
      strategyAResult?.parameters,
    );
    assert.deepEqual(
      result.strategyAEntryFilter ?? null,
      strategyAResult?.entryFilter ?? null,
    );
    assert.deepEqual(
      result.strategyBEntryFilter ?? null,
      strategyBResult?.entryFilter ?? null,
    );
    assert.deepEqual(
      result.strategyBParameters,
      outcome.singleResults.find(
        (single) => single.strategyId === result.strategyBId,
      )?.parameters,
    );
  }
});

test("bounds allocation optimization to the retained strategy-pair shortlist", async () => {
  const bars = makeBars(
    Array.from({ length: 80 }, (_, index) => {
      return 25 + index * 0.03 + Math.sin(index / 4);
    }),
  );
  const maxPairFinalists = 5;
  const outcome = await optimizeStrategyCombinations(
    bars,
    {
      initialCash: 100_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
    },
    {
      candidates: firstScreeningCandidatesPerStrategy(2),
      maxPairFinalists,
      yieldEvery: 10_000,
    },
  );
  const strategyCandidates = STRATEGIES.length * 2;
  const pairCandidates =
    STRATEGIES.reduce(
      (count, strategyA, strategyAIndex) =>
        count +
        STRATEGIES.slice(strategyAIndex + 1).filter(
          (strategyB) =>
            !areStrategiesEquivalent(strategyA.id, strategyB.id),
        ).length,
      0,
    ) * COMBINATION_FINALISTS_PER_STRATEGY ** 2;
  const remainingAllocationCandidates =
    TWO_STRATEGY_ALLOCATION_CANDIDATES.length - 1;

  assert.equal(
    outcome.totalCandidates,
    strategyCandidates +
      pairCandidates +
      maxPairFinalists * remainingAllocationCandidates,
  );
  assert.equal(outcome.evaluatedCount, outcome.totalCandidates);
  assert.ok(
    outcome.results.length > 0 &&
      outcome.results.length <= maxPairFinalists,
  );
  assert.equal(
    new Set(
      outcome.results.map(
        (result) => `${result.strategyAId}:${result.strategyBId}`,
      ),
    ).size,
    outcome.results.length,
  );
});

test("keeps only the best allocation for each retained strategy pair", async () => {
  const bars = makeBars(
    Array.from({ length: 120 }, (_, index) => {
      return 25 + index * 0.04 + Math.sin(index / 4) * 1.8;
    }),
  );
  const settings = {
    initialCash: 100_000,
    commissionRate: 0.0003,
    slippageRate: 0.0002,
    interval: "1d" as const,
  };
  const outcome = await optimizeStrategyCombinations(bars, settings, {
    candidates: firstScreeningCandidatesPerStrategy(1),
    maxPairFinalists: 1,
    yieldEvery: 10_000,
  });
  const retained = outcome.results[0];

  assert.equal(outcome.results.length, 1);
  for (const allocation of TWO_STRATEGY_ALLOCATION_CANDIDATES) {
    const alternative = runAllocationBacktest(
      bars,
      buildStrategyCombinationTarget(bars, {
        strategyAId: retained.strategyAId,
        strategyAParameters: retained.strategyAParameters,
        strategyBId: retained.strategyBId,
        strategyBParameters: retained.strategyBParameters,
        ...allocation,
      }),
      settings,
    );
    assert.ok(
      compareScreeningResults(retained, alternative, "balanced") <= 0,
    );
  }
});

test("cancels combination optimization between chunks", async () => {
  const controller = new AbortController();
  const bars = makeBars(
    Array.from({ length: 100 }, (_, index) => 20 + index * 0.08),
  );
  const outcome = await optimizeStrategyCombinations(
    bars,
    {
      initialCash: 100_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
    },
    {
      candidates: firstScreeningCandidatesPerStrategy(2),
      signal: controller.signal,
      yieldEvery: 1,
      onProgress: ({ completed }) => {
        if (completed === 3) controller.abort();
      },
    },
  );

  assert.equal(outcome.cancelled, true);
  assert.equal(outcome.evaluatedCount, 3);
  assert.ok(outcome.evaluatedCount < outcome.totalCandidates);
  assert.equal(
    new Set(outcome.singleResults.map((result) => result.strategyId)).size,
    outcome.singleResults.length,
  );
});

test("ranks screening results by the selected optimization objective", () => {
  const base: BacktestResult = {
    strategyId: "sma-cross",
    parameters: { fast: 10, slow: 30 },
    totalReturn: 0,
    annualizedReturn: 0,
    benchmarkReturn: 0,
    maxDrawdown: 0,
    sharpe: 0,
    winRate: 0,
    profitFactor: 0,
    tradeCount: 1,
    finalEquity: 100_000,
    score: 0,
    equity: [],
    trades: [],
  };
  const aggressive = {
    ...base,
    totalReturn: 30,
    maxDrawdown: -25,
    sharpe: 0.8,
    score: 10,
  };
  const defensive = {
    ...base,
    totalReturn: 12,
    maxDrawdown: -4,
    sharpe: 1.8,
    score: 40,
  };

  assert.ok(
    compareScreeningResults(aggressive, defensive, "totalReturn") < 0,
  );
  for (const objective of ["balanced", "sharpe"] as const) {
    assert.ok(
      compareScreeningResults(defensive, aggressive, objective) < 0,
      objective,
    );
  }
  assert.deepEqual(
    SCREENING_OBJECTIVES,
    ["balanced", "totalReturn", "sharpe"],
  );
  assert.equal(screeningObjectiveValue(aggressive, "balanced"), 10);
  assert.equal(screeningObjectiveValue(aggressive, "totalReturn"), 30);
  assert.equal(screeningObjectiveValue(aggressive, "sharpe"), 0.8);
});

test("builds every unique parameter set without per-strategy sampling", () => {
  assert.equal(DEFAULT_SCREENING_YIELD_EVERY, 8);
  assert.equal(SCREENING_ENTRY_FILTER_FINALISTS_PER_STRATEGY, 60);
  assert.equal(buildScreeningCandidates().length, 37_131);

  const screeningCandidates = buildScreeningCandidates();
  assert.equal(screeningCandidates.length, 37_131);
  const candidatesByStrategy = new Map<
    string,
    Array<Record<string, number>>
  >();

  for (const candidate of screeningCandidates) {
    const candidates = candidatesByStrategy.get(candidate.strategyId) ?? [];
    candidates.push(candidate.parameters);
    candidatesByStrategy.set(candidate.strategyId, candidates);
  }

  assert.equal(candidatesByStrategy.size, STRATEGIES.length);
  for (const strategy of STRATEGIES) {
    const candidates = candidatesByStrategy.get(strategy.id) ?? [];
    assert.ok(candidates.length > 3, strategy.id);
    assert.equal(
      new Set(candidates.map((parameters) => JSON.stringify(parameters))).size,
      candidates.length,
      strategy.id,
    );
  }

  assert.equal(
    candidatesByStrategy.get("tv-channel-breakout")?.length,
    1_393,
  );
  assert.ok(
    candidatesByStrategy
      .get("tv-channel-breakout")
      ?.some(
        (parameters) =>
          parameters.length === 4 && parameters.tick === 0.01,
      ),
  );

  for (const strategyId of [
    "tv-channel-breakout",
    "tv-momentum",
    "tv-pivot-reversal",
  ] as const) {
    const candidates = candidatesByStrategy.get(strategyId) ?? [];
    assert.deepEqual(
      [
        ...new Set(candidates.map((parameters) => parameters.tick)),
      ].sort((left, right) => left - right),
      [0.01, 0.05, 0.1, 0.5, 1, 5, 10],
      strategyId,
    );
  }
});

test("builds deterministic nearest valid parameter variants without optimizing", () => {
  const baseParameters = { fast: 10, slow: 15 };
  const parameterSets = buildNearbyParameterSets(
    "sma-cross",
    baseParameters,
  );

  assert.deepEqual(parameterSets, [
    { fast: 10, slow: 15 },
    { fast: 8, slow: 15 },
    { fast: 12, slow: 15 },
    { fast: 10, slow: 20 },
  ]);
  assert.equal(
    parameterSets.filter(
      (parameters) =>
        JSON.stringify(parameters) === JSON.stringify(baseParameters),
    ).length,
    1,
  );
  parameterSets.slice(1).forEach((parameters) => {
    assert.equal(
      Object.keys(baseParameters).filter(
        (key) =>
          (parameters as Record<string, number>)[key] !==
          (baseParameters as Record<string, number>)[key],
      ).length,
      1,
    );
    assert.ok(parameters.fast < parameters.slow);
  });
});

test("shares integer strategy parameter semantics without classifying level thresholds", () => {
  for (const key of [
    "entryPeriod",
    "fast",
    "slow",
    "period",
    "signal",
    "length",
    "upBars",
    "downBars",
    "leftBars",
    "rightBars",
    "smoothK",
    "smoothD",
    "threshold",
  ]) {
    assert.equal(isIntegerStrategyParameterKey(key), true, key);
  }
  for (const key of ["entry", "exit", "oversold", "overbought", "width"]) {
    assert.equal(isIntegerStrategyParameterKey(key), false, key);
  }

  assert.equal(normalizeStrategyParameterInput("fast", 9.6), 10);
  assert.equal(normalizeStrategyParameterInput("period", 0.2), 1);
  assert.equal(normalizeStrategyParameterInput("threshold", 3.5), 4);
  assert.equal(normalizeStrategyParameterInput("entry", 22.5), 22.5);
  assert.equal(normalizeStrategyParameterInput("width", 2.25), 2.25);
});

test("validates exact strategy parameter keys, integer semantics, ranges, and cross-field rules", () => {
  assert.equal(
    isValidStrategyParameters("sma-cross", { fast: 9, slow: 31 }),
    true,
  );
  assert.equal(
    isValidStrategyParameters("sma-cross", { fast: 9.5, slow: 31 }),
    false,
  );
  assert.equal(
    isValidStrategyParameters("rsi-reversal", {
      period: 14,
      entry: 22.5,
      exit: 67.5,
    }),
    true,
  );
  assert.equal(
    isValidStrategyParameters("tv-rsi", {
      period: 14,
      oversold: 22.5,
      overbought: 72.5,
    }),
    true,
  );
  assert.equal(
    isValidStrategyParameters("tv-technical-ratings", { threshold: 2.5 }),
    false,
  );
  assert.equal(
    isValidStrategyParameters("sma-cross", { fast: 20, slow: 20 }),
    false,
  );
  assert.equal(
    isValidStrategyParameters("sma-cross", { fast: 1, slow: 30 }),
    false,
  );
  assert.equal(
    isValidStrategyParameters("sma-cross", {
      fast: Number.POSITIVE_INFINITY,
      slow: 30,
    }),
    false,
  );
  assert.equal(
    isValidStrategyParameters("sma-cross", { fast: 10 }),
    false,
  );
  assert.equal(
    isValidStrategyParameters("sma-cross", {
      fast: 10,
      slow: 30,
      extra: 1,
    }),
    false,
  );
  assert.deepEqual(
    buildNearbyParameterSets("sma-cross", { fast: 20, slow: 20 }),
    [],
  );
  assert.deepEqual(
    buildNearbyParameterSets("sma-cross", {
      fast: Number.NaN,
      slow: 30,
    }),
    [],
  );
  assert.deepEqual(
    buildNearbyParameterSets("sma-cross", {
      fast: 9.5,
      slow: 31,
    }),
    [],
  );
});

test("classifies trailing 60/20-day regimes deterministically without future data", () => {
  const risingBars = makeBars(
    Array.from({ length: 120 }, (_, index) => 100 + index),
  );
  const fallingBars = makeBars(
    Array.from({ length: 120 }, (_, index) => 300 - index),
  );
  const flatBars = makeBars(Array.from({ length: 120 }, () => 100));

  assert.deepEqual(classifyMarketRegimes([]), []);
  assert.ok(
    classifyMarketRegimes(risingBars.slice(0, 79)).every(
      (regime) => regime === null,
    ),
  );
  assert.equal(classifyMarketRegimes(risingBars)[79], "up");
  assert.equal(classifyMarketRegimes(fallingBars)[79], "down");
  assert.equal(classifyMarketRegimes(flatBars)[79], "sideways");

  const fullRegimes = classifyMarketRegimes(
    makeBars(
      Array.from(
        { length: 160 },
        (_, index) => 100 + index * 0.08 + Math.sin(index / 5) * 8,
      ),
    ),
  );
  for (const prefixLength of [80, 100, 140]) {
    assert.deepEqual(
      classifyMarketRegimes(
        makeBars(
          Array.from(
            { length: prefixLength },
            (_, index) => 100 + index * 0.08 + Math.sin(index / 5) * 8,
          ),
        ),
      ),
      fullRegimes.slice(0, prefixLength),
      `prefix:${prefixLength}`,
    );
  }
});

test("summarizes aligned consecutive equity returns by current-bar regime", () => {
  const bars = makeBars(
    Array.from({ length: 82 }, (_, index) => 100 + index),
  );
  const summaries = summarizeRegimeReturns(bars, [
    { time: bars[78].time, equity: 100, drawdown: 0 },
    { time: bars[79].time, equity: 110, drawdown: 0 },
    { time: bars[80].time, equity: 121, drawdown: 0 },
  ]);

  assert.equal(summaries.up.periodCount, 2);
  assert.ok(
    Math.abs((summaries.up.returnPercent ?? Number.NaN) - 21) < 1e-10,
  );
  assert.deepEqual(summaries.sideways, {
    returnPercent: null,
    periodCount: 0,
  });
  assert.deepEqual(summaries.down, {
    returnPercent: null,
    periodCount: 0,
  });
});

test("applies inclusive stability thresholds and retains factual ranges", () => {
  const makeResult = (
    totalReturn: number,
    maxDrawdown: number,
    tradeCount: number,
  ): BacktestResult => ({
    strategyId: "sma-cross",
    parameters: { fast: 10, slow: 15 },
    totalReturn,
    annualizedReturn: totalReturn,
    benchmarkReturn: 0,
    maxDrawdown,
    sharpe: 0,
    winRate: 0,
    profitFactor: 0,
    tradeCount,
    finalEquity: 100_000 * (1 + totalReturn / 100),
    score: 0,
    equity: [],
    trades: [],
  });
  const baseResult = makeResult(5, -10, 4);
  const variantResults = [
    makeResult(15, -8, 8),
    makeResult(10, -20, 6),
    makeResult(5, -12, 2),
    makeResult(0, -9, 5),
  ];

  assert.deepEqual(STABILITY_THRESHOLDS, {
    minimumSignAgreement: 0.75,
    maximumReturnRange: 15,
    maximumDrawdownDeterioration: 10,
  });
  const summary = summarizeNearbyBacktests(baseResult, variantResults);
  assert.deepEqual(summary.totalReturnRange, {
    minimum: 0,
    maximum: 15,
    width: 15,
  });
  assert.deepEqual(summary.tradeCountRange, {
    minimum: 2,
    maximum: 8,
  });
  assert.deepEqual(summary.drawdownRange, {
    minimum: -20,
    maximum: -8,
  });
  assert.equal(summary.worstDrawdown, -20);
  assert.equal(summary.drawdownDeterioration, 10);
  assert.deepEqual(summary.signAgreement, {
    matchingVariants: 3,
    variantCount: 4,
    ratio: 0.75,
  });
  assert.deepEqual(summary.thresholdChecks, {
    signAgreement: true,
    returnRange: true,
    drawdownDeterioration: true,
  });
  assert.equal(summary.stable, true);

  assert.equal(
    summarizeNearbyBacktests(baseResult, [
      ...variantResults.slice(0, 3),
      makeResult(-0.01, -9, 5),
    ]).stable,
    false,
  );
  assert.equal(
    summarizeNearbyBacktests(baseResult, [
      ...variantResults.slice(0, 1),
      makeResult(10, -20.01, 6),
      ...variantResults.slice(2),
    ]).stable,
    false,
  );
});

test("marks only sub-75-percent sign agreement as sensitive", () => {
  const baseResult: BacktestResult = {
    strategyId: "sma-cross",
    parameters: { fast: 10, slow: 15 },
    totalReturn: 5,
    annualizedReturn: 5,
    benchmarkReturn: 0,
    maxDrawdown: -10,
    sharpe: 0,
    winRate: 0,
    profitFactor: 0,
    tradeCount: 4,
    finalEquity: 105_000,
    score: 0,
    equity: [],
    trades: [],
  };
  const variantResults = [
    { ...baseResult, totalReturn: 5, maxDrawdown: -11 },
    { ...baseResult, totalReturn: 4, maxDrawdown: -12 },
    { ...baseResult, totalReturn: 0, maxDrawdown: -9 },
    { ...baseResult, totalReturn: 0, maxDrawdown: -8 },
  ];

  const summary = summarizeNearbyBacktests(
    baseResult,
    variantResults,
  );

  assert.deepEqual(summary.signAgreement, {
    matchingVariants: 2,
    variantCount: 4,
    ratio: 0.5,
  });
  assert.deepEqual(summary.thresholdChecks, {
    signAgreement: false,
    returnRange: true,
    drawdownDeterioration: true,
  });
  assert.ok(
    summary.totalReturnRange.width <=
      STABILITY_THRESHOLDS.maximumReturnRange,
  );
  assert.ok(
    summary.drawdownDeterioration <=
      STABILITY_THRESHOLDS.maximumDrawdownDeterioration,
  );
  assert.equal(summary.stable, false);
});

test("runs current and nearby backtests without selecting replacement parameters", () => {
  const bars = makeBars(
    Array.from(
      { length: 140 },
      (_, index) => 80 + index * 0.12 + Math.sin(index / 4) * 5,
    ),
  );
  const baseParameters = { fast: 10, slow: 15 };
  const analysis = analyzeStrategyStability(
    bars,
    "sma-cross",
    baseParameters,
    {
      initialCash: 100_000,
      commissionRate: 0.0003,
      slippageRate: 0.0002,
      interval: "1d",
    },
  );
  const expectedParameterSets = buildNearbyParameterSets(
    "sma-cross",
    baseParameters,
  );
  assert.ok(analysis.baseResult);
  assert.ok(analysis.nearby);
  const allResults = [analysis.baseResult, ...analysis.variantResults];

  assert.deepEqual(analysis.baseResult.parameters, baseParameters);
  assert.deepEqual(
    analysis.variantResults.map((result) => result.parameters),
    expectedParameterSets.slice(1),
  );
  assert.equal(analysis.nearby.signAgreement.variantCount, 3);
  assert.equal(
    analysis.nearby.totalReturnRange.minimum,
    Math.min(...allResults.map((result) => result.totalReturn)),
  );
  assert.equal(
    analysis.nearby.totalReturnRange.maximum,
    Math.max(...allResults.map((result) => result.totalReturn)),
  );
  assert.equal(
    analysis.nearby.drawdownRange.minimum,
    Math.min(...allResults.map((result) => result.maxDrawdown)),
  );
  assert.equal(
    analysis.nearby.drawdownRange.maximum,
    Math.max(...allResults.map((result) => result.maxDrawdown)),
  );
  assert.ok(analysis.nearby.signAgreement.ratio >= 0);
  assert.ok(analysis.nearby.signAgreement.ratio <= 1);
  assert.equal(
    Object.prototype.hasOwnProperty.call(analysis, "selectedParameters"),
    false,
  );

  const shortAnalysis = analyzeStrategyStability(
    bars.slice(0, 30),
    "sma-cross",
    baseParameters,
    {
      initialCash: 100_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
    },
  );
  for (const regime of ["up", "sideways", "down"] as const) {
    assert.deepEqual(shortAnalysis.regimes[regime], {
      returnPercent: null,
      periodCount: 0,
    });
  }
});

test("reports invalid strategy parameters without running a base backtest", () => {
  const bars = makeBars(
    Array.from({ length: 140 }, (_, index) => 100 + index * 0.1),
  );
  const analysis = analyzeStrategyStability(
    bars,
    "sma-cross",
    { fast: 30, slow: 10 },
    {
      initialCash: 100_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
    },
  );

  assert.equal(analysis.baseResult, null);
  assert.deepEqual(analysis.variantResults, []);
  assert.equal(analysis.nearby, null);
  assert.equal(analysis.evidence.sufficient, false);
  assert.ok(analysis.evidence.reasons.includes("invalid-parameters"));
  assert.equal(analysis.evidence.observationCount, 140);
  assert.equal(analysis.evidence.minimumObservationCount, 120);
  assert.equal(analysis.evidence.tradeCount, 0);
  assert.equal(analysis.evidence.minimumTradeCount, 2);
});

test("requires 120 in-range observations and two completed base trades", () => {
  const alternatingBars = makeOhlcBars(
    Array.from({ length: 140 }, (_, index) => {
      if (index === 0) {
        return { open: 100, high: 101, low: 99, close: 100 };
      }
      if (index % 2 === 1) {
        return {
          open: 101,
          high: 103,
          low: 100,
          close: 102,
        };
      }
      return {
        open: 101,
        high: 102,
        low: 99,
        close: 100,
      };
    }),
  );
  const settings = {
    initialCash: 100_000,
    commissionRate: 0,
    slippageRate: 0,
    interval: "1d" as const,
  };

  assert.equal(MINIMUM_STABILITY_OBSERVATIONS, 120);
  assert.equal(MINIMUM_STABILITY_TRADES, 2);

  const short = analyzeStrategyStability(
    alternatingBars.slice(0, 119),
    "tv-bar-up-down",
    { minimumBodyPercent: 0 },
    settings,
  );
  assert.equal(short.evidence.observationCount, 119);
  assert.ok(short.evidence.reasons.includes("insufficient-observations"));
  assert.equal(short.evidence.sufficient, false);
  assert.equal(short.nearby?.stable, false);

  const noTrades = analyzeStrategyStability(
    makeBars(Array.from({ length: 120 }, () => 100)),
    "sma-cross",
    { fast: 10, slow: 30 },
    settings,
  );
  assert.equal(noTrades.evidence.tradeCount, 0);
  assert.ok(noTrades.evidence.reasons.includes("insufficient-trades"));
  assert.equal(noTrades.evidence.sufficient, false);
  assert.equal(noTrades.nearby?.stable, false);

  const oneTradeBars = makeOhlcBars(
    Array.from({ length: 120 }, (_, index) => {
      if (index === 1) {
        return { open: 101, high: 103, low: 100, close: 102 };
      }
      if (index === 2) {
        return { open: 101, high: 102, low: 99, close: 100 };
      }
      return { open: 100, high: 101, low: 99, close: 100 };
    }),
  );
  const oneTrade = analyzeStrategyStability(
    oneTradeBars,
    "tv-bar-up-down",
    { minimumBodyPercent: 0 },
    settings,
  );
  assert.equal(oneTrade.evidence.tradeCount, 1);
  assert.ok(oneTrade.evidence.reasons.includes("insufficient-trades"));
  assert.equal(oneTrade.evidence.sufficient, false);
  assert.equal(oneTrade.nearby?.stable, false);

  const sufficient = analyzeStrategyStability(
    alternatingBars,
    "tv-bar-up-down",
    { minimumBodyPercent: 0 },
    {
      ...settings,
      startTime: alternatingBars[20].time,
      endTime: alternatingBars[139].time,
    },
  );
  assert.equal(sufficient.evidence.observationCount, 120);
  assert.ok(sufficient.evidence.tradeCount >= 2);
  assert.deepEqual(sufficient.evidence.reasons, []);
  assert.equal(sufficient.evidence.sufficient, true);
  assert.ok(sufficient.baseResult);
  assert.ok(sufficient.nearby);
});

test("cancels a parameter optimization between chunks", async () => {
  const controller = new AbortController();
  const bars = makeBars(
    Array.from({ length: 80 }, (_, index) => 20 + index * 0.1),
  );
  const outcome = await optimizeStrategies(
    bars,
    {
      initialCash: 100_000,
      commissionRate: 0.0003,
      slippageRate: 0.0002,
      interval: "1d",
    },
    {
      signal: controller.signal,
      yieldEvery: 1,
      onProgress: ({ completed }) => {
        if (completed === 3) controller.abort();
      },
    },
  );

  assert.equal(outcome.cancelled, true);
  assert.equal(outcome.evaluatedCount, 3);
  assert.ok(outcome.evaluatedCount < outcome.totalCandidates);
});

test("filters weak candle signals with the minimum body parameter", () => {
  const bars = makeBars([10, 10.04, 10.08]);
  bars[0] = { ...bars[0], open: 9.9, high: 10.1, low: 9.8 };
  bars[1] = {
    ...bars[1],
    open: 10.01,
    close: 10.04,
    high: 10.05,
    low: 10,
  };

  const strategy = getStrategy("tv-bar-up-down");
  const unfiltered = strategy.buildTarget(bars, {
    minimumBodyPercent: 0,
  });
  const filtered = strategy.buildTarget(bars, {
    minimumBodyPercent: 0.5,
  });

  assert.equal(unfiltered[1], 1);
  assert.equal(filtered[1], 0);
});

test("validates saved backtests and rejects unsupported assets", () => {
  const payload = {
    instrument: {
      secid: "100.N225",
      code: "N225",
      name: "Nikkei 225",
      exchange: "JPX",
      assetType: "index",
      provider: "eastmoney",
    },
    interval: "1d",
    strategyId: "sma-cross",
    parameters: { fast: 10, slow: 30 },
    plan: {
      strategyA: {
        strategyId: "sma-cross",
        parameters: { fast: 10, slow: 30 },
      },
      strategyB: null,
      strategyAAllocation: 0.6,
      strategyBAllocation: 0,
    },
    indicators: [
      { id: "sma", parameters: { fast: 5, slow: 20 } },
      { id: "rsi", parameters: { period: 14 } },
    ],
    startDate: "2024-01-01",
    endDate: "2025-01-01",
    initialCash: 100_000,
    commissionPercent: 0.03,
    slippagePercent: 0.02,
    metrics: {
      totalReturn: 12.3,
      maxDrawdown: 8.1,
      sharpe: 1.2,
      tradeCount: 10,
      score: 42,
    },
  };

  const normalizedPayload = {
    ...payload,
    plan: {
      ...payload.plan,
      strategyAAllocation: 1,
    },
  };
  assert.deepEqual(parseSaveBacktestInput(payload), normalizedPayload);
  const filteredPayload = {
    ...payload,
    plan: {
      ...payload.plan,
      entryFilter: DEFAULT_MOVING_AVERAGE_SLOPE_FILTER,
    },
  };
  assert.deepEqual(
    parseSaveBacktestInput(filteredPayload)?.plan
      .strategyAEntryFilter,
    DEFAULT_MOVING_AVERAGE_SLOPE_FILTER,
  );
  assert.equal(
    parseSaveBacktestInput({
      ...filteredPayload,
      plan: {
        ...filteredPayload.plan,
        entryFilter: {
          ...DEFAULT_MOVING_AVERAGE_SLOPE_FILTER,
          period: 1,
        },
      },
    }),
    null,
  );
  assert.deepEqual(
    parseSaveBacktestInput({
      ...payload,
      instrument: {
        secid: "GC=F",
        code: "GC=F",
        name: "Gold Futures Proxy",
        exchange: "OTHER",
        assetType: "commodity",
        provider: "yahoo",
      },
    })?.instrument.assetType,
    "commodity",
  );
  const legacy = { ...payload } as Record<string, unknown>;
  delete legacy.plan;
  delete legacy.indicators;
  assert.deepEqual(parseSaveBacktestInput(legacy)?.plan, {
    strategyA: {
      strategyId: "sma-cross",
      parameters: { fast: 10, slow: 30 },
    },
    strategyB: null,
    strategyAAllocation: 1,
    strategyBAllocation: 0,
  });
  assert.deepEqual(parseSaveBacktestInput(legacy)?.indicators, []);
  const yahooResolvedEtfName =
    "E Fund Management Co., Ltd - CSI Semiconductor Material and Equipment Thematic ETF";
  const yahooResolvedEtf = parseSaveBacktestInput({
    ...payload,
    instrument: {
      secid: "159558.SZ",
      code: "159558.SZ",
      name: yahooResolvedEtfName,
      exchange: "SZSE",
      assetType: "etf",
      provider: "yahoo",
    },
    strategyId: "kdj-reversal",
    parameters: { period: 9, entry: 35, exit: 65 },
    plan: {
      strategyA: {
        strategyId: "kdj-reversal",
        parameters: { period: 9, entry: 35, exit: 65 },
      },
      strategyB: {
        strategyId: "tv-volty-expan-close",
        parameters: { period: 5, multiplier: 1.5 },
      },
      strategyAAllocation: 0.4,
      strategyBAllocation: 0.6,
    },
  });
  assert.equal(yahooResolvedEtf?.instrument.code, "159558.SZ");
  assert.equal(yahooResolvedEtf?.instrument.name, yahooResolvedEtfName);
  assert.equal(yahooResolvedEtf?.plan.strategyAAllocation, 0.4);
  assert.equal(yahooResolvedEtf?.plan.strategyBAllocation, 0.6);
  assert.equal(
    parseSaveBacktestInput({
      ...payload,
      instrument: { ...payload.instrument, name: "x".repeat(257) },
    }),
    null,
  );
  assert.deepEqual(
    parseSaveBacktestInput({
      ...payload,
      plan: {
        long: payload.plan.strategyA,
        short: null,
        coreAllocation: 0.6,
        maximumAllocation: 1,
      },
    })?.plan,
    normalizedPayload.plan,
  );
  assert.deepEqual(
    parseSaveBacktestInput({
      ...payload,
      plan: {
        long: payload.plan.strategyA,
        short: {
          strategyId: "tv-bar-up-down",
          parameters: { minimumBodyPercent: 0 },
        },
        longAllocation: 0.6,
        shortAllocation: 0.4,
      },
    })?.plan,
    {
      strategyA: payload.plan.strategyA,
      strategyB: {
        strategyId: "tv-bar-up-down",
        parameters: { minimumBodyPercent: 0 },
      },
      strategyAAllocation: 0.6,
      strategyBAllocation: 0.4,
    },
  );
  assert.equal(
    parseSaveBacktestInput({
      ...payload,
      instrument: { ...payload.instrument, assetType: "equity" },
    }),
    null,
  );
  assert.equal(
    parseSaveBacktestInput({
      ...payload,
      plan: {
        ...payload.plan,
        strategyB: payload.plan.strategyA,
        strategyBAllocation: 0.4,
      },
    }),
    null,
  );
  assert.equal(
    parseSaveBacktestInput({
      ...payload,
      indicators: [
        { id: "sma", parameters: { fast: 0, slow: 30 } },
      ],
    }),
    null,
  );
  assert.equal(
    parseSaveBacktestInput({
      ...payload,
      parameters: { fast: Number.NaN, slow: 30 },
    }),
    null,
  );
  assert.equal(
    parseSaveBacktestInput({
      ...payload,
      plan: {
        ...payload.plan,
        strategyAAllocation: 1.2,
      },
    }),
    null,
  );
});

test("replaces a saved setup when only visible indicators change", () => {
  const baseInput = parseSaveBacktestInput({
    instrument: {
      secid: "100.N225",
      code: "N225",
      name: "Nikkei 225",
      exchange: "JPX",
      assetType: "index",
      provider: "eastmoney",
    },
    interval: "1d",
    strategyId: "tv-channel-breakout",
    parameters: { length: 4, tick: 0.01 },
    plan: {
      strategyA: {
        strategyId: "tv-channel-breakout",
        parameters: { length: 4, tick: 0.01 },
      },
      strategyB: null,
      strategyAAllocation: 1,
      strategyBAllocation: 0,
      strategyAEntryFilter: {
        movingAverageType: "ema",
        period: 8,
        minimumSlopePercent: 0,
      },
    },
    indicators: [],
    startDate: "2026-01-19",
    endDate: "2026-07-27",
    initialCash: 100_000,
    commissionPercent: 0.03,
    slippagePercent: 0.02,
    metrics: {
      totalReturn: 30.51,
      maxDrawdown: -5.64,
      sharpe: 2.64,
      tradeCount: 6,
      score: 32.31,
    },
  });
  assert.ok(baseInput);
  const existing: SavedBacktestRecord = {
    ...baseInput,
    id: 7,
    createdAt: "2026-07-20 00:00:00",
    updatedAt: "2026-07-20 00:00:00",
  };
  assert.equal(
    shouldReplaceSavedBacktest(existing, {
      ...baseInput,
      indicators: [
        { id: "ema", parameters: { period: 8 } },
      ],
    }),
    true,
  );
  assert.equal(
    shouldReplaceSavedBacktest(existing, {
      ...baseInput,
      plan: {
        ...baseInput.plan,
        strategyA: {
          strategyId: "tv-channel-breakout",
          parameters: { length: 5, tick: 0.01 },
        },
      },
    }),
    false,
  );
});

test("fingerprints and compares compact screening run archives", async () => {
  const bars = makeBars([10, 11, 12, 11, 13]);
  const series = {
    instrument: {
      secid: "100.N225",
      code: "N225",
      name: "Nikkei 225",
      exchange: "JPX" as const,
      assetType: "index" as const,
      provider: "eastmoney" as const,
    },
    interval: "1d" as const,
    priceAdjustment: "corporate-action-adjusted" as const,
    previousClose: 9,
    bars,
    latestBarStatus: "complete" as const,
    source: "eastmoney" as const,
    fetchedAt: "2026-07-27T08:00:00.000Z",
  };
  const result = runBacktest(
    bars,
    "sma-cross",
    { fast: 2, slow: 3 },
    {
      initialCash: 100_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
    },
  );
  const fingerprint = await fingerprintMarketSeries(series);
  assert.match(fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(await fingerprintMarketSeries(series), fingerprint);
  const validationConfig = {
    mode: "range" as const,
    range: {
      startTime: bars[0].time.slice(0, 10),
      endTime: bars.at(-1)!.time.slice(0, 10),
    },
  };
  const input = createSaveScreeningRunInput(
    series,
    validationConfig,
    "balanced",
    {
      initialCash: 100_000,
      commissionPercent: 0,
      slippagePercent: 0,
    },
    {
      singleResults: [result],
      results: [],
      evaluatedCount: 1,
      totalCandidates: 1,
      failedCount: 0,
      cancelled: false,
      validationReport: {
        mode: "range",
        range: validationConfig.range,
        selected: {
          kind: "single",
          strategyAId: result.strategyId,
          strategyBId: null,
        },
        performance: result,
      },
    },
    fingerprint,
  );
  assert.ok(parseSaveScreeningRunInput(input));
  assert.equal(
    parseSaveScreeningRunInput({
      ...input,
      instrumentKey: "index:fake",
    }),
    null,
  );
  assert.equal(
    parseSaveScreeningRunInput({
      ...input,
      selectedCandidateKey: "single:fake",
    }),
    null,
  );
  assert.equal(input.candidates.length, 1);
  assert.equal(
    JSON.stringify(input.validationReport).includes("equity"),
    false,
  );
  const previous = {
    id: 1,
    ...input,
    createdAt: "2026-07-20 00:00:00",
  };
  const current = {
    id: 2,
    ...input,
    candidates: input.candidates.map((candidate) => ({
      ...candidate,
      metrics: {
        ...candidate.metrics,
        totalReturn: candidate.metrics.totalReturn + 2,
      },
    })),
    createdAt: "2026-07-27 00:00:00",
  };
  const comparison = compareScreeningRuns(current, previous);
  assert.equal(comparison?.winnerChanged, false);
  assert.equal(comparison?.topTenOverlap, 1);
  assert.equal(comparison?.totalReturnDelta, 2);
});

test("matches saved strategy plans by selections, parameters, and allocations", () => {
  const strategyA = {
    strategyId: "sma-cross" as const,
    parameters: { fast: 10, slow: 30 },
  };
  const base = {
    strategyA,
    strategyB: null,
    strategyAAllocation: 1,
    strategyBAllocation: 0,
  };

  assert.equal(
    strategyPlansEqual(base, {
      ...base,
      strategyA: {
        ...strategyA,
        parameters: { slow: 30, fast: 10 },
      },
    }),
    true,
  );
  assert.equal(
    strategyPlansEqual(base, {
      ...base,
      strategyA: {
        ...strategyA,
        parameters: { fast: 12, slow: 30 },
      },
    }),
    false,
  );
  assert.equal(
    strategyPlansEqual(
      {
        ...base,
        entryFilter: DEFAULT_MOVING_AVERAGE_SLOPE_FILTER,
      },
      {
        ...base,
        entryFilter: {
          ...DEFAULT_MOVING_AVERAGE_SLOPE_FILTER,
          minimumSlopePercent: 0.1,
        },
      },
    ),
    false,
  );
});
