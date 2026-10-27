import assert from "node:assert/strict";
import test from "node:test";
import { rsi } from "../../lib/analysis/indicators";
import { ShapeContext, entryRsiPass, exitRsiPass, shapeReplay, shapeBaseline } from "./shape-priority";
import { rsiParameterMenu, rsiEntryFilters, rsiExitFilters, validateRsiChunk, compareRsiRows } from "./rsi-parameter";
import type { MarketBar } from "../../lib/market/types";

function bars(): MarketBar[] {
  return Array.from({ length: 80 }, (_, index) => {
    const close = 100 + Math.sin(index / 3) * 12 + index / 5;
    return { time: String(index), timestamp: index, open: close - 0.5, close, high: close + 1, low: close - 1,
      volume: 1000, amount: 100_000, amplitude: 2, change: 1, changePercent: 1, turnoverRate: 0 };
  });
}
test("cached RSI7..20 matches shared Wilder calculations and keeps legacy RSI14", () => {
  const input = bars(), context = new ShapeContext(input);
  for (let period = 7; period <= 20; period += 1) {
    assert.deepEqual(context.strengthFor(period), rsi(input.map((bar) => bar.close), period));
    assert.equal(context.strengthFor(period), context.strengthFor(period));
  }
  assert.equal(context.strength, context.strengthFor(14));
  assert.throws(() => context.strengthFor(0));
});
test("threshold boundaries, RSI calculation periods and historical lookbacks are independent", () => {
  const context = new ShapeContext(bars()), values = context.strengthFor(7), index = 40;
  values[index - 1] = 49; values[index] = 50;
  assert.equal(entryRsiPass(context, index, "above50", { period: 7, threshold: 50 }), false);
  assert.equal(entryRsiPass(context, index, "above50", { period: 7, threshold: 45 }), true);
  assert.equal(exitRsiPass(context, index, "below50", { period: 7, threshold: 50 }), false);
  assert.equal(exitRsiPass(context, index, "below50", { period: 7, threshold: 55 }), true);
  for (let cursor = 20; cursor < index; cursor += 1) values[cursor] = 50;
  values[index - 10] = 80; values[index - 1] = 60; values[index] = 55;
  assert.equal(exitRsiPass(context, index, "from70", { period: 7, threshold: 80, lookback: 5 }), false);
  assert.equal(exitRsiPass(context, index, "from70", { period: 7, threshold: 80, lookback: 14 }), true);
  values[index] = 80;
  assert.equal(exitRsiPass(context, index, "from70", { period: 7, threshold: 80, lookback: 5 }), false);
});
test("28621 unique policies cover all declared periods and threshold grids", () => {
  const menu = rsiParameterMenu();
  assert.equal(menu.length, 28621);
  assert.equal(new Set(menu.map((policy) => policy.id)).size, menu.length);
  assert.equal(rsiEntryFilters().length, 588); assert.equal(rsiExitFilters().length, 448);
  assert.equal(menu.filter((policy) => policy.entryRsiSettings).length, 7056);
  assert.equal(menu.filter((policy) => policy.exitRsiSettings).length, 21504);
});
test("floating-point noise in equal final500 returns cannot displace a higher full return", () => {
  const baseline = { totalReturn: 393, last500: 98 };
  const better = { totalReturn: 427, last500: 99.84901635490752, maxDrawdown: -10.8 };
  const worse = { totalReturn: 396, last500: 99.84901635490753, maxDrawdown: -12.9 };
  assert.ok(compareRsiRows(better, worse, baseline) < 0);
  assert.ok(compareRsiRows(worse, better, baseline) > 0);
  assert.equal(compareRsiRows(better, { ...better, last500: better.last500 + 1e-12 }, baseline), 0);
});
test("chunk validation rejects wrong identity, reordered policies and invalid lengths", () => {
  const menu = rsiParameterMenu().slice(0, 3), rows = menu.map((policy) => ({ policy }));
  validateRsiChunk({ identity: "same", offset: 0, rows }, "same", 0, menu);
  assert.throws(() => validateRsiChunk({ identity: "old", offset: 0, rows }, "same", 0, menu));
  assert.throws(() => validateRsiChunk({ identity: "same", offset: 0, rows: [...rows].reverse() }, "same", 0, menu));
  assert.throws(() => validateRsiChunk({ identity: "same", offset: 0, rows: [] }, "same", 0, menu));
});
test("independent entry and exit RSI settings remain causal under completed prefixes", () => {
  const input = bars(), decisions = new Map();
  const policy = { ...shapeBaseline, entry: "close4" as const, decline: 0.05, entryRsi: "above50" as const,
    entryRsiSettings: { period: 7, threshold: 40 }, descending: { field: "high" as const, sessions: 4 },
    exitRsi: "from70" as const, exitRsiSettings: { period: 20, threshold: 65, lookback: 10 } };
  const full = shapeReplay(new ShapeContext(input), decisions, 20, policy);
  for (const end of [35, 50, 70]) assert.deepEqual(shapeReplay(new ShapeContext(input.slice(0, end)), decisions, 20, policy).targets,
    full.targets.slice(0, end));
});
