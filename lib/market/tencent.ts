import { resolveLatestDailyBarStatus } from "./session";
import { clampMarketSeriesLimit } from "./history";
import { createLocalMarketRelayRequest } from "./local-relay";
import type {
  MarketBar,
  MarketInstrument,
  MarketSeries,
} from "./types";

const TENCENT_QUOTE_URL = "https://qt.gtimg.cn/q=";
const TENCENT_DAILY_URL =
  "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get";
const TENCENT_DAILY_LIMIT = 2_000;
const TENCENT_HEADERS = {
  Accept: "application/json,text/plain,*/*",
  Referer: "https://gu.qq.com/",
  "User-Agent": "QuantScope/1.0 market-research-dashboard",
};

interface TencentDailyInstrumentData {
  day?: string[][];
  qt?: Record<string, string[]>;
}

interface TencentDailyResponse {
  code?: number;
  msg?: string;
  data?: Record<string, TencentDailyInstrumentData>;
}

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

function parseTencentDailyRows(rows: readonly string[][]): MarketBar[] {
  const bars: MarketBar[] = [];
  for (const row of rows) {
    const [time, openText, closeText, highText, lowText, volumeText] = row;
    const open = numeric(openText);
    const close = numeric(closeText);
    const high = numeric(highText);
    const low = numeric(lowText);
    const volume = numeric(volumeText);
    const timestamp = Date.parse(`${time}T00:00:00+08:00`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(time ?? "") ||
      !Number.isFinite(timestamp) ||
      ![open, close, high, low].every(
        (value) => Number.isFinite(value) && value > 0,
      ) ||
      high < Math.max(open, close) ||
      low > Math.min(open, close)
    ) {
      continue;
    }
    const previousClose = bars.at(-1)?.close ?? open;
    bars.push({
      time,
      timestamp,
      open,
      close,
      high,
      low,
      volume: Number.isFinite(volume) && volume > 0 ? volume : 0,
      amount: 0,
      amplitude: ((high - low) / previousClose) * 100,
      changePercent: ((close - previousClose) / previousClose) * 100,
      change: close - previousClose,
      turnoverRate: 0,
    });
  }
  return bars;
}

export function parseTencentDailySeries(
  payload: TencentDailyResponse,
  instrument: MarketInstrument,
  requestedLimit: number,
  fetchedAt = new Date(),
): MarketSeries {
  const symbol = quoteSymbol(instrument);
  const source = payload.code === 0 ? payload.data?.[symbol] : null;
  const effectiveLimit = Math.min(
    clampMarketSeriesLimit(requestedLimit, "1d"),
    TENCENT_DAILY_LIMIT,
  );
  const bars = parseTencentDailyRows(source?.day ?? []).slice(
    -effectiveLimit,
  );
  if (bars.length < 2) {
    throw new Error("Tencent returned no usable daily history");
  }
  const quoteFields = source?.qt?.[symbol];
  const quotePreviousClose = numeric(quoteFields?.[4]);
  const previousClose =
    Number.isFinite(quotePreviousClose) && quotePreviousClose > 0
      ? quotePreviousClose
      : bars.at(-2)?.close ?? bars[0].open;
  return {
    instrument: {
      ...instrument,
      secid: symbol,
      provider: "tencent",
    },
    interval: "1d",
    priceAdjustment: "raw",
    previousClose,
    bars,
    latestBarStatus: resolveLatestDailyBarStatus(
      bars.at(-1)!.time,
      instrument.exchange,
      fetchedAt,
    ),
    source: "tencent",
    fetchedAt: fetchedAt.toISOString(),
  };
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
  const timestamp = Date.parse(`${time}T00:00:00+08:00`);
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

export async function fetchTencentDailySeries(
  instrument: MarketInstrument,
  requestedLimit = TENCENT_DAILY_LIMIT,
  fetchImpl: typeof fetch = fetch,
  requestCache: RequestCache = "default",
): Promise<MarketSeries> {
  if (
    !["index", "etf"].includes(instrument.assetType) ||
    !["SSE", "SZSE"].includes(instrument.exchange)
  ) {
    throw new Error(
      "Tencent daily fallback supports only SSE and SZSE indexes or ETFs",
    );
  }
  const symbol = quoteSymbol(instrument);
  const url = new URL(TENCENT_DAILY_URL);
  url.searchParams.set(
    "param",
    `${symbol},day,,,${Math.min(
      clampMarketSeriesLimit(requestedLimit, "1d"),
      TENCENT_DAILY_LIMIT,
    )},none`,
  );
  const relayRequest = createLocalMarketRelayRequest(url, TENCENT_HEADERS);
  const candidates: Array<URL | Request> = [url];
  if (relayRequest) candidates.push(relayRequest);
  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      const response = await fetchImpl(candidate, {
        ...(candidate instanceof Request
          ? {}
          : { headers: TENCENT_HEADERS }),
        signal: AbortSignal.timeout(10_000),
        ...(requestCache === "no-store"
          ? { cache: requestCache }
          : {}),
      });
      if (!response.ok) {
        lastError = new Error(
          `Tencent daily request failed with status ${response.status}`,
        );
        continue;
      }
      return parseTencentDailySeries(
        (await response.json()) as TencentDailyResponse,
        instrument,
        requestedLimit,
        new Date(),
      );
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Tencent daily request failed");
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
  const url = new URL(
    `${TENCENT_QUOTE_URL}${encodeURIComponent(symbol)}`,
  );
  const relayRequest = createLocalMarketRelayRequest(url, TENCENT_HEADERS);
  const candidates: Array<URL | Request> = [url];
  if (relayRequest) candidates.push(relayRequest);
  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      const response = await fetchImpl(candidate, {
        ...(candidate instanceof Request
          ? {}
          : { headers: TENCENT_HEADERS }),
        signal: AbortSignal.timeout(10_000),
        ...(requestCache === "no-store"
          ? { cache: requestCache }
          : {}),
      });
      if (!response.ok) {
        lastError = new Error(
          `Tencent quote request failed with status ${response.status}`,
        );
        continue;
      }
      return parseTencentQuote(
        await response.text(),
        instrument,
        new Date(),
      );
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Tencent quote request failed");
}
