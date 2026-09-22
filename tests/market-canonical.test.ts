import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalMarketInstrumentKey,
  resolveCanonicalMarketProfile,
} from "../lib/market/canonical";
import { parseAlphaVantageDailyCsv } from "../lib/market/alpha-vantage";
import {
  fetchAllTickDailySeries,
  isAllTickCredentialExpired,
  parseAllTickKlineRows,
} from "../lib/market/alltick";
import {
  readCanonicalMarketSeriesEntry,
  writeCanonicalMarketSeries,
} from "../lib/market/canonical-cache";
import {
  exchangeFromProviderLabels,
  knownIndexExchange,
} from "../lib/market/exchanges";
import { parseFredNikkei225Csv } from "../lib/market/fred";
import {
  fetchFmpDailySeries,
  parseFmpDailyRows,
} from "../lib/market/fmp";
import { parseNikkei225DailyCsv } from "../lib/market/nikkei";
import { parseMarketstackEodRows } from "../lib/market/marketstack";
import {
  fetchJuheQuoteSeries,
  parseJuheQuote,
} from "../lib/market/juhe";
import { parseZhituDailyRows } from "../lib/market/zhitu";
import { parseTencentQuote } from "../lib/market/tencent";
import {
  assessMarketVolumeCoverage,
  measureMarketReferenceQuality,
  measureMarketSeriesQuality,
  missingPublishedVolumeRepairKey,
} from "../lib/market/quality";
import { classifyMarketProviderError } from "../lib/market/provider-errors";
import type {
  MarketBar,
  MarketInstrument,
  MarketReferenceSeries,
  MarketSeries,
} from "../lib/market/types";
import {
  mergeCanonicalMarketSeries,
  mergeLatestMarketSeries,
  mergePreferredTemporaryQuote,
  selectCanonicalFallbackSeries,
} from "../lib/market/series";
import { parseTwelveDataValues } from "../lib/market/twelve-data";
import { refreshShortcutMarketInstrument } from "../lib/market/shortcut-refresh";
import {
  nextMarketSourceDemotedAt,
  orderMarketRecoveryDefinitions,
  selectMarketSourceByRollingHealth,
  summarizeMarketSourceHealth,
  type MarketSourceHealthAttemptSample,
  type MarketSourceHealthLike,
} from "../lib/market/source-health";
import {
  yahooIndexSymbolForCode,
  yahooPrimarySymbolForInstrument,
} from "../lib/market/yahoo";

const nikkei: MarketInstrument = {
  secid: "^N225",
  code: "N225",
  name: "Nikkei 225",
  exchange: "JPX",
  assetType: "index",
  provider: "yahoo",
};

test("classifies provider credential, access, quota, and network failures", () => {
  assert.equal(
    classifyMarketProviderError(
      new Error("Provider request failed with status 401"),
    ),
    "PROVIDER_CREDENTIAL_INVALID",
  );
  assert.equal(
    classifyMarketProviderError(
      new Error("Provider request failed with status 403"),
    ),
    "PROVIDER_ACCESS_DENIED",
  );
  assert.equal(
    classifyMarketProviderError(new Error("HTTP 429 rate limit")),
    "PROVIDER_QUOTA_LIMITED",
  );
  assert.equal(
    classifyMarketProviderError(new Error("Provider is not configured")),
    "PROVIDER_NOT_CONFIGURED",
  );
  assert.equal(
    classifyMarketProviderError(new Error("socket disconnected")),
    "UPSTREAM_UNAVAILABLE",
  );
  assert.equal(
    classifyMarketProviderError(
      new Error("Juhe API key is invalid or expired"),
    ),
    "PROVIDER_CREDENTIAL_INVALID",
  );
  assert.equal(
    classifyMarketProviderError(
      new Error("Juhe quota limit has been reached"),
    ),
    "PROVIDER_QUOTA_LIMITED",
  );
});

function bar(time: string, close: number): MarketBar {
  const timestamp = Date.parse(`${time}T00:00:00Z`);
  return {
    time,
    timestamp,
    open: close - 10,
    high: close + 20,
    low: close - 30,
    close,
    volume: 0,
    amount: 0,
    amplitude: 0,
    changePercent: 0,
    change: 0,
    turnoverRate: 0,
  };
}

function series(
  instrument: MarketInstrument,
  source: MarketSeries["source"],
  closes: readonly number[],
): MarketSeries {
  return {
    instrument,
    interval: "1d",
    priceAdjustment: "corporate-action-adjusted",
    previousClose: closes[0] ?? 0,
    bars: closes.map((close, index) =>
      bar(`2026-07-${String(23 + index).padStart(2, "0")}`, close),
    ),
    latestBarStatus: "complete",
    source,
    fetchedAt: "2026-07-27T07:00:00.000Z",
  };
}

test("pins every N225 alias to the Yahoo canonical profile", () => {
  const profile = resolveCanonicalMarketProfile(nikkei);

  assert.equal(canonicalMarketInstrumentKey(nikkei), "index:N225");
  assert.equal(profile.key, "index:N225");
  assert.equal(profile.primary.provider, "yahoo");
  assert.equal(profile.primary.instrument.secid, "^N225");
  assert.deepEqual(
    profile.backups.map((source) => source.provider),
    [
      "nikkei",
      "eastmoney",
      "eodhd",
      "twelve-data",
      "fmp",
      "alpha-vantage",
      "nasdaq",
    ],
  );
  assert.deepEqual(
    profile.references.map((source) => source.provider),
    ["fred"],
  );
});

