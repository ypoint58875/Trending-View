import type { BacktestPerformance } from "./backtest";
import {
  parseIndicatorConfigurations,
  type IndicatorConfiguration,
} from "./indicator-registry";
import { isValidStrategyParameters } from "./screening";
import {
  DEFAULT_TACTICAL_ALLOCATION_MODE,
  TACTICAL_ALLOCATION_MODES,
  resolveTacticalAllocationMode,
  type TacticalAllocationMode,
  type StrategyAllocationPlan,
  type StrategySelection,
} from "./strategy-combinations";
import {
  STRATEGIES,
  getStrategy,
  type StrategyId,
  type StrategyParameters,
} from "./strategies";
import {
  MARKET_DATA_PROVIDERS,
  MAX_MARKET_INSTRUMENT_NAME_LENGTH,
  type MarketAssetType,
  type MarketDataProvider,
  type MarketExchange,
  type MarketInstrument,
  type MarketInterval,
  type MarketSeries,
} from "@/lib/market/types";
import { canonicalMarketInstrumentKey } from "@/lib/market/canonical";
import { MARKET_EXCHANGES } from "@/lib/market/exchanges";
import {
  cloneMovingAverageSlopeFilter,
  movingAverageSlopeFiltersEqual,
  parseMovingAverageSlopeFilter,
  type MovingAverageSlopeFilter,
} from "./entry-filter";

export const MAX_SAVED_BACKTEST_SCROLL_RECORDS = 200;
export const SAVED_BACKTEST_ROLLING_SESSIONS = 128;
export const MAX_SAVED_BACKTEST_FOLDERS = 100;
export const MAX_SAVED_BACKTEST_FOLDER_NAME_LENGTH = 64;
export const SAVED_BACKTEST_INSTRUMENT_FOLDER_CONTEXT = "root";

export type SavedBacktestFolderScope = "instrument" | "strategy";

