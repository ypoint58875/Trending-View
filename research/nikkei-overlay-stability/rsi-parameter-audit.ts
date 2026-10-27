import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { atomic, root } from "./analyze";
import { ShapeContext, shapeReplay, type ShapePolicy } from "./shape-priority";
import { runStrategyCycleCloseBacktest, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest, type BacktestSettings } from "../../lib/analysis/backtest";
import { fallbackMetrics } from "./sma20-fallback";
import type { MarketBar } from "../../lib/market/types";

const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function bounded(path: string) {
  assert.ok((await stat(path)).size <= 16 * 1024 ** 2);
  return JSON.parse(await readFile(path, "utf8"));
}
interface Row {
  policy: ShapePolicy; targetHash: string; totalReturn: number; last500: number; maxDrawdown: number;
  first1500: number; recent: number; entries: number; forced: number;
}
async function main() {
  const summary = await bounded(join(root, "output/rsi-parameter/summary.json"));
  const rows: Row[] = [];
  for (const phase of ["single", "combined"]) {
    const folder = join(root, "data/rsi-parameter", summary.identity, phase);
    const manifest = await bounded(join(folder, "manifest.json"));
    let completed = 0;
    for (const entry of manifest.chunks) {
      assert.match(entry.file, /^chunk-\d{5}\.json$/);
      const chunk = await bounded(join(folder, entry.file)); assert.equal(sha(chunk), entry.hash);
      assert.equal(chunk.identity, manifest.identity); assert.equal(chunk.offset, completed);
      rows.push(...chunk.rows); completed += chunk.rows.length;
    }
    assert.equal(completed, manifest.completed);
  }
  assert.equal(rows.length, summary.singleCount + summary.combinedCount);
  const input = await bounded(join(root, "data/full-screen-6-15/input.json")) as {
    bars: MarketBar[]; settings: BacktestSettings;
  };
  assert.equal(sha(input), summary.sourceHash);
  const saved = await bounded(join(root, "data/full-screen-6-15/signals.json")) as {
    sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[];
  };
  assert.equal(saved.sourceHash, summary.sourceHash);
  const { bars, settings } = input, start = bars.length - 2000, context = new ShapeContext(bars);
  const decisions = new Map(saved.rows.map((row) => [row.index, row.signals]));
  const legacy = await bounded(join(root, "output/descending-sequence/summary.json"));
  assert.equal(legacy.sourceHash, summary.sourceHash);
  for (const row of legacy.rows as Row[]) {
    const exitRsiSettings = row.policy.exitRsi === "off" ? undefined : { period: 14,
      threshold: row.policy.exitRsi === "below50" ? 50 : 70, lookback: 14 };
    assert.equal(sha(shapeReplay(context, decisions, start, { ...row.policy, exitRsiSettings }).targets), row.targetHash);
  }
  const boundary = bars.findIndex((bar) => bar.time === "2026-07-21") - start + 1;
  const baseline = summary.baseline as Row;
  const double = (row: Row) => row.totalReturn > baseline.totalReturn + 1e-9 && row.last500 > baseline.last500 + 1e-9;
  const triple = (row: Row) => double(row) && row.maxDrawdown > baseline.maxDrawdown + 1e-9;
  const targetsMetrics = (targets: number[], nextOpen = false) => {
    const metrics = fallbackMetrics(nextOpen ? runAllocationBacktest(bars, targets,
      { ...settings, positionOverlay: undefined, executionPolicy: "hybrid" })
      : runStrategyCycleCloseBacktest(bars, targets, settings), settings.initialCash, boundary);
    return { totalReturn: metrics.totalReturn, last500: metrics.final500.totalReturn, maxDrawdown: metrics.maxDrawdown,
      first1500: metrics.first1500.totalReturn, recent: metrics.recent.totalReturn };
  };
  const selected: Row[] = [...new Map([summary.bestCombined[0],
    [...rows.filter(double)].sort((left, right) => right.totalReturn - left.totalReturn)[0],
    summary.bestEntries.find((row: Row) => row.policy.entry === "higher-low" && row.policy.decline === 0.09),
    ...summary.tripleDistinct, ...summary.bestExits.slice(0, 2)].filter(Boolean)
    .map((row: Row) => [row.targetHash, row])).values()] as Row[];
  const audits = selected.map((row) => {
    const path = shapeReplay(context, decisions, start, row.policy, true);
    assert.equal(sha(path.targets), row.targetHash);
    const omitted = path.events.map((event) => {
      const alternative = shapeReplay(context, decisions, start, row.policy, true, new Set([event.index]));
      const metrics = targetsMetrics(alternative.targets);
      return { omitted: event.time, kind: event.kind, ...metrics,
        retainsDouble: double({ ...row, ...metrics }), retainsTriple: triple({ ...row, ...metrics }),
        replacementActions: alternative.events.filter((next) => !path.events.some((old) => old.index === next.index)) };
    });
    const entryNeighbors = row.policy.entryRsiSettings ? rows.filter((candidate) => !candidate.policy.id.startsWith("combined:") &&
      candidate.policy.entry === row.policy.entry && candidate.policy.decline === row.policy.decline &&
      candidate.policy.entryRsi === row.policy.entryRsi && candidate.policy.entryRsiSettings?.lookback === row.policy.entryRsiSettings?.lookback &&
      Math.abs(candidate.policy.entryRsiSettings!.period - row.policy.entryRsiSettings!.period) <= 1 &&
      Math.abs((candidate.policy.entryRsiSettings!.threshold ?? 0) - (row.policy.entryRsiSettings!.threshold ?? 0)) <= 5) : [];
    const exitNeighbors = row.policy.exitRsiSettings ? rows.filter((candidate) => !candidate.policy.id.startsWith("combined:") &&
      candidate.policy.descending?.field === row.policy.descending?.field && candidate.policy.descending?.sessions === row.policy.descending?.sessions &&
      candidate.policy.exitPriority === row.policy.exitPriority && candidate.policy.exitRsi === row.policy.exitRsi &&
      candidate.policy.exitRsiSettings?.lookback === row.policy.exitRsiSettings?.lookback &&
      Math.abs(candidate.policy.exitRsiSettings!.period - row.policy.exitRsiSettings!.period) <= 1 &&
      Math.abs((candidate.policy.exitRsiSettings!.threshold ?? 0) - (row.policy.exitRsiSettings!.threshold ?? 0)) <= 5) : [];
    const matchedNeighbors = (neighbors: Row[], side: "entry" | "exit") => neighbors.map((neighbor) => {
      const policy = { ...row.policy, id: `neighbor-${side}:${neighbor.policy.id}:${row.policy.id}`,
        ...(side === "entry" ? { entryRsiSettings: neighbor.policy.entryRsiSettings } : { exitRsiSettings: neighbor.policy.exitRsiSettings }) };
      const alternative = shapeReplay(context, decisions, start, policy);
      return { ...row, policy, targetHash: sha(alternative.targets), ...targetsMetrics(alternative.targets) };
    });
    const matchedEntry = matchedNeighbors(entryNeighbors, "entry"), matchedExit = matchedNeighbors(exitNeighbors, "exit");
    return { row, nextOpen: targetsMetrics(path.targets, true), events: path.events, omitted,
      entryNeighbors: matchedEntry, exitNeighbors: matchedExit, entryNeighborDouble: matchedEntry.filter(double).length,
      exitNeighborDouble: matchedExit.filter(double).length, entryNeighborTriple: matchedEntry.filter(triple).length,
      exitNeighborTriple: matchedExit.filter(triple).length };
  });
  const doubles = rows.filter(double), triples = rows.filter(triple);
  const primary = rows.filter((row) => !row.policy.id.startsWith("combined:") && row.policy.entry === "close4");
  const audit = { identity: summary.identity, legacyPathsVerified: legacy.rows.length,
    auditCodeHash: sha(await readFile(join(root, "rsi-parameter-audit.ts"), "utf8")), total: rows.length, doubleRows: doubles.length,
    doublePaths: new Set(doubles.map((row) => row.targetHash)).size, tripleRows: triples.length,
    triplePaths: new Set(triples.map((row) => row.targetHash)).size,
    entryDouble: doubles.filter((row) => !row.policy.descending).length,
    exitDouble: doubles.filter((row) => row.policy.entry === "off").length,
    combinedDouble: doubles.filter((row) => row.policy.id.startsWith("combined:")).length,
    primaryClose4Double: primary.filter(double).length,
    primaryClose4BestFull: [...primary].sort((left, right) => right.totalReturn - left.totalReturn)[0], audits };
  await atomic(join(root, "output/rsi-parameter/audit.json"), audit);
  await writeFile(join(root, "output/rsi-parameter/AUDIT.md"), `# RSI parameter audit\n\n${audit.doubleRows} double-improving rows represent ${audit.doublePaths} distinct paths; ${audit.tripleRows} triple-improving rows represent ${audit.triplePaths} paths. Primary close4 entries have ${audit.primaryClose4Double} double-improving rows.\n\nDetailed same-period neighboring thresholds, next-open replay and endogenous action-date omissions are in audit.json. An omitted action may be replaced on a later day; it does not remove an entire episode. Historical threshold selection is not a held-out performance guarantee.\n`);
  console.log(JSON.stringify({ ...audit, audits: audits.map((item) => ({ id: item.row.policy.id,
    full: item.row.totalReturn, last: item.row.last500, dd: item.row.maxDrawdown, open: item.nextOpen,
    events: item.events.length, omissionFailsDouble: item.omitted.filter((row) => !row.retainsDouble).map((row) => row.omitted),
    entryNeighborDouble: `${item.entryNeighborDouble}/${item.entryNeighbors.length}`,
    exitNeighborDouble: `${item.exitNeighborDouble}/${item.exitNeighbors.length}`,
    entryNeighborTriple: item.entryNeighborTriple, exitNeighborTriple: item.exitNeighborTriple })) }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
