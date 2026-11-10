import assert from "node:assert/strict";
import test from "node:test";
import { Features, policies, turning, replay, type Replay } from "./model";
import { RSI_SHAPE_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS, SmaPositionOverlay } from "../../lib/analysis/sma-position-overlay";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";

function bars(count = 700): MarketBar[] {
  return Array.from({ length: count }, (_, i) => {
    const close = 1000 + i + Math.sin(i / 11) * 20, timestamp = Date.UTC(2000, 0, i + 1);
    return { timestamp, time: new Date(timestamp).toISOString().slice(0, 10), open: close, high: close + 2, low: close - 2,
      close, volume: 100, amount: 0, amplitude: 0, changePercent: 0, change: 0, turnoverRate: 0 };
  });
}
test("decline onset of a speed curve is distinct from continued decline or a zero crossing", () => {
  assert.equal(turning([90, 100, 80], 2), true);
  assert.equal(turning([100, 90, 80], 2), false);
  assert.equal(turning([-100, -80, -90], 2), true);
  assert.equal(turning([100, 100, 99], 2), true);
  assert.equal(turning([null, 100, 99], 2), false);
  assert.equal(policies().length, 190); assert.equal(new Set(policies().map((policy) => policy.id)).size, 190);
});

test("entry and add scope use actual allocation, with no phantom holding or holding-age reset", () => {
  const input = bars(), features = new Features(input);
  features.smooth.slope[0][398] = 90; features.smooth.slope[0][399] = 100; features.smooth.slope[0][400] = 80;
  const gate = policies().find((policy) => policy.id === "20-smooth-speed-turn-D1-all")!;
  const signals = new Map<number, StrategyCycleRecentSignal[]>([[400, [{ direction: "increase", targetAllocation: 1, signals: ["long-entry"] }]]]);
  const native = new SmaPositionOverlay(input, DEFAULT_POSITION_OVERLAY_OPTIONS);
  const flat: Replay = { targets: input.map(() => 0), events: [], cursor: { index: 399, state: { ...native.checkpoint(), flatStart: 390 } } };
  const blocked = replay(features, signals, 390, { ...gate, scope: "entry" }, 401, flat);
  assert.equal(blocked.targets[400], 0); assert.equal(blocked.cursor.state.entryIndex, null);
  assert.equal(blocked.cursor.state.flatStart, 390); assert.equal(blocked.cursor.state.previousCloseAllocation, 0);
  const holding = structuredClone(flat);
  Object.assign(holding.cursor.state, { allocation: .5, previousCloseAllocation: .5, flatStart: null, entryIndex: 380, entryClose: input[380].close });
  const add = replay(features, signals, 390, { ...gate, scope: "add" }, 401, holding);
  assert.equal(add.targets[400], .5); assert.equal(add.cursor.state.entryIndex, 380); assert.equal(add.events.length, 1);
  assert.equal(replay(features, signals, 390, { ...gate, scope: "entry" }, 401, holding).targets[400], 1);
});

test("increase gates never suppress native hard risk exits or mutate recovery cooldown", () => {
  const input = bars(); Object.assign(input[401], { close: 500, open: 500, high: 502, low: 498 });
  const features = new Features(input), controller = new SmaPositionOverlay(input, DEFAULT_POSITION_OVERLAY_OPTIONS);
  const state = { ...controller.checkpoint(), allocation: 1, previousCloseAllocation: 1, entryIndex: 400, entryClose: input[400].close, flatStart: null };
  controller.restore(state); const expected = controller.close(401, false);
  assert.equal(expected, 0);
  const cursor: Replay = { targets: input.map(() => 0), events: [], cursor: { index: 400, state } };
  const actual = replay(features, new Map(), 400, policies().find((policy) => policy.id === "20-smooth-speed-negative-D1-all")!, 402, cursor);
  assert.equal(actual.targets[401], 0); assert.deepEqual(actual.cursor.state, controller.checkpoint());
});

test("all190 fixed policies serialize exactly and have future-free prefixes", () => {
  const input = bars(), features = new Features(input), decisions = new Map<number, StrategyCycleRecentSignal[]>();
  for (let i = 300; i < 700; i += 31) decisions.set(i, [{ direction: "increase", targetAllocation: 1, signals: ["long-entry"] }]);
  for (const policy of policies()) {
    const full = replay(features, decisions, 300, policy), partial = replay(features, decisions, 300, policy, 501);
    assert.deepEqual(replay(features, decisions, 300, policy, 700, JSON.parse(JSON.stringify(partial))), full);
    const prefix = replay(new Features(input.slice(0, 600)), decisions, 300, policy);
    assert.deepEqual(prefix.targets, full.targets.slice(0, 600));
  }
});
