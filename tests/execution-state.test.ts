import assert from "node:assert/strict";
import test from "node:test";
import { runAllocationBacktest, runBacktest } from "../lib/analysis/backtest";
import { buildTradeMarkers } from "../lib/analysis/trade-markers";
import { resolveLatestDailyBarStatus } from "../lib/market/session";
import type { MarketBar } from "../lib/market/types";

function makeBars(opens: number[], closes: number[]): MarketBar[] {
  return closes.map((close, index) => {
    const timestamp = Date.UTC(2026, 0, index + 1);
    return {
      time: new Date(timestamp).toISOString().slice(0, 10), timestamp,
      open: opens[index], close, high: Math.max(opens[index], close) + 1,
      low: Math.min(opens[index], close) - 1,
      volume: 1000, amount: 0, amplitude: 0, change: 0, changePercent: 0, turnoverRate: 0,
    };
  });
}
const settings = {
  initialCash: 10000, commissionRate: 0, slippageRate: 0,
  interval: "1d" as const, executionPolicy: "hybrid" as const,
};

test("executed holdings follow chart fills rather than a pending newest-close target", () => {
  const history = makeBars([10, 9.8, 10, 11.5, 11.5, 9.5], [10, 9, 11, 12, 10, 9]);
  const run = (length: number) => runBacktest(history.slice(0, length), "tv-bar-up-down", { minimumBodyPercent: 0 }, settings);
  const pendingBuy = run(3);
  assert.equal(pendingBuy.executedAllocation, 0);
  assert.equal(buildTradeMarkers(pendingBuy.trades, pendingBuy.openPosition).buys.length, 0);
  const bought = run(4);
  assert.equal(bought.executedAllocation, 1);
  assert.equal(buildTradeMarkers(bought.trades, bought.openPosition).buys.at(-1)?.time, history[3].time);
  const pendingSell = run(5);
  assert.equal(pendingSell.executedAllocation, 1);
  assert.equal(buildTradeMarkers(pendingSell.trades, pendingSell.openPosition).sells.length, 0);
  const sold = run(6);
  assert.equal(sold.executedAllocation, 0);
  assert.equal(buildTradeMarkers(sold.trades, sold.openPosition).sells.at(-1)?.time, history[5].time);
});

test("inherited exposure remains held without inventing an entry inside the selected range", () => {
  const history = makeBars(Array.from({ length: 8 }, (_, i) => 10 + i), Array.from({ length: 8 }, (_, i) => 10.5 + i));
  const result = runBacktest(history, "tv-bar-up-down", { minimumBodyPercent: 0 }, { ...settings, startTime: history[5].time });
  assert.equal(result.executedAllocation, 1);
  assert.equal(result.openPosition, null);
  assert.equal(result.trades.length, 0);
});

test("allocation reports distinguish pending close targets from already filled intrabar changes", () => {
  const history = makeBars([10, 10, 10], [10, 10, 10]);
  const pending = runAllocationBacktest(history, [0, 0, 1], settings);
  assert.equal(pending.executedAllocation, 0);
  assert.equal(pending.rebalances.length, 0);
  const filled = runAllocationBacktest(history, [0, 0, 0.6], settings, undefined, [[], [], [{ targetAllocation: 0.6, fillPrice: 10, signals: ["long-entry"] }]]);
  assert.equal(filled.executedAllocation, 0.6);
  assert.equal(filled.rebalances.at(-1)?.targetAllocation, 0.6);
});

test("daily completion uses venue-local date and close across Shanghai midnight", () => {
  assert.equal(resolveLatestDailyBarStatus("2026-10-16", "JPX", new Date("2026-10-16T14:29:59+08:00")), "in-progress");
  assert.equal(resolveLatestDailyBarStatus("2026-10-16", "JPX", new Date("2026-10-16T14:30:00+08:00")), "complete");
  assert.equal(resolveLatestDailyBarStatus("2026-10-16", "SSE", new Date("2026-10-16T14:59:59+08:00")), "in-progress");
  assert.equal(resolveLatestDailyBarStatus("2026-10-16", "SSE", new Date("2026-10-16T15:00:00+08:00")), "complete");
  assert.equal(resolveLatestDailyBarStatus("2026-10-16", "NASDAQ", new Date("2026-10-16T15:59:59-04:00")), "in-progress");
  assert.equal(resolveLatestDailyBarStatus("2026-10-16", "NASDAQ", new Date("2026-10-16T16:00:00-04:00")), "complete");
});
