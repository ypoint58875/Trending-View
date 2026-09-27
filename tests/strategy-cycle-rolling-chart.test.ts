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

test("full-cycle chart shows every candle and classifies all four rebalance actions", () => {
  const option = buildStrategyCycleRollingChartOption(bars, [
    trade(bars[0]!.time, 0, 0.6),
    trade(bars[1]!.time, 0.6, 1),
    trade(bars[2]!.time, 1, 0.5),
    trade(bars[3]!.time, 0.5, 0),
    trade("2026-09-06", 0, 1),
  ], {
    price: "Price",
    establish: "Establish",
    increase: "Increase",
    reduce: "Reduce",
    clear: "Clear",
    targetAllocation: "Target",
    fillPrice: "Fill",
  });
  const series = option.series as Array<{
    name?: string;
    data?: Array<number | { value?: [string, number]; symbolRotate?: number }>;
  }>;
  assert.equal(series.find((entry) => entry.name === "Price")?.data?.length, 5);
  const establish = series.find((entry) => entry.name === "Establish")?.data?.[0];
  const increase = series.find((entry) => entry.name === "Increase")?.data?.[0];
  const reduce = series.find((entry) => entry.name === "Reduce")?.data?.[0];
  const clear = series.find((entry) => entry.name === "Clear")?.data?.[0];
  assert.equal(typeof establish === "object" ? establish.value?.[0] : null, bars[0]!.time);
  assert.equal(typeof establish === "object" ? establish.value?.[1] : null, bars[0]!.low);
  assert.equal(typeof establish === "object" ? establish.symbolRotate : null, 0);
  assert.equal(typeof increase === "object" ? increase.value?.[0] : null, bars[1]!.time);
  assert.equal(typeof increase === "object" ? increase.symbolRotate : null, 0);
  assert.equal(typeof reduce === "object" ? reduce.value?.[0] : null, bars[2]!.time);
  assert.equal(typeof reduce === "object" ? reduce.value?.[1] : null, bars[2]!.high);
  assert.equal(typeof reduce === "object" ? reduce.symbolRotate : null, 180);
  assert.equal(typeof clear === "object" ? clear.value?.[0] : null, bars[3]!.time);
  assert.equal(typeof clear === "object" ? clear.symbolRotate : null, 180);
  assert.equal(series.find((entry) => entry.name === "Establish")?.data?.length, 1);
  assert.equal(series.find((entry) => entry.name === "Increase")?.data?.length, 1);
  assert.equal(series.find((entry) => entry.name === "Reduce")?.data?.length, 1);
  assert.equal(series.find((entry) => entry.name === "Clear")?.data?.length, 1);
});
