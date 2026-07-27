import assert from "node:assert/strict";
import test from "node:test";
import type {
  AllocationRebalance,
  BacktestResult,
  EquityPoint,
} from "../lib/analysis/backtest";
import {
  equityReturnCorrelation,
  evaluateRecentStrategyEffectiveness,
  selectStrategyShortlist,
} from "../lib/analysis/strategy-shortlist";
import type { StrategyCombinationResult } from "../lib/analysis/strategy-combinations";
import type { StrategyId } from "../lib/analysis/strategies";
import type { MarketBar } from "../lib/market/types";

function dates(count: number): string[] {
  const start = Date.UTC(2026, 0, 1);
  return Array.from({ length: count }, (_, index) =>
    new Date(start + index * 86_400_000).toISOString().slice(0, 10),
  );
}

function equityFromReturns(
  times: readonly string[],
  dailyReturn: (index: number) => number,
): EquityPoint[] {
  let equity = 100_000;
  let peak = equity;
  return times.map((time, index) => {
    if (index > 0) equity *= 1 + dailyReturn(index);
    peak = Math.max(peak, equity);
    return {
      time,
      equity,
      drawdown: ((equity - peak) / peak) * 100,
    };
  });
}

function barsFor(
  times: readonly string[],
  dailyReturn = 0.001,
): MarketBar[] {
  let close = 10_000;
  return times.map((time, index) => {
    const open = close;
    if (index > 0) close *= 1 + dailyReturn;
    return {
      time,
      timestamp: Date.parse(`${time}T00:00:00Z`),
      open,
      high: Math.max(open, close) * 1.002,
      low: Math.min(open, close) * 0.998,
      close,
      volume: 1_000,
      amount: 0,
      amplitude: 0,
      changePercent: index > 0 ? dailyReturn * 100 : 0,
      change: close - open,
      turnoverRate: 0,
    };
  });
}

function singleResult(
  strategyId: StrategyId,
  score: number,
  equity: EquityPoint[],
  executionTimes: readonly [string, string],
): BacktestResult {
  return {
    strategyId,
    parameters: { period: 10 },
    totalReturn: score,
    annualizedReturn: score / 2,
    benchmarkReturn: 20,
    maxDrawdown: -10,
    sharpe: 1.5,
    tradeCount: 2,
    finalEquity: equity.at(-1)?.equity ?? 100_000,
    score,
    equity,
    winRate: 50,
    profitFactor: 1.5,
    trades: [
      {
        entryTime: executionTimes[0],
        exitTime: executionTimes[1],
        entryPrice: 100,
        exitPrice: 110,
        returnPercent: 10,
        exitReason: "strategy",
      },
    ],
  };
}

function combinationResult(
  strategyAId: StrategyId,
  strategyBId: StrategyId,
  score: number,
  equity: EquityPoint[],
  executionTimes: readonly [string, string],
): StrategyCombinationResult {
  const rebalances: AllocationRebalance[] = [
    {
      time: executionTimes[0],
      fromAllocation: 0,
      targetAllocation: 0.6,
      fillPrice: 100,
      reason: "strategy",
    },
    {
      time: executionTimes[1],
      fromAllocation: 0.6,
      targetAllocation: 0,
      fillPrice: 110,
      reason: "strategy",
    },
  ];
  return {
    strategyAId,
    strategyAParameters: { period: 10 },
    strategyBId,
    strategyBParameters: { period: 20 },
    strategyAAllocation: 0.6,
    strategyBAllocation: 0.4,
    relativeLongStrategy: "strategyA",
    totalReturn: score,
    annualizedReturn: score / 2,
    benchmarkReturn: 20,
    maxDrawdown: -11,
    sharpe: 1.4,
    tradeCount: 2,
    finalEquity: equity.at(-1)?.equity ?? 100_000,
    score,
    equity,
    rebalances,
  };
}

test("strategy shortlist keeps the best candidate primary and favors independent deputies", () => {
  const time = dates(80);
  const reviewExecutions = [time[55], time[68]] as const;
  const mainEquity = equityFromReturns(time, (index) =>
    index % 2 === 0 ? 0.006 : -0.001,
  );
  const duplicateEquity = equityFromReturns(time, (index) =>
    index % 2 === 0 ? 0.0058 : -0.0009,
  );
  const channelEquity = equityFromReturns(time, (index) =>
    index % 3 === 0 ? 0.006 : 0.0002,
  );
  const independentCombinationEquity = equityFromReturns(time, (index) =>
    index % 5 === 0 ? -0.002 : 0.002,
  );
  const main = singleResult(
    "tv-bar-up-down",
    100,
    mainEquity,
    reviewExecutions,
  );
  const channel = singleResult(
    "tv-channel-breakout",
    96,
    channelEquity,
    reviewExecutions,
  );
  const duplicate = combinationResult(
    "tv-bar-up-down",
    "tv-bollinger-bands",
    99,
    duplicateEquity,
    reviewExecutions,
  );
  const independentCombination = combinationResult(
    "tv-volty-expan-close",
    "tv-inside-bar",
    94,
    independentCombinationEquity,
    reviewExecutions,
  );

  const shortlist = selectStrategyShortlist(
    [main, channel],
    [duplicate, independentCombination],
    barsFor(time),
    { objective: "balanced" },
  );

  assert.equal(shortlist.length, 3);
  assert.equal(shortlist[0].role, "primary");
  assert.equal(shortlist[0].kind, "single");
  assert.equal(shortlist[0].result.strategyId, "tv-bar-up-down");
  assert.deepEqual(
    shortlist.slice(1).map((entry) => entry.role),
    ["secondary", "secondary"],
  );
  assert.deepEqual(
    shortlist.slice(1).map((entry) => entry.key).sort(),
    [
      "combination:tv-volty-expan-close:period:10:tv-inside-bar:period:20:0.6:0.4",
      "single:tv-channel-breakout:period:10",
    ].sort(),
  );
  assert.ok(
    shortlist
      .slice(1)
      .every(
        (entry) =>
          entry.similarity === "low" && !entry.sharesStrategyComponent,
      ),
  );
});

