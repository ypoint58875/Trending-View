import assert from "node:assert/strict";
import { test } from "node:test";
import { thresholds, validateChunk, type GridRow } from "./ma-threshold-grid";

test("threshold menu uses percentage fractions and includes the prior control", () => {
  assert.equal(thresholds.length, 8);
  assert.equal(thresholds[0], 0.025 / 100);
  assert.equal(thresholds.at(-1), 0.2 / 100);
  assert.equal(27 * 9 ** 3 * thresholds.length, 157464);
});

test("resume chunks reject duplicates, wrong identities and nonfinite results", () => {
  const rows: GridRow[] = [];
  for (let a = 7; a <= 15; a++) for (let b = 7; b <= 15; b++) for (let c = 7; c <= 15; c++) rows.push({
    id: `SMA${a}-EMA${b}-WMA${c}-t0.002`, types: ["SMA", "EMA", "WMA"], periods: [a, b, c], threshold: 0.002,
    totalReturn: 0, maxDrawdown: 0, tradeCount: 0, segments: [], subperiods: [],
  });
  validateChunk(rows, ["SMA", "EMA", "WMA"], 0.002);
  assert.throws(() => validateChunk([...rows.slice(1), rows[1]!], ["SMA", "EMA", "WMA"], 0.002));
  assert.throws(() => validateChunk(rows, ["EMA", "SMA", "WMA"], 0.002));
  assert.throws(() => validateChunk(rows, ["SMA", "EMA", "WMA"], 0.001));
  assert.throws(() => validateChunk([{ ...rows[0]!, totalReturn: NaN }, ...rows.slice(1)], ["SMA", "EMA", "WMA"], 0.002));
});
