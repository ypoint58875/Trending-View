import assert from "node:assert/strict";
import { test } from "node:test";
import { causalFlatLow, FallbackAccount, FallbackContext, fallbackBaseline, fallbackMenu, replayFallback } from "./sma20-fallback";
import { backgroundAuditMenu, drawdownDates } from "./sma20-fallback-audit";
import { SmaPositionOverlay, ENGULF_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import { strategyCycleSignalDirection, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { ema } from "../../lib/analysis/indicators";
import type { MarketBar } from "../../lib/market/types";

function bars(length = 55): MarketBar[] {
  return Array.from({ length }, (_, index) => ({ time: String(index), open: 100, high: 101, low: 99, close: 100 }) as MarketBar);
}
function controlled() {
  const source = bars(); source[19] = { ...source[19]!, close: 90, open: 91, high: 92, low: 89 };
  source[20] = { ...source[20]!, close: 95, open: 94, high: 96, low: 93 };
  const context = new FallbackContext(source);
  for (const type of ["EMA", "WMA", "SMA"] as const) {
    const feature = context.inner.features.get(type, type === "SMA" ? 11 : 7);
    feature.sign.fill(1); feature.slope.fill(0.001); feature.turns.fill(false);
  }
  context.inner.averages.get(20)!.fill(100); context.inner.vSignal = () => false;
  return context;
}
const buy: StrategyCycleRecentSignal[] = [{ direction: "increase", targetAllocation: 0.4, signals: ["long-entry"] }];
const reduce: StrategyCycleRecentSignal[] = [{ direction: "reduce", targetAllocation: 0, signals: ["long-exit"] }];
const policy = (id: string) => fallbackMenu().find(candidate => candidate.id === id)!;

test("twenty frozen cases change price entrances only and EMA7 price confirmation is redundant", () => {
  const menu = fallbackMenu(); assert.equal(menu.length, 20); assert.equal(new Set(menu.map(row => row.id)).size, 20);
  assert.equal(menu.filter(row => row.kind === "fallback").length, 12);
  const closes = [100, 90, 95, 93, 100, 88, 99, 101, 97, 104], average = ema(closes, 7);
  for (let index = 7; index < closes.length; index++)
    assert.equal(average[index]! > average[index - 1]!, closes[index]! > average[index]!);
});

test("causal low excludes today and future, stays inside flat history and uses a pre-low peak", () => {
  const source = controlled().bars;
  assert.equal(causalFlatLow(source, 20, 20), null);
  const low = causalFlatLow(source, 20, 18)!;
  assert.equal(low.lowIndex, 19); assert.equal(low.low, 90); assert.equal(low.peak, 100);
  source[20]!.close = 80; source[21]!.close = 50;
  assert.equal(causalFlatLow(source, 20, 18)!.low, 90);
  assert.equal(causalFlatLow(source, 21, 18)!.low, 80);
  source[21]!.close = 90;
  assert.equal(causalFlatLow(source, 22, 18)!.lowIndex, 20);
  assert.equal(causalFlatLow(source, 22, 21)!.lowIndex, 21);
  assert.equal(causalFlatLow(source, 32, 18)!.lowIndex, 31);
});

test("fallback enters below SMA20 without a new EMA turn, while hybrid cannot", () => {
  const context = controlled();
  const base = new FallbackAccount(context, fallbackBaseline, 18);
  const fallback = new FallbackAccount(context, policy("fallback-below-trend-x3"), 18);
  const hybrid = new FallbackAccount(context, policy("hybrid-x3"), 18);
  assert.equal(base.step(20, []).target, 0); assert.equal(hybrid.step(20, []).target, 0);
  const state = fallback.step(20, []);
  assert.equal(state.target, 1); assert.equal(state.kind, "fallback"); assert.equal(state.originalGate, false);
  assert.equal(context.inner.features.get("EMA", 7).turns[20], false);
});

test("hybrid and replacement change only the natural turn price filter", () => {
  const context = controlled(); context.inner.features.get("EMA", 7).turns[20] = true; context.ema20[20] = 94;
  assert.equal(new FallbackAccount(context, fallbackBaseline, 18).step(20, []).target, 0);
  assert.equal(new FallbackAccount(context, policy("hybrid-x3"), 18).step(20, []).kind, "relaxed-turn");
  assert.equal(new FallbackAccount(context, policy("replace-ema20"), 18).step(20, []).target, 1);
  context.inner.features.get("WMA", 7).sign[20] = -1;
  assert.equal(new FallbackAccount(context, policy("replace-none"), 18).step(20, []).target, 0);
});

test("missing decline, threshold, trend or price confirmation prevents a rebound entrance", () => {
  const context = controlled(); context.bars[19]!.close = 97;
  assert.equal(new FallbackAccount(context, policy("fallback-below-trend-x3"), 18).step(20, []).target, 0);
  context.bars[19]!.close = 90; context.bars[20]!.close = 92;
  assert.equal(new FallbackAccount(context, policy("fallback-below-trend-x3"), 18).step(20, []).target, 0);
  context.bars[20]!.close = 95; context.bars[19]!.high = 96;
  assert.equal(new FallbackAccount(context, policy("fallback-below-high-x3"), 18).step(20, []).target, 0);
  context.inner.features.get("EMA", 7).sign[20] = -1;
  assert.equal(new FallbackAccount(context, policy("fallback-below-trend-x3"), 18).step(20, []).target, 0);
});

test("below-only and any-missed scope differ above SMA20 and never add to existing holdings", () => {
  const context = controlled(); context.bars[20]!.close = 101;
  assert.equal(new FallbackAccount(context, policy("fallback-below-trend-x3"), 18).step(20, []).target, 0);
  assert.equal(new FallbackAccount(context, policy("fallback-any-trend-x3"), 18).step(20, []).target, 1);
  const account = new FallbackAccount(context, policy("fallback-any-trend-x3"), 18);
  assert.equal(account.step(19, buy).target, 0.4);
  assert.equal(account.step(20, []).target, 0.4);
});

test("an explicitly weaker decline background is a separate policy rather than a hidden gate change", () => {
  const context = controlled(); context.bars[19]!.close = 96; context.bars[20]!.close = 99;
  const original = policy("fallback-below-trend-x3");
  assert.equal(new FallbackAccount(context, original, 18).step(20, []).target, 0);
  assert.equal(new FallbackAccount(context, { ...original, decline: 0.03 }, 18).step(20, []).target, 1);
  assert.equal(original.decline, 0.05);
});

test("post-result audit freezes six background comparisons and computes dated actual-equity drawdowns", () => {
  const additions = backgroundAuditMenu(); assert.equal(additions.length, 6);
  assert.equal(new Set(additions.map(row => row.id)).size, 6);
  for (const candidate of additions) {
    const original = fallbackMenu().find(row => `${row.id}-decline3` === candidate.id)!;
    assert.deepEqual({ ...candidate, id: original.id, decline: original.decline }, original);
  }
  const result = { equity: [{ time: "a", equity: 100 }, { time: "b", equity: 120 },
    { time: "c", equity: 90 }, { time: "d", equity: 110 }] } as Parameters<typeof drawdownDates>[0];
  assert.deepEqual(drawdownDates(result, 100), { drawdown: -25, peak: "b", trough: "c" });
  assert.deepEqual(drawdownDates(result, 100, 3), { drawdown: 0, peak: "c", trough: "c" });
});

test("all original sequences block fallback and native engulfing keeps its own classification", () => {
  const context = controlled();
  for (const signals of [reduce, [...reduce, ...buy], [...buy, ...reduce]]) {
    const state = new FallbackAccount(context, policy("fallback-below-trend-x3"), 18).step(20, signals);
    assert.equal(state.target, 0); assert.equal(state.added, false);
  }
  assert.equal(new FallbackAccount(context, policy("fallback-below-trend-x3"), 18).step(20, buy).target, 0.4);
  context.inner.vSignal = () => true;
  const native = new FallbackAccount(context, policy("fallback-below-trend-x3"), 18).step(20, []);
  assert.equal(native.kind, "native-engulf"); assert.equal(native.added, false);
});

test("the existing five-bar stop cooldown and native trend recovery cannot be bypassed", () => {
  const context = controlled(), account = new FallbackAccount(context, policy("fallback-any-trend-x3"), 18);
  context.bars[20]!.close = 100;
  assert.equal(account.step(20, buy).target, 0.4);
  context.bars[21]!.close = 95;
  assert.equal(account.step(21, []).cut, true);
  for (let index = 22; index <= 26; index++) {
    context.bars[index]!.close = 100;
    assert.equal(account.step(index, []).target, 0);
  }
  context.inner.e7[27] = 99;
  const recovered = account.step(27, []);
  assert.equal(recovered.kind, "native-recovery"); assert.equal(recovered.target, 0.4); assert.equal(recovered.added, false);
});

test("fallback keeps original hold7 and entry marks instead of inventing faster exits", () => {
  const context = controlled(), account = new FallbackAccount(context, policy("fallback-below-trend-x3"), 18);
  assert.equal(account.step(20, []).target, 1);
  for (let index = 21; index <= 27; index++) {
    context.bars[index]!.close = 94;
    context.inner.features.get("WMA", 7).sign[index] = -1;
    context.inner.features.get("SMA", 11).slope[index] = -0.001;
    assert.equal(account.step(index, index === 21 ? reduce : []).target, index < 27 ? 1 : 0);
    if (index < 27) assert.equal(account.account.enteredAt, 20);
  }
});

test("baseline matches production and all twenty-six policies preserve daily causal prefixes", () => {
  const source = bars(120).map((bar, index) => {
    const close = 100 + 12 * Math.sin(index * 0.43) + 4 * Math.cos(index * 0.17);
    return { ...bar, open: close - Math.sin(index), close, high: close + 2, low: close - 2 };
  });
  const decisions = new Map<number, StrategyCycleRecentSignal[]>([[25, buy], [31, reduce], [55, buy], [67, reduce]]);
  const fullContext = new FallbackContext(source), prefixContext = new FallbackContext(source.slice(0, 87));
  for (const candidate of [...fallbackMenu(), ...backgroundAuditMenu()]) {
    const full = replayFallback(fullContext, decisions, 20, candidate);
    const prefix = replayFallback(prefixContext, decisions, 20, candidate);
    assert.deepEqual(full.targets.slice(0, 87), prefix.targets);
    assert.deepEqual(full.daily.slice(0, 67), prefix.daily);
    const delayed = replayFallback(fullContext, decisions, 20, candidate, 88);
    const baseline = replayFallback(fullContext, decisions, 20, fallbackBaseline);
    assert.deepEqual(delayed.targets.slice(0, 88), baseline.targets.slice(0, 88));
  }
  const baseline = replayFallback(fullContext, decisions, 20, fallbackBaseline);
  const production = new SmaPositionOverlay(source, DEFAULT_POSITION_OVERLAY_OPTIONS);
  for (let index = 20; index < source.length; index++) {
    const signals = decisions.get(index) ?? [], direction = strategyCycleSignalDirection(signals);
    if (direction) production.request(direction, signals.at(-1)!.targetAllocation, index);
    assert.equal(baseline.targets[index], production.close(index, signals.length > 0));
  }
});
