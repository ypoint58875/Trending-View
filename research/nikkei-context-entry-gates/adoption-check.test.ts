import assert from "node:assert/strict";
import test from "node:test";
import { Features, policies } from "./model";
import { NextSessionFeatures, referenceGate } from "./adoption-check";
import type { MarketBar } from "../../lib/market/types";

test("close-confirmed gate applies next session and releases next session without a second lag", () => {
  const bars = Array.from({ length: 70 }, (_, i) => {
    const close = i < 40 ? 100 + i : i < 55 ? 140 - (i - 40) * 2 : 110 + (i - 55) * 4;
    return { time: new Date(Date.UTC(2024, 0, i + 1)).toISOString().slice(0, 10), close, open: close, high: close + 1, low: close - 1 } as MarketBar;
  });
  const features = new Features(bars), next = new NextSessionFeatures(bars), gate = policies().find((policy) => policy.id === "20-smooth-bias-down-D3-add")!;
  let onsets = 0, releases = 0;
  for (let i = 1; i < bars.length; i++) {
    assert.equal(next.blocked(i, gate), features.blocked(i - 1, gate));
    assert.equal(next.blocked(i, gate), referenceGate(bars, i - 1));
    if (features.blocked(i, gate) && !features.blocked(i - 1, gate)) { onsets++; assert.equal(next.blocked(i, gate), false); assert.equal(next.blocked(i + 1, gate), true); }
    if (!features.blocked(i, gate) && features.blocked(i - 1, gate)) { releases++; assert.equal(next.blocked(i, gate), true); assert.equal(next.blocked(i + 1, gate), false); }
  }
  assert.ok(onsets > 0 && releases > 0);
});
