import { test } from "node:test";
import assert from "node:assert/strict";
import { expandedMenu, folds, gridWinner, localTargets } from "./block-study";
import { current, Account, Features } from "./analyze";
import type { MarketBar } from "../../lib/market/types";
import { runStrategyCycleCloseBacktest } from "../../lib/analysis/strategy-cycle-validation";

test("expanded grid has all 13824 independent tuples and exact requested endpoints", () => {
  const menu = expandedMenu(); assert.equal(menu.length, 13824); assert.equal(new Set(menu.map(p => JSON.stringify(p))).size, 13824);
  for (const key of ["entry", "exit", "gate"] as const) { assert.equal(Math.min(...menu.map(p => p[key])), 5); assert.equal(Math.max(...menu.map(p => p[key])), 16); }
  assert.equal(menu[0]!.threshold, 0.00025); assert.equal(menu.at(-1)!.threshold, 0.002);
});
test("all segment lengths share deployment dates and train strictly before deployment", () => {
  for (const length of [40, 100, 300, 500]) {
    const f = folds(length); assert.equal(f[0]!.deployStart, 500); assert.equal(f.at(-1)!.deployEnd, 2000);
    for (let i = 0; i < f.length; i++) { assert.equal(f[i]!.trainEnd, f[i]!.deployStart); assert.equal(f[i]!.trainEnd - f[i]!.trainStart, length); if (i) assert.equal(f[i - 1]!.deployEnd, f[i]!.deployStart); }
  }
});
test("tied optima prefer current parameters without inspecting future performance", () => {
  const menu = [{ ...current, entry: 5 }, current, { ...current, entry: 16 }];
  const r = gridWinner(Float64Array.from([3, -1, 2, 3, -2, 2, 2, 0, 1]), menu);
  assert.equal(r.index, 1); assert.equal(r.tiedOptima, 2);
});
test("local slice replay matches full source replay and retains state across a boundary", () => {
  const bars = Array.from({ length: 90 }, (_, i) => ({ time: new Date(Date.UTC(2020, 0, i + 1)).toISOString().slice(0, 10), timestamp: i,
    open: 100 + i / 10, close: 100 + i / 10 + Math.sin(i / 4) * 5, high: 110, low: 90, volume: 1, amount: 1,
    amplitude: 0, changePercent: 0, change: 0, turnoverRate: 0 })) as MarketBar[];
  const f = new Features(bars), decisions = new Map(), settings = { initialCash: 100000, commissionRate: .0003, slippageRate: .0002, interval: "1d" as const, startTime: bars[30]!.time, endTime: bars[79]!.time };
  const local = localTargets(decisions, f, 30, 80, current), all = bars.map(() => 0); all.splice(30, 50, ...local);
  assert.equal(runStrategyCycleCloseBacktest(bars, all, settings).totalReturn, runStrategyCycleCloseBacktest(bars.slice(30, 80), local, settings).totalReturn);
  const a = new Account(), x = localTargets(decisions, f, 30, 50, current, a), y = localTargets(decisions, f, 50, 80, current, a);
  assert.deepEqual([...x, ...y], local);
});
