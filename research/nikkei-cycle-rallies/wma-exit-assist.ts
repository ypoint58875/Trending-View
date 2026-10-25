import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { averageSlopes, atomic, loadStudy, metrics, root, sha } from "./ma-type";
import { strategyCycleSignalDirection, runStrategyCycleCloseBacktest, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest } from "../../lib/analysis/backtest";
import type { MarketBar } from "../../lib/market/types";

export type ExitAssist = "current" | "release-pending" | "force-clear";
export function exitAssistTargets(bars: MarketBar[], decisions: ReadonlyMap<number, readonly StrategyCycleRecentSignal[]>, start: number,
  mode: ExitAssist, emaPriority = false) {
  const closes = bars.map(b => b.close), entry = averageSlopes(closes, 7, "EMA"), guard = averageSlopes(closes, 11, "SMA"),
    gate = averageSlopes(closes, 14, "WMA"), fast = averageSlopes(closes, 3, "WMA");
  let allocation = 0, pending: number | null = null;
  const target = bars.map(() => 0), events: { time: string; kind: string; from: number; to: number }[] = [];
  for (let i = start; i < bars.length; i++) {
    const signals = decisions.get(i) ?? [], direction = strategyCycleSignalDirection(signals);
    const allowed = gate.sign[i] != null && gate.sign[i]! >= 0;
    const nonpositive = fast.sign[i] != null && fast.sign[i]! <= 0;
    const cross = nonpositive && fast.sign[i - 1] != null && fast.sign[i - 1]! > 0;
    const protectedNow = guard.slope[i] != null && guard.slope[i]! > 0.00125;
    if (direction === "increase") {
      pending = null;
      if (allocation > 1e-10 || allowed) allocation = Math.max(allocation, Math.min(1, Math.max(0, signals.at(-1)!.targetAllocation)));
    } else if (direction === "reduce") {
      const requested = Math.min(1, Math.max(0, signals.at(-1)!.targetAllocation));
      if (requested < allocation - 1e-10) pending = Math.min(pending ?? allocation, requested);
    }
    if (pending !== null && (!protectedNow || (mode === "release-pending" && nonpositive))) {
      if (protectedNow) events.push({ time: bars[i]!.time, kind: "early-release", from: allocation, to: Math.min(allocation, pending) });
      allocation = Math.min(allocation, pending); pending = null;
    }
    if (mode === "force-clear" && cross) {
      if (allocation > 1e-10) events.push({ time: bars[i]!.time, kind: "forced-clear", from: allocation, to: 0 });
      allocation = 0; pending = null;
    } else if (allocation <= 1e-10 && signals.length === 0 && entry.turns[i] && (allowed || emaPriority)) {
      allocation = 1; pending = null;
    }
    target[i] = allocation;
  }
  return { target, events };
}
async function main() {
  const { bars, decisions, start, settings, sourceHash } = await loadStudy();
  const designHash = sha(await readFile(fileURLToPath(import.meta.url), "utf8"));
  const variants = [];
  for (const emaPriority of [false, true]) for (const mode of ["current", "release-pending", "force-clear"] as const) {
    const replay = exitAssistTargets(bars, decisions, start, mode, emaPriority);
    const result = runStrategyCycleCloseBacktest(bars, replay.target, settings);
    if (mode === "current") {
      const previous = JSON.parse(await readFile(join(root, "output", emaPriority ? "ema-entry-priority/ema-priority.json" : "ma-threshold-grid/leaders/EMA7-SMA11-WMA14-t0.00125.json"), "utf8"));
      assert.deepEqual(result.rebalances, previous.rebalances); assert.equal(result.totalReturn, previous.totalReturn);
    }
    const next = runAllocationBacktest(bars, replay.target, { ...settings, executionPolicy: "next-open" });
    const id = `${emaPriority ? "ema-priority" : "production"}-${mode}`;
    variants.push({ id, mode, emaPriority, ...metrics(bars, start, result), events: replay.events,
      nextOpenReturn: next.totalReturn, nextOpenMaxDrawdown: next.maxDrawdown,
      transitions: result.rebalances.map(r => ({ time: r.time, from: r.fromAllocation, target: r.targetAllocation })) });
    await atomic(join(root, `output/wma-exit-assist/${id}.json`), { sourceHash, designHash, ...result, events: replay.events });
  }
  await atomic(join(root, "output/wma-exit-assist-summary.json"), { sourceHash, designHash, settings, baselineReconciled: true, variants });
  console.log(JSON.stringify(variants, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
