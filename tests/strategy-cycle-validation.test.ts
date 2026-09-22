import assert from "node:assert/strict";
import test from "node:test";
import type { MarketBar } from "../lib/market/types";
import {
  buildStrategyCycleMatrix,
  buildStrategyCycleSchedule,
  barsAvailableAtCycleDecision,
  MAX_CYCLE_OPTIMIZATION_UNITS,
  normalizeCycleValues,
  type StrategyCycleSelectionSnapshot,
} from "../lib/analysis/strategy-cycle-validation";

function makeBars(count: number): MarketBar[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + index;
    return {
      time: new Date(Date.UTC(2024, 0, index + 1)).toISOString().slice(0, 10),
      timestamp: Date.UTC(2024, 0, index + 1),
      open: close - 0.5,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1_000,
      amount: close * 1_000,
      amplitude: 2,
      changePercent: 1,
      change: 1,
      turnoverRate: 1,
    };
  });
}

test("builds a bounded shared decision schedule for screening windows", () => {
  const schedule = buildStrategyCycleSchedule(
    600,
    [64, 128, 256],
    [5, 10, 20, 40, 60],
    504,
  );
  assert.ok(schedule);
  assert.equal(schedule.evaluationStartIndex, 256);
  assert.equal(schedule.decisionIndexes[0], 255);
  assert.equal(
    schedule.decisionIndexes[1] - schedule.decisionIndexes[0],
    5,
  );
  assert.equal(
    schedule.optimizationUnits,
    schedule.decisionIndexes.length * 3,
  );
  assert.ok(schedule.optimizationUnits <= MAX_CYCLE_OPTIMIZATION_UNITS);
});

test("a historical decision receives no bars from its future", () => {
  const bars = makeBars(40);
  const visible = barsAvailableAtCycleDecision(bars, 19);
  assert.equal(visible.length, 20);
  assert.equal(visible.at(-1)?.time, bars[19]?.time);
  assert.notEqual(visible.at(-1)?.time, bars[20]?.time);
  assert.throws(() => barsAvailableAtCycleDecision(bars, 40), RangeError);
});

test("normalizes user periods deterministically and bounds their count", () => {
  assert.deepEqual(
    normalizeCycleValues([128, 64, 128, 0, 5000, 256, 32, 48, 96, 192, 384], 20, 2_000),
    [32, 48, 64, 96, 128, 192, 256, 384],
  );
});

test("reusing an unchanged selected plan does not create update-boundary trades", () => {
  const bars = makeBars(90);
  const schedule = buildStrategyCycleSchedule(90, [20], [5, 10], 40);
  assert.ok(schedule);
  const snapshots: StrategyCycleSelectionSnapshot[] = schedule.decisionIndexes.map(
    (decisionIndex) => ({
      decisionIndex,
      decisionTime: bars[decisionIndex]!.time,
      screeningWindow: 20,
      plan: {
        strategyA: {
          strategyId: "sma-cross",
          parameters: { fast: 2, slow: 10 },
        },
        strategyB: null,
        strategyAAllocation: 1,
        strategyBAllocation: 0,
      },
      fixedRelativeLongStrategy: null,
      label: "SMA",
    }),
  );
  const results = buildStrategyCycleMatrix(
    bars,
    snapshots,
    [20],
    [5, 10],
    schedule.evaluationStartIndex,
    schedule.evaluationEndIndex,
    {
      initialCash: 100_000,
      commissionRate: 0.001,
      slippageRate: 0.001,
      interval: "1d",
      executionPolicy: "hybrid",
    },
  );
  assert.equal(results.length, 2);
  assert.equal(results[0]!.performance.tradeCount, results[1]!.performance.tradeCount);
  assert.ok(
    Math.abs(results[0]!.performance.totalReturn - results[1]!.performance.totalReturn) < 1e-10,
  );
});
