import assert from "node:assert/strict";
import test from "node:test";
import { branchReturn } from "./analyze";
import { runStrategyCycleCloseBacktest } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";

test("event branches conserve cash and match the shared execution ledger", () => {
  for (const inherited of [0, 0.5, 1]) for (const target of [0, 0.4, 1]) {
    const prices = [100, 100, 110];
    const bars = prices.map((price, index) => ({
      time: `2025-01-0${index + 1}`, timestamp: Date.UTC(2025, 0, index + 1),
      open: price, high: price, low: price, close: price, volume: 0,
      amount: 0, amplitude: 0, changePercent: 0, change: 0, turnoverRate: 0,
    })) satisfies MarketBar[];
    // Use one prior bar to establish the same inherited opening exposure for free.
    const result = runStrategyCycleCloseBacktest([
      { ...bars[0]!, time: "2024-12-31" }, ...bars,
    ], [inherited, inherited, target, target], {
      initialCash: 100_000, commissionRate: 0.0005, slippageRate: 0.0005,
      interval: "1d", startTime: bars[0]!.time,
    });
    assert.ok(Math.abs(result.totalReturn - branchReturn(inherited, target, 1.1, 0.0005)) < 1e-9);
  }
});
