import { clampMarketSeriesLimit } from "./history";
import { resolveLatestDailyBarStatus } from "./session";
import type {
  MarketBar,
  MarketInstrument,
  MarketSeries,
} from "./types";

const ZHITU_API_BASE_URL = "https://api.zhituapi.com";
const ZHITU_MAX_DAILY_BARS = 1_500;

interface ZhituDailyRow {
  t?: string;
  o?: number | string;
  h?: number | string;
  l?: number | string;
  c?: number | string;
  v?: number | string | null;
  a?: number | string | null;
  pc?: number | string | null;
}

function configuredApiKey(): string | null {
  if (typeof process === "undefined") return null;
  const key = process.env.ZHITU_API_KEY?.trim();
  return key ? key : null;
}

export function hasZhituApiKey(): boolean {
  return configuredApiKey() !== null;
}

function numeric(value: number | string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function zhituIndexSecid(instrument: MarketInstrument): string {
  const code = instrument.code
    .replace(/^\^/, "")
    .replace(/\.(SS|SH|SZ)$/i, "");
  if (instrument.exchange === "SSE") return `${code}.SH`;
  if (instrument.exchange === "SZSE") return `${code}.SZ`;
  throw new Error("Zhitu supports only Shanghai and Shenzhen indexes");
}

export function parseZhituDailyRows(
  rows: readonly ZhituDailyRow[],
  instrument: MarketInstrument,
  fetchedAt = new Date(),
): MarketSeries {
  const accepted = rows
    .map((row) => {
      const time = row.t?.slice(0, 10) ?? "";
      return {
        time,
        timestamp: Date.parse(`${time}T00:00:00Z`),
        open: numeric(row.o),
        high: numeric(row.h),
        low: numeric(row.l),
        close: numeric(row.c),
        volume: numeric(row.v) || 0,
        amount: numeric(row.a) || 0,
        providerPreviousClose: numeric(row.pc),
      };
    })
    .filter(
      (row) =>
        /^\d{4}-\d{2}-\d{2}$/.test(row.time) &&
        Number.isFinite(row.timestamp) &&
        [row.open, row.high, row.low, row.close].every(
          (value) => Number.isFinite(value) && value > 0,
        ),
    )
    .sort((left, right) => left.timestamp - right.timestamp);
  if (accepted.length === 0) {
    throw new Error("Zhitu returned no parseable daily bars");
  }
  const bars: MarketBar[] = [];
  for (const row of accepted) {
    const previousClose =
      (row.providerPreviousClose > 0
        ? row.providerPreviousClose
        : bars.at(-1)?.close) ?? row.open;
    const change = row.close - previousClose;
    bars.push({
      time: row.time,
      timestamp: row.timestamp,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      amount: row.amount,
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
      secid: zhituIndexSecid(instrument),
      provider: "zhitu",
    },
    interval: "1d",
    priceAdjustment: "raw",
    previousClose:
      accepted[0].providerPreviousClose > 0
        ? accepted[0].providerPreviousClose
        : bars[0].open,
    bars,
    latestBarStatus: resolveLatestDailyBarStatus(
      bars.at(-1)!.time,
      instrument.exchange,
      fetchedAt,
    ),
    source: "zhitu",
    fetchedAt: fetchedAt.toISOString(),
  };
}

export async function fetchZhituDailyIndexSeries(
  instrument: MarketInstrument,
  requestedLimit = 250,
  fetchImpl: typeof fetch = fetch,
  requestCache: RequestCache = "default",
  apiKey: string | null = configuredApiKey(),
): Promise<MarketSeries> {
  if (!apiKey) throw new Error("Zhitu is not configured");
  if (
    instrument.assetType !== "index" ||
    !["SSE", "SZSE"].includes(instrument.exchange)
  ) {
    throw new Error(
      "Zhitu fallback is enabled only for Shanghai and Shenzhen indexes",
    );
  }
  const limit = Math.min(
    clampMarketSeriesLimit(requestedLimit, "1d"),
    ZHITU_MAX_DAILY_BARS,
  );
  const secid = zhituIndexSecid(instrument);
  const url = new URL(
    `${ZHITU_API_BASE_URL}/hz/latest/fsjy/${encodeURIComponent(
      secid,
    )}/d`,
  );
  url.searchParams.set("token", apiKey);
  url.searchParams.set("limit", String(limit));
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "QuantScope/1.0 market-research-dashboard",
    },
    signal: AbortSignal.timeout(15_000),
    ...(requestCache === "no-store" ? { cache: requestCache } : {}),
  });
  if (!response.ok) {
    throw new Error(
      `Zhitu request failed with status ${response.status}`,
    );
  }
  const payload = (await response.json()) as
    | ZhituDailyRow[]
    | { code?: number; message?: string };
  if (!Array.isArray(payload)) {
    throw new Error(payload.message || "Zhitu returned an invalid response");
  }
  return parseZhituDailyRows(payload, instrument, new Date());
}
