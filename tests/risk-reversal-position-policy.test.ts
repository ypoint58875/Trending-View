import assert from "node:assert/strict";
import test from "node:test";
import { runAllocationBacktest } from "../lib/analysis/backtest";
import {
  DEFAULT_POSITION_OVERLAY_OPTIONS, SMA11_CLEAR_POSITION_OVERLAY_OPTIONS, SmaPositionOverlay,
  TWO_DAY_REVERSAL_POSITION_OVERLAY_OPTIONS,
} from "../lib/analysis/sma-position-overlay";
import type { MarketBar } from "../lib/market/types";

function bars(overrides: Record<number, [open: number, close: number]>): MarketBar[] {
  return Array.from({ length: 33 }, (_, index) => {
    const [open, close] = overrides[index] ?? [100, 100];
    return {
      time: new Date(Date.UTC(2024, 0, index + 1)).toISOString().slice(0, 10), timestamp: index,
      open, close, high: Math.max(open, close) + 1, low: Math.min(open, close) - 1,
      volume: 0, amount: 0, amplitude: 0, change: 0, changePercent: 0, turnoverRate: 0,
    };
  });
}

test("v13 records ATR before a same-close ordinary clear and attributes the next-open fill", () => {
  const source = bars({ 21: [100, 95] });
  const account = new SmaPositionOverlay(source, DEFAULT_POSITION_OVERLAY_OPTIONS, 1);
  assert.equal(account.request("reduce", 0, 21), 1);
  assert.equal(account.close(21, true, false, true), 0);
  assert.equal(account.riskExitReasonAt(21), "atr-shock");
  assert.equal(account.checkpoint().blockedUntil, 22);
  assert.equal(account.checkpoint().recoveryTarget, null);
  const archived = new SmaPositionOverlay(source, SMA11_CLEAR_POSITION_OVERLAY_OPTIONS, 1);
  archived.request("reduce", 0, 21);
  assert.equal(archived.close(21, true), 0);
  assert.equal(archived.riskExitReasonAt(21), undefined);

  const result = runAllocationBacktest(source, source.map((_, i) => i >= 14 && i < 21 ? 1 : 0), {
    initialCash: 100_000, commissionRate: 0, slippageRate: 0, interval: "1d",
    executionPolicy: "next-open", positionOverlay: DEFAULT_POSITION_OVERLAY_OPTIONS,
  });
  const exit = result.rebalances.find(fill => fill.riskExitReason);
  assert.equal(exit?.riskExitReason, "atr-shock");
  assert.equal(exit?.time, source[22].time);
  assert.equal(exit?.targetAllocation, 0);
});

test("simultaneous hard risks record the early stop and preserve pre-request exposure for recovery", () => {
  const source = bars({ 21: [100, 95] });
  for (const direction of ["increase", "reduce"] as const) {
    const account = new SmaPositionOverlay(source, TWO_DAY_REVERSAL_POSITION_OVERLAY_OPTIONS);
    assert.equal(account.request("increase", .4, 20), .4);
    assert.equal(account.close(20, true), .4);
    assert.equal(account.request(direction, direction === "increase" ? 1 : 0, 21), .4);
    assert.equal(account.close(21, true), 0);
    assert.equal(account.riskExitReasonAt(21), "early-stop");
    assert.equal(account.checkpoint().recoveryTarget, .4);
    assert.equal(account.checkpoint().blockedUntil, 27);
    const resumed = new SmaPositionOverlay(source, DEFAULT_POSITION_OVERLAY_OPTIONS);
    resumed.restore(account.checkpoint());
    assert.equal(resumed.riskExitReasonAt(21), "early-stop");
    assert.equal(resumed.riskExitReasonAt(22), undefined);
  }
});

test("v13 recognizes the two-session rebound and v14 removes it", () => {
  for (const [close, expected] of [[94.5, 0], [95, 1]] as const) {
    const source = bars({ 21: [100, 95], 22: [92, 92], 23: [90, 91], 24: [94, 95], 25: [94, close] });
    const account = new SmaPositionOverlay(source, TWO_DAY_REVERSAL_POSITION_OVERLAY_OPTIONS);
    account.request("increase", 1, 20);
    account.close(20, true);
    account.close(21, false);
    assert.equal(account.riskExitReasonAt(21), "early-stop");
    for (let i = 22; i <= 24; i++) assert.equal(account.close(i, false), 0);
    assert.equal(account.close(25, false), expected);
    assert.equal(account.checkpoint().lastSupplement, expected === 1 ? 25 : null);
    const current = new SmaPositionOverlay(source, DEFAULT_POSITION_OVERLAY_OPTIONS);
    current.restore({ ...current.checkpoint(), stoppedAt: 21, blockedUntil: 27, recoveryTarget: 1 });
    assert.equal(current.close(25, false), 0);
  }
});

test("flat reversal overrides a resolved sell and defers to an original buy", () => {
  const source = bars({ 23: [100, 91], 24: [90, 105] });
  const sell = new SmaPositionOverlay(source, DEFAULT_POSITION_OVERLAY_OPTIONS);
  sell.request("reduce", 0, 24);
  assert.equal(sell.close(24, true, false, true), 1);
  const unresolved = new SmaPositionOverlay(source, DEFAULT_POSITION_OVERLAY_OPTIONS);
  assert.equal(unresolved.close(24, true), 0);
  const buy = new SmaPositionOverlay(source, DEFAULT_POSITION_OVERLAY_OPTIONS);
  assert.equal(buy.request("increase", .4, 24), .4);
  assert.equal(buy.close(24, true, true), .4);
  const archived = new SmaPositionOverlay(source, SMA11_CLEAR_POSITION_OVERLAY_OPTIONS);
  assert.equal(archived.close(24, true, false, true), 0);
});

test("strict bullish engulfing can still enter on v14 wait day four", () => {
  const source = bars({ 21: [100, 95], 24: [100, 91], 25: [90, 105] });
  const account = new SmaPositionOverlay(source, DEFAULT_POSITION_OVERLAY_OPTIONS);
  account.request("increase", 1, 20);
  account.close(20, true);
  account.close(21, false);
  for (let i = 22; i < 25; i++) assert.equal(account.close(i, false), 0);
  assert.equal(account.close(25, false), 1);
  assert.equal(account.entryReason, "engulf");
});

test("a qualifying E remains blocked on wait day four without a reversal", () => {
  const source = bars({
    26: [99, 99], 27: [97, 97], 28: [96, 95], 29: [96, 93], 30: [96, 92], 31: [96, 91], 32: [98, 98],
  });
  const eligible = new SmaPositionOverlay(source, DEFAULT_POSITION_OVERLAY_OPTIONS);
  assert.equal(eligible.close(32, false), 1);
  assert.equal(eligible.checkpoint().lastSupplement, 32);
  const waiting = new SmaPositionOverlay(source, DEFAULT_POSITION_OVERLAY_OPTIONS);
  waiting.restore({ ...waiting.checkpoint(), stoppedAt: 28, blockedUntil: 34, recoveryTarget: .4 });
  assert.equal(waiting.close(32, false), 0);
  assert.equal(waiting.checkpoint().recoveryTarget, .4);
});
