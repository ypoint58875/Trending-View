import assert from "node:assert/strict";
import { test } from "node:test";
import { commonStateReplay } from "./regime-sizing-review";
import { SizingContext, sizingMenu, baselinePolicy } from "./regime-sizing";
import type { MarketBar } from "../../lib/market/types";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";

test("all321 forks share baseline history and preserve prefix causality", () => {
  const bars = Array.from({ length: 360 }, (_, index) => {
    const close = 100 + Math.sin(index * 0.4) * 6;
    return { time: new Date(Date.UTC(2020, 0, index + 1)).toISOString().slice(0, 10),
      open: close, close, high: close + 1, low: close - 1 } as MarketBar;
  });
  const decisions = new Map<number, StrategyCycleRecentSignal[]>([
    [285, [{ direction: "increase", targetAllocation: 0.6, signals: ["long-entry"] }]],
    [315, [{ direction: "reduce", targetAllocation: 0, signals: ["long-exit"] }]],
  ]);
  const full = new SizingContext(bars), prefix = new SizingContext(bars.slice(0, 333));
  const baseline = commonStateReplay(full, decisions, 280, 310, baselinePolicy, true);
  for (const policy of sizingMenu()) {
    const outcome = commonStateReplay(full, decisions, 280, 310, policy, true);
    const early = commonStateReplay(prefix, decisions, 280, 310, policy, true);
    assert.deepEqual(outcome.targets.slice(0, 310), baseline.targets.slice(0, 310));
    assert.deepEqual(outcome.daily.slice(0, 30), baseline.daily.slice(0, 30));
    assert.deepEqual(outcome.targets.slice(0, 333), early.targets);
    assert.deepEqual(outcome.daily.slice(0, 53), early.daily);
  }
});
