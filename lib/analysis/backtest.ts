import type {
  MarketBar,
  MarketInterval,
} from "@/lib/market/types";
import {
  getStrategy,
  type StrategyId,
  type StrategyParameters,
} from "./strategies";
import {
  buildStrategyOrderTimeline,
  resolveStrategyOrderFills,
} from "./strategy-execution";
import type { StrategyOrderSeries } from "./strategy-orders";
import {
  applyMovingAverageSlopeEntryFilter,
  cloneMovingAverageSlopeFilter,
  resolveMovingAverageEntryAllowedSeries,
  type MovingAverageSlopeFilter,
} from "./entry-filter";
import {
  buildIntradaySessionMetadata,
  DEFAULT_INTRADAY_ENTRY_CUTOFF_BARS,
  intradaySessionKey,
} from "./intraday";

export interface BacktestSettings {
  initialCash: number;
  commissionRate: number;
  slippageRate: number;
  startTime?: string;
  endTime?: string;
  interval: MarketInterval;
  executionPolicy?: "hybrid" | "next-open";
  entryFilter?: MovingAverageSlopeFilter | null;
  entryFilterAllowed?: readonly boolean[];
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
  exitReason: "strategy" | "range-end" | "session-end";
}

export interface BacktestOpenPosition {
  entryTime: string;
  entryPrice: number;
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
  openPosition?: BacktestOpenPosition | null;
  entryFilter?: MovingAverageSlopeFilter | null;
}

export interface AllocationRebalance {
  time: string;
  fromAllocation: number;
  targetAllocation: number;
  fillPrice: number;
  reason: "strategy" | "range-end" | "session-end";
  signals?: AllocationSignalEvent[];
}

export interface AllocationIntrabarExecution {
  targetAllocation: number;
  fillPrice: number;
  signals: AllocationSignalEvent[];
}

export interface AllocationBacktestResult extends BacktestPerformance {
  rebalances: AllocationRebalance[];
  openingPosition?: AllocationOpeningPosition | null;
}

export interface AllocationOpeningPosition {
  time: string;
  price: number;
  allocation: number;
}

export type AllocationSignalEvent =
  | "long-entry"
  | "long-exit"
  | "short-entry"
  | "short-exit";

function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

