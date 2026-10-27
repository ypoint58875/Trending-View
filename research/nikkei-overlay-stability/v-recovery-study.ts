import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Account, Features, root, atomic, pathMetrics, validateIdentity } from "./analyze";
import { ema, sma } from "../../lib/analysis/indicators";
import { SmaPositionOverlay, ATR_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS, FIXED_HOLD5_POSITION_OVERLAY_MODEL } from "../../lib/analysis/sma-position-overlay";
import { runAllocationBacktest, type BacktestSettings } from "../../lib/analysis/backtest";
import { runStrategyCycleCloseBacktest, strategyCycleSignalDirection, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";

export interface Rule {
  entry: "turn" | "positive" | "pending3" | "pending5" | "pending10";
  quality: number; hold: number; exit: "wma" | "ema" | "both" | "none"; threshold: number;
  wait: number; remaining: number; recovery: "trend" | "ma20" | "breakout" | "ema";
  v: "none" | "rebound" | "breakout" | "engulf"; lookback: number; rebound: number; drop: number;
  vGate: "both" | "wma" | "ma20" | "none";
}
export const baseline: Rule = { entry: "turn", quality: 20, hold: 5, exit: "wma", threshold: 0.00075,
  wait: 5, remaining: 0, recovery: "trend", v: "none", lookback: 5, rebound: 0.03, drop: 0.03, vGate: "both" };
export const ruleId = (r: Rule) => JSON.stringify(r);
export function menu(): Rule[] {
  const rows = new Map<string, Rule>();
  const add = (patch: Partial<Rule>) => { const r = { ...baseline, ...patch }; rows.set(ruleId(r), r); };
  add({});
  for (const entry of ["turn", "positive", "pending3", "pending5", "pending10"] as const)
    for (const quality of [0, 10, 20, 30]) for (const hold of [3, 5, 7, 10]) add({ entry, quality, hold });
  for (const exit of ["wma", "ema", "both", "none"] as const)
    for (const threshold of [0.00025, 0.0005, 0.00075, 0.001, 0.00125]) for (const hold of [3, 5, 7, 10]) add({ exit, threshold, hold });
  for (const wait of [0, 2, 3, 5, 7]) for (const recovery of ["trend", "ma20", "breakout", "ema"] as const)
    for (const remaining of [0, 0.5]) add({ wait, recovery, remaining });
  for (const lookback of [5, 10]) for (const rebound of [0.02, 0.03, 0.04, 0.05]) for (const drop of [0.03, 0.05])
    for (const vGate of ["both", "wma", "ma20", "none"] as const) add({ v: "rebound", lookback, rebound, drop, vGate });
  for (const v of ["breakout", "engulf"] as const) for (const drop of [0.03, 0.05])
    for (const vGate of ["both", "wma", "ma20", "none"] as const) add({ v, drop, vGate });
  // Predeclared interaction check: delayed entries plus modest gate/holding changes.
  for (const entry of ["turn", "pending5"] as const) for (const quality of [10, 20, 30])
    for (const hold of [5, 7, 10]) for (const wait of [2, 5]) add({ entry, quality, hold, wait });
  for (const drop of [0.03, 0.04, 0.05, 0.06]) for (const lookback of [3, 5, 7])
    for (const hold of [5, 7, 10]) for (const wait of [2, 5]) add({ v: "engulf", vGate: "none", drop, lookback, hold, wait });
  for (const lookback of [5, 10]) for (const rebound of [0.03, 0.04, 0.05])
    for (const drop of [0.03, 0.05]) for (const hold of [7, 10]) add({ v: "rebound", vGate: "none", lookback, rebound, drop, hold });
  return [...rows.values()];
}
export class Context {
  readonly features: Features; readonly e7; readonly e3;
  readonly averages = new Map<number, (number | null)[]>();
  constructor(readonly bars: MarketBar[]) {
    this.features = new Features(bars); const closes = bars.map(b => b.close);
    this.e7 = ema(closes, 7); this.e3 = ema(closes, 3);
    for (const n of [10, 20, 30]) this.averages.set(n, sma(closes, n));
  }
  vSignal(i: number, r: Rule) {
    if (r.v === "none" || i < 11) return false;
    const bars = this.bars, b = bars[i]!, previous = bars[i - 1]!;
    let lowIndex = i;
    for (let n = i - r.lookback + 1; n <= i; n++) if (bars[n]!.open <= bars[lowIndex]!.open) lowIndex = n;
    const low = bars[lowIndex]!.open;
    const priorPeak = Math.max(...bars.slice(Math.max(0, lowIndex - 10), lowIndex).map(b => b.close));
    if (low <= 0 || priorPeak <= 0 || 1 - low / priorPeak < r.drop) return false;
    if (r.v === "rebound") {
      const previousLow = Math.min(...bars.slice(i - r.lookback, i).map(b => b.open));
      return b.close >= low * (1 + r.rebound) && previous.close < previousLow * (1 + r.rebound);
    }
    if (r.v === "breakout") return b.close > previous.high && this.e3[i] != null && this.e3[i - 1] != null && this.e3[i]! > this.e3[i - 1]!;
    return previous.close < previous.open && b.open <= previous.close && b.close > previous.open && b.close > b.open;
  }
}
export class ResearchAccount {
  readonly account = new Account();
  lastSupplement: number | null = null; enteredAt: number | null = null;
  entryClose = 0; recoveryTarget: number | null = null; cutIndex = -1; blockedUntil = 0;
  riskCut = false; lastTurn = -Infinity;
  private readonly slopes: (number | null)[];
  private readonly turns: boolean[];
  constructor(readonly context: Context, readonly rule: Rule) {
    this.slopes = [...context.features.get("SMA", 11).slope];
    this.turns = context.bars.map(() => false);
  }
  step(i: number, signals: readonly StrategyCycleRecentSignal[]) {
    const r = this.rule, c = this.context, before = this.account.allocation;
    if (before <= 1e-10 && i < this.blockedUntil) return { target: 0, cut: false, recovered: false, vBuy: false };
    const close = c.bars[i]!.close, e = c.features.get("EMA", 7), w = c.features.get("WMA", 7), s = c.features.get("SMA", 11);
    const ep = (e.sign[i] ?? -1) > 0, wn = w.sign[i] != null && w.sign[i]! < 0;
    if (e.turns[i]) this.lastTurn = i;
    const protectedTrend = r.exit === "wma" ? !wn : r.exit === "ema" ? ep : r.exit === "both" ? ep || !wn : false;
    this.slopes[i] = protectedTrend || (this.lastSupplement !== null && i - this.lastSupplement < r.hold) ? Infinity : s.slope[i]!;
    const average = c.averages.get(r.quality)?.[i];
    const quality = r.quality === 0 || (average != null && close > average);
    const entry = r.entry === "turn" ? e.turns[i] : r.entry === "positive" ? ep : ep && i - this.lastTurn <= Number(r.entry.slice(7));
    this.turns[i] = entry && quality && i >= this.blockedUntil;
    const view = { get: (type: "EMA" | "SMA" | "WMA", period: number) => type === "EMA" ? { ...e, turns: this.turns }
      : type === "SMA" ? { ...s, slope: this.slopes } : c.features.get(type, period) } as unknown as Features;
    const blockedBuy = i < this.blockedUntil && strategyCycleSignalDirection(signals) === "increase";
    const boundedSignals = blockedBuy ? signals.map(signal => ({ ...signal, targetAllocation: Math.min(before, signal.targetAllocation) })) : signals;
    let target = this.account.step(i, boundedSignals, { entry: 7, exit: 11, gate: 7, threshold: r.threshold, flags: 7 }, view);
    let vBuy = false, recovered = false;
    const average20 = c.averages.get(20)?.[i], ma20 = average20 != null && close > average20;
    const wmaGate = (w.sign[i] ?? -1) >= 0;
    const vGate = r.vGate === "none" || (r.vGate === "wma" ? wmaGate : r.vGate === "ma20" ? ma20 : wmaGate && ma20);
    if (target <= 1e-10 && signals.length === 0 && i >= this.blockedUntil && vGate && c.vSignal(i, r)) {
      target = 1; this.account.allocation = 1; this.account.pending = null; vBuy = true;
    }
    if (before <= 1e-10 && target > 1e-10) {
      this.enteredAt = i; this.entryClose = close; this.recoveryTarget = null; this.riskCut = false;
      this.lastSupplement = signals.length === 0 ? i : null;
    }
    if (before > 1e-10 && target <= 1e-10) {
      this.enteredAt = null; this.entryClose = 0; this.recoveryTarget = null; this.lastSupplement = null; this.riskCut = false;
    }
    const aboveEMA = c.e7[i] != null && close > c.e7[i]!;
    const priorHigh = Math.max(...c.bars.slice(Math.max(0, i - 5), i).map(b => b.high));
    const recovery = ep && aboveEMA && (r.recovery === "ema" || (w.sign[i] ?? -1) > 0) &&
      (r.recovery !== "ma20" || ma20) && (r.recovery !== "breakout" || close > priorHigh);
    if (this.recoveryTarget !== null && i > this.cutIndex && i >= this.blockedUntil && signals.length === 0 && recovery) {
      target = Math.max(target, this.recoveryTarget); this.account.allocation = target; this.account.pending = null;
      this.recoveryTarget = null; this.enteredAt = i; this.entryClose = close; this.riskCut = false; recovered = true;
    }
    const age = this.enteredAt === null ? Infinity : i - this.enteredAt;
    const cut = !this.riskCut && before > 1e-10 && target > 1e-10 && age <= 5 && this.entryClose > 0 && close <= this.entryClose * 0.96;
    if (cut) {
      this.recoveryTarget = target; target *= r.remaining; this.account.allocation = target;
      this.account.pending = null; this.lastSupplement = null; this.riskCut = true;
      this.cutIndex = i; this.blockedUntil = i + r.wait + 1;
      if (target <= 1e-10) this.enteredAt = null;
    }
    return { target, cut, recovered, vBuy };
  }
}
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
async function bounded(path: string) { assert.ok((await stat(path)).size <= 16 * 1024 ** 2); return readFile(path, "utf8"); }
async function main() {
  const data = join(root, "data/full-screen-6-15"), output = join(root, "output/v-recovery-confirmed");
  const input = JSON.parse(await bounded(join(data, "input.json"))) as { bars: MarketBar[]; barsHash: string; batch: string; settings: BacktestSettings; snapshots: { decisionIndex: number }[] };
  const saved = JSON.parse(await bounded(join(data, "signals.json"))) as { sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[] };
  const sourceHash = sha(JSON.stringify(input)); assert.equal(saved.sourceHash, sourceHash); assert.equal(sha(JSON.stringify(input.bars)), input.barsHash);
  assert.ok(input.bars.length <= 10000 && saved.rows.length <= 2048); assert.equal(saved.rows.length, input.snapshots.length);
  const decisions = new Map(saved.rows.map((r, n) => { assert.equal(r.index, input.snapshots[n]!.decisionIndex); return [r.index, r.signals] as const; }));
  const designHash = sha((await Promise.all(["V_RECOVERY_DESIGN.md", "v-recovery-study.ts", "analyze.ts", "../nikkei-cycle-rallies/ma-type.ts",
    "../../lib/analysis/sma-position-overlay.ts", "../../lib/analysis/indicators.ts", "../../lib/analysis/backtest.ts", "../../lib/analysis/strategy-cycle-validation.ts"]
    .map(p => readFile(join(root, p), "utf8")))).join("\n"));
  const { bars, settings } = input, start = bars.length - 2000, context = new Context(bars), rules = menu(); assert.ok(rules.length <= 1000);
  const run = (rule: Rule) => {
    const account = new ResearchAccount(context, rule), targets = bars.map(() => 0), events: { time: string; cut: boolean; recovered: boolean; vBuy: boolean }[] = [];
    for (let i = start; i < bars.length; i++) {
      const step = account.step(i, decisions.get(i) ?? []); targets[i] = step.target;
      if (step.cut || step.recovered || step.vBuy) events.push({ time: bars[i]!.time, cut: step.cut, recovered: step.recovered, vBuy: step.vBuy });
    }
    const result = runStrategyCycleCloseBacktest(bars, targets, settings);
    const prefix = Float64Array.from([0, ...result.equity.map(e => Math.log(e.equity / settings.initialCash))]); assert.equal(prefix.length, 2001);
    return { targets, result, events, metrics: { totalReturn: result.totalReturn, maxDrawdown: result.maxDrawdown, fills: result.tradeCount,
      cuts: events.filter(e => e.cut).length, recoveries: events.filter(e => e.recovered).length, vBuys: events.filter(e => e.vBuy).length,
      first1500: pathMetrics(prefix, 0, 1500), final500: pathMetrics(prefix, 1500, 2000), blocks: [0, 1, 2, 3].map(n => pathMetrics(prefix, n * 500, n * 500 + 500)) } };
  };
  const base = run(baseline), production = new SmaPositionOverlay(bars, { ...DEFAULT_POSITION_OVERLAY_OPTIONS, model: FIXED_HOLD5_POSITION_OVERLAY_MODEL });
  for (let i = start; i < bars.length; i++) {
    const signals = decisions.get(i) ?? [], direction = strategyCycleSignalDirection(signals);
    if (direction) production.request(direction, signals.at(-1)!.targetAllocation, i);
    assert.equal(base.targets[i], production.close(i, signals.length > 0), `Production baseline mismatch at ${i}`);
  }
  assert.ok(Math.abs(base.metrics.totalReturn - 328.0321475882787) < 1e-9);
  type Row = { rule: Rule; id: string } & ReturnType<typeof run>["metrics"];
  const checkpoint = join(root, "data/v-recovery-confirmed/grid.json"); let rows: Row[] = [];
  try { const stored = JSON.parse(await bounded(checkpoint)); validateIdentity(stored, sourceHash, designHash); rows = stored.rows;
    assert.ok(rows.length <= rules.length); rows.forEach((r, n) => assert.equal(r.id, ruleId(rules[n]!)));
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  let stopping = false; process.on("SIGINT", () => { stopping = true; }); process.on("SIGTERM", () => { stopping = true; });
  for (let n = rows.length; n < rules.length; n++) {
    if (stopping || process.memoryUsage().rss > 1.5 * 1024 ** 3) throw new Error("Stopped safely; rerun to resume committed rows");
    const rule = rules[n]!; rows.push({ rule, id: ruleId(rule), ...run(rule).metrics });
    if (rows.length % 25 === 0 || rows.length === rules.length) {
      await atomic(checkpoint, { sourceHash, designHash, rows }); console.log(`Completed ${rows.length}/${rules.length}`);
      await new Promise<void>(resolve => setImmediate(resolve));
    }
  }
  const order = (a: Row, b: Row) => b.totalReturn - a.totalReturn || a.id.localeCompare(b.id);
  const ranked = [...rows].sort(order), eligible = ranked.filter(r => r.totalReturn > base.metrics.totalReturn + 1e-9 && r.maxDrawdown >= base.metrics.maxDrawdown - 1e-9);
  const development = [...rows].filter(r => r.first1500.maxDrawdown >= base.metrics.first1500.maxDrawdown - 1e-9)
    .sort((a, b) => b.first1500.totalReturn - a.first1500.totalReturn || a.id.localeCompare(b.id))[0]!;
  const vBest = ranked.find(r => r.rule.v !== "none")!, selected = [];
  for (const [label, row] of [["baseline", rows[0]!], ["best-return", ranked[0]!], ["best-no-worse-dd", eligible[0] ?? rows[0]!], ["best-v", vBest], ["development", development]] as const) {
    const outcome = run(row.rule), detailedSummary = runStrategyCycleCloseBacktest(bars, outcome.targets, { ...settings, summaryOnly: true });
    assert.equal(outcome.result.totalReturn, detailedSummary.totalReturn); assert.equal(outcome.result.maxDrawdown, detailedSummary.maxDrawdown);
    const twice = runStrategyCycleCloseBacktest(bars, outcome.targets, { ...settings, commissionRate: settings.commissionRate * 2, slippageRate: settings.slippageRate * 2, summaryOnly: true });
    const next = runAllocationBacktest(bars, outcome.targets, { ...settings, executionPolicy: "next-open" });
    selected.push({ label, ...row, doubleCost: { totalReturn: twice.totalReturn, maxDrawdown: twice.maxDrawdown }, nextOpen: { totalReturn: next.totalReturn, maxDrawdown: next.maxDrawdown } });
    await atomic(join(output, `${label}.json`), { sourceHash, designHash, rule: row.rule, ...outcome });
  }
  await atomic(join(output, "summary.json"), { sourceHash, designHash, generatedAt: new Date().toISOString(), batch: input.batch, candidates: rows.length, eligibleCount: eligible.length, selected, top: ranked.slice(0, 30), rows });
  console.log(JSON.stringify({ candidates: rows.length, eligibleCount: eligible.length, selected }, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exitCode = 1; });
