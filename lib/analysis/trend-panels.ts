import { adx, atr, rsi, roc, macd, type NumericSeries } from "./indicators";
import { buildWeeklyMarketContext } from "./weekly-market-context";
import { DAILY_HISTORY_LIMIT } from "@/lib/market/history";
import type { MarketBar } from "@/lib/market/types";

export const SIX_TREND_TABS = ["six", "bias4", "bias12", "bias40", "slope4", "slope12", "slope40"] as const;
export const OTHER_TREND_TABS = ["strength", "atr", "breadth", "vi", "vix", "spread", "rate", "rateChange", "roc", "macd", "dmi"] as const;
export const VISIBLE_TREND_TABS = [...SIX_TREND_TABS, "atr", "breadth", "vix", "spread"] as const;
export type TrendTab = typeof SIX_TREND_TABS[number] | typeof OTHER_TREND_TABS[number];
export interface TrendPanelLine { key: string; values: NumericSeries; axis?: number }
interface Observation { date: string; value: number }
export interface TrendAuxiliary {
  metadata: { model: string; identity: string; candidateHash: string; ratesHash: string };
  breadth: Array<{ date: string; above50: number | null; above200: number | null; above200YoY: number | null; coverage50: number; coverage200: number }>;
  vi: Observation[]; vix: Observation[];
  rates: Array<{date: string; yield2: number; yield10: number}>;
}
/** No same-source-day use, bounded age, no forward draw through stale inputs. */
export function alignPriorTrendSeries(dates: readonly string[], input: readonly Observation[]): NumericSeries {
  if(dates.length>DAILY_HISTORY_LIMIT||input.length>DAILY_HISTORY_LIMIT)throw new Error("Trend auxiliary history exceeds limit");
  for(let i=0;i<input.length;i++)if(!Number.isFinite(input[i].value)||!/^\d{4}-\d{2}-\d{2}$/.test(input[i].date)||i&&input[i].date<=input[i-1].date)throw new Error("Invalid auxiliary observations");
  let cursor=-1;
  return dates.map((date,i)=>{
    if(i&&date<=dates[i-1])throw new Error("Unordered trend dates");
    while(cursor+1<input.length&&input[cursor+1].date<date)cursor++;
    return cursor<0||Date.parse(date)-Date.parse(input[cursor].date)>7*86400000?null:input[cursor].value;
  });
}
export function buildTrendPanels(bars: readonly MarketBar[], auxiliary: TrendAuxiliary | null = null) {
  const context=buildWeeklyMarketContext(bars),close=bars.map(b=>b.close),volatility=atr([...bars],14),strength=adx([...bars],14);
  const panels={} as Record<TrendTab,TrendPanelLine[]>;
  const curveNames=["bias4","bias12","bias40","slope4","slope12","slope40"] as const;
  curveNames.forEach((key,i)=>panels[key]=[{key,values:[...context.curves.bias,...context.curves.slope][i]}]);
  panels.six=curveNames.flatMap((key,i)=>panels[key].map(line=>({...line,axis:i>=3?2:1})));
  const efficiency=close.map((v,i)=>{if(i<20)return null;let path=0;for(let j=i-19;j<=i;j++)path+=Math.abs(close[j]-close[j-1]);return path?100*Math.abs(v-close[i-20])/path:0;});
  panels.strength=[{key:"adx",values:strength.adx},{key:"rsi",values:rsi(close,14)},{key:"efficiency",values:efficiency}];
  panels.atr=[{key:"atr",values:volatility.map((v,i)=>v===null?null:100*v/close[i])}];
  panels.roc=[{key:"roc",values:roc(close,10)}];
  // The standalone reference uses EMA difference minus signal (without2x).
  panels.macd=[{key:"macd",values:macd(close,12,26,9).histogram.map(v=>v===null?null:v/2)}];
  panels.dmi=[{key:"dmi",values:strength.plusDi.map((v,i)=>v===null||strength.minusDi[i]===null?null:v-strength.minusDi[i]!)}];
  const dates=bars.map(b=>b.time),empty=()=>bars.map(()=>null),prior=(values:Observation[])=>alignPriorTrendSeries(dates,values);
  const breadth=new Map(auxiliary?.breadth.map(row=>[row.date,row]));
  panels.breadth=["above50","above200","above200YoY"].map(key=>({key,values:dates.map(date=>{const row=breadth.get(date);return !row||row.coverage200<.9||row.coverage50<.9?null:row[key as "above50"]??null;})}));
  panels.vi=[{key:"vi",values:auxiliary?prior(auxiliary.vi):empty()}];panels.vix=[{key:"vix",values:auxiliary?prior(auxiliary.vix):empty()}];
  panels.spread=[{key:"spread",values:auxiliary?prior(auxiliary.rates.map(r=>({date:r.date,value:r.yield10-r.yield2}))):empty()}];
  panels.rate=[{key:"rate",values:auxiliary?prior(auxiliary.rates.map(r=>({date:r.date,value:r.yield10}))):empty()}];
  panels.rateChange=["rise20","curve20"].map(key=>({key,values:auxiliary?prior(auxiliary.rates.flatMap((r,i)=>i<20?[]:[{date:r.date,value:100*(key==="rise20"?r.yield10-auxiliary.rates[i-20].yield10:(r.yield10-r.yield2)-(auxiliary.rates[i-20].yield10-auxiliary.rates[i-20].yield2))}])):empty()}));
  return {context,panels};
}

/** Display-only weekly OHLC on the final observed session, never signal input. */
export function weeklyTrendCandles(bars: readonly MarketBar[]) {
  const values: Array<[number,number,number,number]|[string,string,string,string]>=bars.map(()=>["-","-","-","-"]);
  for(let start=0;start<bars.length;){const date=new Date(bars[start].time+"T00:00:00Z");date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);const until=date.getTime()+7*86400000;let end=start;while(end+1<bars.length&&Date.parse(bars[end+1].time)<until)end++;const group=bars.slice(start,end+1);values[end]=[bars[start].open,bars[end].close,Math.min(...group.map(b=>b.low)),Math.max(...group.map(b=>b.high))];start=end+1;}
  return values;
}