test("normalizes provider index aliases before profile validation", () => {
  const aliases: Array<[
    MarketInstrument,
    MarketInstrument,
    string,
  ]> = [
    [
      {
        secid: "100.NDX100",
        code: "NDX100",
        name: "Nasdaq 100",
        exchange: "NASDAQ",
        assetType: "index",
        provider: "eastmoney",
      },
      {
        secid: "^NDX",
        code: "NDX",
        name: "Nasdaq 100",
        exchange: "NASDAQ",
        assetType: "index",
        provider: "yahoo",
      },
      "index:NDX",
    ],
    [
      {
        secid: "100.SPX",
        code: "SPX",
        name: "S&P 500",
        exchange: "NYSE",
        assetType: "index",
        provider: "eastmoney",
      },
      {
        secid: "^GSPC",
        code: "GSPC",
        name: "S&P 500",
        exchange: "NYSE",
        assetType: "index",
        provider: "yahoo",
      },
      "index:GSPC",
    ],
    [
      {
        secid: "100.SENSEX",
        code: "SENSEX",
        name: "S&P BSE Sensex",
        exchange: "BSE",
        assetType: "index",
        provider: "eastmoney",
      },
      {
        secid: "^BSESN",
        code: "BSESN",
        name: "S&P BSE Sensex",
        exchange: "BSE",
        assetType: "index",
        provider: "yahoo",
      },
      "index:BSESN",
    ],
    [
      {
        secid: "100.SX5E",
        code: "SX5E",
        name: "Euro Stoxx 50",
        exchange: "XETRA",
        assetType: "index",
        provider: "eastmoney",
      },
      {
        secid: "^STOXX50E",
        code: "STOXX50E",
        name: "Euro Stoxx 50",
        exchange: "XETRA",
        assetType: "index",
        provider: "yahoo",
      },
      "index:STOXX50E",
    ],
  ];

  for (const [selected, providerResult, expectedKey] of aliases) {
    assert.equal(canonicalMarketInstrumentKey(selected), expectedKey);
    assert.equal(canonicalMarketInstrumentKey(providerResult), expectedKey);
  }

  const selected = aliases[0][0];
  const providerResult = aliases[0][1];
  const profile = resolveCanonicalMarketProfile(selected);
  const primary = series(providerResult, "yahoo", [28_000, 28_200]);
  const merged = mergeCanonicalMarketSeries(null, primary, 100, profile);
  const nasdaq = profile.backups.find(
    (definition) => definition.provider === "nasdaq",
  );

  assert.equal(profile.key, "index:NDX");
  assert.equal(profile.primary.instrument.secid, "^NDX");
  assert.equal(merged.bars.at(-1)?.close, 28_200);
  assert.equal(nasdaq?.instrument.code, "NDX");
  assert.equal(nasdaq?.instrument.secid, "NDX");
});

test("preserves a published same-session volume when a refresh omits it", () => {
  const history = series(nikkei, "yahoo", [64_000, 65_000]);
  history.bars[1] = { ...history.bars[1], volume: 12_345 };
  const latest = series(nikkei, "yahoo", [64_100, 65_100]);
  latest.bars[0] = { ...latest.bars[0], volume: 11_111 };
  latest.bars[1] = { ...latest.bars[1], volume: 0 };

  const merged = mergeLatestMarketSeries(history, latest, 100);

  assert.equal(merged.bars[0].volume, 11_111);
  assert.equal(merged.bars[1].volume, 12_345);
  assert.equal(merged.bars[1].close, 65_100);
});

test("pins SOX and commodity proxies to Yahoo history", () => {
  const sox = resolveCanonicalMarketProfile({
    secid: "100.SOX",
    code: "SOX",
    name: "PHLX Semiconductor Index",
    exchange: "PHLX",
    assetType: "index",
    provider: "eastmoney",
  });
  assert.equal(sox.primary.provider, "yahoo");
  assert.equal(sox.primary.instrument.secid, "^SOX");
  assert.deepEqual(
    sox.backups.map((source) => source.provider),
    [
      "nasdaq",
      "eodhd",
      "twelve-data",
      "fmp",
      "alpha-vantage",
      "eastmoney",
    ],
  );

  const commodities = [
    ["GC=F", "101.GC00Y"],
    ["SI=F", "101.SI00Y"],
    ["CL=F", "102.CL00Y"],
    ["HG=F", "101.HG00Y"],
  ] as const;
  for (const [code, secid] of commodities) {
    const profile = resolveCanonicalMarketProfile({
      secid: code,
      code,
      name: code,
      exchange: "OTHER",
      assetType: "commodity",
      provider: "yahoo",
    });
    assert.equal(profile.primary.provider, "yahoo");
    assert.equal(profile.primary.instrument.secid, code);
    assert.equal(
      profile.primary.instrument.exchange,
      code === "CL=F" ? "NYMEX" : "COMEX",
    );
    if (code === "GC=F") {
      assert.deepEqual(
        profile.backups.map((source) => source.provider),
        ["fmp", "alltick", "eastmoney"],
      );
      assert.deepEqual(
        profile.backups.map((source) => source.instrument.secid),
        ["GCUSD", "GOLD", secid],
      );
      assert.ok(
        profile.backups.every(
          (source) => source.promotionPolicy === "overlap-required",
        ),
      );
    } else {
      assert.equal(profile.backups[0]?.provider, "eastmoney");
      assert.equal(profile.backups[0]?.instrument.secid, secid);
    }
  }
});

