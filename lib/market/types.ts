export type MarketInterval = "1m" | "5m" | "15m" | "30m" | "60m" | "1d";

export interface MarketInstrument {
  secid: string;
  code: string;
  name: string;
  exchange: "SSE" | "SZSE" | "BSE" | "OTHER";
  kind: string;
}

export interface MarketBar {
  time: string;
  timestamp: number;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  amplitude: number;
  changePercent: number;
  change: number;
  turnoverRate: number;
}

export interface MarketSeries {
  instrument: MarketInstrument;
  interval: MarketInterval;
  previousClose: number;
  bars: MarketBar[];
  source: "eastmoney";
  fetchedAt: string;
}

