import type {
  MarketBar,
  MarketInterval,
} from "@/lib/market/types";
import {
  runBacktest,
  type BacktestPerformance,
  type BacktestResult,
  type BacktestSettings,
} from "./backtest";
import {
  compareScreeningResults,
  yieldForScreening,
  type ScreeningObjective,
} from "./screening";
import {
  optimizeStrategyCombinations,
  runStrategyCombinationBacktest,
  type CombinationOptimizationResult,
  type CombinationScreeningProgress,
  type OptimizeStrategyCombinationsOptions,
  type StrategyCombinationResult,
} from "./strategy-combinations";

export const SCREENING_VALIDATION_MODES = [
  "sample",
  "range",
  "rolling",
] as const;
export const DEFAULT_SAMPLE_VALIDATION_SESSIONS = 128;
export const DEFAULT_SAMPLE_VALIDATION_PERIODS = [
  { sessions: DEFAULT_SAMPLE_VALIDATION_SESSIONS, weight: 100 },
] as const;
export const DEFAULT_ROLLING_WINDOW_YEARS = 1;

export type ScreeningValidationMode =
  (typeof SCREENING_VALIDATION_MODES)[number];

export interface ScreeningDateWindow {
  startTime: string;
  endTime: string;
}

export interface ScreeningRangeValidationConfig {
  mode: "range";
  range: ScreeningDateWindow;
}

export interface ScreeningSamplePeriodConfig {
  sessions: number;
  weight: number;
}

export interface ScreeningSampleValidationConfig {
  mode: "sample";
  periods: readonly ScreeningSamplePeriodConfig[];
}

export interface ScreeningRollingValidationConfig {
  mode: "rolling";
  range: ScreeningDateWindow;
  windowYears: number;
}

export type ScreeningValidationConfig =
  | ScreeningSampleValidationConfig
  | ScreeningRangeValidationConfig
  | ScreeningRollingValidationConfig;

export type ScreeningValidationErrorCode =
  | "invalid-sample-periods"
  | "insufficient-sample-data"
  | "invalid-range-order"
  | "insufficient-range-data"
  | "insufficient-rolling-data";

export class ScreeningValidationError extends Error {
  constructor(public readonly code: ScreeningValidationErrorCode) {
    super(code);
    this.name = "ScreeningValidationError";
  }
}

export interface ScreeningResultValidationEvidence {
  mode: ScreeningValidationMode;
  rankingWindow: ScreeningDateWindow;
  evaluationWindow: ScreeningDateWindow;
  rankingPerformance: BacktestPerformance;
  rankingResult: BacktestResult | StrategyCombinationResult;
  foldIndex: number;
  foldCount: number;
  selectionScore?: number;
  samplePeriods?: ScreeningSamplePeriodEvidence[];
}

export type ScreeningSingleResult = BacktestResult & {
  screeningValidation?: ScreeningResultValidationEvidence;
};

export type ScreeningCombinationResult = StrategyCombinationResult & {
  screeningValidation?: ScreeningResultValidationEvidence;
};

export interface ScreeningCandidateReference {
  kind: "single" | "combination";
  strategyAId: BacktestResult["strategyId"];
  strategyBId: BacktestResult["strategyId"] | null;
}

export interface ScreeningValidationFoldReport {
  window: ScreeningDateWindow;
  partial: boolean;
  performance: BacktestPerformance;
  rankScore: number;
}

export interface ScreeningRangeValidationReport {
  mode: "range";
  range: ScreeningDateWindow;
  selected: ScreeningCandidateReference;
  performance: BacktestPerformance;
}

export interface ScreeningSampleValidationReport {
  mode: "sample";
  window: ScreeningDateWindow;
  periods: ScreeningSamplePeriodEvidence[];
  selected: ScreeningCandidateReference;
  selectionScore: number;
  performance: BacktestPerformance;
}

export interface ScreeningSamplePeriodEvidence {
  sessions: number;
  weight: number;
  window: ScreeningDateWindow;
  performance: BacktestPerformance;
  rankScore: number;
}