test("prefers verified Yahoo mappings and retains unsupported providers", () => {
  const spy = resolveCanonicalMarketProfile({
    secid: "107.SPY",
    code: "SPY",
    name: "SPDR S&P 500 ETF Trust",
    exchange: "NYSE_ARCA",
    assetType: "etf",
    provider: "eastmoney",
  });
  assert.equal(spy.primary.provider, "yahoo");
  assert.equal(spy.primary.instrument.secid, "SPY");
  assert.deepEqual(
    spy.backups.map((source) => source.provider),
    [
      "eastmoney",
      "eodhd",
      "twelve-data",
      "fmp",
      "alpha-vantage",
      "marketstack",
      "nasdaq",
    ],
  );

  const csi300 = resolveCanonicalMarketProfile({
    secid: "1.000300",
    code: "000300",
    name: "CSI 300",
    exchange: "SSE",
    assetType: "index",
    provider: "eastmoney",
  });
  assert.equal(csi300.primary.provider, "yahoo");
  assert.equal(csi300.primary.instrument.secid, "000300.SS");
  assert.deepEqual(
    csi300.backups.map((source) => source.provider),
    [
      "eastmoney",
      "zhitu",
      "eodhd",
      "twelve-data",
      "fmp",
      "alpha-vantage",
      "nasdaq",
      "tencent",
      "juhe",
    ],
  );

  const unsupportedJpxEtf = resolveCanonicalMarketProfile({
    secid: "100.1321",
    code: "1321",
    name: "Nikkei 225 ETF",
    exchange: "JPX",
    assetType: "etf",
    provider: "eastmoney",
  });
  assert.equal(unsupportedJpxEtf.primary.provider, "eastmoney");

  const discoveredJpxEtf = resolveCanonicalMarketProfile({
    secid: "1321.T",
    code: "1321.T",
    name: "Nikkei 225 ETF",
    exchange: "JPX",
    assetType: "etf",
    provider: "yahoo",
  });
  assert.equal(discoveredJpxEtf.primary.provider, "yahoo");
  assert.equal(discoveredJpxEtf.primary.instrument.secid, "1321.T");
  assert.equal(
    yahooPrimarySymbolForInstrument(unsupportedJpxEtf.primary.instrument),
    null,
  );
});

test("maps global index codes and provider labels to their real exchanges", () => {
  assert.equal(knownIndexExchange("N225"), "JPX");
  assert.equal(knownIndexExchange("GDAXI"), "XETRA");
  assert.equal(knownIndexExchange("^FTSE"), "LSE");
  assert.equal(knownIndexExchange("FCHI"), "EURONEXT");
  assert.equal(knownIndexExchange("KS11"), "KRX");
  assert.equal(knownIndexExchange("SENSEX"), "BSE");
  assert.equal(knownIndexExchange("BVSP"), "B3");
  assert.equal(knownIndexExchange("TWII"), "TWSE");
  assert.equal(knownIndexExchange("STI"), "SGX");
  assert.equal(exchangeFromProviderLabels("CMX", "GC=F"), "COMEX");
  assert.equal(exchangeFromProviderLabels("NYM", "CL=F"), "NYMEX");
  assert.equal(exchangeFromProviderLabels("SHE China", "164824"), "SZSE");
  assert.equal(
    exchangeFromProviderLabels("NYSE Arca", "SPY"),
    "NYSE_ARCA",
  );
  assert.equal(yahooIndexSymbolForCode("NDX100", "NASDAQ"), "^NDX");
  assert.equal(yahooIndexSymbolForCode("SENSEX", "BSE"), "^BSESN");
  assert.equal(
    yahooIndexSymbolForCode("SX5E", "EURONEXT"),
    "^STOXX50E",
  );

  const sensexProfile = resolveCanonicalMarketProfile({
    secid: "100.SENSEX",
    code: "SENSEX",
    name: "S&P BSE SENSEX",
    exchange: "BSE",
    assetType: "index",
    provider: "eastmoney",
  });
  assert.equal(sensexProfile.primary.provider, "yahoo");
  assert.equal(sensexProfile.primary.instrument.secid, "^BSESN");
  assert.equal(sensexProfile.backups[0]?.provider, "eastmoney");
});

test("repairs legacy OTHER identity for the verified 164824 LOF", () => {
  const profile = resolveCanonicalMarketProfile({
    secid: "164824.SHE",
    code: "164824",
    name: "India Market Fund",
    exchange: "OTHER",
    assetType: "etf",
    provider: "eodhd",
  });

  assert.equal(profile.key, "etf:164824");
  assert.equal(profile.primary.provider, "tencent");
  assert.equal(profile.primary.instrument.secid, "sz164824");
  assert.equal(profile.primary.instrument.exchange, "SZSE");
  assert.ok(
    profile.backups.some((definition) => definition.provider === "eastmoney"),
  );
});

test("parses the FRED close-only reference without inventing OHLC bars", () => {
  const observations = parseFredNikkei225Csv(
    [
      "observation_date,NIKKEI225",
      "2026-07-23,64612.31",
      "2026-07-24,64611.15",
      "2026-07-25,.",
      "",
    ].join("\n"),
  );

  assert.deepEqual(
    observations.map(({ time, value }) => ({ time, value })),
    [
      { time: "2026-07-23", value: 64_612.31 },
      { time: "2026-07-24", value: 64_611.15 },
    ],
  );
});

