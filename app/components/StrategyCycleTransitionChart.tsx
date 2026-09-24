"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import type {
  StrategyCycleTransitionRebalance,
  StrategyCycleTransitionResult,
} from "@/lib/analysis/strategy-cycle-validation";
import { EChart } from "./EChart";

export interface StrategyCycleTransitionChartLabels {
  oldStrategy: string;
  newStrategy: string;
  difference: string;
  returnUnit: string;
  changeDate: string;
  oldRebalance: string;
  newRebalance: string;
  targetAllocation: string;
}

function signedPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function rebalanceSeries(
  name: string,
  rebalances: readonly StrategyCycleTransitionRebalance[],
  color: string,
  targetAllocationLabel: string,
) {
  return {
    name,
    type: "scatter" as const,
    data: rebalances.map((rebalance) => ({
      value: [rebalance.time, rebalance.returnValue],
      rebalance,
      symbol: "triangle",
      symbolRotate: rebalance.targetAllocation > rebalance.fromAllocation ? 0 : 180,
      symbolOffset: rebalance.targetAllocation > rebalance.fromAllocation
        ? [0, 10]
        : [0, -10],
    })),
    symbol: "triangle",
    symbolSize: 11,
    clip: false,
    itemStyle: { color, borderColor: "#07100d", borderWidth: 1 },
    tooltip: {
      trigger: "item" as const,
      formatter: (params: unknown) => {
        const index = Number((params as { dataIndex?: number }).dataIndex ?? -1);
        const rebalance = rebalances[index];
        return rebalance
          ? `<strong>${name}</strong><br/>${rebalance.time}<br/>${targetAllocationLabel}: ${Math.round(rebalance.targetAllocation * 100)}%`
          : name;
      },
    },
    z: 10,
  };
}

export function buildStrategyCycleTransitionChartOption(
  transition: StrategyCycleTransitionResult,
  labels: StrategyCycleTransitionChartLabels,
): EChartsOption {
  const times = transition.performance.map((point) => point.time);
  return {
    animation: false,
    backgroundColor: "transparent",
    legend: {
      top: 4,
      textStyle: { color: "#93a49e", fontSize: 10 },
      itemWidth: 18,
      itemHeight: 8,
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(11,17,15,.96)",
      borderColor: "#33443e",
      textStyle: { color: "#dfe8e4", fontSize: 11 },
      valueFormatter: (value: unknown) => signedPercent(Number(value)),
    },
    grid: { left: 12, right: 62, top: 46, bottom: 58, containLabel: true },
    xAxis: {
      type: "category",
      data: times,
      boundaryGap: false,
      axisLine: { lineStyle: { color: "#26332f" } },
      axisTick: { show: false },
      axisLabel: { color: "#6f807a", fontSize: 10, hideOverlap: true },
    },
    yAxis: {
      type: "value",
      name: labels.returnUnit,
      nameTextStyle: { color: "#6f807a", fontSize: 9 },
      position: "right",
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: "#6f807a",
        fontSize: 10,
        formatter: (value: number) => `${value.toFixed(1)}%`,
      },
      splitLine: { lineStyle: { color: "#1b2723", type: "dashed" } },
    },
    dataZoom: [
      { type: "inside", id: "cycle-transition-zoom-inside", start: 0, end: 100 },
      {
        type: "slider",
        id: "cycle-transition-zoom-slider",
        start: 0,
        end: 100,
        height: 18,
        bottom: 9,
        borderColor: "#26332f",
        fillerColor: "rgba(56,189,248,.12)",
        backgroundColor: "#0d1613",
        textStyle: { color: "#6f807a", fontSize: 9 },
      },
    ],
    series: [
      {
        name: labels.oldStrategy,
        type: "line",
        data: transition.performance.map((point) => point.oldReturn),
        showSymbol: false,
        lineStyle: { color: "#f59e0b", width: 1.8 },
        itemStyle: { color: "#f59e0b" },
      },
      {
        name: labels.newStrategy,
        type: "line",
        data: transition.performance.map((point) => point.newReturn),
        showSymbol: false,
        lineStyle: { color: "#38bdf8", width: 2 },
        itemStyle: { color: "#38bdf8" },
      },
      {
        name: labels.difference,
        type: "line",
        data: transition.performance.map((point) => point.returnDifference),
        showSymbol: false,
        lineStyle: { color: "#c084fc", width: 1.5, type: "dashed" },
        itemStyle: { color: "#c084fc" },
        markLine: {
          silent: true,
          symbol: "none",
          label: {
            show: true,
            formatter: labels.changeDate,
            color: "#93a49e",
            fontSize: 9,
          },
          lineStyle: { color: "#64748b", type: "dotted" },
          data: [{ xAxis: transition.decisionTime }],
        },
      },
      rebalanceSeries(
        labels.oldRebalance,
        transition.oldRebalances,
        "#f59e0b",
        labels.targetAllocation,
      ),
      rebalanceSeries(
        labels.newRebalance,
        transition.newRebalances,
        "#38bdf8",
        labels.targetAllocation,
      ),
    ],
  };
}

interface StrategyCycleTransitionChartProps {
  transition: StrategyCycleTransitionResult;
  labels: StrategyCycleTransitionChartLabels;
  ariaLabel: string;
}

export function StrategyCycleTransitionChart({
  transition,
  labels,
  ariaLabel,
}: StrategyCycleTransitionChartProps) {
  const option = useMemo(
    () => buildStrategyCycleTransitionChartOption(transition, labels),
    [labels, transition],
  );
  return (
    <EChart
      option={option}
      className="cycle-transition-chart"
      height={430}
      ariaLabel={ariaLabel}
      preserveDataZoom
      dataZoomResetKey={`${transition.decisionTime}:${transition.newStrategyKey}`}
      horizontalPanDataZoomIds={[
        "cycle-transition-zoom-inside",
        "cycle-transition-zoom-slider",
      ]}
    />
  );
}
