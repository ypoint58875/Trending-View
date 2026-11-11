import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { Stepper } from "../nikkei-screening-skip-audit/model";
import { strategyCyclePlanKey, type StrategyCycleSelectionSnapshot, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";
import type { BacktestSettings } from "../../lib/analysis/backtest";

test("complete report identifies zero self-comparison advantage and reproduces the independent carried-strategy policy", async () => {
  const sourceRoot = resolve("research/nikkei-overlay-stability/data/full-screen-6-15");
  const inputText = await readFile(join(sourceRoot, "input.json"), "utf8");
  const signalText = await readFile(join(sourceRoot, "signals.json"), "utf8");
  const input = JSON.parse(inputText) as { bars: MarketBar[]; snapshots: StrategyCycleSelectionSnapshot[]; settings: BacktestSettings };
  const saved = JSON.parse(signalText) as { rows: { index: number; signals: StrategyCycleRecentSignal[] }[] };
  const original = new Map(input.snapshots.map(s => [s.decisionIndex, s]));
  const signals = new Map(saved.rows.map(r => [r.index, r.signals]));
  const stepper = new Stepper(input.bars, input.settings), days = [], fills = [];
  let state = stepper.initial(input.bars.length - 2000);
  for (let index = state.index + 1; index < input.bars.length; index++) {
    const selected = original.get(index), next = stepper.step(state, index, signals.get(index) ?? [],
      selected ? strategyCyclePlanKey(selected) : state.planKey);
    days.push({ index, time: input.bars[index].time, ...next.state.account,
      equity: next.state.account.cash + next.state.account.units * input.bars[index].close,
      target: next.state.target, pending: next.state.overlay.pending, planKey: next.state.planKey, extra: false });
    fills.push(...next.fills); state = next.state;
  }
  const temporary = await mkdtemp(join(tmpdir(), "quantscope-holding-report-"));
  try {
    const data = join(temporary, "data"), output = join(temporary, "output"), reportPath = join(temporary, "RESULTS.md");
    await mkdir(data); await mkdir(output);
    const files = new Map([
      [join(data, "input.json"), inputText], [join(data, "original-signals.json"), signalText],
      [join(output, "alternative.json"), JSON.stringify({ days, fills, state })],
      [join(output, "baseline.json"), JSON.stringify({ days, fills })],
      [join(output, "snapshots.json"), JSON.stringify(input.snapshots)],
      [join(output, "summary.json"), JSON.stringify({ identity: "self-comparison-fixture", deltaReturnPoints: 0 })],
      [reportPath, "# Isolated report self-comparison fixture\n"],
      [join(temporary, "latest.json"), JSON.stringify({ status: "complete", data, output, reportPath })],
    ]);
    await Promise.all([...files].map(([path, text]) => writeFile(path, text)));
    await promisify(execFile)(process.execPath, ["--import", "tsx", resolve("research/nikkei-holding-rescreen/report.ts"), join(temporary, "latest.json")],
      { windowsHide: true, maxBuffer: 1024 * 1024, timeout: 120000 });
    const result = JSON.parse(await readFile(join(output, "difference-analysis.json"), "utf8"));
    assert.equal(result.firstAccountDifference, null); assert.equal(result.firstTargetDifference, null);
    assert.equal(result.accounting.summedContributionPoints, 0); assert.equal(result.changedTargetDays, 0);
    assert.ok(Math.abs(result.carriedStrategyOnly.net - 350.5911425933033) < 1e-8, JSON.stringify(result.carriedStrategyOnly));
    assert.equal(result.carriedStrategyOnly.checks, 149); assert.equal(result.carriedStrategyOnly.fills, 141);
    assert.ok(result.months.every((r: { contributionPoints: number }) => r.contributionPoints === 0));
  } finally {
    // Delete only the exact directory returned by mkdtemp after verifying its root.
    assert.equal(resolve(temporary).startsWith(resolve(tmpdir()) + sep), true);
    await rm(temporary, { recursive: true, force: true });
  }
});
