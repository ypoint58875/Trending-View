import { canonicalMarketInstrumentKey } from "./canonical";
import { clampMarketSeriesLimit } from "./history";
import { resolveLatestDailyBarStatus } from "./session";
import type {
  MarketInstrument,
  MarketReferenceObservation,
  MarketReferenceSeries,
} from "./types";

const FRED_GRAPH_CSV_ENDPOINT =
  "https://fred.stlouisfed.org/graph/fredgraph.csv";

export function parseFredNikkei225Csv(
  text: string,
): MarketReferenceObservation[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "observation_date,NIKKEI225") {
    throw new Error("FRED returned an unexpected Nikkei 225 CSV");
  }
  return lines
    .slice(1)
    .map((line) => {
      const [time = "", rawValue = ""] = line.split(",");
      const value = Number(rawValue);
      const timestamp = Date.parse(`${time}T00:00:00Z`);
      return {
        time,
        timestamp,
        value,
      };
    })
    .filter(
      (observation) =>
        /^\d{4}-\d{2}-\d{2}$/.test(observation.time) &&
        Number.isFinite(observation.timestamp) &&
        Number.isFinite(observation.value) &&
        observation.value > 0,
    )
    .sort((left, right) => left.timestamp - right.timestamp);
}

export async function fetchFredNikkei225Reference(
  instrument: MarketInstrument,
  requestedLimit = 10_000,
  fetchImpl: typeof fetch = fetch,
  requestCache: RequestCache = "default",
): Promise<MarketReferenceSeries> {
  if (canonicalMarketInstrumentKey(instrument) !== "index:N225") {
    throw new Error("FRED reference supports only the Nikkei 225");
  }
  const limit = clampMarketSeriesLimit(requestedLimit, "1d");
  const url = new URL(FRED_GRAPH_CSV_ENDPOINT);
  url.searchParams.set("id", "NIKKEI225");
  url.searchParams.set("cosd", "2000-01-01");
  const response = await fetchImpl(url, {
    headers: {
      Accept: "text/csv,text/plain;q=0.9,*/*;q=0.8",
      "User-Agent": "QuantScope/1.0 market-research-dashboard",
    },
    signal: AbortSignal.timeout(15_000),
    ...(requestCache === "no-store" ? { cache: requestCache } : {}),
  });
  if (!response.ok) {
    throw new Error(`FRED request failed with status ${response.status}`);
  }
  const observations = parseFredNikkei225Csv(await response.text()).slice(
    -limit,
  );
  if (observations.length === 0) {
    throw new Error("FRED returned no Nikkei 225 observations");
  }
  const fetchedAt = new Date();
  return {
    instrumentKey: "index:N225",
    interval: "1d",
    observations,
    latestBarStatus: resolveLatestDailyBarStatus(
      observations.at(-1)!.time,
      "JPX",
      fetchedAt,
    ),
    source: "fred",
    fetchedAt: fetchedAt.toISOString(),
  };
}