test("parses official and credentialed provider daily bars", () => {
  const profile = resolveCanonicalMarketProfile(nikkei);
  const official = parseNikkei225DailyCsv(
    [
      "Date of Data,Close,Open,High,Low",
      '"2026/07/24","64611.15","64100.00","64700.00","64000.00"',
      '"2026/07/27","65000.00","64800.00","65100.00","64700.00"',
    ].join("\n"),
  );
  assert.deepEqual(
    official.map(({ time, close }) => ({ time, close })),
    [
      { time: "2026-07-24", close: 64_611.15 },
      { time: "2026-07-27", close: 65_000 },
    ],
  );

  const twelve = parseTwelveDataValues(
    [
      {
        datetime: "2026-07-27",
        open: "1.20",
        high: "1.24",
        low: "1.19",
        close: "1.23",
        volume: "1200",
      },
      {
        datetime: "2026-07-24",
        open: "1.18",
        high: "1.21",
        low: "1.17",
        close: "1.20",
        volume: "1000",
      },
    ],
    {
      ...profile.primary.instrument,
      provider: "twelve-data",
    },
  );
  assert.deepEqual(
    twelve.bars.map(({ time, close }) => ({ time, close })),
    [
      { time: "2026-07-24", close: 1.2 },
      { time: "2026-07-27", close: 1.23 },
    ],
  );

  const alpha = parseAlphaVantageDailyCsv(
    [
      "timestamp,open,high,low,close,volume",
      "2026-07-27,1.20,1.24,1.19,1.23,1200",
      "2026-07-24,1.18,1.21,1.17,1.20,1000",
    ].join("\n"),
    {
      ...profile.primary.instrument,
      provider: "alpha-vantage",
    },
  );
  assert.equal(alpha.bars.at(-1)?.close, 1.23);

  const fmp = parseFmpDailyRows(
    [
      {
        date: "2026-07-27",
        open: 1.2,
        high: 1.24,
        low: 1.19,
        close: 1.23,
        volume: 1200,
      },
      {
        date: "2026-07-24",
        open: 1.18,
        high: 1.21,
        low: 1.17,
        close: 1.2,
        volume: 1000,
      },
    ],
    {
      ...profile.primary.instrument,
      provider: "fmp",
    },
  );
  assert.equal(fmp.bars.at(-1)?.close, 1.23);

  const allTick = parseAllTickKlineRows(
    [
      {
        timestamp: Date.parse("2026-07-27T00:00:00Z") / 1_000,
        open_price: "4030.2",
        high_price: "4070.8",
        low_price: "4018.1",
        close_price: "4055.6",
        volume: "12000",
        turnover: "48000000",
      },
    ],
    {
      secid: "GOLD",
      code: "GC=F",
      name: "Gold Futures Proxy",
      exchange: "COMEX",
      assetType: "commodity",
      provider: "alltick",
    },
    new Date("2026-07-28T09:00:00.000Z"),
  );
  assert.equal(allTick.bars[0]?.close, 4_055.6);
  assert.equal(allTick.instrument.code, "GC=F");
  assert.equal(allTick.source, "alltick");

  const marketstack = parseMarketstackEodRows(
    [
      {
        date: "2026-07-27T00:00:00+0000",
        symbol: "SPY",
        exchange: "ARCX",
        open: 635,
        high: 640,
        low: 634,
        close: 639,
        volume: 1_000,
        adj_open: 635,
        adj_high: 640,
        adj_low: 634,
        adj_close: 639,
        adj_volume: 1_000,
      },
    ],
    {
      secid: "SPY",
      code: "SPY",
      name: "SPDR S&P 500 ETF Trust",
      exchange: "NYSE_ARCA",
      assetType: "etf",
      provider: "marketstack",
    },
  );
  assert.equal(marketstack.bars[0]?.close, 639);
  assert.equal(marketstack.priceAdjustment, "corporate-action-adjusted");

  const zhitu = parseZhituDailyRows(
    [
      {
        t: "2026-07-24",
        o: 4_118.31,
        h: 4_137.96,
        l: 4_102.57,
        c: 4_127.16,
        v: 168_431_200,
        a: 321_654_000_000,
        pc: 4_105.22,
      },
      {
        t: "2026-07-27",
        o: 4_130.52,
        h: 4_155.08,
        l: 4_121.77,
        c: 4_149.64,
        v: 172_100_000,
        a: 330_010_000_000,
        pc: 4_127.16,
      },
    ],
    {
      secid: "000300.SS",
      code: "000300",
      name: "CSI 300",
      exchange: "SSE",
      assetType: "index",
      provider: "zhitu",
    },
    new Date("2026-07-28T09:00:00.000Z"),
  );
  assert.equal(zhitu.instrument.secid, "000300.SH");
  assert.equal(zhitu.bars.at(-1)?.close, 4_149.64);
  assert.equal(zhitu.source, "zhitu");

  const tencentFields = Array.from({ length: 88 }, () => "");
  tencentFields[1] = "ETF";
  tencentFields[2] = "513310";
  tencentFields[3] = "4.820";
  tencentFields[4] = "5.195";
  tencentFields[5] = "4.728";
  tencentFields[30] = "20260728113055";
  tencentFields[31] = "-0.375";
  tencentFields[32] = "-7.22";
  tencentFields[33] = "4.889";
  tencentFields[34] = "4.713";
  tencentFields[36] = "12000456";
  tencentFields[37] = "579985";
  tencentFields[38] = "2.31";
  tencentFields[43] = "3.39";
  const tencent = parseTencentQuote(
    `v_sh513310="${tencentFields.join("~")}";`,
    {
      secid: "513310",
      code: "513310",
      name: "China-Korea Semiconductor ETF",
      exchange: "SSE",
      assetType: "etf",
      provider: "tencent",
    },
    new Date("2026-07-28T03:30:55.000Z"),
  );
  assert.equal(tencent.bars[0]?.close, 4.82);
  assert.equal(tencent.bars[0]?.time, "2026-07-28");
  assert.equal(tencent.source, "tencent");

  const juhe = parseJuheQuote(
    {
      error_code: 0,
      resultcode: "200",
      reason: "SUCCESSED!",
      result: [
        {
          data: {
            gid: "sh513310",
            name: "China-Korea Semiconductor ETF",
            date: "2026-07-28",
            time: "15:14:39",
            todayStartPri: "4.728",
            todayMax: "4.889",
            todayMin: "4.713",
            nowPri: "4.820",
            yestodEndPri: "5.195",
            traNumber: "12000456",
            traAmount: "579985",
            increPer: "-7.22",
            increase: "-0.375",
          },
        },
      ],
    },
    {
      secid: "513310",
      code: "513310",
      name: "China-Korea Semiconductor ETF",
      exchange: "SSE",
      assetType: "etf",
      provider: "juhe",
    },
    new Date("2026-07-28T07:14:39.000Z"),
  );
  assert.equal(juhe.bars[0]?.close, 4.82);
  assert.equal(juhe.bars[0]?.time, "2026-07-28");
  assert.equal(juhe.source, "juhe");
});

