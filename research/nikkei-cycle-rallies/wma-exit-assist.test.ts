import assert from "node:assert/strict";
import { test } from "node:test";
import { exitAssistTargets } from "./wma-exit-assist";
import type { MarketBar } from "../../lib/market/types";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
const source = () => [...Array(20).fill(100), 120, 121, 119, 119, 119, 118].map((close, i) => ({ close, time: String(i) }) as MarketBar);
const signal = (direction: "increase" | "reduce", targetAllocation: number): StrategyCycleRecentSignal[] => [{ direction, targetAllocation, signals: [] }];
test("WMA nonpositive releases an existing pending sell despite positive SMA11 protection", () => {
  const bars = source(), decisions = new Map([[20, signal("increase", 1)], [21, signal("reduce", 0.3)]]);
  assert.equal(exitAssistTargets(bars, decisions, 20, "current").target[23], 1);
  assert.equal(exitAssistTargets(bars, decisions, 20, "release-pending").target[23], 0.3);
});
test("pending-only mode never invents a sell, while forced mode clears without an original sell", () => {
  const bars = source(), decisions = new Map([[20, signal("increase", 1)]]);
  assert.equal(exitAssistTargets(bars, decisions, 20, "release-pending").target[23], 1);
  assert.equal(exitAssistTargets(bars, decisions, 20, "force-clear").target[23], 0);
});
test("exit assist is prefix causal for both entry policies and every mode", () => {
  const bars = source(), decisions = new Map([[20, signal("increase", 1)], [21, signal("reduce", 0)]]);
  for (const mode of ["current", "release-pending", "force-clear"] as const) for (const priority of [false, true])
    assert.deepEqual(exitAssistTargets(bars, decisions, 20, mode, priority).target.slice(0, 24), exitAssistTargets(bars.slice(0, 24), decisions, 20, mode, priority).target);
});
