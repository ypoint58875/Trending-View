import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import { sma } from "../../lib/analysis/indicators";
import { cycleMonitoringCoverage } from "../../lib/analysis/strategy-cycle-monitoring";
import { runAllocationBacktest, type BacktestSettings, type AllocationBacktestResult } from "../../lib/analysis/backtest";
import { NIKKEI_CYCLE_MODEL, NIKKEI_CYCLE_CONFLICT_POLICY, strategyCycleSignalDirection,
  resolveStrategyCycleRecentSignals, runStrategyCycleCloseBacktest,
  type StrategyCycleRecentSignal, type StrategyCycleSelectionSnapshot } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";
import { positiveSmaTurns } from "./sma-flat-entry";
import { rallyWindows, segmentReturn } from "./analyze";

export interface GuardRule {
  id: string; period: number; kind: "slope" | "price" | "both"; threshold: number;
  scope?: "supplemental"; discard?: boolean;
  releaseThreshold?: number; weakBars?: number;
}
export function guardSeries(closes: number[], rule: GuardRule): boolean[] {
  const average = sma(closes, rule.period);
  let active = false, weak = 0;
  return closes.map((close, i) => {
    const current = average[i], previous = average[i - 1];
    if (current == null || previous == null || previous <= 0) return false;
    const value = current / previous - 1;
    if (rule.releaseThreshold !== undefined) {
      if (value > rule.threshold) active = true;
      else if (value <= rule.releaseThreshold) active = false;
      return active;
    }
    const slope = value > rule.threshold;
    if (rule.weakBars) {
      if (slope) { active = true; weak = 0; }
      else if (++weak >= rule.weakBars) active = false;
      return active;
    }
    return rule.kind === "slope" ? slope : rule.kind === "price" ? close > current : close > current && slope;
  });
}
export function guardedTargets(closes: number[], decisions: ReadonlyMap<number, readonly StrategyCycleRecentSignal[]>,
  start: number, protection: readonly boolean[], options: { scope?: "supplemental"; discard?: boolean; entryPeriod?: number } = {}) {
  const turns = positiveSmaTurns(closes, options.entryPeriod ?? 12);
  const target = closes.map(() => 0), events: { index: number; kind: string; from: number; to: number }[] = [];
  let inherited = 0, pending: number | null = null, supplemental = false;
  for (let i = start; i < closes.length; i += 1) {
    const signals = decisions.get(i) ?? [], direction = strategyCycleSignalDirection(signals);
    const before = inherited;
    if (direction === "increase") {
      pending = null; supplemental = false;
      inherited = resolveStrategyCycleRecentSignals(inherited, signals).targetAllocation;
    } else if (direction === "reduce") {
      const requested = resolveStrategyCycleRecentSignals(inherited, signals).targetAllocation;
      if (requested < inherited - 1e-10) pending = Math.min(pending ?? inherited, requested);
    }
    if (pending !== null) {
      if (protection[i] && (options.scope !== "supplemental" || supplemental)) {
        if (direction === "reduce") events.push({ index: i, kind: "deferred", from: inherited, to: pending });
        if (options.discard) pending = null;
      } else {
        inherited = Math.min(inherited, pending); pending = null;
        events.push({ index: i, kind: direction === "reduce" ? "original-exit" : "released-exit", from: before, to: inherited });
      }
    }
    if (inherited <= 1e-10) supplemental = false;
    if (inherited <= 1e-10 && signals.length === 0 && turns[i]) {
      inherited = 1; supplemental = true; pending = null;
      events.push({ index: i, kind: "supplemental-entry", from: 0, to: 1 });
    }
    target[i] = inherited;
  }
  return { target, events };
}
const root = dirname(fileURLToPath(import.meta.url));
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const periods = [7, 8, 9, 10, 11, 12];
const rules: GuardRule[] = periods.flatMap(period => [
  ...[0, 0.001, 0.002].map(threshold => ({ id: `sma${period}-slope${threshold * 100}`, period, kind: "slope" as const, threshold })),
  { id: `sma${period}-price`, period, kind: "price" as const, threshold: 0 },
  { id: `sma${period}-both`, period, kind: "both" as const, threshold: 0 },
]);
rules.push({ id: "sma12-both-supplemental", period: 12, kind: "both", threshold: 0, scope: "supplemental" },
  { id: "sma12-both-discard", period: 12, kind: "both", threshold: 0, discard: true },
  { id: "sma12-slope0.1-hysteresis0", period: 12, kind: "slope", threshold: 0.001, releaseThreshold: 0 },
  { id: "sma12-slope0.1-weak2", period: 12, kind: "slope", threshold: 0.001, weakBars: 2 });
async function atomic(path: string, data: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, JSON.stringify(data) + "\n");
  await replaceFileAtomically(`${path}.tmp`, path);
}
const subperiods = [["2024-09-27", "2025-06-30"], ["2025-06-30", "2025-12-30"],
  ["2025-12-30", "2026-06-30"], ["2026-06-30", "2026-10-23"]];
