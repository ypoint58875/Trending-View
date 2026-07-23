import assert from "node:assert/strict";
import test from "node:test";
import { runBacktest } from "../lib/analysis/backtest";
import { ema, rsi, sma } from "../lib/analysis/indicators";
import { screenStrategies } from "../lib/analysis/screening";
import { parseKlineRow } from "../lib/market/eastmoney";
import type { MarketBar } from "../lib/market/types";

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

  assert.equal(results.length, 18);
  for (let index = 1; index < results.length; index += 1) {
    assert.ok(results[index - 1].score >= results[index].score);
  }
});

