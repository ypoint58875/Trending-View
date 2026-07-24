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
  {
    strategyId: "kdj-reversal",
    parameters: { period: 7, entry: 30, exit: 65 },
  },
  {
    strategyId: "kdj-reversal",
    parameters: { period: 9, entry: 35, exit: 65 },
  },
  {
    strategyId: "kdj-reversal",
    parameters: { period: 14, entry: 40, exit: 70 },
  },
  {
    strategyId: "supertrend-trend",
    parameters: { period: 7, multiplier: 2 },
  },
  {
    strategyId: "supertrend-trend",
    parameters: { period: 10, multiplier: 3 },
  },
  {
    strategyId: "supertrend-trend",
    parameters: { period: 14, multiplier: 4 },
  },
  {
    strategyId: "ichimoku-trend",
    parameters: {
      conversionPeriod: 6,
      basePeriod: 18,
      spanPeriod: 36,
    },
  },
  {
    strategyId: "ichimoku-trend",
    parameters: {
      conversionPeriod: 9,
      basePeriod: 26,
      spanPeriod: 52,
    },
  },
  {
    strategyId: "ichimoku-trend",
    parameters: {
      conversionPeriod: 12,
      basePeriod: 30,
      spanPeriod: 60,
    },
  },
  {
    strategyId: "mfi-reversal",
    parameters: { period: 10, entry: 15, exit: 55 },
  },
  {
    strategyId: "mfi-reversal",
    parameters: { period: 14, entry: 20, exit: 60 },
  },
  {
    strategyId: "mfi-reversal",
    parameters: { period: 21, entry: 25, exit: 65 },
  },
  {
    strategyId: "roc-momentum",
    parameters: { period: 6, entry: 1, exit: -1 },
  },
  {
    strategyId: "roc-momentum",
    parameters: { period: 12, entry: 2, exit: 0 },
  },
  {
    strategyId: "roc-momentum",
    parameters: { period: 20, entry: 3, exit: 1 },
  },
  {
    strategyId: "vwap-reversion",
    parameters: { entryPercent: 0.5, exitPercent: 0 },
  },
  {
    strategyId: "vwap-reversion",
    parameters: { entryPercent: 1.5, exitPercent: 0 },
  },
  {
    strategyId: "vwap-reversion",
    parameters: { entryPercent: 2.5, exitPercent: 0.5 },
  },
  {
    strategyId: "tv-bar-up-down",
    parameters: { minimumBodyPercent: 0 },
  },
  {
    strategyId: "tv-bar-up-down",
    parameters: { minimumBodyPercent: 0.2 },
  },
  {
    strategyId: "tv-bar-up-down",
    parameters: { minimumBodyPercent: 0.5 },
  },
  {
    strategyId: "tv-bollinger-bands",
    parameters: { period: 14, width: 1.8 },
  },
  {
    strategyId: "tv-bollinger-bands",
    parameters: { period: 20, width: 2 },
  },
  {
    strategyId: "tv-bollinger-bands",
    parameters: { period: 30, width: 2.5 },
  },
  {
    strategyId: "tv-bollinger-directed",
    parameters: { period: 14, width: 1.8 },
  },
  {
    strategyId: "tv-bollinger-directed",
    parameters: { period: 20, width: 2 },
  },
  {
    strategyId: "tv-bollinger-directed",
    parameters: { period: 30, width: 2.5 },
  },
  { strategyId: "tv-channel-breakout", parameters: { length: 5 } },
  { strategyId: "tv-channel-breakout", parameters: { length: 20 } },
  { strategyId: "tv-channel-breakout", parameters: { length: 55 } },
  {
    strategyId: "tv-consecutive-up-down",
    parameters: { upBars: 2, downBars: 2 },
  },
  {
    strategyId: "tv-consecutive-up-down",
    parameters: { upBars: 3, downBars: 3 },
  },
  {
    strategyId: "tv-consecutive-up-down",
    parameters: { upBars: 5, downBars: 5 },
  },
  {
    strategyId: "tv-greedy",
    parameters: { minimumBodyPercent: 0 },
  },
  {
    strategyId: "tv-greedy",
    parameters: { minimumBodyPercent: 0.2 },
  },
  {
    strategyId: "tv-greedy",
    parameters: { minimumBodyPercent: 0.5 },
  },
  {
    strategyId: "tv-inside-bar",
    parameters: { minimumBodyPercent: 0 },
  },
  {
    strategyId: "tv-inside-bar",
    parameters: { minimumBodyPercent: 0.1 },
  },
  {
    strategyId: "tv-inside-bar",
    parameters: { minimumBodyPercent: 0.3 },
  },
  {
    strategyId: "tv-keltner-channels",
    parameters: { period: 14, multiplier: 1.5 },
  },
  {
    strategyId: "tv-keltner-channels",
    parameters: { period: 20, multiplier: 2 },
  },
  {
    strategyId: "tv-keltner-channels",
    parameters: { period: 30, multiplier: 2.5 },
  },
  {
    strategyId: "tv-macd",
    parameters: { fast: 6, slow: 19, signal: 5 },
  },
  {
    strategyId: "tv-macd",
    parameters: { fast: 12, slow: 26, signal: 9 },
  },
  {
    strategyId: "tv-macd",
    parameters: { fast: 19, slow: 39, signal: 9 },
  },
  { strategyId: "tv-momentum", parameters: { period: 6 } },
  { strategyId: "tv-momentum", parameters: { period: 12 } },
  { strategyId: "tv-momentum", parameters: { period: 20 } },
  {
    strategyId: "tv-outside-bar",
    parameters: { minimumBodyPercent: 0 },
  },
  {
    strategyId: "tv-outside-bar",
    parameters: { minimumBodyPercent: 0.1 },
  },
  {
    strategyId: "tv-outside-bar",
    parameters: { minimumBodyPercent: 0.3 },
  },
  {
    strategyId: "tv-parabolic-sar",
    parameters: { start: 0.01, increment: 0.01, maximum: 0.1 },
  },
  {
    strategyId: "tv-parabolic-sar",
    parameters: { start: 0.02, increment: 0.02, maximum: 0.2 },
  },
  {
    strategyId: "tv-parabolic-sar",
    parameters: { start: 0.03, increment: 0.03, maximum: 0.3 },
  },
  {
    strategyId: "tv-pivot-extension",
    parameters: { leftBars: 2, rightBars: 1 },
  },
  {
    strategyId: "tv-pivot-extension",
    parameters: { leftBars: 4, rightBars: 2 },
  },
  {
    strategyId: "tv-pivot-extension",
    parameters: { leftBars: 8, rightBars: 4 },
  },
  {
    strategyId: "tv-pivot-reversal",
    parameters: { leftBars: 2, rightBars: 1 },
  },
  {
    strategyId: "tv-pivot-reversal",
    parameters: { leftBars: 4, rightBars: 2 },
  },
  {
    strategyId: "tv-pivot-reversal",
    parameters: { leftBars: 8, rightBars: 4 },
  },
  { strategyId: "tv-price-channel", parameters: { length: 10 } },
  { strategyId: "tv-price-channel", parameters: { length: 20 } },
  { strategyId: "tv-price-channel", parameters: { length: 55 } },
  {
    strategyId: "tv-rsi",
    parameters: { period: 7, oversold: 25, overbought: 75 },
  },
  {
    strategyId: "tv-rsi",
    parameters: { period: 14, oversold: 30, overbought: 70 },
  },
  {
    strategyId: "tv-rsi",
    parameters: { period: 21, oversold: 35, overbought: 65 },
  },
  {
    strategyId: "tv-stochastic-slow",
    parameters: { period: 9, smoothK: 3, smoothD: 3 },
  },
  {
    strategyId: "tv-stochastic-slow",
    parameters: { period: 14, smoothK: 3, smoothD: 3 },
  },
  {
    strategyId: "tv-stochastic-slow",
    parameters: { period: 21, smoothK: 3, smoothD: 3 },
  },
  {
    strategyId: "tv-supertrend",
    parameters: { period: 7, multiplier: 2 },
  },
  {
    strategyId: "tv-supertrend",
    parameters: { period: 10, multiplier: 3 },
  },
  {
    strategyId: "tv-supertrend",
    parameters: { period: 14, multiplier: 4 },
  },
  {
    strategyId: "tv-technical-ratings",
    parameters: { threshold: 3 },
  },
  {
    strategyId: "tv-technical-ratings",
    parameters: { threshold: 4 },
  },
  {
    strategyId: "tv-technical-ratings",
    parameters: { threshold: 5 },
  },
  {
    strategyId: "tv-volty-expan-close",
    parameters: { period: 20, multiplier: 2.5 },
  },
  {
    strategyId: "tv-volty-expan-close",
    parameters: { period: 5, multiplier: 1.5 },
  },
  {
    strategyId: "tv-volty-expan-close",
    parameters: { period: 14, multiplier: 2 },
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
