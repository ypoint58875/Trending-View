import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, stat, readdir, copyFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serialize, deserialize } from "node:v8";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import { unpackMarketBars } from "../../lib/analysis/screening-worker-bars";
import { hashMarketBars } from "../../lib/analysis/screening-worker-client";
import { screeningResultPlan } from "../../lib/analysis/screening-plan";
import { selectBestShortcutScreeningResult } from "../../lib/analysis/shortcut-batch-screening";
import { buildStrategyCycleRollingSchedule, strategyCycleRecentSignals, strategyCycleSignalDirection,
  runStrategyCycleCloseBacktest, NIKKEI_CYCLE_MODEL, NIKKEI_CYCLE_CONFLICT_POLICY,
  type StrategyCycleRecentSignal, type StrategyCycleSelectionSnapshot } from "../../lib/analysis/strategy-cycle-validation";
import { SmaPositionOverlay, MIXED_POSITION_OVERLAY_MODEL } from "../../lib/analysis/sma-position-overlay";
import { runAllocationBacktest, type BacktestSettings } from "../../lib/analysis/backtest";
import { averageSlopes } from "../nikkei-cycle-rallies/ma-type";
import type { MarketBar } from "../../lib/market/types";
import type { ScreeningValidationOutcome } from "../../lib/analysis/screening-validation";

export const root = dirname(fileURLToPath(import.meta.url));
const project = resolve(root, "../..");
const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const model = `${NIKKEI_CYCLE_MODEL}:${NIKKEI_CYCLE_CONFLICT_POLICY}:overlay-stability-v1`;
const sessions = 2000, warmup = 756, holdout = 1500;
export const lookbacks = [63, 126, 252, 504, 756];
export const cadences = [5, 10, 20, 40, 60, 120, 252];
export type Score = "return" | "stability";
export interface Parameters { entry: number; exit: number; gate: number; threshold: number; flags: number }
export const current: Parameters = { entry: 7, exit: 11, gate: 14, threshold: 0.00125, flags: 7 };
export const parameterId = (p: Parameters) => `EMA${p.entry}-SMA${p.exit}-WMA${p.gate}-t${p.threshold}-f${p.flags}`;
export function menu(): Parameters[] {
  const result = new Map<string, Parameters>();
  for (let entry = 7; entry <= 15; entry++) for (let exit = 7; exit <= 15; exit++) for (let gate = 7; gate <= 15; gate++)
    for (const threshold of [0.00025, 0.0005, 0.00075, 0.001, 0.00125, 0.0015, 0.00175, 0.002]) {
      const p = { entry, exit, gate, threshold, flags: 7 }; result.set(parameterId(p), p);
    }
  for (let flags = 0; flags <= 7; flags++) { const p = { ...current, flags }; result.set(parameterId(p), p); }
  return [...result.values()].sort((a, b) => parameterId(a).localeCompare(parameterId(b)));
}
export async function atomic(path: string, value: unknown, binary = false) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, binary ? serialize(value) : JSON.stringify(value) + "\n");
  await replaceFileAtomically(`${path}.tmp`, path);
}
async function bounded(path: string, max = 16 * 1024 * 1024) {
  if ((await stat(path)).size > max) throw new Error(`Input exceeds size limit: ${path}`);
  return readFile(path);
}
async function exists(path: string) { return stat(path).then(() => true, e => { if (e.code === "ENOENT") return false; throw e; }); }
let stopping = false;
function guard() {
  if (stopping) throw new Error("Interrupted safely; rerun the same command to resume committed work");
  if (process.memoryUsage().rss > 1.5 * 1024 ** 3) throw new Error("RSS exceeds 1.5 GiB; committed work is safe. Close other compute and resume with a smaller grid chunk.");
}
interface Source { job: string; index: number; requestHash: string; resultHash: string; libraryHash: string; candidates: number }
interface Input { model: string; bars: MarketBar[]; barsHash: string; snapshots: StrategyCycleSelectionSnapshot[];
  sources: Source[]; settings: BacktestSettings; evaluationSessions: number; accessedAt: string }
