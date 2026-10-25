import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { averageSlopes, averageTargets, atomic, loadStudy, metrics, root, sha } from "./ma-type";
import { SmaPositionOverlay, MIXED_POSITION_OVERLAY_MODEL } from "../../lib/analysis/sma-position-overlay";
import { strategyCycleSignalDirection, runStrategyCycleCloseBacktest, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest } from "../../lib/analysis/backtest";
import type { MarketBar } from "../../lib/market/types";

export function unlockTargets(bars: MarketBar[], decisions: ReadonlyMap<number, readonly StrategyCycleRecentSignal[]>, start: number) {
  const closes = bars.map(b => b.close), entry = averageSlopes(closes, 7, "EMA"), gate = averageSlopes(closes, 14, "WMA");
  const account = new SmaPositionOverlay(bars, { model: MIXED_POSITION_OVERLAY_MODEL, supplementalEntry: true, exitGuard: true, entrySlopeGate: true });
  const target = bars.map(() => 0), added: string[] = [];
  for (let i = start; i < bars.length; i++) {
    const signals = decisions.get(i) ?? [], direction = strategyCycleSignalDirection(signals);
    if (direction) account.request(direction, signals.at(-1)!.targetAllocation, i);
    account.close(i, signals.length > 0);
    if (account.allocation <= 1e-10 && signals.length === 0 && entry.sign[i] != null && entry.sign[i]! > 0 &&
      gate.sign[i] != null && gate.sign[i]! >= 0 && gate.sign[i - 1] != null && gate.sign[i - 1]! < 0) {
      account.request("increase", 1, i); added.push(bars[i]!.time);
    }
    target[i] = account.allocation;
  }
  return { target, added };
}
async function main() {
  const { bars, decisions, start, settings, sourceHash } = await loadStudy();
  const designHash = sha(await readFile(fileURLToPath(import.meta.url), "utf8"));
  const profiles = [
    { id: "current", periods: [7, 11, 14] as const, threshold: 0.00125 },
    { id: "gate13", periods: [7, 11, 13] as const, threshold: 0.00125 },
    { id: "gate7", periods: [7, 11, 7] as const, threshold: 0.00125 },
    { id: "exit10", periods: [7, 10, 14] as const, threshold: 0.00125 },
    { id: "threshold0.15", periods: [7, 11, 14] as const, threshold: 0.0015 },
    { id: "unlock-entry", periods: [7, 11, 14] as const, threshold: 0.00125 },
  ];
  const variants = [];
  for (const profile of profiles) {
    const replay = profile.id === "unlock-entry" ? unlockTargets(bars, decisions, start) : averageTargets(bars, decisions, start, ["EMA", "SMA", "WMA"], profile.periods, profile.threshold);
    const result = runStrategyCycleCloseBacktest(bars, replay.target, settings);
    if (profile.id === "current") {
      const previous = JSON.parse(await readFile(join(root, "output/ma-threshold-grid/leaders/EMA7-SMA11-WMA14-t0.00125.json"), "utf8"));
      assert.deepEqual(result.rebalances, previous.rebalances); assert.equal(result.totalReturn, previous.totalReturn);
    }
    const next = runAllocationBacktest(bars, replay.target, { ...settings, executionPolicy: "next-open" });
    variants.push({ ...profile, ...metrics(bars, start, result), added: "added" in replay ? replay.added : [], nextOpenReturn: next.totalReturn,
      transitions: result.rebalances.map(r => ({ time: r.time, from: r.fromAllocation, target: r.targetAllocation })) });
    await atomic(join(root, `output/timing-review/${profile.id}.json`), { sourceHash, designHash, ...result });
  }
  await atomic(join(root, "output/timing-review-summary.json"), { sourceHash, designHash, settings, baselineReconciled: true, variants });
  console.log(JSON.stringify(variants, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
