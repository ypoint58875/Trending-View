import assert from "node:assert/strict";
import { test } from "node:test";
import { addGatedTargets } from "./wma-add-gate";
import type { MarketBar } from "../../lib/market/types";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
const signal = (direction: "increase" | "reduce", targetAllocation: number): StrategyCycleRecentSignal[] => [{ direction, targetAllocation, signals: [] }];
const bars = (values: number[]) => values.map((close, i) => ({ close, time: String(i) }) as MarketBar);

test("negative WMA blocks an add while retaining the partial position and allowing exits", () => {
  const source = bars([...Array(20).fill(100), 90, 95]);
  const decisions = new Map([[18, signal("increase", 0.3)], [20, signal("increase", 1)], [21, signal("reduce", 0)]]);
  const control = addGatedTargets(source, decisions, 18, false), gated = addGatedTargets(source, decisions, 18, true);
  assert.equal(control.target[20], 1);
  assert.equal(gated.target[20], 0.3);
  assert.equal(gated.target[21], 0);
  assert.equal(gated.blocked.length, 1);
});
test("zero WMA permits adds and a rejected add does not become a queued buy", () => {
  const source = bars([...Array(20).fill(100), 90, 95, 101, 102]);
  const decisions = new Map([[18, signal("increase", 0.3)], [19, signal("increase", 0.6)], [20, signal("increase", 1)]]);
  const replay = addGatedTargets(source, decisions, 18, true);
  assert.equal(replay.target[19], 0.6);
  assert.equal(replay.target[20], 0.6);
  assert.equal(replay.target[23], 0.6);
});
test("add gate preserves past decisions when unseen future data change", () => {
  const source = bars(Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i / 3) * 5));
  const decisions = new Map<number, StrategyCycleRecentSignal[]>();
  for (let i = 20; i < 100; i += 3) decisions.set(i, signal(i % 2 ? "reduce" : "increase", i % 2 ? 0.3 : 1));
  assert.deepEqual(addGatedTargets(source, decisions, 20, true).target.slice(0, 60), addGatedTargets(source.slice(0, 60), decisions, 20, true).target);
});
