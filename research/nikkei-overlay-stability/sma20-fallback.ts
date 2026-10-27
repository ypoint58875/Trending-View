import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atomic, pathMetrics, root } from "./analyze";
import { currentRule, entryContext } from "./sma-entry-study";
import { ResearchAccount, type Context } from "./v-recovery-study";
import { ema } from "../../lib/analysis/indicators";
import { SmaPositionOverlay, ENGULF_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import { runAllocationBacktest, type AllocationBacktestResult, type BacktestSettings } from "../../lib/analysis/backtest";
import { runStrategyCycleCloseBacktest, strategyCycleSignalDirection, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import type { MarketBar } from "../../lib/market/types";

export interface FallbackPolicy {
  id: string;
  kind: "baseline" | "replacement" | "hybrid" | "fallback";
  gate: "sma20" | "ema20" | "ema14" | "band" | "none";
  rebound: number;
  decline: number;
  scope: "below" | "any";
  confirmation: "trend" | "high";
}
export const fallbackBaseline: FallbackPolicy = {
  id: "baseline", kind: "baseline", gate: "sma20", rebound: 0, decline: 0.05, scope: "below", confirmation: "trend",
};
export function fallbackMenu(): FallbackPolicy[] {
  const policies = [{ ...fallbackBaseline }];
  for (const gate of ["ema20", "ema14", "band", "none"] as const)
    policies.push({ ...fallbackBaseline, id: `replace-${gate}`, kind: "replacement", gate });
  for (const rebound of [0.02, 0.03, 0.04])
    policies.push({ ...fallbackBaseline, id: `hybrid-x${rebound * 100}`, kind: "hybrid", rebound });
  for (const scope of ["below", "any"] as const) for (const confirmation of ["trend", "high"] as const)
    for (const rebound of [0.02, 0.03, 0.04])
      policies.push({ ...fallbackBaseline, id: `fallback-${scope}-${confirmation}-x${rebound * 100}`,
        kind: "fallback", scope, confirmation, rebound });
  return policies;
}
export function causalFlatLow(bars: MarketBar[], index: number, flatStart: number) {
  const from = Math.max(0, flatStart, index - 10);
  if (from >= index) return null;
  let lowIndex = from;
  for (let cursor = from + 1; cursor < index; cursor++)
    if (bars[cursor]!.close <= bars[lowIndex]!.close) lowIndex = cursor;
  if (lowIndex === 0) return null;
  let peak = 0;
  for (let cursor = Math.max(0, lowIndex - 10); cursor < lowIndex; cursor++) peak = Math.max(peak, bars[cursor]!.close);
  const low = bars[lowIndex]!.close;
  if (!(low > 0 && peak > 0)) return null;
  return { low, lowIndex, lowTime: bars[lowIndex]!.time, peak, decline: 1 - low / peak,
    rebound: bars[index]!.close / low - 1 };
}
export class FallbackContext {
  readonly inner: Context;
  readonly ema20;
  readonly ema14;
  constructor(readonly bars: MarketBar[]) {
    this.inner = entryContext(bars);
    const closes = bars.map(bar => bar.close);
    this.ema20 = ema(closes, 20); this.ema14 = ema(closes, 14);
  }
}
export class FallbackAccount {
  readonly account: ResearchAccount;
  private readonly turns: boolean[];
  flatStart: number;
  flatCause = "initial-flat";
  constructor(readonly context: FallbackContext, readonly policy: FallbackPolicy, start: number, readonly enableFrom = start) {
    this.flatStart = start;
    this.turns = context.bars.map(() => false);
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
    const context = this.context, inner = context.inner, policy = this.policy;
    const bar = context.bars[index]!, before = this.account.account.allocation;
    const entry = inner.features.get("EMA", 7), gate = inner.features.get("WMA", 7);
    const average = inner.averages.get(20)![index], originalGate = average != null && bar.close > average;
    const positiveEma = (entry.sign[index] ?? -1) > 0, wmaAllowed = (gate.sign[index] ?? -1) >= 0;
    const low = before <= 1e-10 ? causalFlatLow(context.bars, index, this.flatStart) : null;
    const lowReady = low !== null && low.decline >= policy.decline && low.rebound >= policy.rebound;
    const active = index >= this.enableFrom;
    let priceGate = originalGate;
    if (active && policy.kind === "replacement") {
      const reference = policy.gate === "ema20" ? context.ema20[index] : policy.gate === "ema14" ? context.ema14[index] : average;
      priceGate = policy.gate === "none" || (reference != null && bar.close > reference * (policy.gate === "band" ? 0.995 : 1));
    }
    if (active && policy.kind === "hybrid") priceGate = originalGate || lowReady;
    const recovery = this.account.recoveryTarget !== null && index > this.account.cutIndex &&
      index >= this.account.blockedUntil && positiveEma && (gate.sign[index] ?? -1) > 0 &&
      inner.e7[index] != null && bar.close > inner.e7[index]!;
    const nativeEntry = (entry.turns[index] && originalGate && wmaAllowed) || inner.vSignal(index, currentRule) || recovery;
    const eligible = active && policy.kind === "fallback" && before <= 1e-10 && signals.length === 0 &&
      this.account.account.pending === null && index >= this.account.blockedUntil && !nativeEntry && positiveEma && wmaAllowed &&
      lowReady && (policy.scope === "any" || (average != null && bar.close <= average)) &&
      (policy.confirmation === "trend" || (index > 0 && bar.close > context.bars[index - 1]!.high));
    const hybrid = active && policy.kind === "hybrid" && !originalGate && priceGate;
    this.turns[index] = (entry.turns[index] && priceGate) || eligible;
    const state = this.account.step(index, signals), entered = before <= 1e-10 && state.target > 1e-10;
    const addedEntry = entered && !state.vBuy && !state.recovered && signals.length === 0 && !originalGate &&
      (policy.kind === "replacement" || hybrid);
    const kind = !entered ? null : state.recovered ? "native-recovery" : state.vBuy ? "native-engulf" : signals.length > 0 ? "original" :
      eligible ? "fallback" : addedEntry ? "relaxed-turn" : "native-turn";
    const flatStart = this.flatStart, flatCause = this.flatCause;
    if (before > 1e-10 && state.target <= 1e-10) {
      this.flatStart = index; this.flatCause = state.cut ? "hard-stop" : "ordinary-exit";
    }
    return { before, ...state, entered, kind, added: kind === "fallback" || kind === "relaxed-turn",
      originalGate, priceGate, emaTurn: entry.turns[index], positiveEma, wmaAllowed, low,
      flatStart, flatCause, pending: this.account.account.pending, blockedUntil: this.account.blockedUntil };
  }
}
export function replayFallback(context: FallbackContext, decisions: ReadonlyMap<number, StrategyCycleRecentSignal[]>,
  start: number, policy: FallbackPolicy, enableFrom = start) {
  const account = new FallbackAccount(context, policy, start, enableFrom), targets = context.bars.map(() => 0), daily = [];
  for (let index = start; index < context.bars.length; index++) {
    const signals = decisions.get(index) ?? [], state = account.step(index, signals);
    assert.ok(state.target >= 0 && state.target <= 1);
    if (state.added) assert.ok(state.before <= 1e-10 && signals.length === 0);
    targets[index] = state.target;
    daily.push({ index, time: context.bars[index]!.time, close: context.bars[index]!.close, ...state,
      signals: signals.length, direction: strategyCycleSignalDirection(signals) });
  }
  return { targets, daily };
}
export function fallbackMetrics(result: AllocationBacktestResult, cash: number, boundary: number) {
  assert.equal(result.equity.length, 2000);
  const prefix = Float64Array.from([0, ...result.equity.map(point => Math.log(point.equity / cash))]);
  return { totalReturn: result.totalReturn, maxDrawdown: result.maxDrawdown, fills: result.tradeCount,
    first1500: pathMetrics(prefix, 0, 1500), final500: pathMetrics(prefix, 1500, 2000),
    recent: pathMetrics(prefix, boundary, 2000), blocks: [0, 1, 2, 3].map(offset => pathMetrics(prefix, offset * 500, (offset + 1) * 500)) };
}
function episodes(path: ReturnType<typeof replayFallback>, result: AllocationBacktestResult, cash: number) {
  return path.daily.filter(day => day.added).map(day => {
    const offset = path.daily.indexOf(day);
    const closed = path.daily.findIndex((next, cursor) => cursor > offset && next.target <= 1e-10);
    const end = closed < 0 ? path.daily.length - 1 : closed;
    const closes = path.daily.slice(offset, end + 1).map(next => next.close);
    const base = offset === 0 ? cash : result.equity[offset - 1]!.equity;
    return { entry: day.time, exit: closed < 0 ? null : path.daily[end]!.time, kind: day.kind,
      low: day.low, sma20Passed: day.originalGate, flatCause: day.flatCause,
      netEquityReturn: (result.equity[end]!.equity / base - 1) * 100,
      priceReturn: (path.daily[end]!.close / day.close - 1) * 100,
      mfe: (Math.max(...closes) / day.close - 1) * 100, mae: (Math.min(...closes) / day.close - 1) * 100,
      stopped: closed >= 0 && path.daily[end]!.cut };
  });
}
export function flatDiagnostics(context: FallbackContext, path: ReturnType<typeof replayFallback>) {
  const intervals = [];
  for (let offset = 0; offset < path.daily.length; offset++) {
    if (path.daily[offset]!.target > 1e-10) continue;
    const from = offset;
    while (offset + 1 < path.daily.length && path.daily[offset + 1]!.target <= 1e-10) offset++;
    const first = path.daily[from]!, last = path.daily[offset]!;
    const origin = first.cut ? "hard-stop" : from === 0 ? "initial-flat" : "ordinary-exit";
    intervals.push({ start: first.time, through: last.time, nextEntry: path.daily[offset + 1]?.time ?? null, bars: offset - from + 1,
      cause: origin, closeReturn: (last.close / first.close - 1) * 100,
      maxRiseFromStart: (Math.max(...path.daily.slice(from, offset + 1).map(day => day.close)) / first.close - 1) * 100 });
  }
  const blockedTurns = path.daily.filter(day => day.before <= 1e-10 && day.emaTurn && day.signals === 0 &&
    day.wmaAllowed && !day.originalGate && day.index >= day.blockedUntil).map(day => ({
      time: day.time, close: day.close, sma20: context.inner.averages.get(20)![day.index],
      gapPercent: (day.close / context.inner.averages.get(20)![day.index]! - 1) * 100, low: day.low,
      enteredByOtherRule: day.target > 1e-10,
      forward5: day.index + 5 < context.bars.length ? (context.bars[day.index + 5]!.close / day.close - 1) * 100 : null,
      forward10: day.index + 10 < context.bars.length ? (context.bars[day.index + 10]!.close / day.close - 1) * 100 : null,
    }));
  return { intervals, blockedTurns };
}
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
async function bounded(path: string) { assert.ok((await stat(path)).size <= 16 * 1024 ** 2); return readFile(path, "utf8"); }
async function atomicText(path: string, content: string) {
  await writeFile(`${path}.tmp`, content); await replaceFileAtomically(`${path}.tmp`, path);
}
async function main() {
  const data = join(root, "data/full-screen-6-15"), output = join(root, "output/sma20-fallback");
  const input = JSON.parse(await bounded(join(data, "input.json"))) as {
    bars: MarketBar[]; barsHash: string; accessedAt: string; batch: string; settings: BacktestSettings; snapshots: { decisionIndex: number }[];
  };
  const saved = JSON.parse(await bounded(join(data, "signals.json"))) as {
    sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[];
  };
  const sourceHash = sha(JSON.stringify(input));
  assert.equal(saved.sourceHash, sourceHash); assert.equal(sha(JSON.stringify(input.bars)), input.barsHash);
  assert.ok(input.bars.length <= 10000 && saved.rows.length <= 2048); assert.equal(saved.rows.length, input.snapshots.length);
  const decisions = new Map(saved.rows.map((row, offset) => {
    assert.equal(row.index, input.snapshots[offset]!.decisionIndex); return [row.index, row.signals] as const;
  }));
  const implementationHash = sha((await Promise.all(["SMA20_FALLBACK_DESIGN.md", "sma20-fallback.ts", "sma-entry-study.ts",
    "v-recovery-study.ts", "analyze.ts", "../nikkei-cycle-rallies/ma-type.ts", "../../lib/analysis/sma-position-overlay.ts",
    "../../lib/analysis/indicators.ts", "../../lib/analysis/strategy-cycle-validation.ts", "../../lib/analysis/backtest.ts"]
    .map(path => readFile(join(root, path), "utf8")))).join("\n"));
  const { bars, settings } = input, start = bars.length - 2000, context = new FallbackContext(bars);
  const cutoff = bars.findIndex(bar => bar.time === "2026-07-21"), boundary = cutoff - start + 1;
  assert.ok(cutoff >= start); assert.equal(boundary, 1936);
  const policies = fallbackMenu(); assert.equal(policies.length, 20);
  const production = new SmaPositionOverlay(bars, DEFAULT_POSITION_OVERLAY_OPTIONS);
  const baselinePath = replayFallback(context, decisions, start, fallbackBaseline);
  for (let index = start; index < bars.length; index++) {
    const signals = decisions.get(index) ?? [], direction = strategyCycleSignalDirection(signals);
    if (direction) production.request(direction, signals.at(-1)!.targetAllocation, index);
    assert.equal(baselinePath.targets[index], production.close(index, signals.length > 0));
  }
  const run = (targets: number[], costs = false, next = false) => next ? runAllocationBacktest(bars, targets, { ...settings, executionPolicy: "next-open" }) :
    runStrategyCycleCloseBacktest(bars, targets, costs ? { ...settings, commissionRate: settings.commissionRate * 2,
      slippageRate: settings.slippageRate * 2 } : settings);
  let stopping = false;
  process.on("SIGINT", () => { stopping = true; }); process.on("SIGTERM", () => { stopping = true; });
  const rows = [];
  for (const policy of policies) {
    if (stopping || process.memoryUsage().rss > 1.5 * 1024 ** 3) throw new Error("Stopped safely; rerun finite20-case fallback research");
    const path = replayFallback(context, decisions, start, policy), result = run(path.targets);
    const compact = runStrategyCycleCloseBacktest(bars, path.targets, { ...settings, summaryOnly: true });
    assert.equal(result.totalReturn, compact.totalReturn); assert.equal(result.maxDrawdown, compact.maxDrawdown);
    const commonPath = replayFallback(context, decisions, start, policy, cutoff + 1);
    assert.deepEqual(commonPath.targets.slice(0, cutoff + 1), baselinePath.targets.slice(0, cutoff + 1));
    const added = episodes(path, result, settings.initialCash);
    const row = { policy, ...fallbackMetrics(result, settings.initialCash, boundary), targetHash: sha(JSON.stringify(path.targets)),
      addedEntries: added.length, addedLosingEpisodes: added.filter(episode => episode.netEquityReturn < 0).length,
      addedStoppedEpisodes: added.filter(episode => episode.stopped).length, cuts: path.daily.filter(day => day.cut).length,
      commonState: fallbackMetrics(run(commonPath.targets), settings.initialCash, boundary),
      doubleCost: fallbackMetrics(run(path.targets, true), settings.initialCash, boundary),
      nextOpen: fallbackMetrics(run(path.targets, false, true), settings.initialCash, boundary), episodes: added,
      commonRecentEntries: commonPath.daily.filter(day => day.time > "2026-07-21" && day.entered),
      recentEntries: path.daily.filter(day => day.time > "2026-07-21" && day.entered) };
    rows.push(row);
    await atomic(join(output, `${policy.id}.json`), { sourceHash, implementationHash, policy, result, daily: path.daily,
      commonStateDaily: commonPath.daily.filter(day => day.time > "2026-07-21"), episodes: added });
    console.log(`${rows.length}/${policies.length} ${policy.id}: full=${row.totalReturn.toFixed(3)} DD=${row.maxDrawdown.toFixed(3)} recent=${row.recent.totalReturn.toFixed(3)} common=${row.commonState.recent.totalReturn.toFixed(3)} extras=${row.addedEntries}`);
    await new Promise<void>(done => setImmediate(done));
  }
  const baseline = rows[0]!, ordinal = new Map(policies.map((policy, index) => [policy.id, index]));
  const tie = (left: typeof baseline, right: typeof baseline) => ordinal.get(left.policy.id)! - ordinal.get(right.policy.id)!;
  const ranked = [...rows].sort((left, right) => right.totalReturn - left.totalReturn || tie(left, right));
  const development = rows.filter(row => row.first1500.maxDrawdown >= baseline.first1500.maxDrawdown - 1e-9)
    .sort((left, right) => right.first1500.totalReturn - left.first1500.totalReturn || tie(left, right))[0]!;
  const goals = rows.filter(row => row.policy.id !== "baseline" && row.totalReturn >= baseline.totalReturn - 1e-9 &&
    row.maxDrawdown >= baseline.maxDrawdown - 1e-9 && row.recent.totalReturn > baseline.recent.totalReturn + 1e-9);
  const summary = { sourceHash, signalsHash: sha(JSON.stringify(saved)), implementationHash, menuHash: sha(JSON.stringify(policies)),
    generatedAt: new Date().toISOString(), sourceAccessedAt: input.accessedAt, batch: input.batch,
    start: bars[start]!.time, end: bars.at(-1)!.time, recentAfter: bars[cutoff]!.time, settings,
    candidates: rows.length, uniquePaths: new Set(rows.map(row => row.targetHash)).size,
    primary: "fallback-below-trend-x3", development: development.policy.id, fullBest: ranked[0]!.policy.id,
    simultaneousImprovements: goals.map(row => row.policy.id), verification: { productionParity: 2000, commonPrefix: boundary, ledgerSummaryCases: rows.length },
    limitation: "Previously explored frozen selections; retrospective hypotheses, not untouched validation. One inherited actual account; local recent attribution is not a live date switch. Added episodes are not additive causal alpha. Production unchanged.", rows };
  await atomic(join(output, "diagnostics.json"), { sourceHash, implementationHash, ...flatDiagnostics(context, baselinePath) });
  await atomic(join(output, "summary.json"), summary);
  await atomicText(join(output, "DESIGN.md"), await readFile(join(root, "SMA20_FALLBACK_DESIGN.md"), "utf8"));
  const table = rows.map(row => `| ${row.policy.id} | ${row.totalReturn.toFixed(3)} | ${row.maxDrawdown.toFixed(3)} | ${row.first1500.totalReturn.toFixed(3)} | ${row.final500.totalReturn.toFixed(3)} | ${row.recent.totalReturn.toFixed(3)} | ${row.commonState.recent.totalReturn.toFixed(3)} | ${row.addedEntries}/${row.addedLosingEpisodes}/${row.addedStoppedEpisodes} |`).join("\n");
  const sensitivity = rows.map(row => `| ${row.policy.id} | ${row.doubleCost.totalReturn.toFixed(3)} | ${row.doubleCost.recent.totalReturn.toFixed(3)} | ${row.nextOpen.totalReturn.toFixed(3)} | ${row.nextOpen.recent.totalReturn.toFixed(3)} |`).join("\n");
  const report = `# SMA20 replacement and low-rebound fallback results\n\n${summary.start}..${summary.end};20 predeclared cases,${summary.uniquePaths} distinct targets. All percentages include original costs. Recent is strictly afterJuly21 close. No live policy changes.\n\n## All declared comparisons\n\n| Policy | Full % | DD % | First1500 % | Final500 % | Recent % | Common-state recent % | Added/loss/stop episodes |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${table}\n\nDevelopment-only choice:${summary.development}. Full retrospective best:${summary.fullBest}. Simultaneous full return/no-worse-DD and recent improvement:${goals.map(row => row.policy.id).join(", ") || "none"}. The predeclared primary is ${summary.primary}, not selected from recent outcomes.\n\n## Costs and execution sensitivity\n\n| Policy | Double-cost full % | Double-cost recent % | Next-open full % | Next-open recent % |\n|---|---:|---:|---:|---:|\n${sensitivity}\n\nRead DESIGN.md for exact lows, decline, rebound, priority and original exits. diagnostics.json records baseline flat episodes and blocked-turn forward5/10 diagnostics; these future descriptions never enter policies. Per-case JSON includes actual daily targets, equity, added episode MFE/MAE and common-state recent entries. Common-state suppresses changes throughJuly21 and verifies1936 unchanged targets. Native recovery/engulf/original entries retain priority. Existing stops apply only in the first five bars, not a permanent4% cap.\n\n${summary.limitation}\n`;
  await atomicText(join(output, "REPORT.md"), report);
  console.log(JSON.stringify({ primary: summary.primary, development: summary.development, fullBest: summary.fullBest,
    simultaneousImprovements: summary.simultaneousImprovements, uniquePaths: summary.uniquePaths }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