export interface SavedBacktestFolder {
  id: number;
  scope: SavedBacktestFolderScope;
  contextKey: string;
  name: string;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSavedBacktestFolderInput {
  scope: SavedBacktestFolderScope;
  contextKey: string;
  name: string;
}

export interface RenameSavedBacktestFolderInput {
  id: number;
  name: string;
}

export interface SavedBacktestFolderOrderInput {
  scope: SavedBacktestFolderScope;
  contextKey: string;
  orderedIds: number[];
}

export type AssignSavedBacktestFolderInput =
  | {
      scope: "instrument";
      folderId: number | null;
      instrumentKey: string;
    }
  | {
      scope: "strategy";
      folderId: number | null;
      savedBacktestId: number;
    };

export interface SavedBacktestMetrics {
  totalReturn: number;
  maxDrawdown: number;
  sharpe: number;
  tradeCount: number;
  score: number;
}

export interface SavedBacktestReturnDisplay {
  totalReturn: number;
  range: "current" | "rolling" | "saved";
}

export interface SavedBacktestRollingEvaluation {
  id: number;
  totalReturn: number;
}

export interface SavedBacktestRollingUpdateInput {
  instrumentKey: string;
  marketFingerprint: string;
  evaluations: SavedBacktestRollingEvaluation[];
}

export interface SaveBacktestInput {
  instrument: MarketInstrument;
  interval: MarketInterval;
  strategyId: StrategyId;
  parameters: StrategyParameters;
  plan: StrategyAllocationPlan;
  indicators: IndicatorConfiguration[];
  startDate: string;
  endDate: string;
  initialCash: number;
  commissionPercent: number;
  slippagePercent: number;
  metrics: SavedBacktestMetrics;
}

export interface SavedBacktestRecord extends SaveBacktestInput {
  id: number;
  instrumentFolderId?: number | null;
  strategyFolderId?: number | null;
  rollingTotalReturn: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SavedBacktestGroup {
  key: string;
  instrument: MarketInstrument;
  instrumentFolderId: number | null;
  records: SavedBacktestRecord[];
}

export interface SavedBacktestOrderInput {
  orderedIds: number[];
}

export function savedBacktestInstrumentKey(
  instrument: MarketInstrument,
): string {
  return canonicalMarketInstrumentKey(instrument);
}

export function resolveSavedBacktestReturnDisplay(
  currentRangeMetrics: Pick<BacktestPerformance, "totalReturn"> | null | undefined,
  savedMetrics: SavedBacktestMetrics,
  rollingTotalReturn: number | null = null,
): SavedBacktestReturnDisplay {
  if (
    currentRangeMetrics &&
    Number.isFinite(currentRangeMetrics.totalReturn)
  ) {
    return {
      totalReturn: currentRangeMetrics.totalReturn,
      range: "current",
    };
  }
  if (
    rollingTotalReturn !== null &&
    Number.isFinite(rollingTotalReturn)
  ) {
    return {
      totalReturn: rollingTotalReturn,
      range: "rolling",
    };
  }
  return {
    totalReturn: savedMetrics.totalReturn,
    range: "saved",
  };
}

export function canReuseSavedBacktestMarketSeries(
  savedInstrument: MarketInstrument,
  currentInstrument: MarketInstrument,
  currentSeries: MarketSeries | null,
  interval: MarketInterval,
): boolean {
  if (
    !currentSeries ||
    currentSeries.interval !== interval ||
    currentSeries.bars.length === 0
  ) {
    return false;
  }
  const savedKey = savedBacktestInstrumentKey(savedInstrument);
  return (
    savedKey === savedBacktestInstrumentKey(currentInstrument) &&
    savedKey === savedBacktestInstrumentKey(currentSeries.instrument)
  );
}

export function groupSavedBacktests(
  records: readonly SavedBacktestRecord[],
): SavedBacktestGroup[] {
  const groups = new Map<string, SavedBacktestGroup>();
  for (const record of records) {
    const key = savedBacktestInstrumentKey(record.instrument);
    const group = groups.get(key);
    if (group) {
      group.records.push(record);
    } else {
      groups.set(key, {
        key,
        instrument: record.instrument,
        instrumentFolderId: record.instrumentFolderId ?? null,
        records: [record],
      });
    }
  }
  return Array.from(groups.values());
}

function moveArrayEntry<T>(
  entries: readonly T[],
  sourceIndex: number,
  targetIndex: number,
): T[] {
  if (
    sourceIndex < 0 ||
    targetIndex < 0 ||
    sourceIndex >= entries.length ||
    targetIndex >= entries.length ||
    sourceIndex === targetIndex
  ) {
    return [...entries];
  }
  const next = [...entries];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

export function reorderSavedBacktestGroups(
  records: readonly SavedBacktestRecord[],
  sourceKey: string,
  targetKey: string,
): SavedBacktestRecord[] {
  const groups = groupSavedBacktests(records);
  const sourceIndex = groups.findIndex((group) => group.key === sourceKey);
  const targetIndex = groups.findIndex((group) => group.key === targetKey);
  return moveArrayEntry(groups, sourceIndex, targetIndex).flatMap(
    (group) => group.records,
  );
}

export function reorderSavedBacktestsWithinGroup(
  records: readonly SavedBacktestRecord[],
  groupKey: string,
  sourceId: number,
  targetId: number,
): SavedBacktestRecord[] {
  const groups = groupSavedBacktests(records);
  const group = groups.find((candidate) => candidate.key === groupKey);
  if (!group) return [...records];
  const sourceIndex = group.records.findIndex(
    (record) => record.id === sourceId,
  );
  const targetIndex = group.records.findIndex(
    (record) => record.id === targetId,
  );
  group.records = moveArrayEntry(group.records, sourceIndex, targetIndex);
  return groups.flatMap((candidate) => candidate.records);
}

export function reorderSavedBacktestFolders(
  folders: readonly SavedBacktestFolder[],
  scope: SavedBacktestFolderScope,
  contextKey: string,
  sourceId: number,
  targetId: number,
): SavedBacktestFolder[] {
  const siblings = folders.filter(
    (folder) => folder.scope === scope && folder.contextKey === contextKey,
  );
  const sourceIndex = siblings.findIndex((folder) => folder.id === sourceId);
  const targetIndex = siblings.findIndex((folder) => folder.id === targetId);
  const reorderedSiblings = moveArrayEntry(
    siblings,
    sourceIndex,
    targetIndex,
  );
  let siblingIndex = 0;
  return folders.map((folder) =>
    folder.scope === scope && folder.contextKey === contextKey
      ? reorderedSiblings[siblingIndex++]!
      : folder,
  );
}

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
const strategyIds = new Set(STRATEGIES.map((strategy) => strategy.id));
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseSavedBacktestOrderInput(
  value: unknown,
): SavedBacktestOrderInput | null {
  if (!isRecord(value) || !Array.isArray(value.orderedIds)) return null;
  const orderedIds = value.orderedIds;
  if (
    orderedIds.length < 1 ||
    orderedIds.length > MAX_SAVED_BACKTEST_SCROLL_RECORDS ||
    orderedIds.some((id) => !Number.isInteger(id) || id < 1) ||
    new Set(orderedIds).size !== orderedIds.length
  ) {
    return null;
  }
  return { orderedIds: [...orderedIds] };
}

export function savedBacktestEvaluationsCoverIds(
  expectedIds: readonly number[],
  evaluations: readonly SavedBacktestRollingEvaluation[],
): boolean {
  if (expectedIds.length !== evaluations.length) return false;
  const expectedIdSet = new Set(expectedIds);
  const evaluatedIdSet = new Set(evaluations.map((evaluation) => evaluation.id));
  return (
    expectedIdSet.size === expectedIds.length &&
    evaluatedIdSet.size === evaluations.length &&
    evaluations.every((evaluation) => expectedIdSet.has(evaluation.id))
  );
}

export function parseSavedBacktestRollingUpdateInput(
  value: unknown,
): SavedBacktestRollingUpdateInput | null {
  if (!isRecord(value) || !Array.isArray(value.evaluations)) return null;
  const instrumentKey = readString(value.instrumentKey, 128);
  const marketFingerprint = readString(value.marketFingerprint, 64);
  if (
    !instrumentKey ||
    !marketFingerprint ||
    !/^[a-f0-9]{64}$/.test(marketFingerprint) ||
    value.evaluations.length < 1 ||
    value.evaluations.length > MAX_SAVED_BACKTEST_SCROLL_RECORDS
  ) {
    return null;
  }
  const evaluations: SavedBacktestRollingEvaluation[] = [];
  for (const evaluation of value.evaluations) {
    if (!isRecord(evaluation)) return null;
    const id = evaluation.id;
    const totalReturn = evaluation.totalReturn;
    if (
      typeof id !== "number" ||
      !Number.isInteger(id) ||
      id < 1 ||
      typeof totalReturn !== "number" ||
      !Number.isFinite(totalReturn)
    ) {
      return null;
    }
    evaluations.push({ id: id as number, totalReturn });
  }
  if (
    new Set(evaluations.map((evaluation) => evaluation.id)).size !==
    evaluations.length
  ) {
    return null;
  }
  return { instrumentKey, marketFingerprint, evaluations };
}

function readString(
  value: unknown,
  maximumLength: number,
): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maximumLength
    ? normalized
    : null;
}

function readPositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function readFolderId(value: unknown): number | null | undefined {
  if (value === null) return null;
  return readPositiveInteger(value) ?? undefined;
}

export function parseCreateSavedBacktestFolderInput(
  value: unknown,
): CreateSavedBacktestFolderInput | null {
  if (!isRecord(value)) return null;
  const scope = value.scope;
  const name = readString(
    value.name,
    MAX_SAVED_BACKTEST_FOLDER_NAME_LENGTH,
  );
  if ((scope !== "instrument" && scope !== "strategy") || !name) {
    return null;
  }
  const contextKey =
    scope === "instrument"
      ? SAVED_BACKTEST_INSTRUMENT_FOLDER_CONTEXT
      : readString(value.contextKey, 128);
  return contextKey ? { scope, contextKey, name } : null;
}

export function parseRenameSavedBacktestFolderInput(
  value: unknown,
): RenameSavedBacktestFolderInput | null {
  if (!isRecord(value)) return null;
  const id = readPositiveInteger(value.id);
  const name = readString(
    value.name,
    MAX_SAVED_BACKTEST_FOLDER_NAME_LENGTH,
  );
  return id && name ? { id, name } : null;
}

export function parseSavedBacktestFolderOrderInput(
  value: unknown,
): SavedBacktestFolderOrderInput | null {
  if (!isRecord(value) || !Array.isArray(value.orderedIds)) return null;
  const scope = value.scope;
  if (scope !== "instrument" && scope !== "strategy") return null;
  const contextKey =
    scope === "instrument"
      ? SAVED_BACKTEST_INSTRUMENT_FOLDER_CONTEXT
      : readString(value.contextKey, 128);
  const orderedIds = value.orderedIds.map(readPositiveInteger);
  if (
    !contextKey ||
    orderedIds.length < 1 ||
    orderedIds.length > MAX_SAVED_BACKTEST_FOLDERS ||
    orderedIds.some((id) => id === null) ||
    new Set(orderedIds).size !== orderedIds.length
  ) {
    return null;
  }
  return {
    scope,
    contextKey,
    orderedIds: orderedIds as number[],
  };
}

export function parseAssignSavedBacktestFolderInput(
  value: unknown,
): AssignSavedBacktestFolderInput | null {
  if (!isRecord(value)) return null;
  const folderId = readFolderId(value.folderId);
  if (folderId === undefined) return null;
  if (value.scope === "instrument") {
    const instrumentKey = readString(value.instrumentKey, 128);
    return instrumentKey
      ? { scope: "instrument", folderId, instrumentKey }
      : null;
  }
  if (value.scope === "strategy") {
    const savedBacktestId = readPositiveInteger(value.savedBacktestId);
    return savedBacktestId
      ? { scope: "strategy", folderId, savedBacktestId }
      : null;
  }
  return null;
}

function readFiniteNumber(
  value: unknown,
  minimum = -Number.MAX_VALUE,
  maximum = Number.MAX_VALUE,
): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : null;
}

function readParameters(value: unknown): StrategyParameters | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.length < 1 || entries.length > 20) return null;

  const parameters: StrategyParameters = {};
  for (const [key, parameter] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key)) return null;
    const number = readFiniteNumber(parameter, -1_000_000, 1_000_000);
    if (number === null) return null;
    parameters[key] = number;
  }
  return parameters;
}

