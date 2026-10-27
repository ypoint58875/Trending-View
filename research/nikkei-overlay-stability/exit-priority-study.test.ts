import assert from "node:assert/strict";
import test from "node:test";
import { ExitPriorityAccount, exitPriorityGate, exitPriorityMenu, exitPriorityReplay, validateExitProgress,
  priorityMethods, type ExitEvidence, type ExitPriorityPolicy } from "./exit-priority-study";
import { FilterContext, filterReplay } from "./oscillator-filter-study";
import type { MarketBar } from "../../lib/market/types";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";

const evidence: ExitEvidence = { pendingZero: false, pendingAge: 0, entryAge: 7, entryLoss: 0,
  wmaNegative: false, wmaNegativeTwo: false, smaUnprotected: false, emaNegative: false, emaNegativeTwo: false,
  belowEma: false, belowEmaTwo: false, belowSma: false, belowSmaTwo: false, ema20Negative: false,
  belowLowTwo: false, dayDrop: 0, previousAtr: 1 };
const buy: StrategyCycleRecentSignal[] = [{ direction: "increase", targetAllocation: 1, signals: ["long-entry"] }];
const sell: StrategyCycleRecentSignal[] = [{ direction: "reduce", targetAllocation: 0, signals: ["long-exit"] }];
function bars(values: number[]) {
  return values.map((close, index) => ({ time: String(index), open: close, close, high: close + 1, low: close - 1 }) as MarketBar);
}
function policy(method: ExitPriorityPolicy["method"], wait: 0 | 5 = 0): ExitPriorityPolicy {
  return { ...exitPriorityMenu()[0]!, id: "fixture", method, wait };
}

