import assert from "node:assert/strict";
import { test } from "node:test";
import { ExpandedContext } from "./drawdown-expansion";
import { TrailingStopAccount } from "./trailing-stop-six";
import type { MarketBar } from "../../lib/market/types";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
const bars = (values: number[]) => values.map(close => ({ open: close, high: close + 1, low: close - 1, close })) as MarketBar[];
const buy: StrategyCycleRecentSignal[] = [{ direction: "increase", targetAllocation: 1, signals: ["long-entry"] }];
function held(values: number[], peak: number, entry = 100, enteredAt = 10, early = true) {
  const account = new TrailingStopAccount(new ExpandedContext(bars(values)), 0.06, early);
  account.inner.inner.account.allocation = 1; account.inner.peakClose = peak;
  account.inner.entryClose = entry; account.enteredAt = enteredAt; return account;
}
test("profitable held episode stops inclusively at six percent after early window", () => {
  const account = held([...Array(20).fill(100), 113, 112.8], 120);
  assert.equal(account.step(20, []).trailing, false);
  const outcome = account.step(21, []);
  assert.equal(outcome.trailing, true); assert.equal(outcome.early, false); assert.equal(outcome.target, 0);
});
test("early stop remains active, overrides holding lock and enforces wait-five", () => {
  const account = held([...Array(20).fill(100), 95, ...Array(8).fill(110)], 100, 100, 19);
  account.inner.inner.lastSupplement = 19; account.inner.inner.account.pending = 0.5;
  const outcome = account.step(20, []);
  assert.equal(outcome.early, true); assert.equal(outcome.trailing, false);
  assert.equal(account.inner.inner.account.pending, null); assert.equal(account.inner.inner.lastSupplement, null);
  for (let i = 21; i <= 25; i++) assert.equal(account.step(i, buy).target, 0);
  const reentered = account.step(26, buy);
  assert.equal(reentered.target, 1); assert.equal(account.enteredAt, 26);
  assert.equal(account.inner.peakClose, 110); assert.equal(account.inner.entryClose, 110);
});
test("a fresh episode ignores earlier flat peaks and partial adds preserve its peak", () => {
  const source = bars([...Array(12).fill(200), ...Array(8).fill(90), 100, 110, 108]);
  const account = new TrailingStopAccount(new ExpandedContext(source), 0.06);
  assert.equal(account.step(20, buy).trailing, false); assert.equal(account.inner.peakClose, 100);
  account.inner.inner.account.allocation = 0.5;
  account.step(21, []); account.step(22, buy);
  assert.equal(account.inner.peakClose, 110); assert.equal(account.inner.entryClose, 100);
});
test("additive stops are prefix causal through entry, emergency exit and recovery", () => {
  const values = [...Array(20).fill(100), 110, 120, 119, 112, ...Array(8).fill(130), 125, 122];
  const full = new TrailingStopAccount(new ExpandedContext(bars(values)), 0.06);
  const targets: number[] = [];
  for (let i = 20; i < values.length; i++) targets[i] = full.step(i, i === 20 ? buy : []).target;
  for (let end = 21; end <= values.length; end++) {
    const prefix = new TrailingStopAccount(new ExpandedContext(bars(values.slice(0, end))), 0.06);
    for (let i = 20; i < end; i++) assert.equal(prefix.step(i, i === 20 ? buy : []).target, targets[i]);
  }
});
