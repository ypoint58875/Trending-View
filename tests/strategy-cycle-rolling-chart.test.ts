import assert from "node:assert/strict";
import test from "node:test";
import { buildStrategyCycleRollingChartOption } from "../app/components/StrategyCycleRollingChart";
import type { AllocationRebalance } from "../lib/analysis/backtest";
import type { MarketBar } from "../lib/market/types";

const bars: MarketBar[] = Array.from({ length: 5 }, (_, index) => ({
  time: `2026-09-0${index + 1}`,
  timestamp: Date.UTC(2026, 8, index + 1),
  open: 100 + index,
  high: 103 + index,
  low: 99 + index,
  close: 102 + index,
  volume: 1_000,
  amount: 100_000,
  amplitude: 1,
  changePercent: 1,
  change: 1,
  turnoverRate: 1,
}));

const trade = (
  time: string,
  fromAllocation: number,
  targetAllocation: number,
): AllocationRebalance => ({
  time,
  fromAllocation,
  targetAllocation,
  fillPrice: 101,
  reason: "strategy",
});

test("full-cycle chart shows every evaluation candle and actual buy/sell markers", () => {
  const option = buildStrategyCycleRollingChartOption(bars, [
    trade(bars[0]!.time, 0, 1),
    trade(bars[2]!.time, 1, 0.5),
    trade("2026-09-06", 0.5, 1),
  ], {
    price: "Price",
    buy: "Buy",
    sell: "Sell",
    targetAllocation: "Target",
    fillPrice: "Fill",
  });
  const series = option.series as Array<{
    name?: string;
    data?: Array<number | { value?: [string, number]; symbolRotate?: number }>;
  }>;
  assert.equal(series.find((entry) => entry.name === "Price")?.data?.length, 5);
  const buy = series.find((entry) => entry.name === "Buy")?.data?.[0];
  const sell = series.find((entry) => entry.name === "Sell")?.data?.[0];
  assert.equal(typeof buy === "object" ? buy.value?.[0] : null, bars[0]!.time);
  assert.equal(typeof buy === "object" ? buy.value?.[1] : null, bars[0]!.low);
  assert.equal(typeof buy === "object" ? buy.symbolRotate : null, 0);
  assert.equal(typeof sell === "object" ? sell.value?.[0] : null, bars[2]!.time);
  assert.equal(typeof sell === "object" ? sell.value?.[1] : null, bars[2]!.high);
  assert.equal(typeof sell === "object" ? sell.symbolRotate : null, 180);
  assert.equal(series.find((entry) => entry.name === "Buy")?.data?.length, 1);
  assert.equal(series.find((entry) => entry.name === "Sell")?.data?.length, 1);
});