test("menu declares26 exit methods, two waits, four controls and212 unique cases", () => {
  assert.equal(priorityMethods.length, 26); const menu = exitPriorityMenu();
  assert.equal(menu.length, 212); assert.equal(new Set(menu.map(row => row.id)).size, 212);
  assert.equal(menu.filter(row => row.method === "baseline").length, 4);
});
test("original priority requires an actual pending zero target and inclusive ages", () => {
  for (const method of priorityMethods.filter(row => row.startsWith("zero-")))
    assert.equal(exitPriorityGate(method, evidence), false);
  assert.equal(exitPriorityGate("zero-immediate", { ...evidence, pendingZero: true }), true);
  assert.equal(exitPriorityGate("zero-pending2", { ...evidence, pendingZero: true, pendingAge: 1 }), false);
  assert.equal(exitPriorityGate("zero-pending2", { ...evidence, pendingZero: true, pendingAge: 2 }), true);
  assert.equal(exitPriorityGate("zero-age3", { ...evidence, pendingZero: true, entryAge: 2 }), false);
  assert.equal(exitPriorityGate("zero-age3", { ...evidence, pendingZero: true, entryAge: 3 }), true);
});
test("loss protection separates age10 from lifetime and respects threshold boundaries", () => {
  assert.equal(exitPriorityGate("loss4-age10", { ...evidence, entryAge: 10, entryLoss: 0.04 }), true);
  assert.equal(exitPriorityGate("loss4-age10", { ...evidence, entryAge: 11, entryLoss: 0.04 }), false);
  assert.equal(exitPriorityGate("loss4-all", { ...evidence, entryAge: 20, entryLoss: 0.04 }), true);
  assert.equal(exitPriorityGate("loss3-all", { ...evidence, entryLoss: 0.02999 }), false);
});
test("ATR shock needs prior valid ATR plus current price weakness, not just volatility", () => {
  assert.equal(exitPriorityGate("shock-atr15", { ...evidence, belowEma: true, dayDrop: 1.5 }), true);
  assert.equal(exitPriorityGate("shock-atr15", { ...evidence, belowEma: true, dayDrop: 1.499 }), false);
  assert.equal(exitPriorityGate("shock-atr1", { ...evidence, belowEma: true, dayDrop: 5, previousAtr: null }), false);
  assert.equal(exitPriorityGate("shock-atr1", { ...evidence, dayDrop: 5 }), false);
});
test("priority bypasses trend protection, clears real account marks and respects wait5", () => {
  const source = bars([...Array(20).fill(100), 101, 102, ...Array(8).fill(103)]);
  const account = new ExitPriorityAccount(new FilterContext(source), policy("zero-immediate", 5), 20);
  assert.equal(account.step(20, buy).target, 1); assert.equal(account.step(21, sell).localExit, true);
  const raw = account.inner.account.inner.account;
  assert.equal(raw.account.pending, null); assert.equal(raw.recoveryTarget, null); assert.equal(raw.lastSupplement, null);
  assert.equal(raw.enteredAt, null); assert.equal(account.inner.account.inner.flatStart, 21);
  for (let index = 22; index <= 26; index++) assert.equal(account.step(index, buy).target, 0);
  assert.equal(account.step(27, buy).target, 1);
});
test("fresh original buy cancels zero-sell priority and partial reductions are not forced liquidations", () => {
  const source = bars([...Array(20).fill(100), 101, 102, 99]);
  const account = new ExitPriorityAccount(new FilterContext(source), policy("zero-wma"), 20);
  account.step(20, buy); assert.equal(account.step(21, sell).target, 1);
  const next = account.step(22, buy); assert.equal(next.localExit, false); assert.equal(next.target, 1);
  const partial = new ExitPriorityAccount(new FilterContext(source), policy("zero-immediate"), 20);
  partial.step(20, buy); const reduced = partial.step(21, [{ ...sell[0]!, targetAllocation: 0.4 }]);
  assert.equal(reduced.localExit, false); assert.equal(reduced.target, 1);
});
test("independent shock exit cannot liquidate a fresh entry on the same bar", () => {
  const context = new FilterContext(bars([...Array(20).fill(100), 90, 80]));
  context.inner.features.get("WMA", 7).sign[20] = 1;
  const account = new ExitPriorityAccount(context, policy("shock-atr1"), 20);
  const entry = account.step(20, buy); assert.equal(entry.target, 1); assert.equal(entry.localExit, false);
});
test("native early stop retains authority rather than being relabeled as a new local exit", () => {
  const context = new FilterContext(bars([...Array(20).fill(100), 101, 90]));
  const account = new ExitPriorityAccount(context, policy("shock-atr1"), 20);
  account.step(20, buy); const stopped = account.step(21, []);
  assert.equal(stopped.cut, true); assert.equal(stopped.target, 0); assert.equal(stopped.localExit, false);
  assert.equal(account.inner.account.inner.account.blockedUntil, 27);
});
test("all212 policies preserve causal prefixes and native controls match unchanged accounts", () => {
  const source = bars(Array.from({ length: 110 }, (_, index) => 100 + 12 * Math.sin(index / 3)));
  const context = new FilterContext(source), prefix = new FilterContext(source.slice(0, 80));
  const decisions = new Map([[25, buy], [35, sell], [50, buy], [65, sell]]);
  for (const candidate of exitPriorityMenu()) {
    const full = exitPriorityReplay(context, decisions, 20, candidate);
    assert.deepEqual(full.targets.slice(0, 80), exitPriorityReplay(prefix, decisions, 20, candidate).targets);
    if (candidate.method === "baseline") assert.deepEqual(full.targets, filterReplay(context, decisions, 20, candidate.entry).targets);
  }
});
test("ordered scalar progress rejects source, code and rule drift", () => {
  const menu = exitPriorityMenu(), saved = { sourceHash: "source", implementationHash: "code", rows: menu.slice(0, 20).map(policy => ({ policy })) };
  assert.doesNotThrow(() => validateExitProgress(saved, "source", "code", menu));
  assert.throws(() => validateExitProgress(saved, "other", "code", menu));
  assert.throws(() => validateExitProgress(saved, "source", "other", menu));
  assert.throws(() => validateExitProgress({ ...saved, rows: [...saved.rows].reverse() }, "source", "code", menu));
});
