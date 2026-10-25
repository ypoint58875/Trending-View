import assert from "node:assert/strict";
import { test } from "node:test";
import { positiveAcceleration, acceleratingTargets } from "./accelerating-entry";
import type { MarketBar } from "../../lib/market/types";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
const bars = (values: number[]) => values.map((close, i) => ({ close, time: String(i) }) as MarketBar);
test("positive acceleration permits a later positive-slope reentry and ignores equality", () => {
  const source = bars([...Array(12).fill(100), 101, 102, 103, 105]);
  const decisions = new Map<number, StrategyCycleRecentSignal[]>([[14, [{ direction: "reduce", targetAllocation: 0, signals: [] }]]]);
  assert.equal(acceleratingTargets(source, decisions, 12, false).target[15], 0);
  assert.equal(acceleratingTargets(source, decisions, 12, true).target[15], 1);
  assert.deepEqual(positiveAcceleration(Array(20).fill(100)), Array(20).fill(false));
});
test("negative but improving slope cannot supplement; future bars cannot change past decisions", () => {
  assert.equal(positiveAcceleration([...Array(12).fill(100), 90, 95, 99]).at(-1), false);
  const source = bars(Array.from({ length: 90 }, (_, i) => 100 + Math.sin(i / 3) * 5));
  assert.deepEqual(acceleratingTargets(source, new Map(), 20, true).target.slice(0, 60),
    acceleratingTargets(source.slice(0, 60), new Map(), 20, true).target);
});
test("raw original signals suppress acceleration supplementation even when no trade fills", () => {
  const source = bars([...Array(12).fill(100), 101, 102, 103, 105]);
  const decisions = new Map<number, StrategyCycleRecentSignal[]>([[12, [{ direction: "reduce", targetAllocation: 0, signals: [] }]]]);
  assert.equal(acceleratingTargets(source, decisions, 12, true).target[12], 0);
});

test("positive acceleration cannot bypass the independent SMA11 flat-entry gate", () => {
  const values = [...Array(12).fill(100), 101, 102, 103, 105];
  values[3] = 80; values[4] = 120;
  const source = bars(values), decisions = new Map<number, StrategyCycleRecentSignal[]>();
  for (const i of [12, 13, 14]) decisions.set(i, [{ direction: "reduce", targetAllocation: 0, signals: [] }]);
  assert.equal(positiveAcceleration(values)[15], true);
  assert.equal(acceleratingTargets(source, decisions, 12, true, true).target[15], 0);
  assert.equal(acceleratingTargets(source, decisions, 12, true, false).target[15], 1);
});
