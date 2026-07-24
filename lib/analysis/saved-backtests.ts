import type { BacktestResult } from "./backtest";
import {
  STRATEGIES,
  type StrategyId,
  type StrategyParameters,
} from "./strategies";
import type {
  MarketAssetType,
  MarketDataProvider,
  MarketExchange,
  MarketInstrument,
  MarketInterval,
} from "@/lib/market/types";

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

const assetTypes = new Set<MarketAssetType>(["index", "etf"]);
const providers = new Set<MarketDataProvider>([
  "eastmoney",
  "yahoo",
  "nasdaq",
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

export function createSaveBacktestInput(
  instrument: MarketInstrument,
  interval: MarketInterval,
  strategyId: StrategyId,
  parameters: StrategyParameters,
  startDate: string,
  endDate: string,
  initialCash: number,
  commissionPercent: number,
  slippagePercent: number,
  result: BacktestResult,
): SaveBacktestInput {
  return {
    instrument,
    interval,
    strategyId,
    parameters: { ...parameters },
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
  const name = readString(value.instrument.name, 80);
  const exchange = value.instrument.exchange as MarketExchange;
  const assetType = value.instrument.assetType as MarketAssetType;
  const provider = value.instrument.provider as MarketDataProvider;
  const interval = value.interval as MarketInterval;
  const strategyId = value.strategyId as StrategyId;
  const parameters = readParameters(value.parameters);
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
