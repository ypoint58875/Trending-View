import assert from "node:assert/strict";
import test from "node:test";
import { SmaPositionOverlay, normalizeSmaPositionOverlay } from "../lib/analysis/sma-position-overlay";
import { runAllocationBacktest, runBacktestFromTarget, type BacktestSettings } from "../lib/analysis/backtest";
import { buildStrategyCycleRollingReport, buildStrategyCycleRollingSchedule } from "../lib/analysis/strategy-cycle-validation";
import { singleScreeningResultPlan } from "../lib/analysis/screening-plan";
import { parseStrategyAllocationPlan, strategyPlansEqual } from "../lib/analysis/saved-backtests";
import { buildCheckpointIdentity } from "../lib/analysis/screening-worker-client";
import type { MarketBar } from "../lib/market/types";

function barsFrom(closes: number[]): MarketBar[] {
  return closes.map((close, index) => ({ time: new Date(Date.UTC(2024, 0, index + 1)).toISOString().slice(0, 10),
    timestamp: Date.UTC(2024, 0, index + 1), open: close, high: close + 1, low: close - 1, close,
    volume: 1000, amount: close * 1000, amplitude: 2, changePercent: 0, change: 0, turnoverRate: 1 }));
}
const settings: BacktestSettings = { initialCash: 100000, commissionRate: 0.0003, slippageRate: 0.0002, interval: "1d", executionPolicy: "next-open" };
const entryBars = () => barsFrom([...Array(12).fill(100), 90, 95, 101, 102, 103]);

const screeningIdentity = (instrumentKey: string, sessions: number, config: Parameters<typeof buildCheckpointIdentity>[1], objective: "totalReturn") =>
  buildCheckpointIdentity([], config, { mode: "sample", periods: [{ sessions, weight: 100 }] }, { objective, checkpointNamespace: instrumentKey }).signature;

test("independent supplemental entry is an SMA12 turn and executes no earlier than next open", () => {
  const bars = entryBars(), target = bars.map(() => 0);
  const off = runAllocationBacktest(bars, target, settings);
  const result = runAllocationBacktest(bars, target, { ...settings, positionOverlay: { supplementalEntry: true } });
  assert.equal(off.rebalances.length, 0);
  assert.equal(result.rebalances.length, 1);
  assert.equal(result.rebalances[0]!.time, bars[15]!.time);
  assert.equal(result.rebalances[0]!.targetAllocation, 1);
  const single = runBacktestFromTarget(bars, "sma-cross", { fast: 2, slow: 3 }, target, { ...settings, positionOverlay: { supplementalEntry: true } });
  assert.equal(single.openPosition!.entryTime, bars[15]!.time);
  assert.ok(Math.abs(single.totalReturn - result.totalReturn) < 1e-9);
  assert.equal(normalizeSmaPositionOverlay({ supplementalEntry: false, exitGuard: false }), undefined);
});

test("exit-only protection defers requests until slope weakens and a new increase cancels stale sells", () => {
  const bars = barsFrom([...Array(12).fill(100), 120, 121, 90, 90]);
  const overlay = new SmaPositionOverlay(bars, { exitGuard: true });
  assert.equal(overlay.request("increase", 1, 12), 1);
  assert.equal(overlay.request("reduce", 0, 13), 1);
  assert.equal(overlay.close(14, false), 0);
  const fresh = new SmaPositionOverlay(bars, { exitGuard: true }, 1);
  fresh.request("reduce", 0, 13); fresh.request("increase", 0.3, 13);
  assert.equal(fresh.close(14, false), 1);
  assert.equal(new SmaPositionOverlay(entryBars(), { exitGuard: true }).close(14, false), 0);
});

