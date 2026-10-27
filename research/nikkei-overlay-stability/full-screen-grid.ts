import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, copyFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { deserialize } from "node:v8";
import { fileURLToPath } from "node:url";
import { root, atomic, Account, Features, current, parameterId, targets, pathMetrics, validateIdentity, type Parameters } from "./analyze";
import { unpackMarketBars } from "../../lib/analysis/screening-worker-bars";
import { hashMarketBars } from "../../lib/analysis/screening-worker-client";
import { screeningResultPlan } from "../../lib/analysis/screening-plan";
import { selectBestShortcutScreeningResult } from "../../lib/analysis/shortcut-batch-screening";
import { SCREENING_RESULT_MODEL_VERSION } from "../../lib/analysis/strategy-combinations";
import { buildStrategyCycleRollingSchedule, strategyCycleRecentSignals, strategyCycleSignalDirection,
  runStrategyCycleCloseBacktest, type StrategyCycleSelectionSnapshot, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { SmaPositionOverlay, MIXED_POSITION_OVERLAY_MODEL } from "../../lib/analysis/sma-position-overlay";
import { createBacktestExecutionContext, type BacktestSettings } from "../../lib/analysis/backtest";
import type { MarketBar } from "../../lib/market/types";
import type { ScreeningValidationOutcome } from "../../lib/analysis/screening-validation";

const project = resolve(root, "../.."), batch = "f2b3d676fd69574d9437ee1d";
const data = join(root, "data/full-screen-6-15"), output = join(root, "output/full-screen-6-15");
const sha = (v: string | Uint8Array) => createHash("sha256").update(v).digest("hex");
let stopped = false;
function guard() {
  if (stopped || process.memoryUsage().rss > 1.5 * 1024 ** 3) throw new Error("Stopped safely (interruption or RSS limit); rerun full-screen-grid.ts to resume committed work");
}
async function exists(path: string) { return stat(path).then(() => true, e => { if (e.code === "ENOENT") return false; throw e; }); }
async function bounded(path: string) { assert.ok((await stat(path)).size <= 16 * 1024 ** 2, `Oversized source: ${path}`); return readFile(path); }
interface Source { job: string; index: number; requestHash: string; resultHash: string }
interface Input { batch: string; bars: MarketBar[]; barsHash: string; rawBarsHash: string; queueHash: string;
  snapshots: StrategyCycleSelectionSnapshot[]; sources: Source[]; settings: BacktestSettings; accessedAt: string; resultModel: number }
async function collect(): Promise<Input> {
  const frozen = join(data, "input.json");
  if (await exists(frozen)) {
    const input = JSON.parse((await bounded(frozen)).toString()) as Input;
    assert.equal(input.batch, batch); assert.equal(input.barsHash, sha(JSON.stringify(input.bars)));
    assert.equal(input.resultModel, SCREENING_RESULT_MODEL_VERSION);
    return input;
  }
  const engine = join(project, "data/state/screening-engine"), directory = join(engine, `batch-${batch}`);
  const queueBytes = await bounded(join(directory, "queue.json"));
  const queue = JSON.parse(queueBytes.toString()) as { jobIds: string[] };
  assert.ok(queue.jobIds.length > 0 && queue.jobIds.length <= 2048);
  assert.equal(new Set(queue.jobIds).size, queue.jobIds.length);
  const raw = await bounded(join(directory, "bars.bin")), bars = unpackMarketBars(deserialize(raw));
  assert.ok(bars.length <= 10000);
  const schedule = buildStrategyCycleRollingSchedule(bars, 2000, 10); assert.ok(schedule);
  assert.equal(schedule.decisionIndexes.length, queue.jobIds.length);
  const snapshots: StrategyCycleSelectionSnapshot[] = [], sources: Source[] = [];
  let settings: BacktestSettings | undefined;
  for (const [n, job] of queue.jobIds.entries()) {
    guard(); assert.match(job, /^[a-f0-9]{24}$/);
    const requestBytes = await bounded(join(engine, job, "request.json"));
    const request = JSON.parse(requestBytes.toString()), sig = JSON.parse(request.checkpoint.signature);
    const index: number = schedule.decisionIndexes[n]!;
    assert.equal(request.checkpoint.key, `screening:cycle:index:N225:${index}:10`);
    assert.equal(request.sharedBarsPath, join(directory, "bars.bin"));
    assert.equal(request.barCount, index + 1); assert.equal(sig.barCount, index + 1);
    assert.equal(sig.barsHash, hashMarketBars(bars.slice(0, index + 1)));
    assert.equal(sig.resultModelVersion, SCREENING_RESULT_MODEL_VERSION);
    assert.ok(!request.options.quickScreening && !request.settings.positionOverlay);
    assert.equal(request.options.objective, "totalReturn"); assert.equal(request.options.maxCombinationStrategies, 6);
    assert.equal(request.settings.endTime, bars[index]!.time);
    assert.equal(request.settings.startTime, bars[index - 9]!.time);
    assert.equal(request.settings.commissionRate, 0.0003); assert.equal(request.settings.slippageRate, 0.0002);
    assert.equal(request.settings.initialCash, 100000); assert.equal(request.settings.interval, "1d");
    assert.equal(request.config.mode, "sample"); assert.deepEqual(request.config.periods, [{ sessions: 10, weight: 100 }]);
    const resultBytes = await bounded(join(engine, job, "result.json"));
    const result = JSON.parse(resultBytes.toString()) as ScreeningValidationOutcome;
    assert.equal(result.failedCount, 0); assert.equal(result.cancelled, false);
    const best = selectBestShortcutScreeningResult(result.singleResults, result.results, "totalReturn"); assert.ok(best);
    const plan = screeningResultPlan(best.result); assert.ok(!plan.positionOverlay);
    snapshots.push({ decisionIndex: index, decisionTime: bars[index]!.time, screeningWindow: 10, plan,
      fixedRelativeLongStrategy: best.kind === "combination" ? best.result.relativeLongStrategy : null, label: job });
    sources.push({ job, index, requestHash: sha(requestBytes), resultHash: sha(resultBytes) });
    settings = request.settings;
  }
  const input: Input = { batch, bars, barsHash: sha(JSON.stringify(bars)), rawBarsHash: sha(raw), queueHash: sha(queueBytes),
    snapshots, sources, resultModel: SCREENING_RESULT_MODEL_VERSION, accessedAt: new Date().toISOString(),
    settings: { ...settings!, startTime: bars[schedule.evaluationStartIndex]!.time, endTime: bars.at(-1)!.time } };
  await mkdir(join(data, "raw"), { recursive: true });
  await copyFile(join(directory, "bars.bin"), join(data, "raw/bars.bin"));
  await copyFile(join(directory, "queue.json"), join(data, "raw/queue.json"));
  await atomic(frozen, input);
  await atomic(join(data, "source_registry.jsonl"), { accessedAt: input.accessedAt, batch, endpoint: directory,
    request: { sessions: 2000, screeningWindow: 10, objective: "totalReturn", maxCombinationStrategies: 6, quickScreening: false },
    barsHash: input.barsHash, rawBarsHash: input.rawBarsHash, queueHash: input.queueHash, jobs: sources });
  return input;
}
async function main() {
  process.on("SIGINT", () => { stopped = true; }); process.on("SIGTERM", () => { stopped = true; });
  const input = await collect(), { bars, settings } = input, start = bars.length - 2000;
  const sourceHash = sha(JSON.stringify(input));
  const designHash = sha((await Promise.all(["research/nikkei-overlay-stability/FULL_SCREEN_DESIGN.md",
    "research/nikkei-overlay-stability/full-screen-grid.ts", "research/nikkei-overlay-stability/analyze.ts",
    "research/nikkei-cycle-rallies/ma-type.ts", "lib/analysis/strategy-cycle-validation.ts", "lib/analysis/backtest.ts",
    "lib/analysis/strategy-combinations.ts", "lib/analysis/strategies.ts", "lib/analysis/indicators.ts",
    "lib/analysis/sma-position-overlay.ts"].map(p => readFile(join(project, p), "utf8")))).join("\n"));
  let rows: { index: number; signals: StrategyCycleRecentSignal[] }[] = [];
  const signalPath = join(data, "signals.json");
  if (await exists(signalPath)) {
    const saved = JSON.parse((await bounded(signalPath)).toString()); validateIdentity(saved, sourceHash, designHash); rows = saved.rows;
    assert.ok(rows.length <= input.snapshots.length);
    rows.forEach((r, n) => assert.equal(r.index, input.snapshots[n]!.decisionIndex));
  }
  for (let n = rows.length; n < input.snapshots.length; n++) {
    guard(); const s = input.snapshots[n]!;
    rows.push({ index: s.decisionIndex, signals: strategyCycleRecentSignals(bars, s, s.decisionIndex) });
    if (rows.length % 32 === 0 || rows.length === input.snapshots.length) {
      await atomic(signalPath, { sourceHash, designHash, rows }); console.log(`Signals ${rows.length}/${input.snapshots.length}`);
    }
  }
  const decisions = new Map(rows.map(r => [r.index, r.signals])), features = new Features(bars);
  for (let flags = 0; flags <= 7; flags++) {
    const actual = targets(bars, decisions, start, { ...current, flags }, features);
    const controller = new SmaPositionOverlay(bars, { model: MIXED_POSITION_OVERLAY_MODEL,
      supplementalEntry: !!(flags & 1), exitGuard: !!(flags & 2), entrySlopeGate: !!(flags & 4) });
    for (let i = start; i < bars.length; i++) {
      const signals = decisions.get(i) ?? [], direction = strategyCycleSignalDirection(signals);
      if (direction) controller.request(direction, signals.at(-1)!.targetAllocation, i);
      assert.equal(actual[i], controller.close(i, signals.length > 0), `Parity flags=${flags}, index=${i}`);
    }
  }
  const menu: Parameters[] = [];
  for (let entry = 6; entry <= 15; entry++) for (let exit = 6; exit <= 15; exit++) for (let gate = 6; gate <= 15; gate++)
    for (let t = 1; t <= 8; t++) menu.push({ entry, exit, gate, threshold: t / 4000, flags: 7 });
  assert.equal(menu.length, 8000);
  const local = bars.slice(start), localSettings = { ...settings, summaryOnly: true };
  const executionContext = createBacktestExecutionContext(local, localSettings);
  const run = (p: Parameters, summaryOnly = true) => {
    const account = new Account(), target = local.map((_, n) => account.step(start + n, decisions.get(start + n) ?? [], p, features));
    return runStrategyCycleCloseBacktest(local, target, { ...localSettings, summaryOnly, executionContext });
  };
  type Row = Parameters & { id: string; totalReturn: number; maxDrawdown: number; tradeCount: number };
  let grid: Row[] = [];
  const gridPath = join(data, "grid.json");
  if (await exists(gridPath)) {
    const saved = JSON.parse((await bounded(gridPath)).toString()); validateIdentity(saved, sourceHash, designHash); grid = saved.rows;
    assert.ok(grid.length <= menu.length); grid.forEach((r, n) => { assert.equal(r.id, parameterId(menu[n]!)); assert.ok(Number.isFinite(r.totalReturn)); });
  }
  for (let n = grid.length; n < menu.length; n++) {
    guard(); const p = menu[n]!, result = run(p);
    grid.push({ ...p, id: parameterId(p), totalReturn: result.totalReturn, maxDrawdown: result.maxDrawdown, tradeCount: result.tradeCount });
    if (grid.length % 128 === 0 || grid.length === menu.length) {
      await atomic(gridPath, { sourceHash, designHash, rows: grid }); console.log(`Grid ${grid.length}/8000; RSS ${Math.round(process.memoryUsage().rss / 1024 ** 2)} MiB`);
    }
  }
  const ranked = [...grid].sort((a, b) => b.totalReturn - a.totalReturn || a.id.localeCompare(b.id));
  const original = run(current, false), best = run(ranked[0]!, false), disabled = run({ ...current, flags: 0 }, false);
  const holding = runStrategyCycleCloseBacktest(local, local.map(() => 1), { ...localSettings, summaryOnly: false, executionContext });
  for (const p of [current, ranked[0]!, ...ranked.slice(1, 5)]) {
    const summary = run(p), complete = run(p, false);
    assert.ok(Math.abs(summary.totalReturn - complete.totalReturn) < 1e-9);
    assert.ok(Math.abs(summary.maxDrawdown - complete.maxDrawdown) < 1e-9);
    const full = runStrategyCycleCloseBacktest(bars, targets(bars, decisions, start, p, features), { ...settings, summaryOnly: false });
    assert.ok(Math.abs(full.totalReturn - complete.totalReturn) < 1e-9);
  }
  const metrics = (r: typeof original) => ({ totalReturn: r.totalReturn, maxDrawdown: r.maxDrawdown, tradeCount: r.tradeCount });
  const blocks = (r: typeof original) => {
    const prefix = Float64Array.from([0, ...r.equity.map(e => Math.log(e.equity / settings.initialCash))]);
    return [0, 1, 2, 3].map(n => ({ start: local[n * 500]!.time, end: local[(n + 1) * 500 - 1]!.time, ...pathMetrics(prefix, n * 500, (n + 1) * 500) }));
  };
  const summary = { batch, sourceHash, designHash, accessedAt: input.accessedAt, generatedAt: new Date().toISOString(),
    start: settings.startTime, end: settings.endTime, sessions: local.length, decisions: decisions.size, candidates: grid.length,
    original: { parameters: current, ...metrics(original) }, best: ranked[0],
    tiedOptima: ranked.filter(r => Math.abs(r.totalReturn - ranked[0]!.totalReturn) < 1e-9).length,
    improvementPoints: best.totalReturn - original.totalReturn, noOverlays: metrics(disabled), holding: metrics(holding),
    top20: ranked.slice(0, 20), blocks: { original: blocks(original), best: blocks(best), holding: blocks(holding) },
    verification: { productionFlagPaths: 8, summaryAndFullHistoryLedgerComparisons: 6, completeSchedule: true, sourceFailures: 0 },
    limitation: "Retrospective maximum on the completed full-screen path; no independent holdout or future-return claim." };
  await atomic(join(output, "summary.json"), summary);
  await atomic(join(output, "best-ledger.json"), best); await atomic(join(output, "original-ledger.json"), original);
  const keys = Object.keys(ranked[0]!) as (keyof Row)[];
  const csv = [keys.join(","), ...ranked.map(r => keys.map(k => r[k]).join(","))].join("\n") + "\n";
  await mkdir(output, { recursive: true });
  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(output, "ranked-grid.csv"), csv);
  await writeFile(join(output, "REPORT.md"), `# Completed full-screen overlay grid\n\nPeriod: ${summary.start} through ${summary.end}; ${summary.sessions} sessions, ${summary.decisions} decisions.\n\nOriginal return: ${original.totalReturn.toFixed(4)}%; drawdown: ${original.maxDrawdown.toFixed(4)}%.\n\nBest: ${ranked[0]!.id}; return: ${best.totalReturn.toFixed(4)}%; drawdown: ${best.maxDrawdown.toFixed(4)}%; improvement: ${summary.improvementPoints.toFixed(4)} percentage points.\n\nHolding: ${holding.totalReturn.toFixed(4)}%; drawdown: ${holding.maxDrawdown.toFixed(4)}%.\n\n${summary.limitation}\n\nComplete ranking: ranked-grid.csv. Source identities, block comparisons and verification: summary.json. No production settings changed.\n`);
  console.log(JSON.stringify(summary, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exitCode = 1; });
