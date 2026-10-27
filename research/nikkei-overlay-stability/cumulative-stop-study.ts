import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { root, atomic, pathMetrics, validateIdentity } from "./analyze";
import { ExpandedAccount, ExpandedContext, expandedBaseline, type ExpandedRule } from "./drawdown-expansion";
import { runAllocationBacktest, type BacktestSettings } from "../../lib/analysis/backtest";
import { runStrategyCycleCloseBacktest, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";
export type Base = "hold5" | "ma20-wma";
export type Measure = "entry" | "peak" | "daily";
export interface StopRule { base: Base; measure: Measure; threshold: number; earlyOnly: boolean; cooldown: number; recovery: boolean }
export const stopId = (r: StopRule) => `${r.base}/${r.measure}/${r.threshold}/early${r.earlyOnly}/wait${r.cooldown}/recover${r.recovery}`;
export function stopMenu(): StopRule[] {
  const rows: StopRule[] = [];
  for (const base of ["hold5", "ma20-wma"] as const) for (const measure of ["entry", "peak", "daily"] as const)
    for (let step = 2; step <= 20; step++) for (const earlyOnly of [false, true]) for (const cooldown of [0, 2, 5])
      for (const recovery of [false, true]) rows.push({ base, measure, threshold: step / 200, earlyOnly, cooldown, recovery });
  return rows;
}
export function baseRule(base: Base, recovery = false): ExpandedRule {
  return { ...expandedBaseline, exit: base === "hold5" ? "current" : "wma-negative", quality: base === "hold5" ? "none" : "ma20", recovery };
}
export class StopAccount {
  readonly inner: ExpandedAccount;
  enteredAt: number | null = null;
  blockedUntil = 0;
  constructor(readonly context: ExpandedContext) { this.inner = new ExpandedAccount(context); }
  step(index: number, signals: readonly StrategyCycleRecentSignal[], rule: StopRule, enabled = true) {
    const before = this.inner.inner.account.allocation;
    if (before <= 1e-10 && index < this.blockedUntil) return { target: 0, stopped: false, recovered: false };
    const step = this.inner.step(index, signals, baseRule(rule.base, rule.recovery));
    let target = step.target;
    if (before <= 1e-10 && target > 1e-10) this.enteredAt = index;
    if (target <= 1e-10 && before > 1e-10) this.enteredAt = null;
    const age = this.enteredAt === null ? Infinity : index - this.enteredAt;
    const close = this.context.bars[index]!.close;
    const mark = rule.measure === "entry" ? this.inner.entryClose : rule.measure === "peak" ? this.inner.peakClose : this.context.bars[index - 1]?.close ?? 0;
    const stopped = enabled && before > 1e-10 && target > 1e-10 && (!rule.earlyOnly || age <= 5) && mark > 0 && close <= mark * (1 - rule.threshold);
    if (stopped) {
      const previousTarget = target; target = 0;
      this.inner.inner.account.allocation = 0; this.inner.inner.account.pending = null; this.inner.inner.lastSupplement = null;
      this.inner.recoveryTarget = rule.recovery ? previousTarget : null; this.inner.cutIndex = index;
      this.blockedUntil = index + rule.cooldown + 1; this.enteredAt = null;
      if (!rule.recovery) { this.inner.entryClose = 0; this.inner.peakClose = 0; }
    }
    return { target, stopped, recovered: step.recovered };
  }
}
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
async function bounded(path: string) { assert.ok((await stat(path)).size <= 16 * 1024 ** 2); return readFile(path, "utf8"); }
async function exists(path: string) { return stat(path).then(() => true, e => { if (e.code === "ENOENT") return false; throw e; }); }
async function main() {
  const data = join(root, "data/full-screen-6-15"), output = join(root, "output/cumulative-stops");
  const input = JSON.parse(await bounded(join(data, "input.json"))) as { bars: MarketBar[]; barsHash: string; batch: string; settings: BacktestSettings; snapshots: { decisionIndex: number }[] };
  const sourceHash = sha(JSON.stringify(input)), saved = JSON.parse(await bounded(join(data, "signals.json")));
  assert.equal(sourceHash, saved.sourceHash); assert.equal(sha(JSON.stringify(input.bars)), input.barsHash);
  assert.ok(input.bars.length <= 10000 && saved.rows.length <= 2048); assert.equal(saved.rows.length, input.snapshots.length);
  const decisions = new Map<number, StrategyCycleRecentSignal[]>(saved.rows.map((r: { index: number; signals: StrategyCycleRecentSignal[] }, n: number) => {
    assert.equal(r.index, input.snapshots[n]!.decisionIndex); return [r.index, r.signals];
  }));
  const designHash = sha((await Promise.all(["CUMULATIVE_STOP_DESIGN.md", "cumulative-stop-study.ts", "drawdown-expansion.ts", "rule-variants.ts", "analyze.ts",
    "../nikkei-cycle-rallies/ma-type.ts", "../../lib/analysis/indicators.ts", "../../lib/analysis/backtest.ts", "../../lib/analysis/strategy-cycle-validation.ts"]
    .map(p => readFile(join(root, p), "utf8")))).join("\n"));
  const { bars, settings } = input, start = bars.length - 2000, context = new ExpandedContext(bars), menu = stopMenu(); assert.equal(menu.length, 1368);
  const run = (rule: StopRule, enabled = true, costs = 1, nextOpen = false) => {
    const account = new StopAccount(context), target = bars.map(() => 0), stops: string[] = []; let recoveries = 0;
    for (let i = start; i < bars.length; i++) {
      const step = account.step(i, decisions.get(i) ?? [], rule, enabled); target[i] = step.target;
      if (step.stopped) stops.push(bars[i]!.time); recoveries += Number(step.recovered);
    }
    const config = { ...settings, commissionRate: settings.commissionRate * costs, slippageRate: settings.slippageRate * costs };
    const result = nextOpen ? runAllocationBacktest(bars, target, { ...config, executionPolicy: "next-open" }) : runStrategyCycleCloseBacktest(bars, target, config);
    const prefix = Float64Array.from([0, ...result.equity.map(e => Math.log(e.equity / settings.initialCash))]); assert.equal(prefix.length, 2001);
    return { target, result, stops, metrics: { totalReturn: result.totalReturn, maxDrawdown: result.maxDrawdown, fills: result.tradeCount, stops: stops.length, recoveries,
      first1500: pathMetrics(prefix, 0, 1500), final500: pathMetrics(prefix, 1500, 2000), blocks: [0, 1, 2, 3].map(n => pathMetrics(prefix, n * 500, (n + 1) * 500)) } };
  };
  const noStop = (base: Base): StopRule => ({ base, measure: "entry", threshold: 1, earlyOnly: false, cooldown: 0, recovery: false });
  const holdBaseline = run(noStop("hold5"), false), simpleBaseline = run(noStop("ma20-wma"), false);
  assert.ok(Math.abs(holdBaseline.result.totalReturn - 228.43739499212467) < 1e-9);
  assert.ok(Math.abs(simpleBaseline.result.totalReturn - 291.02205820904084) < 1e-9);
  const previous7 = run({ base: "ma20-wma", measure: "entry", threshold: 0.07, earlyOnly: false, cooldown: 0, recovery: true });
  assert.ok(Math.abs(previous7.result.totalReturn - 307.98832008524533) < 1e-9);
  type Row = ReturnType<typeof run>["metrics"] & { rule: StopRule; id: string };
  const checkpoint = join(root, "data/cumulative-stops/grid.json"); let rows: Row[] = [];
  if (await exists(checkpoint)) {
    const stored = JSON.parse(await bounded(checkpoint)); validateIdentity(stored, sourceHash, designHash); rows = stored.rows;
    assert.ok(rows.length <= menu.length); rows.forEach((r, n) => assert.equal(r.id, stopId(menu[n]!)));
  }
  let stopping = false; process.on("SIGINT", () => { stopping = true; }); process.on("SIGTERM", () => { stopping = true; });
  for (let n = rows.length; n < menu.length; n++) {
    if (stopping || process.memoryUsage().rss > 1.5 * 1024 ** 3) throw new Error("Stopped safely; rerun to resume committed stop rules");
    const rule = menu[n]!; rows.push({ rule, id: stopId(rule), ...run(rule).metrics });
    if (rows.length % 50 === 0 || rows.length === menu.length) { await atomic(checkpoint, { sourceHash, designHash, rows }); console.log(`Completed ${rows.length}/1368`); }
  }
  const order = (a: Row, b: Row) => b.totalReturn - a.totalReturn || a.id.localeCompare(b.id);
  const eligible = rows.filter(r => r.totalReturn >= simpleBaseline.metrics.totalReturn - 1e-9 && r.maxDrawdown > simpleBaseline.metrics.maxDrawdown + 1e-9).sort(order);
  const best = eligible[0], riskBest = [...eligible].sort((a, b) => b.maxDrawdown - a.maxDrawdown || order(a, b))[0];
  const dev = rows.filter(r => r.first1500.totalReturn >= simpleBaseline.metrics.first1500.totalReturn - 1e-9 && r.first1500.maxDrawdown > simpleBaseline.metrics.first1500.maxDrawdown + 1e-9)
    .sort((a, b) => b.first1500.totalReturn - a.first1500.totalReturn || a.id.localeCompare(b.id))[0];
  const choices = [{ label: "production-hold5", rule: noStop("hold5"), enabled: false }, { label: "simple-no-stop", rule: noStop("ma20-wma"), enabled: false },
    ...(["entry", "peak", "daily"] as const).flatMap(measure => { const row = eligible.find(r => r.rule.measure === measure); return row ? [{ label: `best-${measure}`, rule: row.rule, enabled: true }] : []; }),
    ...(riskBest ? [{ label: "lowest-eligible-drawdown", rule: riskBest.rule, enabled: true }] : []),
    { label: "development-choice", rule: dev?.rule ?? noStop("ma20-wma"), enabled: !!dev }];
  const selected = [];
  for (const { label, rule, enabled } of choices) {
    const outcome = run(rule, enabled), summary = runStrategyCycleCloseBacktest(bars, outcome.target, { ...settings, summaryOnly: true });
    assert.ok(Math.abs(summary.totalReturn - outcome.result.totalReturn) < 1e-9); assert.ok(Math.abs(summary.maxDrawdown - outcome.result.maxDrawdown) < 1e-9);
    const neighbors = enabled ? rows.filter(r => r.rule.base === rule.base && r.rule.measure === rule.measure && r.rule.earlyOnly === rule.earlyOnly &&
      r.rule.cooldown === rule.cooldown && r.rule.recovery === rule.recovery && Math.abs(r.rule.threshold - rule.threshold) <= 0.0050000001) : [];
    selected.push({ label, rule, enabled, ...outcome.metrics, neighbors, doubleCost: run(rule, enabled, 2).metrics, nextOpen: run(rule, enabled, 1, true).metrics });
    await atomic(join(output, `${label}.json`), { sourceHash, designHash, rule, enabled, stops: outcome.stops, result: outcome.result });
  }
  const summary = { sourceHash, designHash, generatedAt: new Date().toISOString(), batch: input.batch, start: settings.startTime, end: settings.endTime,
    candidates: rows.length, eligibleCount: eligible.length, best: best ?? null, selected, rows,
    limitation: "Initial-episode and peak-close cumulative losses are distinct from daily falls. Stops use observed closes, not threshold fills. Repeated historical research is not untouched validation. Production remains hold5 only." };
  await atomic(join(output, "summary.json"), summary);
  await writeFile(join(output, "grid.csv"), ["id,return,drawdown,first1500,final500,stops,recoveries", ...[...rows].sort(order).map(r =>
    [r.id, r.totalReturn, r.maxDrawdown, r.first1500.totalReturn, r.final500.totalReturn, r.stops, r.recoveries].join(","))].join("\n") + "\n");
  const table = selected.map(r => `| ${r.label} | ${stopId(r.rule)} | ${r.totalReturn.toFixed(4)}% | ${r.maxDrawdown.toFixed(4)}% | ${r.final500.totalReturn.toFixed(4)}% | ${r.stops} |`).join("\n");
  await writeFile(join(output, "REPORT.md"), `# Cumulative stop grid\n\n${eligible.length} of1368 rules improve the291.0221%/-17.7598% simple research base.\n\n| Selection | Rule | Return | Drawdown | Final500 | Stops |\n|---|---|---:|---:|---:|---:|\n${table}\n\n${summary.limitation}\n\nAll rules: grid.csv; exact definitions: CUMULATIVE_STOP_DESIGN.md.\n`);
  console.log(JSON.stringify({ eligibleCount: eligible.length, selected }, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exitCode = 1; });
