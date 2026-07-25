import type { MarketInstrument } from "./types";

interface CommodityCatalogEntry extends MarketInstrument {
  aliases: readonly string[];
}

export const COMMODITY_CATALOG: readonly CommodityCatalogEntry[] = [
  {
    secid: "GC=F",
    code: "GC=F",
    name: "Gold Futures Proxy",
    exchange: "OTHER",
    assetType: "commodity",
    provider: "yahoo",
    aliases: ["gold", "gold futures", "precious metal"],
  },
  {
    secid: "SI=F",
    code: "SI=F",
    name: "Silver Futures Proxy",
    exchange: "OTHER",
    assetType: "commodity",
    provider: "yahoo",
    aliases: ["silver", "silver futures", "precious metal"],
  },
  {
    secid: "CL=F",
    code: "CL=F",
    name: "Crude Oil Futures Proxy",
    exchange: "OTHER",
    assetType: "commodity",
    provider: "yahoo",
    aliases: ["crude oil", "oil", "wti", "energy"],
  },
  {
    secid: "HG=F",
    code: "HG=F",
    name: "Copper Futures Proxy",
    exchange: "OTHER",
    assetType: "commodity",
    provider: "yahoo",
    aliases: ["copper", "copper futures", "industrial metal"],
  },
];

export function searchCommodityCatalog(
  query: string,
): MarketInstrument[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  return COMMODITY_CATALOG.filter((instrument) => {
    const searchValues = [
      instrument.secid,
      instrument.code,
      instrument.name,
      ...instrument.aliases,
    ];
    return searchValues.some((value) =>
      value.toLowerCase().includes(normalized),
    );
  }).map((instrument) => ({
    secid: instrument.secid,
    code: instrument.code,
    name: instrument.name,
    exchange: instrument.exchange,
    assetType: instrument.assetType,
    provider: instrument.provider,
  }));
}
