import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { averageSlopes, atomic, loadStudy, metrics, root, sha } from "./ma-type";
import { SmaPositionOverlay, MIXED_POSITION_OVERLAY_MODEL } from "../../lib/analysis/sma-position-overlay";
import { strategyCycleSignalDirection, runStrategyCycleCloseBacktest, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest } from "../../lib/analysis/backtest";
import type { MarketBar } from "../../lib/market/types";

export function fallbackTargets(bars: MarketBar[], decisions: ReadonlyMap<number, readonly StrategyCycleRecentSignal[]>, start: number,
  period: number | null, cancelInvalid = false, laterOnly = false) {
  const closes = bars.map(b => b.close), entry = averageSlopes(closes, 7, "EMA"), gate = averageSlopes(closes, 14, "WMA");
  const fallback = period === null ? null : averageSlopes(closes, period, "EMA");
  // This adapter gates buys explicitly; the shared controller still owns pending reductions.
  const account = new SmaPositionOverlay(bars, { model: MIXED_POSITION_OVERLAY_MODEL, exitGuard: true });
  let waiting: number | null = null;
  const target = bars.map(() => 0), events: { time: string; kind: string; requested?: string; wmaSlope?: number | null }[] = [];
  for (let i = start; i < bars.length; i++) {
    const signals = decisions.get(i) ?? [], direction = strategyCycleSignalDirection(signals);
    const allowed = gate.sign[i] != null && gate.sign[i]! >= 0;
    if (waiting !== null && cancelInvalid && (entry.sign[i] == null || entry.sign[i]! <= 0 || signals.some(s => s.direction === "reduce"))) {
      events.push({ time: bars[i]!.time, kind: "cancelled", requested: bars[waiting]!.time }); waiting = null;
    }
    if (direction) account.request(direction,
      direction === "increase" && account.allocation <= 1e-10 && !allowed ? 0 : signals.at(-1)!.targetAllocation, i);
    account.close(i, signals.length > 0);
    if (account.allocation > 1e-10) waiting = null;
    if (account.allocation <= 1e-10 && signals.length === 0) {
      if (entry.turns[i] && allowed) { account.request("increase", 1, i); waiting = null; }
      else {
        if (period !== null && entry.turns[i] && gate.sign[i] != null && gate.sign[i]! < 0) {
          if (waiting === null) events.push({ time: bars[i]!.time, kind: "queued" });
          waiting = i;
        }
        if (waiting !== null && fallback?.turns[i] && (!laterOnly || i > waiting)) {
          account.request("increase", 1, i);
          events.push({ time: bars[i]!.time, kind: "fallback-entry", requested: bars[waiting]!.time, wmaSlope: gate.slope[i] }); waiting = null;
        }
      }
    }
    target[i] = account.allocation;
  }
  return { target, events };
}
async function main() {
  const { bars, decisions, start, settings, sourceHash } = await loadStudy();
  const designHash = sha(await readFile(fileURLToPath(import.meta.url), "utf8")), variants = [];
  const profiles = [{ period: null, cancelInvalid: false, laterOnly: false }, ...[false, true].flatMap(laterOnly => [false, true].flatMap(cancelInvalid =>
    Array.from({ length: 7 }, (_, i) => ({ period: i + 8, cancelInvalid, laterOnly }))))];
  for (const { period, cancelInvalid, laterOnly } of profiles) {
    const replay = fallbackTargets(bars, decisions, start, period, cancelInvalid, laterOnly);
    const result = runStrategyCycleCloseBacktest(bars, replay.target, settings);
    if (period === null) {
      const previous = JSON.parse(await readFile(join(root, "output/ma-threshold-grid/leaders/EMA7-SMA11-WMA14-t0.00125.json"), "utf8"));
      assert.deepEqual(result.rebalances, previous.rebalances); assert.equal(result.totalReturn, previous.totalReturn);
    }
    const next = runAllocationBacktest(bars, replay.target, { ...settings, executionPolicy: "next-open" });
    const id = period === null ? "current" : `ema${period}-${cancelInvalid ? "cancel-invalid" : "persistent"}${laterOnly ? "-later" : ""}`;
    variants.push({ id, period, cancelInvalid, laterOnly, ...metrics(bars, start, result), events: replay.events,
      nextOpenReturn: next.totalReturn, nextOpenMaxDrawdown: next.maxDrawdown,
      transitions: result.rebalances.map(r => ({ time: r.time, from: r.fromAllocation, target: r.targetAllocation })) });
    await atomic(join(root, `output/ema-fallback-entry/${id}.json`), { sourceHash, designHash, ...result, events: replay.events });
  }
  await atomic(join(root, "output/ema-fallback-entry-summary.json"), { sourceHash, designHash, settings, baselineReconciled: true, variants });
  console.log(JSON.stringify(variants, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
