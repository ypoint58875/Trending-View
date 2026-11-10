import assert from "node:assert/strict";
import test from "node:test";
import { SmaPositionOverlay, BIAS_ADD_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import type { MarketBar } from "../../lib/market/types";
import type { BacktestSettings } from "../../lib/analysis/backtest";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { policies as priorPolicies, replay as priorReplay } from "../nikkei-small-move-exit/model";
import { POLICIES, replay, RiskFeatures, validateProgress, type Decision, type Policy, type Replay } from "./model";
import { diagnose } from "./report";

const settings: BacktestSettings = { initialCash: 100000, commissionRate: .0003, slippageRate: .0002, interval: "1d" };
const bars: MarketBar[] = Array.from({ length: 320 }, (_, i) => {
  const close = 100 + i * .1;
  return { time: new Date(Date.UTC(2020, 0, i + 1)).toISOString().slice(0, 10), timestamp: Date.UTC(2020, 0, i + 1),
    open: close, close, high: close + .2, low: close - .2, volume: 100, amount: close * 100,
    amplitude: 0, change: 0, changePercent: 0, turnoverRate: 0 };
});
const falling = bars.map((bar, i) => {
  const close = i < 210 ? bar.close : bars[209].close - (i - 209) * .1;
  return { ...bar, open: close, close, high: close + .2, low: close - .2 };
});
const selected = (id: string) => POLICIES.find((policy) => policy.id === id)!;
const signal = (direction: "increase" | "reduce", targetAllocation: number): Decision =>
  ({ selection: "test-winner", signals: [{ direction, targetAllocation, signals: [direction === "increase" ? "long-entry" : "long-exit"] }] });
function seed(policy: Policy, sample = falling, allocation = 1): Replay {
  const account = new SmaPositionOverlay(sample, DEFAULT_POSITION_OVERLAY_OPTIONS, allocation, 1), close = sample[240].close;
  return { targets: sample.map((_, i) => i >= 200 && i <= 239 ? allocation : 0), events: [], fills: [], cursor: {
    index: 239, policy, model: DEFAULT_POSITION_OVERLAY_OPTIONS.model!,
    overlay: { ...account.checkpoint(), entryIndex: 200, entryClose: sample[200].close, lastClosedIndex: 239, flatStart: null },
    account: { cash: 100000 * (1 - allocation), units: 100000 * allocation / sample[239].close }, planned: allocation, previousTarget: allocation,
    episode: { index: 200, cost: close / 1.01, high: close + .2, low: close - .2 }, pending: null } };
}

test("explicit original clear is vetoed only in all-ordinary contract, not base-priority", () => {
  assert.equal(POLICIES.length, 5);
  for (const threshold of [3, 10]) for (const priority of [false, true]) {
    const policy = selected(`range${threshold}-${priority ? "base-priority" : "all"}`);
    const path = replay(new RiskFeatures(falling), new Map([[240, signal("reduce", 0)]]), 200, policy, settings, 241, seed(policy));
    assert.equal(path.events[0].exitSource, "base-clear"); assert.equal(path.events[0].blocked, !priority);
    assert.equal(path.targets[240], priority ? 0 : 1);
  }
});
test("necessary original pending clear retains precedence even on a quiet later date", () => {
  const sample = falling.map((bar, i) => ({ ...bar, high: 130 + i * .01 })), policy = selected("range10-base-priority"), before = seed(policy, sample);
  before.cursor.overlay.pending = 0; before.cursor.pending = { origin: "base", index: 230, selection: "earlier-winner" };
  const result = replay(new RiskFeatures(sample), new Map(), 200, policy, settings, 241, before);
  assert.equal(result.events[0].pendingNecessary, true); assert.equal(result.events[0].exitSource, "base-pending");
  assert.equal(result.targets[240], 0); assert.equal(result.cursor.pending, null);
});
test("redundant base pending cannot exempt an independent controller clear", () => {
  const policy = selected("range3-base-priority"), before = seed(policy);
  before.cursor.overlay.pending = 0; before.cursor.pending = { origin: "base", index: 230, selection: "earlier-winner" };
  const result = replay(new RiskFeatures(falling), new Map(), 200, policy, settings, 241, before);
  assert.equal(result.events[0].pendingNecessary, false); assert.equal(result.events[0].exitSource, "controller");
  assert.equal(result.events[0].blocked, true); assert.deepEqual(result.cursor.pending, before.cursor.pending);
});
test("base-priority preserves an accepted partial sell when native close adds a full exit", () => {
  for (const priority of [false, true]) {
    const policy = selected(`range3-${priority ? "base-priority" : "all"}`);
    const path = replay(new RiskFeatures(falling), new Map([[240, signal("reduce", .5)]]), 200, policy, settings, 241, seed(policy));
    assert.equal(path.events[0].requested.allocation, .5); assert.equal(path.events[0].native.allocation, 0);
    assert.equal(path.events[0].exitSource, "controller"); assert.equal(path.events[0].blocked, true);
    assert.equal(path.targets[240], priority ? .5 : 1); assert.equal(path.cursor.overlay.entryIndex, 200);
  }
});
test("native partial exits pass every contract and keep the episode anchor", () => {
  const sample = falling.map((bar, i) => ({ ...bar, high: 130 + i * .01 }));
  for (const policy of POLICIES) {
    const before = seed(policy, sample), path = replay(new RiskFeatures(sample), new Map([[240, signal("reduce", .5)]]), 200, policy, settings, 241, before);
    assert.equal(path.targets[240], .5); assert.equal(path.events[0].blocked, false);
    assert.equal(path.cursor.episode!.cost, before.cursor.episode!.cost);
  }
});
test("buy cancellation keeps priority even without an economic buy and ends a deferred spell", () => {
  const policy = selected("range3-all"), decisions = new Map([[240, signal("reduce", 0)], [241, signal("increase", 1)]]);
  const path = replay(new RiskFeatures(falling), decisions, 200, policy, settings, 242, seed(policy));
  assert.equal(path.events[0].blocked, true); assert.equal(path.targets[241], 1); assert.equal(path.fills.length, 0);
  assert.equal(path.cursor.overlay.pending, null); assert.equal(path.cursor.pending, null);
  const spells = diagnose(falling, path).spells; assert.equal(spells.length, 1);
  assert.equal(spells[0].outcome, "cancelled-by-increase"); assert.equal(spells[0].sessions, 1);
});
test("native holding protection is not bypassed by original-clear exemption", () => {
  const policy = selected("range10-base-priority"), before = seed(policy);
  before.cursor.overlay.lastSupplement = 238;
  const result = replay(new RiskFeatures(falling), new Map([[240, signal("reduce", 0)]]), 200, policy, settings, 241, before);
  assert.equal(result.targets[240], 1); assert.equal(result.events[0].blocked, false);
  assert.equal(result.cursor.overlay.pending, 0); assert.equal(result.cursor.pending!.origin, "base");
});
test("early4% and later ATR exits bypass every contract and terminate actual holding episode", () => {
  for (const policy of POLICIES) for (const early of [false, true]) {
    const sample = bars.map((bar) => ({ ...bar })), close = bars[239].close * (early ? .94 : .97);
    sample[240] = { ...sample[240], open: close, close, high: close + .1, low: close - .1 };
    const before = seed(policy, sample);
    before.cursor.episode = { index: 239, cost: bars[239].close, high: bars[239].close, low: bars[239].close };
    if (early) { before.cursor.overlay.entryIndex = 239; before.cursor.overlay.entryClose = bars[239].close; }
    const path = replay(new RiskFeatures(sample), new Map([[240, signal("increase", 1)]]), 200, policy, settings, 241, before);
    assert.equal(path.targets[240], 0); assert.equal(path.events[0].risk, true); assert.equal(path.events[0].blocked, false);
    assert.equal(path.cursor.episode, null);
  }
});
test("all-ordinary native/range3/range10 reproduce prior engine and all five cursors resume causally", () => {
  const originals = new Map<number, StrategyCycleRecentSignal[]>([[230, signal("increase", 1).signals], [240, signal("reduce", 0).signals], [260, signal("increase", 1).signals]]);
  const decisions = new Map([...originals].map(([index, signals]) => [index, { signals, selection: `winner-${index}` }])), features = new RiskFeatures(bars);
  for (const policy of POLICIES) {
    const full = replay(features, decisions, 220, policy, settings), part = replay(features, decisions, 220, policy, settings, 250);
    assert.deepEqual(replay(features, decisions, 220, policy, settings, bars.length, JSON.parse(JSON.stringify(part))), full);
    const prefix = replay(new RiskFeatures(bars.slice(0, 250)), decisions, 220, policy, settings);
    assert.deepEqual(prefix.cursor, part.cursor); assert.deepEqual(prefix.events, full.events.slice(0, 30));
    if (!policy.basePriority) {
      const old = priorPolicies().find((row) => policy.threshold ? row.kind === "range" && row.threshold === policy.threshold : row.kind === "baseline")!;
      const path = priorReplay(features, originals, 220, old, settings, bars.length, undefined, DEFAULT_POSITION_OVERLAY_OPTIONS);
      assert.deepEqual(full.targets, path.targets); assert.deepEqual(full.fills, path.fills); assert.deepEqual(full.cursor.overlay, path.cursor.overlay);
    }
  }
});
test("checkpoint policy/hash/identity and resource limits fail explicitly", () => {
  validateProgress({ identity: "a", hash: "h", rows: [{ policy: "baseline" }] }, "a", "h");
  assert.throws(() => validateProgress({ identity: "a", hash: "h", rows: [] }, "b", "h"));
  assert.throws(() => validateProgress({ identity: "a", hash: "h", rows: [] }, "a", "other"));
  assert.throws(() => validateProgress({ identity: "a", hash: "h", rows: [{ policy: "range3-all" }] }, "a", "h"));
  assert.throws(() => replay(new RiskFeatures(bars), new Map(), 0, { id: "unplanned", threshold: 4, basePriority: false }, settings));
  assert.throws(() => new RiskFeatures(Array.from({ length: 10001 }, () => bars[0])));
});
