import assert from "node:assert/strict";
import { test } from "node:test";
import { currentRule, entryContext, entryMenu, replayEntry } from "./sma-entry-study";
import { ResearchAccount } from "./v-recovery-study";
import type { MarketBar } from "../../lib/market/types";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";

function bars() {
  return Array.from({ length: 40 }, (_, index) => ({ time: `2026-01-${String(index + 1).padStart(2, "0")}`,
    open: 100, close: 100, high: 101, low: 99 }) as MarketBar);
}
function controlled(release: number) {
  const source = bars(), context = entryContext(source);
  for (const type of ["EMA", "SMA", "WMA"] as const) {
    const feature = context.features.get(type, type === "SMA" ? 11 : 7);
    feature.sign.fill(1); feature.slope.fill(0.001); feature.turns.fill(false);
    if (type === "EMA") feature.turns[20] = true;
  }
  for (const average of context.averages.values())
    average.forEach((_, index) => { average[index] = index < release ? 101 : 99; });
  context.vSignal = () => false;
  return context;
}
test("menu freezes28 unique supplemental-only changes around current v5", () => {
  const rules = entryMenu(); assert.equal(rules.length, 28);
  assert.equal(new Set(rules.map(rule => `${rule.entry}-${rule.quality}`)).size, 28);
  assert.ok(rules.some(rule => JSON.stringify(rule) === JSON.stringify(currentRule)));
  for (const rule of rules) assert.deepEqual({ ...rule, entry: currentRule.entry, quality: currentRule.quality }, currentRule);
});
test("a missed turn is released by later price confirmation only inside the declared window", () => {
  const context = controlled(24), turn = new ResearchAccount(context, currentRule);
  const pending3 = new ResearchAccount(context, { ...currentRule, entry: "pending3" });
  const pending5 = new ResearchAccount(context, { ...currentRule, entry: "pending5" });
  for (let index = 20; index <= 24; index++) {
    assert.equal(turn.step(index, []).target, 0); assert.equal(pending3.step(index, []).target, 0);
    assert.equal(pending5.step(index, []).target, index === 24 ? 1 : 0);
  }
});
test("nonpositive EMA and original reductions block supplements; original buys bypass the SMA supplement gate", () => {
  const context = controlled(21), account = new ResearchAccount(context, { ...currentRule, entry: "pending5" });
  account.step(20, []); context.features.get("EMA", 7).sign[21] = 0;
  assert.equal(account.step(21, []).target, 0);
  const reduce: StrategyCycleRecentSignal[] = [{ direction: "reduce", targetAllocation: 0, signals: ["long-exit"] }];
  assert.equal(account.step(22, reduce).target, 0);
  const original = new ResearchAccount(controlled(30), currentRule);
  const buy: StrategyCycleRecentSignal[] = [{ direction: "increase", targetAllocation: 0.4, signals: ["long-entry"] }];
  assert.equal(original.step(20, buy).target, 0.4);
});
test("early cumulative stop overrides hold7 and blocks both original and supplemental reentry", () => {
  const context = controlled(20), account = new ResearchAccount(context, { ...currentRule, entry: "positive" });
  assert.equal(account.step(20, []).target, 1);
  context.bars[21]!.close = 95;
  assert.equal(account.step(21, []).cut, true);
  assert.equal(account.account.allocation, 0);
  for (let index = 22; index <= 26; index++) assert.equal(account.step(index,
    index === 23 ? [{ direction: "increase", targetAllocation: 1, signals: ["long-entry"] }] : []).target, 0);
});
test("all28 paths preserve prefix causality with original buy/reduce signals", () => {
  const source = bars().map((bar, index) => {
    const close = 100 + Math.sin(index * 0.9) * 8;
    return { ...bar, open: close - 1, close, high: close + 2, low: close - 2 };
  });
  const decisions = new Map<number, StrategyCycleRecentSignal[]>([
    [22, [{ direction: "increase", targetAllocation: 0.6, signals: ["long-entry"] }]],
    [25, [{ direction: "reduce", targetAllocation: 0, signals: ["long-exit"] }]],
  ]);
  for (const rule of entryMenu()) {
    const full = replayEntry(source, decisions, 20, rule), prefix = replayEntry(source.slice(0, 31), decisions, 20, rule);
    assert.deepEqual(full.targets.slice(0, 31), prefix.targets);
    assert.deepEqual(full.daily.slice(0, 11), prefix.daily);
  }
});
