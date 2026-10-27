import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { SmaPositionOverlay, REBOUND_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS, ENGULF_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import { ATR_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import { strategyCycleSignalDirection, runStrategyCycleCloseBacktest, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest, type BacktestSettings } from "../../lib/analysis/backtest";
import type { MarketBar } from "../../lib/market/types";
import { fallbackMetrics } from "./sma20-fallback";

function load(path: string) {
  const file = new URL(path, import.meta.url);
  assert.ok(statSync(file).size <= 16 * 1024 ** 2);
  return JSON.parse(readFileSync(file, "utf8"));
}
const input = load("./data/full-screen-6-15/input.json") as {
  bars: MarketBar[]; barsHash: string; settings: BacktestSettings; snapshots: { decisionIndex: number }[];
};
const saved = load("./data/full-screen-6-15/signals.json") as {
  sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[];
};
const baseline = load("./output/dual-return/baseline.json"), candidate = load("./output/dual-return/goal.json");
const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const start = input.bars.length - 2000, decisions = new Map(saved.rows.map(row => [row.index, row.signals]));
function replay(options: typeof DEFAULT_POSITION_OVERLAY_OPTIONS) {
  const account = new SmaPositionOverlay(input.bars, options), targets = input.bars.map(() => 0);
  for (let index = start; index < input.bars.length; index++) {
    const signals = decisions.get(index) ?? [], direction = strategyCycleSignalDirection(signals);
    if (direction) account.request(direction, signals.at(-1)!.targetAllocation, index);
    targets[index] = account.close(index, signals.length > 0);
  }
  return targets;
}

test("frozen source and adopted candidate identities remain exact", () => {
  assert.equal(sha(input), saved.sourceHash); assert.equal(sha(input.bars), input.barsHash);
  assert.equal(candidate.sourceHash, saved.sourceHash); assert.equal(baseline.sourceHash, saved.sourceHash);
  assert.equal(candidate.policy.id, "daily4-ema3-baseline");
  assert.deepEqual(saved.rows.map(row => row.index), input.snapshots.map(snapshot => snapshot.decisionIndex));
});

test("archived v5 and v6 match all2000 research targets without RSI", () => {
  const oldTargets = replay(ENGULF_POSITION_OVERLAY_OPTIONS), targets = replay(DEFAULT_POSITION_OVERLAY_OPTIONS);
  assert.deepEqual(oldTargets, baseline.targets); assert.deepEqual(targets, candidate.targets);
  assert.equal(sha(targets), candidate.targetHash);
  const result = runStrategyCycleCloseBacktest(input.bars, targets, input.settings);
  const boundary = input.bars.findIndex(bar => bar.time === "2026-07-21") - start + 1;
  const metrics = fallbackMetrics(result, input.settings.initialCash, boundary);
  assert.equal(metrics.totalReturn, candidate.totalReturn); assert.equal(metrics.final500.totalReturn, candidate.final500.totalReturn);
  assert.equal(metrics.maxDrawdown, candidate.maxDrawdown);
  const next = runAllocationBacktest(input.bars, targets, { ...input.settings, executionPolicy: "next-open" });
  assert.equal(next.totalReturn, candidate.nextOpen.totalReturn);
});

test("production v7 exactly reproduces the frozen ATR2 candidate and next-open execution", () => {
  const reference = load("./output/risk-exit-validation/ema3-atr2-anchor.json");
  assert.equal(reference.sourceHash, saved.sourceHash);
  const targets = replay(ATR_POSITION_OVERLAY_OPTIONS);
  assert.deepEqual(targets, reference.targets);
  assert.equal(sha(targets), reference.targetHash);
  const result = runStrategyCycleCloseBacktest(input.bars, targets, input.settings);
  assert.equal(result.totalReturn, reference.totalReturn);
  assert.equal(result.maxDrawdown, reference.maxDrawdown);
  const next = runAllocationBacktest(input.bars, targets, { ...input.settings, executionPolicy: "next-open" });
  assert.equal(next.totalReturn, reference.nextOpen.totalReturn);
});