test("uses the official Juhe ETF quote request without treating it as history", async () => {
  let requestedSymbol = "";
  const quote = await fetchJuheQuoteSeries(
    {
      secid: "513310",
      code: "513310",
      name: "China-Korea Semiconductor ETF",
      exchange: "SSE",
      assetType: "etf",
      provider: "juhe",
    },
    async (input) => {
      const url = new URL(String(input));
      requestedSymbol = url.searchParams.get("gid") ?? "";
      return Response.json({
        error_code: 0,
        resultcode: "200",
        reason: "SUCCESSED!",
        result: [
          {
            data: {
              gid: "sh513310",
              name: "China-Korea Semiconductor ETF",
              date: "2026-07-28",
              time: "15:14:39",
              todayStartPri: "4.728",
              todayMax: "4.889",
              todayMin: "4.713",
              nowPri: "4.820",
              yestodEndPri: "5.195",
              traNumber: "12000456",
              traAmount: "579985",
            },
          },
        ],
      });
    },
    "no-store",
    "test-juhe-key",
  );
  assert.equal(requestedSymbol, "sh513310");
  assert.equal(quote.bars.length, 1);
  assert.equal(quote.priceAdjustment, "raw");
});

test("requests the official FMP and AllTick gold symbols without changing canonical identity", async () => {
  const goldProfile = resolveCanonicalMarketProfile({
    secid: "GC=F",
    code: "GC=F",
    name: "Gold Futures Proxy",
    exchange: "COMEX",
    assetType: "commodity",
    provider: "yahoo",
  });
  const fmpDefinition = goldProfile.backups.find(
    (source) => source.provider === "fmp",
  )!;
  const allTickDefinition = goldProfile.backups.find(
    (source) => source.provider === "alltick",
  )!;
  let fmpSymbol = "";
  const fmpSeries = await fetchFmpDailySeries(
    fmpDefinition.instrument,
    10,
    async (input) => {
      const url = new URL(String(input));
      fmpSymbol = url.searchParams.get("symbol") ?? "";
      return Response.json([
        {
          date: "2026-07-27",
          open: 4_030,
          high: 4_080,
          low: 4_020,
          close: 4_060,
          volume: 100,
        },
      ]);
    },
    "no-store",
    "test-fmp-key",
  );
  assert.equal(fmpSymbol, "GCUSD");
  assert.equal(fmpSeries.instrument.code, "GC=F");

  let allTickCode = "";
  let allTickLimit = 0;
  const allTickSeries = await fetchAllTickDailySeries(
    allTickDefinition.instrument,
    700,
    async (input) => {
      const url = new URL(String(input));
      const query = JSON.parse(url.searchParams.get("query") ?? "{}") as {
        data?: { code?: string; query_kline_num?: number };
      };
      allTickCode = query.data?.code ?? "";
      allTickLimit = query.data?.query_kline_num ?? 0;
      return Response.json({
        ret: 200,
        msg: "ok",
        data: {
          code: "GOLD",
          kline_type: 8,
          kline_list: [
            {
              timestamp:
                Date.parse("2026-07-27T00:00:00Z") / 1_000,
              open_price: "4030",
              high_price: "4080",
              low_price: "4020",
              close_price: "4060",
              volume: "100",
              turnover: "406000",
            },
          ],
        },
      });
    },
    "no-store",
    "test-alltick-token",
  );
  assert.equal(allTickCode, "GOLD");
  assert.equal(allTickLimit, 500);
  assert.equal(allTickSeries.instrument.code, "GC=F");
});

test("stops an expired AllTick trial before making a network request", async () => {
  const expiresAt = "2026-08-04T15:04:45+08:00";
  assert.equal(
    isAllTickCredentialExpired(
      expiresAt,
      new Date("2026-08-04T07:04:44.000Z"),
    ),
    false,
  );
  assert.equal(
    isAllTickCredentialExpired(
      expiresAt,
      new Date("2026-08-04T07:04:45.000Z"),
    ),
    true,
  );
  let requested = false;
  await assert.rejects(
    fetchAllTickDailySeries(
      {
        secid: "GOLD",
        code: "GC=F",
        name: "Gold Futures Proxy",
        exchange: "COMEX",
        assetType: "commodity",
        provider: "alltick",
      },
      10,
      async () => {
        requested = true;
        return Response.json({});
      },
      "no-store",
      "test-token",
      "2026-07-20T00:00:00.000Z",
    ),
    /token has expired/,
  );
  assert.equal(requested, false);
});

test("uses rolling 7 and 30 day health with demotion hysteresis", () => {
  const now = new Date("2026-07-28T12:00:00.000Z");
  const failures: MarketSourceHealthAttemptSample[] = [
    "2026-07-28T09:00:00.000Z",
    "2026-07-28T10:00:00.000Z",
    "2026-07-28T11:00:00.000Z",
  ].map((attemptedAt) => ({
    attemptedAt,
    success: false,
    latencyMs: 500,
    errorCode: "UPSTREAM_UNAVAILABLE",
  }));
  const demotedAt = nextMarketSourceDemotedAt(
    null,
    failures,
    now,
  );
  assert.equal(demotedAt, now.toISOString());

  const recoveredSamples: MarketSourceHealthAttemptSample[] = [
    "2026-07-22T12:00:00.000Z",
    "2026-07-24T12:00:00.000Z",
    "2026-07-26T12:00:00.000Z",
    "2026-07-27T12:00:00.000Z",
    "2026-07-28T12:00:00.000Z",
  ].map((attemptedAt) => ({
    attemptedAt,
    success: true,
    latencyMs: 100,
    errorCode: null,
  }));
  assert.equal(
    nextMarketSourceDemotedAt(
      "2026-07-20T12:00:00.000Z",
      recoveredSamples,
      now,
    ),
    null,
  );
});