export interface ScreeningRollingValidationReport {
  mode: "rolling";
  range: ScreeningDateWindow;
  windowYears: number;
  selected: ScreeningCandidateReference;
  selectionScore: number;
  folds: ScreeningValidationFoldReport[];
  positiveFoldCount: number;
  averageReturn: number;
  averageSharpe: number;
  worstDrawdown: number;
}

export type ScreeningValidationReport =
  | ScreeningSampleValidationReport
  | ScreeningRangeValidationReport
  | ScreeningRollingValidationReport;

export type ScreeningValidationPhase =
  | "optimization"
  | "selection";

export interface ScreeningValidationProgress {
  mode: ScreeningValidationMode;
  phase: ScreeningValidationPhase;
  foldIndex: number;
  foldCount: number;
  completed: number;
  total: number;
  window: ScreeningDateWindow;
  optimizationProgress?: CombinationScreeningProgress;
}

export interface ScreeningValidationOutcome
  extends Omit<
    CombinationOptimizationResult,
    "singleResults" | "results"
  > {
  singleResults: ScreeningSingleResult[];
  results: ScreeningCombinationResult[];
  validationReport: ScreeningValidationReport | null;
}

export interface RunScreeningWithValidationOptions
  extends Omit<OptimizeStrategyCombinationsOptions, "onProgress"> {
  onProgress?: (progress: CombinationScreeningProgress) => void;
  onValidationProgress?: (
    progress: ScreeningValidationProgress,
  ) => void;
}

export interface ScreeningRollingValidationFold {
  window: ScreeningDateWindow;
  partial: boolean;
}

function datePart(time: string): string {
  return time.slice(0, 10);
}

export interface TradingSessionRange extends ScreeningDateWindow {
  sessions: number;
}

export function resolveTradingSessionRange(
  bars: readonly MarketBar[],
  startTime: string,
  endTime: string,
): TradingSessionRange | null {
  const startDate = datePart(startTime);
  const endDate = datePart(endTime);
  if (!startDate || !endDate || startDate > endDate) return null;
  const selectedBars = bars.filter((bar) => {
    const date = datePart(bar.time);
    return date >= startDate && date <= endDate;
  });
  if (selectedBars.length === 0) return null;
  return {
    startTime: datePart(selectedBars[0].time),
    endTime: datePart(selectedBars.at(-1)!.time),
    sessions: selectedBars.length,
  };
}

export function resolveTrailingTradingSessionRange(
  bars: readonly MarketBar[],
  requestedSessions: number,
  endTime?: string,
): TradingSessionRange | null {
  const sessions = Math.max(1, Math.floor(requestedSessions));
  const endDate = endTime ? datePart(endTime) : "";
  const eligibleBars = endDate
    ? bars.filter((bar) => datePart(bar.time) <= endDate)
    : [...bars];
  if (eligibleBars.length === 0) return null;
  const selectedBars = eligibleBars.slice(-sessions);
  return {
    startTime: datePart(selectedBars[0].time),
    endTime: datePart(selectedBars.at(-1)!.time),
    sessions: selectedBars.length,
  };
}

function isValidDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  );
}

function validateRangeWindow(
  bars: readonly MarketBar[],
  config: ScreeningRangeValidationConfig,
): ScreeningDateWindow {
  const dates = [config.range.startTime, config.range.endTime];
  if (
    dates.some((value) => !isValidDate(value)) ||
    config.range.startTime > config.range.endTime
  ) {
    throw new ScreeningValidationError("invalid-range-order");
  }
  const normalized = resolveTradingSessionRange(
    bars,
    config.range.startTime,
    config.range.endTime,
  );
  if (!normalized || normalized.sessions < 3) {
    throw new ScreeningValidationError("insufficient-range-data");
  }
  return {
    startTime: normalized.startTime,
    endTime: normalized.endTime,
  };
}

export interface ScreeningSampleValidationWindows {
  window: ScreeningDateWindow;
  periods: Array<{
    sessions: number;
    weight: number;
    evaluation: ScreeningDateWindow;
  }>;
}

