import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";
import { SmaPositionOverlay, RANGE_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS, BIAS_ADD_POSITION_OVERLAY_OPTIONS,
  RANGE_POSITION_OVERLAY_MODEL as CURRENT_POSITION_OVERLAY_MODEL, BIAS_ADD_POSITION_OVERLAY_MODEL, normalizeSmaPositionOverlay } from "../lib/analysis/sma-position-overlay";
import { buildStrategyCycleRollingReport, runStrategyCycleCloseBacktest, strategyCycleSignalDirection,
  type StrategyCycleRecentSignal, type StrategyCycleSelectionSnapshot } from "../lib/analysis/strategy-cycle-validation";
import { rebalanceAllocationAccount, runAllocationBacktest, runBacktest, type BacktestSettings, type AllocationRebalance } from "../lib/analysis/backtest";
import { replay as researchReplay, policies, RiskFeatures } from "../research/nikkei-small-move-exit/model";
import type { MarketBar } from "../lib/market/types";

const sample: MarketBar[] = Array.from({ length: 320 }, (_, i) => {
  const close = i < 210 ? 100 + i * .1 : 120.9 - (i - 209) * .1;
  const timestamp = Date.UTC(2020, 0, i + 1);
  return { timestamp, time: new Date(timestamp).toISOString().slice(0, 10), open: close, close, high: close + .2, low: close - .2,
    volume: 100, amount: close * 100, amplitude: 0, change: 0, changePercent: 0, turnoverRate: 0 };
});
function seeded(bars = sample) {
  const controller = new SmaPositionOverlay(bars, DEFAULT_POSITION_OVERLAY_OPTIONS, 1, 1);
  controller.recordExecution(239, 0, 100, bars[239].close, .0003);
  controller.restore({ ...controller.checkpoint(), entryIndex: 200, entryClose: bars[200].close, lastClosedIndex: 239 });
  return controller;
}

