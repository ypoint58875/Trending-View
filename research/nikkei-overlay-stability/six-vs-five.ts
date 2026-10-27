import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { root, atomic } from "./analyze";
import { contributionReplay } from "./contribution-study";
import { ATR_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import { runScreeningWithValidation, type ScreeningValidationConfig } from "../../lib/analysis/screening-validation";
import { screeningResultPlan } from "../../lib/analysis/screening-plan";
import { selectBestShortcutScreeningResult } from "../../lib/analysis/shortcut-batch-screening";
import { compareScreeningResults } from "../../lib/analysis/screening";
import { strategyCycleRecentSignals, strategyCycleSignalDirection,
  type StrategyCycleSelectionSnapshot, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";
import type { BacktestSettings } from "../../lib/analysis/backtest";
import type { LocalScreeningJobRequest } from "../../lib/analysis/screening-local-engine-protocol";

const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function legCount(plan: StrategyCycleSelectionSnapshot["plan"]): number {
  return (["A", "B", "C", "D", "E", "F", "G", "H", "I"] as const)
    .filter(slot => plan[`strategy${slot}`] && (plan[`strategy${slot}Allocation`] ?? 0) > 1e-10).length;
}
export function intent(signals: readonly StrategyCycleRecentSignal[]) {
  return { sequence: signals.map(signal => ({ direction: signal.direction, target: signal.targetAllocation })),
    direction: strategyCycleSignalDirection(signals), target: strategyCycleSignalDirection(signals) ? signals.at(-1)!.targetAllocation : null };
}
async function bounded(path: string) {
  assert.ok((await stat(path)).size <= 16 * 1024 ** 2);
  return JSON.parse(await readFile(path, "utf8"));
}
async function main() {
  const input = await bounded(join(root, "data/full-screen-6-15/input.json")) as {
    bars: MarketBar[]; barsHash: string; snapshots: StrategyCycleSelectionSnapshot[]; settings: BacktestSettings;
    sources: { job: string; requestHash: string; resultHash: string }[];
  };
  const signals = await bounded(join(root, "data/full-screen-6-15/signals.json")) as {
    sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[];
  };
  assert.equal(sha(input), signals.sourceHash); assert.equal(sha(input.bars), input.barsHash);
  assert.ok(input.bars.length <= 10000);
  const selected = input.snapshots.filter(snapshot => legCount(snapshot.plan) === 6); assert.equal(selected.length, 7);
  const engine = resolve(root, "../../data/state/screening-engine");
  const requests: LocalScreeningJobRequest[] = [];
  for (const snapshot of selected) {
    const path = join(engine, snapshot.label!, "request.json");
    const text = await readFile(path, "utf8"), request = JSON.parse(text);
    const source = input.sources.find(source => source.job === snapshot.label)!;
    assert.equal(createHash("sha256").update(text).digest("hex"), source.requestHash);
    assert.equal(request.barCount, snapshot.decisionIndex + 1); assert.equal(request.options.maxCombinationStrategies, 6);
    assert.equal(request.settings.endTime, snapshot.decisionTime);
    requests.push(request);
  }
  const files = ["SIX_VS_FIVE_DESIGN.md", "six-vs-five.ts", "contribution-study.ts", "analyze.ts",
    "../../lib/analysis/screening-validation.ts", "../../lib/analysis/strategy-combinations.ts",
    "../../lib/analysis/strategies.ts", "../../lib/analysis/indicators.ts", "../../lib/analysis/screening.ts",
    "../../lib/analysis/strategy-cycle-validation.ts", "../../lib/analysis/sma-position-overlay.ts"];
  const identity = sha({ source: sha(input), requests, code: await Promise.all(files.map(file => readFile(join(root, file), "utf8"))) });
  const checkpoint = join(root, "data/six-vs-five/rows.json"), output = join(root, "output/six-vs-five");
  type Row = { time: string; index: number; six: unknown; max5: unknown; exactly5: unknown; elapsedSeconds: number };
  let rows: Row[] = [];
  try {
    const saved = await bounded(checkpoint); assert.equal(saved.identity, identity);
    assert.ok(saved.rows.length <= selected.length);
    saved.rows.forEach((row: Row, offset: number) => assert.equal(row.time, selected[offset]!.decisionTime)); rows = saved.rows;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const resumed = rows.length, controller = new AbortController();
  process.on("SIGINT", () => controller.abort()); process.on("SIGTERM", () => controller.abort());
  const start = input.bars.length - 2000, decisions = new Map(signals.rows.map(row => [row.index, row.signals]));
  for (let offset = rows.length; offset < selected.length; offset++) {
    const snapshot = selected[offset]!, request = requests[offset]!, began = Date.now();
    const bars = input.bars.slice(0, snapshot.decisionIndex + 1);
    const originalSignals = strategyCycleRecentSignals(bars, snapshot, snapshot.decisionIndex);
    assert.deepEqual(originalSignals, decisions.get(snapshot.decisionIndex));
    const outcome = await runScreeningWithValidation(bars, request.settings, request.config as ScreeningValidationConfig,
      { ...request.options, maxCombinationStrategies: 5, yieldEvery: 2048, signal: controller.signal,
        onProgress: progress => {
          if (process.memoryUsage().rss > 2 * 1024 ** 3) controller.abort();
          if (progress.stageCompleted === 0) console.log(`${snapshot.decisionTime} ${progress.stage}`);
        } });
    assert.ok(!outcome.cancelled && !controller.signal.aborted, "Stopped safely; rerun to resume completed dates");
    assert.equal(outcome.failedCount, 0);
    const best = selectBestShortcutScreeningResult(outcome.singleResults, outcome.results, "totalReturn"); assert.ok(best);
    const five = outcome.results.filter(result => legCount(screeningResultPlan(result)) === 5)
      .sort((left, right) => compareScreeningResults(left, right, "totalReturn"))[0]; assert.ok(five);
    const baseline = contributionReplay(bars, decisions, start, DEFAULT_POSITION_OVERLAY_OPTIONS);
    const compare = (result: typeof best.result, relativeLongStrategy: StrategyCycleSelectionSnapshot["fixedRelativeLongStrategy"]) => {
      const replacement = { ...snapshot, plan: screeningResultPlan(result), fixedRelativeLongStrategy: relativeLongStrategy };
      const alternativeSignals = strategyCycleRecentSignals(bars, replacement, snapshot.decisionIndex);
      const alternative = new Map(decisions); alternative.set(snapshot.decisionIndex, alternativeSignals);
      const path = contributionReplay(bars, alternative, start, DEFAULT_POSITION_OVERLAY_OPTIONS);
      return { plan: replacement.plan, relativeLongStrategy, legs: legCount(replacement.plan), trainingReturn: result.totalReturn,
        signals: alternativeSignals, intent: intent(alternativeSignals), target: path.targets[snapshot.decisionIndex],
        sameIntent: sha(intent(originalSignals)) === sha(intent(alternativeSignals)),
        sameActualTarget: path.targets[snapshot.decisionIndex] === baseline.targets[snapshot.decisionIndex] };
    };
    rows.push({ time: snapshot.decisionTime, index: snapshot.decisionIndex,
      six: { plan: snapshot.plan, relativeLongStrategy: snapshot.fixedRelativeLongStrategy,
        intent: intent(originalSignals), before: baseline.daily.at(-1)!.before, target: baseline.targets[snapshot.decisionIndex] },
      max5: compare(best.result, best.kind === "combination" ? best.result.relativeLongStrategy : null),
      exactly5: compare(five, five.relativeLongStrategy), elapsedSeconds: (Date.now() - began) / 1000 });
    await atomic(checkpoint, { identity, rows }); console.log(`Completed ${rows.length}/7 ${snapshot.decisionTime}`);
  }
  await atomic(join(output, "summary.json"), { identity, sourceHash: sha(input), resumed, rows,
    limitation: "Seven local same-baseline-state replacements only. Not a full max5 historical strategy replay. Training returns are in-sample." });
  console.log(JSON.stringify({ resumed, rows }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