test("selects a quality-qualified backup when the configured primary is degraded", () => {
  const now = new Date("2026-07-28T12:00:00.000Z");
  const profile = resolveCanonicalMarketProfile({
    secid: "GC=F",
    code: "GC=F",
    name: "Gold Futures Proxy",
    exchange: "COMEX",
    assetType: "commodity",
    provider: "yahoo",
  });
  const attempts = (
    success: boolean,
    latencyMs: number,
  ): MarketSourceHealthAttemptSample[] =>
    [
      "2026-07-02T12:00:00.000Z",
      "2026-07-10T12:00:00.000Z",
      "2026-07-22T12:00:00.000Z",
      "2026-07-24T12:00:00.000Z",
      "2026-07-28T10:00:00.000Z",
    ].map((attemptedAt) => ({
      attemptedAt,
      success,
      latencyMs,
      errorCode: success ? null : "UPSTREAM_UNAVAILABLE",
    }));
  const records: MarketSourceHealthLike[] = [
    {
      provider: "yahoo",
      lastAttemptAt: "2026-07-28T11:30:00.000Z",
      lastErrorCode: "UPSTREAM_UNAVAILABLE",
      demotedAt: "2026-07-28T11:00:00.000Z",
      recentAttempts: attempts(false, 500),
      quality: null,
    },
    {
      provider: "fmp",
      lastAttemptAt: "2026-07-28T10:00:00.000Z",
      lastErrorCode: null,
      demotedAt: null,
      recentAttempts: attempts(true, 120),
      quality: {
        provider: "fmp",
        latencyMs: 120,
        barCount: 500,
        firstDate: "2024-07-01",
        lastDate: "2026-07-28",
        missingDatePercent: 0,
        meanOpenErrorPercent: 0.7,
        meanHighErrorPercent: 0.8,
        meanLowErrorPercent: 0.9,
        meanCloseErrorPercent: 0.6,
        latestDateMatches: true,
        adjustmentMatches: true,
        methodology: "fixture",
        networkRoute: "credentialed",
      },
    },
  ];
  const fmpSummary = summarizeMarketSourceHealth(records[1]!, now);
  assert.equal(fmpSummary.sevenDays.attempts, 3);
  assert.equal(fmpSummary.thirtyDays.attempts, 5);

  const selection = selectMarketSourceByRollingHealth(
    profile,
    records,
    now,
  );
  assert.equal(selection.configuredPrimaryDegraded, true);
  assert.equal(selection.shouldProbeConfiguredPrimary, false);
  assert.equal(selection.effectiveProvider, "fmp");
  assert.equal(selection.orderedBackups[0]?.provider, "fmp");
});

test("tries Tencent first and quota-limited Juhe last during Chinese quote recovery", () => {
  const now = new Date("2026-07-28T12:00:00.000Z");
  const profile = resolveCanonicalMarketProfile({
    secid: "1.000300",
    code: "000300",
    name: "CSI 300",
    exchange: "SSE",
    assetType: "index",
    provider: "eastmoney",
  });
  const recovery = orderMarketRecoveryDefinitions(profile, []);
  assert.equal(recovery[0]?.provider, "tencent");
  assert.equal(recovery.at(-1)?.provider, "juhe");

  const healthyQuoteAttempts: MarketSourceHealthAttemptSample[] = [
    "2026-07-02T12:00:00.000Z",
    "2026-07-10T12:00:00.000Z",
    "2026-07-22T12:00:00.000Z",
    "2026-07-24T12:00:00.000Z",
    "2026-07-28T10:00:00.000Z",
  ].map((attemptedAt) => ({
    attemptedAt,
    success: true,
    latencyMs: 120,
    errorCode: null,
  }));
  const selection = selectMarketSourceByRollingHealth(
    profile,
    [
      {
        provider: profile.primary.provider,
        lastAttemptAt: "2026-07-28T11:30:00.000Z",
        lastErrorCode: "UPSTREAM_UNAVAILABLE",
        demotedAt: "2026-07-28T11:00:00.000Z",
        recentAttempts: healthyQuoteAttempts.map((attempt) => ({
          ...attempt,
          success: false,
          errorCode: "UPSTREAM_UNAVAILABLE",
        })),
        quality: null,
      },
      {
        provider: "juhe",
        lastAttemptAt: "2026-07-28T10:00:00.000Z",
        lastErrorCode: null,
        demotedAt: null,
        recentAttempts: healthyQuoteAttempts,
        quality: {
          provider: "juhe",
          latencyMs: 120,
          barCount: 1,
          firstDate: "2026-07-28",
          lastDate: "2026-07-28",
          missingDatePercent: 0,
          meanOpenErrorPercent: 0,
          meanHighErrorPercent: 0,
          meanLowErrorPercent: 0,
          meanCloseErrorPercent: 0,
          latestDateMatches: true,
          adjustmentMatches: true,
          methodology: "quote-only fixture",
          networkRoute: "credentialed",
        },
      },
    ],
    now,
  );
  assert.equal(selection.configuredPrimaryDegraded, true);
  assert.equal(selection.effectiveProvider, profile.primary.provider);
});

test("promotes only identity-verified or overlap-validated backups", () => {
  const profile = resolveCanonicalMarketProfile(nikkei);
  const canonical = series(
    profile.primary.instrument,
    "yahoo",
    [64_000, 65_000],
  );
  const eastmoneyDefinition = profile.backups.find(
    (definition) => definition.provider === "eastmoney",
  )!;
  const eastmoney = series(
    eastmoneyDefinition.instrument,
    "eastmoney",
    [64_000, 65_000, 65_500],
  );
  const promoted = selectCanonicalFallbackSeries(
    canonical,
    [{ definition: eastmoneyDefinition, series: eastmoney }],
    100,
    profile,
  );
  assert.equal(promoted?.source, "eastmoney");
  assert.deepEqual(
    promoted?.bars.map((item) => item.close),
    [64_000, 65_000, 65_500],
  );

  const nasdaqDefinition = profile.backups.find(
    (definition) => definition.provider === "nasdaq",
  )!;
  const nasdaq = series(
    nasdaqDefinition.instrument,
    "nasdaq",
    [64_000, 65_000, 65_500],
  );
  assert.equal(
    selectCanonicalFallbackSeries(
      null,
      [{ definition: nasdaqDefinition, series: nasdaq }],
      100,
      profile,
    ),
    null,
  );

  const wrongIdentity = series(
    eastmoneyDefinition.instrument,
    "eastmoney",
    [32_000, 32_500, 32_750],
  );
  assert.equal(
    selectCanonicalFallbackSeries(
      canonical,
      [{ definition: eastmoneyDefinition, series: wrongIdentity }],
      100,
      profile,
    ),
    null,
  );
});