function readStrategySelection(
  value: unknown,
): StrategySelection | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const strategyId = value.strategyId as StrategyId;
  const parameters = readParameters(value.parameters);
  if (
    !strategyIds.has(strategyId) ||
    !parameters ||
    !isValidStrategyParameters(strategyId, parameters)
  ) {
    return undefined;
  }
  return { strategyId, parameters };
}

export function buildLegacyStrategyPlan(
  strategyId: StrategyId,
  parameters: StrategyParameters,
): StrategyAllocationPlan {
  const selection = { strategyId, parameters: { ...parameters } };
  return {
    strategyA: selection,
    strategyB: null,
    strategyAAllocation: 1,
    strategyBAllocation: 0,
  };
}

function copySelection(
  selection: StrategySelection | null,
): StrategySelection | null {
  return selection
    ? { ...selection, parameters: { ...selection.parameters } }
    : null;
}

function validatePlan(
  strategyA: StrategySelection | null | undefined,
  strategyB: StrategySelection | null | undefined,
  strategyAAllocation: number | null,
  strategyBAllocation: number | null,
  strategyAEntryFilter: MovingAverageSlopeFilter | null = null,
  strategyBEntryFilter: MovingAverageSlopeFilter | null = null,
  tacticalMode: TacticalAllocationMode = DEFAULT_TACTICAL_ALLOCATION_MODE,
): StrategyAllocationPlan | null {
  if (
    strategyA === undefined ||
    strategyB === undefined ||
    (!strategyA && !strategyB) ||
    (strategyA &&
      strategyB &&
      strategyA.strategyId === strategyB.strategyId) ||
    strategyAAllocation === null ||
    strategyBAllocation === null ||
    (!strategyA && strategyAAllocation > 1e-10) ||
    (!strategyB && strategyBAllocation > 1e-10) ||
    strategyAAllocation + strategyBAllocation > 1 + 1e-10
  ) {
    return null;
  }
  const singleStrategy = Boolean(strategyA) !== Boolean(strategyB);
  return {
    strategyA: copySelection(strategyA),
    strategyB: copySelection(strategyB),
    strategyAAllocation: singleStrategy
      ? strategyA
        ? 1
        : 0
      : strategyAAllocation,
    strategyBAllocation: singleStrategy
      ? strategyB
        ? 1
        : 0
      : strategyBAllocation,
    tacticalMode,
    ...(strategyA && strategyAEntryFilter
      ? {
          strategyAEntryFilter: cloneMovingAverageSlopeFilter(
            strategyAEntryFilter,
          ),
        }
      : {}),
    ...(strategyB && strategyBEntryFilter
      ? {
          strategyBEntryFilter: cloneMovingAverageSlopeFilter(
            strategyBEntryFilter,
          ),
        }
      : {}),
  };
}

