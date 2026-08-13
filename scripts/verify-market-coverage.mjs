const baseUrl = process.env.QUANTSCOPE_URL?.trim() || "http://127.0.0.1:3000";
const requestedGroup =
  process.env.MARKET_VERIFY_GROUP?.trim().toLowerCase() || "all";
const requestedProvider =
  process.env.MARKET_VERIFY_PROVIDER?.trim().toLowerCase() || "";
const requestedDelay = Number(process.env.MARKET_VERIFY_DELAY_MS);
const delayMilliseconds =
  Number.isFinite(requestedDelay) && requestedDelay >= 0
    ? requestedDelay
    : 2500;

const cases = [
  ["index", "N225", "^N225", "JPX", "yahoo"],
  ["index", "000300", "000300.SS", "SSE", "yahoo"],
  ["index", "HSI", "^HSI", "HKEX", "yahoo"],
  ["index", "GDAXI", "^GDAXI", "XETRA", "yahoo"],
  ["index", "FTSE", "^FTSE", "LSE", "yahoo"],
  ["index", "FCHI", "^FCHI", "EURONEXT", "yahoo"],
  ["index", "SPX", "^GSPC", "NYSE", "yahoo"],
  ["index", "NDX100", "^NDX", "NASDAQ", "yahoo"],
  ["index", "SOX", "^SOX", "PHLX", "yahoo"],
  ["index", "KS11", "^KS11", "KRX", "yahoo"],
  ["index", "SENSEX", "^BSESN", "BSE", "yahoo"],
  ["index", "BVSP", "^BVSP", "B3", "yahoo"],
  ["index", "SX5E", "^STOXX50E", "EURONEXT", "yahoo"],
  ["index", "SSMI", "^SSMI", "SIX", "yahoo"],
  ["index", "TWII", "^TWII", "TWSE", "yahoo"],
  ["index", "STI", "^STI", "SGX", "yahoo"],
  ["etf", "SPY", "SPY", "NYSE_ARCA", "yahoo"],
  ["etf", "QQQ", "QQQ", "NASDAQ", "yahoo"],
  ["etf", "EEM", "EEM", "NYSE_ARCA", "yahoo"],
  ["etf", "EWJ", "EWJ", "NYSE_ARCA", "yahoo"],
  ["etf", "FXI", "FXI", "NYSE_ARCA", "yahoo"],
  ["etf", "VTI", "VTI", "NYSE_ARCA", "yahoo"],
  ["etf", "IWM", "IWM", "NYSE_ARCA", "yahoo"],
  ["etf", "GLD", "GLD", "NYSE_ARCA", "yahoo"],
  ["etf", "SLV", "SLV", "NYSE_ARCA", "yahoo"],
  ["etf", "USO", "USO", "NYSE_ARCA", "yahoo"],
  ["etf", "DBC", "DBC", "NYSE_ARCA", "yahoo"],
  ["commodity", "GC=F", "GC=F", "COMEX", "yahoo"],
  ["commodity", "SI=F", "SI=F", "COMEX", "yahoo"],
  ["commodity", "CL=F", "CL=F", "NYMEX", "yahoo"],
  ["commodity", "HG=F", "HG=F", "COMEX", "yahoo"],
];
const eastmoneyIndexSymbols = {
  N225: "100.N225",
  "000300": "1.000300",
  HSI: "100.HSI",
  GDAXI: "100.GDAXI",
  FTSE: "100.FTSE",
  FCHI: "100.FCHI",
  SPX: "100.SPX",
  NDX100: "100.NDX100",
  SOX: "251.SOX",
  KS11: "100.KS11",
  SENSEX: "100.SENSEX",
  BVSP: "100.BVSP",
  SX5E: "100.SX5E",
  SSMI: "100.SSMI",
  TWII: "100.TWII",
  STI: "100.STI",
};
const eastmoneyEtfSymbols = {
  SPY: "107.SPY",
  QQQ: "105.QQQ",
  EEM: "107.EEM",
  EWJ: "107.EWJ",
  FXI: "107.FXI",
  VTI: "107.VTI",
  IWM: "107.IWM",
  GLD: "107.GLD",
  SLV: "107.SLV",
  USO: "107.USO",
  DBC: "107.DBC",
};
const eastmoneyCommoditySymbols = {
  "GC=F": "101.GC00Y",
  "SI=F": "101.SI00Y",
  "CL=F": "102.CL00Y",
  "HG=F": "101.HG00Y",
};
const yahooIndexSymbols = {
  N225: "^N225",
  "000300": "000300.SS",
  HSI: "^HSI",
  GDAXI: "^GDAXI",
  FTSE: "^FTSE",
  FCHI: "^FCHI",
  SPX: "^GSPC",
  NDX100: "^NDX",
  SOX: "^SOX",
  KS11: "^KS11",
  SENSEX: "^BSESN",
  BVSP: "^BVSP",
  SX5E: "^STOXX50E",
  SSMI: "^SSMI",
  TWII: "^TWII",
  STI: "^STI",
};

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isValidBar(bar) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(bar?.time ?? "") &&
    [bar?.open, bar?.high, bar?.low, bar?.close].every(
      (value) => Number.isFinite(value) && value > 0,
    ) &&
    bar.high >= Math.max(bar.open, bar.close) &&
    bar.low <= Math.min(bar.open, bar.close)
  );
}

