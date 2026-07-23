"use client";

import { useMemo } from "react";
import type { EChartsOption, SeriesOption } from "echarts";
import type { MarketBar } from "@/lib/market/types";
import {
  atr,
  bollingerBands,
  ema,
  kdj,
  macd,
  obv,
  rsi,
  sma,
  type NumericSeries,
} from "@/lib/analysis/indicators";
import { EChart } from "./EChart";

export type IndicatorId =
  | "sma"
  | "ema"
  | "bollinger"
  | "rsi"
  | "macd"
  | "kdj"
  | "atr"
  | "obv";

interface PriceChartProps {
  bars: MarketBar[];
  chartType: "candlestick" | "line";
  indicator: IndicatorId;
  ariaLabel: string;
  labels: {
    price: string;
    close: string;
    volume: string;
    series: Record<string, string>;
  };
}

const colors = {
  up: "#22c55e",
  down: "#ef5350",
  line: "#dfe8e4",
  cyan: "#22d3ee",
  amber: "#fbbf24",
  violet: "#a78bfa",
  muted: "#64748b",
};

function lineSeries(
  name: string,
  data: NumericSeries | number[],
  color: string,
  xAxisIndex = 0,
  yAxisIndex = 0,
): SeriesOption {
  return {
    name,
    type: "line",
    data,
    xAxisIndex,
    yAxisIndex,
    showSymbol: false,
    connectNulls: false,
    smooth: false,
    lineStyle: { width: 1.5, color },
    itemStyle: { color },
    emphasis: { disabled: true },
  };
}

