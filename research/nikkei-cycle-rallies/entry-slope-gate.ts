import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import { SmaPositionOverlay, type SmaPositionOverlayOptions } from "../../lib/analysis/sma-position-overlay";
import { strategyCycleSignalDirection, runStrategyCycleCloseBacktest, NIKKEI_CYCLE_MODEL, NIKKEI_CYCLE_CONFLICT_POLICY,
  type StrategyCycleRecentSignal, type StrategyCycleSelectionSnapshot } from "../../lib/analysis/strategy-cycle-validation";
import { cycleMonitoringCoverage } from "../../lib/analysis/strategy-cycle-monitoring";
import { runAllocationBacktest, type BacktestSettings, type AllocationBacktestResult } from "../../lib/analysis/backtest";
import type { MarketBar } from "../../lib/market/types";
import { rallyWindows, segmentReturn } from "./analyze";
import { positiveSmaTurns } from "./sma-flat-entry";

export function nonnegativeSmaSlope(closes: readonly number[], period: number): boolean[] {
  if (!Number.isInteger(period) || period < 1) throw new Error("Invalid SMA period");
  return closes.map((close, index) => index >= period && close >= closes[index - period]!);
}
export function entryGatedTargets(bars: MarketBar[], decisions: ReadonlyMap<number, readonly StrategyCycleRecentSignal[]>,
  start: number, options: SmaPositionOverlayOptions, period: number | null) {
  const allowed = period === null ? bars.map(() => true) : nonnegativeSmaSlope(bars.map(b => b.close), period);
  const turns = positiveSmaTurns(bars.map(b => b.close), 12);
  const account = new SmaPositionOverlay(bars, options);
  const target = bars.map(() => 0), blocked: { index: number; kind: "original" | "supplemental" }[] = [];
  for (let i = start; i < bars.length; i += 1) {
    const signals = decisions.get(i) ?? [], direction = strategyCycleSignalDirection(signals);
    if (direction) {
      const latest = signals.at(-1)!;
      if (direction === "increase" && account.allocation <= 1e-10 && latest.targetAllocation > 1e-10 && !allowed[i]) {
        blocked.push({ index: i, kind: "original" });
      } else account.request(direction, latest.targetAllocation, i);
    }
    account.close(i, signals.length > 0 || !allowed[i]);
    if (options.supplementalEntry && account.allocation <= 1e-10 && signals.length === 0 && !allowed[i] && turns[i]) {
      blocked.push({ index: i, kind: "supplemental" });
    }
    target[i] = account.allocation;
  }
  return { target, blocked };
}
const root = dirname(fileURLToPath(import.meta.url));
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
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
  const decisions = new Map(cache.rows.map(r => [r.index, r.signals]));
  const designHash = sha(await readFile(join(root, "ENTRY_SLOPE_GATE_DESIGN.md"), "utf8"));
  const controls: Record<string, ReturnType<typeof metrics>> = {};
  const variants: Record<string, ReturnType<typeof metrics> & { base: string; period: number; blockedOriginal: number; blockedSupplemental: number; nextOpenReturn: number; nextOpenMaxDrawdown: number }> = {};
  const bases = [
    { id: "cycle10", options: {}, file: "cycle10.json" },
    { id: "cycle10-sma12-guard", options: { supplementalEntry: true, exitGuard: true }, file: "exit-guard/sma12-slope0.2.json" },
  ];
  for (const base of bases) {
    const replay = entryGatedTargets(bars, decisions, start, base.options, null);
    const baseline = runStrategyCycleCloseBacktest(bars, replay.target, settings);
    const previous = JSON.parse(await readFile(join(root, "output", base.file), "utf8"));
    if (Math.abs(baseline.totalReturn - previous.totalReturn) > 1e-9 || JSON.stringify(baseline.rebalances.map(r => [r.time, r.targetAllocation, r.fillPrice])) !== JSON.stringify(previous.rebalances.map((r: { time: string; targetAllocation: number; fillPrice: number }) => [r.time, r.targetAllocation, r.fillPrice]))) throw new Error(`Baseline reconciliation failed: ${base.id}`);
    controls[base.id] = metrics(bars, start, baseline);
    for (let period = 3; period <= 12; period += 1) {
      const gated = entryGatedTargets(bars, decisions, start, base.options, period);
      const result = runStrategyCycleCloseBacktest(bars, gated.target, settings);
      const sensitivity = runAllocationBacktest(bars, gated.target, { ...settings, executionPolicy: "next-open" });
      const id = `${base.id}-gate${period}`;
      variants[id] = { base: base.id, period, ...metrics(bars, start, result),
        blockedOriginal: gated.blocked.filter(e => e.kind === "original").length,
        blockedSupplemental: gated.blocked.filter(e => e.kind === "supplemental").length,
        nextOpenReturn: sensitivity.totalReturn, nextOpenMaxDrawdown: sensitivity.maxDrawdown };
      await atomic(join(root, `output/entry-slope-gate/${id}.json`), { sourceHash, designHash, ...result,
        blocked: gated.blocked.map(e => ({ time: bars[e.index]!.time, kind: e.kind })) });
    }
  }
  controls.holding = metrics(bars, start, runStrategyCycleCloseBacktest(bars, bars.map((_, i) => i >= start ? 1 : 0), settings));
  await atomic(join(root, "output/entry-slope-gate-summary.json"), { sourceHash, designHash,
    start: settings.startTime, end: settings.endTime, baselineReconciled: true, settings, controls, variants });
  const rows = ["method,total_return_percent,max_drawdown_percent,trade_count,range1_coverage_percent,range2_coverage_percent,range3_coverage_percent,range4_coverage_percent,range1_return_percent,range2_return_percent,range3_return_percent,range4_return_percent"];
  for (const [id, m] of Object.entries({ ...controls, ...variants })) rows.push([id, m.totalReturn, m.maxDrawdown, m.tradeCount,
    ...m.segments.map(s => s.coveragePercent), ...m.segments.map(s => s.return)].join(","));
  const csv = join(root, "output/entry-slope-gate-comparison.csv");
  await writeFile(`${csv}.tmp`, rows.join("\n") + "\n"); await replaceFileAtomically(`${csv}.tmp`, csv);
  console.log(rows.join("\n"));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
