import type {
  AllocationRebalance,
  AllocationSignalEvent,
  BacktestTrade,
} from "./backtest";

export interface TradeMarker {
  time: string;
  price: number;
  event: "entry" | "exit" | "range-exit";
  action?: "open" | "short-buy" | "short-sell" | "close";
  signals?: AllocationSignalEvent[];
}

export interface TradeMarkers {
  buys: TradeMarker[];
  sells: TradeMarker[];
  rangeExits: TradeMarker[];
}

export function buildTradeMarkers(trades: BacktestTrade[]): TradeMarkers {
  const markers: TradeMarkers = { buys: [], sells: [], rangeExits: [] };

  trades.forEach((trade) => {
    const entry: TradeMarker = {
      time: trade.entryTime,
      price: trade.entryPrice,
      event: "entry",
      action: "open",
    };
    const exit: TradeMarker = {
      time: trade.exitTime,
      price: trade.exitPrice,
      event: trade.exitReason === "range-end" ? "range-exit" : "exit",
      action: trade.exitReason === "range-end" ? undefined : "close",
    };

    markers.buys.push(entry);
    if (exit.event === "range-exit") {
      markers.rangeExits.push(exit);
    } else {
      markers.sells.push(exit);
    }
  });

  return markers;
}

export function buildAllocationTradeMarkers(
  rebalances: AllocationRebalance[],
): TradeMarkers {
  const markers: TradeMarkers = { buys: [], sells: [], rangeExits: [] };

  rebalances.forEach((rebalance) => {
    const event =
      rebalance.reason === "range-end"
        ? "range-exit"
        : rebalance.targetAllocation > rebalance.fromAllocation
          ? "entry"
          : "exit";
    const marker: TradeMarker = {
      time: rebalance.time,
      price: rebalance.fillPrice,
      event,
      action:
        event === "range-exit"
          ? undefined
          : rebalance.signals?.includes("long-exit") ||
              (event === "exit" && rebalance.targetAllocation === 0)
            ? "close"
            : rebalance.signals?.includes("short-exit") || event === "exit"
              ? "short-sell"
              : rebalance.signals?.includes("long-entry") ||
                  rebalance.fromAllocation === 0
                ? "open"
                : "short-buy",
      signals: rebalance.signals,
    };
    if (event === "range-exit") {
      markers.rangeExits.push(marker);
    } else if (event === "entry") {
      markers.buys.push(marker);
    } else {
      markers.sells.push(marker);
    }
  });

  return markers;
}
