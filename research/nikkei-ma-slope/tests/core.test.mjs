import assert from "node:assert/strict";
import test from "node:test";
import {
  allTrueMask,
  benjaminiHochberg,
  bootstrapComparison,
  ema,
  enumerateCombinations,
  executableReturns,
  normalizedSlope,
  quantile,
  simulateBuyAndHold,
  simulateStrategy,
  sma,
  wma,
} from "../lib/core.mjs";

function bars(values) {
  return values.map((value, index) => ({
    date: `2026-01-${String(index + 1).padStart(2, "0")}`,
    open: value,
    high: value * 1.01,
    low: value * 0.99,
    close: value,
  }));
}

test("moving averages match the project formulas", () => {
  const values = [1, 2, 3, 4, 5];
  assert.deepEqual(sma(values, 3), [null, null, 2, 3, 4]);
  assert.deepEqual(ema(values, 3), [null, null, 2, 3, 4]);
  assert.deepEqual(wma(values, 3), [null, null, 14 / 6, 20 / 6, 26 / 6]);
});

test("normalized slope uses adjacent completed moving-average observations", () => {
  const slopes = normalizedSlope([null, 100, 101, 99.99]);
  assert.deepEqual(slopes.slice(0, 2), [null, null]);
  assert.ok(Math.abs(slopes[2] - 1) < 1e-12);
  assert.ok(Math.abs(slopes[3] + 1) < 1e-12);
});

test("quantile interpolates deterministically", () => {
  assert.equal(quantile([4, 1, 3, 2], 0.5), 2.5);
  assert.equal(quantile([1, 5], 0.25), 2);
});

test("combination enumeration covers every declared depth", () => {
  const combinations = [];
  enumerateCombinations(5, 3, (indexes) => combinations.push(indexes));
  assert.equal(combinations.length, 5 + 10 + 10);
  assert.deepEqual(combinations[0], [0]);
  assert.deepEqual(combinations.at(-1), [2, 3, 4]);
});

test("execution enters only at the next open and prevents overlapping positions", () => {
  const data = bars([100, 101, 102, 103, 104, 105, 106, 107]);
  data[1].open = 100;
  const mask = allTrueMask(data.length);
  const trades = executableReturns(mask, data, { start: 0, end: data.length }, 3);
  assert.equal(trades.length, 2);
  assert.equal(trades[0].signalIndex, 0);
  assert.equal(trades[0].entryIndex, 1);
  assert.equal(trades[0].exitIndex, 3);
  assert.equal(trades[1].entryIndex, 4);
  assert.ok(Math.abs(trades[0].grossReturnPct - 3) < 1e-12);
});

test("strategy costs reduce returns and equity", () => {
  const data = bars([100, 102, 104, 106, 108, 110]);
  const mask = allTrueMask(data.length);
  const noCost = simulateStrategy(mask, data, { start: 0, end: data.length }, 2, 0);
  const cost = simulateStrategy(mask, data, { start: 0, end: data.length }, 2, 10);
  assert.equal(noCost.trades.length, cost.trades.length);
  assert.ok(cost.totalReturnPct < noCost.totalReturnPct);
  assert.ok(cost.trades[0].netReturnPct < cost.trades[0].grossReturnPct);
});

test("buy-and-hold benchmark uses the first open and final close", () => {
  const data = bars([100, 105, 110]);
  data[0].open = 100;
  const result = simulateBuyAndHold(data, { start: 0, end: data.length }, 0);
  assert.ok(Math.abs(result.totalReturnPct - 10) < 1e-12);
  assert.equal(result.exposurePct, 100);
});

test("stationary bootstrap diagnostics are deterministic", () => {
  const first = bootstrapComparison([1, 2, -1, 3, 2], [0.5, -1, 0.25, 1, -0.5], 100, 42);
  const second = bootstrapComparison([1, 2, -1, 3, 2], [0.5, -1, 0.25, 1, -0.5], 100, 42);
  assert.deepEqual(first, second);
  assert.ok(first.probabilityPValue > 0 && first.probabilityPValue <= 1);
});

test("Benjamini-Hochberg correction is monotone and bounded", () => {
  const rows = [{ p: 0.01 }, { p: 0.04 }, { p: 0.03 }, { p: 0.9 }];
  benjaminiHochberg(rows, "p", "q");
  assert.deepEqual(rows.map((row) => row.q), [0.04, 0.05333333333333334, 0.05333333333333334, 0.9]);
});