const compactFormatter = new Intl.NumberFormat("zh-CN", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function PriceChart({
  bars,
  chartType,
  indicator,
  ariaLabel,
  labels,
}: PriceChartProps) {
  const option = useMemo<EChartsOption>(() => {
    const times = bars.map((bar) => bar.time);
    const closes = bars.map((bar) => bar.close);
    const overlayIndicator = ["sma", "ema", "bollinger"].includes(indicator);
    const mainHeight = overlayIndicator ? 68 : 57;
    const volumeTop = overlayIndicator ? 75 : 64;
    const volumeHeight = overlayIndicator ? 14 : 10;
    const indicatorTop = 78;
    const series: SeriesOption[] = [];

    if (chartType === "candlestick") {
      series.push({
        name: labels.price,
        type: "candlestick",
        data: bars.map((bar) => [bar.open, bar.close, bar.low, bar.high]),
        itemStyle: {
          color: colors.up,
          color0: colors.down,
          borderColor: colors.up,
          borderColor0: colors.down,
        },
        emphasis: { disabled: true },
      });
    } else {
      series.push({
        ...lineSeries(labels.close, closes, colors.line),
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(34,197,94,.23)" },
              { offset: 1, color: "rgba(34,197,94,0)" },
            ],
          },
        },
      } as SeriesOption);
    }

    series.push({
      name: labels.volume,
      type: "bar",
      xAxisIndex: 1,
      yAxisIndex: 1,
      data: bars.map((bar) => ({
        value: bar.volume,
        itemStyle: {
          color:
            bar.close >= bar.open
              ? "rgba(34,197,94,.55)"
              : "rgba(239,83,80,.52)",
        },
      })),
      barMaxWidth: 8,
      emphasis: { disabled: true },
    });

    if (indicator === "sma") {
      series.push(
        lineSeries(labels.series.smaFast, sma(closes, 10), colors.cyan),
        lineSeries(labels.series.smaSlow, sma(closes, 30), colors.amber),
      );
    }
    if (indicator === "ema") {
      series.push(
        lineSeries(labels.series.emaFast, ema(closes, 12), colors.cyan),
        lineSeries(labels.series.emaSlow, ema(closes, 26), colors.violet),
      );
    }
    if (indicator === "bollinger") {
      const bands = bollingerBands(closes, 20, 2);
      series.push(
        lineSeries(labels.series.bollMiddle, bands.middle, colors.amber),
        lineSeries(labels.series.bollUpper, bands.upper, colors.cyan),
        lineSeries(labels.series.bollLower, bands.lower, colors.cyan),
      );
    }
    if (indicator === "rsi") {
      series.push(
        lineSeries(labels.series.rsi, rsi(closes, 14), colors.violet, 2, 2),
      );
    }
    if (indicator === "macd") {
      const values = macd(closes);
      series.push(
        lineSeries(labels.series.macdLine, values.line, colors.cyan, 2, 2),
        lineSeries(labels.series.macdSignal, values.signal, colors.amber, 2, 2),
        {
          name: labels.series.macdHistogram,
          type: "bar",
          data: values.histogram.map((value) => ({
            value,
            itemStyle: {
              color:
                (value ?? 0) >= 0
                  ? "rgba(34,197,94,.62)"
                  : "rgba(239,83,80,.62)",
            },
          })),
          xAxisIndex: 2,
          yAxisIndex: 2,
          barMaxWidth: 5,
        },
      );
    }
    if (indicator === "kdj") {
      const values = kdj(bars);
      series.push(
        lineSeries(labels.series.kdjK, values.k, colors.cyan, 2, 2),
        lineSeries(labels.series.kdjD, values.d, colors.amber, 2, 2),
        lineSeries(labels.series.kdjJ, values.j, colors.violet, 2, 2),
      );
    }
    if (indicator === "atr") {
      series.push(
        lineSeries(labels.series.atr, atr(bars, 14), colors.amber, 2, 2),
      );
    }
    if (indicator === "obv") {
      series.push(
        lineSeries(labels.series.obv, obv(bars), colors.cyan, 2, 2),
      );
    }

    const xAxes: EChartsOption["xAxis"] = [
      {
        type: "category",
        data: times,
        boundaryGap: true,
        axisLine: { lineStyle: { color: "#26332f" } },
        axisTick: { show: false },
        axisLabel: { show: false },
        splitLine: { show: false },
        min: "dataMin",
        max: "dataMax",
      },
      {
        type: "category",
        gridIndex: 1,
        data: times,
        boundaryGap: true,
        axisLine: { lineStyle: { color: "#26332f" } },
        axisTick: { show: false },
        axisLabel: {
          show: overlayIndicator,
          color: "#6f807a",
          fontSize: 10,
          hideOverlap: true,
        },
        splitLine: { show: false },
      },
    ];

    if (!overlayIndicator) {
      xAxes.push({
        type: "category",
        gridIndex: 2,
        data: times,
        boundaryGap: true,
        axisLine: { lineStyle: { color: "#26332f" } },
        axisTick: { show: false },
        axisLabel: {
          color: "#6f807a",
          fontSize: 10,
          hideOverlap: true,
        },
        splitLine: { show: false },
      });
    }

    const yAxes: EChartsOption["yAxis"] = [
      {
        scale: true,
        position: "right",
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: "#8ea099", fontSize: 10 },
        splitLine: { lineStyle: { color: "#1b2723", type: "dashed" } },
      },
      {
        scale: true,
        gridIndex: 1,
        position: "right",
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: "#6f807a",
          fontSize: 9,
          formatter: (value: number) => compactFormatter.format(value),
        },
        splitLine: { show: false },
      },
    ];

    if (!overlayIndicator) {
      yAxes.push({
        scale: true,
        gridIndex: 2,
        position: "right",
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: "#8ea099", fontSize: 9 },
        splitLine: { lineStyle: { color: "#1b2723", type: "dashed" } },
      });
    }

    return {
      animation: false,
      backgroundColor: "transparent",
      legend: {
        top: 0,
        left: 8,
        textStyle: { color: "#8ea099", fontSize: 10 },
        itemWidth: 12,
        itemHeight: 6,
        selectedMode: false,
      },
      axisPointer: {
        link: [{ xAxisIndex: "all" }],
        label: { backgroundColor: "#26332f" },
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross" },
        backgroundColor: "rgba(11,17,15,.96)",
        borderColor: "#33443e",
        textStyle: { color: "#dfe8e4", fontSize: 11 },
        extraCssText: "box-shadow:0 14px 38px rgba(0,0,0,.35);",
      },
      grid: overlayIndicator
        ? [
            { left: 12, right: 62, top: 30, height: `${mainHeight}%` },
            {
              left: 12,
              right: 62,
              top: `${volumeTop}%`,
              height: `${volumeHeight}%`,
            },
          ]
        : [
            { left: 12, right: 62, top: 30, height: `${mainHeight}%` },
            {
              left: 12,
              right: 62,
              top: `${volumeTop}%`,
              height: `${volumeHeight}%`,
            },
            {
              left: 12,
              right: 62,
              top: `${indicatorTop}%`,
              height: "14%",
            },
          ],
      xAxis: xAxes,
      yAxis: yAxes,
      dataZoom: [
        {
          type: "inside",
          xAxisIndex: overlayIndicator ? [0, 1] : [0, 1, 2],
          start: Math.max(0, 100 - (120 / Math.max(bars.length, 120)) * 100),
          end: 100,
        },
        {
          type: "slider",
          xAxisIndex: overlayIndicator ? [0, 1] : [0, 1, 2],
          bottom: 0,
          height: 14,
          borderColor: "transparent",
          backgroundColor: "#101916",
          fillerColor: "rgba(34,197,94,.12)",
          handleStyle: { color: "#22c55e" },
          textStyle: { color: "#6f807a" },
          showDetail: false,
        },
      ],
      series,
    };
  }, [bars, chartType, indicator, labels]);

  return <EChart option={option} className="price-chart" ariaLabel={ariaLabel} />;
}