export function validateIdentity(value: { sourceHash: string; designHash: string }, sourceHash: string, designHash: string) {
  if (value.sourceHash !== sourceHash || value.designHash !== designHash) throw new Error("Incompatible research checkpoint; preserve frozen input and regenerate the derived cache explicitly");
}
async function collect(): Promise<Input> {
  const frozen = join(root, "data/input.json");
  if (await exists(frozen)) {
    const input = JSON.parse((await bounded(frozen, 32 * 1024 * 1024)).toString()) as Input;
    if (input.model !== model || input.evaluationSessions !== sessions || input.barsHash !== sha(JSON.stringify(input.bars))) throw new Error("Frozen input is incompatible");
    return input;
  }
  const engine = join(project, "data/state/screening-engine");
  const batches = (await readdir(engine)).filter(n => /^batch-[a-f0-9]{24}$/.test(n));
  const available = new Map<number, { job: string; request: Record<string, any>; bytes: Buffer; modified: number }>();
  let barPath = "";
  for (const batch of batches) {
    const q = JSON.parse((await bounded(join(engine, batch, "queue.json"))).toString());
    if (!Array.isArray(q.jobIds) || q.jobIds.length > 2048) throw new Error("Invalid queue size");
    for (const job of q.jobIds as string[]) {
      if (!/^[a-f0-9]{24}$/.test(job)) throw new Error("Invalid source job");
      const path = join(engine, job, "request.json"), bytes = await bounded(path);
      const request = JSON.parse(bytes.toString()), match = request.checkpoint?.key?.match(/^screening:cycle:index:N225:(\d+):10$/);
      if (!match || !request.options?.quickScreening) continue;
      const index = Number(match[1]), modified = (await stat(path)).mtimeMs;
      if (!available.has(index) || modified > available.get(index)!.modified) available.set(index, { job, request, bytes, modified });
      if (index === 4565) barPath = join(engine, batch, "bars.bin");
    }
  }
  if (!barPath) throw new Error("The 2000-session quick-screen source is unavailable");
  const rawBars = await bounded(barPath), bars = unpackMarketBars(deserialize(rawBars));
  if (bars.length > 10000) throw new Error("Too many bars");
  const schedule = buildStrategyCycleRollingSchedule(bars, sessions, 10);
  if (!schedule || schedule.decisionIndexes.length > 2048) throw new Error("Invalid source schedule");
  const snapshots: Input["snapshots"] = [], sources: Source[] = [];
  let settings: BacktestSettings | undefined;
  for (const index of schedule.decisionIndexes) {
    guard();
    const record = available.get(index);
    if (!record) throw new Error(`Missing original screening decision ${index}`);
    const { request, job, bytes } = record, sig = JSON.parse(request.checkpoint.signature);
    if (request.barCount !== index + 1 || sig.barCount !== index + 1 || sig.barsHash !== hashMarketBars(bars.slice(0, index + 1)) ||
      request.settings.endTime !== bars[index]!.time || request.options.objective !== "totalReturn" ||
      request.settings.commissionRate !== 0.0003 || request.settings.slippageRate !== 0.0002 || request.settings.positionOverlay) throw new Error(`Source settings/prefix differ: ${job}`);
    const resultBytes = await bounded(join(engine, job, "result.json"));
    const outcome = JSON.parse(resultBytes.toString()) as ScreeningValidationOutcome;
    const best = selectBestShortcutScreeningResult(outcome.singleResults, outcome.results, "totalReturn");
    if (outcome.failedCount || outcome.cancelled || !best) throw new Error(`Incomplete source result: ${job}`);
    const plan = screeningResultPlan(best.result);
    if (plan.positionOverlay) throw new Error("Source winner unexpectedly embeds report overlays");
    snapshots.push({ decisionIndex: index, decisionTime: bars[index]!.time, screeningWindow: 10, plan,
      fixedRelativeLongStrategy: best.kind === "combination" ? best.result.relativeLongStrategy : null, label: job });
    sources.push({ job, index, requestHash: sha(bytes), resultHash: sha(resultBytes), libraryHash: sha(JSON.stringify(sig.candidates)), candidates: sig.candidates.length });
    settings = request.settings;
  }
  const input: Input = { model, bars, barsHash: sha(JSON.stringify(bars)), snapshots, sources, evaluationSessions: sessions,
    accessedAt: new Date().toISOString(), settings: { ...settings!, startTime: bars[schedule.evaluationStartIndex]!.time, endTime: bars.at(-1)!.time } };
  await mkdir(join(root, "data/raw"), { recursive: true });
  await copyFile(barPath, join(root, "data/raw/bars.bin"));
  await atomic(frozen, input);
  await writeFile(join(root, "data/source_registry.jsonl"), JSON.stringify({ accessedAt: input.accessedAt, source: "local completed quick-screen jobs",
    symbol: "^N225", sessions, barsHash: input.barsHash, rawBarsHash: sha(rawBars), jobCount: sources.length,
    endpoint: "local data/state/screening-engine/{job}/request.json and result.json", parameters: { window: 10, objective: "totalReturn", quickScreening: true } }) + "\n");
  return input;
}

