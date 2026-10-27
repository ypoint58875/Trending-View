import assert from "node:assert/strict";
import { test } from "node:test";
import { OscillatorContext, OscillatorAccount, oscillatorBaseline, oscillatorMenu, oscillatorEvidence, oscillatorSignal,
  oscillatorReplay, validateOscillatorProgress } from "./oscillator-entry-study";
import { SmaPositionOverlay, ENGULF_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import { strategyCycleSignalDirection, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";
import { FilterAccount, FilterContext, filterMenu, filterReplay } from "./oscillator-filter-study";
import { dualReplay } from "./dual-return-study";
import { applyFilterOnlyAt, omitFilteredEpisode } from "./oscillator-filter-audit";

function bars(length = 65): MarketBar[] {
  return Array.from({ length }, (_, index) => ({ time: String(index), open: 100, close: 100, high: 101, low: 99 }) as MarketBar);
}
function controlled() {
  const source = bars(); source[19] = { ...source[19]!, open: 86, close: 85, high: 86, low: 84 };
  source[20] = { ...source[20]!, open: 94, close: 95, high: 96, low: 94 };
  const context = new OscillatorContext(source);
  for (const type of ["EMA", "WMA", "SMA"] as const) {
    const feature = context.inner.features.get(type, type === "SMA" ? 11 : 7);
    feature.sign.fill(1); feature.slope.fill(0.001); feature.turns.fill(false);
  }
  context.inner.averages.get(20)!.fill(100); context.inner.e7.fill(90); context.inner.vSignal = () => false;
  context.rsi14.fill(50); context.rsi14[19] = 25; context.rsi14[20] = 42;
  context.bands.lower.fill(90); context.bands.upper.fill(110); context.bands.middle.fill(100);
  return context;
}
const policy = (id: string) => oscillatorMenu().find(candidate => candidate.id === id)!;
const buy: StrategyCycleRecentSignal[] = [{ direction: "increase", targetAllocation: 0.4, signals: ["long-entry"] }];
const reduce: StrategyCycleRecentSignal[] = [{ direction: "reduce", targetAllocation: 0, signals: ["long-exit"] }];

test("menu freezes61 unique native-plus-indicator cases with unchanged periods and no exit variants", () => {
  const menu = oscillatorMenu(); assert.equal(menu.length, 61); assert.equal(new Set(menu.map(row => row.id)).size, 61);
  assert.equal(new Set(menu.slice(1).map(row => row.profile)).size, 10);
  assert.equal(menu.filter(row => row.profile.startsWith("rsi")).length, 24);
  assert.equal(menu.filter(row => row.profile.startsWith("bb")).length, 24);
});

test("existing RSI14 and Bollinger20/2 preserve indicator prefixes and zero-band semantics", () => {
  const source = bars(110).map((bar, index) => ({ ...bar, close: 100 + 10 * Math.sin(index * 0.4) }));
  const full = new OscillatorContext(source), prefix = new OscillatorContext(source.slice(0, 80));
  assert.deepEqual(full.rsi14.slice(0, 80), prefix.rsi14);
  assert.deepEqual(full.bands.lower.slice(0, 80), prefix.bands.lower);
  assert.deepEqual(full.bands.upper.slice(0, 80), prefix.bands.upper);
  assert.equal(full.rsi14[13], null); assert.equal(full.bands.lower[18], null);
  assert.equal(oscillatorEvidence(new OscillatorContext(bars()), 30, 20).percentB, null);
});

test("historical oversold and band evidence exclude current, future and held observations", () => {
  const context = controlled(), evidence = oscillatorEvidence(context, 20, 18);
  assert.equal(evidence.minimumRsi, 25); assert.equal(evidence.closeBreach, true); assert.equal(evidence.percentB, 0.25);
  context.rsi14[20] = 10; context.bars[20]!.close = 75; context.rsi14[21] = 0; context.bars[21]!.close = 10;
  assert.equal(oscillatorEvidence(context, 20, 18).minimumRsi, 25);
  assert.equal(oscillatorEvidence(context, 20, 20).minimumRsi, null);
  assert.equal(oscillatorEvidence(context, 20, 20).closeBreach, false);
  assert.equal(oscillatorEvidence(context, 31, 18).minimumRsi, 0);
  assert.equal(oscillatorEvidence(context, 32, 18).minimumRsi, 50);
});

test("RSI repair requires reclaim and improvement, while band profiles require price repair", () => {
  const context = controlled(); assert.equal(oscillatorSignal("rsi30-40", oscillatorEvidence(context, 20, 18)), true);
  context.rsi14[20] = 29;
  assert.equal(oscillatorSignal("rsi30-30", oscillatorEvidence(context, 20, 18)), false);
  context.rsi14[20] = 40; context.rsi14[19] = 45; context.rsi14[18] = 25;
  assert.equal(oscillatorSignal("rsi30-40", oscillatorEvidence(context, 20, 18)), false);
  context.bars[20]!.close = 90;
  assert.equal(oscillatorSignal("bb-close0", oscillatorEvidence(context, 20, 18)), true);
  assert.equal(oscillatorSignal("bb-close25", oscillatorEvidence(context, 20, 18)), false);
  context.bars[20]!.close = 100;
  assert.equal(oscillatorSignal("bb-close50", oscillatorEvidence(context, 20, 18)), true);
  context.bars[20]!.close = 84;
  assert.equal(oscillatorSignal("bb-close0", oscillatorEvidence(context, 20, 18)), false);
});

test("unknown or zero-width evidence disables only that indicator and AND/OR stay distinct", () => {
  const context = controlled(); context.bands.upper[20] = 90;
  let evidence = oscillatorEvidence(context, 20, 18);
  assert.equal(evidence.percentB, null); assert.equal(oscillatorSignal("both", evidence), false);
  assert.equal(oscillatorSignal("either", evidence), true);
  context.bands.upper[20] = 110; context.rsi14[20] = null;
  evidence = oscillatorEvidence(context, 20, 18);
  assert.equal(oscillatorSignal("rsi30-30", evidence), false);
  assert.equal(oscillatorSignal("both", evidence), false); assert.equal(oscillatorSignal("either", evidence), true);
});

test("past intraday lower-band touch is not silently treated as a completed close breach", () => {
  const context = controlled(); context.bars[19]!.close = 95; context.bars[19]!.low = 85; context.bars[20]!.close = 96;
  const evidence = oscillatorEvidence(context, 20, 18);
  assert.equal(evidence.closeBreach, false); assert.equal(evidence.lowTouch, true);
  assert.equal(oscillatorSignal("bb-close25", evidence), false); assert.equal(oscillatorSignal("bb-low25", evidence), true);
});

test("scope and EMA confirmations apply only to new indicator entries, not native entries", () => {
  const context = controlled(); context.inner.features.get("EMA", 7).sign[20] = -1;
  assert.equal(new OscillatorAccount(context, policy("rsi30-40-below-wma"), 18).step(20, []).added, true);
  assert.equal(new OscillatorAccount(context, policy("rsi30-40-below-ema1"), 18).step(20, []).target, 0);
  context.inner.features.get("EMA", 7).sign[20] = 1; context.inner.features.get("EMA", 7).sign[19] = -1;
  assert.equal(new OscillatorAccount(context, policy("rsi30-40-below-ema3"), 18).step(20, []).target, 0);
  assert.equal(new OscillatorAccount(context, policy("rsi30-40-below-ema3"), 18).step(20, buy).target, 0.4);
  context.bars[20]!.close = 105;
  assert.equal(new OscillatorAccount(context, policy("rsi30-40-below-wma"), 18).step(20, []).target, 0);
  assert.equal(new OscillatorAccount(context, policy("rsi30-40-any-wma"), 18).step(20, []).target, 1);
});

test("all original sequences veto extras and native engulfing/turn keep priority", () => {
  const context = controlled(), candidate = policy("bb-close25-below-ema1");
  for (const signals of [reduce, [...reduce, ...buy], [...buy, ...reduce]]) {
    const state = new OscillatorAccount(context, candidate, 18).step(20, signals);
    assert.equal(state.target, 0); assert.equal(state.added, false);
  }
  context.inner.vSignal = () => true;
  assert.equal(new OscillatorAccount(context, candidate, 18).step(20, []).kind, "native-engulf");
  context.inner.vSignal = () => false; context.inner.averages.get(20)![20] = 94;
  context.inner.features.get("EMA", 7).turns[20] = true;
  assert.equal(new OscillatorAccount(context, candidate, 18).step(20, []).kind, "native-turn");
});

test("new indicator entries retain the original hold7 and pending reduction semantics", () => {
  const context = controlled(), account = new OscillatorAccount(context, policy("bb-close25-below-ema1"), 18);
  assert.equal(account.step(20, []).added, true);
  for (let index = 21; index <= 27; index++) {
    context.bars[index]!.close = 94; context.inner.features.get("WMA", 7).sign[index] = -1;
    context.inner.features.get("SMA", 11).slope[index] = -0.001;
    assert.equal(account.step(index, index === 21 ? reduce : []).target, index < 27 ? 1 : 0);
    if (index < 27) assert.equal(account.account.enteredAt, 20);
  }
});

test("native stop cooldown and actual stopped allocation recovery cannot become extra full entries", () => {
  const context = controlled(), account = new OscillatorAccount(context, policy("bb-close25-below-ema1"), 18);
  assert.equal(account.step(20, buy).target, 0.4);
  context.bars[21]!.close = 90; assert.equal(account.step(21, []).cut, true);
  for (let index = 22; index <= 26; index++) assert.equal(account.step(index, buy).target, 0);
  const recovered = account.step(27, []);
  assert.equal(recovered.target, 0.4); assert.equal(recovered.kind, "native-recovery"); assert.equal(recovered.added, false);
});

test("indicator rules never add to holdings and omission keeps original entries enabled", () => {
  const context = controlled(), candidate = policy("rsi30-40-below-ema1");
  const account = new OscillatorAccount(context, candidate, 18);
  assert.equal(account.step(20, buy).target, 0.4); assert.equal(account.step(21, []).target, 0.4);
  const decisions = new Map<number, StrategyCycleRecentSignal[]>([[21, buy]]);
  const full = oscillatorReplay(context, decisions, 18, candidate);
  const omitted = oscillatorReplay(context, decisions, 18, candidate, false, 18, index => index !== 20);
  assert.deepEqual(full.targets.slice(0, 20), omitted.targets.slice(0, 20));
  assert.equal(full.targets[20], 1); assert.equal(omitted.targets[20], 0); assert.equal(omitted.targets[21], 0.4);
});

test("scalar progress rejects source/code/order/config drift but accepts ordered completed prefixes", () => {
  const menu = oscillatorMenu(), saved = { sourceHash: "source", implementationHash: "code", rows: menu.slice(0, 12).map(policy => ({ policy })) };
  assert.doesNotThrow(() => validateOscillatorProgress(saved, "source", "code", menu));
  assert.throws(() => validateOscillatorProgress(saved, "other", "code", menu));
  assert.throws(() => validateOscillatorProgress(saved, "source", "other", menu));
  assert.throws(() => validateOscillatorProgress({ ...saved, rows: [...saved.rows].reverse() }, "source", "code", menu));
  assert.throws(() => validateOscillatorProgress({ ...saved, rows: [{ policy: { ...menu[0]!, scope: "any" } }] }, "source", "code", menu));
});

test("all61 paths preserve causal prefixes and baseline matches production", () => {
  const source = bars(140).map((bar, index) => {
    const close = 100 + 15 * Math.sin(index * 0.37) + 2 * Math.cos(index * 0.17);
    return { ...bar, open: close - Math.sin(index), close, high: close + 2, low: close - 2 };
  });
  const decisions = new Map<number, StrategyCycleRecentSignal[]>([[25, buy], [35, reduce], [52, buy], [66, reduce]]);
  const context = new OscillatorContext(source), partial = new OscillatorContext(source.slice(0, 100));
  const baseline = oscillatorReplay(context, decisions, 20, oscillatorBaseline, true);
  for (const candidate of oscillatorMenu()) {
    const full = oscillatorReplay(context, decisions, 20, candidate, true), prefix = oscillatorReplay(partial, decisions, 20, candidate, true);
    assert.deepEqual(full.targets.slice(0, 100), prefix.targets); assert.deepEqual(full.daily.slice(0, 80), prefix.daily);
    const fork = oscillatorReplay(context, decisions, 20, candidate, false, 101);
    assert.deepEqual(fork.targets.slice(0, 101), baseline.targets.slice(0, 101));
  }
  const production = new SmaPositionOverlay(source, DEFAULT_POSITION_OVERLAY_OPTIONS);
  for (let index = 20; index < source.length; index++) {
    const signals = decisions.get(index) ?? [], direction = strategyCycleSignalDirection(signals);
    if (direction) production.request(direction, signals.at(-1)!.targetAllocation, index);
    assert.equal(baseline.targets[index], production.close(index, signals.length > 0));
  }
});

function filterControlled() {
  const context = new FilterContext(controlled().bars);
  for (const type of ["EMA", "WMA", "SMA"] as const) {
    const feature = context.inner.features.get(type, type === "SMA" ? 11 : 7);
    feature.sign.fill(1); feature.slope.fill(0.001); feature.turns.fill(false);
  }
  context.inner.features.get("EMA", 7).turns[20] = true;
  context.inner.averages.get(20)!.fill(100); context.inner.e7.fill(90); context.inner.vSignal = () => false;
  context.oscillators.rsi14.fill(50); context.oscillators.rsi14[19] = 25; context.oscillators.rsi14[20] = 42;
  return context;
}
const filterPolicy = () => filterMenu().find(candidate => candidate.id === "turn4-baseline-rsi35-40")!;

test("filter menu freezes23 cases and every unfiltered control matches its existing account", () => {
  const menu = filterMenu(), context = filterControlled(), decisions = new Map<number, StrategyCycleRecentSignal[]>();
  assert.equal(menu.length, 23); assert.equal(new Set(menu.map(candidate => candidate.id)).size, 23);
  for (const candidate of menu.filter(candidate => candidate.profile === "off")) {
    assert.deepEqual(filterReplay(context, decisions, 18, candidate).targets,
      dualReplay(context, decisions, 18, candidate.entry).targets);
  }
});

test("RSI filter gates only the rebound exception and preserves every native entry priority", () => {
  const context = filterControlled(), candidate = filterPolicy();
  assert.equal(new FilterAccount(context, candidate, 18).step(20, []).added, true);
  context.oscillators.rsi14[19] = 40; context.oscillators.rsi14[20] = 50;
  assert.equal(new FilterAccount(context, candidate, 18).step(20, []).target, 0);
  assert.equal(new FilterAccount(context, { ...candidate, profile: "off" }, 18).step(20, []).added, true);
  assert.equal(new FilterAccount(context, candidate, 18).step(20, buy).target, 0.4);
  for (const signals of [reduce, [...buy, ...reduce], [...reduce, ...buy]]) {
    assert.equal(new FilterAccount(context, candidate, 18).step(20, signals).target, 0);
  }
  context.inner.vSignal = () => true;
  assert.equal(new FilterAccount(context, candidate, 18).step(20, []).kind, "native-engulf");
  context.inner.vSignal = () => false; context.inner.averages.get(20)![20] = 94;
  assert.equal(new FilterAccount(context, candidate, 18).step(20, []).kind, "native-turn");
});

test("all23 filter targets preserve causal prefixes and unchanged common-state history", () => {
  const source = bars(140).map((bar, index) => ({ ...bar, close: 100 + 15 * Math.sin(index * 0.37) }));
  const context = new FilterContext(source), partial = new FilterContext(source.slice(0, 100));
  const decisions = new Map<number, StrategyCycleRecentSignal[]>([[25, buy], [35, reduce], [52, buy], [66, reduce]]);
  const baseline = filterReplay(context, decisions, 20, filterMenu()[0]!);
  for (const candidate of filterMenu()) {
    const full = filterReplay(context, decisions, 20, candidate, true), prefix = filterReplay(partial, decisions, 20, candidate, true);
    assert.deepEqual(full.targets.slice(0, 100), prefix.targets); assert.deepEqual(full.daily.slice(0, 80), prefix.daily);
    assert.deepEqual(filterReplay(context, decisions, 20, candidate, false, 101).targets.slice(0, 101), baseline.targets.slice(0, 101));
  }
});

test("retrospective omission and one-date filtering preserve original entries and earlier targets", () => {
  const context = filterControlled(), candidate = filterPolicy();
  const decisions = new Map<number, StrategyCycleRecentSignal[]>([[21, buy]]);
  const full = filterReplay(context, decisions, 18, candidate);
  const omitted = omitFilteredEpisode(context, decisions, 18, candidate, 20, 22);
  assert.equal(full.targets[20], 1); assert.equal(omitted[20], 0); assert.equal(omitted[21], 0.4);
  assert.deepEqual(omitted.slice(0, 20), full.targets.slice(0, 20));
  context.oscillators.rsi14[19] = 40; context.oscillators.rsi14[20] = 50;
  const isolated = applyFilterOnlyAt(context, decisions, 18, candidate, 20);
  assert.equal(isolated[20], 0); assert.equal(isolated[21], 0.4);
  assert.throws(() => applyFilterOnlyAt(context, decisions, 18, candidate, 17));
  assert.throws(() => omitFilteredEpisode(context, decisions, 18, candidate, 20, 19));
});
