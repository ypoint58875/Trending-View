"use client";
import { useMemo } from "react";
import type { EChartsOption, SeriesOption } from "echarts";
import { EChart } from "../components/EChart";
import { buildTrendPanels, weeklyTrendCandles, type TrendTab, type TrendAuxiliary } from "@/lib/analysis/trend-panels";
import type { MarketSeries } from "@/lib/market/types";
import { zhCN } from "../i18n/zh-CN";
import { buildContextChartAreas } from "@/lib/analysis/context-chart";

const palette=["#45d5b3","#8daeff","#c69de8","#ecbb70","#ee8999","#a9cc80"];
export function TrendAnalysisChart({series,auxiliary,tab,candles,window,windowVersion}:{series:MarketSeries;auxiliary:TrendAuxiliary|null;tab:TrendTab;candles:boolean;window:number;windowVersion:number}) {
  const L=zhCN.trendAnalysis;
  const calculation=useMemo(()=>buildTrendPanels(series.bars,auxiliary),[series.bars,auxiliary]);
  const option=useMemo<EChartsOption>(()=>{
    const {bars}=series,dates=bars.map(b=>b.time),{context,panels}=calculation,rows=panels[tab],states=context.observations;
    const areas=buildContextChartAreas(states,dates);
    const label=(key:string)=>key in L.tabs?L.tabs[key as TrendTab]:L.labels[key as keyof typeof L.labels];
    const price:SeriesOption=candles?{id:"trend-price",name:L.candles,type:"candlestick",data:weeklyTrendCandles(bars),itemStyle:{color:"#42cfaa",color0:"#ef7e8e",borderColor:"#42cfaa",borderColor0:"#ef7e8e"}}:{id:"trend-price",name:L.close,type:"line",data:bars.map(b=>b.close),showSymbol:false,lineStyle:{color:"#ecbb70",width:1.2}};
    const chartSeries:SeriesOption[]=[{...price,markArea:{silent:true,data:areas}},...[4,12,40].map((p,j):SeriesOption=>({id:"weekly-mean-"+p,name:"SMA"+p+zhCN.marketContext.weekUnit,type:"line",data:context.raw.means.map(row=>row[j]),showSymbol:false,lineStyle:{color:["#ecbb70","#8daeff","#c69de8"][j],width:1.2},itemStyle:{color:["#ecbb70","#8daeff","#c69de8"][j]}})),
      ...(["up","down"] as const).map((direction):SeriesOption=>({name:L.labels[direction],type:"scatter",symbol:"triangle",symbolRotate:direction==="down"?180:0,symbolSize:8,itemStyle:{color:direction==="up"?"#42cfaa":"#ef7e8e"},data:states.flatMap((s,i)=>s.confirmed===direction&&s.confirmed!==states[i-1]?.confirmed?[[dates[i],bars[i].close]]:[])})),
      ...rows.map((row,j):SeriesOption=>({id:"trend-panel-"+row.key,name:label(row.key),type:tab==="macd"?"bar":"line",xAxisIndex:1,yAxisIndex:row.axis??1,data:row.values,showSymbol:false,connectNulls:false,lineStyle:{color:palette[j],width:1.4},itemStyle:{color:palette[j]}}))];
    const indicatorAxes=tab==="six"?2:1;
    return {animation:false,backgroundColor:"transparent",textStyle:{color:"#94aaa1"},
      grid:[{left:56,right:72,top:40,height:365},{left:56,right:72,top:485,height:180}],
      legend:[{top:2,type:"scroll",data:[candles?L.candles:L.close,...[4,12,40].map(p=>"SMA"+p+zhCN.marketContext.weekUnit),L.labels.up,L.labels.down],textStyle:{color:"#9eb5aa"}},{top:445,type:"scroll",data:rows.map(row=>label(row.key)),textStyle:{color:"#9eb5aa"}}],
      axisPointer:{link:[{xAxisIndex:"all"}]},
      tooltip:{trigger:"axis",confine:true,backgroundColor:"#14221c",borderColor:"#345145",textStyle:{color:"#dce8e1"},valueFormatter:(value)=>typeof value==="number"?value.toFixed(3):String(value??"—")},
      xAxis:[0,1].map(gridIndex=>({gridIndex,offset:gridIndex===1?62:0,type:"category",data:dates,boundaryGap:true,axisLabel:{color:"#8da69a",hideOverlap:true},axisLine:{lineStyle:{color:"#31483c"}}})),
      yAxis:[{gridIndex:0,type:"value",scale:true,position:"right",axisLabel:{color:"#8da69a",formatter:(v:number)=>Math.round(v).toLocaleString("en-US")},splitLine:{lineStyle:{color:"#23392e"}}},...Array.from({length:indicatorAxes},(_,i)=>({gridIndex:1,type:"value" as const,scale:true,position:i?"right" as const:"left" as const,axisLabel:{color:"#8da69a",formatter:(v:number)=>Number(v.toFixed(2)).toString()},splitLine:{show:!i,lineStyle:{color:"#23392e"}}}))],
      dataZoom:[{id:"trend-inside",type:"inside",xAxisIndex:[0,1],startValue:Math.max(0,bars.length-window),endValue:bars.length-1,filterMode:"filter",minValueSpan:5},{id:"trend-slider",type:"slider",xAxisIndex:[0,1],startValue:Math.max(0,bars.length-window),endValue:bars.length-1,height:24,bottom:12,filterMode:"filter"}],series:chartSeries};
  },[series,calculation,tab,candles,window,L]);
  return <EChart option={option} height={810} ariaLabel={L.title+" · "+L.tabs[tab]} preserveDataZoom dataZoomResetKey={series.instrument.code+":"+windowVersion} />;
}
