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
    public readonly dates: string[] = [], public readonly detail = "") {
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

export function assertValidatedCycleHistory(profile: ValidatedCycleStrategy, series: MarketSeries): MarketSeries {
  return prepareValidatedCycleHistory(profile, series, false).series;
}

export function prepareValidatedCycleHistory(
  profile: ValidatedCycleStrategy, series: MarketSeries, allowRecentCorrections = true,
): { series: MarketSeries; firstChangedTime: string | null } {
  if (profile.version !== 1 || profile.model !== NIKKEI_CYCLE_MODEL ||
    profile.conflictPolicy !== NIKKEI_CYCLE_CONFLICT_POLICY ||
    validatedCycleKey(series, profile.screeningWindow) !== profile.key) throw new ValidatedCycleError("history");
  const aligned = alignCycleHistory(profile, series, allowRecentCorrections);
  const offset = series.bars.length - aligned.series.bars.length;
  return {
    series: { ...series, bars: [...series.bars.slice(0, offset), ...aligned.series.bars] },
    firstChangedTime: aligned.firstChangedTime,
  };
}

function sameBar(left: MarketBar, right: MarketBar): boolean {
  return left.time === right.time && left.open === right.open && left.high === right.high &&
    left.low === right.low && left.close === right.close &&
    (left.volume === right.volume || (left.volume === 0 && right.volume > 0)) && left.amount === right.amount;
}

function alignSeries(profile: ValidatedCycleStrategy, series: MarketSeries): MarketSeries {
  return alignCycleHistory(profile, series, false).series;
}

function alignCycleHistory(
  profile: ValidatedCycleStrategy, series: MarketSeries, allowRecentCorrections: boolean,
): { series: MarketSeries; firstChangedTime: string | null } {
  const offset = series.bars.findIndex((bar) => bar.time === profile.series.bars[0]?.time);
  const bars = series.bars.slice(offset);
  if (offset < 0 || profile.series.priceAdjustment !== series.priceAdjustment) {
    throw new ValidatedCycleError("history", [profile.series.bars[0]!.time],
      offset < 0 ? "prefix" : "adjustment");
  }
  const preserved = [...profile.series.bars];
  let firstChangedTime: string | null = null;
  for (const [index, bar] of profile.series.bars.entries()) {
    const incoming = bars[index];
    if (allowRecentCorrections && index >= profile.series.bars.length - 2 && incoming?.time === bar.time &&
      (!sameBar(bar, incoming) || bar.volume !== incoming.volume)) {
      preserved[index] = incoming;
      firstChangedTime ??= bar.time;
      continue;
    }
    if (!incoming || !sameBar(bar, incoming)) {
      const field = incoming ? (["time", "open", "high", "low", "close", "volume", "amount"] as const)
        .find((field) => bar[field] !== incoming[field] &&
          !(field === "volume" && bar.volume === 0 && incoming.volume > 0))! : "missing";
      throw new ValidatedCycleError("history", [bar.time], field);
    }
  }
  if (bars.length > 10_000) throw new ValidatedCycleError("capacity");
  // Canonical history may fill a previously missing volume. Replay must still
  // use the account's frozen inputs, including volume-sensitive indicators.
  return { series: { ...series, bars: [...preserved, ...bars.slice(preserved.length)] }, firstChangedTime };
}

function compatibleCycleReport(
  previous: ValidatedCycleStrategy | undefined,
  series: MarketSeries,
  snapshots: StrategyCycleSelectionSnapshot[],
  startTime: string,
  settings: ValidatedCycleSettings,
): StrategyCycleRollingReport | undefined {
  if (previous?.report.checkpoint?.version !== 1 || previous.startTime !== startTime ||
    previous.series.priceAdjustment !== series.priceAdjustment ||
    JSON.stringify(previous.settings) !== JSON.stringify(settings)) return undefined;

  const changedBar = previous.series.bars.findIndex((bar, index) =>
    JSON.stringify(bar) !== JSON.stringify(series.bars[index]));
  const changedSnapshot = previous.snapshots.findIndex((snapshot, index) =>
    JSON.stringify(snapshot) !== JSON.stringify(snapshots[index]));
  const stableBars = changedBar < 0 ? previous.series.bars.length : changedBar;
  const stableSnapshots = changedSnapshot < 0 ? previous.snapshots.length : changedSnapshot;
  const stableThrough = series.bars[stableBars - 1]?.time;
  if (!stableThrough) return undefined;
  const report = previous.report;
  const matches = (time: string, decisionCount: number) =>
    time <= stableThrough && decisionCount <= stableSnapshots &&
    (!snapshots[decisionCount] || snapshots[decisionCount]!.decisionTime > time);
  if (matches(report.evaluationEndTime, report.decisionCount)) return report;
  const earlier = report.priorCloses?.findLast((close) =>
    close.checkpoint.version === 1 && matches(close.time, close.decisionCount));
  if (!earlier) return undefined;
  return {
    ...report,
    evaluationEndTime: earlier.time,
    decisionCount: earlier.decisionCount,
    conflictCount: earlier.conflictCount,
    rebalances: report.rebalances.slice(0, earlier.rebalanceCount),
    checkpoint: earlier.checkpoint,
    priorCloses: report.priorCloses?.filter((close) => close.time < earlier.time),
  };
}

function replay(series: MarketSeries, snapshots: StrategyCycleSelectionSnapshot[], startTime: string,
  screeningWindow: number, settings: ValidatedCycleSettings, previous?: ValidatedCycleStrategy): StrategyCycleRollingReport {
  const start = series.bars.findIndex((bar) => bar.time === startTime);
  if (start < 0 || series.bars.length > 10_000 || snapshots.length > 10_000) {
    throw new ValidatedCycleError("capacity");
  }
  return buildStrategyCycleRollingReport(series.bars, snapshots, series.bars.length - start,
    screeningWindow, settings, snapshots.map((snapshot) => snapshot.decisionIndex),
    compatibleCycleReport(previous, series, snapshots, startTime, settings));
}

export function createValidatedCycleStrategy(series: MarketSeries, snapshots: StrategyCycleSelectionSnapshot[],
  sessions: number, window: number, settings: ValidatedCycleSettings, now = new Date(),
  previous?: ValidatedCycleStrategy): ValidatedCycleStrategy {
  const completed = completedNikkeiCycleSeries(series, now);
  if (completed.bars.length !== series.bars.length || series.bars.length > 10_000) {
    throw new ValidatedCycleError("history");
  }
  const selected = snapshots.filter((snapshot) => snapshot.screeningWindow === window)
    .sort((left, right) => left.decisionIndex - right.decisionIndex);
  const startTime = series.bars[series.bars.length - sessions]?.time ?? "";
  const report = buildStrategyCycleRollingReport(series.bars, selected, sessions, window, settings, undefined,
    compatibleCycleReport(previous, series, selected, startTime, settings));
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
    report: replay(series, snapshots, profile.startTime, profile.screeningWindow, profile.settings, profile),
    updatedAt: now.toISOString() };
}

