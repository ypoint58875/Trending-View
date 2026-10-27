import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { root, atomic, pathMetrics } from "./analyze";
import { ExpandedAccount, ExpandedContext } from "./drawdown-expansion";
import { baseRule } from "./cumulative-stop-study";
import { SmaPositionOverlay, ATR_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS, FIXED_HOLD5_POSITION_OVERLAY_MODEL } from "../../lib/analysis/sma-position-overlay";
import { runAllocationBacktest, type BacktestSettings } from "../../lib/analysis/backtest";
import { runStrategyCycleCloseBacktest, strategyCycleSignalDirection, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";

export class TrailingStopAccount {
  readonly inner: ExpandedAccount;
  enteredAt: number | null = null;
  blockedUntil = 0;
  constructor(readonly context: ExpandedContext, readonly trailing: number | null, readonly earlyStop = true) {
    this.inner = new ExpandedAccount(context);
  }
  step(index: number, signals: readonly StrategyCycleRecentSignal[]) {
    const before = this.inner.inner.account.allocation;
    if (before <= 1e-10 && index < this.blockedUntil) return { target: 0, early: false, trailing: false, recovered: false };
    const step = this.inner.step(index, signals, baseRule("ma20-wma", true));
    let target = step.target;
    if (before <= 1e-10 && target > 1e-10) this.enteredAt = index;
    if (before > 1e-10 && target <= 1e-10) this.enteredAt = null;
    const age = this.enteredAt === null ? Infinity : index - this.enteredAt;
    const close = this.context.bars[index]!.close;
    const held = before > 1e-10 && target > 1e-10;
    const early = held && this.earlyStop && age <= 5 && this.inner.entryClose > 0 && close <= this.inner.entryClose * 0.96;
    const trailing = held && this.trailing !== null && this.inner.peakClose > 0 && close <= this.inner.peakClose * (1 - this.trailing);
    if (early || trailing) {
      this.inner.recoveryTarget = target; this.inner.cutIndex = index;
      target = 0; this.inner.inner.account.allocation = 0;
      this.inner.inner.account.pending = null; this.inner.inner.lastSupplement = null;
      this.blockedUntil = index + 6; this.enteredAt = null;
    }
    return { target, early, trailing, recovered: step.recovered };
  }
}
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
async function bounded(path: string) { assert.ok((await stat(path)).size <= 16 * 1024 ** 2); return readFile(path, "utf8"); }
async function main() {
  const data = join(root, "data/full-screen-6-15"), output = join(root, "output/trailing-stop-six");
  const input = JSON.parse(await bounded(join(data, "input.json"))) as {
    bars: MarketBar[]; barsHash: string; batch: string; settings: BacktestSettings; snapshots: { decisionIndex: number }[];
  };
  const saved = JSON.parse(await bounded(join(data, "signals.json"))) as {
    sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[];
  };
  const sourceHash = sha(JSON.stringify(input));
  assert.equal(sourceHash, saved.sourceHash); assert.equal(sha(JSON.stringify(input.bars)), input.barsHash);
  assert.ok(input.bars.length <= 10000 && saved.rows.length <= 2048);
  assert.equal(saved.rows.length, input.snapshots.length);
  const decisions = new Map(saved.rows.map((r, n) => { assert.equal(r.index, input.snapshots[n]!.decisionIndex); return [r.index, r.signals] as const; }));
  const { bars, settings } = input, start = bars.length - 2000, context = new ExpandedContext(bars);
  const production = new SmaPositionOverlay(bars, { ...DEFAULT_POSITION_OVERLAY_OPTIONS, model: FIXED_HOLD5_POSITION_OVERLAY_MODEL });
  const productionTargets = bars.map(() => 0);
  for (let i = start; i < bars.length; i++) {
    const signals = decisions.get(i) ?? [], direction = strategyCycleSignalDirection(signals);
    if (direction) production.request(direction, signals.at(-1)!.targetAllocation, i);
    productionTargets[i] = production.close(i, signals.length > 0);
  }
  const designHash = sha((await Promise.all(["TRAILING_STOP_DESIGN.md", "trailing-stop-six.ts", "drawdown-expansion.ts", "rule-variants.ts",
    "cumulative-stop-study.ts", "analyze.ts", "../../lib/analysis/sma-position-overlay.ts", "../../lib/analysis/backtest.ts",
    "../../lib/analysis/strategy-cycle-validation.ts"].map(p => readFile(join(root, p), "utf8")))).join("\n"));
  const selections = [];
  for (const [label, trailing, earlyStop] of [
    ["current-v4", null, true], ["add-trail6", 0.06, true], ["replace-with-trail6", 0.06, false],
    ["add-trail5", 0.05, true], ["add-trail7", 0.07, true],
  ] as const) {
    assert.ok(process.memoryUsage().rss < 1.5 * 1024 ** 3);
    const account = new TrailingStopAccount(context, trailing, earlyStop), targets = bars.map(() => 0);
    const stops: { time: string; early: boolean; trailing: boolean; close: number; peak: number; entry: number }[] = [];
    let recoveries = 0;
    for (let i = start; i < bars.length; i++) {
      const step = account.step(i, decisions.get(i) ?? []); targets[i] = step.target;
      recoveries += Number(step.recovered);
      if (step.early || step.trailing) stops.push({ time: bars[i]!.time, early: step.early, trailing: step.trailing,
        close: bars[i]!.close, peak: account.inner.peakClose, entry: account.inner.entryClose });
    }
    if (label === "current-v4") assert.deepEqual(targets, productionTargets);
    const result = runStrategyCycleCloseBacktest(bars, targets, settings);
    const summary = runStrategyCycleCloseBacktest(bars, targets, { ...settings, summaryOnly: true });
    assert.equal(summary.totalReturn, result.totalReturn); assert.equal(summary.maxDrawdown, result.maxDrawdown);
    if (label === "current-v4") {
      assert.ok(Math.abs(result.totalReturn - 328.0321475882787) < 1e-9);
      assert.ok(Math.abs(result.maxDrawdown + 12.018669614293076) < 1e-9);
    }
    const prefix = Float64Array.from([0, ...result.equity.map(e => Math.log(e.equity / settings.initialCash))]);
    assert.equal(prefix.length, 2001);
    const doubleCost = runStrategyCycleCloseBacktest(bars, targets, { ...settings,
      commissionRate: settings.commissionRate * 2, slippageRate: settings.slippageRate * 2, summaryOnly: true });
    const nextOpen = runAllocationBacktest(bars, targets, { ...settings, executionPolicy: "next-open" });
    const row = { label, trailing, earlyStop, totalReturn: result.totalReturn, maxDrawdown: result.maxDrawdown,
      fills: result.tradeCount, stops, recoveries, first1500: pathMetrics(prefix, 0, 1500), final500: pathMetrics(prefix, 1500, 2000),
      doubleCost: { totalReturn: doubleCost.totalReturn, maxDrawdown: doubleCost.maxDrawdown },
      nextOpen: { totalReturn: nextOpen.totalReturn, maxDrawdown: nextOpen.maxDrawdown } };
    selections.push(row);
    await atomic(join(output, `${label}.json`), { sourceHash, designHash, row, targets, result });
  }
  await atomic(join(output, "summary.json"), { sourceHash, designHash, generatedAt: new Date().toISOString(), batch: input.batch, selections });
  console.log(JSON.stringify(selections, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exitCode = 1; });