type Feature = ReturnType<typeof averageSlopes>;
export class Features {
  private cache = new Map<string, Feature>();
  private closes: number[];
  constructor(bars: MarketBar[]) { this.closes = bars.map(b => b.close); }
  get(type: "EMA" | "SMA" | "WMA", period: number) {
    const id = `${type}${period}`;
    if (!this.cache.has(id)) this.cache.set(id, averageSlopes(this.closes, period, type));
    return this.cache.get(id)!;
  }
}
/** Configurable research analogue; production parity is checked for all 8 flags. */
export class Account {
  allocation = 0;
  pending: number | null = null;
  step(i: number, signals: readonly StrategyCycleRecentSignal[], p: Parameters, f: Features) {
    const direction = strategyCycleSignalDirection(signals), allowed = !(p.flags & 4) || (f.get("WMA", p.gate).sign[i] ?? -1) >= 0;
    if (direction === "increase") {
      this.pending = null;
      if (this.allocation > 1e-10 || allowed) this.allocation = Math.max(this.allocation, Math.min(1, Math.max(0, signals.at(-1)!.targetAllocation)));
    } else if (direction === "reduce") {
      const target = Math.min(1, Math.max(0, signals.at(-1)!.targetAllocation));
      if (target < this.allocation - 1e-10) this.pending = Math.min(this.pending ?? this.allocation, target);
    }
    if (this.pending !== null && !((p.flags & 2) && (f.get("SMA", p.exit).slope[i] ?? -Infinity) > p.threshold)) {
      this.allocation = Math.min(this.allocation, this.pending); this.pending = null;
    }
    if ((p.flags & 1) && this.allocation <= 1e-10 && signals.length === 0 && f.get("EMA", p.entry).turns[i] && allowed) {
      this.allocation = 1; this.pending = null;
    }
    return this.allocation;
  }
}
export function targets(bars: MarketBar[], decisions: ReadonlyMap<number, readonly StrategyCycleRecentSignal[]>, start: number,
  parameters: Parameters | ((offset: number) => Parameters), features = new Features(bars), end = bars.length) {
  const account = new Account(), target = bars.map(() => 0);
  for (let i = start; i < end; i++) target[i] = account.step(i, decisions.get(i) ?? [], typeof parameters === "function" ? parameters(i - start) : parameters, features);
  return target;
}
async function signalCache(input: Input, sourceHash: string) {
  const path = join(root, "data/signals.json");
  const implementation = sha((await Promise.all(["lib/analysis/strategy-cycle-validation.ts", "lib/analysis/strategy-combinations.ts", "lib/analysis/strategies.ts"].map(p => readFile(join(project, p), "utf8")))).join("\n"));
  let rows: { index: number; signals: StrategyCycleRecentSignal[] }[] = [];
  if (await exists(path)) {
    const saved = JSON.parse((await bounded(path)).toString());
    validateIdentity(saved, sourceHash, implementation); rows = saved.rows;
    if (!Array.isArray(rows) || rows.length > input.snapshots.length || rows.some((r, i) => r.index !== input.snapshots[i]!.decisionIndex)) throw new Error("Signal checkpoint coverage mismatch");
  }
  for (let n = rows.length; n < input.snapshots.length; n++) {
    guard();
    const s = input.snapshots[n]!;
    rows.push({ index: s.decisionIndex, signals: strategyCycleRecentSignals(input.bars, s, s.decisionIndex) });
    if (rows.length % 32 === 0 || rows.length === input.snapshots.length) {
      await atomic(path, { sourceHash, designHash: implementation, rows });
      console.log(`Signals ${rows.length}/${input.snapshots.length}; RSS ${(process.memoryUsage().rss / 1024 ** 2).toFixed(0)} MiB`);
    }
  }
  return new Map(rows.map(r => [r.index, r.signals]));
}
export function pathMetrics(prefix: ArrayLike<number>, from: number, to: number) {
  const base = prefix[from]!, end = prefix[to]!;
  let peak = base, maxDrawdown = 0;
  for (let i = from + 1; i <= to; i++) { peak = Math.max(peak, prefix[i]!); maxDrawdown = Math.min(maxDrawdown, Math.expm1(prefix[i]! - peak) * 100); }
  return { totalReturn: Math.expm1(end - base) * 100, maxDrawdown };
}
export function calibrationScore(prefix: ArrayLike<number>, end: number, lookback: number, method: Score) {
  if (end < lookback || end >= prefix.length) throw new Error("Invalid calibration boundary");
  const begin = end - lookback;
  if (method === "return") return prefix[end]! - prefix[begin]!;
  const middle = begin + Math.floor(lookback / 2);
  return 2 * Math.min(prefix[middle]! - prefix[begin]!, prefix[end]! - prefix[middle]!);
}
export function choose(prefixes: readonly Float64Array[], parameters: readonly Parameters[], end: number, lookback: number, method: Score) {
  let best = 0, bestScore = -Infinity;
  for (let j = 0; j < parameters.length; j++) {
    const score = calibrationScore(prefixes[j]!, end, lookback, method);
    if (score > bestScore + 1e-12 || (Math.abs(score - bestScore) <= 1e-12 && parameterId(parameters[j]!) < parameterId(parameters[best]!))) { best = j; bestScore = score; }
  }
  return best;
}
function prefixFromEquity(equity: { equity: number }[], initialCash: number) {
  const prefix = new Float64Array(equity.length + 1);
  for (let i = 0; i < equity.length; i++) prefix[i + 1] = Math.log(equity[i]!.equity / initialCash);
  return prefix;
}
const percent = (n: number) => `${n.toFixed(2)}%`;
const columns = (rows: Record<string, unknown>[]) => {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]!);
  const cell = (v: unknown) => '"' + String(v ?? "").replaceAll('"', '""') + '"';
  return [keys.map(cell).join(","), ...rows.map(r => keys.map(k => cell(r[k])).join(","))].join("\n") + "\n";
};
async function csv(name: string, rows: Record<string, unknown>[]) {
  const path = join(root, `output/${name}.csv`); await writeFile(`${path}.tmp`, columns(rows)); await replaceFileAtomically(`${path}.tmp`, path);
}
interface Policy { lookback: number; cadence: number; score: Score }
function policyId(p: Policy) { return `${p.score}-L${p.lookback}-U${p.cadence}`; }

