import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFile(path.join(root, p), "utf8");
const hash = (s) => createHash("sha256").update(s).digest("hex");
const manifest = JSON.parse(await read("output/relative-manifest.json"));
const parse = (s) => {
  const rows = s.trim().split(/\r?\n/).map((l) => l.split(",").map((x) => x.replace(/^"|"$/g, "")));
  return rows.slice(1).map((row) => Object.fromEntries(rows[0].map((key, i) => [key, row[i]])));
};

test("relative output hashes and completion state tie to unchanged accepted source data", async () => {
  for (const [p, digest] of Object.entries(manifest.artifactHashes)) assert.equal(hash(await read(p)), digest, p);
  assert.equal(hash(await read("data/processed/nikkei225-daily.csv")), manifest.sourceDataHash);
  assert.equal(hash(await read("output/run-manifest.json")), manifest.sourceManifestHash);
  assert.equal(JSON.parse(await read("data/state/relative-completion.json")).manifestHash, hash(await read("output/relative-manifest.json")));
});

test("frozen quantile policies are selected only from the declared validation rows", async () => {
  const grid = parse(await read("output/relative-exit-grid.csv"));
  const selected = JSON.parse(await read("output/relative-selected.json"));
  for (const rule of selected.filter((r) => r.validation)) {
    const eligible = grid.filter((r) => r.period === String(rule.period) && r.sample === "validation" && r.eligible === "true").sort((a, b) => Number(b.calmar) - Number(a.calmar));
    assert.equal(Number(eligible[0].exitQuantile), rule.exitQuantile);
    assert.equal(Number(eligible[0].entryQuantile), rule.entryQuantile);
    assert.ok(rule.thresholds.some((r) => r.bucket === "5-10"));
  }
});

test("every actual simulated trade uses next-open prices and the stated two-sided cost", async () => {
  const bars = parse(await read("data/processed/nikkei225-daily.csv"));
  const index = new Map(bars.map((b, i) => [b.date, i]));
  const trades = parse(await read("output/relative-evaluation-trades.csv"));
  assert.ok(trades.length > 30);
  for (const trade of trades) {
    const entry = index.get(trade.entryDate), exit = index.get(trade.exitDate);
    assert.equal(index.get(trade.entrySignalDate) + 1, entry);
    assert.equal(index.get(trade.exitSignalDate) + 1, exit);
    assert.equal(Number(trade.entryPrice), Number(bars[entry].open));
    assert.equal(Number(trade.exitPrice), Number(bars[exit].open));
    const expected = (Number(trade.exitPrice) / Number(trade.entryPrice) * (1 - Number(trade.costBps) / 10000) ** 2 - 1) * 100;
    assert.ok(Math.abs(expected - Number(trade.netReturnPct)) < 1e-9);
  }
});

test("report defaults to the requested previous 5-to-10-percent group and makes failed comparisons visible", async () => {
  const html = await read("output/relative-report.zh-CN.html");
  assert.ok(html.includes('value="5-10" selected'));
  assert.ok(html.includes("本段 / 上一段比例"));
  assert.ok(html.includes("尚未证明稳定最优止损止盈点"));
  assert.ok(!html.includes("NaN")); assert.ok(html.includes('id="calculation"'));
});
