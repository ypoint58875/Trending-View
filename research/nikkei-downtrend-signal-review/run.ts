import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import { buildStrategyCycleRollingReport, buildStrategyCycleRollingSchedule, strategyCycleRecentSignals, strategyCycleSignalDirection,
  type StrategyCycleSelectionSnapshot } from "../../lib/analysis/strategy-cycle-validation";
import { DEFAULT_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import type { BacktestSettings } from "../../lib/analysis/backtest";
import type { MarketBar } from "../../lib/market/types";
import { metrics, POLICIES, replay, skippedDown, type Path, type SignalRow } from "./model";

const root = dirname(fileURLToPath(import.meta.url));
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
async function bounded(path: string) {
  assert.ok((await stat(path)).size <= 16 * 1024 ** 2, `File exceeds 16MiB: ${path}`);
  return readFile(path, "utf8");
}
async function atomic(path: string, value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  assert.ok(Buffer.byteLength(text) <= 16 * 1024 ** 2, `Output exceeds 16MiB: ${path}`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, text);
  await replaceFileAtomically(`${path}.tmp`, path);
}
const source = join(root, "../nikkei-overlay-stability/data/full-screen-6-15");
const inputText = await bounded(join(source, "input.json")), signalText = await bounded(join(source, "signals.json"));
const input = JSON.parse(inputText) as { bars: MarketBar[]; barsHash: string;
  snapshots: StrategyCycleSelectionSnapshot[]; settings: BacktestSettings };
const original = JSON.parse(signalText) as { sourceHash: string; rows: SignalRow[] };
assert.equal(sha(JSON.stringify(input)), original.sourceHash);
assert.equal(sha(JSON.stringify(input.bars)), input.barsHash);
assert.ok(input.bars.length <= 10_000 && input.snapshots.length <= 2_048);
const dependencies = ["run.ts", "model.ts", "../../lib/analysis/strategy-cycle-validation.ts",
  "../../lib/analysis/sma-position-overlay.ts", "../../lib/analysis/strategy-combinations.ts",
  "../../lib/analysis/strategies.ts", "../../lib/analysis/indicators.ts", "../../lib/analysis/backtest.ts"];
const identity = sha([inputText, signalText, ...await Promise.all(dependencies.map(path => bounded(join(root, path))))].join("\n"));
const data = join(root, "data", identity), output = join(root, "output", identity);
const progressPath = join(data, "progress.json");
const { bars } = input, start = bars.length - 2000;
const snapshots = input.snapshots;
const settings = { ...input.settings, positionOverlay: DEFAULT_POSITION_OVERLAY_OPTIONS, interval: "1d" as const };
const regular = new Map(original.rows.map(row => [row.index, row.signals]));
assert.deepEqual(original.rows.map(row => row.index), snapshots.map(row => row.decisionIndex));
assert.deepEqual(buildStrategyCycleRollingSchedule(bars, 2000, 10)!.decisionIndexes, snapshots.map(row => row.decisionIndex));
const candidateIndexes = bars.flatMap((_, index) => index >= start && !regular.has(index) && skippedDown(bars, index) ? [index] : []);
let extraRows: SignalRow[] = [], attempts = 0, peakMiB = process.memoryUsage().rss / 1024 ** 2;
try {
  const saved = JSON.parse(await bounded(progressPath));
  assert.equal(saved.identity, identity);
  extraRows = saved.rows; attempts = saved.attempts;
  assert.ok(extraRows.length <= candidateIndexes.length);
  extraRows.forEach((row, index) => assert.equal(row.index, candidateIndexes[index]));
} catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
await atomic(join(data, "input.json"), inputText);
await atomic(join(data, "original-signals.json"), signalText);
await atomic(join(data, "source_registry.jsonl"), JSON.stringify({ source, accessedAt: new Date().toISOString(),
  identity, sourceHash: original.sourceHash, inputHash: sha(inputText), signalHash: sha(signalText),
  start: bars[start].time, end: bars.at(-1)!.time, screeningWindow: 10, evaluationSessions: 2000,
  currentOverlay: DEFAULT_POSITION_OVERLAY_OPTIONS.model, providerRequests: 0 }) + "\n");
attempts++;
const resumed = extraRows.length, limitIndex = process.argv.indexOf("--limit");
const limit = limitIndex < 0 ? candidateIndexes.length + 1 : Number(process.argv[limitIndex + 1]);
assert.ok(Number.isInteger(limit) && limit > 0);
let interrupted = false;
process.on("SIGINT", () => { interrupted = true; });
process.on("SIGTERM", () => { interrupted = true; });
const progress = (status: string, lastError: string | null = null) => atomic(progressPath, {
  identity, attempts, status, updatedAt: new Date().toISOString(), completed: extraRows.length,
  pending: candidateIndexes.length - extraRows.length, retryCount: attempts - 1, lastError, peakMiB, rows: extraRows,
});
await progress("running");
try {
  let winner = 0;
  for (const index of candidateIndexes.slice(extraRows.length)) {
    while (winner + 1 < snapshots.length && snapshots[winner + 1].decisionIndex <= index) winner++;
    assert.ok(snapshots[winner].decisionIndex < index);
    extraRows.push({ index, signals: strategyCycleRecentSignals(bars, snapshots[winner], index) });
    peakMiB = Math.max(peakMiB, process.memoryUsage().rss / 1024 ** 2);
    assert.ok(peakMiB < 1536, "Signal extraction RSS bound reached");
    if (extraRows.length % 16 === 0) { await progress("running"); console.log(`Signals ${extraRows.length}/${candidateIndexes.length}`); }
    if (interrupted || extraRows.length - resumed >= limit) break;
  }
  if (extraRows.length < candidateIndexes.length) {
    await progress("interrupted"); console.log(JSON.stringify({ identity, status: "interrupted", completed: extraRows.length, pending: candidateIndexes.length - extraRows.length }));
  } else {
    await progress("signals-complete");
    const extras = new Map(extraRows.map(row => [row.index, row.signals]));
    const baseline = replay(bars, regular, extras, start, settings, "baseline");
    const production = buildStrategyCycleRollingReport(bars, snapshots, 2000, 10, settings);
    assert.ok(Math.abs(metrics(baseline, settings.initialCash).net - production.updateReturn) < 1e-10);
    assert.equal(baseline.fills.length, production.rebalances.length);
    const economic = (fills: Path["fills"]) => fills.map(({ time, fillPrice, fromAllocation, targetAllocation, reason }) =>
      ({ time, fillPrice, fromAllocation, targetAllocation, reason }));
    assert.deepEqual(economic(baseline.fills), economic(production.rebalances));
    const sameFills = (a: Path["fills"], b: Path["fills"]) => a.length === b.length && a.every((fill, i) =>
      fill.time === b[i].time && fill.reason === b[i].reason && Math.abs(fill.fillPrice - b[i].fillPrice) < 1e-7 &&
      Math.abs(fill.fromAllocation - b[i].fromAllocation) < 1e-9 && Math.abs(fill.targetAllocation - b[i].targetAllocation) < 1e-9);
    const rows = [];
    for (const policy of POLICIES) {
      const path = policy === "baseline" ? baseline : replay(bars, regular, extras, start, settings, policy);
      for (const offset of [500, 1000, 1500]) {
        const cut = start + offset;
        const part = replay(bars, regular, extras, start, settings, policy, cut);
        assert.deepEqual(replay(bars, regular, extras, start, settings, policy, bars.length, JSON.parse(JSON.stringify(part))), path);
        assert.deepEqual(replay(bars.slice(0, cut), regular, extras, start, settings, policy).days, path.days.slice(0, offset));
      }
      const row = { policy, ...metrics(path, settings.initialCash),
        changedTargetDays: path.days.filter((day, i) => Math.abs(day.target - baseline.days[i].target) > 1e-10).length,
        changedFillDates: [...new Set([...path.fills, ...baseline.fills].map(fill => fill.time))].filter(time =>
          !sameFills(path.fills.filter(fill => fill.time === time), baseline.fills.filter(fill => fill.time === time))).length };
      await atomic(join(output, `${policy}.json`), { identity, row, path });
      rows.push(row); console.log(JSON.stringify(row));
    }
    const diagnostic = (days: Path["days"]) => ({
      days: days.length, signalDays: days.filter(day => day.observed.length).length,
      reduceDays: days.filter(day => day.direction === "reduce").length,
      increaseDays: days.filter(day => day.direction === "increase").length,
      sequenceHoldDays: days.filter(day => day.observed.length && day.direction === null).length,
      episodes: new Set(days.map(day => day.episode?.index).filter(index => index !== undefined)).size,
      events: days.filter(day => day.observed.length).map(day => ({ time: day.time, entryTime: day.episode ? bars[day.episode.index].time : null,
        direction: day.direction, signals: day.observed, before: day.before, pendingBefore: day.pendingBefore,
        pendingAfter: day.pendingAfter, stopped: day.stopped, actualClear: day.actualClear,
        closeLossSinceEntry: day.episode ? (bars[day.index].close / bars[day.episode.index].close - 1) * 100 : null })),
    });
    const eligible = baseline.days.filter(day => day.skippedDown && day.held);
    const narrow = eligible.filter(day => day.episode?.downEntry && day.episode.uninterrupted);
    const bearish = eligible.filter(day => day.episode?.bearishEntry && day.episode.uninterruptedBearish);
    const skippedAfterBullish = baseline.days.filter(day => day.skippedDown &&
      bars[day.index - 1].close > bars[day.index - 1].open);
    const entries = baseline.fills.filter(fill => fill.fromAllocation <= 1e-10 && fill.targetAllocation > 1e-10);
    const summary = { identity, sourceHash: original.sourceHash, start: bars[start].time, end: bars.at(-1)!.time,
      sessions: 2000, regularDates: regular.size, skippedDates: 2000 - regular.size,
      skippedDownDates: candidateIndexes.length, baselineFills: baseline.fills.length,
      baselineSignalDates: original.rows.filter(row => row.signals.length).length,
      baselineReduceDates: original.rows.filter(row => strategyCycleSignalDirection(row.signals) === "reduce").length,
      totalEntries: entries.length, downCloseEntries: entries.filter(fill => {
        const i = bars.findIndex(bar => bar.time === fill.time); return bars[i].close < bars[i - 1].close;
      }).length,
      holdingDowntrend: diagnostic(eligible), downEntryUninterrupted: diagnostic(narrow),
      bearishEntryUninterrupted: diagnostic(bearish),
      skippedDownAfterBullish: skippedAfterBullish.length,
      heldSkippedDownAfterBullish: skippedAfterBullish.filter(day => day.held).length, rows,
      verification: { productionBaselineParity: true, economicFillParity: true,
        serializedResumes: POLICIES.length * 3, causalReplayPrefixes: POLICIES.length * 3, extractionUsesCausalPrefixes: true },
      peakMiB, limitation: "Frozen 10-session winners through 2026-10-26; not current browser state; no new-winner rescreening; index-close proxy." };
    await atomic(join(output, "summary.json"), summary);
    await atomic(join(root, "output/latest.json"), { identity, output, data });
    await progress("complete");
    const table = ["| Policy | Net % | MaxDD % | Fills | Extra checks | Extra reduce signals | Extra clears | Changed fill dates |",
      "|---|---:|---:|---:|---:|---:|---:|---:|", ...rows.map(row =>
        `| ${row.policy} | ${row.net.toFixed(4)} | ${row.maxDrawdown.toFixed(4)} | ${row.fills} | ${row.extraCheckedDays} | ${row.extraReduceDays} | ${row.extraClearFills} | ${row.changedFillDates} |`)].join("\n");
    await atomic(join(root, "RESULTS.md"), `# Downtrend signal review results\n\n${summary.start}..${summary.end};2,000 sessions;10-session frozen full-screen winners;current v11;3bps commission+2bps slippage. No production/account changes.\n\n${table}\n\nBaseline skipped-down holding dates:${eligible.length};with signals:${summary.holdingDowntrend.signalDays};reduce:${summary.holdingDowntrend.reduceDays}. Close-down entry uninterrupted subset:${narrow.length} dates across${summary.downEntryUninterrupted.episodes} episodes;reduce:${summary.downEntryUninterrupted.reduceDays}. Bearish-body entry uninterrupted subset:${bearish.length} dates;reduce:${summary.bearishEntryUninterrupted.reduceDays}. Counts are two-bar signal-check days,not unique independent signals. Extra fills include normal daily risk/guard handling and must not all be attributed causally to the added request. Same-state no-request probes identify direct marginal request effects in each policy JSON.\n\nYesterday bullish/today bearish dates skipped by the actual MA2 rule:${summary.skippedDownAfterBullish};invested:${summary.heldSkippedDownAfterBullish}. The production trigger is not a candle-sign-flip trigger.\n\nFull traces,observed signal sequences,pending/risk state and entry dates are in output/<identity>/summary.json and policy files. Identity:${identity}. Baseline economic fills and return equal production. ${POLICIES.length * 3} serialized resumes and ${POLICIES.length * 3} causal replay prefixes passed;extraction always uses the completed causal prefix. Max RSS observed during extraction:${peakMiB.toFixed(1)}MiB.\n\nThis is NOT a current browser-account export or a full-rescreening estimate. Later state-dependent checks use each variant's own actual holding. Down-entry-run means close below prior close on entry,then every subsequent close below its predecessor;bearish-entry-run uses close below open for entry and continuation. Both differ from MA2 trend. Existing protection can defer a discovered sell. No policy adopted.\n`);
    console.log(JSON.stringify({ identity, output, complete: true, eligibleDays: eligible.length,
      strictDays: narrow.length, extraSignals: summary.holdingDowntrend.signalDays }));
  }
} catch (error) { await progress("failed", error instanceof Error ? error.message : String(error)); throw error; }
