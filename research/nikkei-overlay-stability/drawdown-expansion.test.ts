import assert from "node:assert/strict";
import { test } from "node:test";
import { ExpandedContext, ExpandedAccount, expandedMenu, expandedId, expandedBaseline } from "./drawdown-expansion";
import { RuleAccount } from "./rule-variants";
import type { MarketBar } from "../../lib/market/types";
const bars = (values: number[]) => values.map(close => ({ open: close, high: close + 1, low: close - 1, close })) as MarketBar[];
test("expanded menu has exactly975 unique declared rules", () => { assert.equal(expandedMenu().length, 975); assert.equal(new Set(expandedMenu().map(expandedId)).size, 975); });
test("expanded baseline preserves hold5 and every rule is prefix causal", () => {
  const source = bars(Array.from({ length: 80 }, (_, i) => 100 + i / 10 + 4 * Math.sin(i)));
  const fullContext = new ExpandedContext(source), prefixContext = new ExpandedContext(source.slice(0, 60));
  const original = new RuleAccount(source), baseline = new ExpandedAccount(fullContext);
  for (let i = 20; i < source.length; i++) assert.equal(baseline.step(i, [], expandedBaseline).target, original.step(i, [], { entry: "turn", exit: "current", hold: 5 }));
  for (const rule of expandedMenu()) {
    const full = new ExpandedAccount(fullContext), prefix = new ExpandedAccount(prefixContext);
    for (let i = 20; i < 60; i++) assert.deepEqual(full.step(i, [], rule), prefix.step(i, [], rule));
  }
});
test("quality gates reject only supplemental entries, preserving original buys", () => {
  const source = bars([...Array(20).fill(100), 90, 95, 101]), context = new ExpandedContext(source);
  const rule = { ...expandedBaseline, quality: "ma100" as const }, rejected = new ExpandedAccount(context);
  assert.equal(rejected.step(22, [], rule).target, 0);
  const original = new ExpandedAccount(context);
  assert.equal(original.step(22, [{ direction: "increase", targetAllocation: 1, signals: ["long-entry"] }], rule).target, 1);
});
test("partial risk cut occurs once, bypasses hold5, and can recover on a later trend bar", () => {
  const source = bars([...Array(20).fill(100), 97, 96, 110]), account = new ExpandedAccount(new ExpandedContext(source));
  const rule = { ...expandedBaseline, protection: { id: "test", basis: "entry" as const, loss: 0.03, activation: 0, remaining: 0.5 }, recovery: true };
  account.inner.account.allocation = 1; account.inner.lastSupplement = 19; account.entryClose = 100; account.peakClose = 100;
  assert.deepEqual(account.step(20, [], rule), { target: 0.5, cut: true, recovered: false });
  assert.deepEqual(account.step(21, [], rule), { target: 0.5, cut: false, recovered: false });
  assert.deepEqual(account.step(22, [], rule), { target: 1, cut: false, recovered: true });
  assert.equal(account.entryClose, 110);
});
test("full stop without recovery clears episode marks and pending sell targets", () => {
  const source = bars([...Array(20).fill(100), 95]), account = new ExpandedAccount(new ExpandedContext(source));
  account.inner.account.allocation = 1; account.inner.account.pending = 0.4; account.inner.lastSupplement = 19;
  account.entryClose = 100; account.peakClose = 100;
  const rule = { ...expandedBaseline, protection: { id: "test", basis: "entry" as const, loss: 0.05, activation: 0, remaining: 0 } };
  assert.equal(account.step(20, [], rule).target, 0);
  assert.equal(account.recoveryTarget, null); assert.equal(account.inner.account.pending, null); assert.equal(account.entryClose, 0);
});
