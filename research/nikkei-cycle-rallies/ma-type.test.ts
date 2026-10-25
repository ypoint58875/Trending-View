import assert from "node:assert/strict";
import { test } from "node:test";
import { averageSlopes, averageTargets, averageTypes } from "./ma-type";
import { SmaPositionOverlay } from "../../lib/analysis/sma-position-overlay";
import { strategyCycleSignalDirection, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";

test("all average features and account decisions are prefix causal", () => {
  const closes = Array.from({ length: 90 }, (_, i) => 100 + 8 * Math.sin(i / 3) + i / 10);
  const bars = closes.map(close => ({ close, time: String(close) }) as MarketBar);
  for (const type of averageTypes) for (let period = 7; period <= 15; period++) {
    const full = averageSlopes(closes, period, type), prefix = averageSlopes(closes.slice(0, 60), period, type);
    assert.deepEqual(full.sign.slice(0, 60), prefix.sign);
    assert.deepEqual(full.slope.slice(0, 60), prefix.slope);
    assert.deepEqual(averageTargets(bars, new Map(), 20, [type, type, type], [period, period, period]).target.slice(0, 60),
      averageTargets(bars.slice(0, 60), new Map(), 20, [type, type, type], [period, period, period]).target);
  }
});

test("exit thresholds are fractional percentages and use strict greater-than", () => {
  const bars = [...Array(12).fill(100), 101, 102, 103].map((close, i) => ({ close, time: String(i) }) as MarketBar);
  const decisions = new Map<number, StrategyCycleRecentSignal[]>([[12, [{ direction: "increase", targetAllocation: 1, signals: [] }]],
    [13, [{ direction: "reduce", targetAllocation: 0, signals: [] }]]]);
  const slope = averageSlopes(bars.map(b => b.close), 12, "SMA").slope[13]!;
  assert.equal(averageTargets(bars, decisions, 12, ["SMA", "SMA", "SMA"], [12, 12, 11], slope).target[13], 0);
  assert.equal(averageTargets(bars, decisions, 12, ["SMA", "SMA", "SMA"], [12, 12, 11], 0.00025).target[13], 1);
  assert.equal(averageTargets(bars, decisions, 12, ["SMA", "SMA", "SMA"], [12, 12, 11], 0.002).target[13], 0);
});

test("SMA research controller matches production through pending sells and gate blocks", () => {
  const bars = Array.from({ length: 180 }, (_, i) => ({ close: 100 + 10 * Math.sin(i / 4), time: String(i) }) as MarketBar);
  const decisions = new Map<number, StrategyCycleRecentSignal[]>();
  for (let i = 20; i < bars.length; i += 3) decisions.set(i, [{ direction: i % 2 ? "reduce" : "increase", targetAllocation: i % 2 ? 0 : 1, signals: [] }]);
  const control = new SmaPositionOverlay(bars, { supplementalEntry: true, exitGuard: true, entrySlopeGate: true });
  const expected = bars.map(() => 0);
  for (let i = 20; i < bars.length; i++) {
    const signals = decisions.get(i) ?? [], direction = strategyCycleSignalDirection(signals);
    if (direction) control.request(direction, signals.at(-1)!.targetAllocation, i);
    expected[i] = control.close(i, signals.length > 0);
  }
  assert.deepEqual(averageTargets(bars, decisions, 20, ["SMA", "SMA", "SMA"]).target, expected);
});
