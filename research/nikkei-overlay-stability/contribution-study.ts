import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atomic, root } from "./analyze";
import { SmaPositionOverlay, REBOUND_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS, ENGULF_POSITION_OVERLAY_OPTIONS,
  type SmaPositionOverlayOptions } from "../../lib/analysis/sma-position-overlay";
import { strategyCycleSignalDirection, strategyCycleRecentSignals, runStrategyCycleCloseBacktest,
  type StrategyCycleRecentSignal, type StrategyCycleSelectionSnapshot } from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest, type BacktestSettings } from "../../lib/analysis/backtest";
import { fallbackMetrics } from "./sma20-fallback";
import type { MarketBar } from "../../lib/market/types";
import { replaceFileAtomically } from "../../scripts/atomic-file";

export function contributionEffects(dynamicRaw: number, dynamicCovered: number, fixedRaw: number, fixedCovered: number) {
  const selectionRaw = dynamicRaw - fixedRaw, selectionCovered = dynamicCovered - fixedCovered;
  const overlayDynamic = dynamicCovered - dynamicRaw, overlayFixed = fixedCovered - fixedRaw;
  return { selectionRaw, selectionCovered, overlayDynamic, overlayFixed,
    interaction: overlayDynamic - overlayFixed,
    symmetricSelection: (selectionRaw + selectionCovered) / 2,
    symmetricOverlay: (overlayDynamic + overlayFixed) / 2,
    combinedVersusFixedRaw: dynamicCovered - fixedRaw };
}

interface ContributionDay {
  time: string; before: number; target: number; rawTarget: number; signals: number;
  direction: "increase" | "reduce" | null; requested: number | null;
  originalSignal: boolean; conflictedHold: boolean; extraEntry: boolean; deferredReduction: boolean;
  blockedIncrease: boolean; noOriginalExit: boolean; changed: boolean; differsFromRaw: boolean;
}

export function contributionReplay(bars: MarketBar[], decisions: ReadonlyMap<number, StrategyCycleRecentSignal[]>, start: number,
  options?: SmaPositionOverlayOptions) {
  const overlay = options ? new SmaPositionOverlay(bars, options) : null;
  const targets = bars.map(() => 0), daily: ContributionDay[] = [];
  let allocation = 0, rawAllocation = 0;
  for (let index = start; index < bars.length; index++) {
    const signals = decisions.get(index) ?? [], direction = strategyCycleSignalDirection(signals), before = allocation;
    const requested = direction ? Math.max(0, Math.min(1, signals.at(-1)!.targetAllocation)) : null;
    if (direction === "increase") rawAllocation = Math.max(rawAllocation, requested!);
    if (direction === "reduce") rawAllocation = Math.min(rawAllocation, requested!);
    if (overlay) {
      if (direction) overlay.request(direction, requested!, index);
      allocation = overlay.close(index, signals.length > 0);
    } else allocation = rawAllocation;
    targets[index] = allocation;
    daily.push({ time: bars[index]!.time, before, target: allocation, rawTarget: rawAllocation,
      signals: signals.length, direction, requested,
      originalSignal: signals.length > 0, conflictedHold: signals.length > 0 && direction === null,
      extraEntry: signals.length === 0 && before <= 1e-10 && allocation > 1e-10,
      deferredReduction: direction === "reduce" && requested! < before - 1e-10 && allocation > requested! + 1e-10,
      blockedIncrease: direction === "increase" && requested! > before + 1e-10 && allocation < requested! - 1e-10,
      noOriginalExit: signals.length === 0 && before > 1e-10 && allocation < before - 1e-10,
      changed: Math.abs(allocation - before) > 1e-10,
      differsFromRaw: Math.abs(allocation - rawAllocation) > 1e-10 });
  }
  const count = (key: "originalSignal" | "conflictedHold" | "extraEntry" | "deferredReduction" | "blockedIncrease" |
    "noOriginalExit" | "changed" | "differsFromRaw") => daily.filter(day => day[key]).length;
  return { targets, daily, diagnostics: { originalSignalDays: count("originalSignal"), conflictHoldDays: count("conflictedHold"),
    originalEntries: daily.filter(day => day.originalSignal && day.before <= 1e-10 && day.target > 1e-10).length,
    allEntries: daily.filter(day => day.before <= 1e-10 && day.target > 1e-10).length,
    extraEntries: count("extraEntry"), deferredReductionDays: count("deferredReduction"), blockedIncreaseDays: count("blockedIncrease"),
    noOriginalExitDays: count("noOriginalExit"), targetChanges: count("changed"), differsFromRawDays: count("differsFromRaw"),
    heldDays: daily.filter(day => day.target > 1e-10).length,
    meanTarget: daily.reduce((sum, day) => sum + day.target, 0) / daily.length } };
}

