import { readCanonicalMarketSeriesEntry } from "./canonical-cache";
import { resolveCanonicalMarketProfile, canonicalMarketInstrumentKey } from "./canonical";
import { refreshShortcutMarketInstrument } from "./shortcut-refresh";
import { DAILY_HISTORY_LIMIT } from "./history";
import type { MarketInstrument, MarketSeries } from "./types";

export const WORKSPACE_DEFAULT_INSTRUMENT: MarketInstrument = {
  secid: "^N225", code: "N225", name: "Nikkei 225", exchange: "JPX", assetType: "index", provider: "yahoo",
};

export function preferWorkspaceSeries(current: MarketSeries | null, incoming: MarketSeries): MarketSeries {
  if (incoming.interval !== "1d" || incoming.bars.length > DAILY_HISTORY_LIMIT || !incoming.bars.length)
    throw new Error("Invalid shared workspace daily series");
  if (!current || canonicalMarketInstrumentKey(current.instrument) !== canonicalMarketInstrumentKey(incoming.instrument)) return incoming;
  const oldEnd = current.bars.at(-1)!.time, newEnd = incoming.bars.at(-1)!.time;
  if (newEnd < oldEnd || newEnd === oldEnd && incoming.bars.length < current.bars.length) return current;
  if (newEnd === oldEnd && incoming.bars.length === current.bars.length && incoming.fetchedAt <= current.fetchedAt &&
      !(incoming.latestBarStatus === "complete" && current.latestBarStatus !== "complete")) return current;
  return incoming;
}

/** All pages use the existing canonical source, cache, backup and overlap policy. */
export async function loadWorkspaceMarketSeries(instrument: MarketInstrument, signal: AbortSignal, refresh = true): Promise<MarketSeries> {
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  const profile = resolveCanonicalMarketProfile(instrument);
  if (!refresh) {
    const cached = await readCanonicalMarketSeriesEntry(profile.primary.instrument, "1d");
    if (cached?.series.bars.length) return cached.series;
  }
  const result = await refreshShortcutMarketInstrument(profile.primary.instrument, { signal });
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  if (!result?.canonicalSeries.bars.length) throw new Error("UPSTREAM_UNAVAILABLE");
  return result.canonicalSeries;
}
