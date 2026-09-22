import type { MarketInstrument } from "./types";

interface VerifiedFundCatalogEntry extends MarketInstrument {
  aliases: readonly string[];
  canonicalPriceAdjustment: "raw";
}

export const VERIFIED_FUND_CATALOG: readonly VerifiedFundCatalogEntry[] = [
  {
    secid: "sz164824",
    code: "164824",
    name: "India Market Fund LOF",
    exchange: "SZSE",
    assetType: "etf",
    provider: "tencent",
    aliases: ["India Market Fund", "India LOF"],
    canonicalPriceAdjustment: "raw",
  },
];

function normalizedFundCode(value: string): string {
  return value
    .trim()
    .replace(/^(?:0|1)\./, "")
    .replace(/\.(?:SHE|SHG|SHH|SS|SZ)$/i, "")
    .toUpperCase();
}

export function verifiedFundByCode(
  value: string,
): VerifiedFundCatalogEntry | null {
  const code = normalizedFundCode(value);
  return VERIFIED_FUND_CATALOG.find((entry) => entry.code === code) ?? null;
}

export function searchFundCatalog(query: string): MarketInstrument[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  return VERIFIED_FUND_CATALOG.filter((instrument) =>
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
