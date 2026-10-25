import assert from "node:assert/strict";
import { test } from "node:test";
import { getStrategy } from "../../lib/analysis/strategies";
import { jointCandidates, jointDecisionTargets } from "./joint-cycles";
import type { MarketBar } from "../../lib/market/types";

test("all compact trend candidates are causal and do not learn a future winner library", () => {
  const bars = Array.from({ length: 280 }, (_, i) => {
    const close = 100 + Math.sin(i / 11) * 15 + i / 12;
    return { time: `day-${i}`, open: close - 0.2, high: close + 1, low: close - 1, close } as MarketBar;
  });
  for (const candidate of jointCandidates()) {
    const strategy = getStrategy(candidate.id);
    const full = strategy.buildTarget(bars, candidate.parameters);
    assert.deepEqual(full.slice(0, 237), strategy.buildTarget(bars.slice(0, 237), candidate.parameters), candidate.key);
  }
});
test("joint weights drive one decision and never become sleeve allocations", () => {
  const a = [0, 0, 0, 0, 0.3, 0.3], b = [1, 1, 1, 0, 0, 0], c = [1, 1, 0, 0, 0, 0], t = [1, 1, 1, 0, 0, 0];
  const r = jointDecisionTargets(a, b, c, t, 0, "weighted50");
  assert.deepEqual(r.scores, [50, 50, 30, 0, 15, 15]);
  assert.deepEqual(r.target, [1, 1, 1, 1, 0.3, 0.3]);
  assert.equal(r.target.includes(0.5), false);
  assert.deepEqual(jointDecisionTargets(a.slice(0, 4), b.slice(0, 4), c.slice(0, 4), t.slice(0, 4), 0, "weighted50").target, r.target.slice(0, 4));
});
