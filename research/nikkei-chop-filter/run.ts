import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import { runStrategyCycleCloseBacktest, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest, type AllocationBacktestResult, type BacktestSettings } from "../../lib/analysis/backtest";
import { RSI_SHAPE_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS, SmaPositionOverlay } from "../../lib/analysis/sma-position-overlay";
import type { MarketBar } from "../../lib/market/types";
import { Features, policies, replay, select, type Row, type Segment } from "./model";

const root = dirname(fileURLToPath(import.meta.url));
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
async function bounded(path: string, maximum = 16 * 1024 ** 2) {
  if ((await stat(path)).size > maximum) throw new Error(`Oversized input: ${path}`);
  return readFile(path, "utf8");
}
async function atomic(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, typeof value === "string" ? value : JSON.stringify(value));
  await replaceFileAtomically(`${path}.tmp`, path);
}
export function validateProgress(saved: { identity: string; rows: Row[] }, identity: string) {
  assert.equal(saved.identity, identity, "Incompatible study checkpoint; preserve it and use the original implementation or a separate directory");
  const menu = policies();
  assert.ok(saved.rows.length <= menu.length);
  saved.rows.forEach((row, index) => assert.deepEqual(row.policy, menu[index]));
}
export function segment(result: AllocationBacktestResult, from: number, to: number, cash: number): Segment {
  const points = result.equity.slice(from, to), base = from ? result.equity[from - 1].equity : cash;
  let peak = base, maxDrawdown = 0;
  for (const point of points) { peak = Math.max(peak, point.equity); maxDrawdown = Math.min(maxDrawdown, (point.equity / peak - 1) * 100); }
  const start = points[0].time, end = points.at(-1)!.time;
  const fills = result.rebalances.filter((fill) => fill.time >= start && fill.time <= end);
  return { totalReturn: (points.at(-1)!.equity / base - 1) * 100, maxDrawdown, fills: fills.length,
    turnover: fills.reduce((sum, fill) => sum + Math.abs(fill.targetAllocation - fill.fromAllocation), 0) };
}

