import assert from "node:assert/strict";
import { test } from "node:test";
import { qualityFeatures, confirmations, confirmedTargets } from "./joint-confirmation";
import type { MarketBar } from "../../lib/market/types";

test("quality features and final decisions cannot see future bars", () => {
  const bars = Array.from({ length: 180 }, (_, i) => {
    const close = 100 + Math.sin(i / 11) * 10 + i / 20;
    return { close, open: close - 0.5, high: close + 1, low: close - 1 } as MarketBar;
  });
  const features = qualityFeatures(bars), short = qualityFeatures(bars.slice(0, 137));
  assert.deepEqual(features.slice(0, 137), short);
  const a = bars.map((_, i) => i % 13 < 6 ? 1 : 0), b = bars.map((_, i) => i % 17 < 9 ? 1 : 0), c = bars.map((_, i) => i % 7 < 4 ? 1 : 0);
  for (const kind of confirmations) assert.deepEqual(confirmedTargets(a, b, c, features, 60, kind).slice(0, 137), confirmedTargets(a.slice(0, 137), b.slice(0, 137), c.slice(0, 137), short, 60, kind));
  assert.ok(features.every(f => f.efficiency >= 0 && f.efficiency <= 1 + 1e-10));
});
