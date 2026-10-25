import assert from "node:assert/strict";
import { test } from "node:test";
import { priorityTargets } from "./ema-entry-priority";
import { averageSlopes } from "./ma-type";
import type { MarketBar } from "../../lib/market/types";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
const bars = () => [...Array(20).fill(100), 80, 85, 90, 95, 100, 103, 105, 107].map((close, i) => ({ close, time: String(i) }) as MarketBar);
test("EMA priority bypasses a negative WMA only for the supplemental turn", () => {
  const source = bars(), turn = averageSlopes(source.map(b => b.close), 7, "EMA").turns.findIndex((v, i) => i >= 20 && v);
  const decisions = new Map<number, StrategyCycleRecentSignal[]>([[20, [{ direction: "increase", targetAllocation: 1, signals: [] }]]]);
  const control = priorityTargets(source, decisions, 20, false), altered = priorityTargets(source, decisions, 20, true);
  assert.equal(altered.target[20], 0);
  assert.equal(control.target[turn], 0);
  assert.equal(altered.target[turn], 1);
  assert.equal(altered.overrides[0]!.time, String(turn));
});
test("raw original signals still suppress a supplement and future prices cannot change past decisions", () => {
  const source = bars(), turn = averageSlopes(source.map(b => b.close), 7, "EMA").turns.findIndex((v, i) => i >= 20 && v);
  const decisions = new Map<number, StrategyCycleRecentSignal[]>([[turn, [{ direction: "reduce", targetAllocation: 0, signals: [] }]]]);
  assert.equal(priorityTargets(source, decisions, 20, true).target[turn], 0);
  const full = priorityTargets(source, new Map(), 20, true);
  assert.deepEqual(full.target.slice(0, 25), priorityTargets(source.slice(0, 25), new Map(), 20, true).target);
});
