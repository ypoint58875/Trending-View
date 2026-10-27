import assert from "node:assert/strict";
import { test } from "node:test";
import { Features } from "./analyze";
import { TurnAccount } from "./wma-turn-study";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
const signal = (direction: "increase" | "reduce"): StrategyCycleRecentSignal => ({ direction, targetAllocation: direction === "increase" ? 1 : 0, signals: [] });
const features = (emaSigns = [-1, 1, 1, 1], wmaSigns = [-1, -1, 0, 1]) => ({ get(type: string) {
  const sign = type === "EMA" ? emaSigns : wmaSigns;
  return { sign, slope: sign.map(() => 0), turns: sign.map((s, i) => i > 0 && s > 0 && sign[i - 1]! <= 0) };
} }) as unknown as Features;
test("blocked EMA intent waits through zero WMA slope then fills once", () => {
  const account = new TurnAccount("delayed-ema"), f = features();
  assert.equal(account.step(1, [signal("increase")], f).pendingEntry, true);
  assert.equal(account.step(2, [], f).target, 0);
  assert.equal(account.step(3, [], f).extraEntry, true);
  assert.equal(account.pendingEntry, false);
  assert.equal(account.step(3, [], f).extraEntry, false);
});
test("EMA reversal and original reductions cancel delayed entry", () => {
  for (const cancel of ["ema", "sell"] as const) {
    const account = new TurnAccount("delayed-ema"), f = features(cancel === "ema" ? [-1, 1, -1, -1] : undefined);
    account.step(1, [], f);
    assert.equal(account.step(2, cancel === "sell" ? [signal("reduce")] : [], f).pendingEntry, false);
    assert.equal(account.step(3, [], f).target, 0);
  }
});
test("independent WMA turn can enter without an EMA turn and respects original signals", () => {
  const f = features([-1, -1, -1, -1]);
  assert.equal(new TurnAccount("wma-turn").step(3, [], f).target, 1);
  assert.equal(new TurnAccount("delayed-ema").step(3, [], f).target, 0);
  assert.equal(new TurnAccount("wma-turn").step(3, [signal("reduce")], f).target, 0);
  const held = new TurnAccount("wma-turn"); held.account.allocation = 0.3;
  assert.equal(held.step(3, [], f).target, 0.3);
});
