import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atomic, root } from "./analyze";
import { ShapeContext, shapeBaseline, shapeReplay, type ShapePolicy, type SequencePriceField } from "./shape-priority";
import { contributionReplay } from "./contribution-study";
import { fallbackMetrics } from "./sma20-fallback";
import { ATR_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import { runAllocationBacktest, type BacktestSettings } from "../../lib/analysis/backtest";
import { runStrategyCycleCloseBacktest, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";

export const sequenceFields: SequencePriceField[] = ["open", "close", "high", "low"];
export function descendingSequenceMenu(): ShapePolicy[] {
  const menu = [{ ...shapeBaseline }];
  for (const field of sequenceFields) for (const sessions of [3, 4, 5, 6])
    for (const exitPriority of ["guarded", "no-signal-force", "risk-first"] as const)
      for (const exitRsi of ["off", "falling", "below50", "from70"] as const) {
        menu.push({ ...shapeBaseline, id: `descending-${field}-${sessions}-${exitPriority}-${exitRsi}`,
          descending: { field, sessions }, exitPriority, exitRsi });
      }
  return menu;
}
const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function bounded(path: string) {
  assert.ok((await stat(path)).size <= 16 * 1024 ** 2);
  return JSON.parse(await readFile(path, "utf8"));
}
async function main() {
  const input = await bounded(join(root, "data/full-screen-6-15/input.json")) as {
    bars: MarketBar[]; barsHash: string; settings: BacktestSettings; snapshots: { decisionIndex: number }[];
  };
  const saved = await bounded(join(root, "data/full-screen-6-15/signals.json")) as {
    sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[];
  };
  const sourceHash = sha(input); assert.equal(sourceHash, saved.sourceHash); assert.equal(sha(input.bars), input.barsHash);
  assert.ok(input.bars.length <= 10000);
  assert.deepEqual(saved.rows.map((row) => row.index), input.snapshots.map((row) => row.decisionIndex));
  const { bars, settings } = input, start = bars.length - 2000;
  const context = new ShapeContext(bars), decisions = new Map(saved.rows.map((row) => [row.index, row.signals]));
  const boundary = bars.findIndex((bar) => bar.time === "2026-07-21") - start + 1;
  const baselinePath = shapeReplay(context, decisions, start, shapeBaseline);
  assert.deepEqual(baselinePath.targets, contributionReplay(bars, decisions, start, DEFAULT_POSITION_OVERLAY_OPTIONS).targets);
  assert.deepEqual(baselinePath.targets, (await bounded(join(root, "output/risk-exit-validation/ema3-atr2-anchor.json"))).targets);
  const metrics = (targets: number[], nextOpen = false) => fallbackMetrics(nextOpen
    ? runAllocationBacktest(bars, targets, { ...settings, positionOverlay: undefined, executionPolicy: "hybrid" })
    : runStrategyCycleCloseBacktest(bars, targets, settings), settings.initialCash, boundary);
  const run = (policy: ShapePolicy, omitted?: Set<number>) => {
    const path = shapeReplay(context, decisions, start, policy, false, omitted);
    return { policy, targetHash: sha(path.targets), requests: path.requests, forced: path.forced, ...metrics(path.targets) };
  };
  type Row = ReturnType<typeof run>;
  const menu = descendingSequenceMenu(); assert.equal(menu.length, 193);
  const implementationHash = sha(await Promise.all(["descending-sequence.ts", "DESCENDING_SEQUENCE_DESIGN.md", "shape-priority.ts",
    "../../lib/analysis/sma-position-overlay.ts", "../../lib/analysis/backtest.ts", "../../lib/analysis/strategy-cycle-validation.ts",
    "../../lib/analysis/indicators.ts"].map((path) => readFile(join(root, path), "utf8"))));
  const identity = sha({ sourceHash, implementationHash, menu }), checkpoint = join(root, "data/descending-sequence", identity, "rows.json");
  const rows: Row[] = [];
  try {
    const stored = await bounded(checkpoint); assert.equal(stored.identity, identity); assert.ok(stored.rows.length <= menu.length);
    stored.rows.forEach((row: Row, offset: number) => assert.deepEqual(row.policy, menu[offset])); rows.push(...stored.rows);
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const resumed = rows.length;
  let stopping = false;
  process.on("SIGINT", () => { stopping = true; }); process.on("SIGTERM", () => { stopping = true; });
  for (const policy of menu.slice(rows.length)) {
    if (stopping || process.memoryUsage().rss > 2 * 1024 ** 3) throw new Error("Interrupted or RSS limit; rerun to resume");
    rows.push(run(policy)); await atomic(checkpoint, { identity, rows });
  }
  for (const row of rows.filter((row) => row.policy.descending?.sessions === 4 &&
    ["open", "high"].includes(row.policy.descending.field))) {
    const legacy = { ...row.policy, descending: undefined,
      exit: row.policy.descending!.field === "open" ? "opens4" as const : "highs4" as const };
    assert.equal(sha(shapeReplay(context, decisions, start, legacy).targets), row.targetHash);
  }
  const baseline = rows[0]!;
  const score = (row: Row) => Math.min(row.totalReturn - baseline.totalReturn, row.final500.totalReturn - baseline.final500.totalReturn);
  const rank = (values: Row[]) => [...values].sort((left, right) => score(right) - score(left) || right.totalReturn - left.totalReturn);
  const candidates = rows.slice(1), double = candidates.filter((row) => score(row) > 1e-9);
  const triple = double.filter((row) => row.maxDrawdown > baseline.maxDrawdown + 1e-9);
  const rawForce = candidates.filter((row) => row.policy.exitPriority === "risk-first" && row.policy.exitRsi === "off");
  const firstSelected = [...rows].sort((left, right) => right.first1500.totalReturn - left.first1500.totalReturn)[0]!;
  const minDrawdown = [...candidates].sort((left, right) => right.maxDrawdown - left.maxDrawdown)[0]!;
  const chosen = [...new Map([baseline, ...rank(candidates).slice(0, 6), minDrawdown, firstSelected,
    ...sequenceFields.map((field) => rank(candidates.filter((row) => row.policy.descending?.field === field))[0]!)
  ].map((row) => [row.targetHash, row])).values()];
  const details = chosen.map((row) => {
    const path = shapeReplay(context, decisions, start, row.policy, true);
    const byYear: Record<string, number> = {};
    path.events.forEach((event) => { const year = event.time.slice(0, 4); byYear[year] = (byYear[year] ?? 0) + 1; });
    return { id: row.policy.id, nextOpen: metrics(path.targets, true), events: path.events, byYear };
  });
  const omission = [];
  for (const row of [...new Map([...rank(double).slice(0, 2), rank(candidates)[0]!, minDrawdown]
    .map((row) => [row.targetHash, row])).values()]) {
    const path = shapeReplay(context, decisions, start, row.policy, true);
    const values = path.events.slice(0, 100).map((event) => ({ time: event.time, ...run(row.policy, new Set([event.index])) }));
    omission.push({ id: row.policy.id, eventCount: path.events.length, tested: values.length,
      worstReturn: [...values].sort((left, right) => left.totalReturn - right.totalReturn)[0] ?? null,
      worstDrawdown: [...values].sort((left, right) => left.maxDrawdown - right.maxDrawdown)[0] ?? null });
  }
  const summary = { identity, sourceHash, implementationHash, start: bars[start]!.time, end: bars.at(-1)!.time,
    policies: rows.length, distinctPaths: new Set(rows.map((row) => row.targetHash)).size,
    baseline, rawForce, bestPerField: sequenceFields.map((field) => rank(candidates.filter((row) => row.policy.descending?.field === field))[0]!),
    doubleImprovers: rank(double), tripleImprovers: rank(triple), top: rank(candidates).slice(0, 12),
    minDrawdown, first1500Selected: firstSelected, details, omission, rows };
  await atomic(join(root, "output/descending-sequence/summary.json"), summary);
  const table = (values: Row[]) => ["| Rule | Full2000 | Final500 | MaxDD | Forced exits |", "|---|---:|---:|---:|---:|",
    ...values.map((row) => `| ${row.policy.id} | ${row.totalReturn.toFixed(2)}% | ${row.final500.totalReturn.toFixed(2)}% | ${Math.abs(row.maxDrawdown).toFixed(2)}% | ${row.forced} |`)].join("\n");
  await writeFile(join(root, "output/descending-sequence/REPORT.md"), `# Descending OHLC sequences\n\nSupplement full v7; ${summary.start}..${summary.end}, ${rows.length} configurations, ${summary.distinctPaths} distinct paths.\n\n## Unfiltered risk-first exits\n\n${table([baseline, ...rawForce])}\n\n## Best per price field by proximity to both return goals\n\n${table(summary.bestPerField)}\n\n## Leading candidates\n\n${table(summary.top)}\n\nDouble-return improvements:${double.length}; improvements also reducing drawdown:${triple.length}.\n\nClose-proxy only in these tables. Selected next-open sensitivity, event omissions and first1500-only selection are in summary.json. Historical search is exploratory, not unseen validation. Production remains unchanged.\n`);
  console.log(JSON.stringify({ policies: rows.length, resumed, distinct: summary.distinctPaths,
    double: double.length, triple: triple.length, best: summary.top.slice(0, 3), minDrawdown }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
