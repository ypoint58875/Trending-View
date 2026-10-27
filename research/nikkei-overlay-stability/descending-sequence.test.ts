import assert from "node:assert/strict";
import test from "node:test";
import { strictlyDescending, ShapeContext, shapeReplay, shapeBaseline } from "./shape-priority";
import { descendingSequenceMenu, sequenceFields } from "./descending-sequence";
import type { MarketBar } from "../../lib/market/types";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";

test("3..6 observations require N-1 strict declines, not N declines", () => {
  for (const sessions of [3, 4, 5, 6]) {
    const values = Array.from({ length: sessions }, (_, index) => 10 - index);
    assert.equal(strictlyDescending(values, sessions - 1, sessions), true);
    assert.equal(strictlyDescending(values, sessions - 2, sessions), false);
    const equal = [...values]; equal[sessions - 1] = equal[sessions - 2]!;
    assert.equal(strictlyDescending(equal, sessions - 1, sessions), false);
    const rising = [...values]; rising[sessions - 1] = rising[sessions - 2]! + 1;
    assert.equal(strictlyDescending(rising, sessions - 1, sessions), false);
  }
  assert.equal(strictlyDescending([4, 3, NaN], 2, 3), false);
  assert.equal(strictlyDescending([4, 3, 2], 2, 2), false);
  assert.equal(strictlyDescending([4, 3, 2], 3, 3), false);
});
test("193 unique policies cover the OHLC, duration, priority and RSI product", () => {
  const menu = descendingSequenceMenu();
  assert.equal(menu.length, 193);
  assert.equal(new Set(menu.map((policy) => policy.id)).size, menu.length);
  for (const field of sequenceFields) for (const sessions of [3, 4, 5, 6])
    assert.equal(menu.filter((policy) => policy.descending?.field === field && policy.descending.sessions === sessions).length, 12);
});
test("each OHLC field drives the added exit independently while native rules remain present", () => {
  for (const field of sequenceFields) {
    const bars: MarketBar[] = Array.from({ length: 50 }, (_, index) => ({
      time: String(index), timestamp: index, open: 100 + index, close: 100 + index,
      high: 102 + index, low: 98 + index, volume: 1000, amount: 100_000,
      change: 1, changePercent: 1, amplitude: 2, turnoverRate: 0,
    }));
    for (let index = 46; index < 50; index += 1) bars[index]![field] = 196 - index;
    const decisions = new Map<number, StrategyCycleRecentSignal[]>([
      [40, [{ direction: "increase", targetAllocation: 1, signals: ["long-entry"] }]],
    ]);
    const context = new ShapeContext(bars);
    const policy = { ...shapeBaseline, descending: { field, sessions: 4 } };
    const sequence = shapeReplay(context, decisions, 35, policy);
    const baseline = shapeReplay(context, decisions, 35, shapeBaseline);
    assert.deepEqual(sequence.targets.slice(0, 49), baseline.targets.slice(0, 49));
    assert.equal(sequence.targets[49], 0, field);
    assert.equal(baseline.targets[49], 1, field);
    assert.deepEqual(shapeReplay(new ShapeContext(bars.slice(0, 49)), decisions, 35, policy).targets, sequence.targets.slice(0, 49));
  }
});
