import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseSoxPayload, mergeLockedBars } from "../lib/sox-source.mjs";
import { dailyDirectionBlocks } from "../lib/daily-blocks.mjs";
const read = (p) => readFile(new URL("../" + p, import.meta.url), "utf8");
const hash = (s) => createHash("sha256").update(s).digest("hex");
const config = JSON.parse(await read("sox-config.json"));
const result = JSON.parse(await read("output/sox-200-session-blocks.json"));

test("SOX source rejects ETFs and missing quotes without inventing zero prices", () => {
  const source = { chart: { result: [{ meta: { symbol: "^SOX", instrumentType: "INDEX", exchangeTimezoneName: "America/New_York" },
    timestamp: [Date.parse("2000-01-03T21:00:00Z") / 1000, Date.parse("2000-01-04T21:00:00Z") / 1000],
    indicators: { quote: [{ open: [100, 100], high: [101, 101], low: [99, 99], close: [100, null] }] } }] } };
  const parsed = parseSoxPayload(source, config);
  assert.equal(parsed.bars.length, 1); assert.equal(parsed.bars[0].date, "2000-01-03");
  assert.deepEqual(parsed.rejected, ["2000-01-04"]);
  const wrong = structuredClone(source); wrong.chart.result[0].meta.instrumentType = "ETF";
  assert.throws(() => parseSoxPayload(wrong, config));
});

test("SOX incremental merge is idempotent and reports revisions without changing accepted bars", () => {
  const old = { date: "2000-01-03", open: 100, high: 102, low: 99, close: 101 };
  const next = { ...old, date: "2000-01-04", close: 102 };
  const merged = mergeLockedBars([old], [{ ...old, close: 100 }, next], config.maximumBars);
  assert.deepEqual(merged.bars, [old, next]); assert.equal(merged.revisions.length, 1);
  assert.deepEqual(mergeLockedBars(merged.bars, [old, next], config.maximumBars).bars, merged.bars);
});

test("SOX raw backup, normalized data, registry and committed state retain exact provenance", async () => {
  const source = await read("data/processed/sox-daily.csv");
  const state = JSON.parse(await read("data/state/sox-sync.json"));
  assert.equal(hash(source), result.sourceHash); assert.equal(state.dataHash, result.sourceHash);
  assert.equal(hash(await read(result.source.rawPath)), result.source.rawHash);
  const registry = (await read("data/source_registry.jsonl")).trim().split(/\r?\n/).map(JSON.parse);
  assert.ok(registry.some((r) => r.type === "sox_index_history" && r.rawHash === result.source.rawHash));
  assert.equal(result.source.identity.symbol, "^SOX"); assert.equal(result.source.identity.instrumentType, "INDEX");
});

test("SOX blocks rederive from actual close changes including the first external close", async () => {
  const bars = (await read("data/processed/sox-daily.csv")).trim().split(/\r?\n/).slice(1).map((line) => {
    const [date, open, high, low, close] = line.replaceAll('"', "").split(","); return { date, open: +open, high: +high, low: +low, close: +close };
  });
  assert.deepEqual(dailyDirectionBlocks(bars, config.analysisStart, 200), result.rows);
  assert.deepEqual(result.total, { sessions: 6734, upDays: 3529, downDays: 3202, flatDays: 3 });
  assert.equal(result.rows.length, 34); assert.equal(result.rows.at(-1).sessions, 134);
  assert.equal(result.firstDate, "2000-01-04"); assert.equal(result.lastDate, "2026-10-13");
  assert.ok(result.rows.slice(0, -1).every((r) => r.sessions === 200));
  assert.equal(result.rows.reduce((n, r) => n + r.upDays + r.downDays + r.flatDays, 0), result.total.sessions);
});

test("SOX publication and completion hashes match all derived outputs", async () => {
  const manifestText = await read("output/sox-200-session-manifest.json"), manifest = JSON.parse(manifestText);
  const complete = JSON.parse(await read("data/state/sox-200-session-completion.json"));
  assert.equal(complete.manifestHash, hash(manifestText));
  assert.equal(manifest.configHash, hash(await read("sox-config.json")));
  for (const [name, expected] of Object.entries(manifest.artifacts)) assert.equal(hash(await read(name)), expected);
});
