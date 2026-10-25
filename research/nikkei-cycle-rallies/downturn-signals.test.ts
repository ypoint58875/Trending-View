import assert from "node:assert/strict";
import { test } from "node:test";
import { downturnSignals, retrospectivePeaks } from "./downturn-signals";
import { averageTypes } from "./ma-type";
test("downturn and weakening signals are prefix causal for every tested type and period", () => {
  const closes = Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i / 3) * 8);
  for (const type of averageTypes) for (let p = 3; p <= 12; p++) for (const warning of [false, true]) {
    assert.deepEqual(downturnSignals(closes, p, type, warning).slice(0, 60), downturnSignals(closes.slice(0, 60), p, type, warning));
  }
  assert.ok(downturnSignals(closes, 7, "EMA").some(Boolean));
  assert.ok(downturnSignals(closes, 7, "EMA", true).some(Boolean));
});
test("retrospective labels require a subsequent material decline and exclude incomplete forward windows", () => {
  const closes = [...Array(8).fill(100), 105, 110, 104, 100, ...Array(12).fill(99)];
  assert.deepEqual(retrospectivePeaks(closes, 5), [9]);
  assert.deepEqual(retrospectivePeaks(closes.slice(0, 15), 5), []);
});
