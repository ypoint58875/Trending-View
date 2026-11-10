import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import { SmaPositionOverlay, RSI_SHAPE_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import { runStrategyCycleCloseBacktest, strategyCycleSignalDirection, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest, type BacktestSettings } from "../../lib/analysis/backtest";
import type { MarketBar } from "../../lib/market/types";
import { Features, policies, replay, type Policy, type Replay } from "./model";

const root = dirname(fileURLToPath(import.meta.url)), sha = (value: string) => createHash("sha256").update(value).digest("hex");
async function load(path: string) { assert.ok((await stat(path)).size <= 16 * 1024 ** 2); return readFile(path, "utf8"); }
async function atomic(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true }); await writeFile(`${path}.tmp`, typeof value === "string" ? value : JSON.stringify(value));
  await replaceFileAtomically(`${path}.tmp`, path);
}
const source = join(root, "../nikkei-overlay-stability/data/full-screen-6-15");
const inputText = await load(join(source, "input.json")), signalText = await load(join(source, "signals.json"));
const input = JSON.parse(inputText) as { bars: MarketBar[]; settings: BacktestSettings; barsHash: string; snapshots: { decisionIndex: number }[] };
const signals = JSON.parse(signalText) as { sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[] };
assert.equal(signals.sourceHash, "b543028a5db9860a9ac262d8bf65cf6df06f8d625afba728d875ce0d0274873e");
assert.equal(sha(JSON.stringify(input)), signals.sourceHash); assert.equal(sha(JSON.stringify(input.bars)), input.barsHash);
assert.deepEqual(input.snapshots.map((row) => row.decisionIndex), signals.rows.map((row) => row.index));
assert.ok(input.bars.length <= 10000 && signals.rows.length <= 2048);
const codeHash = sha((await Promise.all(["DESIGN.md", "model.ts", "run.ts", "../../lib/analysis/market-context.ts",
  "../../lib/analysis/sma-position-overlay.ts", "../../lib/analysis/indicators.ts", "../../lib/analysis/backtest.ts",
  "../../lib/analysis/strategy-cycle-validation.ts"].map((name) => load(join(root, name))))).join("\n"));
const identity = sha(`${signals.sourceHash}:${codeHash}`), data = join(root, "data", identity), output = join(root, "output", identity);
await atomic(join(data, "input.json"), inputText); await atomic(join(data, "signals.json"), signalText);
await atomic(join(data, "source_registry.jsonl"), JSON.stringify({ source, accessedAt: new Date().toISOString(), sourceHash: signals.sourceHash,
  inputFileHash: sha(inputText), signalsFileHash: sha(signalText), codeHash }) + "\n");
const { bars, settings } = input, start = bars.length - 2000, features = new Features(bars), menu = policies();
assert.equal(menu.length, 190);
const decisions = new Map(signals.rows.map((row) => [row.index, row.signals]));
const native = new SmaPositionOverlay(bars, DEFAULT_POSITION_OVERLAY_OPTIONS), targets = bars.map(() => 0);
for (let i = start; i < bars.length; i++) {
  const orders = decisions.get(i) ?? [], direction = strategyCycleSignalDirection(orders);
  if (direction) native.request(direction, orders.at(-1)!.targetAllocation, i);
  targets[i] = native.close(i, orders.length > 0);
}
const control = replay(features, decisions, start, menu[0]);
assert.deepEqual(control.targets, targets); assert.deepEqual(control.cursor.state, native.checkpoint());
assert.equal(runStrategyCycleCloseBacktest(bars, targets, settings).totalReturn, 440.9807031454993);
function measure(path: number[], next = false) {
  const result = next ? runAllocationBacktest(bars, path, { ...settings, positionOverlay: undefined, executionPolicy: "hybrid" })
    : runStrategyCycleCloseBacktest(bars, path, settings);
  assert.equal(result.equity.length, 2000);
  const cut = result.equity[1499].equity;
  let peak = settings.initialCash, firstDrawdown = 0;
  for (const point of result.equity.slice(0, 1500)) { peak = Math.max(peak, point.equity); firstDrawdown = Math.min(firstDrawdown, (point.equity / peak - 1) * 100); }
  peak = cut; let auditDrawdown = 0;
  for (const point of result.equity.slice(1500)) { peak = Math.max(peak, point.equity); auditDrawdown = Math.min(auditDrawdown, (point.equity / peak - 1) * 100); }
  return { totalReturn: result.totalReturn, maxDrawdown: result.maxDrawdown, fills: result.rebalances.length,
    first1500: (cut / settings.initialCash - 1) * 100, firstDrawdown, final500: (result.finalEquity / cut - 1) * 100, auditDrawdown };
}
type Row = ReturnType<typeof measure> & { policy: Policy; nextOpen: ReturnType<typeof measure>; blocked: number;
  entries: number; adds: number; forward20Mean: number | null; targetHash: string };
