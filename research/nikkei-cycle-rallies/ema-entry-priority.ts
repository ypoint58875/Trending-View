import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atomic, loadStudy, metrics, root, sha, averageSlopes } from "./ma-type";
import { SmaPositionOverlay, MIXED_POSITION_OVERLAY_MODEL } from "../../lib/analysis/sma-position-overlay";
import { strategyCycleSignalDirection, runStrategyCycleCloseBacktest, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest } from "../../lib/analysis/backtest";
import type { MarketBar } from "../../lib/market/types";

/** EMA turns bypass only the WMA flat-entry veto; original buys retain that veto. */
export function priorityTargets(bars: MarketBar[], decisions: ReadonlyMap<number, readonly StrategyCycleRecentSignal[]>, start: number, priority: boolean) {
  const gate = averageSlopes(bars.map(b => b.close), 14, "WMA");
  const account = new SmaPositionOverlay(bars, { model: MIXED_POSITION_OVERLAY_MODEL, supplementalEntry: true, exitGuard: true, entrySlopeGate: !priority });
  const target = bars.map(() => 0), overrides: { time: string; slopePercent: number | null }[] = [];
  for (let i = start; i < bars.length; i++) {
    const signals = decisions.get(i) ?? [], direction = strategyCycleSignalDirection(signals);
    const allowed = gate.sign[i] != null && gate.sign[i]! >= 0;
    if (direction) {
      const requested = priority && direction === "increase" && account.allocation <= 1e-10 && !allowed ? 0 : signals.at(-1)!.targetAllocation;
      account.request(direction, requested, i);
    }
    const before = account.allocation;
    account.close(i, signals.length > 0);
    if (priority && before <= 1e-10 && account.allocation > 1e-10 && !allowed) overrides.push({ time: bars[i]!.time,
      slopePercent: gate.slope[i] == null ? null : gate.slope[i]! * 100 });
    target[i] = account.allocation;
  }
  return { target, overrides };
}
async function main() {
  const { bars, decisions, start, settings, sourceHash } = await loadStudy();
  const designHash = sha(await readFile(fileURLToPath(import.meta.url), "utf8"));
  const variants = [];
  for (const priority of [false, true]) {
    const replay = priorityTargets(bars, decisions, start, priority);
    const result = runStrategyCycleCloseBacktest(bars, replay.target, settings);
    if (!priority) {
      const previous = JSON.parse(await readFile(join(root, "output/ma-threshold-grid/leaders/EMA7-SMA11-WMA14-t0.00125.json"), "utf8"));
      assert.deepEqual(result.rebalances, previous.rebalances); assert.equal(result.totalReturn, previous.totalReturn);
    }
    const next = runAllocationBacktest(bars, replay.target, { ...settings, executionPolicy: "next-open" });
    const id = priority ? "ema-priority" : "wma-veto";
    variants.push({ id, ...metrics(bars, start, result), overrides: replay.overrides, nextOpenReturn: next.totalReturn, nextOpenMaxDrawdown: next.maxDrawdown,
      transitions: result.rebalances.map(r => ({ time: r.time, from: r.fromAllocation, target: r.targetAllocation })) });
    await atomic(join(root, `output/ema-entry-priority/${id}.json`), { sourceHash, designHash, ...result, overrides: replay.overrides });
  }
  await atomic(join(root, "output/ema-entry-priority-summary.json"), { sourceHash, designHash, settings, baselineReconciled: true, variants });
  console.log(JSON.stringify(variants, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
