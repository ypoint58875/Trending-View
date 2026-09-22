import type {
  MarketDataProvider,
  MarketInstrument,
  MarketNetworkRoute,
  MarketReferenceProvider,
  MarketSeries,
  MarketSourceProvider,
} from "./types";
import { exchangeFromProviderLabels } from "./exchanges";
import { verifiedFundByCode } from "./fund-catalog";
import {
  yahooIndexSymbolForCode,
  yahooPrimarySymbolForInstrument,
} from "./yahoo";

export interface CanonicalMarketSourceDefinition {
  provider: MarketSourceProvider;
  role: "primary" | "backup" | "reference";
  capability: "ohlcv" | "close-only";
  networkRoute: MarketNetworkRoute;
  methodology: string;
  instrument?: MarketInstrument;
  promotionPolicy?: "verified-identity" | "overlap-required";
}

export interface CanonicalMarketProfile {
  key: string;
  primary: CanonicalMarketSourceDefinition & {
    provider: MarketDataProvider;
    role: "primary";
    capability: "ohlcv";
    instrument: MarketInstrument;
  };
  backups: readonly (CanonicalMarketSourceDefinition & {
    provider: MarketDataProvider;
    role: "backup";
    capability: "ohlcv";
    instrument: MarketInstrument;
    promotionPolicy: "verified-identity" | "overlap-required";
  })[];
  references: readonly (CanonicalMarketSourceDefinition & {
    provider: MarketReferenceProvider;
    role: "reference";
    capability: "close-only";
  })[];
}

function normalizedInstrumentCode(instrument: Pick<MarketInstrument, "code">) {
  return instrument.code
    .replace(/^\^/, "")
    .replace(/\.(SS|SHH|SHG|SHE|SZ|HK|US|INDX)$/i, "")
    .toUpperCase();
}

function normalizeCanonicalInstrumentIdentity(
  instrument: MarketInstrument,
): MarketInstrument {
  const verifiedFund =
    instrument.assetType === "etf"
      ? verifiedFundByCode(instrument.code) ??
        verifiedFundByCode(instrument.secid)
      : null;
  if (verifiedFund) {
    return {
      secid: verifiedFund.secid,
      code: verifiedFund.code,
      name: verifiedFund.name,
      exchange: verifiedFund.exchange,
      assetType: verifiedFund.assetType,
      provider: verifiedFund.provider,
    };
  }
  if (instrument.exchange !== "OTHER") return instrument;
  const exchange = exchangeFromProviderLabels(
    instrument.secid,
    instrument.code,
  );
  return exchange === "OTHER" ? instrument : { ...instrument, exchange };
}

function canonicalInstrumentCode(
  instrument: Pick<MarketInstrument, "assetType" | "code" | "exchange">,
) {
  return normalizedInstrumentCode({
    code:
      instrument.assetType === "index"
        ? yahooIndexSymbolForCode(instrument.code, instrument.exchange)
        : instrument.code,
  });
}

export function canonicalMarketInstrumentKey(
  instrument: Pick<MarketInstrument, "assetType" | "code" | "exchange">,
): string {
  return `${instrument.assetType}:${canonicalInstrumentCode(instrument)}`;
}

function providerInstrument(
  instrument: MarketInstrument,
  provider: MarketDataProvider,
  secid: string,
): MarketInstrument {
  return {
    ...instrument,
    secid,
    provider,
  };
}

function canonicalProviderInstrument(
  instrument: MarketInstrument,
  provider: MarketDataProvider,
): MarketInstrument {
  const code = canonicalInstrumentCode(instrument);
  return {
    ...providerInstrument(instrument, provider, code),
    code,
  };
}

