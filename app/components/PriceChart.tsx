"use client";

import { useMemo } from "react";
import type {
  EChartsOption,
  GridComponentOption,
  LegendComponentOption,
  SeriesOption,
  XAxisComponentOption,
  YAxisComponentOption,
} from "echarts";
import type { MarketBar } from "@/lib/market/types";
import type { BacktestTrade } from "@/lib/analysis/backtest";
import {
  buildTradeMarkers,
  type TradeMarkers,
} from "@/lib/analysis/trade-markers";
import {
  buildStrategyPriceLines,
  type StrategyPriceLine,
  type StrategyPriceLineRole,
} from "@/lib/analysis/strategy-visuals";
import type {
  StrategyId,
  StrategyParameters,
} from "@/lib/analysis/strategies";
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
import {
  getDefaultIndicatorParameters,
  getIndicator,
  type IndicatorId,
  type IndicatorParameters,
} from "@/lib/analysis/indicator-registry";
import { EChart } from "./EChart";

export type { IndicatorId } from "@/lib/analysis/indicator-registry";

export interface ChartIndicatorConfiguration {
  id: IndicatorId;
  parameters: IndicatorParameters;
}

export interface StrategyLineLabels {
  prefix: string;
  roles: Record<StrategyPriceLineRole, string>;
}

export interface ChartStrategyConfiguration {
  id: StrategyId;
  parameters: StrategyParameters;
  lineLabels: StrategyLineLabels;
}