const selectedCases =
  requestedGroup === "all"
    ? cases
    : cases.filter(([assetType]) => assetType === requestedGroup);

if (selectedCases.length === 0) {
  console.error(
    `Unknown MARKET_VERIFY_GROUP "${requestedGroup}". Use index, etf, commodity, or all.`,
  );
  process.exit(1);
}

const providerCases = selectedCases.map(
  ([assetType, code, secid, exchange, provider]) => {
    if (!requestedProvider || requestedProvider === provider) {
      return [assetType, code, secid, exchange, provider];
    }
    if (
      assetType === "etf" &&
      ["nasdaq", "yahoo"].includes(requestedProvider)
    ) {
      return [assetType, code, code, exchange, requestedProvider];
    }
    if (
      assetType === "etf" &&
      requestedProvider === "eastmoney" &&
      eastmoneyEtfSymbols[code]
    ) {
      return [
        assetType,
        code,
        eastmoneyEtfSymbols[code],
        exchange,
        requestedProvider,
      ];
    }
    if (assetType === "commodity" && requestedProvider === "yahoo") {
      return [assetType, code, code, exchange, requestedProvider];
    }
    if (
      assetType === "commodity" &&
      requestedProvider === "eastmoney" &&
      eastmoneyCommoditySymbols[code]
    ) {
      return [
        assetType,
        code,
        eastmoneyCommoditySymbols[code],
        exchange,
        requestedProvider,
      ];
    }
    if (
      assetType === "index" &&
      requestedProvider === "yahoo" &&
      yahooIndexSymbols[code]
    ) {
      return [
        assetType,
        code,
        yahooIndexSymbols[code],
        exchange,
        requestedProvider,
      ];
    }
    if (
      assetType === "index" &&
      requestedProvider === "eastmoney" &&
      eastmoneyIndexSymbols[code]
    ) {
      return [
        assetType,
        code,
        eastmoneyIndexSymbols[code],
        exchange,
        requestedProvider,
      ];
    }
    console.error(
      `Provider override ${requestedProvider} is not supported for ${assetType} ${code}.`,
    );
    process.exit(1);
  },
);

let failures = 0;
for (const [assetType, code, secid, exchange, provider] of providerCases) {
  const params = new URLSearchParams({
    secid,
    code,
    name: code,
    exchange,
    provider,
    assetType,
    interval: "1d",
    limit: "10000",
    mode: "history",
    strictProvider: "1",
  });
  try {
    const response = await fetch(`${baseUrl}/api/market?${params}`);
    const payload = await response.json();
    const bars = Array.isArray(payload.bars) ? payload.bars : [];
    const first = bars[0];
    const latest = bars.at(-1);
    const passes =
      response.ok &&
      payload.source === provider &&
      payload.instrument?.exchange === exchange &&
      bars.length >= 120 &&
      isValidBar(first) &&
      isValidBar(latest);
    if (!passes) {
      failures += 1;
      console.error(
        `FAIL ${assetType} ${code}: source=${payload.source ?? "-"} exchange=${payload.instrument?.exchange ?? "-"} bars=${bars.length} error=${payload.error ?? "-"}`,
      );
    } else {
      console.log(
        `PASS ${assetType} ${code}: ${payload.source} ${bars.length} bars ${first.time}..${latest.time} close=${latest.close}`,
      );
    }
  } catch (error) {
    failures += 1;
    console.error(
      `FAIL ${assetType} ${code}: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
  await delay(delayMilliseconds);
}

if (failures > 0) {
  console.error(`${failures} market coverage checks failed.`);
  process.exitCode = 1;
} else {
  console.log(
    `All ${selectedCases.length} ${requestedGroup} market coverage checks passed.`,
  );
}