function filterRange(bars: MarketBar[], startTime?: string, endTime?: string) {
  const normalize = (value: string) => value.replace("T", " ");
  const start = startTime ? normalize(startTime) : "";
  const end = endTime
    ? endTime.length === 10
      ? `${endTime} 23:59`
      : normalize(endTime)
    : "";
  return bars.filter((bar) => {
    const time = normalize(bar.time);
    return (!start || time >= start) && (!end || time <= end);
  });
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

  const intraday = settings.interval !== "1d";
  const sessionEndEquity = intraday
    ? equity.filter(
        (point, index) =>
          index === equity.length - 1 ||
          point.time.slice(0, 10) !== equity[index + 1]!.time.slice(0, 10),
      )
    : equity;
  const returns = intraday
    ? sessionEndEquity
        .map((point, index) =>
          point.equity /
            (index === 0
              ? Math.max(settings.initialCash, 1)
              : sessionEndEquity[index - 1]!.equity) -
          1,
        )
        .filter(Number.isFinite)
    : equity
        .slice(1)
        .map((point, index) => point.equity / equity[index]!.equity - 1)
        .filter(Number.isFinite);
  const meanReturn =
    returns.reduce((sum, value) => sum + value, 0) / Math.max(returns.length, 1);
  const deviation = standardDeviation(returns);
  const sharpe =
    deviation === 0
      ? 0
      : (meanReturn / deviation) * Math.sqrt(252);
  const initialCash = Math.max(settings.initialCash, 1);
  const totalReturn = ((finalCash - initialCash) / initialCash) * 100;
  const elapsedYears = intraday
    ? sessionEndEquity.length / 252
    : (bars[bars.length - 1]!.timestamp - bars[0]!.timestamp) /
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
  const firstBar = bars[0]!;
  const lastBar = bars[bars.length - 1]!;
  const commissionRate = Math.max(settings.commissionRate, 0);
  const slippageRate = Math.max(settings.slippageRate, 0);
  let benchmarkReturn: number;
  if (intraday) {
    let benchmarkEquity = 1;
    let sessionStart = 0;
    for (let index = 1; index <= bars.length; index += 1) {
      if (
        index < bars.length &&
        intradaySessionKey(bars[index]!) ===
          intradaySessionKey(bars[sessionStart]!)
      ) {
        continue;
      }
      const sessionFirst = bars[sessionStart]!;
      const sessionLast = bars[index - 1]!;
      const entryUnitCost =
        sessionFirst.open * (1 + slippageRate) * (1 + commissionRate);
      const units = benchmarkEquity / entryUnitCost;
      benchmarkEquity =
        units *
        sessionLast.close *
        (1 - slippageRate) *
        (1 - commissionRate);
      sessionStart = index;
    }
    benchmarkReturn = (benchmarkEquity - 1) * 100;
  } else {
    const benchmarkEntryUnitCost =
      firstBar.open * (1 + slippageRate) * (1 + commissionRate);
    benchmarkReturn = (lastBar.close / benchmarkEntryUnitCost - 1) * 100;
  }
  const score =
    totalReturn * 0.45 +
    Math.max(Math.min(sharpe, 5), -5) * 8 +
    maxDrawdown * 0.35;

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
  fullIntrabarExecutions?: readonly (
    readonly AllocationIntrabarExecution[]
  )[],
): AllocationBacktestResult {
  if (fullTarget.length !== allBars.length) {
    throw new Error("Allocation target must align with market bars");
  }
  if (fullSignalEvents && fullSignalEvents.length !== allBars.length) {
    throw new Error("Allocation signal events must align with market bars");
  }
  if (
    fullIntrabarExecutions &&
    fullIntrabarExecutions.length !== allBars.length
  ) {
    throw new Error("Allocation intrabar executions must align with market bars");
  }

  const indexedBars = allBars
    .map((bar, index) => ({
      bar,
      originalIndex: index,
      target: clampAllocation(fullTarget[index] ?? 0),
      signals: fullSignalEvents?.[index] ?? [],
      intrabarExecutions:
        settings.executionPolicy === "next-open"
          ? []
          : (fullIntrabarExecutions?.[index] ?? []),
    }))
    .filter(({ bar }) =>
      filterRange([bar], settings.startTime, settings.endTime).length,
    );
  if (indexedBars.length < 3) {
    throw new Error("Backtest requires at least three bars in the selected range");
  }
  const intraday = settings.interval !== "1d";
  const sessionMetadata = buildIntradaySessionMetadata(
    indexedBars.map(({ bar }) => bar),
  );

  let cash = Math.max(settings.initialCash, 1);
  let units = 0;
  let peak = cash;
  const commissionRate = Math.max(settings.commissionRate, 0);
  const slippageRate = Math.max(settings.slippageRate, 0);
  const equity: EquityPoint[] = [];
  const rebalances: AllocationRebalance[] = [];
  const firstIndexedBar = indexedBars[0];
  const priorTargetIndex = firstIndexedBar.originalIndex - 1;
  const openingAllocation =
    !intraday && priorTargetIndex >= 0
      ? clampAllocation(fullTarget[priorTargetIndex] ?? 0)
      : 0;
  if (openingAllocation > 0) {
    const openingEquity = cash;
    units =
      (openingEquity * openingAllocation) /
      firstIndexedBar.bar.open;
    cash = openingEquity * (1 - openingAllocation);
  }
  let plannedAllocation = openingAllocation;

  const rebalanceAtPrice = (
    bar: MarketBar,
    marketPrice: number,
    targetAllocation: number,
    signals: readonly AllocationSignalEvent[],
    reason: AllocationRebalance["reason"] = "strategy",
  ) => {
    const equityAtFill = cash + units * marketPrice;
    if (equityAtFill <= 0 || marketPrice <= 0) return;
    const fromAllocation = clampAllocation(
      (units * marketPrice) / equityAtFill,
    );
    const desiredUnits = (equityAtFill * targetAllocation) / marketPrice;
    const unitDelta = desiredUnits - units;
    const tolerance = Math.max(desiredUnits, units, 1) * 1e-10;

    if (unitDelta > tolerance) {
      const fillPrice = marketPrice * (1 + slippageRate);
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
        reason,
        signals: [...signals],
      });
    } else if (unitDelta < -tolerance) {
      const fillPrice = marketPrice * (1 - slippageRate);
      const soldUnits = Math.min(-unitDelta, units);
      if (soldUnits <= tolerance) return;
      cash += soldUnits * fillPrice * (1 - commissionRate);
      units -= soldUnits;
      rebalances.push({
        time: bar.time,
        fromAllocation,
        targetAllocation,
        fillPrice,
        reason,
        signals: [...signals],
      });
    }
  };

  for (let index = 0; index < indexedBars.length; index += 1) {
    const { bar } = indexedBars[index];
    const session = sessionMetadata[index]!;
    const sameSessionAsPrevious =
      index > 0 &&
      session.sessionKey === sessionMetadata[index - 1]!.sessionKey;
    const canIncreaseIntraday =
      !intraday ||
      session.barsRemaining > DEFAULT_INTRADAY_ENTRY_CUTOFF_BARS;
    if (index > 0 && (!intraday || sameSessionAsPrevious)) {
      const nextAllocation = indexedBars[index - 1].target;
      if (
        Math.abs(nextAllocation - plannedAllocation) > 1e-10 &&
        (nextAllocation <= plannedAllocation || canIncreaseIntraday)
      ) {
        rebalanceAtPrice(
          bar,
          bar.open,
          nextAllocation,
          indexedBars[index - 1].signals,
        );
        plannedAllocation = nextAllocation;
      }
    }

    for (const execution of indexedBars[index].intrabarExecutions) {
      const targetAllocation = clampAllocation(execution.targetAllocation);
      if (
        Number.isFinite(execution.fillPrice) &&
        Math.abs(targetAllocation - plannedAllocation) > 1e-10 &&
        (targetAllocation <= plannedAllocation || canIncreaseIntraday)
      ) {
        rebalanceAtPrice(
          bar,
          execution.fillPrice,
          targetAllocation,
          execution.signals,
        );
        plannedAllocation = targetAllocation;
      }
    }

    if (intraday && session.isLast && plannedAllocation > 0) {
      rebalanceAtPrice(
        bar,
        bar.close,
        0,
        ["long-exit"],
        "session-end",
      );
      plannedAllocation = 0;
    }

    const currentEquity = cash + units * bar.close;
    peak = Math.max(peak, currentEquity);
    equity.push({
      time: bar.time,
      equity: currentEquity,
      drawdown: peak === 0 ? 0 : ((currentEquity - peak) / peak) * 100,
    });
  }

  const lastBar = indexedBars[indexedBars.length - 1].bar;
  const finalEquity = cash + units * lastBar.close;

  return {
    ...summarizePerformance(
      finalEquity,
      equity,
      indexedBars.map(({ bar }) => bar),
      rebalances.length,
      settings,
    ),
    rebalances,
    openingPosition:
      openingAllocation > 0
        ? {
            time: firstIndexedBar.bar.time,
            price: firstIndexedBar.bar.open,
            allocation: openingAllocation,
          }
        : null,
  };
}

