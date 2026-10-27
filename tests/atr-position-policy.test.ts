import assert from "node:assert/strict";
import test from "node:test";
import { atr } from "../lib/analysis/indicators";
import { ATR_POSITION_OVERLAY_MODEL as CURRENT_POSITION_OVERLAY_MODEL, ATR_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS, REBOUND_POSITION_OVERLAY_OPTIONS,
  SmaPositionOverlay, normalizeSmaPositionOverlay } from "../lib/analysis/sma-position-overlay";
import { runAllocationBacktest } from "../lib/analysis/backtest";
import { parseStrategyAllocationPlan } from "../lib/analysis/saved-backtests";
import { buildCheckpointIdentity } from "../lib/analysis/screening-worker-client";
import type { MarketBar } from "../lib/market/types";

function bars(tail: number[] = [96, 100]) {
  return [...Array(21).fill(100), ...tail].map((close, index) => ({
    time: new Date(Date.UTC(2024, 0, index + 1)).toISOString().slice(0, 10),
    open: close, close, high: close + 1, low: close - 1,
  })) as MarketBar[];
}
function held(source: MarketBar[], options = DEFAULT_POSITION_OVERLAY_OPTIONS) {
  const account = new SmaPositionOverlay(source, options);
  assert.equal(account.request("increase", 0.4, 14), 0.4);
  for (let index = 14; index <= 20; index++) assert.equal(account.close(index, index === 14), 0.4);
  return account;
}

test("v7 is distinct from archived v6 in saved plans and screening identities", () => {
  assert.notEqual(CURRENT_POSITION_OVERLAY_MODEL, REBOUND_POSITION_OVERLAY_OPTIONS.model);
  const signature = (positionOverlay: typeof DEFAULT_POSITION_OVERLAY_OPTIONS) => buildCheckpointIdentity([], {
    initialCash: 100000, commissionRate: 0, slippageRate: 0, interval: "1d", positionOverlay,
  }, { mode: "sample", periods: [{ sessions: 10, weight: 100 }] }, { objective: "totalReturn" }).signature;
  assert.notEqual(signature(DEFAULT_POSITION_OVERLAY_OPTIONS), signature(REBOUND_POSITION_OVERLAY_OPTIONS));
  for (const options of [DEFAULT_POSITION_OVERLAY_OPTIONS, REBOUND_POSITION_OVERLAY_OPTIONS]) {
    assert.deepEqual(normalizeSmaPositionOverlay({ ...options, exitGuard: false }), options);
    assert.equal(parseStrategyAllocationPlan({ strategyA: { strategyId: "sma-cross", parameters: { fast: 10, slow: 30 } },
      strategyB: null, strategyAAllocation: 1, strategyBAllocation: 0, positionOverlay: options })!.positionOverlay!.model, options.model);
  }
});

test("ATR exit uses previous WilderATR14 and an inclusive price-unit threshold", () => {
  for (const [close, expected] of [[96, 0], [96.0001, 0.4]]) {
    const source = bars([close!]);
    assert.equal(atr(source, 14)[20], 2);
    assert.ok(atr(source, 14)[21]! > 2);
    const account = held(source);
    assert.equal(account.close(21, false), expected);
    assert.equal(account.close(21, false), expected);
  }
  assert.equal(held(bars(), REBOUND_POSITION_OVERLAY_OPTIONS).close(21, false), 0.4);
  const zeroRange = bars([99]).map((bar, index) => index < 21 ? { ...bar, high: 100, low: 100 } : bar);
  assert.equal(held(zeroRange).close(21, false), 0.4);
});

test("shock exit clears protected supplemental holdings and pending reductions without recovery", () => {
  const source = bars().slice(0, 19);
  const values = [98, 101, 105, 100, 104];
  for (const close of values) {
    source.push({ time: new Date(Date.UTC(2024, 0, source.length + 1)).toISOString().slice(0, 10),
      open: close, close, high: close + 1, low: close - 1 } as MarketBar);
  }
  const account = new SmaPositionOverlay(source, DEFAULT_POSITION_OVERLAY_OPTIONS);
  for (let index = 14; index <= 19; index++) assert.equal(account.close(index, false), 0);
  assert.equal(account.close(20, false), 1);
  assert.equal(account.request("reduce", 0.2, 21), 1);
  assert.equal(account.close(21, true), 1);
  assert.equal(account.close(22, false), 0);
  assert.equal(account.close(23, true), 0);
  assert.equal(account.request("increase", 0.3, 23), 0.3);
});

test("simultaneous early loss and ATR retain the original five-bar cooldown", () => {
  const source = bars([96, ...Array(7).fill(101)]);
  const account = new SmaPositionOverlay(source, DEFAULT_POSITION_OVERLAY_OPTIONS);
  assert.equal(account.request("increase", 1, 20), 1);
  account.close(20, true);
  assert.equal(account.close(21, false), 0);
  for (let index = 22; index <= 26; index++) {
    assert.equal(account.request("increase", 1, index), 0);
    assert.equal(account.close(index, true), 0);
  }
  assert.equal(account.request("increase", 1, 27), 1);
});

test("shock does not liquidate a fresh entry or run before ATR warmup", () => {
  const source = bars();
  const rising = bars([103, 106, 109, 112, 115, 118, 121, 113]);
  const fresh = new SmaPositionOverlay(rising, DEFAULT_POSITION_OVERLAY_OPTIONS);
  assert.equal(fresh.request("increase", 0.4, 28), 0.4);
  assert.equal(fresh.close(28, true), 0.4);
  const previouslyHeld = new SmaPositionOverlay(rising, DEFAULT_POSITION_OVERLAY_OPTIONS, 0.4);
  assert.equal(previouslyHeld.close(28, false), 0);
  const aboveEma = rising.map((bar, index) => index === 28 ? { ...bar, close: 113.5 } : bar);
  assert.equal(new SmaPositionOverlay(aboveEma, DEFAULT_POSITION_OVERLAY_OPTIONS, 0.4).close(28, false), 0.4);
  const inherited = new SmaPositionOverlay(source, DEFAULT_POSITION_OVERLAY_OPTIONS, 0.4);
  assert.equal(inherited.close(21, false), 0);
  const short = bars().slice(0, 13);
  short[12] = { ...short[12]!, close: 90, low: 89, high: 91 };
  assert.equal(new SmaPositionOverlay(short, DEFAULT_POSITION_OVERLAY_OPTIONS, 0.4).close(12, false), 0.4);
});

test("ATR clearing remains prefix-causal and ordinary fills wait for the next open", () => {
  const source = bars(), full = held(source), prefix = held(source.slice(0, 22));
  assert.equal(full.close(21, false), prefix.close(21, false));
  const targets = source.map((_, index) => index >= 14 ? 0.4 : 0);
  const result = runAllocationBacktest(source, targets, { initialCash: 100000, commissionRate: 0,
    slippageRate: 0, interval: "1d", executionPolicy: "next-open", positionOverlay: DEFAULT_POSITION_OVERLAY_OPTIONS });
  assert.equal(result.rebalances.at(-1)!.time, source[22]!.time);
  assert.equal(result.rebalances.at(-1)!.targetAllocation, 0);
});
