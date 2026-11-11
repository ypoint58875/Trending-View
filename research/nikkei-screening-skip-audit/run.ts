import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import { buildStrategyCycleRollingReport, buildStrategyCycleRollingSchedule, strategyCyclePlanKey,
  type StrategyCycleSelectionSnapshot, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { SAME_CLOSE_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import type { BacktestSettings, AllocationRebalance } from "../../lib/analysis/backtest";
import type { MarketBar } from "../../lib/market/types";
import { compare, Stepper, WITNESSES, type State, type Outcome } from "./model";

const root = dirname(fileURLToPath(import.meta.url));
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
async function bounded(path: string) { assert.ok((await stat(path)).size <= 16 * 1024 ** 2); return readFile(path, "utf8"); }
async function atomic(path: string, value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  assert.ok(Buffer.byteLength(text) <= 16 * 1024 ** 2, `Output exceeds 16MiB: ${path}`);
  await mkdir(dirname(path), { recursive: true }); await writeFile(`${path}.tmp`, text);
  await replaceFileAtomically(`${path}.tmp`, path);
}
const source = join(root, "../nikkei-overlay-stability/data/full-screen-6-15");
const inputText = await bounded(join(source, "input.json")), signalText = await bounded(join(source, "signals.json"));
const input = JSON.parse(inputText) as { bars: MarketBar[]; barsHash: string;
  snapshots: StrategyCycleSelectionSnapshot[]; settings: BacktestSettings };
const signals = JSON.parse(signalText) as { sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[] };
assert.equal(hash(JSON.stringify(input)), signals.sourceHash); assert.equal(hash(JSON.stringify(input.bars)), input.barsHash);
const implementation = ["run.ts", "model.ts", "../../lib/analysis/sma-position-overlay.ts", "../../lib/analysis/backtest.ts",
  "../../lib/analysis/strategy-cycle-validation.ts", "../../lib/analysis/strategy-combinations.ts"];
const identity = hash([inputText, signalText, ...await Promise.all(implementation.map(path => bounded(join(root, path))))].join("\n"));
const data = join(root, "data", identity), output = join(root, "output", identity), checkpoint = join(data, "progress.json");
const { bars, snapshots } = input, start = bars.length - 2000;
assert.ok(bars.length <= 10_000 && snapshots.length <= 2_048);
assert.deepEqual(buildStrategyCycleRollingSchedule(bars, 2000, 10)!.decisionIndexes, snapshots.map(snapshot => snapshot.decisionIndex));
assert.deepEqual(signals.rows.map(row => row.index), snapshots.map(snapshot => snapshot.decisionIndex));
const settings = { ...input.settings, interval: "1d" as const, positionOverlay: DEFAULT_POSITION_OVERLAY_OPTIONS };
const byIndex = new Map(snapshots.map((snapshot, i) => [snapshot.decisionIndex, { snapshot, signals: signals.rows[i].signals }]));
interface Row {
  index: number; time: string; actual: Outcome; omitted: Outcome; comparison: ReturnType<typeof compare>;
  witnessesIndependent: boolean; witness: { name: string; comparison: ReturnType<typeof compare> } | null;
  rules: { invested: boolean; pending: boolean; cooldown: boolean; recentStop: boolean; protectedSupplement: boolean };
}
const stepper = new Stepper(bars, settings);
let accepted: State = stepper.initial(start), rows: Row[] = [], fills: AllocationRebalance[] = [];
let attempts = 0, peakMiB = process.memoryUsage().rss / 1024 ** 2;
try {
  const saved = JSON.parse(await bounded(checkpoint)); assert.equal(saved.identity, identity);
  accepted = saved.accepted; rows = saved.rows; fills = saved.fills; attempts = saved.attempts;
  assert.ok(Number.isInteger(accepted.index) && accepted.index >= start - 1 && accepted.index < bars.length);
  assert.deepEqual(rows.map(row => row.index), snapshots.filter(snapshot => snapshot.decisionIndex <= accepted.index).map(snapshot => snapshot.decisionIndex));
} catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
await atomic(join(data, "input.json"), inputText); await atomic(join(data, "signals.json"), signalText);
await atomic(join(data, "source_registry.jsonl"), JSON.stringify({ source, accessedAt: new Date().toISOString(), identity,
  inputHash: hash(inputText), signalHash: hash(signalText), sourceHash: signals.sourceHash, providerRequests: 0 }) + "\n");
attempts++;
const resumedIndex = accepted.index;
const limitIndex = process.argv.indexOf("--limit"), limit = limitIndex < 0 ? 2001 : Number(process.argv[limitIndex + 1]);
assert.ok(Number.isInteger(limit) && limit > 0);
let interrupted = false;
process.on("SIGINT", () => { interrupted = true; }); process.on("SIGTERM", () => { interrupted = true; });
const progress = (status: string, lastError: string | null = null) => atomic(checkpoint, { identity, status, attempts,
  completedDays: accepted.index - start + 1, pendingDays: bars.length - accepted.index - 1,
  completedDecisions: rows.length, updatedAt: new Date().toISOString(), retryCount: attempts - 1, lastError,
  peakMiB, accepted, rows, fills });
await progress("running");
try {
  for (let index = accepted.index + 1; index < bars.length; index++) {
    const before = accepted, unit = byIndex.get(index);
    const actual = stepper.step(before, index, unit?.signals ?? [], unit ? strategyCyclePlanKey(unit.snapshot) : before.planKey);
    if (unit) {
      const omitted = stepper.step(before, index, []);
      const comparisons = WITNESSES.map(witness => ({ name: witness.name,
        comparison: compare(stepper.step(before, index, witness.signals), omitted) }));
      rows.push({ index, time: bars[index].time, actual, omitted, comparison: compare(actual, omitted),
        witnessesIndependent: comparisons.every(item => item.comparison.fullEqual),
        witness: comparisons.find(item => !item.comparison.fullEqual) ?? null,
        rules: { invested: before.account.units > 1e-10, pending: before.overlay.pending !== null,
          cooldown: before.overlay.blockedUntil > index,
          recentStop: before.overlay.stoppedAt >= 0 && index - before.overlay.stoppedAt <= 5,
          protectedSupplement: before.overlay.lastSupplement !== null && index - before.overlay.lastSupplement < 7 } });
      assert.deepEqual(stepper.step(JSON.parse(JSON.stringify(before)), index, unit.signals, strategyCyclePlanKey(unit.snapshot)), actual);
    }
    accepted = actual.state; fills.push(...actual.fills);
    peakMiB = Math.max(peakMiB, process.memoryUsage().rss / 1024 ** 2); assert.ok(peakMiB < 1536, "RSS bound reached");
    if ((index - start + 1) % 32 === 0) await progress("running");
    if (interrupted || accepted.index - resumedIndex >= limit) break;
  }
  if (accepted.index < bars.length - 1) {
    await progress("interrupted"); console.log(JSON.stringify({ identity, completedDays: accepted.index - start + 1, completedDecisions: rows.length, status: "interrupted" }));
  } else {
    const production = buildStrategyCycleRollingReport(bars, snapshots, 2000, 10, settings);
    assert.deepEqual(accepted.overlay, production.checkpoint!.currentOverlay);
    assert.deepEqual(accepted.account, production.checkpoint!.current);
    const economics = (value: AllocationRebalance[]) => value.map(({ signals: _signals, ...rest }) => { void _signals; return rest; });
    assert.deepEqual(economics(fills), economics(production.rebalances));
    const net = ((accepted.account.cash + accepted.account.units * bars.at(-1)!.close) / settings.initialCash - 1) * 100;
    assert.ok(Math.abs(net - production.updateReturn) < 1e-10);
    const hindsight = new Set(rows.filter(row => row.comparison.fullEqual).map(row => row.index));
    const combined = new Stepper(bars, settings), fresh = new Stepper(bars, settings);
    const prefixCut = start + 1000, prefixStepper = new Stepper(bars.slice(0, prefixCut), settings);
    let combinedState = combined.initial(start), freshState = fresh.initial(start), prefixState = prefixStepper.initial(start);
    const combinedFills: AllocationRebalance[] = [];
    for (let index = start; index < bars.length; index++) {
      const unit = byIndex.get(index);
      const result = fresh.step(freshState, index, unit?.signals ?? [], unit ? strategyCyclePlanKey(unit.snapshot) : freshState.planKey);
      freshState = result.state;
      const keep = unit && !hindsight.has(index);
      const filtered = combined.step(combinedState, index, keep ? unit.signals : [], keep ? strategyCyclePlanKey(unit.snapshot) : combinedState.planKey);
      combinedState = filtered.state; combinedFills.push(...filtered.fills);
      assert.deepEqual(filtered, result);
      if (index < prefixCut) {
        prefixState = prefixStepper.step(prefixState, index, unit?.signals ?? [], unit ? strategyCyclePlanKey(unit.snapshot) : prefixState.planKey).state;
        assert.deepEqual(prefixState, freshState);
      }
      if (index === prefixCut - 1) freshState = JSON.parse(JSON.stringify(freshState));
    }
    assert.deepEqual(freshState, accepted); assert.deepEqual(economics(combinedFills), economics(fills));
    const groups = Object.keys(rows[0].rules).map(name => {
      const selected = rows.filter(row => row.rules[name as keyof Row["rules"]]);
      return { name, dates: selected.length, noFillDifference: selected.filter(row => row.comparison.fillsEqual).length,
        accountAndRiskNeutral: selected.filter(row => row.comparison.fillsEqual && row.comparison.accountEqual && row.comparison.targetEqual && row.comparison.overlayEqual).length,
        hindsightExactNeutral: selected.filter(row => row.comparison.fullEqual).length,
        witnessIndependent: selected.filter(row => row.witnessesIndependent).length };
    });
    const summary = { identity, sourceHash: signals.sourceHash, start: bars[start].time, end: bars.at(-1)!.time,
      decisions: rows.length, noFillDifference: rows.filter(row => row.comparison.fillsEqual).length,
      noAccountDifference: rows.filter(row => row.comparison.accountEqual && row.comparison.targetEqual).length,
      accountAndRiskNeutral: rows.filter(row => row.comparison.accountEqual && row.comparison.targetEqual && row.comparison.overlayEqual && row.comparison.fillsEqual).length,
      carriedPlanChanges: rows.filter(row => !row.comparison.planEqual).length,
      hindsightExactNeutral: hindsight.size, signalWitnessIndependent: rows.filter(row => row.witnessesIndependent).length,
      strictPreScreenCertified: 0, strictReason: "No rule gate prevents an unknown winning plan from replacing the carried plan; witness set can only refute independence, not certify all optimizer outcomes.",
      net, fills: fills.length, groups, peakMiB,
      verification: { productionStateAndFillsEqual: true, sameStateSerializedProbes: rows.length,
        combinedHindsightDailyEquivalence: 2000, prefixDailyEquivalence: 1000, freshEqualsResumed: true } };
    await atomic(join(output, "decisions.json"), { identity, rows }); await atomic(join(output, "summary.json"), summary);
    await atomic(join(root, "output/latest.json"), { identity, data, output }); await progress("complete");
    console.log(JSON.stringify(summary));
  }
} catch (error) { await progress("failed", error instanceof Error ? error.message : String(error)); throw error; }
