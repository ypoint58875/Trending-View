import assert from "node:assert/strict";
import test from "node:test";
import { buildValidatedCyclePreview, cachedValidatedCyclePreview, validatedCyclePreviewKey,
  promoteValidatedCycleProfile, validatedCycleRulesMatch } from "../lib/analysis/validated-cycle-preview";
import { requestValidatedCyclePreview } from "../lib/analysis/validated-cycle-preview-client";
import { createValidatedCycleStrategy } from "../lib/analysis/validated-cycle-strategy";
import { buildStrategyCycleRollingSchedule } from "../lib/analysis/strategy-cycle-validation";
import { ATR_POSITION_OVERLAY_OPTIONS, DEFAULT_POSITION_OVERLAY_OPTIONS } from "../lib/analysis/sma-position-overlay";
import type { MarketSeries } from "../lib/market/types";

function fixture() {
  const closes = [...Array<number>(40).fill(100), 99, 97, 95, 93, 92, 91, 98, ...Array<number>(13).fill(98)];
  const series: MarketSeries = { instrument: { secid: "^N225", code: "^N225", name: "Nikkei 225",
    provider: "yahoo", exchange: "JPX", assetType: "index" }, interval: "1d", source: "yahoo",
    priceAdjustment: "raw", latestBarStatus: "complete", fetchedAt: "2026-10-27T00:00:00Z",
    previousClose: 98, bars: closes.map((close, index) => ({
      time: new Date(Date.UTC(2024, 0, index + 1)).toISOString().slice(0, 10), timestamp: Date.UTC(2024, 0, index + 1),
      open: close, high: close + 1, low: close - 1, close, volume: 1000, amount: 100000,
      change: 0, changePercent: 0, amplitude: 2, turnoverRate: 0,
    })) };
  const schedule = buildStrategyCycleRollingSchedule(series.bars, 20, 10)!;
  const snapshots = schedule.decisionIndexes.map((decisionIndex) => ({ decisionIndex,
    decisionTime: series.bars[decisionIndex]!.time, screeningWindow: 10, label: "Synthetic unchanged winner",
    plan: { strategyA: { strategyId: "roc-momentum" as const, parameters: { period: 1, entry: 999, exit: -999 } },
      strategyB: null, strategyAAllocation: 1, strategyBAllocation: 0 }, fixedRelativeLongStrategy: null }));
  return createValidatedCycleStrategy(series, snapshots, 20, 10, { initialCash: 100000, commissionRate: 0.0003,
    slippageRate: 0.0002, positionOverlay: ATR_POSITION_OVERLAY_OPTIONS, interval: "1d", executionPolicy: "hybrid" });
}

