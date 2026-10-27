import assert from "node:assert/strict";
import test from "node:test";
import { intent, legCount } from "./six-vs-five";
import type { StrategyAllocationPlan } from "../../lib/analysis/strategy-combinations";

test("strategy-count audit excludes absent and zero-weight legs", () => {
  const strategy = { strategyId: "sma-cross" as const, parameters: { fast: 10, slow: 30 } };
  const plan: StrategyAllocationPlan = { strategyA: strategy, strategyAAllocation: 0.4,
    strategyB: strategy, strategyBAllocation: 0, strategyC: strategy, strategyCAllocation: 0.6 };
  assert.equal(legCount(plan), 2);
  assert.equal(legCount({ ...plan, strategyC: null, strategyCAllocation: 0 }), 1);
});

test("intent comparison preserves two-bar order and distinguishes conflict-hold from no signal", () => {
  const buy = { direction: "increase" as const, targetAllocation: 1, signals: [] };
  const sell = { direction: "reduce" as const, targetAllocation: 0, signals: [] };
  assert.deepEqual(intent([]), { sequence: [], direction: null, target: null });
  assert.equal(intent([sell, buy]).direction, null);
  assert.equal(intent([buy, sell]).direction, "reduce");
  assert.equal(intent([buy, sell]).target, 0);
  assert.notDeepEqual(intent([sell, buy]), intent([]));
  assert.notDeepEqual(intent([buy]), intent([{ ...buy, targetAllocation: 0.4 }]));
});
