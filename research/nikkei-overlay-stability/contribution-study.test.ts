import assert from "node:assert/strict";
import test from "node:test";
import { contributionEffects, contributionReplay, validateContributionCache } from "./contribution-study";
import { strategyCycleRecentSignals, type StrategyCycleRecentSignal, type StrategyCycleSelectionSnapshot } from "../../lib/analysis/strategy-cycle-validation";
import { ATR_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import type { MarketBar } from "../../lib/market/types";

const bars = Array.from({ length: 90 }, (_, index) => ({ time: String(index), open: 100, close: 100 + 12 * Math.sin(index / 4),
  high: 115, low: 85 }) as MarketBar);
const buy: StrategyCycleRecentSignal = { direction: "increase", targetAllocation: 0.4, signals: ["long-entry"] };
const sell: StrategyCycleRecentSignal = { direction: "reduce", targetAllocation: 0, signals: ["long-exit"] };

test("contribution arithmetic retains interaction and sums only relative to the fixed raw control", () => {
  const effects = contributionEffects(10, 40, 15, 30);
  assert.equal(effects.selectionRaw, -5); assert.equal(effects.selectionCovered, 10);
  assert.equal(effects.interaction, 15);
  assert.equal(effects.symmetricSelection + effects.symmetricOverlay, 25);
  assert.equal(effects.combinedVersusFixedRaw, 25);
});

test("raw inherited account preserves reduce-then-increase holds and increase-then-reduce exits", () => {
  const decisions = new Map([[20, [buy]], [21, [sell, { ...buy, targetAllocation: 1 }]], [22, [buy, sell]]]);
  const path = contributionReplay(bars, decisions, 20);
  assert.deepEqual(path.targets.slice(20, 23), [0.4, 0.4, 0]);
  assert.equal(path.diagnostics.conflictHoldDays, 1); assert.equal(path.diagnostics.originalSignalDays, 3);
  assert.equal(path.diagnostics.extraEntries, 0); assert.equal(path.diagnostics.targetChanges, 2);
});

test("covered and raw accounting preserve completed prefixes and do not borrow future decisions", () => {
  const decisions = new Map([[25, [buy]], [30, [sell]], [45, [buy]], [65, [sell]]]);
  for (const options of [undefined, DEFAULT_POSITION_OVERLAY_OPTIONS]) {
    const full = contributionReplay(bars, decisions, 20, options), prefix = contributionReplay(bars.slice(0, 60), decisions, 20, options);
    assert.deepEqual(full.targets.slice(0, 60), prefix.targets); assert.deepEqual(full.daily.slice(0, 40), prefix.daily);
  }
});

test("fixed-plan two-bar signals use only the available prefix despite a frozen plan", () => {
  const snapshot: StrategyCycleSelectionSnapshot = { decisionIndex: 40, decisionTime: "40", screeningWindow: 10,
    fixedRelativeLongStrategy: null, label: "preset", plan: {
      strategyA: { strategyId: "sma-cross", parameters: { fast: 10, slow: 30 } }, strategyB: null,
      strategyAAllocation: 1, strategyBAllocation: 0,
    } };
  for (const index of [40, 50, 60]) assert.deepEqual(strategyCycleRecentSignals(bars, snapshot, index),
    strategyCycleRecentSignals(bars.slice(0, index + 1), snapshot, index));
});

test("fixed-signal progress reuses ordered prefixes and rejects source, code, control and index drift", () => {
  const saved = { sourceHash: "source", implementationHash: "code", controls: [{ id: "first", rows: [{ index: 20, signals: [] }] }] };
  assert.doesNotThrow(() => validateContributionCache(saved, "source", "code", ["first"], [20, 25]));
  assert.throws(() => validateContributionCache(saved, "changed", "code", ["first"], [20, 25]));
  assert.throws(() => validateContributionCache(saved, "source", "changed", ["first"], [20, 25]));
  assert.throws(() => validateContributionCache(saved, "source", "code", ["simple"], [20, 25]));
  assert.throws(() => validateContributionCache(saved, "source", "code", ["first"], [25, 20]));
});
