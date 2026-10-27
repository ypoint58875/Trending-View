import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { root, atomic, Account, Features, current, targets, pathMetrics, type Parameters } from "./analyze";
import { runStrategyCycleCloseBacktest, type StrategyCycleRecentSignal, type StrategyCycleSelectionSnapshot } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";
import type { BacktestSettings } from "../../lib/analysis/backtest";

export const precedingBest: Parameters = { ...current, gate: 7, threshold: 0.00075 };
const sha = (v: string) => createHash("sha256").update(v).digest("hex");

export function reboundFromFiveOpen(bars: readonly Pick<MarketBar, "open" | "close">[], index: number): number | null {
  if (index < 4) return null;
  const lowest = Math.min(...bars.slice(index - 4, index + 1).map(b => b.open));
  if (!(lowest > 0)) throw new Error("Rebound requires positive opening prices");
  return bars[index]!.close / lowest - 1;
}

export function stepWithRebound(account: Account, index: number, signals: readonly StrategyCycleRecentSignal[],
  parameters: Parameters, features: Features, rebound: number | null, threshold: number | null): { target: number; extraEntry: boolean } {
  account.step(index, signals, parameters, features);
  const allowed = !(parameters.flags & 4) || (features.get("WMA", parameters.gate).sign[index] ?? -1) >= 0;
  const extraEntry = threshold !== null && rebound !== null && rebound >= threshold && account.allocation <= 1e-10 &&
    signals.length === 0 && !!(parameters.flags & 1) && allowed;
  if (extraEntry) { account.allocation = 1; account.pending = null; }
  return { target: account.allocation, extraEntry };
}