test("original signals block supplemental entry and protection preserves partial reduction targets", () => {
  const bars = entryBars();
  const overlay = new SmaPositionOverlay(bars, { supplementalEntry: true });
  overlay.request("reduce", 0, 14);
  assert.equal(overlay.close(14, true), 0);
  assert.equal(overlay.close(15, false), 0);
  const riskBars = barsFrom([...Array(12).fill(100), 120, 121, 90, 90]);
  const partial = new SmaPositionOverlay(riskBars, { exitGuard: true }, 1);
  assert.equal(partial.request("reduce", 0.3, 13), 1);
  assert.equal(partial.close(14, false), 0.3);
});

test("allocation and single close signals agree with deferred-exit next-open timing", () => {
  const bars = barsFrom([...Array(12).fill(100), 120, 121, 90, 85, 86]);
  const target = bars.map((_, i) => i === 12 ? 1 : 0);
  const guarded = { ...settings, positionOverlay: { exitGuard: true } };
  const allocation = runAllocationBacktest(bars, target, guarded);
  const single = runBacktestFromTarget(bars, "sma-cross", { fast: 2, slow: 3 }, target, guarded);
  assert.deepEqual(allocation.rebalances.map(r => r.time), [bars[13]!.time, bars[15]!.time]);
  assert.equal(single.trades[0]!.exitTime, bars[15]!.time);
  assert.ok(Math.abs(single.totalReturn - allocation.totalReturn) < 1e-9);
});

test("hybrid order exits use the preceding completed SMA and preserve native fill prices", () => {
  const bars = barsFrom([...Array(12).fill(100), 120, 121, 90, 85]);
  const target = bars.map((_, i) => i === 12 ? 1 : 0);
  const executions = bars.map((_, i) => i === 12 ? [{ targetAllocation: 1, fillPrice: 119, signals: ["long-entry" as const] }]
    : i === 13 ? [{ targetAllocation: 0, fillPrice: 120, signals: ["long-exit" as const] }] : []);
  const result = runAllocationBacktest(bars, target, { ...settings, executionPolicy: "hybrid", positionOverlay: { exitGuard: true } }, undefined, executions);
  assert.equal(result.rebalances[0]!.fillPrice, 119 * (1 + settings.slippageRate));
  assert.equal(result.rebalances.at(-1)!.time, bars[15]!.time);
  const changed = bars.map((b, i) => i >= 14 ? { ...b, close: 500, high: 501 } : b);
  const other = runAllocationBacktest(changed, target, { ...settings, executionPolicy: "hybrid", positionOverlay: { exitGuard: true } }, undefined, executions);
  assert.deepEqual(result.rebalances.filter(r => r.time <= bars[13]!.time), other.rebalances.filter(r => r.time <= bars[13]!.time));
});

test("cycle overlay acts on skipped dates with close fills and preserves selected plans", () => {
  const bars = entryBars();
  const schedule = buildStrategyCycleRollingSchedule(bars, 5, 5)!;
  const snapshots = schedule.decisionIndexes.map(decisionIndex => ({ decisionIndex, decisionTime: bars[decisionIndex]!.time,
    screeningWindow: 5, plan: { strategyA: { strategyId: "roc-momentum" as const, parameters: { period: 2, entry: 1000, exit: -1000 } }, strategyB: null,
      strategyAAllocation: 1, strategyBAllocation: 0 }, fixedRelativeLongStrategy: null, label: "test" }));
  const original = JSON.stringify(snapshots);
  const result = buildStrategyCycleRollingReport(bars, snapshots, 5, 5, { ...settings, positionOverlay: { supplementalEntry: true, exitGuard: true } });
  assert.equal(result.rebalances[0]!.time, bars[14]!.time);
  assert.equal(result.rebalances[0]!.targetAllocation, 1);
  assert.equal(JSON.stringify(snapshots), original);
  const off = buildStrategyCycleRollingReport(bars, snapshots, 5, 5, settings);
  assert.equal(off.rebalances.length, 0);
});

