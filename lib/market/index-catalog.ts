import type { MarketInstrument } from "./types";

interface IndexCatalogEntry extends MarketInstrument {
  aliases: readonly string[];
}

export const INDEX_CATALOG: readonly IndexCatalogEntry[] = [
  {
    secid: "1306.T",
    code: "1306.T",
    name: "TOPIX-linked ETF Proxy (1306)",
    exchange: "JPX",
    assetType: "etf",
    provider: "yahoo",
    aliases: [
      "topix index",
      "tokyo stock price index",
      "tpx",
      "\u4e1c\u8bc1\u6307\u6570",
    ],
  },
  {
    secid: "^N225",
    code: "N225",
    name: "Nikkei 225",
    exchange: "JPX",
    assetType: "index",
    provider: "yahoo",
    aliases: ["nikkei", "nikkei 225"],
  },
  {
    secid: "^SOX",
    code: "SOX",
    name: "PHLX Semiconductor Index",
    exchange: "PHLX",
    assetType: "index",
    provider: "yahoo",
    aliases: ["semiconductor index", "phlx semiconductor"],
  },
  {
    secid: "^GSPC",
    code: "SPX",
    name: "S&P 500 Index",
    exchange: "NYSE",
    assetType: "index",
    provider: "yahoo",
    aliases: ["gspc", "s&p 500", "sp500"],
  },
  {
    secid: "^NDX",
    code: "NDX",
    name: "Nasdaq-100 Index",
    exchange: "NASDAQ",
    assetType: "index",
    provider: "yahoo",
    aliases: ["ndx100", "nasdaq 100", "nasdaq-100"],
  },
  {
    secid: "^IXIC",
    code: "IXIC",
    name: "Nasdaq Composite Index",
    exchange: "NASDAQ",
    assetType: "index",
    provider: "yahoo",
    aliases: ["nasdaq composite"],
  },
  {
    secid: "^DJI",
    code: "DJI",
    name: "Dow Jones Industrial Average",
    exchange: "NYSE",
    assetType: "index",
    provider: "yahoo",
    aliases: ["djia", "dow jones"],
  },
  {
    secid: "^HSI",
    code: "HSI",
    name: "Hang Seng Index",
    exchange: "HKEX",
    assetType: "index",
    provider: "yahoo",
    aliases: ["hang seng"],
  },
  {
    secid: "000001.SS",
    code: "000001",
    name: "SSE Composite Index",
    exchange: "SSE",
    assetType: "index",
    provider: "yahoo",
    aliases: ["sse composite"],
  },
  {
    secid: "399001.SZ",
    code: "399001",
    name: "SZSE Component Index",
    exchange: "SZSE",
    assetType: "index",
    provider: "yahoo",
    aliases: ["szse component"],
  },
  {
    secid: "000300.SS",
    code: "000300",
    name: "CSI 300 Index",
    exchange: "SSE",
    assetType: "index",
    provider: "yahoo",
    aliases: ["csi 300", "csi300"],
  },
  {
    secid: "000905.SS",
    code: "000905",
    name: "CSI 500 Index",
    exchange: "SSE",
    assetType: "index",
    provider: "yahoo",
    aliases: ["csi 500", "csi500"],
  },
  {
    secid: "000852.SS",
    code: "000852",
    name: "CSI 1000 Index",
    exchange: "SSE",
    assetType: "index",
    provider: "yahoo",
    aliases: ["csi 1000", "csi1000"],
  },
];

export function searchIndexCatalog(query: string): MarketInstrument[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  return INDEX_CATALOG.filter((instrument) =>
    [
      instrument.secid,
      instrument.code,
      instrument.name,
      ...instrument.aliases,
    ].some((value) => value.toLowerCase().includes(normalized)),
  ).map((instrument) => ({
    secid: instrument.secid,
    code: instrument.code,
    name: instrument.name,
    exchange: instrument.exchange,
    assetType: instrument.assetType,
    provider: instrument.provider,
  }));
}