function networkRouteForProvider(
  provider: MarketDataProvider,
): MarketNetworkRoute {
  if (
    provider === "eastmoney" ||
    provider === "nasdaq" ||
    provider === "nikkei" ||
    provider === "tencent"
  ) {
    return "direct-preferred";
  }
  if (
    provider === "eodhd" ||
    provider === "twelve-data" ||
    provider === "alpha-vantage" ||
    provider === "fmp" ||
    provider === "alltick" ||
    provider === "marketstack" ||
    provider === "zhitu" ||
    provider === "juhe"
  ) {
    return "credentialed";
  }
  return "proxy-preferred";
}

function nikkei225Profile(instrument: MarketInstrument): CanonicalMarketProfile {
  const common: MarketInstrument = {
    ...instrument,
    secid: "^N225",
    code: "N225",
    exchange: "JPX",
    assetType: "index",
    provider: "yahoo",
  };
  return {
    key: "index:N225",
    primary: {
      provider: "yahoo",
      role: "primary",
      capability: "ohlcv",
      networkRoute: "proxy-preferred",
      methodology: "Nikkei 225 price index, Yahoo exchange-local daily bars",
      instrument: common,
    },
    backups: [
      {
        provider: "nikkei",
        role: "backup",
        capability: "ohlcv",
        networkRoute: "direct-preferred",
        methodology: "Official Nikkei 225 daily OHLC history",
        promotionPolicy: "verified-identity",
        instrument: providerInstrument(common, "nikkei", "N225"),
      },
      {
        provider: "eastmoney",
        role: "backup",
        capability: "ohlcv",
        networkRoute: "direct-preferred",
        methodology: "Nikkei 225 price index, Eastmoney adjusted daily bars",
        promotionPolicy: "verified-identity",
        instrument: providerInstrument(common, "eastmoney", "100.N225"),
      },
      {
        provider: "eodhd",
        role: "backup",
        capability: "ohlcv",
        networkRoute: "credentialed",
        methodology: "Nikkei 225 index mapping, daily bars",
        promotionPolicy: "verified-identity",
        instrument: providerInstrument(common, "eodhd", "N225"),
      },
      {
        provider: "twelve-data",
        role: "backup",
        capability: "ohlcv",
        networkRoute: "credentialed",
        methodology: "Exchange-verified Nikkei 225 daily bars",
        promotionPolicy: "verified-identity",
        instrument: providerInstrument(common, "twelve-data", "N225"),
      },
      {
        provider: "fmp",
        role: "backup",
        capability: "ohlcv",
        networkRoute: "credentialed",
        methodology: "Exchange-verified Nikkei 225 daily bars",
        promotionPolicy: "verified-identity",
        instrument: providerInstrument(common, "fmp", "^N225"),
      },
      {
        provider: "alpha-vantage",
        role: "backup",
        capability: "ohlcv",
        networkRoute: "credentialed",
        methodology: "Candidate Nikkei 225 daily bars; overlap-gated",
        promotionPolicy: "overlap-required",
        instrument: providerInstrument(
          common,
          "alpha-vantage",
          "N225",
        ),
      },
      {
        provider: "nasdaq",
        role: "backup",
        capability: "ohlcv",
        networkRoute: "proxy-preferred",
        methodology: "Candidate N225 index mapping; quality-gated",
        promotionPolicy: "overlap-required",
        instrument: providerInstrument(common, "nasdaq", "N225"),
      },
    ],
    references: [
      {
        provider: "fred",
        role: "reference",
        capability: "close-only",
        networkRoute: "direct-preferred",
        methodology: "Nikkei 225 official daily close redistributed by FRED",
      },
    ],
  };
}

const EASTMONEY_COMMODITY_CONTINUOUS_SYMBOLS: Readonly<
  Record<string, string>
> = {
  "GC=F": "101.GC00Y",
  "SI=F": "101.SI00Y",
  "CL=F": "102.CL00Y",
  "HG=F": "101.HG00Y",
};

