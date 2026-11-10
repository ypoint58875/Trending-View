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
import { Features, policies, combinedPolicies, weightedPolicies, replay, type Policy } from "./model";

const root = dirname(fileURLToPath(import.meta.url));
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
async function load(path: string) { assert.ok((await stat(path)).size <= 16 * 1024 ** 2); return readFile(path, "utf8"); }
async function atomic(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, typeof value === "string" ? value : JSON.stringify(value));
  await replaceFileAtomically(`${path}.tmp`, path);
}
const source = join(root, "../nikkei-overlay-stability/data/full-screen-6-15");
const inputText = await load(join(source, "input.json")), signalsText = await load(join(source, "signals.json"));
const input = JSON.parse(inputText) as { bars: MarketBar[]; settings: BacktestSettings; barsHash: string; snapshots: { decisionIndex: number }[] };
const saved = JSON.parse(signalsText) as { sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[] };
assert.equal(saved.sourceHash, "b543028a5db9860a9ac262d8bf65cf6df06f8d625afba728d875ce0d0274873e");
assert.equal(sha(JSON.stringify(input)), saved.sourceHash); assert.equal(sha(JSON.stringify(input.bars)), input.barsHash);
assert.deepEqual(input.snapshots.map((row) => row.decisionIndex), saved.rows.map((row) => row.index));
assert.ok(input.bars.length <= 10000 && saved.rows.length <= 2048);
const implementationHash = sha((await Promise.all(["DESIGN.md", "WEIGHTED_DESIGN.md", "model.ts", "run.ts", "../../lib/analysis/market-context.ts",
  "../../lib/analysis/sma-position-overlay.ts", "../../lib/analysis/indicators.ts", "../../lib/analysis/backtest.ts",
  "../../lib/analysis/strategy-cycle-validation.ts"].map((name) => load(join(root, name))))).join("\n"));
const combined = process.argv.includes("--combined");
const weighted = process.argv.includes("--weighted");
assert.ok(!(combined && weighted));
const identity = sha(`${saved.sourceHash}:${implementationHash}:${combined}:${weighted}`), output = join(root, "output", weighted ? "weighted" : combined ? "combined" : "initial"), data = join(root, "data", identity);
const reportPath = join(root, weighted ? "WEIGHTED_RESULTS.md" : combined ? "COMBINED_RESULTS.md" : "RESULTS.md");
await atomic(join(data, "input.json"), inputText); await atomic(join(data, "signals.json"), signalsText);
await atomic(join(data, "source_registry.jsonl"), JSON.stringify({ source, accessedAt: new Date().toISOString(), sourceHash: saved.sourceHash,
  inputFileHash: sha(inputText), signalsFileHash: sha(signalsText), implementationHash }) + "\n");