async function bounded(path: string) { assert.ok((await stat(path)).size <= 16 * 1024 ** 2); return readFile(path, "utf8"); }
async function main() {
  const data = join(root, "data/full-screen-6-15"), output = join(root, "output/rebound-2-5");
  const input = JSON.parse(await bounded(join(data, "input.json"))) as { bars: MarketBar[]; barsHash: string;
    batch: string; snapshots: StrategyCycleSelectionSnapshot[]; settings: BacktestSettings; accessedAt: string };
  const sourceHash = sha(JSON.stringify(input)), signals = JSON.parse(await bounded(join(data, "signals.json")));
  const prior = JSON.parse(await bounded(join(root, "output/full-screen-6-15/summary.json")));
  assert.equal(sha(JSON.stringify(input.bars)), input.barsHash);
  assert.equal(signals.sourceHash, sourceHash); assert.equal(prior.sourceHash, sourceHash);
  assert.deepEqual({ entry: prior.best.entry, exit: prior.best.exit, gate: prior.best.gate, threshold: prior.best.threshold, flags: prior.best.flags }, precedingBest);
  assert.equal(input.snapshots.length, signals.rows.length);
  const decisions = new Map<number, StrategyCycleRecentSignal[]>(signals.rows.map((r: { index: number; signals: StrategyCycleRecentSignal[] }, n: number) => {
    assert.equal(r.index, input.snapshots[n]!.decisionIndex); return [r.index, r.signals];
  }));
  const bars = input.bars, start = bars.length - 2000, features = new Features(bars), settings = input.settings;
  assert.ok(bars.length <= 10000 && start >= 4);
  const rebounds = bars.map((_, i) => reboundFromFiveOpen(bars, i));
  const implementationHash = sha((await Promise.all(["REBOUND_DESIGN.md", "rebound-study.ts", "analyze.ts", "../nikkei-cycle-rallies/ma-type.ts",
    "../../lib/analysis/backtest.ts", "../../lib/analysis/strategy-cycle-validation.ts", "../../lib/analysis/indicators.ts"]
    .map(p => readFile(join(root, p), "utf8")))).join("\n"));
  let stopped = false;
  process.on("SIGINT", () => { stopped = true; }); process.on("SIGTERM", () => { stopped = true; });
  const run = (threshold: number | null) => {
    const account = new Account(), target = bars.map(() => 0), triggers: { time: string; rebound: number }[] = [];
    for (let i = start; i < bars.length; i++) {
      const step = stepWithRebound(account, i, decisions.get(i) ?? [], precedingBest, features, rebounds[i]!, threshold);
      target[i] = step.target;
      if (step.extraEntry) triggers.push({ time: bars[i]!.time, rebound: rebounds[i]! });
    }
    const result = runStrategyCycleCloseBacktest(bars, target, settings);
    const summary = runStrategyCycleCloseBacktest(bars, target, { ...settings, summaryOnly: true });
    assert.ok(Math.abs(result.totalReturn - summary.totalReturn) < 1e-9);
    assert.ok(Math.abs(result.maxDrawdown - summary.maxDrawdown) < 1e-9);
    const prefix = Float64Array.from([0, ...result.equity.map(e => Math.log(e.equity / settings.initialCash))]);
    assert.equal(prefix.length, 2001);
    return { result, target, triggers, row: { thresholdPercent: threshold === null ? null : Number((threshold * 100).toFixed(1)),
      totalReturn: result.totalReturn, maxDrawdown: result.maxDrawdown, fills: result.tradeCount, reboundOnlyEntries: triggers.length,
      blocks: [0, 1, 2, 3].map(n => ({ start: bars[start + n * 500]!.time, end: bars[start + (n + 1) * 500 - 1]!.time,
        ...pathMetrics(prefix, n * 500, (n + 1) * 500) })) } };
  };
  const baseline = run(null);
  assert.deepEqual(baseline.target, targets(bars, decisions, start, precedingBest, features));
  assert.ok(Math.abs(baseline.result.totalReturn - prior.best.totalReturn) < 1e-9);
  const rows: ReturnType<typeof run>["row"][] = [];
  for (let n = 4; n <= 10; n++) {
    if (stopped || process.memoryUsage().rss > 1.5 * 1024 ** 3) throw new Error("Stopped safely; rerun this short seven-candidate study");
    const threshold = n / 200, outcome = run(threshold); rows.push(outcome.row);
    await atomic(join(output, `threshold-${n / 2}.json`), { sourceHash, implementationHash, thresholdPercent: n / 2,
      triggers: outcome.triggers, result: outcome.result });
  }
  const ranked = [...rows].sort((a, b) => b.totalReturn - a.totalReturn || a.thresholdPercent! - b.thresholdPercent!);
  const summary = { sourceHash, signalImplementationHash: signals.designHash, implementationHash, batch: input.batch,
    sourceAccessedAt: input.accessedAt, generatedAt: new Date().toISOString(), start: settings.startTime, end: settings.endTime,
    sessions: 2000, decisions: decisions.size, parameters: precedingBest,
    definition: "Close / lowest open of the latest five trading sessions (including today) - 1 >= x; OR EMA7 slope positive-turn event. Empty account and no original signal; WMA7 nonnegative gate remains.",
    baseline: baseline.row, originalPictured: prior.original, holding: prior.holding, rows, best: ranked[0],
    improvementPoints: ranked[0]!.totalReturn - baseline.row.totalReturn,
    verification: { unchangedBaselineTargets: true, baselineReturnMatchesPriorStudy: true, summaryFullLedgerComparisons: 8 },
    limitation: "Retrospective parameter comparison on the same completed full-screen path; not an independent out-of-sample test." };
  await atomic(join(output, "summary.json"), summary);
  const table = rows.map(r => `| ${r.thresholdPercent}% | ${r.totalReturn.toFixed(4)}% | ${r.maxDrawdown.toFixed(4)}% | ${r.blocks[3]!.totalReturn.toFixed(4)}% | ${r.reboundOnlyEntries} |`).join("\n");
  await writeFile(join(output, "REPORT.md"), `# EMA7 turn or five-open rebound\n\n${summary.definition}\n\nPeriod: ${summary.start} through ${summary.end}. Other rules: SMA11/0.075%, WMA7.\n\nBaseline: ${baseline.row.totalReturn.toFixed(4)}% return; ${baseline.row.maxDrawdown.toFixed(4)}% drawdown; final500 ${baseline.row.blocks[3]!.totalReturn.toFixed(4)}%.\n\n| Rebound | Net return | Drawdown | Final500 | Rebound-only entries |\n|---|---:|---:|---:|---:|\n${table}\n\n${summary.limitation}\n\nNo production setting changed. See summary.json and per-threshold full ledgers.\n`);
  console.log(JSON.stringify(summary, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exitCode = 1; });
