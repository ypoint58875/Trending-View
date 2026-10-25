import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { movingAverageIntervals, deriveThresholds, thresholdEvents, eventOutcome } from "../lib/intervals.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFile(path.join(root, name), "utf8");
const hash = (text) => createHash("sha256").update(text).digest("hex");
const manifest = JSON.parse(await read("output/ma-interval-manifest.json"));
const parse = (text) => {
  const lines = text.trim().split(/\r?\n/).map((line) => line.split(",").map((cell) => cell.replace(/^"|"$/g, "")));
  return lines.slice(1).map((cells) => Object.fromEntries(lines[0].map((key, i) => [key, cells[i]])));
};
const prices = parse(await read("data/processed/nikkei225-daily.csv")).map((r) => ({ ...r, close: Number(r.close), open: Number(r.open) }));
const intervals = manifest.config.maPeriods.map((p) => movingAverageIntervals(prices, p));

test("MA interval artifacts and completion state match their source and manifest hashes", async () => {
  for (const [file, digest] of Object.entries(manifest.artifactHashes)) assert.equal(hash(await read(file)), digest, file);
  assert.equal(hash(await read("data/processed/nikkei225-daily.csv")), manifest.sourceDataHash);
  assert.equal(hash(await read("output/run-manifest.json")), manifest.sourceRunManifestHash);
  const completion = JSON.parse(await read("data/state/ma-interval-completion.json"));
  assert.equal(completion.manifestHash, hash(await read("output/ma-interval-manifest.json")));
});

test("actual threshold table is reproducible from completed pre-cutoff intervals alone", async () => {
  const expected = deriveThresholds(intervals.flatMap((r) => r.completed), manifest.config);
  const actual = parse(await read("output/ma-interval-thresholds.csv"));
  assert.equal(actual.length, expected.length);
  expected.forEach((r, i) => assert.ok(Math.abs(r.thresholdPct - Number(actual[i].thresholdPct)) < 1e-12));
});

test("every recorded actual crossing is the first in its MA interval", async () => {
  const candidates = deriveThresholds(intervals.flatMap((r) => r.completed), manifest.config);
  const expected = thresholdEvents(prices, intervals.flatMap((r) => [...r.completed, r.current]), candidates, manifest.config.analysisStart);
  const actual = parse(await read("output/ma-interval-events.csv"));
  assert.equal(actual.length, expected.length);
  const seen = new Set();
  for (let i = 0; i < expected.length; i++) {
    assert.equal(actual[i].date, expected[i].date);
    const key = `${actual[i].intervalId}:${actual[i].quantileRank}`;
    assert.ok(!seen.has(key)); seen.add(key);
  }
});

test("summary frequencies agree with every actual mature terminal outcome", async () => {
  const outcomes = parse(await read("output/ma-interval-event-outcomes.csv"));
  const summaries = parse(await read("output/ma-interval-reversal-summary.csv"));
  for (const row of summaries.filter((r) => r.sample === "all")) {
    const matches = outcomes.filter((r) => r.period === row.period && r.direction === row.direction && r.quantileRank === row.quantileRank && r.horizon === row.horizon);
    assert.equal(matches.length, Number(row.n));
    if (!matches.length) continue;
    const probability = matches.filter((r) => Number(r.counterPct) > 0).length / matches.length;
    assert.ok(Math.abs(probability - Number(row.counterProbability)) < 1e-12);
    for (const value of matches) {
      const actual = eventOutcome(prices, { ...value, index: Number(value.index), close: Number(value.close) }, Number(value.horizon));
      assert.ok(Math.abs(actual.counterPct - Number(value.counterPct)) < 1e-10);
    }
  }
});

test("new report puts interval statistics before thresholds and retains the old analysis separately", async () => {
  const html = await read("output/ma-interval-report.zh-CN.html");
  assert.ok(html.indexOf('id="statistics"') < html.indexOf('id="thresholds"'));
  assert.ok(html.indexOf('id="thresholds"') < html.indexOf('id="down"'));
  assert.ok(html.includes('id="period"')); assert.ok(html.includes('id="horizon"'));
  assert.ok(html.includes("report.zh-CN.html")); assert.ok(!html.includes("NaN"));
});
