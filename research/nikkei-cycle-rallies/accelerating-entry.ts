import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { averageSlopes, atomic, loadStudy, metrics, root, sha } from "./ma-type";
import { SmaPositionOverlay } from "../../lib/analysis/sma-position-overlay";
import { strategyCycleSignalDirection, runStrategyCycleCloseBacktest, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest, type AllocationBacktestResult } from "../../lib/analysis/backtest";
import type { MarketBar } from "../../lib/market/types";

/** Positive, strictly increasing normalized daily SMA slope; equality cannot trigger. */
export function positiveAcceleration(closes: number[], period = 12) {
  const { slope, sign } = averageSlopes(closes, period, "SMA");
  return slope.map((value, i) => sign[i] !== null && sign[i]! > 0 && value !== null && slope[i - 1] != null && value > slope[i - 1]!);
}
export function acceleratingTargets(bars: MarketBar[], decisions: ReadonlyMap<number, readonly StrategyCycleRecentSignal[]>,
  start: number, enabled: boolean, entryGate = true) {
  const acceleration = positiveAcceleration(bars.map(b => b.close));
  const account = new SmaPositionOverlay(bars, { supplementalEntry: true, exitGuard: true, entrySlopeGate: entryGate });
  const target = bars.map(() => 0), added: string[] = [], blocked: string[] = [];
  for (let i = start; i < bars.length; i++) {
    const signals = decisions.get(i) ?? [], direction = strategyCycleSignalDirection(signals);
    if (direction) account.request(direction, signals.at(-1)!.targetAllocation, i);
    account.close(i, signals.length > 0);
    if (enabled && account.allocation <= 1e-10 && signals.length === 0 && acceleration[i]) {
      account.request("increase", 1, i);
      (account.allocation > 1e-10 ? added : blocked).push(bars[i]!.time);
    }
    target[i] = account.allocation;
  }
  return { target, added, blocked };
}

async function main() {
  const { bars, decisions, start, settings, sourceHash } = await loadStudy();
  const designHash = sha(await readFile(fileURLToPath(import.meta.url), "utf8"));
  const variants = [];
  for (const entryGate of [true, false]) for (const enabled of [false, true]) {
    const replay = acceleratingTargets(bars, decisions, start, enabled, entryGate);
    const result = runStrategyCycleCloseBacktest(bars, replay.target, settings);
    if (!enabled) {
      const path = entryGate ? "entry-slope-gate/cycle10-sma12-guard-gate11.json" : "exit-guard/sma12-slope0.2.json";
      const previous = JSON.parse(await readFile(join(root, "output", path), "utf8")) as AllocationBacktestResult;
      if (JSON.stringify(result.rebalances) !== JSON.stringify(previous.rebalances) || Math.abs(result.totalReturn - previous.totalReturn) > 1e-9) throw new Error("Control reconciliation failed");
    }
    const next = runAllocationBacktest(bars, replay.target, { ...settings, executionPolicy: "next-open" });
    const id = `gate${entryGate ? 11 : 0}-${enabled ? "turn-or-accelerate" : "turn"}`;
    variants.push({ id, entryGate, enabled, ...metrics(bars, start, result), added: replay.added, blocked: replay.blocked,
      nextOpenReturn: next.totalReturn, nextOpenMaxDrawdown: next.maxDrawdown });
    await atomic(join(root, `output/accelerating-entry/${id}.json`), { sourceHash, designHash, ...result, added: replay.added, blocked: replay.blocked });
  }
  await atomic(join(root, "output/accelerating-entry-summary.json"), { sourceHash, designHash, start: settings.startTime, end: settings.endTime,
    settings, baselineReconciled: true, definition: "SMA12 turns positive OR daily normalized slope is positive and strictly above yesterday; flat, no original signal; preserve SMA11 gate and SMA12 0.2% deferred exit", variants });
  console.log(JSON.stringify(variants, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
