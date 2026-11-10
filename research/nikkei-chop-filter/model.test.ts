import assert from "node:assert/strict";
import test from "node:test";
import { Features, policies, replay, select, type Policy, type Row } from "./model";
import { validateProgress } from "./run";
import { RSI_SHAPE_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS, SmaPositionOverlay } from "../../lib/analysis/sma-position-overlay";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";

function bars(count = 400): MarketBar[] {
  return Array.from({ length: count }, (_, i) => {
    const close = 100 + i * .1, timestamp = Date.UTC(2000, 0, i + 1);
    return { time: new Date(timestamp).toISOString().slice(0, 10), timestamp, open: close, close,
      high: close + .5, low: close - .5, volume: 1, amount: 0, amplitude: 0, changePercent: 0, change: 0, turnoverRate: 0 };
  });
}
const buy: StrategyCycleRecentSignal = { direction: "increase", targetAllocation: 1, signals: ["long-entry"] };
const candidate = (): Policy => ({ ...policies()[0], id: "test", family: "regime", period: 20, erCeiling: .25,
  widthCeiling: .35, confirmation: 2, scope: "both" });
function noisy(input: MarketBar[]) {
  const features = new Features(input);
  features.er.get(20)!.fill(0); features.widthRank.fill(0); features.high.fill(100000); features.low.fill(1); features.atr.fill(1);
  return features;
}

test("declared grid has153 unique fixed candidates and causal feature warmup", () => {
  const menu = policies(); assert.equal(menu.length, 153); assert.equal(new Set(menu.map((p) => p.id)).size, 153);
  assert.equal(menu.filter((p) => p.family === "regime").length, 108);
  assert.equal(menu.filter((p) => p.family === "er-only").length, 36);
  const input = bars(), full = new Features(input), prefix = new Features(input.slice(0, 320));
  assert.equal(full.widthRank[270], null); assert.notEqual(full.widthRank[271], null);
  assert.deepEqual(prefix.widthRank, full.widthRank.slice(0, 320));
  assert.deepEqual(prefix.er.get(20), full.er.get(20)!.slice(0, 320));
  assert.equal(full.high[300], Math.max(...input.slice(280, 300).map((bar) => bar.high)));
});

test("zero-buffer policy exactly matches direct production targets", () => {
  const input = bars(), decisions = new Map([[300, [buy]], [315, [{ direction: "reduce", targetAllocation: 0, signals: ["long-exit"] } as StrategyCycleRecentSignal]]]);
  const path = replay(new Features(input), decisions, 290, { ...policies()[0], family: "buffer", buffer: 0 });
  const controller = new SmaPositionOverlay(input, DEFAULT_POSITION_OVERLAY_OPTIONS), expected = input.map(() => 0);
  for (let i = 290; i < input.length; i++) {
    const signals = decisions.get(i) ?? [];
    if (signals.length) controller.request(signals[0].direction, signals[0].targetAllocation, i);
    expected[i] = controller.close(i, signals.length > 0);
  }
  assert.deepEqual(path.targets, expected);
});

test("blocked entry has no phantom entry price and accepts only a fresh confirmed request", () => {
  const input = bars(), features = noisy(input), decisions = new Map([[300, [buy]], [301, [buy]]]);
  const first = replay(features, decisions, 300, candidate(), 301);
  assert.equal(first.targets[300], 0); assert.equal(first.cursor.overlay.entryIndex, null);
  const completed = replay(features, decisions, 300, candidate(), 303, first);
  assert.equal(completed.targets[301], 1); assert.equal(completed.cursor.overlay.entryIndex, 301);
  assert.equal(completed.cursor.overlay.entryClose, input[301].close);
});

test("hard risk exits bypass the noise delay and replay resume is exact", () => {
  const input = bars(); input[303] = { ...input[303], open: 120, close: 120, high: 121, low: 119 };
  const features = noisy(input), decisions = new Map([[300, [buy]], [301, [buy]]]);
  const full = replay(features, decisions, 300, candidate());
  assert.equal(full.targets[301], 1); assert.equal(full.targets[303], 0);
  assert.ok(full.events.some((event) => event.index === 303 && event.reason === "risk" && event.actual === 0));
  const partial = replay(features, decisions, 300, candidate(), 302);
  assert.deepEqual(replay(features, decisions, 300, candidate(), input.length, structuredClone(partial)), full);
});

test("ordinary pending reductions and prior entry age survive a blocked sell", () => {
  const input = bars();
  for (let i = 315; i < 340; i++) input[i] = { ...input[i], close: 130 - (i - 315) * .1, open: 130, high: 131, low: 129 };
  const features = noisy(input), decisions = new Map([[300, [buy]], [301, [buy]], [325, [{ direction: "reduce", targetAllocation: 0, signals: ["long-exit"] } as StrategyCycleRecentSignal]]]);
  const partial = replay(features, decisions, 300, candidate(), 326);
  assert.equal(partial.targets[325], 1); assert.equal(partial.cursor.overlay.pending, 0);
  assert.equal(partial.cursor.overlay.entryIndex, 301);
  const final = replay(features, decisions, 300, candidate(), 327, partial);
  assert.equal(final.targets[326], 0);
});

test("ATR shock exit remains immediate after the early-stop holding window", () => {
  const input = bars(); input[310] = { ...input[310], open: 120, close: 120, high: 121, low: 119 };
  const path = replay(noisy(input), new Map([[300, [buy]], [301, [buy]]]), 300, candidate());
  assert.equal(path.targets[309], 1); assert.equal(path.targets[310], 0);
  assert.ok(path.events.some((event) => event.index === 310 && event.reason === "risk"));
});

test("selection never uses audit returns and incompatible progress is rejected", () => {
  const segment = { totalReturn: 20, maxDrawdown: -10, fills: 100, turnover: 10 };
  const base: Row = { policy: policies()[0], train: { ...segment }, validation: { ...segment }, audit: { ...segment }, full: { ...segment },
    blocked: 0, risks: 0, breakouts: 0, regimeBars: 0, targetHash: "base" };
  const one: Row = { ...base, policy: candidate(), train: { ...segment, fills: 80 }, validation: { ...segment, totalReturn: 22, fills: 80 }, audit: { ...segment, totalReturn: -99 } };
  assert.equal(select([base, one], "regime").policy.id, "test");
  assert.equal(select([base, { ...one, audit: { ...segment, totalReturn: 9999 } }], "regime").policy.id, "test");
  assert.equal(select([base], "buffer"), base);
  assert.throws(() => validateProgress({ identity: "wrong", rows: [] }, "correct"), /Incompatible/);
  assert.throws(() => validateProgress({ identity: "same", rows: [one] }, "same"));
});
