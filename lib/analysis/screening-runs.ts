import {
  compareScreeningResults,
  SCREENING_OBJECTIVES,
  type ScreeningObjective,
} from "./screening";
import {
  SCREENING_VALIDATION_MODES,
  type ScreeningCombinationResult,
  type ScreeningSingleResult,
  type ScreeningValidationConfig,
  type ScreeningValidationOutcome,
} from "./screening-validation";
import {
  cloneMovingAverageSlopeFilter,
  parseMovingAverageSlopeFilter,
  type MovingAverageSlopeFilter,
} from "./entry-filter";
import {
  STRATEGIES,
  type StrategyId,
  type StrategyParameters,
} from "./strategies";
import {
  DEFAULT_TACTICAL_ALLOCATION_MODE,
  resolveTacticalAllocationMode,
  type StrategyAllocationPlan,
  type TacticalAllocationMode,
} from "./strategy-combinations";
import type {
  MarketAssetType,
  MarketDataProvider,
  MarketExchange,
  MarketInstrument,
  MarketInterval,
  MarketPriceAdjustment,
  MarketSeries,
  MarketTemporaryQuote,
} from "@/lib/market/types";
import { MARKET_DATA_PROVIDERS } from "@/lib/market/types";
import { fingerprintMarketSeries } from "@/lib/market/fingerprint";
import { MARKET_EXCHANGES } from "@/lib/market/exchanges";
import { savedBacktestInstrumentKey } from "./saved-backtests";

export const MAX_SCREENING_RUN_HISTORY = 6;
export const MAX_SCREENING_RUN_CANDIDATES = 400;

export interface ScreeningRunMetrics {
  totalReturn: number;
  maxDrawdown: number;
  sharpe: number;
  tradeCount: number;
  score: number;
}

export interface ScreeningRunCandidate {
  rank: number;
  key: string;
  kind: "single" | "combination";
  strategyAId: StrategyId;
  strategyAParameters: StrategyParameters;
  strategyAEntryFilter: MovingAverageSlopeFilter | null;
  strategyBId: StrategyId | null;
  strategyBParameters: StrategyParameters | null;
  strategyBEntryFilter: MovingAverageSlopeFilter | null;
  strategyAAllocation: number;
  strategyBAllocation: number;
  tacticalMode?: TacticalAllocationMode;
  relativeLongStrategy: "strategyA" | "strategyB" | null;
  selectionScore: number | null;
  metrics: ScreeningRunMetrics;
}

export interface ScreeningRunSettings {
  initialCash: number;
  commissionPercent: number;
  slippagePercent: number;
}

export interface ScreeningTemporaryQuoteProvenance {
  provider: MarketDataProvider;
  time: string;
  fetchedAt: string;
}

export interface SaveScreeningRunInput {
  instrument: MarketInstrument;
  instrumentKey: string;
  interval: MarketInterval;
  source: MarketDataProvider;
  priceAdjustment: MarketPriceAdjustment;
  fetchedAt: string;
  lastBarDate: string;
  barCount: number;
  dataFingerprint: string;
  temporaryQuote: ScreeningTemporaryQuoteProvenance | null;
  validationMode: ScreeningValidationConfig["mode"];
  validationConfig: ScreeningValidationConfig;
  objective: ScreeningObjective;
  settings: ScreeningRunSettings;
  candidates: ScreeningRunCandidate[];
  selectedCandidateKey: string | null;
  validationReport: unknown | null;
}

export interface ScreeningRunRecord extends SaveScreeningRunInput {
  id: number;
  createdAt: string;
}

export interface ScreeningRunComparison {
  previousCreatedAt: string;
  winnerChanged: boolean;
  currentWinnerKey: string | null;
  previousWinnerKey: string | null;
  currentWinnerPreviousRank: number | null;
  previousWinnerCurrentRank: number | null;
  topTenOverlap: number;
  totalReturnDelta: number | null;
  sharpeDelta: number | null;
  maxDrawdownDelta: number | null;
}

