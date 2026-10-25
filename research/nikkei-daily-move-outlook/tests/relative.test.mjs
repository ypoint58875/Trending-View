import test from "node:test";
import assert from "node:assert/strict";
import { movingAverageIntervals } from "../lib/intervals.mjs";
import { adjacentPairs, amplitudeBucket, fitRelativeCandidates, relativeCrossings, summarizeRelativeCrossings, ratioPrice } from "../lib/relative-intervals.mjs";
import { signalSchedule, simulateRelativeExits } from "../lib/relative-exits.mjs";

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const source = (xs) => xs.map((close, i) => ({ date: new Date(Date.UTC(2020, 0, i + 1)).toISOString().slice(0, 10), open: close, high: close + 1, low: close - 1, close }));
const bins = [{ id: "0+", lower: 0, upper: null }];
const candidates = (entry = 0.2, exit = 0.5) => [
  { period: 3, direction: "up", bucket: "0+", quantileRank: 0.5, ratio: entry },
  { period: 3, direction: "down", bucket: "0+", quantileRank: 0.5, ratio: exit }
];

test("percentage-return ratios are distinct from point retracements", () => {
  near(ratioPrice(100, 105, 0.4), 102.9);
  near(ratioPrice(100, 105, 0.4, "points"), 103);
  near(ratioPrice(100, 95, 0.4), 96.9);
  assert.throws(() => ratioPrice(100, 100, 0.4));
  assert.throws(() => ratioPrice(100, 105, 0.4, "unknown"));
  assert.throws(() => ratioPrice(100, 200, 2));
});

test("previous amplitude groups are lower-inclusive and upper-exclusive", () => {
  const ranges = [{ id: "small", lower: 0, upper: 5 }, { id: "5-10", lower: 5, upper: 10 }, { id: "large", lower: 10, upper: null }];
  assert.equal(amplitudeBucket(4.99, ranges), "small");
  assert.equal(amplitudeBucket(5, ranges), "5-10");
  assert.equal(amplitudeBucket(10, ranges), "large");
});

test("adjacent pairing keeps an unsuccessful next interval and rejects an invalid previous denominator", () => {
  const previous = { id: "a", sign: 1, direction: "up", startDate: "2020-01-01", endDate: "2020-01-05", confirmedDate: "2020-01-06", startIndex: 1, endIndex: 5, anchorDate: "2019-12-31", anchorClose: 100, endClose: 105, movePct: 5 };
  const current = { id: "b", sign: -1, direction: "down", startDate: "2020-01-06", endDate: "2020-01-07", confirmedDate: "2020-01-08", startIndex: 6, endIndex: 7, anchorDate: previous.endDate, anchorClose: 105, endClose: 106, movePct: (106 / 105 - 1) * 100, maxRisePct: 1, maxFallPct: -1, status: "completed" };
  const result = adjacentPairs({ period: 3, completed: [previous, current], current: null }, "2020-01-01");
  assert.equal(result.pairs.length, 1); assert.ok(result.pairs[0].finalRatio < 0);
  assert.equal(adjacentPairs({ period: 3, completed: [{ ...previous, movePct: 0 }, current] }, "2020-01-01").excluded[0].reason, "zero_previous_amplitude");
});

test("bucket candidate fitting excludes future completed pairs and discloses sparse pooling", () => {
  const rows = ["up", "down"].flatMap((direction) => [1, 2, 3, 4].map((value) => ({ period: 3, direction, startDate: "2000-01-01", confirmedDate: "2001-01-01", scalePct: value < 3 ? 2 : 6, maxRatio: value })));
  const config = { maPeriods: [3], analysisStart: "2000-01-01", trainingEnd: "2009-12-31", ratioQuantiles: [0.5], minimumBucketTrainingPairs: 3, previousAmplitudeBins: [{ id: "small", lower: 0, upper: 5 }, { id: "5-10", lower: 5, upper: 10 }] };
  const before = fitRelativeCandidates(rows, config);
  assert.equal(before.find((r) => r.bucket === "5-10").fallbackToPooled, true);
  assert.equal(before.find((r) => r.bucket === "5-10").ratio, 2.5);
  assert.deepEqual(fitRelativeCandidates([...rows, { ...rows[0], maxRatio: 1000, confirmedDate: "2010-01-01" }], config), before);
});

test("threshold event occurs once and only after it has actually crossed", () => {
  const bars = source([100, 110, 105, 102, 101]);
  const pair = { period: 3, pairId: "p", direction: "down", sign: -1, startIndex: 2, endIndex: 4,
    anchorClose: 110, previousMovePct: 10, scalePct: 10, previousEndClose: 110, previousAnchorClose: 100,
    status: "completed", endClose: 101, endDate: bars[4].date, confirmedDate: "2020-01-06", finalRatio: 0.818 };
  const result = relativeCrossings(bars, [pair], [candidates()[1]], bins);
  assert.equal(result.length, 1); assert.equal(result[0].triggerIndex, 3);
  assert.ok(result[0].observedRatio > result[0].ratio);
});

