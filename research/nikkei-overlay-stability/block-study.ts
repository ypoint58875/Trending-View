import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, stat, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deserialize } from "node:v8";
import { Account, Features, atomic, current, parameterId, pathMetrics, root, validateIdentity, type Parameters } from "./analyze";
import { createBacktestExecutionContext, runAllocationBacktest, type BacktestSettings, type AllocationBacktestResult } from "../../lib/analysis/backtest";
import { runStrategyCycleCloseBacktest, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";

export const blockLengths = [40, 60, 80, 100, 126, 160, 200, 252, 300, 400, 500];
export const ages = [20, 40, 60, 80, 100, 126, 160, 200, 252, 300, 400, 500];
export const output = join(root, "output/blocks-5-16");
export function expandedMenu() {
  const result: Parameters[] = [];
  for (let entry = 5; entry <= 16; entry++) for (let exit = 5; exit <= 16; exit++) for (let gate = 5; gate <= 16; gate++)
    for (let threshold = 1; threshold <= 8; threshold++) result.push({ entry, exit, gate, threshold: threshold / 4000, flags: 7 });
  return result;
}
export function folds(length: number, from = 500, end = 2000) {
  if (!Number.isInteger(length) || length < 1 || from < length || end <= from) throw new Error("Invalid fold boundaries");
  const result = [];
  for (let anchor = from; anchor < end; anchor += length) result.push({ trainStart: anchor - length, trainEnd: anchor, deployStart: anchor, deployEnd: Math.min(anchor + length, end) });
  return result;
}
export function distance(p: Parameters) { return Math.abs(p.entry - current.entry) + Math.abs(p.exit - current.exit) + Math.abs(p.gate - current.gate) + Math.abs(p.threshold - current.threshold) * 4000; }
export function gridWinner(metrics: Float64Array, menu: Parameters[]) {
  if (metrics.length !== menu.length * 3) throw new Error("Grid size mismatch");
  let best = 0;
  for (let j = 1; j < menu.length; j++) {
    const delta = metrics[j * 3]! - metrics[best * 3]!;
    if (delta > 1e-9 || (Math.abs(delta) <= 1e-9 && (distance(menu[j]!) < distance(menu[best]!) - 1e-9 ||
      (Math.abs(distance(menu[j]!) - distance(menu[best]!)) <= 1e-9 && parameterId(menu[j]!) < parameterId(menu[best]!))))) best = j;
  }
  return { index: best, parameters: menu[best]!, totalReturn: metrics[best * 3]!, maxDrawdown: metrics[best * 3 + 1]!,
    tradeCount: metrics[best * 3 + 2]!, tiedOptima: menu.filter((_, j) => Math.abs(metrics[j * 3]! - metrics[best * 3]!) <= 1e-9).length };
}
export function localTargets(decisions: ReadonlyMap<number, readonly StrategyCycleRecentSignal[]>, features: Features,
  start: number, end: number, parameters: Parameters | ((index: number) => Parameters), account = new Account()) {
  const result: number[] = [];
  for (let i = start; i < end; i++) result.push(account.step(i, decisions.get(i) ?? [], typeof parameters === "function" ? parameters(i) : parameters, features));
  return result;
}
export function prefix(result: AllocationBacktestResult, cash: number) {
  return Float64Array.from([0, ...result.equity.map(e => Math.log(e.equity / cash))]);
}
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
async function exists(path: string) { return stat(path).then(() => true, e => { if (e.code === "ENOENT") return false; throw e; }); }
let interrupted = false;
function guard() { if (interrupted) throw new Error("Stopped safely; rerun block-study.ts to resume"); if (process.memoryUsage().rss > 1.5 * 1024 ** 3) throw new Error("Research RSS exceeds 1.5 GiB; committed grid windows are safe to resume"); }
async function csv(name: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]!), q = (x: unknown) => '"' + String(x ?? "").replaceAll('"', '""') + '"';
  const path = join(output, name + ".csv");
  await writeFile(path, [keys.map(q).join(","), ...rows.map(r => keys.map(k => q(r[k])).join(","))].join("\n") + "\n");
}
async function main() {
  process.on("SIGINT", () => { interrupted = true; }); process.on("SIGTERM", () => { interrupted = true; });
  const inputText = await readFile(join(root, "data/input.json"), "utf8"), input = JSON.parse(inputText);
  const signalData = JSON.parse(await readFile(join(root, "data/signals.json"), "utf8"));
  const sourceHash = sha(inputText.trim());
  assert.equal(sourceHash, signalData.sourceHash);
  const bars = input.bars as MarketBar[], settings = input.settings as BacktestSettings, base = bars.length - 2000;
  assert.equal(sha(JSON.stringify(bars)), input.barsHash);
  assert.equal(input.evaluationSessions, 2000);
  const decisions = new Map<number, StrategyCycleRecentSignal[]>(signalData.rows.map((r: { index: number; signals: StrategyCycleRecentSignal[] }) => [r.index, r.signals]));
  const features = new Features(bars), menu = expandedMenu();
  const designHash = sha((await Promise.all(["BLOCK_DESIGN.md", "block-study.ts", "analyze.ts"].map(n => readFile(join(root, n), "utf8")))).join("\n") +
    await readFile(join(root, "../../lib/analysis/backtest.ts"), "utf8"));
  const cache = join(root, "data/block-cache"); await mkdir(cache, { recursive: true }); await mkdir(output, { recursive: true });
  let completed = 0;
  const run = (start: number, end: number, p: Parameters, summaryOnly = false) => {
    const local = bars.slice(base + start, base + end);
    return runStrategyCycleCloseBacktest(local, localTargets(decisions, features, base + start, base + end, p), { ...settings, startTime: local[0]!.time, endTime: local.at(-1)!.time, summaryOnly });
  };
  const optimize = async (from: number, to: number) => {
    guard();
    const path = join(cache, `grid-${from}-${to}.bin`);
    let metrics: Float64Array;
    if (await exists(path)) {
      const saved = deserialize(await readFile(path)); validateIdentity(saved, sourceHash, designHash);
      if (saved.from !== from || saved.to !== to || saved.metrics.length !== menu.length * 3 || [...saved.metrics].some((v: number) => !Number.isFinite(v))) throw new Error("Invalid block grid checkpoint");
      metrics = saved.metrics;
    } else {
      metrics = new Float64Array(menu.length * 3);
      const local = bars.slice(base + from, base + to), localSettings = { ...settings, startTime: local[0]!.time, endTime: local.at(-1)!.time, summaryOnly: true };
      const executionContext = createBacktestExecutionContext(local, localSettings);
      let first = 0;
      const partial = join(cache, `partial-${from}-${to}.bin`);
      if (await exists(partial)) {
        const saved = deserialize(await readFile(partial)); validateIdentity(saved, sourceHash, designHash);
        if (!Number.isInteger(saved.completed) || saved.completed < 0 || saved.completed > menu.length || saved.metrics.length !== metrics.length) throw new Error("Invalid partial grid");
        first = saved.completed; metrics = saved.metrics;
      }
      for (let j = first; j < menu.length; j++) {
        const target = localTargets(decisions, features, base + from, base + to, menu[j]!);
        const result = runStrategyCycleCloseBacktest(local, target, { ...localSettings, executionContext });
        metrics[j * 3] = result.totalReturn; metrics[j * 3 + 1] = result.maxDrawdown; metrics[j * 3 + 2] = result.tradeCount;
        if (to - from === 2000 && ((j + 1) % 512 === 0 || j + 1 === menu.length)) {
          await atomic(partial, { sourceHash, designHash, completed: j + 1, metrics }, true); guard();
          console.log(`Full grid ${j + 1}/${menu.length}`);
        }
      }
      await atomic(path, { sourceHash, designHash, from, to, metrics }, true);
    }
    completed++;
    console.log(`Optimized ${from}..${to - 1}; window ${completed}; RSS ${(process.memoryUsage().rss / 1024 ** 2).toFixed(0)} MiB`);
    return { ...gridWinner(metrics, menu), metrics };
  };
  const full = await optimize(0, 2000);
  const fullRows = menu.map((p, i) => ({ id: parameterId(p), ...p, totalReturn: full.metrics[i * 3]!, maxDrawdown: full.metrics[i * 3 + 1]!, tradeCount: full.metrics[i * 3 + 2]! }));
  await csv("full-grid", fullRows);
  const fullBest = run(0, 2000, full.parameters);
  const fullCurrent = run(0, 2000, current);
  const fullHold = runStrategyCycleCloseBacktest(bars.slice(base), new Array(2000).fill(1), settings);
  const local = bars.slice(base + 500), commonSettings = { ...settings, startTime: local[0]!.time, endTime: local.at(-1)!.time };
  const commonHold = runStrategyCycleCloseBacktest(local, new Array(local.length).fill(1), commonSettings), holdPrefix = prefix(commonHold, settings.initialCash);
  const commonCurrent = run(500, 2000, current), currentPrefix = prefix(commonCurrent, settings.initialCash);
  const describe = (p: Float64Array) => ({ common: pathMetrics(p, 0, 1500), development: pathMetrics(p, 0, 1000), final500: pathMetrics(p, 1000, 1500) });
  const policies = [], foldRows: Record<string, unknown>[] = [], ageRows: Record<string, unknown>[] = [], survivalRows: Record<string, unknown>[] = [];
  const paths: Record<string, number[]> = { holding: commonHold.equity.map(e => e.equity / settings.initialCash), current: commonCurrent.equity.map(e => e.equity / settings.initialCash) };
  const ageDetails: { length: number; anchor: number; age: number; excessHolding: number; excessCurrent: number; endOffset: number }[] = [];
  const selectedTargets = new Map<number, number[]>();
  for (const length of blockLengths) {
    const schedule = folds(length), winners: (ReturnType<typeof folds>[number] & { parameters: Parameters;
      trainingReturn: number; trainingDrawdown: number; tiedOptima: number })[] = [];
    for (const fold of schedule) {
      const optimal = await optimize(fold.trainStart, fold.trainEnd);
      winners.push({ ...fold, parameters: optimal.parameters, trainingReturn: optimal.totalReturn, trainingDrawdown: optimal.maxDrawdown, tiedOptima: optimal.tiedOptima });
    }
    let active = 0;
    const target = localTargets(decisions, features, base + 500, bars.length, index => {
      const offset = index - base;
      while (active + 1 < winners.length && winners[active + 1]!.deployStart <= offset) active++;
      return winners[active]!.parameters;
    });
    selectedTargets.set(length, target);
    const result = runStrategyCycleCloseBacktest(local, target, commonSettings), pp = prefix(result, settings.initialCash);
    const desc = describe(pp);
    paths[`L${length}`] = result.equity.map(e => e.equity / settings.initialCash);
    for (const fold of winners) {
      const a = fold.deployStart - 500, b = fold.deployEnd - 500;
      const future = Math.min(500, 2000 - fold.deployStart), p = fold.parameters;
      const frozen = run(fold.deployStart, fold.deployStart + future, p), frozenCurrent = run(fold.deployStart, fold.deployStart + future, current);
      const slice = bars.slice(base + fold.deployStart, base + fold.deployStart + future);
      const frozenHold = runStrategyCycleCloseBacktest(slice, new Array(future).fill(1), { ...settings, startTime: slice[0]!.time, endTime: slice.at(-1)!.time });
      const fp = prefix(frozen, settings.initialCash), cp = prefix(frozenCurrent, settings.initialCash), hp = prefix(frozenHold, settings.initialCash);
      let firstLead: number | null = null, lossStreak = 0, firstSustainedLoss: number | null = null;
      for (let day = 1; day <= future; day++) {
        const relative = fp[day]! - hp[day]!;
        if (relative > 1e-12) { firstLead ??= day; lossStreak = 0; }
        else if (firstLead !== null) { lossStreak++; if (lossStreak === 20 && firstSustainedLoss === null) firstSustainedLoss = day - 19; }
      }
      survivalRows.push({ length, anchor: fold.deployStart, availableDays: future, firstLead, firstSustainedLoss, censored: firstLead !== null && firstSustainedLoss === null });
      for (const age of ages.filter(h => h <= future)) ageDetails.push({ length, anchor: fold.deployStart, age,
        excessHolding: Math.expm1(fp[age]! - hp[age]!) * 100, excessCurrent: Math.expm1(fp[age]! - cp[age]!) * 100, endOffset: fold.deployStart + age });
      const next = pathMetrics(pp, a, b), hold = pathMetrics(holdPrefix, a, b);
      foldRows.push({ length, trainStart: bars[base + fold.trainStart]!.time, trainEnd: bars[base + fold.trainEnd - 1]!.time,
        deployStart: bars[base + fold.deployStart]!.time, deployEnd: bars[base + fold.deployEnd - 1]!.time,
        deploymentDays: fold.deployEnd - fold.deployStart, partial: fold.deployEnd - fold.deployStart < length,
        id: parameterId(p), ...p, trainingReturn: fold.trainingReturn, trainingDrawdown: fold.trainingDrawdown, tiedOptima: fold.tiedOptima,
        deploymentReturn: next.totalReturn, deploymentDrawdown: next.maxDrawdown, holdingReturn: hold.totalReturn,
        relativeHolding: ((1 + next.totalReturn / 100) / (1 + hold.totalReturn / 100) - 1) * 100 });
    }
    const these = foldRows.filter(r => r.length === length);
    policies.push({ length, ...desc, rebalances: result.rebalances.length, folds: these.length, fullFolds: these.filter(r => !r.partial).length,
      profitableFolds: these.filter(r => Number(r.deploymentReturn) > 0).length, beatHoldingFolds: these.filter(r => Number(r.relativeHolding) > 0).length,
      medianTiedOptima: [...winners].map(r => r.tiedOptima).sort((a, b) => a - b)[Math.floor(winners.length / 2)]! });
    await atomic(join(output, `policy-${length}.json`), { sourceHash, designHash, length, winners, ...result });
  }
  policies.sort((a, b) => b.development.totalReturn - a.development.totalReturn || b.development.maxDrawdown - a.development.maxDrawdown || b.length - a.length);
  const selected = policies[0]!;
  for (const length of blockLengths) for (const age of ages) for (const scope of ["all-available", "development-only"]) {
    const rows = ageDetails.filter(r => r.length === length && r.age === age && (scope === "all-available" || r.endOffset <= 1500));
    if (!rows.length) continue;
    const values = rows.map(r => r.excessHolding).sort((a, b) => a - b), median = values.length % 2 ? values[Math.floor(values.length / 2)]! : (values[values.length / 2 - 1]! + values[values.length / 2]!) / 2;
    ageRows.push({ length, age, scope, vintages: rows.length, meanRelativeHolding: values.reduce((a, b) => a + b, 0) / values.length,
      medianRelativeHolding: median, beatHoldingPercent: values.filter(v => v > 0).length / values.length * 100,
      meanRelativeCurrent: rows.reduce((a, r) => a + r.excessCurrent, 0) / rows.length });
  }
  const sensitivity = [];
  for (const length of blockLengths) for (const extraBps of [0, 5, 10]) for (const execution of ["close-proxy", "next-open"] as const) {
    const target = selectedTargets.get(length)!, st = { ...commonSettings, commissionRate: settings.commissionRate + extraBps / 10000 };
    const result = execution === "close-proxy" ? runStrategyCycleCloseBacktest(local, target, st) : runAllocationBacktest(local, target, { ...st, executionPolicy: "next-open" });
    sensitivity.push({ length, extraBps, execution, ...describe(prefix(result, settings.initialCash)) });
  }
  const summary = { sourceHash, designHash, gridCount: menu.length, blockLengths, model: input.model, settings,
    commonStart: local[0]!.time, developmentEnd: bars[base + 1499]!.time, final500Start: bars[base + 1500]!.time, end: bars.at(-1)!.time,
    fullBest: { parameters: full.parameters, totalReturn: fullBest.totalReturn, maxDrawdown: fullBest.maxDrawdown, tiedOptima: full.tiedOptima },
    fullCurrent: { totalReturn: fullCurrent.totalReturn, maxDrawdown: fullCurrent.maxDrawdown }, fullHolding: { totalReturn: fullHold.totalReturn, maxDrawdown: fullHold.maxDrawdown },
    controls: { holding: describe(holdPrefix), current: describe(currentPrefix) }, policies, selectedLength: selected.length, selected,
    sensitivity, ageRows, evidence: "Conditional on frozen quick winners and unverifiable historical library vintages; previously explored sample, not an untouched holdout" };
  await atomic(join(output, "summary.json"), summary);
  await csv("policies", policies.map(p => ({ length: p.length, developmentReturn: p.development.totalReturn, developmentDrawdown: p.development.maxDrawdown,
    final500Return: p.final500.totalReturn, final500Drawdown: p.final500.maxDrawdown, commonReturn: p.common.totalReturn, commonDrawdown: p.common.maxDrawdown,
    folds: p.folds, fullFolds: p.fullFolds, beatHoldingFolds: p.beatHoldingFolds, rebalances: p.rebalances, medianTiedOptima: p.medianTiedOptima })));
  await csv("folds", foldRows); await csv("parameter-age", ageRows); await csv("age-vintages", ageDetails.map(x => ({ ...x }))); await csv("lifetime", survivalRows);
  await csv("daily-equity", local.map((b, i) => ({ time: b.time, ...Object.fromEntries(Object.entries(paths).map(([k, v]) => [k, v[i]])) })));
  await csv("cost-timing", sensitivity.map(s => ({ length: s.length, execution: s.execution, extraBps: s.extraBps, commonReturn: s.common.totalReturn,
    commonDrawdown: s.common.maxDrawdown, final500Return: s.final500.totalReturn, final500Drawdown: s.final500.maxDrawdown })));
  console.log(JSON.stringify({ fullBest: summary.fullBest, selected, controls: summary.controls, policies }, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exitCode = 1; });
