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
  STABILITY_THRESHOLDS,
  analyzeStrategyStability,
  classifyMarketRegimes,
  summarizeNearbyBacktests,
  summarizeRegimeReturns,
} from "../lib/analysis/stability";
import { buildTradeMarkers } from "../lib/analysis/trade-markers";
import {
  parseKlineRow,
  searchEastmoney,
} from "../lib/market/eastmoney";
import { parseNasdaqRows } from "../lib/market/nasdaq";
import type {
  MarketBar,
  MarketInstrument,
} from "../lib/market/types";
import { mergeLatestMarketSeries } from "../lib/market/series";
import { parseYahooChart, searchYahoo } from "../lib/market/yahoo";

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

test("replaces only overlapping latest bars while retaining cached history", () => {
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
  const latest = {
    ...history,
    bars: latestBars,
    fetchedAt: "2026-07-24T01:01:00.000Z",
  };

  const merged = mergeLatestMarketSeries(history, latest, 1000);

  assert.deepEqual(
    merged.bars.map((bar) => bar.close),
    [10, 11, 12, 15],
  );
  assert.equal(merged.bars[0], historyBars[0]);
  assert.equal(merged.fetchedAt, latest.fetchedAt);
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
