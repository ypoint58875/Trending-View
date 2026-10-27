import assert from "node:assert/strict";
import test from "node:test";
import { HOLD5_POSITION_OVERLAY_MODEL, PREVIOUS_POSITION_OVERLAY_MODEL, MIXED_POSITION_OVERLAY_MODEL, SmaPositionOverlay, normalizeSmaPositionOverlay } from "../lib/analysis/sma-position-overlay";
import { runAllocationBacktest } from "../lib/analysis/backtest";
import { parseStrategyAllocationPlan, strategyPlansEqual } from "../lib/analysis/saved-backtests";
import { buildCheckpointIdentity } from "../lib/analysis/screening-worker-client";
import type { MarketBar } from "../lib/market/types";
const model = MIXED_POSITION_OVERLAY_MODEL;
const bars = (values: number[]) => values.map((close, i) => ({ time: new Date(Date.UTC(2024, 0, i + 1)).toISOString().slice(0, 10),
  timestamp: Date.UTC(2024, 0, i + 1), open: close, high: close + 1, low: close - 1, close, volume: 1000 }) as MarketBar);
const settings = { initialCash: 100000, commissionRate: 0.0003, slippageRate: 0.0002, interval: "1d" as const, executionPolicy: "next-open" as const };

const screeningIdentity = (instrumentKey: string, sessions: number, config: Parameters<typeof buildCheckpointIdentity>[1], objective: "totalReturn") =>
  buildCheckpointIdentity([], config, { mode: "sample", periods: [{ sessions, weight: 100 }] }, { objective, checkpointNamespace: instrumentKey }).signature;

test("mixed EMA7 turn supplements only on the crossing and fills at next open", () => {
  const source = bars([...Array(20).fill(100), 90, 95, 101, 102, 103]);
  const overlay = new SmaPositionOverlay(source, { model, supplementalEntry: true });
  assert.equal(overlay.close(21, false), 0);
  assert.equal(overlay.close(22, false), 1);
  const result = runAllocationBacktest(source, source.map(() => 0), { ...settings, positionOverlay: { model, supplementalEntry: true } });
  assert.equal(result.rebalances[0]!.time, source[23]!.time);
  const suppressed = new SmaPositionOverlay(source, { model, supplementalEntry: true });
  assert.equal(suppressed.close(22, true), 0);
  assert.equal(suppressed.close(23, false), 0);
});

test("mixed SMA11 protection uses 0.125 percent, releases partial targets and cancels stale requests", () => {
  const source = bars([...Array(20).fill(100), 101.65, 101.65, 99]);
  const overlay = new SmaPositionOverlay(source, { model, exitGuard: true }, 1);
  assert.equal(overlay.request("reduce", 0.3, 20), 1);
  assert.equal(overlay.close(22, false), 0.3);
  const fresh = new SmaPositionOverlay(source, { model, exitGuard: true }, 1);
  fresh.request("reduce", 0, 20); fresh.request("increase", 0.3, 21);
  assert.equal(fresh.close(22, false), 1);
  assert.equal(new SmaPositionOverlay(source, { exitGuard: true }, 1).request("reduce", 0, 20), 0);
});

test("mixed WMA14 gate blocks negative slope, permits equality and cannot block existing-position adds", () => {
  const source = bars([...Array(20).fill(100), 90, 95, 101, 102]);
  const gate = new SmaPositionOverlay(source, { model, entrySlopeGate: true });
  assert.equal(gate.request("increase", 1, 13), 0);
  assert.equal(gate.request("increase", 0.3, 14), 0.3);
  assert.equal(gate.request("increase", 1, 20), 1);
  const flat = new SmaPositionOverlay(source, { model, entrySlopeGate: true });
  assert.equal(flat.request("increase", 1, 20), 0);
  assert.equal(flat.request("increase", 1, 22), 1);
});

test("model survives saved plans, rejects unknown versions and separates legacy identities", () => {
  const plan = { strategyA: { strategyId: "sma-cross", parameters: { fast: 10, slow: 30 } }, strategyB: null,
    strategyAAllocation: 1, strategyBAllocation: 0, positionOverlay: { model, supplementalEntry: true } };
  const parsed = parseStrategyAllocationPlan(plan)!;
  assert.deepEqual(parsed.positionOverlay, { model, supplementalEntry: true });
  assert.equal(parseStrategyAllocationPlan({ ...plan, positionOverlay: { model: "unknown", supplementalEntry: true } }), null);
  assert.equal(strategyPlansEqual(parsed, { ...parsed, positionOverlay: { supplementalEntry: true } }), false);
  assert.notEqual(screeningIdentity("index:N225", 10, { ...settings, positionOverlay: { model, supplementalEntry: true } }, "totalReturn"),
    screeningIdentity("index:N225", 10, { ...settings, positionOverlay: { supplementalEntry: true } }, "totalReturn"));
  assert.equal(normalizeSmaPositionOverlay({ model }), undefined);
});

