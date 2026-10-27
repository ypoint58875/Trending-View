import assert from "node:assert/strict";
import test from "node:test";
import { peakWindowMenu } from "./peak-window-study";
import { PeakLiquidationAccount, peakReplay, validatePeakProgress } from "./peak-liquidation-study";
import { FilterContext, filterReplay } from "./oscillator-filter-study";
import type { MarketBar } from "../../lib/market/types";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";

const source = Array.from({ length: 100 }, (_, index) => ({ time: String(index), open: 100, close: 100 + 14 * Math.sin(index / 3),
  high: 115, low: 85 }) as MarketBar);
const buy: StrategyCycleRecentSignal[] = [{ direction: "increase", targetAllocation: 1, signals: ["long-entry"] }];
const sell: StrategyCycleRecentSignal[] = [{ direction: "reduce", targetAllocation: 0, signals: ["long-exit"] }];
test("menu covers all16 windows, five thresholds and both waits for four models without episode cases", () => {
  const menu = peakWindowMenu(), stops = menu.filter(row => row.threshold !== null);
  assert.equal(menu.length, 644); assert.equal(new Set(menu.map(row => row.id)).size, 644);
  assert.deepEqual([...new Set(stops.map(row => row.window))], Array.from({ length: 16 }, (_, index) => index + 5));
  assert.equal(new Set(stops.map(row => row.threshold)).size, 5);
  assert.equal(stops.filter(row => row.wait === 5).length, 320);
});
test("rolling5 expires an old peak earlier than rolling20 without using pre-entry prices", () => {
  const prices = [...Array(20).fill(100), 101, 110, ...Array(4).fill(108), 106];
  const context = new FilterContext(prices.map((close, index) => ({ time: String(index), open: close, close, high: close + 1, low: close - 1 }) as MarketBar));
  const short = new PeakLiquidationAccount(context, { ...peakWindowMenu()[0]!, window: 5, threshold: 0.03 }, 20);
  const long = new PeakLiquidationAccount(context, { ...peakWindowMenu()[0]!, window: 20, threshold: 0.03 }, 20);
  for (const account of [short, long]) { account.step(20, buy); for (let index = 21; index <= 25; index++) account.step(index, []); }
  assert.equal(short.step(26, []).peakCut, false); assert.equal(long.step(26, []).peakCut, true);
});
test("all644 paths retain causal prefixes and four disabled controls match existing accounts", () => {
  const context = new FilterContext(source), prefix = new FilterContext(source.slice(0, 75));
  const decisions = new Map([[25, buy], [36, sell], [50, buy], [63, sell]]);
  for (const policy of peakWindowMenu()) {
    const full = peakReplay(context, decisions, 20, policy);
    assert.deepEqual(full.targets.slice(0, 75), peakReplay(prefix, decisions, 20, policy).targets);
    if (policy.threshold === null) assert.deepEqual(full.targets, filterReplay(context, decisions, 20, policy.entry).targets);
  }
});
test("new-window checkpoints reject narrowed window/threshold policy drift", () => {
  const menu = peakWindowMenu(), saved = { sourceHash: "source", implementationHash: "code", rows: menu.slice(0, 25).map(policy => ({ policy })) };
  assert.doesNotThrow(() => validatePeakProgress(saved, "source", "code", menu));
  assert.throws(() => validatePeakProgress(saved, "source", "code", menu.map(row => ({ ...row, window: 20 }))));
});
