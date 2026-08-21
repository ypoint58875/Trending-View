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
  ROLLING_SINGLE_FINALISTS_PER_STRATEGY,
  STRATEGY_SLOTS,
  runStrategyCombinationBacktest,
  type CombinationOptimizationResult,
  type CombinationScreeningProgress,
  type OptimizeStrategyCombinationsOptions,
  type StrategyCombinationResult,
} from "./strategy-combinations";
import { hasIntradayScreeningEvidence } from "./intraday";

export const SCREENING_VALIDATION_MODES = [
  "sample",
  "range",
  "multi-range",
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

export interface ScreeningMultiRangeValidationConfig {
  mode: "multi-range";
  ranges: readonly ScreeningDateWindow[];
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
  | ScreeningMultiRangeValidationConfig
  | ScreeningRollingValidationConfig;

export type ScreeningValidationErrorCode =
  | "invalid-sample-periods"
  | "insufficient-sample-data"
  | "invalid-range-order"
  | "invalid-multi-range"
  | "insufficient-range-data"
  | "insufficient-rolling-data"
  | "insufficient-intraday-sessions";

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
  strategyCId?: BacktestResult["strategyId"] | null;
  strategyDId?: BacktestResult["strategyId"] | null;
  strategyEId?: BacktestResult["strategyId"] | null;
  strategyFId?: BacktestResult["strategyId"] | null;
  strategyGId?: BacktestResult["strategyId"] | null;
  strategyHId?: BacktestResult["strategyId"] | null;
  strategyIId?: BacktestResult["strategyId"] | null;
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

export interface ScreeningMultiRangeValidationReport {
  mode: "multi-range";
  ranges: ScreeningDateWindow[];
  selected: ScreeningCandidateReference;
  selectionScore: number;
  folds: ScreeningValidationFoldReport[];
  positiveFoldCount: number;
  averageReturn: number;
  averageSharpe: number;
  worstDrawdown: number;
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
  | ScreeningMultiRangeValidationReport
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

const SCREENING_OPTIMIZATION_STAGES = [
  "strategies",
  "entryFilters",
  "pairs",
  "allocations",
  "triples",
  "tripleAllocations",
  "quadruples",
  "quadrupleAllocations",
  "quintuples",
  "quintupleAllocations",
  "sextuples",
  "sextupleAllocations",
  "septuples",
  "septupleAllocations",
  "octuples",
  "octupleAllocations",
  "nonuples",
  "nonupleAllocations",
] as const satisfies readonly CombinationScreeningProgress["stage"][];

export interface ScreeningProgressBarState {
  value: number;
  maximum: number;
}

function progressFraction(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(Math.max(completed / total, 0), 1);
}

export function resolveScreeningProgressBarState(
  progress: Pick<
    CombinationScreeningProgress,
    "stage" | "stageCompleted" | "stageTotal"
  >,
  validationProgress: ScreeningValidationProgress | null,
): ScreeningProgressBarState {
  const optimizationProgress =
    validationProgress?.phase === "optimization"
      ? (validationProgress.optimizationProgress ?? progress)
      : progress;
  const stageIndex = SCREENING_OPTIMIZATION_STAGES.indexOf(
    optimizationProgress.stage,
  );
  const stageValue =
    stageIndex +
    (optimizationProgress.stageTotal > 0
      ? progressFraction(
          optimizationProgress.stageCompleted,
          optimizationProgress.stageTotal,
        )
      : stageIndex > 0
        ? 1
        : 0);
  const selectionWindowCount =
    validationProgress?.mode === "rolling" ||
    validationProgress?.mode === "multi-range"
      ? Math.max(validationProgress.foldCount, 0)
      : 0;
  const maximum =
    SCREENING_OPTIMIZATION_STAGES.length + selectionWindowCount;

  if (!validationProgress || validationProgress.phase === "optimization") {
    return {
      value: Math.min(Math.max(stageValue, 0), maximum),
      maximum,
    };
  }

  if (
    (validationProgress.mode !== "rolling" &&
      validationProgress.mode !== "multi-range") ||
    selectionWindowCount === 0
  ) {
    return {
      value: maximum,
      maximum,
    };
  }

  const foldIndex = Math.min(
    Math.max(validationProgress.foldIndex, 0),
    selectionWindowCount - 1,
  );
  const value =
    SCREENING_OPTIMIZATION_STAGES.length +
    foldIndex +
    progressFraction(
      validationProgress.completed,
      validationProgress.total,
    );

  return {
    value: Math.min(Math.max(value, 0), maximum),
    maximum,
  };
}

export interface ScreeningValidationOutcome
  extends Omit<
    CombinationOptimizationResult,
    "singleResults" | "results" | "singleCandidatePool"
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

function normalizedTime(time: string): string {
  return time.replace("T", " ");
}

function rangeStart(time: string): string {
  return normalizedTime(time);
}

function rangeEnd(time: string): string {
  return time.length === 10 ? `${time} 23:59` : normalizedTime(time);
}

export interface TradingSessionRange extends ScreeningDateWindow {
  sessions: number;
}

export function resolveTradingSessionRange(
  bars: readonly MarketBar[],
  startTime: string,
  endTime: string,
): TradingSessionRange | null {
  const start = rangeStart(startTime);
  const end = rangeEnd(endTime);
  if (!start || !end || start > end) return null;
  const selectedBars = bars.filter((bar) => {
    const time = normalizedTime(bar.time);
    return time >= start && time <= end;
  });
  if (selectedBars.length === 0) return null;
  return {
    startTime: selectedBars[0].time,
    endTime: selectedBars.at(-1)!.time,
    sessions: selectedBars.length,
  };
}

export function resolveTrailingTradingSessionRange(
  bars: readonly MarketBar[],
  requestedSessions: number,
  endTime?: string,
): TradingSessionRange | null {
  const sessions = Math.max(1, Math.floor(requestedSessions));
  const end = endTime ? rangeEnd(endTime) : "";
  const eligibleBars = end
    ? bars.filter((bar) => normalizedTime(bar.time) <= end)
    : [...bars];
  if (eligibleBars.length === 0) return null;
  const selectedBars = eligibleBars.slice(-sessions);
  return {
    startTime: selectedBars[0].time,
    endTime: selectedBars.at(-1)!.time,
    sessions: selectedBars.length,
  };
}

function isValidRangeTime(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?$/.test(value) &&
    Number.isFinite(
      Date.parse(
        value.length === 10
          ? `${value}T00:00:00Z`
          : `${normalizedTime(value).replace(" ", "T")}:00Z`,
      ),
    )
  );
}

function validateRangeWindow(
  bars: readonly MarketBar[],
  config: ScreeningRangeValidationConfig,
): ScreeningDateWindow {
  const dates = [config.range.startTime, config.range.endTime];
  if (
    dates.some((value) => !isValidRangeTime(value)) ||
    rangeStart(config.range.startTime) > rangeEnd(config.range.endTime)
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
    ? rangeStart(selectedRange.startTime)
    : "";
  const endTime = selectedRange.endTime
    ? rangeEnd(selectedRange.endTime)
    : "";
  const selectedBars = bars.filter((bar) => {
    const time = normalizedTime(bar.time);
    return (
      (!startTime || time >= startTime) &&
      (!endTime || time <= endTime)
    );
  });
  const period = periods[0];
  if (selectedBars.length < period.sessions) {
    throw new ScreeningValidationError("insufficient-sample-data");
  }
  const evaluationBars = selectedBars.slice(-period.sessions);
  const window = {
    startTime: evaluationBars[0].time,
    endTime: evaluationBars.at(-1)!.time,
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
    !isValidRangeTime(requestedRange.startTime) ||
    !isValidRangeTime(requestedRange.endTime) ||
    rangeStart(requestedRange.startTime) > rangeEnd(requestedRange.endTime)
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

function stableEntryFilter(
  filter:
    | BacktestResult["entryFilter"]
    | StrategyCombinationResult["strategyAEntryFilter"],
): string {
  return filter
    ? `${filter.movingAverageType}:${filter.period}:${filter.minimumSlopePercent}`
    : "none";
}

function singleKey(result: BacktestResult): string {
  return [
    "single",
    result.strategyId,
    stableParameters(result.parameters),
    stableEntryFilter(result.entryFilter),
  ].join(":");
}

function combinationKey(result: StrategyCombinationResult): string {
  const record = result as StrategyCombinationResult & Record<string, unknown>;
  return [
    "combination",
    result.strategyAId,
    stableParameters(result.strategyAParameters),
    result.strategyBId,
    stableParameters(result.strategyBParameters),
    result.strategyAAllocation,
    result.strategyBAllocation,
    stableEntryFilter(result.strategyAEntryFilter),
    stableEntryFilter(result.strategyBEntryFilter),
    ...STRATEGY_SLOTS.slice(2).flatMap((slot) => {
      const id = record[`${slot}Id`] as BacktestResult["strategyId"] | undefined;
      const parameters = record[`${slot}Parameters`] as
        | BacktestResult["parameters"]
        | undefined;
      return id && parameters
        ? [
            id,
            stableParameters(parameters),
            (record[`${slot}Allocation`] as number | undefined) ?? 0,
            stableEntryFilter(
              record[`${slot}EntryFilter`] as BacktestResult["entryFilter"],
            ),
          ]
        : [];
    }),
  ].join(":");
}

function candidateReference(
  result: BacktestResult | StrategyCombinationResult,
): ScreeningCandidateReference {
  if ("strategyAId" in result) {
    const record = result as StrategyCombinationResult & Record<string, unknown>;
    return {
      kind: "combination",
      strategyAId: result.strategyAId,
      strategyBId: result.strategyBId,
      ...Object.fromEntries(
        STRATEGY_SLOTS.slice(2).map((slot) => [
          `${slot}Id`,
          record[`${slot}Id`] ?? null,
        ]),
      ),
    } as ScreeningCandidateReference;
  }
  return {
    kind: "single",
    strategyAId: result.strategyId,
    strategyBId: null,
    strategyCId: null,
    strategyDId: null,
    strategyEId: null,
    strategyFId: null,
    strategyGId: null,
    strategyHId: null,
    strategyIId: null,
  };
}

export function validateMultiRangeWindows(
  bars: readonly MarketBar[],
  config: ScreeningMultiRangeValidationConfig,
): ScreeningDateWindow[] {
  if (config.ranges.length < 2) {
    throw new ScreeningValidationError("invalid-multi-range");
  }
  const ranges = config.ranges.map((range) => {
    try {
      return validateRangeWindow(bars, { mode: "range", range });
    } catch {
      throw new ScreeningValidationError("invalid-multi-range");
    }
  });
  const ordered = [...ranges].sort((left, right) =>
    rangeStart(left.startTime).localeCompare(rangeStart(right.startTime)),
  );
  for (let index = 1; index < ordered.length; index += 1) {
    if (
      rangeStart(ordered[index].startTime) <=
      rangeEnd(ordered[index - 1].endTime)
    ) {
      throw new ScreeningValidationError("invalid-multi-range");
    }
  }
  return ranges;
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
            entryFilter: null,
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

async function runMultiRangeValidation(
  bars: MarketBar[],
  settings: Omit<BacktestSettings, "interval"> & {
    interval: MarketInterval;
  },
  config: ScreeningMultiRangeValidationConfig,
  options: RunScreeningWithValidationOptions,
): Promise<ScreeningValidationOutcome> {
  const ranges = validateMultiRangeWindows(bars, config);
  const objective = options.objective ?? "balanced";
  const rankingWindow: ScreeningDateWindow = {
    startTime: ranges.reduce(
      (earliest, range) =>
        rangeStart(range.startTime) < rangeStart(earliest)
          ? range.startTime
          : earliest,
      ranges[0].startTime,
    ),
    endTime: ranges.reduce(
      (latest, range) =>
        rangeEnd(range.endTime) > rangeEnd(latest)
          ? range.endTime
          : latest,
      ranges[0].endTime,
    ),
  };
  const optimization = await optimizeStrategyCombinations(
    bars,
    withWindow(settings, rankingWindow),
    {
      ...options,
      retainedSinglesPerStrategy: ROLLING_SINGLE_FINALISTS_PER_STRATEGY,
      onProgress: (progress) => {
        options.onProgress?.(progress);
        options.onValidationProgress?.({
          mode: "multi-range",
          phase: "optimization",
          foldIndex: 0,
          foldCount: ranges.length,
          completed: progress.completed,
          total: progress.total,
          window: rankingWindow,
          optimizationProgress: progress,
        });
      },
    },
  );
  if (optimization.cancelled) {
    return { ...optimization, validationReport: null };
  }

  const singleCandidatePool =
    optimization.singleCandidatePool.length > 0
      ? optimization.singleCandidatePool
      : optimization.singleResults;
  const candidateCount =
    singleCandidatePool.length + optimization.results.length;
  const evaluations: Array<{
    range: ScreeningDateWindow;
    singleResults: ScreeningSingleResult[];
    combinationResults: ScreeningCombinationResult[];
    rankScores: Map<string, number>;
  }> = [];
  let evaluatedCount = optimization.evaluatedCount;
  let failedCount = optimization.failedCount;

  for (let rangeIndex = 0; rangeIndex < ranges.length; rangeIndex += 1) {
    const range = ranges[rangeIndex];
    const evaluation = await evaluateFrozenCandidates(
      bars,
      withWindow(settings, range),
      singleCandidatePool,
      optimization.results,
      {
        mode: "multi-range",
        rankingWindow,
        evaluationWindow: range,
        foldIndex: rangeIndex,
        foldCount: ranges.length,
      },
      options.signal,
      (completed, total) =>
        options.onValidationProgress?.({
          mode: "multi-range",
          phase: "selection",
          foldIndex: rangeIndex,
          foldCount: ranges.length,
          completed,
          total,
          window: range,
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
          optimization.totalCandidates + candidateCount * ranges.length,
        failedCount,
        cancelled: true,
        validationReport: null,
      };
    }
    evaluations.push({
      range,
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
    if (scores.some((score) => score === undefined)) return null;
    return scores.reduce<number>((sum, score) => sum + (score ?? 0), 0) /
      scores.length;
  };
  const latestEvaluation = evaluations.at(-1)!;
  const singleResults: ScreeningSingleResult[] = [];
  for (const candidate of singleCandidatePool) {
    const selectionScore = selectionScoreFor(candidate);
    const evaluated = latestEvaluation.singleResults.find(
      (result) => singleKey(result) === singleKey(candidate),
    );
    if (selectionScore !== null && evaluated) {
      singleResults.push({
        ...evaluated,
        screeningValidation: {
          ...evaluated.screeningValidation!,
          mode: "multi-range" as const,
          rankingWindow,
          evaluationWindow: latestEvaluation.range,
          foldIndex: 0,
          foldCount: ranges.length,
          selectionScore,
        },
      });
    }
  }
  const combinationResults: ScreeningCombinationResult[] = [];
  for (const candidate of optimization.results) {
    const selectionScore = selectionScoreFor(candidate);
    const evaluated = latestEvaluation.combinationResults.find(
      (result) => combinationKey(result) === combinationKey(candidate),
    );
    if (selectionScore !== null && evaluated) {
      combinationResults.push({
          ...evaluated,
          screeningValidation: {
            ...evaluated.screeningValidation!,
            mode: "multi-range" as const,
            rankingWindow,
            evaluationWindow: latestEvaluation.range,
            foldIndex: 0,
            foldCount: ranges.length,
            selectionScore,
          },
      });
    }
  }
  const compareScores = (
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
  singleResults.sort(compareScores);
  combinationResults.sort(compareScores);
  const bestSingleByStrategy = new Map<
    BacktestResult["strategyId"],
    ScreeningSingleResult
  >();
  singleResults.forEach((result) => {
    const current = bestSingleByStrategy.get(result.strategyId);
    if (!current || compareScores(result, current) < 0) {
      bestSingleByStrategy.set(result.strategyId, result);
    }
  });
  const retainedSingleResults = [...bestSingleByStrategy.values()].sort(
    compareScores,
  );
  const selected = [...retainedSingleResults, ...combinationResults].sort(
    compareScores,
  )[0];
  const folds: ScreeningValidationFoldReport[] = selected
    ? evaluations.map((evaluation) => {
        const key = candidateKey(selected);
        const performance = findEvaluatedCandidate(
          key,
          evaluation.singleResults,
          evaluation.combinationResults,
        )!;
        return {
          window: evaluation.range,
          partial: false,
          performance,
          rankScore: evaluation.rankScores.get(key) ?? 0,
        };
      })
    : [];
  const report =
    selected && folds.length === ranges.length
      ? {
          mode: "multi-range" as const,
          ranges,
          selected: candidateReference(selected),
          selectionScore:
            selected.screeningValidation?.selectionScore ?? 0,
          folds,
          positiveFoldCount: folds.filter(
            (fold) => fold.performance.totalReturn > 0,
          ).length,
          averageReturn:
            folds.reduce(
              (sum, period) => sum + period.performance.totalReturn,
              0,
            ) / folds.length,
          averageSharpe:
            folds.reduce(
              (sum, period) => sum + period.performance.sharpe,
              0,
            ) / folds.length,
          worstDrawdown: Math.min(
            ...folds.map((period) => period.performance.maxDrawdown),
          ),
        }
      : null;

  return {
    singleResults: retainedSingleResults,
    results: combinationResults,
    evaluatedCount,
    totalCandidates:
      optimization.totalCandidates + candidateCount * ranges.length,
    failedCount,
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
    !isValidRangeTime(config.range.startTime) ||
    !isValidRangeTime(config.range.endTime) ||
    rangeStart(config.range.startTime) > rangeEnd(config.range.endTime)
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
      retainedSinglesPerStrategy:
        ROLLING_SINGLE_FINALISTS_PER_STRATEGY,
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
  const rollingSingleCandidatePool =
    optimization.singleCandidatePool.length > 0
      ? optimization.singleCandidatePool
      : optimization.singleResults;
  const evaluationCandidateCount =
    rollingSingleCandidatePool.length + optimization.results.length;

  for (let foldIndex = 0; foldIndex < folds.length; foldIndex += 1) {
    const fold = folds[foldIndex];
    const evaluation = await evaluateFrozenCandidates(
      bars,
      withWindow(settings, fold.window),
      rollingSingleCandidatePool,
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
    rollingSingleCandidatePool
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
  const bestSingleByStrategy = new Map<
    BacktestResult["strategyId"],
    ScreeningSingleResult
  >();
  singleResults.forEach((result) => {
    const current = bestSingleByStrategy.get(result.strategyId);
    if (!current || compareRollingScores(result, current) < 0) {
      bestSingleByStrategy.set(result.strategyId, result);
    }
  });
  const retainedSingleResults = [...bestSingleByStrategy.values()].sort(
    compareRollingScores,
  );
  const selected = [
    ...retainedSingleResults,
    ...combinationResults,
  ].sort(
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
    singleResults: retainedSingleResults,
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
  if (
    settings.interval !== "1d" &&
    !hasIntradayScreeningEvidence(
      bars,
      settings.startTime,
      settings.endTime,
    )
  ) {
    throw new ScreeningValidationError("insufficient-intraday-sessions");
  }
  if (config.mode === "sample") {
    return runSampleValidation(bars, settings, config, options);
  }
  if (config.mode === "range") {
    return runRangeValidation(bars, settings, config, options);
  }
  if (config.mode === "multi-range") {
    return runMultiRangeValidation(bars, settings, config, options);
  }
  if (config.mode === "rolling") {
    return runRollingValidation(bars, settings, config, options);
  }
  throw new Error("Unsupported screening validation mode");
}
