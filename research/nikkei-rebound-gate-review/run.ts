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
import { Context, policies, replay } from "./model";
const root = dirname(fileURLToPath(import.meta.url));
async function load(path: string) {
  assert.ok((await stat(path)).size <= 16 * 1024 ** 2);
  return readFile(path, "utf8");
}
async function atomic(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, typeof value === "string" ? value : JSON.stringify(value));
  await replaceFileAtomically(`${path}.tmp`, path);
}
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const source = join(root, "../nikkei-overlay-stability/data/full-screen-6-15");
const inputText = await load(join(source, "input.json")), signalsText = await load(join(source, "signals.json"));
const input = JSON.parse(inputText) as { bars: MarketBar[]; settings: BacktestSettings; barsHash: string; snapshots: { decisionIndex: number }[] };
const saved = JSON.parse(signalsText) as { sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[] };
assert.equal(sha(JSON.stringify(input)), saved.sourceHash); assert.equal(sha(JSON.stringify(input.bars)), input.barsHash);
assert.deepEqual(input.snapshots.map((row) => row.decisionIndex), saved.rows.map((row) => row.index));
assert.ok(input.bars.length <= 10000 && saved.rows.length <= 2048);
const implementationHash = sha((await Promise.all(["DESIGN.md", "model.ts", "run.ts", "../../lib/analysis/sma-position-overlay.ts",
  "../../lib/analysis/indicators.ts", "../../lib/analysis/backtest.ts", "../../lib/analysis/strategy-cycle-validation.ts"].map((name) => load(join(root, name))))).join("\n"));
const identity = sha(`${saved.sourceHash}:${implementationHash}`), data = join(root, "data", identity), output = join(root, "output");
await atomic(join(data, "input.json"), inputText); await atomic(join(data, "signals.json"), signalsText);
await atomic(join(data, "source_registry.jsonl"), JSON.stringify({ source, accessedAt: new Date().toISOString(), sourceHash: saved.sourceHash,
  inputFileHash: sha(inputText), signalsFileHash: sha(signalsText), implementationHash }) + "\n");
await atomic(join(output, "manifest.json"), { status: "running", identity, completed: 0, pending: 9, updatedAt: new Date().toISOString() });
const { bars, settings } = input, start = bars.length - 2000, context = new Context(bars), menu = policies();
const decisions = new Map(saved.rows.map((row) => [row.index, row.signals]));
const original = new SmaPositionOverlay(bars, DEFAULT_POSITION_OVERLAY_OPTIONS), targets = bars.map(() => 0);
for (let i = start; i < bars.length; i++) {
  const signals = decisions.get(i) ?? [], direction = strategyCycleSignalDirection(signals);
  if (direction) original.request(direction, signals.at(-1)!.targetAllocation, i);
  targets[i] = original.close(i, signals.length > 0);
}
const control = replay(context, decisions, start, menu[0]);
assert.deepEqual(control.targets, targets); assert.deepEqual(control.cursor.state, original.checkpoint());
assert.equal(runStrategyCycleCloseBacktest(bars, targets, settings).totalReturn, 440.9807031454993);
const measure = (path: number[], nextOpen = false) => {
  const result = nextOpen ? runAllocationBacktest(bars, path, { ...settings, positionOverlay: undefined, executionPolicy: "hybrid" })
    : runStrategyCycleCloseBacktest(bars, path, settings);
  assert.equal(result.equity.length, 2000);
  const cut = result.equity[1499].equity;
  let peak = cut, auditDrawdown = 0;
  for (const point of result.equity.slice(1500)) { peak = Math.max(peak, point.equity); auditDrawdown = Math.min(auditDrawdown, (point.equity / peak - 1) * 100); }
  return { result, totalReturn: result.totalReturn, maxDrawdown: result.maxDrawdown, fills: result.rebalances.length,
    first1500: (cut / settings.initialCash - 1) * 100, final500: (result.finalEquity / cut - 1) * 100, auditDrawdown };
};
const rows = [];
let stopping = false; process.on("SIGINT", () => { stopping = true; }); process.on("SIGTERM", () => { stopping = true; });
for (const policy of menu) {
  if (stopping || process.memoryUsage().rss > 1.5 * 1024 ** 3) throw new Error("Stopped safely; rerun this bounded nine-case study");
  const path = replay(context, decisions, start, policy), { result, ...metrics } = measure(path.targets);
  const partial = replay(context, decisions, start, policy, start + 1000);
  assert.deepEqual(replay(context, decisions, start, policy, bars.length, structuredClone(partial)), path);
  const prefixBars = bars.slice(0, start + 1500);
  assert.deepEqual(replay(new Context(prefixBars), decisions, start, policy).targets, path.targets.slice(0, prefixBars.length));
  const episodes = path.entries.map((index) => {
    const offset = index - start;
    let end = offset + 1;
    while (end < 2000 && path.targets[start + end] > 1e-10) end++;
    const closed = end < 2000, final = Math.min(end, 1999), base = offset ? result.equity[offset - 1].equity : settings.initialCash;
    const priceWindow = bars.slice(index, start + final + 1);
    return { entry: bars[index].time, exit: closed ? bars[start + end].time : null,
      held: final - offset, netReturn: (result.equity[final].equity / base - 1) * 100,
      close: bars[index].close, sma20: context.sma20[index],
      mfe: (Math.max(...priceWindow.map((bar) => bar.close)) / bars[index].close - 1) * 100,
      mae: (Math.min(...priceWindow.map((bar) => bar.close)) / bars[index].close - 1) * 100 };
  });
  const next = measure(path.targets, true);
  const nextOpen = { totalReturn: next.totalReturn, maxDrawdown: next.maxDrawdown, fills: next.fills,
    first1500: next.first1500, final500: next.final500, auditDrawdown: next.auditDrawdown };
  const row = { policy, ...metrics, entries: path.entries.length, episodes, nextOpen, targetHash: sha(JSON.stringify(path.targets)) };
  rows.push(row);
  await atomic(join(output, `${policy.id}.json`), { identity, row, path, rebalances: result.rebalances });
  await atomic(join(output, "manifest.json"), { status: "running", identity, completed: rows.length, pending: menu.length - rows.length, updatedAt: new Date().toISOString() });
  await new Promise<void>((done) => setImmediate(done));
}
const baseline = rows[0], disabled = rows[1];
const summary = { identity, sourceHash: saved.sourceHash, implementationHash, start: bars[start].time, end: bars.at(-1)!.time,
  rows, baseline, disabled, baselineSourceParity: true, baselineStateParity: true, serializedResumes: rows.length,
  causalPrefixes: rows.length, distinctTargets: new Set(rows.map((row) => row.targetHash)).size,
  fullAuditImprovers: rows.filter((row) => row.totalReturn > baseline.totalReturn + 1e-8 && row.final500 > baseline.final500 + 1e-8 && row.maxDrawdown >= baseline.maxDrawdown - 1e-8),
  unchangedVersusCurrent: rows.filter((row) => row.targetHash === baseline.targetHash).map((row) => row.policy.id),
  baselineFallbackImpact: baseline.totalReturn - disabled.totalReturn };
