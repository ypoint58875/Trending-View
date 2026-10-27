import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atomic, root } from "./analyze";
import { DualAccount, DualContext, dualMenu } from "./dual-return-study";
import { SmaPositionOverlay, ATR_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import { strategyCycleSignalDirection, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import type { MarketBar } from "../../lib/market/types";

type ExitSource = "original-immediate" | "original-deferred" | "rule-stop";
export class PendingExitOrigin {
  index: number | null = null;
  begin(index: number, before: number, pending: number | null, signals: readonly StrategyCycleRecentSignal[]) {
    const direction = strategyCycleSignalDirection(signals);
    if (pending === null || pending > 1e-10 || direction === "increase") this.index = null;
    if (direction === "reduce" && before > 1e-10 && signals.at(-1)!.targetAllocation <= 1e-10 && this.index === null)
      this.index = index;
  }
  classify(index: number, stopped: boolean): ExitSource {
    if (stopped) return "rule-stop";
    assert.ok(this.index !== null && this.index <= index, "Ordinary liquidation must have a causal original zero-target request");
    return this.index === index ? "original-immediate" : "original-deferred";
  }
  finish(pending: number | null, stopped: boolean) {
    if (stopped || pending === null || pending > 1e-10) this.index = null;
  }
}

export interface ShareEvent {
  index: number; time: string; action: "entry" | "liquidation" | "partial-increase" | "partial-reduce";
  source: string; before: number; target: number; originalDirection: string | null;
  hasOriginalSignal: boolean; zeroRequestIndex: number | null; delayBars: number | null;
}
export function eventAction(before: number, target: number): ShareEvent["action"] | null {
  if (Math.abs(target - before) <= 1e-10) return null;
  if (before <= 1e-10 && target > 1e-10) return "entry";
  if (before > 1e-10 && target <= 1e-10) return "liquidation";
  return target > before ? "partial-increase" : "partial-reduce";
}
export function summarizeShare(events: ShareEvent[], from: number, through: number) {
  const selected = events.filter(event => event.index >= from && event.index <= through);
  const group = (action: ShareEvent["action"]) => {
    const rows = selected.filter(event => event.action === action);
    const counts = new Map<string, number>();
    for (const event of rows) counts.set(event.source, (counts.get(event.source) ?? 0) + 1);
    return { total: rows.length, sources: [...counts].map(([source, count]) => ({ source, count, percent: count / rows.length * 100 })) };
  };
  const entries = group("entry"), liquidations = group("liquidation");
  const deferred = selected.filter(event => event.source === "original-deferred" && event.action === "liquidation");
  return { entries, liquidations, partialIncreases: group("partial-increase"), partialReductions: group("partial-reduce"),
    originalExitIntentions: selected.filter(event => event.action === "liquidation" && event.source.startsWith("original-")).length,
    deferredDelayBars: deferred.map(event => event.delayBars), changes: selected.length };
}
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
async function bounded(path: string) { assert.ok((await stat(path)).size <= 16 * 1024 ** 2); return readFile(path, "utf8"); }
async function main() {
  const data = join(root, "data/full-screen-6-15"), output = join(root, "output/signal-share");
  const input = JSON.parse(await bounded(join(data, "input.json"))) as {
    bars: MarketBar[]; barsHash: string; snapshots: { decisionIndex: number }[];
  };
  const saved = JSON.parse(await bounded(join(data, "signals.json"))) as {
    sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[];
  };
  const prior = JSON.parse(await bounded(join(root, "output/contribution/dynamic-v6.json")));
  const sourceHash = sha(JSON.stringify(input)); assert.equal(sourceHash, saved.sourceHash); assert.equal(prior.sourceHash, sourceHash);
  assert.equal(sha(JSON.stringify(input.bars)), input.barsHash);
  assert.ok(input.bars.length <= 10000 && saved.rows.length <= 2048);
  assert.deepEqual(saved.rows.map(row => row.index), input.snapshots.map(snapshot => snapshot.decisionIndex));
  const implementationHash = sha((await Promise.all(["SIGNAL_SHARE_DESIGN.md", "signal-share-study.ts", "dual-return-study.ts",
    "sma20-fallback.ts", "v-recovery-study.ts", "sma-entry-study.ts", "../../lib/analysis/sma-position-overlay.ts",
    "../../lib/analysis/strategy-cycle-validation.ts"].map(path => readFile(join(root, path), "utf8")))).join("\n"));
  const { bars } = input, start = bars.length - 2000;
  const decisions = new Map(saved.rows.map(row => [row.index, row.signals]));
  const policy = dualMenu().find(row => row.id === "daily4-ema3-baseline")!;
  const account = new DualAccount(new DualContext(bars), policy, start);
  const production = new SmaPositionOverlay(bars, DEFAULT_POSITION_OVERLAY_OPTIONS), origin = new PendingExitOrigin();
  const events: ShareEvent[] = [], targets = bars.map(() => 0);
  for (let index = start; index < bars.length; index++) {
    const signals = decisions.get(index) ?? [], direction = strategyCycleSignalDirection(signals);
    const before = account.inner.account.account.allocation, pending = account.inner.account.account.pending;
    origin.begin(index, before, pending, signals);
    if (direction) production.request(direction, signals.at(-1)!.targetAllocation, index);
    const state = account.step(index, signals), target = production.close(index, signals.length > 0);
    assert.equal(state.before, prior.daily[index - start]!.before);
    assert.equal(state.target, target); assert.equal(target, prior.targets[index]); targets[index] = target;
    const action = eventAction(before, target);
    if (action) {
      const source = action === "entry" ? state.kind! : action === "liquidation" ? origin.classify(index, state.cut) :
        direction === "increase" ? "original-increase" : state.recovered ? "native-recovery" : "original-reduction-or-release";
      events.push({ index, time: bars[index]!.time, action, source, before, target, originalDirection: direction,
        hasOriginalSignal: signals.length > 0, zeroRequestIndex: action === "liquidation" && !state.cut ? origin.index : null,
        delayBars: action === "liquidation" && !state.cut ? index - origin.index! : null });
    }
    origin.finish(state.pending, state.cut);
  }
  assert.equal(sha(JSON.stringify(targets)), prior.targetHash);
  const full = summarizeShare(events, start, bars.length - 1), final500 = summarizeShare(events, bars.length - 500, bars.length - 1);
  const recent = summarizeShare(events, bars.findIndex(bar => bar.time === "2026-07-21") + 1, bars.length - 1);
  assert.equal(full.entries.total, 57); assert.equal(full.liquidations.total, 57); assert.equal(full.changes, prior.targetChanges);
  const summary = { sourceHash, implementationHash, generatedAt: new Date().toISOString(), start: bars[start]!.time,
    end: bars.at(-1)!.time, final500Start: bars[bars.length - 500]!.time, full, final500, recent,
    limitation: "Actual target-transition counts in one continuous Nikkei close-proxy account, not profit shares. Deferred original exits are joint strategy intention/rule timing, not independent rule sell signals. Partial rebalances excluded from entry/liquidation denominators." };
  await atomic(join(output, "events.json"), { sourceHash, implementationHash, events });
  await atomic(join(output, "summary.json"), summary);
  const table = (scope: typeof full) => [
    ...scope.entries.sources.map(row => `| Entry | ${row.source} | ${row.count} | ${row.percent.toFixed(2)} |`),
    ...scope.liquidations.sources.map(row => `| Liquidation | ${row.source} | ${row.count} | ${row.percent.toFixed(2)} |`),
  ].join("\n");
  const report = `# Actual entry and liquidation source shares\n\n${summary.start}..${summary.end}; final500 starts${summary.final500Start}. Same frozen source/costs; no product changes.\n\n## Full2000\n\n| Action | Source | Count | Share % |\n|---|---|---:|---:|\n${table(full)}\n\n## Final500\n\n| Action | Source | Count | Share % |\n|---|---|---:|---:|\n${table(final500)}\n\n## AfterJuly21\n\n| Action | Source | Count | Share % |\n|---|---|---:|---:|\n${table(recent)}\n\nAll changes:${full.changes}; partial increases:${full.partialIncreases.total}; partial reductions:${full.partialReductions.total}. Entry and liquidation denominator:${full.entries.total}/${full.liquidations.total}. Original full-exit intentions:${full.originalExitIntentions}; deferred delays in bars:${JSON.stringify(full.deferredDelayBars)}.\n\n${summary.limitation}\n`;
  await writeFile(join(output, "REPORT.md.tmp"), report);
  await replaceFileAtomically(join(output, "REPORT.md.tmp"), join(output, "REPORT.md"));
  console.log(JSON.stringify(summary));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