async function main() {
  process.on("SIGINT", () => { stopping = true; }); process.on("SIGTERM", () => { stopping = true; });
  const input = await collect(), { bars, settings } = input, start = bars.length - sessions;
  const sourceHash = sha(JSON.stringify(input));
  const designHash = sha((await Promise.all([join(root, "DESIGN.md"), fileURLToPath(import.meta.url),
    join(project, "lib/analysis/backtest.ts"), join(project, "lib/analysis/indicators.ts")].map(p => readFile(p, "utf8")))).join("\n"));
  const decisions = await signalCache(input, sourceHash), features = new Features(bars);
  console.log(`Source ${settings.startTime}..${settings.endTime}, ${decisions.size} decisions`);
  const parameters = menu(), prefixes: Float64Array[] = [], fixed: Record<string, unknown>[] = [];
  const baselineRows = [];
  for (let flags = 0; flags <= 7; flags++) {
    const p = { ...current, flags }, actual = targets(bars, decisions, start, p, features);
    const controller = new SmaPositionOverlay(bars, { model: MIXED_POSITION_OVERLAY_MODEL, supplementalEntry: !!(flags & 1), exitGuard: !!(flags & 2), entrySlopeGate: !!(flags & 4) });
    for (let i = start; i < bars.length; i++) {
      const signals = decisions.get(i) ?? [], direction = strategyCycleSignalDirection(signals);
      if (direction) controller.request(direction, signals.at(-1)!.targetAllocation, i);
      assert.equal(controller.close(i, signals.length > 0), actual[i], `Production parity flags ${flags}, index ${i}`);
    }
    const result = runStrategyCycleCloseBacktest(bars, actual, settings);
    baselineRows.push({ id: parameterId(p), flags, totalReturn: result.totalReturn, maxDrawdown: result.maxDrawdown, rebalances: result.rebalances.length });
    await atomic(join(root, `output/control-f${flags}.json`), { sourceHash, designHash, parameters: p, ...result });
  }
  for (let offset = 0; offset < parameters.length; offset += 128) {
    guard();
    const path = join(root, `output/cache/grid-${offset}.bin`);
    let chunk: { sourceHash: string; designHash: string; offset: number; ids: string[]; prefixes: Float64Array[]; rows: Record<string, unknown>[] };
    if (await exists(path)) {
      chunk = deserialize(await bounded(path, 4 * 1024 * 1024)); validateIdentity(chunk, sourceHash, designHash);
      if (chunk.offset !== offset || JSON.stringify(chunk.ids) !== JSON.stringify(parameters.slice(offset, offset + 128).map(parameterId)) ||
        chunk.prefixes.length !== chunk.ids.length || chunk.prefixes.some(p => p.length !== sessions + 1 || [...p].some(v => !Number.isFinite(v)))) throw new Error("Invalid grid chunk");
    } else {
      chunk = { sourceHash, designHash, offset, ids: [], prefixes: [], rows: [] };
      for (const p of parameters.slice(offset, offset + 128)) {
        const result = runStrategyCycleCloseBacktest(bars, targets(bars, decisions, start, p, features), settings);
        const prefix = prefixFromEquity(result.equity, settings.initialCash);
        if (prefix.length !== sessions + 1) throw new Error("Equity range mismatch");
        const row: Record<string, unknown> = { id: parameterId(p), ...p, totalReturn: result.totalReturn, maxDrawdown: result.maxDrawdown, rebalances: result.rebalances.length };
        for (let block = 0; block < 4; block++) row[`block${block + 1}Return`] = pathMetrics(prefix, block * 500, (block + 1) * 500).totalReturn;
        chunk.ids.push(parameterId(p)); chunk.prefixes.push(prefix); chunk.rows.push(row);
      }
      await atomic(path, chunk, true);
    }
    prefixes.push(...chunk.prefixes); fixed.push(...chunk.rows);
    console.log(`Grid ${prefixes.length}/${parameters.length}; RSS ${(process.memoryUsage().rss / 1024 ** 2).toFixed(0)} MiB`);
  }
  const currentIndex = parameters.findIndex(p => parameterId(p) === parameterId(current));
  const noOverlayIndex = parameters.findIndex(p => p.flags === 0);
  const holdingTarget = bars.map((_, i) => i >= start ? 1 : 0);
  const holdingResult = runStrategyCycleCloseBacktest(bars, holdingTarget, settings);
  const holdingPrefix = prefixFromEquity(holdingResult.equity, settings.initialCash);
  const summaryOf = (prefix: ArrayLike<number>) => ({ full: pathMetrics(prefix, 0, sessions), common: pathMetrics(prefix, warmup, sessions),
    development: pathMetrics(prefix, warmup, holdout), final500: pathMetrics(prefix, holdout, sessions),
    blocks: [0, 1, 2, 3].map(n => ({ from: bars[start + n * 500]!.time, to: bars[start + (n + 1) * 500 - 1]!.time, ...pathMetrics(prefix, n * 500, (n + 1) * 500) })) });
  const controls = { current: summaryOf(prefixes[currentIndex]!), noOverlay: summaryOf(prefixes[noOverlayIndex]!), holding: summaryOf(holdingPrefix) };
  const policies: (Policy & { id: string; developmentReturn: number; developmentDrawdown: number; commonReturn: number; commonDrawdown: number; final500Return: number; final500Drawdown: number; changes: number })[] = [];
  const policyPaths = new Map<string, { target: number[]; prefix: Float64Array; selections: Record<string, unknown>[] }>();
  for (const score of ["return", "stability"] as Score[]) for (const lookback of lookbacks) for (const cadence of cadences) {
    guard();
    const policy: Policy = { score, lookback, cadence }, selections: Record<string, unknown>[] = [];
    let active = current;
    const target = targets(bars, decisions, start, offset => {
      if (offset >= warmup && (offset - warmup) % cadence === 0) {
        active = parameters[choose(prefixes, parameters, offset, lookback, score)]!;
        selections.push({ offset, decisionTime: bars[start + offset]!.time, trainingStart: bars[start + offset - lookback]!.time,
          trainingEnd: bars[start + offset - 1]!.time, id: parameterId(active), ...active });
      }
      return active;
    }, features);
    const result = runStrategyCycleCloseBacktest(bars, target, settings), prefix = prefixFromEquity(result.equity, settings.initialCash);
    const dev = pathMetrics(prefix, warmup, holdout), common = pathMetrics(prefix, warmup, sessions), final = pathMetrics(prefix, holdout, sessions);
    const id = policyId(policy);
    policies.push({ ...policy, id, developmentReturn: dev.totalReturn, developmentDrawdown: dev.maxDrawdown,
      commonReturn: common.totalReturn, commonDrawdown: common.maxDrawdown, final500Return: final.totalReturn, final500Drawdown: final.maxDrawdown,
      changes: selections.filter((s, i) => i === 0 || s.id !== selections[i - 1]!.id).length });
    policyPaths.set(id, { target, prefix, selections });
  }
  policies.sort((a, b) => b.developmentReturn - a.developmentReturn || a.id.localeCompare(b.id));
  const selected = policies[0]!, selectedPath = policyPaths.get(selected.id)!;
  const fixedDevelopment = parameters.map((p, j) => ({ p, j, score: calibrationScore(prefixes[j]!, holdout, holdout, "return") }))
    .sort((a, b) => b.score - a.score || parameterId(a.p).localeCompare(parameterId(b.p)))[0]!;
  const fullBest = [...fixed].sort((a, b) => Number(b.totalReturn) - Number(a.totalReturn) || String(a.id).localeCompare(String(b.id)))[0]!;
  const ageRows: Record<string, unknown>[] = [];
  for (const score of ["return", "stability"] as Score[]) for (const lookback of lookbacks) {
    guard();
    const buckets = [[0, 20], [20, 40], [40, 60], [60, 120], [120, 252]];
    const observations = buckets.map(() => [] as { rule: number; current: number; holding: number }[]);
    for (let anchor = warmup; anchor + 252 <= sessions; anchor += 20) {
      const p = parameters[choose(prefixes, parameters, anchor, lookback, score)]!;
      const from = start + anchor, to = from + 252, localSettings = { ...settings, startTime: bars[from]!.time, endTime: bars[to - 1]!.time };
      const paths = [p, current].map(x => prefixFromEquity(runStrategyCycleCloseBacktest(bars,
        targets(bars, decisions, from, x, features, to), localSettings).equity, settings.initialCash));
      const hp = prefixFromEquity(runStrategyCycleCloseBacktest(bars, bars.map((_, i) => i >= from && i < to ? 1 : 0), localSettings).equity, settings.initialCash);
      buckets.forEach(([a, b], k) => observations[k]!.push({ rule: pathMetrics(paths[0]!, a!, b!).totalReturn,
        current: pathMetrics(paths[1]!, a!, b!).totalReturn, holding: pathMetrics(hp, a!, b!).totalReturn }));
    }
    observations.forEach((values, k) => {
      const mean = (key: "rule" | "current" | "holding") => values.reduce((s, v) => s + v[key], 0) / values.length;
      ageRows.push({ score, lookback, ageFrom: buckets[k]![0]! + 1, ageTo: buckets[k]![1], vintages: values.length,
        meanReturn: mean("rule"), meanCurrentReturn: mean("current"), meanHoldingReturn: mean("holding"),
        excessCurrent: mean("rule") - mean("current"), excessHolding: mean("rule") - mean("holding"),
        beatCurrentPercent: values.filter(v => v.rule > v.current).length / values.length * 100 });
    });
  }
  const selectedParameters = parameters.find(p => parameterId(p) === fullBest.id)!;
  const sensitivities = [];
  for (const [id, target] of [["current", targets(bars, decisions, start, current, features)],
    ["development-selected-policy", selectedPath.target], ["full-sample-best-diagnostic", targets(bars, decisions, start, selectedParameters, features)], ["holding", holdingTarget]] as [string, number[]][]) {
    for (const extraBps of [0, 5, 10]) {
      const s = { ...settings, commissionRate: settings.commissionRate + extraBps / 10000 };
      for (const execution of ["close-proxy", "next-open"] as const) {
        const result = execution === "close-proxy" ? runStrategyCycleCloseBacktest(bars, target, s) : runAllocationBacktest(bars, target, { ...s, executionPolicy: "next-open" });
        const prefix = prefixFromEquity(result.equity, settings.initialCash);
        sensitivities.push({ id, extraBps, execution, totalReturn: result.totalReturn, maxDrawdown: result.maxDrawdown,
          commonReturn: pathMetrics(prefix, warmup, sessions).totalReturn, final500Return: pathMetrics(prefix, holdout, sessions).totalReturn });
      }
    }
  }
  const libraryRanges: { from: string; to: string; count: number; candidates: number; libraryHash: string }[] = [];
  for (const s of input.sources) {
    const last = libraryRanges.at(-1);
    if (last?.libraryHash === s.libraryHash) { last.to = bars[s.index]!.time; last.count++; }
    else libraryRanges.push({ from: bars[s.index]!.time, to: bars[s.index]!.time, count: 1, candidates: s.candidates, libraryHash: s.libraryHash });
  }
  const summary = { sourceHash, designHash, model, accessedAt: input.accessedAt, settings, sessions, decisions: decisions.size,
    candidateCount: parameters.length, policyCount: policies.length, commonStart: bars[start + warmup]!.time, final500Start: bars[start + holdout]!.time,
    productionParity: "All 8 flag combinations, all 2000 targets", libraryRanges, controls, ablations: baselineRows,
    fullBestDiagnostic: fullBest, fixedDevelopmentSelected: { parameters: fixedDevelopment.p, ...summaryOf(prefixes[fixedDevelopment.j]!) },
    selectedPolicy: selected, selectedPolicyMetrics: summaryOf(selectedPath.prefix), policies, ageRows, sensitivities };
  await atomic(join(root, "output/summary.json"), summary);
  await csv("fixed-grid", fixed); await csv("walk-forward", policies.map(p => ({ ...p }))); await csv("parameter-age", ageRows); await csv("cost-timing", sensitivities);
  await csv("selected-policy-decisions", selectedPath.selections);
  const blockRows = ["current", "noOverlay", "holding"].flatMap(key => controls[key as keyof typeof controls].blocks.map((b, i) => ({ method: key, block: i + 1, ...b })));
  await csv("segments", blockRows);
  await csv("daily-equity", bars.slice(start).map((b, i) => ({ time: b.time, current: Math.exp(prefixes[currentIndex]![i + 1]!),
    noOverlay: Math.exp(prefixes[noOverlayIndex]![i + 1]!), holding: Math.exp(holdingPrefix[i + 1]!), adaptive: Math.exp(selectedPath.prefix[i + 1]!) })));
  const markdown = ["# Nikkei 2000-session overlay stability report", "", `Source: ${settings.startTime} through ${settings.endTime}; ${decisions.size} actual quick-screen selections.`, "",
    "All returns are net, price-index proxy results. Final-block results are conditional historical checks; the quick-library vintage and prior research prevent an independent holdout claim.", "",
    "## Controls", "", "| Method | Full return | Full drawdown | Common-period return | Last 500 return |", "|---|---:|---:|---:|---:|",
    ...Object.entries(controls).map(([k, v]) => `| ${k} | ${percent(v.full.totalReturn)} | ${percent(v.full.maxDrawdown)} | ${percent(v.common.totalReturn)} | ${percent(v.final500.totalReturn)} |`), "",
    "## Development-selected rolling policy", "", `Policy: ${selected.id}. Development ${percent(selected.developmentReturn)}, last 500 ${percent(selected.final500Return)}; last-500 drawdown ${percent(selected.final500Drawdown)}.`, "",
    `The full-sample diagnostic best is ${fullBest.id}, return ${percent(Number(fullBest.totalReturn))}, drawdown ${percent(Number(fullBest.maxDrawdown))}. This is not a prospective recommendation.`, "",
    `The fixed rule selected using the first 1500 sessions is ${parameterId(fixedDevelopment.p)}. Its last-500 return is ${percent(pathMetrics(prefixes[fixedDevelopment.j]!, holdout, sessions).totalReturn)}.`, "",
    "## Interpretation and files", "", "Use segments.csv for four exact 500-session blocks; fixed-grid.csv for all 5839 fixed candidates; walk-forward.csv for all 70 declared policies. Policies are ranked on development only. parameter-age.csv contains overlapping frozen-vintage age bands, not independent expiry estimates. selected-policy-decisions.csv records each preceding training cutoff and deployed parameters. cost-timing.csv is conditional on unchanged original winners.", "",
    "Training scores use known continuing counterfactual candidate paths. Deployment executes one actual inherited account with its pending sell retained across parameter changes. Segment returns include the segment's first close-to-close move and all account costs, with no segment reset. Holding is entered at the first evaluation close, with matching costs and no terminal liquidation.", "",
    "Next-open replay is an execution sensitivity of the close-derived target path. It does not rerank original plans or rederive the adaptive policy under next-open training; end-to-end execution-model validation remains outstanding.", "",
    "References: [chronological time splits](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html); [backtest overfitting](https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf).", ""].join("\n");
  await writeFile(join(root, "output/REPORT.md"), markdown);
  console.log(JSON.stringify({ controls, selected, fullBest, fixedDevelopmentSelected: parameterId(fixedDevelopment.p), libraryRanges }, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exitCode = 1; });
