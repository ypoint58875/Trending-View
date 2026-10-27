import type { BacktestSettings } from "./backtest";
import { resolveCanonicalMarketProfile } from "../market/canonical";
import type { MarketBar, MarketSeries } from "../market/types";
import type { ValidatedCyclePreview } from "./validated-cycle-preview";
import {
  buildStrategyCycleRollingReport,
  completedNikkeiCycleSeries,
  NIKKEI_CYCLE_MODEL,
  NIKKEI_CYCLE_CONFLICT_POLICY,
  shouldScreenStrategyCycleAtIndex,
  type StrategyCycleRollingReport,
  type StrategyCycleSelectionSnapshot,
} from "./strategy-cycle-validation";

export type ValidatedCycleSettings = Pick<BacktestSettings,
  "initialCash" | "commissionRate" | "slippageRate" | "positionOverlay" | "executionPolicy"
> & { interval: "1d" };

export interface ValidatedCycleStrategy {
  key: string;
  version: 1;
  model: typeof NIKKEI_CYCLE_MODEL;
  conflictPolicy: typeof NIKKEI_CYCLE_CONFLICT_POLICY;
  revision: number;
  screeningWindow: number;
  startTime: string;
  series: MarketSeries;
  settings: ValidatedCycleSettings;
  snapshots: StrategyCycleSelectionSnapshot[];
  report: StrategyCycleRollingReport;
  pending: { series: MarketSeries; snapshot: StrategyCycleSelectionSnapshot; provenance: string } | null;
  provenance: string;
  updatedAt: string;
  preview?: ValidatedCyclePreview;
  ruleBackup?: {
    settings: ValidatedCycleSettings; report: StrategyCycleRollingReport; revision: number; updatedAt: string;
  };
}

export class ValidatedCycleError extends Error {
  constructor(public readonly code: "gap" | "history" | "capacity" | "conflict" | "storage",
    public readonly dates: string[] = []) {
    super(`Validated cycle ${code}${dates.length ? `: ${dates.join(", ")}` : ""}`);
  }
}

export function validatedCycleKey(series: MarketSeries, window: number): string {
  return `${resolveCanonicalMarketProfile(series.instrument).key}:${series.interval}:${window}`;
}

export function validatedCycleFocusRange(profile: ValidatedCycleStrategy) {
  const start = profile.series.bars.findIndex((bar) => bar.time === profile.startTime);
  return { startTime: profile.series.bars[Math.max(start, profile.series.bars.length - 128)]!.time,
    endTime: profile.report.evaluationEndTime };
}

export function assertValidatedCycleHistory(profile: ValidatedCycleStrategy, series: MarketSeries): void {
  if (profile.version !== 1 || profile.model !== NIKKEI_CYCLE_MODEL ||
    profile.conflictPolicy !== NIKKEI_CYCLE_CONFLICT_POLICY ||
    validatedCycleKey(series, profile.screeningWindow) !== profile.key) throw new ValidatedCycleError("history");
  alignSeries(profile, series);
}

function sameBar(left: MarketBar, right: MarketBar): boolean {
  return left.time === right.time && left.open === right.open && left.high === right.high &&
    left.low === right.low && left.close === right.close && left.volume === right.volume && left.amount === right.amount;
}

function alignSeries(profile: ValidatedCycleStrategy, series: MarketSeries): MarketSeries {
  const offset = series.bars.findIndex((bar) => bar.time === profile.series.bars[0]?.time);
  const bars = series.bars.slice(offset);
  if (offset < 0 || profile.series.priceAdjustment !== series.priceAdjustment ||
    profile.series.bars.some((bar, index) => !bars[index] || !sameBar(bar, bars[index]!))) {
    throw new ValidatedCycleError("history");
  }
  if (bars.length > 10_000) throw new ValidatedCycleError("capacity");
  return { ...series, bars };
}

function replay(series: MarketSeries, snapshots: StrategyCycleSelectionSnapshot[], startTime: string,
  screeningWindow: number, settings: ValidatedCycleSettings): StrategyCycleRollingReport {
  const start = series.bars.findIndex((bar) => bar.time === startTime);
  if (start < 0 || series.bars.length > 10_000 || snapshots.length > 10_000) {
    throw new ValidatedCycleError("capacity");
  }
  return buildStrategyCycleRollingReport(series.bars, snapshots, series.bars.length - start,
    screeningWindow, settings, snapshots.map((snapshot) => snapshot.decisionIndex));
}