test("v10 archives v9 and defers original full clears while retaining pending/entry state", () => {
  assert.notEqual(CURRENT_POSITION_OVERLAY_MODEL, BIAS_ADD_POSITION_OVERLAY_MODEL);
  assert.deepEqual(normalizeSmaPositionOverlay(BIAS_ADD_POSITION_OVERLAY_OPTIONS), BIAS_ADD_POSITION_OVERLAY_OPTIONS);
  const controller = seeded(), before = controller.checkpoint();
  controller.request("reduce", 0, 240); assert.equal(controller.close(240, true), 1);
  const state = controller.checkpoint(); assert.equal(state.pending, 0); assert.equal(state.entryIndex, before.entryIndex);
  assert.equal(state.entryClose, before.entryClose); assert.equal(state.rangeRequestStart, undefined);
  controller.request("increase", 1, 241); controller.close(241, true);
  assert.equal(controller.checkpoint().pending, null);
});
test("partial reductions pass, actual adds retain anchor, full execution resets range", () => {
  const bars = sample.map((bar, i) => ({ ...bar, high: 130 + i * .01 })), controller = seeded(bars);
  const anchor = controller.checkpoint().rangeEpisode!.cost;
  controller.request("reduce", .5, 240); assert.equal(controller.close(240, true), .5);
  controller.recordExecution(240, 100, 50, bars[240].close, .0003);
  controller.recordExecution(241, 50, 75, bars[241].close, .001);
  assert.equal(controller.checkpoint().rangeEpisode!.cost, anchor);
  controller.recordExecution(242, 75, 0, bars[242].close, .0003);
  assert.equal(controller.checkpoint().rangeEpisode, null);
});
test("range guard preserves an accepted partial reduction before an extra shape full exit", () => {
  const controller = seeded();
  controller.request("reduce", .5, 240);
  const request = controller.checkpoint(); assert.equal(request.allocation, .5);
  const resumed = new SmaPositionOverlay(sample, DEFAULT_POSITION_OVERLAY_OPTIONS, 0, 1); resumed.restore(JSON.parse(JSON.stringify(request)));
  assert.equal(controller.close(240, true), .5); assert.equal(resumed.close(240, true), .5);
  assert.deepEqual(resumed.checkpoint(), controller.checkpoint()); assert.equal(controller.checkpoint().pending, 0);
});
test("range threshold equality releases and fee-inclusive actual entry excludes pre-entry extrema", () => {
  const bars = sample.map((bar) => ({ ...bar })); bars[239].high = 1000; bars[239].low = 1;
  const controller = seeded(bars);
  assert.equal(controller.checkpoint().rangeEpisode!.high, bars[239].close);
  assert.equal(controller.checkpoint().rangeEpisode!.cost, bars[239].close * 1.0003);
  const cost = 100, state = controller.checkpoint();
  state.rangeEpisode = { index: 239, cost, high: 103, low: 100, includeEntryBar: false };
  controller.restore(state); controller.request("reduce", 0, 240);
  assert.equal(controller.close(240, true), 0);
});
test("entry-at-open observes that completed bar; close-entry excludes its earlier high/low", () => {
  for (const atOpen of [false, true]) {
    const controller = new SmaPositionOverlay(sample, DEFAULT_POSITION_OVERLAY_OPTIONS);
    controller.recordExecution(240, 0, 1, sample[240].open, .001, atOpen);
    controller.request("increase", 1, 240); controller.close(240, true);
    assert.equal(controller.checkpoint().rangeEpisode!.high, atOpen ? sample[240].high : sample[240].open);
  }
});
test("early4% and ATR risk exits bypass range protection", () => {
  for (const early of [true, false]) {
    const bars = sample.map((bar) => ({ ...bar })), close = sample[239].close * (early ? .94 : .985);
    bars[240] = { ...bars[240], open: close, close, high: close + .1, low: close - .1 };
    const controller = seeded(bars);
    if (early) controller.restore({ ...controller.checkpoint(), entryIndex: 239, entryClose: sample[239].close });
    controller.request("increase", 1, 240); assert.equal(controller.close(240, true), 0);
    assert.equal(controller.checkpoint().stoppedAt, 240);
  }
});
test("daily and between-request checkpoints resume exactly; missing v10 range state is rejected", () => {
  const original = seeded(); original.request("reduce", 0, 240);
  const saved = JSON.parse(JSON.stringify(original.checkpoint()));
  const resumed = new SmaPositionOverlay(sample, DEFAULT_POSITION_OVERLAY_OPTIONS, 0, 1); resumed.restore(saved);
  assert.equal(resumed.close(240, true), original.close(240, true)); assert.deepEqual(resumed.checkpoint(), original.checkpoint());
  assert.equal(resumed.close(240, true), 1);
  assert.throws(() => resumed.restore(new SmaPositionOverlay(sample, BIAS_ADD_POSITION_OVERLAY_OPTIONS).checkpoint()), /replay/);
  assert.throws(() => resumed.restore({ ...resumed.checkpoint(), rangeEpisode: { index: 239, cost: 0, high: 1, low: 1, includeEntryBar: false } }), /Invalid/);
  assert.throws(() => resumed.recordExecution(239, 0, Number.NaN, 100, 0), /Invalid/);
});
test("price orders use only the prior completed range, not the active bar's future high", () => {
  const bars = sample.map((bar) => ({ ...bar })); bars[240].high = bars[240].close * 1.1;
  const controller = seeded(bars);
  assert.equal(controller.request("reduce", 0, 239), 1);
  assert.equal(controller.checkpoint().pending, 0);
  assert.equal(controller.close(240, true), 0);
});

