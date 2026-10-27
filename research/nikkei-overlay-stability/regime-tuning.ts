import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFile, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atomic, pathMetrics, root } from "./analyze";
import { currentRule, entryContext } from "./sma-entry-study";
import { ResearchAccount } from "./v-recovery-study";
import { ema, sma } from "../../lib/analysis/indicators";
import { SmaPositionOverlay, ENGULF_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import { runAllocationBacktest, type AllocationBacktestResult, type BacktestSettings } from "../../lib/analysis/backtest";
import { runStrategyCycleCloseBacktest, strategyCycleSignalDirection, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";

export function efficiency(closes: readonly number[], index: number, period: number): number | null {
  if (index < period) return null;
  let distance = 0;
  for (let cursor = index - period + 1; cursor <= index; cursor++) distance += Math.abs(closes[cursor]! - closes[cursor - 1]!);
  return distance > 0 ? Math.abs(closes[index]! - closes[index - period]!) / distance : 0;
}
export function wilderAtr(bars: readonly MarketBar[], period = 14): (number | null)[] {
  const result: (number | null)[] = bars.map(() => null);
  let value = 0;
  for (let index = 0; index < bars.length; index++) {
    const bar = bars[index]!, previous = bars[index - 1]?.close ?? bar.close;
    const range = Math.max(bar.high - bar.low, Math.abs(bar.high - previous), Math.abs(bar.low - previous));
    if (index < period) value += range / period;
    else value = (value * (period - 1) + range) / period;
    if (index >= period - 1) result[index] = value;
  }
  return result;
}
export interface Observation { er: number | null; atrPercent: number | null; atrRank: number | null }
export function observations(bars: MarketBar[]): Observation[] {
  const closes = bars.map(bar => bar.close), atr = wilderAtr(bars);
  const percent = atr.map((value, index) => value === null ? null : value / closes[index]! * 100);
  return bars.map((_, index) => {
    const history = percent.slice(Math.max(0, index - 252), index).filter((value): value is number => value !== null);
    const today = percent[index]!;
    return { er: efficiency(closes, index, 20), atrPercent: today,
      atrRank: history.length === 252 && today !== null ? history.filter(value => value <= today).length / history.length : null };
  });
}
export type Detector = "noise" | "wide-noise";
export function detectRegime(points: readonly Observation[], detector: Detector): boolean[] {
  let active = false, entering = 0, leaving = 0;
  return points.map(point => {
    const previous = active;
    if (point.er === null || (detector === "wide-noise" && point.atrRank === null)) {
      entering = 0; leaving = 0; return previous;
    }
    const enter = point.er <= 0.25 && (detector === "noise" || point.atrRank! >= 0.5);
    const leave = point.er >= 0.35 || (detector === "wide-noise" && point.atrRank! < 0.4);
    entering = !active && enter ? entering + 1 : 0;
    leaving = active && leave ? leaving + 1 : 0;
    if (entering >= 2) { active = true; entering = 0; }
    if (leaving >= 2) { active = false; leaving = 0; }
    return previous;
  });
}
export type Action = "baseline" | "delay3" | "hold3" | "wma-exit" | "original-exit" | "delay3-wma-exit" | "delay3-original-exit";
export interface Policy { id: string; detector: Detector; action: Action }
export function policies(): Policy[] {
  const actions: Action[] = ["delay3", "hold3", "wma-exit", "original-exit", "delay3-wma-exit", "delay3-original-exit"];
  return [{ id: "baseline", detector: "noise", action: "baseline" }, ...(["noise", "wide-noise"] as const)
    .flatMap(detector => actions.map(action => ({ id: `${detector}-${action}`, detector, action })))];
}
export function replayRegime(bars: MarketBar[], decisions: ReadonlyMap<number, StrategyCycleRecentSignal[]>, start: number,
  policy: Policy, points = observations(bars)) {
  const context = entryContext(bars), rule = { ...currentRule }, account = new ResearchAccount(context, rule);
  const active = detectRegime(points, policy.detector), targets = bars.map(() => 0), daily = [];
  for (let index = start; index < bars.length; index++) {
    Object.assign(rule, currentRule);
    if (active[index] && policy.action !== "baseline") {
      if (policy.action.startsWith("delay3")) rule.entry = "pending3";
      if (policy.action !== "delay3") rule.hold = 3;
      if (policy.action.endsWith("wma-exit")) rule.threshold = Number.MAX_VALUE;
      if (policy.action.endsWith("original-exit")) { rule.threshold = Number.MAX_VALUE; rule.exit = "none"; }
    }
    const before = account.account.allocation, signals = decisions.get(index) ?? [];
    const state = account.step(index, signals); targets[index] = state.target;
    daily.push({ time: bars[index]!.time, before, ...state, regime: active[index]!, observation: points[index],
      direction: strategyCycleSignalDirection(signals), signals: signals.length, pending: account.account.pending });
  }
  return { targets, daily };
}
const mean = (values: readonly number[]) => values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
function quantile(values: readonly number[], probability: number) {
  const sorted = [...values].sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const position = (sorted.length - 1) * probability, lower = Math.floor(position), fraction = position - lower;
  return sorted[lower]! * (1 - fraction) + sorted[Math.min(lower + 1, sorted.length - 1)]! * fraction;
}
export function describe(bars: MarketBar[], points: Observation[], decisions: ReadonlyMap<number, StrategyCycleRecentSignal[]>, from: number, to: number) {
  assert.ok(from >= 1 && to <= bars.length && from < to);
  const closes = bars.map(bar => bar.close), average20 = sma(closes, 20), average60 = sma(closes, 60), average7 = ema(closes, 7);
  let reversals = 0, crossings = 0, conflicts = 0, originalDays = 0, upDays = 0, gapDays = 0, positiveRun = 0;
  const runs: number[] = [], dailyMoves: number[] = [];
  const prefix = [0];
  for (let index = from; index < to; index++) {
    const move = closes[index]! / closes[index - 1]! - 1;
    dailyMoves.push(move); prefix.push(Math.log(closes[index]! / closes[from - 1]!));
    if (move > 0) upDays++;
    if (index > from && Math.sign(move) * Math.sign(dailyMoves.at(-2)!) < 0) reversals++;
    if (average20[index] != null && average20[index - 1] != null &&
      (closes[index]! > average20[index]!) !== (closes[index - 1]! > average20[index - 1]!)) crossings++;
    if (Math.abs(bars[index]!.open / closes[index - 1]! - 1) >= 0.01) gapDays++;
    if (average7[index]! > average7[index - 1]!) positiveRun++;
    else if (positiveRun) { runs.push(positiveRun); positiveRun = 0; }
    const signals = decisions.get(index) ?? [];
    if (signals.length) { originalDays++; if (!strategyCycleSignalDirection(signals)) conflicts++; }
  }
  if (positiveRun) runs.push(positiveRun);
  const span = to - from;
  return { start: bars[from]!.time, end: bars[to - 1]!.time, sessions: span,
    ...pathMetrics(prefix, 0, span), er: efficiency(closes, to - 1, span)!,
    meanEr20: mean(points.slice(from, to).flatMap(point => point.er === null ? [] : [point.er])),
    atrPercent: mean(points.slice(from, to).flatMap(point => point.atrPercent === null ? [] : [point.atrPercent])),
    signReversalRate: reversals / Math.max(1, span - 1), sma20CrossingsPer100: crossings / span * 100,
    aboveSma20: closes.slice(from, to).filter((close, offset) => close > average20[from + offset]!).length / span,
    aboveSma60: closes.slice(from, to).filter((close, offset) => close > average60[from + offset]!).length / span,
    upDayRate: upDays / span, gapDayRate: gapDays / span, medianEmaPositiveRun: quantile(runs, 0.5),
    maxEmaPositiveRun: Math.max(0, ...runs), originalDays, conflicts,
    realizedDailyVolatility: Math.sqrt(mean(dailyMoves.map(move => (move - mean(dailyMoves)) ** 2))) * 100 };
}
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
async function bounded(path: string) { assert.ok((await stat(path)).size <= 16 * 1024 ** 2); return readFile(path, "utf8"); }
async function main() {
  const data = join(root, "data/full-screen-6-15"), output = join(root, "output/regime-tuning");
  const input = JSON.parse(await bounded(join(data, "input.json"))) as { bars: MarketBar[]; barsHash: string; settings: BacktestSettings;
    accessedAt: string; batch: string; snapshots: { decisionIndex: number }[] };
  const saved = JSON.parse(await bounded(join(data, "signals.json"))) as { sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[] };
  const sourceHash = sha(JSON.stringify(input)); assert.equal(sourceHash, saved.sourceHash);
  assert.equal(sha(JSON.stringify(input.bars)), input.barsHash); assert.ok(input.bars.length <= 10000 && saved.rows.length <= 2048);
  assert.equal(saved.rows.length, input.snapshots.length);
  const decisions = new Map(saved.rows.map((row, offset) => { assert.equal(row.index, input.snapshots[offset]!.decisionIndex); return [row.index, row.signals] as const; }));
  const { bars, settings } = input, start = bars.length - 2000;
  const cutoff = bars.findIndex(bar => bar.time === "2026-07-21"); assert.ok(cutoff > start);
  const boundary = cutoff - start + 1, points = observations(bars), recent = describe(bars, points, decisions, cutoff + 1, bars.length);
  const implementationHash = sha((await Promise.all(["REGIME_TUNING_DESIGN.md", "regime-tuning.ts", "sma-entry-study.ts", "v-recovery-study.ts", "analyze.ts",
    "../nikkei-cycle-rallies/ma-type.ts", "../../lib/analysis/indicators.ts", "../../lib/analysis/sma-position-overlay.ts",
    "../../lib/analysis/backtest.ts", "../../lib/analysis/strategy-cycle-validation.ts"].map(path => readFile(join(root, path), "utf8")))).join("\n"));
  const historical: (ReturnType<typeof describe> & { from: number; to: number })[] = [];
  for (let from = start; from + recent.sessions <= cutoff + 1; from += recent.sessions)
    historical.push({ from, to: from + recent.sessions, ...describe(bars, points, decisions, from, from + recent.sessions) });
  const keys = ["er", "atrPercent", "signReversalRate", "sma20CrossingsPer100", "totalReturn"] as const;
  const scales = Object.fromEntries(keys.map(key => [key, Math.max(1e-8,
    quantile(historical.map(block => block[key]), 0.75) - quantile(historical.map(block => block[key]), 0.25))])) as Record<typeof keys[number], number>;
  const analogues = historical.map(block => ({ ...block, distance: mean(keys.map(key => Math.abs(block[key] - recent[key]) / scales[key])) }))
    .sort((left, right) => left.distance - right.distance || left.from - right.from).slice(0, 5);
  const metric = (result: AllocationBacktestResult) => {
    assert.equal(result.equity.length, 2000);
    const prefix = Float64Array.from([0, ...result.equity.map(point => Math.log(point.equity / settings.initialCash))]);
    return { totalReturn: result.totalReturn, maxDrawdown: result.maxDrawdown, fills: result.tradeCount,
      first1500: pathMetrics(prefix, 0, 1500), final500: pathMetrics(prefix, 1500, 2000),
      preCutoff: pathMetrics(prefix, 0, boundary), recent: pathMetrics(prefix, boundary, 2000),
      analogues: analogues.map(block => ({ start: block.start, end: block.end, ...pathMetrics(prefix, block.from - start, block.to - start) })),
      chronological: Array.from({ length: Math.ceil(2000 / 252) }, (_, offset) => ({
        start: bars[start + offset * 252]!.time, end: bars[Math.min(bars.length, start + (offset + 1) * 252) - 1]!.time,
        ...pathMetrics(prefix, offset * 252, Math.min(2000, (offset + 1) * 252)) })) };
  };
  let stopping = false; process.on("SIGINT", () => { stopping = true; }); process.on("SIGTERM", () => { stopping = true; });
  const rows = [], menu = policies(); assert.equal(menu.length, 13);
  for (const policy of menu) {
    if (stopping || process.memoryUsage().rss > 1.5 * 1024 ** 3) throw new Error("Stopped safely; rerun the bounded13-case regime study");
    const path = replayRegime(bars, decisions, start, policy, points), result = runStrategyCycleCloseBacktest(bars, path.targets, settings);
    if (policy.action === "baseline") {
      const production = new SmaPositionOverlay(bars, DEFAULT_POSITION_OVERLAY_OPTIONS);
      for (let index = start; index < bars.length; index++) {
        const signals = decisions.get(index) ?? [], direction = strategyCycleSignalDirection(signals);
        if (direction) production.request(direction, signals.at(-1)!.targetAllocation, index);
        assert.equal(path.targets[index], production.close(index, signals.length > 0));
      }
    }
    const compact = runStrategyCycleCloseBacktest(bars, path.targets, { ...settings, summaryOnly: true });
    assert.equal(result.totalReturn, compact.totalReturn); assert.equal(result.maxDrawdown, compact.maxDrawdown);
    const recentDays = path.daily.filter(day => day.time > "2026-07-21");
    rows.push({ policy, ...metric(result), recentRegimeShare: mean(recentDays.map(day => Number(day.regime))),
      fullRegimeShare: mean(path.daily.map(day => Number(day.regime))), recentExposure: mean(recentDays.map(day => day.target)),
      recentFills: result.rebalances.filter(fill => fill.time > "2026-07-21"),
      doubleCost: metric(runStrategyCycleCloseBacktest(bars, path.targets, { ...settings, commissionRate: settings.commissionRate * 2, slippageRate: settings.slippageRate * 2 })),
      nextOpen: metric(runAllocationBacktest(bars, path.targets, { ...settings, executionPolicy: "next-open" })) });
    await atomic(join(output, `${policy.id}.json`), { sourceHash, implementationHash, policy, result, daily: path.daily });
    await new Promise<void>(done => setImmediate(done));
  }
  const baseline = rows[0]!;
  const development = rows.filter(row => row.first1500.maxDrawdown >= baseline.first1500.maxDrawdown - 1e-9)
    .sort((left, right) => right.first1500.totalReturn - left.first1500.totalReturn || Number(left.policy.action !== "baseline") - Number(right.policy.action !== "baseline") || left.policy.id.localeCompare(right.policy.id))[0]!;
  const diagnosticKeys = [...keys, "meanEr20", "aboveSma60", "aboveSma20", "medianEmaPositiveRun", "realizedDailyVolatility", "gapDayRate"] as const;
  const relative = Object.fromEntries(diagnosticKeys.map(key => [key, historical.filter(block => block[key] <= recent[key]).length / historical.length]));
  const summary = { sourceHash, implementationHash, generatedAt: new Date().toISOString(), sourceAccessedAt: input.accessedAt, batch: input.batch,
    settings, start: bars[start]!.time, end: bars.at(-1)!.time, recent, historicalBlockCount: historical.length,
    historicalFeatureMedian: Object.fromEntries(diagnosticKeys.map(key => [key, quantile(historical.map(block => block[key]), 0.5)])),
    historicalPercentile: relative, analogues, developmentChoice: development.policy.id, rows,
    verification: { productionTargets: 2000, summaryLedgerPairs: rows.length },
    limitation: "Retrospective explored history. Whole-block analogues are descriptive only. Daily regimes use yesterday's completed features, preceding252 ATR ranks and confirmation. No production change or prospective validation." };
  await atomic(join(output, "summary.json"), summary);
  const table = rows.map(row => `| ${row.policy.id} | ${row.totalReturn.toFixed(3)} | ${row.maxDrawdown.toFixed(3)} | ${row.first1500.totalReturn.toFixed(3)} | ${row.final500.totalReturn.toFixed(3)} | ${row.recent.totalReturn.toFixed(3)} | ${row.recent.maxDrawdown.toFixed(3)} | ${(row.recentRegimeShare * 100).toFixed(1)} |`).join("\n");
  const featureTable = diagnosticKeys.map(key => `| ${key} | ${recent[key].toFixed(4)} | ${summary.historicalFeatureMedian[key]!.toFixed(4)} | ${(relative[key]! * 100).toFixed(1)} |`).join("\n");
  await writeFile(join(output, "REPORT.md"), `# Interval characteristics and causal regime tuning\n\nRecent ${recent.start} through ${recent.end}; ${recent.sessions} sessions. Returns/drawdowns in percent after original fees and slippage; one inherited account.\n\n| Feature | Recent | Historical64-session median | Historical percentile |\n|---|---:|---:|---:|\n${featureTable}\n\nFeatures are fractions except ATR/return percentages and SMA crossings per100 sessions. History contains${historical.length} nonoverlapping earlier blocks. ATR is Wilder14/close; efficiency uses net price displacement/absolute path. Sign reversals count strictly opposite nonzero daily returns. Positive-run lengths are clipped at interval boundaries.\n\n| Policy | Full return | Full DD | First1500 | Final500 | Recent return | Recent DD | Recent regime share % |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${table}\n\nFirst1500-only choice: ${development.policy.id}.\n\nAll13 ledgers and summary.json include matched historical blocks, chronological252-session blocks, cost/next-open diagnostics and recent fills. Detectors are lagged one day; no whole-interval label triggers a trade. See REGIME_TUNING_DESIGN.md for exact actions and state retention.\n\n${summary.limitation}\n`);
  const analogueTable = analogues.map((block, offset) => `| ${block.start} | ${block.end} | ${block.totalReturn.toFixed(3)} | ${baseline.analogues[offset]!.totalReturn.toFixed(3)} | ${baseline.analogues[offset]!.maxDrawdown.toFixed(3)} |`).join("\n");
  await appendFile(join(output, "REPORT.md"), `\n## Interpretation\n\nAdditional feature units: EMA positive-run lengths are sessions; realized daily volatility is percent. The interval has elevated volatility, lower mean20-session efficiency, shorter positive EMA runs and less time above SMA60 than historical block medians. Daily sign reversals are not unusually frequent. This supports weak/noisy directional persistence with large moves. ATR alone is not directional.\n\nNo declared feature-triggered adjustment improves full-period return over baseline. Retain these as diagnostic candidates rather than changing production from recent fit.\n\n| Descriptive analogue start | End | Market return | Current-strategy return | Current-strategy DD |\n|---|---|---:|---:|---:|\n${analogueTable}\n\nSimilarity uses only market characteristics, not strategy PnL. Whole-block analogues are retrospective. Sources for method definitions (accessed2026-10-27):\nhttps://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/atr\nhttps://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/kaufmans-adaptive-moving-average-kama\n`);
  console.log(JSON.stringify({ recent, historicalFeatureMedian: summary.historicalFeatureMedian, historicalPercentile: relative,
    analogues, developmentChoice: summary.developmentChoice,
    rows: rows.map(row => ({ id: row.policy.id, full: row.totalReturn, dd: row.maxDrawdown, first1500: row.first1500,
      final500: row.final500, recent: row.recent, recentRegimeShare: row.recentRegimeShare })) }, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