function metrics(bars: MarketBar[], start: number, result: AllocationBacktestResult) {
  return { totalReturn: result.totalReturn, maxDrawdown: result.maxDrawdown, tradeCount: result.tradeCount,
    segments: cycleMonitoringCoverage(bars.slice(start), result.rebalances,
      rallyWindows.map(([startTime, endTime]) => ({ startTime, endTime }))).map((r, i) => ({ ...r,
      return: segmentReturn(result.equity, rallyWindows[i]![0], rallyWindows[i]![1]) })),
    subperiods: subperiods.map(([a, b]) => ({ start: a, end: b, return: segmentReturn(result.equity, a!, b!) })) };
}
async function main() {
  const inputPath = join(root, "data/input.json");
  if ((await stat(inputPath)).size > 32 * 1024 * 1024) throw new Error("Frozen input exceeds limit");
  const inputText = await readFile(inputPath, "utf8"), sourceHash = sha(inputText);
  const input = JSON.parse(inputText) as { bars: MarketBar[]; barsHash: string; model: string;
    snapshots: StrategyCycleSelectionSnapshot[]; settings: BacktestSettings; evaluationSessions: number };
  const { bars, settings } = input, start = bars.length - input.evaluationSessions;
  if (bars.length > 10000 || input.snapshots.length > 2048 || sha(JSON.stringify(bars)) !== input.barsHash ||
    !input.model.endsWith(NIKKEI_CYCLE_CONFLICT_POLICY)) throw new Error("Frozen source mismatch");
  const cache = JSON.parse(await readFile(join(root, "data/sma-flat-decision-signals.json"), "utf8")) as {
    sourceHash: string; model: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[] };
  if (cache.sourceHash !== sourceHash || cache.model !== `sma-flat-entry-v1:${NIKKEI_CYCLE_MODEL}:${NIKKEI_CYCLE_CONFLICT_POLICY}` ||
    cache.rows.length !== input.snapshots.length || cache.rows.some((r, i) => r.index !== input.snapshots[i]!.decisionIndex)) throw new Error("Signal cache incompatible");
  const decisions = new Map(cache.rows.map(r => [r.index, r.signals])), closes = bars.map(b => b.close);
  const baseline = runStrategyCycleCloseBacktest(bars, guardedTargets(closes, decisions, start, closes.map(() => false)).target, settings);
  const previous = JSON.parse(await readFile(join(root, "output/sma-flat-entry/sma12.json"), "utf8"));
  if (Math.abs(baseline.totalReturn - previous.totalReturn) > 1e-9 || JSON.stringify(baseline.rebalances.map(r => [r.time, r.targetAllocation])) !== JSON.stringify(previous.rebalances.map((r: { time: string; targetAllocation: number }) => [r.time, r.targetAllocation]))) throw new Error("SMA12 baseline reconciliation failed");
  const controls: Record<string, ReturnType<typeof metrics>> = { sma12: metrics(bars, start, baseline) };
  for (const [id, file] of [["cycle10", "cycle10.json"], ["joint40-80", "joint-confirmation/40-80-directional.json"]]) {
    controls[id!] = metrics(bars, start, JSON.parse(await readFile(join(root, "output", file!), "utf8")));
  }
  controls.holding = metrics(bars, start, runStrategyCycleCloseBacktest(bars, bars.map((_, i) => i >= start ? 1 : 0), settings));
  const variants: Record<string, ReturnType<typeof metrics> & { rule: GuardRule; deferredCount: number; releasedCount: number; nextOpenReturn: number; nextOpenMaxDrawdown: number }> = {};
  const designHash = sha(await readFile(join(root, "EXIT_GUARD_DESIGN.md"), "utf8"));
  for (const rule of rules) {
    const replay = guardedTargets(closes, decisions, start, guardSeries(closes, rule), rule);
    const result = runStrategyCycleCloseBacktest(bars, replay.target, settings);
    const sensitivity = runAllocationBacktest(bars, replay.target, { ...settings, executionPolicy: "next-open" });
    variants[rule.id] = { rule, ...metrics(bars, start, result),
      deferredCount: replay.events.filter(e => e.kind === "deferred").length,
      releasedCount: replay.events.filter(e => e.kind === "released-exit").length,
      nextOpenReturn: sensitivity.totalReturn, nextOpenMaxDrawdown: sensitivity.maxDrawdown };
    await atomic(join(root, `output/exit-guard/${rule.id}.json`), { sourceHash, designHash, rule, ...result,
      events: replay.events.map(({ index, ...event }) => ({ ...event, time: bars[index]!.time })) });
  }
  await atomic(join(root, "output/exit-guard-summary.json"), { sourceHash, designHash, start: settings.startTime,
    end: settings.endTime, settings, baselineReconciled: true, controls, variants });
  const rows = ["method,total_return_percent,max_drawdown_percent,trade_count,range1_coverage_percent,range2_coverage_percent,range3_coverage_percent,range4_coverage_percent,range1_return_percent,range2_return_percent,range3_return_percent,range4_return_percent"];
  for (const [id, m] of Object.entries({ ...controls, ...variants })) rows.push([id, m.totalReturn, m.maxDrawdown, m.tradeCount,
    ...m.segments.map(s => s.coveragePercent), ...m.segments.map(s => s.return)].join(","));
  const csv = join(root, "output/exit-guard-comparison.csv");
  await writeFile(`${csv}.tmp`, rows.join("\n") + "\n"); await replaceFileAtomically(`${csv}.tmp`, csv);
  console.log(JSON.stringify({ controls, variants }, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
