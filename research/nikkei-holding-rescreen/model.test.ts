import assert from "node:assert/strict";
import test from "node:test";
import { needsHoldingScreen } from "./model";
import { Stepper } from "../nikkei-screening-skip-audit/model";
import type { MarketBar } from "../../lib/market/types";
const bars = Array.from({ length: 50 }, (_, i) => ({ time: `2024-${String(i).padStart(3, "0")}`,
  timestamp: i, open: 151 - i, close: 150 - i, high: 152 - i, low: 149 - i,
  volume: 0, amount: 0, amplitude: 0, changePercent: 0, change: 0, turnoverRate: 0 })) as MarketBar[];
test("only an actual holding restores a skipped downtrend bearish screen", () => {
  assert.equal(needsHoldingScreen(bars, 20, 1), true);
  assert.equal(needsHoldingScreen(bars, 20, 0), false);
  const rising = bars.map((b, i) => ({ ...b, open: 100 + i, close: 101 + i }));
  assert.equal(needsHoldingScreen(rising, 20, 1), false);
  const bullish = structuredClone(bars); bullish[20].open = bullish[20].close - 1;
  assert.equal(needsHoldingScreen(bullish, 20, 1), false);
});
test("a winner replacement is carried even without a fill; serialized recovery preserves state", () => {
  const settings = { initialCash: 100000, commissionRate: .0003, slippageRate: .0002, interval: "1d" as const };
  const stepper = new Stepper(bars, settings), before = stepper.initial(20);
  const first = stepper.step(before, 20, [], "new-winner");
  assert.equal(first.fills.length, 0); assert.equal(first.state.planKey, "new-winner");
  const next = stepper.step(first.state, 21, []);
  assert.deepEqual(new Stepper(bars, settings).step(JSON.parse(JSON.stringify(first.state)), 21, []), next);
  assert.deepEqual(new Stepper(bars.slice(0, 22), settings).step(first.state, 21, []), next);
});