interface FixedRows { id: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[] }
export function validateContributionCache(saved: { sourceHash: string; implementationHash: string; controls: FixedRows[] },
  sourceHash: string, implementationHash: string, controls: string[], indexes: number[]) {
  assert.equal(saved.sourceHash, sourceHash, "Contribution source drift; preserve old state");
  assert.equal(saved.implementationHash, implementationHash, "Contribution implementation drift; preserve old state");
  assert.deepEqual(saved.controls.map(control => control.id), controls);
  for (const control of saved.controls) {
    assert.ok(control.rows.length <= indexes.length);
    control.rows.forEach((row, offset) => assert.equal(row.index, indexes[offset], "Contribution ordered-prefix mismatch"));
  }
}
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
async function bounded(path: string) { assert.ok((await stat(path)).size <= 16 * 1024 ** 2); return readFile(path, "utf8"); }
async function main() {
  const source = join(root, "data/full-screen-6-15"), output = join(root, "output/contribution");
  const input = JSON.parse(await bounded(join(source, "input.json"))) as {
    bars: MarketBar[]; barsHash: string; settings: BacktestSettings; snapshots: StrategyCycleSelectionSnapshot[]; accessedAt: string;
  };
  const savedSignals = JSON.parse(await bounded(join(source, "signals.json"))) as {
    sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[];
  };
  const sourceHash = sha(JSON.stringify(input)); assert.equal(sourceHash, savedSignals.sourceHash);
  assert.equal(sha(JSON.stringify(input.bars)), input.barsHash);
  assert.ok(input.bars.length <= 10000 && input.snapshots.length <= 2048);
  const indexes = input.snapshots.map(snapshot => snapshot.decisionIndex);
  assert.deepEqual(savedSignals.rows.map(row => row.index), indexes);
  for (const offset of [0, Math.floor(indexes.length / 2), indexes.length - 1])
    assert.deepEqual(strategyCycleRecentSignals(input.bars, input.snapshots[offset]!, indexes[offset]!), savedSignals.rows[offset]!.signals);
  const { bars, settings } = input, start = bars.length - 2000;
  assert.equal(indexes[0], start); assert.equal(bars[start]!.time, "2018-08-09");
  const boundary = bars.findIndex(bar => bar.time === "2026-07-21") - start + 1;
  assert.equal(boundary, 1936);
  const fixedFirst = { ...input.snapshots[0]!, plan: { ...input.snapshots[0]!.plan, positionOverlay: undefined } };
  const fixedSimple: StrategyCycleSelectionSnapshot = { ...fixedFirst, fixedRelativeLongStrategy: null,
    plan: { strategyA: { strategyId: "sma-cross", parameters: { fast: 10, slow: 30 } }, strategyB: null,
      strategyAAllocation: 1, strategyBAllocation: 0 } };
  const fixed = [{ id: "first", snapshot: fixedFirst }, { id: "simple", snapshot: fixedSimple }];
  const implementationHash = sha((await Promise.all(["CONTRIBUTION_DESIGN.md", "contribution-study.ts", "analyze.ts",
    "sma20-fallback.ts", "../../lib/analysis/sma-position-overlay.ts", "../../lib/analysis/strategy-cycle-validation.ts",
    "../../lib/analysis/strategy-combinations.ts", "../../lib/analysis/strategies.ts", "../../lib/analysis/backtest.ts",
    "../../lib/analysis/indicators.ts", "../../lib/analysis/built-in-strategies.ts", "../../lib/analysis/strategy-execution.ts",
    "../../lib/analysis/entry-filter.ts"]
    .map(path => readFile(join(root, path), "utf8")))).join("\n"));
  const checkpoint = join(root, "data/contribution/signals.json");
  let controls: FixedRows[] = fixed.map(control => ({ id: control.id, rows: [] }));
  try {
    const stored = JSON.parse(await bounded(checkpoint));
    validateContributionCache(stored, sourceHash, implementationHash, fixed.map(control => control.id), indexes);
    controls = stored.controls;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const resumed = controls.map(control => ({ id: control.id, rows: control.rows.length }));
  let stopping = false;
  process.on("SIGINT", () => { stopping = true; }); process.on("SIGTERM", () => { stopping = true; });
  for (const control of controls) {
    const snapshot = fixed.find(row => row.id === control.id)!.snapshot;
    for (let offset = control.rows.length; offset < indexes.length; offset++) {
      if (stopping || process.memoryUsage().rss > 1.5 * 1024 ** 3) {
        await atomic(checkpoint, { sourceHash, implementationHash, controls }); throw new Error("Stopped safely; rerun contribution study");
      }
      const index = indexes[offset]!;
      control.rows.push({ index, signals: strategyCycleRecentSignals(bars, snapshot, index) });
      if (control.rows.length % 64 === 0 || control.rows.length === indexes.length) {
        await atomic(checkpoint, { sourceHash, implementationHash, controls });
        console.log(`Contribution ${control.id} ${control.rows.length}/${indexes.length}`);
        await new Promise<void>(done => setImmediate(done));
      }
    }
  }
  const dynamic = new Map(savedSignals.rows.map(row => [row.index, row.signals]));
  const first = new Map(controls[0]!.rows.map(row => [row.index, row.signals]));
  const simple = new Map(controls[1]!.rows.map(row => [row.index, row.signals]));
  const cases = [
    { id: "dynamic-raw", decisions: dynamic, options: undefined },
    { id: "dynamic-v6", decisions: dynamic, options: DEFAULT_POSITION_OVERLAY_OPTIONS },
    { id: "first-raw", decisions: first, options: undefined },
    { id: "first-v6", decisions: first, options: DEFAULT_POSITION_OVERLAY_OPTIONS },
    { id: "simple-raw", decisions: simple, options: undefined },
    { id: "simple-v6", decisions: simple, options: DEFAULT_POSITION_OVERLAY_OPTIONS },
    { id: "overlay-only", decisions: new Map<number, StrategyCycleRecentSignal[]>(), options: DEFAULT_POSITION_OVERLAY_OPTIONS },
    { id: "dynamic-v5", decisions: dynamic, options: ENGULF_POSITION_OVERLAY_OPTIONS },
    { id: "buy-hold", decisions: new Map<number, StrategyCycleRecentSignal[]>([[start,
      [{ direction: "increase", targetAllocation: 1, signals: ["long-entry"] }]]]), options: undefined },
  ];
  type Metrics = ReturnType<typeof fallbackMetrics>;
  type Row = Metrics & ReturnType<typeof contributionReplay>["diagnostics"] & {
    id: string; targetHash: string; nextOpen: Metrics; doubleCost: Metrics;
  };
  const rows: Row[] = [];
  for (const candidate of cases) {
    const path = contributionReplay(bars, candidate.decisions, start, candidate.options);
    const result = runStrategyCycleCloseBacktest(bars, path.targets, settings);
    const metrics = fallbackMetrics(result, settings.initialCash, boundary);
    const next = runAllocationBacktest(bars, path.targets, { ...settings, executionPolicy: "next-open" });
    const twice = runStrategyCycleCloseBacktest(bars, path.targets, { ...settings,
      commissionRate: settings.commissionRate * 2, slippageRate: settings.slippageRate * 2 });
    const row: Row = { id: candidate.id, targetHash: sha(JSON.stringify(path.targets)), ...metrics, ...path.diagnostics,
      nextOpen: fallbackMetrics(next, settings.initialCash, boundary),
      doubleCost: fallbackMetrics(twice, settings.initialCash, boundary) };
    if (candidate.id === "dynamic-v6" || candidate.id === "dynamic-v5") {
      const reference = JSON.parse(await bounded(join(root, `output/dual-return/${candidate.id === "dynamic-v6" ? "goal" : "baseline"}.json`)));
      assert.equal(row.targetHash, reference.targetHash); assert.equal(row.totalReturn, reference.totalReturn);
    }
    rows.push(row);
    await atomic(join(output, `${candidate.id}.json`), { sourceHash, implementationHash, ...row, targets: path.targets, daily: path.daily, result });
  }
  const get = (id: string) => rows.find(row => row.id === id)!;
  const effects = ["first", "simple"].map(control => ({ control,
    full: contributionEffects(get("dynamic-raw").totalReturn, get("dynamic-v6").totalReturn,
      get(`${control}-raw`).totalReturn, get(`${control}-v6`).totalReturn),
    final500: contributionEffects(get("dynamic-raw").final500.totalReturn, get("dynamic-v6").final500.totalReturn,
      get(`${control}-raw`).final500.totalReturn, get(`${control}-v6`).final500.totalReturn),
    logWealth: contributionEffects(...["dynamic-raw", "dynamic-v6", `${control}-raw`, `${control}-v6`]
      .map(id => Math.log1p(get(id).totalReturn / 100)) as [number, number, number, number]) }));
  const summary = { sourceHash, implementationHash, generatedAt: new Date().toISOString(), sourceAccessedAt: input.accessedAt,
    start: bars[start]!.time, end: bars.at(-1)!.time, settings, resumed, fixed: fixed.map(({ id, snapshot }) => ({ id, snapshot })),
    decisions: indexes.length, rows, effects,
    limitation: "Frozen selected winners, not reranked without overlays. Two fixed controls are not all alternatives. Overlay-only has no ordinary strategy exits. Conditional nonadditive historical accounting, not independent causal or prospective evidence." };
  await atomic(join(output, "summary.json"), summary);
  const table = rows.map(row => `| ${row.id} | ${row.totalReturn.toFixed(3)} | ${row.final500.totalReturn.toFixed(3)} | ${row.maxDrawdown.toFixed(3)} | ${row.recent.totalReturn.toFixed(3)} | ${row.extraEntries} | ${row.deferredReductionDays} | ${row.meanTarget.toFixed(3)} |`).join("\n");
  await atomic(join(output, "report.json"), { table, effects });
  await writeFile(join(output, "REPORT.md.tmp"), `# Screening and overlay contribution\n\n${summary.start}..${summary.end},2000 sessions,final500 from2024-10-04,fees/slippage unchanged. ${indexes.length} shared decision opportunities. Main: Nikkei completed-close proxy.\n\n| Case | Full % | Final500 % | DD % | Recent % | Extra entries | Deferred sell days | Mean target |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${table}\n\n## Conditional2x2 effects\n\n\`\`\`json\n${JSON.stringify(effects, null, 2)}\n\`\`\`\n\nFirst fixed plan is the first observed winner, not the best full-period plan; simple control is preset SMA10/30. Both use the same decision calendar/two-bar rules. Extra entries include recovery; deferrals are request-day observations. See summary.json for all costs/execution sensitivities, controls and identities.\n\n${summary.limitation}\n`);
  await replaceFileAtomically(join(output, "REPORT.md.tmp"), join(output, "REPORT.md"));
  console.log(JSON.stringify({ rows: rows.map(row => ({ id: row.id, full: row.totalReturn, final500: row.final500.totalReturn,
    dd: row.maxDrawdown, recent: row.recent.totalReturn, extra: row.extraEntries, delayed: row.deferredReductionDays })), effects }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