const { bars, settings } = input, start = bars.length - 2000, features = new Features(bars), menu = weighted ? weightedPolicies() : combined ? combinedPolicies() : policies();
const decisions = new Map(saved.rows.map((row) => [row.index, row.signals]));
const original = new SmaPositionOverlay(bars, DEFAULT_POSITION_OVERLAY_OPTIONS), targets = bars.map(() => 0);
for (let i = start; i < bars.length; i++) {
  const signals = decisions.get(i) ?? [], direction = strategyCycleSignalDirection(signals);
  if (direction) original.request(direction, signals.at(-1)!.targetAllocation, i);
  targets[i] = original.close(i, signals.length > 0);
}
const control = replay(features, decisions, start, menu[0]);
assert.deepEqual(control.targets, targets); assert.deepEqual(control.cursor.state, original.checkpoint());
assert.equal(runStrategyCycleCloseBacktest(bars, targets, settings).totalReturn, 440.9807031454993);
const measure = (path: number[], nextOpen = false) => {
  const result = nextOpen ? runAllocationBacktest(bars, path, { ...settings, positionOverlay: undefined, executionPolicy: "hybrid" })
    : runStrategyCycleCloseBacktest(bars, path, settings);
  assert.equal(result.equity.length, 2000);
  const cut = result.equity[1499].equity;
  let trainPeak = settings.initialCash, firstDrawdown = 0;
  for (const point of result.equity.slice(0, 1500)) { trainPeak = Math.max(trainPeak, point.equity); firstDrawdown = Math.min(firstDrawdown, (point.equity / trainPeak - 1) * 100); }
  let peak = cut, auditDrawdown = 0;
  for (const point of result.equity.slice(1500)) { peak = Math.max(peak, point.equity); auditDrawdown = Math.min(auditDrawdown, (point.equity / peak - 1) * 100); }
  return { totalReturn: result.totalReturn, maxDrawdown: result.maxDrawdown, fills: result.rebalances.length,
    first1500: (cut / settings.initialCash - 1) * 100, firstDrawdown, final500: (result.finalEquity / cut - 1) * 100, auditDrawdown,
    invested: path.slice(start).filter((value) => value > 1e-10).length / 20,
    turnover: path.slice(start).reduce((sum, value, i) => sum + Math.abs(value - (i ? path[start + i - 1] : 0)), 0) };
};
const summarize = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b), n = sorted.length;
  return { n, mean: n ? values.reduce((a, b) => a + b, 0) / n : null,
    median: n ? (sorted[Math.floor((n - 1) / 2)] + sorted[Math.ceil((n - 1) / 2)]) / 2 : null,
    downPct: n ? values.filter((value) => value < 0).length / n * 100 : null };
};
await atomic(join(output, "manifest.json"), { status: "running", identity, completed: 0, pending: menu.length });
let stopping = false; process.on("SIGINT", () => { stopping = true; }); process.on("SIGTERM", () => { stopping = true; });
type Row = ReturnType<typeof measure> & { policy: Policy; nextOpen: ReturnType<typeof measure>; exits: number; entryVetoes: number;
  fastReentries: number; sameDayNativeIncreaseSales: number; positiveSpeedSales: number;
  forward: Record<string, ReturnType<typeof summarize>>; targetHash: string };
const rows: Row[] = [];
for (const policy of menu) {
  if (stopping || process.memoryUsage().rss > 1.5 * 1024 ** 3) throw new Error("Stopped safely; rerun bounded study");
  const path = replay(features, decisions, start, policy);
  const partial = replay(features, decisions, start, policy, start + 1000);
  assert.deepEqual(replay(features, decisions, start, policy, bars.length, JSON.parse(JSON.stringify(partial))), path);
  const prefix = new Features(bars.slice(0, start + 1500));
  assert.deepEqual(replay(prefix, decisions, start, policy).targets, path.targets.slice(0, prefix.bars.length));
  const events = path.exits.map((event) => {
    const index = event.index, next = path.targets.findIndex((allocation, i) => i > index && allocation > event.target + 1e-10);
    const forward = Object.fromEntries([5, 10, 20].map((horizon) => [horizon, index + horizon < bars.length
      ? (bars[index + horizon].close / bars[index].close - 1) * 100 : null]));
    const window = bars.slice(index + 1, Math.min(bars.length, index + 21));
    return { ...event, reentry: next < 0 ? null : bars[next].time, wait: next < 0 ? null : next - index, forward,
      adverse20: index + 20 < bars.length ? (Math.min(...window.map((bar) => bar.close)) / bars[index].close - 1) * 100 : null,
      upside20: index + 20 < bars.length ? (Math.max(...window.map((bar) => bar.close)) / bars[index].close - 1) * 100 : null };
  });
  const sales = events.filter((event) => !event.cancelledEntry);
  const forward = Object.fromEntries([5, 10, 20].map((horizon) => [horizon,
    summarize(sales.map((event) => event.forward[horizon]).filter((value): value is number => value !== null))]));
  const row = { policy, ...measure(path.targets), nextOpen: measure(path.targets, true), exits: sales.length,
    entryVetoes: events.length - sales.length, fastReentries: sales.filter((event) => event.wait !== null && event.wait <= 5).length,
    sameDayNativeIncreaseSales: sales.filter((event) => event.wanted > event.before + 1e-10).length,
    positiveSpeedSales: sales.filter((event) => event.speed > 0).length, forward, targetHash: sha(JSON.stringify(path.targets)) };
  rows.push(row);
  await atomic(join(output, `${policy.id}.json`), { identity, row, path, events });
  await atomic(join(output, "manifest.json"), { status: "running", identity, completed: rows.length, pending: menu.length - rows.length });
  await new Promise<void>((done) => setImmediate(done));
}
const base = rows[0];
const eligible = (row: typeof base, baseline: typeof base) => row.first1500 >= baseline.first1500 - 3 - 1e-8 &&
  row.firstDrawdown >= baseline.firstDrawdown - 1e-8 && row.final500 >= baseline.final500 - 1e-8 && row.auditDrawdown >= baseline.auditDrawdown - 1e-8;