function commodityProfile(
  instrument: MarketInstrument,
  normalizedCode: string,
): CanonicalMarketProfile | null {
  const eastmoneySecid =
    EASTMONEY_COMMODITY_CONTINUOUS_SYMBOLS[normalizedCode];
  if (!eastmoneySecid) return null;
  const common: MarketInstrument = {
    ...instrument,
    secid: normalizedCode,
    code: normalizedCode,
    exchange: eastmoneySecid.startsWith("102.") ? "NYMEX" : "COMEX",
    assetType: "commodity",
    provider: "yahoo",
  };
  return {
    key: `commodity:${normalizedCode}`,
    primary: {
      provider: "yahoo",
      role: "primary",
      capability: "ohlcv",
      networkRoute: "proxy-preferred",
      methodology: "Yahoo continuous futures quote proxy",
      instrument: common,
    },
    backups: [
      ...(normalizedCode === "GC=F"
        ? ([
            {
              provider: "fmp",
              role: "backup",
              capability: "ohlcv",
              networkRoute: "credentialed",
              methodology:
                "FMP GCUSD commodity daily bars; continuous-futures overlap required",
              promotionPolicy: "overlap-required",
              instrument: providerInstrument(common, "fmp", "GCUSD"),
            },
            {
              provider: "alltick",
              role: "backup",
              capability: "ohlcv",
              networkRoute: "credentialed",
              methodology:
                "AllTick GOLD commodity daily bars; continuous-futures overlap required",
              promotionPolicy: "overlap-required",
              instrument: providerInstrument(common, "alltick", "GOLD"),
            },
          ] satisfies CanonicalMarketProfile["backups"])
        : []),
      {
        provider: "eastmoney",
        role: "backup",
        capability: "ohlcv",
        networkRoute: "direct-preferred",
        methodology: "Eastmoney continuous futures quote proxy",
        promotionPolicy: "overlap-required",
        instrument: providerInstrument(
          common,
          "eastmoney",
          eastmoneySecid,
        ),
      },
    ],
    references: [],
  };
}

function semiconductorProfile(
  instrument: MarketInstrument,
): CanonicalMarketProfile {
  const common: MarketInstrument = {
    ...instrument,
    secid: "^SOX",
    code: "SOX",
    exchange: "PHLX",
    assetType: "index",
    provider: "yahoo",
  };
  const backups: CanonicalMarketProfile["backups"][number][] = [
    {
      provider: "nasdaq",
      role: "backup",
      capability: "ohlcv",
      networkRoute: "direct-preferred",
      methodology: "PHLX Semiconductor Index, Nasdaq daily history",
      promotionPolicy: "verified-identity",
      instrument: providerInstrument(common, "nasdaq", "SOX"),
    },
    {
      provider: "eodhd",
      role: "backup",
      capability: "ohlcv",
      networkRoute: "credentialed",
      methodology: "SOX index mapping, daily bars",
      promotionPolicy: "verified-identity",
      instrument: providerInstrument(common, "eodhd", "SOX"),
    },
    {
      provider: "twelve-data",
      role: "backup",
      capability: "ohlcv",
      networkRoute: "credentialed",
      methodology: "Exchange-verified SOX daily bars",
      promotionPolicy: "verified-identity",
      instrument: providerInstrument(common, "twelve-data", "SOX"),
    },
    {
      provider: "fmp",
      role: "backup",
      capability: "ohlcv",
      networkRoute: "credentialed",
      methodology: "Exchange-verified SOX daily bars",
      promotionPolicy: "verified-identity",
      instrument: providerInstrument(common, "fmp", "^SOX"),
    },
    {
      provider: "alpha-vantage",
      role: "backup",
      capability: "ohlcv",
      networkRoute: "credentialed",
      methodology: "Candidate SOX daily bars; overlap-gated",
      promotionPolicy: "overlap-required",
      instrument: providerInstrument(common, "alpha-vantage", "SOX"),
    },
  ];
  if (
    instrument.provider === "eastmoney" &&
    /^\d+\.[A-Za-z0-9._-]+$/.test(instrument.secid)
  ) {
    backups.push({
      provider: "eastmoney",
      role: "backup",
      capability: "ohlcv",
      networkRoute: "direct-preferred",
      methodology: "Eastmoney SOX candidate mapping; quality-gated",
      promotionPolicy: "overlap-required",
      instrument,
    });
  }
  return {
    key: "index:SOX",
    primary: {
      provider: "yahoo",
      role: "primary",
      capability: "ohlcv",
      networkRoute: "proxy-preferred",
      methodology: "PHLX Semiconductor Index, Yahoo daily bars",
      instrument: common,
    },
    backups,
    references: [],
  };
}