export function mergeValidatedCycleRepair(
  previous: ValidatedCycleStrategy, repaired: ValidatedCycleStrategy, allowRecentCorrections = false,
): ValidatedCycleStrategy {
  if (previous.key !== repaired.key) throw new ValidatedCycleError("history");
  const lastTime = previous.series.bars.at(-1)!.time;
  const repairedLastTime = repaired.series.bars.at(-1)!.time;
  if (repairedLastTime < lastTime || (!allowRecentCorrections && repairedLastTime === lastTime)) return previous;
  const { series, firstChangedTime } = alignCycleHistory(previous, repaired.series, allowRecentCorrections);
  if (!firstChangedTime && repairedLastTime === lastTime) return previous;
  const affected = (time: string) => firstChangedTime ? time >= firstChangedTime : time > lastTime;
  const positions = new Map(series.bars.map((bar, index) => [bar.time, index]));
  const replacementDates = new Set(repaired.snapshots.map((snapshot) => snapshot.decisionTime));
  const missing = series.bars.filter((bar) => bar.time >= previous.startTime && affected(bar.time) &&
    (bar.time < repaired.startTime ||
      ((bar.time === previous.startTime || shouldScreenStrategyCycleAtIndex(series.bars, positions.get(bar.time)!)) &&
        !replacementDates.has(bar.time))));
  if (missing.length) throw new ValidatedCycleError("gap", missing.map((bar) => bar.time));
  const additions = repaired.snapshots.filter((snapshot) =>
    snapshot.decisionTime >= previous.startTime && affected(snapshot.decisionTime))
    .map((snapshot) => ({ ...snapshot, decisionIndex: positions.get(snapshot.decisionTime)! }));
  const snapshots = [...previous.snapshots.filter((snapshot) => !affected(snapshot.decisionTime)), ...additions];
  const readyReport = compatibleCycleReport(repaired, series, snapshots, previous.startTime, previous.settings);
  const report = readyReport?.evaluationEndTime === repairedLastTime ? readyReport
    : replay(series, snapshots, previous.startTime, previous.screeningWindow, previous.settings, previous);
  return { ...previous, series, snapshots, pending: null, provenance: "cycle-validation-repair",
    report, updatedAt: repaired.updatedAt };
}
