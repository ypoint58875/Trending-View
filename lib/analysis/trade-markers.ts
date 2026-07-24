import type { BacktestTrade, TradeDirection } from "./backtest";

export interface TradeMarker {
  time: string;
  price: number;
  direction: TradeDirection;
  event: "entry" | "exit";
}

export interface TradeMarkers {
  buys: TradeMarker[];
  sells: TradeMarker[];
}

export function buildTradeMarkers(trades: BacktestTrade[]): TradeMarkers {
  const markers: TradeMarkers = { buys: [], sells: [] };

  trades.forEach((trade) => {
    const entry: TradeMarker = {
      time: trade.entryTime,
      price: trade.entryPrice,
      direction: trade.direction,
      event: "entry",
    };
    const exit: TradeMarker = {
      time: trade.exitTime,
      price: trade.exitPrice,
      direction: trade.direction,
      event: "exit",
    };

    if (trade.direction === "long") {
      markers.buys.push(entry);
      markers.sells.push(exit);
    } else {
      markers.sells.push(entry);
      markers.buys.push(exit);
    }
  });

  return markers;
}
