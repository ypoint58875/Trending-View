"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import type { MarketBar } from "@/lib/market/types";
import type { StrategyCycleTransitionRebalance, StrategyCycleTransitionResult } from "@/lib/analysis/strategy-cycle-validation";
import { EChart } from "./EChart";

export interface StrategyCycleTransitionChartLabels {
  price: string;
  changeDate: string;
  oldRebalance: string;
  newRebalance: string;
  targetAllocation: string;
}

function rebalanceSeries(name: string, rebalances: readonly StrategyCycleTransitionRebalance[], barByTime: Map<string, MarketBar>, color: string, targetAllocationLabel: string) {
  const points = rebalances.flatMap((rebalance) => {
    const bar = barByTime.get(rebalance.time);
    if (!bar) return [];
    const increasing = rebalance.targetAllocation > rebalance.fromAllocation;
    return [{
      value: [rebalance.time, increasing ? bar.low : bar.high],
      rebalance,
      symbolRotate: increasing ? 0 : 180,
      symbolOffset: increasing ? [0, 14] : [0, -14],
    }];
  });
  return {
    name, type: "scatter" as const, data: points, symbol: "triangle", symbolSize: 12, clip: false,
    itemStyle: { color, borderColor: "#07100d", borderWidth: 1 },
    tooltip: {
      trigger: "item" as const,
      formatter: (params: unknown) => {
        const index = Number((params as { dataIndex?: number }).dataIndex ?? -1);
        const rebalance = points[index]?.rebalance;
        return rebalance
          ? `<strong>${name}</strong><br/>${rebalance.time}<br/>${targetAllocationLabel}: ${Math.round(rebalance.targetAllocation * 100)}%`
          : name;
      },
    },
    z: 10,
  };
}

export function buildStrategyCycleTransitionChartOption(transition: StrategyCycleTransitionResult, bars: readonly MarketBar[], labels: StrategyCycleTransitionChartLabels): EChartsOption {
  const chartBars = bars.filter((bar) => bar.time >= transition.performanceStartTime && bar.time <= transition.performanceEndTime);
  const barByTime = new Map(chartBars.map((bar) => [bar.time, bar]));
  return {
    animation: false, backgroundColor: "transparent",
    legend: { top: 4, textStyle: { color: "#93a49e", fontSize: 10 } },
    tooltip: { trigger: "axis", backgroundColor: "rgba(11,17,15,.96)", borderColor: "#33443e", textStyle: { color: "#dfe8e4", fontSize: 11 } },
    grid: { left: 12, right: 62, top: 46, bottom: 58, containLabel: true },
    xAxis: { type: "category", data: chartBars.map((bar) => bar.time), boundaryGap: true, axisLine: { lineStyle: { color: "#26332f" } }, axisTick: { show: false }, axisLabel: { color: "#6f807a", fontSize: 10, hideOverlap: true } },
    yAxis: { type: "value", scale: true, position: "right", axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: "#6f807a", fontSize: 10 }, splitLine: { lineStyle: { color: "#1b2723", type: "dashed" } } },
    dataZoom: [
      { type: "inside", id: "cycle-transition-zoom-inside", start: 0, end: 100 },
      { type: "slider", id: "cycle-transition-zoom-slider", start: 0, end: 100, height: 18, bottom: 9, borderColor: "#26332f", fillerColor: "rgba(56,189,248,.12)", backgroundColor: "#0d1613", textStyle: { color: "#6f807a", fontSize: 9 } },
    ],
    series: [
      { name: labels.price, type: "candlestick", data: chartBars.map((bar) => [bar.open, bar.close, bar.low, bar.high]), itemStyle: { color: "#22c55e", color0: "#ef5350", borderColor: "#22c55e", borderColor0: "#ef5350" }, markLine: { silent: true, symbol: "none", label: { show: true, formatter: labels.changeDate, color: "#93a49e", fontSize: 9 }, lineStyle: { color: "#64748b", type: "dotted" }, data: [{ xAxis: transition.decisionTime }] } },
      rebalanceSeries(labels.oldRebalance, transition.oldRebalances, barByTime, "#f59e0b", labels.targetAllocation),
      rebalanceSeries(labels.newRebalance, transition.newRebalances, barByTime, "#38bdf8", labels.targetAllocation),
    ],
  };
}

interface StrategyCycleTransitionChartProps {
  transition: StrategyCycleTransitionResult;
  bars: readonly MarketBar[];
  labels: StrategyCycleTransitionChartLabels;
  ariaLabel: string;
}

export function StrategyCycleTransitionChart({ transition, bars, labels, ariaLabel }: StrategyCycleTransitionChartProps) {
  const option = useMemo(() => buildStrategyCycleTransitionChartOption(transition, bars, labels), [transition, bars, labels]);
  return <EChart option={option} className="cycle-transition-chart" height={430} ariaLabel={ariaLabel} preserveDataZoom dataZoomResetKey={`${transition.decisionTime}:${transition.newStrategyKey}`} horizontalPanDataZoomIds={["cycle-transition-zoom-inside", "cycle-transition-zoom-slider"]} />;
}
