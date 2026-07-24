import assert from "node:assert/strict";
import test from "node:test";
import {
  runBacktest,
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
  MAX_PARAMETER_SETS_PER_STRATEGY,
  buildNearbyParameterSets,
  buildScreeningCandidates,
  compareScreeningResults,
  isValidStrategyParameters,
  optimizeStrategies,
  screeningObjectiveValue,
} from "../lib/analysis/screening";
import { parseSaveBacktestInput } from "../lib/analysis/saved-backtests";
import {
  getStrategy,
  STRATEGIES,
} from "../lib/analysis/strategies";
import {
  INTRABAR_PRICE_ORDER_STRATEGY_IDS,
  TRADINGVIEW_BUILT_IN_STRATEGY_IDS,
} from "../lib/analysis/built-in-strategies";
import { buildLiveStrategyGuidance } from "../lib/analysis/live-guidance";
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
import { buildTradeMarkers } from "../lib/analysis/trade-markers";
import {
  parseKlineRow,
  searchEastmoney,
} from "../lib/market/eastmoney";
import { parseNasdaqRows } from "../lib/market/nasdaq";
import type { MarketPriceAdjustment } from "../lib/market";
import type {
  MarketBar,
  MarketInstrument,
} from "../lib/market/types";
import { mergeLatestMarketSeries } from "../lib/market/series";
import {
  fetchYahooSeries,
  parseYahooChart,
  searchYahoo,
} from "../lib/market/yahoo";

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

test("keeps only indexes and ETFs in Yahoo search results", async () => {
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
    ],
  );
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
      { open: 49, close: 50, high: 52, low: 48 },
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

  assert.equal(STRATEGIES.length, 32);
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
      fullOrders.some((orders) => orders.entryStop !== null),
      `${strategyId}:entry`,
    );
    assert.ok(
      fullOrders.some((orders) => orders.exitStop !== null),
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
  assert.deepEqual(
    buildStrategyPriceLines(
      bars,
      "tv-parabolic-sar",
      sarParameters,
    )[0].data,
    parabolicSar(
      bars,
      sarParameters.start,
      sarParameters.increment,
      sarParameters.maximum,
    ),
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
    ["supertrend-trend", ["trend"]],
    ["ichimoku-trend", ["conversion", "base", "span-a", "span-b"]],
    ["vwap-reversion", ["vwap", "entry", "exit"]],
    ["tv-bollinger-bands", ["middle", "upper", "lower"]],
    ["tv-bollinger-directed", ["middle", "upper", "lower"]],
    ["tv-channel-breakout", ["entry", "exit"]],
    ["tv-keltner-channels", ["middle", "upper", "lower"]],
    ["tv-momentum", ["entry", "exit"]],
    ["tv-parabolic-sar", ["sar"]],
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
  assert.equal(exit?.action, "sell");
  assert.equal(exit?.triggerPrice, 9.4);
});

test("marks a final valuation close separately from a strategy sell", () => {
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

  assert.equal(result.trades.at(-1)?.exitReason, "range-end");
  const markers = buildTradeMarkers(result.trades);
  assert.equal(markers.sells.length, 0);
  assert.equal(markers.rangeExits.length, 1);
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
      maxPerStrategy: 3,
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
  for (const objective of [
    "balanced",
    "returnDrawdown",
    "minDrawdown",
    "sharpe",
  ] as const) {
    assert.ok(
      compareScreeningResults(defensive, aggressive, objective) < 0,
      objective,
    );
  }
  assert.equal(
    screeningObjectiveValue(aggressive, "returnDrawdown"),
    1.2,
  );
  assert.equal(
    screeningObjectiveValue(defensive, "returnDrawdown"),
    3,
  );
});

test("builds broad unique parameter grids within the per-strategy cap", () => {
  const screeningCandidates = buildScreeningCandidates(
    MAX_PARAMETER_SETS_PER_STRATEGY,
  );
  assert.equal(screeningCandidates.length, 31_172);
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
    assert.ok(
      candidates.length <= MAX_PARAMETER_SETS_PER_STRATEGY,
      strategy.id,
    );
    assert.equal(
      new Set(candidates.map((parameters) => JSON.stringify(parameters))).size,
      candidates.length,
      strategy.id,
    );
    assert.ok(
      candidates.some(
        (parameters) =>
          JSON.stringify(parameters) ===
          JSON.stringify(strategy.defaultParameters),
      ),
      strategy.id,
    );
  }

  for (const strategyId of [
    "tv-channel-breakout",
    "tv-momentum",
    "tv-pivot-reversal",
  ] as const) {
    const candidates = candidatesByStrategy.get(strategyId) ?? [];
    assert.deepEqual(
      [...new Set(candidates.map((parameters) => parameters.tick))],
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
        (key) => parameters[key] !== baseParameters[key],
      ).length,
      1,
    );
    assert.ok(parameters.fast < parameters.slow);
  });
});

test("validates exact strategy parameter keys, finite ranges, and cross-field rules", () => {
  assert.equal(
    isValidStrategyParameters("sma-cross", { fast: 9, slow: 31 }),
    true,
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
      maxPerStrategy: 10,
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

  assert.deepEqual(parseSaveBacktestInput(payload), payload);
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
      parameters: { fast: Number.NaN, slow: 30 },
    }),
    null,
  );
});