function strategyParametersEqual(
  left: StrategyParameters,
  right: StrategyParameters,
): boolean {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  return (
    leftEntries.length === rightEntries.length &&
    leftEntries.every(([key, value]) => right[key] === value)
  );
}

function strategySelectionsEqual(
  left: StrategySelection | null,
  right: StrategySelection | null,
): boolean {
  if (!left || !right) return left === right;
  return (
    left.strategyId === right.strategyId &&
    strategyParametersEqual(left.parameters, right.parameters)
  );
}

export function strategyPlansEqual(
  left: StrategyAllocationPlan,
  right: StrategyAllocationPlan,
): boolean {
  return (
    strategySelectionsEqual(left.strategyA, right.strategyA) &&
    strategySelectionsEqual(left.strategyB, right.strategyB) &&
    Math.abs(left.strategyAAllocation - right.strategyAAllocation) < 1e-10 &&
    Math.abs(left.strategyBAllocation - right.strategyBAllocation) < 1e-10 &&
    resolveTacticalAllocationMode(left.tacticalMode) ===
      resolveTacticalAllocationMode(right.tacticalMode) &&
    movingAverageSlopeFiltersEqual(
      left.strategyAEntryFilter ?? left.entryFilter,
      right.strategyAEntryFilter ?? right.entryFilter,
    ) &&
    movingAverageSlopeFiltersEqual(
      left.strategyBEntryFilter ?? left.entryFilter,
      right.strategyBEntryFilter ?? right.entryFilter,
    )
  );
}

