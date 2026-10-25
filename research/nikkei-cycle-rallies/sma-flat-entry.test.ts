import assert from "node:assert/strict";
import { test } from "node:test";
import { positiveSmaTurns, supplementalEntryTargets } from "./sma-flat-entry";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";

test("SMA turns are crossing events, causal, and match the average slope identity", () => {
  const closes = Array.from({ length: 130 }, (_, i) => 100 + Math.sin(i / 4) * 10 + i / 30);
  for (let period = 7; period <= 12; period += 1) {
    const turns = positiveSmaTurns(closes, period);
    assert.deepEqual(turns.slice(0, 90), positiveSmaTurns(closes.slice(0, 90), period));
    const average = (end: number) => closes.slice(end - period + 1, end + 1).reduce((a, b) => a + b, 0) / period;
    for (let i = period + 1; i < closes.length; i += 1) assert.equal(turns[i], average(i) > average(i - 1) && average(i - 1) <= average(i - 2));
  }
});
test("a supplemental entry persists until a later original exit and does not reset to the cash baseline", () => {
  const closes = [10, 9, 8, 9, 10, 11, 12, 13];
  const decisions = new Map<number, StrategyCycleRecentSignal[]>([[3, []], [6, [{ direction: "reduce", targetAllocation: 0, signals: [] }]]]);
  const replay = supplementalEntryTargets(closes, decisions, 3, 2);
  assert.deepEqual(replay.entries, [4]);
  assert.deepEqual(replay.target, [0, 0, 0, 0, 1, 1, 0, 0]);
});
test("an unfilled reduce signal blocks the supplement and the turn is not repeated tomorrow", () => {
  const closes = [10, 9, 8, 9, 10, 11, 12, 13];
  const decisions = new Map<number, StrategyCycleRecentSignal[]>([[4, [{ direction: "reduce", targetAllocation: 0, signals: [] }]]]);
  const replay = supplementalEntryTargets(closes, decisions, 3, 2);
  assert.deepEqual(replay.entries, []);
  assert.ok(replay.target.every(value => value === 0));
});
test("supplement never overwrites a partial original entry", () => {
  const decisions = new Map<number, StrategyCycleRecentSignal[]>([[4, [{ direction: "increase", targetAllocation: 0.3, signals: [] }]]]);
  const replay = supplementalEntryTargets([10, 9, 8, 9, 10, 11], decisions, 3, 2);
  assert.equal(replay.target[4], 0.3);
  assert.deepEqual(replay.entries, []);
});