function stableParameters(parameters: StrategyParameters): string {
  return Object.entries(parameters)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${value}`)
    .join(",");
}

function stableFilter(
  filter: MovingAverageSlopeFilter | null | undefined,
): string {
  return filter
    ? `${filter.movingAverageType}:${filter.period}:${filter.minimumSlopePercent}`
    : "none";
}

export function screeningRunCandidateKey(
  result: ScreeningSingleResult | ScreeningCombinationResult,
): string {
  if ("strategyAId" in result) {
    return [
      "combination",
      result.strategyAId,
      stableParameters(result.strategyAParameters),
      stableFilter(result.strategyAEntryFilter),
      result.strategyBId,
      stableParameters(result.strategyBParameters),
      stableFilter(result.strategyBEntryFilter),
      result.strategyAAllocation,
      result.strategyBAllocation,
      ...(resolveTacticalAllocationMode(result.tacticalMode) ===
      DEFAULT_TACTICAL_ALLOCATION_MODE
        ? []
        : [resolveTacticalAllocationMode(result.tacticalMode)]),
    ].join(":");
  }
  return [
    "single",
    result.strategyId,
    stableParameters(result.parameters),
    stableFilter(result.entryFilter),
  ].join(":");
}

export function screeningRunCandidateKeyForPlan(
  plan: StrategyAllocationPlan,
): string | null {
  const strategyA = plan.strategyA;
  const strategyB = plan.strategyB;
  if (!strategyA && !strategyB) return null;
  if (!strategyA || !strategyB) {
    const selection = strategyA ?? strategyB;
    const entryFilter = strategyA
      ? plan.strategyAEntryFilter ?? plan.entryFilter
      : plan.strategyBEntryFilter ?? plan.entryFilter;
    return [
      "single",
      selection!.strategyId,
      stableParameters(selection!.parameters),
      stableFilter(entryFilter),
    ].join(":");
  }
  return [
    "combination",
    strategyA.strategyId,
    stableParameters(strategyA.parameters),
    stableFilter(plan.strategyAEntryFilter ?? plan.entryFilter),
    strategyB.strategyId,
    stableParameters(strategyB.parameters),
    stableFilter(plan.strategyBEntryFilter ?? plan.entryFilter),
    plan.strategyAAllocation,
    plan.strategyBAllocation,
    ...(resolveTacticalAllocationMode(plan.tacticalMode) ===
    DEFAULT_TACTICAL_ALLOCATION_MODE
      ? []
      : [resolveTacticalAllocationMode(plan.tacticalMode)]),
  ].join(":");
}

export function screeningRunCandidateRankByKey(
  candidates: readonly ScreeningRunCandidate[],
): Map<string, number> {
  const observed = { single: 0, combination: 0 };
  const storesNativeRanks = candidates.every((candidate) => {
    observed[candidate.kind] += 1;
    return candidate.rank === observed[candidate.kind];
  });
  if (storesNativeRanks) {
    return new Map(
      candidates.map((candidate) => [candidate.key, candidate.rank]),
    );
  }
  const legacyRanks = { single: 0, combination: 0 };
  return new Map(
    candidates.map((candidate) => {
      legacyRanks[candidate.kind] += 1;
      return [candidate.key, legacyRanks[candidate.kind]];
    }),
  );
}

function metrics(
  result: ScreeningSingleResult | ScreeningCombinationResult,
): ScreeningRunMetrics {
  return {
    totalReturn: result.totalReturn,
    maxDrawdown: result.maxDrawdown,
    sharpe: result.sharpe,
    tradeCount: result.tradeCount,
    score: result.score,
  };
}

function candidateSelectionScore(
  result: ScreeningSingleResult | ScreeningCombinationResult,
): number | null {
  const value = result.screeningValidation?.selectionScore;
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

function rankResults(
  outcome: ScreeningValidationOutcome,
  objective: ScreeningObjective,
) {
  return [...outcome.singleResults, ...outcome.results].sort(
    (left, right) => {
      const leftSelection = candidateSelectionScore(left);
      const rightSelection = candidateSelectionScore(right);
      if (leftSelection !== null && rightSelection !== null) {
        const difference = rightSelection - leftSelection;
        if (Math.abs(difference) > 1e-12) return difference;
      }
      return compareScreeningResults(left, right, objective);
    },
  );
}

function compactCandidate(
  result: ScreeningSingleResult | ScreeningCombinationResult,
  rank: number,
): ScreeningRunCandidate {
  if ("strategyAId" in result) {
    return {
      rank,
      key: screeningRunCandidateKey(result),
      kind: "combination",
      strategyAId: result.strategyAId,
      strategyAParameters: { ...result.strategyAParameters },
      strategyAEntryFilter: cloneMovingAverageSlopeFilter(
        result.strategyAEntryFilter,
      ),
      strategyBId: result.strategyBId,
      strategyBParameters: { ...result.strategyBParameters },
      strategyBEntryFilter: cloneMovingAverageSlopeFilter(
        result.strategyBEntryFilter,
      ),
      strategyAAllocation: result.strategyAAllocation,
      strategyBAllocation: result.strategyBAllocation,
      tacticalMode: resolveTacticalAllocationMode(result.tacticalMode),
      relativeLongStrategy: result.relativeLongStrategy,
      selectionScore: candidateSelectionScore(result),
      metrics: metrics(result),
    };
  }
  return {
    rank,
    key: screeningRunCandidateKey(result),
    kind: "single",
    strategyAId: result.strategyId,
    strategyAParameters: { ...result.parameters },
    strategyAEntryFilter: cloneMovingAverageSlopeFilter(
      result.entryFilter,
    ),
    strategyBId: null,
    strategyBParameters: null,
    strategyBEntryFilter: null,
    strategyAAllocation: 1,
    strategyBAllocation: 0,
    tacticalMode: DEFAULT_TACTICAL_ALLOCATION_MODE,
    relativeLongStrategy: null,
    selectionScore: candidateSelectionScore(result),
    metrics: metrics(result),
  };
}

function compactPerformance(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compactPerformance);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(
        ([key]) =>
          ![
            "equity",
            "trades",
            "rebalances",
            "rankingResult",
            "rankingPerformance",
          ].includes(key),
      )
      .map(([key, child]) => [key, compactPerformance(child)]),
  );
}

export { fingerprintMarketSeries };

export function createSaveScreeningRunInput(
  series: MarketSeries,
  validationConfig: ScreeningValidationConfig,
  objective: ScreeningObjective,
  settings: ScreeningRunSettings,
  outcome: ScreeningValidationOutcome,
  dataFingerprint: string,
  temporaryQuote: MarketTemporaryQuote | null = null,
): SaveScreeningRunInput {
  const candidates = [
    ...outcome.singleResults.map((result, index) =>
      compactCandidate(result, index + 1),
    ),
    ...outcome.results.map((result, index) =>
      compactCandidate(result, index + 1),
    ),
  ];
  const selectedResult = rankResults(outcome, objective)[0] ?? null;
  return {
    instrument: { ...series.instrument },
    instrumentKey: savedBacktestInstrumentKey(series.instrument),
    interval: series.interval,
    source: series.source,
    priceAdjustment: series.priceAdjustment,
    fetchedAt: series.fetchedAt,
    lastBarDate: series.bars.at(-1)?.time.slice(0, 10) ?? "",
    barCount: series.bars.length,
    dataFingerprint,
    temporaryQuote: temporaryQuote
      ? {
          provider: temporaryQuote.provider,
          time: temporaryQuote.time,
          fetchedAt: temporaryQuote.fetchedAt,
        }
      : null,
    validationMode: validationConfig.mode,
    validationConfig,
    objective,
    settings,
    candidates,
    selectedCandidateKey: selectedResult
      ? screeningRunCandidateKey(selectedResult)
      : null,
    validationReport: compactPerformance(outcome.validationReport),
  };
}

export function compareScreeningRuns(
  current: ScreeningRunRecord,
  previous: ScreeningRunRecord | null,
): ScreeningRunComparison | null {
  if (!previous) return null;
  const currentWinner =
    current.candidates.find(
      (candidate) => candidate.key === current.selectedCandidateKey,
    ) ?? null;
  const previousWinner =
    previous.candidates.find(
      (candidate) => candidate.key === previous.selectedCandidateKey,
    ) ?? null;
  const currentWinnerInPrevious = currentWinner
    ? previous.candidates.find(
        (candidate) => candidate.key === currentWinner.key,
      ) ?? null
    : null;
  const previousWinnerInCurrent = previousWinner
    ? current.candidates.find(
        (candidate) => candidate.key === previousWinner.key,
      ) ?? null
    : null;
  const previousTopTen = new Set(
    previous.candidates.slice(0, 10).map((candidate) => candidate.key),
  );
  const comparablePrevious = currentWinnerInPrevious;
  return {
    previousCreatedAt: previous.createdAt,
    winnerChanged: currentWinner?.key !== previousWinner?.key,
    currentWinnerKey: currentWinner?.key ?? null,
    previousWinnerKey: previousWinner?.key ?? null,
    currentWinnerPreviousRank: currentWinnerInPrevious?.rank ?? null,
    previousWinnerCurrentRank: previousWinnerInCurrent?.rank ?? null,
    topTenOverlap: current.candidates
      .slice(0, 10)
      .filter((candidate) => previousTopTen.has(candidate.key)).length,
    totalReturnDelta:
      currentWinner && comparablePrevious
        ? currentWinner.metrics.totalReturn -
          comparablePrevious.metrics.totalReturn
        : null,
    sharpeDelta:
      currentWinner && comparablePrevious
        ? currentWinner.metrics.sharpe -
          comparablePrevious.metrics.sharpe
        : null,
    maxDrawdownDelta:
      currentWinner && comparablePrevious
        ? currentWinner.metrics.maxDrawdown -
          comparablePrevious.metrics.maxDrawdown
        : null,
  };
}

const strategyIds = new Set(STRATEGIES.map((strategy) => strategy.id));
const validationModes = new Set(SCREENING_VALIDATION_MODES);
const objectives = new Set(SCREENING_OBJECTIVES);
const assetTypes = new Set<MarketAssetType>([
  "index",
  "etf",
  "commodity",
]);
const providers = new Set<MarketDataProvider>(MARKET_DATA_PROVIDERS);
const exchanges = new Set<MarketExchange>(MARKET_EXCHANGES);
const intervals = new Set<MarketInterval>([
  "1m",
  "5m",
  "15m",
  "30m",
  "60m",
  "1d",
]);
const priceAdjustments = new Set<MarketPriceAdjustment>([
  "raw",
  "corporate-action-adjusted",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validString(
  value: unknown,
  maximumLength: number,
): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximumLength
  );
}

function parseParameters(value: unknown): StrategyParameters | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.length < 1 || entries.length > 20) return null;
  const parameters: StrategyParameters = {};
  for (const [key, parameter] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key) || !finiteNumber(parameter)) {
      return null;
    }
    parameters[key] = parameter;
  }
  return parameters;
}

function parseMetrics(value: unknown): ScreeningRunMetrics | null {
  if (
    !isRecord(value) ||
    !finiteNumber(value.totalReturn) ||
    !finiteNumber(value.maxDrawdown) ||
    !finiteNumber(value.sharpe) ||
    !Number.isInteger(value.tradeCount) ||
    (value.tradeCount as number) < 0 ||
    !finiteNumber(value.score)
  ) {
    return null;
  }
  return {
    totalReturn: value.totalReturn,
    maxDrawdown: value.maxDrawdown,
    sharpe: value.sharpe,
    tradeCount: value.tradeCount as number,
    score: value.score,
  };
}

function parseCandidate(
  value: unknown,
): ScreeningRunCandidate | null {
  if (!isRecord(value)) return null;
  const kind = value.kind;
  const strategyAId = value.strategyAId as StrategyId;
  const strategyBId =
    value.strategyBId === null ? null : (value.strategyBId as StrategyId);
  const strategyAParameters = parseParameters(value.strategyAParameters);
  const strategyBParameters =
    value.strategyBParameters === null
      ? null
      : parseParameters(value.strategyBParameters);
  const strategyAEntryFilter =
    value.strategyAEntryFilter === null
      ? null
      : parseMovingAverageSlopeFilter(value.strategyAEntryFilter);
  const strategyBEntryFilter =
    value.strategyBEntryFilter === null
      ? null
      : parseMovingAverageSlopeFilter(value.strategyBEntryFilter);
  const metricsValue = parseMetrics(value.metrics);
  const tacticalMode = resolveTacticalAllocationMode(
    value.tacticalMode as TacticalAllocationMode | null | undefined,
  );
  if (
    (kind !== "single" && kind !== "combination") ||
    !Number.isInteger(value.rank) ||
    (value.rank as number) < 1 ||
    (value.rank as number) > MAX_SCREENING_RUN_CANDIDATES ||
    !validString(value.key, 1_000) ||
    !strategyIds.has(strategyAId) ||
    !strategyAParameters ||
    (kind === "single" &&
      (strategyBId !== null || strategyBParameters !== null)) ||
    (kind === "combination" &&
      (!strategyBId ||
        !strategyIds.has(strategyBId) ||
        !strategyBParameters)) ||
    !finiteNumber(value.strategyAAllocation) ||
    !finiteNumber(value.strategyBAllocation) ||
    value.strategyAAllocation < 0 ||
    value.strategyBAllocation < 0 ||
    value.strategyAAllocation + value.strategyBAllocation > 1 + 1e-10 ||
    (value.tacticalMode !== undefined &&
      value.tacticalMode !== DEFAULT_TACTICAL_ALLOCATION_MODE &&
      value.tacticalMode !== "reduce-on-short-exit") ||
    (value.relativeLongStrategy !== null &&
      value.relativeLongStrategy !== "strategyA" &&
      value.relativeLongStrategy !== "strategyB") ||
    (value.selectionScore !== null &&
      !finiteNumber(value.selectionScore)) ||
    !metricsValue ||
    (value.strategyAEntryFilter !== null && !strategyAEntryFilter) ||
    (value.strategyBEntryFilter !== null && !strategyBEntryFilter)
  ) {
    return null;
  }
  return {
    rank: value.rank as number,
    key: value.key,
    kind,
    strategyAId,
    strategyAParameters,
    strategyAEntryFilter,
    strategyBId,
    strategyBParameters,
    strategyBEntryFilter,
    strategyAAllocation: value.strategyAAllocation,
    strategyBAllocation: value.strategyBAllocation,
    tacticalMode,
    relativeLongStrategy: value.relativeLongStrategy,
    selectionScore: value.selectionScore,
    metrics: metricsValue,
  };
}

export function parseScreeningRunCandidates(
  value: unknown,
): ScreeningRunCandidate[] | null {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > MAX_SCREENING_RUN_CANDIDATES
  ) {
    return null;
  }
  const candidates = value.map((candidate) => parseCandidate(candidate));
  return candidates.some((candidate) => !candidate)
    ? null
    : (candidates as ScreeningRunCandidate[]);
}

export function parseSaveScreeningRunInput(
  value: unknown,
): SaveScreeningRunInput | null {
  if (!isRecord(value) || !isRecord(value.instrument)) return null;
  const instrument = {
    secid: value.instrument.secid as string,
    code: value.instrument.code as string,
    name: value.instrument.name as string,
    exchange: value.instrument.exchange as MarketExchange,
    assetType: value.instrument.assetType as MarketAssetType,
    provider: value.instrument.provider as MarketDataProvider,
  };
  const candidates = parseScreeningRunCandidates(value.candidates) ?? [];
  const settings = value.settings;
  const temporaryQuote =
    value.temporaryQuote === undefined || value.temporaryQuote === null
      ? null
      : isRecord(value.temporaryQuote) &&
          providers.has(
            value.temporaryQuote.provider as MarketDataProvider,
          ) &&
          /^\d{4}-\d{2}-\d{2}$/.test(
            String(value.temporaryQuote.time),
          ) &&
          validString(value.temporaryQuote.fetchedAt, 64)
        ? {
            provider:
              value.temporaryQuote.provider as MarketDataProvider,
            time: value.temporaryQuote.time as string,
            fetchedAt: value.temporaryQuote.fetchedAt as string,
          }
        : undefined;
  const serializedConfig = JSON.stringify(value.validationConfig);
  const serializedReport = JSON.stringify(value.validationReport);
  if (
    !validString(value.instrument.secid, 40) ||
    !validString(value.instrument.code, 24) ||
    !validString(value.instrument.name, 256) ||
    !exchanges.has(value.instrument.exchange as MarketExchange) ||
    !assetTypes.has(value.instrument.assetType as MarketAssetType) ||
    !providers.has(value.instrument.provider as MarketDataProvider) ||
    !validString(value.instrumentKey, 128) ||
    value.instrumentKey !== savedBacktestInstrumentKey(instrument) ||
    !intervals.has(value.interval as MarketInterval) ||
    !providers.has(value.source as MarketDataProvider) ||
    !priceAdjustments.has(
      value.priceAdjustment as MarketPriceAdjustment,
    ) ||
    !validString(value.fetchedAt, 64) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(String(value.lastBarDate)) ||
    !Number.isInteger(value.barCount) ||
    (value.barCount as number) < 3 ||
    !/^[a-f0-9]{64}$/.test(String(value.dataFingerprint)) ||
    temporaryQuote === undefined ||
    (temporaryQuote !== null &&
      temporaryQuote.time !== value.lastBarDate) ||
    !validationModes.has(
      value.validationMode as ScreeningValidationConfig["mode"],
    ) ||
    !objectives.has(value.objective as ScreeningObjective) ||
    !isRecord(value.validationConfig) ||
    value.validationConfig.mode !== value.validationMode ||
    serializedConfig.length > 20_000 ||
    serializedReport.length > 200_000 ||
    !isRecord(settings) ||
    !finiteNumber(settings.initialCash) ||
    settings.initialCash < 1 ||
    !finiteNumber(settings.commissionPercent) ||
    settings.commissionPercent < 0 ||
    !finiteNumber(settings.slippagePercent) ||
    settings.slippagePercent < 0 ||
    candidates.length < 1 ||
    candidates.length > MAX_SCREENING_RUN_CANDIDATES ||
    !validString(value.selectedCandidateKey, 1_000) ||
    !candidates.some(
      (candidate) => candidate.key === value.selectedCandidateKey,
    )
  ) {
    return null;
  }
  return {
    instrument,
    instrumentKey: value.instrumentKey,
    interval: value.interval as MarketInterval,
    source: value.source as MarketDataProvider,
    priceAdjustment: value.priceAdjustment as MarketPriceAdjustment,
    fetchedAt: value.fetchedAt,
    lastBarDate: value.lastBarDate as string,
    barCount: value.barCount as number,
    dataFingerprint: value.dataFingerprint as string,
    temporaryQuote,
    validationMode:
      value.validationMode as ScreeningValidationConfig["mode"],
    validationConfig:
      value.validationConfig as unknown as ScreeningValidationConfig,
    objective: value.objective as ScreeningObjective,
    settings: {
      initialCash: settings.initialCash,
      commissionPercent: settings.commissionPercent,
      slippagePercent: settings.slippagePercent,
    },
    candidates,
    selectedCandidateKey: value.selectedCandidateKey,
    validationReport: value.validationReport ?? null,
  };
}
