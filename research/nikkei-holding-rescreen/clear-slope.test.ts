import assert from "node:assert/strict";
import test from "node:test";
import { Stepper } from "../nikkei-screening-skip-audit/model";
import type { MarketBar } from "../../lib/market/types";
import { configureClearSlope, slopeSeries } from "./clear-slope";

test("the research slope override changes only eligible full clears and leaves other accounts untouched", () => {
  const bars = Array.from({ length: 40 }, (_, i) => {
    const close = 100 + i;
    return { time: String(i), timestamp: i, open: close, high: close + 1, low: close - 1, close,
      volume: 0, amount: 0, amplitude: 0, changePercent: 0, change: 0, turnoverRate: 0 };
  }) satisfies MarketBar[];
  const settings = { interval: "1d" as const, initialCash: 100000, commissionRate: 0, slippageRate: 0 };
  const slopes = slopeSeries(bars);
  const normal = new Stepper(bars, settings);
  const variant = new Stepper(bars, settings, overlay => configureClearSlope(overlay, "two-of-three",
    slopes.ema7, 100));
  // Both native checks block these rising bars, so even a passing third vote is insufficient.
  const before = normal.initial(20);
  before.overlay.allocation = 1; before.overlay.previousCloseAllocation = 1;
  before.target = 1; before.planned = 1; before.account = { cash: 0, units: 500 };
  const request = [{ direction: "reduce" as const, targetAllocation: 0, signals: [] }];
  assert.equal(variant.step(before, 20, request).state.target, 1);

  const slowBars = bars.map((bar, i) => ({ ...bar, close: 100 + i * .01,
    open: 100 + i * .01, high: 100 + i * .01 + .001, low: 100 + i * .01 - .001 }));
  const original = new Stepper(slowBars, settings);
  const changed = new Stepper(slowBars, settings, overlay => configureClearSlope(overlay, "replace-wma",
    slopeSeries(slowBars).sma11, .075));
  assert.equal(changed.step(before, 20, request).state.target, 0);
  assert.equal(original.step(before, 20, request).state.target, 1);
  assert.equal(changed.step(before, 20, [{ ...request[0], targetAllocation: .5 }]).state.target, 1);
  const youngSupplement = structuredClone(before); youngSupplement.overlay.lastSupplement = 19;
  assert.equal(changed.step(youngSupplement, 20, request).state.target, 1);
  const narrow = structuredClone(before);
  narrow.overlay.rangeEpisode = { index: 19, cost: 100, high: 100.3, low: 100.1, includeEntryBar: false };
  assert.equal(changed.step(narrow, 20, request).state.target, 1);
});
