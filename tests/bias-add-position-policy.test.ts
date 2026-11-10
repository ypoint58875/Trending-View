import assert from "node:assert/strict";
import test from "node:test";
import { SmaPositionOverlay, BIAS_ADD_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS, RSI_SHAPE_POSITION_OVERLAY_OPTIONS,
  BIAS_ADD_POSITION_OVERLAY_MODEL as CURRENT_POSITION_OVERLAY_MODEL, RSI_SHAPE_POSITION_OVERLAY_MODEL, normalizeSmaPositionOverlay } from "../lib/analysis/sma-position-overlay";
import { buildContextCurves } from "../lib/analysis/market-context";
import { runAllocationBacktest } from "../lib/analysis/backtest";
import { parseStrategyAllocationPlan } from "../lib/analysis/saved-backtests";
import { buildCheckpointIdentity } from "../lib/analysis/screening-worker-client";
import { zhCN } from "../app/i18n/zh-CN";
import type { MarketBar } from "../lib/market/types";

function bars(): MarketBar[] {
  return Array.from({ length: 110 }, (_, i) => {
    const close = i < 40 ? 100 + i : i < 65 ? 140 - (i - 40) * 1.2 : 110 + (i - 65) * 3;
    const timestamp = Date.UTC(2024, 0, i + 1);
    return { timestamp, time: new Date(timestamp).toISOString().slice(0, 10), open: close, close, high: close + 1,
      low: close - 1, volume: 1000, amount: close * 1000, amplitude: 0, change: 0, changePercent: 0, turnoverRate: 0 };
  });
}
const gate = (source: MarketBar[]) => {
  const curve = buildContextCurves(source).bias[0];
  return curve.map((value, i) => value != null && curve[i - 1] != null && curve[i - 2] != null && curve[i - 3] != null &&
    value < curve[i - 1]! && curve[i - 1]! < curve[i - 2]! && curve[i - 2]! < curve[i - 3]!);
};

test("v9 preserves archived v8 and gives saved plans/checkpoints distinct identities", () => {
  assert.notEqual(CURRENT_POSITION_OVERLAY_MODEL, RSI_SHAPE_POSITION_OVERLAY_MODEL);
  for (const options of [DEFAULT_POSITION_OVERLAY_OPTIONS, RSI_SHAPE_POSITION_OVERLAY_OPTIONS]) {
    assert.deepEqual(normalizeSmaPositionOverlay({ ...options, supplementalEntry: false, exitGuard: false }), options);
    assert.equal(parseStrategyAllocationPlan({ strategyA: { strategyId: "sma-cross", parameters: { fast: 7, slow: 20 } },
      strategyB: null, strategyAAllocation: 1, strategyBAllocation: 0, positionOverlay: options })?.positionOverlay?.model, options.model);
  }
  const identity = (positionOverlay: typeof DEFAULT_POSITION_OVERLAY_OPTIONS) => buildCheckpointIdentity([], {
    initialCash: 100000, commissionRate: 0, slippageRate: 0, interval: "1d", positionOverlay,
  }, { mode: "sample", periods: [{ sessions: 10, weight: 100 }] }, { objective: "totalReturn" }).signature;
  assert.notEqual(identity(DEFAULT_POSITION_OVERLAY_OPTIONS), identity(RSI_SHAPE_POSITION_OVERLAY_OPTIONS));
});

test("holding adds match three strict declines of the existing smoothed BIAS20 curve", () => {
  const source = bars(), expected = gate(source);
  for (let i = 0; i < source.length; i++) {
    const account = new SmaPositionOverlay(source, DEFAULT_POSITION_OVERLAY_OPTIONS, .3);
    assert.equal(account.request("increase", 1, i), expected[i] ? .3 : 1, `bar ${i}`);
    assert.equal(new SmaPositionOverlay(source, RSI_SHAPE_POSITION_OVERLAY_OPTIONS, .3).request("increase", 1, i), 1);
  }
  assert.ok(expected.some(Boolean));
  const first = expected.findIndex(Boolean);
  assert.equal(expected[first - 1], false);
  assert.equal(new SmaPositionOverlay(source, DEFAULT_POSITION_OVERLAY_OPTIONS, .3).request("increase", 1, first - 1), 1);
});

