import type { MarketExchange } from "./types";

export const MARKET_EXCHANGES = [
  "SSE",
  "SZSE",
  "JPX",
  "PHLX",
  "NYSE",
  "NYSE_ARCA",
  "NASDAQ",
  "HKEX",
  "XETRA",
  "LSE",
  "EURONEXT",
  "KRX",
  "BSE",
  "B3",
  "SIX",
  "TWSE",
  "SGX",
  "ASX",
  "COMEX",
  "NYMEX",
  "OTHER",
] as const satisfies readonly MarketExchange[];

const KNOWN_INDEX_EXCHANGES: Readonly<Record<string, MarketExchange>> = {
  N225: "JPX",
  HSI: "HKEX",
  HSCEI: "HKEX",
  HSCE: "HKEX",
  SOX: "PHLX",
  SPX: "NYSE",
  GSPC: "NYSE",
  DJI: "NYSE",
  DJIA: "NYSE",
  NDX: "NASDAQ",
  NDX100: "NASDAQ",
  IXIC: "NASDAQ",
  GDAXI: "XETRA",
  DAX: "XETRA",
  FTSE: "LSE",
  FCHI: "EURONEXT",
  CAC40: "EURONEXT",
  SX5E: "EURONEXT",
  STOXX50E: "EURONEXT",
  KS11: "KRX",
  KOSPI: "KRX",
  KOSPI200: "KRX",
  SENSEX: "BSE",
  BVSP: "B3",
  SSMI: "SIX",
  TWII: "TWSE",
  STI: "SGX",
  AXJO: "ASX",
};

export function normalizeMarketCode(code: string): string {
  return code
    .trim()
    .replace(/^\^/, "")
    .replace(/\.(SS|SZ|HK|US|INDX)$/i, "")
    .toUpperCase();
}

export function knownIndexExchange(
  code: string | undefined,
): MarketExchange | null {
  if (!code) return null;
  return KNOWN_INDEX_EXCHANGES[normalizeMarketCode(code)] ?? null;
}

export function exchangeFromProviderLabels(
  labels: string,
  code?: string,
): MarketExchange {
  const known = knownIndexExchange(code);
  if (known) return known;

  const value = labels.toUpperCase();
  if (value.includes("TOKYO") || value.includes("JPX")) return "JPX";
  if (value.includes("NASDAQ") || value.includes("NGM")) return "NASDAQ";
  if (
    value.includes("NYSE ARCA") ||
    value.includes("PCX") ||
    value.includes("ARCX")
  ) {
    return "NYSE_ARCA";
  }
  if (value.includes("NYSE")) return "NYSE";
  if (value.includes("HONG KONG") || value.includes("HKG")) return "HKEX";
  if (
    value.includes("SHANGHAI") ||
    value.includes("SHH") ||
    value.includes("SHG") ||
    value.includes("XSHG")
  ) {
    return "SSE";
  }
  if (value.includes("SHENZHEN") || value.includes("SHZ")) return "SZSE";
  if (value.includes("PHLX") || value.includes("NIM")) return "PHLX";
  if (value.includes("XETRA") || value.includes("GERMANY")) return "XETRA";
  if (value.includes("LONDON") || value.includes("LSE")) return "LSE";
  if (
    value.includes("EURONEXT") ||
    value.includes("PARIS") ||
    value.includes("STOXX")
  ) {
    return "EURONEXT";
  }
  if (value.includes("KOREA") || value.includes("KOSPI")) return "KRX";
  if (value.includes("BOMBAY") || value.includes("BSE")) return "BSE";
  if (value.includes("BRAZIL") || value.includes("BOVESPA")) return "B3";
  if (value.includes("SWISS") || value.includes("SIX")) return "SIX";
  if (value.includes("TAIWAN") || value.includes("TAI")) return "TWSE";
  if (value.includes("SINGAPORE") || value.includes("SGX")) return "SGX";
  if (value.includes("AUSTRALIA") || value.includes("ASX")) return "ASX";
  if (value.includes("COMEX") || value.includes("CMX")) return "COMEX";
  if (value.includes("NYMEX") || value.includes("NYM")) return "NYMEX";
  return "OTHER";
}
