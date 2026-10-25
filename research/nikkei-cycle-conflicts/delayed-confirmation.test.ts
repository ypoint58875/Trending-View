import assert from "node:assert/strict";
import test from "node:test";
import { delayedDecision, eventPolicyReturn, recentSignalsFromTargets } from "./delayed-confirmation";
import type { MarketBar } from "../../lib/market/types";

const increase = { direction: "increase" as const, targetAllocation: 1, signals: [] };
const reduce = { direction: "reduce" as const, targetAllocation: 0, signals: [] };

test("only conflicts activate a one-day wait and third-bar confirmation", () => {
  const signals = { two: [reduce], three: [reduce, increase] };
  assert.deepEqual(delayedDecision(0.5, false, false, signals, 3), { allocation: 0, pending: false });
  assert.deepEqual(delayedDecision(0.5, true, false, signals, 3), { allocation: 0.5, pending: true });
  assert.deepEqual(delayedDecision(0.5, false, true, signals, 3), { allocation: 0.5, pending: false });
  assert.deepEqual(delayedDecision(0.5, true, true, { two: [reduce], three: [increase, reduce] }, 3),
    { allocation: 0, pending: false });
  assert.deepEqual(delayedDecision(0.5, false, true, signals, 2), { allocation: 0, pending: false });
});

test("three bars are anchored at the next decision and ignore future targets", () => {
  const target = [0, 1, 1, 1, 0, 1];
  assert.deepEqual(recentSignalsFromTargets(target, [], 3, 2), []);
  assert.deepEqual(recentSignalsFromTargets(target, [], 3, 3), [increase]);
  const changedFuture = [0, 1, 1, 1, 1, 0];
  assert.deepEqual(recentSignalsFromTargets(changedFuture, [], 3, 3), [increase]);
});

test("delayed entry misses the first day's move and pays costs only on its actual fill", () => {
  const prices = [100, 100, 100, 120, 132];
  const bars = prices.map((price, index) => ({ time: `2025-01-0${index + 1}`,
    timestamp: Date.UTC(2025, 0, index + 1), open: price, high: price, low: price,
    close: price, volume: 0, amount: 0, amplitude: 0, changePercent: 0, change: 0, turnoverRate: 0,
  })) satisfies MarketBar[];
  assert.ok(Math.abs(eventPolicyReturn(bars, 2, 1, 0, 1, false, 0) - 20) < 1e-9);
  assert.equal(eventPolicyReturn(bars, 2, 1, 0, 1, true, 0), 0);
  assert.ok(Math.abs(eventPolicyReturn(bars, 2, 2, 0, 1, true, 0) - 10) < 1e-9);
  assert.ok(eventPolicyReturn(bars, 2, 1, 0, 1, true, 0.0005) < 0);
  assert.equal(eventPolicyReturn(bars, 2, 1, 0, 0, true, 0.0005), 0);
  assert.throws(() => eventPolicyReturn(bars, 2, 3, 0, 1, true, 0));
});