interface PriceChartProps {
  bars: MarketBar[];
  trades?: BacktestTrade[];
  tradeMarkers?: TradeMarkers;
  dataKey: string;
  chartType: "candlestick" | "line";
  visibleIndicators?: readonly ChartIndicatorConfiguration[];
  indicator?: IndicatorId;
  indicatorParameters?: IndicatorParameters;
  strategyId?: StrategyId;
  strategyParameters?: StrategyParameters;
  strategyLineLabels?: StrategyLineLabels;
  strategyConfigurations?: readonly ChartStrategyConfiguration[];
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

const strategyRoleColors: Record<StrategyPriceLineRole, string> = {
  entry: "#22c55e",
  exit: "#ef5350",
  fast: "#22d3ee",
  slow: "#fbbf24",
  middle: "#a78bfa",
  upper: "#38bdf8",
  lower: "#fb923c",
  trend: "#34d399",
  conversion: "#06b6d4",
  base: "#f59e0b",
  "span-a": "#2dd4bf",
  "span-b": "#f472b6",
  reference: "#94a3b8",
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
  return buildTradeMarkerSeriesFromMarkers(tradeMarkers, labels);
}

export function buildTradeMarkerSeriesFromMarkers(
  tradeMarkers: TradeMarkers,
  labels: TradeMarkerLabels,
): SeriesOption[] {
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

export function buildIndicatorSeries(
  bars: MarketBar[],
  indicator: IndicatorId,
  inputParameters: IndicatorParameters,
  labels: Record<string, string>,
  xAxisIndex: number,
  yAxisIndex: number,
): SeriesOption[] {
  const parameters = {
    ...getDefaultIndicatorParameters(indicator),
    ...inputParameters,
  };
  const closes = bars.map((bar) => bar.close);
  const indicatorLine = (
    name: string,
    data: NumericSeries | number[],
    color: string,
  ) => lineSeries(name, data, color, xAxisIndex, yAxisIndex);
  const configuredName = (
    name: string,
    ...values: number[]
  ) => `${name} (${values.join("/")})`;

  if (indicator === "sma") {
    return [
      indicatorLine(
        configuredName(labels.smaFast, parameters.fast),
        sma(closes, parameters.fast),
        colors.cyan,
      ),
      indicatorLine(
        configuredName(labels.smaSlow, parameters.slow),
        sma(closes, parameters.slow),
        colors.amber,
      ),
    ];
  }
  if (indicator === "ema") {
    return [
      indicatorLine(
        configuredName(labels.emaFast, parameters.fast),
        ema(closes, parameters.fast),
        colors.cyan,
      ),
      indicatorLine(
        configuredName(labels.emaSlow, parameters.slow),
        ema(closes, parameters.slow),
        colors.violet,
      ),
    ];
  }
  if (indicator === "wma") {
    return [
      indicatorLine(
        configuredName(labels.wmaFast, parameters.fast),
        wma(closes, parameters.fast),
        colors.cyan,
      ),
      indicatorLine(
        configuredName(labels.wmaSlow, parameters.slow),
        wma(closes, parameters.slow),
        colors.amber,
      ),
    ];
  }
  if (indicator === "dema") {
    return [
      indicatorLine(
        configuredName(labels.demaFast, parameters.fast),
        dema(closes, parameters.fast),
        colors.cyan,
      ),
      indicatorLine(
        configuredName(labels.demaSlow, parameters.slow),
        dema(closes, parameters.slow),
        colors.violet,
      ),
    ];
  }
  if (indicator === "bollinger") {
    const bands = bollingerBands(
      closes,
      parameters.period,
      parameters.width,
    );
    const configuredLabels = {
      middle: configuredName(
        labels.bollMiddle,
        parameters.period,
        parameters.width,
      ),
      upper: configuredName(
        labels.bollUpper,
        parameters.period,
        parameters.width,
      ),
      lower: configuredName(
        labels.bollLower,
        parameters.period,
        parameters.width,
      ),
    };
    return [
      indicatorLine(configuredLabels.middle, bands.middle, colors.amber),
      indicatorLine(configuredLabels.upper, bands.upper, colors.cyan),
      indicatorLine(configuredLabels.lower, bands.lower, colors.cyan),
    ];
  }
  if (indicator === "vwap") {
    return [indicatorLine(labels.vwap, vwap(bars), colors.amber)];
  }
  if (indicator === "supertrend") {
    const values = supertrend(
      bars,
      parameters.period,
      parameters.multiplier,
    );
    return [
      indicatorLine(
        configuredName(
          labels.supertrend,
          parameters.period,
          parameters.multiplier,
        ),
        values.trend,
        colors.up,
      ),
    ];
  }
  if (indicator === "ichimoku") {
    const values = ichimoku(
      bars,
      parameters.conversionPeriod,
      parameters.basePeriod,
      parameters.spanPeriod,
    );
    const ichimokuName = (name: string) =>
      configuredName(
        name,
        parameters.conversionPeriod,
        parameters.basePeriod,
        parameters.spanPeriod,
      );
    return [
      indicatorLine(
        ichimokuName(labels.ichimokuConversion),
        values.conversion,
        colors.cyan,
      ),
      indicatorLine(
        ichimokuName(labels.ichimokuBase),
        values.base,
        colors.amber,
      ),
      indicatorLine(
        ichimokuName(labels.ichimokuSpanA),
        values.spanA,
        colors.up,
      ),
      indicatorLine(
        ichimokuName(labels.ichimokuSpanB),
        values.spanB,
        colors.down,
      ),
    ];
  }
  if (indicator === "rsi") {
    return [
      indicatorLine(
        configuredName(labels.rsi, parameters.period),
        rsi(closes, parameters.period),
        colors.violet,
      ),
    ];
  }
  if (indicator === "macd") {
    const values = macd(
      closes,
      parameters.fast,
      parameters.slow,
      parameters.signal,
    );
    const macdName = (name: string) =>
      configuredName(
        name,
        parameters.fast,
        parameters.slow,
        parameters.signal,
      );
    return [
      indicatorLine(macdName(labels.macdLine), values.line, colors.cyan),
      indicatorLine(
        macdName(labels.macdSignal),
        values.signal,
        colors.amber,
      ),
      {
        name: macdName(labels.macdHistogram),
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
        xAxisIndex,
        yAxisIndex,
        barMaxWidth: 5,
      },
    ];
  }
  if (indicator === "kdj") {
    const values = kdj(bars, parameters.period);
    return [
      indicatorLine(
        configuredName(labels.kdjK, parameters.period),
        values.k,
        colors.cyan,
      ),
      indicatorLine(
        configuredName(labels.kdjD, parameters.period),
        values.d,
        colors.amber,
      ),
      indicatorLine(
        configuredName(labels.kdjJ, parameters.period),
        values.j,
        colors.violet,
      ),
    ];
  }
  if (indicator === "stochasticRsi") {
    const values = stochasticRsi(
      closes,
      parameters.rsiPeriod,
      parameters.stochasticPeriod,
      parameters.smoothPeriod,
    );
    const stochasticRsiName = (name: string) =>
      configuredName(
        name,
        parameters.rsiPeriod,
        parameters.stochasticPeriod,
        parameters.smoothPeriod,
      );
    return [
      indicatorLine(
        stochasticRsiName(labels.stochRsiK),
        values.k,
        colors.cyan,
      ),
      indicatorLine(
        stochasticRsiName(labels.stochRsiD),
        values.d,
        colors.amber,
      ),
    ];
  }
  if (indicator === "cci") {
    return [
      indicatorLine(
        configuredName(labels.cci, parameters.period),
        cci(bars, parameters.period),
        colors.violet,
      ),
    ];
  }
  if (indicator === "williamsR") {
    return [
      indicatorLine(
        configuredName(labels.williamsR, parameters.period),
        williamsR(bars, parameters.period),
        colors.cyan,
      ),
    ];
  }
  if (indicator === "adx") {
    const values = adx(bars, parameters.period);
    return [
      indicatorLine(
        configuredName(labels.adx, parameters.period),
        values.adx,
        colors.violet,
      ),
      indicatorLine(
        configuredName(labels.plusDi, parameters.period),
        values.plusDi,
        colors.up,
      ),
      indicatorLine(
        configuredName(labels.minusDi, parameters.period),
        values.minusDi,
        colors.down,
      ),
    ];
  }
  if (indicator === "roc") {
    return [
      indicatorLine(
        configuredName(labels.roc, parameters.period),
        roc(closes, parameters.period),
        colors.amber,
      ),
    ];
  }
  if (indicator === "mfi") {
    return [
      indicatorLine(
        configuredName(labels.mfi, parameters.period),
        mfi(bars, parameters.period),
        colors.violet,
      ),
    ];
  }
  if (indicator === "cmf") {
    return [
      indicatorLine(
        configuredName(labels.cmf, parameters.period),
        cmf(bars, parameters.period),
        colors.cyan,
      ),
    ];
  }
  if (indicator === "atr") {
    return [
      indicatorLine(
        configuredName(labels.atr, parameters.period),
        atr(bars, parameters.period),
        colors.amber,
      ),
    ];
  }
  if (indicator === "obv") {
    return [indicatorLine(labels.obv, obv(bars), colors.cyan)];
  }
  return [];
}

export function buildStrategyLineSeries(
  lines: StrategyPriceLine[],
  labels: StrategyLineLabels,
): SeriesOption[] {
  return lines.map((line) => {
    const color = strategyRoleColors[line.role];
    return {
      name: `${labels.prefix} · ${labels.roles[line.role]}`,
      type: "line",
      data: line.data,
      xAxisIndex: 0,
      yAxisIndex: 0,
      showSymbol: false,
      connectNulls: false,
      smooth: false,
      lineStyle: {
        width: 2.25,
        type: "dashed",
        color,
      },
      itemStyle: { color },
      emphasis: { disabled: true },
      z: 8,
    };
  });
}

const baseChartHeight = 544;
const paneChartHeight = 150;
const legendTop = 4;
const priceGridTop = 54;

export function buildPriceChartLegend(): LegendComponentOption {
  return {
    type: "scroll",
    top: legendTop,
    left: 8,
    right: 8,
    textStyle: { color: "#8ea099", fontSize: 10 },
    itemWidth: 12,
    itemHeight: 6,
    pageIconColor: "#22c55e",
    pageIconInactiveColor: "#42534d",
    pageTextStyle: { color: "#8ea099", fontSize: 9 },
    selectedMode: false,
  };
}

export function buildPriceChartLayout(
  times: string[],
  paneCount: number,
) {
  const normalizedPaneCount = Math.max(0, Math.floor(paneCount));
  const grids: GridComponentOption[] = [
    { left: 12, right: 62, top: priceGridTop, height: 335 },
    { left: 12, right: 62, top: 399, height: 90 },
  ];

  for (let index = 0; index < normalizedPaneCount; index += 1) {
    grids.push({
      left: 12,
      right: 62,
      top: 504 + index * paneChartHeight,
      height: 135,
    });
  }

  const finalAxisIndex = grids.length - 1;
  const xAxes: XAxisComponentOption[] = grids.map((_, gridIndex) => ({
    type: "category",
    gridIndex,
    data: times,
    boundaryGap: true,
    axisLine: { lineStyle: { color: "#26332f" } },
    axisTick: { show: false },
    axisLabel: {
      show: gridIndex === finalAxisIndex,
      color: "#6f807a",
      fontSize: 10,
      hideOverlap: true,
    },
    splitLine: { show: false },
    ...(gridIndex === 0
      ? {
          min: "dataMin" as const,
          max: "dataMax" as const,
        }
      : {}),
  }));
  const yAxes: YAxisComponentOption[] = grids.map((_, gridIndex) => {
    if (gridIndex === 1) {
      return {
        scale: true,
        gridIndex,
        position: "right",
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: "#6f807a",
          fontSize: 9,
          formatter: (value: number) => compactFormatter.format(value),
        },
        splitLine: { show: false },
      };
    }
    return {
      scale: true,
      gridIndex,
      position: "right",
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: "#8ea099",
        fontSize: gridIndex === 0 ? 10 : 9,
      },
      splitLine: {
        lineStyle: { color: "#1b2723", type: "dashed" },
      },
    };
  });

