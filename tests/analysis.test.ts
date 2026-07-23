import assert from "node:assert/strict";
import test from "node:test";
import { runBacktest } from "../lib/analysis/backtest";
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
  roc,
  rsi,
  sma,
  stochasticRsi,
  supertrend,
  vwap,
  williamsR,
  wma,
  type NumericSeries,
} from "../lib/analysis/indicators";
import {
  SCREENING_CANDIDATES,
  screenStrategies,
} from "../lib/analysis/screening";
import { STRATEGIES } from "../lib/analysis/strategies";
import {
  parseKlineRow,
  searchEastmoney,
} from "../lib/market/eastmoney";
import { parseNasdaqRows } from "../lib/market/nasdaq";
import type {
  MarketBar,
  MarketInstrument,
} from "../lib/market/types";
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

test("parses Yahoo index history and skips incomplete bars", () => {
  const instrument: MarketInstrument = {
    secid: "^SOX",
    code: "SOX",
    name: "SOX",
    exchange: "PHLX",
    assetType: "index",
    provider: "yahoo",
  };
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
            },
          },
        ],
      },
    },
    instrument,
    "1d",
  );

  assert.equal(series.bars.length, 1);
  assert.equal(series.bars[0].close, 5350);
  assert.equal(series.source, "yahoo");
  assert.equal(series.instrument.code, "SOX");
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
});

test("builds aligned binary signals for every strategy", () => {
  const bars = makeBars(
    Array.from({ length: 240 }, (_, index) => {
      return 50 + index * 0.03 + Math.sin(index / 4) * 3;
    }),
  );

  assert.equal(STRATEGIES.length, 12);
  STRATEGIES.forEach((strategy) => {
    const target = strategy.buildTarget(
      bars,
      strategy.defaultParameters,
    );
    assert.equal(target.length, bars.length);
    assert.ok(target.every((value) => value === 0 || value === 1));
  });
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

test("screens every candidate and sorts by descending score", () => {
  const bars = makeBars(
    Array.from({ length: 180 }, (_, index) => {
      return 20 + index * 0.04 + Math.sin(index / 5) * 1.8;
    }),
  );
  const results = screenStrategies(bars, {
    initialCash: 100_000,
    commissionRate: 0.0003,
    slippageRate: 0.0002,
    interval: "1d",
  });

  assert.equal(SCREENING_CANDIDATES.length, 36);
  assert.equal(results.length, 36);
  for (let index = 1; index < results.length; index += 1) {
    assert.ok(results[index - 1].score >= results[index].score);
  }
});
