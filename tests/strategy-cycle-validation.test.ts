import assert from "node:assert/strict";
import test from "node:test";
import type { MarketBar } from "../lib/market/types";
import {
  buildStrategyCycleEventValidation,
  buildStrategyCycleMatrix,
  buildStrategyCycleSchedule,
  barsAvailableAtCycleDecision,
  compareStrategyCycleRebalanceEvents,
  MAX_CYCLE_OPTIMIZATION_UNITS,
  normalizeCycleValues,
  type StrategyCycleSelectionSnapshot,
} from "../lib/analysis/strategy-cycle-validation";
import type { AllocationBacktestResult } from "../lib/analysis/backtest";

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

test("always includes the five-session reference grid without fixing the screening window", () => {
  const schedule = buildStrategyCycleSchedule(600, [64, 128, 256], [20, 40, 60], 300);
  assert.ok(schedule);
  assert.deepEqual(
    schedule.decisionIndexes.slice(0, 3).map((value) => value - schedule.decisionIndexes[0]!),
    [0, 5, 10],
  );
  assert.equal(schedule.optimizationUnits, schedule.decisionIndexes.length * 3);
});

test("reuses a minimum divisor grid for every multiple update interval", () => {
  const daily = buildStrategyCycleSchedule(
    300,
    [96],
    [1, 5, 10, 20, 40, 60],
    120,
  );
  assert.ok(daily);
  assert.ok(
    daily.decisionIndexes.slice(1).every(
      (value, index) => value - daily.decisionIndexes[index]! === 1,
    ),
  );
  assert.equal(daily.optimizationUnits, daily.decisionIndexes.length);

  const fiveSession = buildStrategyCycleSchedule(
    300,
    [96],
    [5, 10, 20, 40, 60],
    120,
  );
  assert.ok(fiveSession);
  assert.ok(
    fiveSession.decisionIndexes.slice(1).every(
      (value, index) => value - fiveSession.decisionIndexes[index]! === 5,
    ),
  );
  assert.equal(fiveSession.optimizationUnits, fiveSession.decisionIndexes.length);
});

function allocationResult(
  totalReturn: number,
  rebalances: AllocationBacktestResult["rebalances"],
): AllocationBacktestResult {
  return {
    totalReturn,
    annualizedReturn: totalReturn,
    benchmarkReturn: 0,
    maxDrawdown: 0,
    sharpe: 0,
    tradeCount: rebalances.length,
    finalEquity: 100_000 * (1 + totalReturn / 100),
    score: 0,
    equity: [],
    rebalances,
  };
}

test("matches rebalance events one-to-one and isolates timing return difference", () => {
  const bars = makeBars(40);
  const reference = allocationResult(10, [
    {
      time: bars[10]!.time,
      fromAllocation: 0,
      targetAllocation: 1,
      fillPrice: 100,
      reason: "strategy",
    },
    {
      time: bars[20]!.time,
      fromAllocation: 1,
      targetAllocation: 0,
      fillPrice: 120,
      reason: "strategy",
    },
  ]);
  const candidate = allocationResult(8, [
    {
      time: bars[12]!.time,
      fromAllocation: 0,
      targetAllocation: 1,
      fillPrice: 102,
      reason: "strategy",
    },
    {
      time: bars[19]!.time,
      fromAllocation: 1,
      targetAllocation: 0,
      fillPrice: 118,
      reason: "strategy",
    },
    {
      time: bars[35]!.time,
      fromAllocation: 0,
      targetAllocation: 1,
      fillPrice: 130,
      reason: "strategy",
    },
  ]);

  const metrics = compareStrategyCycleRebalanceEvents(bars, candidate, reference, 3);
  assert.equal(metrics.referenceEventCount, 2);
  assert.equal(metrics.matchedEventCount, 2);
  assert.equal(metrics.oppositeDirectionEventCount, 0);
  assert.equal(metrics.missedEventCount, 0);
  assert.equal(metrics.extraEventCount, 1);
  assert.equal(metrics.directionAgreementRate, 1);
  assert.equal(metrics.lateEventRate, 0.5);
  assert.equal(metrics.medianSignedTimingError, 0.5);
  assert.equal(metrics.medianAbsoluteTimingError, 1.5);
  assert.equal(metrics.withinTwoSessionsRate, 1);
  assert.equal(metrics.meanTargetAllocationError, 0);
  assert.ok(Math.abs((metrics.medianTimingReturnDifferenceBps ?? 0) + 200) < 1e-10);
});

test("opposite-direction adjustments are severe errors rather than timing hits", () => {
  const bars = makeBars(30);
  const reference = allocationResult(0, [
    {
      time: bars[10]!.time,
      fromAllocation: 0,
      targetAllocation: 1,
      fillPrice: 100,
      reason: "strategy",
    },
    {
      time: bars[20]!.time,
      fromAllocation: 1,
      targetAllocation: 0,
      fillPrice: 100,
      reason: "strategy",
    },
  ]);
  const candidate = allocationResult(0, [
    {
      time: bars[11]!.time,
      fromAllocation: 1,
      targetAllocation: 0,
      fillPrice: 100,
      reason: "strategy",
    },
    {
      time: bars[20]!.time,
      fromAllocation: 0,
      targetAllocation: 1,
      fillPrice: 100,
      reason: "strategy",
    },
  ]);

  const metrics = compareStrategyCycleRebalanceEvents(bars, candidate, reference, 3);
  assert.equal(metrics.matchedEventCount, 0);
  assert.equal(metrics.oppositeDirectionEventCount, 2);
  assert.equal(metrics.missedEventCount, 0);
  assert.equal(metrics.directionAgreementRate, 0);
  assert.equal(metrics.withinTwoSessionsRate, 0);
  assert.equal(metrics.withinFiveSessionsRate, 0);
  assert.equal(metrics.medianSignedTimingError, null);
  assert.equal(metrics.lateEventRate, null);
  assert.equal(metrics.meanTargetAllocationError, null);
  assert.equal(metrics.medianTimingReturnDifferenceBps, null);
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
  const eventResults = buildStrategyCycleEventValidation(
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
  assert.equal(eventResults.length, 2);
});
