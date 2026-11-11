import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { serialize } from "node:v8";
import { fileURLToPath } from "node:url";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import { buildCheckpointIdentity } from "../../lib/analysis/screening-worker-client";
import { packMarketBars } from "../../lib/analysis/screening-worker-bars";
import { LOCAL_SCREENING_ENGINE_VERSION } from "../../lib/analysis/screening-local-engine-protocol";
import { SCREENING_RESULT_MODEL_VERSION } from "../../lib/analysis/strategy-combinations";
import { screeningResultPlan } from "../../lib/analysis/screening-plan";
import { selectBestShortcutScreeningResult } from "../../lib/analysis/shortcut-batch-screening";
import { SAME_CLOSE_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import { buildStrategyCycleRollingReport, buildStrategyCycleRollingSchedule, strategyCyclePlanKey,
  strategyCycleRecentSignals, type StrategyCycleSelectionSnapshot, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { ScreeningValidationOutcome } from "../../lib/analysis/screening-validation";
import type { BacktestSettings, AllocationRebalance } from "../../lib/analysis/backtest";
import type { MarketBar } from "../../lib/market/types";
import { Stepper, type State } from "../nikkei-screening-skip-audit/model";
import { needsHoldingScreen } from "./model";

const root = dirname(fileURLToPath(import.meta.url)), project = resolve(root, "../..");
const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
async function bounded(path: string) {
  assert.ok((await stat(path)).size <= 16 * 1024 ** 2, `Oversized file: ${path}`);
  return readFile(path, "utf8");
}
async function atomic(path: string, value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  assert.ok(Buffer.byteLength(text) <= 16 * 1024 ** 2, `Oversized output: ${path}`);
  await mkdir(dirname(path), { recursive: true }); await writeFile(`${path}.tmp`, text);
  await replaceFileAtomically(`${path}.tmp`, path);
}
const source = join(root, "../nikkei-overlay-stability/data/full-screen-6-15");
const inputText = await bounded(join(source, "input.json")), signalText = await bounded(join(source, "signals.json"));
const input = JSON.parse(inputText) as { bars: MarketBar[]; barsHash: string; resultModel: number;
  snapshots: StrategyCycleSelectionSnapshot[]; settings: BacktestSettings };
const original = JSON.parse(signalText) as { sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[] };
assert.equal(sha(JSON.stringify(input)), original.sourceHash); assert.equal(sha(JSON.stringify(input.bars)), input.barsHash);
assert.equal(input.resultModel, SCREENING_RESULT_MODEL_VERSION);
const { bars } = input, start = bars.length - 2000;
assert.ok(bars.length <= 10000 && start >= 10);
assert.deepEqual(buildStrategyCycleRollingSchedule(bars, 2000, 10)!.decisionIndexes, input.snapshots.map(s => s.decisionIndex));
assert.deepEqual(original.rows.map(r => r.index), input.snapshots.map(s => s.decisionIndex));
const codePaths = (await readdir(join(project, "lib/analysis"), { recursive: true })).filter(p => p.endsWith(".ts")).sort();
const codeHash = sha((await Promise.all([...codePaths.map(p => join(project, "lib/analysis", p)),
  join(root, "run.ts"), join(root, "model.ts"), join(root, "../nikkei-screening-skip-audit/model.ts"),
  join(project, "scripts/screening-engine-child.ts"), join(project, "scripts/atomic-file.ts")].map(bounded))).join("\n"));
const identity = sha([inputText, signalText, codeHash].join("\n"));
const data = join(root, "data", identity), output = join(root, "output", identity), progressPath = join(data, "progress.json");
const settings = { ...input.settings, positionOverlay: DEFAULT_POSITION_OVERLAY_OPTIONS, interval: "1d" as const };
const stepper = new Stepper(bars, settings);
const originals = new Map(input.snapshots.map(s => [s.decisionIndex, s]));
const originalSignals = new Map(original.rows.map(r => [r.index, r.signals]));
interface Day { index: number; time: string; held: boolean; regular: boolean; extra: boolean;
  cash: number; units: number; equity: number; target: number; pending: number | null; planKey: string | null }
interface Progress { identity: string; status: string; updatedAt: string; attempts: number; lastError: string | null;
  state: State; days: Day[]; fills: AllocationRebalance[]; extras: StrategyCycleSelectionSnapshot[]; validationWinner?: StrategyCycleSelectionSnapshot }
let progress: Progress = { identity, status: "running", updatedAt: "", attempts: 0, lastError: null,
  state: stepper.initial(start), days: [], fills: [], extras: [] };
try {
  progress = JSON.parse(await bounded(progressPath)); assert.equal(progress.identity, identity);
  assert.equal(progress.state.index, start + progress.days.length - 1); assert.ok(progress.days.length <= 2000);
  progress.days.forEach((day, n) => assert.equal(day.index, start + n));
  assert.equal(progress.extras.length, progress.days.filter(d => d.extra).length);
} catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
let interrupted = false;
process.on("SIGINT", () => { interrupted = true; }); process.on("SIGTERM", () => { interrupted = true; });
const save = async (status: string, lastError: string | null = null) => {
  progress.status = status; progress.lastError = lastError; progress.updatedAt = new Date().toISOString();
  await atomic(progressPath, progress);
  await atomic(join(root, "output/latest.json"), { identity, data, output, status,
    completedDays: progress.days.length, extraScreens: progress.extras.length, updatedAt: progress.updatedAt });
};
await mkdir(data, { recursive: true }); await atomic(join(data, "input.json"), inputText);
await atomic(join(data, "original-signals.json"), signalText);
const rawPath = join(data, "bars.bin");
await writeFile(rawPath, serialize(packMarketBars(bars)));
await atomic(join(data, "source_registry.jsonl"), JSON.stringify({ source, accessedAt: new Date().toISOString(),
  identity, codeHash, inputHash: sha(inputText), signalHash: sha(signalText), barsHash: input.barsHash,
  parameters: { screeningWindow: 10, maxCombinationStrategies: 6, evaluationSessions: 2000, objective: "totalReturn" },
  providerRequests: 0, end: bars.at(-1)!.time }) + "\n");
progress.attempts++; await save("running");
const limitAt = process.argv.indexOf("--limit"), limit = limitAt < 0 ? 2048 : Number(process.argv[limitAt + 1]);
assert.ok(Number.isInteger(limit) && limit > 0);
const beganExtras = progress.extras.length;

async function screen(index: number): Promise<StrategyCycleSelectionSnapshot> {
  const job = join(data, "jobs", String(index)); await mkdir(job, { recursive: true });
  const prefix = bars.slice(0, index + 1);
  const searchSettings = { initialCash: input.settings.initialCash, commissionRate: input.settings.commissionRate,
    slippageRate: input.settings.slippageRate, interval: "1d" as const, executionPolicy: input.settings.executionPolicy,
    startTime: bars[index - 9].time, endTime: bars[index].time };
  const config = { mode: "sample" as const, periods: [{ sessions: 10, weight: 100 }] };
  const options = { objective: "totalReturn" as const, maxCombinationStrategies: 6 as const,
    checkpointNamespace: `cycle:holding-rescreen:${identity}:${index}:10` };
  const request = { version: LOCAL_SCREENING_ENGINE_VERSION, settings: searchSettings, config,
    checkpoint: buildCheckpointIdentity(prefix, searchSettings, config, options),
    options: { objective: options.objective, maxCombinationStrategies: 6 }, barCount: index + 1, sharedBarsPath: rawPath };
  const requestPath = join(job, "request.json");
  try { assert.deepEqual(JSON.parse(await bounded(requestPath)), request); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; await atomic(requestPath, request); }
  const resultPath = join(job, "result.json");
  let resultText: string | null = null;
  try { resultText = await bounded(resultPath); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  let restarts = 0;
  while (resultText === null) {
    if (interrupted) throw new Error("Interrupted at a safe screening boundary; rerun to resume");
    console.log(`Full screen ${bars[index].time}; day ${index - start + 1}/2000; extra winners ${progress.extras.length}; restart ${restarts}`);
    const code = await new Promise<number | null>((accept, reject) => {
      const child = spawn(process.execPath, ["--import", "tsx", join(project, "scripts/screening-engine-child.ts"), job],
        { cwd: project, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      const log = createWriteStream(join(job, "child.jsonl"), { flags: "a" });
      let buffer = "", lastPrint = 0;
      child.stdout.on("data", (chunk: Buffer) => {
        log.write(chunk); buffer += chunk.toString();
        const lines = buffer.split("\n"); buffer = lines.pop()!;
        for (const line of lines) {
          if (!line) continue;
          const event = JSON.parse(line);
          if (event.type === "error") console.error(event.message);
          if (event.type === "optimization-progress" && Date.now() - lastPrint > 30000) {
            console.log(`${bars[index].time}: ${event.progress.stage} ${event.progress.stageCompleted}/${event.progress.stageTotal}`); lastPrint = Date.now();
          }
        }
      });
      child.stderr.on("data", (chunk: Buffer) => log.write(chunk));
      child.on("error", reject); child.on("exit", code => { log.end(); accept(code); });
    });
    if (code === 75) { assert.ok(++restarts < 4096, "Restart bound reached"); continue; }
    assert.equal(code, 0, `Optimizer failed for ${bars[index].time}; inspect ${job}`);
    resultText = await bounded(resultPath);
  }
  const result = JSON.parse(resultText) as ScreeningValidationOutcome;
  assert.equal(result.cancelled, false); assert.equal(result.failedCount, 0);
  const best = selectBestShortcutScreeningResult(result.singleResults, result.results, "totalReturn"); assert.ok(best);
  const selected = { decisionIndex: index, decisionTime: bars[index].time, screeningWindow: 10,
    plan: screeningResultPlan(best.result), fixedRelativeLongStrategy: best.kind === "combination" ? best.result.relativeLongStrategy : null,
    label: `holding-rescreen:${identity}:${index}` };
  await atomic(join(job, "winner.json"), { snapshot: selected, requestHash: sha(JSON.stringify(request)), resultHash: sha(resultText) });
  return selected;
}

function metrics(days: Day[], fills: AllocationRebalance[]) {
  let peak = settings.initialCash, dd = 0;
  for (const day of days) { peak = Math.max(peak, day.equity); dd = Math.max(dd, (1 - day.equity / peak) * 100); }
  return { net: (days.at(-1)!.equity / settings.initialCash - 1) * 100, maxDrawdown: dd,
    fills: fills.length, clears: fills.filter(f => f.fromAllocation > 1e-10 && f.targetAllocation <= 1e-10).length,
    segments: [0, 500, 1000, 1500].map(i => (days[i + 499].equity / (i ? days[i - 1].equity : settings.initialCash) - 1) * 100) };
}
try {
  // Exact optimizer parity on an original date validates reuse rather than assuming version equivalence.
  if (!progress.validationWinner) {
    const first = input.snapshots[0], selected = await screen(first.decisionIndex);
    assert.equal(strategyCyclePlanKey(selected), strategyCyclePlanKey(first), "Original winner differs: full historical recomputation required");
    progress.validationWinner = selected; await save("running");
  }
  for (let index = progress.state.index + 1; index < bars.length && !interrupted; index++) {
    assert.ok(process.memoryUsage().rss < 1.5 * 1024 ** 3, "Parent RSS limit reached");
    const held = progress.state.account.units > 1e-10, regular = originals.has(index);
    const extra = !regular && needsHoldingScreen(bars, index, progress.state.account.units);
    const snapshot = regular ? originals.get(index)! : extra ? await screen(index) : null;
    const signals = regular ? originalSignals.get(index)! : snapshot ? strategyCycleRecentSignals(bars, snapshot, index) : [];
    const next = stepper.step(progress.state, index, signals, snapshot ? strategyCyclePlanKey(snapshot) : progress.state.planKey);
    assert.deepEqual(new Stepper(bars.slice(0, index + 1), settings).step(JSON.parse(JSON.stringify(progress.state)), index, signals,
      snapshot ? strategyCyclePlanKey(snapshot) : progress.state.planKey), next);
    if (extra) progress.extras.push(snapshot!);
    progress.state = next.state; progress.fills.push(...next.fills);
    progress.days.push({ index, time: bars[index].time, held, regular, extra, ...next.state.account,
      equity: next.state.account.cash + next.state.account.units * bars[index].close,
      target: next.state.target, pending: next.state.overlay.pending, planKey: next.state.planKey });
    await save("running");
    if (index % 64 === 0 || extra) console.log(`Committed ${progress.days.length}/2000 days; ${progress.extras.length} extra full screens; ${progress.fills.length} fills`);
    if (progress.extras.length - beganExtras >= limit) break;
  }
  if (progress.days.length < 2000) { await save("interrupted"); }
  else {
    const snapshots = [...input.snapshots, ...progress.extras].sort((a, b) => a.decisionIndex - b.decisionIndex);
    const production = buildStrategyCycleRollingReport(bars, snapshots, 2000, 10, settings, snapshots.map(s => s.decisionIndex));
    const economic = (fills: AllocationRebalance[]) => fills.map(({ time, fillPrice, fromAllocation, targetAllocation, reason }) =>
      ({ time, fillPrice, fromAllocation, targetAllocation, reason }));
    assert.deepEqual(economic(progress.fills), economic(production.rebalances));
    assert.deepEqual(progress.state.account, production.checkpoint!.current);
    assert.deepEqual(progress.state.overlay, production.checkpoint!.currentOverlay);
    const baselineDays: Day[] = [], baselineFills: AllocationRebalance[] = [];
    const baselineStepper = new Stepper(bars, settings);
    let state = baselineStepper.initial(start);
    for (let index = start; index < bars.length; index++) {
      const selected = originals.get(index), next = baselineStepper.step(state, index, originalSignals.get(index) ?? [],
        selected ? strategyCyclePlanKey(selected) : state.planKey);
      baselineDays.push({ index, time: bars[index].time, held: state.account.units > 1e-10, regular: !!selected, extra: false,
        ...next.state.account, equity: next.state.account.cash + next.state.account.units * bars[index].close,
        target: next.state.target, pending: next.state.overlay.pending, planKey: next.state.planKey });
      baselineFills.push(...next.fills); state = next.state;
    }
    const baselineReport = buildStrategyCycleRollingReport(bars, input.snapshots, 2000, 10, settings);
    assert.deepEqual(economic(baselineFills), economic(baselineReport.rebalances));
    const baseline = metrics(baselineDays, baselineFills), alternative = metrics(progress.days, progress.fills);
    assert.ok(Math.abs(alternative.net - production.updateReturn) < 1e-10);
    const summary = { identity, codeHash, sourceHash: original.sourceHash, start: bars[start].time, end: bars.at(-1)!.time,
      screeningWindow: 10, sessions: 2000, originalScreens: originals.size, extraScreens: progress.extras.length,
      totalScreens: snapshots.length, baseline, alternative, deltaReturnPoints: alternative.net - baseline.net,
      verification: { originalOptimizerWinnerParity: true, productionFillsAccountAndOverlayParity: true,
        serializedCausalDailySteps: 2000 }, limitation: "Frozen source ending 2026-10-26; Nikkei close proxy; not current browser account; no production adoption." };
    await atomic(join(output, "summary.json"), summary); await atomic(join(output, "alternative.json"), progress);
    await atomic(join(output, "baseline.json"), { days: baselineDays, fills: baselineFills });
    await atomic(join(output, "snapshots.json"), snapshots);
    await atomic(join(root, "RESULTS.md"), `# Holding rescreen results\n\n${summary.start}..${summary.end};2000 sessions;10-session full optimization;max6;v11;commission3bps+slippage2bps.\n\n| Policy | Net % | MaxDD % | Fills | Clears |\n|---|---:|---:|---:|---:|\n| Baseline | ${baseline.net.toFixed(6)} | ${baseline.maxDrawdown.toFixed(6)} | ${baseline.fills} | ${baseline.clears} |\n| Holding rescreen | ${alternative.net.toFixed(6)} | ${alternative.maxDrawdown.toFixed(6)} | ${alternative.fills} | ${alternative.clears} |\n\nExtra full screens:${progress.extras.length};original winners reused:${originals.size};return difference:${summary.deltaReturnPoints.toFixed(6)}pp.\n\n${summary.limitation}\n\nIdentity:${identity}. Production economic fills,account and complete overlay match;2000 serialized causal daily steps pass;original-date full optimizer winner matches. See output/latest.json for retained artifacts.\n`);
    await save("complete"); console.log(JSON.stringify(summary));
  }
} catch (error) { await save(interrupted ? "interrupted" : "failed", error instanceof Error ? error.message : String(error)); throw error; }
