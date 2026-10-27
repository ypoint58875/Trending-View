import assert from "node:assert/strict";
import { test } from "node:test";
import { backwardDerivatives, derivativeMotion, classifyDerivatives, derivativeWarnings, derivativeMenu, primaryDerivative } from "./ma-derivative-study";
import type { MarketBar } from "../../lib/market/types";

test("linear means have zero curvature regardless of the positive ATR scale", () => {
  const values = Array.from({ length: 30 }, (_, index) => 100 + 2 * index);
  assert.deepEqual(backwardDerivatives(values, 20, 3, 2), { d1: 1, d2: 0 });
  assert.deepEqual(backwardDerivatives(values, 20, 3, 4), { d1: 0.5, d2: 0 });
  assert.deepEqual(backwardDerivatives(values, 2, 3, 2), { d1: null, d2: null });
});
test("positive second derivative can coexist with a still negative first derivative", () => {
  const falling = Array.from({ length: 30 }, (_, index) => (40 - index) ** 2);
  const state = backwardDerivatives(falling, 20, 3, 2);
  assert.ok(state.d1! < 0); assert.equal(state.d2, 1);
  const rising = falling.map(value => -value);
  const other = backwardDerivatives(rising, 20, 3, 2);
  assert.ok(other.d1! > 0); assert.equal(other.d2, -1);
});
test("motion descriptions distinguish slope direction, acceleration and flat or steady cases", () => {
  assert.equal(derivativeMotion(-0.1, 0.01), "falling-decelerating");
  assert.equal(derivativeMotion(0.1, -0.01), "rising-decelerating");
  assert.equal(derivativeMotion(0, 0), "flat");
  assert.equal(derivativeMotion(0.1, 0), "rising-steady");
  assert.equal(derivativeMotion(-0.1, 0), "falling-steady");
});
function fixture(): MarketBar[] {
  return Array.from({ length: 360 }, (_, index) => {
    const close = index >= 320 ? 120 - (index - 320) * 1.2 : 100 + Math.sin(index * 0.6) * 4;
    return { time: new Date(Date.UTC(2020, 0, index + 1)).toISOString().slice(0, 10),
      open: close, close, high: close + 1, low: close - 1 } as MarketBar;
  });
}
test("all8 models preserve observed and next-bar label prefixes, including derivatives", () => {
  const source = fixture(); assert.equal(derivativeMenu().length, 8);
  for (const config of derivativeMenu()) {
    const full = classifyDerivatives(source, config), prefix = classifyDerivatives(source.slice(0, 333), config);
    assert.deepEqual(full.slice(0, 333), prefix);
    for (let index = 1; index < full.length; index++) {
      assert.equal(full[index]!.effectiveLabel, full[index - 1]!.labelAtClose);
      assert.equal(full[index]!.effectivePhase, full[index - 1]!.phaseAtClose);
    }
    assert.equal(full[320]!.phaseAtClose, "rapid-up"); assert.equal(full[320]!.reason, "shock");
  }
});
test("warning outcomes use future data only in evaluation and censor the final10 sessions", () => {
  const rows = classifyDerivatives(fixture(), primaryDerivative);
  const synthetic = rows.map((row, index) => ({ ...row, d1: index < 330 ? -0.1 : 0.1, d2: index === 325 || index === 355 ? 0.01 : 0 }));
  const evaluation = derivativeWarnings(synthetic, 320);
  assert.equal(evaluation.warnings, 1); assert.equal(evaluation.confirmations, 1); assert.equal(evaluation.medianLead, 5);
  const finalWarning = synthetic.map((row, index) => ({ ...row, d1: index >= 350 ? -0.1 : row.d1 }));
  assert.equal(derivativeWarnings(finalWarning, 320).censored, 1);
  assert.deepEqual(rows, classifyDerivatives(fixture(), primaryDerivative));
});
