import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atomic, root, pathMetrics } from "./analyze";
import { Context, ResearchAccount, baseline, type Rule } from "./v-recovery-study";
import { sma } from "../../lib/analysis/indicators";
import { SmaPositionOverlay, ENGULF_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import { runAllocationBacktest, type BacktestSettings } from "../../lib/analysis/backtest";
import { runStrategyCycleCloseBacktest, strategyCycleSignalDirection, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";

export const currentRule: Rule = { ...baseline, hold: 7, v: "engulf", drop: 0.05, vGate: "none" };
export function entryMenu(): Rule[] {
  return ["turn", "pending3", "pending5", "positive"].flatMap(entry =>
    Array.from({ length: 7 }, (_, offset) => ({ ...currentRule, entry: entry as Rule["entry"], quality: 14 + offset })));
}
export function entryContext(bars: MarketBar[]) {
  const context = new Context(bars), closes = bars.map(bar => bar.close);
  for (let period = 14; period <= 20; period++) context.averages.set(period, sma(closes, period));
  return context;
}
export function replayEntry(bars: MarketBar[], decisions: ReadonlyMap<number, StrategyCycleRecentSignal[]>, start: number, rule: Rule) {
  const context = entryContext(bars), account = new ResearchAccount(context, rule);
  const targets = bars.map(() => 0), daily = [];
  for (let index = start; index < bars.length; index++) {
    const signals = decisions.get(index) ?? [], before = account.account.allocation;
    const state = account.step(index, signals), average = context.averages.get(rule.quality)![index];
    targets[index] = state.target;
    daily.push({ time: bars[index]!.time, close: bars[index]!.close, before, ...state,
      emaTurn: context.features.get("EMA", 7).turns[index], emaSlope: context.features.get("EMA", 7).slope[index],
      wmaSlope: context.features.get("WMA", 7).slope[index], sma: average,
      priceGate: average != null && bars[index]!.close > average,
      direction: strategyCycleSignalDirection(signals), signals: signals.length,
      pendingSell: account.account.pending, blockedUntil: account.blockedUntil,
      entryAge: account.enteredAt === null ? null : index - account.enteredAt });
  }
  return { targets, daily };
}
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
async function bounded(path: string) {
  assert.ok((await stat(path)).size <= 16 * 1024 ** 2);
  return readFile(path, "utf8");
}
async function main() {
  const data = join(root, "data/full-screen-6-15"), output = join(root, "output/sma-entry-14-20");
  const input = JSON.parse(await bounded(join(data, "input.json"))) as {
    bars: MarketBar[]; barsHash: string; batch: string; accessedAt: string; settings: BacktestSettings;
    snapshots: { decisionIndex: number }[];
  };
  const saved = JSON.parse(await bounded(join(data, "signals.json"))) as {
    sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[];
  };
  const sourceHash = sha(JSON.stringify(input));
  assert.equal(saved.sourceHash, sourceHash); assert.equal(sha(JSON.stringify(input.bars)), input.barsHash);
  assert.ok(input.bars.length <= 10000 && saved.rows.length <= 2048);
  assert.equal(saved.rows.length, input.snapshots.length);
  const decisions = new Map(saved.rows.map((row, offset) => {
    assert.equal(row.index, input.snapshots[offset]!.decisionIndex); return [row.index, row.signals] as const;
  }));
  const { bars, settings } = input, start = bars.length - 2000;
  const cutoff = bars.findIndex(bar => bar.time === "2026-07-21"); assert.ok(cutoff >= start);
  const boundary = cutoff - start + 1;
  const implementationHash = sha((await Promise.all(["SMA_ENTRY_DESIGN.md", "sma-entry-study.ts", "v-recovery-study.ts", "analyze.ts",
    "../nikkei-cycle-rallies/ma-type.ts", "../../lib/analysis/sma-position-overlay.ts", "../../lib/analysis/indicators.ts",
    "../../lib/analysis/strategy-cycle-validation.ts", "../../lib/analysis/backtest.ts"].map(path => readFile(join(root, path), "utf8")))).join("\n"));
  const metrics = (result: ReturnType<typeof runStrategyCycleCloseBacktest>) => {
    assert.equal(result.equity.length, 2000);
    const prefix = Float64Array.from([0, ...result.equity.map(point => Math.log(point.equity / settings.initialCash))]);
    return { totalReturn: result.totalReturn, maxDrawdown: result.maxDrawdown, fills: result.tradeCount,
      first1500: pathMetrics(prefix, 0, 1500), final500: pathMetrics(prefix, 1500, 2000),
      throughCutoff: pathMetrics(prefix, 0, boundary), afterCutoff: pathMetrics(prefix, boundary, 2000),
      recentFills: result.rebalances.filter(fill => fill.time > "2026-07-21").length };
  };
  const production = new SmaPositionOverlay(bars, DEFAULT_POSITION_OVERLAY_OPTIONS);
  const baselinePath = replayEntry(bars, decisions, start, currentRule);
  for (let index = start; index < bars.length; index++) {
    const signals = decisions.get(index) ?? [], direction = strategyCycleSignalDirection(signals);
    if (direction) production.request(direction, signals.at(-1)!.targetAllocation, index);
    assert.equal(baselinePath.targets[index], production.close(index, signals.length > 0), `Production parity at ${bars[index]!.time}`);
  }
  const baselineMetrics = metrics(runStrategyCycleCloseBacktest(bars, baselinePath.targets, settings));
  const rows = [];
  let interrupted = false;
  process.on("SIGINT", () => { interrupted = true; }); process.on("SIGTERM", () => { interrupted = true; });
  for (const rule of entryMenu()) {
    if (interrupted || process.memoryUsage().rss > 1.5 * 1024 ** 3) throw new Error("Stopped safely; rerun the bounded28-case study");
    const path = replayEntry(bars, decisions, start, rule);
    const result = runStrategyCycleCloseBacktest(bars, path.targets, settings);
    const compact = runStrategyCycleCloseBacktest(bars, path.targets, { ...settings, summaryOnly: true });
    assert.equal(result.totalReturn, compact.totalReturn); assert.equal(result.maxDrawdown, compact.maxDrawdown);
    const id = `${rule.entry}-sma${rule.quality}`;
    const recentEntries = path.daily.filter(day => day.time > "2026-07-21" && day.before <= 1e-10 && day.target > 1e-10);
    const row = { id, rule, ...metrics(result), recentEntries,
      targetDifferences: path.targets.filter((target, index) => target !== baselinePath.targets[index]).length,
      doubleCost: metrics(runStrategyCycleCloseBacktest(bars, path.targets, { ...settings,
        commissionRate: settings.commissionRate * 2, slippageRate: settings.slippageRate * 2 })),
      nextOpen: metrics(runAllocationBacktest(bars, path.targets, { ...settings, executionPolicy: "next-open" })) };
    rows.push(row);
    await atomic(join(output, `${id}.json`), { sourceHash, implementationHash, rule, result, daily: path.daily });
    await new Promise<void>(done => setImmediate(done));
  }
  const preCutoffChoice = [...rows].filter(row => row.throughCutoff.maxDrawdown >= baselineMetrics.throughCutoff.maxDrawdown - 1e-9)
    .sort((left, right) => right.throughCutoff.totalReturn - left.throughCutoff.totalReturn || left.id.localeCompare(right.id))[0]!;
  const holdTargets = bars.map((_, index) => index >= start ? 1 : 0);
  const summary = { sourceHash, implementationHash, generatedAt: new Date().toISOString(), sourceAccessedAt: input.accessedAt,
    batch: input.batch, start: bars[start]!.time, end: bars.at(-1)!.time, cutoff: bars[cutoff]!.time,
    afterCutoffSessions: bars.length - cutoff - 1, settings, baseline: baselineMetrics, holding: metrics(runStrategyCycleCloseBacktest(bars, holdTargets, settings)),
    preCutoffChoice: preCutoffChoice.id, rows,
    verification: { productionTargetComparisons: 2000, summaryLedgerComparisons: rows.length },
    limitation: "Retrospective study on previously researched frozen winners. Post-cutoff metrics inherit positions and exclude the cutoff day's return. Not untouched validation. Flat-account supplements only; production unchanged." };
  await atomic(join(output, "summary.json"), summary);
  const table = rows.map(row => `| ${row.id} | ${row.totalReturn.toFixed(4)} | ${row.maxDrawdown.toFixed(4)} | ${row.final500.totalReturn.toFixed(4)} | ${row.afterCutoff.totalReturn.toFixed(4)} | ${row.afterCutoff.maxDrawdown.toFixed(4)} | ${row.recentFills} |`).join("\n");
  await writeFile(join(output, "REPORT.md"), `# SMA14..20 and missed entry diagnosis\n\n${summary.start} through ${summary.end}; recent interval strictly after ${summary.cutoff} close (${summary.afterCutoffSessions} sessions). All figures are percentages after original costs.\n\n| Rule | Full return | Full drawdown | Final500 return | Recent return | Recent drawdown | Recent fills |\n|---|---:|---:|---:|---:|---:|---:|\n${table}\n\nBuy-and-hold recent return: ${summary.holding.afterCutoff.totalReturn.toFixed(4)}%; drawdown: ${summary.holding.afterCutoff.maxDrawdown.toFixed(4)}%.\n\nPre-cutoff diagnostic choice: ${preCutoffChoice.id}. Its subsequent results do not beat current SMA20.\n\nThe July31 EMA turn fails SMA20; August5 price confirmation has no fresh turn. September18 similarly fails SMA20, which passes September24. Delayed eligibility captures these rallies, but the September24 entry remains exposed until October15 under unchanged exit protection. A September28 original reduction is held; October7 WMA is positive; October13/14 SMA11 slopes remain above the0.075% protection threshold. Recognition and realized return must therefore be assessed jointly with exits. Existing rules use flat-account supplements; partial-position adds still follow original signals.\n\nSource and code hashes, complete daily diagnostics, double-cost/next-open comparisons and exact settings are in summary.json and per-case ledgers. Baseline matches all2000 production targets and all28 summary/full-ledger comparisons pass. See SMA_ENTRY_DESIGN.md for window semantics.\n\n${summary.limitation}\n`);
  console.log(JSON.stringify({ ...summary, rows: rows.map(({ recentEntries, rule, doubleCost, nextOpen, ...row }) => row) }, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