test("cycle-close restriction starts and releases the following session without double-lagging next-open", () => {
  const source = bars(), expected = gate(source);
  const onset = expected.findIndex(Boolean), release = expected.findIndex((value, i) => i > onset && !value);
  assert.ok(onset >= 24 && release > onset);
  const probe = (index: number, lag: 0 | 1) => new SmaPositionOverlay(source, DEFAULT_POSITION_OVERLAY_OPTIONS, .3, lag).request("increase", 1, index);
  assert.equal(probe(onset, 0), .3); assert.equal(probe(onset, 1), 1); assert.equal(probe(onset + 1, 1), .3);
  assert.equal(probe(release, 0), 1); assert.equal(probe(release, 1), .3); assert.equal(probe(release + 1, 1), 1);
});

test("blocked adds retain holding age, cancel pending reductions and do not auto-retry after release", () => {
  const source = bars(), expected = gate(source), i = expected.findIndex(Boolean), account = new SmaPositionOverlay(source, DEFAULT_POSITION_OVERLAY_OPTIONS, .3);
  account.restore({ ...account.checkpoint(), entryIndex: i - 10, entryClose: source[i - 10].close,
    pending: .1, lastSupplement: i - 2, flatStart: null });
  assert.equal(account.request("increase", 1, i), .3);
  const state = account.checkpoint();
  assert.equal(state.entryIndex, i - 10); assert.equal(state.lastSupplement, i - 2); assert.equal(state.pending, null);
  assert.equal(state.lastIncreaseRequestIndex, i);
  const release = expected.findIndex((value, index) => index > i && !value);
  const restored = new SmaPositionOverlay(source, DEFAULT_POSITION_OVERLAY_OPTIONS); restored.restore(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored.checkpoint(), state);
  assert.equal(restored.request("increase", 1, release), 1);
});

test("flat entry remains eligible and native risk exits are unchanged during a holding-add restriction", () => {
  const source = bars(), expected = gate(source);
  let entriesChecked = 0;
  for (let i = 24; i < source.length; i++) if (expected[i]) {
    const archived = new SmaPositionOverlay(source, RSI_SHAPE_POSITION_OVERLAY_OPTIONS);
    const current = new SmaPositionOverlay(source, DEFAULT_POSITION_OVERLAY_OPTIONS);
    const target = archived.request("increase", 1, i);
    assert.equal(current.request("increase", 1, i), target); if (target > 0) entriesChecked++;
    const before = { ...current.checkpoint(), allocation: .3, previousCloseAllocation: .3, entryIndex: i - 1,
      entryClose: source[i].close / .95, flatStart: null };
    current.restore(before); archived.restore(before);
    assert.equal(current.close(i, false), archived.close(i, false));
    assert.deepEqual(current.checkpoint(), archived.checkpoint());
  }
  assert.ok(entriesChecked > 0);
});

test("a confirmed-close add gate blocks next-open adds without changing the signal day's holding", () => {
  const source = bars(), expected = gate(source), i = expected.findIndex(Boolean);
  const targets = source.map((_, index) => index < i - 2 ? 0 : index < i ? .3 : 1);
  const settings = { initialCash: 100000, commissionRate: 0, slippageRate: 0, interval: "1d" as const,
    startTime: source[i - 2].time, endTime: source[i + 2].time, executionPolicy: "next-open" as const };
  const archived = runAllocationBacktest(source, targets, { ...settings, positionOverlay: RSI_SHAPE_POSITION_OVERLAY_OPTIONS });
  const current = runAllocationBacktest(source, targets, { ...settings, positionOverlay: DEFAULT_POSITION_OVERLAY_OPTIONS });
  assert.ok(archived.rebalances.some((fill) => fill.time === source[i + 1].time && fill.targetAllocation > .3));
  assert.ok(!current.rebalances.some((fill) => fill.time === source[i + 1].time && fill.targetAllocation > .3));
  assert.deepEqual(current.rebalances.filter((fill) => fill.time <= source[i].time), archived.rebalances.filter((fill) => fill.time <= source[i].time));
});

test("localized current rule text states same-close scope and release explicitly", () => {
  const text = zhCN.positionOverlay.entryRules.join(" ");
  assert.match(text, /BIAS20/); assert.match(text, /当日禁止持仓加仓/); assert.match(text, /当日解除限制/);
  assert.match(zhCN.positionOverlay.executionNote, /不额外延迟一日/);
});
