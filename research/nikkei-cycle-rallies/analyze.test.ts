import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTrendTarget, blendTargets, segmentReturn, type TrendRule } from "./analyze";
import type { MarketBar } from "../../lib/market/types";

const bars = Array.from({ length: 120 }, (_, i) => {
  const price = 100 + Math.sin(i / 7) * 20 + i / 10;
  return { time: `day-${i}`, open: price, high: price + 1, low: price - 1, close: price } as MarketBar;
});
test("all trend overlays preserve past targets when unseen future bars change", () => {
  const rules: TrendRule[] = ["sma20-two-close", "sma60-two-close", "ema10-30", "momentum20", "donchian20-10"];
  for (const rule of rules) {
    const full = buildTrendTarget(bars, rule);
    assert.deepEqual(full.slice(0, 83), buildTrendTarget(bars.slice(0, 83), rule));
    const perturbed = bars.map((bar, i) => i < 83 ? bar : { ...bar, high: 5000, low: 1, close: 4000 });
    assert.deepEqual(full.slice(0, 83), buildTrendTarget(perturbed, rule).slice(0, 83));
    assert.ok(full.every(value => value === 0 || value === 1));
  }
});
test("weighted target allocations preserve the two sleeves and stay unleveraged", () => {
  const tactical = [0, 0.4, 1, 0.6], core = [1, 1, 0, 0];
  assert.deepEqual(blendTargets(tactical, core, 0), tactical);
  assert.deepEqual(blendTargets(tactical, core, 1), core);
  assert.deepEqual(blendTargets(tactical, core, 0.5), [0.5, 0.7, 0.5, 0.3]);
  assert.throws(() => blendTargets(tactical, core, 1.1));
});
test("segment marking excludes the start-day gain and uses the preceding close on holidays", () => {
  const equity = [{ time: "2026-05-01", equity: 100 }, { time: "2026-05-07", equity: 120 }, { time: "2026-05-08", equity: 132 }];
  assert.ok(Math.abs(segmentReturn(equity, "2026-05-07", "2026-05-08") - 10) < 1e-10);
  assert.ok(Math.abs(segmentReturn(equity, "2026-05-05", "2026-05-08") - 32) < 1e-10);
  assert.throws(() => segmentReturn(equity, "2026-04-30", "2026-05-08"));
});
