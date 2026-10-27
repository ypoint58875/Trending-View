import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atomic, pathMetrics, root } from "./analyze";
import { currentRule, entryContext } from "./sma-entry-study";
import { ResearchAccount } from "./v-recovery-study";
import { backwardDerivatives } from "./ma-derivative-study";
import { efficiency, observations, wilderAtr } from "./regime-tuning";
import { ema } from "../../lib/analysis/indicators";
import { SmaPositionOverlay, ENGULF_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import { runAllocationBacktest, type AllocationBacktestResult, type BacktestSettings } from "../../lib/analysis/backtest";
import { runStrategyCycleCloseBacktest, strategyCycleSignalDirection, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import type { MarketBar } from "../../lib/market/types";

export interface RepairPolicy {
  id: string; mode: "off" | "none" | "range" | "wide"; trigger: "queued" | "conjunction" | "breakout";
  allocation: number; stop: "percent" | "atr"; maxAge: number; exit: "original" | "wma" | "curvature" | "atr";
}
export const repairBaseline: RepairPolicy = { id: "baseline", mode: "off", trigger: "queued", allocation: 0, stop: "percent", maxAge: 10, exit: "original" };
export function repairMenu(): RepairPolicy[] {
  const rows = [{ ...repairBaseline }];
  for (const mode of ["none", "range", "wide"] as const) for (const trigger of ["queued", "conjunction", "breakout"] as const)
    for (const allocation of [0.25, 0.5, 0.75, 1]) for (const stop of ["percent", "atr"] as const)
      for (const maxAge of [10, 20]) for (const exit of ["original", "wma", "curvature", "atr"] as const)
        rows.push({ id: `${mode}-${trigger}-a${allocation * 100}-${stop}-age${maxAge}-${exit}`, mode, trigger, allocation, stop, maxAge, exit });
  return rows;
}
export interface RepairPoint {
  d1: number | null; d2: number | null; er20: number | null; er5: number | null; rank: number | null;
  move5: number | null; shock: boolean;
}
export interface ModeDay { effective: boolean; activeAtClose: boolean; reason: string | null }
export function explicitMode(points: RepairPoint[], wide: boolean): ModeDay[] {
  let active = false, enteredAt = -1, entering = 0, trending = 0, bursting = 0, quiet = 0;
  return points.map((point, index) => {
    const effective = active;
    if (point.d1 === null || point.er20 === null || point.er5 === null || point.move5 === null || (wide && point.rank === null)) {
      active = false; entering = 0; trending = 0; bursting = 0; quiet = 0;
      return { effective, activeAtClose: false, reason: effective ? "unknown-input" : null };
    }
    if (point.shock) {
      active = false; entering = 0; trending = 0; bursting = 0; quiet = 0;
      return { effective, activeAtClose: false, reason: effective ? "shock-exit" : null };
    }
    if (!active) {
      entering = point.er20 <= 0.25 && Math.abs(point.d1) <= 0.10 && (!wide || point.rank! >= 0.60) ? entering + 1 : 0;
      if (entering >= 3) { active = true; enteredAt = index; entering = 0; return { effective, activeAtClose: true, reason: "entry-confirm3" }; }
      return { effective, activeAtClose: false, reason: null };
    }
    trending = point.er20 >= 0.40 && Math.abs(point.d1) >= 0.15 ? trending + 1 : 0;
    bursting = Math.abs(point.move5) >= 2 && point.er5 >= 0.60 ? bursting + 1 : 0;
    quiet = wide && point.rank! <= 0.40 ? quiet + 1 : 0;
    if (index - enteredAt >= 5 && (trending >= 2 || bursting >= 2 || quiet >= 3)) {
      const reason = trending >= 2 ? "trend-exit" : bursting >= 2 ? "burst-exit" : "volatility-exit";
      active = false; trending = 0; bursting = 0; quiet = 0;
      return { effective, activeAtClose: false, reason };
    }
    return { effective, activeAtClose: true, reason: null };
  });
}
export class RepairContext {
  readonly inner; readonly atr; readonly points: RepairPoint[]; readonly range: ModeDay[]; readonly wide: ModeDay[]; readonly gates: boolean[];
  constructor(readonly bars: MarketBar[]) {
    this.inner = entryContext(bars); this.atr = wilderAtr(bars);
    const closes = bars.map(bar => bar.close), averages = ema(closes, 20), observed = observations(bars);
    this.points = bars.map((bar, index) => {
      const priorAtr = this.atr[index - 1] ?? null, difference = backwardDerivatives(averages, index, 3, priorAtr);
      return { ...difference, er20: efficiency(closes, index, 20), er5: efficiency(closes, index, 5), rank: observed[index]!.atrRank,
        move5: index >= 5 && priorAtr !== null && priorAtr > 0 ? (bar.close - closes[index - 5]!) / priorAtr : null,
        shock: index > 0 && priorAtr !== null && priorAtr > 0 && Math.abs(bar.close - closes[index - 1]!) >= 2 * priorAtr &&
          Math.abs(bar.close / closes[index - 1]! - 1) >= 0.02 };
    });
    this.range = explicitMode(this.points, false); this.wide = explicitMode(this.points, true);
    this.gates = bars.map((bar, index) => (this.inner.features.get("EMA", 7).sign[index] ?? -1) > 0 &&
      (this.inner.features.get("WMA", 7).sign[index] ?? -1) >= 0 && this.inner.averages.get(20)![index] != null && bar.close > this.inner.averages.get(20)![index]!);
  }
}
export interface MainFrame { target: number; blockedUntil: number }
export function mainFrames(context: RepairContext, decisions: ReadonlyMap<number, StrategyCycleRecentSignal[]>, start: number): MainFrame[] {
  const account = new ResearchAccount(context.inner, { ...currentRule });
  return context.bars.map((_, index) => {
    if (index < start) return { target: 0, blockedUntil: 0 };
    const state = account.step(index, decisions.get(index) ?? []);
    return { target: state.target, blockedUntil: account.blockedUntil };
  });
}
export class RepairAccount {
  allocation = 0; enteredAt = -1; entryClose = 0; entryAtr = 0; peak = 0; expires = -1;
  pending = false; armed = true; blockedUntil = 0; belowEma = 0; negativeCurvature = 0;
  constructor(readonly context: RepairContext, readonly policy: RepairPolicy, readonly main: readonly MainFrame[], readonly enableFrom = 0) {}
  private clear() {
    this.allocation = 0; this.enteredAt = -1; this.entryClose = 0; this.entryAtr = 0; this.peak = 0;
    this.pending = false; this.belowEma = 0; this.negativeCurvature = 0; this.expires = -1;
  }
  step(index: number, signals: readonly StrategyCycleRecentSignal[]) {
    const context = this.context, policy = this.policy, main = this.main[index]!, bar = context.bars[index]!;
    const direction = strategyCycleSignalDirection(signals), before = this.allocation;
    const finish = (reason: string | null, entered = false) => ({ target: main.target > 1e-10 ? main.target : this.allocation,
      mainTarget: main.target, sleeveTarget: this.allocation, before, entered, reason, pending: this.pending, expires: this.expires });
    if (main.target > 1e-10) { this.clear(); this.armed = false; return finish(before > 0 ? "main-priority" : null); }
    if (policy.mode === "off" || index < this.enableFrom) { this.clear(); return finish(null); }
    if (!context.gates[index]) this.armed = true;
    const positiveEma = (context.inner.features.get("EMA", 7).sign[index] ?? -1) > 0;
    if (!positiveEma || direction === "reduce" || index > this.expires) this.expires = -1;
    if (index < main.blockedUntil) { this.clear(); this.armed = false; return finish(before > 0 ? "main-cooldown" : null); }
    const wmaNegative = (context.inner.features.get("WMA", 7).sign[index] ?? 0) < 0;
    if (this.allocation > 1e-10) {
      this.peak = Math.max(this.peak, bar.close); if (direction === "reduce") this.pending = true;
      this.belowEma = context.inner.e7[index] != null && bar.close < context.inner.e7[index]! ? this.belowEma + 1 : 0;
      this.negativeCurvature = context.points[index]!.d2 !== null && context.points[index]!.d2! <= -0.005 ? this.negativeCurvature + 1 : 0;
      const distance = policy.stop === "percent" ? this.entryClose * 0.04 : Math.min(this.entryClose * 0.04, 1.5 * this.entryAtr);
      const stopped = bar.close <= this.entryClose - distance;
      const currentAtr = context.atr[index];
      let reason: string | null = stopped ? "hard-stop" : index - this.enteredAt >= policy.maxAge ? "time-limit" : null;
      if (!reason && (policy.exit === "original" || policy.exit === "atr") && this.pending) reason = "original-reduction";
      if (!reason && (policy.exit === "wma" || policy.exit === "curvature") && this.pending && wmaNegative) reason = "pending-wma";
      if (!reason && policy.exit === "curvature" && this.pending && this.negativeCurvature >= 2 && bar.close < context.bars[index - 1]!.close) reason = "pending-curvature";
      if (!reason && policy.exit === "atr" && currentAtr != null && this.peak - this.entryClose >= this.entryAtr &&
        this.peak - bar.close >= 1.5 * currentAtr && context.inner.e7[index] != null && bar.close < context.inner.e7[index]!) reason = "atr-giveback";
      if (!reason && policy.exit !== "atr" && this.belowEma >= 2 && wmaNegative) reason = "trend-failure";
      if (reason) {
        this.clear(); this.armed = false; if (stopped) this.blockedUntil = index + 6;
        return finish(reason);
      }
      return finish(null);
    }
    if (signals.length === 0 && context.inner.features.get("EMA", 7).turns[index] && index >= this.blockedUntil) this.expires = index + 2;
    const mode = policy.mode === "none" ? true : (policy.mode === "range" ? context.range : context.wide)[index]!.effective &&
      (policy.mode === "range" ? context.range : context.wide)[index]!.activeAtClose;
    if (!mode || !this.armed || !context.gates[index] || signals.length > 0 || index < this.blockedUntil) return finish(null);
    const breakout = index >= 5 && bar.close > Math.max(...context.bars.slice(index - 5, index).map(item => item.high));
    const trigger = policy.trigger === "queued" ? index <= this.expires : policy.trigger === "conjunction" ? !context.gates[index - 1] : breakout;
    if (trigger && context.atr[index - 1] != null && context.atr[index - 1]! > 0) {
      this.allocation = policy.allocation; this.enteredAt = index; this.entryClose = bar.close;
      this.entryAtr = context.atr[index - 1]!; this.peak = bar.close; this.expires = -1; this.armed = false;
      return finish("supplement-entry", true);
    }
    return finish(null);
  }
}
export function repairReplay(context: RepairContext, decisions: ReadonlyMap<number, StrategyCycleRecentSignal[]>, main: readonly MainFrame[],
  start: number, policy: RepairPolicy, detailed = false, enableFrom = start) {
  const account = new RepairAccount(context, policy, main, enableFrom), targets = context.bars.map(() => 0), daily = [];
  const counts: Record<string, number> = {};
  for (let index = start; index < context.bars.length; index++) {
    const signals = decisions.get(index) ?? [], state = account.step(index, signals); targets[index] = state.target;
    assert.ok(state.target >= 0 && state.target <= 1); if (main[index]!.target > 1e-10) assert.equal(state.target, main[index]!.target);
    if (state.reason) counts[state.reason] = (counts[state.reason] ?? 0) + 1;
    if (detailed) daily.push({ time: context.bars[index]!.time, ...state, blockedUntil: account.blockedUntil,
      direction: strategyCycleSignalDirection(signals), signals: signals.length });
  }
  return { targets, daily, counts };
}
function metrics(result: AllocationBacktestResult, cash: number, boundary: number) {
  assert.equal(result.equity.length, 2000);
  const prefix = Float64Array.from([0, ...result.equity.map(point => Math.log(point.equity / cash))]);
  return { totalReturn: result.totalReturn, maxDrawdown: result.maxDrawdown, fills: result.tradeCount,
    first1500: pathMetrics(prefix, 0, 1500), final500: pathMetrics(prefix, 1500, 2000),
    preCutoff: pathMetrics(prefix, 0, boundary), recent: pathMetrics(prefix, boundary, 2000),
    blocks: [0, 1, 2, 3].map(offset => pathMetrics(prefix, offset * 500, (offset + 1) * 500)) };
}
type RepairRow = ReturnType<typeof metrics> & { policy: RepairPolicy; counts: Record<string, number>; targetHash: string };
export function validateRepairProgress(saved: { sourceHash: string; implementationHash: string; rows: { policy: RepairPolicy }[] },
  sourceHash: string, implementationHash: string, menu: RepairPolicy[]) {
  assert.equal(saved.sourceHash, sourceHash, "Repair checkpoint source mismatch; preserve prior state");
  assert.equal(saved.implementationHash, implementationHash, "Repair checkpoint implementation mismatch; preserve prior state");
  assert.ok(Array.isArray(saved.rows) && saved.rows.length <= menu.length);
  saved.rows.forEach((row, index) => assert.deepEqual(row.policy, menu[index], "Repair checkpoint order/configuration mismatch"));
}
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
async function bounded(path: string) { assert.ok((await stat(path)).size <= 16 * 1024 ** 2); return readFile(path, "utf8"); }
async function main() {
  const data = join(root, "data/full-screen-6-15"), output = join(root, "output/supplemental-repair");
  const input = JSON.parse(await bounded(join(data, "input.json"))) as { bars: MarketBar[]; barsHash: string; settings: BacktestSettings;
    accessedAt: string; batch: string; snapshots: { decisionIndex: number }[] };
  const saved = JSON.parse(await bounded(join(data, "signals.json"))) as { sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[] };
  const sourceHash = sha(JSON.stringify(input)); assert.equal(saved.sourceHash, sourceHash); assert.equal(sha(JSON.stringify(input.bars)), input.barsHash);
  assert.ok(input.bars.length <= 10000 && saved.rows.length <= 2048); assert.equal(saved.rows.length, input.snapshots.length);
  const decisions = new Map(saved.rows.map((row, offset) => { assert.equal(row.index, input.snapshots[offset]!.decisionIndex); return [row.index, row.signals] as const; }));
  const implementationHash = sha((await Promise.all(["SUPPLEMENTAL_REPAIR_DESIGN.md", "supplemental-repair.ts", "analyze.ts", "sma-entry-study.ts",
    "v-recovery-study.ts", "regime-tuning.ts", "ma-atr-segmentation.ts", "ma-derivative-study.ts", "../nikkei-cycle-rallies/ma-type.ts",
    "../../lib/analysis/sma-position-overlay.ts", "../../lib/analysis/indicators.ts", "../../lib/analysis/strategy-cycle-validation.ts",
    "../../lib/analysis/backtest.ts"].map(path => readFile(join(root, path), "utf8")))).join("\n"));
  const { bars, settings } = input, start = bars.length - 2000, context = new RepairContext(bars);
  const cutoff = bars.findIndex(bar => bar.time === "2026-07-21"); assert.ok(cutoff >= start);
  const boundary = cutoff - start + 1, frames = mainFrames(context, decisions, start), menu = repairMenu(); assert.equal(menu.length, 577);
  const production = new SmaPositionOverlay(bars, DEFAULT_POSITION_OVERLAY_OPTIONS);
  for (let index = start; index < bars.length; index++) {
    const signals = decisions.get(index) ?? [], direction = strategyCycleSignalDirection(signals);
    if (direction) production.request(direction, signals.at(-1)!.targetAllocation, index);
    assert.equal(frames[index]!.target, production.close(index, signals.length > 0));
  }
  const run = (policy: RepairPolicy, detailed = false, enableFrom = start) => {
    const path = repairReplay(context, decisions, frames, start, policy, detailed, enableFrom);
    const result = runStrategyCycleCloseBacktest(bars, path.targets, settings);
    return { ...path, result, row: { policy, counts: path.counts, targetHash: sha(JSON.stringify(path.targets)),
      ...metrics(result, settings.initialCash, boundary) } };
  };
  const baseline = run(repairBaseline), checkpoint = join(root, "data/supplemental-repair/grid.json"); let rows: RepairRow[] = [];
  try { const stored = JSON.parse(await bounded(checkpoint)); validateRepairProgress(stored, sourceHash, implementationHash, menu); rows = stored.rows; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const resumed = rows.length; let stopping = false;
  process.on("SIGINT", () => { stopping = true; }); process.on("SIGTERM", () => { stopping = true; });
  for (let offset = rows.length; offset < menu.length; offset++) {
    if (stopping || process.memoryUsage().rss > 1.5 * 1024 ** 3) {
      await atomic(checkpoint, { sourceHash, implementationHash, rows }); throw new Error("Stopped safely; rerun to resume committed repair cases");
    }
    rows.push(run(menu[offset]!).row);
    if (rows.length % 20 === 0 || rows.length === menu.length) {
      await atomic(checkpoint, { sourceHash, implementationHash, rows }); console.log(`Completed ${rows.length}/${menu.length}`);
      await new Promise<void>(done => setImmediate(done));
    }
  }
  assert.deepEqual(rows[0], baseline.row);
  const ordinal = new Map(menu.map((policy, index) => [policy.id, index]));
  const tie = (left: RepairRow, right: RepairRow) => ordinal.get(left.policy.id)! - ordinal.get(right.policy.id)!;
  const fullOrder = (left: RepairRow, right: RepairRow) => right.totalReturn - left.totalReturn || tie(left, right);
  const ranked = [...rows].sort(fullOrder);
  const noWorse = (row: RepairRow) => row.totalReturn >= baseline.row.totalReturn - 1e-9 && row.maxDrawdown >= baseline.row.maxDrawdown - 1e-9;
  const simultaneous = ranked.filter(row => row.policy.id !== "baseline" && noWorse(row) &&
    (row.totalReturn > baseline.row.totalReturn + 1e-9 || row.maxDrawdown > baseline.row.maxDrawdown + 1e-9));
  const goalHits = simultaneous.filter(row => row.recent.totalReturn > baseline.row.recent.totalReturn + 1e-9 &&
    row.final500.totalReturn >= baseline.row.final500.totalReturn - 1e-9);
  const development = rows.filter(row => row.first1500.maxDrawdown >= baseline.row.first1500.maxDrawdown - 1e-9)
    .sort((left, right) => right.first1500.totalReturn - left.first1500.totalReturn || tie(left, right))[0]!;
  const recentBest = [...rows].sort((left, right) => right.recent.totalReturn - left.recent.totalReturn || fullOrder(left, right))[0]!;
  const bestNone = ranked.find(row => row.policy.mode === "none")!;
  const choices = [["baseline", rows[0]!], ["development", development], ["full-best", ranked[0]!],
    ["full-best-no-worse-dd", simultaneous[0] ?? rows[0]!], ["goal-best", goalHits[0] ?? rows[0]!],
    ["recent-best", recentBest], ["best-unsegmented", bestNone]] as const;
  const selected = [];
  for (const [label, row] of choices) {
    const outcome = run(row.policy, true); assert.deepEqual(outcome.row, row);
    const compact = runStrategyCycleCloseBacktest(bars, outcome.targets, { ...settings, summaryOnly: true });
    assert.equal(compact.totalReturn, outcome.result.totalReturn); assert.equal(compact.maxDrawdown, outcome.result.maxDrawdown);
    const twice = runStrategyCycleCloseBacktest(bars, outcome.targets, { ...settings, commissionRate: settings.commissionRate * 2, slippageRate: settings.slippageRate * 2 });
    const next = runAllocationBacktest(bars, outcome.targets, { ...settings, executionPolicy: "next-open" });
    const fork = run(row.policy, false, cutoff + 1);
    assert.deepEqual(fork.targets.slice(0, cutoff + 1), baseline.targets.slice(0, cutoff + 1));
    selected.push({ label, ...row, doubleCost: metrics(twice, settings.initialCash, boundary), nextOpen: metrics(next, settings.initialCash, boundary),
      commonState: fork.row.recent, recentFills: outcome.result.rebalances.filter(fill => fill.time > "2026-07-21") });
    await atomic(join(output, `${label}.json`), { sourceHash, implementationHash, policy: row.policy, result: outcome.result, daily: outcome.daily });
  }
  const modeIntervals = [];
  for (const name of ["range", "wide"] as const) {
    const days = context[name]; let entry = -1;
    for (let index = 0; index < days.length; index++) {
      if (days[index]!.reason === "entry-confirm3") entry = index;
      if (entry >= 0 && !days[index]!.activeAtClose) {
        modeIntervals.push({ mode: name, decisionEntry: bars[entry]!.time, eligibleFrom: bars[entry + 1]?.time ?? null,
          eligibleThrough: bars[index - 1]?.time ?? null, exitDecision: bars[index]!.time, exitReason: days[index]!.reason, open: false }); entry = -1;
      }
    }
    if (entry >= 0) modeIntervals.push({ mode: name, decisionEntry: bars[entry]!.time, eligibleFrom: bars[entry + 1]?.time ?? null,
      eligibleThrough: bars.at(-1)!.time, exitDecision: null, exitReason: null, open: true });
  }
  await atomic(join(output, "modes.json"), { sourceHash, implementationHash, intervals: modeIntervals, range: context.range, wide: context.wide });
  const summary = { sourceHash, implementationHash, generatedAt: new Date().toISOString(), sourceAccessedAt: input.accessedAt, batch: input.batch,
    settings, start: bars[start]!.time, end: bars.at(-1)!.time, cutoff: bars[cutoff]!.time, cases: rows.length, resumed,
    uniqueTargetPaths: new Set(rows.map(row => row.targetHash)).size, simultaneousCases: simultaneous.length, goalCases: goalHits.length,
    goalUniquePaths: new Set(goalHits.map(row => row.targetHash)).size, developmentChoice: development.policy.id,
    selected, rows, modeIntervals,
    verification: { mainProductionTargetComparisons: 2000, selectedSummaryLedgerPairs: selected.length,
      commonStatePrefixTargetsPerSelection: boundary, positiveMainTargetsPreservedEveryCase: true },
    limitation: "Previously explored retrospective data; full/recent winners and mode thresholds are exploratory. First1500 selection is chronological, not untouched validation. One actual target account, zero cash yield, close proxy. No default/model changes." };
  await atomic(join(output, "summary.json"), summary);
  const modeCsv = "mode,decisionEntry,eligibleFrom,eligibleThrough,exitDecision,exitReason,open\n" + modeIntervals.map(interval =>
    [interval.mode, interval.decisionEntry, interval.eligibleFrom, interval.eligibleThrough, interval.exitDecision, interval.exitReason, interval.open].join(",")).join("\n") + "\n";
  await writeFile(join(output, "mode-intervals.csv.tmp"), modeCsv); await replaceFileAtomically(join(output, "mode-intervals.csv.tmp"), join(output, "mode-intervals.csv"));
  const table = selected.map(row => `| ${row.label} | ${row.policy.id} | ${row.totalReturn.toFixed(3)} | ${row.maxDrawdown.toFixed(3)} | ${row.final500.totalReturn.toFixed(3)} | ${row.recent.totalReturn.toFixed(3)} | ${row.recent.maxDrawdown.toFixed(3)} | ${row.commonState.totalReturn.toFixed(3)} |`).join("\n");
  const report = `# Explicit proposal and supplemental repair results\n\n${summary.start}..${summary.end};577 declared cases,${summary.uniqueTargetPaths} distinct target paths. Same costs and close proxy as current v5; no live policy change. Main production parity holds on all2000 sessions.\n\n| Selection | Policy | Full return % | Full DD % | Final500 % | Recent % | Recent DD % | Common-state recent % |\n|---|---|---:|---:|---:|---:|---:|---:|\n${table}\n\nFull return/no-worse-DD improvements:${simultaneous.length}. Cases also improving recent and retaining final500 return:${goalHits.length} (${summary.goalUniquePaths} distinct paths). First1500-only choice:${development.policy.id}.\n\nRead PROPOSAL.md for exact entries/exits, timing, priorities and all577 configurations. mode-intervals.csv lists every actual regime decision, next-bar entry eligibility and explicit exit reason; modes.json includes daily state. An open sleeve follows its own exit rules when a regime ends. Main targets remain authoritative.\n\nSelected JSON ledgers contain every sleeve entry/exit, priority handoff and actual combined target. summary.json contains every scalar case, four500-session blocks, double-cost/next-open and common-state diagnostics. The common-state fork suppresses sleeves throughJuly21 and is attribution only, never a live date switch.\n\n${summary.limitation}\n`;
  for (const [name, content] of [["PROPOSAL.md", await readFile(join(root, "SUPPLEMENTAL_REPAIR_DESIGN.md"), "utf8")], ["REPORT.md", report]]) {
    await writeFile(join(output, `${name}.tmp`), content); await replaceFileAtomically(join(output, `${name}.tmp`), join(output, name));
  }
  console.log(JSON.stringify({ cases: rows.length, resumed, distinct: summary.uniqueTargetPaths, simultaneous: simultaneous.length, goals: goalHits.length,
    development: development.policy.id, selected: selected.map(row => ({ label: row.label, policy: row.policy.id, full: row.totalReturn,
      dd: row.maxDrawdown, first1500: row.first1500, final500: row.final500, recent: row.recent, commonState: row.commonState, counts: row.counts })) }, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
