import { canonicalMarketInstrumentKey } from "./canonical";
import { clampMarketSeriesLimit } from "./history";
import { resolveLatestDailyBarStatus } from "./session";
import type {
  MarketBar,
  MarketInstrument,
  MarketSeries,
} from "./types";

const NIKKEI_225_DAILY_CSV_ENDPOINT =
  "https://indexes.nikkei.co.jp/nkave/historical/nikkei_stock_average_daily_en.csv";

function csvCell(value: string | undefined): string {
  return (value ?? "").trim().replace(/^"|"$/g, "");
}

function numeric(value: string | undefined): number {
  const parsed = Number(csvCell(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function parseNikkei225DailyCsv(text: string): MarketBar[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (
    lines[0]?.trim() !== "Date of Data,Close,Open,High,Low"
  ) {
    throw new Error("Nikkei returned an unexpected daily CSV");
  }

  const accepted = lines
    .slice(1)
    .map((line) => {
      const [rawDate, rawClose, rawOpen, rawHigh, rawLow] =
        line.split(",");
      const time = csvCell(rawDate).replace(/\//g, "-");
      const timestamp = Date.parse(`${time}T00:00:00Z`);
      return {
        time,
        timestamp,
        open: numeric(rawOpen),
        high: numeric(rawHigh),
        low: numeric(rawLow),
        close: numeric(rawClose),
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

  const bars: MarketBar[] = [];
  for (const row of accepted) {
    const previousClose = bars.at(-1)?.close ?? row.open;
    const change = row.close - previousClose;
    bars.push({
      ...row,
      volume: 0,
      amount: 0,
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
  return bars;
}

export async function fetchNikkei225DailySeries(
  instrument: MarketInstrument,
  requestedLimit = 1_000,
  fetchImpl: typeof fetch = fetch,
  requestCache: RequestCache = "default",
): Promise<MarketSeries> {
  if (canonicalMarketInstrumentKey(instrument) !== "index:N225") {
    throw new Error("Nikkei official history supports only the Nikkei 225");
  }
  const response = await fetchImpl(NIKKEI_225_DAILY_CSV_ENDPOINT, {
    headers: {
      Accept: "text/csv,text/plain;q=0.9,*/*;q=0.8",
      "User-Agent": "QuantScope/1.0 market-research-dashboard",
    },
    signal: AbortSignal.timeout(15_000),
    ...(requestCache === "no-store" ? { cache: requestCache } : {}),
  });
  if (!response.ok) {
    throw new Error(
      `Nikkei official history failed with status ${response.status}`,
    );
  }
  const limit = clampMarketSeriesLimit(requestedLimit, "1d");
  const bars = parseNikkei225DailyCsv(await response.text()).slice(-limit);
  if (bars.length === 0) {
    throw new Error("Nikkei official history returned no daily bars");
  }
  const fetchedAt = new Date();
  return {
    instrument: {
      ...instrument,
      secid: "N225",
      code: "N225",
      exchange: "JPX",
      assetType: "index",
      provider: "nikkei",
    },
    interval: "1d",
    priceAdjustment: "raw",
    previousClose: bars[0].open,
    bars,
    latestBarStatus: resolveLatestDailyBarStatus(
      bars.at(-1)!.time,
      "JPX",
      fetchedAt,
    ),
    source: "nikkei",
    fetchedAt: fetchedAt.toISOString(),
  };
}
