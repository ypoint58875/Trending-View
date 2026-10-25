import assert from "node:assert/strict";
import { test } from "node:test";
import { guardSeries, guardedTargets } from "./exit-guard";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
const signal = (direction: "increase" | "reduce", targetAllocation: number): StrategyCycleRecentSignal[] => [{ direction, targetAllocation, signals: [] }];
test("deferred exits execute on a later skipped screening date when protection fails", () => {
  const decisions = new Map([[1, signal("increase", 1)], [2, signal("reduce", 0)]]);
  const result = guardedTargets([10, 10, 10, 10, 10], decisions, 1, [false, true, true, true, false]);
  assert.deepEqual(result.target, [0, 1, 1, 1, 0]);
  assert.equal(result.events.at(-1)!.kind, "released-exit");
});
test("a fresh original increase cancels an obsolete pending exit", () => {
  const decisions = new Map([[1, signal("increase", 1)], [2, signal("reduce", 0)], [3, signal("increase", 0.5)]]);
  assert.deepEqual(guardedTargets([10, 10, 10, 10, 10], decisions, 1, [false, true, true, true, false]).target, [0, 1, 1, 1, 1]);
});
test("guard does not open a flat account or force an unsolicited exit", () => {
  assert.deepEqual(guardedTargets([10, 10, 10], new Map(), 0, [true, true, true]).target, [0, 0, 0]);
  assert.deepEqual(guardedTargets([10, 10, 10], new Map([[0, signal("increase", 1)]]), 0, [false, false, false]).target, [1, 1, 1]);
});
test("partial reductions keep their target and supplemental scope excludes original entries", () => {
  const decisions = new Map([[0, signal("increase", 1)], [1, signal("reduce", 0.3)]]);
  assert.deepEqual(guardedTargets([10, 10, 10], decisions, 0, [true, true, false]).target, [1, 1, 0.3]);
  assert.deepEqual(guardedTargets([10, 10, 10], decisions, 0, [true, true, false], { scope: "supplemental" }).target, [1, 0.3, 0.3]);
});
test("guard series and account decisions are invariant to future data", () => {
  const closes = Array.from({ length: 150 }, (_, i) => 100 + i / 10 + Math.sin(i / 3));
  const rule = { id: "test", period: 20, kind: "both" as const, threshold: 0 };
  const decisions = new Map([[40, signal("increase", 1)], [60, signal("reduce", 0)], [110, signal("increase", 1)]]);
  const protection = guardSeries(closes, rule);
  assert.deepEqual(protection.slice(0, 90), guardSeries(closes.slice(0, 90), rule));
  assert.deepEqual(guardedTargets(closes, decisions, 30, protection).target.slice(0, 90),
    guardedTargets(closes.slice(0, 90), decisions, 30, protection.slice(0, 90)).target);
  assert.ok(protection.slice(0, 20).every(v => !v));
});
test("hysteresis preserves weak positive slopes and two-bar release requires two weak closes", () => {
  const closes = [100, 101, 103, 104, 104.2, 104.3, 104.4, 103, 100];
  const base = { id: "test", period: 2, kind: "slope" as const, threshold: 0.005 };
  const plain = guardSeries(closes, base);
  const hysteresis = guardSeries(closes, { ...base, releaseThreshold: 0 });
  const delayed = guardSeries(closes, { ...base, weakBars: 2 });
  assert.equal(plain[5], false); assert.equal(hysteresis[5], true);
  assert.equal(delayed[5], true); assert.equal(delayed[6], false);
  assert.equal(hysteresis[7], false);
  for (const rule of [{ ...base, releaseThreshold: 0 }, { ...base, weakBars: 2 }]) {
    assert.deepEqual(guardSeries(closes, rule).slice(0, 6), guardSeries(closes.slice(0, 6), rule));
  }
});
