export type MarketInterval = "1m" | "5m" | "15m" | "30m" | "60m" | "1d";
export type MarketAssetType = "index" | "etf" | "commodity";
export const MARKET_DATA_PROVIDERS = [
  "eastmoney",
  "yahoo",
  "nasdaq",
  "eodhd",
  "nikkei",
  "twelve-data",
  "alpha-vantage",
  "fmp",
  "alltick",
  "marketstack",
  "zhitu",
  "tencent",
  "juhe",
] as const;
export type MarketDataProvider = (typeof MARKET_DATA_PROVIDERS)[number];
export type MarketReferenceProvider = "fred";
export type MarketSourceProvider =
  | MarketDataProvider
  | MarketReferenceProvider;
export type MarketNetworkRoute =
  | "direct-preferred"
  | "proxy-preferred"
  | "credentialed";
export type MarketPriceAdjustment = "raw" | "corporate-action-adjusted";
export type MarketLatestBarStatus =
  | "complete"
  | "in-progress"
  | "unknown";
export const MAX_MARKET_INSTRUMENT_NAME_LENGTH = 256;
export type MarketExchange =
  | "SSE"
  | "SZSE"
  | "JPX"
  | "PHLX"
  | "NYSE"
  | "NYSE_ARCA"
  | "NASDAQ"
  | "HKEX"
  | "XETRA"
  | "LSE"
  | "EURONEXT"
  | "KRX"
  | "BSE"
  | "B3"
  | "SIX"
  | "TWSE"
  | "SGX"
  | "ASX"
  | "COMEX"
  | "NYMEX"
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
  latestBarStatus: MarketLatestBarStatus;
  source: MarketDataProvider;
  fetchedAt: string;
}

export interface MarketReferenceObservation {
  time: string;
  timestamp: number;
  value: number;
}

export interface MarketReferenceSeries {
  instrumentKey: string;
  interval: "1d";
  observations: MarketReferenceObservation[];
  latestBarStatus: MarketLatestBarStatus;
  source: MarketReferenceProvider;
  fetchedAt: string;
}

export interface MarketTemporaryQuote {
  instrumentKey: string;
  provider: MarketDataProvider;
  time: string;
  price: number;
  bar: MarketBar;
  previousClose: number;
  latestBarStatus: MarketLatestBarStatus;
  fetchedAt: string;
}
