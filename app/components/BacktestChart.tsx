"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import type { BacktestPerformance } from "@/lib/analysis/backtest";
import { EChart } from "./EChart";

interface BacktestChartProps {
  result: BacktestPerformance;
  ariaLabel: string;
  labels: {
    equity: string;
    drawdown: string;
  };
}

export function BacktestChart({
  result,
  ariaLabel,
  labels,
}: BacktestChartProps) {
  const option = useMemo<EChartsOption>(
    () => ({
      animation: false,
      backgroundColor: "transparent",
      grid: { left: 10, right: 34, top: 14, bottom: 24 },
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(11,17,15,.96)",
        borderColor: "#33443e",
        textStyle: { color: "#dfe8e4", fontSize: 10 },
      },
      xAxis: {
        type: "category",
        data: result.equity.map((point) => point.time),
        boundaryGap: false,
        axisLine: { lineStyle: { color: "#26332f" } },
        axisTick: { show: false },
        axisLabel: { color: "#6f807a", fontSize: 9, hideOverlap: true },
      },
      yAxis: [
        {
          type: "value",
          scale: true,
          position: "right",
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: {
            color: "#6f807a",
            fontSize: 9,
            formatter: (value: number) => `${Math.round(value / 1000)}k`,
          },
          splitLine: { lineStyle: { color: "#1b2723", type: "dashed" } },
        },
        {
          type: "value",
          min: Math.min(-1, result.maxDrawdown),
          max: 0,
          show: false,
        },
      ],
      series: [
        {
          name: labels.equity,
          type: "line",
          data: result.equity.map((point) => point.equity),
          showSymbol: false,
          smooth: true,
          lineStyle: { color: "#22c55e", width: 1.8 },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(34,197,94,.22)" },
                { offset: 1, color: "rgba(34,197,94,0)" },
              ],
            },
          },
        },
        {
          name: labels.drawdown,
          type: "line",
          yAxisIndex: 1,
          data: result.equity.map((point) => point.drawdown),
          showSymbol: false,
          lineStyle: { color: "rgba(239,83,80,.55)", width: 1 },
          areaStyle: { color: "rgba(239,83,80,.08)" },
        },
      ],
    }),
    [labels, result],
  );

  return (
    <EChart option={option} className="backtest-chart" ariaLabel={ariaLabel} />
  );
}
