import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dailyDirectionBlocks } from "../lib/daily-blocks.mjs";
const read = (p) => readFile(new URL("../" + p, import.meta.url), "utf8");

test("daily blocks retain the first day's outside-window reference and every block boundary", () => {
  const bars = [10, 11, 10, 10, 9, 10].map((close, i) => ({ date: `2020-01-0${i + 1}`, close }));
  const rows = dailyDirectionBlocks(bars, "2020-01-02", 2);
  assert.deepEqual(rows.map((r) => [r.sessions, r.upDays, r.downDays, r.flatDays]), [[2, 1, 1, 0], [2, 0, 1, 1], [1, 1, 0, 0]]);
  assert.deepEqual(rows.map((r) => [r.firstSession, r.lastSession]), [[1, 2], [3, 4], [5, 5]]);
  assert.equal(rows.at(-1).complete, false);
  assert.throws(() => dailyDirectionBlocks(bars, "2020-01-01", 2));
  assert.throws(() => dailyDirectionBlocks(bars, "2020-01-02", 0));
});

test("actual 200-session blocks reconcile to all 6557 daily directions with one 157-day tail", async () => {
  const result = JSON.parse(await read("output/daily-200-session-blocks.json"));
  assert.deepEqual(result.total, { sessions: 6557, upDays: 3409, downDays: 3147, flatDays: 1 });
  assert.equal(result.rows.length, 33);
  assert.ok(result.rows.slice(0, -1).every((r) => r.sessions === 200 && r.complete));
  assert.equal(result.rows.at(-1).sessions, 157);
  assert.equal(result.rows[0].startDate, "2000-01-04");
  assert.equal(result.rows.at(-1).endDate, "2026-10-13");
  for (const row of result.rows) {
    assert.equal(row.upDays + row.downDays + row.flatDays, row.sessions);
    assert.ok(Math.abs(row.upPct + row.downPct + row.flatPct - 100) < 1e-9);
  }
});

test("block manifest and completed state match published source and all artifacts", async () => {
  const sha = (s) => createHash("sha256").update(s).digest("hex");
  const text = await read("output/daily-200-session-manifest.json"), manifest = JSON.parse(text);
  assert.equal(sha(await read("data/processed/nikkei225-daily.csv")), manifest.sourceHash);
  assert.equal(JSON.parse(await read("data/state/daily-200-session-completion.json")).manifestHash, sha(text));
  for (const [name, hash] of Object.entries(manifest.artifacts)) assert.equal(sha(await read(name)), hash);
});