test("strategy shortlist honors an external multi-period selection score", () => {
  const time = dates(80);
  const reviewExecutions = [time[55], time[68]] as const;
  const highHistoricalScore = singleResult(
    "tv-bar-up-down",
    100,
    equityFromReturns(time, () => 0.001),
    reviewExecutions,
  );
  const highMultiPeriodScore = singleResult(
    "tv-channel-breakout",
    80,
    equityFromReturns(time, (index) =>
      index % 3 === 0 ? 0.003 : 0.0002,
    ),
    reviewExecutions,
  );

  const shortlist = selectStrategyShortlist(
    [highHistoricalScore, highMultiPeriodScore],
    [],
    barsFor(time),
    {
      objective: "balanced",
      size: 1,
      selectionScore: (result) =>
        "strategyId" in result &&
        result.strategyId === "tv-channel-breakout"
          ? 90
          : 10,
    },
  );

  assert.equal(shortlist[0].kind, "single");
  assert.equal(
    shortlist[0].result.strategyId,
    "tv-channel-breakout",
  );
  assert.equal(shortlist[0].objectiveValue, 90);
});

test("strategy shortlist labels high-overlap candidates as alternatives instead of deputies", () => {
  const time = dates(80);
  const reviewExecutions = [time[55], time[68]] as const;
  const mainEquity = equityFromReturns(time, (index) =>
    index % 2 === 0 ? 0.006 : -0.001,
  );
  const main = singleResult(
    "tv-bar-up-down",
    100,
    mainEquity,
    reviewExecutions,
  );
  const sharedComponent = combinationResult(
    "tv-bar-up-down",
    "tv-bollinger-bands",
    99,
    mainEquity,
    reviewExecutions,
  );
  const correlated = singleResult(
    "tv-channel-breakout",
    98,
    mainEquity,
    reviewExecutions,
  );

  const shortlist = selectStrategyShortlist(
    [main, correlated],
    [sharedComponent],
    barsFor(time),
    { objective: "balanced" },
  );

  assert.equal(shortlist.length, 3);
  assert.deepEqual(
    shortlist.map((entry) => entry.role),
    ["primary", "alternative", "alternative"],
  );
  assert.ok(
    shortlist
      .slice(1)
      .every((entry) => entry.similarity === "high"),
  );
  assert.equal(
    shortlist.filter((entry) => entry.role === "secondary").length,
    0,
  );
});

test("equity return correlation aligns observations by date", () => {
  const time = dates(20);
  const left = singleResult(
    "tv-bar-up-down",
    10,
    equityFromReturns(time, (index) => (index % 2 === 0 ? 0.01 : -0.005)),
    [time[5], time[10]],
  );
  const right = singleResult(
    "tv-channel-breakout",
    9,
    equityFromReturns(time, (index) => (index % 2 === 0 ? 0.02 : -0.01)),
    [time[5], time[10]],
  );

  assert.ok((equityReturnCorrelation(left, right) ?? 0) > 0.999);
});

test("recent effectiveness review mirrors the favorable and review-required monitoring gates", () => {
  const time = dates(80);
  const bars = barsFor(time, 0.001);
  const executions = [time[55], time[68]] as const;
  const favorable = singleResult(
    "tv-bar-up-down",
    20,
    equityFromReturns(time, () => 0.003),
    executions,
  );
  const weak = singleResult(
    "tv-channel-breakout",
    10,
    equityFromReturns(time, () => -0.002),
    executions,
  );

  const favorableReview = evaluateRecentStrategyEffectiveness(favorable, bars);
  const weakReview = evaluateRecentStrategyEffectiveness(weak, bars);

  assert.equal(favorableReview.status, "favorable");
  assert.ok((favorableReview.recentExcessReturn ?? 0) > 0);
  assert.equal(weakReview.status, "review");
  assert.ok((weakReview.confirmationExcessReturn ?? 0) < 0);
});

test("recent effectiveness review reports insufficient evidence without two recent executions", () => {
  const time = dates(80);
  const result = singleResult(
    "tv-bar-up-down",
    20,
    equityFromReturns(time, () => 0.003),
    [time[5], time[10]],
  );

  const review = evaluateRecentStrategyEffectiveness(
    result,
    barsFor(time, 0.001),
  );

  assert.equal(review.status, "insufficient");
  assert.equal(review.executionCount, 0);
});
