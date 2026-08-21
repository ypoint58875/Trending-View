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
  STRATEGY_SLOTS,
  resolveTacticalAllocationMode,
  type StrategyAllocationPlan,
  type StrategySlot,
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
  strategyCId?: StrategyId | null;
  strategyCParameters?: StrategyParameters | null;
  strategyCEntryFilter?: MovingAverageSlopeFilter | null;
  strategyDId?: StrategyId | null;
  strategyDParameters?: StrategyParameters | null;
  strategyDEntryFilter?: MovingAverageSlopeFilter | null;
  strategyEId?: StrategyId | null;
  strategyEParameters?: StrategyParameters | null;
  strategyEEntryFilter?: MovingAverageSlopeFilter | null;
  strategyFId?: StrategyId | null;
  strategyFParameters?: StrategyParameters | null;
  strategyFEntryFilter?: MovingAverageSlopeFilter | null;
  strategyGId?: StrategyId | null;
  strategyGParameters?: StrategyParameters | null;
  strategyGEntryFilter?: MovingAverageSlopeFilter | null;
  strategyHId?: StrategyId | null;
  strategyHParameters?: StrategyParameters | null;
  strategyHEntryFilter?: MovingAverageSlopeFilter | null;
  strategyIId?: StrategyId | null;
  strategyIParameters?: StrategyParameters | null;
  strategyIEntryFilter?: MovingAverageSlopeFilter | null;
  strategyAAllocation: number;
  strategyBAllocation: number;
  strategyCAllocation?: number;
  strategyDAllocation?: number;
  strategyEAllocation?: number;
  strategyFAllocation?: number;
  strategyGAllocation?: number;
  strategyHAllocation?: number;
  strategyIAllocation?: number;
  tacticalMode?: TacticalAllocationMode;
  relativeLongStrategy: StrategySlot | null;
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
    const combination = result as ScreeningCombinationResult &
      Record<string, unknown>;
    const higherOrderLegs = STRATEGY_SLOTS.slice(2).flatMap((slot) => {
      const id = combination[`${slot}Id`] as StrategyId | null | undefined;
      const parameters = combination[`${slot}Parameters`] as
        | StrategyParameters
        | null
        | undefined;
      if (!id || !parameters) return [];
      return [
        id,
        stableParameters(parameters),
        stableFilter(
          combination[`${slot}EntryFilter`] as
            | MovingAverageSlopeFilter
            | null
            | undefined,
        ),
        (combination[`${slot}Allocation`] as number | undefined) ?? 0,
      ];
    });
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
      ...higherOrderLegs,
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
  const planRecord = plan as StrategyAllocationPlan & Record<string, unknown>;
  const selected = STRATEGY_SLOTS.map((slot) => ({
    selection: planRecord[slot] as
      | StrategyAllocationPlan["strategyA"]
      | null
      | undefined,
    entryFilter:
      (planRecord[`${slot}EntryFilter`] as
        | MovingAverageSlopeFilter
        | null
        | undefined) ?? plan.entryFilter,
    allocation:
      (planRecord[`${slot}Allocation`] as number | undefined) ?? 0,
  })).filter(
    (leg): leg is typeof leg & {
      selection: NonNullable<typeof leg.selection>;
    } => Boolean(leg.selection),
  );
  if (selected.length === 0) return null;
  if (selected.length === 1) {
    const { selection, entryFilter } = selected[0];
    return [
      "single",
      selection.strategyId,
      stableParameters(selection.parameters),
      stableFilter(entryFilter),
    ].join(":");
  }
  const [primary, secondary] = selected;
  return [
    "combination",
    primary.selection.strategyId,
    stableParameters(primary.selection.parameters),
    stableFilter(primary.entryFilter),
    secondary.selection.strategyId,
    stableParameters(secondary.selection.parameters),
    stableFilter(secondary.entryFilter),
    primary.allocation,
    secondary.allocation,
    ...selected.slice(2).flatMap((leg) => [
      leg.selection.strategyId,
      stableParameters(leg.selection.parameters),
      stableFilter(leg.entryFilter),
      leg.allocation,
    ]),
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
      strategyCId: result.strategyCId ?? null,
      strategyCParameters: result.strategyCParameters
        ? { ...result.strategyCParameters }
        : null,
      strategyCEntryFilter: cloneMovingAverageSlopeFilter(
        result.strategyCEntryFilter,
      ),
      strategyDId: result.strategyDId ?? null,
      strategyDParameters: result.strategyDParameters
        ? { ...result.strategyDParameters }
        : null,
      strategyDEntryFilter: cloneMovingAverageSlopeFilter(
        result.strategyDEntryFilter,
      ),
      strategyEId: result.strategyEId ?? null,
      strategyEParameters: result.strategyEParameters
        ? { ...result.strategyEParameters }
        : null,
      strategyEEntryFilter: cloneMovingAverageSlopeFilter(
        result.strategyEEntryFilter,
      ),
      strategyAAllocation: result.strategyAAllocation,
      strategyBAllocation: result.strategyBAllocation,
      strategyCAllocation: result.strategyCAllocation ?? 0,
      strategyDAllocation: result.strategyDAllocation ?? 0,
      strategyEAllocation: result.strategyEAllocation ?? 0,
      ...Object.fromEntries(
        STRATEGY_SLOTS.slice(5).flatMap((slot) => {
          const resultRecord = result as ScreeningCombinationResult &
            Record<string, unknown>;
          const parameters = resultRecord[`${slot}Parameters`] as
            | StrategyParameters
            | null
            | undefined;
          return [
            [`${slot}Id`, resultRecord[`${slot}Id`] ?? null],
            [`${slot}Parameters`, parameters ? { ...parameters } : null],
            [
              `${slot}EntryFilter`,
              cloneMovingAverageSlopeFilter(
                resultRecord[`${slot}EntryFilter`] as
                  | MovingAverageSlopeFilter
                  | null
                  | undefined,
              ),
            ],
            [`${slot}Allocation`, resultRecord[`${slot}Allocation`] ?? 0],
          ];
        }),
      ),
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
    strategyCId: null,
    strategyCParameters: null,
    strategyCEntryFilter: null,
    strategyDId: null,
    strategyDParameters: null,
    strategyDEntryFilter: null,
    strategyEId: null,
    strategyEParameters: null,
    strategyEEntryFilter: null,
    strategyFId: null,
    strategyFParameters: null,
    strategyFEntryFilter: null,
    strategyGId: null,
    strategyGParameters: null,
    strategyGEntryFilter: null,
    strategyHId: null,
    strategyHParameters: null,
    strategyHEntryFilter: null,
    strategyIId: null,
    strategyIParameters: null,
    strategyIEntryFilter: null,
    strategyAAllocation: 1,
    strategyBAllocation: 0,
    strategyCAllocation: 0,
    strategyDAllocation: 0,
    strategyEAllocation: 0,
    strategyFAllocation: 0,
    strategyGAllocation: 0,
    strategyHAllocation: 0,
    strategyIAllocation: 0,
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
  const slotData = STRATEGY_SLOTS.map((slot, index) => {
    const rawId = value[`${slot}Id`];
    const rawParameters = value[`${slot}Parameters`];
    const rawFilter = value[`${slot}EntryFilter`];
    const rawAllocation = value[`${slot}Allocation`];
    return {
      slot,
      id:
        rawId === undefined || rawId === null
          ? null
          : (rawId as StrategyId),
      parameters:
        rawParameters === undefined || rawParameters === null
          ? null
          : parseParameters(rawParameters),
      entryFilter:
        rawFilter === undefined || rawFilter === null
          ? null
          : parseMovingAverageSlopeFilter(rawFilter),
      invalidFilter:
        rawFilter !== undefined && rawFilter !== null &&
        !parseMovingAverageSlopeFilter(rawFilter),
      allocation: rawAllocation === undefined && index >= 2 ? 0 : rawAllocation,
    };
  });
  const selectedSlots = slotData.filter(({ id }) => id !== null);
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
    selectedSlots.length < 1 ||
    (kind === "single" && selectedSlots.length !== 1) ||
    (kind === "combination" && selectedSlots.length < 2) ||
    slotData.some(
      ({ id, parameters, invalidFilter, allocation }, index) =>
        (id !== null && (!strategyIds.has(id) || !parameters)) ||
        (id === null && parameters !== null) ||
        (id === null && index < selectedSlots.length) ||
        invalidFilter ||
        !finiteNumber(allocation) ||
        (allocation as number) < 0 ||
        (id === null && (allocation as number) > 1e-10),
    ) ||
    slotData.reduce((sum, { allocation }) => sum + (allocation as number), 0) >
      1 + 1e-10 ||
    (value.tacticalMode !== undefined &&
      value.tacticalMode !== DEFAULT_TACTICAL_ALLOCATION_MODE &&
      value.tacticalMode !== "reduce-on-short-exit") ||
    (value.relativeLongStrategy !== null &&
      !STRATEGY_SLOTS.includes(value.relativeLongStrategy as StrategySlot)) ||
    (value.selectionScore !== null &&
      !finiteNumber(value.selectionScore)) ||
    !metricsValue
  ) {
    return null;
  }
  const [strategyA, strategyB, strategyC, strategyD, strategyE, strategyF, strategyG, strategyH, strategyI] = slotData;
  return {
    rank: value.rank as number,
    key: value.key,
    kind,
    strategyAId: strategyA.id as StrategyId,
    strategyAParameters: strategyA.parameters as StrategyParameters,
    strategyAEntryFilter: strategyA.entryFilter,
    strategyBId: strategyB.id,
    strategyBParameters: strategyB.parameters,
    strategyBEntryFilter: strategyB.entryFilter,
    strategyCId: strategyC.id,
    strategyCParameters: strategyC.parameters,
    strategyCEntryFilter: strategyC.entryFilter,
    strategyDId: strategyD.id,
    strategyDParameters: strategyD.parameters,
    strategyDEntryFilter: strategyD.entryFilter,
    strategyEId: strategyE.id,
    strategyEParameters: strategyE.parameters,
    strategyEEntryFilter: strategyE.entryFilter,
    strategyFId: strategyF.id,
    strategyFParameters: strategyF.parameters,
    strategyFEntryFilter: strategyF.entryFilter,
    strategyGId: strategyG.id,
    strategyGParameters: strategyG.parameters,
    strategyGEntryFilter: strategyG.entryFilter,
    strategyHId: strategyH.id,
    strategyHParameters: strategyH.parameters,
    strategyHEntryFilter: strategyH.entryFilter,
    strategyIId: strategyI.id,
    strategyIParameters: strategyI.parameters,
    strategyIEntryFilter: strategyI.entryFilter,
    strategyAAllocation: strategyA.allocation as number,
    strategyBAllocation: strategyB.allocation as number,
    strategyCAllocation: strategyC.allocation as number,
    strategyDAllocation: strategyD.allocation as number,
    strategyEAllocation: strategyE.allocation as number,
    strategyFAllocation: strategyF.allocation as number,
    strategyGAllocation: strategyG.allocation as number,
    strategyHAllocation: strategyH.allocation as number,
    strategyIAllocation: strategyI.allocation as number,
    tacticalMode,
    relativeLongStrategy: value.relativeLongStrategy as StrategySlot | null,
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
