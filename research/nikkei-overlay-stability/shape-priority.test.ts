import assert from "node:assert/strict";
import test from "node:test";
import { ShapeContext, shapeEntryEvidence, descendingFour, shapeMenu, shapeReplay, shapeBaseline } from "./shape-priority";
import { contributionReplay } from "./contribution-study";
import { ATR_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import type { MarketBar } from "../../lib/market/types";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";

function bars(count = 60): MarketBar[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + index;
    return { time: new Date(Date.UTC(2024, 0, index + 1)).toISOString().slice(0, 10), timestamp: index,
      open: close, high: close + 1, low: close - 1, close, volume: 1000, amount: 100_000,
      change: 1, changePercent: 1, turnoverRate: 0, amplitude: 2 };
  });
}
test("four descending opens require exactly three strict decreases", () => {
  assert.equal(descendingFour([10, 9, 8, 7], 3), true);
  assert.equal(descendingFour([10, 9, 9, 7], 3), false);
  assert.equal(descendingFour([10, 9, 8], 2), false);
  assert.equal(descendingFour([5, 10, 9, 8, 7], 4), true);
});
test("entry breakout excludes today from prior thresholds and requires a strict close break", () => {
  const input = bars(25);
  for (let index = 15; index < 24; index += 1) input[index] = { ...input[index]!, close: 90 };
  input[24] = { ...input[24]!, close: 90, low: 1 };
  assert.equal(shapeEntryEvidence(new ShapeContext(input), 24, 15).close4, false);
  input[24]!.close = 91;
  const evidence = shapeEntryEvidence(new ShapeContext(input), 24, 15);
  assert.equal(evidence.close4, true);
  assert.ok(evidence.decline > 0.05);
  assert.equal(evidence.high4, false);
  assert.equal(shapeEntryEvidence(new ShapeContext(input), 24, 24).decline, 0);
});
test("disabled shapes reproduce the complete production v7 account path", () => {
  const input = bars();
  const decisions = new Map<number, StrategyCycleRecentSignal[]>([
    [25, [{ direction: "increase", targetAllocation: 0.6, signals: ["long-entry"] }]],
    [40, [{ direction: "reduce", targetAllocation: 0, signals: ["long-exit"] }]],
  ]);
  assert.deepEqual(shapeReplay(new ShapeContext(input), decisions, 20, shapeBaseline).targets,
    contributionReplay(input, decisions, 20, DEFAULT_POSITION_OVERLAY_OPTIONS).targets);
});
test("descending-open forced exit differs from guarded exits and original-signal priority", () => {
  const input = bars(50);
  for (let index = 46; index < 50; index += 1) input[index]!.open = 196 - index;
  const decisions = new Map<number, StrategyCycleRecentSignal[]>([
    [45, [{ direction: "increase", targetAllocation: 1, signals: ["long-entry"] }]],
    [49, [{ direction: "increase", targetAllocation: 1, signals: ["long-entry"] }]],
  ]);
  const run = (exitPriority: "guarded" | "no-signal-force" | "risk-first") => shapeReplay(new ShapeContext(input), decisions, 40,
    { ...shapeBaseline, exit: "opens4", exitPriority });
  assert.equal(run("guarded").targets[49], 1);
  assert.equal(run("no-signal-force").targets[49], 1);
  assert.equal(run("risk-first").targets[49], 0);
  decisions.delete(49);
  assert.equal(run("no-signal-force").targets[49], 0);
  assert.equal(run("guarded").targets[49], 1);
});
test("shape and RSI policies are causal under every completed prefix", () => {
  const input = bars().map((bar, index) => ({ ...bar,
    close: 100 + Math.sin(index / 3) * 12, open: 100 + Math.cos(index / 3) * 10,
    high: 115, low: 85 }));
  const decisions = new Map<number, StrategyCycleRecentSignal[]>();
  const policies = shapeMenu().filter((policy) =>
    (policy.entry === "close4" && policy.decline === 0.05 && !policy.wmaGate) || policy.exit === "opens4");
  for (const policy of policies) {
    const full = shapeReplay(new ShapeContext(input), decisions, 20, policy);
    for (const end of [35, 45, 55]) {
      const prefix = shapeReplay(new ShapeContext(input.slice(0, end)), decisions, 20, policy);
      assert.deepEqual(prefix.targets, full.targets.slice(0, end), policy.id);
    }
  }
});
test("bounded policy menu contains every requested threshold and priority without duplicate identities", () => {
  const menu = shapeMenu();
  assert.equal(menu.length, 421);
  assert.equal(new Set(menu.map((policy) => policy.id)).size, menu.length);
  for (const percent of [5, 6, 7, 8, 9, 10]) assert.ok(menu.some((policy) => policy.entry === "close4" && policy.decline === percent / 100));
});
