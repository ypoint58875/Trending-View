import assert from "node:assert/strict";
import test from "node:test";
import { SmaPositionOverlay, ENGULF_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS, FIXED_HOLD5_POSITION_OVERLAY_MODEL,
  SUPPLEMENTAL_MINIMUM_HOLD_BARS, EARLY_POSITION_STOP_BARS } from "../lib/analysis/sma-position-overlay";
import { runAllocationBacktest } from "../lib/analysis/backtest";
import type { MarketBar } from "../lib/market/types";
function bars(values: number[]): MarketBar[] {
  return values.map((close, i) => ({ time: new Date(Date.UTC(2024, 0, i + 1)).toISOString().slice(0, 10),
    timestamp: Date.UTC(2024, 0, i + 1), open: close, high: close + 1, low: close - 1, close, volume: 1000,
    amount: 0, amplitude: 0, changePercent: 0, change: 0, turnoverRate: 0 }));
}
function reversal(tail = [94.8, 94.6, 94.5, 94.4, 94.3, 94.2, 94]) {
  const source = bars([...Array(20).fill(100), 92, 95, ...tail]);
  source[20]!.open = 94; source[20]!.high = 95;
  source[21]!.open = 91; source[21]!.low = 90;
  return source;
}
const controller = (source: MarketBar[]) => new SmaPositionOverlay(source, DEFAULT_POSITION_OVERLAY_OPTIONS);
test("v5 body reversal buys below slow averages while archived v4 remains flat", () => {
  const source = reversal(), current = controller(source);
  const historical = new SmaPositionOverlay(source, { ...DEFAULT_POSITION_OVERLAY_OPTIONS, model: FIXED_HOLD5_POSITION_OVERLAY_MODEL });
  assert.equal(current.close(21, false), 1); assert.equal(current.close(21, false), 1);
  assert.equal(historical.close(21, false), 0);
});
test("seven-session supplemental protection does not extend the five-session stop window", () => {
  assert.equal(SUPPLEMENTAL_MINIMUM_HOLD_BARS, 7); assert.equal(EARLY_POSITION_STOP_BARS, 5);
  const account = controller(reversal()); account.close(21, false);
  assert.equal(account.request("reduce", 0.3, 22), 1); account.close(22, true);
  for (let i = 23; i <= 27; i++) assert.equal(account.close(i, false), 1);
  assert.equal(account.close(28, false), 0.3);
});
test("original signals take priority and cooldown blocks even a qualifying reversal", () => {
  const source = reversal(); assert.equal(controller(source).close(21, true), 0);
  const stopped = controller(source);
  stopped.request("increase", 1, 19); stopped.close(19, true);
  assert.equal(stopped.close(20, false), 0);
  assert.equal(stopped.close(21, false), 0);
});
test("emergency four-percent exit overrides a new reversal holding lock", () => {
  const account = controller(reversal([90, ...Array(8).fill(110)]));
  assert.equal(account.close(21, false), 1); assert.equal(account.close(22, false), 0);
  for (let i = 23; i <= 27; i++) assert.equal(account.close(i, false), 0);
  assert.equal(account.close(28, false), 1);
});
test("body and preceding-decline requirements prevent false reversal entries", () => {
  const body = reversal(); body[21]!.open = 93;
  assert.equal(controller(body).close(21, false), 0);
  const decline = reversal(); decline[21]!.open = 96; decline[21]!.close = 97; decline[21]!.high = 98;
  assert.equal(controller(decline).close(21, false), 0);
});
test("ordinary reversal buys fill no earlier than the following open", () => {
  const source = reversal(), target = source.map(() => 0);
  const result = runAllocationBacktest(source, target, { initialCash: 100000, commissionRate: 0, slippageRate: 0,
    interval: "1d", executionPolicy: "next-open", positionOverlay: DEFAULT_POSITION_OVERLAY_OPTIONS });
  assert.equal(result.rebalances[0]!.time, source[22]!.time);
  assert.equal(result.rebalances[0]!.targetAllocation, 1);
});
test("reversal decisions and holding protection are prefix causal", () => {
  const source = reversal([...Array(12).fill(94), 96, 90, 110]);
  const full = controller(source), prefix = controller(source.slice(0, 29));
  for (let i = 19; i < 29; i++) {
    if (i === 22) { full.request("reduce", 0.3, i); prefix.request("reduce", 0.3, i); }
    assert.equal(full.close(i, i === 22), prefix.close(i, i === 22));
  }
});