export function runBacktest(
  allBars: MarketBar[],
  strategyId: StrategyId,
  parameters: StrategyParameters,
  settings: BacktestSettings,
): BacktestResult {
  const strategy = getStrategy(strategyId);
  const fullOrders =
    settings.executionPolicy === "next-open"
      ? undefined
      : strategy.buildOrders?.(allBars, parameters);
  const entryAllowed = resolveMovingAverageEntryAllowedSeries(
    allBars,
    settings.entryFilter,
    settings.entryFilterAllowed,
  );
  const fullTarget = fullOrders
    ? buildStrategyOrderTimeline(allBars, fullOrders, entryAllowed).target
    : applyMovingAverageSlopeEntryFilter(
        strategy.buildTarget(allBars, parameters),
        entryAllowed,
      );
  return runBacktestFromTarget(
    allBars,
    strategyId,
    parameters,
    fullTarget,
    {
      ...settings,
      entryFilterAllowed: entryAllowed ?? undefined,
    },
    fullOrders,
  );
}

export function runBacktestFromTarget(
  allBars: MarketBar[],
  strategyId: StrategyId,
  parameters: StrategyParameters,
  fullTarget: readonly number[],
  settings: BacktestSettings,
  cachedOrders?: StrategyOrderSeries,
): BacktestResult {
  if (fullTarget.length !== allBars.length) {
    throw new Error("Strategy target must align with market bars");
  }
  const strategy = getStrategy(strategyId);
  const fullOrders =
    settings.executionPolicy === "next-open"
      ? undefined
      : (cachedOrders ?? strategy.buildOrders?.(allBars, parameters));
  if (fullOrders && fullOrders.length !== allBars.length) {
    throw new Error("Strategy order plan must align with market bars");
  }
  const entryAllowed = resolveMovingAverageEntryAllowedSeries(
    allBars,
    settings.entryFilter,
    settings.entryFilterAllowed,
  );
  const effectiveTarget = fullOrders
    ? fullTarget
    : applyMovingAverageSlopeEntryFilter(fullTarget, entryAllowed);
  const indexedBars = allBars
    .map((bar, index) => ({
      bar,
      originalIndex: index,
      target: (effectiveTarget[index] ?? 0) > 0 ? 1 : 0,
      orders: fullOrders?.[index],
    }))
    .filter(({ bar }) => filterRange([bar], settings.startTime, settings.endTime).length);

  if (indexedBars.length < 3) {
    throw new Error("Backtest requires at least three bars in the selected range");
  }
  const intraday = settings.interval !== "1d";
  const sessionMetadata = buildIntradaySessionMetadata(
    indexedBars.map(({ bar }) => bar),
  );

  let cash = Math.max(settings.initialCash, 1);
  let units = 0;
  let entryPrice = 0;
  let entryTime = "";
  let entryCost = 0;
  let inheritedPosition = false;
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
    if (!inheritedPosition) {
      trades.push({
        entryTime,
        exitTime,
        entryPrice,
        exitPrice: fillPrice,
        returnPercent:
          ((proceeds - fee - entryCost) / Math.max(entryCost, 1)) * 100,
        exitReason,
      });
    }
    units = 0;
    entryPrice = 0;
    entryTime = "";
    entryCost = 0;
    inheritedPosition = false;
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
    inheritedPosition = false;
  };

  const firstIndexedBar = indexedBars[0];
  const priorTargetIndex = firstIndexedBar.originalIndex - 1;
  if (
    !intraday &&
    priorTargetIndex >= 0 &&
    (effectiveTarget[priorTargetIndex] ?? 0) > 0
  ) {
    entryPrice = firstIndexedBar.bar.open;
    entryCost = cash;
    units = cash / firstIndexedBar.bar.open;
    cash = 0;
    inheritedPosition = true;
  }

  for (let index = 0; index < indexedBars.length; index += 1) {
    const { bar, orders, originalIndex } = indexedBars[index];
    const session = sessionMetadata[index]!;
    const sameSessionAsPrevious =
      index > 0 &&
      session.sessionKey === sessionMetadata[index - 1]!.sessionKey;
    const canEnterIntraday =
      !intraday ||
      session.barsRemaining > DEFAULT_INTRADAY_ENTRY_CUTOFF_BARS;

    if (orders) {
      const allowEntry =
        canEnterIntraday &&
        (!entryAllowed ||
          (originalIndex > 0 && entryAllowed[originalIndex - 1]));
      const fills = resolveStrategyOrderFills(
        bar,
        orders,
        units > 0 ? "long" : "flat",
        allowEntry,
      );
      for (const fill of fills) {
        if (fill.action === "sell") {
          closePosition(fill.fillPrice, bar.time);
        } else {
          openPosition(fill.fillPrice, bar.time);
        }
      }
    } else if (index > 0 && (!intraday || sameSessionAsPrevious)) {
      const priorTarget = indexedBars[index - 1].target;
      if (priorTarget === 1 && units === 0 && canEnterIntraday) {
        openPosition(bar.open, bar.time);
      } else if (priorTarget === 0 && units > 0) {
        closePosition(bar.open, bar.time);
      }
    }

    if (intraday && session.isLast && units > 0) {
      closePosition(bar.close, bar.time, "session-end");
    }

    const currentEquity = cash + units * bar.close;
    peak = Math.max(peak, currentEquity);
    equity.push({
      time: bar.time,
      equity: currentEquity,
      drawdown: peak === 0 ? 0 : ((currentEquity - peak) / peak) * 100,
    });
  }

  const lastBar = indexedBars[indexedBars.length - 1].bar;
  const finalEquity = cash + units * lastBar.close;

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
    finalEquity,
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
    openPosition:
      units > 0 && !inheritedPosition
        ? {
            entryTime,
            entryPrice,
          }
        : null,
    ...(settings.entryFilter
      ? { entryFilter: cloneMovingAverageSlopeFilter(settings.entryFilter) }
      : {}),
  };
}
