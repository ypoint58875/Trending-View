import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atomic, root } from "./analyze";
import { ExitPriorityAccount, exitPriorityMenu, type ExitEvidence, type ExitPriorityPolicy } from "./exit-priority-study";
import { FilterContext } from "./oscillator-filter-study";
import { fallbackMetrics } from "./sma20-fallback";
import { runStrategyCycleCloseBacktest, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest, type BacktestSettings } from "../../lib/analysis/backtest";
import { replaceFileAtomically } from "../../scripts/atomic-file";

export interface RiskValidationPolicy {
  id: string; group: string; base: ExitPriorityPolicy; family: "baseline" | "loss" | "atr" | "or" | "and";
  loss: number; age: number; atrMultiple: number; wait: 0 | 5;
}
export function riskValidationMenu(): RiskValidationPolicy[] {
  const rows: RiskValidationPolicy[] = [];
  for (const base of exitPriorityMenu().filter(row => row.method === "baseline")) {
    const common = { group: base.group, base, loss: 0.04, age: 10, atrMultiple: 2 };
    rows.push({ ...common, id: `${base.group}-baseline`, family: "baseline", wait: 0 });
    for (let age = 6; age <= 15; age++) for (const loss of [0.035, 0.04, 0.045]) for (const wait of [0, 5] as const)
      rows.push({ ...common, id: `${base.group}-loss${Math.round(loss * 1000)}-age${age}-wait${wait}`, family: "loss", loss, age, wait });
    for (const atrMultiple of [1.75, 2, 2.25, 2.5]) for (const wait of [0, 5] as const)
      rows.push({ ...common, id: `${base.group}-atr${atrMultiple * 100}-wait${wait}`, family: "atr", atrMultiple, wait });
    for (const family of ["or", "and"] as const) for (const wait of [0, 5] as const)
      rows.push({ ...common, id: `${base.group}-${family}-wait${wait}`, family, wait });
  }
  return rows;
}
export function riskValidationGate(policy: RiskValidationPolicy, evidence: ExitEvidence) {
  const loss = evidence.entryAge >= 1 && evidence.entryAge <= policy.age && evidence.entryLoss >= policy.loss;
  const atr = evidence.belowEma && evidence.previousAtr !== null && evidence.previousAtr > 0 &&
    evidence.dayDrop >= evidence.previousAtr * policy.atrMultiple;
  return policy.family === "baseline" ? false : policy.family === "loss" ? loss : policy.family === "atr" ? atr :
    policy.family === "and" ? loss && atr : loss || atr;
}
export class RiskValidationAccount {
  readonly inner: ExitPriorityAccount;
  constructor(readonly context: FilterContext, readonly policy: RiskValidationPolicy, start: number,
    readonly enableFrom = start, readonly allowExit: (index: number) => boolean = () => true) {
    this.inner = new ExitPriorityAccount(context, policy.base, start);
  }
  step(index: number, signals: readonly StrategyCycleRecentSignal[]) {
    const native = this.inner.step(index, signals), fallback = this.inner.inner.account.inner, raw = fallback.account;
    const riskExit = index >= this.enableFrom && this.allowExit(index) && native.before > 1e-10 && native.target > 1e-10 &&
      riskValidationGate(this.policy, native.evidence);
    if (riskExit) {
      raw.account.allocation = 0; raw.account.pending = null; raw.lastSupplement = null;
      raw.enteredAt = null; raw.entryClose = 0; raw.recoveryTarget = null; raw.riskCut = false;
      raw.cutIndex = index; raw.blockedUntil = Math.max(raw.blockedUntil, index + this.policy.wait + 1);
      fallback.flatStart = index; fallback.flatCause = "risk-validation-exit";
      this.inner.origin.finish(null, true);
    }
    return { ...native, riskExit, target: raw.account.allocation };
  }
}
export function riskValidationReplay(context: FilterContext, decisions: ReadonlyMap<number, StrategyCycleRecentSignal[]>, start: number,
  policy: RiskValidationPolicy, detailed = false, enableFrom = start, allowExit: (index: number) => boolean = () => true) {
  const account = new RiskValidationAccount(context, policy, start, enableFrom, allowExit), targets = context.bars.map(() => 0);
  const events: { index: number; time: string; evidence: ExitEvidence }[] = [];
  let riskExits = 0;
  for (let index = start; index < context.bars.length; index++) {
    const state = account.step(index, decisions.get(index) ?? []); targets[index] = state.target;
    assert.ok(state.target >= 0 && state.target <= 1);
    if (state.riskExit) { riskExits++; if (detailed) events.push({ index, time: context.bars[index]!.time, evidence: state.evidence }); }
  }
  return { targets, riskExits, ...(detailed ? { events } : {}) };
}
export function validateRiskProgress(saved: { sourceHash: string; implementationHash: string; rows: { policy: RiskValidationPolicy }[] },
  sourceHash: string, implementationHash: string, menu: RiskValidationPolicy[]) {
  assert.equal(saved.sourceHash, sourceHash); assert.equal(saved.implementationHash, implementationHash);
  assert.ok(saved.rows.length <= menu.length); saved.rows.forEach((row, offset) => assert.deepEqual(row.policy, menu[offset]));
}
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
async function bounded(path: string) { assert.ok((await stat(path)).size <= 16 * 1024 ** 2); return readFile(path, "utf8"); }
async function main() {
  const data = join(root, "data/full-screen-6-15"), output = join(root, "output/risk-exit-validation");
  const input = JSON.parse(await bounded(join(data, "input.json"))) as {
    bars: FilterContext["bars"]; barsHash: string; settings: BacktestSettings; snapshots: { decisionIndex: number }[];
  };
  const saved = JSON.parse(await bounded(join(data, "signals.json"))) as { sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[] };
  const previous = JSON.parse(await bounded(join(root, "output/exit-priority/summary.json")));
  const sourceHash = sha(JSON.stringify(input)); assert.equal(sourceHash, saved.sourceHash); assert.equal(sourceHash, previous.sourceHash);
  assert.equal(sha(JSON.stringify(input.bars)), input.barsHash); assert.ok(input.bars.length <= 10000 && saved.rows.length <= 2048);
  assert.deepEqual(saved.rows.map(row => row.index), input.snapshots.map(row => row.decisionIndex));
  const implementationHash = sha((await Promise.all(["RISK_EXIT_VALIDATION_DESIGN.md", "risk-exit-validation.ts", "exit-priority-study.ts",
    "signal-share-study.ts", "oscillator-filter-study.ts", "oscillator-entry-study.ts", "dual-return-study.ts", "sma20-fallback.ts",
    "sma-entry-study.ts", "v-recovery-study.ts", "regime-tuning.ts", "analyze.ts", "../nikkei-cycle-rallies/ma-type.ts",
    "../../lib/analysis/indicators.ts", "../../lib/analysis/sma-position-overlay.ts", "../../lib/analysis/backtest.ts",
    "../../lib/analysis/strategy-cycle-validation.ts"].map(path => readFile(join(root, path), "utf8")))).join("\n"));
  const { bars, settings } = input, start = bars.length - 2000, context = new FilterContext(bars);
  const boundary = bars.findIndex(bar => bar.time === "2026-07-21") - start + 1; assert.equal(boundary, 1936);
  const decisions = new Map(saved.rows.map(row => [row.index, row.signals])), menu = riskValidationMenu(); assert.equal(menu.length, 292);
  const metrics = (targets: number[]) => {
    const result = runStrategyCycleCloseBacktest(bars, targets, settings);
    return { result, values: fallbackMetrics(result, settings.initialCash, boundary) };
  };
  const run = (policy: RiskValidationPolicy, detailed = false, enableFrom = start, allowExit?: (index: number) => boolean) => {
    const path = riskValidationReplay(context, decisions, start, policy, detailed, enableFrom, allowExit);
    const backtest = metrics(path.targets);
    return { path, ...backtest, row: { policy, riskExits: path.riskExits, targetHash: sha(JSON.stringify(path.targets)), ...backtest.values } };
  };
  type Row = ReturnType<typeof run>["row"];
  const checkpoint = join(root, "data/risk-exit-validation/grid.json"); let rows: Row[] = [];
  try {
    const stored = JSON.parse(await bounded(checkpoint)); validateRiskProgress(stored, sourceHash, implementationHash, menu); rows = stored.rows;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const resumed = rows.length; let stopping = false;
  process.on("SIGINT", () => { stopping = true; }); process.on("SIGTERM", () => { stopping = true; });
  for (const policy of menu.slice(rows.length)) {
    if (stopping || process.memoryUsage().rss > 1.5 * 1024 ** 3) {
      await atomic(checkpoint, { sourceHash, implementationHash, rows }); throw new Error("Stopped safely; rerun risk validation");
    }
    rows.push(run(policy).row);
    if (rows.length % 20 === 0 || rows.length === menu.length) {
      await atomic(checkpoint, { sourceHash, implementationHash, rows }); console.log(`Risk validation ${rows.length}/${menu.length}`);
      await new Promise<void>(done => setImmediate(done));
    }
  }
  let overlaps = 0;
  const groups = [];
  for (const group of ["native", "turn4", "rsi", "ema3"]) {
    const cases = rows.filter(row => row.policy.group === group), baseline = cases[0]!;
    const age10 = cases.find(row => row.policy.family === "loss" && row.policy.age === 10 && row.policy.loss === 0.04 && row.policy.wait === 0)!;
    const atr2 = cases.find(row => row.policy.family === "atr" && row.policy.atrMultiple === 2 && row.policy.wait === 0)!;
    for (const row of cases.filter(row => row.policy.family === "baseline" ||
      (row.policy.family === "loss" && row.policy.age === 10 && row.policy.loss === 0.04) ||
      (row.policy.family === "atr" && row.policy.atrMultiple === 2))) {
      const method = row.policy.family === "baseline" ? "baseline" : row.policy.family === "loss" ? "loss4-age10" : "shock-atr2";
      const prior = previous.rows.find((prior: { policy: ExitPriorityPolicy }) => prior.policy.group === group &&
        prior.policy.method === method && prior.policy.wait === row.policy.wait)!;
      assert.ok(prior); assert.equal(row.targetHash, prior.targetHash); assert.equal(row.totalReturn, prior.totalReturn); overlaps++;
    }
    const balancedCases = cases.filter(row => row.totalReturn >= baseline.totalReturn - 1e-9 && row.final500.totalReturn >= baseline.final500.totalReturn - 1e-9 &&
      row.maxDrawdown > baseline.maxDrawdown + 1e-9);
    const balanced = [...balancedCases].sort((left, right) => right.maxDrawdown - left.maxDrawdown || right.totalReturn - left.totalReturn)[0] ?? baseline;
    const strict = cases.filter(row => row.totalReturn > baseline.totalReturn + 1e-9 && row.final500.totalReturn > baseline.final500.totalReturn + 1e-9 &&
      row.maxDrawdown >= baseline.maxDrawdown - 1e-9);
    const bestFull = [...cases].sort((left, right) => right.totalReturn - left.totalReturn)[0]!;
    const development = cases.filter(row => row.first1500.maxDrawdown >= baseline.first1500.maxDrawdown - 1e-9)
      .sort((left, right) => right.first1500.totalReturn - left.first1500.totalReturn)[0]!;
    const basePath = run(baseline.policy);
    const omissionFrom = bars.findIndex(bar => bar.time === "2022-12-20");
    const omissionThrough = basePath.path.targets.findIndex((target, index) => index > omissionFrom && target <= 1e-10);
    assert.ok(omissionThrough > omissionFrom);
    const selected = [];
    for (const [label, row] of [["baseline", baseline], ["age10-anchor", age10], ["atr2-anchor", atr2],
      ["best-full", bestFull], ["balanced", balanced], ["development", development]] as const) {
      const actual = run(row.policy, true); assert.deepEqual(actual.row, row);
      const next = runAllocationBacktest(bars, actual.path.targets, { ...settings, executionPolicy: "next-open" });
      const twice = runStrategyCycleCloseBacktest(bars, actual.path.targets, { ...settings,
        commissionRate: settings.commissionRate * 2, slippageRate: settings.slippageRate * 2 });
      const detail = { label, ...row, final500TargetsEqualBaseline: JSON.stringify(actual.path.targets.slice(-500)) === JSON.stringify(basePath.path.targets.slice(-500)),
        nextOpen: fallbackMetrics(next, settings.initialCash, boundary), doubleCost: fallbackMetrics(twice, settings.initialCash, boundary) };
      selected.push(detail);
      await atomic(join(output, `${group}-${label}.json`), { sourceHash, implementationHash, ...detail,
        targets: actual.path.targets, events: actual.path.events, result: actual.result });
    }
    const omissions = [];
    for (const row of [age10, atr2]) {
      const omitted = run(row.policy, false, start, index => index < omissionFrom || index > omissionThrough);
      if (row === age10) assert.equal(omitted.row.targetHash, baseline.targetHash);
      omissions.push({ id: row.policy.id, from: bars[omissionFrom]!.time, through: bars[omissionThrough]!.time,
        targetHash: omitted.row.targetHash, riskExits: omitted.path.riskExits, ...omitted.values });
    }
    const forward = run(development.policy, false, start + 1500);
    assert.deepEqual(forward.path.targets.slice(0, start + 1500), basePath.path.targets.slice(0, start + 1500));
    groups.push({ group, balancedCases: balancedCases.length, strictCases: strict.length, strictPaths: new Set(strict.map(row => row.targetHash)).size,
      selected, omissions, developmentForward: { policy: development.policy, ...forward.values } });
  }
  assert.equal(overlaps, 20);
  const summary = { sourceHash, implementationHash, generatedAt: new Date().toISOString(), resumed, cases: rows.length,
    uniquePaths: new Set(rows.map(row => row.targetHash)).size, overlapParity: overlaps, start: bars[start]!.time, end: bars.at(-1)!.time,
    final500Start: bars[bars.length - 500]!.time, settings, groups, rows,
    limitation: "Neighbor sensitivity, evaluator-only December2022 episode omissions and common-state chronological deployment checks on repeatedly explored frozen history. Not a newly unseen validation sample or independent event evidence." };
  await atomic(join(output, "summary.json"), summary);
  const header = "| Model | Selection | Policy | Full % | Final500 % | DD magnitude % | Exits |\n|---|---|---|---:|---:|---:|---:|\n";
  const line = (row: Row, label: string) => `| ${row.policy.group} | ${label} | ${row.policy.id} | ${row.totalReturn.toFixed(3)} | ${row.final500.totalReturn.toFixed(3)} | ${(-row.maxDrawdown).toFixed(3)} | ${row.riskExits} |`;
  await writeFile(join(output, "REPORT.md.tmp"), `# Earlier-risk exit validation\n\n${summary.start}..${summary.end};292 cases,${summary.uniquePaths} paths,20 exact prior anchor matches. Resumed:${resumed}.\n\n${header}${groups.flatMap(group => group.selected.map(row => line(row, row.label))).join("\n")}\n\n## Episode omissions and chronological checks\n\n\`\`\`json\n${JSON.stringify(groups.map(group => ({ group: group.group, omissions: group.omissions,
    developmentForward: group.developmentForward })), null, 2)}\n\`\`\`\n\n${summary.limitation}\n\nRead RISK_EXIT_VALIDATION_DESIGN.md for the fixed neighborhood, state cleanup and selection rules. Source/code identities, all cases, block returns, next-open and doubled costs remain in summary/selected JSON.\n`);
  await replaceFileAtomically(join(output, "REPORT.md.tmp"), join(output, "REPORT.md"));
  console.log(JSON.stringify({ resumed, cases: rows.length, paths: summary.uniquePaths, groups: groups.map(group => ({ group: group.group,
    strict: group.strictCases, balanced: group.balancedCases, selected: group.selected.map(row => ({ label: row.label, id: row.policy.id,
      full: row.totalReturn, final500: row.final500.totalReturn, dd: row.maxDrawdown, exits: row.riskExits })),
    omitted: group.omissions.map(row => ({ id: row.id, full: row.totalReturn, final500: row.final500.totalReturn, dd: row.maxDrawdown })),
    forward500: group.developmentForward.final500 })) }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
