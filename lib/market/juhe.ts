import { resolveLatestDailyBarStatus } from "./session";
import type {
  MarketInstrument,
  MarketSeries,
} from "./types";

const JUHE_STOCK_QUOTE_URL =
  "https://web.juhe.cn/finance/stock/hs";
const JUHE_MAX_DAILY_CALLS = 50;

interface JuheQuoteData {
  gid?: string;
  name?: string;
  date?: string;
  time?: string;
  todayStartPri?: string;
  todayMax?: string;
  todayMin?: string;
  nowPri?: string;
  yestodEndPri?: string;
  traNumber?: string;
  traAmount?: string;
  increPer?: string;
  increase?: string;
  openPri?: string;
  highPri?: string;
  lowpri?: string;
  nowpri?: string;
  yesPri?: string;
  dealNum?: string;
  dealPri?: string;
}

interface JuheQuotePayload {
  resultcode?: string;
  reason?: string;
  error_code?: number;
  result?:
    | JuheQuoteData
    | Array<{
        data?: JuheQuoteData;
      }>;
}

let quotaDate = "";
let quotaUsed = 0;

function configuredApiKey(): string | null {
  if (typeof process === "undefined") return null;
  const key = process.env.JUHE_API_KEY?.trim();
  return key ? key : null;
}

function configuredDailyLimit(): number {
  if (typeof process === "undefined") return JUHE_MAX_DAILY_CALLS;
  const parsed = Number(process.env.JUHE_API_DAILY_LIMIT);
  return Number.isFinite(parsed)
    ? Math.min(Math.max(Math.trunc(parsed), 1), JUHE_MAX_DAILY_CALLS)
    : JUHE_MAX_DAILY_CALLS;
}

function shanghaiDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function configuredUsageOffset(date: string): number {
  if (
    typeof process === "undefined" ||
    process.env.JUHE_API_USAGE_DATE?.trim() !== date
  ) {
    return 0;
  }
  const parsed = Number(process.env.JUHE_API_USAGE_OFFSET);
  return Number.isFinite(parsed)
    ? Math.min(Math.max(Math.trunc(parsed), 0), JUHE_MAX_DAILY_CALLS)
    : 0;
}

function claimDailyQuota(now = new Date()): void {
  const date = shanghaiDate(now);
  if (quotaDate !== date) {
    quotaDate = date;
    quotaUsed = configuredUsageOffset(date);
  }
  const limit = configuredDailyLimit();
  if (quotaUsed >= limit) {
    throw new Error("Juhe daily quota limit has been reached");
  }
  quotaUsed += 1;
}

function normalizedCode(instrument: MarketInstrument): string {
  return instrument.code
    .replace(/^\^/, "")
    .replace(/\.(SS|SH|SZ)$/i, "");
}

function quoteParameters(
  instrument: MarketInstrument,
): Record<"gid" | "type", string> {
  const code = normalizedCode(instrument);
  if (
    instrument.assetType === "index" &&
    instrument.exchange === "SSE" &&
    code === "000001"
  ) {
    return { gid: "", type: "0" };
  }
  if (
    instrument.assetType === "index" &&
    instrument.exchange === "SZSE" &&
    code === "399001"
  ) {
    return { gid: "", type: "1" };
  }
  const prefix = instrument.exchange === "SSE" ? "sh" : "sz";
  return { gid: `${prefix}${code}`, type: "" };
}

