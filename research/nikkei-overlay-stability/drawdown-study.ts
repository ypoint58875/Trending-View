import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { root, Features, atomic, pathMetrics } from "./analyze";
import { RuleAccount } from "./rule-variants";
import { HOLD5_POSITION_OVERLAY_MODEL, SmaPositionOverlay } from "../../lib/analysis/sma-position-overlay";
import { runStrategyCycleCloseBacktest, strategyCycleSignalDirection, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";
import type { BacktestSettings } from "../../lib/analysis/backtest";
export type Risk = "none" | "stop3" | "stop5" | "stop7" | "trail5" | "trail8" | "unlock-ema" | "unlock-wma";
export interface RiskRule { risk: Risk; fraction: number; cooldown: number }
export const riskId = (r: RiskRule) => `${r.risk}/entry${r.fraction}/cooldown${r.cooldown}`;
export const baselineRisk: RiskRule = { risk: "none", fraction: 1, cooldown: 0 };
export function riskMenu(): RiskRule[] {
  const rows: RiskRule[] = [];
  for (const risk of ["none", "stop3", "stop5", "stop7", "trail5", "trail8", "unlock-ema", "unlock-wma"] as const)
    for (const fraction of [0.5, 0.75, 1]) for (const cooldown of risk.startsWith("stop") || risk.startsWith("trail") ? [0, 5] : [0]) rows.push({ risk, fraction, cooldown });
  return rows;
}
export class RiskAccount {
  readonly inner: RuleAccount;
  entryClose = 0; peakClose = 0; blockedUntil = 0;
  constructor(readonly bars: MarketBar[], readonly features = new Features(bars)) { this.inner = new RuleAccount(bars, features); }
  step(index: number, signals: readonly StrategyCycleRecentSignal[], rule: RiskRule) {
    const before = this.inner.account.allocation;
    if (before <= 1e-10 && index < this.blockedUntil) return { target: 0, stopped: false };
    const unlock = rule.risk === "unlock-ema" ? (this.features.get("EMA", 7).sign[index] ?? 0) <= 0
      : rule.risk === "unlock-wma" && (this.features.get("WMA", 7).sign[index] ?? 0) < 0;
    let target = this.inner.step(index, signals, { entry: "turn", exit: "current", hold: unlock ? 0 : 5 });
    const close = this.bars[index]!.close;
    if (before <= 1e-10 && target > 1e-10) {
      this.entryClose = close; this.peakClose = close;
      if (signals.length === 0) { target = rule.fraction; this.inner.account.allocation = target; }
    }
    let stopped = false;
    if (target > 1e-10) {
      this.peakClose = Math.max(this.peakClose, close);
      const level = rule.risk.startsWith("stop") ? this.entryClose * (1 - Number(rule.risk.slice(4)) / 100)
        : rule.risk.startsWith("trail") ? this.peakClose * (1 - Number(rule.risk.slice(5)) / 100) : -Infinity;
      if (close <= level) {
        target = 0; stopped = true; this.inner.account.allocation = 0; this.inner.account.pending = null; this.inner.lastSupplement = null;
        this.blockedUntil = index + rule.cooldown + 1;
      }
    }
    if (target <= 1e-10) { this.entryClose = 0; this.peakClose = 0; }
    return { target, stopped };
  }
}
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
async function bounded(path: string) { assert.ok((await stat(path)).size <= 16 * 1024 ** 2); return readFile(path, "utf8"); }
async function main() {
  const data = join(root, "data/full-screen-6-15"), output = join(root, "output/drawdown-hold5");
  const input = JSON.parse(await bounded(join(data, "input.json"))) as { bars: MarketBar[]; barsHash: string; batch: string;
    settings: BacktestSettings; snapshots: { decisionIndex: number }[] };
  const sourceHash = sha(JSON.stringify(input)), saved = JSON.parse(await bounded(join(data, "signals.json")));
  assert.equal(sourceHash, saved.sourceHash); assert.equal(sha(JSON.stringify(input.bars)), input.barsHash);
  assert.ok(input.bars.length <= 10000 && saved.rows.length <= 2048); assert.equal(saved.rows.length, input.snapshots.length);
  const decisions = new Map<number, StrategyCycleRecentSignal[]>(saved.rows.map((r: { index: number; signals: StrategyCycleRecentSignal[] }, n: number) => {
    assert.equal(r.index, input.snapshots[n]!.decisionIndex); return [r.index, r.signals];
  }));
  const implementationHash = sha((await Promise.all(["DRAWDOWN_DESIGN.md", "drawdown-study.ts", "rule-variants.ts", "analyze.ts", "../nikkei-cycle-rallies/ma-type.ts",
    "../../lib/analysis/backtest.ts", "../../lib/analysis/strategy-cycle-validation.ts", "../../lib/analysis/sma-position-overlay.ts", "../../lib/analysis/indicators.ts"]
    .map(p => readFile(join(root, p), "utf8")))).join("\n"));
  const { bars, settings } = input, start = bars.length - 2000, features = new Features(bars);
  const run = (rule: RiskRule, costs = 1) => {
    const account = new RiskAccount(bars, features), target = bars.map(() => 0), stops: string[] = [];
    for (let i = start; i < bars.length; i++) {
      const step = account.step(i, decisions.get(i) ?? [], rule); target[i] = step.target;
      if (step.stopped) stops.push(bars[i]!.time);
    }
    const config = { ...settings, commissionRate: settings.commissionRate * costs, slippageRate: settings.slippageRate * costs };
    const result = runStrategyCycleCloseBacktest(bars, target, config);
    const prefix = Float64Array.from([0, ...result.equity.map(e => Math.log(e.equity / settings.initialCash))]); assert.equal(prefix.length, 2001);
    return { target, result, stops, metrics: { totalReturn: result.totalReturn, maxDrawdown: result.maxDrawdown, fills: result.tradeCount,
      first1500: pathMetrics(prefix, 0, 1500), final500: pathMetrics(prefix, 1500, 2000),
      blocks: [0, 1, 2, 3].map(n => pathMetrics(prefix, n * 500, (n + 1) * 500)), stopCount: stops.length } };
  };
  const baseline = run(baselineRisk);
  assert.ok(Math.abs(baseline.result.totalReturn - 228.43739499212467) < 1e-9);
  const production = new SmaPositionOverlay(bars, { model: HOLD5_POSITION_OVERLAY_MODEL, supplementalEntry: true, exitGuard: true, entrySlopeGate: true });
  for (let i = start; i < bars.length; i++) {
    const signals = decisions.get(i) ?? [], direction = strategyCycleSignalDirection(signals);
    if (direction) production.request(direction, signals.at(-1)!.targetAllocation, i);
    assert.equal(production.close(i, signals.length > 0), baseline.target[i], `Hold5 parity at ${bars[i]!.time}`);
  }
  let stopped = false; process.on("SIGINT", () => { stopped = true; }); process.on("SIGTERM", () => { stopped = true; });
  const rows: (ReturnType<typeof run>["metrics"] & { rule: RiskRule; id: string })[] = [];
  for (const rule of riskMenu()) {
    if (stopped || process.memoryUsage().rss > 1.5 * 1024 ** 3) throw new Error("Stopped safely; rerun the bounded risk study");
    rows.push({ rule, id: riskId(rule), ...run(rule).metrics });
  }
  assert.equal(rows.length, 39);
  const compareRisk = (a: typeof rows[number], b: typeof rows[number]) => b.maxDrawdown - a.maxDrawdown || b.totalReturn - a.totalReturn || a.id.localeCompare(b.id);
  const retained = rows.filter(r => r.totalReturn >= baseline.metrics.totalReturn * 0.9).sort(compareRisk)[0]!;
  const improved = rows.filter(r => r.totalReturn > baseline.metrics.totalReturn && r.maxDrawdown > baseline.metrics.maxDrawdown)
    .sort((a, b) => b.totalReturn - a.totalReturn || a.id.localeCompare(b.id))[0] ?? null;
  const development = rows.filter(r => r.first1500.totalReturn >= baseline.metrics.first1500.totalReturn * 0.9)
    .sort((a, b) => b.first1500.maxDrawdown - a.first1500.maxDrawdown || b.first1500.totalReturn - a.first1500.totalReturn || a.id.localeCompare(b.id))[0]!;
  const selected = [];
  const selections = [{ label: "baseline", rule: baselineRisk }, { label: "retain90-best-drawdown", rule: retained.rule },
    { label: "development-risk-choice", rule: development.rule }, ...(improved ? [{ label: "higher-return-lower-drawdown", rule: improved.rule }] : [])];
  for (const { label, rule } of selections) {
    const outcome = run(rule), summary = runStrategyCycleCloseBacktest(bars, outcome.target, { ...settings, summaryOnly: true });
    assert.ok(Math.abs(outcome.result.totalReturn - summary.totalReturn) < 1e-9);
    assert.ok(Math.abs(outcome.result.maxDrawdown - summary.maxDrawdown) < 1e-9);
    selected.push({ label, rule, ...outcome.metrics, doubleCost: run(rule, 2).metrics });
    await atomic(join(output, `${label}.json`), { sourceHash, implementationHash, rule, stops: outcome.stops, result: outcome.result });
  }
  const summary = { sourceHash, implementationHash, generatedAt: new Date().toISOString(), batch: input.batch, start: settings.startTime,
    end: settings.endTime, candidates: rows.length, selected, rows, improved,
    limitation: "Historical comparison on already explored data. Close-based stops are not intraday stops. Only the five-bar lock is added to production." };
  await atomic(join(output, "summary.json"), summary);
  await writeFile(join(output, "grid.csv"), ["id,return,drawdown,first1500,final500,fills,stops", ...rows.map(r => [r.id, r.totalReturn,
    r.maxDrawdown, r.first1500.totalReturn, r.final500.totalReturn, r.fills, r.stopCount].join(","))].join("\n") + "\n");
  const table = selected.map(r => `| ${r.label} | ${riskId(r.rule)} | ${r.totalReturn.toFixed(4)}% | ${r.maxDrawdown.toFixed(4)}% | ${r.final500.totalReturn.toFixed(4)}% |`).join("\n");
  await writeFile(join(output, "REPORT.md"), `# Drawdown controls on hold5\n\n| Selection | Rule | Full return | Drawdown | Final500 |\n|---|---|---:|---:|---:|\n${table}\n\n${summary.limitation}\n\nFull menu: grid.csv; exact semantics: DRAWDOWN_DESIGN.md.\n`);
  console.log(JSON.stringify({ selected, improved }, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exitCode = 1; });
