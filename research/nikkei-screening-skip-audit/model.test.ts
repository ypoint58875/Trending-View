import assert from "node:assert/strict";
import test from "node:test";
import { compare, Stepper } from "./model";
import type { MarketBar } from "../../lib/market/types";
const bars = Array.from({ length: 40 }, (_, index) => ({ time: `${index}`, timestamp: index,
  open: 100 + index, close: 100 + index, high: 101 + index, low: 99 + index,
  volume: 0, amount: 0, amplitude: 0, changePercent: 0, change: 0, turnoverRate: 0 })) as MarketBar[];
const settings = { initialCash: 100000, commissionRate: .0003, slippageRate: .0002, interval: "1d" as const };

test("a quiet winner replacement changes future strategy despite identical account and risk state", () => {
  const stepper = new Stepper(bars, settings), before = { ...stepper.initial(20), planKey: "old" };
  const actual = stepper.step(before, 20, [], "new"), omitted = stepper.step(before, 20, []);
  const result = compare(actual, omitted);
  assert.equal(result.fillsEqual, true); assert.equal(result.overlayEqual, true);
  assert.equal(result.accountEqual, true); assert.equal(result.planEqual, false); assert.equal(result.fullEqual, false);
});

test("a rule-blocked buy can cancel pending reductions without causing a fill", () => {
  const stepper = new Stepper(bars, settings), before = stepper.initial(20);
  before.overlay.allocation = 1; before.overlay.previousCloseAllocation = 1;
  before.overlay.pending = 0; before.target = 1; before.planned = 1;
  before.account = { cash: 0, units: 1000 }; before.planKey = "same";
  const skipped = stepper.step(before, 20, []);
  const bought = stepper.step(before, 20, [{ direction: "increase", targetAllocation: 1, signals: [] }]);
  assert.equal(compare(bought, skipped).fillsEqual, true);
  assert.equal(bought.state.overlay.pending, null); assert.equal(skipped.state.overlay.pending, 0);
  assert.equal(compare(bought, skipped).fullEqual, false);
});

test("serialized states and repeated counterfactual probes cannot contaminate the accepted branch", () => {
  const stepper = new Stepper(bars, settings), before = stepper.initial(20), saved = JSON.stringify(before);
  const first = stepper.step(before, 20, [], "winner");
  stepper.step(before, 20, [{ direction: "increase", targetAllocation: 1, signals: [] }], "other");
  assert.deepEqual(stepper.step(JSON.parse(saved), 20, [], "winner"), first);
  assert.equal(JSON.stringify(before), saved);
  assert.equal(compare(first, first).fullEqual, true);
});

test("research override clears a guarded position once at the completed close", () => {
  const stepper = new Stepper(bars, settings), before = stepper.initial(20);
  before.overlay.allocation = 1; before.overlay.previousCloseAllocation = 1;
  before.target = 1; before.planned = 1;
  before.account = { cash: 0, units: 500 };
  const signals = [{ direction: "reduce" as const, targetAllocation: 0, signals: [] }];
  assert.equal(stepper.step(before, 20, signals).state.overlay.pending, 0);
  const forced = stepper.step(before, 20, signals, null, true);
  assert.equal(forced.state.account.units, 0);
  assert.equal(forced.state.overlay.pending, null);
  assert.equal(forced.fills.length, 1);
  assert.equal(forced.fills[0].fillPrice, bars[20].close * (1 - settings.slippageRate));
  assert.equal(stepper.step(forced.state, 21, []).fills.length, 0);
});
