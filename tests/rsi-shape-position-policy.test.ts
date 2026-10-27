import assert from "node:assert/strict";
import test from "node:test";
import { SmaPositionOverlay, CURRENT_POSITION_OVERLAY_MODEL, DEFAULT_POSITION_OVERLAY_OPTIONS,
  ATR_POSITION_OVERLAY_MODEL, ATR_POSITION_OVERLAY_OPTIONS, normalizeSmaPositionOverlay } from "../lib/analysis/sma-position-overlay";
import { rsi } from "../lib/analysis/indicators";
import { runAllocationBacktest } from "../lib/analysis/backtest";
import { parseStrategyAllocationPlan } from "../lib/analysis/saved-backtests";
import { buildCheckpointIdentity } from "../lib/analysis/screening-worker-client";
import type { MarketBar } from "../lib/market/types";

function bars(closes: number[]): MarketBar[] {
  return closes.map((close, index) => ({ time: new Date(Date.UTC(2024, 0, index + 1)).toISOString().slice(0, 10),
    timestamp: Date.UTC(2024, 0, index + 1), open: close, high: close + 1, low: close - 1, close,
    volume: 1000, amount: close * 1000, change: 0, changePercent: 0, amplitude: 2, turnoverRate: 0 }));
}
function entryBars(low = 91, close = 98, tail: number[] = []) {
  return bars([...Array<number>(40).fill(100), 99, 97, 95, 93, 92, low, close, ...tail]);
}
function flat(source: MarketBar[], options = DEFAULT_POSITION_OVERLAY_OPTIONS) {
  const account = new SmaPositionOverlay(source, options);
  for (let index = 20; index < 46; index += 1) assert.equal(account.close(index, false), 0);
  return account;
}
function exitBars() { return bars(Array.from({ length: 40 }, (_, index) => 120 - index)); }
interface State {
  lastSupplement: number | null; pending: number | null; entryIndex: number | null; entryClose: number;
  previousCloseAllocation: number; recoveryTarget: number | null; stoppedAt: number; blockedUntil: number;
  features: { policy: { shapeEntry: boolean[]; shapeExit: boolean[] } };
}
const state = (account: SmaPositionOverlay) => account as unknown as State;

