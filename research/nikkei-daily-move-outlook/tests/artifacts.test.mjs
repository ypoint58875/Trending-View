import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFile(path.join(root, name), "utf8");
const hash = (text) => createHash("sha256").update(text).digest("hex");
const manifest = JSON.parse(await read("output/run-manifest.json"));
const parse = (text) => {
  const lines = text.trim().split(/\r?\n/).map((line) => line.split(",").map((s) => s.replace(/^"|"$/g, "")));
  return lines.slice(1).map((cells) => Object.fromEntries(lines[0].map((key, i) => [key, cells[i]])));
};

test("every published artifact matches the completed manifest", async () => {
  for (const [name, digest] of Object.entries(manifest.artifactHashes)) assert.equal(hash(await read(name)), digest, name);
  assert.equal(hash(await read("data/processed/nikkei225-daily.csv")), manifest.dataHash);
});

test("the completion checkpoint is committed against the exact output manifest", async () => {
  const state = JSON.parse(await read("data/state/completion.json"));
  assert.equal(state.manifestHash, hash(await read("output/run-manifest.json")));
  assert.equal(state.dataHash, manifest.dataHash); assert.equal(state.configHash, manifest.configHash);
});

test("chronological evaluation uses actual future endpoints and non-overlapping outcomes", async () => {
  const predictions = parse(await read("output/evaluation-predictions.csv"));
  const bars = parse(await read("data/processed/nikkei225-daily.csv"));
  const index = new Map(bars.map((b, i) => [b.date, i]));
  for (const horizon of manifest.config.horizons) {
    let previous = -Infinity;
    const rows = predictions.filter((p) => Number(p.horizon) === horizon);
    for (const p of rows) {
      const i = index.get(p.date);
      assert.ok(i - previous >= horizon);
      assert.ok(Math.abs((Number(bars[i + horizon].close) / Number(bars[i].close) - 1) * 100 - Number(p.actual)) < 1e-10);
      previous = i;
    }
    const summary = manifest.validation.find((r) => r.horizon === horizon);
    assert.equal(rows.length, summary.n);
    const meanBrier = rows.reduce((sum, p) => sum + Number(p.brier), 0) / rows.length;
    assert.ok(Math.abs(meanBrier - summary.brier) < 1e-12);
  }
});

test("the report discloses a later official date and does not contain unresolved templates", async () => {
  const html = await read("output/report.zh-CN.html");
  assert.ok(html.includes(manifest.analysis.lastDate));
  if (manifest.sources.official.lastDate > manifest.analysis.lastDate) assert.ok(html.includes(manifest.sources.official.lastDate));
  assert.ok(!/\{(?:prob|base|mean|level|official)\}/.test(html));
  assert.ok(html.includes("<svg")); assert.ok(!html.includes("NaN"));
});

test("all confirmed wave endpoints are followed by later observable confirmation dates", async () => {
  const rows = parse(await read("output/confirmed-waves.csv"));
  assert.ok(rows.length > 100);
  for (const row of rows) {
    assert.ok(row.start < row.end); assert.ok(row.end < row.confirmed);
    assert.ok(Number(row.confirmationLag) >= 1);
    assert.ok(row.confirmed <= manifest.analysis.lastDate);
  }
});
