import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deserialize } from "node:v8";
import { unpackMarketBars } from "../../lib/analysis/screening-worker-bars";
import { hashMarketBars } from "../../lib/analysis/screening-worker-client";
import { screeningResultPlan } from "../../lib/analysis/screening-plan";
import { selectBestShortcutScreeningResult } from "../../lib/analysis/shortcut-batch-screening";
import {
  NIKKEI_CYCLE_MODEL, resolveStrategyCycleRecentSignals,
  strategyCycleRecentSignals, strategyCycleSignalsOppose,
  shouldScreenStrategyCycleAtIndex, buildStrategyCycleRollingReport,
  type StrategyCycleRecentSignal, type StrategyCycleSelectionSnapshot,
} from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";
import type { ScreeningValidationOutcome } from "../../lib/analysis/screening-validation";
import { replaceFileAtomically } from "../../scripts/atomic-file";

const root = dirname(fileURLToPath(import.meta.url));
const project = resolve(root, "../..");
const stateRoot = join(project, "data/state/screening-engine");
const output = join(root, "output");
const data = join(root, "data");
const horizons = [1, 5, 10, 20];
const MAX_ARCHIVE_JOBS = 4_096;
const MAX_INPUT_BYTES = 32 * 1024 * 1024;
let interrupted = false;
const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const stable = (value: unknown): string => JSON.stringify(value);

interface Input {
  version: 1;
  bars: MarketBar[];
  sourceHash: string;
  barsHash: string;
  sources: { job: string; requestHash: string; resultHash: string }[];
  snapshots: Array<StrategyCycleSelectionSnapshot & { cohort: string; job: string }>;
  rejected: Record<string, number>;
}
interface Event {
  kind: "replacement" | "cross-window";
  cohort: string;
  time: string;
  oldWindow: number;
  newWindow: number;
  oldJob: string;
  newJob: string;
  oldSignals: StrategyCycleRecentSignal[];
  newSignals: StrategyCycleRecentSignal[];
  outcomes: Array<{ sessions: number; newReturn: number; oldReturn: number; difference: number }>;
}

