import assert from "node:assert/strict";
import test from "node:test";
import { replayContextDirections, type ContextCurves } from "../lib/analysis/market-context";
import { singleLineBreakEvents, multipleLineBreakEvents, eventOutcome, separatedEvents, comparePolicies, wilson } from "../research/nikkei-context-disagreement/study";
import type { MarketBar } from "../lib/market/types";

function fixture(departures = 1, flat = false) {
  const increments = [Array(6).fill(0), ...Array.from({ length: 3 }, () => Array(6).fill(1)),
    Array.from({ length: 6 }, (_, slot) => slot < departures ? flat ? 0 : -1 : 1),
    Array(6).fill(1), ...Array.from({ length: 4 }, () => Array(6).fill(-1))];
  const curves = Array.from({ length: 6 }, (_, slot) => {
    let total = 0;
    return increments.map((row) => total += row[slot]);
  });
  const context: ContextCurves = { bias: curves.slice(0, 3), slope: curves.slice(3) };
  const times = increments.map((_, index) => `2000-01-${String(index + 1).padStart(2, "0")}`);
  const bars: MarketBar[] = times.map((time, index) => ({ time, timestamp: Date.parse(time), open: 100 + index,
    close: 101 + index, high: 102 + index, low: 99 + index, volume: 1, amount: 0, amplitude: 0, change: 0, changePercent: 0, turnoverRate: 0 }));
  return { context, times, bars, states: replayContextDirections(times, context) };
}

test("single-line study selects only the first departure after a confirmed unanimous run", () => {
  const { context, times } = fixture();
  const events = singleLineBreakEvents(times, context);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], { index: 4, time: times[4], previousDirection: "up", previousStreak: 3, metric: "bias20", kind: "opposite" });
  assert.equal(singleLineBreakEvents(times, fixture(2).context).length, 0);
  assert.equal(singleLineBreakEvents(times, fixture(1, true).context)[0].kind, "flat");
  const prefix = singleLineBreakEvents(times.slice(0, 5), { bias: context.bias.map((row) => row.slice(0, 5)), slope: context.slope.map((row) => row.slice(0, 5)) });
  assert.deepEqual(prefix, events);
});

test("event outcomes distinguish daily restoration, three-day reversal, censoring and next-open returns", () => {
  const { context, times, bars, states } = fixture();
  const event = singleLineBreakEvents(times, context)[0];
  const one = eventOutcome(bars, states, event, 1)!;
  assert.equal(one.restored, true);
  assert.equal(one.reconfirmed, false);
  assert.equal(one.reversed, false);
  assert.equal(one.nextOpenReturn, (bars[5].close / bars[5].open - 1) * 100);
  const four = eventOutcome(bars, states, event, 4)!;
  assert.equal(four.reversed, true);
  assert.equal(four.reverseDays, 4);
  assert.equal(four.firstUnanimity, "restored");
  assert.equal(eventOutcome(bars, states, event, 20), null);
  assert.equal(separatedEvents([event, { ...event, index: 24 }, { ...event, index: 25 }], 20).length, 2);
  assert.deepEqual(wilson(0, 0), null);
  const interval = wilson(5, 10)!;
  assert.ok(interval[0] < 50 && interval[1] > 50);
});

test("early-exit comparison acts after the event close and resumes deterministically", () => {
  const { context, times, bars, states } = fixture();
  const events = singleLineBreakEvents(times, context);
  const result = comparePolicies(bars, states, events, 5);
  assert.equal(result[0].equity[4], result[1].equity[4]);
  assert.notEqual(result[0].equity[5], result[1].equity[5]);
  assert.deepEqual(result, comparePolicies(structuredClone(bars), structuredClone(states), structuredClone(events), 5));
  const prefix = comparePolicies(bars.slice(0, 6), states.slice(0, 6), events, 5);
  assert.deepEqual(prefix.map((policy) => policy.equity), result.map((policy) => policy.equity.slice(0, 6)));
});

test("multiple reversals separate the initial count from later first visits without duplicate episodes", () => {
  for (const count of [1, 2, 3, 4, 5, 6]) {
    const { context, times, states } = fixture(count);
    const events = multipleLineBreakEvents(times, context);
    const initial = events.filter((event) => event.mode === "initial");
    assert.equal(initial.length, 1);
    assert.equal(initial[0].reversed, count);
    assert.equal(initial[0].unchanged, 6 - count);
    assert.equal(initial[0].index, 4);
    assert.equal(events.filter((event) => event.mode === "stage-first" && event.reversed === count).length, 1);
    assert.equal(states[4].confirmed, "up");
    assert.equal(new Set(events.filter((event) => event.mode === "stage-first").map((event) => `${event.episode}:${event.reversed}`)).size,
      events.filter((event) => event.mode === "stage-first").length);
  }
  const flat = fixture(2, true);
  assert.equal(multipleLineBreakEvents(flat.times, flat.context)[0].flat, 2);
});
