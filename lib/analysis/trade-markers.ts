import type {
  AllocationRebalance,
  AllocationOpeningPosition,
  AllocationSignalEvent,
  BacktestOpenPosition,
  BacktestTrade,
} from "./backtest";

export interface TradeMarker {
  time: string;
  price: number;
  event: "entry" | "exit" | "range-exit";
  action?: "open" | "carry" | "short-buy" | "short-sell" | "increase" | "reduce" | "close";
  signals?: AllocationSignalEvent[];
}

export interface TradeMarkers {
  buys: TradeMarker[];
  sells: TradeMarker[];
  rangeExits: TradeMarker[];
}

export function buildTradeMarkers(
  trades: BacktestTrade[],
  openPosition?: BacktestOpenPosition | null,
): TradeMarkers {
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

  if (openPosition) {
    markers.buys.push({
      time: openPosition.entryTime,
      price: openPosition.entryPrice,
      event: "entry",
      action: "open",
    });
  }

  return markers;
}

export function buildAllocationTradeMarkers(
  rebalances: AllocationRebalance[],
  openingPosition: AllocationOpeningPosition | null = null,
): TradeMarkers {
  const markers: TradeMarkers = { buys: [], sells: [], rangeExits: [] };

  if (openingPosition) {
    markers.buys.push({
      time: openingPosition.time,
      price: openingPosition.price,
      event: "entry",
      action: "carry",
    });
  }

  rebalances.forEach((rebalance) => {
    if (rebalance.reason !== "range-end" && Math.abs(rebalance.targetAllocation - rebalance.fromAllocation) <= 1e-10) return;
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
          : event === "exit"
            ? rebalance.targetAllocation <= 1e-10 ? "close" : "reduce"
            : rebalance.fromAllocation <= 1e-10 ? "open" : "increase",
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
