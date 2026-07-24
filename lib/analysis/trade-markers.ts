import type { BacktestTrade } from "./backtest";

export interface TradeMarker {
  time: string;
  price: number;
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
      event: "entry",
    };
    const exit: TradeMarker = {
      time: trade.exitTime,
      price: trade.exitPrice,
      event: "exit",
    };

    markers.buys.push(entry);
    markers.sells.push(exit);
  });

  return markers;
}
