import assert from "node:assert/strict";
import { test } from "node:test";
import { ExpandedContext, ExpandedAccount } from "./drawdown-expansion";
import { StopAccount, stopMenu, stopId, baseRule, type StopRule } from "./cumulative-stop-study";
import type { MarketBar } from "../../lib/market/types";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
const bars = (values: number[]) => values.map(close => ({ open: close, high: close + 1, low: close - 1, close })) as MarketBar[];
const rule: StopRule = { base: "hold5", measure: "entry", threshold: 0.05, earlyOnly: false, cooldown: 0, recovery: false };
function held(source: MarketBar[], enteredAt = 19, entry = 100, peak = 100) {
  const account = new StopAccount(new ExpandedContext(source)); account.inner.inner.account.allocation = 1;
  account.inner.entryClose = entry; account.inner.peakClose = peak; account.enteredAt = enteredAt; return account;
}
test("stop grid is exactly1368 unique requested configurations", () => {
  assert.equal(stopMenu().length, 1368); assert.equal(new Set(stopMenu().map(stopId)).size, 1368);
  assert.equal(Math.min(...stopMenu().map(r => r.threshold)), 0.01); assert.equal(Math.max(...stopMenu().map(r => r.threshold)), 0.1);
});
test("cumulative loss exits after multiple smaller daily losses", () => {
  const source = bars([...Array(20).fill(100), 97, 94]);
  const cumulative = held(source), daily = held(source);
  assert.equal(cumulative.step(20, [], rule).stopped, false);
  assert.equal(cumulative.step(21, [], rule).stopped, true);
  assert.equal(daily.step(20, [], { ...rule, measure: "daily" }).stopped, false);
  assert.equal(daily.step(21, [], { ...rule, measure: "daily" }).stopped, false);
});
test("peak drawdown can stop a profitable episode while entry-loss rule does not", () => {
  const source = bars([...Array(20).fill(100), 114]);
  assert.equal(held(source, 19, 100, 120).step(20, [], { ...rule, measure: "peak" }).stopped, true);
  assert.equal(held(source, 19, 100, 120).step(20, [], rule).stopped, false);
});
test("first-five scope includes age five and excludes age six", () => {
  assert.equal(held(bars([...Array(24).fill(100), 95])).step(24, [], { ...rule, earlyOnly: true }).stopped, true);
  assert.equal(held(bars([...Array(25).fill(100), 95])).step(25, [], { ...rule, earlyOnly: true }).stopped, false);
});
test("daily stop never charges the day's pre-entry decline to a newly opened position", () => {
  const source = bars([...Array(20).fill(100), 200, 150]), account = new StopAccount(new ExpandedContext(source));
  const buy: StrategyCycleRecentSignal[] = [{ direction: "increase", targetAllocation: 1, signals: ["long-entry"] }];
  assert.equal(account.step(21, buy, { ...rule, measure: "daily" }).stopped, false);
  assert.equal(account.inner.inner.account.allocation, 1);
});
test("cooldown clears holding/pending sells and blocks buys through its last day", () => {
  const source = bars([...Array(20).fill(100), 94, ...Array(10).fill(110)]), account = held(source);
  account.inner.inner.account.pending = 0.3; account.inner.inner.lastSupplement = 19;
  const controlled = { ...rule, cooldown: 5, recovery: true };
  assert.equal(account.step(20, [], controlled).stopped, true);
  assert.equal(account.inner.inner.account.pending, null); assert.equal(account.inner.inner.lastSupplement, null);
  const buy: StrategyCycleRecentSignal[] = [{ direction: "increase", targetAllocation: 1, signals: ["long-entry"] }];
  assert.equal(account.step(25, buy, controlled).target, 0);
  assert.equal(account.step(26, buy, controlled).target, 1);
});
test("disabled stop equals its base and every stop rule is prefix causal", () => {
  const source = bars(Array.from({ length: 80 }, (_, i) => 100 + i / 10 + 4 * Math.sin(i)));
  const fullContext = new ExpandedContext(source), prefixContext = new ExpandedContext(source.slice(0, 60));
  for (const base of ["hold5", "ma20-wma"] as const) {
    const actual = new StopAccount(fullContext), expected = new ExpandedAccount(fullContext);
    for (let i = 20; i < source.length; i++) assert.equal(actual.step(i, [], { ...rule, base }, false).target, expected.step(i, [], baseRule(base)).target);
  }
  for (const candidate of stopMenu()) {
    const full = new StopAccount(fullContext), prefix = new StopAccount(prefixContext);
    for (let i = 20; i < 60; i++) assert.deepEqual(full.step(i, [], candidate), prefix.step(i, [], candidate));
  }
});
