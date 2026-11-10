import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { SmaPositionOverlay, BIAS_ADD_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS, RSI_SHAPE_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import { runAllocationBacktest, type BacktestSettings } from "../../lib/analysis/backtest";
import { buildStrategyCycleRollingReport, runStrategyCycleCloseBacktest, strategyCycleSignalDirection,
  type StrategyCycleRecentSignal, type StrategyCycleSelectionSnapshot } from "../../lib/analysis/strategy-cycle-validation";
import { NextSessionFeatures } from "./adoption-check";
import { Features, policies, replay } from "./model";
import type { MarketBar } from "../../lib/market/types";

function load(name: string) {
  const path = new URL(`../nikkei-overlay-stability/data/full-screen-6-15/${name}`, import.meta.url);
  assert.ok(statSync(path).size <= 16 * 1024 ** 2); return JSON.parse(readFileSync(path, "utf8"));
}
const input = load("input.json") as { bars: MarketBar[]; settings: BacktestSettings; snapshots: StrategyCycleSelectionSnapshot[] };
const saved = load("signals.json") as { rows: { index: number; signals: StrategyCycleRecentSignal[] }[] };
const decisions = new Map(saved.rows.map((row) => [row.index, row.signals])), start = input.bars.length - 2000;
const policy = policies().find((item) => item.id === "20-smooth-bias-down-D3-add")!;
function native(lag: 0 | 1, end = input.bars.length, resume?: ReturnType<SmaPositionOverlay["checkpoint"]>, from = start) {
  const controller = new SmaPositionOverlay(input.bars, DEFAULT_POSITION_OVERLAY_OPTIONS, 0, lag), targets = input.bars.map(() => 0);
  if (resume) controller.restore(resume);
  for (let i = from; i < end; i++) {
    const orders = decisions.get(i) ?? [], direction = strategyCycleSignalDirection(orders);
    if (direction) controller.request(direction, orders.at(-1)!.targetAllocation, i);
    targets[i] = controller.close(i, orders.length > 0);
  }
  return { targets, state: controller.checkpoint() };
}
test("adopted v9 matches the researched ordinary next-open target path without an extra lag", () => {
  const reference = replay(new Features(input.bars), decisions, start, policy), current = native(0);
  assert.deepEqual(current.targets, reference.targets); assert.deepEqual(current.state, reference.cursor.state);
  const next = runAllocationBacktest(input.bars, current.targets, { ...input.settings, positionOverlay: undefined, executionPolicy: "next-open" });
  assert.ok(Math.abs(next.totalReturn - 473.3788381599507) < 1e-8);
});
test("adopted v9 cycle keeps close execution and applies the prior-session restriction exactly", () => {
  const reference = replay(new NextSessionFeatures(input.bars), decisions, start, policy), current = native(1);
  assert.deepEqual(current.targets, reference.targets); assert.deepEqual(current.state, reference.cursor.state);
  const expected = runStrategyCycleCloseBacktest(input.bars, current.targets, input.settings);
  assert.ok(Math.abs(expected.totalReturn - 445.34209325762885) < 1e-8);
  const report = buildStrategyCycleRollingReport(input.bars, input.snapshots, 2000, 10,
    { ...input.settings, interval: "1d", positionOverlay: DEFAULT_POSITION_OVERLAY_OPTIONS });
  assert.ok(Math.abs(report.updateReturn - expected.totalReturn) < 1e-8);
  assert.equal(report.newOnConflictReturn, report.updateReturn);
});
test("v9 resumes serialized rule state and archived v8 retains the original baseline", () => {
  const end = start + 1000, partial = native(1, end), continuation = native(1, input.bars.length, JSON.parse(JSON.stringify(partial.state)), end);
  assert.deepEqual([...partial.targets.slice(0, end), ...continuation.targets.slice(end)], native(1).targets);
  assert.deepEqual(continuation.state, native(1).state);
  const controller = new SmaPositionOverlay(input.bars, RSI_SHAPE_POSITION_OVERLAY_OPTIONS), targets = input.bars.map(() => 0);
  for (let i = start; i < input.bars.length; i++) {
    const orders = decisions.get(i) ?? [], direction = strategyCycleSignalDirection(orders);
    if (direction) controller.request(direction, orders.at(-1)!.targetAllocation, i);
    targets[i] = controller.close(i, orders.length > 0);
  }
  assert.equal(runStrategyCycleCloseBacktest(input.bars, targets, input.settings).totalReturn, 440.9807031454993);
});
