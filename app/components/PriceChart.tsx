"use client";

import { useMemo } from "react";
import type { EChartsOption, SeriesOption } from "echarts";
import type { MarketBar } from "@/lib/market/types";
import type { BacktestTrade } from "@/lib/analysis/backtest";
import { buildTradeMarkers } from "@/lib/analysis/trade-markers";
import {
  adx,
  atr,
  bollingerBands,
  cci,
  cmf,
  dema,
  ema,
  ichimoku,
  kdj,
  macd,
  mfi,
  obv,
  roc,
  rsi,
  sma,
  stochasticRsi,
  supertrend,
  type NumericSeries,
  vwap,
  williamsR,
  wma,
} from "@/lib/analysis/indicators";
import { EChart } from "./EChart";

export type IndicatorId =
  | "sma"
  | "ema"
  | "wma"
  | "dema"
  | "bollinger"
  | "vwap"
  | "supertrend"
  | "ichimoku"
  | "rsi"
  | "macd"
  | "kdj"
  | "stochasticRsi"
  | "cci"
  | "williamsR"
  | "adx"
  | "roc"
  | "mfi"
  | "cmf"
  | "atr"
  | "obv";

interface PriceChartProps {
  bars: MarketBar[];
  trades: BacktestTrade[];
  dataKey: string;
  chartType: "candlestick" | "line";
  indicator: IndicatorId;
  ariaLabel: string;
  labels: {
    price: string;
    close: string;
    volume: string;
    buy: string;
    sell: string;
    rangeExit: string;
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
  tradeBuy: "#38bdf8",
  tradeBuyText: "#e0f2fe",
  tradeSell: "#fb923c",
  tradeSellText: "#ffedd5",
  tradeLabelBackground: "rgba(7, 15, 22, 0.82)",
  rangeExit: "#94a3b8",
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

interface TradeMarkerLabels {
  buy: string;
  sell: string;
  rangeExit: string;
}

export function buildTradeMarkerSeries(
  trades: BacktestTrade[],
  labels: TradeMarkerLabels,
): SeriesOption[] {
  const tradeMarkers = buildTradeMarkers(trades);

  return [
    {
      name: labels.buy,
      type: "scatter",
      data: tradeMarkers.buys.map((marker) => ({
        value: [marker.time, marker.price],
      })),
      symbol: "triangle",
      symbolSize: 14,
      symbolOffset: [0, 8],
      itemStyle: {
        color: colors.tradeBuy,
        borderColor: colors.tradeBuyText,
        borderWidth: 1.5,
      },
      label: {
        show: true,
        formatter: labels.buy,
        position: "bottom",
        distance: 3,
        color: colors.tradeBuyText,
        backgroundColor: colors.tradeLabelBackground,
        borderRadius: 3,
        padding: [2, 4],
        fontSize: 9,
        fontWeight: 700,
      },
      z: 20,
    },
    {
      name: labels.sell,
      type: "scatter",
      data: tradeMarkers.sells.map((marker) => ({
        value: [marker.time, marker.price],
      })),
      symbol: "triangle",
      symbolRotate: 180,
      symbolSize: 14,
      symbolOffset: [0, -8],
      itemStyle: {
        color: colors.tradeSell,
        borderColor: colors.tradeSellText,
        borderWidth: 1.5,
      },
      label: {
        show: true,
        formatter: labels.sell,
        position: "top",
        distance: 3,
        color: colors.tradeSellText,
        backgroundColor: colors.tradeLabelBackground,
        borderRadius: 3,
        padding: [2, 4],
        fontSize: 9,
        fontWeight: 700,
      },
      z: 20,
    },
    {
      name: labels.rangeExit,
      type: "scatter",
      data: tradeMarkers.rangeExits.map((marker) => ({
        value: [marker.time, marker.price],
      })),
      symbol: "diamond",
      symbolSize: 10,
      symbolOffset: [0, -7],
      itemStyle: {
        color: colors.rangeExit,
        borderColor: "#e2e8f0",
        borderWidth: 1,
      },
      label: {
        show: true,
        formatter: labels.rangeExit,
        position: "top",
        distance: 3,
        color: colors.rangeExit,
        fontSize: 8,
        fontWeight: 650,
      },
      z: 19,
    },
  ];
}

export function buildPriceDataZoom(
  barsLength: number,
  overlayIndicator: boolean,
): EChartsOption["dataZoom"] {
  const xAxisIndex = overlayIndicator ? [0, 1] : [0, 1, 2];
  const start = Math.max(
    0,
    100 - (120 / Math.max(barsLength, 120)) * 100,
  );

  return [
    {
      id: "price-zoom-inside",
      type: "inside",
      xAxisIndex,
      start,
      end: 100,
      zoomLock: false,
    },
    {
      id: "price-zoom-slider",
      type: "slider",
      xAxisIndex,
      start,
      end: 100,
      bottom: 2,
      height: 22,
      borderColor: "#263a32",
      borderRadius: 5,
      backgroundColor: "#101916",
      fillerColor: "rgba(34,197,94,.2)",
      handleSize: "125%",
      handleStyle: {
        color: "#22c55e",
        borderColor: "#d9ffe5",
        borderWidth: 1,
      },
      emphasis: {
        handleStyle: {
          color: "#34d870",
          borderColor: "#ffffff",
        },
      },
      textStyle: { color: "#6f807a" },
      showDetail: false,
      showDataShadow: true,
      brushSelect: false,
      realtime: true,
      zoomLock: false,
    },
  ];
}

export function PriceChart({
  bars,
  trades,
  dataKey,
  chartType,
  indicator,
  ariaLabel,
  labels,
}: PriceChartProps) {
  const option = useMemo<EChartsOption>(() => {
    const times = bars.map((bar) => bar.time);
    const closes = bars.map((bar) => bar.close);
    const overlayIndicator = [
      "sma",
      "ema",
      "wma",
      "dema",
      "bollinger",
      "vwap",
      "supertrend",
      "ichimoku",
    ].includes(indicator);
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

    series.push(...buildTradeMarkerSeries(trades, labels));

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
    if (indicator === "wma") {
      series.push(
        lineSeries(labels.series.wmaFast, wma(closes, 20), colors.cyan),
        lineSeries(labels.series.wmaSlow, wma(closes, 50), colors.amber),
      );
    }
    if (indicator === "dema") {
      series.push(
        lineSeries(labels.series.demaFast, dema(closes, 20), colors.cyan),
        lineSeries(labels.series.demaSlow, dema(closes, 50), colors.violet),
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
    if (indicator === "vwap") {
      series.push(
        lineSeries(labels.series.vwap, vwap(bars), colors.amber),
      );
    }
    if (indicator === "supertrend") {
      const values = supertrend(bars, 10, 3);
      series.push(
        lineSeries(
          labels.series.supertrend,
          values.trend,
          colors.up,
        ),
      );
    }
    if (indicator === "ichimoku") {
      const values = ichimoku(bars);
      series.push(
        lineSeries(
          labels.series.ichimokuConversion,
          values.conversion,
          colors.cyan,
        ),
        lineSeries(labels.series.ichimokuBase, values.base, colors.amber),
        lineSeries(labels.series.ichimokuSpanA, values.spanA, colors.up),
        lineSeries(labels.series.ichimokuSpanB, values.spanB, colors.down),
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
    if (indicator === "stochasticRsi") {
      const values = stochasticRsi(closes);
      series.push(
        lineSeries(labels.series.stochRsiK, values.k, colors.cyan, 2, 2),
        lineSeries(labels.series.stochRsiD, values.d, colors.amber, 2, 2),
      );
    }
    if (indicator === "cci") {
      series.push(
        lineSeries(labels.series.cci, cci(bars), colors.violet, 2, 2),
      );
    }
    if (indicator === "williamsR") {
      series.push(
        lineSeries(
          labels.series.williamsR,
          williamsR(bars),
          colors.cyan,
          2,
          2,
        ),
      );
    }
    if (indicator === "adx") {
      const values = adx(bars);
      series.push(
        lineSeries(labels.series.adx, values.adx, colors.violet, 2, 2),
        lineSeries(labels.series.plusDi, values.plusDi, colors.up, 2, 2),
        lineSeries(labels.series.minusDi, values.minusDi, colors.down, 2, 2),
      );
    }
    if (indicator === "roc") {
      series.push(
        lineSeries(labels.series.roc, roc(closes), colors.amber, 2, 2),
      );
    }
    if (indicator === "mfi") {
      series.push(
        lineSeries(labels.series.mfi, mfi(bars), colors.violet, 2, 2),
      );
    }
    if (indicator === "cmf") {
      series.push(
        lineSeries(labels.series.cmf, cmf(bars), colors.cyan, 2, 2),
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
      dataZoom: buildPriceDataZoom(bars.length, overlayIndicator),
      series,
    };
  }, [bars, chartType, indicator, labels, trades]);

  return (
    <EChart
      option={option}
      className="price-chart"
      ariaLabel={ariaLabel}
      preserveDataZoom
      dataZoomResetKey={dataKey}
    />
  );
}
