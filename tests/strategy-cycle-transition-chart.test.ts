import assert from "node:assert/strict";
import test from "node:test";
import { buildStrategyCycleTransitionChartOption } from "../app/components/StrategyCycleTransitionChart";
import type { StrategyCycleTransitionResult } from "../lib/analysis/strategy-cycle-validation";

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
  performance: [
    { time: "2026-09-01", oldReturn: 0, newReturn: 0, returnDifference: 0 },
    { time: "2026-09-02", oldReturn: 1, newReturn: 2, returnDifference: 1 },
    { time: "2026-09-03", oldReturn: 2, newReturn: 4, returnDifference: 2 },
    { time: "2026-09-04", oldReturn: 3, newReturn: 5, returnDifference: 2 },
    { time: "2026-09-05", oldReturn: 4, newReturn: 6, returnDifference: 2 },
  ],
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
  oldStrategy: "old strategy",
  newStrategy: "new strategy",
  difference: "difference",
  returnUnit: "return %",
  changeDate: "change",
  oldRebalance: "old rebalance",
  newRebalance: "new rebalance",
  targetAllocation: "target allocation",
};

test("plots the full return window and only the supplied pre-future rebalance markers", () => {
  const option = buildStrategyCycleTransitionChartOption(transition, labels);
  const series = option.series as Array<{
    name?: string;
    data?: Array<number | { value?: [string, number]; symbolRotate?: number }>;
  }>;
  assert.equal(series.find((entry) => entry.name === labels.oldStrategy)?.data?.length, 5);
  assert.equal(series.find((entry) => entry.name === labels.newStrategy)?.data?.length, 5);
  assert.equal(series.find((entry) => entry.name === labels.difference)?.data?.length, 5);

  const oldMarker = series.find((entry) => entry.name === labels.oldRebalance)?.data?.[0];
  const newMarker = series.find((entry) => entry.name === labels.newRebalance)?.data?.[0];
  assert.equal(typeof oldMarker === "object" ? oldMarker.value?.[0] : null, "2026-09-02");
  assert.equal(typeof oldMarker === "object" ? oldMarker.symbolRotate : null, 0);
  assert.equal(typeof newMarker === "object" ? newMarker.value?.[0] : null, "2026-09-03");
  assert.equal(typeof newMarker === "object" ? newMarker.symbolRotate : null, 180);
});
