import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { averageSlopes, atomic, loadStudy, metrics, root, sha } from "./ma-type";
import { SmaPositionOverlay, MIXED_POSITION_OVERLAY_MODEL } from "../../lib/analysis/sma-position-overlay";
import { strategyCycleSignalDirection, runStrategyCycleCloseBacktest, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest } from "../../lib/analysis/backtest";
import type { MarketBar } from "../../lib/market/types";

export type DeferredEntryMode = "current" | "wait-for-wma" | "cancel-on-invalidation";
export function deferredTargets(bars: MarketBar[], decisions: ReadonlyMap<number, readonly StrategyCycleRecentSignal[]>, start: number, mode: DeferredEntryMode) {
  const closes = bars.map(b => b.close), entry = averageSlopes(closes, 7, "EMA"), gate = averageSlopes(closes, 14, "WMA");
  const account = new SmaPositionOverlay(bars, { model: MIXED_POSITION_OVERLAY_MODEL, supplementalEntry: true, exitGuard: true, entrySlopeGate: true });
  let waiting: number | null = null;
  const target = bars.map(() => 0), events: { time: string; kind: string; requested?: string; sessions?: number }[] = [];
  for (let i = start; i < bars.length; i++) {
    const signals = decisions.get(i) ?? [], direction = strategyCycleSignalDirection(signals);
    if (waiting !== null && mode === "cancel-on-invalidation" &&
      (entry.sign[i] == null || entry.sign[i]! <= 0 || signals.some(s => s.direction === "reduce"))) {
      events.push({ time: bars[i]!.time, kind: "cancelled", requested: bars[waiting]!.time }); waiting = null;
    }
    if (direction) account.request(direction, signals.at(-1)!.targetAllocation, i);
    account.close(i, signals.length > 0);
    if (account.allocation > 1e-10) waiting = null;
    if (mode !== "current" && account.allocation <= 1e-10 && signals.length === 0 && entry.turns[i] && gate.sign[i] != null && gate.sign[i]! < 0) {
      events.push({ time: bars[i]!.time, kind: waiting === null ? "queued" : "renewed",
        ...(waiting === null ? {} : { requested: bars[waiting]!.time }) });
      waiting = i;
    }
    if (waiting !== null && account.allocation <= 1e-10 && signals.length === 0 && gate.sign[i] != null && gate.sign[i]! > 0) {
      account.request("increase", 1, i);
      events.push({ time: bars[i]!.time, kind: "executed", requested: bars[waiting]!.time, sessions: i - waiting }); waiting = null;
    }
    target[i] = account.allocation;
  }
  return { target, events, waiting: waiting === null ? null : bars[waiting]!.time };
}
async function main() {
  const { bars, decisions, start, settings, sourceHash } = await loadStudy();
  const designHash = sha(await readFile(fileURLToPath(import.meta.url), "utf8"));
  const variants = [];
  for (const mode of ["current", "wait-for-wma", "cancel-on-invalidation"] as const) {
    const replay = deferredTargets(bars, decisions, start, mode);
    const result = runStrategyCycleCloseBacktest(bars, replay.target, settings);
    if (mode === "current") {
      const previous = JSON.parse(await readFile(join(root, "output/ma-threshold-grid/leaders/EMA7-SMA11-WMA14-t0.00125.json"), "utf8"));
      assert.deepEqual(result.rebalances, previous.rebalances); assert.equal(result.totalReturn, previous.totalReturn);
    }
    const next = runAllocationBacktest(bars, replay.target, { ...settings, executionPolicy: "next-open" });
    variants.push({ mode, ...metrics(bars, start, result), events: replay.events, waiting: replay.waiting,
      nextOpenReturn: next.totalReturn, nextOpenMaxDrawdown: next.maxDrawdown,
      transitions: result.rebalances.map(r => ({ time: r.time, from: r.fromAllocation, target: r.targetAllocation })) });
    await atomic(join(root, `output/deferred-ema-entry/${mode}.json`), { sourceHash, designHash, ...result, events: replay.events });
  }
  await atomic(join(root, "output/deferred-ema-entry-summary.json"), { sourceHash, designHash, settings, baselineReconciled: true, variants });
  console.log(JSON.stringify(variants, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