test("replaces legacy adjusted 164824 history with its fixed Tencent raw primary", () => {
  const profile = resolveCanonicalMarketProfile({
    secid: "164824.SHE",
    code: "164824",
    name: "India Market Fund",
    exchange: "OTHER",
    assetType: "etf",
    provider: "eodhd",
  });
  const existing = series(
    profile.primary.instrument,
    "eodhd",
    [1.5, 1.51, 1.52],
  );
  const primary = {
    ...series(profile.primary.instrument, "tencent", [1.1, 1.2, 1.3, 1.4]),
    priceAdjustment: "raw" as const,
  };

  const promoted = mergeCanonicalMarketSeries(
    existing,
    primary,
    100,
    profile,
  );

  assert.equal(promoted?.source, "tencent");
  assert.equal(promoted?.priceAdjustment, "raw");
  assert.equal(promoted?.bars.length, 4);
  assert.deepEqual(
    promoted?.bars.map((item) => item.close),
    [1.1, 1.2, 1.3, 1.4],
  );
});

test("prefers the longer verified fallback when recovering an empty chart", () => {
  const profile = resolveCanonicalMarketProfile(nikkei);
  const nikkeiDefinition = profile.backups.find(
    (definition) => definition.provider === "nikkei",
  )!;
  const eastmoneyDefinition = profile.backups.find(
    (definition) => definition.provider === "eastmoney",
  )!;
  const shorter = series(
    nikkeiDefinition.instrument,
    "nikkei",
    [64_000, 65_000],
  );
  shorter.bars = shorter.bars.map((item, index) => ({
    ...item,
    time: `2026-07-${String(24 + index).padStart(2, "0")}`,
  }));
  const longer = series(
    eastmoneyDefinition.instrument,
    "eastmoney",
    [63_000, 64_000, 65_000],
  );

  const promoted = selectCanonicalFallbackSeries(
    null,
    [
      { definition: nikkeiDefinition, series: shorter },
      { definition: eastmoneyDefinition, series: longer },
    ],
    100,
    profile,
  );
  assert.equal(promoted?.source, "eastmoney");
  assert.equal(promoted?.bars.length, 3);
});

test("retains the newest valid temporary quote across transient failures", () => {
  const profile = resolveCanonicalMarketProfile(nikkei);
  const canonical = series(
    profile.primary.instrument,
    "yahoo",
    [64_000, 65_000],
  );
  const previousQuote = {
    instrumentKey: profile.key,
    provider: "eastmoney" as const,
    time: "2026-07-25",
    price: 65_400,
    bar: bar("2026-07-25", 65_400),
    previousClose: 65_000,
    latestBarStatus: "in-progress" as const,
    fetchedAt: "2026-07-25T02:00:00.000Z",
  };
  const refreshedQuote = {
    ...previousQuote,
    provider: "tencent" as const,
    price: 65_500,
    bar: bar("2026-07-25", 65_500),
    fetchedAt: "2026-07-25T03:00:00.000Z",
  };

  const refreshed = mergePreferredTemporaryQuote(
    canonical,
    [previousQuote, refreshedQuote],
    100,
  );
  assert.equal(refreshed.quote?.provider, "tencent");
  assert.equal(refreshed.series.bars.at(-1)?.close, 65_500);

  const retained = mergePreferredTemporaryQuote(
    canonical,
    [null, previousQuote],
    100,
  );
  assert.equal(retained.quote, previousQuote);
  assert.equal(retained.series.bars.at(-1)?.close, 65_400);

  const completed = {
    ...canonical,
    bars: [...canonical.bars, bar("2026-07-25", 65_600)],
    latestBarStatus: "complete" as const,
  };
  const rejected = mergePreferredTemporaryQuote(
    completed,
    [refreshedQuote],
    100,
  );
  assert.equal(rejected.quote, null);
  assert.equal(rejected.series, completed);
});

test("measures provider OHLC and close-reference errors independently", () => {
  const profile = resolveCanonicalMarketProfile(nikkei);
  const canonical = series(
    profile.primary.instrument,
    "yahoo",
    [64_000, 65_000],
  );
  const eastmoneyDefinition = profile.backups.find(
    (definition) => definition.provider === "eastmoney",
  )!;
  const eastmoney = series(
    eastmoneyDefinition.instrument,
    "eastmoney",
    [64_000, 65_650],
  );
  const providerQuality = measureMarketSeriesQuality(
    canonical,
    eastmoney,
    eastmoneyDefinition,
    125,
  );

  assert.equal(providerQuality.latencyMs, 125);
  assert.equal(providerQuality.latestDateMatches, true);
  assert.equal(providerQuality.missingDatePercent, 0);
  assert.equal(providerQuality.volumeCoveragePercent, 0);
  assert.ok(
    providerQuality.meanCloseErrorPercent !== null &&
      providerQuality.meanCloseErrorPercent > 0,
  );

  const fred: MarketReferenceSeries = {
    instrumentKey: profile.key,
    interval: "1d",
    observations: [
      {
        time: "2026-07-23",
        timestamp: Date.parse("2026-07-23T00:00:00Z"),
        value: 64_000,
      },
      {
        time: "2026-07-24",
        timestamp: Date.parse("2026-07-24T00:00:00Z"),
        value: 65_000,
      },
    ],
    latestBarStatus: "complete",
    source: "fred",
    fetchedAt: "2026-07-27T07:00:00.000Z",
  };
  const referenceQuality = measureMarketReferenceQuality(
    canonical,
    fred,
    profile.references[0],
    90,
  );

  assert.equal(referenceQuality.meanCloseErrorPercent, 0);
  assert.equal(referenceQuality.meanOpenErrorPercent, null);
  assert.equal(referenceQuality.adjustmentMatches, null);
});