  return {
    height: baseChartHeight + normalizedPaneCount * paneChartHeight,
    grids,
    xAxes,
    yAxes,
    xAxisIndexes: grids.map((_, index) => index),
  };
}

export function buildPriceDataZoom(
  barsLength: number,
  xAxisIndexes: number[],
): EChartsOption["dataZoom"] {
  const start = Math.max(
    0,
    100 - (120 / Math.max(barsLength, 120)) * 100,
  );

  return [
    {
      id: "price-zoom-inside",
      type: "inside",
      xAxisIndex: xAxisIndexes,
      start,
      end: 100,
      zoomLock: false,
    },
    {
      id: "price-zoom-slider",
      type: "slider",
      xAxisIndex: xAxisIndexes,
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
  trades = [],
  tradeMarkers,
  dataKey,
  chartType,
  visibleIndicators,
  indicator,
  indicatorParameters,
  strategyId,
  strategyParameters,
  strategyLineLabels,
  strategyConfigurations,
  ariaLabel,
  labels,
}: PriceChartProps) {
  const chartIndicators = useMemo<readonly ChartIndicatorConfiguration[]>(
    () => {
      if (visibleIndicators !== undefined) return visibleIndicators;
      if (!indicator) return [];
      return [
        {
          id: indicator,
          parameters: indicatorParameters ?? {},
        },
      ];
    },
    [indicator, indicatorParameters, visibleIndicators],
  );

  const chart = useMemo(() => {
    const times = bars.map((bar) => bar.time);
    const closes = bars.map((bar) => bar.close);
    const paneCount = chartIndicators.filter(
      (configuredIndicator) =>
        getIndicator(configuredIndicator.id).placement === "pane",
    ).length;
    const layout = buildPriceChartLayout(times, paneCount);
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

    series.push(
      ...buildTradeMarkerSeriesFromMarkers(
        tradeMarkers ?? buildTradeMarkers(trades),
        labels,
      ),
    );

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

    let nextPaneAxisIndex = 2;
    for (const configuredIndicator of chartIndicators) {
      const overlay =
        getIndicator(configuredIndicator.id).placement === "overlay";
      const targetAxisIndex = overlay ? 0 : nextPaneAxisIndex++;
      series.push(
        ...buildIndicatorSeries(
          bars,
          configuredIndicator.id,
          configuredIndicator.parameters,
          labels.series,
          targetAxisIndex,
          targetAxisIndex,
        ),
      );
    }

    const configuredStrategies =
      strategyConfigurations ??
      (strategyId && strategyLineLabels
        ? [
            {
              id: strategyId,
              parameters: strategyParameters ?? {},
              lineLabels: strategyLineLabels,
            },
          ]
        : []);
    for (const configuredStrategy of configuredStrategies) {
      series.push(
        ...buildStrategyLineSeries(
          buildStrategyPriceLines(
            bars,
            configuredStrategy.id,
            configuredStrategy.parameters,
          ),
          configuredStrategy.lineLabels,
        ),
      );
    }

    const option: EChartsOption = {
      animation: false,
      backgroundColor: "transparent",
      legend: buildPriceChartLegend(),
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
      grid: layout.grids,
      xAxis: layout.xAxes,
      yAxis: layout.yAxes,
      dataZoom: buildPriceDataZoom(
        bars.length,
        layout.xAxisIndexes,
      ),
      series,
    };
    return { option, height: layout.height };
  }, [
    bars,
    chartIndicators,
    chartType,
    labels,
    strategyId,
    strategyConfigurations,
    strategyLineLabels,
    strategyParameters,
    tradeMarkers,
    trades,
  ]);

  return (
    <EChart
      option={chart.option}
      className="price-chart"
      height={chart.height}
      ariaLabel={ariaLabel}
      preserveDataZoom
      dataZoomResetKey={dataKey}
    />
  );
}
