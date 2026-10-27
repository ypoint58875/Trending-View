import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { FirstPullback, replayPullback } from "./rsi-first-pullback";
import type { MarketBar } from "../../lib/market/types";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";

test("strict crossing arms once, plateau does not consume, first fall consumes even above70", () => {
  const detector = new FirstPullback({ threshold: 70, trigger: "rsi-fall", scope: "market" });
  assert.equal(detector.next(70, 69, 100, 99, true), false);
  assert.equal(detector.next(73, 70, 101, 100, true), false);
  assert.equal(detector.next(73, 73, 101, 101, true), false);
  assert.equal(detector.next(72, 73, 100, 101, true), true);
  assert.equal(detector.next(71, 72, 99, 100, true), false);
  assert.equal(detector.next(69, 71, 98, 99, true), false);
  assert.equal(detector.next(71, 69, 101, 98, true), false);
  assert.equal(detector.next(68, 71, 99, 101, true), true);
});
test("cross-back waits through the first fall and accepts equality70", () => {
  const detector = new FirstPullback({ threshold: 70, trigger: "cross-back", scope: "market" });
  assert.equal(detector.next(74, 69, 101, 100, true), false);
  assert.equal(detector.next(73, 74, 100, 101, true), false);
  assert.equal(detector.next(70, 73, 99, 100, true), true);
  assert.equal(detector.next(69, 70, 98, 99, true), false);
});
test("flat market episodes consume while held scope requires a crossing during holdings", () => {
  for (const scope of ["market", "held"] as const) {
    const detector = new FirstPullback({ threshold: 70, trigger: "price-fall", scope });
    assert.equal(detector.next(74, 69, 101, 100, false), false);
    assert.equal(detector.next(73, 74, 100, 101, false), scope === "market");
    assert.equal(detector.next(72, 73, 99, 100, true), false);
  }
});
test("research replay is causal under completed prefixes", () => {
  const bars = Array.from({ length: 95 }, (_, index) => {
    const close = 100 + index * 0.3 + Math.sin(index / 4) * 8;
    return { time: new Date(Date.UTC(2024, 0, index + 1)).toISOString().slice(0, 10), open: close,
      close, high: close + 1, low: close - 1 } as MarketBar;
  });
  for (const priority of ["guarded", "no-signal-force", "risk-first"] as const) {
    const policy = { threshold: 70, trigger: "rsi-fall" as const, scope: "market" as const, priority };
    const full = replayPullback(bars, new Map(), 20, policy);
    for (let length = 25; length < bars.length; length += 1)
      assert.deepEqual(replayPullback(bars.slice(0, length), new Map(), 20, policy).targets, full.targets.slice(0, length));
  }
});
test("frozen v8 anchor, guarded parity and forced-exit isolation", () => {
  function load(path: string) {
    const file = new URL(path, import.meta.url); assert.ok(statSync(file).size <= 16 * 1024 ** 2);
    return JSON.parse(readFileSync(file, "utf8"));
  }
  const input = load("./data/full-screen-6-15/input.json") as { bars: MarketBar[] };
  const saved = load("./data/full-screen-6-15/signals.json") as {
    rows: { index: number; signals: StrategyCycleRecentSignal[] }[];
  };
  const decisions = new Map(saved.rows.map((row) => [row.index, row.signals])), start = input.bars.length - 2000;
  const baseline = replayPullback(input.bars, decisions, start);
  assert.equal(createHash("sha256").update(JSON.stringify(baseline.targets)).digest("hex"),
    "e3253ec7105fa8ce5959aad68f9e6da09ee9d4c417cfba51ef2f49d90849b7f5");
  const policy = { threshold: 70, trigger: "rsi-fall" as const, scope: "market" as const };
  const guarded = replayPullback(input.bars, decisions, start, { ...policy, priority: "guarded" });
  assert.equal(guarded.triggers, 57); assert.equal(guarded.events.length, 52);
  assert.equal(guarded.events.filter((event) => event.requested).length, 50);
  assert.deepEqual(guarded.targets, baseline.targets);
  for (const priority of ["no-signal-force", "risk-first"] as const) {
    const forced = replayPullback(input.bars, decisions, start, { ...policy, priority });
    const executions = forced.events.filter((event) => event.forced);
    assert.equal(executions.length, priority === "risk-first" ? 39 : 24);
    assert.ok(executions.every((event) => event.target === 0));
    if (priority === "no-signal-force") assert.ok(executions.every((event) => event.nativeSignals === 0));
    else assert.ok(executions.some((event) => event.nativeSignals > 0));
    const omitted = replayPullback(input.bars, decisions, start, { ...policy, priority }, new Set([executions[0]!.index]));
    assert.equal(omitted.triggers, forced.triggers);
    assert.ok(!omitted.events.some((event) => event.index === executions[0]!.index));
  }
});
