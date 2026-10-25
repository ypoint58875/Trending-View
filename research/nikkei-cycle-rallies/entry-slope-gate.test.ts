import assert from "node:assert/strict";
import { test } from "node:test";
import { nonnegativeSmaSlope, entryGatedTargets } from "./entry-slope-gate";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";
const signal = (direction: "increase" | "reduce", targetAllocation: number): StrategyCycleRecentSignal[] => [{ direction, targetAllocation, signals: [] }];
const bars = (closes: number[]) => closes.map(close => ({ close }) as MarketBar);
test("nonnegative gate permits equality and preserves prefix decisions", () => {
  assert.deepEqual(nonnegativeSmaSlope([10, 9, 10, 8], 2), [false, false, true, false]);
  const values = Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i / 3));
  for (let p = 3; p <= 12; p++) assert.deepEqual(nonnegativeSmaSlope(values, p).slice(0, 50), nonnegativeSmaSlope(values.slice(0, 50), p));
});
test("a rejected flat entry is not retried without another signal", () => {
  const source = bars([10, 9, 8, 7, 10, 11]);
  const result = entryGatedTargets(source, new Map([[3, signal("increase", 1)]]), 3, {}, 3);
  assert.deepEqual(result.target, [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(result.blocked, [{ index: 3, kind: "original" }]);
});
test("gate does not block increases to existing positions or original exits", () => {
  const source = bars([10, 10, 10, 11, 9, 8, 7]);
  const result = entryGatedTargets(source, new Map([[3, signal("increase", 0.3)], [4, signal("increase", 1)], [5, signal("reduce", 0)]]), 3, {}, 3);
  assert.deepEqual(result.target, [0, 0, 0, 0.3, 1, 0, 0]);
});
test("gate also blocks a supplement while leaving its next-day account empty", () => {
  const source = bars([...Array(12).fill(100), 90, 95, 101, 102]);
  source[11]!.close = 120;
  const filtered = entryGatedTargets(source, new Map(), 12, { supplementalEntry: true }, 3);
  const control = entryGatedTargets(source, new Map(), 12, { supplementalEntry: true }, null);
  assert.equal(control.target[14], 1);
  assert.equal(filtered.target[14], 0);
  assert.equal(filtered.target[15], 0);
  assert.deepEqual(filtered.blocked, [{ index: 14, kind: "supplemental" }]);
});
test("full account remains causal and a rejected original signal blocks same-day supplementation", () => {
  const source = bars([...Array(12).fill(100), 90, 95, 101, 102]);
  source[11]!.close = 120;
  const decisions = new Map([[14, signal("increase", 1)]]);
  const options = { supplementalEntry: true, exitGuard: true };
  const result = entryGatedTargets(source, decisions, 12, options, 3);
  assert.deepEqual(result.blocked, [{ index: 14, kind: "original" }]);
  assert.equal(result.target[14], 0);
  assert.deepEqual(result.target.slice(0, 15), entryGatedTargets(source.slice(0, 15), decisions, 12, options, 3).target);
});
