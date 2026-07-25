import type {
  AllocationRebalance,
  AllocationSignalEvent,
  BacktestTrade,
} from "./backtest";

export interface TradeMarker {
  time: string;
  price: number;
  event: "entry" | "exit" | "range-exit";
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
    };
    const exit: TradeMarker = {
      time: trade.exitTime,
      price: trade.exitPrice,
      event: trade.exitReason === "range-end" ? "range-exit" : "exit",
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
