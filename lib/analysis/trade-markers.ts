import type { BacktestTrade } from "./backtest";

export interface TradeMarker {
  time: string;
  price: number;
  event: "entry" | "exit" | "range-exit";
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
