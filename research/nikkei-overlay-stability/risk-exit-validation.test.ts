import assert from "node:assert/strict";
import test from "node:test";
import { riskValidationMenu, riskValidationGate, riskValidationReplay, RiskValidationAccount, validateRiskProgress } from "./risk-exit-validation";
import { exitPriorityReplay, type ExitEvidence } from "./exit-priority-study";
import { FilterContext } from "./oscillator-filter-study";
import type { MarketBar } from "../../lib/market/types";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";

const evidence: ExitEvidence = { pendingZero: false, pendingAge: 0, entryAge: 7, entryLoss: 0.04,
  wmaNegative: false, wmaNegativeTwo: false, smaUnprotected: false, emaNegative: false, emaNegativeTwo: false,
  belowEma: true, belowEmaTwo: false, belowSma: false, belowSmaTwo: false, ema20Negative: false,
  belowLowTwo: false, dayDrop: 2, previousAtr: 1 };
const buy: StrategyCycleRecentSignal[] = [{ direction: "increase", targetAllocation: 1, signals: ["long-entry"] }];
const sell: StrategyCycleRecentSignal[] = [{ direction: "reduce", targetAllocation: 0, signals: ["long-exit"] }];
const bars = (values: number[]) => values.map((close, index) => ({ time: String(index), open: close, close, high: close + 1, low: close - 1 }) as MarketBar);

test("292 cases freeze age6..15, thresholds3.5/4/4.5, four ATR multipliers and OR/AND", () => {
  const menu = riskValidationMenu(); assert.equal(menu.length, 292); assert.equal(new Set(menu.map(row => row.id)).size, 292);
  assert.equal(menu.filter(row => row.family === "loss").length, 240); assert.equal(menu.filter(row => row.family === "atr").length, 32);
  assert.equal(menu.filter(row => row.family === "or" || row.family === "and").length, 16);
});
test("age/loss/ATR neighborhood gates are inclusive and OR differs from AND", () => {
  const base = riskValidationMenu()[0]!;
  assert.equal(riskValidationGate({ ...base, family: "loss", age: 7 }, evidence), true);
  assert.equal(riskValidationGate({ ...base, family: "loss", age: 6 }, evidence), false);
  assert.equal(riskValidationGate({ ...base, family: "loss", loss: 0.045 }, evidence), false);
  assert.equal(riskValidationGate({ ...base, family: "atr", atrMultiple: 2 }, evidence), true);
  assert.equal(riskValidationGate({ ...base, family: "atr", atrMultiple: 2.25 }, evidence), false);
  assert.equal(riskValidationGate({ ...base, family: "or", loss: 0.045 }, evidence), true);
  assert.equal(riskValidationGate({ ...base, family: "and", loss: 0.045 }, evidence), false);
  assert.equal(riskValidationGate({ ...base, family: "atr" }, { ...evidence, previousAtr: null }), false);
});
test("actual-account risk cleanup and five-bar wait survive parameterization", () => {
  const source = bars([...Array(20).fill(100), 101, ...Array(6).fill(101), 96, ...Array(8).fill(110)]);
  const base = riskValidationMenu()[0]!;
  const account = new RiskValidationAccount(new FilterContext(source), { ...base, family: "loss", wait: 5 }, 20);
  account.step(20, buy); for (let index = 21; index <= 26; index++) account.step(index, []);
  assert.equal(account.step(27, []).riskExit, true);
  const raw = account.inner.inner.account.inner.account;
  assert.equal(raw.account.pending, null); assert.equal(raw.enteredAt, null); assert.equal(raw.recoveryTarget, null);
  for (let index = 28; index <= 32; index++) assert.equal(account.step(index, buy).target, 0);
  assert.equal(account.step(33, buy).target, 1);
});
test("all292 paths preserve prefixes and deployment starts with the unchanged native account", () => {
  const source = bars(Array.from({ length: 110 }, (_, index) => 100 + 12 * Math.sin(index / 3)));
  const context = new FilterContext(source), prefix = new FilterContext(source.slice(0, 80));
  const decisions = new Map([[25, buy], [35, sell], [50, buy], [65, sell]]);
  for (const policy of riskValidationMenu()) {
    const full = riskValidationReplay(context, decisions, 20, policy);
    assert.deepEqual(full.targets.slice(0, 80), riskValidationReplay(prefix, decisions, 20, policy).targets);
    const native = exitPriorityReplay(context, decisions, 20, policy.base);
    assert.deepEqual(riskValidationReplay(context, decisions, 20, policy, false, 81).targets.slice(0, 81), native.targets.slice(0, 81));
    assert.deepEqual(riskValidationReplay(context, decisions, 20, policy, false, 20, () => false).targets, native.targets);
  }
});
test("ordered validation progress preserves source/code/policy identity", () => {
  const menu = riskValidationMenu(), saved = { sourceHash: "source", implementationHash: "code", rows: menu.slice(0, 20).map(policy => ({ policy })) };
  assert.doesNotThrow(() => validateRiskProgress(saved, "source", "code", menu));
  assert.throws(() => validateRiskProgress(saved, "changed", "code", menu));
  assert.throws(() => validateRiskProgress(saved, "source", "changed", menu));
  assert.throws(() => validateRiskProgress({ ...saved, rows: [...saved.rows].reverse() }, "source", "code", menu));
});
