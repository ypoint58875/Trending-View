"use client";
import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useWorkspaceMarket } from "../components/WorkspaceMarketProvider";
import { MarketContextMonitor } from "../components/ValidatedCycleShortcuts";
import { IndicatorTabs } from "../components/IndicatorTabs";
import { completedContextSeries } from "@/lib/analysis/market-context";
import { VISIBLE_TREND_TABS,type TrendTab,type TrendAuxiliary } from "@/lib/analysis/trend-panels";
import { loadWorkspaceMarketSeries,WORKSPACE_DEFAULT_INSTRUMENT } from "@/lib/market/workspace-series";
import { readCanonicalMarketSeriesEntry } from "@/lib/market/canonical-cache";
import type { MarketSeries } from "@/lib/market/types";
import { TrendAnalysisChart } from "./TrendAnalysisChart";
import { zhCN } from "../i18n/zh-CN";
export function TrendAnalysisWorkspace() {
  const L=zhCN.trendAnalysis,{nikkei,publish}=useWorkspaceMarket();
  const [local,setLocal]=useState<MarketSeries|null>(null),[auxiliary,setAuxiliary]=useState<TrendAuxiliary|null>(null),[tab,setTab]=useState<TrendTab>("six"),[error,setError]=useState(false),[loading,setLoading]=useState(true),[refresh,setRefresh]=useState(0),[candles,setCandles]=useState(true),[window,setWindow]=useState(500),[windowVersion,setWindowVersion]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();let active=true;
    void readCanonicalMarketSeriesEntry(WORKSPACE_DEFAULT_INSTRUMENT,"1d").then(cached=>{if(active&&cached?.series.bars.length){setLocal(cached.series);publish(cached.series);}});
    void loadWorkspaceMarketSeries(WORKSPACE_DEFAULT_INSTRUMENT,controller.signal).then(series=>{if(active){setLocal(series);publish(series);}}).catch(e=>{if(active&&e.name!=="AbortError")setError(true);}).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;controller.abort();};
  },[publish,refresh]);
  useEffect(()=>{const controller=new AbortController();void fetch("/api/trend-auxiliary",{signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error("Auxiliary unavailable");const value=await response.json() as TrendAuxiliary;if(value.metadata?.model!=="trend-auxiliary-snapshot-v1")throw new Error("Invalid auxiliary model");setAuxiliary(value);}).catch(e=>{if(e.name!=="AbortError")setAuxiliary(null);});return()=>controller.abort();},[]);
  const current=nikkei??local,series=useMemo(()=>current?completedContextSeries(current):null,[current]);
  const auxiliaryDates=auxiliary?[auxiliary.breadth.at(-1)?.date,auxiliary.vi.at(-1)?.date,auxiliary.vix.at(-1)?.date,auxiliary.rates.at(-1)?.date]:[];
  const showTab=(key:string)=>setTab(key as TrendTab);
  return (
    <main className="trend-analysis-shell">
      <header className="trend-analysis-header">
        <div><h1>{L.title}</h1><p>{L.subtitle}</p></div>
        <button type="button" disabled={loading} onClick={() => {setLoading(true);setError(false);setRefresh(n => n + 1);}}>
          <RefreshCw size={15} />{L.retry}
        </button>
      </header>
      <div className="workspace-grid trend-analysis-layout">
        <section className="chart-card panel trend-overview-panel">
          <div className="panel-heading trend-chart-heading">
            <div><span className="eyebrow">{series?.instrument.name ?? L.title}</span><strong>{L.chartTitle}</strong></div>
            <IndicatorTabs tabs={[{key:"weekly",label:L.candles},{key:"close",label:L.close}]} value={candles ? "weekly" : "close"}
              onChange={value => setCandles(value === "weekly")} label={L.chartView} />
          </div>
          <div className="trend-analysis-toolbar">
            {[250,500,1000,10000].map(size => <button key={size} type="button" aria-pressed={window === size}
              onClick={() => {setWindow(size);setWindowVersion(n => n + 1);}}>{size === 10000 ? L.all : size + L.bars}</button>)}
            {loading && <span role="status">{L.loading}</span>}
          </div>
          {error && <p role="alert">{L.error}</p>}
          <div className="trend-analysis-chart">
            {series?.bars.length ? <TrendAnalysisChart series={series} auxiliary={auxiliary} tab={tab} candles={candles}
              window={window} windowVersion={windowVersion} /> : <p>{zhCN.marketContext.unavailable}</p>}
            <section className="trend-panel-selector">
              <IndicatorTabs tabs={VISIBLE_TREND_TABS.map(key => ({key,label:L.tabs[key]}))} value={tab} onChange={showTab} label={L.chartTitle} />
            </section>
          </div>
        </section>
        <aside className="saved-shortcuts-panel panel trend-monitor-panel">
          <div className="panel-heading"><div><span className="eyebrow">{series?.instrument.name ?? L.title}</span><strong>{zhCN.marketContext.title}</strong></div></div>
          <div className="trend-monitor-content">
            {series ? <MarketContextMonitor series={series} /> : <p>{zhCN.marketContext.unavailable}</p>}
            {series && <section className="trend-source-details">
              <h2>{L.source}</h2>
              <dl><dt>{L.source}</dt><dd>{series.source}</dd><dt>{L.end}</dt><dd>{series.bars.at(-1)?.time ?? "—"}</dd>
                <dt>{L.history}</dt><dd>{series.bars[0]?.time} — {series.bars.at(-1)?.time}</dd><dt>{L.historyCount}</dt><dd>{series.bars.length}</dd></dl>
            </section>}
            <details className="trend-rule-details" open><summary>{L.details}</summary><p>{L.note}</p>{tab === "six" && <p>{L.overviewNote}</p>}<p>{L.timing}</p></details>
            <section className="trend-source-details">
              <h2>{L.auxiliaryEnd}</h2>
              {auxiliary && <dl><dt>{L.tabs.breadth}</dt><dd>{auxiliaryDates[0]}</dd><dt>{L.tabs.vi}</dt><dd>{auxiliaryDates[1]}</dd>
                <dt>{L.tabs.vix}</dt><dd>{auxiliaryDates[2]}</dd><dt>{L.tabs.rate}</dt><dd>{auxiliaryDates[3]}</dd></dl>}
              <p>{L.auxiliaryNote}</p><p>{L.historicalAux}</p>
            </section>
          </div>
        </aside>
      </div>
    </main>
  );
}
