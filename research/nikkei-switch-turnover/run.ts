import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import { strategyCyclePlanKey, strategyCycleRecentSignals, strategyCycleSignalDirection, shouldScreenStrategyCycleAtIndex,
  runStrategyCycleCloseBacktest, type StrategyCycleSelectionSnapshot, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { SmaPositionOverlay, RSI_SHAPE_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import { runAllocationBacktest, type AllocationBacktestResult, type BacktestSettings } from "../../lib/analysis/backtest";
import type { MarketBar } from "../../lib/market/types";
import { POLICIES, replay, validateProgress, type Decision, type Policy, type Replay } from "./model";

const root = dirname(fileURLToPath(import.meta.url));
export const sha = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
async function bounded(path: string) {
  if ((await stat(path)).size > 16 * 1024 ** 2) throw new Error(`Input exceeds16MiB: ${path}`);
  return readFile(path, "utf8");
}
async function atomic(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, typeof value === "string" ? value : JSON.stringify(value));
  await replaceFileAtomically(`${path}.tmp`, path);
}
export function segment(result: AllocationBacktestResult, from: number, to: number, initial: number) {
  const base = from ? result.equity[from - 1].equity : initial, points = result.equity.slice(from, to);
  let peak = base, maxDrawdown = 0;
  for (const point of points) { peak = Math.max(peak, point.equity); maxDrawdown = Math.min(maxDrawdown, (point.equity / peak - 1) * 100); }
  const fills = result.rebalances.filter((fill) => fill.time >= points[0].time && fill.time <= points.at(-1)!.time);
  return { totalReturn: (points.at(-1)!.equity / base - 1) * 100, maxDrawdown, fills: fills.length,
    turnover: fills.reduce((sum, fill) => sum + Math.abs(fill.targetAllocation - fill.fromAllocation), 0) };
}
type Metrics = ReturnType<typeof segment>;
interface Row {
  policy: Policy; full: Metrics; train: Metrics; validation: Metrics; audit: Metrics;
  gross: Metrics; stress: Metrics; nextOpen: Metrics; nextOpenAudit: Metrics; blocks250: Metrics[];
  targetHash: string; vetoes: number; replacements: number; conflicts: number;
}

export function diagnostics(bars: MarketBar[], path: Replay, result: AllocationBacktestResult) {
  const indices = new Map(bars.map((bar, index) => [bar.time, index]));
  const events = new Map(path.events.filter((event) => Math.abs(event.target - event.from) > 1e-10).map((event) => [event.time, event]));
  const fills = result.rebalances.map((fill) => ({ ...fill, index: indices.get(fill.time)!, event: events.get(fill.time) ?? null }));
  const pairs = fills.slice(1).flatMap((right, i) => {
    const left = fills[i], leftDelta = left.targetAllocation - left.fromAllocation, rightDelta = right.targetAllocation - right.fromAllocation;
    if (leftDelta * rightDelta >= 0 || right.index - left.index > 7) return [];
    return [{ first: left, second: right, sessions: right.index - left.index,
      order: leftDelta > 0 ? "buy-sell" : "sell-buy", closeChange: (bars[right.index].close / bars[left.index].close - 1) * 100,
      matchedAllocation: Math.min(Math.abs(leftDelta), Math.abs(rightDelta)),
      switchRelated: [left, right].some((fill) => fill.event?.origin.startsWith("switch-")) }];
  });
  const origins = Object.fromEntries(["switch-current", "switch-pending", "native-request", "controller", "risk", "unmapped"].map((origin) => {
    const selected = fills.filter((fill) => (fill.event?.origin ?? "unmapped") === origin);
    return [origin, { fills: selected.length, turnover: selected.reduce((sum, fill) => sum + Math.abs(fill.targetAllocation - fill.fromAllocation), 0) }];
  }));
  const rounds = [];
  let entry: typeof fills[number] | null = null;
  for (const fill of fills) {
    if (!entry && fill.fromAllocation <= 1e-10 && fill.targetAllocation > 1e-10) entry = fill;
    if (entry && fill.targetAllocation <= 1e-10) {
      const from = result.equity.findIndex((point) => point.time === entry!.time), to = result.equity.findIndex((point) => point.time === fill.time);
      const base = from ? result.equity[from - 1].equity : 100000;
      rounds.push({ entry: entry.time, exit: fill.time, sessions: fill.index - entry.index,
        return: (result.equity[to].equity / base - 1) * 100, entryOrigin: entry.event?.origin, exitOrigin: fill.event?.origin });
      entry = null;
    }
  }
  return { fills, pairs, origins, rounds, churn: [3, 5, 7].map((horizon) => ({ horizon,
    pairs: pairs.filter((pair) => pair.sessions <= horizon).length,
    switchRelated: pairs.filter((pair) => pair.sessions <= horizon && pair.switchRelated).length })) };
}

export function qualified(row: Row, base: Row) {
  return row.policy !== "baseline" && row.train.totalReturn >= base.train.totalReturn - 3 - 1e-8 &&
    row.train.maxDrawdown >= base.train.maxDrawdown - 2 - 1e-8 && row.validation.totalReturn >= base.validation.totalReturn - 1e-8 &&
    row.validation.maxDrawdown >= base.validation.maxDrawdown - 1 - 1e-8 &&
    row.train.turnover <= base.train.turnover * .95 && row.validation.turnover <= base.validation.turnover * .95;
}

async function main() {
  const source = join(root, "../nikkei-overlay-stability/data/full-screen-6-15");
  const inputText = await bounded(join(source, "input.json")), signalsText = await bounded(join(source, "signals.json"));
  const input = JSON.parse(inputText) as { bars: MarketBar[]; barsHash: string; settings: BacktestSettings; snapshots: StrategyCycleSelectionSnapshot[] };
  const saved = JSON.parse(signalsText) as { sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[] };
  const sourceHash = sha(input), { bars, snapshots, settings } = input, start = bars.length - 2000;
  assert.equal(sourceHash, saved.sourceHash); assert.equal(sha(bars), input.barsHash);
  assert.ok(start >= 0 && bars.length <= 10000 && snapshots.length <= 2048);
  assert.ok(bars.every((bar, i) => Number.isFinite(bar.close) && bar.close > 0 && (!i || bar.time > bars[i - 1].time)));
  assert.deepEqual(snapshots.map((row) => row.decisionIndex), saved.rows.map((row) => row.index));
  const schedule = bars.flatMap((_, i) => i >= start && (i === start || shouldScreenStrategyCycleAtIndex(bars, i)) ? [i] : []);
  assert.deepEqual(snapshots.map((row) => row.decisionIndex), schedule);
  assert.ok(snapshots.every((row) => row.decisionTime === bars[row.decisionIndex].time && row.screeningWindow === 10));
  const files = ["DESIGN.md", "model.ts", "run.ts", "../../lib/analysis/sma-position-overlay.ts", "../../lib/analysis/indicators.ts",
    "../../lib/analysis/backtest.ts", "../../lib/analysis/strategy-cycle-validation.ts", "../../lib/analysis/strategy-combinations.ts",
    "../../lib/analysis/strategies.ts", "../../lib/analysis/strategy-execution.ts", "../../lib/analysis/entry-filter.ts"];
  const implementationHash = sha(await Promise.all(files.map((file) => readFile(join(root, file), "utf8"))));
  const identity = sha({ sourceHash, implementationHash }), directory = join(root, "data", identity), output = join(root, "output", identity);
  const checkpoint = join(directory, "progress.json"), signalCheckpoint = join(directory, "decisions.json");
  let attempts = 0, priorPeakMiB = 0, rows: Row[] = [], decisions: Decision[] = [];
  try { const progress = JSON.parse(await bounded(checkpoint)); validateProgress(progress, identity); rows = progress.rows; attempts = progress.attempts; priorPeakMiB = progress.peakMiB ?? 0; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  try {
    const progress = JSON.parse(await bounded(signalCheckpoint));
    assert.equal(progress.identity, identity); decisions = progress.decisions;
    assert.ok(Array.isArray(decisions) && decisions.length <= snapshots.length);
    decisions.forEach((row, i) => { assert.equal(row.index, snapshots[i].decisionIndex); assert.deepEqual(row.current, saved.rows[i].signals);
      assert.equal(row.changed, i > 0 && strategyCyclePlanKey(snapshots[i]) !== strategyCyclePlanKey(snapshots[i - 1])); });
    assert.equal(progress.hash, sha(decisions));
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const resumed = { decisions: decisions.length, policies: rows.length }; attempts++;
  await atomic(join(directory, "input.json"), inputText); await atomic(join(directory, "signals.json"), signalsText);
  await atomic(join(directory, "source_registry.jsonl"), JSON.stringify({ accessedAt: new Date().toISOString(), source: resolve(source),
    sourceHash, inputFileHash: sha(inputText), signalsFileHash: sha(signalsText), implementationHash, barsHash: input.barsHash }) + "\n");
  let interrupted = false, completedThisRun = 0, peakMiB = Math.max(priorPeakMiB, process.memoryUsage().rss / 1024 ** 2);
  process.on("SIGINT", () => { interrupted = true; }); process.on("SIGTERM", () => { interrupted = true; });
  const limitIndex = process.argv.indexOf("--limit"), limit = limitIndex < 0 ? Infinity : Number(process.argv[limitIndex + 1]);
  assert.ok(limit > 0 && (limit === Infinity || Number.isInteger(limit)));
  const progress = async (status: string, lastError: string | null = null) => atomic(checkpoint, { identity, status, attempts,
    updatedAt: new Date().toISOString(), completedDecisions: decisions.length, pendingDecisions: snapshots.length - decisions.length,
    completedPolicies: rows.length, pendingPolicies: POLICIES.length - rows.length, lastError, peakMiB, rows });
  const stop = async () => {
    peakMiB = Math.max(peakMiB, process.memoryUsage().rss / 1024 ** 2);
    if (peakMiB > 1536) { await progress("failed", "RSS exceeds1.5GiB; reduce workload before resuming"); throw new Error("RSS limit exceeded"); }
    if (interrupted || completedThisRun >= limit) { await progress("partial", "Stopped safely; rerun to resume");
      console.log(JSON.stringify({ status: "partial", identity, decisions: decisions.length, policies: rows.length, resumed, peakMiB })); return true; }
    return false;
  };
  try {
    for (let i = decisions.length; i < snapshots.length; i++) {
      if (await stop()) return;
      const row = snapshots[i], current = strategyCycleRecentSignals(bars, row, row.decisionIndex);
      assert.deepEqual(current, saved.rows[i].signals, `Cached incoming signal mismatch at${row.decisionTime}`);
      const changed = i > 0 && strategyCyclePlanKey(row) !== strategyCyclePlanKey(snapshots[i - 1]);
      decisions.push({ index: row.decisionIndex, changed, current,
        previous: i === 0 ? [] : changed ? strategyCycleRecentSignals(bars, snapshots[i - 1], row.decisionIndex) : current });
      await atomic(signalCheckpoint, { identity, hash: sha(decisions), decisions }); completedThisRun++;
      if (decisions.length % 100 === 0) { await progress("deriving-signals"); console.log(JSON.stringify({ decisions: decisions.length, total: snapshots.length, peakMiB })); }
      await new Promise<void>((done) => setImmediate(done));
    }
    const byIndex = new Map(decisions.map((row) => [row.index, row]));
    const baseline = replay(bars, byIndex, start, "baseline"), account = new SmaPositionOverlay(bars, DEFAULT_POSITION_OVERLAY_OPTIONS);
    const reference = bars.map(() => 0);
    for (let i = start; i < bars.length; i++) {
      const signals = byIndex.get(i)?.current ?? [], direction = strategyCycleSignalDirection(signals);
      if (direction) account.request(direction, signals.at(-1)!.targetAllocation, i);
      reference[i] = account.close(i, signals.length > 0);
    }
    assert.deepEqual(baseline.targets, reference); assert.deepEqual(baseline.cursor.overlay, account.checkpoint());
    assert.equal(runStrategyCycleCloseBacktest(bars, reference, settings).totalReturn, 440.9807031454993);
    const measure = (path: Replay, mode = "actual") => mode === "next-open"
      ? runAllocationBacktest(bars, path.targets, { ...settings, positionOverlay: undefined, executionPolicy: "hybrid" })
      : runStrategyCycleCloseBacktest(bars, path.targets, mode === "gross" ? { ...settings, commissionRate: 0, slippageRate: 0 }
        : mode === "stress" ? { ...settings, commissionRate: .0018, slippageRate: .0002 } : settings);
    const metrics = (result: AllocationBacktestResult, from = 0, to = 2000) => segment(result, from, to, settings.initialCash);
    const buildRow = (policy: Policy, path: Replay): Row => {
      const result = measure(path), next = measure(path, "next-open");
      return { policy, full: metrics(result), train: metrics(result, 0, 1000), validation: metrics(result, 1000, 1500), audit: metrics(result, 1500, 2000),
        gross: metrics(measure(path, "gross")), stress: metrics(measure(path, "stress")), nextOpen: metrics(next), nextOpenAudit: metrics(next, 1500, 2000),
        blocks250: Array.from({ length: 8 }, (_, i) => metrics(result, i * 250, (i + 1) * 250)), targetHash: sha(path.targets),
        vetoes: path.vetoes, replacements: path.replacements, conflicts: path.conflicts };
    };
    for (const policy of POLICIES.slice(rows.length)) {
      if (await stop()) return;
      const path = replay(bars, byIndex, start, policy), result = measure(path);
      rows.push(buildRow(policy, path));
      await atomic(join(output, `${policy}.json`), { policy, cursor: path.cursor, events: path.events, ...diagnostics(bars, path, result) });
      completedThisRun++; await progress("replaying-policies");
      console.log(JSON.stringify({ policy, full: rows.at(-1)!.full, vetoes: path.vetoes }));
      await new Promise<void>((done) => setImmediate(done));
    }
    // Fresh audit: complete paths, serialized-state recovery and truncated-bar causality for every policy.
    for (const row of rows) {
      const fresh = replay(bars, byIndex, start, row.policy); assert.deepEqual(buildRow(row.policy, fresh), row);
      for (const offset of [700, 1499]) {
        const until = start + offset, partial = replay(bars, byIndex, start, row.policy, until);
        assert.deepEqual(replay(bars, byIndex, start, row.policy, bars.length, JSON.parse(JSON.stringify(partial))), fresh);
        const prefix = replay(bars.slice(0, until), byIndex, start, row.policy);
        assert.deepEqual(prefix.targets, fresh.targets.slice(0, until)); assert.deepEqual(prefix.cursor, partial.cursor);
      }
    }
    peakMiB = Math.max(peakMiB, process.memoryUsage().rss / 1024 ** 2);
    if (peakMiB > 1536) throw new Error("RSS limit exceeded during audit");
    const candidates = rows.filter((row) => qualified(row, rows[0])).sort((a, b) => b.validation.totalReturn - a.validation.totalReturn || a.policy.localeCompare(b.policy));
    const selected = candidates[0]?.policy ?? "baseline", baseDiagnostics = diagnostics(bars, baseline, measure(baseline));
    const summary = { identity, sourceHash, implementationHash, start: bars[start].time, end: bars.at(-1)!.time,
      decisions: decisions.length, replacements: baseline.replacements, conflicts: baseline.conflicts, selected,
      qualified: candidates.map((row) => row.policy), resumed, attempts, rows, baselineDiagnostics: baseDiagnostics, peakMiB };
    await atomic(join(output, "summary.json"), summary);
    const table = ["| Policy | Full net | MaxDD | Fills | Turnover | Train net | Validation net | Final500 net | Vetoes |",
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
      ...rows.map((row) => `| ${row.policy} | ${row.full.totalReturn.toFixed(2)}% | ${row.full.maxDrawdown.toFixed(2)}% | ${row.full.fills} | ${row.full.turnover.toFixed(2)} | ${row.train.totalReturn.toFixed(2)}% | ${row.validation.totalReturn.toFixed(2)}% | ${row.audit.totalReturn.toFixed(2)}% | ${row.vetoes} |`)];
    const costs = ["| Policy | Gross | Actual net | Stress20bps | Next-open net | Next-open final500 |",
      "| --- | ---: | ---: | ---: | ---: | ---: |", ...rows.map((row) => `| ${row.policy} | ${row.gross.totalReturn.toFixed(2)}% | ${row.full.totalReturn.toFixed(2)}% | ${row.stress.totalReturn.toFixed(2)}% | ${row.nextOpen.totalReturn.toFixed(2)}% | ${row.nextOpenAudit.totalReturn.toFixed(2)}% |`)];
    const origins = ["| Local fill mechanism | Fills | Turnover |", "| --- | ---: | ---: |",
      ...Object.entries(baseDiagnostics.origins).map(([key, value]) => `| ${key} | ${value.fills} | ${value.turnover.toFixed(2)} |`)];
    const churn = ["| Maximum sessions | Consecutive opposite fill pairs | With switch-sensitive leg |", "| --- | ---: | ---: |",
      ...baseDiagnostics.churn.map((row) => `| ${row.horizon} | ${row.pairs} | ${row.switchRelated} |`)];
    await atomic(join(root, "RESULTS.md"), `# Strategy replacement turnover results\n\n${summary.start}..${summary.end};2000 sessions;${decisions.length} frozen decisions;${baseline.replacements} plan replacements;${baseline.conflicts} opposite-direction conflicts.\nSource:${sourceHash}. Identity:${identity}.\n\n${table.join("\n")}\n\nQualified:${summary.qualified.join(", ") || "none"}. Selected:${selected}. Qualification uses train and validation only; final500 is a reused conditional audit. No automatic adoption.\n\n## Actual economic fill provenance\n\n${origins.join("\n")}\n\n${churn.join("\n")}\n\nLocal same-state probes identify mechanisms, not additive causal profit. Consecutive pairs may overlap; future reversal is diagnostic-only. Pending-origin propagation is included. Full ledgers, pairs, short rounds and eight250-session blocks are in output/${identity}/.\n\n## Execution and cost sensitivity\n\n${costs.join("\n")}\n\nActual3bps commission+2bps slippage per side. Gross/net differences include compounding and are not fee cash sums. Next-open uses the same controller decisions with different fills; actual China-product execution is untested.\n\n## Verification and limitations\n\nBaseline complete targets/final state and440.9807031454993% match production. All7 cases freshly audited, two causal prefixes and two serialized controller resumes per case pass. Signal derivation validates all cached incoming decisions against fresh causal timelines. Peak observed RSS:${peakMiB.toFixed(1)}MiB below1536MiB. Raw/source/implementation identities and atomic progress retained. Sample, winners and v8 have been inspected previously; no untouched holdout or significance claim. Product rules, accounts and archives unchanged.\n`);
    await atomic(join(output, "manifest.json"), { identity, status: "complete", completed: rows.length, pending: 0,
      updatedAt: new Date().toISOString(), summaryHash: sha(summary), baselineParity: true, freshAudits: 7, prefixChecks: 14, resumeChecks: 14, peakMiB });
    await progress("complete"); await atomic(join(root, "output/latest.json"), { identity, summary: `output/${identity}/summary.json` });
    console.log(JSON.stringify({ status: "complete", identity, selected, qualified: summary.qualified, peakMiB, origins: baseDiagnostics.origins, churn: baseDiagnostics.churn }));
  } catch (error) { await progress("failed", error instanceof Error ? error.message : String(error)); throw error; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error); process.exitCode = 1; });
