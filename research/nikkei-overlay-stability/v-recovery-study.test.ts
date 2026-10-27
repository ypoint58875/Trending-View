import assert from "node:assert/strict";
import { test } from "node:test";
import { Context, ResearchAccount, baseline, menu, ruleId, type Rule } from "./v-recovery-study";
import type { MarketBar } from "../../lib/market/types";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
const bar = (open: number, close: number, high = Math.max(open, close) + 0.1): MarketBar => ({ open, close, high, low: Math.min(open, close) - 0.1 }) as MarketBar;
const buy: StrategyCycleRecentSignal[] = [{ direction: "increase", targetAllocation: 1, signals: ["long-entry"] }];
function reversal() { return [...Array.from({ length: 20 }, () => bar(100, 100)), bar(94, 92), bar(91, 95)]; }
const engulf: Rule = { ...baseline, v: "engulf", drop: 0.05, vGate: "none" };
test("declared research menu is unique and bounded", () => {
  assert.equal(menu().length, 386); assert.equal(new Set(menu().map(ruleId)).size, 386);
});
test("causal bearish-to-bullish body reversal can bypass slow averages only for its extra signal", () => {
  const c = new Context(reversal());
  assert.equal(c.vSignal(21, engulf), true);
  const account = new ResearchAccount(c, engulf), baselineAccount = new ResearchAccount(c, baseline);
  assert.equal(account.step(21, []).vBuy, true); assert.equal(account.account.allocation, 1);
  assert.equal(baselineAccount.step(21, []).target, 0);
  const gated = new ResearchAccount(c, { ...engulf, vGate: "both" });
  assert.equal(gated.step(21, []).vBuy, false);
});
test("reversal declines use peak percentage and require the peak before the low", () => {
  const exact = [...Array.from({ length: 20 }, () => bar(100, 100)), bar(96, 94), bar(95.1, 97)];
  assert.equal(new Context(exact).vSignal(21, { ...engulf, drop: 0.05 }), false);
  const wrongOrder = [...Array.from({ length: 20 }, () => bar(90, 90)), bar(90, 100), bar(99, 98), bar(98, 100)];
  assert.equal(new Context(wrongOrder).vSignal(22, { ...engulf, lookback: 5 }), false);
});
test("original reductions and post-stop cooldown suppress V buys", () => {
  const c = new Context(reversal());
  const original = new ResearchAccount(c, engulf);
  const sell: StrategyCycleRecentSignal[] = [{ direction: "reduce", targetAllocation: 0, signals: ["long-exit"] }];
  assert.equal(original.step(21, sell).vBuy, false);
  const blocked = new ResearchAccount(c, engulf); blocked.blockedUntil = 22;
  assert.equal(blocked.step(21, []).target, 0);
});
test("fresh rebound uses lowest opens rather than intraday lows or closes", () => {
  const source = [...Array.from({ length: 20 }, () => bar(100, 100)), bar(90, 80), bar(91, 94.4), bar(94, 94.6), bar(95, 96)];
  const c = new Context(source), rule: Rule = { ...baseline, v: "rebound", rebound: 0.05, drop: 0.05 };
  assert.equal(c.vSignal(21, rule), false);
  assert.equal(c.vSignal(22, rule), true);
  assert.equal(c.vSignal(23, rule), false);
});
test("holding-seven releases a pending reduction at age seven, not age six", () => {
  const source = [...Array.from({ length: 20 }, () => bar(100, 100)), ...Array.from({ length: 8 }, (_, n) => bar(96 - n, 95 - n))];
  const account = new ResearchAccount(new Context(source), { ...baseline, hold: 7 });
  account.account.allocation = 1; account.account.pending = 0; account.lastSupplement = 19;
  account.enteredAt = 19; account.entryClose = 100;
  assert.equal(account.step(25, []).target, 1);
  assert.equal(account.step(26, []).target, 0);
});
test("early risk cut overrides V holding protection and partially cut accounts cannot buy during cooldown", () => {
  const source = [...reversal(), bar(90, 90), bar(95, 95)];
  const account = new ResearchAccount(new Context(source), { ...engulf, hold: 7, remaining: 0.5 });
  account.step(21, []);
  const cut = account.step(22, []); assert.equal(cut.cut, true); assert.equal(cut.target, 0.5);
  assert.equal(account.step(23, buy).target, 0.5); assert.equal(account.account.pending, null);
});
test("all386 research paths are prefix causal on a reversal and rebound fixture", () => {
  const source = [...reversal(), bar(96, 100), bar(98, 92), ...Array.from({ length: 12 }, (_, n) => bar(93 + n, 94 + n))];
  const fullContext = new Context(source), end = 28, prefixContext = new Context(source.slice(0, end));
  for (const rule of menu()) {
    const full = new ResearchAccount(fullContext, rule), prefix = new ResearchAccount(prefixContext, rule);
    for (let i = 20; i < source.length; i++) {
      const signals = i === 25 ? buy : [], step = full.step(i, signals);
      assert.ok(step.target >= 0 && step.target <= 1);
      if (i < end) assert.deepEqual(prefix.step(i, signals), step);
    }
  }
});
