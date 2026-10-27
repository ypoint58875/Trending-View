import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atomic, root } from "./analyze";
import { DualContext, DualAccount, dualBaseline, dualMenu, dualReplay, validateDualProgress, meetsDualGoal, type DualPolicy } from "./dual-return-study";
import { fallbackMetrics, type FallbackPolicy } from "./sma20-fallback";
import { drawdownDates } from "./sma20-fallback-audit";
import { runStrategyCycleCloseBacktest, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest, type BacktestSettings } from "../../lib/analysis/backtest";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import type { MarketBar } from "../../lib/market/types";

export function extensionMenu(): DualPolicy[] {
  const policies = [{ ...dualBaseline }];
  for (const [id, reference] of [["any4-ema2", "daily4-ema2"], ["any4-ema3", "daily4-ema3"], ["any4-full2", "daily4-full2"],
    ["any3-ema3", "daily3-ema2"], ["any2d3-ema3", "daily2d3-ema2"], ["any3d3-ema3", "daily3d3-ema2"]]) {
    for (const existing of dualMenu().filter(policy => policy.entry.id === reference)) {
      const entry = { ...existing.entry, id, confirmation: reference === "daily4-full2" ? "full2" as const :
        id === "any4-ema2" ? "ema2" as const : "ema3" as const,
      base: { ...existing.entry.base, scope: "any" as const } };
      policies.push({ id: `${id}-${existing.exit}`, entry, exit: existing.exit });
    }
  }
  return policies;
}
export function omitAddedSpan(context: DualContext, decisions: ReadonlyMap<number, StrategyCycleRecentSignal[]>, start: number,
  policy: DualPolicy, from: number, through: number) {
  assert.ok(from >= start && through >= from && through < context.bars.length);
  let current = start;
  const base = new Proxy(policy.entry.base, { get: (target, property) => property === "kind" && current >= from && current <= through ?
    "baseline" : Reflect.get(target, property) }) as FallbackPolicy;
  const account = new DualAccount(context, { ...policy, entry: { ...policy.entry, base } }, start), targets = context.bars.map(() => 0);
  for (current = start; current < context.bars.length; current++) targets[current] = account.step(current, decisions.get(current) ?? []).target;
  return targets;
}
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
async function bounded(path: string) { assert.ok((await stat(path)).size <= 16 * 1024 ** 2); return readFile(path, "utf8"); }
async function main() {
  const output = join(root, "output/dual-return-extension"), data = join(root, "data/full-screen-6-15");
  const input = JSON.parse(await bounded(join(data, "input.json"))) as {
    bars: MarketBar[]; barsHash: string; accessedAt: string; settings: BacktestSettings; snapshots: { decisionIndex: number }[];
  };
  const saved = JSON.parse(await bounded(join(data, "signals.json"))) as {
    sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[];
  };
  const prior = JSON.parse(await bounded(join(root, "output/dual-return/summary.json")));
  const sourceHash = sha(JSON.stringify(input)); assert.equal(saved.sourceHash, sourceHash); assert.equal(prior.sourceHash, sourceHash);
  assert.equal(sha(JSON.stringify(input.bars)), input.barsHash);
  assert.ok(input.bars.length <= 10000 && saved.rows.length <= 2048); assert.equal(saved.rows.length, input.snapshots.length);
  const decisions = new Map(saved.rows.map((row, offset) => {
    assert.equal(row.index, input.snapshots[offset]!.decisionIndex); return [row.index, row.signals] as const;
  }));
  const implementationHash = sha(prior.implementationHash + (await Promise.all(["DUAL_RETURN_EXTENSION_DESIGN.md", "dual-return-extension.ts",
    "dual-return-study.ts", "sma20-fallback.ts", "sma20-fallback-audit.ts", "sma-entry-study.ts", "v-recovery-study.ts", "regime-tuning.ts",
    "analyze.ts", "../nikkei-cycle-rallies/ma-type.ts", "../../lib/analysis/indicators.ts", "../../lib/analysis/sma-position-overlay.ts",
    "../../lib/analysis/strategy-cycle-validation.ts", "../../lib/analysis/backtest.ts"].map(path => readFile(join(root, path), "utf8")))).join("\n"));
  const { bars, settings } = input, start = bars.length - 2000, context = new DualContext(bars);
  const cutoff = bars.findIndex(bar => bar.time === "2026-07-21"), boundary = cutoff - start + 1;
  assert.equal(boundary, 1936);
  const menu = extensionMenu(); assert.equal(menu.length, 55);
  const run = (policy: DualPolicy, detailed = false, enableFrom = start) => {
    const path = dualReplay(context, decisions, start, policy, detailed, enableFrom);
    const result = runStrategyCycleCloseBacktest(bars, path.targets, settings);
    return { ...path, result, row: { policy, counts: path.counts, targetHash: sha(JSON.stringify(path.targets)),
      ...fallbackMetrics(result, settings.initialCash, boundary) } };
  };
  for (const id of ["baseline", "turn4-baseline", "daily4-baseline"]) {
    const reference = prior.rows.find((row: { policy: DualPolicy }) => row.policy.id === id);
    assert.equal(run(reference.policy).row.targetHash, reference.targetHash);
  }
  const baseline = run(dualBaseline), checkpoint = join(root, "data/dual-return-extension/grid.json");
  type Row = typeof baseline.row;
  let rows: Row[] = [];
  try { const stored = JSON.parse(await bounded(checkpoint)); validateDualProgress(stored, sourceHash, implementationHash, menu); rows = stored.rows; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const resumed = rows.length; let stopping = false;
  process.on("SIGINT", () => { stopping = true; }); process.on("SIGTERM", () => { stopping = true; });
  const guard = async () => {
    if (stopping || process.memoryUsage().rss > 1.5 * 1024 ** 3) {
      await atomic(checkpoint, { sourceHash, implementationHash, rows }); throw new Error("Stopped safely; rerun scope-extension research");
    }
  };
  for (let offset = rows.length; offset < menu.length; offset++) {
    await guard(); rows.push(run(menu[offset]!).row);
    if (rows.length % 10 === 0 || rows.length === menu.length) {
      await atomic(checkpoint, { sourceHash, implementationHash, rows }); console.log(`Extension ${rows.length}/${menu.length}`);
      await new Promise<void>(done => setImmediate(done));
    }
  }
  assert.deepEqual(rows[0], baseline.row);
  const combined: Row[] = [...prior.rows, ...rows.slice(1)]; assert.equal(combined.length, 145);
  const ordinal = new Map(combined.map((row, index) => [row.policy.id, index]));
  const tie = (left: Row, right: Row) => ordinal.get(left.policy.id)! - ordinal.get(right.policy.id)!;
  const goals = combined.filter(row => meetsDualGoal(row, baseline.row));
  const noWorse = (row: Row) => row.maxDrawdown >= baseline.row.maxDrawdown - 1e-9;
  const gain = (row: Row) => Math.min(Math.log((100 + row.totalReturn) / (100 + baseline.row.totalReturn)),
    Math.log((100 + row.final500.totalReturn) / (100 + baseline.row.final500.totalReturn)));
  const order = (left: Row, right: Row) => Number(noWorse(right)) - Number(noWorse(left)) || gain(right) - gain(left) || tie(left, right);
  const ranked = [...goals].sort(order);
  const allThree = goals.filter(row => row.recent.totalReturn > baseline.row.recent.totalReturn + 1e-9).sort(order);
  const recent = [...goals].sort((left, right) => right.recent.totalReturn - left.recent.totalReturn || order(left, right));
  const development = combined.filter(row => row.first1500.maxDrawdown >= baseline.row.first1500.maxDrawdown - 1e-9)
    .sort((left, right) => right.first1500.totalReturn - left.first1500.totalReturn || tie(left, right))[0]!;
  const selections = [["baseline", rows[0]!], ["goal", ranked[0] ?? rows[0]!], ["all-three", allThree[0] ?? rows[0]!],
    ["goal-recent", recent[0] ?? rows[0]!], ["primary", rows.find(row => row.policy.id === "any4-ema3-baseline")!], ["development", development]] as const;
  const selected = [];
  for (const [label, row] of selections) {
    await guard(); const path = run(row.policy, true); assert.deepEqual(path.row, row);
    const compact = runStrategyCycleCloseBacktest(bars, path.targets, { ...settings, summaryOnly: true });
    assert.equal(path.result.totalReturn, compact.totalReturn); assert.equal(path.result.maxDrawdown, compact.maxDrawdown);
    const twice = runStrategyCycleCloseBacktest(bars, path.targets, { ...settings,
      commissionRate: settings.commissionRate * 2, slippageRate: settings.slippageRate * 2 });
    const next = runAllocationBacktest(bars, path.targets, { ...settings, executionPolicy: "next-open" });
    const common = run(row.policy, false, cutoff + 1);
    assert.deepEqual(common.targets.slice(0, cutoff + 1), baseline.targets.slice(0, cutoff + 1));
    const detail = { label, ...row, doubleCost: fallbackMetrics(twice, settings.initialCash, boundary),
      nextOpen: fallbackMetrics(next, settings.initialCash, boundary), commonState: common.row,
      fullDrawdown: drawdownDates(path.result, settings.initialCash), recentDrawdown: drawdownDates(path.result, settings.initialCash, boundary),
      added: path.daily.filter(day => day.added), localExits: path.daily.filter(day => day.localExit !== null),
      recentEvents: path.daily.filter(day => day.time > "2026-07-21" && (day.entered || day.localExit !== null || day.cut)) };
    selected.push(detail);
    await atomic(join(output, `${label}.json`), { sourceHash, implementationHash, ...detail, targets: path.targets, result: path.result, daily: path.daily });
  }
  const winner = selected.find(row => row.label === "goal")!, winnerPath = run(winner.policy, true), omissions = [];
  for (let offset = 0; offset < winnerPath.daily.length; offset++) {
    const event = winnerPath.daily[offset]!; if (!event.added) continue;
    await guard(); let end = offset + 1;
    while (end < winnerPath.daily.length && winnerPath.daily[end]!.tagged && winnerPath.daily[end]!.target > 1e-10) end++;
    end = Math.min(end, winnerPath.daily.length - 1);
    const targets = omitAddedSpan(context, decisions, start, winner.policy, start + offset, start + end);
    assert.deepEqual(targets.slice(0, start + offset), winnerPath.targets.slice(0, start + offset));
    const result = runStrategyCycleCloseBacktest(bars, targets, settings);
    omissions.push({ entry: event.time, through: winnerPath.daily[end]!.time, ...fallbackMetrics(result, settings.initialCash, boundary) });
  }
  const summary = { sourceHash, implementationHash, priorImplementationHash: prior.implementationHash, menuHash: sha(JSON.stringify(menu)),
    generatedAt: new Date().toISOString(), sourceAccessedAt: input.accessedAt, start: bars[start]!.time, end: bars.at(-1)!.time,
    final500Start: bars[start + 1500]!.time, settings, resumed, original: 91, additions: 54, combined: combined.length,
    uniquePaths: new Set(combined.map(row => row.targetHash)).size, goals: goals.length, goalPaths: new Set(goals.map(row => row.targetHash)).size,
    noWorseDdGoals: goals.filter(noWorse).length, allThreeGoals: allThree.length, allThreePaths: new Set(allThree.map(row => row.targetHash)).size,
    development: development.policy.id, selected, omissions, rows: combined,
    limitation: "Second-stage scope extension is informed by original91 results. Full/final500 are repeatedly explored history, not independent validation or future guarantees. No live policy change; omissions are retrospective nonadditive actual-account diagnostics." };
  await atomic(join(output, "summary.json"), summary);
  const table = selected.map(row => `| ${row.label} | ${row.policy.id} | ${row.totalReturn.toFixed(3)} | ${row.final500.totalReturn.toFixed(3)} | ${row.maxDrawdown.toFixed(3)} | ${row.recent.totalReturn.toFixed(3)} | ${row.recent.maxDrawdown.toFixed(3)} | ${row.counts.added}/${row.counts.localExits} |`).join("\n");
  const sensitivity = selected.map(row => `| ${row.label} | ${row.doubleCost.totalReturn.toFixed(3)} | ${row.doubleCost.final500.totalReturn.toFixed(3)} | ${row.nextOpen.totalReturn.toFixed(3)} | ${row.nextOpen.final500.totalReturn.toFixed(3)} | ${row.commonState.recent.totalReturn.toFixed(3)} |`).join("\n");
  const omissionTable = omissions.map(row => `| ${row.entry} | ${row.through} | ${row.totalReturn.toFixed(3)} | ${row.final500.totalReturn.toFixed(3)} | ${row.recent.totalReturn.toFixed(3)} |`).join("\n");
  const report = `# Confirmed rebound scope extension and dual-return results\n\n91 original+54 declared second-stage cases=${combined.length};${summary.uniquePaths} distinct targets. Identical2018-08-09..2026-10-26 boundary and original costs; final500 starts2024-10-04. Dual-goal cases:${goals.length} (${summary.goalPaths} paths), no-worse-full-DD:${summary.noWorseDdGoals}; all-three cases:${allThree.length} (${summary.allThreePaths} paths). Resumed extension rows:${resumed}.\n\n| Selection | Policy | Full % | Final500 % | Full DD % | PostJuly21 % | Recent DD % | Added/local exits |\n|---|---|---:|---:|---:|---:|---:|---:|\n${table}\n\n## Execution sensitivity\n\n| Selection | Double-cost full % | Double-cost final500 % | Next-open full % | Next-open final500 % | Common-state recent % |\n|---|---:|---:|---:|---:|---:|\n${sensitivity}\n\nCompare with corresponding baseline execution/cost row. First1500-only selection:${development.policy.id}; do not hide its final500 result. Detailed ledgers list every extra entry and local exit. Initial91 and their checkpoint are retained unchanged; second stage only removes the below-SMA20 restriction after independent confirmation.\n\n## Winner added-episode omission\n\nSuppress extra entries until the selected episode's native handoff/exit, leaving native actions enabled and replaying all subsequent actual account state. These evaluator-only counterfactuals are nonadditive, never live date rules.\n\n| Suppressed entry | Through | Full % | Final500 % | Recent % |\n|---|---|---:|---:|---:|\n${omissionTable}\n\n${summary.limitation}\n`;
  await writeFile(join(output, "REPORT.md.tmp"), report); await replaceFileAtomically(join(output, "REPORT.md.tmp"), join(output, "REPORT.md"));
  console.log(JSON.stringify({ goals: summary.goals, goalPaths: summary.goalPaths, allThree: summary.allThreeGoals, resumed,
    selected: selected.map(row => ({ label: row.label, id: row.policy.id, full: row.totalReturn,
      final500: row.final500.totalReturn, dd: row.maxDrawdown, recent: row.recent.totalReturn, counts: row.counts })) }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
