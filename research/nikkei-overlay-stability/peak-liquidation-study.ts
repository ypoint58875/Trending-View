import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atomic, root } from "./analyze";
import { FilterAccount, FilterContext, filterMenu, type FilterPolicy } from "./oscillator-filter-study";
import { fallbackMetrics } from "./sma20-fallback";
import { runStrategyCycleCloseBacktest, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest, type BacktestSettings } from "../../lib/analysis/backtest";
import { replaceFileAtomically } from "../../scripts/atomic-file";

export interface PeakPolicy { id: string; group: string; entry: FilterPolicy; window: number; threshold: number | null; wait: 0 | 5 }
export function peakMenu(): PeakPolicy[] {
  const entries = filterMenu(), policies: PeakPolicy[] = [];
  for (const [group, id] of [["native", "baseline"], ["turn4", "turn4-baseline-unfiltered"],
    ["rsi", "turn4-baseline-rsi35-40"], ["ema3", "daily4-ema3-baseline-unfiltered"]]) {
    const entry = entries.find(row => row.id === id)!;
    policies.push({ id: `${group}-baseline`, group: group!, entry, window: 0, threshold: null, wait: 0 });
    for (const window of [0, 20] as const) for (const percent of [2, 3, 4, 5, 6, 7, 8, 10, 12, 15]) for (const wait of [0, 5] as const)
      policies.push({ id: `${group}-${window === 0 ? "episode" : "rolling20"}-x${percent}-wait${wait}`,
        group: group!, entry, window, threshold: percent / 100, wait });
  }
  return policies;
}
export class PeakLiquidationAccount {
  readonly inner: FilterAccount;
  enteredAt: number | null = null;
  peak = 0;
  constructor(readonly context: FilterContext, readonly policy: PeakPolicy, start: number) {
    this.inner = new FilterAccount(context, policy.entry, start);
  }
  step(index: number, signals: readonly StrategyCycleRecentSignal[]) {
    const fallback = this.inner.account.inner, raw = fallback.account, before = raw.account.allocation;
    const native = this.inner.step(index, signals), close = this.context.bars[index]!.close;
    if (before <= 1e-10 && native.target > 1e-10) { this.enteredAt = index; this.peak = close; }
    if (native.target <= 1e-10) { this.enteredAt = null; this.peak = 0; }
    let peakCut = false;
    if (this.enteredAt !== null && native.target > 1e-10) {
      this.peak = Math.max(this.peak, close);
      if (this.policy.window > 0) {
        this.peak = 0;
        for (let cursor = Math.max(this.enteredAt, index - this.policy.window + 1); cursor <= index; cursor++)
          this.peak = Math.max(this.peak, this.context.bars[cursor]!.close);
      }
      peakCut = before > 1e-10 && this.policy.threshold !== null && close <= this.peak * (1 - this.policy.threshold);
      if (peakCut) {
        raw.account.allocation = 0; raw.account.pending = null; raw.lastSupplement = null;
        raw.enteredAt = null; raw.entryClose = 0; raw.recoveryTarget = null; raw.riskCut = false;
        raw.cutIndex = index; raw.blockedUntil = Math.max(raw.blockedUntil, index + this.policy.wait + 1);
        fallback.flatStart = index; fallback.flatCause = "peak-liquidation";
      }
    }
    const peak = this.peak;
    if (peakCut) { this.enteredAt = null; this.peak = 0; }
    return { ...native, target: raw.account.allocation, peakCut, peak, blockedUntil: raw.blockedUntil };
  }
}
export function peakReplay(context: FilterContext, decisions: ReadonlyMap<number, StrategyCycleRecentSignal[]>, start: number,
  policy: PeakPolicy, detailed = false) {
  const account = new PeakLiquidationAccount(context, policy, start), targets = context.bars.map(() => 0);
  const cuts: { time: string; close: number; peak: number }[] = [];
  for (let index = start; index < context.bars.length; index++) {
    const state = account.step(index, decisions.get(index) ?? []); targets[index] = state.target;
    if (state.peakCut) cuts.push({ time: context.bars[index]!.time, close: context.bars[index]!.close, peak: state.peak });
    assert.ok(state.target >= 0 && state.target <= 1);
  }
  return { targets, cutCount: cuts.length, ...(detailed ? { cuts } : {}) };
}
export function validatePeakProgress(saved: { sourceHash: string; implementationHash: string; rows: { policy: PeakPolicy }[] },
  sourceHash: string, implementationHash: string, menu: PeakPolicy[]) {
  assert.equal(saved.sourceHash, sourceHash, "Peak source mismatch; preserve checkpoint");
  assert.equal(saved.implementationHash, implementationHash, "Peak implementation mismatch; preserve checkpoint");
  assert.ok(saved.rows.length <= menu.length);
  saved.rows.forEach((row, offset) => assert.deepEqual(row.policy, menu[offset], "Peak ordered policy mismatch"));
}
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
async function bounded(path: string) { assert.ok((await stat(path)).size <= 16 * 1024 ** 2); return readFile(path, "utf8"); }
async function main() {
  const source = join(root, "data/full-screen-6-15"), output = join(root, "output/peak-liquidation");
  const input = JSON.parse(await bounded(join(source, "input.json"))) as {
    bars: FilterContext["bars"]; barsHash: string; settings: BacktestSettings; snapshots: { decisionIndex: number }[];
  };
  const saved = JSON.parse(await bounded(join(source, "signals.json"))) as {
    sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[];
  };
  const reference = JSON.parse(await bounded(join(root, "output/oscillator-filter/summary.json")));
  const sourceHash = sha(JSON.stringify(input)); assert.equal(saved.sourceHash, sourceHash); assert.equal(reference.sourceHash, sourceHash);
  assert.equal(sha(JSON.stringify(input.bars)), input.barsHash);
  assert.ok(input.bars.length <= 10000 && saved.rows.length <= 2048);
  assert.deepEqual(saved.rows.map(row => row.index), input.snapshots.map(snapshot => snapshot.decisionIndex));
  const implementationHash = sha((await Promise.all(["PEAK_LIQUIDATION_DESIGN.md", "peak-liquidation-study.ts", "oscillator-filter-study.ts",
    "oscillator-entry-study.ts", "dual-return-study.ts", "sma20-fallback.ts", "sma-entry-study.ts", "v-recovery-study.ts",
    "analyze.ts", "../nikkei-cycle-rallies/ma-type.ts", "../../lib/analysis/indicators.ts", "../../lib/analysis/sma-position-overlay.ts",
    "../../lib/analysis/backtest.ts", "../../lib/analysis/strategy-cycle-validation.ts"].map(path => readFile(join(root, path), "utf8")))).join("\n"));
  const context = new FilterContext(input.bars), start = input.bars.length - 2000, { bars, settings } = input;
  const boundary = bars.findIndex(bar => bar.time === "2026-07-21") - start + 1; assert.equal(boundary, 1936);
  const decisions = new Map(saved.rows.map(row => [row.index, row.signals]));
  const menu = peakMenu(); assert.equal(menu.length, 164);
  const run = (policy: PeakPolicy, detailed = false) => {
    const path = peakReplay(context, decisions, start, policy, detailed);
    const result = runStrategyCycleCloseBacktest(bars, path.targets, settings);
    return { path, result, row: { policy, cuts: path.cutCount, targetHash: sha(JSON.stringify(path.targets)),
      ...fallbackMetrics(result, settings.initialCash, boundary) } };
  };
  type Row = ReturnType<typeof run>["row"];
  const checkpoint = join(root, "data/peak-liquidation/grid.json"); let rows: Row[] = [];
  try {
    const stored = JSON.parse(await bounded(checkpoint)); validatePeakProgress(stored, sourceHash, implementationHash, menu); rows = stored.rows;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const resumed = rows.length; let stopping = false;
  process.on("SIGINT", () => { stopping = true; }); process.on("SIGTERM", () => { stopping = true; });
  for (const policy of menu.slice(rows.length)) {
    if (stopping || process.memoryUsage().rss > 1.5 * 1024 ** 3) {
      await atomic(checkpoint, { sourceHash, implementationHash, rows }); throw new Error("Stopped safely; rerun peak liquidation");
    }
    rows.push(run(policy).row);
    if (rows.length % 20 === 0 || rows.length === menu.length) {
      await atomic(checkpoint, { sourceHash, implementationHash, rows }); console.log(`Peak policies ${rows.length}/${menu.length}`);
      await new Promise<void>(done => setImmediate(done));
    }
  }
  const groups = [];
  for (const group of ["native", "turn4", "rsi", "ema3"]) {
    const cases = rows.filter(row => row.policy.group === group), baseline = cases[0]!;
    const old = reference.rows.find((row: { policy: FilterPolicy }) => row.policy.id === baseline.policy.entry.id)!;
    assert.equal(baseline.targetHash, old.targetHash); assert.equal(baseline.totalReturn, old.totalReturn);
    const noWorseDd = (row: Row) => row.maxDrawdown >= baseline.maxDrawdown - 1e-9;
    const triple = (row: Row) => row.totalReturn > baseline.totalReturn + 1e-9 &&
      row.final500.totalReturn > baseline.final500.totalReturn + 1e-9 && noWorseDd(row);
    const bestFull = [...cases].sort((left, right) => right.totalReturn - left.totalReturn)[0]!;
    const qualify = cases.filter(triple);
    const score = (row: Row) => Math.min(Math.log((100 + row.totalReturn) / (100 + baseline.totalReturn)),
      Math.log((100 + row.final500.totalReturn) / (100 + baseline.final500.totalReturn)));
    const balanced = [...qualify].sort((left, right) => score(right) - score(left))[0] ?? baseline;
    const development = cases.filter(row => row.first1500.maxDrawdown >= baseline.first1500.maxDrawdown - 1e-9)
      .sort((left, right) => right.first1500.totalReturn - left.first1500.totalReturn)[0]!;
    const selected = [];
    for (const [label, row] of [["baseline", baseline], ["best-full", bestFull], ["balanced", balanced], ["development", development]] as const) {
      const actual = run(row.policy, true); assert.deepEqual(actual.row, row);
      const next = runAllocationBacktest(bars, actual.path.targets, { ...settings, executionPolicy: "next-open" });
      const twice = runStrategyCycleCloseBacktest(bars, actual.path.targets, { ...settings,
        commissionRate: settings.commissionRate * 2, slippageRate: settings.slippageRate * 2 });
      const detail = { label, ...row, triple: triple(row), nextOpen: fallbackMetrics(next, settings.initialCash, boundary),
        doubleCost: fallbackMetrics(twice, settings.initialCash, boundary) };
      selected.push(detail);
      await atomic(join(output, `${group}-${label}.json`), { sourceHash, implementationHash, ...detail,
        targets: actual.path.targets, cuts: actual.path.cuts, result: actual.result });
    }
    groups.push({ group, qualifyingCases: qualify.length, qualifyingPaths: new Set(qualify.map(row => row.targetHash)).size, selected });
  }
  const summary = { sourceHash, implementationHash, generatedAt: new Date().toISOString(), start: bars[start]!.time,
    end: bars.at(-1)!.time, final500Start: bars[bars.length - 500]!.time, settings, resumed, cases: rows.length,
    uniquePaths: new Set(rows.map(row => row.targetHash)).size, groups, rows,
    limitation: "All best parameters are selected on repeatedly explored frozen history. Development selection uses first1500 only, not independent future validation. Same completed-close intents for next-open sensitivity. New peak exits have no added automatic recovery." };
  await atomic(join(output, "summary.json"), summary);
  const table = groups.flatMap(group => group.selected.map(row => `| ${group.group} | ${row.label} | ${row.policy.id} | ${row.totalReturn.toFixed(3)} | ${row.final500.totalReturn.toFixed(3)} | ${row.maxDrawdown.toFixed(3)} | ${row.recent.totalReturn.toFixed(3)} | ${row.cuts} | ${row.triple} |`)).join("\n");
  await writeFile(join(output, "REPORT.md.tmp"), `# Additive peak liquidation on four requested strategies\n\n${summary.start}..${summary.end}; final500 from${summary.final500Start};164 cases,${summary.uniquePaths} target paths. Resumed:${resumed}. Fees unchanged; Nikkei completed-close proxy.\n\n| Strategy | Selection | Policy | Full % | Final500 % | DD % | Recent % | Cuts | Both returns/no-worse DD |\n|---|---|---|---:|---:|---:|---:|---:|---|\n${table}\n\nEpisode peak or rolling20 held-close peak; no pre-entry highs. Threshold2/3/4/5/6/7/8/10/12/15%, wait0/5. Wait0 permits native entries next bar; wait5 permits sixth bar; no added recovery buy. Native stops/exits remain active.\n\n${summary.limitation}\n\nAll cases, costs, next-open and development-only selections are retained in summary/selected ledgers. Read PEAK_LIQUIDATION_DESIGN.md for exact rules.\n`);
  await replaceFileAtomically(join(output, "REPORT.md.tmp"), join(output, "REPORT.md"));
  console.log(JSON.stringify({ resumed, cases: rows.length, groups: groups.map(group => ({ group: group.group,
    qualifiers: group.qualifyingCases, selected: group.selected.map(row => ({ label: row.label, id: row.policy.id,
      full: row.totalReturn, final500: row.final500.totalReturn, dd: row.maxDrawdown, recent: row.recent.totalReturn, cuts: row.cuts })) })) }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
