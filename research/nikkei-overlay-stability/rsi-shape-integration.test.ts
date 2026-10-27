import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { SmaPositionOverlay, DEFAULT_POSITION_OVERLAY_OPTIONS, ATR_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import { buildStrategyCycleRollingReport, runStrategyCycleCloseBacktest, strategyCycleSignalDirection,
  type StrategyCycleRecentSignal, type StrategyCycleSelectionSnapshot } from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest, type BacktestSettings } from "../../lib/analysis/backtest";
import { ShapeContext, shapeReplay, type ShapePolicy } from "./shape-priority";
import { fallbackMetrics } from "./sma20-fallback";
import type { MarketBar } from "../../lib/market/types";
import type { MarketSeries } from "../../lib/market/types";
import { createValidatedCycleStrategy } from "../../lib/analysis/validated-cycle-strategy";
import { buildValidatedCyclePreview } from "../../lib/analysis/validated-cycle-preview";

function load(path: string) {
  const file = new URL(path, import.meta.url);
  assert.ok(statSync(file).size <= 16 * 1024 ** 2);
  return JSON.parse(readFileSync(file, "utf8"));
}
const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const input = load("./data/full-screen-6-15/input.json") as {
  bars: MarketBar[]; barsHash: string; settings: BacktestSettings; snapshots: StrategyCycleSelectionSnapshot[];
};
const saved = load("./data/full-screen-6-15/signals.json") as {
  sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[];
};
const summary = load("./output/rsi-parameter/summary.json");
const audit = load("./output/rsi-parameter/audit.json");
const selected = audit.audits.find((row: { row: { policy: ShapePolicy } }) =>
  row.row.policy.entry === "higher-low" && row.row.policy.decline === 0.09 &&
  row.row.policy.exitPriority === "guarded" && row.row.policy.exitRsiSettings?.period === 10 &&
  row.row.policy.exitRsiSettings.threshold === 35);
const start = input.bars.length - 2000;
const decisions = new Map(saved.rows.map((row) => [row.index, row.signals]));
function replay(options = DEFAULT_POSITION_OVERLAY_OPTIONS) {
  const account = new SmaPositionOverlay(input.bars, options), targets = input.bars.map(() => 0);
  for (let index = start; index < input.bars.length; index += 1) {
    const signals = decisions.get(index) ?? [], direction = strategyCycleSignalDirection(signals);
    if (direction) account.request(direction, signals.at(-1)!.targetAllocation, index);
    targets[index] = account.close(index, signals.length > 0);
  }
  return targets;
}
test("adopted v8 exactly reproduces the selected440.98% research account and next-open result", () => {
  assert.equal(sha(input), saved.sourceHash); assert.equal(sha(input.bars), input.barsHash);
  assert.equal(summary.sourceHash, saved.sourceHash); assert.equal(audit.identity, summary.identity); assert.ok(selected);
  const reference = shapeReplay(new ShapeContext(input.bars), decisions, start, selected.row.policy, true);
  const targets = replay();
  assert.deepEqual(targets, reference.targets);
  assert.equal(sha(targets), selected.row.targetHash);
  const result = runStrategyCycleCloseBacktest(input.bars, targets, input.settings);
  const metrics = fallbackMetrics(result, input.settings.initialCash,
    input.bars.findIndex((bar) => bar.time === "2026-07-21") - start + 1);
  assert.equal(result.totalReturn, selected.row.totalReturn);
  assert.equal(result.maxDrawdown, selected.row.maxDrawdown);
  assert.equal(metrics.final500.totalReturn, selected.row.last500);
  const next = runAllocationBacktest(input.bars, targets, { ...input.settings, executionPolicy: "hybrid" });
  assert.equal(next.totalReturn, selected.nextOpen.totalReturn);
  assert.equal(next.maxDrawdown, selected.nextOpen.maxDrawdown);
});
test("archived v7 retains its exact frozen ATR target path", () => {
  const reference = load("./output/risk-exit-validation/ema3-atr2-anchor.json");
  assert.equal(sha(replay(ATR_POSITION_OVERLAY_OPTIONS)), reference.targetHash);
});
test("ordinary cycle report uses the same v8 close-proxy account without a second overlay", () => {
  const report = buildStrategyCycleRollingReport(input.bars, input.snapshots, 2000, 10,
    { ...input.settings, interval: "1d", positionOverlay: DEFAULT_POSITION_OVERLAY_OPTIONS });
  assert.equal(report.updateReturn, selected.row.totalReturn);
  const reference = runStrategyCycleCloseBacktest(input.bars, replay(), input.settings).rebalances;
  const economic = (fills: typeof reference) => fills.map((fill) => ({ time: fill.time,
    fillPrice: fill.fillPrice, fromAllocation: fill.fromAllocation, targetAllocation: fill.targetAllocation, reason: fill.reason }));
  assert.deepEqual(economic(report.rebalances), economic(reference));
  assert.ok(report.rebalances.every((fill) => (fill.signals?.length ?? 0) > 0));
});

test("saved393.14% v7 account previews440.98% under v8 without changing its ledger", () => {
  const series: MarketSeries = { instrument: { secid: "^N225", code: "^N225", name: "Nikkei 225",
    exchange: "JPX", assetType: "index", provider: "yahoo" }, interval: "1d", source: "yahoo",
    priceAdjustment: "raw", latestBarStatus: "complete", fetchedAt: "2026-10-27T00:00:00Z",
    previousClose: input.bars.at(-2)!.close, bars: input.bars };
  const profile = createValidatedCycleStrategy(series, input.snapshots, 2000, 10,
    { ...input.settings, positionOverlay: ATR_POSITION_OVERLAY_OPTIONS, interval: "1d" });
  const before = JSON.stringify(profile);
  assert.equal(profile.report.updateReturn, 393.1430225439163);
  const preview = buildValidatedCyclePreview(profile, DEFAULT_POSITION_OVERLAY_OPTIONS);
  assert.equal(preview.report.updateReturn, 440.9807031454993);
  assert.equal(preview.report.newOnConflictReturn, preview.report.updateReturn);
  assert.equal(preview.report.decisionCount, profile.report.decisionCount);
  assert.equal(JSON.stringify(profile), before);
});
