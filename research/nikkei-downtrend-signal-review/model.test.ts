import assert from "node:assert/strict";
import test from "node:test";
import { replay, skippedDown } from "./model";
import type { MarketBar } from "../../lib/market/types";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
const bars = Array.from({ length: 50 }, (_, index) => ({ time: `2024-01-${index + 1}`, timestamp: index,
  open: 151 - index, close: 150 - index, high: 152 - index, low: 149 - index,
  volume: 0, amount: 0, amplitude: 0, changePercent: 0, change: 0, turnoverRate: 0 })) as MarketBar[];
const settings = { initialCash: 100000, commissionRate: .0003, slippageRate: .0002, interval: "1d" as const };
const buy: StrategyCycleRecentSignal = { direction: "increase", targetAllocation: 1, signals: [] };
const sell: StrategyCycleRecentSignal = { direction: "reduce", targetAllocation: 0, signals: [] };

test("only skipped bearish downtrend days qualify, not ordinary trigger or strong uptrend days", () => {
  assert.equal(skippedDown(bars, 20), true);
  const rising = bars.map((bar, i) => ({ ...bar, open: 100 + i, close: 101 + i }));
  assert.equal(skippedDown(rising, 20), false);
  const reversal = structuredClone(bars); reversal[20].open = reversal[20].close - 1;
  assert.equal(skippedDown(reversal, 20), false);
});

test("an empty account does not consume skipped-day buys or manufacture entries", () => {
  const path = replay(bars, new Map([[20, []]]), new Map([[21, [buy]]]), 20, settings, "holding-downtrend");
  assert.equal(path.days.find(day => day.index === 21)!.checked, false);
  assert.equal(path.days.find(day => day.index === 21)!.direction, "increase");
  assert.equal(path.fills.length, 0);
});

test("serialized resume produces the exact controller, account, daily traces and fills", () => {
  const input = bars.map((bar, index) => {
    const close = index < 20 ? 100 + index : 118 - (index - 20) * 1.5;
    return { ...bar, open: close + .5, close, high: close + .8, low: close - .8 };
  });
  const regular = new Map([[20, [buy]], [35, [sell]]]);
  const extra = new Map([[24, [sell]]]);
  for (const policy of ["baseline", "holding-downtrend", "down-entry-run", "bearish-entry-run"] as const) {
    const full = replay(input, regular, extra, 20, settings, policy);
    assert.ok(full.fills.length > 0);
    const part = replay(input, regular, extra, 20, settings, policy, 30);
    assert.deepEqual(replay(input, regular, extra, 20, settings, policy, 50, JSON.parse(JSON.stringify(part))), full);
    assert.deepEqual(replay(input.slice(0, 30), regular, extra, 20, settings, policy).days, full.days.slice(0, 10));
  }
});

test("a down-entry holding is checked only during its uninterrupted decline, and sell guards remain active", () => {
  const input = bars.map((bar, index) => {
    const close = index < 20 ? 100 + index : index === 20 ? 118 : index === 21 ? 116.8 : 117.1 - (index - 22) * .7;
    return { ...bar, open: close + .5, close, high: close + .6, low: close - .6 };
  });
  const regular = new Map([[20, [buy]]]), extras = new Map([[21, [sell]], [23, [sell]]]);
  const path = replay(input, regular, extras, 20, settings, "down-entry-run");
  const first = path.days.find(day => day.index === 21)!;
  assert.equal(first.held, true); assert.equal(first.checked, true);
  assert.equal(first.actualClear, false); assert.equal(first.pendingAfter, 0);
  assert.equal(path.days.find(day => day.index === 23)!.checked, false);
});
