import type {
  MarketBar,
  MarketInterval,
} from "@/lib/market/types";
import {
  runBacktest,
  type BacktestResult,
  type BacktestSettings,
} from "./backtest";
import type { StrategyId, StrategyParameters } from "./strategies";

export interface ScreeningCandidate {
  strategyId: StrategyId;
  parameters: StrategyParameters;
}

export const SCREENING_CANDIDATES: ScreeningCandidate[] = [
  { strategyId: "sma-cross", parameters: { fast: 5, slow: 20 } },
  { strategyId: "sma-cross", parameters: { fast: 10, slow: 30 } },
  { strategyId: "sma-cross", parameters: { fast: 20, slow: 60 } },
  { strategyId: "ema-cross", parameters: { fast: 5, slow: 20 } },
  { strategyId: "ema-cross", parameters: { fast: 12, slow: 26 } },
  { strategyId: "ema-cross", parameters: { fast: 20, slow: 50 } },
  {
    strategyId: "rsi-reversal",
    parameters: { period: 7, entry: 25, exit: 60 },
  },
  {
    strategyId: "rsi-reversal",
    parameters: { period: 14, entry: 30, exit: 65 },
  },
  {
    strategyId: "rsi-reversal",
    parameters: { period: 21, entry: 35, exit: 70 },
  },
  {
    strategyId: "macd-momentum",
    parameters: { fast: 6, slow: 19, signal: 5 },
  },
  {
    strategyId: "macd-momentum",
    parameters: { fast: 12, slow: 26, signal: 9 },
  },
  {
    strategyId: "macd-momentum",
    parameters: { fast: 19, slow: 39, signal: 9 },
  },
  {
    strategyId: "bollinger-reversion",
    parameters: { period: 14, width: 1.8 },
  },
  {
    strategyId: "bollinger-reversion",
    parameters: { period: 20, width: 2 },
  },
  {
    strategyId: "bollinger-reversion",
    parameters: { period: 30, width: 2.2 },
  },
  {
    strategyId: "donchian-breakout",
    parameters: { entryPeriod: 10, exitPeriod: 5 },
  },
  {
    strategyId: "donchian-breakout",
    parameters: { entryPeriod: 20, exitPeriod: 10 },
  },
  {
    strategyId: "donchian-breakout",
    parameters: { entryPeriod: 55, exitPeriod: 20 },
  },
];

export function screenStrategies(
  bars: MarketBar[],
  settings: Omit<BacktestSettings, "interval"> & {
    interval: MarketInterval;
  },
): BacktestResult[] {
  return SCREENING_CANDIDATES.map((candidate) => {
    try {
      return runBacktest(
        bars,
        candidate.strategyId,
        candidate.parameters,
        settings,
      );
    } catch {
      return null;
    }
  })
    .filter((result): result is BacktestResult => Boolean(result))
    .sort((left, right) => right.score - left.score);
}