export interface StrategyShortcutParameterDifference {
  strategyId: StrategyId;
  key: string;
  savedValue: number | null;
  candidateValue: number | null;
}

export interface StrategyShortcutMatch {
  kind: "exact" | "same-type";
  savedBacktestId: number;
  sharedStrategyIds: StrategyId[];
  parameterDifferences: StrategyShortcutParameterDifference[];
  allocationDifferent: boolean;
  entryFilterDifferent: boolean;
  tacticalModeDifferent: boolean;
}

function planSelections(plan: StrategyAllocationPlan): StrategySelection[] {
  return [plan.strategyA, plan.strategyB].filter(
    (selection): selection is StrategySelection => selection !== null,
  );
}

function shortcutMatchForRecord(
  candidate: StrategyAllocationPlan,
  saved: SavedBacktestRecord,
): StrategyShortcutMatch | null {
  if (strategyPlansEqual(candidate, saved.plan)) {
    return {
      kind: "exact",
      savedBacktestId: saved.id,
      sharedStrategyIds: planSelections(candidate).map(
        (selection) => selection.strategyId,
      ),
      parameterDifferences: [],
      allocationDifferent: false,
      entryFilterDifferent: false,
      tacticalModeDifferent: false,
    };
  }

  const candidateSelections = planSelections(candidate);
  const savedSelections = planSelections(saved.plan);
  const sharedStrategyIds = candidateSelections
    .map((selection) => selection.strategyId)
    .filter(
      (strategyId, index, values) =>
        values.indexOf(strategyId) === index &&
        savedSelections.some((selection) => selection.strategyId === strategyId),
    );
  if (sharedStrategyIds.length === 0) return null;

  const parameterDifferences: StrategyShortcutParameterDifference[] = [];
  for (const strategyId of sharedStrategyIds) {
    const candidateSelection = candidateSelections.find(
      (selection) => selection.strategyId === strategyId,
    )!;
    const savedSelection = savedSelections.find(
      (selection) => selection.strategyId === strategyId,
    )!;
    const keys = new Set([
      ...Object.keys(candidateSelection.parameters),
      ...Object.keys(savedSelection.parameters),
    ]);
    for (const key of [...keys].sort()) {
      const savedValue = savedSelection.parameters[key] ?? null;
      const candidateValue = candidateSelection.parameters[key] ?? null;
      if (savedValue !== candidateValue) {
        parameterDifferences.push({
          strategyId,
          key,
          savedValue,
          candidateValue,
        });
      }
    }
  }

  return {
    kind: "same-type",
    savedBacktestId: saved.id,
    sharedStrategyIds,
    parameterDifferences,
    allocationDifferent:
      Math.abs(candidate.strategyAAllocation - saved.plan.strategyAAllocation) >=
        1e-10 ||
      Math.abs(candidate.strategyBAllocation - saved.plan.strategyBAllocation) >=
        1e-10,
    entryFilterDifferent:
      !movingAverageSlopeFiltersEqual(
        candidate.strategyAEntryFilter ?? candidate.entryFilter,
        saved.plan.strategyAEntryFilter ?? saved.plan.entryFilter,
      ) ||
      !movingAverageSlopeFiltersEqual(
        candidate.strategyBEntryFilter ?? candidate.entryFilter,
        saved.plan.strategyBEntryFilter ?? saved.plan.entryFilter,
      ),
    tacticalModeDifferent:
      resolveTacticalAllocationMode(candidate.tacticalMode) !==
      resolveTacticalAllocationMode(saved.plan.tacticalMode),
  };
}