async function main() {
  const sourceDirectory = join(root, "../nikkei-overlay-stability/data/full-screen-6-15");
  const inputText = await bounded(join(sourceDirectory, "input.json")), signalsText = await bounded(join(sourceDirectory, "signals.json"));
  const input = JSON.parse(inputText) as { bars: MarketBar[]; barsHash: string; settings: BacktestSettings; snapshots: { decisionIndex: number }[] };
  const savedSignals = JSON.parse(signalsText) as { sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[] };
  const sourceHash = sha(JSON.stringify(input));
  assert.equal(sourceHash, savedSignals.sourceHash); assert.equal(sha(JSON.stringify(input.bars)), input.barsHash);
  assert.ok(input.bars.length <= 10000 && savedSignals.rows.length <= 2048);
  assert.deepEqual(input.snapshots.map((row) => row.decisionIndex), savedSignals.rows.map((row) => row.index));
  const files = ["DESIGN.md", "model.ts", "run.ts", "../../lib/analysis/indicators.ts", "../../lib/analysis/sma-position-overlay.ts",
    "../../lib/analysis/backtest.ts", "../../lib/analysis/strategy-cycle-validation.ts"];
  const implementationHash = sha((await Promise.all(files.map((file) => readFile(join(root, file), "utf8")))).join("\n"));
  const identity = sha(`${sourceHash}:${implementationHash}`), directory = join(root, "data", identity), checkpoint = join(directory, "progress.json");
  await mkdir(directory, { recursive: true });
  const rows: Row[] = [];
  try { const progress = JSON.parse(await bounded(checkpoint)); validateProgress(progress, identity); rows.push(...progress.rows); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  await atomic(join(directory, "input.json"), inputText); await atomic(join(directory, "signals.json"), signalsText);
  await atomic(join(directory, "source_registry.jsonl"), JSON.stringify({ sourceDirectory: resolve(sourceDirectory), accessedAt: new Date().toISOString(),
    sourceHash, inputFileHash: sha(inputText), signalsFileHash: sha(signalsText), barsHash: input.barsHash, implementationHash }) + "\n");
  const features = new Features(input.bars), start = input.bars.length - 2000;
  const decisions = new Map(savedSignals.rows.map((row) => [row.index, row.signals]));
  const { bars, settings } = input;
  const baselinePath = replay(features, decisions, start, policies()[0]);
  const production = new SmaPositionOverlay(bars, DEFAULT_POSITION_OVERLAY_OPTIONS), reference = bars.map(() => 0);
  for (let i = start; i < bars.length; i++) {
    const signals = decisions.get(i) ?? [];
    // This is the same two-bar precedence used in the frozen integration test.
    const direction = signals.some((signal, k) => signal.direction === "reduce" && signals.slice(k + 1).some((later) => later.direction === "increase"))
      ? null : signals.at(-1)?.direction;
    if (direction) production.request(direction, signals.at(-1)!.targetAllocation, i);
    reference[i] = production.close(i, signals.length > 0);
  }
  assert.deepEqual(baselinePath.targets, reference);
  const baseline = runStrategyCycleCloseBacktest(bars, reference, settings);
  assert.equal(baseline.totalReturn, 440.9807031454993, "Frozen v8 baseline differs");
  const measure = (targets: number[], nextOpen = false, costs = "actual") => {
    const selectedSettings = costs === "zero" ? { ...settings, commissionRate: 0, slippageRate: 0 }
      : costs === "stress" ? { ...settings, commissionRate: .0018, slippageRate: .0002 } : settings;
    return nextOpen ? runAllocationBacktest(bars, targets, { ...selectedSettings, positionOverlay: undefined, executionPolicy: "hybrid" })
      : runStrategyCycleCloseBacktest(bars, targets, selectedSettings);
  };
  const metrics = (result: AllocationBacktestResult) => {
    assert.equal(result.equity.length, 2000);
    return { train: segment(result, 0, 1000, settings.initialCash), validation: segment(result, 1000, 1500, settings.initialCash),
      audit: segment(result, 1500, 2000, settings.initialCash), full: segment(result, 0, 2000, settings.initialCash) };
  };
  const menu = policies(); assert.equal(menu.length, 153);
  const resumed = rows.length;
  let stopping = false; process.on("SIGINT", () => { stopping = true; }); process.on("SIGTERM", () => { stopping = true; });
  const limitIndex = process.argv.indexOf("--limit"), limit = limitIndex >= 0 ? Number(process.argv[limitIndex + 1]) : Infinity;
  if (!(limit > 0)) throw new Error("--limit must be positive");
  for (const policy of menu.slice(rows.length)) {
    if (stopping || rows.length - resumed >= limit || process.memoryUsage().rss > 1.5 * 1024 ** 3) {
      await atomic(checkpoint, { identity, status: "partial", completed: rows.length, pending: menu.length - rows.length,
        updatedAt: new Date().toISOString(), lastError: stopping ? "Interrupted; rerun to resume" : "Bounded stop; rerun to resume", rows });
      console.log(JSON.stringify({ status: "partial", identity, completed: rows.length, resumed })); return;
    }
    const path = replay(features, decisions, start, policy), result = measure(path.targets);
    rows.push({ policy, ...metrics(result), targetHash: sha(JSON.stringify(path.targets)), blocked: path.blocked,
      risks: path.risks, breakouts: path.breakouts, regimeBars: path.regimeBars });
    await atomic(checkpoint, { identity, status: "running", completed: rows.length, pending: menu.length - rows.length,
      updatedAt: new Date().toISOString(), lastError: null, rows });
    if (rows.length % 25 === 0) console.log(JSON.stringify({ completed: rows.length, total: menu.length, rssMiB: Math.round(process.memoryUsage().rss / 1024 ** 2) }));
    await new Promise<void>((done) => setImmediate(done));
  }
  const selected = [rows[0], ...(["regime", "er-only", "buffer"] as const).map((family) => select(rows, family))];
  const leaders = (["regime", "er-only", "buffer"] as const).map((family) => rows.filter((row) => row.policy.family === family)
    .sort((a, b) => b.validation.totalReturn - a.validation.totalReturn || a.policy.id.localeCompare(b.policy.id))[0]);
  const details = [];
  for (const row of [...new Map([...selected, ...leaders].map((row) => [row.policy.id, row])).values()]) {
    const path = replay(features, decisions, start, row.policy), actual = measure(path.targets), gross = measure(path.targets, false, "zero");
    const upBlocks = [];
    for (let from = 0; from + 20 <= 2000; from += 20) {
      const priceReturn = (bars[start + from + 19].close / bars[start + Math.max(0, from - 1)].close - 1) * 100;
      if (priceReturn >= 5) upBlocks.push({ start: bars[start + from].time, priceReturn,
        baseline: segment(baseline, from, from + 20, settings.initialCash).totalReturn,
        candidate: segment(actual, from, from + 20, settings.initialCash).totalReturn });
    }
    details.push({ id: row.policy.id, actual: metrics(actual), gross: metrics(gross), stress: metrics(measure(path.targets, false, "stress")),
      nextOpen: metrics(measure(path.targets, true)), missedUpBlocks: upBlocks.filter((block) => block.candidate < block.baseline - 1e-9).length,
      upBlockCount: upBlocks.length, upBlocks, blocks250: Array.from({ length: 8 }, (_, block) => segment(actual, block * 250, (block + 1) * 250, settings.initialCash)),
      events: path.events, rebalances: actual.rebalances });
  }
  const baselineEpisodes = [];
  let entry: { offset: number; equity: number; noisy: boolean } | null = null;
  const diagnostic = { ...menu[0], family: "regime" as const, period: 20, erCeiling: .25, widthCeiling: .35 };
  for (let offset = 0; offset < 2000; offset++) {
    const index = start + offset, previous = reference[index - 1] ?? 0, current = reference[index];
    if (!entry && previous <= 1e-10 && current > 1e-10) entry = { offset, equity: offset ? baseline.equity[offset - 1].equity : settings.initialCash, noisy: features.regime(index, diagnostic) };
    if (entry && previous > 1e-10 && current <= 1e-10) {
      baselineEpisodes.push({ start: bars[start + entry.offset].time, end: bars[index].time, days: offset - entry.offset,
        noisy: entry.noisy, return: (baseline.equity[offset].equity / entry.equity - 1) * 100 }); entry = null;
    }
  }
  const summary = { identity, sourceHash, implementationHash, start: bars[start].time, end: bars.at(-1)!.time,
    splits: [[0, 1000], [1000, 1500], [1500, 2000]].map(([from, to]) => ({ start: bars[start + from].time, end: bars[start + to - 1].time, sessions: to - from })),
    resumed, configurations: rows.length, distinctTargets: new Set(rows.map((row) => row.targetHash)).size,
    baseline: rows[0], selected: selected.map((row, index) => ({ family: ["baseline", "regime", "er-only", "buffer"][index], row })),
    unqualifiedValidationLeaders: leaders, rows, details, baselineEpisodes, rssMiB: Math.round(process.memoryUsage().rss / 1024 ** 2) };
  const output = join(root, "output");
  await atomic(join(output, "summary.json"), summary);
  const csvRows = rows.map((row) => ({ ...row.policy, ...Object.fromEntries(["train", "validation", "audit", "full"].flatMap((key) =>
    Object.entries(row[key as "train"]).map(([field, value]) => [`${key}_${field}`, value]))), blocked: row.blocked, targetHash: row.targetHash }));
  const keys = Object.keys(csvRows[0]);
  await atomic(join(output, "grid.csv"), [keys.join(","), ...csvRows.map((row) => keys.map((key) => row[key as keyof typeof row]).join(","))].join("\n") + "\n");
  const table = (values: Row[]) => ["| Policy | Train return | Validation return | Audit return | Full return | Full maxDD | Fills | Audit fills |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...values.map((row) => `| ${row.policy.id} | ${row.train.totalReturn.toFixed(2)}% | ${row.validation.totalReturn.toFixed(2)}% | ${row.audit.totalReturn.toFixed(2)}% | ${row.full.totalReturn.toFixed(2)}% | ${row.full.maxDrawdown.toFixed(2)}% | ${row.full.fills} | ${row.audit.fills} |`)].join("\n");
  await atomic(join(root, "RESULTS.md"), `# Frozen-v8 whipsaw filter results\n\n${summary.start}..${summary.end};153 declared candidates;${summary.distinctTargets} distinct target paths.\nBaseline exactly reproduces v8 440.9807031454993% and the complete production target path. Source:${sourceHash}.\n\n## Qualified family selection (fallback is baseline)\n\n${table([...new Map(selected.map((row) => [row.policy.id, row])).values()])}\n\n## Validation-return leaders, shown even if unqualified\n\n${table([rows[0], ...leaders])}\n\nSelection, state handling, costs and bounds are fixed in DESIGN.md. Full CSV and detailed costs/next-open/250-session/rally-block audits are in output/. Last500 is a conditional historical check, not untouched validation. Original winners and all v8 rule settings remain fixed; production and browser accounts are unchanged.\n`);
  await atomic(checkpoint, { identity, status: "complete", completed: rows.length, pending: 0, updatedAt: new Date().toISOString(), lastError: null, rows });
  console.log(JSON.stringify({ identity, resumed, configurations: rows.length, baseline: rows[0], selected: summary.selected, leaders, rssMiB: summary.rssMiB }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error); process.exitCode = 1; });