test("current SMA11 guard protects between 0.075 and 0.125 percent and releases below the new threshold", () => {
  const source = bars([...Array(20).fill(100), 101.1, 100.5]);
  const updated = new SmaPositionOverlay(source, { model: HOLD5_POSITION_OVERLAY_MODEL, exitGuard: true }, 1);
  const historical = new SmaPositionOverlay(source, { model, exitGuard: true }, 1);
  assert.equal(updated.request("reduce", 0.3, 20), 1);
  assert.equal(historical.request("reduce", 0.3, 20), 0.3);
  assert.equal(updated.close(21, false), 0.3);
});

test("current WMA7 gate warms up earlier and preserves flat-only restrictions", () => {
  const source = bars([...Array(20).fill(100), 90, 95, 101]);
  const updated = new SmaPositionOverlay(source, { model: HOLD5_POSITION_OVERLAY_MODEL, entrySlopeGate: true });
  const historical = new SmaPositionOverlay(source, { model, entrySlopeGate: true });
  assert.equal(updated.request("increase", 1, 6), 0);
  assert.equal(updated.request("increase", 0.3, 7), 0.3);
  assert.equal(historical.request("increase", 0.3, 7), 0);
  assert.equal(updated.request("increase", 1, 20), 1);
  assert.equal(new SmaPositionOverlay(source, { model: HOLD5_POSITION_OVERLAY_MODEL, entrySlopeGate: true }).request("increase", 1, 20), 0);
});

test("current model preserves EMA7 turns and remains distinct in saved plans and checkpoints", () => {
  const source = bars([...Array(20).fill(100), 90, 95, 101, 102]);
  const updated = new SmaPositionOverlay(source, { model: HOLD5_POSITION_OVERLAY_MODEL, supplementalEntry: true });
  assert.equal(updated.close(21, false), 0);
  assert.equal(updated.close(22, false), 1);
  const result = runAllocationBacktest(source, source.map(() => 0), {
    ...settings, positionOverlay: { model: HOLD5_POSITION_OVERLAY_MODEL, supplementalEntry: true },
  });
  assert.equal(result.rebalances[0]!.time, source[23]!.time);
  const plan = { strategyA: { strategyId: "sma-cross", parameters: { fast: 10, slow: 30 } }, strategyB: null,
    strategyAAllocation: 1, strategyBAllocation: 0, positionOverlay: { model: HOLD5_POSITION_OVERLAY_MODEL, supplementalEntry: true } };
  const parsed = parseStrategyAllocationPlan(plan)!;
  assert.deepEqual(parsed.positionOverlay, plan.positionOverlay);
  assert.equal(strategyPlansEqual(parsed, { ...parsed, positionOverlay: { model, supplementalEntry: true } }), false);
  assert.notEqual(screeningIdentity("index:N225", 10, { ...settings, positionOverlay: plan.positionOverlay }, "totalReturn"),
    screeningIdentity("index:N225", 10, { ...settings, positionOverlay: { model, supplementalEntry: true } }, "totalReturn"));
});

test("EMA supplemental holding lock keeps the minimum pending target until bar five", () => {
  const source = bars([...Array(20).fill(100), 90, 95, 101, 100, 99, 98, 97, 96]);
  const current = new SmaPositionOverlay(source, { model: HOLD5_POSITION_OVERLAY_MODEL, supplementalEntry: true });
  assert.equal(current.close(22, false), 1);
  assert.equal(current.request("reduce", 0.4, 23), 1);
  assert.equal(current.request("reduce", 0.2, 24), 1);
  assert.equal(current.close(26, false), 1);
  assert.equal(current.close(27, false), 0.2);
  const previous = new SmaPositionOverlay(source, { model: PREVIOUS_POSITION_OVERLAY_MODEL, supplementalEntry: true });
  previous.close(22, false);
  assert.equal(previous.request("reduce", 0, 23), 0);
});

test("holding lock does not apply to original buys and fresh buys cancel pending reductions", () => {
  const source = bars([...Array(20).fill(100), 90, 95, 101, 100, 99, 98, 97, 96]);
  const original = new SmaPositionOverlay(source, { model: HOLD5_POSITION_OVERLAY_MODEL, supplementalEntry: true });
  original.request("increase", 1, 22); original.close(22, true);
  assert.equal(original.request("reduce", 0, 23), 0);
  const supplemental = new SmaPositionOverlay(source, { model: HOLD5_POSITION_OVERLAY_MODEL, supplementalEntry: true });
  supplemental.close(22, false); supplemental.request("reduce", 0, 23); supplemental.request("increase", 1, 24);
  assert.equal(supplemental.close(27, false), 1);
});

test("v2 and hold5 saved plans retain distinct execution and checkpoint identities", () => {
  const plan = { strategyA: { strategyId: "sma-cross", parameters: { fast: 10, slow: 30 } }, strategyB: null,
    strategyAAllocation: 1, strategyBAllocation: 0, positionOverlay: { model: PREVIOUS_POSITION_OVERLAY_MODEL, supplementalEntry: true } };
  assert.deepEqual(parseStrategyAllocationPlan(plan)!.positionOverlay, plan.positionOverlay);
  assert.notEqual(screeningIdentity("index:N225", 10, { ...settings, positionOverlay: plan.positionOverlay }, "totalReturn"),
    screeningIdentity("index:N225", 10, { ...settings, positionOverlay: { ...plan.positionOverlay, model: HOLD5_POSITION_OVERLAY_MODEL } }, "totalReturn"));
});
