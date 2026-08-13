import type { MarketInstrument } from "./types";

interface CommodityCatalogEntry extends MarketInstrument {
  aliases: readonly string[];
}

export const COMMODITY_CATALOG: readonly CommodityCatalogEntry[] = [
  {
    secid: "101.GC00Y",
    code: "GC=F",
    name: "Gold Futures Proxy",
    exchange: "COMEX",
    assetType: "commodity",
    provider: "eastmoney",
    aliases: ["gold", "gold futures", "precious metal"],
  },
  {
    secid: "101.SI00Y",
    code: "SI=F",
    name: "Silver Futures Proxy",
    exchange: "COMEX",
    assetType: "commodity",
    provider: "eastmoney",
    aliases: ["silver", "silver futures", "precious metal"],
  },
  {
    secid: "102.CL00Y",
    code: "CL=F",
    name: "Crude Oil Futures Proxy",
    exchange: "NYMEX",
    assetType: "commodity",
    provider: "eastmoney",
    aliases: ["crude oil", "oil", "wti", "energy"],
  },
  {
    secid: "101.HG00Y",
    code: "HG=F",
    name: "Copper Futures Proxy",
    exchange: "COMEX",
    assetType: "commodity",
    provider: "eastmoney",
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
