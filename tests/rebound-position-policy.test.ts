import assert from "node:assert/strict";
import test from "node:test";
import { CURRENT_POSITION_OVERLAY_MODEL, DEFAULT_POSITION_OVERLAY_OPTIONS, ENGULF_POSITION_OVERLAY_MODEL,
  ENGULF_POSITION_OVERLAY_OPTIONS, ATR_POSITION_OVERLAY_OPTIONS, POSITION_OVERLAY_MODELS, SmaPositionOverlay, normalizeSmaPositionOverlay } from "../lib/analysis/sma-position-overlay";
import { ema, sma, wma } from "../lib/analysis/indicators";
import { runAllocationBacktest } from "../lib/analysis/backtest";
import { parseStrategyAllocationPlan } from "../lib/analysis/saved-backtests";
import { buildCheckpointIdentity } from "../lib/analysis/screening-worker-client";
import type { MarketBar } from "../lib/market/types";

function bars(values: number[]): MarketBar[] {
  return values.map((close, index) => ({ time: new Date(Date.UTC(2024, 0, index + 1)).toISOString().slice(0, 10),
    open: close, close, high: close + 1, low: close - 1 }) as MarketBar);
}
function rebound(tail = [94, 94, 94, 94, 94, 94, 94, 93, 92, 91]) {
  return bars([...Array(40).fill(100), 98, 96, 94, 92, 90, 89, 89, 90, 91, 92, 93, ...tail]);
}
function replay(source: MarketBar[], end = 50, start = 20, options = DEFAULT_POSITION_OVERLAY_OPTIONS) {
  const account = new SmaPositionOverlay(source, options);
  for (let index = start; index <= end; index++) assert.equal(account.close(index, false), 0);
  return account;
}

test("current defaults are versioned separately and archived v5 remains fixed and parseable", () => {
  assert.notEqual(CURRENT_POSITION_OVERLAY_MODEL, ENGULF_POSITION_OVERLAY_MODEL);
  assert.equal(POSITION_OVERLAY_MODELS.length, 8);
  for (const options of [DEFAULT_POSITION_OVERLAY_OPTIONS, ENGULF_POSITION_OVERLAY_OPTIONS]) {
    assert.deepEqual(normalizeSmaPositionOverlay({ ...options, supplementalEntry: false, exitGuard: false, entrySlopeGate: false }), options);
    const plan = { strategyA: { strategyId: "sma-cross", parameters: { fast: 10, slow: 30 } }, strategyB: null,
      strategyAAllocation: 1, strategyBAllocation: 0, positionOverlay: options };
    assert.equal(parseStrategyAllocationPlan(plan)!.positionOverlay!.model, options.model);
  }
  const signature = (positionOverlay: typeof DEFAULT_POSITION_OVERLAY_OPTIONS) => buildCheckpointIdentity([], {
    initialCash: 100000, commissionRate: 0, slippageRate: 0, interval: "1d", positionOverlay,
  }, { mode: "sample", periods: [{ sessions: 10, weight: 100 }] }, { objective: "totalReturn" }).signature;
  assert.notEqual(signature(DEFAULT_POSITION_OVERLAY_OPTIONS), signature(ENGULF_POSITION_OVERLAY_OPTIONS));
});

test("daily rebound enters below SMA20 on the third rising EMA7 slope without a fresh turn", () => {
  const source = rebound(), account = replay(source), closes = source.map(bar => bar.close);
  const entry = ema(closes, 7), average = sma(closes, 20), gate = wma(closes, 7);
  assert.ok(entry[49]! > entry[48]! && entry[50]! > entry[49]! && entry[51]! > entry[50]!);
  assert.ok(source[51]!.close <= average[51]! && gate[51]! >= gate[50]!);
  assert.equal(account.close(51, false), 1); assert.equal(account.close(51, false), 1);
  const historical = new SmaPositionOverlay(source, ENGULF_POSITION_OVERLAY_OPTIONS);
  for (let index = 20; index <= 51; index++) assert.equal(historical.close(index, false), 0);
});

