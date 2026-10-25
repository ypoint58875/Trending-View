import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CYCLE_MONITORING_RANGES, cycleMonitoringCoverage, isValidCycleMonitoringRange } from "../lib/analysis/strategy-cycle-monitoring";
import { runStrategyCycleCloseBacktest } from "../lib/analysis/strategy-cycle-validation";
import type { AllocationRebalance } from "../lib/analysis/backtest";
import type { MarketBar } from "../lib/market/types";

const bars = ["2026-05-20", "2026-05-21", "2026-05-22", "2026-05-25"].map((time) => ({ time }));
const range = { startTime: "2026-05-20", endTime: "2026-05-25" };
const event = (time: string, targetAllocation: number): AllocationRebalance => ({
  time, targetAllocation, fromAllocation: 0, fillPrice: 100, reason: "strategy",
});

test("monitoring defaults preserve all four requested inclusive ranges", () => {
  assert.deepEqual(DEFAULT_CYCLE_MONITORING_RANGES, [
    { startTime: "2025-04-21", endTime: "2025-06-16" },
    { startTime: "2025-10-21", endTime: "2025-11-04" },
    { startTime: "2026-03-30", endTime: "2026-05-12" },
    { startTime: "2026-05-20", endTime: "2026-06-03" },
  ]);
});

test("monitoring validates calendar dates, ordering, and single-day ranges", () => {
  for (const item of [
    { startTime: "", endTime: range.endTime },
    { startTime: "2026-02-29", endTime: range.endTime },
    { startTime: "2026-05-26", endTime: range.endTime },
    { startTime: "26.5.20", endTime: range.endTime },
  ]) assert.equal(isValidCycleMonitoringRange(item), false);
  assert.equal(isValidCycleMonitoringRange({ startTime: "2024-02-29", endTime: "2024-02-29" }), true);
  assert.throws(() => cycleMonitoringCoverage(bars, [], [{ startTime: "", endTime: "" }]));
});

test("coverage counts close entries, partial holdings and close exits using trading days", () => {
  const [result] = cycleMonitoringCoverage(bars, [
    event("2026-05-20", 1), event("2026-05-21", 0.4), event("2026-05-22", 0),
  ], [range]);
  assert.equal(result!.coveragePercent, 50);
  assert.equal(result!.heldSessions, 2);
  assert.equal(result!.sessions, 4);
});

test("ranges inherit executed holdings before the start and clip to available evaluation dates", () => {
  const results = cycleMonitoringCoverage(bars, [event("2026-05-20", 0.4)], [
    { startTime: "2026-05-21", endTime: "2026-06-03" },
    { startTime: "2026-05-01", endTime: "2026-05-20" },
    range,
  ]);
  assert.equal(results[0]!.coveragePercent, 100);
  assert.equal(results[0]!.sessions, 3);
  assert.equal(results[0]!.actualEndTime, "2026-05-25");
  assert.equal(results[1]!.sessions, 1);
  assert.equal(results[1]!.actualStartTime, "2026-05-20");
  assert.equal(results[2]!.heldSessions, 4);
});

test("empty ranges are supported and no-data differs from zero holdings", () => {
  assert.deepEqual(cycleMonitoringCoverage(bars, [], []), []);
  const results = cycleMonitoringCoverage(bars, [], [range,
    { startTime: "2026-05-23", endTime: "2026-05-24" },
    { startTime: "2027-01-01", endTime: "2027-01-05" },
  ]);
  assert.equal(results[0]!.coveragePercent, 0);
  for (const result of results.slice(1)) {
    assert.equal(result.coveragePercent, null);
    assert.equal(result.actualStartTime, null);
    assert.equal(result.sessions, 0);
  }
  assert.equal(cycleMonitoringCoverage([], [], [range])[0]!.coveragePercent, null);
});

test("coverage follows actual close replay fills and includes the last close entry", () => {
  const priceBars = bars.map((bar) => ({ ...bar, timestamp: Date.parse(bar.time),
    open: 100, high: 101, low: 99, close: 100, volume: 1000,
  })) as MarketBar[];
  const replay = runStrategyCycleCloseBacktest(priceBars, [0, 1, 0, 0.4], {
    initialCash: 100_000, commissionRate: 0.0003, slippageRate: 0.0002, interval: "1d",
  });
  const [result] = cycleMonitoringCoverage(priceBars, replay.rebalances, [range]);
  assert.equal(replay.rebalances.length, 3);
  assert.equal(result!.heldSessions, 2);
  assert.equal(result!.coveragePercent, 50);
});
