import type {
  MarketBar,
  MarketInterval,
} from "@/lib/market/types";
import {
  getStrategy,
  type StrategyId,
  type StrategyParameters,
} from "./strategies";

export interface BacktestSettings {
  initialCash: number;
  commissionRate: number;
  slippageRate: number;
  startTime?: string;
  endTime?: string;
  interval: MarketInterval;
}

export interface EquityPoint {
  time: string;
  equity: number;
  drawdown: number;
}

export interface BacktestTrade {
  entryTime: string;
  exitTime: string;
  entryPrice: number;
  exitPrice: number;
  returnPercent: number;
}

export interface BacktestResult {
  strategyId: StrategyId;
  parameters: StrategyParameters;
  totalReturn: number;
  annualizedReturn: number;
  benchmarkReturn: number;
  maxDrawdown: number;
  sharpe: number;
  winRate: number;
  profitFactor: number;
  tradeCount: number;
  finalEquity: number;
  score: number;
  equity: EquityPoint[];
  trades: BacktestTrade[];
}

const periodsPerYear: Record<MarketInterval, number> = {
  "1m": 60_480,
  "5m": 12_096,
  "15m": 4_032,
  "30m": 2_016,
  "60m": 1_008,
  "1d": 252,
};

function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

function filterRange(bars: MarketBar[], startTime?: string, endTime?: string) {
  const start = startTime ? Date.parse(`${startTime}T00:00:00+08:00`) : -Infinity;
  const end = endTime
    ? Date.parse(`${endTime}T23:59:59+08:00`)
    : Infinity;
  return bars.filter((bar) => bar.timestamp >= start && bar.timestamp <= end);
}

export function runBacktest(
  allBars: MarketBar[],
  strategyId: StrategyId,
  parameters: StrategyParameters,
  settings: BacktestSettings,
): BacktestResult {
  const strategy = getStrategy(strategyId);
  const fullTarget = strategy.buildTarget(allBars, parameters);
  const indexedBars = allBars
    .map((bar, index) => ({
      bar,
      target: (fullTarget[index] ?? 0) > 0 ? 1 : 0,
    }))
    .filter(({ bar }) => filterRange([bar], settings.startTime, settings.endTime).length);

  if (indexedBars.length < 3) {
    throw new Error("Backtest requires at least three bars in the selected range");
  }

  let cash = Math.max(settings.initialCash, 1);
  let units = 0;
  let entryPrice = 0;
  let entryTime = "";
  let entryCost = 0;
  const commissionRate = Math.max(settings.commissionRate, 0);
  const slippageRate = Math.max(settings.slippageRate, 0);
  let peak = cash;
  const trades: BacktestTrade[] = [];
  const equity: EquityPoint[] = [];

  const closePosition = (marketPrice: number, exitTime: string) => {
    if (units === 0) return;

    const fillPrice = marketPrice * (1 - slippageRate);
    const proceeds = units * fillPrice;
    const fee = proceeds * commissionRate;
    cash += proceeds - fee;
    trades.push({
      entryTime,
      exitTime,
      entryPrice,
      exitPrice: fillPrice,
      returnPercent:
        ((proceeds - fee - entryCost) / Math.max(entryCost, 1)) * 100,
    });
    units = 0;
    entryPrice = 0;
    entryTime = "";
    entryCost = 0;
  };

  const openPosition = (marketPrice: number, nextEntryTime: string) => {
    if (cash <= 0) return;
    const fillPrice = marketPrice * (1 + slippageRate);
    units = cash / (fillPrice * (1 + commissionRate));
    const entryNotional = units * fillPrice;
    const fee = entryNotional * commissionRate;
    entryCost = entryNotional + fee;
    cash -= entryCost;
    entryPrice = fillPrice;
    entryTime = nextEntryTime;
  };

  for (let index = 0; index < indexedBars.length; index += 1) {
    const { bar } = indexedBars[index];

    if (index > 0) {
      const priorTarget = indexedBars[index - 1].target;
      if (priorTarget === 1 && units === 0) {
        openPosition(bar.open, bar.time);
      } else if (priorTarget === 0 && units > 0) {
        closePosition(bar.open, bar.time);
      }
    }

    const currentEquity = cash + units * bar.close;
    peak = Math.max(peak, currentEquity);
    equity.push({
      time: bar.time,
      equity: currentEquity,
      drawdown: peak === 0 ? 0 : ((currentEquity - peak) / peak) * 100,
    });
  }

  if (units > 0) {
    const lastBar = indexedBars[indexedBars.length - 1].bar;
    closePosition(lastBar.close, lastBar.time);
    equity[equity.length - 1].equity = cash;
  }

  peak = 0;
  equity.forEach((point) => {
    peak = Math.max(peak, point.equity);
    point.drawdown = peak === 0 ? 0 : ((point.equity - peak) / peak) * 100;
  });

  const returns = equity
    .slice(1)
    .map((point, index) => point.equity / equity[index].equity - 1)
    .filter(Number.isFinite);
  const meanReturn =
    returns.reduce((sum, value) => sum + value, 0) / Math.max(returns.length, 1);
  const deviation = standardDeviation(returns);
  const sharpe =
    deviation === 0
      ? 0
      : (meanReturn / deviation) * Math.sqrt(periodsPerYear[settings.interval]);
  const initialCash = Math.max(settings.initialCash, 1);
  const totalReturn = ((cash - initialCash) / initialCash) * 100;
  const elapsedYears =
    (indexedBars[indexedBars.length - 1].bar.timestamp -
      indexedBars[0].bar.timestamp) /
    (365.25 * 24 * 60 * 60 * 1000);
  const annualizedReturn =
    elapsedYears > 0
      ? (Math.pow(Math.max(cash / initialCash, 0.0001), 1 / elapsedYears) - 1) *
        100
      : totalReturn;
  const maxDrawdown = Math.min(...equity.map((point) => point.drawdown));
  const winningTrades = trades.filter((trade) => trade.returnPercent > 0);
  const losingTrades = trades.filter((trade) => trade.returnPercent < 0);
  const grossProfit = winningTrades.reduce(
    (sum, trade) => sum + trade.returnPercent,
    0,
  );
  const grossLoss = Math.abs(
    losingTrades.reduce((sum, trade) => sum + trade.returnPercent, 0),
  );
  const firstBar = indexedBars[0].bar;
  const lastBar = indexedBars[indexedBars.length - 1].bar;
  const benchmarkReturn =
    ((lastBar.close * (1 - slippageRate) -
      firstBar.open * (1 + slippageRate)) /
      (firstBar.open * (1 + slippageRate))) *
      100 -
    commissionRate * 200;
  const score =
    totalReturn * 0.45 +
    Math.max(Math.min(sharpe, 5), -5) * 8 +
    maxDrawdown * 0.35 +
    Math.min(trades.length, 20) * 0.2;

  return {
    strategyId,
    parameters,
    totalReturn,
    annualizedReturn,
    benchmarkReturn,
    maxDrawdown,
    sharpe,
    winRate:
      trades.length === 0 ? 0 : (winningTrades.length / trades.length) * 100,
    profitFactor:
      grossLoss === 0 ? (grossProfit > 0 ? 99 : 0) : grossProfit / grossLoss,
    tradeCount: trades.length,
    finalEquity: cash,
    score,
    equity,
    trades,
  };
}
