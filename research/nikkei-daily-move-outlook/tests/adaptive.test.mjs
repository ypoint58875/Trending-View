import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { movingAverageIntervals } from "../lib/intervals.mjs";
import { adjacentPairs, amplitudeBucket } from "../lib/relative-intervals.mjs";
import { signalSchedule } from "../lib/relative-exits.mjs";
import { learnPartitions, fitAdaptiveCandidates, buyAndHold, annualComparison, optimizeAdaptiveFamilies } from "../lib/adaptive-thresholds.mjs";
import { adaptiveView } from "../lib/adaptive-report.mjs";

const root = new URL("../", import.meta.url);
const read = (name) => readFile(new URL(name, root), "utf8");
const sha = (text) => createHash("sha256").update(text).digest("hex");
const config = JSON.parse(await read("adaptive-config.json"));
const result = JSON.parse(await read("output/adaptive-results.json"));
const bars = (await read("data/processed/nikkei225-daily.csv")).trim().split(/\r?\n/).slice(1).map((line) => {
  const [date, open, high, low, close] = line.replaceAll('"', "").split(",");
  return { date, open: +open, high: +high, low: +low, close: +close };
});
const pairs = config.maPeriods.flatMap((period) => adjacentPairs(movingAverageIntervals(bars, period), config.analysisStart).pairs);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("adaptive output completion and every artifact match exact source/config hashes", async () => {
  const manifestText = await read("output/adaptive-manifest.json"), manifest = JSON.parse(manifestText);
  const state = JSON.parse(await read("data/state/adaptive-completion.json"));
  assert.equal(manifest.status, "complete");
  assert.equal(state.manifestHash, sha(manifestText));
  assert.equal(manifest.sourceDataHash, sha(await read("data/processed/nikkei225-daily.csv")));
  assert.equal(manifest.configHash, sha(await read("adaptive-config.json")));
  for (const [name, hash] of Object.entries(manifest.artifacts)) assert.equal(sha(await read(name)), hash, name);
  for (const [name, hash] of Object.entries(manifest.codeHashes)) assert.equal(sha(await read(name)), hash, name);
});

test("adaptive groups are independently learned by MA/direction and keep minimum training counts", () => {
  const partitions = learnPartitions(pairs, config);
  assert.deepEqual(partitions, result.partitions);
  assert.equal(partitions.filter((b) => b.period === 7 && b.direction === "up").length, 4);
  assert.equal(partitions.filter((b) => b.period === 20 && b.direction === "up").length, 3);
  for (const b of partitions) assert.ok(b.trainingN >= config.minimumGroupTrainingPairs);
  assert.notEqual(partitions[0].upper, partitions.find((b) => b.direction === "down").upper);
  assert.deepEqual(learnPartitions(pairs.filter((p) => p.startDate <= config.trainingEnd), config), partitions);
});

test("ties reduce group count instead of producing empty or tiny partitions", () => {
  const localConfig = { maPeriods: [2], analysisStart: "2000-01-01", trainingEnd: "2009-12-31", maximumGroups: 4, minimumGroupTrainingPairs: 2 };
  const rows = ["up", "down"].flatMap((direction) => Array.from({ length: 10 }, () => ({ period: 2, direction, startDate: "2001-01-01", scalePct: 1 })));
  const bins = learnPartitions(rows, localConfig);
  assert.equal(bins.length, 2); assert.ok(bins.every((b) => b.trainingN === 10 && b.upper === null));
});

test("future amplitudes and unfinished outcomes cannot change fitted candidates", () => {
  const before = fitAdaptiveCandidates(pairs, result.partitions, config);
  const poisoned = pairs.map((p) => p.confirmedDate && p.confirmedDate <= config.trainingEnd ? p : { ...p, maxRatio: 1e8 });
  assert.deepEqual(fitAdaptiveCandidates(poisoned, result.partitions, config), before);
  assert.deepEqual(before, result.candidates);
});

