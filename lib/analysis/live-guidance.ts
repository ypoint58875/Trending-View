import type {
  MarketBar,
  MarketLatestBarStatus,
} from "@/lib/market/types";
import {
  getStrategy,
  type StrategyId,
  type StrategyParameters,
} from "./strategies";
import { resolveStrategyOrderFills } from "./strategy-execution";
import {
  applyMovingAverageSlopeEntryFilter,
  buildMovingAverageEntryAllowedSeries,
  type MovingAverageSlopeFilter,
} from "./entry-filter";

export type LiveGuidanceAction = "buy" | "sell" | "hold" | "wait";
export type LiveGuidancePosition = "long" | "flat";
export type LiveGuidanceExecutionMode = "intrabar-order" | "next-open";

export interface LiveStrategyGuidance {
  action: LiveGuidanceAction;
  position: LiveGuidancePosition;
  barTime: string;
  currentPrice: number;
  triggerPrice: number | null;
  todayEntryPrice: number | null;
  todayExitPrice: number | null;
  executionMode: LiveGuidanceExecutionMode;
  pendingNextOpenAction: "buy" | "sell" | null;
}

function guidance(
  action: LiveGuidanceAction,
  position: LiveGuidancePosition,
  bar: MarketBar,
  triggerPrice: number | null,
  todayEntryPrice: number | null,
  todayExitPrice: number | null,
  executionMode: LiveGuidanceExecutionMode,
  pendingNextOpenAction: "buy" | "sell" | null = null,
): LiveStrategyGuidance {
  return {
    action,
    position,
    barTime: bar.time,
    currentPrice: bar.close,
    triggerPrice,
    todayEntryPrice,
    todayExitPrice,
    executionMode,
    pendingNextOpenAction,
  };
}

export function buildLiveStrategyGuidance(
  bars: MarketBar[],
  strategyId: StrategyId,
  parameters: StrategyParameters,
  latestBarStatus: MarketLatestBarStatus = "complete",
  entryFilter?: MovingAverageSlopeFilter | null,
): LiveStrategyGuidance | null {
  const latestBar = bars.at(-1);
  if (!latestBar) return null;

  const strategy = getStrategy(strategyId);
  const entryAllowed = buildMovingAverageEntryAllowedSeries(
    bars,
    entryFilter,
  );
  const orders = strategy.buildOrders?.(bars, parameters);
  if (orders) {
    if (orders.length !== bars.length) {
      throw new Error("Strategy order plan must align with market bars");
    }

    let position: LiveGuidancePosition = "flat";
    let latestAction: LiveGuidanceAction = "wait";
    let latestTriggerPrice: number | null = null;

    for (let index = 0; index < bars.length; index += 1) {
      const bar = bars[index];
      const order = orders[index];
      let action: LiveGuidanceAction =
        position === "long" ? "hold" : "wait";
      let triggerPrice: number | null = null;

      const allowEntry =
        !entryAllowed || (index > 0 && entryAllowed[index - 1]);
      const fills = resolveStrategyOrderFills(
        bar,
        order,
        position,
        allowEntry,
      );
      if (fills.length > 0) {
        const finalFill = fills.at(-1)!;
        position = finalFill.position;
        action = finalFill.action;
        triggerPrice = finalFill.fillPrice;
      }

      if (index === bars.length - 1) {
        latestAction = action;
        latestTriggerPrice = triggerPrice;
      }
    }
    const pendingAction =
      latestBarStatus === "complete"
        ? (strategy.buildPendingNextOpenAction?.(bars, parameters) ?? null)
        : null;
    const actionablePendingAction =
      (pendingAction === "buy" &&
        position === "flat" &&
        (!entryAllowed || entryAllowed.at(-1))) ||
      (pendingAction === "sell" && position === "long")
        ? pendingAction
        : null;
    const latestEntryAllowed =
      !entryAllowed ||
      (entryAllowed.length > 1 && entryAllowed[entryAllowed.length - 2]);

    return guidance(
      latestAction,
      position,
      latestBar,
      latestTriggerPrice,
      latestEntryAllowed
        ? Number.isFinite(orders.at(-1)?.entryStop)
          ? (orders.at(-1)?.entryStop ?? null)
          : orders.at(-1)?.entryAtOpen
            ? latestBar.open
            : null
        : null,
      Number.isFinite(orders.at(-1)?.exitStop)
        ? (orders.at(-1)?.exitStop ?? null)
        : orders.at(-1)?.exitAtOpen
          ? latestBar.open
          : null,
      "intrabar-order",
      actionablePendingAction,
    );
  }

  const rawTarget = strategy.buildTarget(bars, parameters);
  if (latestBarStatus !== "complete" && rawTarget.length > 1) {
    rawTarget[rawTarget.length - 1] = rawTarget[rawTarget.length - 2] ?? 0;
    if (entryAllowed) entryAllowed[entryAllowed.length - 1] = false;
  }
  const target = applyMovingAverageSlopeEntryFilter(
    rawTarget,
    entryAllowed,
  );
  const latestTarget = (target.at(-1) ?? 0) > 0 ? 1 : 0;
  const previousTarget =
    target.length > 1 && (target[target.length - 2] ?? 0) > 0 ? 1 : 0;

  if (latestTarget === 1 && previousTarget === 0) {
    return guidance(
      "buy",
      "long",
      latestBar,
      null,
      null,
      null,
      "next-open",
    );
  }
  if (latestTarget === 0 && previousTarget === 1) {
    return guidance(
      "sell",
      "flat",
      latestBar,
      null,
      null,
      null,
      "next-open",
    );
  }
  if (latestTarget === 1) {
    return guidance(
      "hold",
      "long",
      latestBar,
      null,
      null,
      null,
      "next-open",
    );
  }
  return guidance(
    "wait",
    "flat",
    latestBar,
    null,
    null,
    null,
    "next-open",
  );
}
