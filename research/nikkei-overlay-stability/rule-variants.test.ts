import assert from "node:assert/strict";
import { test } from "node:test";
import { RuleAccount, rules, ruleId, baselineRule } from "./rule-variants";
import { Account, Features } from "./analyze";
import type { MarketBar } from "../../lib/market/types";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
const bars = Array.from({ length: 70 }, (_, i) => ({ open: 100 + i, close: 100 + i })) as MarketBar[];
const sell: StrategyCycleRecentSignal = { direction: "reduce", targetAllocation: 0.3, signals: ["long-exit"] };
test("declared rule menu is bounded and unique", () => { assert.equal(rules().length, 96); assert.equal(new Set(rules().map(ruleId)).size, 96); });
test("baseline equals shared account and rule paths depend only on completed prefixes", () => {
  const f = new Features(bars), baseline = new RuleAccount(bars), shared = new Account();
  for (let i = 20; i < bars.length; i++) assert.equal(baseline.step(i, [], baselineRule), shared.step(i, [], { entry: 7, exit: 11, gate: 7, threshold: 0.00075, flags: 7 }, f));
  for (const rule of rules()) {
    const full = new RuleAccount(bars), prefix = new RuleAccount(bars.slice(0, 50));
    for (let i = 20; i < 50; i++) assert.equal(full.step(i, i === 30 ? [sell] : [], rule), prefix.step(i, i === 30 ? [sell] : [], rule));
  }
});
test("supplemental holding lock releases a pending partial target at the exact age", () => {
  const f = { get: () => ({ slope: bars.map(() => 0), sign: bars.map(() => 1), turns: bars.map(() => false) }) } as unknown as Features;
  const account = new RuleAccount(bars, f), rule = { entry: "ema-positive", exit: "current", hold: 3 } as const;
  assert.equal(account.step(20, [], rule), 1);
  assert.equal(account.step(21, [sell], rule), 1);
  assert.equal(account.account.pending, 0.3);
  assert.equal(account.step(22, [], rule), 1);
  assert.equal(account.step(23, [], rule), 0.3);
});
test("trend confirmation defers actual sells and never manufactures one", () => {
  const account = new RuleAccount(bars), rule = { entry: "turn", exit: "ema-nonpositive", hold: 0 } as const;
  account.account.allocation = 1;
  assert.equal(account.step(30, [sell], rule), 1);
  assert.equal(account.account.pending, 0.3);
  const untouched = new RuleAccount(bars); untouched.account.allocation = 1;
  assert.equal(untouched.step(30, [], rule), 1); assert.equal(untouched.account.pending, null);
});
test("trend weakness releases pending sells and a fresh buy cancels the stale target", () => {
  const f = { get: () => ({ slope: bars.map(() => 0), sign: bars.map((_, i) => i < 32 ? 1 : -1), turns: bars.map(() => false) }) } as unknown as Features;
  const rule = { entry: "turn", exit: "wma-negative", hold: 0 } as const;
  const pending = new RuleAccount(bars, f); pending.account.allocation = 1;
  assert.equal(pending.step(30, [sell], rule), 1);
  assert.equal(pending.step(32, [], rule), 0.3);
  const cancelled = new RuleAccount(bars, f); cancelled.account.allocation = 1;
  cancelled.step(30, [sell], rule);
  cancelled.step(31, [{ direction: "increase", targetAllocation: 1, signals: ["long-entry"] }], rule);
  assert.equal(cancelled.step(32, [], rule), 1);
  assert.equal(cancelled.account.pending, null);
});
