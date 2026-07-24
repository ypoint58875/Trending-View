import type {
  MarketBar,
  MarketInstrument,
  MarketInterval,
  MarketSeries,
} from "./types";

const SEARCH_ENDPOINT = "https://searchapi.eastmoney.com/api/suggest/get";
const KLINE_ENDPOINT =
  "https://push2his.eastmoney.com/api/qt/stock/kline/get";
const SEARCH_TOKEN = "D43BF722C8E33BDC906FB84D85E326E8";
const DEFAULT_HEADERS = {
  Accept: "application/json,text/plain,*/*",
  Referer: "https://quote.eastmoney.com/",
  "User-Agent":
    "Mozilla/5.0 (compatible; QuantScope/1.0; market-research-dashboard)",
};

const intervalToKlineType: Record<MarketInterval, string> = {
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "30m": "30",
  "60m": "60",
  "1d": "101",
};

interface EastmoneySearchItem {
  Code?: string;
  Name?: string;
  QuoteID?: string;
  MktNum?: string;
  SecurityTypeName?: string;
  SecurityType?: string;
}

interface EastmoneySearchResponse {
  QuotationCodeTable?: {
    Data?: EastmoneySearchItem[];
  };
}

interface EastmoneyKlineData {
  code?: string;
  market?: number;
  name?: string;
  preKPrice?: number;
  klines?: string[];
}

interface EastmoneyKlineResponse {
  data?: EastmoneyKlineData | null;
}

function exchangeFromMarket(market: string | number | undefined) {
  if (String(market) === "1") return "SSE" as const;
  if (String(market) === "0") return "SZSE" as const;
  if (String(market) === "100") return "JPX" as const;
  if (String(market) === "251") return "PHLX" as const;
  if (String(market) === "107") return "NYSE_ARCA" as const;
  if (String(market) === "105") return "NASDAQ" as const;
  return "OTHER" as const;
}

function assetTypeFromSearchItem(
  item: EastmoneySearchItem,
): MarketInstrument["assetType"] | null {
  if (item.SecurityTypeName === "指数") return "index";
  if (
    item.SecurityType === "8" &&
    /ETF/i.test(`${item.Name ?? ""} ${item.SecurityTypeName ?? ""}`)
  ) {
    return "etf";
  }
  if (/ETF/i.test(item.Name ?? "")) return "etf";
  return null;
}

function numeric(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseKlineRow(row: string): MarketBar | null {
  const [
    time,
    open,
    close,
    high,
    low,
    volume,
    amount,
    amplitude,
    changePercent,
    change,
    turnoverRate,
  ] = row.split(",");

  if (!time || !open || !close || !high || !low) return null;

  const isoTime =
    time.length === 10
      ? `${time}T00:00:00+08:00`
      : `${time.replace(" ", "T")}:00+08:00`;
  const timestamp = Date.parse(isoTime);
  if (!Number.isFinite(timestamp)) return null;

  return {
    time,
    timestamp,
    open: numeric(open),
    close: numeric(close),
    high: numeric(high),
    low: numeric(low),
    volume: numeric(volume),
    amount: numeric(amount),
    amplitude: numeric(amplitude),
    changePercent: numeric(changePercent),
    change: numeric(change),
    turnoverRate: numeric(turnoverRate),
  };
}

async function fetchJson<T>(
  url: URL,
  fetchImpl: typeof fetch = fetch,
  requestCache: RequestCache = "default",
): Promise<T> {
  const response = await fetchImpl(url, {
    headers: DEFAULT_HEADERS,
    signal: AbortSignal.timeout(12_000),
    ...(requestCache === "no-store" ? { cache: requestCache } : {}),
  });

  if (!response.ok) {
    throw new Error(`Eastmoney request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function searchEastmoney(
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MarketInstrument[]> {
  const normalizedQuery = query.trim().slice(0, 40);
  if (normalizedQuery.length < 1) return [];

  const url = new URL(SEARCH_ENDPOINT);
  url.searchParams.set("input", normalizedQuery);
  url.searchParams.set("type", "14");
  url.searchParams.set("token", SEARCH_TOKEN);
  url.searchParams.set("count", "12");

  const payload = await fetchJson<EastmoneySearchResponse>(url, fetchImpl);
  const items = payload.QuotationCodeTable?.Data ?? [];

  return items
    .map((item) => ({ item, assetType: assetTypeFromSearchItem(item) }))
    .filter(
      (
        candidate,
      ): candidate is {
        item: EastmoneySearchItem & {
          Code: string;
          Name: string;
          QuoteID: string;
        };
        assetType: MarketInstrument["assetType"];
      } =>
        Boolean(
          candidate.item.Code &&
            candidate.item.Name &&
            candidate.item.QuoteID &&
            candidate.assetType,
        ),
    )
    .map(({ item, assetType }) => ({
      secid: item.QuoteID,
      code: item.Code,
      name: item.Name,
      exchange: exchangeFromMarket(item.MktNum),
      assetType,
      provider: "eastmoney" as const,
    }))
    .slice(0, 8);
}

export async function fetchEastmoneySeries(
  instrument: MarketInstrument,
  interval: MarketInterval,
  requestedLimit = 1000,
  fetchImpl: typeof fetch = fetch,
  requestCache: RequestCache = "default",
): Promise<MarketSeries> {
  const limit = Math.min(Math.max(Math.trunc(requestedLimit), 2), 1500);
  const url = new URL(KLINE_ENDPOINT);
  url.searchParams.set("secid", instrument.secid);
  url.searchParams.set("klt", intervalToKlineType[interval]);
  url.searchParams.set("fqt", "1");
  url.searchParams.set("lmt", String(limit));
  url.searchParams.set("end", "20500101");
  url.searchParams.set("fields1", "f1,f2,f3,f4,f5,f6");
  url.searchParams.set(
    "fields2",
    "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
  );

  const payload = await fetchJson<EastmoneyKlineResponse>(
    url,
    fetchImpl,
    requestCache,
  );
  const data = payload.data;
  if (!data?.klines?.length) {
    throw new Error("Eastmoney returned no kline data");
  }

  const bars = data.klines
    .map(parseKlineRow)
    .filter((bar): bar is MarketBar => Boolean(bar))
    .slice(-limit);

  if (bars.length === 0) {
    throw new Error("Eastmoney kline data could not be parsed");
  }

  return {
    instrument: {
      ...instrument,
      code: data.code || instrument.code,
      name: data.name || instrument.name,
      exchange: exchangeFromMarket(data.market),
    },
    interval,
    previousClose: Number(data.preKPrice) || bars[0].open,
    bars,
    source: "eastmoney",
    fetchedAt: new Date().toISOString(),
  };
}
