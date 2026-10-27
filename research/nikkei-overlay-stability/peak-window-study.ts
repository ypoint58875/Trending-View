import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atomic, root } from "./analyze";
import { peakMenu, peakReplay, validatePeakProgress, type PeakPolicy } from "./peak-liquidation-study";
import { FilterContext } from "./oscillator-filter-study";
import { fallbackMetrics } from "./sma20-fallback";
import { runStrategyCycleCloseBacktest, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest, type BacktestSettings } from "../../lib/analysis/backtest";
import { replaceFileAtomically } from "../../scripts/atomic-file";

export function peakWindowMenu(): PeakPolicy[] {
  const policies: PeakPolicy[] = [];
  for (const baseline of peakMenu().filter(row => row.threshold === null)) {
    policies.push({ ...baseline });
    for (let window = 5; window <= 20; window++) for (const percent of [2, 3, 4, 5, 6]) for (const wait of [0, 5] as const)
      policies.push({ ...baseline, id: `${baseline.group}-rolling${window}-x${percent}-wait${wait}`,
        window, threshold: percent / 100, wait });
  }
  return policies;
}
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
async function bounded(path: string) { assert.ok((await stat(path)).size <= 16 * 1024 ** 2); return readFile(path, "utf8"); }
async function markdown(path: string, value: string) {
  await writeFile(`${path}.tmp`, value); await replaceFileAtomically(`${path}.tmp`, path);
}
async function main() {
  const source = join(root, "data/full-screen-6-15"), output = join(root, "output/peak-window");
  const input = JSON.parse(await bounded(join(source, "input.json"))) as {
    bars: FilterContext["bars"]; barsHash: string; settings: BacktestSettings; snapshots: { decisionIndex: number }[];
  };
  const saved = JSON.parse(await bounded(join(source, "signals.json"))) as {
    sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[];
  };
  const old = JSON.parse(await bounded(join(root, "output/peak-liquidation/summary.json"))) as {
    sourceHash: string; rows: { policy: PeakPolicy; targetHash: string; totalReturn: number }[];
  };
  const sourceHash = sha(JSON.stringify(input)); assert.equal(saved.sourceHash, sourceHash); assert.equal(old.sourceHash, sourceHash);
  assert.equal(sha(JSON.stringify(input.bars)), input.barsHash);
  assert.ok(input.bars.length <= 10000 && saved.rows.length <= 2048);
  assert.deepEqual(saved.rows.map(row => row.index), input.snapshots.map(row => row.decisionIndex));
  const implementationHash = sha((await Promise.all(["PEAK_WINDOW_DESIGN.md", "peak-window-study.ts", "peak-liquidation-study.ts",
    "oscillator-filter-study.ts", "oscillator-entry-study.ts", "dual-return-study.ts", "sma20-fallback.ts", "sma-entry-study.ts",
    "v-recovery-study.ts", "analyze.ts", "../nikkei-cycle-rallies/ma-type.ts", "../../lib/analysis/indicators.ts",
    "../../lib/analysis/sma-position-overlay.ts", "../../lib/analysis/backtest.ts", "../../lib/analysis/strategy-cycle-validation.ts"]
    .map(path => readFile(join(root, path), "utf8")))).join("\n"));
  const { bars, settings } = input, start = bars.length - 2000;
  const boundary = bars.findIndex(bar => bar.time === "2026-07-21") - start + 1; assert.equal(boundary, 1936);
  const context = new FilterContext(bars), decisions = new Map(saved.rows.map(row => [row.index, row.signals]));
  const menu = peakWindowMenu(); assert.equal(menu.length, 644);
  const run = (policy: PeakPolicy, detailed = false) => {
    const path = peakReplay(context, decisions, start, policy, detailed);
    const result = runStrategyCycleCloseBacktest(bars, path.targets, settings);
    return { path, result, row: { policy, cuts: path.cutCount, targetHash: sha(JSON.stringify(path.targets)),
      ...fallbackMetrics(result, settings.initialCash, boundary) } };
  };
  type Row = ReturnType<typeof run>["row"];
  const checkpoint = join(root, "data/peak-window/grid.json"); let rows: Row[] = [];
  try {
    const stored = JSON.parse(await bounded(checkpoint)); validatePeakProgress(stored, sourceHash, implementationHash, menu); rows = stored.rows;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const resumed = rows.length; let stopping = false;
  process.on("SIGINT", () => { stopping = true; }); process.on("SIGTERM", () => { stopping = true; });
  for (const policy of menu.slice(rows.length)) {
    if (stopping || process.memoryUsage().rss > 1.5 * 1024 ** 3) {
      await atomic(checkpoint, { sourceHash, implementationHash, rows }); throw new Error("Stopped safely; rerun rolling peak study");
    }
    rows.push(run(policy).row);
    if (rows.length % 20 === 0 || rows.length === menu.length) {
      await atomic(checkpoint, { sourceHash, implementationHash, rows }); console.log(`Rolling peak ${rows.length}/${menu.length}`);
      await new Promise<void>(done => setImmediate(done));
    }
  }
  const overlaps = rows.filter(row => row.policy.threshold === null || row.policy.window === 20);
  assert.equal(overlaps.length, 44);
  for (const row of overlaps) {
    const previous = old.rows.find(previous => previous.policy.id === row.policy.id)!;
    assert.ok(previous); assert.equal(row.targetHash, previous.targetHash); assert.equal(row.totalReturn, previous.totalReturn);
  }
  const groups = [];
  for (const group of ["native", "turn4", "rsi", "ema3"]) {
    const cases = rows.filter(row => row.policy.group === group), baseline = cases[0]!, additions = cases.slice(1);
    const affected = additions.filter(row => row.cuts > 0);
    const bestFull = [...affected].sort((left, right) => right.totalReturn - left.totalReturn)[0] ?? baseline;
    const bestDd = [...affected].sort((left, right) => right.maxDrawdown - left.maxDrawdown || right.totalReturn - left.totalReturn)[0] ?? baseline;
    const triple = (row: Row) => row.totalReturn > baseline.totalReturn + 1e-9 && row.final500.totalReturn > baseline.final500.totalReturn + 1e-9 &&
      row.maxDrawdown >= baseline.maxDrawdown - 1e-9;
    const qualifies = affected.filter(triple);
    const balanced = [...qualifies].sort((left, right) => Math.min(right.totalReturn - baseline.totalReturn,
      right.final500.totalReturn - baseline.final500.totalReturn) - Math.min(left.totalReturn - baseline.totalReturn,
      left.final500.totalReturn - baseline.final500.totalReturn))[0] ?? baseline;
    const development = [...cases].filter(row => row.first1500.maxDrawdown >= baseline.first1500.maxDrawdown - 1e-9)
      .sort((left, right) => right.first1500.totalReturn - left.first1500.totalReturn)[0]!;
    const selected = [];
    for (const [label, row] of [["baseline", baseline], ["best-full-affected", bestFull], ["best-dd-affected", bestDd],
      ["balanced", balanced], ["development", development]] as const) {
      const replay = run(row.policy, true); assert.deepEqual(replay.row, row);
      const next = runAllocationBacktest(bars, replay.path.targets, { ...settings, executionPolicy: "next-open" });
      const twice = runStrategyCycleCloseBacktest(bars, replay.path.targets, { ...settings,
        commissionRate: settings.commissionRate * 2, slippageRate: settings.slippageRate * 2 });
      const detail = { label, ...row, triple: triple(row), nextOpen: fallbackMetrics(next, settings.initialCash, boundary),
        doubleCost: fallbackMetrics(twice, settings.initialCash, boundary) };
      selected.push(detail);
      await atomic(join(output, `${group}-${label}.json`), { sourceHash, implementationHash, ...detail,
        targets: replay.path.targets, cuts: replay.path.cuts, result: replay.result });
    }
    groups.push({ group, affected: affected.length, unchanged: additions.filter(row => row.targetHash === baseline.targetHash).length,
      fullImproved: additions.filter(row => row.totalReturn > baseline.totalReturn + 1e-9).length,
      final500Improved: additions.filter(row => row.final500.totalReturn > baseline.final500.totalReturn + 1e-9).length,
      ddImproved: additions.filter(row => row.maxDrawdown > baseline.maxDrawdown + 1e-9).length,
      qualifies: qualifies.length, qualifyingPaths: new Set(qualifies.map(row => row.targetHash)).size, selected });
  }
  const summary = { sourceHash, implementationHash, generatedAt: new Date().toISOString(), resumed, cases: rows.length,
    start: bars[start]!.time, end: bars.at(-1)!.time, final500Start: bars[bars.length - 500]!.time,
    settings, overlapParity: overlaps.length, uniquePaths: new Set(rows.map(row => row.targetHash)).size, groups, rows,
    limitation: "Rolling5..20 held-close windows and X2..6%, wait0/5. Historical parameter selection on repeatedly explored data, not untouched validation. No added recovery rule, no intraday stop-line fill assumption." };
  await atomic(join(output, "summary.json"), summary);
  const header = "| Model | Label | Policy | Full % | Final500 % | DD magnitude % | Cuts |\n|---|---|---|---:|---:|---:|---:|\n";
  const line = (row: Row, label: string) => `| ${row.policy.group} | ${label} | ${row.policy.id} | ${row.totalReturn.toFixed(3)} | ${row.final500.totalReturn.toFixed(3)} | ${(-row.maxDrawdown).toFixed(3)} | ${row.cuts} |`;
  await markdown(join(output, "REPORT.md"), `# Held rolling5..20 peak liquidation\n\n${summary.start}..${summary.end}; final500 from${summary.final500Start}.644 cases,${summary.uniquePaths} paths,${overlaps.length} exact old-control/rolling20 matches. Resumed:${resumed}.\n\n${header}${groups.flatMap(group => group.selected.map(row => line(row, row.label))).join("\n")}\n\n${summary.limitation}\n\nAll640 additions and four controls are retained in GRID.md and summary.json. Baseline/first1500-only and execution/cost sensitivities are separate; no product change.\n`);
  await markdown(join(output, "GRID.md"), `# Full rolling peak grid\n\n${header}${rows.map(row => line(row, "case")).join("\n")}\n`);
  console.log(JSON.stringify({ resumed, cases: rows.length, paths: summary.uniquePaths, groups: groups.map(group => ({
    ...group, selected: group.selected.map(row => ({ label: row.label, id: row.policy.id, full: row.totalReturn,
      final500: row.final500.totalReturn, dd: row.maxDrawdown, cuts: row.cuts })) })) }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