test("classifies complete, partial, and unavailable volume coverage", () => {
  const bars = Array.from({ length: 20 }, (_, index) =>
    bar(`2026-06-${String(index + 1).padStart(2, "0")}`, 60_000 + index),
  );
  assert.equal(assessMarketVolumeCoverage(bars).status, "unavailable");
  assert.equal(
    assessMarketVolumeCoverage(
      bars.map((item, index) => ({
        ...item,
        volume: index < 18 ? 1_000 : 0,
      })),
    ).status,
    "reliable",
  );
  assert.equal(
    assessMarketVolumeCoverage(
      bars.map((item, index) => ({
        ...item,
        volume: index < 10 ? 1_000 : 0,
      })),
    ).status,
    "partial",
  );
});

test("requests one history repair only for isolated completed-bar volume gaps", () => {
  const bars = Array.from({ length: 21 }, (_, index) => ({
    ...bar(`2026-06-${String(index + 1).padStart(2, "0")}`, 60_000 + index),
    volume: index === 4 || index === 9 || index === 20 ? 0 : 1_000,
  }));

  assert.equal(
    missingPublishedVolumeRepairKey(bars, 20),
    "2026-06-05,2026-06-10",
  );
  assert.equal(
    missingPublishedVolumeRepairKey(
      bars.map((item) => ({ ...item, volume: 0 })),
      20,
    ),
    "",
  );
  assert.equal(
    missingPublishedVolumeRepairKey(
      bars.map((item, index) => ({
        ...item,
        volume: index === 20 ? 0 : 1_000,
      })),
      20,
    ),
    "",
  );
});

test("reads locked canonical history across a configured primary change", async () => {
  const originalInstrument: MarketInstrument = {
    secid: "100.CACHEPROVIDER",
    code: "CACHEPROVIDER",
    name: "Cache Provider Fixture",
    exchange: "JPX",
    assetType: "etf",
    provider: "eastmoney",
  };
  const originalProfile = resolveCanonicalMarketProfile(originalInstrument);
  const originalSeries = series(
    originalProfile.primary.instrument,
    "eastmoney",
    [100, 101],
  );
  await writeCanonicalMarketSeries(originalSeries, originalProfile);

  const yahooIdentity: MarketInstrument = {
    ...originalInstrument,
    secid: "CACHEPROVIDER.T",
    provider: "yahoo",
  };
  const restored = await readCanonicalMarketSeriesEntry(
    yahooIdentity,
    "1d",
  );
  const rejectedByOldSourceFilter = await readCanonicalMarketSeriesEntry(
    yahooIdentity,
    "1d",
    "yahoo",
  );

  assert.equal(restored?.series.source, "eastmoney");
  assert.deepEqual(
    restored?.series.bars.map((item) => item.close),
    [100, 101],
  );
  assert.equal(rejectedByOldSourceFilter, null);
});

test("refreshes a shortcut instrument in the background without changing identity", async () => {
  const instrument: MarketInstrument = {
    secid: "100.SHORTCUTREFRESH",
    code: "SHORTCUTREFRESH",
    name: "Shortcut Refresh Fixture",
    exchange: "JPX",
    assetType: "etf",
    provider: "eastmoney",
  };
  const profile = resolveCanonicalMarketProfile(instrument);
  const modes: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input), "http://localhost");
    const mode = url.searchParams.get("mode") ?? "";
    modes.push(mode);
    const payload = series(
      profile.primary.instrument,
      profile.primary.provider,
      mode === "latest" ? [100, 101, 102] : [100, 101],
    );
    return Response.json(payload);
  };

  const initial = await refreshShortcutMarketInstrument(instrument, {
    signal: new AbortController().signal,
    fetcher,
  });
  const refreshed = await refreshShortcutMarketInstrument(instrument, {
    signal: new AbortController().signal,
    fetcher,
  });

  assert.equal(initial?.canonicalSeries.instrument.code, instrument.code);
  assert.equal(initial?.status, "primary");
  assert.equal(refreshed?.canonicalSeries.bars.at(-1)?.close, 102);
  assert.equal(refreshed?.status, "primary");
  assert.deepEqual(modes, ["history", "latest"]);
});

test("recovers an empty Eastmoney LOF chart from Tencent daily history", async () => {
  const instrument: MarketInstrument = {
    secid: "0.164825",
    code: "164825",
    name: "Outage Recovery LOF",
    exchange: "SZSE",
    assetType: "etf",
    provider: "eastmoney",
  };
  const profile = resolveCanonicalMarketProfile(instrument);
  const requestedProviders: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input), "http://localhost");
    const provider = url.searchParams.get("provider") ?? "";
    requestedProviders.push(provider);
    if (provider !== "tencent") {
      return Response.json(
        { error: "UPSTREAM_UNAVAILABLE" },
        { status: 502 },
      );
    }
    const definition = profile.backups.find(
      (candidate) => candidate.provider === "tencent",
    )!;
    return Response.json({
      ...series(definition.instrument, "tencent", [1.2, 1.22, 1.27]),
      priceAdjustment: "raw",
    });
  };

  const recovered = await refreshShortcutMarketInstrument(instrument, {
    signal: new AbortController().signal,
    fetcher,
  });

  assert.equal(requestedProviders[0], "eastmoney");
  assert.ok(requestedProviders.includes("tencent"));
  assert.equal(recovered?.status, "backup");
  assert.equal(recovered?.canonicalSeries.source, "tencent");
  assert.equal(recovered?.canonicalSeries.priceAdjustment, "raw");
  assert.equal(recovered?.canonicalSeries.bars.length, 3);
});