test("direction-specific partition edges and per-group quantiles drive observable first crossings", () => {
  const prices = [100, 104, 108];
  const source = prices.map((close, i) => ({ date: `2020-01-0${i + 1}`, close, open: close }));
  const pair = { period: 2, direction: "up", sign: 1, scalePct: 5, anchorClose: 100, startIndex: 1, endIndex: 2 };
  const candidates = [{ period: 2, direction: "up", bucket: "u", quantileRank: .25, ratio: .5 },
    { period: 2, direction: "up", bucket: "u", quantileRank: .75, ratio: 1.5 }];
  const rule = { mode: "relative", entryQuantile: .25, quantilesByBucket: { u: .75 }, candidates,
    binsByDirection: { up: [{ id: "u", lower: 0, upper: null }], down: [{ id: "d", lower: 0, upper: null }] } };
  const schedule = signalSchedule(source, [pair], rule, []);
  assert.equal(schedule.entries.size, 1); assert.equal(schedule.entries.get(3).triggerIndex, 2);
  near(schedule.entries.get(3).ratio, 1.5);
});

test("buy-and-hold enters at first actual open with one cost and terminal close marking", () => {
  const rows = [{ date: "2020-01-01", open: 100, close: 110 }, { date: "2021-01-01", open: 115, close: 120 }];
  const run = buyAndHold(rows, { start: "2020-01-01", end: "2021-01-01" }, 10);
  near(run.equity[0].value, 1.0989); near(run.equity[1].value, 1.1988);
  near(run.metrics.totalReturnPct, 19.88);
  assert.equal(run.metrics.windowStart, "2020-01-01");
});

test("small-reference exclusion suppresses both sides and includes the exact learned floor", () => {
  const source = [{ close: 100 }, { close: 90 }, { close: 110 }];
  const pair = { period: 2, direction: "up", sign: 1, scalePct: .5, anchorClose: 90, startIndex: 2, endIndex: 2 };
  const bins = [{ id: "b", lower: 0, upper: null }];
  const candidate = { period: 2, direction: "up", bucket: "b", quantileRank: .1, ratio: .1 };
  const rule = { mode: "relative", entryQuantile: .1, candidates: [candidate], minimumReferenceByDirection: { up: 1, down: 1 } };
  assert.equal(signalSchedule(source, [pair], rule, bins).entries.size, 0);
  assert.equal(signalSchedule(source, [{ ...pair, scalePct: 1 }], rule, bins).entries.size, 1);
  const down = { ...pair, direction: "down", sign: -1, anchorClose: 120 };
  assert.equal(signalSchedule(source, [down], { ...rule, candidates: [{ ...candidate, direction: "down" }] }, bins).exits.size, 0);
});

test("exclusion-family choice uses validation return and publishes unsuccessful alternatives", () => {
  for (const p of result.policies) {
    near(p.validation.cagrPct, Math.max(...p.filteringComparisons.filter((r) => r.validation).map((r) => r.validation.cagrPct)));
    assert.deepEqual(p.filteringComparisons.map((r) => r.excludedGroups), config.excludeSmallestGroups);
    assert.equal(p.filteringComparisons.filter((r) => r.selected).length, 1);
    for (const t of p.thresholds) {
      const bin = result.partitions.find((b) => b.id === t.bucket);
      assert.ok(bin.lower >= p.minimumReferenceByDirection[t.direction]);
    }
  }
});

test("annual account slices compound to the complete continuous account return", () => {
  const p = result.policies[0];
  const rows = [{ date: "2020-12-31", value: 1.1 }, { date: "2021-01-04", value: 1.2 }, { date: "2021-12-31", value: 1.3 }];
  const baseline = rows.map((r) => ({ ...r, value: r.value * 1.01 }));
  const years = annualComparison(rows, baseline);
  near(years.reduce((v, r) => v * (1 + r.strategyPct / 100), 1), 1.3);
  near(p.annual.reduce((v, r) => v * (1 + r.strategyPct / 100), 1), 1 + p.evaluation.totalReturnPct / 100);
});

test("frozen schedules maximize eligible visited validation returns without evaluation ranking", async () => {
  const grid = JSON.parse(await read("output/adaptive-validation-search.json"));
  for (const p of result.policies) {
    const eligible = grid.filter((r) => r.period === p.period && r.eligible);
    near(p.validation.cagrPct, Math.max(...eligible.map((r) => r.cagrPct)));
    assert.ok(eligible.every((r) => r.windowEnd <= config.validationEnd));
    for (const t of p.thresholds) assert.equal(p.validation.schedule[t.bucket], t.quantileRank);
  }
});

