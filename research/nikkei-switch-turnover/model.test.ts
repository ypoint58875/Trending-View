import assert from "node:assert/strict";
import test from "node:test";
import { choose, replay, validateProgress, POLICIES, type Decision } from "./model";
import { SmaPositionOverlay, RSI_SHAPE_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import { strategyCycleSignalDirection, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";

const signal = (direction: "increase" | "reduce", targetAllocation: number): StrategyCycleRecentSignal =>
  ({ direction, targetAllocation, signals: [direction === "increase" ? "long-entry" : "long-exit"] });
const decision: Decision = { index: 250, changed: true, current: [signal("reduce", 0)], previous: [signal("increase", 1)] };
const bars: MarketBar[] = Array.from({ length: 320 }, (_, i) => {
  const close = 100 + i * .1;
  return { time: new Date(Date.UTC(2020, 0, i + 1)).toISOString().slice(0, 10), timestamp: Date.UTC(2020, 0, i + 1),
    open: close, high: close + .3, low: close - .3, close, volume: 100, amount: close * 100,
    amplitude: 0, changePercent: 0, change: 0, turnoverRate: 0 };
});

test("switch-only policies exempt initial/equal plans and retain native two-bar precedence", () => {
  for (const policy of POLICIES) assert.deepEqual(choose(policy, { ...decision, changed: false }, .5), { signals: decision.current, veto: false });
  const ambiguous = { ...decision, current: [signal("reduce", 0), signal("increase", 1)] };
  assert.equal(strategyCycleSignalDirection(ambiguous.current), null);
  for (const policy of POLICIES) assert.deepEqual(choose(policy, ambiguous, .5), { signals: ambiguous.current, veto: false });
  assert.equal(choose("consensus-both", { ...decision, current: [signal("increase", 1), signal("reduce", 0)] }, .5).veto, true);
});
test("conflict substitution and scoped consensus distinguish quiet from opposite previous signals", () => {
  assert.deepEqual(choose("old-on-conflict", decision, .5).signals, decision.previous);
  assert.equal(choose("consensus-reduce", decision, .5).veto, true);
  assert.equal(choose("consensus-increase", decision, .5).veto, false);
  const quiet = { ...decision, previous: [] };
  assert.equal(choose("old-on-conflict", quiet, .5).veto, false);
  assert.deepEqual(choose("old-on-conflict", quiet, .5).signals, quiet.current);
  assert.equal(choose("consensus-both", quiet, .5).veto, true);
  assert.equal(choose("consensus-both", { ...decision, previous: [signal("reduce", .3)] }, .5).veto, false);
});
test("allocation delta bands are strict and apply only on replacements", () => {
  const row = { ...decision, current: [signal("increase", .6)] };
  assert.equal(choose("small-switch-10pp", row, .5).veto, false);
  assert.equal(choose("small-switch-10pp", row, .51).veto, true);
  assert.equal(choose("small-switch-25pp", row, .35).veto, false);
  assert.equal(choose("small-switch-25pp", { ...row, changed: false }, .59).veto, false);
  assert.equal(choose("small-switch-25pp", row, .6).veto, false);
  assert.equal(choose("small-switch-25pp", row, .7).veto, false);
});
test("replay matches independent native controller and serializes accepted account state", () => {
  const decisions = new Map<number, Decision>([
    [240, { index: 240, changed: false, current: [signal("increase", 1)], previous: [] }],
    [247, { ...decision, index: 247 }],
    [260, { ...decision, index: 260, current: [signal("increase", 1)], previous: [signal("reduce", 0)] }],
  ]);
  const account = new SmaPositionOverlay(bars, DEFAULT_POSITION_OVERLAY_OPTIONS), targets = bars.map(() => 0);
  for (let i = 230; i < bars.length; i++) {
    const signals = decisions.get(i)?.current ?? [], direction = strategyCycleSignalDirection(signals);
    if (direction) account.request(direction, signals.at(-1)!.targetAllocation, i);
    targets[i] = account.close(i, signals.length > 0);
  }
  const baseline = replay(bars, decisions, 230, "baseline");
  assert.deepEqual(baseline.targets, targets); assert.deepEqual(baseline.cursor.overlay, account.checkpoint());
  const pending = replay(bars, decisions, 230, "baseline", 250);
  assert.equal(pending.cursor.overlay.pending, 0);
  assert.deepEqual(pending.cursor.pending, { index: 247, switchSensitive: true });
  for (const policy of POLICIES) {
    const complete = replay(bars, decisions, 230, policy), partial = replay(bars, decisions, 230, policy, 250);
    assert.deepEqual(replay(bars, decisions, 230, policy, bars.length, JSON.parse(JSON.stringify(partial))), complete);
    assert.deepEqual(replay(bars.slice(0, 250), decisions, 230, policy).targets, complete.targets.slice(0, 250));
  }
});
test("hard4% early stop bypasses a rejected switch request and cooldown survives", () => {
  const sample = bars.map((bar) => ({ ...bar }));
  const entry = 240;
  for (let i = entry + 1; i < sample.length; i++) {
    const close = sample[entry].close * .94;
    sample[i] = { ...sample[i], open: close, close, high: close + .1, low: close - .1 };
  }
  const decisions = new Map<number, Decision>([
    [entry, { index: entry, changed: false, current: [signal("increase", 1)], previous: [] }],
    [entry + 1, { ...decision, index: entry + 1, current: [signal("increase", 1)], previous: [signal("reduce", 0)] }],
    [entry + 2, { index: entry + 2, changed: false, current: [signal("increase", 1)], previous: [] }],
  ]);
  for (const policy of POLICIES) {
    const result = replay(sample, decisions, entry, policy);
    assert.equal(result.targets[entry], 1); assert.equal(result.targets[entry + 1], 0); assert.equal(result.targets[entry + 2], 0);
  }
});
test("ATR shock exit remains active after the early-stop age under every switch gate", () => {
  const sample = bars.map((bar) => ({ ...bar })), entry = 240, shock = 252;
  const close = sample[shock - 1].close * .97;
  sample[shock] = { ...sample[shock], open: close, close, high: close + .1, low: close - .1 };
  const decisions = new Map<number, Decision>([
    [entry, { index: entry, changed: false, current: [signal("increase", 1)], previous: [] }],
    [shock, { ...decision, index: shock, current: [signal("increase", 1)], previous: [signal("reduce", 0)] }],
  ]);
  for (const policy of POLICIES) {
    const result = replay(sample, decisions, entry, policy, shock + 1);
    assert.equal(result.targets[shock - 1], 1); assert.equal(result.targets[shock], 0);
  }
});
test("progress identity/order and input bounds fail explicitly", () => {
  validateProgress({ identity: "a", rows: [{ policy: "baseline" }] }, "a");
  assert.throws(() => validateProgress({ identity: "a", rows: [] }, "b"));
  assert.throws(() => validateProgress({ identity: "a", rows: [{ policy: "consensus-both" }] }, "a"));
  assert.throws(() => replay(Array.from({ length: 10001 }, () => bars[0]), new Map(), 0, "baseline"));
  assert.throws(() => replay(bars, new Map(), -1, "baseline"));
});
