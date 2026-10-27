import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { root, Features, atomic, pathMetrics, validateIdentity } from "./analyze";
import { RuleAccount, type Exit } from "./rule-variants";
import { sma, ema } from "../../lib/analysis/indicators";
import { runAllocationBacktest, type BacktestSettings } from "../../lib/analysis/backtest";
import { runStrategyCycleCloseBacktest, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";

export interface Protection { id: string; basis: "none" | "entry" | "peak"; loss: number; activation: number; remaining: number }
const protections: Protection[] = [{ id: "none", basis: "none", loss: 0, activation: 0, remaining: 1 },
  ...[0.03, 0.05, 0.07].flatMap(loss => [0, 0.5].map(remaining => ({ id: `stop${loss}-${remaining}`, basis: "entry" as const, loss, activation: 0, remaining }))),
  ...[0.05, 0.08, 0.1].map(loss => ({ id: `trail${loss}`, basis: "peak" as const, loss, activation: 0, remaining: 0 })),
  { id: "profit5-trail5-half", basis: "peak", loss: 0.05, activation: 0.05, remaining: 0.5 },
  { id: "profit10-trail8-half", basis: "peak", loss: 0.08, activation: 0.1, remaining: 0.5 },
  { id: "profit10-trail8-full", basis: "peak", loss: 0.08, activation: 0.1, remaining: 0 }];
export type Quality = "none" | "ma20" | "ma50" | "ma100" | "ema0.025" | "ema0.05" | "ema0.1" | "wma0.05" | "wma0.1" | "wma0.2" | "atr1.5" | "atr2" | "atr2.5";
export interface ExpandedRule { exit: Exit; quality: Quality; protection: Protection; recovery: boolean }
export const expandedId = (r: ExpandedRule) => `${r.exit}/${r.quality}/${r.protection.id}/recovery${r.recovery}`;
export const expandedBaseline: ExpandedRule = { exit: "current", quality: "none", protection: protections[0]!, recovery: false };
export function expandedMenu(): ExpandedRule[] {
  const result: ExpandedRule[] = [];
  for (const exit of ["current", "wma-negative", "ema-nonpositive"] as const)
    for (const quality of ["none", "ma20", "ma50", "ma100", "ema0.025", "ema0.05", "ema0.1", "wma0.05", "wma0.1", "wma0.2", "atr1.5", "atr2", "atr2.5"] as const)
      for (const protection of protections) for (const recovery of protection.basis === "none" ? [false] : [false, true]) result.push({ exit, quality, protection, recovery });
  return result;
}
export class ExpandedContext {
  readonly features: Features;
  readonly ema7: (number | null)[];
  readonly quality = new Map<Quality, boolean[]>();
  constructor(readonly bars: MarketBar[]) {
    this.features = new Features(bars); const closes = bars.map(b => b.close);
    this.ema7 = ema(closes, 7);
    const ranges = bars.map((b, i) => Math.max(b.high - b.low, Math.abs(b.high - (closes[i - 1] ?? b.close)), Math.abs(b.low - (closes[i - 1] ?? b.close))));
    const atr = sma(ranges, 14);
    for (const q of new Set(expandedMenu().map(r => r.quality))) {
      const average = q.startsWith("ma") ? sma(closes, Number(q.slice(2))) : [];
      const slope = q.startsWith("ema") ? this.features.get("EMA", 7).slope : this.features.get("WMA", 7).slope;
      this.quality.set(q, bars.map((b, i) => q === "none" ? true : q.startsWith("ma") ? average[i] != null && b.close > average[i]!
        : q.startsWith("atr") ? atr[i] != null && atr[i]! / b.close * 100 <= Number(q.slice(3))
        : slope[i] != null && slope[i]! * 100 >= Number(q.slice(3))));
    }
  }
}
export class ExpandedAccount {
  readonly inner: RuleAccount;
  entryClose = 0; peakClose = 0; recoveryTarget: number | null = null; cutIndex = -1;
  constructor(readonly context: ExpandedContext) { this.inner = new RuleAccount(context.bars, context.features); }
  step(index: number, signals: readonly StrategyCycleRecentSignal[], rule: ExpandedRule) {
    const before = this.inner.account.allocation, close = this.context.bars[index]!.close;
    let target = this.inner.step(index, signals, { entry: "turn", exit: rule.exit, hold: 5 });
    const supplemental = before <= 1e-10 && target > 1e-10 && signals.length === 0;
    if (supplemental && !this.context.quality.get(rule.quality)![index]) {
      target = 0; this.inner.account.allocation = 0; this.inner.lastSupplement = null;
    }
    if (before <= 1e-10 && target > 1e-10) {
      this.entryClose = close; this.peakClose = close; this.recoveryTarget = null;
    }
    if (before > 1e-10 && target <= 1e-10) { this.entryClose = 0; this.peakClose = 0; this.recoveryTarget = null; }
    let recovered = false, cut = false;
    const f = this.context.features, recoveryAllowed = (f.get("EMA", 7).sign[index] ?? -1) > 0 &&
      (f.get("WMA", 7).sign[index] ?? -1) > 0 && this.context.ema7[index] != null && close > this.context.ema7[index]!;
    if (rule.recovery && this.recoveryTarget !== null && index > this.cutIndex && signals.length === 0 && recoveryAllowed) {
      target = Math.max(target, this.recoveryTarget); this.inner.account.allocation = target; this.inner.account.pending = null;
      this.recoveryTarget = null; this.entryClose = close; this.peakClose = close; recovered = true;
    }
    if (target > 1e-10) {
      this.peakClose = Math.max(this.peakClose, close);
      const p = rule.protection, activated = this.entryClose > 0 && this.peakClose / this.entryClose - 1 >= p.activation;
      const mark = p.basis === "entry" ? this.entryClose : this.peakClose;
      if (!recovered && this.recoveryTarget === null && p.basis !== "none" && activated && close <= mark * (1 - p.loss)) {
        const oldTarget = target; target *= p.remaining; cut = true; this.cutIndex = index;
        this.inner.account.allocation = target; this.inner.account.pending = null; this.inner.lastSupplement = null;
        this.recoveryTarget = target > 0 || rule.recovery ? oldTarget : null;
        if (target <= 1e-10 && !rule.recovery) { this.entryClose = 0; this.peakClose = 0; }
      }
    }
    return { target, cut, recovered };
  }
}
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
async function bounded(path: string) { assert.ok((await stat(path)).size <= 16 * 1024 ** 2); return readFile(path, "utf8"); }
async function exists(path: string) { return stat(path).then(() => true, e => { if (e.code === "ENOENT") return false; throw e; }); }
async function main() {
  const data = join(root, "data/full-screen-6-15"), output = join(root, "output/drawdown-expansion");
  const input = JSON.parse(await bounded(join(data, "input.json"))) as { bars: MarketBar[]; barsHash: string; batch: string; settings: BacktestSettings; snapshots: { decisionIndex: number }[] };
  const sourceHash = sha(JSON.stringify(input)), saved = JSON.parse(await bounded(join(data, "signals.json")));
  assert.equal(sourceHash, saved.sourceHash); assert.equal(sha(JSON.stringify(input.bars)), input.barsHash);
  assert.ok(input.bars.length <= 10000 && saved.rows.length <= 2048); assert.equal(saved.rows.length, input.snapshots.length);
  const decisions = new Map<number, StrategyCycleRecentSignal[]>(saved.rows.map((r: { index: number; signals: StrategyCycleRecentSignal[] }, n: number) => {
    assert.equal(r.index, input.snapshots[n]!.decisionIndex); return [r.index, r.signals];
  }));
  const designHash = sha((await Promise.all(["DRAWDOWN_EXPANSION_DESIGN.md", "drawdown-expansion.ts", "rule-variants.ts", "analyze.ts", "../nikkei-cycle-rallies/ma-type.ts",
    "../../lib/analysis/backtest.ts", "../../lib/analysis/strategy-cycle-validation.ts", "../../lib/analysis/indicators.ts"]
    .map(p => readFile(join(root, p), "utf8")))).join("\n"));
  const { bars, settings } = input, start = bars.length - 2000, context = new ExpandedContext(bars), menu = expandedMenu();
  assert.equal(menu.length, 975);
  const run = (rule: ExpandedRule, costs = 1, nextOpen = false) => {
    const account = new ExpandedAccount(context), target = bars.map(() => 0); let cuts = 0, recoveries = 0;
    for (let i = start; i < bars.length; i++) { const step = account.step(i, decisions.get(i) ?? [], rule); target[i] = step.target; cuts += Number(step.cut); recoveries += Number(step.recovered); }
    const config = { ...settings, commissionRate: settings.commissionRate * costs, slippageRate: settings.slippageRate * costs };
    const result = nextOpen ? runAllocationBacktest(bars, target, { ...config, executionPolicy: "next-open" }) : runStrategyCycleCloseBacktest(bars, target, config);
    const prefix = Float64Array.from([0, ...result.equity.map(e => Math.log(e.equity / settings.initialCash))]); assert.equal(prefix.length, 2001);
    return { result, target, metrics: { totalReturn: result.totalReturn, maxDrawdown: result.maxDrawdown, fills: result.tradeCount, cuts, recoveries,
      first1500: pathMetrics(prefix, 0, 1500), final500: pathMetrics(prefix, 1500, 2000), blocks: [0, 1, 2, 3].map(n => pathMetrics(prefix, n * 500, (n + 1) * 500)) } };
  };
  const baseline = run(expandedBaseline); assert.ok(Math.abs(baseline.result.totalReturn - 228.43739499212467) < 1e-9);
  type Row = ReturnType<typeof run>["metrics"] & { rule: ExpandedRule; id: string };
  let rows: Row[] = []; const checkpoint = join(root, "data/drawdown-expansion/grid.json");
  if (await exists(checkpoint)) {
    const savedRows = JSON.parse(await bounded(checkpoint)); validateIdentity(savedRows, sourceHash, designHash); rows = savedRows.rows;
    assert.ok(rows.length <= menu.length); rows.forEach((r, n) => assert.equal(r.id, expandedId(menu[n]!)));
  }
  let stopped = false; process.on("SIGINT", () => { stopped = true; }); process.on("SIGTERM", () => { stopped = true; });
  for (let n = rows.length; n < menu.length; n++) {
    if (stopped || process.memoryUsage().rss > 1.5 * 1024 ** 3) throw new Error("Stopped safely; rerun to resume committed metric rows");
    const rule = menu[n]!; rows.push({ rule, id: expandedId(rule), ...run(rule).metrics });
    if (rows.length % 50 === 0 || rows.length === menu.length) { await atomic(checkpoint, { sourceHash, designHash, rows }); console.log(`Completed ${rows.length}/975`); }
  }
  const returnOrder = (a: Row, b: Row) => b.totalReturn - a.totalReturn || a.id.localeCompare(b.id);
  const eligible = rows.filter(r => r.totalReturn >= baseline.metrics.totalReturn - 1e-9 && r.maxDrawdown > baseline.metrics.maxDrawdown + 1e-9).sort(returnOrder);
  const riskBest = [...eligible].sort((a, b) => b.maxDrawdown - a.maxDrawdown || returnOrder(a, b))[0];
  const dev = rows.filter(r => r.first1500.totalReturn >= baseline.metrics.first1500.totalReturn - 1e-9 && r.first1500.maxDrawdown > baseline.metrics.first1500.maxDrawdown + 1e-9)
    .sort((a, b) => b.first1500.totalReturn - a.first1500.totalReturn || a.id.localeCompare(b.id))[0];
  const choices = [{ label: "baseline", rule: expandedBaseline },
    { label: "simple-ma20-wma", rule: { ...expandedBaseline, exit: "wma-negative" as const, quality: "ma20" as const } },
    ...(eligible[0] ? [{ label: "full-best-eligible", rule: eligible[0].rule }] : []),
    ...(riskBest ? [{ label: "lowest-drawdown-eligible", rule: riskBest.rule }] : []), { label: "development-choice", rule: dev?.rule ?? expandedBaseline }];
  const selected = [];
  for (const { label, rule } of choices) {
    const outcome = run(rule), summary = runStrategyCycleCloseBacktest(bars, outcome.target, { ...settings, summaryOnly: true });
    assert.ok(Math.abs(outcome.result.totalReturn - summary.totalReturn) < 1e-9); assert.ok(Math.abs(outcome.result.maxDrawdown - summary.maxDrawdown) < 1e-9);
    selected.push({ label, rule, ...outcome.metrics, doubleCost: run(rule, 2).metrics, nextOpen: run(rule, 1, true).metrics });
    await atomic(join(output, `${label}.json`), { sourceHash, designHash, rule, result: outcome.result });
  }
  const summary = { sourceHash, designHash, generatedAt: new Date().toISOString(), batch: input.batch, start: settings.startTime, end: settings.endTime,
    candidates: rows.length, eligibleCount: eligible.length, developmentEligible: !!dev, selected, top10: eligible.slice(0, 10), rows,
    limitation: "975 comparisons on already explored dates. Full-sample eligibility is descriptive; development selection does not make final500 an untouched holdout. Only production hold5 is enabled." };
  await atomic(join(output, "summary.json"), summary);
  await writeFile(join(output, "grid.csv"), ["id,return,drawdown,first1500,final500,fills,cuts,recoveries", ...[...rows].sort(returnOrder).map(r =>
    [r.id, r.totalReturn, r.maxDrawdown, r.first1500.totalReturn, r.final500.totalReturn, r.fills, r.cuts, r.recoveries].join(","))].join("\n") + "\n");
  const table = selected.map(r => `| ${r.label} | ${expandedId(r.rule)} | ${r.totalReturn.toFixed(4)}% | ${r.maxDrawdown.toFixed(4)}% | ${r.final500.totalReturn.toFixed(4)}% |`).join("\n");
  await writeFile(join(output, "REPORT.md"), `# Expanded risk control\n\n${eligible.length} of975 rules improve both baseline full return and drawdown.\n\n| Selection | Rule | Full return | Drawdown | Final500 |\n|---|---|---:|---:|---:|\n${table}\n\n${summary.limitation}\n\nAll rows: grid.csv. Exact semantics: DRAWDOWN_EXPANSION_DESIGN.md.\n`);
  console.log(JSON.stringify({ eligibleCount: eligible.length, selected, top10: summary.top10 }, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exitCode = 1; });
