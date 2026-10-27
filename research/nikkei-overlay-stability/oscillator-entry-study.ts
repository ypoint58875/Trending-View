import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atomic, root } from "./analyze";
import { currentRule } from "./sma-entry-study";
import { ResearchAccount } from "./v-recovery-study";
import { FallbackContext, fallbackMetrics } from "./sma20-fallback";
import { drawdownDates } from "./sma20-fallback-audit";
import { rsi, bollingerBands } from "../../lib/analysis/indicators";
import { SmaPositionOverlay, ENGULF_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import { runAllocationBacktest, type BacktestSettings } from "../../lib/analysis/backtest";
import { runStrategyCycleCloseBacktest, strategyCycleSignalDirection, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import type { MarketBar } from "../../lib/market/types";

type Profile = "off" | "rsi30-30" | "rsi30-40" | "rsi35-40" | "rsi40-45" | "bb-close0" | "bb-close25" | "bb-close50" | "bb-low25" | "both" | "either";
export interface OscillatorPolicy { id: string; profile: Profile; scope: "below" | "any"; confirmation: "wma" | "ema1" | "ema3" }
export const oscillatorBaseline: OscillatorPolicy = { id: "baseline", profile: "off", scope: "below", confirmation: "ema1" };
export function oscillatorMenu(): OscillatorPolicy[] {
  const rows = [{ ...oscillatorBaseline }];
  for (const profile of ["rsi30-30", "rsi30-40", "rsi35-40", "rsi40-45", "bb-close0", "bb-close25", "bb-close50", "bb-low25", "both", "either"] as const)
    for (const scope of ["below", "any"] as const) for (const confirmation of ["wma", "ema1", "ema3"] as const)
      rows.push({ id: `${profile}-${scope}-${confirmation}`, profile, scope, confirmation });
  return rows;
}
export class OscillatorContext extends FallbackContext {
  readonly rsi14;
  readonly bands;
  constructor(bars: MarketBar[]) {
    super(bars); const closes = bars.map(bar => bar.close);
    this.rsi14 = rsi(closes, 14); this.bands = bollingerBands(closes, 20, 2);
  }
}
export function oscillatorEvidence(context: OscillatorContext, index: number, flatStart: number) {
  const from = Math.max(0, flatStart, index - 10);
  let minimumRsi: number | null = null, closeBreach = false, lowTouch = false;
  for (let cursor = from; cursor < index; cursor++) {
    const value = context.rsi14[cursor], lower = context.bands.lower[cursor];
    if (value != null && Number.isFinite(value)) minimumRsi = minimumRsi === null ? value : Math.min(minimumRsi, value);
    if (lower != null && Number.isFinite(lower)) {
      closeBreach ||= context.bars[cursor]!.close <= lower;
      lowTouch ||= context.bars[cursor]!.low <= lower;
    }
  }
  const current = context.rsi14[index] ?? null, previous = context.rsi14[index - 1] ?? null;
  const lower = context.bands.lower[index], upper = context.bands.upper[index];
  const percentB = lower != null && upper != null && Number.isFinite(lower) && Number.isFinite(upper) && upper > lower ?
    (context.bars[index]!.close - lower) / (upper - lower) : null;
  return { currentRsi: current, priorRsi: previous, minimumRsi, closeBreach, lowTouch, percentB,
    risingRsi: current !== null && previous !== null && Number.isFinite(current) && Number.isFinite(previous) && current > previous,
    risingClose: index > 0 && context.bars[index]!.close > context.bars[index - 1]!.close };
}
export function oscillatorSignal(profile: Profile, evidence: ReturnType<typeof oscillatorEvidence>): boolean {
  const rsiReady = (low: number, reclaim: number) => evidence.risingRsi && evidence.minimumRsi !== null &&
    evidence.minimumRsi <= low && evidence.currentRsi !== null && evidence.currentRsi >= reclaim;
  const bandReady = (level: number, intraday = false) => evidence.risingClose && (intraday ? evidence.lowTouch : evidence.closeBreach) &&
    evidence.percentB !== null && evidence.percentB >= level;
  switch (profile) {
    case "rsi30-30": return rsiReady(30, 30);
    case "rsi30-40": return rsiReady(30, 40);
    case "rsi35-40": return rsiReady(35, 40);
    case "rsi40-45": return rsiReady(40, 45);
    case "bb-close0": return bandReady(0);
    case "bb-close25": return bandReady(0.25);
    case "bb-close50": return bandReady(0.5);
    case "bb-low25": return bandReady(0.25, true);
    case "both": return rsiReady(35, 40) && bandReady(0.25);
    case "either": return rsiReady(35, 40) || bandReady(0.25);
    default: return false;
  }
}
export class OscillatorAccount {
  readonly account: ResearchAccount;
  private readonly turns: boolean[];
  flatStart: number;
  constructor(readonly context: OscillatorContext, readonly policy: OscillatorPolicy, start: number,
    readonly enableFrom = start, readonly allowExtra: (index: number) => boolean = () => true) {
    this.flatStart = start; this.turns = context.bars.map(() => false);
    const features = new Proxy(context.inner.features, { get: (target, property) => {
      if (property === "get") return (type: "EMA" | "SMA" | "WMA", period: number) => {
        const feature = target.get(type, period);
        return type === "EMA" && period === 7 ? { ...feature, turns: this.turns } : feature;
      };
      return Reflect.get(target, property);
    } });
    const view = new Proxy(context.inner, { get: (target, property) => property === "features" ? features : Reflect.get(target, property) });
    this.account = new ResearchAccount(view, { ...currentRule, quality: 0 });
  }
  step(index: number, signals: readonly StrategyCycleRecentSignal[]) {
    const context = this.context, inner = context.inner, policy = this.policy, raw = this.account;
    const before = raw.account.allocation, close = context.bars[index]!.close;
    const entry = inner.features.get("EMA", 7), gate = inner.features.get("WMA", 7);
    const average = inner.averages.get(20)![index], aboveSma20 = average != null && close > average;
    const positiveEma = (entry.sign[index] ?? -1) > 0, wmaAllowed = (gate.sign[index] ?? -1) >= 0;
    const evidence = oscillatorEvidence(context, index, this.flatStart), signal = oscillatorSignal(policy.profile, evidence);
    const recovery = raw.recoveryTarget !== null && index > raw.cutIndex && index >= raw.blockedUntil && positiveEma &&
      (gate.sign[index] ?? -1) > 0 && inner.e7[index] != null && close > inner.e7[index]!;
    const native = (entry.turns[index] && aboveSma20 && wmaAllowed) || inner.vSignal(index, currentRule) || recovery;
    const emaCount = policy.confirmation === "ema3" ? 3 : policy.confirmation === "ema1" ? 1 : 0;
    let confirmed = index >= emaCount - 1;
    for (let offset = 0; offset < emaCount; offset++) confirmed &&= (entry.sign[index - offset] ?? -1) > 0;
    const extra = policy.profile !== "off" && index >= this.enableFrom && this.allowExtra(index) && before <= 1e-10 &&
      signals.length === 0 && raw.account.pending === null && index >= raw.blockedUntil && !native && wmaAllowed && confirmed && signal &&
      (policy.scope === "any" || (average != null && close <= average));
    this.turns[index] = (entry.turns[index] && aboveSma20) || extra;
    const state = raw.step(index, signals), entered = before <= 1e-10 && state.target > 1e-10;
    const added = entered && extra && !state.vBuy && !state.recovered;
    const kind = !entered ? null : added ? "oscillator" : state.recovered ? "native-recovery" : state.vBuy ? "native-engulf" :
      signals.length > 0 ? "original" : "native-turn";
    if (before > 1e-10 && state.target <= 1e-10) this.flatStart = index;
    return { before, ...state, entered, added, kind, aboveSma20, positiveEma, wmaAllowed, confirmed, signal,
      evidence, blockedUntil: raw.blockedUntil, pending: raw.account.pending };
  }
}
export function oscillatorReplay(context: OscillatorContext, decisions: ReadonlyMap<number, StrategyCycleRecentSignal[]>,
  start: number, policy: OscillatorPolicy, detailed = false, enableFrom = start, allowExtra: (index: number) => boolean = () => true) {
  const account = new OscillatorAccount(context, policy, start, enableFrom, allowExtra), targets = context.bars.map(() => 0), daily = [];
  const counts = { added: 0, nativeStops: 0, recoveries: 0 };
  for (let index = start; index < context.bars.length; index++) {
    const signals = decisions.get(index) ?? [], state = account.step(index, signals);
    assert.ok(state.target >= 0 && state.target <= 1);
    if (state.added) assert.ok(state.before <= 1e-10 && signals.length === 0);
    targets[index] = state.target; counts.added += Number(state.added); counts.nativeStops += Number(state.cut); counts.recoveries += Number(state.recovered);
    if (detailed) daily.push({ index, time: context.bars[index]!.time, close: context.bars[index]!.close, ...state,
      signals: signals.length, direction: strategyCycleSignalDirection(signals) });
  }
  return { targets, daily, counts };
}
export function validateOscillatorProgress(saved: { sourceHash: string; implementationHash: string; rows: { policy: OscillatorPolicy }[] },
  sourceHash: string, implementationHash: string, menu: OscillatorPolicy[]) {
  assert.equal(saved.sourceHash, sourceHash, "Oscillator source mismatch; preserve earlier state");
  assert.equal(saved.implementationHash, implementationHash, "Oscillator implementation mismatch; preserve earlier state");
  assert.ok(Array.isArray(saved.rows) && saved.rows.length <= menu.length);
  saved.rows.forEach((row, index) => assert.deepEqual(row.policy, menu[index], "Oscillator order/configuration mismatch"));
}
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
async function bounded(path: string) { assert.ok((await stat(path)).size <= 16 * 1024 ** 2); return readFile(path, "utf8"); }
async function main() {
  const source = join(root, "data/full-screen-6-15"), output = join(root, "output/oscillator-entry");
  const input = JSON.parse(await bounded(join(source, "input.json"))) as {
    bars: MarketBar[]; barsHash: string; accessedAt: string; settings: BacktestSettings; snapshots: { decisionIndex: number }[];
  };
  const saved = JSON.parse(await bounded(join(source, "signals.json"))) as {
    sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[];
  };
  const sourceHash = sha(JSON.stringify(input)); assert.equal(saved.sourceHash, sourceHash); assert.equal(sha(JSON.stringify(input.bars)), input.barsHash);
  assert.ok(input.bars.length <= 10000 && saved.rows.length <= 2048); assert.equal(saved.rows.length, input.snapshots.length);
  const decisions = new Map(saved.rows.map((row, offset) => {
    assert.equal(row.index, input.snapshots[offset]!.decisionIndex); return [row.index, row.signals] as const;
  }));
  const implementationHash = sha((await Promise.all(["OSCILLATOR_ENTRY_DESIGN.md", "oscillator-entry-study.ts", "sma20-fallback.ts",
    "sma20-fallback-audit.ts", "sma-entry-study.ts", "v-recovery-study.ts", "analyze.ts", "../nikkei-cycle-rallies/ma-type.ts",
    "../../lib/analysis/indicators.ts", "../../lib/analysis/sma-position-overlay.ts", "../../lib/analysis/strategy-cycle-validation.ts",
    "../../lib/analysis/backtest.ts"].map(path => readFile(join(root, path), "utf8")))).join("\n"));
  const { bars, settings } = input, start = bars.length - 2000, context = new OscillatorContext(bars);
  const cutoff = bars.findIndex(bar => bar.time === "2026-07-21"), boundary = cutoff - start + 1;
  assert.equal(boundary, 1936); assert.equal(bars[start + 1500]!.time, "2024-10-04");
  const menu = oscillatorMenu(); assert.equal(menu.length, 61);
  const run = (policy: OscillatorPolicy, detailed = false, enableFrom = start, allowExtra: (index: number) => boolean = () => true) => {
    const path = oscillatorReplay(context, decisions, start, policy, detailed, enableFrom, allowExtra);
    const result = runStrategyCycleCloseBacktest(bars, path.targets, settings);
    return { ...path, result, row: { policy, counts: path.counts, targetHash: sha(JSON.stringify(path.targets)),
      ...fallbackMetrics(result, settings.initialCash, boundary) } };
  };
  const baseline = run(oscillatorBaseline, true), production = new SmaPositionOverlay(bars, DEFAULT_POSITION_OVERLAY_OPTIONS);
  for (let index = start; index < bars.length; index++) {
    const signals = decisions.get(index) ?? [], direction = strategyCycleSignalDirection(signals);
    if (direction) production.request(direction, signals.at(-1)!.targetAllocation, index);
    assert.equal(baseline.targets[index], production.close(index, signals.length > 0));
  }
  const checkpoint = join(root, "data/oscillator-entry/grid.json");
  type Row = typeof baseline.row;
  let rows: Row[] = [];
  try { const stored = JSON.parse(await bounded(checkpoint)); validateOscillatorProgress(stored, sourceHash, implementationHash, menu); rows = stored.rows; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const resumed = rows.length; let stopping = false;
  process.on("SIGINT", () => { stopping = true; }); process.on("SIGTERM", () => { stopping = true; });
  const guard = async () => {
    if (stopping || process.memoryUsage().rss > 1.5 * 1024 ** 3) {
      await atomic(checkpoint, { sourceHash, implementationHash, rows }); throw new Error("Stopped safely; rerun oscillator research to resume");
    }
  };
  for (let offset = rows.length; offset < menu.length; offset++) {
    await guard(); rows.push(run(menu[offset]!).row);
    if (rows.length % 10 === 0 || rows.length === menu.length) {
      await atomic(checkpoint, { sourceHash, implementationHash, rows }); console.log(`Oscillators ${rows.length}/${menu.length}`);
      await new Promise<void>(done => setImmediate(done));
    }
  }
  assert.deepEqual(rows[0], baseline.row);
  const ordinal = new Map(menu.map((policy, index) => [policy.id, index]));
  const tie = (left: Row, right: Row) => ordinal.get(left.policy.id)! - ordinal.get(right.policy.id)!;
  const goal = (row: Row) => row.totalReturn > baseline.row.totalReturn + 1e-9 && row.final500.totalReturn > baseline.row.final500.totalReturn + 1e-9;
  const noWorse = (row: Row) => row.maxDrawdown >= baseline.row.maxDrawdown - 1e-9;
  const gain = (row: Row) => Math.min(Math.log((100 + row.totalReturn) / (100 + baseline.row.totalReturn)),
    Math.log((100 + row.final500.totalReturn) / (100 + baseline.row.final500.totalReturn)));
  const order = (left: Row, right: Row) => Number(noWorse(right)) - Number(noWorse(left)) || gain(right) - gain(left) || tie(left, right);
  const goals = rows.filter(goal).sort(order), allThree = goals.filter(row => row.recent.totalReturn > baseline.row.recent.totalReturn + 1e-9);
  const family = (name: "rsi" | "bb" | "combined") => {
    const members = rows.filter(row => name === "combined" ? ["both", "either"].includes(row.policy.profile) : row.policy.profile.startsWith(name));
    const passing = members.filter(goal).sort(order);
    return passing[0] ?? members.sort((left, right) => right.totalReturn - left.totalReturn || tie(left, right))[0]!;
  };
  const development = rows.filter(row => row.first1500.maxDrawdown >= baseline.row.first1500.maxDrawdown - 1e-9)
    .sort((left, right) => right.first1500.totalReturn - left.first1500.totalReturn || tie(left, right))[0]!;
  const recentBest = [...goals].sort((left, right) => right.recent.totalReturn - left.recent.totalReturn || order(left, right))[0];
  const selections = [["baseline", rows[0]!], ["goal", goals[0] ?? rows[0]!], ["rsi", family("rsi")], ["bands", family("bb")],
    ["combined", family("combined")], ["development", development], ["recent-goal", recentBest ?? rows[0]!]] as const;
  const selected = [];
  for (const [label, row] of selections) {
    await guard(); const outcome = run(row.policy, true); assert.deepEqual(outcome.row, row);
    const compact = runStrategyCycleCloseBacktest(bars, outcome.targets, { ...settings, summaryOnly: true });
    assert.equal(outcome.result.totalReturn, compact.totalReturn); assert.equal(outcome.result.maxDrawdown, compact.maxDrawdown);
    const twice = runStrategyCycleCloseBacktest(bars, outcome.targets, { ...settings,
      commissionRate: settings.commissionRate * 2, slippageRate: settings.slippageRate * 2 });
    const next = runAllocationBacktest(bars, outcome.targets, { ...settings, executionPolicy: "next-open" });
    const common = run(row.policy, false, cutoff + 1);
    assert.deepEqual(common.targets.slice(0, cutoff + 1), baseline.targets.slice(0, cutoff + 1));
    const detail = { label, ...row, passesGoal: goal(row), doubleCost: fallbackMetrics(twice, settings.initialCash, boundary),
      nextOpen: fallbackMetrics(next, settings.initialCash, boundary), commonState: common.row,
      fullDrawdown: drawdownDates(outcome.result, settings.initialCash), recentDrawdown: drawdownDates(outcome.result, settings.initialCash, boundary),
      added: outcome.daily.filter(day => day.added), recentEvents: outcome.daily.filter(day => day.time > "2026-07-21" && (day.entered || day.cut)) };
    selected.push(detail);
    await atomic(join(output, `${label}.json`), { sourceHash, implementationHash, ...detail, targets: outcome.targets, result: outcome.result, daily: outcome.daily });
  }
  const winner = selected.find(row => row.label === "goal")!, path = run(winner.policy, true), omissions = [];
  for (let offset = 0; offset < path.daily.length; offset++) {
    const day = path.daily[offset]!; if (!day.added) continue;
    await guard(); let end = offset + 1;
    while (end < path.daily.length && path.daily[end]!.target > 1e-10 && path.daily[end]!.direction !== "increase") end++;
    end = Math.min(end, path.daily.length - 1);
    const fromIndex = day.index, endIndex = path.daily[end]!.index;
    const outcome = run(winner.policy, false, start, index => index < fromIndex || index > endIndex);
    assert.deepEqual(outcome.targets.slice(0, fromIndex), path.targets.slice(0, fromIndex));
    omissions.push({ entry: day.time, through: path.daily[end]!.time, ...outcome.row });
  }
  const summary = { sourceHash, implementationHash, menuHash: sha(JSON.stringify(menu)), signalsHash: sha(JSON.stringify(saved)),
    generatedAt: new Date().toISOString(), sourceAccessedAt: input.accessedAt, start: bars[start]!.time, end: bars.at(-1)!.time,
    final500Start: bars[start + 1500]!.time, settings, resumed, candidates: rows.length,
    uniquePaths: new Set(rows.map(row => row.targetHash)).size, goals: goals.length, goalPaths: new Set(goals.map(row => row.targetHash)).size,
    noWorseDdGoals: goals.filter(noWorse).length, allThree: allThree.length,
    abovePriorFrontier: goals.filter(row => row.totalReturn > 435.7026447570793 + 1e-9).length,
    primaries: ["rsi30-40-below-ema1", "bb-close25-below-ema1"].map(id => rows.find(row => row.policy.id === id)),
    selected, omissions, rows,
    recentBaselineDiagnostics: baseline.daily.filter(day => day.time > "2026-07-21" && day.before <= 1e-10 &&
      (context.inner.features.get("EMA", 7).turns[day.index] || day.entered)),
    limitation: "Previously explored frozen history; RSI/Bollinger parameters and repeated final500 screening are not independent validation or future guarantees. Keep native actual-account timing, exits and risk priority. Production unchanged." };
  await atomic(join(output, "summary.json"), summary);
  const table = selected.map(row => `| ${row.label} | ${row.policy.id} | ${row.passesGoal} | ${row.totalReturn.toFixed(3)} | ${row.final500.totalReturn.toFixed(3)} | ${row.maxDrawdown.toFixed(3)} | ${row.recent.totalReturn.toFixed(3)} | ${row.recent.maxDrawdown.toFixed(3)} | ${row.counts.added} |`).join("\n");
  const costs = selected.map(row => `| ${row.label} | ${row.doubleCost.totalReturn.toFixed(3)} | ${row.doubleCost.final500.totalReturn.toFixed(3)} | ${row.nextOpen.totalReturn.toFixed(3)} | ${row.nextOpen.final500.totalReturn.toFixed(3)} | ${row.commonState.recent.totalReturn.toFixed(3)} |`).join("\n");
  const report = `# RSI and Bollinger flat-entry alternatives\n\n${summary.start}..${summary.end}; final500 begins${summary.final500Start}. ${rows.length} predeclared cases,${summary.uniquePaths} distinct target paths. Dual-goal cases:${summary.goals} (${summary.goalPaths} paths); no-worse-full-DD:${summary.noWorseDdGoals}; full/final500/recent improvements:${summary.allThree}. Dual goals above prior435.703% full frontier:${summary.abovePriorFrontier}. Resumed:${resumed}.\n\n| Selection | Policy | Dual goal | Full % | Final500 % | Full DD % | PostJuly21 % | Recent DD % | Added |\n|---|---|---|---:|---:|---:|---:|---:|---:|\n${table}\n\nFamily selections prefer passing dual-goal cases; if none pass, their best full-return failure is explicitly labelled false. No profitable replacement is implied by a family winner. First1500-only selection:${development.policy.id}. Primaries remain rsi30-40-below-ema1 and bb-close25-below-ema1, not whichever hindsight choice wins.\n\n## Costs and execution\n\n| Selection | Double-cost full % | Double-cost final500 % | Next-open full % | Next-open final500 % | Common-state recent % |\n|---|---:|---:|---:|---:|---:|\n${costs}\n\nCompare with each corresponding baseline. Summary retains all cases, explicit profiles, extra entries, RSI/percentB/prior evidence, original native priority, drawdown dates and actual-account extra-episode omission counterfactuals. Omissions are evaluator-only/nonadditive, not live date rules. Read OSCILLATOR_ENTRY_DESIGN.md for exact signals and zero-position scope. Original sell/hold7/stop/wait/recovery rules are unchanged.\n\n${summary.limitation}\n`;
  await writeFile(join(output, "REPORT.md.tmp"), report); await replaceFileAtomically(join(output, "REPORT.md.tmp"), join(output, "REPORT.md"));
  console.log(JSON.stringify({ goals: summary.goals, goalPaths: summary.goalPaths, noWorseDdGoals: summary.noWorseDdGoals,
    allThree: summary.allThree, abovePriorFrontier: summary.abovePriorFrontier, resumed,
    selected: selected.map(row => ({ label: row.label, id: row.policy.id, passed: row.passesGoal, full: row.totalReturn,
      final500: row.final500.totalReturn, dd: row.maxDrawdown, recent: row.recent.totalReturn, added: row.counts.added })) }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
