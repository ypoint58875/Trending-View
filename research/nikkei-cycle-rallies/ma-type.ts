import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import { sma, ema, wma } from "../../lib/analysis/indicators";
import { strategyCycleSignalDirection, runStrategyCycleCloseBacktest, NIKKEI_CYCLE_MODEL, NIKKEI_CYCLE_CONFLICT_POLICY,
  type StrategyCycleRecentSignal, type StrategyCycleSelectionSnapshot } from "../../lib/analysis/strategy-cycle-validation";
import { cycleMonitoringCoverage } from "../../lib/analysis/strategy-cycle-monitoring";
import { runAllocationBacktest, type BacktestSettings, type AllocationBacktestResult } from "../../lib/analysis/backtest";
import type { MarketBar } from "../../lib/market/types";
import { rallyWindows, segmentReturn } from "./analyze";

export type AverageType = "SMA" | "EMA" | "WMA";
export const averageTypes: AverageType[] = ["SMA", "EMA", "WMA"];
const featureCache = new WeakMap<MarketBar[], Map<string, ReturnType<typeof averageSlopes>>>();
export function averageSlopes(closes: number[], period: number, type: AverageType) {
  const values = ({ SMA: sma, EMA: ema, WMA: wma })[type](closes, period);
  const slope = values.map((value, i) => value !== null && values[i - 1] != null && values[i - 1]! > 0
    ? value / values[i - 1]! - 1 : null);
  const sign = values.map((value, i) => value === null || values[i - 1] == null ? null
    : Math.sign(type === "SMA" ? closes[i]! - closes[i - period]! : value - values[i - 1]!));
  return { slope, sign, turns: sign.map((value, i) => value !== null && value > 0 && sign[i - 1] != null && sign[i - 1]! <= 0) };
}

export function averageTargets(bars: MarketBar[], decisions: ReadonlyMap<number, readonly StrategyCycleRecentSignal[]>,
  start: number, types: readonly [AverageType, AverageType, AverageType], periods: readonly [number, number, number] = [12, 12, 11], threshold = 0.002) {
  if (!Number.isFinite(threshold) || threshold < 0) throw new Error("Invalid exit threshold");
  let cache = featureCache.get(bars);
  if (!cache) { cache = new Map(); featureCache.set(bars, cache); }
  const features = (period: number, type: AverageType) => {
    const key = `${type}${period}`;
    if (!cache!.has(key)) cache!.set(key, averageSlopes(bars.map(b => b.close), period, type));
    return cache!.get(key)!;
  };
  const entry = features(periods[0], types[0]), exit = features(periods[1], types[1]), gate = features(periods[2], types[2]);
  let allocation = 0, pending: number | null = null;
  const target = bars.map(() => 0);
  const events: { time: string; kind: string }[] = [];
  for (let i = start; i < bars.length; i++) {
    const signals = decisions.get(i) ?? [], direction = strategyCycleSignalDirection(signals);
    const allowed = gate.sign[i] != null && gate.sign[i]! >= 0;
    if (direction === "increase") {
      pending = null;
      if (allocation > 1e-10 || allowed) allocation = Math.max(allocation, Math.min(1, Math.max(0, signals.at(-1)!.targetAllocation)));
      else events.push({ time: bars[i]!.time, kind: "blocked-original" });
    } else if (direction === "reduce") {
      const requested = Math.min(1, Math.max(0, signals.at(-1)!.targetAllocation));
      if (requested < allocation - 1e-10) pending = Math.min(pending ?? allocation, requested);
    }
    if (pending !== null && !(exit.slope[i] != null && exit.slope[i]! > threshold)) {
      allocation = Math.min(allocation, pending); pending = null;
      events.push({ time: bars[i]!.time, kind: "reduction-released" });
    }
    if (allocation <= 1e-10 && signals.length === 0 && entry.turns[i]) {
      if (allowed) { allocation = 1; pending = null; events.push({ time: bars[i]!.time, kind: "supplemental" }); }
      else events.push({ time: bars[i]!.time, kind: "blocked-supplemental" });
    }
    target[i] = allocation;
  }
  return { target, events };
}

export const root = dirname(fileURLToPath(import.meta.url));
export const sha = (value: string) => createHash("sha256").update(value).digest("hex");
export async function atomic(path: string, data: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, JSON.stringify(data) + "\n");
  await replaceFileAtomically(`${path}.tmp`, path);
}
const subperiods = [["2024-09-27", "2025-06-30"], ["2025-06-30", "2025-12-30"],
  ["2025-12-30", "2026-06-30"], ["2026-06-30", "2026-10-23"]];
export function metrics(bars: MarketBar[], start: number, result: AllocationBacktestResult) {
  return { totalReturn: result.totalReturn, maxDrawdown: result.maxDrawdown, tradeCount: result.tradeCount,
    segments: cycleMonitoringCoverage(bars.slice(start), result.rebalances,
      rallyWindows.map(([startTime, endTime]) => ({ startTime, endTime }))).map((r, i) => ({ ...r,
      return: segmentReturn(result.equity, rallyWindows[i]![0], rallyWindows[i]![1]) })),
    subperiods: subperiods.map(([a, b]) => ({ start: a, end: b, return: segmentReturn(result.equity, a!, b!) })) };
}
export async function loadStudy() {
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
  return { bars, settings, start, sourceHash, decisions };
}
async function main() {
  const { bars, settings, start, sourceHash, decisions } = await loadStudy();
  const designHash = sha(await readFile(join(root, "MA_TYPE_DESIGN.md"), "utf8"));
  const previous = JSON.parse(await readFile(join(root, "output/entry-slope-gate/cycle10-sma12-guard-gate11.json"), "utf8")) as AllocationBacktestResult;
  const variants: Record<string, ReturnType<typeof metrics> & { types: AverageType[]; nextOpenReturn: number; nextOpenMaxDrawdown: number; supplementalCount: number; blockedCount: number }> = {};
  for (const a of averageTypes) for (const b of averageTypes) for (const c of averageTypes) {
    const types: [AverageType, AverageType, AverageType] = [a, b, c], id = types.join("-");
    const replay = averageTargets(bars, decisions, start, types);
    const result = runStrategyCycleCloseBacktest(bars, replay.target, settings);
    if (id === "SMA-SMA-SMA" && (Math.abs(result.totalReturn - previous.totalReturn) > 1e-9 ||
      JSON.stringify(result.rebalances.map(r => [r.time, r.targetAllocation, r.fillPrice])) !==
      JSON.stringify(previous.rebalances.map(r => [r.time, r.targetAllocation, r.fillPrice])))) throw new Error("SMA baseline reconciliation failed");
    const sensitivity = runAllocationBacktest(bars, replay.target, { ...settings, executionPolicy: "next-open" });
    variants[id] = { types, ...metrics(bars, start, result), nextOpenReturn: sensitivity.totalReturn,
      nextOpenMaxDrawdown: sensitivity.maxDrawdown, supplementalCount: replay.events.filter(e => e.kind === "supplemental").length,
      blockedCount: replay.events.filter(e => e.kind.startsWith("blocked")).length };
    await atomic(join(root, `output/ma-type/${id}.json`), { sourceHash, designHash, ...result, events: replay.events });
  }
  const holding = metrics(bars, start, runStrategyCycleCloseBacktest(bars, bars.map((_, i) => i >= start ? 1 : 0), settings));
  await atomic(join(root, "output/ma-type-summary.json"), { sourceHash, designHash, start: settings.startTime,
    end: settings.endTime, baselineReconciled: true, settings, holding, variants });
  console.log(JSON.stringify({ holding, variants }, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
