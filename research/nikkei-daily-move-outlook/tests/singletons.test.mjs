import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { runs, change, mean } from "../lib/core.mjs";
import { analyzeSingletons, classifyRun, durationCategory, singletonGroups, singletonGroup } from "../lib/singletons.mjs";
import { singletonView } from "../lib/singleton-report.mjs";
const root = new URL("../", import.meta.url), read = (p) => readFile(new URL(p, root), "utf8");
const hash = (s) => createHash("sha256").update(s).digest("hex");
const config = JSON.parse(await read("singleton-config.json"));
const result = JSON.parse(await read("output/singleton-results.json"));
const bars = (await read("data/processed/nikkei225-daily.csv")).trim().split(/\r?\n/).slice(1).map((l) => {
  const [date, open, high, low, close] = l.replaceAll('"', "").split(","); return { date, open: +open, high: +high, low: +low, close: +close };
});
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const analysis = analyzeSingletons(bars, config);

test("new run-study outputs, source modules and completion state have matching hashes", async () => {
  const text = await read("output/singleton-manifest.json"), manifest = JSON.parse(text);
  const state = JSON.parse(await read("data/state/singleton-completion.json"));
  assert.equal(state.manifestHash, hash(text));
  assert.equal(manifest.sourceHash, hash(await read("data/processed/nikkei225-daily.csv")));
  for (const [name, expected] of Object.entries({ ...manifest.artifacts, ...manifest.codeHashes })) assert.equal(hash(await read(name)), expected, name);
});

test("802 and 883 strict isolated sessions reconcile to the original completed run CSV", async () => {
  const old = (await read("output/completed-runs.csv")).trim().split(/\r?\n/).slice(1).map((l) => {
    const [direction, start, end, sessions, move, confirmed] = l.replaceAll('"', "").split(","); return { direction, start, end, sessions: +sessions, move: +move, confirmed };
  });
  const recomputed = runs(bars.filter((b) => b.date >= config.analysisStart)).completed;
  assert.deepEqual(recomputed, old);
  for (const [direction, count, total] of [["up", 802, 1675], ["down", 883, 1674]]) {
    const rows = analysis.rows.filter((r) => r.period === 7 && r.direction === direction && r.singleton);
    assert.equal(rows.length, count); assert.ok(rows.every((r) => r.strictSingleton));
    assert.equal(result.totals.find((r) => r.direction === direction).completedRuns, total);
  }
});

test("1, 2 and 3-plus day partitions are disjoint and exhaust completed up/down runs", () => {
  assert.equal(durationCategory(1), "one"); assert.equal(durationCategory(2), "two"); assert.equal(durationCategory(3), "long");
  for (const period of config.maPeriods) for (const direction of ["up", "down"]) {
    const rows = result.durations.filter((r) => r.period === period && r.direction === direction);
    assert.equal(rows.reduce((n, r) => n + r.n, 0), result.totals.find((r) => r.direction === direction).completedRuns);
    near(rows.reduce((n, r) => n + r.share, 0), 1);
  }
});

test("terciles are learned separately by direction/duration and classify exact boundaries", () => {
  for (const direction of ["up", "down"]) for (const duration of ["one", "two", "long"]) {
    const groups = analysis.groups.filter((g) => g.direction === direction && g.duration === duration);
    assert.equal(groups.length, 3);
    assert.equal(singletonGroup(groups[0].upper, direction, groups, duration), groups[1].id);
    const local = analysis.rows.filter((r) => r.period === 7 && r.direction === direction && r.duration === duration);
    assert.ok(local.every((r) => groups.some((g) => g.id === r.group)));
    const sizes = groups.map((g) => local.filter((r) => r.group === g.id).length);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
  }
});

test("countertrend, same-trend, delayed turns and transient turns have explicit separate labels", () => {
  assert.equal(classifyRun(-1, 1, [1, 1]).classification, "up_internal");
  assert.equal(classifyRun(-1, 1, [1, -1]).classification, "up_turn");
  assert.equal(classifyRun(1, -1, [-1, -1]).classification, "down_internal");
  assert.equal(classifyRun(1, -1, [1, 1]).classification, "down_turn");
  assert.equal(classifyRun(-1, 1, [-1, 1]).transient, true);
  assert.equal(classifyRun(1, 1, [1, -1]).classification, "with_trend");
  assert.equal(classifyRun(-1, 1, [0, 1]).classification, "neutral_or_unavailable");
});

test("each isolated day has the flanking opposite signs and correct next-day confirmation", () => {
  for (const row of analysis.rows.filter((r) => r.singleton)) {
    assert.equal(Math.sign(bars[row.endIndex].close - bars[row.endIndex - 1].close), row.sign);
    assert.equal(Math.sign(bars[row.endIndex - 1].close - bars[row.endIndex - 2].close), -row.sign);
    assert.equal(Math.sign(bars[row.confirmedIndex].close - bars[row.endIndex].close), -row.sign);
    assert.equal(row.confirmedIndex, row.endIndex + 1);
    near(row.movePct, change(bars[row.endIndex - 1].close, bars[row.endIndex].close));
  }
});

test("magnitude groups crossed with contexts reconcile exactly without dropping same-trend cases", () => {
  for (const row of result.amplitudes) {
    assert.equal(result.transitions.filter((s) => s.period === row.period && s.id === row.id).reduce((n, s) => n + s.n, 0), row.n);
    const direct = analysis.rows.filter((r) => r.period === row.period && r.group === row.id);
    near(row.meanPct, mean(direct.map((r) => r.movePct)));
  }
});

test("observed classifications and relative denominators are invariant under future extension", () => {
  const prefix = bars.filter((b) => b.date <= "2015-12-31"), lastDate = prefix.at(-1).date;
  const earlier = analyzeSingletons(prefix, config);
  for (const row of earlier.rows) {
    const extended = analysis.rows.find((r) => r.id === row.id);
    assert.equal(row.classification, extended.classification);
    assert.equal(row.firstFlipDate, extended.firstFlipDate);
    near(row.movePct, extended.movePct);
    assert.equal(row.relativeToObservedTrend, extended.relativeToObservedTrend);
    assert.ok(row.confirmed <= lastDate);
  }
});

test("future statistics begin after confirmation and respect actual endpoint availability", () => {
  for (const row of analysis.rows) {
    for (const [horizon, value, date] of [[1, row.future1Pct, row.future1Date], [row.period, row.futureNPct, row.futureNDate]]) {
      const end = bars[row.confirmedIndex + horizon];
      if (end) { assert.equal(date, end.date); near(value, change(bars[row.confirmedIndex].close, end.close)); }
      else { assert.equal(value, null); assert.equal(date, null); }
    }
    if (row.parentMoveAtAnchorPct <= 0) assert.equal(row.relativeToObservedTrend, null);
  }
});

test("parent interval daily counts reconcile, with old MA interval identities retained", () => {
  for (const parent of analysis.intervalRows) {
    assert.equal(parent.upDays + parent.downDays + parent.flatDays, parent.sessions);
    assert.equal(parent.id, `${parent.period}:${parent.startDate}`);
  }
  assert.ok(analysis.rows.every((r) => r.parentIntervalId));
});

test("every MA and duration report view contains valid counts and no unresolved values", async () => {
  const copy = JSON.parse(await read("singleton-copy.zh-CN.json"));
  for (const period of config.maPeriods) for (const duration of ["one", "two", "long"]) {
    const html = singletonView(result, copy, period, duration);
    assert.ok(html.includes(copy[duration])); assert.ok(html.includes(copy.up_turn));
    assert.ok(!/undefined|NaN/.test(html));
  }
});
