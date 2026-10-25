import test from "node:test";
import assert from "node:assert/strict";
import { features, forward, selectHistory, summarize, waves, runs, validateBars, bucket } from "../lib/core.mjs";

const bar = (i, close, extra = {}) => ({ date: new Date(Date.UTC(2000, 0, i + 1)).toISOString().slice(0, 10), open: close, high: close, low: close, close, ...extra });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);

test("positive/negative magnitude is conditional, with flat outcomes retained in the denominator", () => {
  const stats = summarize([2, -4, 0, 6]);
  assert.equal(stats.meanUp, 4); assert.equal(stats.meanDown, -4);
  assert.equal(stats.upProbability, 0.5); assert.equal(stats.flatProbability, 0.25);
  assert.equal(stats.mean, 1); assert.equal(summarize([]).mean, null);
});

test("forward excursions exclude the signal bar and separate close and next-open anchors", () => {
  const data = [bar(0, 100, { high: 900, low: 1 }), bar(1, 105, { open: 102, high: 110, low: 95 }), bar(2, 98, { high: 107, low: 94 })];
  const result = forward(data, 0, 2);
  near(result.terminal, -2); near(result.upside, 10); near(result.downside, -6);
  near(result.nextOpenReturn, (98 / 102 - 1) * 100);
  assert.equal(forward(data, 1, 2), null);
});

test("causal features do not change when future bars are appended", () => {
  const data = Array.from({ length: 100 }, (_, i) => bar(i, 100 + i));
  const prefix = features(data.slice(0, 85), [-1, 0, 1]);
  assert.deepEqual(features(data, [-1, 0, 1]).slice(0, 85), prefix);
  assert.equal(prefix.at(-1).regime, "up");
});

test("training outcomes end no later than the forecast origin and use a bounded lookback", () => {
  const fs = Array.from({ length: 200 }, (_, i) => ({ date: bar(i, 1).date, regime: i % 2 ? "up" : "down", bucket: i % 3 }));
  const config = { trainingSessions: 60, minimumSamples: 5, analysisStart: "2000-01-01" };
  for (const h of [1, 5, 20]) {
    const selected = selectHistory(fs, 150, h, config);
    assert.ok(selected.baseline.every((i) => i >= 90 && i + h <= 150));
    assert.equal(selected.baseline.at(-1), 150 - h);
    assert.ok(selected.indices.every((i) => fs[i].regime === fs[150].regime));
  }
});

test("sparse exact cells fall back explicitly, then to the unconditional distribution", () => {
  const fs = Array.from({ length: 200 }, (_, i) => ({ date: bar(i, 1).date, regime: "up", bucket: 0 }));
  fs[150].bucket = 7;
  const config = { trainingSessions: 60, minimumSamples: 10, analysisStart: "2000-01-01" };
  assert.equal(selectHistory(fs, 150, 5, config).level, "regime_only");
  fs[150].regime = "down";
  assert.equal(selectHistory(fs, 150, 5, config).level, "unconditional");
});

test("wave extrema are only finalized on a later threshold reversal", () => {
  const data = [100, 110, 108, 104, 98, 104].map((close, i) => bar(i, close));
  const before = waves(data.slice(0, 3), 5);
  assert.equal(before.completed.length, 0);
  const after = waves(data, 5);
  assert.equal(after.completed.length, 2);
  assert.equal(after.completed[0].end, data[1].date);
  assert.equal(after.completed[0].confirmed, data[3].date);
  assert.equal(after.completed[0].confirmationLag, 2);
  assert.equal(after.completed[1].direction, "down");
  assert.equal(after.current.direction, "up");
});

test("unfinished same-direction runs do not enter completed-run statistics", () => {
  const result = runs([100, 101, 103, 102, 101].map((close, i) => bar(i, close)));
  assert.equal(result.completed.length, 1); assert.equal(result.completed[0].sessions, 2);
  near(result.completed[0].move, 3);
  assert.equal(result.current.direction, "down");
});

test("missing prices, duplicate dates, invalid envelopes and unbounded rows fail validation", () => {
  assert.throws(() => validateBars([bar(0, 100, { close: null })]));
  assert.throws(() => validateBars([bar(0, 100), bar(0, 101)]));
  assert.throws(() => validateBars([bar(0, 100, { high: 90 })]));
  assert.throws(() => validateBars([bar(0, 100), bar(1, 101)], 1));
});

test("return bins include the lower boundary and exclude the upper boundary", () => {
  assert.equal(bucket(-3, [-3, -2, -1, 0, 1, 2, 3]), 1);
  assert.equal(bucket(0, [-3, -2, -1, 0, 1, 2, 3]), 4);
  assert.equal(bucket(3, [-3, -2, -1, 0, 1, 2, 3]), 7);
});