test("unfinished and trigger-at-end outcomes do not masquerade as certain trend continuation", () => {
  const result = summarizeRelativeCrossings([
    { pairStatus: "completed", remainingPct: 0, remainingSessions: 0, observedRatio: 0.6, furtherMaxPct: 0, adverseMaxPct: 0 },
    { pairStatus: "completed", remainingPct: 2, remainingSessions: 2, observedRatio: 0.7, furtherMaxPct: 3, adverseMaxPct: 1 },
    { pairStatus: "unfinished", remainingPct: 99 }
  ]);
  assert.equal(result.n, 2); assert.equal(result.unfinishedN, 1);
  assert.equal(result.continuedProbability, 0.5); assert.equal(result.endedOnTriggerN, 1);
});

test("threshold confirmation drives entry, and exit fills the next actual open after a gap", () => {
  const bars = source([100, 110, 105, 102, 101]); bars[4].open = 98;
  const pairs = [
    { period: 3, direction: "up", sign: 1, startIndex: 0, endIndex: 1, startDate: bars[0].date, anchorClose: 100, scalePct: 10 },
    { period: 3, direction: "down", sign: -1, startIndex: 2, endIndex: 4, startDate: bars[2].date, anchorClose: 110, scalePct: 10 }
  ];
  const dataset = { period: 3, completed: [], labels: bars.map((b, index) => ({ index, sign: index < 2 ? 1 : -1 })) };
  const rule = { mode: "relative", entryQuantile: 0.5, exitQuantile: 0.5, candidates: candidates() };
  const schedule = signalSchedule(bars, pairs, rule, bins);
  assert.equal(schedule.entries.get(2).triggerIndex, 1);
  near(schedule.exits.get(3).line, 104.5);
  const run = simulateRelativeExits(bars, dataset, pairs, { start: bars[0].date, end: bars.at(-1).date }, rule, 5, bins);
  assert.equal(run.trades.length, 1); assert.equal(run.trades[0].entryIndex, 2); assert.equal(run.trades[0].exitIndex, 4);
  assert.equal(run.trades[0].exitPrice, 98); near(run.trades[0].netReturnPct, (98 / 105 * 0.9995 ** 2 - 1) * 100);
  const absent = signalSchedule(bars, pairs, { ...rule, candidates: candidates(2, 0.5) }, bins);
  assert.equal(absent.entries.size, 0);
});

test("future source extension cannot revise closed trades or earlier equity values", () => {
  const bars = source(Array.from({ length: 150 }, (_, i) => 100 + i * 0.05 + 8 * Math.sin(i / 4)));
  const execute = (input) => {
    const dataset = movingAverageIntervals(input, 3), pairs = adjacentPairs(dataset, input[0].date).pairs;
    return simulateRelativeExits(input, dataset, pairs, { start: input[0].date, end: input.at(-1).date },
      { mode: "relative", entryQuantile: 0.5, exitQuantile: 0.5, candidates: candidates() }, 5, bins);
  };
  const full = execute(bars); assert.ok(full.trades.length > 2);
  for (const count of [50, 90, 120]) {
    const prefix = execute(bars.slice(0, count));
    assert.deepEqual(prefix.trades, full.trades.filter((t) => t.exitIndex < count));
    assert.deepEqual(prefix.equity, full.equity.slice(0, count));
  }
});

test("a last-bar close signal remains pending instead of receiving an invented fill", () => {
  const bars = source([100, 110, 105, 102]);
  const pairs = [
    { period: 3, direction: "up", sign: 1, startIndex: 0, endIndex: 1, startDate: bars[0].date, anchorClose: 100, scalePct: 10 },
    { period: 3, direction: "down", sign: -1, startIndex: 2, endIndex: 3, startDate: bars[2].date, anchorClose: 110, scalePct: 10 }
  ];
  const dataset = { period: 3, completed: [], labels: bars.map((b, index) => ({ index, sign: index < 2 ? 1 : -1 })) };
  const run = simulateRelativeExits(bars, dataset, pairs, { start: bars[0].date, end: bars.at(-1).date },
    { mode: "relative", entryQuantile: 0.5, exitQuantile: 0.5, candidates: candidates() }, 5, bins);
  assert.equal(run.trades.length, 0); assert.equal(run.metrics.openPosition.pendingExit, "relative_turn_exit");
});
