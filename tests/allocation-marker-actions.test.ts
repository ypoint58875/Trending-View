import assert from "node:assert/strict";
import test from "node:test";
import { buildAllocationTradeMarkers } from "../lib/analysis/trade-markers";
import { buildTradeMarkerSeriesFromMarkers } from "../app/components/PriceChart";
import { zhCN } from "../app/i18n/zh-CN";
import type { AllocationRebalance } from "../lib/analysis/backtest";
import { buildStrategyCycleRollingChartOption } from "../app/components/StrategyCycleRollingChart";
import type { MarketBar } from "../lib/market/types";

const labels = { openPosition: zhCN.chart.open, carryPosition: zhCN.chart.carryPosition,
  closePosition: zhCN.chart.closePosition, shortBuy: zhCN.chart.shortBuy, shortSell: zhCN.chart.shortSell,
  increasePosition: zhCN.chart.increasePosition, reducePosition: zhCN.chart.reducePosition,
  rangeExit: zhCN.chart.rangeExit };

test("2020-06-25 partial long-exit is reduction;2020-07-01 is the actual close", () => {
  const fills: AllocationRebalance[] = [
    { time: "2020-06-25", fromAllocation: 1, targetAllocation: 0.3,
      fillPrice: 22255.3371046875, reason: "strategy", signals: ["long-exit"] },
    { time: "2020-07-01", fromAllocation: 0.29879988251016554, targetAllocation: 0,
      fillPrice: 22117.30612265625, reason: "strategy", signals: ["long-exit"] },
  ];
  const before = structuredClone(fills), markers = buildAllocationTradeMarkers(fills);
  assert.deepEqual(markers.sells.map((marker) => marker.action), ["reduce", "close"]);
  assert.deepEqual(markers.sells.map((marker) => marker.signals), [["long-exit"], ["long-exit"]]);
  const series = buildTradeMarkerSeriesFromMarkers(markers, labels) as unknown as {
    data: { name: string; label: { formatter: string } }[];
  }[];
  assert.deepEqual(series[1]!.data.map((point) => point.name), [zhCN.chart.reducePosition, zhCN.chart.closePosition]);
  assert.deepEqual(series[1]!.data.map((point) => point.label.formatter), [zhCN.chart.reducePosition, zhCN.chart.closePosition]);
  const bars = fills.map((fill) => ({ time: fill.time, open: fill.fillPrice, close: fill.fillPrice,
    high: fill.fillPrice + 1, low: fill.fillPrice - 1 })) as MarketBar[];
  const cycle = zhCN.cycleValidation;
  const option = buildStrategyCycleRollingChartOption(bars, fills, { price: cycle.price,
    establish: cycle.rollingEstablish, increase: cycle.rollingIncrease, reduce: cycle.rollingReduce,
    clear: cycle.rollingClear, targetAllocation: cycle.targetAllocation, fillPrice: cycle.rollingFillPrice });
  const groups = option.series as { name: string; data: { value: [string, number] }[] }[];
  assert.deepEqual(groups.find((group) => group.name === cycle.rollingReduce)!.data.map((point) => point.value[0]), ["2020-06-25"]);
  assert.deepEqual(groups.find((group) => group.name === cycle.rollingClear)!.data.map((point) => point.value[0]), ["2020-07-01"]);
  assert.deepEqual(fills, before);
});

test("allocation state, not component direction names, determines every action", () => {
  const fills: AllocationRebalance[] = [
    { time: "2024-01-01", fromAllocation: 0, targetAllocation: 0.3, fillPrice: 100, reason: "strategy", signals: ["short-entry"] },
    { time: "2024-01-02", fromAllocation: 0.3, targetAllocation: 1, fillPrice: 100, reason: "strategy", signals: ["long-entry"] },
    { time: "2024-01-03", fromAllocation: 1, targetAllocation: 0.3, fillPrice: 100, reason: "strategy", signals: ["long-exit", "short-exit"] },
    { time: "2024-01-04", fromAllocation: 0.3, targetAllocation: 0, fillPrice: 100, reason: "strategy", signals: ["short-exit"] },
    { time: "2024-01-05", fromAllocation: 0, targetAllocation: 0, fillPrice: 100, reason: "strategy", signals: ["long-exit"] },
    { time: "2024-01-06", fromAllocation: 0.3, targetAllocation: 0.3, fillPrice: 100, reason: "strategy", signals: ["long-entry"] },
    { time: "2024-01-07", fromAllocation: 0.3, targetAllocation: 0, fillPrice: 100, reason: "range-end" },
  ];
  const markers = buildAllocationTradeMarkers(fills);
  assert.deepEqual(markers.buys.map((marker) => marker.action), ["open", "increase"]);
  assert.deepEqual(markers.sells.map((marker) => marker.action), ["reduce", "close"]);
  assert.equal(markers.rangeExits.length, 1);
  assert.equal(markers.rangeExits[0]!.event, "range-exit");
  assert.equal(markers.rangeExits[0]!.action, undefined);
});
