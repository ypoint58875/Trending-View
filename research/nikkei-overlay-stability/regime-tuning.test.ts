import assert from "node:assert/strict";
import { test } from "node:test";
import { efficiency, wilderAtr, observations, detectRegime, policies, replayRegime, type Observation } from "./regime-tuning";
import type { MarketBar } from "../../lib/market/types";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";

function bar(index: number, open = 100, close = open): MarketBar {
  return { time: new Date(Date.UTC(2020, 0, index + 1)).toISOString().slice(0, 10),
    open, close, high: Math.max(open, close) + 1, low: Math.min(open, close) - 1 } as MarketBar;
}
const point = (er: number | null, atrRank: number | null = 0.6): Observation => ({ er, atrPercent: 2, atrRank });
const buy: StrategyCycleRecentSignal[] = [{ direction: "increase", targetAllocation: 1, signals: ["long-entry"] }];
const sell: StrategyCycleRecentSignal[] = [{ direction: "reduce", targetAllocation: 0, signals: ["long-exit"] }];

test("efficiency separates path noise from direction and handles constant prices", () => {
  assert.equal(efficiency([1, 2, 3, 4], 3, 3), 1);
  assert.equal(efficiency([4, 3, 2, 1], 3, 3), 1);
  assert.equal(efficiency([1, 2, 1, 2, 1], 4, 4), 0);
  assert.equal(efficiency([1, 1, 1], 2, 2), 0);
  assert.equal(efficiency([1, 2], 1, 2), null);
});
test("Wilder ATR includes gaps relative to the preceding close", () => {
  assert.deepEqual(wilderAtr([bar(0), bar(1), bar(2, 110)], 2), [null, 2, 6.5]);
});
test("regime confirmation and hysteresis take effect only on the following day", () => {
  assert.deepEqual(detectRegime([0.2, 0.2, 0.3, 0.4, 0.4, 0.3].map(value => point(value)), "noise"),
    [false, false, true, true, true, false]);
  assert.deepEqual(detectRegime([point(0.2), point(null), point(0.2), point(0.2), point(0.2)], "noise"),
    [false, false, false, false, true]);
});
test("wide-noise requires known prior volatility rank and exits on two low ranks", () => {
  const points = [point(0.2, null), point(0.2, 0.3), point(0.2), point(0.2), point(0.2, 0.3), point(0.2, 0.3), point(0.2)];
  assert.deepEqual(detectRegime(points, "wide-noise"), [false, false, false, false, true, true, false]);
});
test("fast WMA exit retains its WMA confirmation while direct original exit releases", () => {
  const source = Array.from({ length: 35 }, (_, index) => bar(index, index >= 28 ? 99 : 100));
  const decisions = new Map([[20, buy], [24, sell]]), points = source.map(() => point(0.1));
  const wma = replayRegime(source, decisions, 20, { id: "wma", detector: "noise", action: "wma-exit" }, points);
  const direct = replayRegime(source, decisions, 20, { id: "direct", detector: "noise", action: "original-exit" }, points);
  assert.equal(wma.targets[24], 1); assert.equal(wma.targets[27], 1); assert.equal(wma.targets[28], 0);
  assert.equal(direct.targets[24], 0);
});
test("hold3 still protects a supplemental reversal until its third subsequent bar", () => {
  const source = [...Array.from({ length: 20 }, (_, index) => bar(index)), bar(20, 94, 92), bar(21, 91, 95),
    ...Array.from({ length: 10 }, (_, offset) => bar(22 + offset, 95))];
  const result = replayRegime(source, new Map([[22, sell]]), 20,
    { id: "direct", detector: "noise", action: "original-exit" }, source.map(() => point(0.1)));
  assert.equal(result.targets[21], 1); assert.equal(result.targets[22], 1); assert.equal(result.targets[23], 1);
  assert.equal(result.targets[24], 0);
});
test("leaving a regime preserves held allocation and a pending reduction", () => {
  const source = Array.from({ length: 35 }, (_, index) => bar(index, index >= 28 ? 99 : 100));
  const points = source.map((_, index) => point(index >= 25 ? 0.5 : 0.1));
  const result = replayRegime(source, new Map([[20, buy], [24, sell]]), 20,
    { id: "wma", detector: "noise", action: "wma-exit" }, points);
  const switched = result.daily.find(day => !day.regime)!;
  assert.equal(switched.time, source[27]!.time); assert.equal(switched.before, 1); assert.equal(switched.pending, 0);
  assert.equal(result.targets[28], 0);
});
test("all13 continuous paths and volatility ranks are prefix causal", () => {
  const source = Array.from({ length: 360 }, (_, index) => bar(index, 100 + index * 0.02 + Math.sin(index * 0.6) * 8));
  const prefix = source.slice(0, 333), fullPoints = observations(source), prefixPoints = observations(prefix);
  assert.deepEqual(fullPoints.slice(0, 333), prefixPoints);
  assert.equal(fullPoints[264]!.atrRank, null); assert.equal(typeof fullPoints[265]!.atrRank, "number");
  const menu = policies(); assert.equal(menu.length, 13); assert.equal(new Set(menu.map(policy => policy.id)).size, 13);
  const decisions = new Map([[285, buy], [293, sell], [315, buy], [325, sell]]);
  for (const policy of menu) {
    const full = replayRegime(source, decisions, 280, policy, fullPoints);
    const early = replayRegime(prefix, decisions, 280, policy, prefixPoints);
    assert.deepEqual(full.targets.slice(0, 333), early.targets);
    assert.deepEqual(full.daily.slice(0, 53), early.daily);
    assert.ok(full.targets.every(target => target >= 0 && target <= 1));
  }
});