test("rebound threshold includes four percent and rejects a just-smaller rebound", () => {
  for (const [close, expected] of [[92.56, 1], [92.5599, 0]]) {
    const source = rebound([close!]);
    assert.equal(replay(source).close(51, false), expected);
  }
});

test("archived v7 rebound cannot borrow a low preceding the known flat episode", () => {
  const source = rebound();
  assert.equal(replay(source, 50, 50, ATR_POSITION_OVERLAY_OPTIONS).close(51, false), 0);
  const inherited = new SmaPositionOverlay(source, ATR_POSITION_OVERLAY_OPTIONS, 0.4);
  for (let index = 47; index <= 51; index++) assert.equal(inherited.close(index, false), 0.4);
  const exited = new SmaPositionOverlay(source, ATR_POSITION_OVERLAY_OPTIONS, 0.4);
  for (let index = 40; index <= 47; index++) assert.equal(exited.close(index, false), 0.4);
  assert.equal(exited.request("reduce", 0, 48), 0); assert.equal(exited.close(48, true), 0);
  for (let index = 49; index <= 51; index++) assert.equal(exited.close(index, false), 0);
});

test("original reductions and blocked original increases veto the extra entry", () => {
  for (const direction of ["reduce", "increase"] as const) {
    const account = replay(rebound());
    account.request(direction, 0, 51);
    assert.equal(account.close(51, true), 0);
  }
  const account = replay(rebound());
  assert.equal(account.request("increase", 0.4, 51), 0.4);
  assert.equal(account.close(51, true), 0.4);
  assert.equal(account.close(52, false), 0.4);
});

test("new rebound entries retain hold7 protection and the original pending reduction target", () => {
  const source = rebound([94, 94, 94, 94, 94, 94, 90, 89]), account = replay(source);
  assert.equal(account.close(51, false), 1);
  assert.equal(account.request("reduce", 0.3, 52), 1); account.close(52, true);
  for (let index = 53; index <= 57; index++) assert.equal(account.close(index, false), 1);
  assert.equal(account.close(58, false), 0.3);
});

test("rebound entry still stops at cumulative four percent and cannot bypass five-bar cooldown", () => {
  const source = rebound([94, 90, ...Array(8).fill(110)]), account = replay(source);
  assert.equal(account.close(51, false), 1); assert.equal(account.close(52, false), 0);
  for (let index = 53; index <= 57; index++) {
    assert.equal(account.request("increase", 1, index), 0); assert.equal(account.close(index, true), 0);
  }
  assert.equal(account.close(58, false), 1);
});

test("ordinary rebound signals fill at the following open instead of the confirmation close", () => {
  const source = rebound(), result = runAllocationBacktest(source, source.map(() => 0), {
    initialCash: 100000, commissionRate: 0, slippageRate: 0, interval: "1d", executionPolicy: "next-open",
    positionOverlay: DEFAULT_POSITION_OVERLAY_OPTIONS,
  });
  assert.equal(result.rebalances[0]!.time, source[52]!.time);
});

test("ready native recovery restores the stopped partial target instead of a full rebound entry", () => {
  const source = bars([...Array(20).fill(100), 90, 89, 95, 96, 96, 96, 96]);
  const account = new SmaPositionOverlay(source, DEFAULT_POSITION_OVERLAY_OPTIONS);
  assert.equal(account.request("increase", 0.4, 19), 0.4); account.close(19, true);
  assert.equal(account.close(20, false), 0);
  for (let index = 21; index <= 25; index++) assert.equal(account.close(index, false), 0);
  assert.equal(account.close(26, false), 0.4);
});

test("flat-episode tracking and rebound confirmations preserve every completed prefix", () => {
  const source = rebound([...Array(12).fill(94), 89, 110]), full = new SmaPositionOverlay(source, DEFAULT_POSITION_OVERLAY_OPTIONS);
  const partial = new SmaPositionOverlay(source.slice(0, 60), DEFAULT_POSITION_OVERLAY_OPTIONS);
  for (let index = 20; index < 60; index++) {
    if (index === 52) { full.request("reduce", 0, index); partial.request("reduce", 0, index); }
    assert.equal(full.close(index, index === 52), partial.close(index, index === 52));
  }
});
