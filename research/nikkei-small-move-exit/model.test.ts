import assert from "node:assert/strict";
import test from "node:test";
import { SmaPositionOverlay, RSI_SHAPE_POSITION_OVERLAY_OPTIONS, BIAS_ADD_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import { strategyCycleSignalDirection, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";
import type { BacktestSettings } from "../../lib/analysis/backtest";
import { policies, amplitude, replay, RiskFeatures, validateProgress, type Policy, type Replay } from "./model";

const settings: BacktestSettings = { initialCash: 100000, commissionRate: .0003, slippageRate: .0002, interval: "1d" };
const bars: MarketBar[] = Array.from({ length: 320 }, (_, i) => {
  const close = 100 + i * .1;
  return { time: new Date(Date.UTC(2020, 0, i + 1)).toISOString().slice(0, 10), timestamp: Date.UTC(2020, 0, i + 1),
    open: close, close, high: close + .2, low: close - .2, volume: 100, amount: 100 * close,
    amplitude: 0, change: 0, changePercent: 0, turnoverRate: 0 };
});
const falling = bars.map((bar, i) => {
  const close = i < 210 ? bar.close : bars[209].close - (i - 209) * .1;
  return { ...bar, open: close, close, high: close + .2, low: close - .2 };
});
const signal = (direction: "increase" | "reduce", targetAllocation: number): StrategyCycleRecentSignal[] =>
  [{ direction, targetAllocation, signals: [direction === "increase" ? "long-entry" : "long-exit"] }];
const policy = (kind: "cost" | "range", threshold: number) => policies().find((row) => row.kind === kind && row.threshold === threshold)!;
function seed(selected: Policy, sample = falling, allocation = 1): Replay {
  const native = new SmaPositionOverlay(sample, RSI_SHAPE_POSITION_OVERLAY_OPTIONS, allocation, 1);
  const close = sample[240].close;
  return { targets: sample.map((_, i) => i >= 200 && i <= 239 ? allocation : 0), events: [], fills: [], cursor: {
    index: 239, policy: selected, overlayModel: RSI_SHAPE_POSITION_OVERLAY_OPTIONS.model!,
    overlay: { ...native.checkpoint(), entryIndex: 200, entryClose: sample[200].close, lastClosedIndex: 239, flatStart: null },
    account: { cash: 100000 * (1 - allocation), units: 100000 * allocation / sample[239].close },
    planned: allocation, previousTarget: allocation,
    episode: { index: 200, cost: close / 1.01, high: close + .2, low: close - .2 } } };
}

test("two definitions and exact21-case grid distinguish roundtrip-to-cost from accumulated range", () => {
  assert.equal(policies().length, 21);
  const episode = { index: 0, cost: 100, high: 108, low: 98 };
  assert.ok(Math.abs(amplitude(episode, 101, "cost") - 1) < 1e-12);
  assert.equal(amplitude(episode, 101, "range"), 10);
  assert.equal(amplitude(episode, 100, "cost"), 0);
  assert.ok(Math.abs(amplitude(episode, 99, "cost") - 1) < 1e-12);
});
test("both bands protect only ordinary full exit, retain pending0 and real holding state", () => {
  for (const kind of ["cost", "range"] as const) {
    const selected = policy(kind, 2), prior = seed(selected), result = replay(new RiskFeatures(falling), new Map([[240, signal("reduce", 0)]]), 200, selected, settings, 241, prior);
    assert.equal(result.targets[240], 1); assert.equal(result.cursor.overlay.pending, 0);
    assert.equal(result.cursor.overlay.entryIndex, 200); assert.equal(result.cursor.overlay.entryClose, prior.cursor.overlay.entryClose);
    assert.equal(result.events.at(-1)!.blocked, true); assert.equal(result.events.at(-1)!.risk, false);
  }
});
test("exact threshold is not protected and partial sells never become full-exit gates", () => {
  const selected = policy("cost", 2), prior = seed(selected);
  prior.cursor.episode!.cost = falling[240].close / 1.02;
  const boundary = replay(new RiskFeatures(falling), new Map([[240, signal("reduce", 0)]]), 200, selected, settings, 241, prior);
  assert.equal(boundary.targets[240], 0); assert.equal(boundary.cursor.episode, null);
  const noShape = falling.map((bar, i) => ({ ...bar, high: 130 + i * .01 }));
  const partial = replay(new RiskFeatures(noShape), new Map([[240, signal("reduce", .5)]]), 200, policy("cost", 10), settings, 241, seed(policy("cost", 10), noShape));
  assert.equal(partial.targets[240], .5); assert.equal(partial.events.at(-1)!.blocked, false);
  assert.equal(partial.cursor.episode!.index, 200);
});
test("a pending protected liquidation is reconsidered after the live cost band is left", () => {
  const selected = policy("cost", 2), sample = falling.map((bar) => ({ ...bar })), prior = seed(selected, sample);
  const first = replay(new RiskFeatures(sample), new Map([[240, signal("reduce", 0)]]), 200, selected, settings, 241, prior);
  const close = prior.cursor.episode!.cost * .97;
  sample[241] = { ...sample[241], open: close, close, high: close + .2, low: close - .2 };
  const next = replay(new RiskFeatures(sample), new Map(), 200, selected, settings, 242, first);
  assert.equal(next.targets[241], 0); assert.equal(next.cursor.overlay.pending, null);
});
test("first economic entry includes costs and excludes pre-entry same-day highs/lows", () => {
  const sample = bars.map((bar) => ({ ...bar })); sample[230].high = 1000; sample[230].low = 1;
  const selected = policy("range", 2), first = replay(new RiskFeatures(sample), new Map([[230, signal("increase", 1)]]), 230, selected, settings, 231);
  assert.equal(first.cursor.episode!.index, 230);
  const fillPrice = sample[230].close * (1 + settings.slippageRate);
  assert.equal(first.cursor.episode!.cost, fillPrice * (1 + settings.commissionRate));
  assert.equal(first.cursor.episode!.high, fillPrice); assert.equal(first.cursor.episode!.low, fillPrice);
  const second = replay(new RiskFeatures(sample), new Map(), 230, selected, settings, 232, first);
  assert.equal(second.cursor.episode!.high, sample[231].high);
  assert.equal(second.cursor.episode!.low, Math.min(fillPrice, sample[231].low));
});
test("holding adds keep first-entry anchor, and native buy can cancel a protected pending exit", () => {
  const selected = policy("cost", 2), prior = seed(selected, bars, .3); prior.cursor.overlay.pending = 0;
  const result = replay(new RiskFeatures(bars), new Map([[240, signal("increase", 1)]]), 200, selected, settings, 241, prior);
  assert.equal(result.targets[240], 1); assert.equal(result.cursor.overlay.pending, null);
  assert.equal(result.cursor.episode!.cost, prior.cursor.episode!.cost);
  assert.equal(result.cursor.episode!.index, 200); assert.equal(result.cursor.overlay.entryIndex, 200);
});
test("native early4% stop and later ATR shock bypass both ten-percent protection bands", () => {
  for (const kind of ["cost", "range"] as const) for (const early of [true, false]) {
    const selected = policy(kind, 10), sample = bars.map((bar) => ({ ...bar }));
    const close = bars[239].close * (early ? .94 : .97);
    sample[240] = { ...sample[240], open: close, close, high: close + .1, low: close - .1 };
    const prior = seed(selected, sample);
    prior.cursor.episode = { index: 239, cost: bars[239].close, high: bars[239].close, low: bars[239].close };
    if (early) { prior.cursor.overlay.entryIndex = 239; prior.cursor.overlay.entryClose = bars[239].close; }
    const result = replay(new RiskFeatures(sample), new Map([[240, signal("increase", 1)]]), 200, selected, settings, 241, prior);
    assert.equal(result.targets[240], 0); assert.equal(result.events.at(-1)!.risk, true);
    assert.equal(result.events.at(-1)!.blocked, false); assert.equal(result.cursor.episode, null);
  }
});
test("baseline matches native state and every fixed case resumes controller/episode/cash causally", () => {
  const decisions = new Map([[230, signal("increase", 1)], [240, signal("reduce", 0)], [260, signal("increase", 1)]]);
  const features = new RiskFeatures(bars), native = new SmaPositionOverlay(bars, RSI_SHAPE_POSITION_OVERLAY_OPTIONS, 0, 1), targets = bars.map(() => 0);
  for (let i = 220; i < bars.length; i++) {
    const signals = decisions.get(i) ?? [], direction = strategyCycleSignalDirection(signals);
    if (direction) native.request(direction, signals.at(-1)!.targetAllocation, i);
    targets[i] = native.close(i, signals.length > 0);
  }
  const baseline = replay(features, decisions, 220, policies()[0], settings);
  assert.deepEqual(baseline.targets, targets); assert.deepEqual(baseline.cursor.overlay, native.checkpoint());
  for (const selected of policies()) {
    const complete = replay(features, decisions, 220, selected, settings), partial = replay(features, decisions, 220, selected, settings, 250);
    assert.deepEqual(replay(features, decisions, 220, selected, settings, bars.length, JSON.parse(JSON.stringify(partial))), complete);
    assert.deepEqual(replay(new RiskFeatures(bars.slice(0, 250)), decisions, 220, selected, settings).cursor, partial.cursor);
  }
  const wrongVersion = replay(features, decisions, 220, policies()[0], settings, 250);
  assert.throws(() => replay(features, decisions, 220, policies()[0], settings, 260, wrongVersion, DEFAULT_POSITION_OVERLAY_OPTIONS));
});
test("checkpoint hashes/identities/order, policy and input bounds fail explicitly", () => {
  validateProgress({ identity: "a", hash: "h", rows: [{ policy: "baseline" }] }, "a", "h");
  assert.throws(() => validateProgress({ identity: "a", hash: "h", rows: [] }, "b", "h"));
  assert.throws(() => validateProgress({ identity: "a", hash: "h", rows: [] }, "a", "x"));
  assert.throws(() => validateProgress({ identity: "a", hash: "h", rows: [{ policy: "cost-1" }] }, "a", "h"));
  assert.throws(() => replay(new RiskFeatures(bars), new Map(), 0, { id: "invalid", kind: "cost", threshold: 0 }, settings));
  assert.throws(() => new RiskFeatures(Array.from({ length: 10001 }, () => bars[0])));
});