function load(name: string) {
  const path = new URL(`../research/nikkei-overlay-stability/data/full-screen-6-15/${name}`, import.meta.url);
  assert.ok(statSync(path).size <= 16 * 1024 ** 2); return JSON.parse(readFileSync(path, "utf8"));
}
const frozenAvailable = ["input.json", "signals.json"].every((name) => existsSync(new URL(`../research/nikkei-overlay-stability/data/full-screen-6-15/${name}`, import.meta.url)));
const localFixture = { skip: frozenAvailable ? false : "Local frozen research fixture is unavailable" };
const input = (frozenAvailable ? load("input.json") : { bars: [], snapshots: [], settings: {} }) as { bars: MarketBar[]; settings: BacktestSettings; snapshots: StrategyCycleSelectionSnapshot[] };
const savedSignals = (frozenAvailable ? load("signals.json") : { rows: [] }) as { rows: { index: number; signals: StrategyCycleRecentSignal[] }[] };
const decisions = new Map(savedSignals.rows.map((row) => [row.index, row.signals]));
const start = input.bars.length - 2000;
function actualReplay(bars = input.bars, end = bars.length, prior?: { state: ReturnType<SmaPositionOverlay["checkpoint"]>; cash: number; units: number; index: number; targets: number[]; fills: AllocationRebalance[] }) {
  const controller = new SmaPositionOverlay(bars, DEFAULT_POSITION_OVERLAY_OPTIONS, 0, 1);
  if (prior) controller.restore(prior.state);
  const account = prior ? { cash: prior.cash, units: prior.units } : { cash: input.settings.initialCash, units: 0 };
  const targets = prior ? [...prior.targets] : input.bars.map(() => 0), fills = prior ? [...prior.fills] : [];
  for (let index = prior ? prior.index + 1 : start; index < end; index++) {
    const before = controller.allocation, signals = decisions.get(index) ?? [], direction = strategyCycleSignalDirection(signals);
    if (direction) controller.request(direction, signals.at(-1)!.targetAllocation, index);
    const target = controller.close(index, signals.length > 0);
    if (Math.abs(target - before) > 1e-10) {
      const oldUnits = account.units, fill = rebalanceAllocationAccount(account, bars[index], bars[index].close, target,
        input.settings.commissionRate, input.settings.slippageRate, []);
      if (fill && fill !== true) { fills.push(fill); controller.recordExecution(index, oldUnits, account.units, fill.fillPrice, input.settings.commissionRate); }
    }
    targets[index] = target;
  }
  return { state: controller.checkpoint(), ...account, index: end - 1, targets, fills };
}
test("adopted v10 exactly matches researched458.46% targets/fills and causal serialized resumes", localFixture, () => {
  const reference = researchReplay(new RiskFeatures(input.bars), decisions, start, policies().find((row) => row.id === "range-3")!,
    input.settings, input.bars.length, undefined, BIAS_ADD_POSITION_OVERLAY_OPTIONS);
  const actual = actualReplay(); assert.deepEqual(actual.targets, reference.targets); assert.deepEqual(actual.fills, reference.fills);
  assert.equal(runStrategyCycleCloseBacktest(input.bars, actual.targets, input.settings).totalReturn, 458.4631387547417);
  const partial = actualReplay(input.bars, start + 1500);
  assert.deepEqual(actualReplay(input.bars, input.bars.length, JSON.parse(JSON.stringify(partial))), actual);
  assert.deepEqual(actualReplay(input.bars.slice(0, start + 1500)).targets.slice(0, start + 1500), actual.targets.slice(0, start + 1500));
});
test("real cycle report uses actual fills for v10 and resumes without duplicate trades", localFixture, () => {
  const settings = { ...input.settings, positionOverlay: DEFAULT_POSITION_OVERLAY_OPTIONS };
  const report = buildStrategyCycleRollingReport(input.bars, input.snapshots, 2000, 10, settings);
  assert.equal(report.updateReturn, 458.4631387547417); assert.equal(report.rebalances.length, 129);
  assert.ok(report.checkpoint!.currentOverlay!.rangeEpisode !== undefined);
  assert.equal(buildStrategyCycleRollingReport(input.bars, input.snapshots, 2000, 10, settings, undefined, report), report);
});
test("ordinary next-open actual-fill context preserves summary/full and single/allocation consistency", () => {
  const bars = sample.map((bar) => ({ ...bar })), targets = bars.map((_, i) => i < 230 ? 0 : i < 240 ? 1 : 0);
  const settings: BacktestSettings = { initialCash: 100000, commissionRate: .001, slippageRate: .001, interval: "1d",
    positionOverlay: DEFAULT_POSITION_OVERLAY_OPTIONS, executionPolicy: "next-open" };
  const full = runAllocationBacktest(bars, targets, settings), compact = runAllocationBacktest(bars, targets, { ...settings, summaryOnly: true });
  assert.equal(full.totalReturn, compact.totalReturn); assert.equal(full.tradeCount, compact.tradeCount);
  const single = runBacktest(bars, "sma-cross", { fast: 3, slow: 8 }, settings);
  assert.ok(Number.isFinite(single.totalReturn));
});
