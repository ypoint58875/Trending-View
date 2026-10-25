import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deserialize } from "node:v8";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import { unpackMarketBars } from "../../lib/analysis/screening-worker-bars";
import { hashMarketBars } from "../../lib/analysis/screening-worker-client";
import { screeningResultPlan } from "../../lib/analysis/screening-plan";
import { selectBestShortcutScreeningResult } from "../../lib/analysis/shortcut-batch-screening";
import { buildStrategyPlanTimeline } from "../../lib/analysis/strategy-combinations";
import {
  buildStrategyCycleRollingReport, buildStrategyCycleRollingSchedule,
  NIKKEI_CYCLE_MODEL, NIKKEI_CYCLE_CONFLICT_POLICY,
  resolveStrategyCycleRecentSignals, strategyCycleRecentSignals,
  runStrategyCycleCloseBacktest,
  type StrategyCycleSelectionSnapshot,
} from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest, type AllocationBacktestResult, type BacktestSettings } from "../../lib/analysis/backtest";
import type { MarketBar } from "../../lib/market/types";
import type { ScreeningValidationOutcome } from "../../lib/analysis/screening-validation";

const root = dirname(fileURLToPath(import.meta.url));
const project = resolve(root, "../..");
const batch = "4055816d2e7c57dd0388e9fa";
const model = `rallies-v1:${NIKKEI_CYCLE_MODEL}:${NIKKEI_CYCLE_CONFLICT_POLICY}`;
const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const json = (value: unknown) => JSON.stringify(value);
export const rallyWindows = [
  ["2025-04-21", "2025-06-16"], ["2025-10-21", "2025-11-04"],
  ["2026-03-30", "2026-05-12"], ["2026-05-20", "2026-06-03"],
] as const;
export type TrendRule = "sma20-two-close" | "sma60-two-close" | "ema10-30" | "momentum20" | "donchian20-10";
const trendRules: TrendRule[] = ["sma20-two-close", "sma60-two-close", "ema10-30", "momentum20", "donchian20-10"];
interface Input {
  version: 1; model: string; batch: string; bars: MarketBar[]; barsHash: string;
  snapshots: StrategyCycleSelectionSnapshot[];
  settings: BacktestSettings; evaluationSessions: number;
  sources: { job: string; requestHash: string; resultHash: string }[];
}
async function atomicJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${json(value)}\n`, "utf8");
  await replaceFileAtomically(temporary, path);
}
async function boundedRead(path: string, limit = 16 * 1024 * 1024) {
  if ((await stat(path)).size > limit) throw new Error(`Input exceeds size limit: ${path}`);
  return readFile(path);
}
async function collect(): Promise<Input> {
  const frozen = join(root, "data/input.json");
  try {
    const input = JSON.parse((await boundedRead(frozen, 32 * 1024 * 1024)).toString()) as Input;
    if (input.version !== 1 || input.model !== model || sha(json(input.bars)) !== input.barsHash) {
      throw new Error("Frozen study input or execution model is incompatible");
    }
    return input;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const engine = join(project, "data/state/screening-engine");
  const batchRoot = join(engine, `batch-${batch}`);
  const queue = JSON.parse((await boundedRead(join(batchRoot, "queue.json"))).toString());
  if (!Array.isArray(queue.jobIds) || queue.jobIds.length > 2048 || new Set(queue.jobIds).size !== queue.jobIds.length) {
    throw new Error("Invalid bounded source queue");
  }
  const barBytes = await boundedRead(join(batchRoot, "bars.bin"));
  const bars = unpackMarketBars(deserialize(barBytes));
  if (bars.length > 10000) throw new Error("Bar count exceeds study limit");
  const snapshots: Input["snapshots"] = [];
  const sources: Input["sources"] = [];
  let settings: BacktestSettings | undefined;
  for (const job of queue.jobIds as string[]) {
    if (!/^[a-f0-9]{24}$/.test(job)) throw new Error("Invalid job identity");
    const requestBytes = await boundedRead(join(engine, job, "request.json"));
    const resultBytes = await boundedRead(join(engine, job, "result.json"));
    const request = JSON.parse(requestBytes.toString());
    const signature = JSON.parse(request.checkpoint.signature);
    const match = request.checkpoint.key.match(/^screening:cycle:index:N225:(\d+):10$/);
    const index = match ? Number(match[1]) : -1;
    if (!match || signature.barCount !== index + 1 || request.barCount !== index + 1 ||
      signature.barsHash !== hashMarketBars(bars.slice(0, index + 1)) ||
      request.settings.endTime !== bars[index]?.time || signature.resultModelVersion !== 5 ||
      request.options.objective !== "totalReturn" || request.options.maxCombinationStrategies !== 5 ||
      request.settings.commissionRate !== 0.0003 || request.settings.slippageRate !== 0.0002) {
      throw new Error(`Source prefix/settings mismatch: ${job}`);
    }
    const outcome = JSON.parse(resultBytes.toString()) as ScreeningValidationOutcome;
    const winner = selectBestShortcutScreeningResult(outcome.singleResults, outcome.results, "totalReturn");
    if (outcome.cancelled || outcome.failedCount || !winner) throw new Error(`Incomplete source result: ${job}`);
    snapshots.push({ decisionIndex: index, decisionTime: bars[index]!.time, screeningWindow: 10,
      plan: screeningResultPlan(winner.result), fixedRelativeLongStrategy: winner.kind === "combination" ? winner.result.relativeLongStrategy : null,
      label: job });
    sources.push({ job, requestHash: sha(requestBytes), resultHash: sha(resultBytes) });
    settings = request.settings;
  }
  snapshots.sort((a, b) => a.decisionIndex - b.decisionIndex);
  const evaluationSessions = bars.length - snapshots[0]!.decisionIndex;
  const schedule = buildStrategyCycleRollingSchedule(bars, evaluationSessions, 10);
  if (!schedule || schedule.decisionIndexes.length !== snapshots.length ||
    snapshots.some((s, i) => s.decisionIndex !== schedule.decisionIndexes[i])) throw new Error("Incomplete decision history");
  const input: Input = { version: 1, model, batch, bars, barsHash: sha(json(bars)), snapshots,
    evaluationSessions, settings: { ...settings!, startTime: snapshots[0]!.decisionTime, endTime: bars.at(-1)!.time }, sources };
  await atomicJson(frozen, input);
  await writeFile(join(root, "data/source_registry.jsonl"), `${json({ accessedAt: new Date().toISOString(),
    source: `local batch-${batch}`, symbol: "^N225", barsHash: input.barsHash, rawBarsHash: sha(barBytes), jobs: sources.length,
    externalReferenceUrls: ["https://www.aqr.com/insights/research/journal-article/a-century-of-evidence-on-trend-following-investing", "https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf"] })}\n`);
  return input;
}

export function buildTrendTarget(bars: readonly MarketBar[], rule: TrendRule): number[] {
  const target = new Array<number>(bars.length).fill(0);
  let state = 0, belowCount = 0, ema10 = 0, ema30 = 0;
  const closes = bars.map((bar) => bar.close);
  for (let i = 0; i < bars.length; i += 1) {
    const close = closes[i]!;
    ema10 = i ? ema10 + 2 / 11 * (close - ema10) : close;
    ema30 = i ? ema30 + 2 / 31 * (close - ema30) : close;
    if (rule === "ema10-30") state = i >= 29 && ema10 > ema30 ? 1 : 0;
    else if (rule === "momentum20") state = i >= 20 && close > closes[i - 20]! ? 1 : 0;
    else if (rule === "donchian20-10") {
      if (i >= 20 && close > Math.max(...bars.slice(i - 20, i).map((bar) => bar.high))) state = 1;
      else if (i >= 10 && close < Math.min(...bars.slice(i - 10, i).map((bar) => bar.low))) state = 0;
    } else {
      const period = rule === "sma20-two-close" ? 20 : 60;
      if (i >= period - 1) {
        const average = closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
        belowCount = close < average ? belowCount + 1 : 0;
        if (close > average) state = 1;
        else if (belowCount >= 2) state = 0;
      }
    }
    target[i] = state;
  }
  return target;
}
export function blendTargets(tactical: readonly number[], core: readonly number[], coreWeight: number): number[] {
  if (tactical.length !== core.length || coreWeight < 0 || coreWeight > 1) throw new Error("Invalid target blend");
  return tactical.map((value, i) => (1 - coreWeight) * value + coreWeight * core[i]!);
}
export function segmentReturn(equity: readonly { time: string; equity: number }[], start: string, end: string): number {
  const from = equity.findLast((point) => point.time <= start);
  const to = equity.findLast((point) => point.time <= end);
  if (!from || !to || to.time <= from.time) throw new Error("Segment has no matching close interval");
  return (to.equity / from.equity - 1) * 100;
}
interface Decision {
  time: string; index: number; selected: string[]; from: number; to: number;
  theoretical: number; recent: { direction: string; targetAllocation: number }[];
  plan: StrategyCycleSelectionSnapshot["plan"];
}
function deriveCycleTargets(input: Input, daily = false, align = false): { target: number[]; decisions: Decision[] } {
  const { bars, snapshots } = input;
  const target = new Array<number>(bars.length).fill(0);
  const decisions: Decision[] = [];
  let selected = -1, inherited = 0;
  for (let i = snapshots[0]!.decisionIndex; i < bars.length; i += 1) {
    const isDecision = snapshots[selected + 1]?.decisionIndex === i;
    if (isDecision) selected += 1;
    if (isDecision || daily) {
      const snapshot = snapshots[selected]!;
      const recent = strategyCycleRecentSignals(bars, snapshot, i);
      const timeline = buildStrategyPlanTimeline(bars.slice(0, i + 1), snapshot.plan, undefined, snapshot.fixedRelativeLongStrategy ?? undefined);
      const theoretical = timeline.target[i] ?? 0;
      const next = align ? theoretical : resolveStrategyCycleRecentSignals(inherited, recent).targetAllocation;
      if (isDecision) decisions.push({ time: bars[i]!.time, index: i,
        selected: Object.values(snapshot.plan).filter((value): value is { strategyId: string } => Boolean(value && typeof value === "object" && "strategyId" in value)).map((v) => v.strategyId),
        from: inherited, to: next, theoretical, recent: recent.map(({ direction, targetAllocation }) => ({ direction, targetAllocation })), plan: snapshot.plan });
      inherited = next;
    }
    target[i] = inherited;
  }
  return { target, decisions };
}
function clean(result: AllocationBacktestResult) {
  return { totalReturn: result.totalReturn, maxDrawdown: result.maxDrawdown, sharpe: result.sharpe,
    tradeCount: result.tradeCount, finalEquity: result.finalEquity };
}
function summarize(input: Input, target: number[]) {
  const result = runStrategyCycleCloseBacktest(input.bars, target, input.settings);
  const nextOpen = runAllocationBacktest(input.bars, target, { ...input.settings, executionPolicy: "next-open" });
  const start = input.bars.length - input.evaluationSessions;
  const subperiods = [
    [input.settings.startTime!, "2025-06-30"], ["2025-06-30", "2025-12-30"],
    ["2025-12-30", "2026-06-30"], ["2026-06-30", input.settings.endTime!],
  ];
  return { ...clean(result), nextOpen: clean(nextOpen),
    segments: rallyWindows.map(([from, to]) => ({ from, to, actualFrom: result.equity.findLast(p => p.time <= from)!.time,
      actualTo: result.equity.findLast(p => p.time <= to)!.time, return: segmentReturn(result.equity, from, to),
      averageTarget: target.slice(input.bars.findIndex(b => b.time >= from), input.bars.findLastIndex(b => b.time <= to)).reduce((a, b) => a + b, 0) /
        Math.max(1, input.bars.findLastIndex(b => b.time <= to) - input.bars.findIndex(b => b.time >= from)) })),
    subperiods: subperiods.map(([from, to]) => ({ from, to, return: segmentReturn(result.equity, from!, to!) })),
    averageTarget: target.slice(start, -1).reduce((a, b) => a + b, 0) / (input.evaluationSessions - 1),
    equity: result.equity, rebalances: result.rebalances };
}

async function main() {
  const input = await collect();
  const inputHash = sha(json(input));
  const baseline = deriveCycleTargets(input);
  const actual = buildStrategyCycleRollingReport(input.bars, input.snapshots, input.evaluationSessions, 10, input.settings);
  const reproduced = runStrategyCycleCloseBacktest(input.bars, baseline.target, input.settings);
  if (Math.abs(reproduced.totalReturn - actual.updateReturn) > 1e-9 || json(reproduced.rebalances.map(r => [r.time, r.targetAllocation])) !== json(actual.rebalances.map(r => [r.time, r.targetAllocation]))) {
    throw new Error("Research baseline differs from product execution");
  }
  console.log(`Verified ${input.snapshots.length} decisions, baseline ${actual.updateReturn.toFixed(6)}%, benchmark ${actual.benchmarkReturn.toFixed(6)}%`);
  const start = input.bars.length - input.evaluationSessions;
  const active = (values: number[]) => values.map((value, i) => i < start ? 0 : value);
  const benchmark = active(new Array(input.bars.length).fill(1));
  const variants = new Map<string, number[]>([["buy-hold", benchmark], ["cycle10", baseline.target],
    ["cycle10-daily-signals", deriveCycleTargets(input, true).target], ["cycle10-align-on-screen", deriveCycleTargets(input, false, true).target],
    ["constant50-cycle10-50", blendTargets(baseline.target, benchmark, 0.5)]]);
  for (const rule of trendRules) {
    const core = active(buildTrendTarget(input.bars, rule));
    variants.set(rule, core);
    for (const weight of [0.3, 0.5, 0.7]) variants.set(`${rule}-${weight * 100}-cycle10-${Math.round((1 - weight) * 100)}`, blendTargets(baseline.target, core, weight));
    variants.set(`${rule}-floor`, baseline.target.map((value, i) => Math.max(value, core[i]!)));
  }
  const checkpointPath = join(root, "data/state.json");
  let checkpoint: { model: string; inputHash: string; completed: string[] } = { model, inputHash, completed: [] };
  try {
    checkpoint = JSON.parse(await readFile(checkpointPath, "utf8"));
    if (checkpoint.model !== model || checkpoint.inputHash !== inputHash) throw new Error("Study checkpoint incompatible");
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  let interrupted = false;
  process.on("SIGINT", () => { interrupted = true; });
  const results: Record<string, ReturnType<typeof summarize>> = {};
  for (const [id, target] of variants) {
    const destination = join(root, `output/${id}.json`);
    if (checkpoint.completed.includes(id)) results[id] = JSON.parse(await readFile(destination, "utf8"));
    else {
      results[id] = summarize(input, target);
      await atomicJson(destination, results[id]);
      checkpoint.completed.push(id);
      await atomicJson(checkpointPath, checkpoint);
    }
    console.log(`${id}: ${results[id]!.totalReturn.toFixed(3)}%, MDD ${results[id]!.maxDrawdown.toFixed(3)}%`);
    if (interrupted) { console.log("Interrupted after committed variant; rerun to resume"); return; }
  }
  const diagnostics = rallyWindows.map(([from, to]) => ({ from, to,
    rawReturn: (input.bars.findLast(b => b.time <= to)!.close / input.bars.findLast(b => b.time <= from)!.close - 1) * 100,
    decisions: baseline.decisions.filter(d => d.time >= from && d.time <= to),
    fills: reproduced.rebalances.filter(r => r.time >= from && r.time <= to),
    precedingFill: reproduced.rebalances.findLast(r => r.time < from) ?? null,
  }));
  await atomicJson(join(root, "output/diagnostics.json"), diagnostics);
  await atomicJson(join(root, "output/summary.json"), { model, inputHash, start: input.settings.startTime, end: input.settings.endTime,
    decisions: input.snapshots.length, bars: input.bars.length, baselineReconciled: true,
    retrospective: true, testedVariants: variants.size,
    variants: Object.fromEntries(Object.entries(results).map(([key, value]) => {
      const { equity, rebalances, ...metrics } = value; return [key, metrics];
    })), diagnostics: diagnostics.map(({ decisions, fills, ...rest }) => ({ ...rest, decisions: decisions.length,
      missedAlignmentDecisions: decisions.filter(d => d.to < d.theoretical - 1e-10 && d.recent.length === 0).length,
      fills: fills.map(({ time, fromAllocation, targetAllocation }) => ({ time, fromAllocation, targetAllocation })) })),
  });
  const candidateId = "ema10-30-70-cycle10-30";
  const candidateTarget = variants.get(candidateId)!;
  const trendTarget = active(buildTrendTarget(input.bars, "ema10-30"));
  const fillsByTime = new Map(results[candidateId]!.rebalances.map(fill => [fill.time, fill]));
  const rows = ["date,cycle10_target,ema10_over_ema30_target,combined_target,previous_combined_target,actual_pretrade_allocation,trade_direction"];
  for (let i = start; i < input.bars.length; i += 1) {
    const fill = fillsByTime.get(input.bars[i]!.time);
    rows.push([input.bars[i]!.time, baseline.target[i], trendTarget[i], candidateTarget[i], candidateTarget[i - 1] ?? 0,
      fill?.fromAllocation ?? "", fill ? (fill.targetAllocation > fill.fromAllocation ? "increase" : "reduce") : "hold"]
      .map(value => typeof value === "number" ? Number(value.toFixed(6)) : value).join(","));
  }
  const csvPath = join(root, "output/allocation-plan.csv");
  await writeFile(`${csvPath}.tmp`, `${rows.join("\n")}\n`);
  await replaceFileAtomically(`${csvPath}.tmp`, csvPath);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
