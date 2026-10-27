import assert from "node:assert/strict";
import test from "node:test";
import { PeakLiquidationAccount, peakMenu, peakReplay, validatePeakProgress, type PeakPolicy } from "./peak-liquidation-study";
import { FilterContext, filterReplay } from "./oscillator-filter-study";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";

function bars(values: number[]): MarketBar[] {
  return values.map((close, index) => ({ time: String(index), open: close, close, high: close + 1, low: close - 1 }) as MarketBar);
}
const buy: StrategyCycleRecentSignal[] = [{ direction: "increase", targetAllocation: 1, signals: ["long-entry"] }];
const sell: StrategyCycleRecentSignal[] = [{ direction: "reduce", targetAllocation: 0, signals: ["long-exit"] }];
const policy = (threshold = 0.03, wait: 0 | 5 = 0, window: 0 | 20 = 0): PeakPolicy => ({
  ...peakMenu()[0]!, id: "fixture", threshold, wait, window,
});

test("menu freezes four unique specified strategies and164 ordered cases", () => {
  const menu = peakMenu(); assert.equal(menu.length, 164); assert.equal(new Set(menu.map(row => row.id)).size, 164);
  assert.equal(menu.filter(row => row.threshold === null).length, 4);
  assert.equal(menu.filter(row => row.entry.profile === "rsi35-40").length, 41);
});

test("new entry ignores pre-entry peaks and a profitable position can be stopped inclusively", () => {
  const source = bars([...Array(20).fill(200), 100, 110, 106.7]);
  const context = new FilterContext(source);
  context.inner.features.get("WMA", 7).sign[20] = 1;
  const account = new PeakLiquidationAccount(context, policy(), 20);
  assert.equal(account.step(20, buy).target, 1);
  assert.equal(account.step(21, []).peak, 110);
  const cut = account.step(22, []); assert.equal(cut.peakCut, true); assert.equal(cut.target, 0);
});

test("peak cut overrides supplemental hold and clears pending sells, old recovery and flat boundary", () => {
  const source = bars([...Array(20).fill(100), 92, 95, 99, 96]);
  source[20]!.open = 94; source[21]!.open = 91;
  const account = new PeakLiquidationAccount(new FilterContext(source), policy(), 19);
  account.step(19, []); assert.equal(account.step(21, []).target, 1);
  assert.equal(account.step(22, sell).target, 1);
  assert.equal(account.step(23, []).peakCut, true);
  const fallback = account.inner.account.inner, raw = fallback.account;
  assert.equal(raw.account.pending, null); assert.equal(raw.recoveryTarget, null); assert.equal(raw.lastSupplement, null);
  assert.equal(raw.enteredAt, null); assert.equal(fallback.flatStart, 23);
});

test("wait0 permits next bar and wait5 blocks exactly five subsequent bars", () => {
  for (const wait of [0, 5] as const) {
    const source = bars([...Array(20).fill(100), 101, 110, 106, ...Array(8).fill(111)]);
    const account = new PeakLiquidationAccount(new FilterContext(source), policy(0.03, wait), 20);
    account.step(20, buy); account.step(21, []); assert.equal(account.step(22, []).peakCut, true);
    for (let index = 23; index <= 22 + wait; index++) assert.equal(account.step(index, buy).target, 0);
    assert.equal(account.step(23 + wait, buy).target, 1);
  }
});

test("partial adds preserve episode peak and an aged rolling peak expires", () => {
  const source = bars([...Array(20).fill(100), 101, 110, ...Array(20).fill(108), 106]);
  const context = new FilterContext(source), episode = new PeakLiquidationAccount(context, policy(0.03), 20);
  const rolling = new PeakLiquidationAccount(context, policy(0.03, 0, 20), 20);
  for (const account of [episode, rolling]) {
    account.step(20, [{ ...buy[0]!, targetAllocation: 0.4 }]); account.step(21, []);
    assert.equal(account.step(22, buy).peak, 110);
    for (let index = 23; index <= 41; index++) account.step(index, []);
  }
  assert.equal(episode.step(42, []).peakCut, true); assert.equal(rolling.step(42, []).peakCut, false);
});

test("all164 policies are prefix causal and disabled stops retain each exact reference controller", () => {
  const source = bars(Array.from({ length: 120 }, (_, index) => 100 + 15 * Math.sin(index / 3)));
  const context = new FilterContext(source), partial = new FilterContext(source.slice(0, 85));
  const decisions = new Map([[25, buy], [35, sell], [50, buy], [64, sell]]);
  for (const candidate of peakMenu()) {
    const full = peakReplay(context, decisions, 20, candidate), prefix = peakReplay(partial, decisions, 20, candidate);
    assert.deepEqual(full.targets.slice(0, 85), prefix.targets);
    if (candidate.threshold === null) assert.deepEqual(full.targets, filterReplay(context, decisions, 20, candidate.entry).targets);
  }
});

test("scalar checkpoint accepts ordered prefixes and rejects source, code and configuration drift", () => {
  const menu = peakMenu(), saved = { sourceHash: "source", implementationHash: "code", rows: menu.slice(0, 20).map(policy => ({ policy })) };
  assert.doesNotThrow(() => validatePeakProgress(saved, "source", "code", menu));
  assert.throws(() => validatePeakProgress(saved, "other", "code", menu));
  assert.throws(() => validatePeakProgress(saved, "source", "other", menu));
  assert.throws(() => validatePeakProgress({ ...saved, rows: [...saved.rows].reverse() }, "source", "code", menu));
  assert.throws(() => validatePeakProgress({ ...saved, rows: [{ policy: { ...menu[0]!, wait: 5 } }] }, "source", "code", menu));
});
