import test from "node:test";
import assert from "node:assert/strict";
import { movingAverageIntervals, intervalSummary, deriveThresholds, thresholdEvents, eventOutcome, thinOutcomes, summarizeOutcomes, analyzeThresholds } from "../lib/intervals.mjs";

const bars = (prices) => prices.map((close, i) => ({ date: new Date(Date.UTC(2015, 11, 20 + i)).toISOString().slice(0, 10), open: close, high: close, low: close, close }));
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
const config = { maPeriods: [3], analysisStart: "2015-01-01", calibrationEnd: "2015-12-31", evaluationStart: "2016-01-01", candidateQuantiles: [0.25, 0.5, 0.75], horizons: [1, 3], minimumDisplaySamples: 30 };

test("MA slope intervals have no magnitude threshold and can disagree with actual price direction", () => {
  const source = bars([90, 95, 100, 110, 99, 98, 97]);
  const result = movingAverageIntervals(source, 3), first = result.completed[0];
  assert.equal(first.direction, "up"); assert.equal(first.startIndex, 3); assert.equal(first.endIndex, 4);
  assert.equal(first.anchorClose, 100); assert.equal(first.confirmedDate, source[5].date);
  near(first.movePct, -1);
  const summary = intervalSummary(result.completed, 3).find((r) => r.direction === "up");
  assert.equal(summary.agreementProbability, 0); assert.equal(summary.alignedN, 0);
});

test("SMA slope labels match direct rolling means and stay invariant under future extension", () => {
  const source = bars([100, 102, 101, 106, 105, 99, 98, 100, 107, 102, 99]);
  const full = movingAverageIntervals(source, 3);
  for (const label of full.labels) {
    const i = label.index;
    const now = source.slice(i - 2, i + 1).reduce((s, b) => s + b.close, 0) / 3;
    const old = source.slice(i - 3, i).reduce((s, b) => s + b.close, 0) / 3;
    assert.equal(label.sign, Math.sign(now - old)); near(label.ma, now);
  }
  assert.deepEqual(movingAverageIntervals(source.slice(0, 8), 3).labels, full.labels.filter((r) => r.index < 8));
});

test("exactly flat MA intervals are retained separately", () => {
  const result = movingAverageIntervals(bars([100, 102, 100, 102, 100]), 2);
  assert.ok(result.labels.every((r) => r.direction === "flat"));
  assert.equal(result.current.direction, "flat"); assert.equal(result.current.sessions, 3);
  assert.equal(result.completed.length, 0);
});

test("first threshold crossing is unique and retains intervals with eventually opposite returns", () => {
  const source = bars([90, 95, 100, 110, 99, 98, 97]);
  const intervals = movingAverageIntervals(source, 3);
  const candidates = [{ period: 3, direction: "up", quantileRank: 0.5, thresholdPct: 5 }];
  const events = thresholdEvents(source, [...intervals.completed, intervals.current], candidates, config.analysisStart);
  assert.equal(events.length, 1); assert.equal(events[0].index, 3);
  near(events[0].reachedPct, 10); assert.equal(intervals.completed[0].movePct < 0, true);
});

test("threshold events already observed do not move or disappear after future bars arrive", () => {
  const source = bars([90, 95, 100, 110, 99, 98, 97, 96, 95, 97, 99, 110, 115, 114]);
  const candidates = ["up", "down"].map((direction) => ({ period: 3, direction, quantileRank: 0.5, thresholdPct: 2 }));
  const full = movingAverageIntervals(source, 3);
  const allEvents = thresholdEvents(source, [...full.completed, full.current], candidates, config.analysisStart);
  for (const length of [6, 8, 10, 12]) {
    const prefix = source.slice(0, length), sliced = movingAverageIntervals(prefix, 3);
    const before = thresholdEvents(prefix, [...sliced.completed, sliced.current], candidates, config.analysisStart);
    assert.deepEqual(before, allEvents.filter((e) => e.index < length));
  }
});

test("threshold quantiles use only direction-aligned intervals confirmed before the cutoff", () => {
  const intervals = [
    { period: 3, direction: "up", movePct: 1, startDate: "2015-01-01", confirmedDate: "2015-01-10" },
    { period: 3, direction: "up", movePct: 3, startDate: "2015-02-01", confirmedDate: "2015-02-10" },
    { period: 3, direction: "up", movePct: -9, startDate: "2015-03-01", confirmedDate: "2015-03-10" },
    { period: 3, direction: "up", movePct: 100, startDate: "2015-12-01", confirmedDate: "2016-01-01" },
    { period: 3, direction: "down", movePct: -2, startDate: "2015-01-01", confirmedDate: "2015-01-20" }
  ];
  const values = deriveThresholds(intervals, config);
  assert.equal(values.find((r) => r.direction === "up" && r.quantileRank === 0.5).thresholdPct, 2);
  assert.equal(values[0].calibrationN, 2);
  const extended = deriveThresholds([...intervals, { period: 3, direction: "down", movePct: -99, startDate: "2016-01-01", confirmedDate: "2016-02-01" }], config);
  assert.deepEqual(extended, values);
});

test("upward and downward triggers measure opposite terminal moves with the correct sign and anchor", () => {
  const source = bars([100, 110, 90]);
  const up = eventOutcome(source, { index: 0, close: 100, direction: "up" }, 2);
  const down = eventOutcome(source, { index: 0, close: 100, direction: "down" }, 2);
  near(up.terminalPct, -10); near(up.counterPct, 10); near(down.counterPct, -10);
  near(up.counterMaxPct, 10); near(up.adverseMaxPct, 10);
  assert.equal(eventOutcome(source, { index: 1, close: 110, direction: "up" }, 2), null);
  assert.equal(eventOutcome(source, { index: 0, close: 100, direction: "up" }, 2, source[1].date), null);
});

test("flat terminal outcomes stay in the probability denominator and sparse empty outcomes stay null", () => {
  const value = summarizeOutcomes([
    { counterPct: 2, terminalPct: 2, counterMaxPct: 3, adverseMaxPct: 1 },
    { counterPct: -4, terminalPct: -4, counterMaxPct: 0, adverseMaxPct: 5 },
    { counterPct: 0, terminalPct: 0, counterMaxPct: 1, adverseMaxPct: 1 }
  ]);
  near(value.counterProbability, 1 / 3); near(value.continuationProbability, 1 / 3); near(value.flatProbability, 1 / 3);
  assert.equal(value.counterMeanWhenOccursPct, 2); assert.equal(value.continuationMeanWhenOccursPct, 4);
  assert.equal(summarizeOutcomes([]).counterProbability, null);
});

test("non-overlapping sensitivity spaces event origins by at least the full horizon", () => {
  const result = thinOutcomes([0, 1, 3, 5, 6, 10].map((index) => ({ index })), 5);
  assert.deepEqual(result.map((r) => r.index), [0, 5, 10]);
});

test("calibration outcomes cannot cross the cutoff and unfinished follow-up remains censored", () => {
  const source = bars(Array.from({ length: 17 }, (_, i) => 100 + i));
  const candidate = { period: 3, direction: "down", quantileRank: 0.5, thresholdPct: 1 };
  const event = { ...candidate, index: 10, date: source[10].date, close: source[10].close };
  const { summaries } = analyzeThresholds(source, [event], [candidate], config);
  const early = summaries.find((r) => r.sample === "calibration" && r.horizon === 3);
  assert.equal(early.n, 0); assert.equal(early.censoredN, 1);
  const all = summaries.find((r) => r.sample === "all" && r.horizon === 3);
  assert.equal(all.n, 1); assert.equal(all.counterProbability, 1);
});
