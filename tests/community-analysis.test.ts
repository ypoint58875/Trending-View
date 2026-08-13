import assert from "node:assert/strict";
import test from "node:test";
import { COMMUNITY_ANALYSIS_CATALOG } from "../lib/analysis/community/catalog";
import {
  adaptiveRegressionBreakout,
  autoAtrTrendTracker,
  fractionalEmaKalman,
  nadarayaWatsonTrend,
  rsiDivergenceEngine,
  squeezeMomentum,
  supportResistanceSignals,
  trendlineBreaks,
  waveTrend,
} from "../lib/analysis/community/indicators";
import {
  COMMUNITY_STRATEGIES,
  COMMUNITY_STRATEGY_IDS,
} from "../lib/analysis/community/strategies";
import { INDICATORS } from "../lib/analysis/indicator-registry";
import { COMMUNITY_INDICATOR_IDS } from "../lib/analysis/community/registry";
import { STRATEGIES } from "../lib/analysis/strategies";
import type { MarketBar } from "../lib/market/types";

function makeBars(length = 360): MarketBar[] {
  return Array.from({ length }, (_, index) => {
    const trend = 8 + index * 0.012;
    const cycle = Math.sin(index / 8) * 0.8 + Math.sin(index / 23) * 0.5;
    const close = trend + cycle;
    const open = close - Math.sin(index / 5) * 0.18;
    const spike = index % 83 === 0 ? 1.8 : 0;
    return {
      time: `2025-${String(Math.floor(index / 28) + 1).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}`,
      timestamp: Date.UTC(2025, 0, index + 1),
      open,
      high: Math.max(open, close) + 0.22 + spike,
      low: Math.min(open, close) - 0.22 - spike,
      close,
      volume: 1_000 + index * 3,
      amount: close * (1_000 + index * 3),
      amplitude: 0,
      changePercent: 0,
      change: 0,
      turnoverRate: 0,
    };
  });
}

function assertSeriesLength(
  result: Record<string, unknown>,
  length: number,
) {
  for (const value of Object.values(result)) {
    if (Array.isArray(value)) assert.equal(value.length, length);
  }
}

test("community catalog is complete and registry-backed", () => {
  assert.equal(COMMUNITY_ANALYSIS_CATALOG.length, 12);
  assert.equal(new Set(COMMUNITY_ANALYSIS_CATALOG.map((item) => item.id)).size, 12);
  assert.equal(
    COMMUNITY_ANALYSIS_CATALOG.filter((item) => item.kind === "indicator").length,
    9,
  );
  assert.equal(
    COMMUNITY_ANALYSIS_CATALOG.filter((item) => item.kind === "strategy").length,
    3,
  );
  const indicatorIds = new Set(INDICATORS.map((indicator) => indicator.id));
  const strategyIds = new Set(STRATEGIES.map((strategy) => strategy.id));
  for (const item of COMMUNITY_ANALYSIS_CATALOG) {
    assert.equal(
      item.kind === "indicator"
        ? indicatorIds.has(item.id as never)
        : strategyIds.has(item.id as never),
      true,
      item.id,
    );
    assert.ok(item.notes.length > 0);
  }
  assert.deepEqual(
    COMMUNITY_STRATEGIES.map((strategy) => strategy.id),
    COMMUNITY_STRATEGY_IDS,
  );
  assert.deepEqual(
    COMMUNITY_ANALYSIS_CATALOG.filter((item) => item.kind === "indicator").map(
      (item) => item.id,
    ),
    COMMUNITY_INDICATOR_IDS,
  );
  assert.equal(INDICATORS.length, 30);
  assert.equal(STRATEGIES.length, 37);
});

test("community indicator ports return aligned causal series", () => {
  const bars = makeBars();
  const closes = bars.map((bar) => bar.close);
  const results = [
    adaptiveRegressionBreakout(bars),
    autoAtrTrendTracker(bars),
    fractionalEmaKalman(bars),
    nadarayaWatsonTrend(closes),
    rsiDivergenceEngine(bars, 14, 8, 2),
    squeezeMomentum(bars),
    supportResistanceSignals(bars),
    trendlineBreaks(bars),
    waveTrend(bars),
  ];
  for (const result of results) {
    assertSeriesLength(result as unknown as Record<string, unknown>, bars.length);
  }

  const prefixLength = 280;
  const full = trendlineBreaks(bars, 8, 1);
  const prefix = trendlineBreaks(bars.slice(0, prefixLength), 8, 1);
  assert.deepEqual(full.upper.slice(0, prefixLength), prefix.upper);
  assert.deepEqual(full.lower.slice(0, prefixLength), prefix.lower);
  assert.deepEqual(full.bullishBreaks.slice(0, prefixLength), prefix.bullishBreaks);
  assert.deepEqual(full.bearishBreaks.slice(0, prefixLength), prefix.bearishBreaks);
});

test("community strategies use bar-aligned close-confirmed targets", () => {
  const bars = makeBars();
  const prefixLength = 280;
  for (const strategy of COMMUNITY_STRATEGIES) {
    const full = strategy.buildTarget(bars, strategy.defaultParameters);
    const prefix = strategy.buildTarget(
      bars.slice(0, prefixLength),
      strategy.defaultParameters,
    );
    assert.equal(full.length, bars.length);
    assert.deepEqual(full.slice(0, prefixLength), prefix, strategy.id);
    assert.equal(full.every((target) => target === 0 || target === 1), true);
  }
});
