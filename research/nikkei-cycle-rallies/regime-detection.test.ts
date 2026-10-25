import assert from "node:assert/strict";
import { test } from "node:test";
import { indicatorStates, detectRegime, detectorIds, singleAccountTargets } from "./regime-detection";
import type { MarketBar } from "../../lib/market/types";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";

const bars = Array.from({ length: 240 }, (_, i) => {
  const price = 100 + Math.sin(i / 9) * 15 + i / 10;
  return { time: `day-${i}`, open: price, high: price + 0.5, low: price - 0.5, close: price } as MarketBar;
});
test("all fourteen regime rules preserve history under future perturbation", () => {
  const changed = bars.map((bar, i) => i < 183 ? bar : { ...bar, close: 5000, high: 6000, low: 1 });
  assert.deepEqual(indicatorStates(bars).slice(0, 183), indicatorStates(changed).slice(0, 183));
  for (const id of detectorIds) {
    assert.deepEqual(detectRegime(bars, id).slice(0, 183), detectRegime(bars.slice(0, 183), id));
    assert.deepEqual(detectRegime(bars, id).slice(0, 183), detectRegime(changed, id).slice(0, 183));
  }
});
test("SMA7 slope sign is exactly the seven-session close momentum sign", () => {
  const states = indicatorStates(bars);
  for (let i = 7; i < bars.length; i += 1) assert.equal(Math.sign(states[i]!.slope7!), Math.sign(bars[i]!.close - bars[i - 7]!.close));
});
test("trend mode suppresses tactical exits and its exit has priority in one account", () => {
  const decisions = new Map<number, StrategyCycleRecentSignal[]>([
    [1, [{ direction: "reduce", targetAllocation: 0, signals: [] }]],
    [3, [{ direction: "increase", targetAllocation: 1, signals: [] }]],
    [5, [{ direction: "increase", targetAllocation: 0.3, signals: [] }]],
  ]);
  assert.deepEqual(singleAccountTargets([0, 1, 1, 0, 0, 0, 0], 1, decisions), [0, 1, 1, 0, 0, 0.3, 0.3]);
});
test("SMA price rules use the intended period and detect a rising tape", () => {
  const rising = bars.map((bar, i) => ({ ...bar, close: 100 + i }));
  for (const id of ["price-sma20", "price-sma60", "price-sma120"] as const) assert.equal(detectRegime(rising, id).at(-1), 1);
});
