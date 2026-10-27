import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atomic, pathMetrics, root } from "./analyze";
import { currentRule, entryContext } from "./sma-entry-study";
import { ResearchAccount, type Rule } from "./v-recovery-study";
import { observations, detectRegime, wilderAtr, type Observation } from "./regime-tuning";
import { sma } from "../../lib/analysis/indicators";
import { SmaPositionOverlay, ENGULF_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import { runAllocationBacktest, type AllocationBacktestResult, type BacktestSettings } from "../../lib/analysis/backtest";
import { runStrategyCycleCloseBacktest, strategyCycleSignalDirection, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import type { MarketBar } from "../../lib/market/types";

export interface RiskPolicy {
  id: string; detector: "wide" | "weak-wide"; scope: "ema" | "all";
  entry: "turn" | "pending3"; sizing: "none" | "fixed25" | "fixed50" | "fixed75" | "atr1" | "atr1.5";
  restore: boolean; exit: "baseline" | "wma" | "ema" | "atr";
}
export const baselinePolicy: RiskPolicy = { id: "baseline", detector: "wide", scope: "ema", entry: "turn", sizing: "none", restore: false, exit: "baseline" };
export function sizingMenu(): RiskPolicy[] {
  const result = [{ ...baselinePolicy }];
  for (const detector of ["wide", "weak-wide"] as const) for (const scope of ["ema", "all"] as const)
    for (const entry of ["turn", "pending3"] as const) for (const sizing of ["fixed25", "fixed50", "fixed75", "atr1", "atr1.5"] as const)
      for (const restore of [false, true]) for (const exit of ["baseline", "wma", "ema", "atr"] as const)
        result.push({ id: `${detector}-${scope}-${entry}-${sizing}-${restore ? "restore" : "keep"}-${exit}`,
          detector, scope, entry, sizing, restore, exit });
  return result;
}
export function entryFraction(sizing: RiskPolicy["sizing"], laggedAtrPercent: number): number {
  if (sizing === "none") return 1;
  if (sizing.startsWith("fixed")) return Number(sizing.slice(5)) / 100;
  return Math.max(0.25, Math.min(1, Number(sizing.slice(3)) / laggedAtrPercent));
}
export class SizingContext {
  readonly inner; readonly points: Observation[]; readonly wide: boolean[]; readonly weakWide: boolean[];
  readonly average60: (number | null)[]; readonly atr: (number | null)[];
  constructor(readonly bars: MarketBar[]) {
    this.inner = entryContext(bars); this.points = observations(bars); this.wide = detectRegime(this.points, "wide-noise");
    this.average60 = sma(bars.map(bar => bar.close), 60); this.atr = wilderAtr(bars);
    this.weakWide = this.wide.map((active, index) => active && this.average60[index - 1] != null && bars[index - 1]!.close < this.average60[index - 1]!);
  }
  confirmed(index: number) {
    if (index < 1) return false;
    const above = (cursor: number) => this.average60[cursor] != null && this.inner.averages.get(20)![cursor] != null &&
      this.bars[cursor]!.close > this.average60[cursor]! && this.bars[cursor]!.close > this.inner.averages.get(20)![cursor]!;
    return above(index) && above(index - 1) && (this.inner.features.get("EMA", 7).sign[index] ?? -1) > 0 &&
      (this.inner.features.get("WMA", 7).sign[index] ?? -1) > 0;
  }
}
export class SizedAccount {
  readonly inner: ResearchAccount; private readonly rule: Rule;
  tagged = false; peak = 0; episodeEntry = 0; entryAtr = 0;
  constructor(readonly context: SizingContext, readonly policy: RiskPolicy) {
    this.rule = { ...currentRule }; this.inner = new ResearchAccount(context.inner, this.rule);
  }
  step(index: number, signals: readonly StrategyCycleRecentSignal[]) {
    const context = this.context, policy = this.policy, account = this.inner;
    const before = account.account.allocation, close = context.bars[index]!.close;
    const active = (policy.detector === "wide" ? context.wide : context.weakWide)[index] === true;
    const direction = strategyCycleSignalDirection(signals);
    if (direction === "increase") this.clearTag();
    Object.assign(this.rule, currentRule);
    if (policy.sizing !== "none" && active) this.rule.entry = policy.entry;
    if (this.tagged && policy.exit === "wma") this.rule.threshold = Number.MAX_VALUE;
    if (this.tagged && policy.exit === "ema") { this.rule.threshold = Number.MAX_VALUE; this.rule.exit = "ema"; }
    const state = account.step(index, signals);
    let capped = false, restored = false, atrExit = false;
    if (account.account.allocation <= 1e-10) this.clearTag();
    const lagged = context.points[index - 1]?.atrPercent;
    if (policy.sizing !== "none" && before <= 1e-10 && state.target > 1e-10 && !state.recovered &&
      signals.length === 0 && active && (policy.scope === "all" || !state.vBuy) && lagged != null && lagged > 0) {
      const fraction = entryFraction(policy.sizing, lagged);
      account.account.allocation = Math.min(account.account.allocation, fraction); capped = fraction < 1 - 1e-10;
      this.tagged = true; this.peak = close; this.episodeEntry = close; this.entryAtr = context.atr[index - 1] ?? 0;
    }
    if (this.tagged && account.account.allocation > 1e-10) {
      this.peak = Math.max(this.peak, close);
      if (policy.restore && before > 1e-10 && !state.cut && signals.length === 0 && account.account.pending === null &&
        account.account.allocation < 1 - 1e-10 && context.confirmed(index)) {
        account.account.allocation = 1; restored = true;
      }
      const currentAtr = context.atr[index], average = context.inner.e7[index];
      if (policy.exit === "atr" && before > 1e-10 && !state.cut && signals.length === 0 &&
        this.entryAtr > 0 && this.peak - this.episodeEntry >= this.entryAtr && currentAtr != null && currentAtr > 0 &&
        this.peak - close >= 1.5 * currentAtr && average != null && close < average) {
        account.account.allocation = 0; account.account.pending = null; account.lastSupplement = null;
        account.enteredAt = null; account.entryClose = 0; account.recoveryTarget = null; account.riskCut = false;
        account.cutIndex = index; account.blockedUntil = index + 6; atrExit = true; this.clearTag();
      }
    }
    return { ...state, target: account.account.allocation, capped, restored, atrExit, tagged: this.tagged,
      active, before, pending: account.account.pending };
  }
  private clearTag() { this.tagged = false; this.peak = 0; this.episodeEntry = 0; this.entryAtr = 0; }
}
export function sizingReplay(context: SizingContext, decisions: ReadonlyMap<number, StrategyCycleRecentSignal[]>, start: number,
  policy: RiskPolicy, detailed = false) {
  const account = new SizedAccount(context, policy), targets = context.bars.map(() => 0);
  const daily = [], counts = { capped: 0, restored: 0, atrExits: 0, earlyCuts: 0, recoveries: 0 };
  for (let index = start; index < context.bars.length; index++) {
    const signals = decisions.get(index) ?? [], state = account.step(index, signals); targets[index] = state.target;
    counts.capped += Number(state.capped); counts.restored += Number(state.restored); counts.atrExits += Number(state.atrExit);
    counts.earlyCuts += Number(state.cut); counts.recoveries += Number(state.recovered);
    if (detailed) daily.push({ time: context.bars[index]!.time, close: context.bars[index]!.close, ...state,
      direction: strategyCycleSignalDirection(signals), signals: signals.length, entryIndex: account.inner.enteredAt,
      blockedUntil: account.inner.blockedUntil });
  }
  return { targets, daily, counts };
}
function metrics(result: AllocationBacktestResult, cash: number, boundary: number, analogueOffsets: { from: number; to: number }[]) {
  assert.equal(result.equity.length, 2000);
  const prefix = Float64Array.from([0, ...result.equity.map(point => Math.log(point.equity / cash))]);
  return { totalReturn: result.totalReturn, maxDrawdown: result.maxDrawdown, fills: result.tradeCount,
    first1500: pathMetrics(prefix, 0, 1500), final500: pathMetrics(prefix, 1500, 2000),
    preCutoff: pathMetrics(prefix, 0, boundary), recent: pathMetrics(prefix, boundary, 2000),
    blocks: [0, 1, 2, 3].map(offset => pathMetrics(prefix, offset * 500, offset * 500 + 500)),
    analogues: analogueOffsets.map(block => pathMetrics(prefix, block.from, block.to)) };
}
type GridRow = ReturnType<typeof metrics> & { policy: RiskPolicy; counts: ReturnType<typeof sizingReplay>["counts"] };
export function validateProgress(saved: { sourceHash: string; implementationHash: string; rows: { policy: { id: string } }[] },
  sourceHash: string, implementationHash: string, menu: RiskPolicy[]) {
  assert.equal(saved.sourceHash, sourceHash, "Checkpoint source mismatch; retain old state and use a new checkpoint directory");
  assert.equal(saved.implementationHash, implementationHash, "Checkpoint implementation mismatch; retain old state and use a new checkpoint directory");
  assert.ok(Array.isArray(saved.rows) && saved.rows.length <= menu.length);
  saved.rows.forEach((row, index) => assert.deepEqual(row.policy, menu[index], "Checkpoint policy order or configuration mismatch"));
}
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
async function bounded(path: string) { assert.ok((await stat(path)).size <= 16 * 1024 ** 2); return readFile(path, "utf8"); }
async function main() {
  const data = join(root, "data/full-screen-6-15"), output = join(root, "output/regime-sizing");
  const input = JSON.parse(await bounded(join(data, "input.json"))) as { bars: MarketBar[]; barsHash: string; settings: BacktestSettings;
    batch: string; accessedAt: string; snapshots: { decisionIndex: number }[] };
  const saved = JSON.parse(await bounded(join(data, "signals.json"))) as { sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[] };
  const prior = JSON.parse(await bounded(join(root, "output/regime-tuning/summary.json"))) as {
    sourceHash: string; analogues: { from: number; to: number; start: string; end: string }[];
  };
  const sourceHash = sha(JSON.stringify(input)); assert.equal(sourceHash, saved.sourceHash); assert.equal(prior.sourceHash, sourceHash);
  assert.equal(sha(JSON.stringify(input.bars)), input.barsHash); assert.ok(input.bars.length <= 10000 && saved.rows.length <= 2048);
  assert.equal(saved.rows.length, input.snapshots.length);
  const decisions = new Map(saved.rows.map((row, offset) => { assert.equal(row.index, input.snapshots[offset]!.decisionIndex); return [row.index, row.signals] as const; }));
  const implementationHash = sha((await Promise.all(["REGIME_SIZING_DESIGN.md", "regime-sizing.ts", "regime-tuning.ts", "sma-entry-study.ts",
    "v-recovery-study.ts", "analyze.ts", "../nikkei-cycle-rallies/ma-type.ts", "../../lib/analysis/indicators.ts",
    "../../lib/analysis/sma-position-overlay.ts", "../../lib/analysis/backtest.ts", "../../lib/analysis/strategy-cycle-validation.ts"]
    .map(path => readFile(join(root, path), "utf8")))).join("\n"));
  const { bars, settings } = input, start = bars.length - 2000, context = new SizingContext(bars);
  const cutoff = bars.findIndex(bar => bar.time === "2026-07-21"); assert.ok(cutoff >= start);
  const boundary = cutoff - start + 1, offsets = prior.analogues.map(block => {
    assert.ok(block.from >= start && block.to <= cutoff + 1); assert.equal(bars[block.from]!.time, block.start);
    assert.equal(bars[block.to - 1]!.time, block.end); return { from: block.from - start, to: block.to - start };
  });
  const run = (policy: RiskPolicy, detailed = false) => {
    const path = sizingReplay(context, decisions, start, policy, detailed), result = runStrategyCycleCloseBacktest(bars, path.targets, settings);
    return { ...path, result, row: { policy, counts: path.counts, ...metrics(result, settings.initialCash, boundary, offsets) } };
  };
  const baseline = run(baselinePolicy), production = new SmaPositionOverlay(bars, DEFAULT_POSITION_OVERLAY_OPTIONS);
  for (let index = start; index < bars.length; index++) {
    const signals = decisions.get(index) ?? [], direction = strategyCycleSignalDirection(signals);
    if (direction) production.request(direction, signals.at(-1)!.targetAllocation, index);
    assert.equal(baseline.targets[index], production.close(index, signals.length > 0));
  }
  const menu = sizingMenu(); assert.equal(menu.length, 321);
  const checkpoint = join(root, "data/regime-sizing/grid.json"); let rows: GridRow[] = [];
  try { const stored = JSON.parse(await bounded(checkpoint)); validateProgress(stored, sourceHash, implementationHash, menu); rows = stored.rows; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const resumed = rows.length; let stopping = false;
  process.on("SIGINT", () => { stopping = true; }); process.on("SIGTERM", () => { stopping = true; });
  for (let offset = rows.length; offset < menu.length; offset++) {
    if (stopping || process.memoryUsage().rss > 1.5 * 1024 ** 3) {
      await atomic(checkpoint, { sourceHash, implementationHash, rows }); throw new Error("Stopped safely; rerun to resume committed cases");
    }
    rows.push(run(menu[offset]!).row);
    if (rows.length % 20 === 0 || rows.length === menu.length) {
      await atomic(checkpoint, { sourceHash, implementationHash, rows }); console.log(`Completed ${rows.length}/${menu.length}`);
      await new Promise<void>(done => setImmediate(done));
    }
  }
  const order = (left: GridRow, right: GridRow) => right.totalReturn - left.totalReturn || menu.findIndex(policy => policy.id === left.policy.id) - menu.findIndex(policy => policy.id === right.policy.id);
  const ranked = [...rows].sort(order);
  const eligible = ranked.filter(row => row.totalReturn >= baseline.row.totalReturn - 1e-9 && row.maxDrawdown >= baseline.row.maxDrawdown - 1e-9 && row.policy.id !== "baseline");
  const development = rows.filter(row => row.first1500.maxDrawdown >= baseline.row.first1500.maxDrawdown - 1e-9)
    .sort((left, right) => right.first1500.totalReturn - left.first1500.totalReturn || menu.findIndex(policy => policy.id === left.policy.id) - menu.findIndex(policy => policy.id === right.policy.id))[0]!;
  const recentBest = [...rows].sort((left, right) => right.recent.totalReturn - left.recent.totalReturn || order(left, right))[0]!;
  const selected = [];
  for (const [label, row] of [["baseline", rows[0]!], ["development", development], ["full-best", ranked[0]!],
    ["full-best-no-worse-dd", eligible[0] ?? rows[0]!], ["recent-best", recentBest]] as const) {
    const outcome = run(row.policy, true);
    assert.deepEqual(outcome.row, row);
    const compact = runStrategyCycleCloseBacktest(bars, outcome.targets, { ...settings, summaryOnly: true });
    assert.equal(compact.totalReturn, outcome.result.totalReturn); assert.equal(compact.maxDrawdown, outcome.result.maxDrawdown);
    const doubleCost = runStrategyCycleCloseBacktest(bars, outcome.targets, { ...settings, commissionRate: settings.commissionRate * 2, slippageRate: settings.slippageRate * 2 });
    const nextOpen = runAllocationBacktest(bars, outcome.targets, { ...settings, executionPolicy: "next-open" });
    selected.push({ label, ...row, doubleCost: metrics(doubleCost, settings.initialCash, boundary, offsets), nextOpen: metrics(nextOpen, settings.initialCash, boundary, offsets),
      recentFills: outcome.result.rebalances.filter(fill => fill.time > "2026-07-21") });
    await atomic(join(output, `${label}.json`), { sourceHash, implementationHash, policy: row.policy, result: outcome.result, daily: outcome.daily });
  }
  const summary = { sourceHash, implementationHash, generatedAt: new Date().toISOString(), sourceAccessedAt: input.accessedAt, batch: input.batch,
    settings, start: bars[start]!.time, end: bars.at(-1)!.time, cutoff: bars[cutoff]!.time, cases: rows.length, resumed,
    simultaneousImprovementCount: eligible.length, analogues: prior.analogues, developmentChoice: development.policy.id, selected, rows,
    verification: { productionTargets: 2000, selectedSummaryLedgerPairs: selected.length },
    limitation: "Previously explored historical data; all full/recent rankings are descriptive. First1500 selection is chronological but not untouched validation. Actual partial allocations preserve original signal authority. No production change." };
  await atomic(join(output, "summary.json"), summary);
  const table = selected.map(row => `| ${row.label} | ${row.policy.id} | ${row.totalReturn.toFixed(3)} | ${row.maxDrawdown.toFixed(3)} | ${row.final500.totalReturn.toFixed(3)} | ${row.recent.totalReturn.toFixed(3)} | ${row.recent.maxDrawdown.toFixed(3)} |`).join("\n");
  const report = `# Supplemental sizing and exit research\n\n${summary.start} through ${summary.end};321 declared cases. Recent returns strictly after2026-07-21 close; actual continuous partial accounts, fees/slippage included.\n\n| Selection | Policy | Full return % | Full DD % | Final500 % | Recent % | Recent DD % |\n|---|---|---:|---:|---:|---:|---:|\n${table}\n\nSimultaneous full return/no-worse-DD cases: ${eligible.length}. First1500-only selection: ${development.policy.id}.\n\nSee REGIME_SIZING_DESIGN.md for exact entry/exit/restoration scope. summary.json contains every case, episode counters, four500-session blocks, five retrospective analogues and selected cost/next-open sensitivity. Complete selected daily ledgers are separate. Source and implementation hashes validate scalar checkpoint resume.\n\n${summary.limitation}\n`;
  const temporary = join(output, "REPORT.md.tmp"); await writeFile(temporary, report); await replaceFileAtomically(temporary, join(output, "REPORT.md"));
  console.log(JSON.stringify({ cases: rows.length, resumed, eligible: eligible.length, development: development.policy.id,
    selected: selected.map(row => ({ label: row.label, policy: row.policy.id, full: row.totalReturn, dd: row.maxDrawdown, first1500: row.first1500,
      final500: row.final500, recent: row.recent, counts: row.counts })) }, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
