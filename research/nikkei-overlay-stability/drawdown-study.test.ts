import assert from "node:assert/strict";
import { test } from "node:test";
import { RiskAccount, riskMenu, riskId, baselineRisk } from "./drawdown-study";
import { RuleAccount } from "./rule-variants";
import type { MarketBar } from "../../lib/market/types";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
const bars = (values: number[]) => values.map(close => ({ open: close, close })) as MarketBar[];
test("risk menu is finite and unique", () => { assert.equal(riskMenu().length, 39); assert.equal(new Set(riskMenu().map(riskId)).size, 39); });
test("no-risk path equals hold5 and risk paths are prefix causal", () => {
  const source = bars(Array.from({ length: 80 }, (_, i) => 100 + i / 10 + Math.sin(i) * 4));
  const baseline = new RiskAccount(source), expected = new RuleAccount(source);
  for (let i = 20; i < source.length; i++) assert.equal(baseline.step(i, [], baselineRisk).target,
    expected.step(i, [], { entry: "turn", exit: "current", hold: 5 }));
  for (const rule of riskMenu()) {
    const full = new RiskAccount(source), prefix = new RiskAccount(source.slice(0, 60));
    for (let i = 20; i < 60; i++) assert.deepEqual(full.step(i, [], rule), prefix.step(i, [], rule));
  }
});
test("emergency close stop overrides the holding lock and clears pending sells", () => {
  const source = bars([...Array(20).fill(100), 97]), account = new RiskAccount(source);
  account.inner.account.allocation = 1; account.inner.account.pending = 0.3; account.inner.lastSupplement = 19;
  account.entryClose = 100; account.peakClose = 100;
  assert.deepEqual(account.step(20, [], { risk: "stop3", fraction: 1, cooldown: 5 }), { target: 0, stopped: true });
  assert.equal(account.inner.account.pending, null); assert.equal(account.inner.lastSupplement, null);
  assert.equal(account.blockedUntil, 26);
  assert.equal(account.entryClose, 0); assert.equal(account.peakClose, 0);
});
test("cooldown blocks even original buys for five subsequent days and resumes on day six", () => {
  const account = new RiskAccount(bars(Array(40).fill(100))), rule = { risk: "stop3", fraction: 1, cooldown: 5 } as const;
  account.blockedUntil = 26;
  const buy: StrategyCycleRecentSignal[] = [{ direction: "increase", targetAllocation: 1, signals: ["long-entry"] }];
  assert.equal(account.step(25, buy, rule).target, 0);
  assert.equal(account.step(26, buy, rule).target, 1);
});
test("fraction affects only EMA supplements, and trailing stop uses only known close peaks", () => {
  const source = bars([...Array(20).fill(100), 90, 95, 101, 120, 110]);
  const account = new RiskAccount(source), rule = { risk: "trail5", fraction: 0.5, cooldown: 0 } as const;
  account.step(20, [], rule); account.step(21, [], rule);
  assert.equal(account.step(22, [], rule).target, 0.5);
  assert.equal(account.step(23, [], rule).target, 0.5);
  assert.equal(account.peakClose, 120);
  assert.deepEqual(account.step(24, [], rule), { target: 0, stopped: true });
  const original = new RiskAccount(source);
  assert.equal(original.step(22, [{ direction: "increase", targetAllocation: 1, signals: ["long-entry"] }], rule).target, 1);
});
