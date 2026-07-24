import type { MarketBar } from "@/lib/market/types";
import {
  getStrategy,
  type StrategyId,
  type StrategyParameters,
} from "./strategies";

export type LiveGuidanceAction = "buy" | "sell" | "hold" | "wait";
export type LiveGuidancePosition = "long" | "flat";

export interface LiveStrategyGuidance {
  action: LiveGuidanceAction;
  position: LiveGuidancePosition;
  barTime: string;
  currentPrice: number;
  triggerPrice: number | null;
}

function guidance(
  action: LiveGuidanceAction,
  position: LiveGuidancePosition,
  bar: MarketBar,
  triggerPrice: number | null,
): LiveStrategyGuidance {
  return {
    action,
    position,
    barTime: bar.time,
    currentPrice: bar.close,
    triggerPrice,
  };
}

export function buildLiveStrategyGuidance(
  bars: MarketBar[],
  strategyId: StrategyId,
  parameters: StrategyParameters,
): LiveStrategyGuidance | null {
  const latestBar = bars.at(-1);
  if (!latestBar) return null;

  const strategy = getStrategy(strategyId);
  const orders = strategy.buildOrders?.(bars, parameters);
  if (orders) {
    if (orders.length !== bars.length) {
      throw new Error("Strategy order plan must align with market bars");
    }

    let position: LiveGuidancePosition = "flat";
    let latestAction: LiveGuidanceAction = "wait";
    let latestTriggerPrice: number | null = null;

    bars.forEach((bar, index) => {
      const order = orders[index];
      let action: LiveGuidanceAction =
        position === "long" ? "hold" : "wait";
      let triggerPrice: number | null = null;

      if (
        position === "long" &&
        order.exitStop !== null &&
        Number.isFinite(order.exitStop) &&
        bar.low <= order.exitStop
      ) {
        position = "flat";
        action = "sell";
        triggerPrice = Math.min(bar.open, order.exitStop);
      } else if (
        position === "flat" &&
        order.entryStop !== null &&
        Number.isFinite(order.entryStop) &&
        bar.high >= order.entryStop
      ) {
        position = "long";
        action = "buy";
        triggerPrice = Math.max(bar.open, order.entryStop);
      }

      if (index === bars.length - 1) {
        latestAction = action;
        latestTriggerPrice = triggerPrice;
      }
    });

    return guidance(
      latestAction,
      position,
      latestBar,
      latestTriggerPrice,
    );
  }

  const target = strategy.buildTarget(bars, parameters);
  const latestTarget = (target.at(-1) ?? 0) > 0 ? 1 : 0;
  const previousTarget =
    target.length > 1 && (target[target.length - 2] ?? 0) > 0 ? 1 : 0;

  if (latestTarget === 1 && previousTarget === 0) {
    return guidance("buy", "long", latestBar, latestBar.close);
  }
  if (latestTarget === 0 && previousTarget === 1) {
    return guidance("sell", "flat", latestBar, latestBar.close);
  }
  if (latestTarget === 1) {
    return guidance("hold", "long", latestBar, null);
  }
  return guidance("wait", "flat", latestBar, null);
}