test("future extension cannot change partitioning, fitting, or validation-selected group schedules", () => {
  const prefix = bars.filter((b) => b.date <= "2016-12-31");
  const localPairs = config.maPeriods.flatMap((period) => adjacentPairs(movingAverageIntervals(prefix, period), config.analysisStart).pairs);
  const bins = learnPartitions(localPairs, config), candidates = fitAdaptiveCandidates(localPairs, bins, config);
  for (const period of config.maPeriods) {
    const run = optimizeAdaptiveFamilies(prefix, movingAverageIntervals(prefix, period), localPairs, bins, candidates, config, result.statistics);
    assert.deepEqual(run.validation.schedule, result.policies.find((p) => p.period === period).validation.schedule);
  }
});

test("selected prediction frequencies include flat outcomes and exclude unfinished/cross-boundary ends", async () => {
  const rows = JSON.parse(await read("output/adaptive-results.json"));
  for (const s of rows.statistics) {
    if (s.n) near(s.continuedProbability + s.reversedProbability + s.zeroRemainingProbability, 1);
    assert.ok(s.n <= s.matureOpportunities); assert.ok(s.endedOnTriggerN <= s.n);
    assert.ok(s.n || s.continuedProbability === null);
  }
});

test("accuracy-first alternatives select only adequately supported validation events or disclose fallback", () => {
  for (const policy of result.policies) for (const group of policy.accuracyPolicy.groups) {
    const eligible = result.statistics.filter((s) => s.bucket === group.bucket && s.sample === "validation" && s.n >= config.minimumValidationPredictionEvents);
    assert.equal(group.supported, !!eligible.length);
    if (eligible.length) near(group.validationProbability, Math.max(...eligible.map((r) => r.continuedProbability)));
    else assert.equal(group.quantileRank, config.ratioQuantiles[0]);
  }
});

test("actual fills, fees, compounded closed trades and marked positions tie to reported returns", async () => {
  const lines = (await read("output/adaptive-trades.csv")).trim().split(/\r?\n/).map((l) => l.replaceAll('"', "").split(","));
  const headers = lines.shift(); const trades = lines.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
  for (const policy of result.policies) {
    const local = trades.filter((t) => +t.period === policy.period);
    let value = 1;
    for (const t of local) {
      assert.equal(bars[+t.entryIndex].open, +t.entryPrice); assert.equal(bars[+t.exitIndex].open, +t.exitPrice);
      assert.equal(bars[+t.entryIndex - 1].date, t.entrySignalDate); assert.equal(bars[+t.exitIndex - 1].date, t.exitSignalDate);
      near(+t.netReturnPct, ((+t.exitPrice / +t.entryPrice) * .9995 ** 2 - 1) * 100);
      value *= 1 + +t.netReturnPct / 100;
    }
    if (policy.evaluation.openPosition) value *= .9995 * policy.evaluation.openPosition.markedClose / policy.evaluation.openPosition.entryPrice;
    near((value - 1) * 100, policy.evaluation.totalReturnPct);
  }
});

test("partition boundaries are exhaustive and exact edge values enter the upper group", () => {
  for (const period of config.maPeriods) for (const direction of ["up", "down"]) {
    const bins = result.partitions.filter((b) => b.period === period && b.direction === direction);
    assert.equal(bins[0].lower, 0); assert.equal(bins.at(-1).upper, null);
    for (let i = 1; i < bins.length; i++) {
      assert.equal(bins[i - 1].upper, bins[i].lower);
      assert.equal(amplitudeBucket(bins[i].lower, bins), bins[i].id);
    }
  }
});

test("report displays data-led groups, buy-and-hold failure, rare triggers and both objectives", async () => {
  const copy = JSON.parse(await read("adaptive-copy.zh-CN.json"));
  for (const period of config.maPeriods) for (const sample of ["training", "validation", "evaluation"]) {
    const html = adaptiveView(result, copy, period, sample);
    assert.ok(html.includes(copy.failed)); assert.ok(html.includes(copy.hold));
    assert.ok(html.includes(copy.ratioWarning)); assert.ok(html.includes(copy.accuracyPolicy));
    assert.ok(!html.includes("undefined")); assert.ok(!html.includes("NaN"));
  }
});
