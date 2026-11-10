import assert from "node:assert/strict";
import test from "node:test";
import { SmaPositionOverlay, RSI_SHAPE_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import { strategyCycleSignalDirection, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { BacktestSettings } from "../../lib/analysis/backtest";
import type { MarketBar } from "../../lib/market/types";
import { DAYS, isCooling, replay, validateProgress, type Replay } from "./model";

const settings: BacktestSettings = { initialCash: 100000, commissionRate: .0003, slippageRate: .0002, interval: "1d" };
const bars: MarketBar[] = Array.from({ length: 320 }, (_, i) => {
  const close = 100 + i * .1;
  return { time: new Date(Date.UTC(2020, 0, i + 1)).toISOString().slice(0, 10), timestamp: Date.UTC(2020, 0, i + 1),
    open: close, high: close + .3, low: close - .3, close, volume: 100, amount: close * 100,
    amplitude: 0, changePercent: 0, change: 0, turnoverRate: 0 };
});
const signal = (direction: "increase" | "reduce", targetAllocation: number): StrategyCycleRecentSignal[] =>
  [{ direction, targetAllocation, signals: [direction === "increase" ? "long-entry" : "long-exit"] }];
function seed(days: number, allocation = .5, lastReduction: number | null = 239, sample = bars): Replay {
  const controller = new SmaPositionOverlay(sample, DEFAULT_POSITION_OVERLAY_OPTIONS, allocation);
  const overlay = { ...controller.checkpoint(), entryIndex: allocation ? 200 : null, entryClose: allocation ? sample[200].close : 0,
    flatStart: allocation ? null : 239, lastClosedIndex: 239 };
  return { targets: sample.map((_, i) => i >= 200 && i <= 239 ? allocation : 0), events: [], fills: [], cursor: {
    index: 239, days, overlay, account: { cash: 100000 * (1 - allocation), units: 100000 * allocation / sample[239].close },
    planned: allocation, previousTarget: allocation, lastReduction } };
}

test("sale day excluded, next X trading indexes inclusive, X0 exempt", () => {
  assert.equal(isCooling(100, 100, 3), false);
  assert.equal(isCooling(101, 100, 3), true); assert.equal(isCooling(103, 100, 3), true);
  assert.equal(isCooling(104, 100, 3), false); assert.equal(isCooling(101, null, 3), false);
  assert.equal(isCooling(101, 100, 0), false);
});
test("all original increases are capped and a fresh request passes on first eligible day without resetting entry age", () => {
  const decisions = new Map([240, 241, 242, 243].map((i) => [i, signal("increase", 1)]));
  const partial = replay(bars, decisions, 200, 3, settings, 243, seed(3));
  assert.deepEqual(partial.targets.slice(240, 243), [.5, .5, .5]);
  assert.equal(partial.cursor.overlay.entryIndex, 200); assert.equal(partial.cursor.overlay.lastIncreaseRequestIndex, 242);
  const complete = replay(bars, decisions, 200, 3, settings, 244, JSON.parse(JSON.stringify(partial)));
  assert.equal(complete.targets[243], 1); assert.equal(complete.cursor.overlay.entryIndex, 200);
  assert.equal(complete.events.filter((event) => event.blocked).length, 3);
});
test("blocked signals do not queue an automatic buy after expiry and no-op buys still cancel pending sells", () => {
  const result = replay(bars, new Map([[240, signal("increase", 1)]]), 200, 3, settings, 245, seed(3));
  assert.equal(result.targets[244], .5);
  const pending = seed(3); pending.cursor.overlay.pending = 0;
  const cancelled = replay(bars, new Map([[240, signal("increase", .5)]]), 200, 3, settings, 241, pending);
  assert.equal(cancelled.cursor.overlay.pending, null); assert.equal(cancelled.targets[240], .5);
});
test("pending-only reductions do not reset the clock", () => {
  const result = replay(bars, new Map([[240, signal("reduce", 0)]]), 200, 3, settings, 241, seed(3));
  assert.equal(result.targets[240], .5); assert.equal(result.cursor.overlay.pending, 0);
  assert.equal(result.cursor.lastReduction, 239); assert.equal(result.fills.length, 0);
});
test("executed partial and full sales remain allowed and reset the clock", () => {
  const sample = bars.map((bar, i) => {
    const close = i < 220 ? bar.close : bars[219].close - (i - 219) * .15;
    return { ...bar, open: close, close, low: close - .2, high: 130 + i * .01 };
  });
  for (const allocation of [.3, 0]) {
    const seeded = seed(3, 1, 239, sample);
    const result = replay(sample, new Map([[240, signal("reduce", allocation)]]), 200, 3, settings, 241, seeded);
    assert.equal(result.targets[240], allocation); assert.equal(result.cursor.lastReduction, 240);
    assert.equal(result.fills.length, 1); assert.equal(result.events.at(-1)!.sold, true);
  }
});
test("hard4% and later ATR risk exits pass during cooldown, preserve native reentry wait", () => {
  for (const early of [true, false]) {
    const sample = bars.map((bar) => ({ ...bar })), close = bars[239].close * (early ? .94 : .97);
    sample[240] = { ...sample[240], open: close, close, high: close + .1, low: close - .1 };
    const seeded = seed(10, 1, 239, sample);
    if (early) { seeded.cursor.overlay.entryIndex = 239; seeded.cursor.overlay.entryClose = bars[239].close; }
    const result = replay(sample, new Map([[240, signal("increase", 1)]]), 200, 10, settings, 241, seeded);
    assert.equal(result.targets[240], 0); assert.equal(result.cursor.lastReduction, 240);
    assert.equal(result.events.at(-1)!.risk, true); assert.equal(result.events.at(-1)!.blocked, false);
    assert.ok(result.cursor.overlay.blockedUntil >= 241);
  }
});
test("automatic flat recovery is capped without consuming its durable recovery state", () => {
  const seeded = seed(10, 0, 239); seeded.cursor.overlay.recoveryTarget = 1; seeded.cursor.overlay.stoppedAt = 230;
  const result = replay(bars, new Map(), 200, 10, settings, 241, seeded);
  assert.equal(result.targets[240], 0); assert.equal(result.cursor.overlay.recoveryTarget, 1);
  assert.equal(result.events.at(-1)!.blocked, true); assert.equal(result.events.at(-1)!.flat, true);
  assert.equal(result.cursor.overlay.entryIndex, null);
});
test("X0 matches native controller and ledger resumes with causal prefixes for every X", () => {
  const decisions = new Map([[230, signal("increase", 1)], [240, signal("reduce", 0)], [260, signal("increase", 1)]]);
  const native = new SmaPositionOverlay(bars, DEFAULT_POSITION_OVERLAY_OPTIONS), targets = bars.map(() => 0);
  for (let i = 220; i < bars.length; i++) {
    const signals = decisions.get(i) ?? [], direction = strategyCycleSignalDirection(signals);
    if (direction) native.request(direction, signals.at(-1)!.targetAllocation, i);
    targets[i] = native.close(i, signals.length > 0);
  }
  const baseline = replay(bars, decisions, 220, 0, settings);
  assert.deepEqual(baseline.targets, targets); assert.deepEqual(baseline.cursor.overlay, native.checkpoint());
  for (const days of DAYS) {
    const complete = replay(bars, decisions, 220, days, settings), partial = replay(bars, decisions, 220, days, settings, 250);
    assert.deepEqual(replay(bars, decisions, 220, days, settings, bars.length, JSON.parse(JSON.stringify(partial))), complete);
    assert.deepEqual(replay(bars.slice(0, 250), decisions, 220, days, settings).cursor, partial.cursor);
  }
});
test("checkpoint identity/hash/order, wrong policy and workload bounds fail explicitly", () => {
  validateProgress({ identity: "a", hash: "h", rows: [{ policy: "X0", days: 0 }] }, "a", "h");
  assert.throws(() => validateProgress({ identity: "a", hash: "h", rows: [] }, "b", "h"));
  assert.throws(() => validateProgress({ identity: "a", hash: "h", rows: [] }, "a", "bad"));
  assert.throws(() => validateProgress({ identity: "a", hash: "h", rows: [{ policy: "X1", days: 1 }] }, "a", "h"));
  assert.throws(() => replay(bars, new Map(), 200, 3, settings, 250, seed(2)));
  assert.throws(() => replay(bars, new Map(), 200, -1, settings));
  assert.throws(() => replay(Array.from({ length: 10001 }, () => bars[0]), new Map(), 200, 1, settings));
});
