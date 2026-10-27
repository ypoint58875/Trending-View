import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atomic, root } from "./analyze";
import { ShapeContext, shapeBaseline, shapeReplay, type ShapePolicy } from "./shape-priority";
import { descendingSequenceMenu } from "./descending-sequence";
import { fallbackMetrics } from "./sma20-fallback";
import { runStrategyCycleCloseBacktest, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest, type BacktestSettings } from "../../lib/analysis/backtest";
import type { MarketBar } from "../../lib/market/types";

export function rsiEntryBases(): ShapePolicy[] {
  return (["close4", "high4", "higher-low"] as const).flatMap((entry) =>
    (entry === "close4" ? [5, 6, 7, 8, 9, 10] : [5, 7, 9]).map((decline) => ({ ...shapeBaseline,
      id: `${entry}-drop${decline}`, entry, decline: decline / 100 })));
}
export function rsiEntryFilters(): Partial<ShapePolicy>[] {
  const filters: Partial<ShapePolicy>[] = [];
  for (let period = 7; period <= 20; period += 1) {
    filters.push({ id: `rsi${period}-rise`, entryRsi: "rising", entryRsiSettings: { period } });
    for (let threshold = 30; threshold <= 65; threshold += 5)
      filters.push({ id: `rsi${period}-above${threshold}`, entryRsi: "above50", entryRsiSettings: { period, threshold } });
    for (const lower of [30, 40, 50]) for (const upper of [60, 70, 80])
      filters.push({ id: `rsi${period}-rise-range${lower}-${upper}`, entryRsi: "rising40-70", entryRsiSettings: { period, lower, upper } });
    for (let threshold = 20; threshold <= 45; threshold += 5) for (const lookback of [5, 10, 14, 20])
      filters.push({ id: `rsi${period}-rebound${threshold}-look${lookback}`, entryRsi: "rebound40", entryRsiSettings: { period, threshold, lookback } });
  }
  return filters;
}
export function rsiExitFilters(): Partial<ShapePolicy>[] {
  const filters: Partial<ShapePolicy>[] = [];
  for (let period = 7; period <= 20; period += 1) {
    filters.push({ id: `rsi${period}-fall`, exitRsi: "falling", exitRsiSettings: { period } });
    for (let threshold = 30; threshold <= 60; threshold += 5)
      filters.push({ id: `rsi${period}-below${threshold}`, exitRsi: "below50", exitRsiSettings: { period, threshold } });
    for (let threshold = 55; threshold <= 80; threshold += 5) for (const lookback of [5, 10, 14, 20])
      filters.push({ id: `rsi${period}-from${threshold}-look${lookback}`, exitRsi: "from70", exitRsiSettings: { period, threshold, lookback } });
  }
  return filters;
}
export function rsiParameterMenu(): ShapePolicy[] {
  const entries = rsiEntryBases();
  const exits = descendingSequenceMenu().filter((policy) => policy.descending && policy.exitRsi === "off");
  return [{ ...shapeBaseline }, ...entries, ...exits,
    ...entries.flatMap((base) => rsiEntryFilters().map((filter) => ({ ...base, ...filter, id: `${base.id}:${filter.id}` }))),
    ...exits.flatMap((base) => rsiExitFilters().map((filter) => ({ ...base, ...filter, id: `${base.id}:${filter.id}` })))];
}
const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function bounded(path: string) {
  assert.ok((await stat(path)).size <= 16 * 1024 ** 2);
  return JSON.parse(await readFile(path, "utf8"));
}
export function validateRsiChunk<T extends { policy: ShapePolicy }>(chunk: {
  identity: string; offset: number; rows: T[];
}, identity: string, offset: number, menu: ShapePolicy[]) {
  assert.equal(chunk.identity, identity); assert.equal(chunk.offset, offset);
  assert.ok(chunk.rows.length > 0 && chunk.rows.length <= 128);
  chunk.rows.forEach((row, index) => assert.deepEqual(row.policy, menu[offset + index]));
}
export function compareRsiRows(left: { totalReturn: number; last500: number; maxDrawdown: number },
  right: { totalReturn: number; last500: number; maxDrawdown: number },
  baseline: { totalReturn: number; last500: number }) {
  const score = (row: typeof left) => Math.min(row.totalReturn - baseline.totalReturn, row.last500 - baseline.last500);
  const difference = score(right) - score(left);
  if (Math.abs(difference) > 1e-9) return difference;
  if (Math.abs(right.totalReturn - left.totalReturn) > 1e-9) return right.totalReturn - left.totalReturn;
  if (Math.abs(right.maxDrawdown - left.maxDrawdown) > 1e-9) return right.maxDrawdown - left.maxDrawdown;
  return 0;
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
  const measure = (targets: number[], nextOpen = false) => {
    const metrics = fallbackMetrics(nextOpen ? runAllocationBacktest(bars, targets,
      { ...settings, positionOverlay: undefined, executionPolicy: "hybrid" })
      : runStrategyCycleCloseBacktest(bars, targets, settings), settings.initialCash, boundary);
    return { totalReturn: metrics.totalReturn, last500: metrics.final500.totalReturn, maxDrawdown: metrics.maxDrawdown,
      first1500: metrics.first1500.totalReturn, recent: metrics.recent.totalReturn,
      fills: metrics.fills, blocks: metrics.blocks.map((block) => block.totalReturn) };
  };
  type Metrics = ReturnType<typeof measure>;
  const cache = new Map<string, Metrics>();
  const run = (policy: ShapePolicy, omitted?: Set<number>) => {
    const path = shapeReplay(context, decisions, start, policy, false, omitted), targetHash = sha(path.targets);
    let metrics = cache.get(targetHash);
    if (!metrics) {
      metrics = measure(path.targets);
      if (cache.size >= 4096) cache.delete(cache.keys().next().value!);
      cache.set(targetHash, metrics);
    }
    return { policy, targetHash, entries: path.entries, forced: path.forced, requests: path.requests, ...metrics };
  };
  type Row = ReturnType<typeof run>;
  const menu = rsiParameterMenu(); assert.equal(menu.length, 28621);
  const implementationHash = sha(await Promise.all(["rsi-parameter.ts", "RSI_PARAMETER_DESIGN.md", "shape-priority.ts",
    "descending-sequence.ts", "../../lib/analysis/sma-position-overlay.ts", "../../lib/analysis/indicators.ts",
    "../../lib/analysis/backtest.ts", "../../lib/analysis/strategy-cycle-validation.ts"].map((path) => readFile(join(root, path), "utf8"))));
  const identity = sha({ sourceHash, implementationHash, menu });
  let stopping = false;
  process.on("SIGINT", () => { stopping = true; }); process.on("SIGTERM", () => { stopping = true; });
  const phase = async (name: string, policies: ShapePolicy[]) => {
    assert.ok(policies.length <= 30000);
    const folder = join(root, "data/rsi-parameter", identity, name), manifestPath = join(folder, "manifest.json");
    const phaseIdentity = sha({ identity, name, policies });
    let manifest = { identity: phaseIdentity, completed: 0, chunks: [] as { file: string; hash: string }[] };
    const rows: Row[] = [];
    let manifestLoaded = false;
    try {
      manifest = await bounded(manifestPath); manifestLoaded = true; assert.equal(manifest.identity, phaseIdentity);
      for (const entry of manifest.chunks) {
        assert.match(entry.file, /^chunk-\d{5}\.json$/);
        const chunk = await bounded(join(folder, entry.file)); assert.equal(sha(chunk), entry.hash);
        validateRsiChunk(chunk, phaseIdentity, rows.length, policies); rows.push(...chunk.rows);
      }
      assert.equal(rows.length, manifest.completed); assert.ok(rows.length <= policies.length);
    } catch (error) { if (manifestLoaded || (error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const resumed = rows.length;
    while (rows.length < policies.length) {
      const offset = rows.length, pending: Row[] = [];
      for (const policy of policies.slice(offset, offset + 128)) {
        if (stopping || process.memoryUsage().rss > 2 * 1024 ** 3) break;
        pending.push(run(policy));
      }
      if (pending.length) {
        const file = `chunk-${String(manifest.chunks.length).padStart(5, "0")}.json`;
        const chunk = { identity: phaseIdentity, offset, rows: pending };
        await atomic(join(folder, file), chunk);
        manifest = { ...manifest, completed: offset + pending.length, chunks: [...manifest.chunks, { file, hash: sha(chunk) }] };
        await atomic(manifestPath, manifest); rows.push(...pending);
        if (rows.length % 2048 < 128) console.log(`${name}: ${rows.length}/${policies.length}; RSS ${Math.round(process.memoryUsage().rss / 1024 ** 2)}MiB`);
      }
      if (stopping || process.memoryUsage().rss > 2 * 1024 ** 3) throw new Error("Stopped safely; rerun the same command to resume committed chunks");
    }
    console.log(`${name}: complete ${rows.length}, resumed ${resumed}`);
    return rows;
  };
  const anchor = await bounded(join(root, "output/risk-exit-validation/ema3-atr2-anchor.json"));
  assert.equal(run(shapeBaseline).targetHash, sha(anchor.targets));
  const rows = await phase("single", menu), baseline = rows[0]!;
  assert.equal(sha(anchor.targets), baseline.targetHash);
  const old = await bounded(join(root, "output/descending-sequence/summary.json"));
  assert.equal(old.sourceHash, sourceHash);
  for (const row of rows.filter((row) => row.policy.descending && row.policy.exitRsi === "off")) {
    assert.equal(row.targetHash, old.rows.find((prior: Row) => prior.policy.id === row.policy.id).targetHash);
  }
  const score = (row: Row) => Math.min(row.totalReturn - baseline.totalReturn, row.last500 - baseline.last500);
  const rank = (values: Row[]) => [...values].sort((left, right) => compareRsiRows(left, right, baseline));
  const distinct = (values: Row[], count: number) => {
    const unique = new Map<string, Row>();
    for (const row of rank(values)) if (!unique.has(row.targetHash)) unique.set(row.targetHash, row);
    return [...unique.values()].slice(0, count);
  };
  const entryRows = rows.filter((row) => row.policy.entry !== "off"), exitRows = rows.filter((row) => row.policy.descending);
  const entries = distinct(entryRows, 8), exits = distinct(exitRows, 8);
  const combined = entries.flatMap((entry) => exits.map((exit) => ({ ...entry.policy,
    id: `combined:${entry.policy.id}:${exit.policy.id}`, descending: exit.policy.descending,
    exitPriority: exit.policy.exitPriority, exitRsi: exit.policy.exitRsi, exitRsiSettings: exit.policy.exitRsiSettings })));
  const combinationRows = await phase("combined", combined), all = [...rows, ...combinationRows];
  const candidates = all.slice(1), double = candidates.filter((row) => score(row) > 1e-9);
  const triple = double.filter((row) => row.maxDrawdown > baseline.maxDrawdown + 1e-9);
  const top = distinct(candidates, 12);
  const selected = [...new Map([baseline, ...top.slice(0, 5),
    [...candidates].sort((left, right) => right.maxDrawdown - left.maxDrawdown)[0]!
  ].map((row) => [row.targetHash, row])).values()];
  const details = selected.map((row) => {
    const path = shapeReplay(context, decisions, start, row.policy, true);
    const events = path.events.map((event) => ({ ...event,
      rsiPeriod: (event.kind === "entry" ? row.policy.entryRsiSettings : row.policy.exitRsiSettings)?.period ?? 14 }));
    const omissions = events.slice(0, 80).map((event) => ({ time: event.time, ...run(row.policy, new Set([event.index])) }));
    return { id: row.policy.id, nextOpen: measure(path.targets, true), events,
      omissionTested: omissions.length, worstOmission: rank(omissions).at(-1) ?? null };
  });
  const summary = { identity, sourceHash, implementationHash, start: bars[start]!.time, end: bars.at(-1)!.time,
    singleCount: rows.length, combinedCount: combinationRows.length, distinctPaths: new Set(all.map((row) => row.targetHash)).size,
    baseline, doubleCount: double.length, tripleCount: triple.length, top,
    doubleDistinct: distinct(double, 20), tripleDistinct: distinct(triple, 20),
    bestEntries: distinct(entryRows, 8), bestExits: distinct(exitRows, 8), bestCombined: distinct(combinationRows, 8),
    byPeriod: Array.from({ length: 14 }, (_, offset) => {
      const period = offset + 7;
      const values = rows.filter((row) => (row.policy.entryRsiSettings ?? row.policy.exitRsiSettings)?.period === period);
      return { period, best: rank(values)[0], double: values.filter((row) => score(row) > 1e-9).length };
    }),
    first1500Selected: [...all].sort((left, right) => right.first1500 - left.first1500)[0], details,
    resultLocation: `data/rsi-parameter/${identity}/single/manifest.json` };
  await atomic(join(root, "output/rsi-parameter/summary.json"), summary);
  const table = (values: Row[]) => ["| Rule | Full2000 | Final500 | MaxDD |", "|---|---:|---:|---:|",
    ...values.map((row) => `| ${row.policy.id} | ${row.totalReturn.toFixed(2)}% | ${row.last500.toFixed(2)}% | ${Math.abs(row.maxDrawdown).toFixed(2)}% |`)].join("\n");
  await writeFile(join(root, "output/rsi-parameter/REPORT.md"), `# RSI parameters\n\n${rows.length} single policies and ${combinationRows.length} selected combinations; ${summary.distinctPaths} distinct target paths. Frozen ${summary.start}..${summary.end}.\n\n${table([baseline, ...top])}\n\nDouble-return improvements:${double.length}; also reducing drawdown:${triple.length}.\n\n## Best by RSI calculation period\n\n${table(summary.byPeriod.map((row) => row.best!))}\n\nAll are additive shape filters on full v7, not RSI-only strategies. Calculation period differs from historical lookback. Close-proxy exploration is not untouched validation. Next-open and event omissions are in summary.json. Full chunked rows remain at ${summary.resultLocation}.\n`);
  console.log(JSON.stringify({ identity, single: rows.length, combined: combinationRows.length,
    distinct: summary.distinctPaths, double: double.length, triple: triple.length, top: top.slice(0, 3) }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
