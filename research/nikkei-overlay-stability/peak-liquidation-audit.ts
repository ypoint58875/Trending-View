import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atomic, root } from "./analyze";
import { peakReplay, type PeakPolicy } from "./peak-liquidation-study";
import { FilterContext } from "./oscillator-filter-study";
import { fallbackMetrics } from "./sma20-fallback";
import { runStrategyCycleCloseBacktest, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest, type BacktestSettings } from "../../lib/analysis/backtest";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import type { MarketBar } from "../../lib/market/types";

type Metrics = ReturnType<typeof fallbackMetrics>;
type Row = Metrics & { policy: PeakPolicy; targetHash: string; cuts: number };
async function bounded(path: string) { assert.ok((await stat(path)).size <= 16 * 1024 ** 2); return readFile(path, "utf8"); }
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
async function main() {
  const data = join(root, "data/full-screen-6-15"), output = join(root, "output/peak-liquidation-audit");
  const input = JSON.parse(await bounded(join(data, "input.json"))) as { bars: MarketBar[]; settings: BacktestSettings };
  const signals = JSON.parse(await bounded(join(data, "signals.json"))) as {
    sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[];
  };
  const prior = JSON.parse(await bounded(join(root, "output/peak-liquidation/summary.json"))) as {
    sourceHash: string; implementationHash: string; rows: Row[]; uniquePaths: number;
  };
  const sourceHash = sha(JSON.stringify(input)); assert.equal(sourceHash, signals.sourceHash); assert.equal(sourceHash, prior.sourceHash);
  assert.ok(input.bars.length <= 10000 && signals.rows.length <= 2048); assert.equal(prior.rows.length, 164);
  const implementationHash = sha(prior.implementationHash + await readFile(fileURLToPath(import.meta.url), "utf8"));
  const context = new FilterContext(input.bars), start = input.bars.length - 2000;
  const boundary = input.bars.findIndex(bar => bar.time === "2026-07-21") - start + 1;
  assert.equal(boundary, 1936);
  const decisions = new Map(signals.rows.map(row => [row.index, row.signals]));
  const selected = [];
  for (const group of ["native", "turn4", "rsi", "ema3"]) {
    const baseline = prior.rows.find(row => row.policy.group === group && row.policy.threshold === null)!;
    const policies = prior.rows.filter(row => row.policy.group === group && (row.policy.threshold === null ||
      (row.policy.window === 0 && row.policy.wait === 0 && [0.04, 0.06, 0.08].includes(row.policy.threshold))));
    for (const row of policies) {
      const path = peakReplay(context, decisions, start, row.policy, true);
      assert.equal(sha(JSON.stringify(path.targets)), row.targetHash); assert.equal(path.cutCount, row.cuts);
      const next = runAllocationBacktest(input.bars, path.targets, { ...input.settings, executionPolicy: "next-open" });
      const twice = runStrategyCycleCloseBacktest(input.bars, path.targets, { ...input.settings,
        commissionRate: input.settings.commissionRate * 2, slippageRate: input.settings.slippageRate * 2 });
      const detail = { ...row, deltaFull: row.totalReturn - baseline.totalReturn,
        deltaFinal500: row.final500.totalReturn - baseline.final500.totalReturn,
        nextOpen: fallbackMetrics(next, input.settings.initialCash, boundary), doubleCost: fallbackMetrics(twice, input.settings.initialCash, boundary),
        cuts: path.cuts };
      selected.push(detail);
      await atomic(join(output, `${row.policy.id}.json`), { sourceHash, implementationHash, ...detail, targets: path.targets });
    }
  }
  const groups = ["native", "turn4", "rsi", "ema3"].map(group => {
    const rows = prior.rows.filter(row => row.policy.group === group), baseline = rows[0]!;
    const tested = rows.slice(1), affected = tested.filter(row => row.cuts > 0);
    return { group, policies: tested.length, affected: affected.length,
      fullImproved: tested.filter(row => row.totalReturn > baseline.totalReturn + 1e-9).length,
      ddImproved: tested.filter(row => row.maxDrawdown > baseline.maxDrawdown + 1e-9).length,
      unchanged: tested.filter(row => row.targetHash === baseline.targetHash).length,
      bestAffected: [...affected].sort((left, right) => right.totalReturn - left.totalReturn)[0],
      allAffectedLowerFull: affected.every(row => row.totalReturn < baseline.totalReturn - 1e-9) };
  });
  const summary = { sourceHash, implementationHash, generatedAt: new Date().toISOString(), groups, selected,
    limitation: "Fixed4/6/8% illustrations, not new optimized rules. Frozen-history attribution only. No automatic native-recovery buy is added after peak exits; alternative recovery mechanisms were not exhaustively tested. Close-confirmed liquidation may exceed the trigger fraction." };
  await atomic(join(output, "summary.json"), summary);
  const table = selected.map(row => `| ${row.policy.group} | ${row.policy.threshold === null ? "Off" : `${row.policy.threshold * 100}%`} | ${row.totalReturn.toFixed(2)} | ${row.final500.totalReturn.toFixed(2)} | ${(-row.maxDrawdown).toFixed(2)} | ${row.deltaFull.toFixed(2)} | ${row.cuts?.length ?? 0} |`).join("\n");
  await writeFile(join(output, "REPORT.md.tmp"), `# Fixed-threshold peak-liquidation audit\n\nFour requested models; episode highest-close peak; wait0 (native entrances allowed next bar), no added recovery. All40 declared variants/model are retained in the main study.\n\n| Model | Threshold | Full % | Final500 % | Max DD magnitude % | Delta full pp | Additional cuts |\n|---|---|---:|---:|---:|---:|---:|\n${table}\n\nNo model has a tested parameter improving full return or full drawdown. Each has28 affected policies (all lower full returns) and12 inactive policies. All164 cases produce${prior.uniquePaths} distinct target paths. Changing the new-stop waiting period0/5 or peak definition episode/rolling20 does not reverse that finding. First1500-only selection chooses the unchanged baseline for all models.\n\nMatching next-open/double-cost metrics and actual cut dates are retained per selected case.\n\n${summary.limitation}\n`);
  await replaceFileAtomically(join(output, "REPORT.md.tmp"), join(output, "REPORT.md"));
  console.log(JSON.stringify({ groups, examples: selected.filter(row => row.policy.threshold === 0.06).map(row => ({ id: row.policy.id,
    full: row.totalReturn, final500: row.final500.totalReturn, dd: row.maxDrawdown, next: row.nextOpen.totalReturn, twice: row.doubleCost.totalReturn })) }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