await atomic(join(output, "summary.json"), summary);
const table = ["| Policy | Full return % | First1500 % | Final500 % | MaxDD % | Audit DD % | Fills | Rebound-only entries |",
  "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ...rows.map((row) => `| ${row.policy.id} | ${row.totalReturn.toFixed(2)} | ${row.first1500.toFixed(2)} | ${row.final500.toFixed(2)} | ${row.maxDrawdown.toFixed(2)} | ${row.auditDrawdown.toFixed(2)} | ${row.fills} | ${row.entries} |`)].join("\n");
await atomic(join(root, "RESULTS.md"), `# Current-v8 rebound gate comparison\n\n${summary.start}..${summary.end},2000 sessions, costs3bps commission+2bps slippage. Main timing is the existing Nikkei close proxy; next-open results and ledgers are saved separately.\n\n${table}\n\nRebound-only entry labels exclude overlapping native entries that already buy. All variants preserve native priorities, stop rules and existing-position adds. Baseline reproduces all production targets and final controller state exactly. Every variant passes serialized resume and causal-prefix checks.\n\n## Baseline rebound-only episodes\n\n| Entry | Exit | Net account return % | MFE % | MAE % |\n| --- | --- | ---: | ---: | ---: |\n${baseline.episodes.map((episode) => `| ${episode.entry} | ${episode.exit ?? "open"} | ${episode.netReturn.toFixed(2)} | ${episode.mfe.toFixed(2)} | ${episode.mae.toFixed(2)} |`).join("\n")}\n\nEpisode net returns include subsequent inherited account behavior and costs, and are not additive causal effects. Final500 is conditional historical research because v8 and this dataset were previously examined. No automatic parameter adoption or universal safety claim. Extra WMA14 is applied only to this fallback and does not restore old all-entry behavior.\n`);
await atomic(join(output, "manifest.json"), { status: "complete", identity, completed: rows.length, pending: 0,
  updatedAt: new Date().toISOString(), rssMiB: Math.round(process.memoryUsage().rss / 1024 ** 2) });
console.log(JSON.stringify(summary));
