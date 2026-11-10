"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { MarketSeries } from "@/lib/market/types";
import { canonicalMarketInstrumentKey } from "@/lib/market/canonical";
import { preferWorkspaceSeries } from "@/lib/market/workspace-series";

const Context = createContext<{ series: MarketSeries | null; nikkei: MarketSeries | null; publish: (series: MarketSeries) => void }>({ series: null, nikkei: null, publish: () => {} });

export function WorkspaceMarketProvider({ children }: { children: ReactNode }) {
  const [series, setSeries] = useState<MarketSeries | null>(null);
  const [nikkei, setNikkei] = useState<MarketSeries | null>(null);
  const publish = useCallback((incoming: MarketSeries) => {
    if (!incoming.bars.length || incoming.interval !== "1d") return;
    setSeries(current => preferWorkspaceSeries(current, incoming));
    if (canonicalMarketInstrumentKey(incoming.instrument) === "index:N225") setNikkei(current => preferWorkspaceSeries(current, incoming));
  }, []);
  const value = useMemo(() => ({ series, nikkei, publish }), [series, nikkei, publish]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useWorkspaceMarket = () => useContext(Context);
export function PublishWorkspaceSeries({ series }: { series: MarketSeries | null }) {
  const { publish } = useWorkspaceMarket();
  useEffect(() => { if (series) publish(series); }, [publish, series]);
  return null;
}