test("v8 saved plans and screening identities remain distinct from archived v7", () => {
  assert.notEqual(CURRENT_POSITION_OVERLAY_MODEL, ATR_POSITION_OVERLAY_MODEL);
  const signature = (positionOverlay: typeof DEFAULT_POSITION_OVERLAY_OPTIONS) => buildCheckpointIdentity([], {
    initialCash: 100000, commissionRate: 0, slippageRate: 0, interval: "1d", positionOverlay,
  }, { mode: "sample", periods: [{ sessions: 10, weight: 100 }] }, { objective: "totalReturn" }).signature;
  assert.notEqual(signature(DEFAULT_POSITION_OVERLAY_OPTIONS), signature(ATR_POSITION_OVERLAY_OPTIONS));
  for (const options of [DEFAULT_POSITION_OVERLAY_OPTIONS, ATR_POSITION_OVERLAY_OPTIONS]) {
    assert.deepEqual(normalizeSmaPositionOverlay({ ...options, supplementalEntry: false, exitGuard: false }), options);
    const parsed = parseStrategyAllocationPlan({ strategyA: { strategyId: "sma-cross", parameters: { fast: 10, slow: 30 } },
      strategyB: null, strategyAAllocation: 1, strategyBAllocation: 0, positionOverlay: options });
    assert.equal(parsed?.positionOverlay?.model, options.model);
  }
});
test("E uses an inclusive nine-percent prior decline and is absent from archived v7", () => {
  const source = entryBars();
  assert.equal(flat(source).close(46, false), 1);
  assert.equal(new SmaPositionOverlay(source, DEFAULT_POSITION_OVERLAY_OPTIONS).close(46, false), 1);
  assert.equal(flat(source, ATR_POSITION_OVERLAY_OPTIONS).close(46, false), 0);
  assert.equal(flat(entryBars(91.0001)).close(46, false), 0);
});
test("E requires a strictly higher low, close above prior high, WMA gate and no original signal", () => {
  const lowEqual = entryBars(); lowEqual[46]!.low = lowEqual[45]!.low;
  assert.equal(flat(lowEqual).close(46, false), 0);
  const highEqual = entryBars(); highEqual[45]!.high = highEqual[46]!.close;
  assert.equal(flat(highEqual).close(46, false), 0);
  assert.equal(flat(entryBars(91, 92.1)).close(46, false), 0);
  assert.equal(flat(entryBars()).close(46, true), 0);
});
test("E initializes supplemental protection and cannot replace native partial recovery", () => {
  const account = flat(entryBars());
  assert.equal(account.close(46, false), 1);
  assert.equal(state(account).lastSupplement, 46);
  assert.equal(state(account).entryIndex, 46);
  assert.equal(state(account).entryClose, 98);
  assert.equal(state(account).previousCloseAllocation, 1);
  assert.equal(account.close(46, false), 1);
  const recovery = flat(entryBars());
  state(recovery).recoveryTarget = 0.4; state(recovery).stoppedAt = 40; state(recovery).blockedUntil = 46;
  assert.equal(recovery.close(46, false), 0.4);
  assert.equal(state(recovery).recoveryTarget, null);
});
test("E inherits the early four-percent stop and five-session entry wait", () => {
  const source = entryBars(91, 98, [94, 99, 99, 99, 99, 99, 99]);
  const account = flat(source); assert.equal(account.close(46, false), 1);
  assert.equal(account.close(47, false), 0);
  for (let index = 48; index <= 52; index += 1) {
    assert.equal(account.request("increase", 1, index), 0);
    assert.equal(account.close(index, true), 0);
  }
  assert.equal(account.request("increase", 1, 53), 1);
});
test("four decreasing highs with weak RSI submit a normal clear request without a new cooldown", () => {
  const source = exitBars();
  assert.ok(rsi(source.map((bar) => bar.close), 10)[30]! < 35);
  const account = new SmaPositionOverlay(source, DEFAULT_POSITION_OVERLAY_OPTIONS, 0.4);
  assert.equal(account.close(30, false), 0);
  assert.equal(state(account).pending, null);
  assert.equal(state(account).blockedUntil, 0);
  assert.equal(new SmaPositionOverlay(source, ATR_POSITION_OVERLAY_OPTIONS, 0.4).close(30, false), 0.4);
});
test("guarded shape clear respects supplemental hold and a native buy cancels the pending clear", () => {
  const source = exitBars(), account = new SmaPositionOverlay(source, DEFAULT_POSITION_OVERLAY_OPTIONS, 0.4);
  state(account).lastSupplement = 28;
  assert.equal(account.close(30, false), 0.4);
  assert.equal(state(account).pending, 0);
  assert.equal(account.request("increase", 0.6, 31), 0.6);
  assert.equal(account.close(31, true), 0.6);
  assert.equal(state(account).pending, null);
});
test("native buys and intrabar buy hints veto shape clear without vetoing native risk exits", () => {
  const source = exitBars();
  const bought = new SmaPositionOverlay(source, DEFAULT_POSITION_OVERLAY_OPTIONS, 0.4);
  assert.equal(bought.request("increase", 0.7, 30), 0.7);
  assert.equal(bought.close(30, true), 0.7);
  const intrabar = new SmaPositionOverlay(source, DEFAULT_POSITION_OVERLAY_OPTIONS, 0.4);
  assert.equal(intrabar.close(30, true, true), 0.4);
  const shock = bars([...Array<number>(21).fill(100), 96]);
  assert.equal(new SmaPositionOverlay(shock, DEFAULT_POSITION_OVERLAY_OPTIONS, 0.4).close(21, true, true), 0);
});
test("equal highs break the pattern and RSI threshold remains strict", () => {
  const source = exitBars(); source[30]!.high = source[29]!.high;
  assert.equal(new SmaPositionOverlay(source, DEFAULT_POSITION_OVERLAY_OPTIONS, 0.4).close(30, false), 0.4);
  const positive = entryBars();
  for (let index = 43; index <= 46; index += 1) positive[index]!.high = 153 - index;
  const account = new SmaPositionOverlay(positive, DEFAULT_POSITION_OVERLAY_OPTIONS, 0.4);
  const strength = rsi(positive.map((bar) => bar.close), 10);
  assert.ok(strength[46]! > 35);
  assert.equal(state(account).features.policy.shapeExit[46], false);
  let lower = 91, upper = 98;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const middle = (lower + upper) / 2;
    positive[46]!.close = middle;
    if (rsi(positive.map((bar) => bar.close), 10)[46]! < 35) lower = middle;
    else upper = middle;
  }
  for (const [close, expected] of [[lower - 1e-6, true], [upper + 1e-6, false]] as const) {
    positive[46]!.close = close;
    assert.equal(state(new SmaPositionOverlay(positive.map((bar) => ({ ...bar })), DEFAULT_POSITION_OVERLAY_OPTIONS)).features.policy.shapeExit[46], expected);
  }
});
test("new entries and clear requests stay prefix-causal and ordinary fills wait for next open", () => {
  const source = entryBars(91, 98, [99, 100, 99, 98, 97, 96, 95]);
  const replay = (input: MarketBar[]) => {
    const account = new SmaPositionOverlay(input, DEFAULT_POSITION_OVERLAY_OPTIONS);
    return input.map((_, index) => index < 20 ? 0 : account.close(index, false));
  };
  const full = replay(source);
  for (const end of [47, 49, 52]) assert.deepEqual(replay(source.slice(0, end)), full.slice(0, end));
  const result = runAllocationBacktest(source, source.map(() => 0), { initialCash: 100000, commissionRate: 0,
    slippageRate: 0, interval: "1d", executionPolicy: "next-open", positionOverlay: DEFAULT_POSITION_OVERLAY_OPTIONS });
  assert.equal(result.rebalances[0]?.time, source[47]!.time);
  assert.equal(result.rebalances[0]?.targetAllocation, 1);
});