const rows: Row[] = [];
let computed = 0, reused = 0, stopping = false;
process.on("SIGINT", () => { stopping = true; }); process.on("SIGTERM", () => { stopping = true; });
const limitArg = process.argv.find((value) => /^--limit\d+$/.test(value)), limit = limitArg ? Number(limitArg.slice(7)) : 190;
assert.ok(Number.isInteger(limit) && limit > 0 && limit <= 190);
for (const policy of menu) {
  if (stopping || computed >= limit) break;
  if (process.memoryUsage().rss > 1.5 * 1024 ** 3) throw new Error("RSS bound reached; safe to resume");
  const path = join(output, `${policy.id}.json`);
  let exists = false;
  try { await stat(path); exists = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (exists) {
    const cached = JSON.parse(await load(path)) as { identity: string; row: Row; replay: Replay; verified: boolean };
    assert.equal(cached.identity, identity); assert.deepEqual(cached.row.policy, policy); assert.equal(cached.verified, true);
    assert.equal(sha(JSON.stringify(cached.replay.targets)), cached.row.targetHash);
    rows.push(cached.row); reused++; continue;
  }
  const result = replay(features, decisions, start, policy), partial = replay(features, decisions, start, policy, start + 1000);
  assert.deepEqual(replay(features, decisions, start, policy, bars.length, JSON.parse(JSON.stringify(partial))), result);
  const prefix = new Features(bars.slice(0, start + 1500));
  assert.deepEqual(replay(prefix, decisions, start, policy).targets, result.targets.slice(0, prefix.bars.length));
  const forwards = result.events.filter((event) => event.index + 20 < bars.length)
    .map((event) => (bars[event.index + 20].close / bars[event.index].close - 1) * 100);
  const row: Row = { policy, ...measure(result.targets), nextOpen: measure(result.targets, true), blocked: result.events.length,
    entries: result.events.filter((event) => event.before <= 1e-10).length, adds: result.events.filter((event) => event.before > 1e-10).length,
    forward20Mean: forwards.length ? forwards.reduce((a, b) => a + b, 0) / forwards.length : null, targetHash: sha(JSON.stringify(result.targets)) };
  await atomic(path, { identity, row, replay: result, verified: true }); rows.push(row); computed++;
  await atomic(join(output, "manifest.json"), { status: "running", identity, completed: rows.length, pending: 190 - rows.length, computed, reused, updatedAt: new Date().toISOString() });
  await new Promise<void>((done) => setImmediate(done));
}
const complete = rows.length === 190, rssMiB = Math.round(process.memoryUsage().rss / 1024 ** 2);
await atomic(join(output, "manifest.json"), { status: complete ? "complete" : "incomplete", identity, completed: rows.length,
  pending: 190 - rows.length, computed, reused, rssMiB, updatedAt: new Date().toISOString() });
await atomic(join(root, "output", "latest.json"), { identity, output, complete });
if (!complete) { console.log(JSON.stringify({ identity, complete, computed, reused })); process.exit(0); }
const baseline = rows[0], eligible = (row: ReturnType<typeof measure>, base: ReturnType<typeof measure>) =>
  row.first1500 >= base.first1500 - 3 - 1e-8 && row.firstDrawdown >= base.firstDrawdown - 1e-8 &&
  row.final500 >= base.final500 - 1e-8 && row.auditDrawdown >= base.auditDrawdown - 1e-8;
const qualified = rows.filter((row) => row.targetHash !== baseline.targetHash && eligible(row, baseline) && eligible(row.nextOpen, baseline.nextOpen));
const summary = { identity, sourceHash: signals.sourceHash, start: bars[start].time, end: bars.at(-1)!.time, rows,
  qualified: qualified.map((row) => row.policy.id), baselineTargetAndStateParity: true, causalPrefixes: 190, serializedResumes: 190, computed, reused, rssMiB };
await atomic(join(output, "summary.json"), summary);
const table = (values: Row[]) => ["| Policy | Full % | First1500 % | Final500 % | DD % | Fills | Blocked entry/add | Next-open full % |",
  "| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |",
  ...values.map((row) => `| ${row.policy.id} | ${row.totalReturn.toFixed(2)} | ${row.first1500.toFixed(2)} | ${row.final500.toFixed(2)} | ${row.maxDrawdown.toFixed(2)} | ${row.fills} | ${row.entries}/${row.adds} | ${row.nextOpen.totalReturn.toFixed(2)} |`)].join("\n");
const onset = rows.filter((row) => row.policy.condition === "speed-turn" && row.policy.smoothing === "smooth");
await atomic(join(root, "RESULTS.md"), `# Six-curve declining-phase increase gates\n\n${summary.start}..${summary.end},2000 sessions,3bps commission+2bps slippage. Current-v8 original signals, main Nikkei close proxy and separate next-open sensitivity.\n\n## Three-session speed curve starts falling\n\n${table([baseline, ...onset])}\n\nStarts falling means speed3[t]<speed3[t-1] and speed3[t-1]>=speed3[t-2]. This is not a negative-speed crossing. Raw/ongoing conditions appear in the complete table.\n\n## Qualified cases under predeclared conditions\n\n${qualified.length ? table(qualified) : "None."}\n\nQualify only if first1500 return within3pp of baseline or better and drawdown no worse, final500 return/drawdown no worse, under BOTH timing conventions. Exclude no-ops. Historical sample has been repeatedly examined; these are conditional candidates, not validated prospective rules. No automatic adoption.\n\n## Complete fixed grid\n\n${table(rows)}\n\nEach case reproduces serialized account resume and causal prefixes. Baseline matches production targets and final state exactly. Blocked increases preserve accepted holding/risk state; native reductions/stops are not gated. No new exits or automatic deferred entry. Forward returns after blocked opportunities are overlapping price descriptions, not avoided account losses. See identity-specific ledgers and DESIGN.md for definitions and recovery.\n`);
console.log(JSON.stringify({ identity, complete, computed, reused, rssMiB, qualified: summary.qualified }));