export function buildSampleValidationWindows(
  bars: readonly MarketBar[],
  selectedRange: Pick<BacktestSettings, "startTime" | "endTime">,
  requestedPeriods: readonly ScreeningSamplePeriodConfig[],
): ScreeningSampleValidationWindows {
  const periods = requestedPeriods.map((period) => ({
    sessions: Math.floor(period.sessions),
    weight: period.weight,
  }));
  const validPeriods =
    periods.length === 1 &&
    periods.every(
      (period) =>
        Number.isFinite(period.sessions) &&
        period.sessions >= 3 &&
        Number.isFinite(period.weight) &&
        period.weight > 0,
    );
  if (!validPeriods) {
    throw new ScreeningValidationError("invalid-sample-periods");
  }
  const totalWeight = periods.reduce(
    (sum, period) => sum + period.weight,
    0,
  );
  const startTime = selectedRange.startTime
    ? datePart(selectedRange.startTime)
    : "";
  const endTime = selectedRange.endTime
    ? datePart(selectedRange.endTime)
    : "";
  const selectedBars = bars.filter((bar) => {
    const date = datePart(bar.time);
    return (
      (!startTime || date >= startTime) &&
      (!endTime || date <= endTime)
    );
  });
  const period = periods[0];
  if (selectedBars.length < period.sessions) {
    throw new ScreeningValidationError("insufficient-sample-data");
  }
  const evaluationBars = selectedBars.slice(-period.sessions);
  const window = {
    startTime: datePart(evaluationBars[0].time),
    endTime: datePart(evaluationBars.at(-1)!.time),
  };

  return {
    window,
    periods: [
      {
        sessions: period.sessions,
        weight: period.weight / totalWeight,
        evaluation: window,
      },
    ],
  };
}

export function buildRollingValidationFolds(
  bars: readonly MarketBar[],
  requestedRange: ScreeningDateWindow,
  requestedWindowYears: number,
): ScreeningRollingValidationFold[] {
  if (bars.length < 3) return [];
  if (
    !isValidDate(requestedRange.startTime) ||
    !isValidDate(requestedRange.endTime) ||
    requestedRange.startTime > requestedRange.endTime
  ) {
    return [];
  }
  const normalizedRange = resolveTradingSessionRange(
    bars,
    requestedRange.startTime,
    requestedRange.endTime,
  );
  if (!normalizedRange || normalizedRange.sessions < 3) return [];
  const windowYears = Math.max(
    1,
    Math.floor(requestedWindowYears),
  );
  const firstDate = normalizedRange.startTime;
  const latestDate = normalizedRange.endTime;
  const firstYear = Number(firstDate.slice(0, 4));
  const latestYear = Number(latestDate.slice(0, 4));
  const folds: ScreeningRollingValidationFold[] = [];
  const firstWindowEndYear = Math.min(
    firstYear + windowYears - 1,
    latestYear,
  );

  for (
    let windowEndYear = firstWindowEndYear;
    windowEndYear <= latestYear;
    windowEndYear += 1
  ) {
    const windowStartYear = Math.max(
      firstYear,
      windowEndYear - windowYears + 1,
    );
    const calendarWindow: ScreeningDateWindow = {
      startTime: `${windowStartYear}-01-01`,
      endTime: `${windowEndYear}-12-31`,
    };
    const requestedWindow: ScreeningDateWindow = {
      startTime:
        calendarWindow.startTime < firstDate
          ? firstDate
          : calendarWindow.startTime,
      endTime:
        calendarWindow.endTime > latestDate
          ? latestDate
          : calendarWindow.endTime,
    };
    const normalizedWindow = resolveTradingSessionRange(
      bars,
      requestedWindow.startTime,
      requestedWindow.endTime,
    );
    if (!normalizedWindow || normalizedWindow.sessions < 3) continue;
    folds.push({
      window: {
        startTime: normalizedWindow.startTime,
        endTime: normalizedWindow.endTime,
      },
      partial:
        requestedWindow.startTime !== calendarWindow.startTime ||
        requestedWindow.endTime !== calendarWindow.endTime,
    });
  }

  return folds;
}

