import assert from "node:assert/strict";
import test from "node:test";
import { buildStrategyCycleTransitionChartOption } from "../app/components/StrategyCycleTransitionChart";
import type { StrategyCycleTransitionResult } from "../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../lib/market/types";

const transition: StrategyCycleTransitionResult = {
  decisionTime: "2026-09-03",
  oldStrategyKey: "old",
  oldLabel: "Old",
  newStrategyKey: "new",
  newLabel: "New",
  oldDurationSessions: 2,
  requestedPerformanceSessions: 151,
  performanceStartTime: "2026-09-01",
  performanceEndTime: "2026-09-05",
  oldRebalances: [{
    time: "2026-09-02",
    fromAllocation: 0,
    targetAllocation: 1,
    returnValue: 1,
  }],
  newRebalances: [{
    time: "2026-09-03",
    fromAllocation: 1,
    targetAllocation: 0,
    returnValue: 4,
  }],
  screeningOldReturn: 2,
  screeningNewReturn: 4,
  screeningReturnDifference: 2,
  horizons: [],
};

const labels = {
  price: "price",
  changeDate: "change",
  oldRebalance: "old rebalance",
  newRebalance: "new rebalance",
  targetAllocation: "target allocation",
};

const bars = Array.from({ length: 5 }, (_, index): MarketBar => ({
  time: `2026-09-0${index + 1}`,
  timestamp: index,
  open: 100 + index,
  high: 103 + index,
  low: 99 + index,
  close: 102 + index,
  volume: 1000,
  amount: 100000,
  amplitude: 1,
  changePercent: 1,
  change: 1,
  turnoverRate: 1,
}));

test("plots price candles and places only supplied rebalances at candle low or high", () => {
  const option = buildStrategyCycleTransitionChartOption(transition, bars, labels);
  const series = option.series as Array<{
    name?: string;
    data?: Array<number | { value?: [string, number]; symbolRotate?: number }>;
  }>;
  assert.equal(series.find((entry) => entry.name === labels.price)?.data?.length, 5);
  assert.equal(series.length, 3);

  const oldMarker = series.find((entry) => entry.name === labels.oldRebalance)?.data?.[0];
  const newMarker = series.find((entry) => entry.name === labels.newRebalance)?.data?.[0];
  assert.equal(typeof oldMarker === "object" ? oldMarker.value?.[0] : null, "2026-09-02");
  assert.equal(typeof oldMarker === "object" ? oldMarker.value?.[1] : null, 100);
  assert.equal(typeof oldMarker === "object" ? oldMarker.symbolRotate : null, 0);
  assert.equal(typeof newMarker === "object" ? newMarker.value?.[0] : null, "2026-09-03");
  assert.equal(typeof newMarker === "object" ? newMarker.value?.[1] : null, 105);
  assert.equal(typeof newMarker === "object" ? newMarker.symbolRotate : null, 180);
});
