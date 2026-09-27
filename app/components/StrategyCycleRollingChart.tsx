"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import type { AllocationRebalance } from "@/lib/analysis/backtest";
import type { MarketBar } from "@/lib/market/types";
import { EChart } from "./EChart";

export interface StrategyCycleRollingChartLabels {
  price: string;
  establish: string;
  increase: string;
  reduce: string;
  clear: string;
  targetAllocation: string;
  fillPrice: string;
}

type RebalancePoint = {
  value: [string, number];
  rebalance: AllocationRebalance;
  symbolRotate: number;
  symbolOffset: [number, number];
};

export function buildStrategyCycleRollingChartOption(
  bars: readonly MarketBar[],
  rebalances: readonly AllocationRebalance[],
  labels: StrategyCycleRollingChartLabels,
): EChartsOption {
  const barByTime = new Map(bars.map((bar) => [bar.time, bar]));
  const establishPoints: RebalancePoint[] = [];
  const increasePoints: RebalancePoint[] = [];
  const reducePoints: RebalancePoint[] = [];
  const clearPoints: RebalancePoint[] = [];
  for (const rebalance of rebalances) {
    const bar = barByTime.get(rebalance.time);
    if (!bar || rebalance.targetAllocation === rebalance.fromAllocation) continue;
    const increasing = rebalance.targetAllocation > rebalance.fromAllocation;
    const points = increasing
      ? rebalance.fromAllocation === 0
        ? establishPoints
        : increasePoints
      : rebalance.targetAllocation === 0
        ? clearPoints
        : reducePoints;
    points.push({
      value: [rebalance.time, increasing ? bar.low : bar.high],
      rebalance,
      symbolRotate: increasing ? 0 : 180,
      symbolOffset: increasing ? [0, 14] : [0, -14],
    });
  }
  const markerSeries = (
    name: string,
    points: RebalancePoint[],
    color: string,
  ) => ({
    name,
    type: "scatter" as const,
    data: points,
    symbol: "triangle",
    symbolSize: 12,
    clip: false,
    itemStyle: { color, borderColor: "#07100d", borderWidth: 1 },
    tooltip: {
      trigger: "item" as const,
      formatter: (params: unknown) => {
        const index = Number((params as { dataIndex?: number }).dataIndex ?? -1);
        const trade = points[index]?.rebalance;
        return trade
          ? `<strong>${name}</strong><br/>${trade.time}<br/>${labels.targetAllocation}: ${Math.round(trade.targetAllocation * 100)}%<br/>${labels.fillPrice}: ${trade.fillPrice.toFixed(2)}`
          : name;
      },
    },
    z: 10,
  });
  return {
    animation: false,
    backgroundColor: "transparent",
    legend: { top: 4, textStyle: { color: "#93a49e", fontSize: 10 } },
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(11,17,15,.96)",
      borderColor: "#33443e",
      textStyle: { color: "#dfe8e4", fontSize: 11 },
    },
    grid: { left: 12, right: 62, top: 46, bottom: 58, containLabel: true },
    xAxis: {
      type: "category",
      data: bars.map((bar) => bar.time),
      boundaryGap: true,
      axisLine: { lineStyle: { color: "#26332f" } },
      axisTick: { show: false },
      axisLabel: { color: "#6f807a", fontSize: 10, hideOverlap: true },
    },
    yAxis: {
      type: "value",
      scale: true,
      position: "right",
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: "#6f807a", fontSize: 10 },
      splitLine: { lineStyle: { color: "#1b2723", type: "dashed" } },
    },
    dataZoom: [
      { type: "inside", id: "cycle-rolling-zoom-inside", start: 0, end: 100 },
      { type: "slider", id: "cycle-rolling-zoom-slider", start: 0, end: 100, height: 18, bottom: 9, borderColor: "#26332f", fillerColor: "rgba(56,189,248,.12)", backgroundColor: "#0d1613", textStyle: { color: "#6f807a", fontSize: 9 } },
    ],
    series: [
      { name: labels.price, type: "candlestick", data: bars.map((bar) => [bar.open, bar.close, bar.low, bar.high]), itemStyle: { color: "#22c55e", color0: "#ef5350", borderColor: "#22c55e", borderColor0: "#ef5350" } },
      markerSeries(labels.establish, establishPoints, "#38bdf8"),
      markerSeries(labels.increase, increasePoints, "#0ea5e9"),
      markerSeries(labels.reduce, reducePoints, "#f59e0b"),
      markerSeries(labels.clear, clearPoints, "#ef5350"),
    ],
  };
}

interface StrategyCycleRollingChartProps {
  bars: readonly MarketBar[];
  rebalances: readonly AllocationRebalance[];
  labels: StrategyCycleRollingChartLabels;
  ariaLabel: string;
  dataKey: string;
}

export function StrategyCycleRollingChart({
  bars,
  rebalances,
  labels,
  ariaLabel,
  dataKey,
}: StrategyCycleRollingChartProps) {
  const option = useMemo(
    () => buildStrategyCycleRollingChartOption(bars, rebalances, labels),
    [bars, rebalances, labels],
  );
  return <EChart option={option} className="cycle-transition-chart" height={430} ariaLabel={ariaLabel} preserveDataZoom dataZoomResetKey={dataKey} horizontalPanDataZoomIds={["cycle-rolling-zoom-inside", "cycle-rolling-zoom-slider"]} />;
}
