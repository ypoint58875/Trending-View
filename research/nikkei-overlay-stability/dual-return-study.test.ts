import assert from "node:assert/strict";
import { test } from "node:test";
import { DualContext, DualAccount, dualBaseline, dualMenu, dualReplay, confirmationAllowed, validateDualProgress, meetsDualGoal } from "./dual-return-study";
import { extensionMenu, omitAddedSpan } from "./dual-return-extension";
import { SmaPositionOverlay, ENGULF_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import { strategyCycleSignalDirection, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";

function bars(length = 60): MarketBar[] {
  return Array.from({ length }, (_, index) => ({ time: String(index), open: 100, high: 101, low: 99, close: 100 }) as MarketBar);
}
function controlled() {
  const source = bars(); source[19] = { ...source[19]!, open: 91, close: 90, high: 92, low: 89 };
  source[20] = { ...source[20]!, open: 94, close: 95, high: 96, low: 93 };
  const context = new DualContext(source);
  for (const type of ["EMA", "WMA", "SMA"] as const) {
    const feature = context.inner.features.get(type, type === "SMA" ? 11 : 7);
    feature.sign.fill(1); feature.slope.fill(0.001); feature.turns.fill(false);
  }
  context.inner.averages.get(20)!.fill(110); context.inner.vSignal = () => false;
  context.inner.e7.fill(90); context.atr.fill(2);
  return context;
}
const policy = (id: string) => dualMenu().find(candidate => candidate.id === id)!;
const buy: StrategyCycleRecentSignal[] = [{ direction: "increase", targetAllocation: 0.4, signals: ["long-entry"] }];
const reduce: StrategyCycleRecentSignal[] = [{ direction: "reduce", targetAllocation: 0.4, signals: ["long-exit"] }];

test("menu freezes91 unique cases and dual objective rejects either single-metric improvement", () => {
  const menu = dualMenu(); assert.equal(menu.length, 91); assert.equal(new Set(menu.map(row => row.id)).size, 91);
  const baseline = { totalReturn: 382, final500: { totalReturn: 95, maxDrawdown: -8 } };
  assert.equal(meetsDualGoal({ ...baseline, totalReturn: 400 }, baseline), false);
  assert.equal(meetsDualGoal({ ...baseline, final500: { totalReturn: 100, maxDrawdown: -8 } }, baseline), false);
  assert.equal(meetsDualGoal({ totalReturn: 400, final500: { totalReturn: 100, maxDrawdown: -8 } }, baseline), true);
});

test("EMA2 and EMA3 require their completed positive history but do not delay native buys", () => {
  const context = controlled(); context.inner.features.get("EMA", 7).sign[19] = -1;
  const primary = policy("daily4-ema2-baseline");
  assert.equal(confirmationAllowed(context, primary.entry, 20, 18), false);
  assert.equal(new DualAccount(context, primary, 18).step(20, []).target, 0);
  assert.equal(confirmationAllowed(context, primary.entry, 21, 18), true);
  assert.equal(confirmationAllowed(context, policy("daily4-ema3-baseline").entry, 21, 18), false);
  context.inner.averages.get(20)![20] = 94; context.inner.features.get("EMA", 7).turns[20] = true;
  const native = new DualAccount(context, primary, 18).step(20, []);
  assert.equal(native.target, 1); assert.equal(native.kind, "native-turn"); assert.equal(native.tagged, false);
});

test("full2 and high2 use each historical low and preceding highs, never future bars", () => {
  const context = controlled(), full = policy("daily4-full2-baseline").entry;
  assert.equal(confirmationAllowed(context, full, 20, 18), false);
  context.bars[21]!.close = 96;
  assert.equal(confirmationAllowed(context, full, 21, 18), true);
  context.bars[22]!.close = 10;
  assert.equal(confirmationAllowed(context, full, 21, 18), true);
  context.bars[21]!.close = 101;
  assert.equal(confirmationAllowed(context, policy("daily4-high2-baseline").entry, 21, 18), true);
  context.bars[19]!.high = 102;
  assert.equal(confirmationAllowed(context, policy("daily4-high2-baseline").entry, 21, 18), false);
  context.inner.features.get("EMA", 7).sign[20] = null;
  assert.equal(confirmationAllowed(context, full, 21, 18), false);
});

test("WMA3 preserves holding confirmation and original increases transfer native authority", () => {
  const context = controlled(), account = new DualAccount(context, policy("daily4-wma3"), 18);
  assert.equal(account.step(20, []).target, 1);
  for (let index = 21; index <= 23; index++) {
    context.bars[index]!.close = 94; context.inner.features.get("WMA", 7).sign[index] = -1;
    const state = account.step(index, index === 21 ? reduce : []);
    assert.equal(state.target, index < 23 ? 1 : 0.4); assert.equal(state.tagged, true);
    assert.equal(account.inner.account.enteredAt, 20);
  }
  const state = account.step(24, buy);
  assert.equal(state.target, 0.4); assert.equal(state.tagged, false);
  assert.equal(account.inner.account.rule.hold, 7);
});

test("original3 releases without WMA while ordinary native episodes retain original protection", () => {
  const context = controlled(), account = new DualAccount(context, policy("daily4-original3"), 18);
  account.step(20, []);
  assert.equal(account.step(21, reduce).target, 1); assert.equal(account.step(22, []).target, 1);
  assert.equal(account.step(23, []).target, 0.4);
  const native = new DualAccount(context, policy("daily4-original3"), 18);
  assert.equal(native.step(20, buy).target, 0.4);
  const exit: StrategyCycleRecentSignal[] = [{ ...reduce[0]!, targetAllocation: 0 }];
  assert.equal(native.step(21, exit).target, 0.4); assert.equal(native.step(23, []).target, 0.4);
});

test("profit-activated trailing exits use observed close and impose wait5 without automatic recovery", () => {
  const context = controlled(), account = new DualAccount(context, policy("daily4-trail2"), 18);
  assert.equal(account.step(20, []).target, 1);
  context.bars[21]!.close = 100; assert.equal(account.step(21, []).target, 1);
  context.bars[22]!.close = 97; context.inner.e7[22] = 99;
  const exit = account.step(22, []);
  assert.equal(exit.target, 0); assert.equal(exit.localExit, "trail2"); assert.equal(exit.blockedUntil, 28);
  assert.equal(account.inner.account.recoveryTarget, null); assert.equal(account.inner.flatStart, 22);
  for (let index = 23; index <= 27; index++) assert.equal(account.step(index, buy).target, 0);
  assert.equal(account.step(28, []).target, 0);
});

test("trailing profit activation and original-increase priority are genuine requirements", () => {
  const context = controlled(), account = new DualAccount(context, policy("daily4-trail2"), 18);
  account.step(20, []); context.bars[21]!.close = 98; account.step(21, []);
  context.bars[22]!.close = 95; context.inner.e7[22] = 99;
  assert.equal(account.step(22, []).target, 1);
  const second = new DualAccount(context, policy("daily4-trail2"), 18);
  second.step(20, []); context.bars[21]!.close = 100; second.step(21, []);
  context.bars[22]!.close = 97;
  const increase = second.step(22, buy);
  assert.equal(increase.target, 1); assert.equal(increase.tagged, false); assert.equal(increase.localExit, null);
});

test("ATR giveback, two weak closes and age10 have explicit inclusive confirmations", () => {
  const context = controlled(), atr = new DualAccount(context, policy("daily4-atr15"), 18);
  atr.step(20, []); context.bars[21]!.close = 98; atr.step(21, []);
  context.bars[22]!.close = 96; context.inner.e7[22] = 99;
  assert.equal(atr.step(22, []).target, 1);
  context.bars[23]!.close = 95; context.inner.e7[23] = 99;
  assert.equal(atr.step(23, []).localExit, "atr-giveback15");
  const weakness = new DualAccount(context, policy("daily4-ema2"), 18);
  weakness.step(20, []); context.bars[21]!.close = 94; context.inner.e7[21] = 99;
  assert.equal(weakness.step(21, []).target, 1);
  context.bars[22]!.close = 93;
  assert.equal(weakness.step(22, []).localExit, "ema-weakness2");
  const timed = new DualAccount(controlled(), policy("daily4-age10"), 18);
  timed.context.bars.forEach((bar, index) => { if (index >= 21) bar.close = 95; });
  timed.step(20, []);
  for (let index = 21; index <= 30; index++) assert.equal(timed.step(index, []).target, index < 30 ? 1 : 0);
});

test("native first-five risk stop remains higher priority and its recovery stays native", () => {
  const context = controlled(), account = new DualAccount(context, policy("daily4-age10"), 18);
  account.step(20, []); context.bars[21]!.close = 90;
  const stop = account.step(21, []);
  assert.equal(stop.cut, true); assert.equal(stop.localExit, null); assert.equal(stop.target, 0); assert.equal(stop.tagged, false);
  for (let index = 22; index <= 26; index++) assert.equal(account.step(index, []).target, 0);
  const recovery = account.step(27, []);
  assert.equal(recovery.recovered, true); assert.equal(recovery.kind, "native-recovery"); assert.equal(recovery.tagged, false);
});

test("checkpoint supports ordered partial reuse and rejects identity, order and policy drift", () => {
  const menu = dualMenu(), saved = { sourceHash: "source", implementationHash: "code", rows: menu.slice(0, 12).map(policy => ({ policy })) };
  assert.doesNotThrow(() => validateDualProgress(saved, "source", "code", menu));
  assert.throws(() => validateDualProgress(saved, "other", "code", menu));
  assert.throws(() => validateDualProgress(saved, "source", "other", menu));
  assert.throws(() => validateDualProgress({ ...saved, rows: [...saved.rows].reverse() }, "source", "code", menu));
  assert.throws(() => validateDualProgress({ ...saved, rows: [{ policy: { ...menu[0]!, exit: "age10" } }] }, "source", "code", menu));
});

test("scope extension has54 additional cases without changing original profiles or native priority", () => {
  const menu = extensionMenu(); assert.equal(menu.length, 55); assert.equal(new Set(menu.map(row => row.id)).size, 55);
  assert.ok(menu.slice(1).every(row => row.entry.base.scope === "any"));
  assert.equal(dualMenu().length, 91);
  const context = controlled(); context.bars[20]!.close = 111;
  context.inner.features.get("EMA", 7).sign[19] = -1;
  const candidate = menu.find(row => row.id === "any4-ema3-baseline")!;
  assert.equal(new DualAccount(context, candidate, 18).step(20, buy).target, 0.4);
});

test("episode omission suppresses only extra entrances while preserving prefix and native buys", () => {
  const context = controlled(), decisions = new Map<number, StrategyCycleRecentSignal[]>([[21, buy]]);
  const candidate = policy("daily4-baseline"), full = dualReplay(context, decisions, 18, candidate);
  assert.equal(full.targets[20], 1);
  const omitted = omitAddedSpan(context, decisions, 18, candidate, 20, 23);
  assert.deepEqual(omitted.slice(0, 20), full.targets.slice(0, 20));
  assert.equal(omitted[20], 0); assert.equal(omitted[21], 0.4);
});

test("all145 inherited paths are prefix causal and baseline agrees with production", () => {
  const source = bars(140).map((bar, index) => {
    const close = 100 + 15 * Math.sin(index * 0.37) + 3 * Math.cos(index * 0.11);
    return { ...bar, open: close - Math.sin(index), close, high: close + 2, low: close - 2 };
  });
  const decisions = new Map<number, StrategyCycleRecentSignal[]>([[24, buy], [32, [{ ...reduce[0]!, targetAllocation: 0 }]],
    [50, buy], [65, [{ ...reduce[0]!, targetAllocation: 0 }]]]);
  const context = new DualContext(source), partial = new DualContext(source.slice(0, 100));
  const baseline = dualReplay(context, decisions, 20, dualBaseline, true);
  for (const candidate of [...dualMenu(), ...extensionMenu().slice(1)]) {
    const full = dualReplay(context, decisions, 20, candidate, true), prefix = dualReplay(partial, decisions, 20, candidate, true);
    assert.deepEqual(full.targets.slice(0, 100), prefix.targets); assert.deepEqual(full.daily.slice(0, 80), prefix.daily);
    const fork = dualReplay(context, decisions, 20, candidate, true, 101);
    assert.deepEqual(fork.targets.slice(0, 101), baseline.targets.slice(0, 101));
  }
  const production = new SmaPositionOverlay(source, DEFAULT_POSITION_OVERLAY_OPTIONS);
  for (let index = 20; index < source.length; index++) {
    const signals = decisions.get(index) ?? [], direction = strategyCycleSignalDirection(signals);
    if (direction) production.request(direction, signals.at(-1)!.targetAllocation, index);
    assert.equal(baseline.targets[index], production.close(index, signals.length > 0));
  }
});
