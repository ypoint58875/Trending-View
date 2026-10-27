import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { atomic, root } from "./analyze";
import { contributionReplay } from "./contribution-study";
import { fallbackMetrics } from "./sma20-fallback";
import { ATR_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import { runStrategyCycleCloseBacktest, strategyCycleRecentSignals,
  type StrategyCycleRecentSignal, type StrategyCycleSelectionSnapshot } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";
import type { BacktestSettings } from "../../lib/analysis/backtest";

const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function bounded(path: string) {
  assert.ok((await stat(path)).size <= 16 * 1024 ** 2);
  return JSON.parse(await readFile(path, "utf8"));
}
async function main() {
  const input = await bounded(join(root, "data/full-screen-6-15/input.json")) as {
    bars: MarketBar[]; settings: BacktestSettings; snapshots: StrategyCycleSelectionSnapshot[];
    sources: { job: string; resultHash: string }[];
  };
  const signals = await bounded(join(root, "data/full-screen-6-15/signals.json")) as {
    sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[];
  };
  const summary = await bounded(join(root, "output/six-vs-five/summary.json"));
  assert.equal(sha(input), signals.sourceHash); assert.equal(summary.sourceHash, signals.sourceHash);
  assert.equal(summary.rows.length, 7);
  const decisions = new Map(signals.rows.map(row => [row.index, row.signals]));
  const start = input.bars.length - 2000, boundary = input.bars.findIndex(bar => bar.time === "2026-07-21") - start + 1;
  const replay = (choices: typeof decisions) => {
    const path = contributionReplay(input.bars, choices, start, DEFAULT_POSITION_OVERLAY_OPTIONS);
    const result = runStrategyCycleCloseBacktest(input.bars, path.targets, input.settings);
    return { path, result, metrics: fallbackMetrics(result, input.settings.initialCash, boundary) };
  };
  const baseline = replay(decisions), anchor = await bounded(join(root, "output/risk-exit-validation/ema3-atr2-anchor.json"));
  assert.deepEqual(baseline.path.targets, anchor.targets);
  const replacements = [];
  for (const key of ["max5", "exactly5"]) {
    const alternative = new Map(decisions);
    for (const row of summary.rows) {
      const original = input.snapshots.find(snapshot => snapshot.decisionIndex === row.index)!;
      const candidate = row[key];
      const snapshot = { ...original, plan: candidate.plan, fixedRelativeLongStrategy: candidate.relativeLongStrategy };
      const generated = strategyCycleRecentSignals(input.bars, snapshot, row.index);
      assert.deepEqual(generated, candidate.signals); alternative.set(row.index, generated);
    }
    const result = replay(alternative);
    const changedDates = result.path.daily.filter((day, offset) => Math.abs(day.target - baseline.path.daily[offset]!.target) > 1e-10)
      .map(day => day.time);
    replacements.push({ key, targetHash: sha(result.path.targets), changedDates, ...result.metrics });
  }
  const training = [];
  for (const row of summary.rows) {
    const snapshot = input.snapshots.find(snapshot => snapshot.decisionIndex === row.index)!;
    const text = await readFile(join(root, "../../data/state/screening-engine", snapshot.label!, "result.json"), "utf8");
    const source = input.sources.find(source => source.job === snapshot.label)!;
    assert.equal(createHash("sha256").update(text).digest("hex"), source.resultHash);
    const result = JSON.parse(text); assert.equal(result.results.length, 1);
    training.push({ time: row.time, six: result.results[0].totalReturn,
      max5: row.max5.trainingReturn, exactly5: row.exactly5.trainingReturn });
  }
  const audit = { sourceHash: signals.sourceHash, summaryIdentity: summary.identity,
    baseline: { targetHash: sha(baseline.path.targets), ...baseline.metrics }, replacements, training,
    limitation: "Only the seven six-leg selections are replaced. All later winner plans and screening dates remain frozen. Not a full max5 search or unseen validation." };
  await atomic(join(root, "output/six-vs-five/audit.json"), audit);
  console.log(JSON.stringify(audit));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
