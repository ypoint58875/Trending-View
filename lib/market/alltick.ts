import { clampMarketSeriesLimit } from "./history";
import { resolveLatestDailyBarStatus } from "./session";
import type {
  MarketBar,
  MarketInstrument,
  MarketSeries,
} from "./types";

const ALLTICK_KLINE_URL =
  "https://quote.alltick.co/quote-b-api/kline";
const ALLTICK_MAX_KLINE_ROWS = 500;
const ALLTICK_DAILY_KLINE_TYPE = 8;

export interface AllTickKlineRow {
  timestamp?: number | string;
  open_price?: number | string;
  close_price?: number | string;
  high_price?: number | string;
  low_price?: number | string;
  volume?: number | string | null;
  turnover?: number | string | null;
}

interface AllTickKlinePayload {
  ret?: number;
  msg?: string;
  data?: {
    code?: string;
    kline_type?: number;
    kline_list?: AllTickKlineRow[];
  } | null;
}

function configuredApiToken(): string | null {
  if (typeof process === "undefined") return null;
  const token =
    process.env.ALLTICK_TRIAL_API_TOKEN?.trim() ||
    process.env.ALLTICK_API_TOKEN?.trim();
  return token ? token : null;
}

function configuredExpiration(): string | null {
  if (typeof process === "undefined") return null;
  const expiresAt =
    process.env.ALLTICK_API_TOKEN_EXPIRES_AT?.trim();
  return expiresAt ? expiresAt : null;
}

export function isAllTickCredentialExpired(
  expiresAt: string | null,
  now = new Date(),
): boolean {
  if (!expiresAt) return false;
  const expirationTime = Date.parse(expiresAt);
  return (
    Number.isFinite(expirationTime) &&
    now.getTime() >= expirationTime
  );
}

export function hasAllTickApiToken(): boolean {
  return (
    configuredApiToken() !== null &&
    !isAllTickCredentialExpired(configuredExpiration())
  );
}

function numeric(
  value: number | string | null | undefined,
): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function dateFromUnixTimestamp(
  value: number | string | undefined,
): { time: string; timestamp: number } | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const milliseconds = parsed < 10_000_000_000 ? parsed * 1_000 : parsed;
  const date = new Date(milliseconds);
  if (!Number.isFinite(date.getTime())) return null;
  return {
    time: date.toISOString().slice(0, 10),
    timestamp: Date.parse(`${date.toISOString().slice(0, 10)}T00:00:00Z`),
  };
}

export function parseAllTickKlineRows(
  rows: readonly AllTickKlineRow[],
  instrument: MarketInstrument,
  fetchedAt = new Date(),
): MarketSeries {
  const accepted = rows
    .map((row) => {
      const date = dateFromUnixTimestamp(row.timestamp);
      return date
        ? {
            ...date,
            open: numeric(row.open_price),
            close: numeric(row.close_price),
            high: numeric(row.high_price),
            low: numeric(row.low_price),
            volume: numeric(row.volume) || 0,
            amount: numeric(row.turnover) || 0,
          }
        : null;
    })
    .filter(
      (
        row,
      ): row is NonNullable<typeof row> =>
        row !== null &&
        [row.open, row.close, row.high, row.low].every(
          (value) => Number.isFinite(value) && value > 0,
        ) &&
        row.high >= Math.max(row.open, row.close) &&
        row.low <= Math.min(row.open, row.close),
    )
    .sort((left, right) => left.timestamp - right.timestamp);
  if (accepted.length === 0) {
    throw new Error("AllTick returned no parseable daily bars");
  }

  const bars: MarketBar[] = [];
  for (const row of accepted) {
    const previousClose = bars.at(-1)?.close ?? row.open;
    const change = row.close - previousClose;
    bars.push({
      ...row,
      amplitude:
        previousClose === 0
          ? 0
          : ((row.high - row.low) / previousClose) * 100,
      changePercent:
        previousClose === 0 ? 0 : (change / previousClose) * 100,
      change,
      turnoverRate: 0,
    });
  }

  return {
    instrument: {
      ...instrument,
      secid: "GOLD",
      provider: "alltick",
    },
    interval: "1d",
    priceAdjustment: "raw",
    previousClose: bars[0]!.open,
    bars,
    latestBarStatus: resolveLatestDailyBarStatus(
      bars.at(-1)!.time,
      instrument.exchange,
      fetchedAt,
    ),
    source: "alltick",
    fetchedAt: fetchedAt.toISOString(),
  };
}

export async function fetchAllTickDailySeries(
  instrument: MarketInstrument,
  requestedLimit = ALLTICK_MAX_KLINE_ROWS,
  fetchImpl: typeof fetch = fetch,
  requestCache: RequestCache = "default",
  apiToken: string | null = configuredApiToken(),
  expiresAt: string | null = configuredExpiration(),
): Promise<MarketSeries> {
  if (!apiToken) throw new Error("AllTick is not configured");
  if (isAllTickCredentialExpired(expiresAt)) {
    throw new Error("AllTick token has expired");
  }
  if (
    instrument.assetType !== "commodity" ||
    instrument.code.toUpperCase() !== "GC=F"
  ) {
    throw new Error("AllTick does not support this commodity mapping");
  }
  const limit = Math.min(
    clampMarketSeriesLimit(requestedLimit, "1d"),
    ALLTICK_MAX_KLINE_ROWS,
  );
  const query = {
    trace: `quantscope-${Date.now().toString(36)}`,
    data: {
      code: "GOLD",
      kline_type: ALLTICK_DAILY_KLINE_TYPE,
      kline_timestamp_end: 0,
      query_kline_num: limit,
      adjust_type: 0,
    },
  };
  const url = new URL(ALLTICK_KLINE_URL);
  url.searchParams.set("token", apiToken);
  url.searchParams.set("query", JSON.stringify(query));
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "QuantScope/1.0 market-research-dashboard",
    },
    signal: AbortSignal.timeout(12_000),
    ...(requestCache === "no-store" ? { cache: requestCache } : {}),
  });
  if (!response.ok) {
    throw new Error(
      `AllTick request failed with status ${response.status}`,
    );
  }
  const payload = (await response.json()) as AllTickKlinePayload;
  if (
    (payload.ret !== undefined && payload.ret !== 0 && payload.ret !== 200) ||
    !Array.isArray(payload.data?.kline_list)
  ) {
    throw new Error(payload.msg || "AllTick returned an invalid response");
  }
  const series = parseAllTickKlineRows(
    payload.data.kline_list,
    {
      ...instrument,
      secid: "GOLD",
      provider: "alltick",
    },
    new Date(),
  );
  return {
    ...series,
    bars: series.bars.slice(-limit),
  };
}
