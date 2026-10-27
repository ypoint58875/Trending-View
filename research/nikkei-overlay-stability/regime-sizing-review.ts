import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atomic, pathMetrics, root } from "./analyze";
import { SizingContext, SizedAccount, baselinePolicy, sizingMenu, type RiskPolicy } from "./regime-sizing";
import { runStrategyCycleCloseBacktest, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest, type AllocationBacktestResult, type BacktestSettings } from "../../lib/analysis/backtest";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import type { MarketBar } from "../../lib/market/types";

export function commonStateReplay(context: SizingContext, decisions: ReadonlyMap<number, StrategyCycleRecentSignal[]>, start: number,
  switchIndex: number, policy: RiskPolicy, detailed = false) {
  const mutable = { ...baselinePolicy }, account = new SizedAccount(context, mutable);
  const targets = context.bars.map(() => 0), daily = [];
  for (let index = start; index < context.bars.length; index++) {
    if (index === switchIndex) Object.assign(mutable, policy);
    const signals = decisions.get(index) ?? [], state = account.step(index, signals); targets[index] = state.target;
    if (detailed) daily.push({ time: context.bars[index]!.time, ...state,
      entryIndex: account.inner.enteredAt, blockedUntil: account.inner.blockedUntil });
  }
  return { targets, daily };
}
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
async function bounded(path: string) { assert.ok((await stat(path)).size <= 16 * 1024 ** 2); return readFile(path, "utf8"); }
async function main() {
  const data = join(root, "data/full-screen-6-15"), output = join(root, "output/regime-sizing-review");
  const input = JSON.parse(await bounded(join(data, "input.json"))) as { bars: MarketBar[]; barsHash: string; settings: BacktestSettings;
    snapshots: { decisionIndex: number }[] };
  const saved = JSON.parse(await bounded(join(data, "signals.json"))) as { sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[] };
  const previous = JSON.parse(await bounded(join(root, "output/regime-sizing/summary.json"))) as {
    sourceHash: string; implementationHash: string; selected: { label: string; policy: RiskPolicy }[];
    rows: { policy: RiskPolicy; totalReturn: number; maxDrawdown: number }[];
  };
  const sourceHash = sha(JSON.stringify(input)); assert.equal(sourceHash, saved.sourceHash); assert.equal(sourceHash, previous.sourceHash);
  assert.equal(sha(JSON.stringify(input.bars)), input.barsHash); assert.ok(input.bars.length <= 10000 && saved.rows.length <= 2048);
  assert.equal(saved.rows.length, input.snapshots.length);
  const decisions = new Map(saved.rows.map((row, offset) => { assert.equal(row.index, input.snapshots[offset]!.decisionIndex); return [row.index, row.signals] as const; }));
  const { bars, settings } = input, start = bars.length - 2000;
  const cutoff = bars.findIndex(bar => bar.time === "2026-07-21"); assert.ok(cutoff >= start);
  const switchIndex = cutoff + 1, boundary = switchIndex - start, context = new SizingContext(bars), menu = sizingMenu();
  assert.equal(menu.length, previous.rows.length); previous.rows.forEach((row, offset) => assert.deepEqual(row.policy, menu[offset]));
  const reviewHash = sha((await Promise.all(["REGIME_SIZING_REVIEW_DESIGN.md", "regime-sizing-review.ts", "regime-sizing.ts", "REGIME_SIZING_DESIGN.md",
    "regime-tuning.ts", "sma-entry-study.ts", "v-recovery-study.ts", "analyze.ts", "../nikkei-cycle-rallies/ma-type.ts",
    "../../lib/analysis/indicators.ts", "../../lib/analysis/backtest.ts", "../../lib/analysis/strategy-cycle-validation.ts",
    "../../lib/analysis/sma-position-overlay.ts"].map(path => readFile(join(root, path), "utf8")))).join("\n"));
  const metrics = (result: AllocationBacktestResult) => {
    assert.equal(result.equity.length, 2000);
    const prefix = Float64Array.from([0, ...result.equity.map(point => Math.log(point.equity / settings.initialCash))]);
    return { totalReturn: result.totalReturn, maxDrawdown: result.maxDrawdown,
      recent: pathMetrics(prefix, boundary, 2000), recentFills: result.rebalances.filter(fill => fill.time > "2026-07-21") };
  };
  const base = commonStateReplay(context, decisions, start, switchIndex, baselinePolicy);
  const rows = []; let stopping = false;
  process.on("SIGINT", () => { stopping = true; }); process.on("SIGTERM", () => { stopping = true; });
  for (const policy of menu) {
    if (stopping || process.memoryUsage().rss > 1.5 * 1024 ** 3) throw new Error("Stopped safely; rerun the finite common-state review");
    const outcome = commonStateReplay(context, decisions, start, switchIndex, policy);
    assert.deepEqual(outcome.targets.slice(0, switchIndex), base.targets.slice(0, switchIndex));
    const result = runStrategyCycleCloseBacktest(bars, outcome.targets, settings);
    rows.push({ policy, ...metrics(result) });
    if (rows.length % 20 === 0) await new Promise<void>(done => setImmediate(done));
  }
  type Row = typeof rows[number];
  const order = (left: Row, right: Row) => right.recent.totalReturn - left.recent.totalReturn || menu.findIndex(policy => policy.id === left.policy.id) - menu.findIndex(policy => policy.id === right.policy.id);
  const baseline = rows[0]!, best = [...rows].sort(order)[0]!;
  const constrained = rows.filter(row => row.recent.maxDrawdown >= baseline.recent.maxDrawdown - 1e-9).sort(order)[0]!;
  const originalBest = [...previous.rows].filter(row => row.policy.id !== "baseline").sort((left, right) => right.totalReturn - left.totalReturn)[0]!;
  const initialRecent = previous.selected.find(row => row.label === "recent-best")!.policy;
  const selected = [];
  for (const [label, policy] of [["baseline", baselinePolicy], ["initial-full-best-nonbaseline", originalBest.policy],
    ["initial-recent-best", initialRecent], ["fork-best", best.policy], ["fork-best-no-worse-dd", constrained.policy]] as const) {
    const outcome = commonStateReplay(context, decisions, start, switchIndex, policy, true);
    const result = runStrategyCycleCloseBacktest(bars, outcome.targets, settings);
    const compact = runStrategyCycleCloseBacktest(bars, outcome.targets, { ...settings, summaryOnly: true });
    assert.equal(result.totalReturn, compact.totalReturn); assert.equal(result.maxDrawdown, compact.maxDrawdown);
    const initialFullPath = previous.rows.find(row => row.policy.id === policy.id)!;
    selected.push({ label, policy, initialFullPath, ...metrics(result),
      doubleCost: metrics(runStrategyCycleCloseBacktest(bars, outcome.targets, { ...settings, commissionRate: settings.commissionRate * 2, slippageRate: settings.slippageRate * 2 })),
      nextOpen: metrics(runAllocationBacktest(bars, outcome.targets, { ...settings, executionPolicy: "next-open" })) });
    await atomic(join(output, `${label}.json`), { sourceHash, reviewHash, policy, result, daily: outcome.daily });
  }
  const summary = { sourceHash, reviewHash, originalImplementationHash: previous.implementationHash, generatedAt: new Date().toISOString(),
    start: bars[start]!.time, end: bars.at(-1)!.time, cutoff: bars[cutoff]!.time, cases: rows.length, selected, rows,
    verification: { identicalPrefixPolicies: rows.length, prefixTargetsPerPolicy: boundary, summaryLedgerPairs: selected.length },
    limitation: "Date-based fork is a retrospective attribution diagnostic, never a live policy. Original full-history candidates remain the executable comparisons. Previously explored data, no forward claim or production change." };
  await atomic(join(output, "summary.json"), summary);
  const table = selected.map(row => `| ${row.label} | ${row.policy.id} | ${row.initialFullPath.totalReturn.toFixed(3)} | ${row.initialFullPath.maxDrawdown.toFixed(3)} | ${row.recent.totalReturn.toFixed(3)} | ${row.recent.maxDrawdown.toFixed(3)} | ${row.doubleCost.recent.totalReturn.toFixed(3)} | ${row.nextOpen.recent.totalReturn.toFixed(3)} |`).join("\n");
  const report = `# Common-state sizing attribution\n\nAll321 policies follow exact baseline targets through2026-07-21 close, then change rules while preserving one inherited controller/account. The known date boundary is diagnostic only. Original-full columns show the corresponding genuine feature policy run across all2000 sessions, not the artificial date fork's combined full return.\n\n| Selection | Policy | Original full return % | Original full DD % | Fork recent return % | Fork recent DD % | Double-cost fork recent % | Next-open fork recent % |\n|---|---|---:|---:|---:|---:|---:|---:|\n${table}\n\nThe initial recent winner's July31 entry is recovery from an earlier variant-specific stop, not a new EMA/SMA supplement. Compare its identical-state fork before attributing improvement to the local rule. Original full-path results are preserved under output/regime-sizing.\n\nThe fork winner uses delayed3 EMA supplements sized by a1.5% ATR-percent budget, without automatic restoration. Its supplementary risk episode retains hold7 but releases a pending reduction once WMA7 is negative, without additional SMA11 protection. In the fork it enters partially on August28 and September24; the latter exits October9 instead of the unchanged delayed-entry path's October15. This is evidence of local mechanics, not evidence that the broad regime classifier separates historical winning and losing episodes reliably.\n\n${summary.limitation}\n`;
  await writeFile(join(output, "REPORT.md.tmp"), report); await replaceFileAtomically(join(output, "REPORT.md.tmp"), join(output, "REPORT.md"));
  console.log(JSON.stringify({ cases: rows.length, selected: selected.map(row => ({ label: row.label, policy: row.policy.id, recent: row.recent,
    doubleCost: row.doubleCost.recent, nextOpen: row.nextOpen.recent })) }, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
