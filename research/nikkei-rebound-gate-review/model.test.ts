import assert from "node:assert/strict";
import test from "node:test";
import { Context, policies, replay } from "./model";
import { RSI_SHAPE_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS, SmaPositionOverlay } from "../../lib/analysis/sma-position-overlay";
import { strategyCycleSignalDirection, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";
function bars(closes: number[]): MarketBar[] {
  return closes.map((close, i) => {
    const timestamp = Date.UTC(2000, 0, i + 1);
    return { time: new Date(timestamp).toISOString().slice(0, 10), timestamp, open: close, close,
      high: close + .5, low: close - .5, volume: 1, amount: 0, amplitude: 0, change: 0, changePercent: 0, turnoverRate: 0 };
  });
}
function fixture() {
  const input = bars([...Array(30).fill(120), 110, 100, 90, 92, 95, 99, 103, 106, 109, 110, 111]);
  input[37].high = 115;
  return input;
}
test("nine fixed policies distinguish below-average rebound from above-average confirmation", () => {
  const input = fixture(), context = new Context(input), menu = policies();
  assert.equal(menu.length, 9); assert.equal(new Set(menu.map((p) => p.id)).size, 9);
  assert.equal(context.ready(38, 30, menu[0]), true);
  assert.equal(context.ready(38, 30, menu[1]), false);
  assert.equal(context.ready(38, 30, menu[2]), false);
  assert.equal(context.ready(38, 30, menu[3]), true);
  assert.equal(context.ready(38, 30, menu[4]), false);
  assert.equal(context.ready(38, 38, menu[0]), false);
});
test("research adapter preserves native production target and final state", () => {
  const input = bars(Array.from({ length: 500 }, (_, i) => 100 + Math.sin(i / 13) * 12 + i * .02));
  const decisions = new Map<number, StrategyCycleRecentSignal[]>([[45, [{ direction: "increase", targetAllocation: 1, signals: ["long-entry"] }]],
    [80, [{ direction: "reduce", targetAllocation: 0, signals: ["long-exit"] }]]]);
  const direct = new SmaPositionOverlay(input, DEFAULT_POSITION_OVERLAY_OPTIONS), targets = input.map(() => 0);
  for (let i = 25; i < input.length; i++) {
    const signals = decisions.get(i) ?? [], direction = strategyCycleSignalDirection(signals);
    if (direction) direct.request(direction, signals.at(-1)!.targetAllocation, i);
    targets[i] = direct.close(i, signals.length > 0);
  }
  const path = replay(new Context(input), decisions, 25, policies()[0]);
  assert.deepEqual(path.targets, targets); assert.deepEqual(path.cursor.state, direct.checkpoint());
});
test("original-signal and cooldown vetoes precede candidate rebound injection", () => {
  const input = fixture(), context = new Context(input), controller = new SmaPositionOverlay(input, DEFAULT_POSITION_OVERLAY_OPTIONS);
  const state = { ...controller.checkpoint(), flatStart: 30, lastClosedIndex: 37 };
  const resume = { cursor: { index: 37, state }, targets: input.map(() => 0), entries: [] };
  const allowed = replay(context, new Map(), 30, policies()[0], 39, resume);
  assert.equal(allowed.targets[38], 1); assert.deepEqual(allowed.entries, [38]);
  const original = new Map<number, StrategyCycleRecentSignal[]>([[38, [{ direction: "reduce", targetAllocation: 0, signals: ["long-exit"] }]]]);
  assert.equal(replay(context, original, 30, policies()[0], 39, resume).targets[38], 0);
  const cooling = { ...resume, cursor: { index: 37, state: { ...state, blockedUntil: 40 } } };
  assert.equal(replay(context, new Map(), 30, policies()[0], 39, cooling).targets[38], 0);
});
test("all nine variants have causal prefixes and exact serialized resume", () => {
  const input = bars(Array.from({ length: 500 }, (_, i) => 100 + Math.sin(i / 15) * 15 + i * .02)), context = new Context(input);
  for (const policy of policies()) {
    const full = replay(context, new Map(), 25, policy), partial = replay(context, new Map(), 25, policy, 250);
    assert.deepEqual(replay(context, new Map(), 25, policy, input.length, structuredClone(partial)), full);
    assert.deepEqual(replay(new Context(input.slice(0, 350)), new Map(), 25, policy).targets, full.targets.slice(0, 350));
  }
});
