import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atomic, root } from "./analyze";
import { FilterAccount, FilterContext, filterMenu, type FilterPolicy } from "./oscillator-filter-study";
import { PendingExitOrigin } from "./signal-share-study";
import { fallbackMetrics } from "./sma20-fallback";
import { drawdownDates } from "./sma20-fallback-audit";
import { runStrategyCycleCloseBacktest, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest, type BacktestSettings } from "../../lib/analysis/backtest";
import { replaceFileAtomically } from "../../scripts/atomic-file";

export const priorityMethods = ["zero-immediate", "zero-age3", "zero-wma", "zero-sma11", "zero-ema7", "zero-below-ema7",
  "zero-ema7-two", "zero-wma-two", "zero-below-sma20", "zero-pending2", "zero-age3-wma", "zero-below-ema7-wma",
  "zero-loss2", "zero-loss4", "weak-ema-two-wma", "weak-below-ema-two-wma", "weak-below-sma-two-wma", "weak-ema20",
  "weak-low2", "shock-atr1", "shock-atr15", "shock-atr2", "loss4-age10", "loss4-all", "loss3-all", "loss5-all"] as const;
type ExitMethod = "baseline" | typeof priorityMethods[number];
export interface ExitPriorityPolicy { id: string; group: string; entry: FilterPolicy; method: ExitMethod; wait: 0 | 5 }
export interface ExitEvidence {
  pendingZero: boolean; pendingAge: number; entryAge: number; entryLoss: number;
  wmaNegative: boolean; wmaNegativeTwo: boolean; smaUnprotected: boolean; emaNegative: boolean; emaNegativeTwo: boolean;
  belowEma: boolean; belowEmaTwo: boolean; belowSma: boolean; belowSmaTwo: boolean; ema20Negative: boolean;
  belowLowTwo: boolean; dayDrop: number; previousAtr: number | null;
}
export function exitPriorityGate(method: ExitMethod, evidence: ExitEvidence): boolean {
  if (method.startsWith("zero-") && !evidence.pendingZero) return false;
  switch (method) {
    case "baseline": return false;
    case "zero-immediate": return true;
    case "zero-age3": return evidence.entryAge >= 3;
    case "zero-wma": return evidence.wmaNegative;
    case "zero-sma11": return evidence.smaUnprotected;
    case "zero-ema7": return evidence.emaNegative;
    case "zero-below-ema7": return evidence.belowEma;
    case "zero-ema7-two": return evidence.emaNegativeTwo;
    case "zero-wma-two": return evidence.wmaNegativeTwo;
    case "zero-below-sma20": return evidence.belowSma;
    case "zero-pending2": return evidence.pendingAge >= 2;
    case "zero-age3-wma": return evidence.entryAge >= 3 && evidence.wmaNegative;
    case "zero-below-ema7-wma": return evidence.belowEma && evidence.wmaNegative;
    case "zero-loss2": return evidence.entryLoss >= 0.02;
    case "zero-loss4": return evidence.entryLoss >= 0.04;
    case "weak-ema-two-wma": return evidence.emaNegativeTwo && evidence.wmaNegative;
    case "weak-below-ema-two-wma": return evidence.belowEmaTwo && evidence.wmaNegative;
    case "weak-below-sma-two-wma": return evidence.belowSmaTwo && evidence.wmaNegative;
    case "weak-ema20": return evidence.emaNegative && evidence.ema20Negative && evidence.belowEma;
    case "weak-low2": return evidence.belowLowTwo && evidence.emaNegative && evidence.wmaNegative;
    case "shock-atr1": case "shock-atr15": case "shock-atr2":
      return evidence.belowEma && evidence.previousAtr !== null && evidence.previousAtr > 0 && evidence.dayDrop >=
        evidence.previousAtr * (method === "shock-atr1" ? 1 : method === "shock-atr15" ? 1.5 : 2);
    case "loss4-age10": return evidence.entryAge <= 10 && evidence.entryLoss >= 0.04;
    case "loss4-all": return evidence.entryLoss >= 0.04;
    case "loss3-all": return evidence.entryLoss >= 0.03;
    case "loss5-all": return evidence.entryLoss >= 0.05;
  }
}
export function exitPriorityMenu(): ExitPriorityPolicy[] {
  const entries = filterMenu(), rows: ExitPriorityPolicy[] = [];
  for (const [group, id] of [["native", "baseline"], ["turn4", "turn4-baseline-unfiltered"],
    ["rsi", "turn4-baseline-rsi35-40"], ["ema3", "daily4-ema3-baseline-unfiltered"]]) {
    const entry = entries.find(row => row.id === id)!;
    rows.push({ id: `${group}-baseline`, group: group!, entry, method: "baseline", wait: 0 });
    for (const method of priorityMethods) for (const wait of [0, 5] as const)
      rows.push({ id: `${group}-${method}-wait${wait}`, group: group!, entry, method, wait });
  }
  return rows;
}
export class ExitPriorityAccount {
  readonly inner: FilterAccount;
  readonly origin = new PendingExitOrigin();
  constructor(readonly context: FilterContext, readonly policy: ExitPriorityPolicy, start: number) {
    this.inner = new FilterAccount(context, policy.entry, start);
  }
  step(index: number, signals: readonly StrategyCycleRecentSignal[]) {
    const fallback = this.inner.account.inner, raw = fallback.account, before = raw.account.allocation;
    this.origin.begin(index, before, raw.account.pending, signals);
    const native = this.inner.step(index, signals), closes = this.context.bars, averages = this.context.inner.averages.get(20)!;
    const ema = this.context.inner.e7, emaSign = this.context.inner.features.get("EMA", 7).sign;
    const wma = this.context.inner.features.get("WMA", 7).sign, sma = this.context.inner.features.get("SMA", 11).slope;
    const below = (values: (number | null)[], cursor: number) => values[cursor] != null && closes[cursor]!.close < values[cursor]!;
    const close = closes[index]!.close, pendingZero = raw.account.pending !== null && raw.account.pending <= 1e-10;
    const evidence: ExitEvidence = {
      pendingZero, pendingAge: this.origin.index === null ? 0 : index - this.origin.index,
      entryAge: raw.enteredAt === null ? Infinity : index - raw.enteredAt,
      entryLoss: raw.entryClose > 0 ? 1 - close / raw.entryClose : -Infinity,
      wmaNegative: (wma[index] ?? 0) < 0, wmaNegativeTwo: (wma[index] ?? 0) < 0 && (wma[index - 1] ?? 0) < 0,
      smaUnprotected: sma[index] != null && sma[index]! <= 0.00075,
      emaNegative: (emaSign[index] ?? 0) < 0, emaNegativeTwo: (emaSign[index] ?? 0) < 0 && (emaSign[index - 1] ?? 0) < 0,
      belowEma: below(ema, index), belowEmaTwo: index > 0 && below(ema, index) && below(ema, index - 1),
      belowSma: below(averages, index), belowSmaTwo: index > 0 && below(averages, index) && below(averages, index - 1),
      ema20Negative: this.context.ema20[index] != null && this.context.ema20[index - 1] != null &&
        this.context.ema20[index]! < this.context.ema20[index - 1]!,
      belowLowTwo: index >= 2 && close < Math.min(closes[index - 1]!.low, closes[index - 2]!.low),
      dayDrop: index > 0 ? closes[index - 1]!.close - close : 0, previousAtr: this.context.atr[index - 1] ?? null,
    };
    const blocked = native.target > 1e-10 && pendingZero;
    const holdBlocked = blocked && raw.lastSupplement !== null && index - raw.lastSupplement < 7;
    const smaBlocked = blocked && sma[index] != null && sma[index]! > 0.00075;
    const wmaBlocked = blocked && !evidence.wmaNegative;
    const localExit = before > 1e-10 && native.target > 1e-10 && exitPriorityGate(this.policy.method, evidence);
    const zeroRequestIndex = this.origin.index;
    if (localExit) {
      raw.account.allocation = 0; raw.account.pending = null; raw.lastSupplement = null;
      raw.enteredAt = null; raw.entryClose = 0; raw.recoveryTarget = null; raw.riskCut = false;
      raw.cutIndex = index; raw.blockedUntil = Math.max(raw.blockedUntil, index + this.policy.wait + 1);
      fallback.flatStart = index; fallback.flatCause = "priority-exit";
    }
    this.origin.finish(raw.account.pending, native.cut || localExit);
    return { ...native, target: raw.account.allocation, localExit, evidence, zeroRequestIndex,
      blocked, holdBlocked, smaBlocked, wmaBlocked };
  }
}
export function exitPriorityReplay(context: FilterContext, decisions: ReadonlyMap<number, StrategyCycleRecentSignal[]>, start: number,
  policy: ExitPriorityPolicy, detailed = false) {
  const account = new ExitPriorityAccount(context, policy, start), targets = context.bars.map(() => 0);
  type Event = { time: string; close: number; pendingIndex: number | null; evidence: ExitEvidence };
  const exits: Event[] = [], blocks: Event[] = [];
  const counts = { localExits: 0, pendingZeroDays: 0, holdBlockedDays: 0, smaBlockedDays: 0, wmaBlockedDays: 0 };
  for (let index = start; index < context.bars.length; index++) {
    const state = account.step(index, decisions.get(index) ?? []); targets[index] = state.target;
    counts.localExits += Number(state.localExit); counts.pendingZeroDays += Number(state.blocked);
    counts.holdBlockedDays += Number(state.holdBlocked); counts.smaBlockedDays += Number(state.smaBlocked); counts.wmaBlockedDays += Number(state.wmaBlocked);
    if (detailed && (state.localExit || state.blocked)) {
      const event = { time: context.bars[index]!.time, close: context.bars[index]!.close,
        pendingIndex: state.zeroRequestIndex, evidence: state.evidence };
      if (state.localExit) exits.push(event); if (state.blocked) blocks.push(event);
    }
    assert.ok(state.target >= 0 && state.target <= 1);
  }
  return { targets, counts, ...(detailed ? { exits, blocks } : {}) };
}
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
async function bounded(path: string) { assert.ok((await stat(path)).size <= 16 * 1024 ** 2); return readFile(path, "utf8"); }
export function validateExitProgress(saved: { sourceHash: string; implementationHash: string; rows: { policy: ExitPriorityPolicy }[] },
  sourceHash: string, implementationHash: string, menu: ExitPriorityPolicy[]) {
  assert.equal(saved.sourceHash, sourceHash); assert.equal(saved.implementationHash, implementationHash);
  assert.ok(saved.rows.length <= menu.length); saved.rows.forEach((row, offset) => assert.deepEqual(row.policy, menu[offset]));
}
async function main() {
  const data = join(root, "data/full-screen-6-15"), output = join(root, "output/exit-priority");
  const input = JSON.parse(await bounded(join(data, "input.json"))) as {
    bars: FilterContext["bars"]; barsHash: string; settings: BacktestSettings; snapshots: { decisionIndex: number }[];
  };
  const saved = JSON.parse(await bounded(join(data, "signals.json"))) as { sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[] };
  const reference = JSON.parse(await bounded(join(root, "output/oscillator-filter/summary.json")));
  const sourceHash = sha(JSON.stringify(input)); assert.equal(sourceHash, saved.sourceHash); assert.equal(sourceHash, reference.sourceHash);
  assert.equal(sha(JSON.stringify(input.bars)), input.barsHash); assert.ok(input.bars.length <= 10000 && saved.rows.length <= 2048);
  assert.deepEqual(saved.rows.map(row => row.index), input.snapshots.map(row => row.decisionIndex));
  const implementationHash = sha((await Promise.all(["EXIT_PRIORITY_DESIGN.md", "exit-priority-study.ts", "signal-share-study.ts",
    "oscillator-filter-study.ts", "oscillator-entry-study.ts", "dual-return-study.ts", "sma20-fallback.ts", "sma-entry-study.ts",
    "v-recovery-study.ts", "regime-tuning.ts", "analyze.ts", "../nikkei-cycle-rallies/ma-type.ts", "../../lib/analysis/indicators.ts",
    "../../lib/analysis/sma-position-overlay.ts", "../../lib/analysis/backtest.ts", "../../lib/analysis/strategy-cycle-validation.ts"]
    .map(path => readFile(join(root, path), "utf8")))).join("\n"));
  const { bars, settings } = input, start = bars.length - 2000, context = new FilterContext(bars);
  const boundary = bars.findIndex(bar => bar.time === "2026-07-21") - start + 1; assert.equal(boundary, 1936);
  const decisions = new Map(saved.rows.map(row => [row.index, row.signals])), menu = exitPriorityMenu(); assert.equal(menu.length, 212);
  const run = (policy: ExitPriorityPolicy, detailed = false) => {
    const path = exitPriorityReplay(context, decisions, start, policy, detailed), result = runStrategyCycleCloseBacktest(bars, path.targets, settings);
    return { path, result, row: { policy, ...path.counts, targetHash: sha(JSON.stringify(path.targets)),
      ...fallbackMetrics(result, settings.initialCash, boundary) } };
  };
  type Row = ReturnType<typeof run>["row"];
  const checkpoint = join(root, "data/exit-priority/grid.json"); let rows: Row[] = [];
  try {
    const stored = JSON.parse(await bounded(checkpoint)); validateExitProgress(stored, sourceHash, implementationHash, menu); rows = stored.rows;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const resumed = rows.length; let stopping = false;
  process.on("SIGINT", () => { stopping = true; }); process.on("SIGTERM", () => { stopping = true; });
  for (const policy of menu.slice(rows.length)) {
    if (stopping || process.memoryUsage().rss > 1.5 * 1024 ** 3) {
      await atomic(checkpoint, { sourceHash, implementationHash, rows }); throw new Error("Stopped safely; rerun exit priority study");
    }
    rows.push(run(policy).row);
    if (rows.length % 20 === 0 || rows.length === menu.length) {
      await atomic(checkpoint, { sourceHash, implementationHash, rows }); console.log(`Exit priority ${rows.length}/${menu.length}`);
      await new Promise<void>(done => setImmediate(done));
    }
  }
  const groups = [];
  for (const group of ["native", "turn4", "rsi", "ema3"]) {
    const cases = rows.filter(row => row.policy.group === group), baseline = cases[0]!, affected = cases.filter(row => row.localExits > 0);
    const previous = reference.rows.find((row: { policy: FilterPolicy }) => row.policy.id === baseline.policy.entry.id)!;
    assert.equal(baseline.targetHash, previous.targetHash); assert.equal(baseline.totalReturn, previous.totalReturn);
    const bestFull = [...affected].sort((left, right) => right.totalReturn - left.totalReturn)[0] ?? baseline;
    const bestDd = [...affected].sort((left, right) => right.maxDrawdown - left.maxDrawdown || right.totalReturn - left.totalReturn)[0] ?? baseline;
    const balancedCases = affected.filter(row => row.totalReturn >= baseline.totalReturn - 1e-9 && row.final500.totalReturn >= baseline.final500.totalReturn - 1e-9 &&
      row.maxDrawdown > baseline.maxDrawdown + 1e-9);
    const balanced = [...balancedCases].sort((left, right) => right.maxDrawdown - left.maxDrawdown || right.totalReturn - left.totalReturn)[0] ?? baseline;
    const strict = affected.filter(row => row.totalReturn > baseline.totalReturn + 1e-9 && row.final500.totalReturn > baseline.final500.totalReturn + 1e-9 &&
      row.maxDrawdown >= baseline.maxDrawdown - 1e-9);
    const development = cases.filter(row => row.first1500.maxDrawdown >= baseline.first1500.maxDrawdown - 1e-9)
      .sort((left, right) => right.first1500.totalReturn - left.first1500.totalReturn)[0]!;
    const selected = [];
    for (const [label, row] of [["baseline", baseline], ["best-full", bestFull], ["best-dd", bestDd], ["balanced", balanced], ["development", development]] as const) {
      const replay = run(row.policy, true); assert.deepEqual(replay.row, row);
      const next = runAllocationBacktest(bars, replay.path.targets, { ...settings, executionPolicy: "next-open" });
      const twice = runStrategyCycleCloseBacktest(bars, replay.path.targets, { ...settings,
        commissionRate: settings.commissionRate * 2, slippageRate: settings.slippageRate * 2 });
      const detail = { label, ...row, fullDrawdown: drawdownDates(replay.result, settings.initialCash),
        recentDrawdown: drawdownDates(replay.result, settings.initialCash, boundary),
        nextOpen: fallbackMetrics(next, settings.initialCash, boundary), doubleCost: fallbackMetrics(twice, settings.initialCash, boundary) };
      selected.push(detail);
      await atomic(join(output, `${group}-${label}.json`), { sourceHash, implementationHash, ...detail,
        targets: replay.path.targets, exits: replay.path.exits, blocks: replay.path.blocks, result: replay.result });
    }
    groups.push({ group, balancedCases: balancedCases.length, strictCases: strict.length, strictPaths: new Set(strict.map(row => row.targetHash)).size,
      ddImprovedCases: affected.filter(row => row.maxDrawdown > baseline.maxDrawdown + 1e-9).length, selected });
  }
  const summary = { sourceHash, implementationHash, generatedAt: new Date().toISOString(), resumed, cases: rows.length,
    uniquePaths: new Set(rows.map(row => row.targetHash)).size, start: bars[start]!.time, end: bars.at(-1)!.time,
    final500Start: bars[bars.length - 500]!.time, settings, groups, rows,
    limitation: "Frozen entry/winner path, conditional priority/risk exits only. Historical menu search, not unseen validation. Pending-day guard counts overlap and are not request counts or profit attribution. No added recovery buy after new exits." };
  await atomic(join(output, "summary.json"), summary);
  const line = (row: Row, label: string) => `| ${row.policy.group} | ${label} | ${row.policy.id} | ${row.totalReturn.toFixed(3)} | ${row.final500.totalReturn.toFixed(3)} | ${(-row.maxDrawdown).toFixed(3)} | ${row.recent.totalReturn.toFixed(3)} | ${row.localExits} |`;
  const header = "| Model | Selection | Policy | Full % | Final500 % | DD magnitude % | Recent % | Extra exits |\n|---|---|---|---:|---:|---:|---:|---:|\n";
  await writeFile(join(output, "REPORT.md.tmp"), `# Earlier-exit and pending-sell priority comparison\n\n${summary.start}..${summary.end};212 cases,${summary.uniquePaths} paths. Resumed:${resumed}. Main Nikkei completed-close proxy and original costs.\n\n${header}${groups.flatMap(group => group.selected.map(row => line(row, row.label))).join("\n")}\n\n${summary.limitation}\n\nRead EXIT_PRIORITY_DESIGN.md for all26 gates and cleanup/reentry rules. Full scalar results and selected cost/next-open/chronological checks remain in summary.json.\n`);
  await replaceFileAtomically(join(output, "REPORT.md.tmp"), join(output, "REPORT.md"));
  console.log(JSON.stringify({ resumed, cases: rows.length, paths: summary.uniquePaths, groups: groups.map(group => ({ ...group,
    selected: group.selected.map(row => ({ label: row.label, id: row.policy.id, full: row.totalReturn, final500: row.final500.totalReturn,
      dd: row.maxDrawdown, recent: row.recent.totalReturn, exits: row.localExits })) })) }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
