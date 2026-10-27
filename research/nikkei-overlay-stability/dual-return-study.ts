import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atomic, root } from "./analyze";
import { currentRule } from "./sma-entry-study";
import { FallbackAccount, FallbackContext, causalFlatLow, fallbackBaseline, fallbackMetrics, type FallbackPolicy } from "./sma20-fallback";
import { wilderAtr } from "./regime-tuning";
import { drawdownDates } from "./sma20-fallback-audit";
import { SmaPositionOverlay, ENGULF_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import { runAllocationBacktest, type BacktestSettings } from "../../lib/analysis/backtest";
import { runStrategyCycleCloseBacktest, strategyCycleSignalDirection, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import type { MarketBar } from "../../lib/market/types";

type Confirmation = "none" | "ema2" | "ema3" | "full2" | "high2";
type Exit = "baseline" | "hold3" | "wma3" | "original3" | "ema2" | "trail2" | "trail3" | "atr15" | "age10";
export interface DualEntry { id: string; base: FallbackPolicy; confirmation: Confirmation }
export interface DualPolicy { id: string; entry: DualEntry; exit: Exit }
export function dualEntries(): DualEntry[] {
  const base = (rebound: number, decline = 0.05, hybrid = false): FallbackPolicy => ({ ...fallbackBaseline,
    id: "dual-entry", kind: hybrid ? "hybrid" : "fallback", rebound, decline });
  return [
    { id: "turn4", base: base(0.04, 0.05, true), confirmation: "none" },
    { id: "daily4", base: base(0.04), confirmation: "none" },
    { id: "daily4-ema2", base: base(0.04), confirmation: "ema2" },
    { id: "daily4-ema3", base: base(0.04), confirmation: "ema3" },
    { id: "daily4-full2", base: base(0.04), confirmation: "full2" },
    { id: "daily4-high2", base: base(0.04), confirmation: "high2" },
    { id: "daily3-ema2", base: base(0.03), confirmation: "ema2" },
    { id: "daily2d3-ema2", base: base(0.02, 0.03), confirmation: "ema2" },
    { id: "daily2d3-full2", base: base(0.02, 0.03), confirmation: "full2" },
    { id: "daily3d3-ema2", base: base(0.03, 0.03), confirmation: "ema2" },
  ];
}
export const dualBaseline: DualPolicy = { id: "baseline", entry: { id: "native", base: { ...fallbackBaseline }, confirmation: "none" }, exit: "baseline" };
export function dualMenu(): DualPolicy[] {
  const policies = [{ ...dualBaseline }];
  for (const entry of dualEntries())
    for (const exit of ["baseline", "hold3", "wma3", "original3", "ema2", "trail2", "trail3", "atr15", "age10"] as const)
      policies.push({ id: `${entry.id}-${exit}`, entry, exit });
  return policies;
}
export class DualContext extends FallbackContext {
  readonly atr;
  constructor(bars: MarketBar[]) { super(bars); this.atr = wilderAtr(bars); }
}
export function confirmationAllowed(context: DualContext, entry: DualEntry, index: number, flatStart: number): boolean {
  const confirmation = entry.confirmation;
  if (confirmation === "none") return true;
  if (confirmation === "high2") return index >= 2 && context.bars[index]!.close >
    Math.max(context.bars[index - 1]!.high, context.bars[index - 2]!.high);
  const count = confirmation === "ema3" ? 3 : 2;
  if (index - count + 1 < 0) return false;
  for (let cursor = index - count + 1; cursor <= index; cursor++) {
    if ((context.inner.features.get("EMA", 7).sign[cursor] ?? -1) <= 0) return false;
    if (confirmation === "full2") {
      const low = causalFlatLow(context.bars, cursor, flatStart);
      if ((context.inner.features.get("WMA", 7).sign[cursor] ?? -1) < 0 || low === null ||
        low.decline < entry.base.decline || low.rebound < entry.base.rebound) return false;
    }
  }
  return true;
}
export class DualAccount {
  readonly inner: FallbackAccount;
  tagged = false;
  entryClose = 0;
  entryIndex = -1;
  entryAtr = 0;
  peak = 0;
  belowEma = 0;
  private currentIndex = 0;
  constructor(readonly context: DualContext, readonly policy: DualPolicy, start: number, readonly enableFrom = start) {
    const view = new Proxy(policy.entry.base, { get: (target, property) => property === "kind" &&
      !confirmationAllowed(context, policy.entry, this.currentIndex, this.inner.flatStart) ? "baseline" : Reflect.get(target, property) });
    this.inner = new FallbackAccount(context, view, start, enableFrom);
  }
  step(index: number, signals: readonly StrategyCycleRecentSignal[]) {
    this.currentIndex = index;
    const raw = this.inner.account, before = raw.account.allocation, close = this.context.bars[index]!.close;
    const direction = strategyCycleSignalDirection(signals);
    if (before <= 1e-10 || direction === "increase") this.clearTag();
    Object.assign(raw.rule, currentRule, { quality: 0 });
    if (this.tagged && ["hold3", "wma3", "original3"].includes(this.policy.exit)) raw.rule.hold = 3;
    if (this.tagged && ["wma3", "original3"].includes(this.policy.exit)) raw.rule.threshold = Number.MAX_VALUE;
    if (this.tagged && this.policy.exit === "original3") raw.rule.exit = "none";
    const state = this.inner.step(index, signals);
    if (state.target <= 1e-10) this.clearTag();
    if (state.added) {
      this.tagged = true; this.entryClose = close; this.entryIndex = index;
      this.entryAtr = this.context.atr[index - 1] ?? 0; this.peak = close; this.belowEma = 0;
    }
    let localExit: string | null = null;
    if (this.tagged && raw.account.allocation > 1e-10) {
      this.peak = Math.max(this.peak, close);
      const average = this.context.inner.e7[index], below = average != null && close < average;
      this.belowEma = below ? this.belowEma + 1 : 0;
      if (before > 1e-10 && signals.length === 0 && !state.cut) {
        const exit = this.policy.exit, age = index - this.entryIndex;
        if (exit === "ema2" && this.belowEma >= 2) localExit = "ema-weakness2";
        if ((exit === "trail2" || exit === "trail3") && this.peak >= this.entryClose * 1.04 && below &&
          close <= this.peak * (exit === "trail2" ? 0.98 : 0.97)) localExit = exit;
        const priorAtr = this.context.atr[index - 1];
        if (exit === "atr15" && this.entryAtr > 0 && this.peak - this.entryClose >= this.entryAtr &&
          priorAtr != null && priorAtr > 0 && this.peak - close >= 1.5 * priorAtr && below) localExit = "atr-giveback15";
        if (exit === "age10" && age >= 10) localExit = "age10";
        if (localExit) {
          raw.account.allocation = 0; raw.account.pending = null; raw.lastSupplement = null;
          raw.enteredAt = null; raw.entryClose = 0; raw.recoveryTarget = null; raw.riskCut = false;
          raw.cutIndex = index; raw.blockedUntil = index + 6;
          this.inner.flatStart = index; this.inner.flatCause = "local-exit"; this.clearTag();
        }
      }
    }
    return { ...state, target: raw.account.allocation, tagged: this.tagged, localExit,
      pending: raw.account.pending, blockedUntil: raw.blockedUntil, episodeEntryIndex: raw.enteredAt };
  }
  private clearTag() {
    this.tagged = false; this.entryClose = 0; this.entryIndex = -1; this.entryAtr = 0; this.peak = 0; this.belowEma = 0;
  }
}
export function dualReplay(context: DualContext, decisions: ReadonlyMap<number, StrategyCycleRecentSignal[]>,
  start: number, policy: DualPolicy, detailed = false, enableFrom = start) {
  const account = new DualAccount(context, policy, start, enableFrom), targets = context.bars.map(() => 0), daily = [];
  const counts = { added: 0, localExits: 0, nativeStops: 0, recoveries: 0 };
  for (let index = start; index < context.bars.length; index++) {
    const signals = decisions.get(index) ?? [], state = account.step(index, signals);
    assert.ok(state.target >= 0 && state.target <= 1);
    if (state.added) assert.ok(state.before <= 1e-10 && signals.length === 0);
    targets[index] = state.target;
    counts.added += Number(state.added); counts.localExits += Number(state.localExit !== null);
    counts.nativeStops += Number(state.cut); counts.recoveries += Number(state.recovered);
    if (detailed) daily.push({ time: context.bars[index]!.time, close: context.bars[index]!.close, ...state,
      signals: signals.length, direction: strategyCycleSignalDirection(signals) });
  }
  return { targets, daily, counts };
}
type DualRow = ReturnType<typeof fallbackMetrics> & { policy: DualPolicy; counts: ReturnType<typeof dualReplay>["counts"]; targetHash: string };
export function validateDualProgress(saved: { sourceHash: string; implementationHash: string; rows: { policy: DualPolicy }[] },
  sourceHash: string, implementationHash: string, menu: DualPolicy[]) {
  assert.equal(saved.sourceHash, sourceHash, "Dual-return source mismatch; preserve prior state");
  assert.equal(saved.implementationHash, implementationHash, "Dual-return implementation mismatch; preserve prior state");
  assert.ok(Array.isArray(saved.rows) && saved.rows.length <= menu.length);
  saved.rows.forEach((row, index) => assert.deepEqual(row.policy, menu[index], "Dual-return order/configuration mismatch"));
}
export function meetsDualGoal(row: Pick<DualRow, "totalReturn" | "final500">, baseline: Pick<DualRow, "totalReturn" | "final500">) {
  return row.totalReturn > baseline.totalReturn + 1e-9 && row.final500.totalReturn > baseline.final500.totalReturn + 1e-9;
}
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
async function bounded(path: string) { assert.ok((await stat(path)).size <= 16 * 1024 ** 2); return readFile(path, "utf8"); }
async function atomicText(path: string, value: string) {
  await writeFile(`${path}.tmp`, value); await replaceFileAtomically(`${path}.tmp`, path);
}
async function main() {
  const source = join(root, "data/full-screen-6-15"), output = join(root, "output/dual-return");
  const input = JSON.parse(await bounded(join(source, "input.json"))) as {
    bars: MarketBar[]; barsHash: string; accessedAt: string; batch: string; settings: BacktestSettings; snapshots: { decisionIndex: number }[];
  };
  const saved = JSON.parse(await bounded(join(source, "signals.json"))) as {
    sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[];
  };
  const sourceHash = sha(JSON.stringify(input)); assert.equal(saved.sourceHash, sourceHash);
  assert.equal(sha(JSON.stringify(input.bars)), input.barsHash);
  assert.ok(input.bars.length <= 10000 && saved.rows.length <= 2048); assert.equal(saved.rows.length, input.snapshots.length);
  const decisions = new Map(saved.rows.map((row, offset) => {
    assert.equal(row.index, input.snapshots[offset]!.decisionIndex); return [row.index, row.signals] as const;
  }));
  const implementationHash = sha((await Promise.all(["DUAL_RETURN_DESIGN.md", "dual-return-study.ts", "sma20-fallback.ts",
    "sma20-fallback-audit.ts", "sma-entry-study.ts", "v-recovery-study.ts", "regime-tuning.ts", "analyze.ts",
    "../nikkei-cycle-rallies/ma-type.ts", "../../lib/analysis/sma-position-overlay.ts", "../../lib/analysis/indicators.ts",
    "../../lib/analysis/strategy-cycle-validation.ts", "../../lib/analysis/backtest.ts"].map(path => readFile(join(root, path), "utf8")))).join("\n"));
  const { bars, settings } = input, start = bars.length - 2000, context = new DualContext(bars);
  const cutoff = bars.findIndex(bar => bar.time === "2026-07-21"), boundary = cutoff - start + 1;
  assert.equal(boundary, 1936); assert.equal(bars[start + 1500]!.time, "2024-10-04");
  const menu = dualMenu(); assert.equal(menu.length, 91);
  const run = (policy: DualPolicy, detailed = false, enableFrom = start) => {
    const path = dualReplay(context, decisions, start, policy, detailed, enableFrom);
    const result = runStrategyCycleCloseBacktest(bars, path.targets, settings);
    return { ...path, result, row: { policy, counts: path.counts, targetHash: sha(JSON.stringify(path.targets)),
      ...fallbackMetrics(result, settings.initialCash, boundary) } };
  };
  const baseline = run(dualBaseline), production = new SmaPositionOverlay(bars, DEFAULT_POSITION_OVERLAY_OPTIONS);
  for (let index = start; index < bars.length; index++) {
    const signals = decisions.get(index) ?? [], direction = strategyCycleSignalDirection(signals);
    if (direction) production.request(direction, signals.at(-1)!.targetAllocation, index);
    assert.equal(baseline.targets[index], production.close(index, signals.length > 0));
  }
  const prior = JSON.parse(await bounded(join(root, "output/sma20-fallback/summary.json")));
  assert.equal(prior.sourceHash, sourceHash);
  for (const [id, previousId] of [["turn4-baseline", "hybrid-x4"], ["daily4-baseline", "fallback-below-trend-x4"]]) {
    const outcome = run(menu.find(policy => policy.id === id)!);
    assert.equal(outcome.row.targetHash, prior.rows.find((row: { policy: { id: string } }) => row.policy.id === previousId).targetHash);
  }
  const checkpoint = join(root, "data/dual-return/grid.json"); let rows: DualRow[] = [];
  try {
    const stored = JSON.parse(await bounded(checkpoint)); validateDualProgress(stored, sourceHash, implementationHash, menu); rows = stored.rows;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const resumed = rows.length; let stopping = false;
  process.on("SIGINT", () => { stopping = true; }); process.on("SIGTERM", () => { stopping = true; });
  for (let offset = rows.length; offset < menu.length; offset++) {
    if (stopping || process.memoryUsage().rss > 1.5 * 1024 ** 3) {
      await atomic(checkpoint, { sourceHash, implementationHash, rows }); throw new Error("Stopped safely; rerun to resume committed dual-return cases");
    }
    rows.push(run(menu[offset]!).row);
    if (rows.length % 10 === 0 || rows.length === menu.length) {
      await atomic(checkpoint, { sourceHash, implementationHash, rows }); console.log(`Completed ${rows.length}/${menu.length}`);
      await new Promise<void>(done => setImmediate(done));
    }
  }
  assert.deepEqual(rows[0], baseline.row);
  const ordinal = new Map(menu.map((policy, index) => [policy.id, index]));
  const tie = (left: DualRow, right: DualRow) => ordinal.get(left.policy.id)! - ordinal.get(right.policy.id)!;
  const goals = rows.filter(row => meetsDualGoal(row, baseline.row));
  const noWorse = (row: DualRow) => row.maxDrawdown >= baseline.row.maxDrawdown - 1e-9;
  const gain = (row: DualRow) => Math.min(Math.log((100 + row.totalReturn) / (100 + baseline.row.totalReturn)),
    Math.log((100 + row.final500.totalReturn) / (100 + baseline.row.final500.totalReturn)));
  const ranked = [...goals].sort((left, right) => Number(noWorse(right)) - Number(noWorse(left)) || gain(right) - gain(left) || tie(left, right));
  const development = rows.filter(row => row.first1500.maxDrawdown >= baseline.row.first1500.maxDrawdown - 1e-9)
    .sort((left, right) => right.first1500.totalReturn - left.first1500.totalReturn || tie(left, right))[0]!;
  const fullBest = [...goals].sort((left, right) => right.totalReturn - left.totalReturn || tie(left, right))[0];
  const recentBest = [...goals].sort((left, right) => right.recent.totalReturn - left.recent.totalReturn || tie(left, right))[0];
  const selections = [
    ["baseline", rows[0]!], ["primary", rows.find(row => row.policy.id === "daily4-ema2-baseline")!],
    ["development", development], ["goal", ranked[0] ?? rows[0]!], ["goal-full", fullBest ?? rows[0]!],
    ["goal-dd", ranked.find(noWorse) ?? rows[0]!], ["goal-recent", recentBest ?? rows[0]!],
  ] as const;
  const selected = [];
  for (const [label, row] of selections) {
    const outcome = run(row.policy, true);
    assert.deepEqual(outcome.row, row);
    const compact = runStrategyCycleCloseBacktest(bars, outcome.targets, { ...settings, summaryOnly: true });
    assert.equal(outcome.result.totalReturn, compact.totalReturn); assert.equal(outcome.result.maxDrawdown, compact.maxDrawdown);
    const twice = runStrategyCycleCloseBacktest(bars, outcome.targets, { ...settings,
      commissionRate: settings.commissionRate * 2, slippageRate: settings.slippageRate * 2 });
    const next = runAllocationBacktest(bars, outcome.targets, { ...settings, executionPolicy: "next-open" });
    const common = run(row.policy, false, cutoff + 1);
    assert.deepEqual(common.targets.slice(0, cutoff + 1), baseline.targets.slice(0, cutoff + 1));
    const detail = { label, ...row, doubleCost: fallbackMetrics(twice, settings.initialCash, boundary),
      nextOpen: fallbackMetrics(next, settings.initialCash, boundary), commonState: common.row,
      fullDrawdown: drawdownDates(outcome.result, settings.initialCash), recentDrawdown: drawdownDates(outcome.result, settings.initialCash, boundary),
      recentEvents: outcome.daily.filter(day => day.time > "2026-07-21" && (day.entered || day.localExit !== null || day.cut)),
      localExits: outcome.daily.filter(day => day.localExit !== null).map(day => ({ time: day.time, reason: day.localExit, close: day.close })) };
    selected.push(detail);
    await atomic(join(output, `${label}.json`), { sourceHash, implementationHash, ...detail, targets: outcome.targets,
      result: outcome.result, daily: outcome.daily });
  }
  const summary = { sourceHash, implementationHash, signalsHash: sha(JSON.stringify(saved)), menuHash: sha(JSON.stringify(menu)),
    generatedAt: new Date().toISOString(), sourceAccessedAt: input.accessedAt, batch: input.batch,
    start: bars[start]!.time, end: bars.at(-1)!.time, final500Start: bars[start + 1500]!.time, settings,
    candidates: rows.length, resumed, uniquePaths: new Set(rows.map(row => row.targetHash)).size,
    goals: goals.length, noWorseDdGoals: goals.filter(noWorse).length,
    goalIds: ranked.map(row => row.policy.id), development: development.policy.id, selected, rows,
    verification: { baselineProductionTargets: 2000, referenceHashes: 2, commonPrefix: boundary },
    limitation: "Hard dual-return acceptance applies only to this historical sample. Repeatedly explored selections and final500 are not untouched validation; no future return guarantee. One actual inherited account, original native priority, production unchanged." };
  await atomic(join(output, "summary.json"), summary);
  await atomicText(join(output, "DESIGN.md"), await readFile(join(root, "DUAL_RETURN_DESIGN.md"), "utf8"));
  const table = selected.map(row => `| ${row.label} | ${row.policy.id} | ${row.totalReturn.toFixed(3)} | ${row.final500.totalReturn.toFixed(3)} | ${row.maxDrawdown.toFixed(3)} | ${row.recent.totalReturn.toFixed(3)} | ${row.recent.maxDrawdown.toFixed(3)} | ${row.counts.added}/${row.counts.localExits} |`).join("\n");
  const sensitivities = selected.map(row => `| ${row.label} | ${row.doubleCost.totalReturn.toFixed(3)} | ${row.doubleCost.final500.totalReturn.toFixed(3)} | ${row.nextOpen.totalReturn.toFixed(3)} | ${row.nextOpen.final500.totalReturn.toFixed(3)} | ${row.commonState.recent.totalReturn.toFixed(3)} |`).join("\n");
  const report = `# Dual-return constrained rebound study\n\n${summary.start}..${summary.end}, final500 begins${summary.final500Start}. Original costs/close proxy and identical boundaries. ${rows.length} fixed cases,${summary.uniquePaths} distinct targets. Hard goal: full and final500 returns both strictly above baseline. Goal cases:${goals.length}; no-worse-full-DD subset:${summary.noWorseDdGoals}. Resumed:${resumed}.\n\n| Selection | Policy | Full % | Final500 % | Full DD % | Recent % | Recent DD % | Added/local exits |\n|---|---|---:|---:|---:|---:|---:|---:|\n${table}\n\nFirst1500-only choice:${development.policy.id}. Goal recommendation uses no-worse DD first, then minimum full/final500 relative-wealth gain, not the largest recent profit. Read DESIGN.md for exact entrance confirmation, scoped exits, cooldown and native priority.\n\n| Selection | Double-cost full % | Double-cost final500 % | Next-open full % | Next-open final500 % | Common-state recent % |\n|---|---:|---:|---:|---:|---:|\n${sensitivities}\n\nCompare each sensitivity with its baseline row, not original-cost performance. Full ledgers include all events, actual fills, tags, targets, equity and drawdown dates. summary.json retains every scalar case, including failures. Common-state retains1936 baseline targets throughJuly21 and is attribution only.\n\n${summary.limitation}\n`;
  await atomicText(join(output, "REPORT.md"), report);
  console.log(JSON.stringify({ goals: summary.goals, noWorseDdGoals: summary.noWorseDdGoals, resumed,
    selected: selected.map(row => ({ label: row.label, id: row.policy.id, full: row.totalReturn,
      final500: row.final500.totalReturn, dd: row.maxDrawdown, recent: row.recent.totalReturn, counts: row.counts })) }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
