import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Account, Features, root, atomic, pathMetrics } from "./analyze";
import { ema } from "../../lib/analysis/indicators";
import { PREVIOUS_POSITION_OVERLAY_MODEL as CURRENT_POSITION_OVERLAY_MODEL, SmaPositionOverlay } from "../../lib/analysis/sma-position-overlay";
import { runStrategyCycleCloseBacktest, strategyCycleSignalDirection, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { BacktestSettings } from "../../lib/analysis/backtest";
import type { MarketBar } from "../../lib/market/types";

export type Entry = "turn" | "ema-positive" | "wma-positive" | "both-positive-2";
export type Exit = "current" | "ema-nonpositive" | "wma-negative" | "both-negative" | "below-ema" | "wma-negative-2";
export interface Rule { entry: Entry; exit: Exit; hold: number }
export const baselineRule: Rule = { entry: "turn", exit: "current", hold: 0 };
export const ruleId = (r: Rule) => `${r.entry}/${r.exit}/hold${r.hold}`;
export function rules(): Rule[] {
  const result: Rule[] = [];
  for (const entry of ["turn", "ema-positive", "wma-positive", "both-positive-2"] as const)
    for (const exit of ["current", "ema-nonpositive", "wma-negative", "both-negative", "below-ema", "wma-negative-2"] as const)
      for (const hold of [0, 2, 3, 5]) result.push({ entry, exit, hold });
  return result;
}
const parameters = { entry: 7, exit: 11, gate: 7, threshold: 0.00075, flags: 7 };
export class RuleAccount {
  readonly account = new Account();
  lastSupplement: number | null = null;
  private readonly features: Features;
  private readonly average: (number | null)[];
  private readonly exitSlopes: (number | null)[];
  private readonly entryTurns: Record<Entry, boolean[]>;
  constructor(readonly bars: MarketBar[], features = new Features(bars)) {
    this.features = features; this.average = ema(bars.map(b => b.close), 7);
    this.exitSlopes = [...features.get("SMA", 11).slope];
    const e = features.get("EMA", 7), w = features.get("WMA", 7);
    this.entryTurns = { turn: e.turns, "ema-positive": e.sign.map(s => s !== null && s > 0),
      "wma-positive": w.sign.map(s => s !== null && s > 0),
      "both-positive-2": e.sign.map((s, i) => s !== null && s > 0 && (w.sign[i] ?? -1) > 0 &&
        (e.sign[i - 1] ?? -1) > 0 && (w.sign[i - 1] ?? -1) > 0) };
  }
  step(index: number, signals: readonly StrategyCycleRecentSignal[], rule: Rule) {
    const e = this.features.get("EMA", 7), w = this.features.get("WMA", 7), s = this.features.get("SMA", 11);
    const ep = (e.sign[index] ?? -1) > 0, wn = w.sign[index] !== null && w.sign[index]! < 0;
    const trendProtection = rule.exit === "ema-nonpositive" ? ep : rule.exit === "wma-negative" ? !wn
      : rule.exit === "both-negative" ? ep || !wn : rule.exit === "below-ema" ? this.average[index] !== null && this.bars[index]!.close >= this.average[index]!
      : rule.exit === "wma-negative-2" ? !(wn && w.sign[index - 1] != null && w.sign[index - 1]! < 0) : false;
    const ageProtection = this.lastSupplement !== null && index - this.lastSupplement < rule.hold;
    this.exitSlopes[index] = trendProtection || ageProtection ? Infinity : s.slope[index]!;
    const turns = this.entryTurns[rule.entry];
    const view = { get: (type: "EMA" | "SMA" | "WMA", period: number) => type === "EMA" ? { ...e, turns }
      : type === "SMA" ? { ...s, slope: this.exitSlopes } : this.features.get(type, period) } as unknown as Features;
    const before = this.account.allocation, target = this.account.step(index, signals, parameters, view);
    if (before <= 1e-10 && target > 1e-10) this.lastSupplement = signals.length === 0 ? index : null;
    if (target <= 1e-10) this.lastSupplement = null;
    return target;
  }
}
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
async function bounded(path: string) { assert.ok((await stat(path)).size <= 16 * 1024 ** 2); return readFile(path, "utf8"); }
async function main() {
  const data = join(root, "data/full-screen-6-15"), output = join(root, "output/rule-variants");
  const input = JSON.parse(await bounded(join(data, "input.json"))) as { bars: MarketBar[]; barsHash: string; batch: string;
    snapshots: { decisionIndex: number }[]; settings: BacktestSettings };
  const sourceHash = sha(JSON.stringify(input)), saved = JSON.parse(await bounded(join(data, "signals.json")));
  const prior = JSON.parse(await bounded(join(root, "output/full-screen-6-15/summary.json")));
  assert.equal(sourceHash, saved.sourceHash); assert.equal(sourceHash, prior.sourceHash);
  assert.equal(sha(JSON.stringify(input.bars)), input.barsHash);
  assert.ok(input.bars.length <= 10000 && saved.rows.length <= 2048);
  assert.equal(saved.rows.length, input.snapshots.length);
  const decisions = new Map<number, StrategyCycleRecentSignal[]>(saved.rows.map((r: { index: number; signals: StrategyCycleRecentSignal[] }, n: number) => {
    assert.equal(r.index, input.snapshots[n]!.decisionIndex); return [r.index, r.signals];
  }));
  const implementationHash = sha((await Promise.all(["RULE_VARIANTS_DESIGN.md", "rule-variants.ts", "analyze.ts", "../nikkei-cycle-rallies/ma-type.ts",
    "../../lib/analysis/indicators.ts", "../../lib/analysis/backtest.ts", "../../lib/analysis/strategy-cycle-validation.ts", "../../lib/analysis/sma-position-overlay.ts"]
    .map(p => readFile(join(root, p), "utf8")))).join("\n"));
  const { bars, settings } = input, start = bars.length - 2000, features = new Features(bars), menu = rules();
  assert.equal(menu.length, 96);
  const run = (rule: Rule | ((offset: number) => Rule), costs = 1) => {
    const account = new RuleAccount(bars, features), target = bars.map(() => 0);
    for (let i = start; i < bars.length; i++) target[i] = account.step(i, decisions.get(i) ?? [], typeof rule === "function" ? rule(i - start) : rule);
    const config = { ...settings, commissionRate: settings.commissionRate * costs, slippageRate: settings.slippageRate * costs };
    const result = runStrategyCycleCloseBacktest(bars, target, config);
    const prefix = Float64Array.from([0, ...result.equity.map(e => Math.log(e.equity / settings.initialCash))]);
    assert.equal(prefix.length, 2001);
    return { result, target, prefix, metrics: { totalReturn: result.totalReturn, maxDrawdown: result.maxDrawdown, fills: result.tradeCount,
      first1500: pathMetrics(prefix, 0, 1500), final500: pathMetrics(prefix, 1500, 2000),
      blocks: [0, 1, 2, 3].map(n => pathMetrics(prefix, n * 500, (n + 1) * 500)) } };
  };
  const baseline = run(baselineRule);
  assert.ok(Math.abs(baseline.result.totalReturn - prior.best.totalReturn) < 1e-9);
  const production = new SmaPositionOverlay(bars, { model: CURRENT_POSITION_OVERLAY_MODEL, supplementalEntry: true, exitGuard: true, entrySlopeGate: true });
  for (let i = start; i < bars.length; i++) {
    const signals = decisions.get(i) ?? [], direction = strategyCycleSignalDirection(signals);
    if (direction) production.request(direction, signals.at(-1)!.targetAllocation, i);
    assert.equal(baseline.target[i], production.close(i, signals.length > 0));
  }
  let stopped = false; process.on("SIGINT", () => { stopped = true; }); process.on("SIGTERM", () => { stopped = true; });
  const evaluated: (ReturnType<typeof run>["metrics"] & { rule: Rule; id: string; prefix: Float64Array })[] = [];
  for (const rule of menu) {
    if (stopped || process.memoryUsage().rss > 1.5 * 1024 ** 3) throw new Error("Stopped safely; rerun the bounded 96-rule study");
    const outcome = run(rule); evaluated.push({ rule, id: ruleId(rule), ...outcome.metrics, prefix: outcome.prefix });
  }
  const rank = (metric: (r: typeof evaluated[number]) => number) => [...evaluated].sort((a, b) => metric(b) - metric(a) || a.id.localeCompare(b.id));
  const fullBest = rank(r => r.totalReturn)[0]!, developmentBest = rank(r => r.first1500.totalReturn)[0]!;
  const deployments = [500, 1000, 1500].map(offset => ({ offset, rule: rank(r => pathMetrics(r.prefix, 0, offset).totalReturn)[0]!.rule }));
  const walk = run(offset => offset < 500 ? baselineRule : deployments[Math.floor(offset / 500) - 1]!.rule);
  const compact = ({ prefix: _prefix, ...row }: typeof evaluated[number]) => row;
  const selected = [];
  for (const [label, rule] of [["baseline", baselineRule], ["simple-hold5", { ...baselineRule, hold: 5 }], ["full-best", fullBest.rule], ["development-best", developmentBest.rule]] as const) {
    const normal = run(rule), doubleCost = run(rule, 2);
    const summary = runStrategyCycleCloseBacktest(bars, normal.target, { ...settings, summaryOnly: true });
    assert.ok(Math.abs(summary.totalReturn - normal.result.totalReturn) < 1e-9);
    assert.ok(Math.abs(summary.maxDrawdown - normal.result.maxDrawdown) < 1e-9);
    selected.push({ label, rule, ...normal.metrics, doubleCost: doubleCost.metrics });
    await atomic(join(output, `${label}.json`), { sourceHash, implementationHash, rule, result: normal.result });
  }
  const summary = { sourceHash, implementationHash, generatedAt: new Date().toISOString(), batch: input.batch,
    start: settings.startTime, end: settings.endTime, candidates: menu.length, baseline: baseline.metrics, selected,
    fullTop10: rank(r => r.totalReturn).slice(0, 10).map(compact),
    developmentTop10: rank(r => r.first1500.totalReturn).slice(0, 10).map(compact),
    expanding: { deployments, ...walk.metrics, common1500: pathMetrics(walk.prefix, 500, 2000),
      baselineCommon1500: pathMetrics(baseline.prefix, 500, 2000) },
    improvesFullAndFinal: evaluated.filter(r => r.totalReturn > baseline.metrics.totalReturn && r.final500.totalReturn > baseline.metrics.final500.totalReturn).length,
    rows: evaluated.map(compact), limitation: "Already explored data and full-period-tuned base settings; final500 is an additional chronological check, not an untouched holdout. No production change." };
  await atomic(join(output, "summary.json"), summary);
  const columns = ["id", "entry", "exit", "hold", "totalReturn", "maxDrawdown", "fills", "first1500", "final500"];
  await writeFile(join(output, "ranked-grid.csv"), [columns.join(","), ...rank(r => r.totalReturn).map(r => [r.id, r.rule.entry, r.rule.exit, r.rule.hold,
    r.totalReturn, r.maxDrawdown, r.fills, r.first1500.totalReturn, r.final500.totalReturn].join(","))].join("\n") + "\n");
  const table = selected.map(r => `| ${r.label} | ${ruleId(r.rule)} | ${r.totalReturn.toFixed(4)}% | ${r.maxDrawdown.toFixed(4)}% | ${r.first1500.totalReturn.toFixed(4)}% | ${r.final500.totalReturn.toFixed(4)}% |`).join("\n");
  await writeFile(join(output, "REPORT.md"), `# Bounded entry/exit rule comparison\n\n96 declared settings; ${settings.startTime} through ${settings.endTime}.\n\n| Selection | Rule | Full return | Drawdown | First1500 | Final500 |\n|---|---|---:|---:|---:|---:|\n${table}\n\nExpanding deployment common1500: ${summary.expanding.common1500.totalReturn.toFixed(4)}%, baseline ${summary.expanding.baselineCommon1500.totalReturn.toFixed(4)}%.\n\n${summary.limitation}\n\nAll settings: ranked-grid.csv. Exact state semantics: RULE_VARIANTS_DESIGN.md.\n`);
  console.log(JSON.stringify({ selected, fullTop10: summary.fullTop10, expanding: summary.expanding, improvesFullAndFinal: summary.improvesFullAndFinal }, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exitCode = 1; });
