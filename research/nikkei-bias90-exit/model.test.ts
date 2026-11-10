import assert from "node:assert/strict";
import test from "node:test";
import { Features, policies, combinedPolicies, weightedPolicies, scoreDecision, evaluate, replay } from "./model";
import { SmaPositionOverlay, RSI_SHAPE_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";

function bars(count = 700): MarketBar[] {
  return Array.from({ length: count }, (_, i) => {
    const close = 1000 + i * .5 + Math.sin(i / 11) * 20, timestamp = Date.UTC(2000, 0, i + 1);
    return { timestamp, time: new Date(timestamp).toISOString().slice(0, 10), open: close, high: close + 2, low: close - 2,
      close, volume: 100, amount: 0, amplitude: 0, changePercent: 0, change: 0, turnoverRate: 0 };
  });
}
const primary = policies().find((policy) => policy.id === "smooth-smooth-armed")!;

test("fixed12 policies distinguish falling positive speed, strict turns and negative speed", () => {
  assert.equal(new Set(policies().map((policy) => policy.id)).size, 12);
  assert.deepEqual(evaluate(6, 5, 80, 100, 110, primary, false), { armed: true, exit: true });
  assert.equal(evaluate(4, 5, 80, 100, 90, primary, true).exit, true);
  assert.equal(evaluate(4, 5, 80, 100, 90, { ...primary, mode: "same-day" }, true).exit, false);
  assert.equal(evaluate(6, 5, 80, 100, 110, { ...primary, trigger: "turn" }, false).exit, false);
  assert.equal(evaluate(6, 5, 80, 100, 90, { ...primary, trigger: "turn" }, false).exit, true);
  assert.equal(evaluate(6, 5, 80, 100, 90, { ...primary, trigger: "negative" }, false).exit, false);
  assert.equal(evaluate(6, 5, -.1, 1, 2, { ...primary, trigger: "negative" }, false).exit, true);
  assert.equal(evaluate(5, 5, 80, 100, 90, primary, false).exit, false);
  assert.equal(evaluate(null, null, null, null, null, primary, false).exit, false);
});

test("P90 excludes current observation and uses raw input with independent interpolation", () => {
  const input = bars(), features = new Features(input), i = 600;
  const previous = features.bias.raw.slice(0, i).filter((value): value is number => value !== null).sort((a, b) => a - b);
  const rank = (previous.length - 1) * .9, low = Math.floor(rank);
  assert.equal(features.p90[i], previous[low] + (previous[Math.ceil(rank)] - previous[low]) * (rank - low));
  const changed = structuredClone(input); changed[i].close *= 2;
  assert.equal(new Features(changed).p90[i], features.p90[i]);
});

test("armed exit clears account state immediately and bypasses the native holding protection", () => {
  const input = bars();
  for (let i = 450; i < input.length; i++) Object.assign(input[i], { close: 2000 + i, open: 2000 + i, high: 2002 + i, low: 1998 + i });
  const features = new Features(input);
  features.bias.smooth[500] = 6; features.bias.smooth[501] = 4;
  features.p90[500] = 5; features.p90[501] = 5;
  features.slope.smooth[499] = 90; features.slope.smooth[500] = 100; features.slope.smooth[501] = 80;
  const decisions = new Map<number, StrategyCycleRecentSignal[]>([[500, [{ signals: ["long-entry"], direction: "increase", targetAllocation: 1 }]]]);
  const result = replay(features, decisions, 500, primary, 502);
  assert.equal(result.targets[500], 1); assert.equal(result.targets[501], 0);
  assert.equal(result.exits.length, 1); assert.equal(result.exits[0].cancelledEntry, false);
  assert.equal(result.cursor.armed, false); assert.equal(result.cursor.state.recoveryTarget, null);
  assert.equal(result.cursor.state.pending, null); assert.equal(result.cursor.state.entryIndex, null);
  assert.equal(result.cursor.state.previousCloseAllocation, 0); assert.equal(result.cursor.state.flatStart, 501);
});

test("baseline preserves native state; all12 cases resume and ignore future observations", () => {
  const input = bars(), features = new Features(input), decisions = new Map<number, StrategyCycleRecentSignal[]>();
  for (let i = 300; i < 700; i += 31) decisions.set(i, [{ signals: ["long-entry"], direction: "increase", targetAllocation: 1 }]);
  const controller = new SmaPositionOverlay(input, DEFAULT_POSITION_OVERLAY_OPTIONS), targets = input.map(() => 0);
  for (let i = 300; i < input.length; i++) {
    const signals = decisions.get(i) ?? [];
    if (signals.length) controller.request("increase", 1, i);
    targets[i] = controller.close(i, signals.length > 0);
  }
  const baseline = replay(features, decisions, 300, policies()[0]);
  assert.deepEqual(baseline.targets, targets); assert.deepEqual(baseline.cursor.state, controller.checkpoint());
  assert.equal(combinedPolicies().length, 23);
  assert.equal(weightedPolicies().length, 37);
  for (const policy of [...policies(), ...combinedPolicies(), ...weightedPolicies()]) {
    const full = replay(features, decisions, 300, policy), partial = replay(features, decisions, 300, policy, 501);
    assert.deepEqual(replay(features, decisions, 300, policy, 700, JSON.parse(JSON.stringify(partial))), full);
    const prefix = replay(new Features(input.slice(0, 600)), decisions, 300, policy);
    assert.deepEqual(prefix.targets, full.targets.slice(0, 600));
  }
});

test("weighted context is one additive point, and ablation/scope/increase priority are explicit", () => {
  const score = { threshold: 4, contextWeight: 1 as const, scope: "native-intent" as const };
  assert.deepEqual(scoreDecision(true, true, true, false, false, false, score), { total: 4, exit: true });
  assert.deepEqual(scoreDecision(true, true, true, false, false, false, { ...score, contextWeight: 0 }), { total: 3, exit: false });
  assert.equal(scoreDecision(false, true, true, true, false, false, score).exit, true);
  assert.equal(scoreDecision(true, true, true, true, false, true, score).exit, false);
  assert.equal(scoreDecision(true, true, true, true, false, false, { ...score, scope: "executed-reduce" }).exit, false);
  assert.equal(scoreDecision(true, true, true, true, true, false, { ...score, scope: "executed-reduce" }).exit, true);
  assert.equal(scoreDecision(true, false, true, true, false, false, { ...score, threshold: 3 }).exit, false);
  assert.equal(scoreDecision(true, false, true, true, false, false, { ...score, threshold: 3, scope: "any" }).exit, true);
  assert.equal(new Set(weightedPolicies().map((policy) => policy.id)).size, 37);
});

test("half cap retains holding age; native guards preserve a rising protected position", () => {
  const input = bars();
  for (let i = 450; i < input.length; i++) Object.assign(input[i], { close: 2000 + i, open: 2000 + i, high: 2002 + i, low: 1998 + i });
  const features = new Features(input);
  for (const i of [500, 501]) { features.bias.raw[i] = 6; features.p90[i] = 5; }
  features.slope.smooth[499] = 90; features.slope.smooth[500] = 100; features.slope.smooth[501] = 80;
  features.ema7[501] = input[501].close + 1;
  const decisions = new Map<number, StrategyCycleRecentSignal[]>([[500, [{ signals: ["long-entry"], direction: "increase", targetAllocation: 1 }]]]);
  const half = combinedPolicies().find((policy) => policy.id === "raw-smooth-armed-ema7-half")!;
  const partial = replay(features, decisions, 500, half, 502);
  assert.equal(partial.targets[501], .5); assert.equal(partial.cursor.state.entryIndex, 500);
  assert.equal(partial.exits[0].target, .5);
  const guarded = replay(features, decisions, 500, { ...half, cap: 0, confirmation: "native-guards" }, 502);
  assert.equal(guarded.targets[501], 1); assert.equal(guarded.exits.length, 0);
  assert.equal(guarded.cursor.state.pending, null);
});
