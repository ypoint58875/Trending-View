import assert from "node:assert/strict";
import { test } from "node:test";
import { SizingContext, SizedAccount, baselinePolicy, sizingMenu, sizingReplay, entryFraction, validateProgress, type RiskPolicy } from "./regime-sizing";
import type { MarketBar } from "../../lib/market/types";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";

function bar(index: number, open = 100, close = open): MarketBar {
  return { time: new Date(Date.UTC(2020, 0, index + 1)).toISOString().slice(0, 10),
    open, close, high: Math.max(open, close) + 1, low: Math.min(open, close) - 1 } as MarketBar;
}
const policy: RiskPolicy = { ...baselinePolicy, id: "test", sizing: "fixed50" };
const buy: StrategyCycleRecentSignal[] = [{ direction: "increase", targetAllocation: 1, signals: ["long-entry"] }];
const sell: StrategyCycleRecentSignal[] = [{ direction: "reduce", targetAllocation: 0, signals: ["long-exit"] }];
function controlled() {
  const context = new SizingContext(Array.from({ length: 90 }, (_, index) => bar(index)));
  context.wide.fill(true); context.weakWide.fill(true);
  context.points.forEach(point => { point.atrPercent = 2; point.er = 0.1; point.atrRank = 0.8; });
  for (const type of ["EMA", "SMA", "WMA"] as const) {
    const feature = context.inner.features.get(type, type === "SMA" ? 11 : 7);
    feature.sign.fill(1); feature.slope.fill(0.001); feature.turns.fill(false);
    if (type === "EMA") feature.turns[65] = true;
  }
  for (const average of context.inner.averages.values()) average.fill(99);
  context.average60.fill(99); context.inner.vSignal = () => false;
  return context;
}
test("321 policies freeze a unique bounded menu and sizing has no leverage", () => {
  assert.equal(sizingMenu().length, 321); assert.equal(new Set(sizingMenu().map(row => row.id)).size, 321);
  assert.equal(entryFraction("fixed25", 3), 0.25); assert.equal(entryFraction("fixed75", 3), 0.75);
  assert.equal(entryFraction("atr1", 2), 0.5); assert.equal(entryFraction("atr1.5", 3), 0.5);
  assert.equal(entryFraction("atr1", 10), 0.25); assert.equal(entryFraction("atr1.5", 0.1), 1);
});
test("actual partial supplements retain original absolute target authority", () => {
  const account = new SizedAccount(controlled(), policy);
  const entry = account.step(65, []); assert.equal(entry.target, 0.5); assert.equal(entry.capped, true);
  const smaller = account.step(66, [{ direction: "reduce", targetAllocation: 0.6, signals: ["long-exit"] }]);
  assert.equal(smaller.target, 0.5); assert.equal(account.inner.account.pending, null);
  assert.equal(account.step(67, buy).target, 1); assert.equal(account.tagged, false);
  const original = new SizedAccount(controlled(), policy);
  assert.equal(original.step(65, buy).target, 1); assert.equal(original.tagged, false);
});
test("EMA-only sizing excludes V supplements; all scope includes them", () => {
  const context = controlled(); context.inner.features.get("EMA", 7).turns.fill(false); context.inner.vSignal = () => true;
  assert.equal(new SizedAccount(context, policy).step(65, []).target, 1);
  assert.equal(new SizedAccount(context, { ...policy, scope: "all" }).step(65, []).target, 0.5);
});
test("unknown lagged volatility skips risk tagging", () => {
  const context = controlled(); context.points[64]!.atrPercent = null;
  const account = new SizedAccount(context, policy);
  assert.equal(account.step(65, []).target, 1); assert.equal(account.tagged, false);
});
test("confirmed restoration occurs after entry, retains entry age and respects pending sells", () => {
  const context = controlled(), account = new SizedAccount(context, { ...policy, restore: true });
  assert.equal(account.step(65, []).target, 0.5);
  const next = account.step(66, []); assert.equal(next.target, 1); assert.equal(next.restored, true);
  assert.equal(account.inner.enteredAt, 65); assert.equal(account.inner.lastSupplement, 65);
  const pending = new SizedAccount(controlled(), { ...policy, restore: true });
  pending.step(65, []); pending.step(66, sell);
  assert.equal(pending.step(67, []).target, 0.5); assert.equal(pending.inner.account.pending, 0);
});
test("early stop overrides supplemental holding and later recovery restores only the actual stopped fraction", () => {
  const context = controlled(), account = new SizedAccount(context, policy);
  account.step(65, []); context.bars[66]!.close = 95;
  assert.equal(account.step(66, []).cut, true); assert.equal(account.inner.recoveryTarget, 0.5);
  for (let index = 67; index <= 71; index++) assert.equal(account.step(index, index === 68 ? buy : []).target, 0);
  context.bars[72]!.close = 101;
  const recovered = account.step(72, []);
  assert.equal(recovered.target, 0.5); assert.equal(recovered.recovered, true); assert.equal(recovered.capped, false);
});
test("tagged WMA exits preserve hold7 and confirmation; regime changes do not erase tags", () => {
  const context = controlled(), account = new SizedAccount(context, { ...policy, exit: "wma" });
  account.step(65, []); account.step(66, sell); context.wide.fill(false);
  context.inner.features.get("WMA", 7).sign.fill(-1);
  for (let index = 67; index < 72; index++) assert.equal(account.step(index, []).target, 0.5);
  assert.equal(account.step(72, []).target, 0); assert.equal(account.tagged, false);
});
test("ATR profit giveback overrides holding at the observed close and requires a fresh entry after wait5", () => {
  const context = controlled(), account = new SizedAccount(context, { ...policy, exit: "atr" });
  account.step(65, []); context.bars[66]!.close = 104; account.step(66, []);
  context.bars[67]!.close = 100.5; context.inner.e7[67] = 101;
  const cut = account.step(67, []); assert.equal(cut.atrExit, true); assert.equal(cut.target, 0);
  assert.equal(account.inner.recoveryTarget, null);
  for (let index = 68; index <= 72; index++) assert.equal(account.step(index, buy).target, 0);
  assert.equal(account.step(73, []).target, 0); assert.equal(account.step(74, buy).target, 1);
});
test("original increases and early stops have priority over ATR giveback", () => {
  const context = controlled(), account = new SizedAccount(context, { ...policy, exit: "atr" });
  account.step(65, []); context.bars[66]!.close = 104; account.step(66, []);
  context.bars[67]!.close = 100; context.inner.e7[67] = 101;
  assert.equal(account.step(67, buy).atrExit, false); assert.equal(account.inner.account.allocation, 1);
  const stopped = new SizedAccount(controlled(), { ...policy, exit: "atr" });
  stopped.step(65, []); stopped.context.bars[66]!.close = 104; stopped.step(66, []);
  stopped.context.bars[67]!.close = 95; stopped.context.inner.e7[67] = 101;
  const state = stopped.step(67, []); assert.equal(state.cut, true); assert.equal(state.atrExit, false);
  assert.equal(stopped.inner.recoveryTarget, 0.5);
});
test("resume accepts a partial ordered grid and rejects source/code/order/config drift", () => {
  const menu = sizingMenu(), saved = { sourceHash: "source", implementationHash: "code", rows: menu.slice(0, 20).map(row => ({ policy: row })) };
  validateProgress(saved, "source", "code", menu);
  assert.throws(() => validateProgress(saved, "other", "code", menu));
  assert.throws(() => validateProgress(saved, "source", "other", menu));
  assert.throws(() => validateProgress({ ...saved, rows: [...saved.rows].reverse() }, "source", "code", menu));
  const altered = { ...saved, rows: [{ policy: { ...menu[0]!, restore: true } }] };
  assert.throws(() => validateProgress(altered, "source", "code", menu));
});
test("all321 real account paths and lagged detectors are prefix causal", () => {
  const source = Array.from({ length: 360 }, (_, index) => bar(index, 100 + index * 0.01 + Math.sin(index * 0.4) * 6));
  const fullContext = new SizingContext(source), prefixContext = new SizingContext(source.slice(0, 333));
  const decisions = new Map([[285, buy], [293, sell], [315, buy], [325, sell]]);
  for (const row of sizingMenu()) {
    const full = sizingReplay(fullContext, decisions, 280, row, true), prefix = sizingReplay(prefixContext, decisions, 280, row, true);
    assert.deepEqual(full.targets.slice(0, 333), prefix.targets); assert.deepEqual(full.daily.slice(0, 53), prefix.daily);
    assert.ok(full.targets.every(target => target >= 0 && target <= 1));
  }
});
