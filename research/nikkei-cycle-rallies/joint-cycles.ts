import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getStrategy, type StrategyId, type StrategyParameters } from "../../lib/analysis/strategies";
import { createBacktestExecutionContext, runAllocationBacktest, type BacktestSettings, type AllocationTimelineReader } from "../../lib/analysis/backtest";
import { runStrategyCycleCloseBacktest, type StrategyCycleSelectionSnapshot } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import { indicatorStates } from "./regime-detection";
import { rallyWindows, segmentReturn } from "./analyze";

const root = dirname(fileURLToPath(import.meta.url));
const model = "joint-cycles-v1";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
export interface Candidate { id: StrategyId; parameters: StrategyParameters; key: string }
export function jointCandidates(): Candidate[] {
  const candidates = new Map<string, Candidate>();
  const add = (id: StrategyId, parameters: StrategyParameters) => {
    const key = `${id}:${JSON.stringify(parameters)}`; candidates.set(key, { id, parameters, key });
  };
  for (const id of ["sma-cross", "ema-cross", "macd-momentum", "donchian-breakout", "supertrend-trend", "ichimoku-trend", "roc-momentum"] as const) add(id, getStrategy(id).defaultParameters);
  for (const [fast, slow] of [[5, 20], [20, 60], [20, 120], [50, 200]]) add("sma-cross", { fast: fast!, slow: slow! });
  for (const [fast, slow] of [[5, 20], [10, 30], [20, 60]]) add("ema-cross", { fast: fast!, slow: slow! });
  for (const period of [10, 20, 60]) add("roc-momentum", { period, entry: 0, exit: 0 });
  for (const entryPeriod of [10, 40]) add("donchian-breakout", { entryPeriod, exitPeriod: entryPeriod / 2 });
  for (const multiplier of [2, 4]) add("supertrend-trend", { period: 14, multiplier });
  add("macd-momentum", { fast: 6, slow: 19, signal: 5 });
  return [...candidates.values()].sort((a, b) => a.key.localeCompare(b.key));
}
export type JointRule = "agreement" | "weighted50" | "weighted30";
export function jointDecisionTargets(a: readonly number[], b: readonly number[], c: readonly number[], technical: readonly number[], start: number, rule: JointRule) {
  if (![b, c, technical].every(values => values.length === a.length)) throw new Error("Evidence alignment mismatch");
  const target = new Array<number>(a.length).fill(0), scores = new Array<number>(a.length).fill(0);
  let inherited = 0, weakCount = 0;
  for (let i = start; i < a.length; i += 1) {
    const score = rule === "weighted30" ? 30 * a[i]! + 30 * b[i]! + 30 * c[i]! + 10 * technical[i]! :
      rule === "weighted50" ? 50 * a[i]! + 20 * b[i]! + 20 * c[i]! + 10 * technical[i]! : 50 * b[i]! + 50 * c[i]!;
    const strong = rule === "agreement" ? b[i]! >= 0.5 && c[i]! >= 0.5 : score >= (rule === "weighted30" ? 60 : 50);
    const weak = rule === "agreement" ? b[i]! < 0.5 && c[i]! < 0.5 : score <= 20;
    weakCount = weak ? weakCount + 1 : 0;
    inherited = strong ? 1 : weakCount >= 2 ? a[i]! : Math.max(inherited, a[i]!);
    scores[i] = score; target[i] = inherited;
  }
  return { target, scores };
}
async function atomic(path: string, object: unknown) {
  await mkdir(dirname(path), { recursive: true }); await writeFile(`${path}.tmp`, `${JSON.stringify(object)}\n`);
  await replaceFileAtomically(`${path}.tmp`, path);
}
interface Selection { index: number; time: string; period: number; candidate: number; rankingReturn: number }
async function main() {
  const inputText = await readFile(join(root, "data/input.json"), "utf8");
  const input = JSON.parse(inputText) as { bars: MarketBar[]; barsHash: string; snapshots: StrategyCycleSelectionSnapshot[]; evaluationSessions: number; settings: BacktestSettings };
  const { bars, settings } = input;
  if (bars.length > 10000 || input.snapshots.length > 2048 || hash(JSON.stringify(bars)) !== input.barsHash) throw new Error("Frozen input failed integrity check");
  const candidates = jointCandidates();
  const targetSeries = candidates.map(candidate => getStrategy(candidate.id).buildTarget(bars, candidate.parameters));
  const sourceHash = hash(inputText), designHash = hash(await readFile(join(root, "JOINT_DESIGN.md"), "utf8"));
  const fingerprint = hash(JSON.stringify({ model, sourceHash, designHash, candidates }));
  const start = bars.length - input.evaluationSessions, periods = [20, 40, 60, 80, 120];
  const statePath = join(root, "data/joint-state.json");
  let state: { fingerprint: string; completed: number[] } = { fingerprint, completed: [] };
  try {
    state = JSON.parse(await readFile(statePath, "utf8"));
    if (state.fingerprint !== fingerprint) throw new Error("Joint selection checkpoint incompatible");
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const selections: Selection[] = [];
  let interrupted = false;
  process.on("SIGINT", () => { interrupted = true; });
  for (const snapshot of input.snapshots) {
    const index = snapshot.decisionIndex;
    const path = join(root, `output/joint-selections/${index}.json`);
    if (state.completed.includes(index)) selections.push(...JSON.parse(await readFile(path, "utf8")) as Selection[]);
    else {
      const prefix = bars.slice(0, index + 1);
      const local: Selection[] = [];
      for (const period of periods) {
        const rankingSettings = { ...settings, startTime: prefix[index - period + 1]!.time, endTime: prefix[index]!.time,
          executionPolicy: "next-open" as const, summaryOnly: true };
        const context = createBacktestExecutionContext(prefix, rankingSettings);
        let winner = 0, best = -Infinity;
        for (let n = 0; n < candidates.length; n += 1) {
          const series = targetSeries[n]!;
          const reader: AllocationTimelineReader = { length: prefix.length, stateAt: i => ({ targetAllocation: series[i] ?? 0, signals: [], intrabarExecutions: [] }) };
          const result = runAllocationBacktest(prefix, reader, { ...rankingSettings, executionContext: context });
          if (result.totalReturn > best + 1e-10) { best = result.totalReturn; winner = n; }
        }
        local.push({ index, time: snapshot.decisionTime, period, candidate: winner, rankingReturn: best });
      }
      await atomic(path, local); selections.push(...local);
      state.completed.push(index); await atomic(statePath, state);
    }
    if (state.completed.length % 40 === 0) console.log(`Screened ${state.completed.length}/${input.snapshots.length} dates`);
    if (interrupted) { console.log("Stopped after committed decision, rerun resumes"); return; }
  }
  const evidence = new Map<number, number[]>();
  for (const period of periods) {
    const byIndex = new Map(selections.filter(s => s.period === period).map(s => [s.index, s]));
    const values = new Array<number>(bars.length).fill(0);
    let selected = -1;
    for (let i = start; i < bars.length; i += 1) {
      if (byIndex.has(i)) selected = byIndex.get(i)!.candidate;
      values[i] = selected < 0 ? 0 : targetSeries[selected]![i]!;
    }
    evidence.set(period, values);
  }
  const baseline = JSON.parse(await readFile(join(root, "output/cycle10.json"), "utf8"));
  const fills = new Map<string, number>(baseline.rebalances.map((fill: { time: string; targetAllocation: number }) => [fill.time, fill.targetAllocation]));
  const a = new Array<number>(bars.length).fill(0);
  let inherited = 0;
  for (let i = start; i < bars.length; i += 1) { inherited = fills.get(bars[i]!.time) ?? inherited; a[i] = inherited; }
  const check = runStrategyCycleCloseBacktest(bars, a, settings);
  if (Math.abs(check.totalReturn - baseline.totalReturn) > 1e-9) throw new Error("Ten-session baseline tie-out failed");
  const indicators = indicatorStates(bars);
  const technical = indicators.map((s, i) => s.sma20 !== null && bars[i]!.close > s.sma20 && s.slope20 !== null && s.slope20 > 0 ? 1 : 0);
  const summary: Record<string, unknown> = {};
  const allTargets: Record<string, ReturnType<typeof jointDecisionTargets>> = {};
  for (const [b, c] of [[20, 40], [40, 80], [60, 120]]) {
    for (const rule of ["agreement", "weighted50", "weighted30"] as const) {
      const id = `${b}-${c}-${rule}`;
      const decision = jointDecisionTargets(a, evidence.get(b!)!, evidence.get(c!)!, technical, start, rule);
      allTargets[id] = decision;
      const result = runStrategyCycleCloseBacktest(bars, decision.target, settings);
      const next = runAllocationBacktest(bars, decision.target, { ...settings, executionPolicy: "next-open" });
      const segments = rallyWindows.map(([from, to]) => ({ from, to, return: segmentReturn(result.equity, from, to),
        firstFullTarget: bars.find((bar, i) => bar.time >= from && bar.time <= to && decision.target[i] === 1)?.time ?? null }));
      const metrics = { totalReturn: result.totalReturn, maxDrawdown: result.maxDrawdown, tradeCount: result.tradeCount,
        nextOpenReturn: next.totalReturn, nextOpenMaxDrawdown: next.maxDrawdown, segments };
      summary[id] = metrics;
      await atomic(join(root, `output/joint/${id}.json`), { ...metrics, equity: result.equity, rebalances: result.rebalances });
      console.log(`${id}: ${result.totalReturn.toFixed(3)}%, DD ${result.maxDrawdown.toFixed(3)}%, rallies ${segments.map(s => s.return.toFixed(2)).join("/")}`);
    }
  }
  await atomic(join(root, "output/joint-summary.json"), { model, fingerprint, sourceHash, designHash,
    start: settings.startTime, end: settings.endTime, candidateCount: candidates.length, candidates, screeningDates: input.snapshots.length,
    rankingExecution: "next-open", replayExecution: "Nikkei close proxy", actualTenSessionBaselinePreserved: true,
    retrospective: true, prototypeScope: "Registered standalone trend menu; not the exhaustive full-family/combinations engine", variants: summary });
  const selectedByPeriod = new Map(periods.map(period => [period, new Map(selections.filter(s => s.period === period).map(s => [s.index, s]))]));
  const rows = ["date,cycle10_target,long20_vote,long40_vote,long60_vote,long80_vote,long120_vote,technical_vote,score_40_80_weighted50,final_target_40_80_weighted50,selected40,selected80"];
  const picked = new Map<number, number>();
  for (let i = start; i < bars.length; i += 1) {
    for (const period of periods) if (selectedByPeriod.get(period)!.has(i)) picked.set(period, selectedByPeriod.get(period)!.get(i)!.candidate);
    rows.push([bars[i]!.time, a[i], ...periods.map(p => evidence.get(p)![i]), technical[i], allTargets["40-80-weighted50"]!.scores[i],
      allTargets["40-80-weighted50"]!.target[i], candidates[picked.get(40)!]!.key.replaceAll('"', "'").replaceAll(",", ";"),
      candidates[picked.get(80)!]!.key.replaceAll('"', "'").replaceAll(",", ";")]
      .map(value => typeof value === "number" ? Number(value.toFixed(6)) : value).join(","));
  }
  const csv = join(root, "output/joint-decision-plan.csv"); await writeFile(`${csv}.tmp`, `${rows.join("\n")}\n`); await replaceFileAtomically(`${csv}.tmp`, csv);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
