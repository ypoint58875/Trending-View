import { resolveLatestDailyBarStatus } from "./session";
import type {
  MarketInstrument,
  MarketSeries,
} from "./types";

const TENCENT_QUOTE_URL = "https://qt.gtimg.cn/q=";

function numeric(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function quoteSymbol(instrument: MarketInstrument): string {
  const code = instrument.code
    .replace(/^\^/, "")
    .replace(/\.(SS|SH|SZ)$/i, "");
  if (instrument.exchange === "SSE") return `sh${code}`;
  if (instrument.exchange === "SZSE") return `sz${code}`;
  throw new Error("Tencent quote fallback supports only SSE and SZSE");
}

function quoteDate(value: string | undefined): string {
  if (!value || !/^\d{14}$/.test(value)) return "";
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

export function parseTencentQuote(
  payload: string,
  instrument: MarketInstrument,
  fetchedAt = new Date(),
): MarketSeries {
  const quoted = payload.match(/="([^"]*)"/)?.[1];
  const fields = quoted?.split("~") ?? [];
  const time = quoteDate(fields[30]);
  const open = numeric(fields[5]);
  const high = numeric(fields[33]);
  const low = numeric(fields[34]);
  const close = numeric(fields[3]);
  const previousClose = numeric(fields[4]);
  if (
    fields[2] !==
      instrument.code
        .replace(/^\^/, "")
        .replace(/\.(SS|SH|SZ)$/i, "") ||
    !time ||
    ![open, high, low, close, previousClose].every(
      (value) => Number.isFinite(value) && value > 0,
    ) ||
    high < Math.max(open, close) ||
    low > Math.min(open, close)
  ) {
    throw new Error("Tencent returned an invalid quote");
  }
  const timestamp = Date.parse(`${time}T00:00:00Z`);
  const change = numeric(fields[31]);
  const changePercent = numeric(fields[32]);
  return {
    instrument: {
      ...instrument,
      secid: quoteSymbol(instrument),
      provider: "tencent",
    },
    interval: "1d",
    priceAdjustment: "raw",
    previousClose,
    bars: [
      {
        time,
        timestamp,
        open,
        high,
        low,
        close,
        volume: numeric(fields[36]) || 0,
        amount: numeric(fields[37]) || 0,
        amplitude:
          numeric(fields[43]) || ((high - low) / previousClose) * 100,
        changePercent:
          Number.isFinite(changePercent)
            ? changePercent
            : ((close - previousClose) / previousClose) * 100,
        change: Number.isFinite(change)
          ? change
          : close - previousClose,
        turnoverRate: numeric(fields[38]) || 0,
      },
    ],
    latestBarStatus: resolveLatestDailyBarStatus(
      time,
      instrument.exchange,
      fetchedAt,
    ),
    source: "tencent",
    fetchedAt: fetchedAt.toISOString(),
  };
}

export async function fetchTencentQuoteSeries(
  instrument: MarketInstrument,
  fetchImpl: typeof fetch = fetch,
  requestCache: RequestCache = "no-store",
): Promise<MarketSeries> {
  if (
    !["index", "etf"].includes(instrument.assetType) ||
    !["SSE", "SZSE"].includes(instrument.exchange)
  ) {
    throw new Error(
      "Tencent quote fallback supports only SSE and SZSE indexes or ETFs",
    );
  }
  const symbol = quoteSymbol(instrument);
  const response = await fetchImpl(
    `${TENCENT_QUOTE_URL}${encodeURIComponent(symbol)}`,
    {
      headers: {
        Accept: "text/plain,*/*",
        "User-Agent": "QuantScope/1.0 market-research-dashboard",
      },
      signal: AbortSignal.timeout(10_000),
      cache: requestCache,
    },
  );
  if (!response.ok) {
    throw new Error(
      `Tencent quote request failed with status ${response.status}`,
    );
  }
  return parseTencentQuote(
    await response.text(),
    instrument,
    new Date(),
  );
}
