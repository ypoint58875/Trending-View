import assert from "node:assert/strict";
import { test } from "node:test";
import { rawPhase, confirmedPhases, classifyHistory, contiguousSegments, segmentationMenu, primaryConfig, type SegmentFeature } from "./ma-atr-segmentation";
import type { MarketBar } from "../../lib/market/types";

const feature: SegmentFeature = { average: 100, slopeAtr: 0.1, moveAtr: 2.5, return5: 0.04, er10: 0.7, atrPercent: 2, atrRank: 0.8, shock: null };
test("equal ATR can describe rapid rise, rapid fall or a wide range", () => {
  assert.equal(rawPhase(feature), "rapid-up");
  assert.equal(rawPhase({ ...feature, slopeAtr: -0.1, moveAtr: -2.5, return5: -0.04 }), "rapid-down");
  assert.equal(rawPhase({ ...feature, slopeAtr: 0.005, moveAtr: 0.2, return5: 0.005, er10: 0.1 }), "range");
});
test("confirmation waits without backfilling the first two candidate dates", () => {
  assert.deepEqual(confirmedPhases([null, "range", "range", "range", "rapid-up", "rapid-up", "rapid-up"], 3),
    ["warmup", "warmup", "warmup", "range", "range", "range", "rapid-up"]);
});
export function fixture(length = 360): MarketBar[] {
  return Array.from({ length }, (_, index) => {
    const close = index === 320 ? 120 : 100 + Math.sin(index * 0.6) * 4;
    return { time: new Date(Date.UTC(2020, 0, index + 1)).toISOString().slice(0, 10), open: close,
      close, high: close + 1, low: close - 1 } as MarketBar;
  });
}
test("shock is known at the marked close while effective labels lag one bar", () => {
  const rows = classifyHistory(fixture(), primaryConfig);
  assert.equal(rows[320]!.shock, "up");
  assert.equal(rows[320]!.effectiveLabel, rows[319]!.labelAtClose);
  assert.equal(rows[321]!.effectiveLabel, rows[320]!.labelAtClose);
});
test("all12 classifications are prefix causal and contiguous segments cover every date once", () => {
  const source = fixture(); assert.equal(segmentationMenu().length, 12);
  for (const config of segmentationMenu()) {
    const full = classifyHistory(source, config), prefix = classifyHistory(source.slice(0, 333), config);
    assert.deepEqual(full.slice(0, 333), prefix);
    const segments = contiguousSegments(full);
    assert.equal(segments.reduce((total, segment) => total + segment.sessions, 0), source.length);
    assert.equal(segments[0]!.startIndex, 0); assert.equal(segments.at(-1)!.endIndex, source.length - 1);
    assert.equal(segments.at(-1)!.open, true);
    segments.slice(1).forEach((segment, offset) => assert.equal(segment.startIndex, segments[offset]!.endIndex + 1));
  }
});
