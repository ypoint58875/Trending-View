import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import {
  NIKKEI_CYCLE_CONFLICT_POLICY, NIKKEI_CYCLE_MODEL,
  resolveStrategyCycleRecentSignals, strategyCycleRecentSignals, runStrategyCycleCloseBacktest,
  type StrategyCycleRecentSignal, type StrategyCycleSelectionSnapshot,
} from "../../lib/analysis/strategy-cycle-validation";
import { cycleMonitoringCoverage } from "../../lib/analysis/strategy-cycle-monitoring";
import { runAllocationBacktest, type BacktestSettings, type AllocationBacktestResult } from "../../lib/analysis/backtest";
import type { MarketBar } from "../../lib/market/types";
import { rallyWindows, segmentReturn } from "./analyze";

const root = dirname(fileURLToPath(import.meta.url));
const model = `sma-flat-entry-v1:${NIKKEI_CYCLE_MODEL}:${NIKKEI_CYCLE_CONFLICT_POLICY}`;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const periods = [7, 8, 9, 10, 11, 12] as const;

/** The SMA slope sign equals the sign of close(t)-close(t-period). */
export function positiveSmaTurns(closes: readonly number[], period: number): boolean[] {
  if (!Number.isInteger(period) || period < 1) throw new Error("Invalid SMA period");
  return closes.map((close, i) => i >= period + 1 && close - closes[i - period]! > 0 &&
    closes[i - 1]! - closes[i - period - 1]! <= 0);
}
export function supplementalEntryTargets(
  closes: readonly number[], decisions: ReadonlyMap<number, readonly StrategyCycleRecentSignal[]>,
  start: number, period: number | null,
) {
  const turns = period === null ? closes.map(() => false) : positiveSmaTurns(closes, period);
  const target = closes.map(() => 0), entries: number[] = [];
  let inherited = 0;
  for (let i = start; i < closes.length; i += 1) {
    const signals = decisions.get(i) ?? [];
    if (decisions.has(i)) inherited = resolveStrategyCycleRecentSignals(inherited, signals).targetAllocation;
    if (inherited <= 1e-10 && signals.length === 0 && turns[i]) { inherited = 1; entries.push(i); }
    target[i] = inherited;
  }
  return { target, entries };
}
async function atomic(path: string, object: unknown) {
  await mkdir(dirname(path), { recursive: true }); await writeFile(`${path}.tmp`, `${JSON.stringify(object)}\n`);
  await replaceFileAtomically(`${path}.tmp`, path);
}
const ranges = rallyWindows.map(([startTime, endTime]) => ({ startTime, endTime }));
function metrics(bars: MarketBar[], start: number, result: AllocationBacktestResult) {
  const coverage = cycleMonitoringCoverage(bars.slice(start), result.rebalances, ranges);
  return { totalReturn: result.totalReturn, maxDrawdown: result.maxDrawdown, sharpe: result.sharpe, tradeCount: result.tradeCount,
    segments: coverage.map((range, i) => ({ ...range, return: segmentReturn(result.equity, rallyWindows[i]![0], rallyWindows[i]![1]) })) };
}
async function main() {
  const inputPath = join(root, "data/input.json");
  if ((await stat(inputPath)).size > 32 * 1024 * 1024) throw new Error("Frozen input exceeds limit");
  const inputText = await readFile(inputPath, "utf8");
  const input = JSON.parse(inputText) as { model: string; bars: MarketBar[]; barsHash: string; snapshots: StrategyCycleSelectionSnapshot[]; settings: BacktestSettings; evaluationSessions: number };
  const { bars, settings } = input, sourceHash = sha(inputText), start = bars.length - input.evaluationSessions;
  if (bars.length > 10000 || input.snapshots.length > 2048 || sha(JSON.stringify(bars)) !== input.barsHash ||
    !input.model.endsWith(NIKKEI_CYCLE_CONFLICT_POLICY)) throw new Error("Frozen source/model mismatch");
  const designHash = sha(await readFile(join(root, "SMA_FLAT_ENTRY_DESIGN.md"), "utf8"));
  const cachePath = join(root, "data/sma-flat-decision-signals.json");
  let cached: { sourceHash: string; model: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[] };
  try {
    cached = JSON.parse(await readFile(cachePath, "utf8"));
    if (cached.sourceHash !== sourceHash || cached.model !== model) throw new Error("Cached signals incompatible");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    cached = { sourceHash, model, rows: input.snapshots.map(snapshot => ({ index: snapshot.decisionIndex,
      signals: strategyCycleRecentSignals(bars, snapshot, snapshot.decisionIndex) })) };
    await atomic(cachePath, cached);
  }
  if (cached.rows.length !== input.snapshots.length || cached.rows.some((row, i) => row.index !== input.snapshots[i]!.decisionIndex)) throw new Error("Cached signal coverage differs");
  const decisions = new Map(cached.rows.map(row => [row.index, row.signals]));
  const closes = bars.map(bar => bar.close);
  const baseline = runStrategyCycleCloseBacktest(bars, supplementalEntryTargets(closes, decisions, start, null).target, settings);
  const frozen = JSON.parse(await readFile(join(root, "output/cycle10.json"), "utf8")) as AllocationBacktestResult;
  if (Math.abs(baseline.totalReturn - frozen.totalReturn) > 1e-9 || JSON.stringify(baseline.rebalances.map(r => [r.time, r.targetAllocation])) !== JSON.stringify(frozen.rebalances.map(r => [r.time, r.targetAllocation]))) throw new Error("Baseline return/fill tie-out failed");
  const oldJoint = JSON.parse(await readFile(join(root, "output/joint-confirmation/40-80-directional.json"), "utf8")) as AllocationBacktestResult;
  const jointSource = JSON.parse(await readFile(join(root, "output/joint-confirmation-summary.json"), "utf8"));
  if (jointSource.sourceHash !== sourceHash || jointSource.start !== settings.startTime || jointSource.end !== settings.endTime ||
    Math.abs(oldJoint.totalReturn - jointSource.variants["40-80-directional"].totalReturn) > 1e-9) throw new Error("Previous 40/80 comparison input differs");
  const controls: Record<string, unknown> = { cycle10: metrics(bars, start, baseline), "joint40-80-directional": metrics(bars, start, oldJoint) };
  const benchmarkTarget = bars.map((_, i) => i < start ? 0 : 1);
  controls["buy-hold"] = metrics(bars, start, runStrategyCycleCloseBacktest(bars, benchmarkTarget, settings));
  const variants: Record<string, unknown> = {};
  const csvRows = ["period,date,entry_kind,original_screening_date,from_allocation,target_allocation"];
  for (const period of periods) {
    const replay = supplementalEntryTargets(closes, decisions, start, period);
    const result = runStrategyCycleCloseBacktest(bars, replay.target, settings);
    const nextOpen = runAllocationBacktest(bars, replay.target, { ...settings, executionPolicy: "next-open" });
    const entryDates = replay.entries.map(i => bars[i]!.time);
    const summary = { ...metrics(bars, start, result), supplementalEntryCount: entryDates.length, supplementalEntryDates: entryDates,
      nextOpenReturn: nextOpen.totalReturn, nextOpenMaxDrawdown: nextOpen.maxDrawdown };
    variants[`sma${period}`] = summary;
    await atomic(join(root, `output/sma-flat-entry/sma${period}.json`), { model, sourceHash, designHash, ...summary,
      equity: result.equity, rebalances: result.rebalances, target: replay.target.slice(start) });
    for (const rebalance of result.rebalances) csvRows.push([period, rebalance.time,
      entryDates.includes(rebalance.time) ? "supplemental" : "original-cycle", decisions.has(bars.findIndex(b => b.time === rebalance.time)) ? 1 : 0,
      rebalance.fromAllocation, rebalance.targetAllocation].join(","));
    console.log(`SMA${period}: ${result.totalReturn.toFixed(6)}%, DD ${result.maxDrawdown.toFixed(6)}%, extra entries ${entryDates.length}, coverage ${summary.segments.map(s => s.coveragePercent?.toFixed(2)).join("/")}`);
  }
  await atomic(join(root, "output/sma-flat-entry-summary.json"), { model, sourceHash, designHash, start: settings.startTime, end: settings.endTime,
    initialCash: settings.initialCash, commissionRate: settings.commissionRate, slippageRate: settings.slippageRate,
    noSignalDefinition: "No permitted original last-two-bar signal on a screening date; skipped dates have no original execution signal",
    supplementalTarget: 1, baselineReconciled: true, coverageDefinition: "Inclusive trading dates with positive executed holding after close",
    controls, variants });
  const csv = join(root, "output/sma-flat-entry-trades.csv"); await writeFile(`${csv}.tmp`, `${csvRows.join("\n")}\n`); await replaceFileAtomically(`${csv}.tmp`, csv);
  const comparisonRows = ["method,total_return_percent,max_drawdown_percent,trade_count,range1_coverage_percent,range2_coverage_percent,range3_coverage_percent,range4_coverage_percent,range1_return_percent,range2_return_percent,range3_return_percent,range4_return_percent"];
  for (const [method, value] of Object.entries({ ...controls, ...variants }) as [string, ReturnType<typeof metrics>][]) {
    comparisonRows.push([method, value.totalReturn, value.maxDrawdown, value.tradeCount,
      ...value.segments.map(s => s.coveragePercent), ...value.segments.map(s => s.return)].join(","));
  }
  const comparison = join(root, "output/sma-flat-entry-comparison.csv");
  await writeFile(`${comparison}.tmp`, `${comparisonRows.join("\n")}\n`); await replaceFileAtomically(`${comparison}.tmp`, comparison);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
