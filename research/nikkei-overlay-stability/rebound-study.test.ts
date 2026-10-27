import assert from "node:assert/strict";
import { test } from "node:test";
import { Account, Features, current } from "./analyze";
import { reboundFromFiveOpen, stepWithRebound } from "./rebound-study";
import type { MarketBar } from "../../lib/market/types";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";

test("rebound uses exactly the five latest opens, includes today, and excludes future bars", () => {
  const bars = [1, 10, 9, 8, 7, 6, 0.1].map(open => ({ open, close: 12 }));
  assert.equal(reboundFromFiveOpen(bars, 3), null);
  assert.equal(reboundFromFiveOpen(bars, 4), 11);
  assert.equal(reboundFromFiveOpen(bars, 5), 1);
  assert.equal(reboundFromFiveOpen(bars.slice(0, 6), 5), 1);
});
const bars = Array.from({ length: 50 }, (_, n) => ({ open: 100 + n, close: 100 + n })) as MarketBar[];
const features = new Features(bars);
const signal: StrategyCycleRecentSignal = { direction: "reduce", targetAllocation: 0, signals: ["long-exit"] };
test("inclusive rebound threshold enters even without a fresh EMA turn; OR leaves EMA entry intact", () => {
  assert.equal(features.get("EMA", 7).turns[25], false);
  const p = { ...current, flags: 1 }, below = new Account(), exact = new Account();
  assert.equal(stepWithRebound(below, 25, [], p, features, 0.029, 0.03).target, 0);
  assert.equal(stepWithRebound(exact, 25, [], p, features, 0.03, 0.03).target, 1);
  const turning = { get: () => ({ sign: [1], slope: [0], turns: [true] }) } as unknown as Features;
  assert.equal(stepWithRebound(new Account(), 0, [], p, turning, 0, 0.03).target, 1);
});
test("rebound respects original signals, WMA gate, flat-only entries and disabled supplementation", () => {
  assert.equal(stepWithRebound(new Account(), 25, [signal], current, features, 0.1, 0.03).target, 0);
  const falling = new Features(bars.map(b => ({ ...b, close: 300 - b.close })));
  assert.equal(stepWithRebound(new Account(), 25, [], current, falling, 0.1, 0.03).target, 0);
  const partial = new Account(); partial.allocation = 0.5;
  assert.equal(stepWithRebound(partial, 25, [], current, features, 0.1, 0.03).target, 0.5);
  assert.equal(stepWithRebound(new Account(), 25, [], { ...current, flags: 0 }, features, 0.1, 0.03).target, 0);
});
test("rebound does not cancel an inherited guarded reduction or change baseline with trigger disabled", () => {
  const held = new Account(); held.allocation = 1; held.pending = 0.2;
  stepWithRebound(held, 25, [], current, features, 0.1, 0.03);
  assert.equal(held.allocation, 1); assert.equal(held.pending, 0.2);
  const first = new Account(), second = new Account();
  for (let i = 16; i < bars.length; i++) assert.equal(stepWithRebound(first, i, [], current, features, 1, null).target,
    second.step(i, [], current, features));
});