export function findStrategyShortcutMatch(
  candidate: StrategyAllocationPlan,
  savedBacktests: readonly SavedBacktestRecord[],
): StrategyShortcutMatch | null {
  const matches = savedBacktests
    .map((saved) => shortcutMatchForRecord(candidate, saved))
    .filter((match): match is StrategyShortcutMatch => match !== null);
  return (
    matches.find((match) => match.kind === "exact") ??
    matches.sort((left, right) => {
      if (left.sharedStrategyIds.length !== right.sharedStrategyIds.length) {
        return right.sharedStrategyIds.length - left.sharedStrategyIds.length;
      }
      return (
        left.parameterDifferences.length - right.parameterDifferences.length
      );
    })[0] ??
    null
  );
}

function parseLegacyStrategyAllocationPlan(
  value: Record<string, unknown>,
): StrategyAllocationPlan | null {
  const legacyLong = readStrategySelection(value.long);
  const legacyShort = readStrategySelection(value.short);
  if (
    (legacyLong &&
      getStrategy(legacyLong.strategyId).horizon !== "long") ||
    (legacyShort &&
      getStrategy(legacyShort.strategyId).horizon !== "short")
  ) {
    return null;
  }
  let legacyLongAllocation = readFiniteNumber(value.longAllocation, 0, 1);
  let legacyShortAllocation = readFiniteNumber(value.shortAllocation, 0, 1);
  if (legacyLongAllocation === null && legacyShortAllocation === null) {
    const legacyCore = readFiniteNumber(value.coreAllocation, 0, 1);
    const legacyMaximum = readFiniteNumber(value.maximumAllocation, 0, 1);
    if (
      legacyCore !== null &&
      legacyMaximum !== null &&
      legacyCore <= legacyMaximum
    ) {
      legacyLongAllocation = legacyCore;
      legacyShortAllocation = legacyMaximum - legacyCore;
    }
  }
  if (legacyLong && legacyShort) {
    return validatePlan(
      legacyLong,
      legacyShort,
      legacyLongAllocation,
      legacyShortAllocation,
    );
  }
  const selection = legacyLong ?? legacyShort;
  const allocation = legacyLong
    ? legacyLongAllocation
    : legacyShortAllocation;
  return validatePlan(selection, null, allocation, 0);
}

