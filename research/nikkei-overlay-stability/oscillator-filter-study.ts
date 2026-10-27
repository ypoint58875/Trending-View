import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atomic, root } from "./analyze";
import { DualAccount, DualContext, dualBaseline, dualMenu, type DualPolicy } from "./dual-return-study";
import { OscillatorContext, oscillatorEvidence, oscillatorSignal, oscillatorMenu, type OscillatorPolicy } from "./oscillator-entry-study";
import { fallbackMetrics, type FallbackPolicy } from "./sma20-fallback";
import { runStrategyCycleCloseBacktest, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest, type BacktestSettings } from "../../lib/analysis/backtest";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import type { MarketBar } from "../../lib/market/types";

export interface FilterPolicy { id: string; entry: DualPolicy; profile: OscillatorPolicy["profile"] }
export function filterMenu(): FilterPolicy[] {
  const rows: FilterPolicy[] = [{ id: "baseline", entry: dualBaseline, profile: "off" }];
  const profiles = [...new Set(oscillatorMenu().slice(1).map(policy => policy.profile))];
  for (const id of ["turn4-baseline", "daily4-ema3-baseline"]) {
    const entry = dualMenu().find(policy => policy.id === id)!;
    rows.push({ id: `${id}-unfiltered`, entry, profile: "off" });
    for (const profile of profiles) rows.push({ id: `${id}-${profile}`, entry, profile });
  }
  return rows;
}
export class FilterContext extends DualContext {
  readonly oscillators;
  constructor(bars: MarketBar[]) { super(bars); this.oscillators = new OscillatorContext(bars); }
}
export class FilterAccount {
  readonly account: DualAccount;
  private currentIndex = 0;
  constructor(readonly context: FilterContext, readonly policy: FilterPolicy, start: number, enableFrom = start) {
    const base = new Proxy(policy.entry.entry.base, { get: (target, property) => {
      if (property === "kind" && policy.profile !== "off" && !oscillatorSignal(policy.profile,
        oscillatorEvidence(context.oscillators, this.currentIndex, this.account.inner.flatStart))) return "baseline";
      return Reflect.get(target, property);
    } }) as FallbackPolicy;
    this.account = new DualAccount(context, { ...policy.entry, entry: { ...policy.entry.entry, base } }, start, enableFrom);
  }
  step(index: number, signals: readonly StrategyCycleRecentSignal[]) {
    this.currentIndex = index;
    const evidence = oscillatorEvidence(this.context.oscillators, index, this.account.inner.flatStart);
    const state = this.account.step(index, signals);
    return { ...state, filterPassed: this.policy.profile === "off" || oscillatorSignal(this.policy.profile, evidence), evidence };
  }
}
export function filterReplay(context: FilterContext, decisions: ReadonlyMap<number, StrategyCycleRecentSignal[]>, start: number,
  policy: FilterPolicy, detailed = false, enableFrom = start) {
  const account = new FilterAccount(context, policy, start, enableFrom), targets = context.bars.map(() => 0), daily = [];
  let added = 0;
  for (let index = start; index < context.bars.length; index++) {
    const signals = decisions.get(index) ?? [], state = account.step(index, signals); targets[index] = state.target;
    assert.ok(state.target >= 0 && state.target <= 1); added += Number(state.added);
    if (state.added) assert.ok(state.before <= 1e-10 && signals.length === 0 && state.filterPassed);
    if (detailed) daily.push({ time: context.bars[index]!.time, ...state });
  }
  return { targets, daily, added };
}
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
async function bounded(path: string) { assert.ok((await stat(path)).size <= 16 * 1024 ** 2); return readFile(path, "utf8"); }
async function main() {
  const source = join(root, "data/full-screen-6-15"), output = join(root, "output/oscillator-filter");
  const input = JSON.parse(await bounded(join(source, "input.json"))) as {
    bars: MarketBar[]; barsHash: string; accessedAt: string; settings: BacktestSettings; snapshots: { decisionIndex: number }[];
  };
  const saved = JSON.parse(await bounded(join(source, "signals.json"))) as {
    sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[];
  };
  const prior = JSON.parse(await bounded(join(root, "output/dual-return/summary.json")));
  const sourceHash = sha(JSON.stringify(input)); assert.equal(saved.sourceHash, sourceHash); assert.equal(prior.sourceHash, sourceHash);
  assert.equal(sha(JSON.stringify(input.bars)), input.barsHash);
  assert.ok(input.bars.length <= 10000 && saved.rows.length <= 2048); assert.equal(saved.rows.length, input.snapshots.length);
  const decisions = new Map(saved.rows.map((row, offset) => {
    assert.equal(row.index, input.snapshots[offset]!.decisionIndex); return [row.index, row.signals] as const;
  }));
  const implementationHash = sha(prior.implementationHash + (await Promise.all(["OSCILLATOR_FILTER_DESIGN.md", "oscillator-filter-study.ts",
    "oscillator-entry-study.ts", "OSCILLATOR_ENTRY_DESIGN.md", "dual-return-study.ts", "sma20-fallback.ts", "sma20-fallback-audit.ts",
    "sma-entry-study.ts", "v-recovery-study.ts", "regime-tuning.ts", "analyze.ts", "../nikkei-cycle-rallies/ma-type.ts",
    "../../lib/analysis/indicators.ts", "../../lib/analysis/sma-position-overlay.ts", "../../lib/analysis/strategy-cycle-validation.ts",
    "../../lib/analysis/backtest.ts"].map(path => readFile(join(root, path), "utf8")))).join("\n"));
  const { bars, settings } = input, start = bars.length - 2000, context = new FilterContext(bars);
  const cutoff = bars.findIndex(bar => bar.time === "2026-07-21"), boundary = cutoff - start + 1;
  assert.equal(boundary, 1936);
  const menu = filterMenu(); assert.equal(menu.length, 23);
  const run = (policy: FilterPolicy, detailed = false, enableFrom = start) => {
    const path = filterReplay(context, decisions, start, policy, detailed, enableFrom);
    const result = runStrategyCycleCloseBacktest(bars, path.targets, settings);
    return { ...path, result, row: { policy, added: path.added, targetHash: sha(JSON.stringify(path.targets)),
      ...fallbackMetrics(result, settings.initialCash, boundary) } };
  };
  const baseline = run(menu[0]!);
  for (const policy of menu.filter(row => row.profile === "off")) {
    const previous = prior.rows.find((row: { policy: DualPolicy }) => row.policy.id === policy.entry.id);
    assert.equal(run(policy).row.targetHash, previous.targetHash);
  }
  type Row = typeof baseline.row;
  const checkpoint = join(root, "data/oscillator-filter/grid.json"); let rows: Row[] = [];
  try {
    const stored = JSON.parse(await bounded(checkpoint));
    assert.equal(stored.sourceHash, sourceHash, "Filter source mismatch; preserve previous state");
    assert.equal(stored.implementationHash, implementationHash, "Filter implementation mismatch; preserve previous state");
    assert.ok(Array.isArray(stored.rows) && stored.rows.length <= menu.length);
    stored.rows.forEach((row: Row, index: number) => assert.deepEqual(row.policy, menu[index], "Filter order/configuration mismatch"));
    rows = stored.rows;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const resumed = rows.length; let stopping = false;
  process.on("SIGINT", () => { stopping = true; }); process.on("SIGTERM", () => { stopping = true; });
  for (let offset = rows.length; offset < menu.length; offset++) {
    if (stopping || process.memoryUsage().rss > 1.5 * 1024 ** 3) {
      await atomic(checkpoint, { sourceHash, implementationHash, rows }); throw new Error("Stopped safely; rerun finite oscillator filters");
    }
    rows.push(run(menu[offset]!).row);
    if (rows.length % 10 === 0 || rows.length === menu.length) {
      await atomic(checkpoint, { sourceHash, implementationHash, rows }); console.log(`Filters ${rows.length}/${menu.length}`);
      await new Promise<void>(done => setImmediate(done));
    }
  }
  assert.deepEqual(rows[0], baseline.row);
  const goal = (row: Row) => row.totalReturn > baseline.row.totalReturn + 1e-9 && row.final500.totalReturn > baseline.row.final500.totalReturn + 1e-9;
  const ordinal = new Map(menu.map((policy, index) => [policy.id, index]));
  const tie = (left: Row, right: Row) => ordinal.get(left.policy.id)! - ordinal.get(right.policy.id)!;
  const gain = (row: Row) => Math.min(Math.log((100 + row.totalReturn) / (100 + baseline.row.totalReturn)),
    Math.log((100 + row.final500.totalReturn) / (100 + baseline.row.final500.totalReturn)));
  const order = (left: Row, right: Row) => Number(right.maxDrawdown >= baseline.row.maxDrawdown - 1e-9) -
    Number(left.maxDrawdown >= baseline.row.maxDrawdown - 1e-9) || gain(right) - gain(left) || tie(left, right);
  const goals = rows.filter(goal).sort(order);
  const controls = rows.filter(row => row.policy.profile === "off");
  const selectFamily = (family: "rsi" | "bb") => {
    const members = rows.filter(row => row.policy.profile.startsWith(family));
    return members.filter(goal).sort(order)[0] ?? members.sort((left, right) => right.totalReturn - left.totalReturn || tie(left, right))[0]!;
  };
  const development = rows.filter(row => row.first1500.maxDrawdown >= baseline.row.first1500.maxDrawdown - 1e-9)
    .sort((left, right) => right.first1500.totalReturn - left.first1500.totalReturn || tie(left, right))[0]!;
  const selections = [["baseline", rows[0]!], ["turn-control", rows[1]!], ["ema3-control", rows.find(row => row.policy.id === "daily4-ema3-baseline-unfiltered")!],
    ["goal", goals[0] ?? rows[0]!], ["rsi", selectFamily("rsi")], ["bands", selectFamily("bb")], ["development", development]] as const;
  const selected = [];
  for (const [label, row] of selections) {
    const path = run(row.policy, true); assert.deepEqual(path.row, row);
    const compact = runStrategyCycleCloseBacktest(bars, path.targets, { ...settings, summaryOnly: true });
    assert.equal(path.result.totalReturn, compact.totalReturn); assert.equal(path.result.maxDrawdown, compact.maxDrawdown);
    const twice = runStrategyCycleCloseBacktest(bars, path.targets, { ...settings,
      commissionRate: settings.commissionRate * 2, slippageRate: settings.slippageRate * 2 });
    const next = runAllocationBacktest(bars, path.targets, { ...settings, executionPolicy: "next-open" });
    const common = run(row.policy, false, cutoff + 1);
    assert.deepEqual(common.targets.slice(0, cutoff + 1), baseline.targets.slice(0, cutoff + 1));
    const control = controls.find(control => control.policy.entry.id === row.policy.entry.id)!;
    const detail = { label, ...row, passesGoal: goal(row), deltaFullFromControl: row.totalReturn - control.totalReturn,
      deltaFinal500FromControl: row.final500.totalReturn - control.final500.totalReturn,
      doubleCost: fallbackMetrics(twice, settings.initialCash, boundary), nextOpen: fallbackMetrics(next, settings.initialCash, boundary),
      commonState: common.row, addedEntries: path.daily.filter(day => day.added), recentEvents: path.daily.filter(day => day.time > "2026-07-21" && (day.entered || day.cut)) };
    selected.push(detail);
    await atomic(join(output, `${label}.json`), { sourceHash, implementationHash, ...detail, targets: path.targets, result: path.result, daily: path.daily });
  }
  const summary = { sourceHash, implementationHash, menuHash: sha(JSON.stringify(menu)), generatedAt: new Date().toISOString(),
    sourceAccessedAt: input.accessedAt, start: bars[start]!.time, end: bars.at(-1)!.time, settings, resumed, candidates: rows.length,
    goals: goals.length, goalPaths: new Set(goals.map(row => row.targetHash)).size,
    uniquePaths: new Set(rows.map(row => row.targetHash)).size, allThree: goals.filter(row => row.recent.totalReturn > baseline.row.recent.totalReturn + 1e-9).length,
    addedFilterDualBenefits: rows.filter(row => row.policy.profile !== "off" && (() => {
      const control = controls.find(control => control.policy.entry.id === row.policy.entry.id)!;
      return row.totalReturn > control.totalReturn + 1e-9 && row.final500.totalReturn > control.final500.totalReturn + 1e-9;
    })()).map(row => row.policy.id), selected, rows,
    limitation: "Post-result role comparison on repeatedly explored frozen history. Separate native-baseline acceptance from marginal benefit versus each rebound control. No future guarantee or product changes." };
  await atomic(join(output, "summary.json"), summary);
  const table = selected.map(row => `| ${row.label} | ${row.policy.id} | ${row.passesGoal} | ${row.totalReturn.toFixed(3)} | ${row.final500.totalReturn.toFixed(3)} | ${row.maxDrawdown.toFixed(3)} | ${row.recent.totalReturn.toFixed(3)} | ${row.deltaFullFromControl.toFixed(3)} | ${row.deltaFinal500FromControl.toFixed(3)} | ${row.added} |`).join("\n");
  const report = `# Oscillator filters on rebound entrances\n\n23 declared second-stage cases,${summary.uniquePaths} distinct targets. Dual goals versus native:${summary.goals} (${summary.goalPaths} paths); full/final500/recent goals:${summary.allThree}. Filters improving both their own rebound-control metrics:${summary.addedFilterDualBenefits.length}. Resumed:${resumed}.\n\n| Selection | Policy | Native dual goal | Full % | Final500 % | DD % | Recent % | Delta full/control pp | Delta final500/control pp | Added |\n|---|---|---|---:|---:|---:|---:|---:|---:|---:|\n${table}\n\nFirst1500-only choice:${development.policy.id}. Original61 independent entrances remain separate. Source/code/menu identities, all cases, added entries and double-cost/next-open/common-state sensitivity are retained in summary/per-case JSON. Read OSCILLATOR_FILTER_DESIGN.md for exact role boundaries.\n\n${summary.limitation}\n`;
  await writeFile(join(output, "REPORT.md.tmp"), report); await replaceFileAtomically(join(output, "REPORT.md.tmp"), join(output, "REPORT.md"));
  console.log(JSON.stringify({ goals: summary.goals, goalPaths: summary.goalPaths, filterDualBenefits: summary.addedFilterDualBenefits,
    resumed, selected: selected.map(row => ({ label: row.label, id: row.policy.id, full: row.totalReturn,
      final500: row.final500.totalReturn, dd: row.maxDrawdown, recent: row.recent.totalReturn, added: row.added })) }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