function withWindow(
  settings: Omit<BacktestSettings, "interval"> & {
    interval: MarketInterval;
  },
  window: ScreeningDateWindow,
) {
  return {
    ...settings,
    startTime: window.startTime,
    endTime: window.endTime,
  };
}

function stableParameters(
  parameters: Record<string, number>,
): string {
  return Object.entries(parameters)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${value}`)
    .join(",");
}

function singleKey(result: BacktestResult): string {
  return `single:${result.strategyId}:${stableParameters(result.parameters)}`;
}

function combinationKey(result: StrategyCombinationResult): string {
  return [
    "combination",
    result.strategyAId,
    stableParameters(result.strategyAParameters),
    result.strategyBId,
    stableParameters(result.strategyBParameters),
    result.strategyAAllocation,
    result.strategyBAllocation,
  ].join(":");
}

function candidateReference(
  result: BacktestResult | StrategyCombinationResult,
): ScreeningCandidateReference {
  if ("strategyAId" in result) {
    return {
      kind: "combination",
      strategyAId: result.strategyAId,
      strategyBId: result.strategyBId,
    };
  }
  return {
    kind: "single",
    strategyAId: result.strategyId,
    strategyBId: null,
  };
}

function bestCandidate(
  singleResults: readonly BacktestResult[],
  combinationResults: readonly StrategyCombinationResult[],
  objective: ScreeningObjective,
):
  | {
      key: string;
      result: BacktestResult | StrategyCombinationResult;
    }
  | null {
  const candidates = [
    ...singleResults.map((result) => ({
      key: singleKey(result),
      result,
    })),
    ...combinationResults.map((result) => ({
      key: combinationKey(result),
      result,
    })),
  ].sort((left, right) =>
    compareScreeningResults(left.result, right.result, objective),
  );
  return candidates[0] ?? null;
}

async function evaluateFrozenCandidates(
  bars: MarketBar[],
  settings: Omit<BacktestSettings, "interval"> & {
    interval: MarketInterval;
  },
  singleResults: readonly BacktestResult[],
  combinationResults: readonly StrategyCombinationResult[],
  evidence: Omit<
    ScreeningResultValidationEvidence,
    "rankingPerformance" | "rankingResult"
  >,
  signal: AbortSignal | undefined,
  onProgress: (completed: number, total: number) => void,
  freezeRelativeRoles = true,
): Promise<{
  singleResults: ScreeningSingleResult[];
  combinationResults: ScreeningCombinationResult[];
  evaluatedCount: number;
  failedCount: number;
  cancelled: boolean;
}> {
  const total = singleResults.length + combinationResults.length;
  const evaluatedSingles: ScreeningSingleResult[] = [];
  const evaluatedCombinations: ScreeningCombinationResult[] = [];
  let completed = 0;
  let failedCount = 0;

  for (const result of singleResults) {
    if (signal?.aborted) break;
    try {
      evaluatedSingles.push({
        ...runBacktest(
          bars,
          result.strategyId,
          result.parameters,
          {
            ...settings,
            entryFilter: result.entryFilter ?? null,
            entryFilterAllowed: undefined,
          },
        ),
        screeningValidation: {
          ...evidence,
          rankingPerformance: result,
          rankingResult: result,
        },
      });
    } catch {
      failedCount += 1;
    }
    completed += 1;
    onProgress(completed, total);
    if (completed % 8 === 0) await yieldForScreening();
  }

  for (const result of combinationResults) {
    if (signal?.aborted) break;
    try {
      evaluatedCombinations.push({
        ...runStrategyCombinationBacktest(
          bars,
          result,
          {
            ...settings,
            entryFilter: result.entryFilter ?? null,
            entryFilterAllowed: undefined,
          },
          freezeRelativeRoles
            ? result.relativeLongStrategy
            : undefined,
        ),
        screeningValidation: {
          ...evidence,
          rankingPerformance: result,
          rankingResult: result,
        },
      });
    } catch {
      failedCount += 1;
    }
    completed += 1;
    onProgress(completed, total);
    if (completed % 8 === 0) await yieldForScreening();
  }

  return {
    singleResults: evaluatedSingles,
    combinationResults: evaluatedCombinations,
    evaluatedCount: completed,
    failedCount,
    cancelled: Boolean(signal?.aborted),
  };
}

function findEvaluatedCandidate(
  key: string,
  singleResults: readonly ScreeningSingleResult[],
  combinationResults: readonly ScreeningCombinationResult[],
): ScreeningSingleResult | ScreeningCombinationResult | null {
  return (
    singleResults.find((result) => singleKey(result) === key) ??
    combinationResults.find(
      (result) => combinationKey(result) === key,
    ) ??
    null
  );
}

function candidateKey(
  result: BacktestResult | StrategyCombinationResult,
): string {
  return "strategyAId" in result
    ? combinationKey(result)
    : singleKey(result);
}

function normalizedRankScores(
  singleResults: readonly ScreeningSingleResult[],
  combinationResults: readonly ScreeningCombinationResult[],
  objective: ScreeningObjective,
): Map<string, number> {
  const ranked = [
    ...singleResults,
    ...combinationResults,
  ].sort((left, right) => {
    const comparison = compareScreeningResults(
      left,
      right,
      objective,
    );
    return comparison !== 0
      ? comparison
      : candidateKey(left).localeCompare(candidateKey(right));
  });
  const scores = new Map<string, number>();
  let tiedRank = 0;
  for (let index = 0; index < ranked.length; index += 1) {
    if (
      index === 0 ||
      compareScreeningResults(
        ranked[index - 1],
        ranked[index],
        objective,
      ) !== 0
    ) {
      tiedRank = index;
    }
    scores.set(
      candidateKey(ranked[index]),
      ranked.length <= 1
        ? 100
        : ((ranked.length - 1 - tiedRank) /
            (ranked.length - 1)) *
          100,
    );
  }
  return scores;
}

async function runSampleValidation(
  bars: MarketBar[],
  settings: Omit<BacktestSettings, "interval"> & {
    interval: MarketInterval;
  },
  config: ScreeningSampleValidationConfig,
  options: RunScreeningWithValidationOptions,
): Promise<ScreeningValidationOutcome> {
  const windows = buildSampleValidationWindows(
    bars,
    settings,
    config.periods,
  );
  const objective = options.objective ?? "balanced";
  const window = windows.window;
  const optimization = await optimizeStrategyCombinations(
    bars,
    withWindow(settings, window),
    {
      ...options,
      onProgress: (progress) => {
        options.onProgress?.(progress);
        options.onValidationProgress?.({
          mode: "sample",
          phase: "optimization",
          foldIndex: 0,
          foldCount: windows.periods.length,
          completed: progress.completed,
          total: progress.total,
          window,
          optimizationProgress: progress,
        });
      },
    },
  );
  if (optimization.cancelled) {
    return {
      ...optimization,
      validationReport: null,
    };
  }

  const rankScores = normalizedRankScores(
    optimization.singleResults,
    optimization.results,
    objective,
  );
  const singleResults = optimization.singleResults.map((result) => {
    const selectionScore = rankScores.get(candidateKey(result)) ?? 0;
    const periods: ScreeningSamplePeriodEvidence[] =
      windows.periods.map((period) => ({
        sessions: period.sessions,
        weight: period.weight,
        window: period.evaluation,
        performance: result,
        rankScore: selectionScore,
      }));
    return {
      ...result,
      screeningValidation: {
        mode: "sample" as const,
        rankingWindow: window,
        evaluationWindow: window,
        rankingPerformance: result,
        rankingResult: result,
        foldIndex: 0,
        foldCount: 1,
        selectionScore,
        samplePeriods: periods,
      },
    };
  });
  const combinationResults = optimization.results.map((result) => {
    const selectionScore = rankScores.get(candidateKey(result)) ?? 0;
    const periods: ScreeningSamplePeriodEvidence[] =
      windows.periods.map((period) => ({
        sessions: period.sessions,
        weight: period.weight,
        window: period.evaluation,
        performance: result,
        rankScore: selectionScore,
      }));
    return {
      ...result,
      screeningValidation: {
        mode: "sample" as const,
        rankingWindow: window,
        evaluationWindow: window,
        rankingPerformance: result,
        rankingResult: result,
        foldIndex: 0,
        foldCount: 1,
        selectionScore,
        samplePeriods: periods,
      },
    };
  });
  const compareSelectionScores = (
    left: ScreeningSingleResult | ScreeningCombinationResult,
    right: ScreeningSingleResult | ScreeningCombinationResult,
  ) => {
    const scoreDifference =
      (right.screeningValidation?.selectionScore ?? 0) -
      (left.screeningValidation?.selectionScore ?? 0);
    return Math.abs(scoreDifference) > 1e-12
      ? scoreDifference
      : compareScreeningResults(left, right, objective);
  };
  singleResults.sort(compareSelectionScores);
  combinationResults.sort(compareSelectionScores);
  const selected = [...singleResults, ...combinationResults].sort(
    compareSelectionScores,
  )[0];
  const report =
    selected?.screeningValidation?.samplePeriods &&
    selected.screeningValidation.selectionScore !== undefined
      ? {
          mode: "sample" as const,
          window,
          periods: selected.screeningValidation.samplePeriods,
          selected: candidateReference(selected),
          selectionScore:
            selected.screeningValidation.selectionScore,
          performance: selected,
        }
      : null;

  return {
    singleResults,
    results: combinationResults,
    evaluatedCount: optimization.evaluatedCount,
    totalCandidates: optimization.totalCandidates,
    failedCount: optimization.failedCount,
    cancelled: false,
    validationReport: report,
  };
}

async function runRangeValidation(
  bars: MarketBar[],
  settings: Omit<BacktestSettings, "interval"> & {
    interval: MarketInterval;
  },
  config: ScreeningRangeValidationConfig,
  options: RunScreeningWithValidationOptions,
): Promise<ScreeningValidationOutcome> {
  const range = validateRangeWindow(bars, config);
  const objective = options.objective ?? "balanced";
  const optimization = await optimizeStrategyCombinations(
    bars,
    withWindow(settings, range),
    {
      ...options,
      onProgress: (progress) => {
        options.onProgress?.(progress);
        options.onValidationProgress?.({
          mode: "range",
          phase: "optimization",
          foldIndex: 0,
          foldCount: 1,
          completed: progress.completed,
          total: progress.total,
          window: range,
          optimizationProgress: progress,
        });
      },
    },
  );
  if (optimization.cancelled) {
    return {
      ...optimization,
      validationReport: null,
    };
  }
  const selectionSingles: ScreeningSingleResult[] =
    optimization.singleResults.map((result) => ({
      ...result,
      screeningValidation: {
        mode: "range",
        rankingWindow: range,
        evaluationWindow: range,
        rankingPerformance: result,
        rankingResult: result,
        foldIndex: 0,
        foldCount: 1,
      },
    }));
  const selectionCombinations: ScreeningCombinationResult[] =
    optimization.results.map((result) => ({
      ...result,
      screeningValidation: {
        mode: "range",
        rankingWindow: range,
        evaluationWindow: range,
        rankingPerformance: result,
        rankingResult: result,
        foldIndex: 0,
        foldCount: 1,
      },
    }));
  const selected = bestCandidate(
    selectionSingles,
    selectionCombinations,
    objective,
  );
  const report =
    selected
      ? {
          mode: "range" as const,
          range,
          selected: candidateReference(selected.result),
          performance: selected.result,
        }
      : null;

  return {
    singleResults: selectionSingles,
    results: selectionCombinations,
    evaluatedCount: optimization.evaluatedCount,
    totalCandidates: optimization.totalCandidates,
    failedCount: optimization.failedCount,
    cancelled: false,
    validationReport: report,
  };
}

async function runRollingValidation(
  bars: MarketBar[],
  settings: Omit<BacktestSettings, "interval"> & {
    interval: MarketInterval;
  },
  config: ScreeningRollingValidationConfig,
  options: RunScreeningWithValidationOptions,
): Promise<ScreeningValidationOutcome> {
  if (
    !isValidDate(config.range.startTime) ||
    !isValidDate(config.range.endTime) ||
    config.range.startTime > config.range.endTime
  ) {
    throw new ScreeningValidationError("invalid-range-order");
  }
  const normalizedRange = resolveTradingSessionRange(
    bars,
    config.range.startTime,
    config.range.endTime,
  );
  if (!normalizedRange || normalizedRange.sessions < 3) {
    throw new ScreeningValidationError("insufficient-rolling-data");
  }
  const range = {
    startTime: normalizedRange.startTime,
    endTime: normalizedRange.endTime,
  };
  const windowYears = Math.max(1, Math.floor(config.windowYears));
  const folds = buildRollingValidationFolds(
    bars,
    range,
    windowYears,
  );
  if (folds.length === 0) {
    throw new ScreeningValidationError("insufficient-rolling-data");
  }
  const objective = options.objective ?? "balanced";
  const optimization = await optimizeStrategyCombinations(
    bars,
    withWindow(settings, range),
    {
      ...options,
      onProgress: (progress) => {
        options.onProgress?.(progress);
        options.onValidationProgress?.({
          mode: "rolling",
          phase: "optimization",
          foldIndex: 0,
          foldCount: folds.length,
          completed: progress.completed,
          total: progress.total,
          window: range,
          optimizationProgress: progress,
        });
      },
    },
  );
  if (optimization.cancelled) {
    return {
      ...optimization,
      validationReport: null,
    };
  }
  const evaluations: Array<{
    fold: ScreeningRollingValidationFold;
    singleResults: ScreeningSingleResult[];
    combinationResults: ScreeningCombinationResult[];
    rankScores: Map<string, number>;
  }> = [];
  let evaluatedCount = optimization.evaluatedCount;
  let failedCount = optimization.failedCount;
  const evaluationCandidateCount =
    optimization.singleResults.length + optimization.results.length;

  for (let foldIndex = 0; foldIndex < folds.length; foldIndex += 1) {
    const fold = folds[foldIndex];
    const evaluation = await evaluateFrozenCandidates(
      bars,
      withWindow(settings, fold.window),
      optimization.singleResults,
      optimization.results,
      {
        mode: "rolling",
        rankingWindow: range,
        evaluationWindow: fold.window,
        foldIndex,
        foldCount: folds.length,
      },
      options.signal,
      (completed, total) =>
        options.onValidationProgress?.({
          mode: "rolling",
          phase: "selection",
          foldIndex,
          foldCount: folds.length,
          completed,
          total,
          window: fold.window,
        }),
    );
    evaluatedCount += evaluation.evaluatedCount;
    failedCount += evaluation.failedCount;
    if (evaluation.cancelled) {
      return {
        singleResults: evaluation.singleResults,
        results: evaluation.combinationResults,
        evaluatedCount,
        totalCandidates:
          optimization.totalCandidates +
          evaluationCandidateCount * folds.length,
        failedCount,
        cancelled: true,
        validationReport: null,
      };
    }
    evaluations.push({
      fold,
      singleResults: evaluation.singleResults,
      combinationResults: evaluation.combinationResults,
      rankScores: normalizedRankScores(
        evaluation.singleResults,
        evaluation.combinationResults,
        objective,
      ),
    });
  }

  const selectionScoreFor = (
    result: BacktestResult | StrategyCombinationResult,
  ): number | null => {
    const key = candidateKey(result);
    const scores = evaluations.map((evaluation) =>
      evaluation.rankScores.get(key),
    );
    let total = 0;
    for (const score of scores) {
      if (score === undefined) return null;
      total += score;
    }
    return total / scores.length;
  };
  const singleResults: ScreeningSingleResult[] =
    optimization.singleResults
      .map((result) => {
        const selectionScore = selectionScoreFor(result);
        return selectionScore === null
          ? null
          : {
              ...result,
              screeningValidation: {
                mode: "rolling" as const,
                rankingWindow: range,
                evaluationWindow: range,
                rankingPerformance: result,
                rankingResult: result,
                foldIndex: 0,
                foldCount: folds.length,
                selectionScore,
              },
            };
      })
      .filter((result) => result !== null);
  const combinationResults: ScreeningCombinationResult[] =
    optimization.results
      .map((result) => {
        const selectionScore = selectionScoreFor(result);
        return selectionScore === null
          ? null
          : {
              ...result,
              screeningValidation: {
                mode: "rolling" as const,
                rankingWindow: range,
                evaluationWindow: range,
                rankingPerformance: result,
                rankingResult: result,
                foldIndex: 0,
                foldCount: folds.length,
                selectionScore,
              },
            };
      })
      .filter((result) => result !== null);
  const compareRollingScores = (
    left: ScreeningSingleResult | ScreeningCombinationResult,
    right: ScreeningSingleResult | ScreeningCombinationResult,
  ) => {
    const difference =
      (right.screeningValidation?.selectionScore ?? 0) -
      (left.screeningValidation?.selectionScore ?? 0);
    return Math.abs(difference) > 1e-12
      ? difference
      : compareScreeningResults(left, right, objective);
  };
  singleResults.sort(compareRollingScores);
  combinationResults.sort(compareRollingScores);
  const selected = [...singleResults, ...combinationResults].sort(
    compareRollingScores,
  )[0];
  const reports: ScreeningValidationFoldReport[] = selected
    ? evaluations
        .map((evaluation) => {
          const key = candidateKey(selected);
          const performance = findEvaluatedCandidate(
            key,
            evaluation.singleResults,
            evaluation.combinationResults,
          );
          const rankScore = evaluation.rankScores.get(key);
          return performance && rankScore !== undefined
            ? {
                window: evaluation.fold.window,
                partial: evaluation.fold.partial,
                performance,
                rankScore,
              }
            : null;
        })
        .filter((report) => report !== null)
    : [];
  const report =
    selected && reports.length === folds.length
      ? {
          mode: "rolling" as const,
          range,
          windowYears,
          selected: candidateReference(selected),
          selectionScore:
            selected.screeningValidation?.selectionScore ?? 0,
          folds: reports,
          positiveFoldCount: reports.filter(
            ({ performance }) => performance.totalReturn > 0,
          ).length,
          averageReturn:
            reports.reduce(
              (sum, { performance }) =>
                sum + performance.totalReturn,
              0,
            ) / reports.length,
          averageSharpe:
            reports.reduce(
              (sum, { performance }) => sum + performance.sharpe,
              0,
            ) / reports.length,
          worstDrawdown: Math.min(
            ...reports.map(
              ({ performance }) => performance.maxDrawdown,
            ),
          ),
        }
      : null;

  return {
    singleResults,
    results: combinationResults,
    evaluatedCount,
    totalCandidates:
      optimization.totalCandidates +
      evaluationCandidateCount * folds.length,
    failedCount,
    cancelled: false,
    validationReport: report,
  };
}

export async function runScreeningWithValidation(
  bars: MarketBar[],
  settings: Omit<BacktestSettings, "interval"> & {
    interval: MarketInterval;
  },
  config: ScreeningValidationConfig,
  options: RunScreeningWithValidationOptions = {},
): Promise<ScreeningValidationOutcome> {
  if (config.mode === "sample") {
    return runSampleValidation(bars, settings, config, options);
  }
  if (config.mode === "range") {
    return runRangeValidation(bars, settings, config, options);
  }
  if (config.mode === "rolling") {
    return runRollingValidation(bars, settings, config, options);
  }
  throw new Error("Unsupported screening validation mode");
}