function genericProfile(instrument: MarketInstrument): CanonicalMarketProfile {
  const verifiedFund =
    instrument.assetType === "etf"
      ? verifiedFundByCode(instrument.code) ??
        verifiedFundByCode(instrument.secid)
      : null;
  const keepsEastmoneyLofPrimary =
    instrument.provider === "eastmoney" &&
    instrument.assetType === "etf" &&
    /\bLOF\b/i.test(instrument.name);
  const yahooSymbol = verifiedFund || keepsEastmoneyLofPrimary
    ? null
    : yahooPrimarySymbolForInstrument(instrument);
  const primaryInstrument = yahooSymbol
    ? providerInstrument(instrument, "yahoo", yahooSymbol)
    : instrument;
  const backupCandidates: CanonicalMarketProfile["backups"][number][] = [];
  const addBackup = (
    backupInstrument: MarketInstrument,
    methodology: string,
    promotionPolicy:
      | "verified-identity"
      | "overlap-required" = "overlap-required",
  ) => {
    if (
      backupInstrument.provider === primaryInstrument.provider ||
      backupCandidates.some(
        (candidate) => candidate.provider === backupInstrument.provider,
      )
    ) {
      return;
    }
    backupCandidates.push({
      provider: backupInstrument.provider,
      role: "backup",
      capability: "ohlcv",
      networkRoute: networkRouteForProvider(backupInstrument.provider),
      methodology,
      promotionPolicy,
      instrument: backupInstrument,
    });
  };
  if (instrument.provider !== primaryInstrument.provider) {
    addBackup(
      instrument,
      "Original provider instrument definition",
      "verified-identity",
    );
  }
  if (verifiedFund && primaryInstrument.provider !== "eastmoney") {
    addBackup(
      providerInstrument(instrument, "eastmoney", `0.${verifiedFund.code}`),
      "Verified exchange-local raw LOF daily history",
      "verified-identity",
    );
  }
  if (
    primaryInstrument.provider !== "zhitu" &&
    instrument.assetType === "index" &&
    ["SSE", "SZSE"].includes(instrument.exchange)
  ) {
    addBackup(
      providerInstrument(
        instrument,
        "zhitu",
        normalizedInstrumentCode(instrument),
      ),
      "Exchange-local Chinese index daily bars",
      "verified-identity",
    );
  }
  if (
    primaryInstrument.provider !== "eodhd" &&
    instrument.assetType !== "commodity"
  ) {
    addBackup(
      canonicalProviderInstrument(instrument, "eodhd"),
      "Exchange-verified index or ETF daily bars",
      "verified-identity",
    );
  }
  if (
    primaryInstrument.provider !== "twelve-data" &&
    instrument.assetType !== "commodity"
  ) {
    addBackup(
      canonicalProviderInstrument(instrument, "twelve-data"),
      "Exchange-verified index or ETF daily bars",
      "verified-identity",
    );
  }
  if (
    primaryInstrument.provider !== "fmp" &&
    instrument.assetType !== "commodity"
  ) {
    addBackup(
      canonicalProviderInstrument(instrument, "fmp"),
      "Exchange-verified index or ETF daily bars",
      "verified-identity",
    );
  }
  if (
    primaryInstrument.provider !== "alpha-vantage" &&
    instrument.assetType !== "commodity"
  ) {
    addBackup(
      canonicalProviderInstrument(instrument, "alpha-vantage"),
      "Exchange-resolved daily bars; overlap-gated",
      "overlap-required",
    );
  }
  if (
    primaryInstrument.provider !== "marketstack" &&
    instrument.assetType === "etf"
  ) {
    addBackup(
      providerInstrument(
        instrument,
        "marketstack",
        normalizedInstrumentCode(instrument),
      ),
      "Exchange-verified ETF end-of-day bars",
      "verified-identity",
    );
  }
  if (
    primaryInstrument.provider !== "nasdaq" &&
    instrument.assetType !== "commodity"
  ) {
    addBackup(
      canonicalProviderInstrument(instrument, "nasdaq"),
      "Nasdaq website daily-history candidate; quality-gated",
      "overlap-required",
    );
  }
  if (
    primaryInstrument.provider !== "tencent" &&
    ["index", "etf"].includes(instrument.assetType) &&
    ["SSE", "SZSE"].includes(instrument.exchange)
  ) {
    addBackup(
      providerInstrument(
        instrument,
        "tencent",
        normalizedInstrumentCode(instrument),
      ),
      "Exchange-local raw daily history and real-time quote",
      "verified-identity",
    );
  }
  if (
    primaryInstrument.provider !== "juhe" &&
    ["index", "etf"].includes(instrument.assetType) &&
    ["SSE", "SZSE"].includes(instrument.exchange)
  ) {
    addBackup(
      providerInstrument(
        instrument,
        "juhe",
        normalizedInstrumentCode(instrument),
      ),
      "Juhe delayed current-session quote; temporary-quote fallback only",
      "overlap-required",
    );
  }
  return {
    key: canonicalMarketInstrumentKey(instrument),
    primary: {
      provider: primaryInstrument.provider,
      role: "primary",
      capability: "ohlcv",
      networkRoute: networkRouteForProvider(primaryInstrument.provider),
      methodology:
        primaryInstrument.provider === "yahoo"
          ? "Yahoo exchange-local instrument definition"
          : "Selected provider instrument definition",
      instrument: primaryInstrument,
    },
    backups: backupCandidates,
    references: [],
  };
}