test("overlay settings survive result-plan parsing and isolate screening checkpoints", () => {
  const bars = entryBars();
  const result = runBacktestFromTarget(bars, "sma-cross", { fast: 10, slow: 30 }, bars.map(() => 0), { ...settings, positionOverlay: { supplementalEntry: true } });
  const plan = singleScreeningResultPlan(result);
  const parsed = parseStrategyAllocationPlan(JSON.parse(JSON.stringify(plan)));
  assert.deepEqual(parsed!.positionOverlay, { supplementalEntry: true });
  assert.equal(strategyPlansEqual(plan, { ...plan, positionOverlay: undefined }), false);
  assert.equal(parseStrategyAllocationPlan({ ...plan, positionOverlay: { exitGuard: "yes" } }), null);
  assert.notEqual(screeningIdentity("index:N225", 10, settings, "totalReturn"),
    screeningIdentity("index:N225", 10, { ...settings, positionOverlay: { exitGuard: true } }, "totalReturn"));
});

test("SMA11 negative-slope gate is independent, allows zero and never blocks existing-position adds", () => {
  const bars = entryBars();
  const account = new SmaPositionOverlay(bars, { entrySlopeGate: true });
  assert.equal(account.request("increase", 1, 12), 0);
  assert.equal(account.close(13, false), 0);
  assert.equal(account.request("increase", 1, 14), 1);
  const equal = new SmaPositionOverlay(bars, { entrySlopeGate: true });
  assert.equal(equal.request("increase", 0.3, 11), 0.3);
  assert.equal(equal.request("increase", 1, 12), 1);
  assert.equal(equal.request("reduce", 0, 12), 0);
  assert.deepEqual(normalizeSmaPositionOverlay({ entrySlopeGate: true }), { entrySlopeGate: true });
});

test("SMA11 gate also rejects supplemental and native order entries from a flat account", () => {
  const bars = entryBars();
  bars[3]!.close = 120;
  const account = new SmaPositionOverlay(bars, { supplementalEntry: true, entrySlopeGate: true });
  assert.equal(account.close(14, false), 0);
  const orders = bars.map((_, i) => ({ entryStop: i === 14 ? bars[14]!.open : null, exitStop: null }));
  const result = runBacktestFromTarget(bars, "donchian-intrabar", { entryPeriod: 5, exitPeriod: 3 }, bars.map((_, i) => i >= 14 ? 1 : 0),
    { ...settings, executionPolicy: "hybrid", positionOverlay: { entrySlopeGate: true } }, orders);
  assert.equal(result.executedAllocation, 0);
  assert.equal(result.openPosition, null);
  const unfiltered = runBacktestFromTarget(bars, "donchian-intrabar", { entryPeriod: 5, exitPeriod: 3 }, bars.map((_, i) => i >= 14 ? 1 : 0),
    { ...settings, executionPolicy: "hybrid" }, orders);
  assert.equal(unfiltered.executedAllocation, 1);
  const allocations = runAllocationBacktest(bars, bars.map(() => 0), { ...settings, executionPolicy: "hybrid", positionOverlay: { entrySlopeGate: true } }, undefined,
    bars.map((_, i) => i === 14 ? [{ targetAllocation: 1, fillPrice: bars[14]!.open, signals: ["long-entry"] }] : []));
  assert.equal(allocations.rebalances.length, 0);
});

test("SMA11 gate survives saved-plan parsing and separates enabled cache identities", () => {
  const bars = entryBars();
  const result = runBacktestFromTarget(bars, "sma-cross", { fast: 10, slow: 30 }, bars.map(() => 0), { ...settings, positionOverlay: { entrySlopeGate: true } });
  assert.deepEqual(parseStrategyAllocationPlan(singleScreeningResultPlan(result))!.positionOverlay, { entrySlopeGate: true });
  assert.notEqual(screeningIdentity("index:N225", 10, settings, "totalReturn"),
    screeningIdentity("index:N225", 10, { ...settings, positionOverlay: { entrySlopeGate: true } }, "totalReturn"));
});