export function parseStrategyAllocationPlan(
  value: unknown,
): StrategyAllocationPlan | null {
  if (!isRecord(value)) return null;
  const hasNewShape =
    "strategyA" in value ||
    "strategyB" in value ||
    "strategyAAllocation" in value ||
    "strategyBAllocation" in value;
  if (!hasNewShape) return parseLegacyStrategyAllocationPlan(value);
  const legacyEntryFilter =
    value.entryFilter === undefined || value.entryFilter === null
      ? null
      : parseMovingAverageSlopeFilter(value.entryFilter);
  if (
    value.entryFilter !== undefined &&
    value.entryFilter !== null &&
    !legacyEntryFilter
  ) {
    return null;
  }
  const parseSlotFilter = (slotValue: unknown) =>
    slotValue === undefined || slotValue === null
      ? null
      : parseMovingAverageSlopeFilter(slotValue);
  const strategyAEntryFilter = parseSlotFilter(
    value.strategyAEntryFilter,
  );
  const strategyBEntryFilter = parseSlotFilter(
    value.strategyBEntryFilter,
  );
  if (
    (value.strategyAEntryFilter !== undefined &&
      value.strategyAEntryFilter !== null &&
      !strategyAEntryFilter) ||
    (value.strategyBEntryFilter !== undefined &&
      value.strategyBEntryFilter !== null &&
      !strategyBEntryFilter)
  ) {
    return null;
  }
  const tacticalMode =
    value.tacticalMode === undefined
      ? DEFAULT_TACTICAL_ALLOCATION_MODE
      : TACTICAL_ALLOCATION_MODES.includes(
          value.tacticalMode as TacticalAllocationMode,
        )
        ? (value.tacticalMode as TacticalAllocationMode)
        : null;
  if (!tacticalMode) return null;

  return validatePlan(
    readStrategySelection(value.strategyA),
    readStrategySelection(value.strategyB),
    readFiniteNumber(value.strategyAAllocation, 0, 1),
    readFiniteNumber(value.strategyBAllocation, 0, 1),
    strategyAEntryFilter ?? legacyEntryFilter,
    strategyBEntryFilter ?? legacyEntryFilter,
    tacticalMode,
  );
}

function primarySelection(plan: StrategyAllocationPlan): StrategySelection {
  const selection = plan.strategyA ?? plan.strategyB;
  if (!selection) {
    throw new Error("A saved strategy plan requires one strategy");
  }
  return selection;
}

export function createSaveBacktestInput(
  instrument: MarketInstrument,
  interval: MarketInterval,
  plan: StrategyAllocationPlan,
  startDate: string,
  endDate: string,
  initialCash: number,
  commissionPercent: number,
  slippagePercent: number,
  result: BacktestPerformance,
  indicators: readonly IndicatorConfiguration[] = [],
): SaveBacktestInput {
  const primary = primarySelection(plan);
  return {
    instrument,
    interval,
    strategyId: primary.strategyId,
    parameters: { ...primary.parameters },
    plan: {
      strategyA: plan.strategyA
        ? {
            ...plan.strategyA,
            parameters: { ...plan.strategyA.parameters },
          }
        : null,
      strategyB: plan.strategyB
        ? {
            ...plan.strategyB,
            parameters: { ...plan.strategyB.parameters },
          }
        : null,
      strategyAAllocation: plan.strategyAAllocation,
      strategyBAllocation: plan.strategyBAllocation,
      tacticalMode: resolveTacticalAllocationMode(plan.tacticalMode),
      ...((plan.strategyAEntryFilter ?? plan.entryFilter)
        ? {
            strategyAEntryFilter: cloneMovingAverageSlopeFilter(
              plan.strategyAEntryFilter ?? plan.entryFilter,
            ),
          }
        : {}),
      ...((plan.strategyBEntryFilter ?? plan.entryFilter)
        ? {
            strategyBEntryFilter: cloneMovingAverageSlopeFilter(
              plan.strategyBEntryFilter ?? plan.entryFilter,
            ),
          }
        : {}),
    },
    indicators: indicators.map((indicator) => ({
      id: indicator.id,
      parameters: { ...indicator.parameters },
    })),
    startDate,
    endDate,
    initialCash,
    commissionPercent,
    slippagePercent,
    metrics: {
      totalReturn: result.totalReturn,
      maxDrawdown: result.maxDrawdown,
      sharpe: result.sharpe,
      tradeCount: result.tradeCount,
      score: result.score,
    },
  };
}