export function resolveCanonicalMarketProfile(
  instrument: MarketInstrument,
): CanonicalMarketProfile {
  instrument = normalizeCanonicalInstrumentIdentity(instrument);
  if (
    instrument.assetType === "index" &&
    normalizedInstrumentCode(instrument) === "N225"
  ) {
    return nikkei225Profile(instrument);
  }
  if (
    instrument.assetType === "index" &&
    normalizedInstrumentCode(instrument) === "SOX"
  ) {
    return semiconductorProfile(instrument);
  }
  if (instrument.assetType === "commodity") {
    const profile = commodityProfile(
      instrument,
      normalizedInstrumentCode(instrument),
    );
    if (profile) return profile;
  }
  return genericProfile(instrument);
}

export function canonicalSeriesNeedsFullHistoryReplacement(
  profile: CanonicalMarketProfile,
  series: Pick<MarketSeries, "priceAdjustment">,
): boolean {
  const verifiedFund = verifiedFundByCode(profile.primary.instrument.code);
  return Boolean(
    verifiedFund &&
      profile.primary.instrument.secid === verifiedFund.secid &&
      series.priceAdjustment !== verifiedFund.canonicalPriceAdjustment,
  );
}

export function canonicalSourceDefinition(
  profile: CanonicalMarketProfile,
  provider: MarketSourceProvider,
): CanonicalMarketSourceDefinition | null {
  if (profile.primary.provider === provider) return profile.primary;
  return (
    profile.backups.find((source) => source.provider === provider) ??
    profile.references.find((source) => source.provider === provider) ??
    null
  );
}