export function createValidatedCycleStrategy(series: MarketSeries, snapshots: StrategyCycleSelectionSnapshot[],
  sessions: number, window: number, settings: ValidatedCycleSettings, now = new Date()): ValidatedCycleStrategy {
  const completed = completedNikkeiCycleSeries(series, now);
  if (completed.bars.length !== series.bars.length || series.bars.length > 10_000) {
    throw new ValidatedCycleError("history");
  }
  const selected = snapshots.filter((snapshot) => snapshot.screeningWindow === window)
    .sort((left, right) => left.decisionIndex - right.decisionIndex);
  const report = buildStrategyCycleRollingReport(series.bars, selected, sessions, window, settings);
  return structuredClone({ key: validatedCycleKey(series, window), version: 1,
    model: NIKKEI_CYCLE_MODEL, conflictPolicy: NIKKEI_CYCLE_CONFLICT_POLICY, revision: 0,
    screeningWindow: window, startTime: report.evaluationStartTime, series, settings,
    snapshots: selected, report, pending: null, provenance: "cycle-validation", updatedAt: now.toISOString() });
}

export function continueValidatedCycleStrategy(profile: ValidatedCycleStrategy, input: MarketSeries,
  selection: StrategyCycleSelectionSnapshot, provenance: string, now = new Date()): ValidatedCycleStrategy {
  if (profile.version !== 1 || profile.model !== NIKKEI_CYCLE_MODEL ||
    profile.conflictPolicy !== NIKKEI_CYCLE_CONFLICT_POLICY ||
    validatedCycleKey(input, selection.screeningWindow) !== profile.key) {
    throw new ValidatedCycleError("history");
  }
  const series = alignSeries(profile, input);
  const lastTime = profile.series.bars.at(-1)!.time;
  const additions = series.bars.filter((bar) => bar.time > lastTime);
  if (additions.length > 1) throw new ValidatedCycleError("gap", additions.slice(0, -1).map((bar) => bar.time));
  if (!additions.length) return profile;
  const decisionIndex = series.bars.length - 1;
  if (selection.decisionTime !== series.bars[decisionIndex]!.time) throw new ValidatedCycleError("history");
  const snapshot = structuredClone({ ...selection, decisionIndex });
  delete snapshot.plan.positionOverlay;
  const complete = completedNikkeiCycleSeries(series, now).bars.at(-1)?.time === snapshot.decisionTime;
  if (!complete) {
    const pending = { series, snapshot, provenance };
    if (JSON.stringify(pending) === JSON.stringify(profile.pending)) return profile;
    return { ...profile, pending, updatedAt: now.toISOString() };
  }
  const snapshots = [...profile.snapshots, snapshot];
  return { ...profile, series, snapshots, pending: null, provenance,
    report: replay(series, snapshots, profile.startTime, profile.screeningWindow, profile.settings),
    updatedAt: now.toISOString() };
}

export function mergeValidatedCycleRepair(previous: ValidatedCycleStrategy, repaired: ValidatedCycleStrategy): ValidatedCycleStrategy {
  if (previous.key !== repaired.key) throw new ValidatedCycleError("history");
  if (repaired.series.bars.at(-1)!.time <= previous.series.bars.at(-1)!.time) return previous;
  const series = alignSeries(previous, repaired.series);
  const lastTime = previous.series.bars.at(-1)!.time;
  const newBars = series.bars.filter((bar) => bar.time > lastTime);
  const missing = newBars.filter((bar) => bar.time < repaired.startTime ||
    (shouldScreenStrategyCycleAtIndex(series.bars, series.bars.indexOf(bar)) &&
      !repaired.snapshots.some((snapshot) => snapshot.decisionTime === bar.time)));
  if (missing.length) throw new ValidatedCycleError("gap", missing.map((bar) => bar.time));
  const additions = repaired.snapshots.filter((snapshot) => snapshot.decisionTime > lastTime)
    .map((snapshot) => ({ ...snapshot, decisionIndex: series.bars.findIndex((bar) => bar.time === snapshot.decisionTime) }));
  const snapshots = [...previous.snapshots, ...additions];
  return { ...previous, series, snapshots, pending: null, provenance: "cycle-validation-repair",
    report: replay(series, snapshots, previous.startTime, previous.screeningWindow, previous.settings),
    updatedAt: repaired.updatedAt };
}
