import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atomic, loadStudy, metrics, root, sha } from "./ma-type";
import { wma } from "../../lib/analysis/indicators";
import { SmaPositionOverlay, MIXED_POSITION_OVERLAY_MODEL } from "../../lib/analysis/sma-position-overlay";
import { strategyCycleSignalDirection, runStrategyCycleCloseBacktest, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest } from "../../lib/analysis/backtest";
import type { MarketBar } from "../../lib/market/types";

/** Gate existing-position increases as well as the controller's existing flat entries. */
export function addGatedTargets(bars: MarketBar[], decisions: ReadonlyMap<number, readonly StrategyCycleRecentSignal[]>,
  start: number, enabled: boolean) {
  const average = wma(bars.map(b => b.close), 14);
  const account = new SmaPositionOverlay(bars, { model: MIXED_POSITION_OVERLAY_MODEL, supplementalEntry: true, exitGuard: true, entrySlopeGate: true });
  const target = bars.map(() => 0), blocked: { time: string; from: number; requested: number; slope: number | null }[] = [];
  for (let i = start; i < bars.length; i++) {
    const signals = decisions.get(i) ?? [], direction = strategyCycleSignalDirection(signals);
    if (direction) {
      const requested = Math.min(1, Math.max(0, signals.at(-1)!.targetAllocation));
      const allowed = average[i] != null && average[i - 1] != null && average[i]! >= average[i - 1]!;
      if (enabled && direction === "increase" && account.allocation > 1e-10 && requested > account.allocation + 1e-10 && !allowed) {
        blocked.push({ time: bars[i]!.time, from: account.allocation, requested,
          slope: average[i] != null && average[i - 1] != null ? average[i]! / average[i - 1]! - 1 : null });
        // Preserve fresh-buy cancellation of pending sells, but reject the exposure increase.
        account.request("increase", account.allocation, i);
      } else account.request(direction, requested, i);
    }
    target[i] = account.close(i, signals.length > 0);
  }
  return { target, blocked };
}
async function main() {
  const { bars, decisions, start, settings, sourceHash } = await loadStudy();
  const designHash = sha(await readFile(fileURLToPath(import.meta.url), "utf8"));
  const variants = [];
  for (const enabled of [false, true]) {
    const replay = addGatedTargets(bars, decisions, start, enabled);
    const result = runStrategyCycleCloseBacktest(bars, replay.target, settings);
    if (!enabled) {
      const previous = JSON.parse(await readFile(join(root, "output/ma-threshold-grid/leaders/EMA7-SMA11-WMA14-t0.00125.json"), "utf8"));
      assert.deepEqual(result.rebalances, previous.rebalances);
      assert.equal(result.totalReturn, previous.totalReturn);
    }
    const next = runAllocationBacktest(bars, replay.target, { ...settings, executionPolicy: "next-open" });
    const id = enabled ? "all-increases" : "flat-entry-only";
    variants.push({ id, ...metrics(bars, start, result), blocked: replay.blocked,
      nextOpenReturn: next.totalReturn, nextOpenMaxDrawdown: next.maxDrawdown });
    await atomic(join(root, `output/wma-add-gate/${id}.json`), { sourceHash, designHash, ...result, blocked: replay.blocked });
  }
  await atomic(join(root, "output/wma-add-gate-summary.json"), { sourceHash, designHash, start: settings.startTime, end: settings.endTime,
    settings, baselineReconciled: true, variants });
  console.log(JSON.stringify(variants, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
