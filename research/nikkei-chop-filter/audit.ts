import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Features, policies, replay, type Row } from "./model";
import { segment } from "./run";
import { runStrategyCycleCloseBacktest, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { BacktestSettings } from "../../lib/analysis/backtest";
import type { MarketBar } from "../../lib/market/types";
const root = dirname(fileURLToPath(import.meta.url));
const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function load(path: string) {
  assert.ok((await stat(path)).size <= 16 * 1024 ** 2);
  return JSON.parse(await readFile(path, "utf8"));
}
const summary = await load(join(root, "output/summary.json")) as { identity: string; rows: Row[]; sourceHash: string };
const data = join(root, "data", summary.identity);
const input = await load(join(data, "input.json")) as { bars: MarketBar[]; settings: BacktestSettings };
const signals = await load(join(data, "signals.json")) as { rows: { index: number; signals: StrategyCycleRecentSignal[] }[] };
assert.equal(sha(input), summary.sourceHash);
const features = new Features(input.bars), start = input.bars.length - 2000;
const decisions = new Map(signals.rows.map((row) => [row.index, row.signals]));
let checked = 0, riskEvents = 0;
for (const row of summary.rows) {
  const path = replay(features, decisions, start, row.policy);
  assert.equal(sha(path.targets), row.targetHash);
  const result = runStrategyCycleCloseBacktest(input.bars, path.targets, input.settings);
  for (const [key, from, to] of [["train", 0, 1000], ["validation", 1000, 1500], ["audit", 1500, 2000], ["full", 0, 2000]] as const)
    assert.deepEqual(segment(result, from, to, input.settings.initialCash), row[key]);
  for (const event of path.events.filter((event) => event.reason === "risk")) {
    assert.equal(event.actual, event.wanted); assert.equal(event.actual, 0); riskEvents++;
  }
  checked++;
}
const menu = policies(), baseline = replay(features, decisions, start, menu[0]);
assert.deepEqual(replay(features, decisions, start, { ...menu[0], family: "buffer", buffer: 0 }).targets, baseline.targets);
let resumes = 0, prefixes = 0;
for (const policy of [menu[1], menu.find((row) => row.family === "er-only")!, menu.find((row) => row.family === "buffer")!]) {
  const full = replay(features, decisions, start, policy);
  const partial = replay(features, decisions, start, policy, start + 1150);
  assert.deepEqual(replay(features, decisions, start, policy, input.bars.length, structuredClone(partial)), full); resumes++;
  const prefixBars = input.bars.slice(0, start + 1500);
  const prefix = replay(new Features(prefixBars), decisions, start, policy);
  assert.deepEqual(prefix.targets, full.targets.slice(0, prefixBars.length)); prefixes++;
}
const result = { identity: summary.identity, configurationsVerified: checked, riskEventsPreserved: riskEvents,
  baselineZeroFilterIdentity: true, serializedReplayResumes: resumes, causalPrefixes: prefixes,
  rssMiB: Math.round(process.memoryUsage().rss / 1024 ** 2) };
await writeFile(join(root, "output/audit.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