const qualified = rows.filter((row) => row.targetHash !== base.targetHash && eligible(row, base) && eligible({ ...row, ...row.nextOpen }, { ...base, ...base.nextOpen })).map((row) => row.policy.id);
const ablations = rows.filter((row) => row.policy.score?.contextWeight === 1).map((row) => {
  const off = rows.find((other) => other.policy.id === row.policy.id.replace(/C1$/, "C0"))!;
  return { id: row.policy.id, without: off.policy.id, fullDelta: row.totalReturn - off.totalReturn,
    first1500Delta: row.first1500 - off.first1500, final500Delta: row.final500 - off.final500,
    ddDelta: row.maxDrawdown - off.maxDrawdown, auditDdDelta: row.auditDrawdown - off.auditDrawdown,
    nextFullDelta: row.nextOpen.totalReturn - off.nextOpen.totalReturn,
    nextAuditDelta: row.nextOpen.final500 - off.nextOpen.final500,
    extraSales: row.exits - off.exits, identicalTargets: row.targetHash === off.targetHash };
});
const summary = { identity, sourceHash: saved.sourceHash, implementationHash, start: bars[start].time, end: bars.at(-1)!.time, qualified,
  rows, ablations, baselineTargetAndStateParity: true, causalPrefixes: rows.length, serializedResumes: rows.length,
  rssMiB: Math.round(process.memoryUsage().rss / 1024 ** 2) };
