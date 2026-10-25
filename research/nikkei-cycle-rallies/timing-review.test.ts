import assert from "node:assert/strict";
import { test } from "node:test";
import { unlockTargets } from "./timing-review";
import { averageSlopes } from "./ma-type";
import type { MarketBar } from "../../lib/market/types";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";

test("unlock entry acts after an EMA turn blocked by the slower WMA, without future data", () => {
  const closes = [...Array(20).fill(100), 80, 85, 90, 95, 100, 103, 105, 107];
  const bars = closes.map((close, i) => ({ close, time: String(i) }) as MarketBar);
  const entry = averageSlopes(closes, 7, "EMA"), gate = averageSlopes(closes, 14, "WMA");
  const turn = entry.turns.findIndex((v, i) => i >= 20 && v);
  assert.ok(turn > 0 && gate.sign[turn]! < 0);
  const unlock = gate.sign.findIndex((v, i) => i > turn && v != null && v >= 0);
  const replay = unlockTargets(bars, new Map(), 20);
  assert.equal(replay.target[turn], 0); assert.equal(replay.target[unlock], 1);
  assert.deepEqual(unlockTargets(bars.slice(0, unlock + 1), new Map(), 20).target, replay.target.slice(0, unlock + 1));
  const signals = new Map<number, StrategyCycleRecentSignal[]>([[unlock, [{ direction: "reduce", targetAllocation: 0, signals: [] }]]]);
  assert.equal(unlockTargets(bars, signals, 20).target[unlock], 0);
});
