import assert from "node:assert/strict";
import { readFile, writeFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import { SAME_CLOSE_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import { strategyCyclePlanKey, strategyCycleRecentSignals, strategyCycleSignalDirection,
  type StrategyCycleSelectionSnapshot, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { BacktestSettings, AllocationRebalance } from "../../lib/analysis/backtest";
import type { MarketBar } from "../../lib/market/types";
import { Stepper } from "../nikkei-screening-skip-audit/model";
import { needsHoldingScreen } from "./model";
interface Day { index: number; time: string; cash: number; units: number; equity: number;
  target: number; pending: number | null; planKey: string | null; extra: boolean }
const root = dirname(fileURLToPath(import.meta.url));
async function load(path: string) {
  assert.ok((await stat(path)).size <= 16 * 1024 ** 2);
  return JSON.parse(await readFile(path, "utf8"));
}
const latest = await load(process.argv[2] ?? join(root, "output/latest.json")); assert.equal(latest.status, "complete");
const reportPath: string = latest.reportPath ?? join(root, "RESULTS.md");
const source = await load(join(latest.data, "input.json")) as { bars: MarketBar[]; settings: BacktestSettings };
const saved = await load(join(latest.data, "original-signals.json")) as { rows: { index: number; signals: StrategyCycleRecentSignal[] }[] };
const summary = await load(join(latest.output, "summary.json"));
const alternative = await load(join(latest.output, "alternative.json")) as {
  days: Day[]; fills: AllocationRebalance[]; state: ReturnType<Stepper["initial"]> };
const baseline = await load(join(latest.output, "baseline.json")) as { days: Day[]; fills: AllocationRebalance[] };
const snapshots = await load(join(latest.output, "snapshots.json")) as StrategyCycleSelectionSnapshot[];
const selected = new Map(snapshots.map(s => [s.decisionIndex, s]));
const originalSignals = new Map(saved.rows.map(r => [r.index, r.signals]));
const { bars } = source, settings = { ...source.settings, positionOverlay: DEFAULT_POSITION_OVERLAY_OPTIONS };
const stepper = new Stepper(bars, settings), probe = new Stepper(bars, settings);
let state = stepper.initial(bars.length - 2000);
const extraRows = [];
for (const day of alternative.days) {
  const index: number = day.index, snapshot = selected.get(index);
  const signals = originalSignals.get(index) ?? (snapshot ? strategyCycleRecentSignals(bars, snapshot, index) : []);
  const actual = stepper.step(state, index, signals, snapshot ? strategyCyclePlanKey(snapshot) : state.planKey);
  assert.deepEqual(actual.state.account, { cash: day.cash, units: day.units });
  assert.equal(actual.state.target, day.target);
  if (day.extra) {
    const omitted = probe.step(state, index, []);
    const carried = state.planKey ? JSON.parse(state.planKey) as Pick<StrategyCycleSelectionSnapshot, "plan" | "fixedRelativeLongStrategy"> : null;
    const oldSignals = carried ? strategyCycleRecentSignals(bars, { ...carried,
      decisionIndex: index, decisionTime: day.time, screeningWindow: 10, label: "same-state-carried-plan" }, index) : [];
    const checkedOld = probe.step(state, index, oldSignals);
    const clears = (fills: AllocationRebalance[]) => fills.some(f => f.fromAllocation > 1e-10 && f.targetAllocation <= 1e-10);
    extraRows.push({ time: day.time, index, direction: strategyCycleSignalDirection(signals), signals,
      actualTarget: actual.state.target, noScreenTarget: omitted.state.target,
      pendingBefore: state.overlay.pending, pendingAfter: actual.state.overlay.pending,
      fills: actual.fills, noScreenFills: omitted.fills,
      previousPlan: carried, selectedPlan: snapshot, oldStrategySignals: oldSignals,
      oldStrategyTarget: checkedOld.state.target, oldStrategyPending: checkedOld.state.overlay.pending,
      newVsOldChangesTarget: Math.abs(actual.state.target - checkedOld.state.target) > 1e-10,
      directClear: clears(actual.fills) && !clears(omitted.fills),
      changedSameDayTarget: Math.abs(actual.state.target - omitted.state.target) > 1e-10 });
  }
  state = actual.state;
}
assert.deepEqual(state, alternative.state);
const clearDates = (fills: AllocationRebalance[]) => fills.filter(f => f.fromAllocation > 1e-10 && f.targetAllocation <= 1e-10).map(f => f.time);
const oldDates = clearDates(baseline.fills), newDates = clearDates(alternative.fills);
const diagnostic = { identity: summary.identity, extraScreens: extraRows.length,
  reduceSignalDates: extraRows.filter(r => r.direction === "reduce").length,
  increaseSignalDates: extraRows.filter(r => r.direction === "increase").length,
  extraScreenDatesWithChangedTarget: extraRows.filter(r => r.changedSameDayTarget).length,
  directSameDayClears: extraRows.filter(r => r.directClear).map(r => r.time),
  baselineOnlyClearDates: oldDates.filter(t => !newDates.includes(t)),
  alternativeOnlyClearDates: newDates.filter(t => !oldDates.includes(t)), rows: extraRows };
async function atomic(path: string, value: unknown) {
  await writeFile(`${path}.tmp`, typeof value === "string" ? value : JSON.stringify(value));
  await replaceFileAtomically(`${path}.tmp`, path);
}
await atomic(join(latest.output, "exit-diagnostics.json"), diagnostic);

// A separate causal policy checks only the carried strategy on its OWN holding dates.
// It is diagnostic and performs no optimization or future/calendar borrowing.
const oldStepper = new Stepper(bars, settings);
let oldState = oldStepper.initial(bars.length - 2000), carried: StrategyCycleSelectionSnapshot | null = null;
const oldDays: Day[] = [], oldFills: AllocationRebalance[] = [];
for (let index = bars.length - 2000; index < bars.length; index++) {
  const regular = originalSignals.has(index);
  if (regular) carried = selected.get(index)!;
  const extra = !regular && needsHoldingScreen(bars, index, oldState.account.units);
  const signals = originalSignals.get(index) ?? (extra && carried ? strategyCycleRecentSignals(bars, carried, index) : []);
  const next = oldStepper.step(oldState, index, signals, carried ? strategyCyclePlanKey(carried) : oldState.planKey);
  oldDays.push({ index, time: bars[index].time, ...next.state.account,
    equity: next.state.account.cash + next.state.account.units * bars[index].close,
    target: next.state.target, pending: next.state.overlay.pending, planKey: next.state.planKey, extra });
  oldFills.push(...next.fills); oldState = next.state;
}
const initial = settings.initialCash;
function performance(days: Day[]) {
  let peak = initial, dd = 0;
  for (const day of days) { peak = Math.max(peak, day.equity); dd = Math.max(dd, (1 - day.equity / peak) * 100); }
  return { net: (days.at(-1)!.equity / initial - 1) * 100, maxDrawdown: dd };
}
const daily = alternative.days.map((day, n) => {
  const base = baseline.days[n], prior = alternative.days[n - 1], priorBase = baseline.days[n - 1];
  const incrementalProfit = (day.equity - (prior?.equity ?? initial)) - (base.equity - (priorBase?.equity ?? initial));
  const closeChange = n ? bars[day.index].close - bars[day.index - 1].close : 0;
  const priorHoldingEffect = ((prior?.units ?? 0) - (priorBase?.units ?? 0)) * closeChange;
  return { time: day.time, index: day.index, extra: day.extra,
    baselineTarget: base.target, alternativeTarget: day.target,
    baselineEquity: base.equity, alternativeEquity: day.equity,
    incrementalProfit, contributionPoints: incrementalProfit / initial * 100,
    priorHoldingEffect, executionAndCostResidual: incrementalProfit - priorHoldingEffect };
});
const contribution = daily.reduce((sum, d) => sum + d.contributionPoints, 0);
assert.ok(Math.abs(contribution - summary.deltaReturnPoints) < 1e-8);
function groups(key: (time: string, n: number) => string) {
  const grouped = new Map<string, typeof daily>();
  daily.forEach((day, n) => { const name = key(day.time, n); grouped.set(name, [...(grouped.get(name) ?? []), day]); });
  return [...grouped].map(([period, days]) => ({ period, start: days[0].time, end: days.at(-1)!.time,
    contributionPoints: days.reduce((sum, d) => sum + d.contributionPoints, 0),
    holdingEffectCash: days.reduce((sum, d) => sum + d.priorHoldingEffect, 0),
    executionAndCostResidualCash: days.reduce((sum, d) => sum + d.executionAndCostResidual, 0),
    extraScreens: days.filter(d => d.extra).length,
    differingTargetDays: days.filter(d => Math.abs(d.baselineTarget - d.alternativeTarget) > 1e-10).length }));
}
const months = groups(t => t.slice(0, 7));
const attribution = { identity: summary.identity, baseline: summary.baseline, fullRescreen: summary.alternative,
  carriedStrategyOnly: { ...performance(oldDays), fills: oldFills.length, checks: oldDays.filter(d => d.extra).length },
  firstAccountDifference: daily.find(d => Math.abs(d.baselineEquity - d.alternativeEquity) > 1e-6) ?? null,
  firstTargetDifference: daily.find(d => Math.abs(d.baselineTarget - d.alternativeTarget) > 1e-10) ?? null,
  extraScreenDatesWhereNewVsOldChangesTarget: extraRows.filter(r => r.newVsOldChangesTarget).length,
  changedTargetDays: daily.filter(d => Math.abs(d.baselineTarget - d.alternativeTarget) > 1e-10).length,
  years: groups(t => t.slice(0, 4)), blocks500: groups((_, n) => `sessions-${Math.floor(n / 500) * 500 + 1}-${(Math.floor(n / 500) + 1) * 500}`),
  months, bestMonths: [...months].sort((a, b) => b.contributionPoints - a.contributionPoints).slice(0, 5),
  worstMonths: [...months].sort((a, b) => a.contributionPoints - b.contributionPoints).slice(0, 5),
  daily, accounting: { summedContributionPoints: contribution, finalReturnDifferencePoints: summary.deltaReturnPoints },
  limitation: "Period contributions are additive cash differences divided by initial cash, not independent period returns. Holding effect includes capital-size compounding; execution/cost residual includes open reconciliation. Same-state probes identify immediate effects only; whole-path differences also include later state/eligibility changes." };
await atomic(join(latest.output, "difference-analysis.json"), attribution);
await atomic(join(latest.output, "carried-strategy-only.json"), { days: oldDays, fills: oldFills });
const previous = await readFile(reportPath, "utf8");
await atomic(reportPath, previous.split("\n## Exit attribution")[0] +
  `\n## Exit attribution\n\nAdditional screened dates with reduce signals:${diagnostic.reduceSignalDates};increase signals:${diagnostic.increaseSignalDates}. Same-pre-day no-screen probes change the same-day target on${diagnostic.extraScreenDatesWithChangedTarget} dates. Direct extra-request clears:${diagnostic.directSameDayClears.join(", ") || "none"}. Guards and daily risk handling remain active;not every extra-screen-date fill is caused by screening.\n\nBaseline-only clear dates:${diagnostic.baselineOnlyClearDates.join(", ") || "none"}.\n\nAlternative-only clear dates:${diagnostic.alternativeOnlyClearDates.join(", ") || "none"}. These date differences describe whole-path divergence;they are not all direct screen effects. Full same-state probes are in exit-diagnostics.json.\n\n## Where the performance difference comes from\n\nFirst target divergence:${attribution.firstTargetDifference?.time ?? "none"};first account-value divergence:${attribution.firstAccountDifference?.time ?? "none"}. Targets differ on${attribution.changedTargetDays} days. On${attribution.extraScreenDatesWhereNewVsOldChangesTarget} added dates,the newly selected strategy changes the immediate target compared with checking the previous strategy from identical state.\n\nCausal carried-strategy-only diagnostic:net${attribution.carriedStrategyOnly.net.toFixed(6)}%,DD${attribution.carriedStrategyOnly.maxDrawdown.toFixed(6)}%,${oldFills.length}fills,${attribution.carriedStrategyOnly.checks}extra checks. It uses its own holding dates and performs no full screening.\n\n| Period | Additive advantage pp | Extra screens | Different targets |\n|---|---:|---:|---:|\n${[...attribution.years, ...attribution.blocks500].map(r => `| ${r.period} | ${r.contributionPoints.toFixed(6)} | ${r.extraScreens} | ${r.differingTargetDays} |`).join("\n")}\n\nLargest positive months:${attribution.bestMonths.map(r => `${r.period} ${r.contributionPoints.toFixed(6)}pp`).join("; ")}.\n\nLargest negative months:${attribution.worstMonths.map(r => `${r.period} ${r.contributionPoints.toFixed(6)}pp`).join("; ")}.\n\n${attribution.limitation} Full daily,monthly,yearly and500-session accounting is in difference-analysis.json;contributions sum exactly to the final return difference.\n`);
console.log(JSON.stringify({ ...diagnostic, rows: undefined }));
const plots = await promisify(execFile)("python", [join(root, "plot.py"), process.argv[2] ?? join(root, "output/latest.json")],
  { windowsHide: true, maxBuffer: 1024 * 1024, timeout: 120000 });
process.stdout.write(plots.stdout);