test("current-rule preview changes signals using the same winners without rewriting the saved account", async () => {
  const profile = fixture(), before = JSON.stringify(profile);
  const preview = buildValidatedCyclePreview(profile, DEFAULT_POSITION_OVERLAY_OPTIONS);
  assert.equal(preview.report.newOnConflictReturn, preview.report.updateReturn);
  assert.equal(preview.report.evaluationStartTime, profile.report.evaluationStartTime);
  assert.equal(preview.report.evaluationEndTime, profile.report.evaluationEndTime);
  assert.equal(preview.report.decisionCount, profile.report.decisionCount);
  assert.notDeepEqual(preview.report.rebalances, profile.report.rebalances);
  assert.equal(JSON.stringify(profile), before);
  const upgraded = promoteValidatedCycleProfile(profile, DEFAULT_POSITION_OVERLAY_OPTIONS, preview);
  assert.equal(validatedCycleRulesMatch(upgraded, DEFAULT_POSITION_OVERLAY_OPTIONS), true);
  assert.deepEqual(upgraded.report, preview.report);
  assert.deepEqual(upgraded.ruleBackup?.report, profile.report);
  assert.deepEqual(upgraded.ruleBackup?.settings, profile.settings);
  assert.deepEqual(upgraded.series, profile.series);
  assert.deepEqual(upgraded.snapshots, profile.snapshots);
  assert.equal(promoteValidatedCycleProfile(upgraded, DEFAULT_POSITION_OVERLAY_OPTIONS, preview), upgraded);
  assert.throws(() => promoteValidatedCycleProfile(profile, DEFAULT_POSITION_OVERLAY_OPTIONS, { ...preview, key: "stale" }), /Invalid validated cycle rule upgrade/);
  assert.equal(cachedValidatedCyclePreview(profile, DEFAULT_POSITION_OVERLAY_OPTIONS), null);
  profile.preview = preview;
  assert.equal(cachedValidatedCyclePreview(profile, DEFAULT_POSITION_OVERLAY_OPTIONS), preview);
  assert.equal(await requestValidatedCyclePreview(profile, DEFAULT_POSITION_OVERLAY_OPTIONS, new AbortController().signal), preview);
  assert.equal(cachedValidatedCyclePreview({ ...profile, revision: profile.revision + 1 }, DEFAULT_POSITION_OVERLAY_OPTIONS), null);
  assert.notEqual(validatedCyclePreviewKey(profile, DEFAULT_POSITION_OVERLAY_OPTIONS), validatedCyclePreviewKey(profile, ATR_POSITION_OVERLAY_OPTIONS));
  assert.equal(cachedValidatedCyclePreview(profile, ATR_POSITION_OVERLAY_OPTIONS)?.report, profile.report);
  assert.equal(cachedValidatedCyclePreview({ ...profile, settings: { ...profile.settings, commissionRate: 0.2 } }, DEFAULT_POSITION_OVERLAY_OPTIONS), null);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(requestValidatedCyclePreview(profile, DEFAULT_POSITION_OVERLAY_OPTIONS, controller.signal), { name: "AbortError" });
});

test("preview workers terminate on completion, cancellation and invalid replies", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  const instances: FixtureWorker[] = [];
  class FixtureWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: (() => void) | null = null;
    onmessageerror: (() => void) | null = null;
    terminated = false;
    constructor(readonly url: URL) { instances.push(this); }
    postMessage() {}
    terminate() { this.terminated = true; }
  }
  Object.defineProperty(globalThis, "Worker", { configurable: true, value: FixtureWorker });
  try {
    const profile = fixture(), preview = buildValidatedCyclePreview(profile, DEFAULT_POSITION_OVERLAY_OPTIONS);
    const completed = requestValidatedCyclePreview(profile, DEFAULT_POSITION_OVERLAY_OPTIONS, new AbortController().signal);
    assert.match(instances[0]!.url.pathname, /validated-cycle-preview\.worker\.ts$/);
    instances[0]!.onmessage!({ data: { preview } } as MessageEvent);
    assert.equal(await completed, preview); assert.equal(instances[0]!.terminated, true);
    const controller = new AbortController();
    const cancelled = requestValidatedCyclePreview(profile, DEFAULT_POSITION_OVERLAY_OPTIONS, controller.signal);
    controller.abort();
    await assert.rejects(cancelled, { name: "AbortError" }); assert.equal(instances[1]!.terminated, true);
    const invalid = requestValidatedCyclePreview(profile, DEFAULT_POSITION_OVERLAY_OPTIONS, new AbortController().signal);
    instances[2]!.onmessage!({ data: { preview: { ...preview, key: "stale" } } } as MessageEvent);
    await assert.rejects(invalid, /Invalid validated cycle preview response/); assert.equal(instances[2]!.terminated, true);
    const failed = requestValidatedCyclePreview(profile, DEFAULT_POSITION_OVERLAY_OPTIONS, new AbortController().signal);
    instances[3]!.onerror!();
    await assert.rejects(failed, /worker failed/); assert.equal(instances[3]!.terminated, true);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "Worker", descriptor);
    else Reflect.deleteProperty(globalThis, "Worker");
  }
});
