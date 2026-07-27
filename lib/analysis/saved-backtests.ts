import type { BacktestPerformance } from "./backtest";
import {
  parseIndicatorConfigurations,
  type IndicatorConfiguration,
} from "./indicator-registry";
import { isValidStrategyParameters } from "./screening";
import type {
  StrategyAllocationPlan,
  StrategySelection,
} from "./strategy-combinations";
import {
  STRATEGIES,
  getStrategy,
  type StrategyId,
  type StrategyParameters,
} from "./strategies";
import {
  MAX_MARKET_INSTRUMENT_NAME_LENGTH,
  type MarketAssetType,
  type MarketDataProvider,
  type MarketExchange,
  type MarketInstrument,
  type MarketInterval,
  type MarketSeries,
} from "@/lib/market/types";
import {
  cloneMovingAverageSlopeFilter,
  movingAverageSlopeFiltersEqual,
  parseMovingAverageSlopeFilter,
  type MovingAverageSlopeFilter,
} from "./entry-filter";

export const MAX_SAVED_BACKTEST_SCROLL_RECORDS = 200;

export interface SavedBacktestMetrics {
  totalReturn: number;
  maxDrawdown: number;
  sharpe: number;
  tradeCount: number;
  score: number;
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
  createdAt: string;
  updatedAt: string;
}

export interface SavedBacktestGroup {
  key: string;
  instrument: MarketInstrument;
  records: SavedBacktestRecord[];
}

export interface SavedBacktestOrderInput {
  orderedIds: number[];
}

export function savedBacktestInstrumentKey(
  instrument: MarketInstrument,
): string {
  const normalizedCode = instrument.code
    .replace(/^\^/, "")
    .replace(/\.(SS|SZ|HK)$/i, "")
    .toUpperCase();
  return `${instrument.assetType}:${normalizedCode}`;
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

const assetTypes = new Set<MarketAssetType>([
  "index",
  "etf",
  "commodity",
]);
const providers = new Set<MarketDataProvider>([
  "eastmoney",
  "yahoo",
  "nasdaq",
  "eodhd",
]);
const exchanges = new Set<MarketExchange>([
  "SSE",
  "SZSE",
  "JPX",
  "PHLX",
  "NYSE_ARCA",
  "NASDAQ",
  "HKEX",
  "OTHER",
]);
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
  entryFilter: MovingAverageSlopeFilter | null = null,
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
    ...(entryFilter
      ? { entryFilter: cloneMovingAverageSlopeFilter(entryFilter) }
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
    movingAverageSlopeFiltersEqual(left.entryFilter, right.entryFilter)
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
  const entryFilter =
    value.entryFilter === undefined || value.entryFilter === null
      ? null
      : parseMovingAverageSlopeFilter(value.entryFilter);
  if (value.entryFilter !== undefined && value.entryFilter !== null && !entryFilter) {
    return null;
  }

  return validatePlan(
    readStrategySelection(value.strategyA),
    readStrategySelection(value.strategyB),
    readFiniteNumber(value.strategyAAllocation, 0, 1),
    readFiniteNumber(value.strategyBAllocation, 0, 1),
    entryFilter,
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
      ...(plan.entryFilter
        ? {
            entryFilter: cloneMovingAverageSlopeFilter(
              plan.entryFilter,
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