function numeric(value: string | undefined): number {
  const parsed = Number(value?.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function quoteDate(
  data: JuheQuoteData,
  fetchedAt: Date,
): string {
  const explicit = data.date?.slice(0, 10);
  if (explicit && /^\d{4}-\d{2}-\d{2}$/.test(explicit)) {
    return explicit;
  }
  const combined = data.time?.slice(0, 10);
  if (combined && /^\d{4}-\d{2}-\d{2}$/.test(combined)) {
    return combined;
  }
  return shanghaiDate(fetchedAt);
}

function extractQuoteData(payload: JuheQuotePayload): JuheQuoteData {
  if (payload.error_code !== 0) {
    if ([10001, 10003, 10009].includes(payload.error_code ?? 0)) {
      throw new Error("Juhe API key is invalid or expired");
    }
    if (payload.error_code === 10002) {
      throw new Error("Juhe access denied for this API product");
    }
    if ([10011, 10012, 10013].includes(payload.error_code ?? 0)) {
      throw new Error("Juhe quota limit has been reached");
    }
    throw new Error(payload.reason || "Juhe returned an invalid response");
  }
  if (Array.isArray(payload.result)) {
    const data = payload.result[0]?.data;
    if (data) return data;
  } else if (payload.result && typeof payload.result === "object") {
    return payload.result;
  }
  throw new Error("Juhe returned no quote data");
}

export function parseJuheQuote(
  payload: JuheQuotePayload,
  instrument: MarketInstrument,
  fetchedAt = new Date(),
): MarketSeries {
  const data = extractQuoteData(payload);
  const expectedCode = normalizedCode(instrument);
  const returnedCode = data.gid
    ?.replace(/^(sh|sz)/i, "")
    .replace(/^0+/, "");
  if (
    returnedCode &&
    returnedCode !== expectedCode.replace(/^0+/, "")
  ) {
    throw new Error("Juhe returned a different instrument");
  }
  const time = quoteDate(data, fetchedAt);
  const open = numeric(data.todayStartPri ?? data.openPri);
  const high = numeric(data.todayMax ?? data.highPri);
  const low = numeric(data.todayMin ?? data.lowpri);
  const close = numeric(data.nowPri ?? data.nowpri);
  const previousClose = numeric(data.yestodEndPri ?? data.yesPri);
  if (
    ![open, high, low, close, previousClose].every(
      (value) => Number.isFinite(value) && value > 0,
    ) ||
    high < Math.max(open, close) ||
    low > Math.min(open, close)
  ) {
    throw new Error("Juhe returned an invalid quote");
  }
  const change = numeric(data.increase);
  const changePercent = numeric(data.increPer);
  const params = quoteParameters(instrument);
  return {
    instrument: {
      ...instrument,
      secid: params.gid || expectedCode,
      provider: "juhe",
    },
    interval: "1d",
    priceAdjustment: "raw",
    previousClose,
    bars: [
      {
        time,
        timestamp: Date.parse(`${time}T00:00:00Z`),
        open,
        high,
        low,
        close,
        volume: numeric(data.traNumber ?? data.dealNum) || 0,
        amount: numeric(data.traAmount ?? data.dealPri) || 0,
        amplitude: ((high - low) / previousClose) * 100,
        changePercent: Number.isFinite(changePercent)
          ? changePercent
          : ((close - previousClose) / previousClose) * 100,
        change: Number.isFinite(change)
          ? change
          : close - previousClose,
        turnoverRate: 0,
      },
    ],
    latestBarStatus: resolveLatestDailyBarStatus(
      time,
      instrument.exchange,
      fetchedAt,
    ),
    source: "juhe",
    fetchedAt: fetchedAt.toISOString(),
  };
}

export async function fetchJuheQuoteSeries(
  instrument: MarketInstrument,
  fetchImpl: typeof fetch = fetch,
  requestCache: RequestCache = "no-store",
  apiKey: string | null = configuredApiKey(),
): Promise<MarketSeries> {
  if (!apiKey) throw new Error("Juhe is not configured");
  if (
    !["index", "etf"].includes(instrument.assetType) ||
    !["SSE", "SZSE"].includes(instrument.exchange)
  ) {
    throw new Error(
      "Juhe quote fallback supports only SSE and SZSE indexes or ETFs",
    );
  }
  claimDailyQuota();
  const params = quoteParameters(instrument);
  const url = new URL(JUHE_STOCK_QUOTE_URL);
  url.searchParams.set("key", apiKey);
  if (params.gid) url.searchParams.set("gid", params.gid);
  if (params.type) url.searchParams.set("type", params.type);
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "QuantScope/1.0 market-research-dashboard",
    },
    signal: AbortSignal.timeout(12_000),
    cache: requestCache,
  });
  if (!response.ok) {
    throw new Error(
      `Juhe request failed with status ${response.status}`,
    );
  }
  return parseJuheQuote(
    (await response.json()) as JuheQuotePayload,
    instrument,
    new Date(),
  );
}