async function atomicJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`, "utf8");
  await replaceFileAtomically(temporary, path);
}

async function collect(): Promise<Input> {
  // Freeze a reproducible input before replay; subsequent runs never need the cache.
  const inputPath = join(data, "input.json");
  try {
    if ((await stat(inputPath)).size > MAX_INPUT_BYTES) throw new Error("Frozen input exceeds 32 MiB");
    const existing = JSON.parse(await readFile(inputPath, "utf8")) as Input;
    if (existing.version !== 1 || sha(stable(existing.bars)) !== existing.barsHash) {
      throw new Error("Frozen input schema or hash mismatch");
    }
    return existing;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const directories = (await readdir(stateRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^[a-f0-9]{24}$/.test(entry.name))
    .map((entry) => entry.name).sort();
  if (directories.length > MAX_ARCHIVE_JOBS) throw new Error("Archive exceeds the 4096-job study limit");
  let bars: MarketBar[] = [];
  let sourceHash = "";
  for (const job of directories) {
    const path = join(stateRoot, job, "bars.bin");
    try {
      const bytes = await readFile(path);
      if (bytes.length > 10 * 1024 * 1024) throw new Error("Bar input exceeds 10 MiB");
      const request = JSON.parse(await readFile(join(stateRoot, job, "request.json"), "utf8"));
      if (!request.checkpoint?.key?.includes("index:N225")) continue;
      const candidate = unpackMarketBars(deserialize(bytes));
      if (candidate.length > 10_000) throw new Error("Nikkei archive exceeds 10000 daily bars");
      if (candidate.length > bars.length) { bars = candidate; sourceHash = sha(bytes); }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  if (!bars.length) throw new Error("No verifiable Nikkei OHLCV bar archive is available");
  const prefixHashes = new Map<number, string>();
  const snapshots: Input["snapshots"] = [];
  const sources: Input["sources"] = [];
  const rejected: Record<string, number> = {};
  const reject = (reason: string) => { rejected[reason] = (rejected[reason] ?? 0) + 1; };
  for (const job of directories) {
    const directory = join(stateRoot, job);
    let requestText: string;
    let resultText: string;
    try {
      const size = (await stat(join(directory, "result.json"))).size;
      if (size > 16 * 1024 * 1024) { reject("oversizedResult"); continue; }
      requestText = await readFile(join(directory, "request.json"), "utf8");
      resultText = await readFile(join(directory, "result.json"), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") { reject("incomplete"); continue; }
      throw error;
    }
    const request = JSON.parse(requestText);
    const match = request.checkpoint?.key?.match(/^screening:cycle:index:N225:(\d+):(\d+)$/);
    if (!match) { reject("notCycleNikkei"); continue; }
    const decisionIndex = Number(match[1]);
    const count = decisionIndex + 1;
    const signature = JSON.parse(request.checkpoint.signature);
    if (!prefixHashes.has(count)) prefixHashes.set(count, hashMarketBars(bars.slice(0, count)));
    if (count > bars.length || signature.barsHash !== prefixHashes.get(count) ||
      request.settings.endTime !== bars[decisionIndex]?.time ||
      signature.barCount !== count) { reject("prefixMismatch"); continue; }
    const outcome = JSON.parse(resultText) as ScreeningValidationOutcome;
    if (outcome.cancelled) { reject("cancelledResult"); continue; }
    const best = selectBestShortcutScreeningResult(outcome.singleResults, outcome.results, request.options.objective);
    if (!best) { reject("missingWinner"); continue; }
    const cohort = stable({ batch: request.sharedBarsPath ?? job, options: request.options,
      costs: [request.settings.commissionRate, request.settings.slippageRate],
      positioning: signature.positioningModelVersion, model: signature.resultModelVersion });
    snapshots.push({ decisionIndex, decisionTime: bars[decisionIndex]!.time,
      screeningWindow: Number(match[2]), plan: screeningResultPlan(best.result),
      fixedRelativeLongStrategy: best.kind === "combination" ? best.result.relativeLongStrategy : null,
      label: job, cohort, job });
    sources.push({ job, requestHash: sha(requestText), resultHash: sha(resultText) });
  }
  const input: Input = { version: 1, bars, sourceHash, barsHash: sha(stable(bars)), sources, snapshots, rejected };
  await atomicJson(inputPath, input);
  await writeFile(join(data, "source_registry.jsonl"), `${stable({ accessedAt: new Date().toISOString(),
    source: "local screening request/result archive and exact OHLCV prefixes", symbol: "^N225",
    sourceHash, frozenInput: "input.json", count: snapshots.length, barsHash: input.barsHash })}\n`);
  return input;
}

// Mark the inherited position at the common decision close. Trade only its delta,
// then hold that allocation to the horizon close. No forced liquidation cost.
export function branchReturn(from: number, to: number, ratio: number, cost: number): number {
  const change = to - from;
  let cash = 1 - from;
  let units = from;
  if (change > 0) {
    const bought = Math.min(change, cash / ((1 + cost) * (1 + cost)));
    cash -= bought * (1 + cost) * (1 + cost);
    units += bought;
  } else if (change < 0) {
    cash -= change * (1 - cost) * (1 - cost);
    units += change;
  }
  return (cash + units * ratio - 1) * 100;
}

async function main() {
  await mkdir(output, { recursive: true });
  const input = await collect();
  const inputHash = sha(stable(input));
  const checkpointPath = join(data, "state.json");
  const groups = new Map<string, Input["snapshots"]>();
  for (const snapshot of input.snapshots) {
    const key = `${snapshot.cohort}|${snapshot.screeningWindow}`;
    const group = groups.get(key) ?? [];
    group.push(snapshot); groups.set(key, group);
  }
  const groupEntries = [...groups].sort(([a], [b]) => a.localeCompare(b));
  let state: { inputHash: string; model: string; completed: string[]; events: Event[]; replacementComparisons: number; crossComparisons: number } = {
    inputHash, model: NIKKEI_CYCLE_MODEL, completed: [], events: [], replacementComparisons: 0, crossComparisons: 0,
  };
  try {
    state = JSON.parse(await readFile(checkpointPath, "utf8"));
    if (state.inputHash !== inputHash || state.model !== NIKKEI_CYCLE_MODEL) throw new Error("Checkpoint is incompatible with frozen inputs/model");
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const signalsAt = (snapshot: Input["snapshots"][number], index: number) =>
    strategyCycleRecentSignals(input.bars, snapshot, index);
  const addEvent = (kind: Event["kind"], old: Input["snapshots"][number], next: Input["snapshots"][number],
    oldSignals: StrategyCycleRecentSignal[], newSignals: StrategyCycleRecentSignal[]) => {
    if (!strategyCycleSignalsOppose(oldSignals, newSignals)) return;
    const index = next.decisionIndex;
    const outcomes: Event["outcomes"] = [];
    for (const sessions of horizons) {
      if (index + sessions >= input.bars.length) continue;
      const ratio = input.bars[index + sessions]!.close / input.bars[index]!.close;
      // A fixed 50% common inherited account allows both buy and sell branches.
      const newAllocation = resolveStrategyCycleRecentSignals(0.5, newSignals).targetAllocation;
      const oldAllocation = resolveStrategyCycleRecentSignals(0.5, oldSignals).targetAllocation;
      const cost = 0.0005;
      const newReturn = branchReturn(0.5, newAllocation, ratio, cost);
      const oldReturn = branchReturn(0.5, oldAllocation, ratio, cost);
      outcomes.push({ sessions, newReturn, oldReturn, difference: newReturn - oldReturn });
    }
    state.events.push({ kind, cohort: next.cohort, time: next.decisionTime,
      oldWindow: old.screeningWindow, newWindow: next.screeningWindow,
      oldJob: old.job, newJob: next.job, oldSignals, newSignals, outcomes });
  };
  for (const [key, snapshots] of groupEntries) {
    if (state.completed.includes(key)) continue;
    snapshots.sort((a, b) => a.decisionIndex - b.decisionIndex);
    for (let index = 1; index < snapshots.length; index += 1) {
      const old = snapshots[index - 1]!;
      const next = snapshots[index]!;
      // Missing archive decisions cannot establish who the previous winner was.
      if (input.bars.slice(old.decisionIndex + 1, next.decisionIndex).some((_, offset) =>
        shouldScreenStrategyCycleAtIndex(input.bars, old.decisionIndex + 1 + offset))) continue;
      state.replacementComparisons += 1;
      addEvent("replacement", old, next, signalsAt(old, next.decisionIndex), signalsAt(next, next.decisionIndex));
    }
    state.completed.push(key);
    await atomicJson(checkpointPath, state);
    process.stdout.write(`Replayed ${state.completed.length}/${groupEntries.length} period/cohort groups\n`);
    if (interrupted) {
      process.stdout.write("Interrupted safely after committed group; rerun the same command to resume.\n");
      return;
    }
  }
  if (!state.completed.includes("cross-window")) {
    const byDate = new Map<string, Input["snapshots"]>();
    for (const snapshot of input.snapshots) {
      const key = `${snapshot.cohort}|${snapshot.decisionIndex}`;
      const group = byDate.get(key) ?? []; group.push(snapshot); byDate.set(key, group);
    }
    for (const snapshots of byDate.values()) {
      snapshots.sort((a, b) => a.screeningWindow - b.screeningWindow);
      const signals = snapshots.map((snapshot) => signalsAt(snapshot, snapshot.decisionIndex));
      for (let i = 0; i < snapshots.length; i += 1) for (let j = i + 1; j < snapshots.length; j += 1) {
        state.crossComparisons += 1;
        addEvent("cross-window", snapshots[i]!, snapshots[j]!, signals[i]!, signals[j]!);
      }
    }
    state.completed.push("cross-window"); await atomicJson(checkpointPath, state);
  }
  const summaries = ["replacement", "cross-window"].flatMap((kind) => horizons.map((sessions) => {
    const events = state.events.filter((event) => event.kind === kind);
    const outcomes = events.flatMap((event) => event.outcomes.filter((outcome) => outcome.sessions === sessions));
    const differences = outcomes.map((outcome) => outcome.difference).sort((a, b) => a - b);
    const dates = [...new Set(events.map((event) => event.time))];
    const median = differences.length ? (differences[Math.floor((differences.length - 1) / 2)]! + differences[Math.floor(differences.length / 2)]!) / 2 : null;
    return { kind, sessions, conflicts: events.length, uniqueDates: dates.length, samples: outcomes.length,
      newWins: outcomes.filter((outcome) => outcome.difference > 1e-10).length,
      oldWins: outcomes.filter((outcome) => outcome.difference < -1e-10).length,
      meanDifference: outcomes.length ? differences.reduce((a, b) => a + b, 0) / outcomes.length : null,
      medianDifference: median };
  }));
  const continuous = [];
  for (const [cohortKey, snapshots] of groupEntries) {
    if (interrupted) {
      process.stdout.write("Interrupted during derived summaries; committed events are safe. Rerun to finish.\n");
      return;
    }
    snapshots.sort((a, b) => a.decisionIndex - b.decisionIndex);
    const first = snapshots[0]!.decisionIndex;
    const last = snapshots.at(-1)!.decisionIndex;
    if (last - first < 2 || snapshots.some((snapshot, i) => i > 0 &&
      input.bars.slice(snapshots[i - 1]!.decisionIndex + 1, snapshot.decisionIndex).some((_, offset) =>
        shouldScreenStrategyCycleAtIndex(input.bars, snapshots[i - 1]!.decisionIndex + 1 + offset)))) continue;
    const report = buildStrategyCycleRollingReport(input.bars.slice(0, last + 1), snapshots,
      last - first + 1, snapshots[0]!.screeningWindow, {
        initialCash: 100_000, commissionRate: 0.0005, slippageRate: 0.0005, interval: "1d",
      });
    continuous.push({ cohort: cohortKey, window: report.screeningWindow,
      first: report.evaluationStartTime, last: report.evaluationEndTime,
      decisions: report.decisionCount, conflicts: report.conflictCount,
      newReturn: report.newOnConflictReturn, oldReturn: report.oldOnConflictReturn,
      difference: report.newOnConflictReturn - report.oldOnConflictReturn });
  }
  const sensitivity = [];
  const replacementEvents = state.events.filter((event) => event.kind === "replacement");
  for (const inherited of [0, 0.5, 1]) for (const cost of [0, 0.0005, 0.001]) for (const sessions of horizons) {
    const observations = replacementEvents.filter((event) => event.outcomes.some((value) => value.sessions === sessions)).map((event) => {
      const index = input.bars.findIndex((bar) => bar.time === event.time);
      const ratio = input.bars[index + sessions]!.close / input.bars[index]!.close;
      const next = resolveStrategyCycleRecentSignals(inherited, event.newSignals).targetAllocation;
      const old = resolveStrategyCycleRecentSignals(inherited, event.oldSignals).targetAllocation;
      return { time: event.time, difference: branchReturn(inherited, next, ratio, cost) - branchReturn(inherited, old, ratio, cost) };
    });
    const dates = [...new Set(observations.map((value) => value.time))].sort();
    const byDate = dates.map((time) => {
      const values = observations.filter((value) => value.time === time);
      return values.reduce((sum, value) => sum + value.difference, 0) / values.length;
    });
    const average = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    sensitivity.push({ inherited, commissionBps: cost * 10_000, slippageBps: cost * 10_000, sessions,
      dateWeightedMeanDifference: average(byDate),
      earlierHalfDifference: average(byDate.slice(0, Math.floor(byDate.length / 2))),
      laterHalfDifference: average(byDate.slice(Math.floor(byDate.length / 2))) });
  }
  const summary = { generatedAt: new Date().toISOString(), inputHash, model: NIKKEI_CYCLE_MODEL,
    baseCommissionBps: 5, baseSlippageBps: 5, eventInheritedAllocation: 0.5,
    rankingBasis: "archived hybrid rankings, not reoptimized at close", snapshots: input.snapshots.length,
    periods: [...new Set(input.snapshots.map((snapshot) => snapshot.screeningWindow))].sort((a, b) => a - b),
    firstDecision: input.snapshots.map((snapshot) => snapshot.decisionTime).sort()[0],
    lastDecision: input.snapshots.map((snapshot) => snapshot.decisionTime).sort().at(-1),
    bars: input.bars.length, firstBar: input.bars[0]?.time, lastBar: input.bars.at(-1)?.time,
    rejected: input.rejected, replacementComparisons: state.replacementComparisons,
    crossComparisons: state.crossComparisons, summaries, continuous, sensitivity };
  await atomicJson(join(output, "events.json"), state.events);
  await atomicJson(join(output, "summary.json"), summary);
  process.stdout.write(`${JSON.stringify({ ...summary, continuous: continuous.length, sensitivity: sensitivity.length }, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.on("SIGINT", () => { interrupted = true; });
  await main();
}
