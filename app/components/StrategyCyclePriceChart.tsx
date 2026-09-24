"use client";

import { useMemo } from "react";
import type { EChartsOption, SeriesOption } from "echarts";
import type {
  StrategyCycleEventDetail,
  StrategyCycleEventValidationResult,
} from "@/lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "@/lib/market/types";
import { EChart } from "./EChart";

export interface StrategyCyclePriceChartLabels {
  price: string;
  matched: string;
  opposite: string;
  missed: string;
  extra: string;
  candidateDate: string;
  referenceDate: string;
  targetAllocation: string;
  timingError: string;
  sessionUnit: string;
}

interface MarkerPoint {
  value: [string, number];
  event: StrategyCycleEventDetail;
  symbol: "triangle";
  symbolRotate: number;
  symbolOffset: [number, number];
}

function formatAllocation(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function eventTooltip(
  event: StrategyCycleEventDetail,
  title: string,
  labels: StrategyCyclePriceChartLabels,
): string {
  const rows = [`<strong>${title}</strong>`];
  if (event.candidate) {
    rows.push(`${labels.candidateDate}: ${event.candidate.time}`);
    rows.push(`${labels.targetAllocation}: ${formatAllocation(event.candidate.targetAllocation)}`);
  }
  if (event.reference) {
    rows.push(`${labels.referenceDate}: ${event.reference.time}`);
    rows.push(`${labels.targetAllocation}: ${formatAllocation(event.reference.targetAllocation)}`);
  }
  if (event.timingErrorSessions !== null) {
    const signed = event.timingErrorSessions > 0 ? "+" : "";
    rows.push(`${labels.timingError}: ${signed}${event.timingErrorSessions} ${labels.sessionUnit}`);
  }
  return rows.join("<br/>");
}

function markerPrice(
  bar: MarketBar,
  fromAllocation: number,
  targetAllocation: number,
): number {
  return targetAllocation > fromAllocation ? bar.low : bar.high;
}

function eventPoint(
  event: StrategyCycleEventDetail,
  bar: MarketBar,
  time: string,
  fromAllocation: number,
  targetAllocation: number,
): MarkerPoint {
  const increasesAllocation = targetAllocation > fromAllocation;
  return {
    value: [time, markerPrice(bar, fromAllocation, targetAllocation)],
    event,
    symbol: "triangle",
    symbolRotate: increasesAllocation ? 0 : 180,
    symbolOffset: increasesAllocation ? [0, 15] : [0, -15],
  };
}

function markerSeries(
  name: string,
  points: MarkerPoint[],
  labels: StrategyCyclePriceChartLabels,
  color: string,
): SeriesOption {
  return {
    name,
    type: "scatter",
    data: points,
    symbol: "triangle",
    symbolSize: 14,
    clip: false,
    itemStyle: { color, borderColor: "#07100d", borderWidth: 1.5 },
    emphasis: { scale: 1.35 },
    tooltip: {
      formatter: (params: unknown) => {
        const dataIndex = Number((params as { dataIndex?: number }).dataIndex ?? -1);
        const event = points[dataIndex]?.event;
        return event ? eventTooltip(event, name, labels) : name;
      },
    },
    z: 12,
  };
}

export function buildStrategyCyclePriceChartOption(
  bars: readonly MarketBar[],
  result: StrategyCycleEventValidationResult,
  labels: StrategyCyclePriceChartLabels,
): EChartsOption {
  const visibleBars = bars.filter((bar) =>
    bar.time >= result.evaluationStartTime && bar.time <= result.evaluationEndTime);
  const chartBars = visibleBars.length ? visibleBars : [...bars];
  const barByTime = new Map(chartBars.map((bar) => [bar.time, bar]));
  const matchedPoints: MarkerPoint[] = [];
  const oppositePoints: MarkerPoint[] = [];
  const missedPoints: MarkerPoint[] = [];
  const extraPoints: MarkerPoint[] = [];

  for (const event of result.events) {
    if (event.status === "missed" && event.reference) {
      const bar = barByTime.get(event.reference.time);
      if (bar) {
        missedPoints.push(eventPoint(
          event,
          bar,
          event.reference.time,
          event.reference.fromAllocation,
          event.reference.targetAllocation,
        ));
      }
    }
    if (event.candidate) {
      const bar = barByTime.get(event.candidate.time);
      if (!bar) continue;
      const point = eventPoint(
        event,
        bar,
        event.candidate.time,
        event.candidate.fromAllocation,
        event.candidate.targetAllocation,
      );
      if (event.status === "matched") matchedPoints.push(point);
      if (event.status === "opposite") oppositePoints.push(point);
      if (event.status === "extra") extraPoints.push(point);
    }
  }

  return {
    animation: false,
    backgroundColor: "transparent",
    legend: {
      top: 4,
      textStyle: { color: "#93a49e", fontSize: 10 },
      itemWidth: 12,
      itemHeight: 8,
    },
    tooltip: {
      trigger: "item",
      backgroundColor: "rgba(11,17,15,.96)",
      borderColor: "#33443e",
      textStyle: { color: "#dfe8e4", fontSize: 11 },
    },
    grid: { left: 12, right: 58, top: 46, bottom: 58, containLabel: true },
    xAxis: {
      type: "category",
      data: chartBars.map((bar) => bar.time),
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
      { type: "inside", id: "cycle-price-zoom-inside", start: 0, end: 100 },
      {
        type: "slider",
        id: "cycle-price-zoom-slider",
        start: 0,
        end: 100,
        height: 18,
        bottom: 9,
        borderColor: "#26332f",
        fillerColor: "rgba(34,197,94,.12)",
        backgroundColor: "#0d1613",
        textStyle: { color: "#6f807a", fontSize: 9 },
      },
    ],
    series: [
      {
        name: labels.price,
        type: "candlestick",
        data: chartBars.map((bar) => [bar.open, bar.close, bar.low, bar.high]),
        itemStyle: {
          color: "#22c55e",
          color0: "#ef5350",
          borderColor: "#22c55e",
          borderColor0: "#ef5350",
        },
        emphasis: { disabled: true },
        z: 2,
      },
      markerSeries(labels.matched, matchedPoints, labels, "#38bdf8"),
      markerSeries(labels.opposite, oppositePoints, labels, "#e879f9"),
      markerSeries(labels.missed, missedPoints, labels, "#ef5350"),
      markerSeries(labels.extra, extraPoints, labels, "#f59e0b"),
    ],
  };
}

interface StrategyCyclePriceChartProps {
  bars: readonly MarketBar[];
  result: StrategyCycleEventValidationResult;
  labels: StrategyCyclePriceChartLabels;
  ariaLabel: string;
  dataKey: string;
}

export function StrategyCyclePriceChart({
  bars,
  result,
  labels,
  ariaLabel,
  dataKey,
}: StrategyCyclePriceChartProps) {
  const option = useMemo(
    () => buildStrategyCyclePriceChartOption(bars, result, labels),
    [bars, labels, result],
  );
  return (
    <EChart
      option={option}
      className="cycle-price-chart"
      height={430}
      ariaLabel={ariaLabel}
      preserveDataZoom
      dataZoomResetKey={dataKey}
      horizontalPanDataZoomIds={["cycle-price-zoom-inside", "cycle-price-zoom-slider"]}
    />
  );
}
