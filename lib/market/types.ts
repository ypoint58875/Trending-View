export type MarketInterval = "1m" | "5m" | "15m" | "30m" | "60m" | "1d";
export type MarketAssetType = "index" | "etf";
export type MarketDataProvider = "eastmoney" | "yahoo" | "nasdaq";
export type MarketPriceAdjustment = "raw" | "corporate-action-adjusted";
export type MarketExchange =
  | "SSE"
  | "SZSE"
  | "JPX"
  | "PHLX"
  | "NYSE_ARCA"
  | "NASDAQ"
  | "HKEX"
  | "OTHER";

export interface MarketInstrument {
  secid: string;
  code: string;
  name: string;
  exchange: MarketExchange;
  assetType: MarketAssetType;
  provider: MarketDataProvider;
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
  priceAdjustment: MarketPriceAdjustment;
  previousClose: number;
  bars: MarketBar[];
  source: MarketDataProvider;
  fetchedAt: string;
}
