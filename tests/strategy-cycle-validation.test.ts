import assert from "node:assert/strict";
import test from "node:test";
import type { MarketBar } from "../lib/market/types";
import {
  buildStrategyCycleDailyValidationReport,
  buildStrategyCycleDailySchedule,
  buildCycleScreeningWindows,
  buildStrategyCycleRollingReport,
  buildStrategyCycleRollingSchedule,
  buildStrategyCycleEventValidation,
  buildStrategyCycleMatrix,
  buildStrategyCycleSchedule,
  barsAvailableAtCycleDecision,
  compareStrategyCycleRebalanceEvents,
  compareStrategyCycleRebalanceEventsDetailed,
  CYCLE_DAILY_SCREENING_WINDOW,
  MAX_CYCLE_OPTIMIZATION_UNITS,
  MIN_CYCLE_DAILY_EVALUATION_SESSIONS,
  normalizeCycleValues,
  resolveStrategyCycleRecentSignals,
  shouldScreenStrategyCycleAtIndex,
  strategyCycleTrendAngle,
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

test("allows up to 2048 strategy-cycle optimization units", () => {
  assert.equal(MAX_CYCLE_OPTIMIZATION_UNITS, 2_048);
});

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

test("expands an inclusive screening-period range by the configured interval", () => {
  assert.deepEqual(buildCycleScreeningWindows(8, 20, 2), [8, 10, 12, 14, 16, 18, 20]);
  assert.deepEqual(buildCycleScreeningWindows(8, 19, 4), [8, 12, 16]);
  assert.deepEqual(buildCycleScreeningWindows(20, 8, 2), []);
  assert.deepEqual(buildCycleScreeningWindows(8, 20, 0), []);
});

test("trend trigger skips continuation candles and screens reversal candles", () => {
  const rising = makeBars(3);
  assert.ok((strategyCycleTrendAngle(rising, 2) ?? 0) >= 30);
  assert.equal(shouldScreenStrategyCycleAtIndex(rising, 2), false);
  rising[2] = { ...rising[2]!, open: rising[2]!.close + 1 };
  assert.equal(shouldScreenStrategyCycleAtIndex(rising, 2), true);

  const falling = makeBars(3).map((bar, index) => ({
    ...bar,
    open: 104 - index,
    close: 103 - index,
  }));
  assert.ok((strategyCycleTrendAngle(falling, 2) ?? 0) <= -30);
  assert.equal(shouldScreenStrategyCycleAtIndex(falling, 2), false);
  falling[2] = { ...falling[2]!, open: falling[2]!.close - 1 };
  assert.equal(shouldScreenStrategyCycleAtIndex(falling, 2), true);

  const flat = makeBars(3).map((bar) => ({ ...bar, open: 100, close: 100 }));
  assert.equal(shouldScreenStrategyCycleAtIndex(flat, 2), true);
});

test("rolling schedule always screens before evaluation and then only on trend triggers", () => {
  const bars = makeBars(55);
  const schedule = buildStrategyCycleRollingSchedule(bars, 14, 20);
  assert.deepEqual(schedule?.decisionIndexes, [40]);
  assert.equal(schedule?.evaluationStartIndex, 41);
  assert.equal(schedule?.evaluationEndIndex, 54);
  bars[45] = { ...bars[45]!, open: bars[45]!.close + 1 };
  assert.deepEqual(buildStrategyCycleRollingSchedule(bars, 14, 20)?.decisionIndexes, [40, 45]);
  assert.equal(buildStrategyCycleRollingSchedule(makeBars(100), 90, 20), null);
  assert.equal(buildStrategyCycleRollingSchedule(makeBars(20), 2, 20), null);
  assert.ok(buildStrategyCycleRollingSchedule(makeBars(20), 10, 5));
  assert.equal(buildStrategyCycleRollingSchedule(makeBars(20), 10, 4), null);
});

test("two-bar signal resolver inherits position and applies the six supported sequences", () => {
  const increase = (targetAllocation: number) => ({
    direction: "increase" as const,
    targetAllocation,
    signals: ["long-entry" as const],
  });
  const reduce = (targetAllocation: number) => ({
    direction: "reduce" as const,
    targetAllocation,
    signals: ["long-exit" as const],
  });
  assert.equal(resolveStrategyCycleRecentSignals(0.2, [increase(0.6)]).targetAllocation, 0.6);
  assert.equal(resolveStrategyCycleRecentSignals(0.8, [reduce(0.4)]).targetAllocation, 0.4);
  assert.equal(resolveStrategyCycleRecentSignals(0.2, [increase(0.5), increase(0.8)]).targetAllocation, 0.8);
  assert.equal(resolveStrategyCycleRecentSignals(0.9, [reduce(0.6), reduce(0.3)]).targetAllocation, 0.3);
  assert.equal(resolveStrategyCycleRecentSignals(0.8, [reduce(0.2), increase(0.7)]).targetAllocation, 0.8);
  assert.equal(resolveStrategyCycleRecentSignals(0.8, [increase(0.9), reduce(0.4)]).targetAllocation, 0.4);
});

test("rolling report keeps only event-triggered updates and the benchmark", () => {
  const bars = makeBars(55);
  const plan = (strategyId: "roc-momentum" | "rsi-reversal") => ({
    strategyA: strategyId === "roc-momentum"
      ? { strategyId, parameters: { period: 2, entry: 1, exit: 0 } }
      : { strategyId, parameters: { period: 14, entry: 30, exit: 70 } },
    strategyB: null,
    strategyAAllocation: 1,
    strategyBAllocation: 0,
  });
  const snapshots: StrategyCycleSelectionSnapshot[] = [
    { decisionIndex: 40, plan: plan("roc-momentum") },
  ].map(({ decisionIndex, plan }) => ({
    decisionIndex,
    decisionTime: bars[decisionIndex]!.time,
    screeningWindow: 20,
    plan,
    fixedRelativeLongStrategy: null,
    label: String(decisionIndex),
  }));
  const settings = {
    initialCash: 100_000,
    commissionRate: 0.001,
    slippageRate: 0.001,
    interval: "1d" as const,
    executionPolicy: "hybrid" as const,
  };
  const result = buildStrategyCycleRollingReport(bars, snapshots, 14, 20, settings);
  assert.equal(result.evaluationStartTime, bars[41]!.time);
  assert.equal(result.evaluationEndTime, bars[54]!.time);
  assert.equal(result.decisionCount, 1);
  assert.equal(result.skippedDecisionCount, 13);
  assert.ok(Number.isFinite(result.updateReturn));
  assert.ok(result.rebalances.every((trade) =>
    trade.time >= result.evaluationStartTime && trade.time <= result.evaluationEndTime));
  assert.ok(Number.isFinite(result.benchmarkReturn));
  const expectedBenchmark = (
    bars[54]!.close /
    (bars[41]!.open * (1 + settings.slippageRate) * (1 + settings.commissionRate)) - 1
  ) * 100;
  assert.ok(Math.abs(result.benchmarkReturn - expectedBenchmark) < 1e-9);
  assert.throws(() => buildStrategyCycleRollingReport(bars, [], 14, 20, settings));
});

test("daily validation requires the screening window plus 20 forward sessions and one decision day", () => {
  assert.equal(MIN_CYCLE_DAILY_EVALUATION_SESSIONS, 149);
  assert.equal(buildStrategyCycleDailySchedule(600, 148), null);
  assert.equal(buildStrategyCycleDailySchedule(148, 149), null);
  assert.equal(buildStrategyCycleDailySchedule(149, 149)?.optimizationUnits, 1);
  assert.equal(buildStrategyCycleDailySchedule(150, 150)?.optimizationUnits, 2);
  const maximum = buildStrategyCycleDailySchedule(600, 504);
  assert.equal(maximum?.optimizationUnits, 356);
  assert.equal(maximum?.decisionIndexes.length, 356);
  assert.equal(maximum?.decisionIndexes[0], 224);
  assert.equal(maximum?.decisionIndexes.at(-1), 579);
  const shorter = buildStrategyCycleDailySchedule(600, 504, 64);
  assert.equal(shorter?.optimizationUnits, 420);
  assert.equal(shorter?.decisionIndexes[0], 160);
  assert.equal(buildStrategyCycleDailySchedule(600, 84, 64), null);
  assert.equal(buildStrategyCycleDailySchedule(600, 85, 64)?.optimizationUnits, 1);
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

test("daily 128-session validation measures stable runs and frozen forward transitions", () => {
  const bars = makeBars(180);
  const snapshot = (
    decisionIndex: number,
    fast: number,
    slow: number,
    label: string,
  ): StrategyCycleSelectionSnapshot => ({
    decisionIndex,
    decisionTime: bars[decisionIndex]!.time,
    screeningWindow: CYCLE_DAILY_SCREENING_WINDOW,
    plan: {
      strategyA: { strategyId: "sma-cross", parameters: { fast, slow } },
      strategyB: null,
      strategyAAllocation: 1,
      strategyBAllocation: 0,
    },
    fixedRelativeLongStrategy: null,
    label,
  });
  const report = buildStrategyCycleDailyValidationReport(
    bars,
    [
      snapshot(130, 2, 5, "A"),
      snapshot(131, 2, 5, "A"),
      snapshot(132, 3, 8, "B"),
      snapshot(133, 3, 8, "B"),
      snapshot(134, 2, 5, "A"),
    ],
    {
      initialCash: 100_000,
      commissionRate: 0.001,
      slippageRate: 0.001,
      interval: "1d",
      executionPolicy: "hybrid",
    },
  );

  assert.deepEqual(
    report.stabilityRuns.map((run) => ({ label: run.label, sessions: run.sessions, complete: run.complete })),
    [
      { label: "A", sessions: 2, complete: true },
      { label: "B", sessions: 2, complete: true },
      { label: "A", sessions: 1, complete: false },
    ],
  );
  const strategyA = report.stabilitySummaries.find((summary) => summary.label === "A");
  assert.equal(strategyA?.episodeCount, 2);
  assert.equal(strategyA?.completedEpisodeCount, 1);
  assert.equal(strategyA?.averageSessions, 2);
  assert.equal(report.transitions.length, 2);
  assert.deepEqual(
    report.transitions[0]?.horizons.map((result) => result.sessions),
    [5, 10, 15, 20],
  );
  assert.ok(report.transitions[0]?.horizons.every((result) => result.oldReturn !== null));
  assert.equal(report.transitions[0]?.oldDurationSessions, 2);
  assert.equal(report.transitions[0]?.requestedPerformanceSessions, 149);
  assert.equal(report.transitions[0]?.performanceStartTime, bars[4]?.time);
  assert.equal(report.transitions[0]?.performanceEndTime, bars[152]?.time);
  assert.ok(
    report.transitions[0]?.oldRebalances.every(
      (rebalance) => rebalance.time <= report.transitions[0]!.decisionTime,
    ),
  );
  assert.ok(
    report.transitions[0]?.newRebalances.every(
      (rebalance) => rebalance.time <= report.transitions[0]!.decisionTime,
    ),
  );
  assert.ok(Number.isFinite(report.transitions[0]?.screeningReturnDifference));
  assert.equal(report.transitionSummaries[0]?.sampleCount, 0);
  assert.equal(report.transitionSummaries[0]?.medianReturnDifference, null);
  assert.equal(report.transitionSummaries[0]?.meanReturnDifference, null);
  assert.equal(
    (report.transitionSummaries[0]?.screeningNewLedCount ?? 0) +
      (report.transitionSummaries[0]?.screeningOldLedCount ?? 0),
    report.transitions.filter((transition) =>
      Math.abs(transition.screeningReturnDifference) > 1e-12 &&
      Math.abs(transition.horizons[0]?.returnDifference ?? 0) > 1e-12).length,
  );
  assert.equal(report.recommendation, "insufficient-evidence");

  const shorterReport = buildStrategyCycleDailyValidationReport(
    bars,
    [snapshot(130, 2, 5, "A"), snapshot(131, 3, 8, "B")].map(
      (entry) => ({ ...entry, screeningWindow: 64 }),
    ),
    {
      initialCash: 100_000,
      commissionRate: 0.001,
      slippageRate: 0.001,
      interval: "1d",
      executionPolicy: "hybrid",
    },
    64,
  );
  assert.equal(shorterReport.screeningWindow, 64);
  assert.equal(shorterReport.transitions.length, 1);
  assert.equal(shorterReport.transitions[0]?.requestedPerformanceSessions, 85);
  assert.equal(shorterReport.transitions[0]?.performanceStartTime, bars[67]?.time);
  assert.equal(shorterReport.transitions[0]?.performanceEndTime, bars[151]?.time);

  const repeatedChanges = buildStrategyCycleDailyValidationReport(
    bars,
    Array.from({ length: 6 }, (_, index) =>
      index % 2 === 0
        ? snapshot(140 + index, 2, 5, "A")
        : snapshot(140 + index, 3, 8, "B")),
    {
      initialCash: 100_000,
      commissionRate: 0.001,
      slippageRate: 0.001,
      interval: "1d",
      executionPolicy: "hybrid",
    },
  );
  assert.equal(repeatedChanges.transitionSummaries[0]?.sampleCount, 0);
  assert.equal(repeatedChanges.transitionSummaries[0]?.equalCount, 0);
  assert.equal(repeatedChanges.recommendation, "insufficient-evidence");
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

  const comparison = compareStrategyCycleRebalanceEventsDetailed(
    bars,
    candidate,
    reference,
    3,
  );
  assert.deepEqual(
    comparison.events.map((event) => ({
      status: event.status,
      referenceTime: event.reference?.time ?? null,
      candidateTime: event.candidate?.time ?? null,
      timingErrorSessions: event.timingErrorSessions,
    })),
    [
      {
        status: "matched",
        referenceTime: bars[10]!.time,
        candidateTime: bars[12]!.time,
        timingErrorSessions: 2,
      },
      {
        status: "matched",
        referenceTime: bars[20]!.time,
        candidateTime: bars[19]!.time,
        timingErrorSessions: -1,
      },
      {
        status: "extra",
        referenceTime: null,
        candidateTime: bars[35]!.time,
        timingErrorSessions: null,
      },
    ],
  );
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
  assert.deepEqual(
    compareStrategyCycleRebalanceEventsDetailed(bars, candidate, reference, 3)
      .events.map((event) => event.status),
    ["opposite", "opposite"],
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
