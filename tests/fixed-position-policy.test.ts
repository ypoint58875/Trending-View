import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_POSITION_OVERLAY_OPTIONS, CURRENT_POSITION_OVERLAY_MODEL, HOLD5_POSITION_OVERLAY_MODEL, FIXED_HOLD5_POSITION_OVERLAY_MODEL,
  POSITION_OVERLAY_MODELS, normalizeSmaPositionOverlay, SmaPositionOverlay } from "../lib/analysis/sma-position-overlay";
import { ema, sma, wma } from "../lib/analysis/indicators";
import { runAllocationBacktest } from "../lib/analysis/backtest";
import { parseStrategyAllocationPlan } from "../lib/analysis/saved-backtests";
import { buildCheckpointIdentity } from "../lib/analysis/screening-worker-client";
import type { MarketBar } from "../lib/market/types";
const bars = (values: number[]) => values.map((close, i) => ({ time: new Date(Date.UTC(2024, 0, i + 1)).toISOString().slice(0, 10),
  timestamp: Date.UTC(2024, 0, i + 1), open: close, high: close + 1, low: close - 1, close, volume: 1000 }) as MarketBar);
const controller = (source: MarketBar[], initial = 0) => new SmaPositionOverlay(source,
  { ...DEFAULT_POSITION_OVERLAY_OPTIONS, model: FIXED_HOLD5_POSITION_OVERLAY_MODEL }, initial);

test("fixed policy cannot be disabled through former boolean flags and saved versions retain identities", () => {
  assert.deepEqual(normalizeSmaPositionOverlay({ model: CURRENT_POSITION_OVERLAY_MODEL, supplementalEntry: false, exitGuard: false, entrySlopeGate: false }), DEFAULT_POSITION_OVERLAY_OPTIONS);
  const signatures = [];
  for (const model of POSITION_OVERLAY_MODELS) {
    const plan = { strategyA: { strategyId: "sma-cross", parameters: { fast: 10, slow: 30 } }, strategyB: null,
      strategyAAllocation: 1, strategyBAllocation: 0, positionOverlay: { model, supplementalEntry: true } };
    assert.equal(parseStrategyAllocationPlan(plan)!.positionOverlay!.model, model);
    signatures.push(buildCheckpointIdentity([], { initialCash: 100000, commissionRate: 0, slippageRate: 0, interval: "1d", positionOverlay: plan.positionOverlay },
      { mode: "sample", periods: [{ sessions: 10, weight: 100 }] }, { objective: "totalReturn" }).signature);
  }
  assert.equal(new Set(signatures).size, POSITION_OVERLAY_MODELS.length);
});

test("SMA20 gate blocks only supplements and does not reject original buys", () => {
  const source = bars([...Array(40).fill(100), 98, 96, 94, 92, 90, 89, 89, 90, 91, 92, 93, 94]);
  const closes = source.map(b => b.close), e = ema(closes, 7), s = sma(closes, 20), w = wma(closes, 7);
  const index = source.findIndex((b, i) => i > 20 && e[i]! > e[i - 1]! && e[i - 1]! <= e[i - 2]! && w[i]! >= w[i - 1]! && b.close <= s[i]!);
  assert.ok(index >= 0, "fixture must isolate the supplemental SMA20 gate");
  const supplement = controller(source); assert.equal(supplement.close(index, false), 0);
  const original = controller(source); assert.equal(original.request("increase", 1, index), 1); assert.equal(original.close(index, true), 1);
});

test("WMA confirmation retains a pending partial reduction when SMA guard permits selling", () => {
  const source = bars([...Array(20).fill(100), 101.1, 100.5, 99]), overlay = controller(source, 1);
  assert.equal(overlay.request("reduce", 0.3, 21), 1);
  assert.equal(overlay.close(21, true), 1);
  assert.equal(overlay.close(22, false), 0.3);
});

test("regular pending reductions wait five intervals and keep their minimum target", () => {
  const source = bars([...Array(20).fill(100), 99, 99.2, 100.2, 100.1, 100, 99.9, 99.8, 99.5]), overlay = controller(source);
  assert.equal(overlay.close(22, false), 1);
  assert.equal(overlay.request("reduce", 0.4, 23), 1); overlay.close(23, true);
  assert.equal(overlay.request("reduce", 0.3, 24), 1); overlay.close(24, true);
  assert.equal(overlay.close(26, false), 1);
  assert.equal(overlay.close(27, false), 0.3);
});

test("early cumulative stop overrides hold5 and cooldown blocks all entries until day six", () => {
  const source = bars([...Array(20).fill(100), 90, 95, 101, 99, 98, 96, ...Array(7).fill(110)]), overlay = controller(source);
  assert.equal(overlay.close(22, false), 1);
  overlay.request("reduce", 0, 23); assert.equal(overlay.close(23, true), 1);
  assert.equal(overlay.close(24, false), 1);
  assert.equal(overlay.close(25, false), 0);
  assert.equal(overlay.close(25, false), 0, "repeated close must not recover on the stop day");
  for (let i = 26; i <= 30; i++) { assert.equal(overlay.request("increase", 1, i), 0); assert.equal(overlay.close(i, true), 0); }
  assert.equal(overlay.close(31, false), 1, "trend recovery may execute only after the full cooldown");
});

test("early stop includes the fifth interval but does not become a permanent stop", () => {
  for (const age of [5, 6]) {
    const source = bars([...Array(20).fill(100), 101, ...Array(age - 1).fill(101), 96]), overlay = controller(source);
    overlay.request("increase", 1, 20); overlay.close(20, true);
    for (let i = 21; i < 20 + age; i++) overlay.close(i, false);
    assert.equal(overlay.close(20 + age, false), age === 5 ? 0 : 1);
  }
});

test("ordinary execution fills stop intent at the next open and old hold5 is unchanged", () => {
  const source = bars([...Array(20).fill(100), 101, 99, 98, 96, ...Array(8).fill(110)]);
  const settings = { initialCash: 100000, commissionRate: 0.0003, slippageRate: 0.0002, interval: "1d" as const, executionPolicy: "next-open" as const };
  const target = source.map((_, i) => i < 20 ? 0 : 1);
  const current = runAllocationBacktest(source, target, { ...settings, positionOverlay: DEFAULT_POSITION_OVERLAY_OPTIONS });
  assert.equal(current.rebalances[0]!.time, source[21]!.time);
  assert.equal(current.rebalances[1]!.time, source[24]!.time);
  assert.equal(current.rebalances[1]!.targetAllocation, 0);
  const historical = runAllocationBacktest(source, target, { ...settings, positionOverlay: { model: HOLD5_POSITION_OVERLAY_MODEL, supplementalEntry: true, exitGuard: true, entrySlopeGate: true } });
  assert.equal(historical.rebalances.length, 1);
});

test("fixed policy never uses future bars", () => {
  const source = bars(Array.from({ length: 100 }, (_, i) => 100 + i / 5 + 4 * Math.sin(i / 2)));
  const full = controller(source), prefix = controller(source.slice(0, 70));
  for (let i = 20; i < 70; i++) {
    const buy = i % 11 === 0, sell = i % 13 === 0;
    if (buy || sell) { full.request(buy ? "increase" : "reduce", buy ? 1 : 0, i); prefix.request(buy ? "increase" : "reduce", buy ? 1 : 0, i); }
    assert.equal(full.close(i, buy || sell), prefix.close(i, buy || sell));
  }
});
