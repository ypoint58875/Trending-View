import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Account, Features, root, atomic, pathMetrics } from "./analyze";
import { PREVIOUS_POSITION_OVERLAY_MODEL as CURRENT_POSITION_OVERLAY_MODEL, SmaPositionOverlay } from "../../lib/analysis/sma-position-overlay";
import { runStrategyCycleCloseBacktest, strategyCycleSignalDirection, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";
import type { BacktestSettings } from "../../lib/analysis/backtest";

export type Mode = "baseline" | "delayed-ema" | "wma-turn";
const parameters = { entry: 7, exit: 11, gate: 7, threshold: 0.00075, flags: 7 };
export class TurnAccount {
  readonly account = new Account();
  pendingEntry = false;
  constructor(readonly mode: Mode) {}
  step(index: number, signals: readonly StrategyCycleRecentSignal[], features: Features) {
    const before = this.account.allocation, ema = features.get("EMA", 7), wma = features.get("WMA", 7);
    const direction = strategyCycleSignalDirection(signals);
    if (before > 1e-10 || (ema.sign[index] ?? -1) <= 0 || direction === "reduce") this.pendingEntry = false;
    if (this.mode === "delayed-ema" && before <= 1e-10 && ema.turns[index] && (wma.sign[index] ?? 0) < 0 &&
      (signals.length === 0 || direction === "increase")) this.pendingEntry = true;
    this.account.step(index, signals, parameters, features);
    const trigger = this.mode === "delayed-ema" ? this.pendingEntry && (wma.sign[index] ?? -1) > 0
      : this.mode === "wma-turn" && wma.turns[index];
    const extraEntry = this.account.allocation <= 1e-10 && signals.length === 0 && !!trigger;
    if (extraEntry) { this.account.allocation = 1; this.account.pending = null; }
    if (this.account.allocation > 1e-10) this.pendingEntry = false;
    return { target: this.account.allocation, extraEntry, pendingEntry: this.pendingEntry };
  }
}
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
async function bounded(path: string) { assert.ok((await stat(path)).size <= 16 * 1024 ** 2); return readFile(path, "utf8"); }
async function main() {
  const data = join(root, "data/full-screen-6-15"), output = join(root, "output/wma-turn");
  const input = JSON.parse(await bounded(join(data, "input.json"))) as { bars: MarketBar[]; barsHash: string;
    snapshots: { decisionIndex: number }[]; settings: BacktestSettings; batch: string; accessedAt: string };
  const sourceHash = sha(JSON.stringify(input)), saved = JSON.parse(await bounded(join(data, "signals.json")));
  const previous = JSON.parse(await bounded(join(root, "output/full-screen-6-15/summary.json")));
  assert.equal(sourceHash, saved.sourceHash); assert.equal(sourceHash, previous.sourceHash);
  assert.equal(sha(JSON.stringify(input.bars)), input.barsHash);
  assert.ok(input.bars.length <= 10000 && saved.rows.length <= 2048);
  assert.equal(saved.rows.length, input.snapshots.length);
  const decisions = new Map<number, StrategyCycleRecentSignal[]>(saved.rows.map((r: { index: number; signals: StrategyCycleRecentSignal[] }, n: number) => {
    assert.equal(r.index, input.snapshots[n]!.decisionIndex); return [r.index, r.signals];
  }));
  const implementationHash = sha((await Promise.all(["WMA_TURN_DESIGN.md", "wma-turn-study.ts", "analyze.ts", "../nikkei-cycle-rallies/ma-type.ts",
    "../../lib/analysis/backtest.ts", "../../lib/analysis/strategy-cycle-validation.ts", "../../lib/analysis/sma-position-overlay.ts", "../../lib/analysis/indicators.ts"]
    .map(p => readFile(join(root, p), "utf8")))).join("\n"));
  const { bars, settings } = input, start = bars.length - 2000, features = new Features(bars);
  const production = new SmaPositionOverlay(bars, { model: CURRENT_POSITION_OVERLAY_MODEL, supplementalEntry: true, exitGuard: true, entrySlopeGate: true });
  let stopped = false;
  process.on("SIGINT", () => { stopped = true; }); process.on("SIGTERM", () => { stopped = true; });
  const outcomes = [];
  for (const mode of ["baseline", "delayed-ema", "wma-turn"] as const) {
    if (stopped || process.memoryUsage().rss > 1.5 * 1024 ** 3) throw new Error("Stopped safely; rerun this bounded three-account study");
    const account = new TurnAccount(mode), target = bars.map(() => 0), extraEntries = [], diagnostic = [];
    for (let i = start; i < bars.length; i++) {
      const signals = decisions.get(i) ?? [], before = account.account.allocation, step = account.step(i, signals, features);
      target[i] = step.target;
      if (mode === "baseline") {
        const direction = strategyCycleSignalDirection(signals);
        if (direction) production.request(direction, signals.at(-1)!.targetAllocation, i);
        assert.equal(step.target, production.close(i, signals.length > 0));
      }
      if (step.extraEntry) extraEntries.push({ time: bars[i]!.time, close: bars[i]!.close });
      if (bars[i]!.time >= "2021-08-18" && bars[i]!.time <= "2021-09-03") diagnostic.push({ time: bars[i]!.time, before, ...step,
        emaTurn: features.get("EMA", 7).turns[i], wmaTurn: features.get("WMA", 7).turns[i], signals });
    }
    const result = runStrategyCycleCloseBacktest(bars, target, settings);
    const summary = runStrategyCycleCloseBacktest(bars, target, { ...settings, summaryOnly: true });
    assert.ok(Math.abs(result.totalReturn - summary.totalReturn) < 1e-9);
    assert.ok(Math.abs(result.maxDrawdown - summary.maxDrawdown) < 1e-9);
    if (mode === "baseline") assert.ok(Math.abs(result.totalReturn - previous.best.totalReturn) < 1e-9);
    const prefix = Float64Array.from([0, ...result.equity.map(e => Math.log(e.equity / settings.initialCash))]);
    assert.equal(prefix.length, 2001);
    outcomes.push({ mode, totalReturn: result.totalReturn, maxDrawdown: result.maxDrawdown, fills: result.tradeCount,
      extraEntries, blocks: [0, 1, 2, 3].map(n => ({ start: bars[start + n * 500]!.time, end: bars[start + (n + 1) * 500 - 1]!.time,
        ...pathMetrics(prefix, n * 500, (n + 1) * 500) })), diagnostic });
    await atomic(join(output, `${mode}.json`), { sourceHash, implementationHash, mode, result, extraEntries, diagnostic });
  }
  const summary = { sourceHash, implementationHash, batch: input.batch, sourceAccessedAt: input.accessedAt, generatedAt: new Date().toISOString(),
    start: settings.startTime, end: settings.endTime, sessions: 2000, decisions: decisions.size, parameters, outcomes,
    verification: { productionBaselineTargets: 2000, summaryFullLedgerComparisons: 3, baselineMatchesPriorStudy: true },
    limitation: "Historical comparison on the same full-screen winners; no independent forward-performance claim or production change." };
  await atomic(join(output, "summary.json"), summary);
  const table = outcomes.map(r => `| ${r.mode} | ${r.totalReturn.toFixed(4)}% | ${r.maxDrawdown.toFixed(4)}% | ${r.fills} | ${r.blocks[3]!.totalReturn.toFixed(4)}% | ${r.extraEntries.length} |`).join("\n");
  await writeFile(join(output, "REPORT.md"), `# WMA7 turn entry comparison\n\n${summary.start} through ${summary.end}; 2000 sessions. See WMA_TURN_DESIGN.md for exact trigger and cancellation semantics.\n\n| Mode | Net return | Drawdown | Fills | Final500 | Added triggers |\n|---|---:|---:|---:|---:|---:|\n${table}\n\n${summary.limitation}\n`);
  console.log(JSON.stringify(summary, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exitCode = 1; });
