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
  executionPolicy?: "hybrid" | "next-open";
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
  exitReason: "strategy" | "range-end";
}

export interface BacktestPerformance {
  totalReturn: number;
  annualizedReturn: number;
  benchmarkReturn: number;
  maxDrawdown: number;
  sharpe: number;
  tradeCount: number;
  finalEquity: number;
  score: number;
  equity: EquityPoint[];
}

export interface BacktestResult extends BacktestPerformance {
  strategyId: StrategyId;
  parameters: StrategyParameters;
  winRate: number;
  profitFactor: number;
  trades: BacktestTrade[];
}

export interface AllocationRebalance {
  time: string;
  fromAllocation: number;
  targetAllocation: number;
  fillPrice: number;
  reason: "strategy" | "range-end";
  signals?: AllocationSignalEvent[];
}

export interface AllocationBacktestResult extends BacktestPerformance {
  rebalances: AllocationRebalance[];
}

export type AllocationSignalEvent =
  | "long-entry"
  | "long-exit"
  | "short-entry"
  | "short-exit";

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

function summarizePerformance(
  finalCash: number,
  equity: EquityPoint[],
  bars: MarketBar[],
  tradeCount: number,
  settings: BacktestSettings,
): BacktestPerformance {
  let peak = 0;
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
  const totalReturn = ((finalCash - initialCash) / initialCash) * 100;
  const elapsedYears =
    (bars[bars.length - 1].timestamp - bars[0].timestamp) /
    (365.25 * 24 * 60 * 60 * 1000);
  const annualizedReturn =
    elapsedYears > 0
      ? (Math.pow(
          Math.max(finalCash / initialCash, 0.0001),
          1 / elapsedYears,
        ) -
          1) *
        100
      : totalReturn;
  const maxDrawdown = Math.min(...equity.map((point) => point.drawdown));
  const firstBar = bars[0];
  const lastBar = bars[bars.length - 1];
  const commissionRate = Math.max(settings.commissionRate, 0);
  const slippageRate = Math.max(settings.slippageRate, 0);
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
    Math.min(tradeCount, 20) * 0.2;

  return {
    totalReturn,
    annualizedReturn,
    benchmarkReturn,
    maxDrawdown,
    sharpe,
    tradeCount,
    finalEquity: finalCash,
    score,
    equity,
  };
}

