import assert from "node:assert/strict";
import test from "node:test";
import { PendingExitOrigin, eventAction, summarizeShare, type ShareEvent } from "./signal-share-study";
import type { StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";

const sell: StrategyCycleRecentSignal = { direction: "reduce", targetAllocation: 0, signals: ["long-exit"] };
const buy: StrategyCycleRecentSignal = { direction: "increase", targetAllocation: 1, signals: ["long-entry"] };
test("partial target changes and no-ops are not entries or full liquidations", () => {
  assert.equal(eventAction(0, 0.4), "entry"); assert.equal(eventAction(0.4, 0), "liquidation");
  assert.equal(eventAction(0.4, 1), "partial-increase"); assert.equal(eventAction(1, 0.4), "partial-reduce");
  assert.equal(eventAction(0.4, 0.4), null);
});
test("first pending zero request survives repetitions and classifies delayed release causally", () => {
  const origin = new PendingExitOrigin(); origin.begin(20, 1, null, [sell]);
  assert.equal(origin.classify(20, false), "original-immediate"); origin.finish(0, false);
  origin.begin(23, 1, 0, [sell]); assert.equal(origin.index, 20);
  assert.equal(origin.classify(25, false), "original-deferred"); origin.finish(null, false); assert.equal(origin.index, null);
});
test("fresh increase cancels pending exit and a partial sell cannot fabricate liquidation origin", () => {
  const origin = new PendingExitOrigin(); origin.begin(20, 1, null, [sell]); origin.finish(0, false);
  origin.begin(21, 1, 0, [buy]); assert.equal(origin.index, null);
  origin.begin(22, 1, null, [{ ...sell, targetAllocation: 0.4 }]); assert.equal(origin.index, null);
  assert.throws(() => origin.classify(23, false));
});
test("conflicting hold does not create an exit request and hard stop takes priority", () => {
  const origin = new PendingExitOrigin(); origin.begin(20, 1, null, [sell, buy]); assert.equal(origin.index, null);
  origin.begin(21, 1, null, [sell]); assert.equal(origin.classify(21, true), "rule-stop");
  origin.finish(null, true); assert.equal(origin.index, null);
});
test("execution-window shares exclude boundary fabrication and use per-action denominators", () => {
  const events: ShareEvent[] = [
    { index: 10, time: "10", action: "entry", source: "original", before: 0, target: 1, originalDirection: "increase",
      hasOriginalSignal: true, zeroRequestIndex: null, delayBars: null },
    { index: 20, time: "20", action: "liquidation", source: "original-deferred", before: 1, target: 0,
      originalDirection: null, hasOriginalSignal: false, zeroRequestIndex: 15, delayBars: 5 },
  ];
  const window = summarizeShare(events, 16, 25);
  assert.equal(window.entries.total, 0); assert.equal(window.liquidations.total, 1);
  assert.equal(window.liquidations.sources[0]!.percent, 100); assert.deepEqual(window.deferredDelayBars, [5]);
});
