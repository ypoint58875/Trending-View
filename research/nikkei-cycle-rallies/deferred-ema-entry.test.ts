import assert from "node:assert/strict";
import { test } from "node:test";
import { deferredTargets } from "./deferred-ema-entry";
import { averageSlopes } from "./ma-type";
import type { MarketBar } from "../../lib/market/types";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
const source = () => [...Array(20).fill(100), 80, 85, 90, 95, 100, 103, 105, 107, 108].map((close, i) => ({ close, time: String(i) }) as MarketBar);
test("a rejected EMA turn queues once and executes only after WMA turns positive", () => {
  const bars = source(), closes = bars.map(b => b.close), entry = averageSlopes(closes, 7, "EMA"), gate = averageSlopes(closes, 14, "WMA");
  const turn = entry.turns.findIndex((v, i) => i >= 20 && v), unlock = gate.sign.findIndex((v, i) => i > turn && v != null && v > 0);
  const replay = deferredTargets(bars, new Map(), 20, "wait-for-wma");
  assert.equal(replay.target[turn], 0); assert.equal(replay.target[unlock], 1);
  assert.equal(replay.events.filter(e => e.kind === "queued").length, 1);
  assert.equal(deferredTargets(bars, new Map(), unlock, "wait-for-wma").target[unlock], 0);
});
test("literal waiting survives intervening sells, while invalidation policy cancels it", () => {
  const bars = source(), turn = averageSlopes(bars.map(b => b.close), 7, "EMA").turns.findIndex((v, i) => i >= 20 && v);
  const decisions = new Map<number, StrategyCycleRecentSignal[]>([[turn + 1, [{ direction: "reduce", targetAllocation: 0, signals: [] }]]]);
  assert.equal(deferredTargets(bars, decisions, 20, "wait-for-wma").target.at(-1), 1);
  assert.equal(deferredTargets(bars, decisions, 20, "cancel-on-invalidation").target.at(-1), 0);
});
test("all waiting policies preserve prefix causality", () => {
  const bars = source();
  for (const mode of ["current", "wait-for-wma", "cancel-on-invalidation"] as const)
    assert.deepEqual(deferredTargets(bars, new Map(), 20, mode).target.slice(0, 26), deferredTargets(bars.slice(0, 26), new Map(), 20, mode).target);
});
