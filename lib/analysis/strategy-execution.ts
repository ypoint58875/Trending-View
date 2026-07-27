import type { MarketBar } from "@/lib/market/types";
import type {
  StrategyOrderSeries,
  StrategyPriceOrders,
} from "./strategy-orders";

export type StrategyOrderPosition = "flat" | "long";

export interface StrategyOrderFill {
  action: "buy" | "sell";
  fillPrice: number;
  position: StrategyOrderPosition;
}

export interface StrategyOrderTimeline {
  target: number[];
  fills: StrategyOrderFill[][];
}

export function resolveStrategyOrderFills(
  bar: MarketBar,
  order: StrategyPriceOrders,
  position: StrategyOrderPosition,
  entryAllowed = true,
): StrategyOrderFill[] {
  if (position === "long") {
    if (order.exitAtOpen) {
      return [{ action: "sell", fillPrice: bar.open, position: "flat" }];
    }
    if (
      order.exitStop !== null &&
      Number.isFinite(order.exitStop) &&
      bar.low <= order.exitStop
    ) {
      return [
        {
          action: "sell",
          fillPrice: Math.min(bar.open, order.exitStop),
          position: "flat",
        },
      ];
    }
    return [];
  }

  if (!entryAllowed) return [];

  const entryFillPrice = order.entryAtOpen
    ? bar.open
    : order.entryStop !== null &&
        Number.isFinite(order.entryStop) &&
        bar.high >= order.entryStop
      ? Math.max(bar.open, order.entryStop)
      : null;
  if (entryFillPrice === null) return [];

  const fills: StrategyOrderFill[] = [
    { action: "buy", fillPrice: entryFillPrice, position: "long" },
  ];
  const exitTouchedAfterEntry =
    (order.entryAtOpen && order.exitAtOpen) ||
    (order.exitStop !== null &&
      Number.isFinite(order.exitStop) &&
      bar.low <= order.exitStop);
  if (exitTouchedAfterEntry) {
    fills.push({
      action: "sell",
      fillPrice:
        order.exitAtOpen && order.entryAtOpen
          ? bar.open
          : Math.min(bar.open, order.exitStop!),
      position: "flat",
    });
  }
  return fills;
}

export function resolveStrategyOrderFill(
  bar: MarketBar,
  order: StrategyPriceOrders,
  position: StrategyOrderPosition,
): StrategyOrderFill | null {
  return resolveStrategyOrderFills(bar, order, position).at(-1) ?? null;
}

export function buildStrategyOrderTimeline(
  bars: readonly MarketBar[],
  orders: StrategyOrderSeries,
  completedBarEntryAllowed?: readonly boolean[] | null,
): StrategyOrderTimeline {
  if (orders.length !== bars.length) {
    throw new Error("Strategy order plan must align with market bars");
  }
  if (
    completedBarEntryAllowed &&
    completedBarEntryAllowed.length !== bars.length
  ) {
    throw new Error("Entry-filter state must align with market bars");
  }

  let position: StrategyOrderPosition = "flat";
  const target: number[] = [];
  const fills: StrategyOrderFill[][] = [];

  bars.forEach((bar, index) => {
    const entryAllowed =
      !completedBarEntryAllowed ||
      (index > 0 && completedBarEntryAllowed[index - 1]);
    const barFills = resolveStrategyOrderFills(
      bar,
      orders[index],
      position,
      entryAllowed,
    );
    if (barFills.length > 0) {
      position = barFills.at(-1)!.position;
    }
    target.push(position === "long" ? 1 : 0);
    fills.push(barFills);
  });

  return { target, fills };
}