export function shouldReplaceSavedBacktest(
  existing: SavedBacktestRecord,
  input: SaveBacktestInput,
): boolean {
  const sameNumber = (left: number, right: number) =>
    Math.abs(left - right) < 1e-10;
  return (
    savedBacktestInstrumentKey(existing.instrument) ===
      savedBacktestInstrumentKey(input.instrument) &&
    existing.interval === input.interval &&
    sameNumber(existing.initialCash, input.initialCash) &&
    sameNumber(existing.commissionPercent, input.commissionPercent) &&
    sameNumber(existing.slippagePercent, input.slippagePercent) &&
    strategyPlansEqual(existing.plan, input.plan)
  );
}

export function parseSaveBacktestInput(
  value: unknown,
): SaveBacktestInput | null {
  if (!isRecord(value) || !isRecord(value.instrument)) return null;

  const secid = readString(value.instrument.secid, 40);
  const code = readString(value.instrument.code, 24);
  const name = readString(
    value.instrument.name,
    MAX_MARKET_INSTRUMENT_NAME_LENGTH,
  );
  const exchange = value.instrument.exchange as MarketExchange;
  const assetType = value.instrument.assetType as MarketAssetType;
  const provider = value.instrument.provider as MarketDataProvider;
  const interval = value.interval as MarketInterval;
  const strategyId = value.strategyId as StrategyId;
  const parameters = readParameters(value.parameters);
  const indicators =
    value.indicators === undefined
      ? []
      : parseIndicatorConfigurations(value.indicators);
  const startDate = readString(value.startDate, 10);
  const endDate = readString(value.endDate, 10);
  const initialCash = readFiniteNumber(value.initialCash, 1, 1_000_000_000_000);
  const commissionPercent = readFiniteNumber(
    value.commissionPercent,
    0,
    100,
  );
  const slippagePercent = readFiniteNumber(value.slippagePercent, 0, 100);

  if (
    !secid ||
    !code ||
    !name ||
    !exchanges.has(exchange) ||
    !assetTypes.has(assetType) ||
    !providers.has(provider) ||
    !intervals.has(interval) ||
    !strategyIds.has(strategyId) ||
    !parameters ||
    indicators === null ||
    !isValidStrategyParameters(strategyId, parameters) ||
    !startDate ||
    !endDate ||
    !datePattern.test(startDate) ||
    !datePattern.test(endDate) ||
    startDate > endDate ||
    initialCash === null ||
    commissionPercent === null ||
    slippagePercent === null ||
    !isRecord(value.metrics)
  ) {
    return null;
  }
  const plan =
    value.plan === undefined
      ? buildLegacyStrategyPlan(strategyId, parameters)
      : parseStrategyAllocationPlan(value.plan);
  if (!plan) return null;

  const totalReturn = readFiniteNumber(value.metrics.totalReturn);
  const maxDrawdown = readFiniteNumber(value.metrics.maxDrawdown);
  const sharpe = readFiniteNumber(value.metrics.sharpe);
  const tradeCount = readFiniteNumber(value.metrics.tradeCount, 0, 1_000_000);
  const score = readFiniteNumber(value.metrics.score);
  if (
    totalReturn === null ||
    maxDrawdown === null ||
    sharpe === null ||
    tradeCount === null ||
    !Number.isInteger(tradeCount) ||
    score === null
  ) {
    return null;
  }

  return {
    instrument: {
      secid,
      code,
      name,
      exchange,
      assetType,
      provider,
    },
    interval,
    strategyId,
    parameters,
    plan,
    indicators,
    startDate,
    endDate,
    initialCash,
    commissionPercent,
    slippagePercent,
    metrics: {
      totalReturn,
      maxDrawdown,
      sharpe,
      tradeCount,
      score,
    },
  };
}
