import assert from "node:assert/strict";
import { test } from "node:test";
import { fallbackTargets } from "./ema-fallback-entry";
import { averageSlopes } from "./ma-type";
import type { MarketBar } from "../../lib/market/types";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
const source = () => [...Array(20).fill(100), 80, 85, 90, 95, 100, 103, 105, 107, 108].map((close, i) => ({ close, time: String(i) }) as MarketBar);
test("a conflicting EMA7 turn permits an EMA8 fallback even while WMA14 remains negative", () => {
  const bars = source(), closes = bars.map(b => b.close), gate = averageSlopes(closes, 14, "WMA");
  const turn = averageSlopes(closes, 8, "EMA").turns.findIndex((v, i) => i >= 20 && v);
  assert.ok(gate.sign[turn]! < 0);
  assert.equal(fallbackTargets(bars, new Map(), 20, null).target[turn], 0);
  assert.equal(fallbackTargets(bars, new Map(), 20, 8).target[turn], 1);
  assert.equal(fallbackTargets(bars, new Map(), 20, 8, false, true).target[turn], 0);
  assert.equal(fallbackTargets(bars, new Map(), turn + 1, 8).target[turn + 1], 0);
});
test("original raw signals suppress fallback entries and all variants remain prefix causal", () => {
  const bars = source(), turn = averageSlopes(bars.map(b => b.close), 8, "EMA").turns.findIndex((v, i) => i >= 20 && v);
  const decisions = new Map<number, StrategyCycleRecentSignal[]>([[turn, [{ direction: "reduce", targetAllocation: 0, signals: [] }]]]);
  assert.equal(fallbackTargets(bars, decisions, 20, 8).target[turn], 0);
  for (let period = 8; period <= 14; period++) for (const cancel of [false, true]) for (const later of [false, true])
    assert.deepEqual(fallbackTargets(bars, new Map(), 20, period, cancel, later).target.slice(0, 26), fallbackTargets(bars.slice(0, 26), new Map(), 20, period, cancel, later).target);
});