function clampAllocation(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

export function runAllocationBacktest(
  allBars: MarketBar[],
  fullTarget: number[],
  settings: BacktestSettings,
  fullSignalEvents?: readonly (readonly AllocationSignalEvent[])[],
): AllocationBacktestResult {
  if (fullTarget.length !== allBars.length) {
    throw new Error("Allocation target must align with market bars");
  }
  if (fullSignalEvents && fullSignalEvents.length !== allBars.length) {
    throw new Error("Allocation signal events must align with market bars");
  }

  const indexedBars = allBars
    .map((bar, index) => ({
      bar,
      target: clampAllocation(fullTarget[index] ?? 0),
      signals: fullSignalEvents?.[index] ?? [],
    }))
    .filter(({ bar }) =>
      filterRange([bar], settings.startTime, settings.endTime).length,
    );
  if (indexedBars.length < 3) {
    throw new Error("Backtest requires at least three bars in the selected range");
  }

  let cash = Math.max(settings.initialCash, 1);
  let units = 0;
  let peak = cash;
  const commissionRate = Math.max(settings.commissionRate, 0);
  const slippageRate = Math.max(settings.slippageRate, 0);
  const equity: EquityPoint[] = [];
  const rebalances: AllocationRebalance[] = [];

  const rebalanceAtOpen = (
    bar: MarketBar,
    targetAllocation: number,
    signals: readonly AllocationSignalEvent[],
  ) => {
    const equityAtOpen = cash + units * bar.open;
    if (equityAtOpen <= 0 || bar.open <= 0) return;
    const fromAllocation = clampAllocation(
      (units * bar.open) / equityAtOpen,
    );
    const desiredUnits = (equityAtOpen * targetAllocation) / bar.open;
    const unitDelta = desiredUnits - units;
    const tolerance = Math.max(desiredUnits, units, 1) * 1e-10;

    if (unitDelta > tolerance) {
      const fillPrice = bar.open * (1 + slippageRate);
      const unitCost = fillPrice * (1 + commissionRate);
      const boughtUnits = Math.min(unitDelta, cash / unitCost);
      if (boughtUnits <= tolerance) return;
      cash -= boughtUnits * unitCost;
      units += boughtUnits;
      rebalances.push({
        time: bar.time,
        fromAllocation,
        targetAllocation,
        fillPrice,
        reason: "strategy",
        signals: [...signals],
      });
    } else if (unitDelta < -tolerance) {
      const fillPrice = bar.open * (1 - slippageRate);
      const soldUnits = Math.min(-unitDelta, units);
      if (soldUnits <= tolerance) return;
      cash += soldUnits * fillPrice * (1 - commissionRate);
      units -= soldUnits;
      rebalances.push({
        time: bar.time,
        fromAllocation,
        targetAllocation,
        fillPrice,
        reason: "strategy",
        signals: [...signals],
      });
    }
  };

  for (let index = 0; index < indexedBars.length; index += 1) {
    const { bar } = indexedBars[index];
    if (index > 0) {
      rebalanceAtOpen(
        bar,
        indexedBars[index - 1].target,
        indexedBars[index - 1].signals,
      );
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
    const equityBeforeClose = cash + units * lastBar.close;
    const fromAllocation = clampAllocation(
      (units * lastBar.close) / equityBeforeClose,
    );
    const fillPrice = lastBar.close * (1 - slippageRate);
    cash += units * fillPrice * (1 - commissionRate);
    units = 0;
    rebalances.push({
      time: lastBar.time,
      fromAllocation,
      targetAllocation: 0,
      fillPrice,
      reason: "range-end",
      signals: [],
    });
    equity[equity.length - 1].equity = cash;
  }

  return {
    ...summarizePerformance(
      cash,
      equity,
      indexedBars.map(({ bar }) => bar),
      rebalances.length,
      settings,
    ),
    rebalances,
  };
}

export function runBacktest(
  allBars: MarketBar[],
  strategyId: StrategyId,
  parameters: StrategyParameters,
  settings: BacktestSettings,
): BacktestResult {
  const strategy = getStrategy(strategyId);
  const fullTarget = strategy.buildTarget(allBars, parameters);
  const fullOrders =
    settings.executionPolicy === "next-open"
      ? undefined
      : strategy.buildOrders?.(allBars, parameters);
  if (fullOrders && fullOrders.length !== allBars.length) {
    throw new Error("Strategy order plan must align with market bars");
  }
  const indexedBars = allBars
    .map((bar, index) => ({
      bar,
      target: (fullTarget[index] ?? 0) > 0 ? 1 : 0,
      orders: fullOrders?.[index],
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

  const closePosition = (
    marketPrice: number,
    exitTime: string,
    exitReason: BacktestTrade["exitReason"] = "strategy",
  ) => {
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
      exitReason,
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
    const { bar, orders } = indexedBars[index];

    if (orders) {
      if (
        units > 0 &&
        orders.exitStop !== null &&
        Number.isFinite(orders.exitStop) &&
        bar.low <= orders.exitStop
      ) {
        closePosition(Math.min(bar.open, orders.exitStop), bar.time);
      } else if (
        units === 0 &&
        orders.entryStop !== null &&
        Number.isFinite(orders.entryStop) &&
        bar.high >= orders.entryStop
      ) {
        openPosition(Math.max(bar.open, orders.entryStop), bar.time);
      }
    } else if (index > 0) {
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
    closePosition(lastBar.close, lastBar.time, "range-end");
    equity[equity.length - 1].equity = cash;
  }

  const winningTrades = trades.filter((trade) => trade.returnPercent > 0);
  const losingTrades = trades.filter((trade) => trade.returnPercent < 0);
  const grossProfit = winningTrades.reduce(
    (sum, trade) => sum + trade.returnPercent,
    0,
  );
  const grossLoss = Math.abs(
    losingTrades.reduce((sum, trade) => sum + trade.returnPercent, 0),
  );
  const performance = summarizePerformance(
    cash,
    equity,
    indexedBars.map(({ bar }) => bar),
    trades.length,
    settings,
  );

  return {
    strategyId,
    parameters,
    ...performance,
    winRate:
      trades.length === 0 ? 0 : (winningTrades.length / trades.length) * 100,
    profitFactor:
      grossLoss === 0 ? (grossProfit > 0 ? 99 : 0) : grossProfit / grossLoss,
    trades,
  };
}