await atomic(join(output, "summary.json"), summary);
const table = ["| Policy | Full % | First1500 % | Final500 % | MaxDD % | Fills | Extra sales | Entry vetoes | Reentry within5 | Next-open full % |",
  "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ...rows.map((row) => `| ${row.policy.id} | ${row.totalReturn.toFixed(2)} | ${row.first1500.toFixed(2)} | ${row.final500.toFixed(2)} | ${row.maxDrawdown.toFixed(2)} | ${row.fills} | ${row.exits} | ${row.entryVetoes} | ${row.fastReentries} | ${row.nextOpen.totalReturn.toFixed(2)} |`)].join("\n");
const primary = rows.find((row) => row.policy.id === (weighted ? "weighted-smooth-native-intent-T4-C1" : combined ? "raw-smooth-armed" : "smooth-smooth-armed"))!;
const comparison = ["| Raw BIAS20 gate | Speed | Full % | Final500 % | MaxDD % | Extra sales | Forward20 mean % | Forward20 down % |",
  "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ...rows.filter((row) => row.policy.bias === "raw").map((row) => `| ${row.policy.mode} | ${row.policy.slope} | ${row.totalReturn.toFixed(2)} | ${row.final500.toFixed(2)} | ${row.maxDrawdown.toFixed(2)} | ${row.exits} | ${row.forward[20].mean?.toFixed(2)} | ${row.forward[20].downPct?.toFixed(2)} |`)].join("\n");
await atomic(reportPath, `# BIAS20 P90 exit study\n\n${summary.start}..${summary.end},2000 sessions. Costs:3bps commission plus2bps slippage. Current-v8 frozen winners. Main returns use existing Nikkei close proxy; next-open sensitivity is separate.\n\n${table}\n\nPrimary ${primary.policy.id} forward price statistics after actual additional sales:\n\n\`\`\`json\n${JSON.stringify(primary.forward, null, 2)}\n\`\`\`\n\nPrimary positive-speed sales:${primary.positiveSpeedSales}/${primary.exits}. These exits can occur while SMA20 is still rising. Reentry rules are unchanged; no extra cooldown. Armed threshold memory resets at native flat or additional exit. Native entry vetoes do not represent a buy and sell at the same close.\n\nP90 uses preceding three calendar years of raw BIAS, excluding current close, minimum252. Raw and smooth refer to tested current curve values, not different quantile samples. Strict-turn requires a nonnegative prior speed change followed by a negative change; negative means speed below zero.\n\nBaseline targets AND final state match production; all${rows.length} variants pass causal prefixes and serialized resume. Forward windows overlap and ignore whether the account reentered; they are descriptive, not avoided-loss estimates. Whole-account returns include inherited path and fees. Final500 is reused historical data, not an untouched holdout. No production adoption.\n`);
await atomic(reportPath, (await load(reportPath)) + `\n## Isolating one-day versus three-day speed\n\n${comparison}\n\nHere BIAS input remains raw in every row. Raw speed is SMA20[t]-SMA20[t-1]; smooth speed is its trailing3 mean. See full and final500 results together; do not select on full return alone. Combined cap.5 cases reduce to half rather than zero. For those cases sales include reductions; entry vetoes include capped new/add requests, and reentry means allocation above the cap. Native-guards probes production request/release protection and gives original increase priority. No new cooldown is introduced.\n`);
await atomic(reportPath, (await load(reportPath)) + `\nPredeclared combination screening pass count under both timing conventions:${qualified.length}. Qualified IDs:${JSON.stringify(qualified)}. Conditions: first1500 return within3 percentage points of baseline or better, first1500 drawdown no worse, final500 return and drawdown no worse. This is conditional screening on reused data.\n`);
if (weighted) {
  const paired = ["| Context-point case | Full delta pp | First1500 delta pp | Final500 delta pp | DD delta pp (positive better) | Next-open full delta pp | Next-open final500 delta pp | Extra sales |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...ablations.map((row) => `| ${row.id} | ${row.fullDelta.toFixed(2)} | ${row.first1500Delta.toFixed(2)} | ${row.final500Delta.toFixed(2)} | ${row.ddDelta.toFixed(2)} | ${row.nextFullDelta.toFixed(2)} | ${row.nextAuditDelta.toFixed(2)} | ${row.extraSales} |`)].join("\n");
  await atomic(reportPath, (await load(reportPath)) + `\n## Context-point ablation\n\nNative reduction intent2, hot-BIAS/speed-decline context1, close below EMA7 plus declining WMA7 jointly1, four-of-six down1. Thresholds3/4/5; original increases retain priority. Context is not mandatory and is removed in each paired case. See WEIGHTED_DESIGN.md for scopes.\n\n${paired}\n\nThese are account-path deltas, not isolated trade profits. Raw and smoothed speeds are separate alternatives, never two simultaneous points. Related indicators do not constitute independent votes. A higher score is not a calibrated risk probability.\n`);
}
await atomic(join(output, "manifest.json"), { status: "complete", identity, completed: rows.length, pending: 0,
  updatedAt: new Date().toISOString(), rssMiB: summary.rssMiB });
console.log(JSON.stringify({ identity, rows: rows.map(({ policy, totalReturn, maxDrawdown, final500, exits, fastReentries, positiveSpeedSales }) =>
  ({ id: policy.id, totalReturn, maxDrawdown, final500, exits, fastReentries, positiveSpeedSales })), rssMiB: summary.rssMiB }));
