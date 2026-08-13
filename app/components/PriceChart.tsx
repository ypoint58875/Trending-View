"use client";

import { useCallback, useMemo, useState } from "react";
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
  type TradeMarker,
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
  supportResistanceBreaks,
  supertrend,
  type NumericSeries,
  vwap,
  williamsR,
  wma,
} from "@/lib/analysis/indicators";
import {
  adaptiveRegressionBreakout,
  autoAtrTrendTracker,
  fractionalEmaKalman,
  nadarayaWatsonTrend,
  rsiDivergenceEngine,
  squeezeMomentum,
  supportResistanceSignals,
  trendlineBreaks,
  waveTrend,
} from "@/lib/analysis/community/indicators";
import {
  getDefaultIndicatorParameters,
  getIndicator,
  type IndicatorConfiguration,
  type IndicatorId,
  type IndicatorParameters,
} from "@/lib/analysis/indicator-registry";
import { EChart, type DataZoomWindow } from "./EChart";

export type { IndicatorId } from "@/lib/analysis/indicator-registry";

export type ChartIndicatorConfiguration = IndicatorConfiguration;

export interface StrategyLineLabels {
  prefix: string;
  roles: Record<StrategyPriceLineRole, string>;
  actionRoles?: Partial<Record<"entry" | "exit", string>>;
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
    openPosition: string;
    closePosition: string;
    shortBuy: string;
    shortSell: string;
    rangeExit: string;
    series: Record<string, string>;
  };
}

const colors = {
  up: "#22c55e",
  down: "#ef5350",
  supportLevel: "#233dee",
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
    tooltip: { valueFormatter: formatPriceChartTooltipValue },
  };
}

function breakLineAtValueChanges(data: NumericSeries): NumericSeries {
  return data.map((value, index) => {
    const previousValue = data[index - 1];
    return value !== null && previousValue !== null && value !== previousValue
      ? null
      : value;
  });
}

const compactFormatter = new Intl.NumberFormat("zh-CN", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const tooltipNumberFormatter = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatPriceChartTooltipValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(formatPriceChartTooltipValue).join(" / ");
  }
  if (value === null || value === undefined || value === "") return "—";
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? tooltipNumberFormatter.format(numericValue)
    : "—";
}

function formatVolumeTooltipValue(value: unknown): string {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? compactFormatter.format(numericValue)
    : "—";
}

interface TradeMarkerLabels {
  openPosition: string;
  closePosition: string;
  rangeExit: string;
  shortBuy: string;
  shortSell: string;
}

function allocationMarkerLabel(
  marker: TradeMarker,
  labels: TradeMarkerLabels,
  fallback: string,
): string {
  const actionLabels = {
    open: labels.openPosition,
    "short-buy": labels.shortBuy,
    "short-sell": labels.shortSell,
    close: labels.closePosition,
  } as const;
  return marker.action ? actionLabels[marker.action] : fallback;
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
  bars: readonly MarketBar[] = [],
): SeriesOption[] {
  const barByTime = new Map(bars.map((bar) => [bar.time, bar]));
  return [
    {
      name: labels.openPosition,
      type: "scatter",
      data: tradeMarkers.buys.map((marker) => {
        const label = allocationMarkerLabel(
          marker,
          labels,
          labels.openPosition,
        );
        const bar = barByTime.get(marker.time);
        return {
          name: label,
          value: [marker.time, bar?.low ?? marker.price],
          tradePrice: marker.price,
          label: { formatter: label },
        };
      }),
      symbol: "triangle",
      symbolSize: 14,
      symbolOffset: [0, 16],
      silent: true,
      clip: false,
      tooltip: { show: false },
      itemStyle: {
        color: colors.tradeBuy,
        borderColor: colors.tradeBuyText,
        borderWidth: 1.5,
      },
      label: {
        show: true,
        formatter: labels.openPosition,
        position: "bottom",
        distance: 3,
        color: colors.tradeBuyText,
        backgroundColor: colors.tradeLabelBackground,
        borderRadius: 3,
        padding: [2, 4],
        fontSize: 10,
        fontWeight: 700,
      },
      z: 20,
    },
    {
      name: labels.closePosition,
      type: "scatter",
      data: tradeMarkers.sells.map((marker) => {
        const label = allocationMarkerLabel(
          marker,
          labels,
          labels.closePosition,
        );
        const bar = barByTime.get(marker.time);
        return {
          name: label,
          value: [marker.time, bar?.high ?? marker.price],
          tradePrice: marker.price,
          label: { formatter: label },
        };
      }),
      symbol: "triangle",
      symbolRotate: 180,
      symbolSize: 14,
      symbolOffset: [0, -16],
      silent: true,
      clip: false,
      tooltip: { show: false },
      itemStyle: {
        color: colors.tradeSell,
        borderColor: colors.tradeSellText,
        borderWidth: 1.5,
      },
      label: {
        show: true,
        formatter: labels.closePosition,
        position: "top",
        distance: 3,
        color: colors.tradeSellText,
        backgroundColor: colors.tradeLabelBackground,
        borderRadius: 3,
        padding: [2, 4],
        fontSize: 10,
        fontWeight: 700,
      },
      z: 20,
    },
    {
      name: labels.rangeExit,
      type: "scatter",
      data: tradeMarkers.rangeExits.map((marker) => {
        const bar = barByTime.get(marker.time);
        return {
          value: [marker.time, bar?.high ?? marker.price],
          tradePrice: marker.price,
        };
      }),
      symbol: "diamond",
      symbolSize: 10,
      symbolOffset: [0, -14],
      silent: true,
      clip: false,
      tooltip: { show: false },
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
        fontSize: 10,
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
  const markerSeries = (
    name: string,
    data: NumericSeries,
    color: string,
    symbolRotate: number,
    symbolOffset: [number, number],
  ): SeriesOption => ({
    name,
    type: "scatter",
    data,
    xAxisIndex,
    yAxisIndex,
    symbol: "triangle",
    symbolRotate,
    symbolSize: 10,
    symbolOffset,
    silent: true,
    itemStyle: { color },
    tooltip: { valueFormatter: formatPriceChartTooltipValue },
    z: 12,
  });
  const movingAveragePair = (
    name: string,
    fastName: string,
    slowName: string,
    calculate: (period: number) => NumericSeries,
    slowColor: string,
  ) => {
    const fastData = calculate(parameters.fast);
    if (parameters.fast === parameters.slow) {
      return [
        indicatorLine(
          configuredName(name, parameters.fast),
          fastData,
          colors.cyan,
        ),
      ];
    }
    return [
      indicatorLine(
        configuredName(fastName, parameters.fast),
        fastData,
        colors.cyan,
      ),
      indicatorLine(
        configuredName(slowName, parameters.slow),
        calculate(parameters.slow),
        slowColor,
      ),
    ];
  };

  if (indicator === "sma") {
    return movingAveragePair(
      labels.sma,
      labels.smaFast,
      labels.smaSlow,
      (period) => sma(closes, period),
      colors.amber,
    );
  }
  if (indicator === "ema") {
    return movingAveragePair(
      labels.ema,
      labels.emaFast,
      labels.emaSlow,
      (period) => ema(closes, period),
      colors.violet,
    );
  }
  if (indicator === "wma") {
    return movingAveragePair(
      labels.wma,
      labels.wmaFast,
      labels.wmaSlow,
      (period) => wma(closes, period),
      colors.amber,
    );
  }
  if (indicator === "dema") {
    return movingAveragePair(
      labels.dema,
      labels.demaFast,
      labels.demaSlow,
      (period) => dema(closes, period),
      colors.violet,
    );
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
  if (indicator === "supportResistanceBreaks") {
    const values = supportResistanceBreaks(
      bars,
      parameters.leftBars,
      parameters.rightBars,
    );
    const pivotName = (name: string) =>
      configuredName(name, parameters.leftBars, parameters.rightBars);
    return [
      indicatorLine(
        pivotName(labels.supportLevel),
        breakLineAtValueChanges(values.support),
        colors.supportLevel,
      ),
      indicatorLine(
        pivotName(labels.resistanceLevel),
        breakLineAtValueChanges(values.resistance),
        colors.down,
      ),
      markerSeries(
        pivotName(labels.bullishBreak),
        values.bullishBreaks,
        colors.up,
        0,
        [0, 8],
      ),
      markerSeries(
        pivotName(labels.bearishBreak),
        values.bearishBreaks,
        colors.down,
        180,
        [0, -8],
      ),
    ];
  }
  if (indicator === "adaptiveRegressionBreakout") {
    const values = adaptiveRegressionBreakout(
      bars,
      parameters.regressionPeriod,
      parameters.deviationMultiplier,
      parameters.squeezeLookback,
      parameters.squeezeThreshold,
    );
    const name = (label: string) =>
      configuredName(
        label,
        parameters.regressionPeriod,
        parameters.deviationMultiplier,
      );
    return [
      indicatorLine(name(labels.adaptiveRegression), values.basis, colors.amber),
      indicatorLine(name(labels.adaptiveRegressionUpper), values.upper, colors.cyan),
      indicatorLine(name(labels.adaptiveRegressionLower), values.lower, colors.violet),
      markerSeries(labels.adaptiveBullishBreak, values.bullishBreaks, colors.up, 0, [0, 8]),
      markerSeries(labels.adaptiveBearishBreak, values.bearishBreaks, colors.down, 180, [0, -8]),
    ];
  }
  if (indicator === "autoAtrTrendTracker") {
    const values = autoAtrTrendTracker(
      bars,
      parameters.atrPeriod,
      parameters.spikeMultiplier,
      parameters.trailingMultiplier,
    );
    return [
      indicatorLine(
        configuredName(labels.autoAtrTrail, parameters.atrPeriod, parameters.spikeMultiplier, parameters.trailingMultiplier),
        values.trailingStop,
        colors.amber,
      ),
      markerSeries(labels.autoAtrBullishSpike, values.bullishSpikes, colors.up, 0, [0, 8]),
      markerSeries(labels.autoAtrBearishSpike, values.bearishSpikes, colors.down, 180, [0, -8]),
    ];
  }
  if (indicator === "fractionalEmaKalman") {
    const values = fractionalEmaKalman(
      bars,
      parameters.factor,
      parameters.secondFactor,
      parameters.rPeriod,
      parameters.baseQ,
      parameters.fastQ,
      parameters.gateMultiplier,
    );
    return [
      indicatorLine(labels.kalmanBaseline, values.baseline, colors.violet),
      indicatorLine(labels.kalmanFast, values.fast, colors.cyan),
    ];
  }
  if (indicator === "nadarayaWatsonTrend") {
    const values = nadarayaWatsonTrend(
      closes,
      parameters.lookback,
      parameters.bandwidth,
      parameters.bandwidthMultiplier,
      parameters.bandMultiplier,
    );
    return [
      indicatorLine(labels.nadarayaWatsonTrend, values.trend, colors.up),
      indicatorLine(labels.nadarayaWatsonUpper, values.upper, colors.cyan),
      indicatorLine(labels.nadarayaWatsonLower, values.lower, colors.violet),
    ];
  }
  if (indicator === "rsiDivergenceEngine") {
    const values = rsiDivergenceEngine(
      bars,
      parameters.period,
      parameters.leftBars,
      parameters.rightBars,
    );
    return [
      indicatorLine(configuredName(labels.rsiDivergence, parameters.period), values.value, colors.violet),
      markerSeries(labels.rsiBullishDivergence, values.bullish, colors.up, 0, [0, 6]),
      markerSeries(labels.rsiBearishDivergence, values.bearish, colors.down, 180, [0, -6]),
    ];
  }
  if (indicator === "squeezeMomentum") {
    const values = squeezeMomentum(
      bars,
      parameters.bbPeriod,
      parameters.bbMultiplier,
      parameters.kcPeriod,
      parameters.kcMultiplier,
    );
    return [
      {
        name: labels.squeezeMomentum,
        type: "bar",
        data: values.momentum.map((value, index) => ({
          value,
          itemStyle: {
            color: value !== null && value >= 0
              ? value >= (values.momentum[index - 1] ?? value) ? colors.up : "#15803d"
              : value !== null && value < (values.momentum[index - 1] ?? value) ? colors.down : "#991b1b",
          },
        })),
        xAxisIndex,
        yAxisIndex,
        barMaxWidth: 5,
        tooltip: { valueFormatter: formatPriceChartTooltipValue },
      },
    ];
  }
  if (indicator === "supportResistanceSignals") {
    const values = supportResistanceSignals(
      bars,
      parameters.detectionPeriod,
      parameters.margin,
    );
    return [
      indicatorLine(labels.communitySupport, breakLineAtValueChanges(values.support), colors.supportLevel),
      indicatorLine(labels.communitySupportZone, breakLineAtValueChanges(values.supportZoneUpper), colors.cyan),
      indicatorLine(labels.communityResistance, breakLineAtValueChanges(values.resistance), colors.down),
      indicatorLine(labels.communityResistanceZone, breakLineAtValueChanges(values.resistanceZoneLower), colors.violet),
      markerSeries(labels.communityBullishBreak, values.bullishBreaks, colors.up, 0, [0, 8]),
      markerSeries(labels.communityBearishBreak, values.bearishBreaks, colors.down, 180, [0, -8]),
    ];
  }
  if (indicator === "trendlineBreaks") {
    const values = trendlineBreaks(
      bars,
      parameters.swingPeriod,
      parameters.slopeMultiplier,
    );
    return [
      indicatorLine(labels.trendlineUpper, values.upper, colors.cyan),
      indicatorLine(labels.trendlineLower, values.lower, colors.down),
      markerSeries(labels.trendlineBullishBreak, values.bullishBreaks, colors.up, 0, [0, 8]),
      markerSeries(labels.trendlineBearishBreak, values.bearishBreaks, colors.down, 180, [0, -8]),
    ];
  }
  if (indicator === "waveTrend") {
    const values = waveTrend(
      bars,
      parameters.channelPeriod,
      parameters.averagePeriod,
    );
    return [
      indicatorLine(labels.waveTrendOne, values.wt1, colors.up),
      indicatorLine(labels.waveTrendTwo, values.wt2, colors.down),
      indicatorLine(labels.waveTrendDifference, values.difference, colors.cyan),
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
        tooltip: { valueFormatter: formatPriceChartTooltipValue },
      },
    ];
  }
  if (indicator === "kdj") {
    const values = kdj(
      bars,
      parameters.period,
      parameters.smoothK,
      parameters.smoothD,
    );
    const kdjName = (name: string) =>
      configuredName(
        name,
        parameters.period,
        parameters.smoothK,
        parameters.smoothD,
      );
    return [
      indicatorLine(
        kdjName(labels.kdjK),
        values.k,
        colors.cyan,
      ),
      indicatorLine(
        kdjName(labels.kdjD),
        values.d,
        colors.amber,
      ),
      indicatorLine(
        kdjName(labels.kdjJ),
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
  return lines
    .filter((line) =>
      line.data.some(
        (value) => value !== null && Number.isFinite(value),
      ),
    )
    .map((line) => {
      const color = strategyRoleColors[line.role];
      const actionRole =
        line.role === "entry" || line.role === "exit"
          ? labels.actionRoles?.[line.role]
          : undefined;
      return {
        id: line.id,
        name:
          actionRole ?? `${labels.prefix} · ${labels.roles[line.role]}`,
        type: "line",
        data: line.data,
        xAxisIndex: 0,
        yAxisIndex: 0,
        showSymbol: false,
        connectNulls: false,
        smooth: false,
        lineStyle: {
          width: 1.5,
          type: "dashed",
          color,
        },
        itemStyle: { color },
        emphasis: { disabled: true },
        tooltip: { valueFormatter: formatPriceChartTooltipValue },
        silent: true,
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
    pageTextStyle: { color: "#8ea099", fontSize: 10 },
    selectedMode: false,
  };
}

export function buildPriceChartLayout(
  times: string[],
  paneCount: number,
  priceAxisPrecision: 0 | 2 = 0,
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
          fontSize: 10,
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
        fontSize: 10,
        ...(gridIndex === 0
          ? {
              formatter: (value: number) =>
                formatPriceAxisValue(value, priceAxisPrecision),
            }
          : {}),
      },
      ...(gridIndex === 0
        ? {
            axisPointer: {
              label: {
                formatter: ({ value }: { value: unknown }) =>
                  formatPriceChartTooltipValue(value),
              },
            },
          }
        : {}),
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
  const { start } = defaultPriceDataZoomWindow(barsLength);

  return [
    {
      id: "price-zoom-inside",
      type: "inside",
      xAxisIndex: xAxisIndexes,
      start,
      end: 100,
      zoomLock: false,
      zoomOnMouseWheel: true,
      moveOnMouseMove: true,
      moveOnMouseWheel: false,
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

export function defaultPriceDataZoomWindow(
  barsLength: number,
): DataZoomWindow {
  return {
    start: Math.max(
      0,
      100 - (120 / Math.max(barsLength, 120)) * 100,
    ),
    end: 100,
  };
}

export interface PriceAxisRange {
  minimum: number;
  maximum: number;
  precision: 0 | 2;
}

const priceAxisFormatters = {
  0: new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }),
  2: new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }),
} as const;

export function formatPriceAxisValue(value: number, precision: 0 | 2): string {
  return priceAxisFormatters[precision].format(value);
}

export function buildVisiblePriceAxisRange(
  bars: readonly MarketBar[],
  window: DataZoomWindow,
): PriceAxisRange | null {
  if (bars.length === 0) return null;
  const startPercent = Math.min(Math.max(window.start, 0), 100);
  const endPercent = Math.min(Math.max(window.end, startPercent), 100);
  const startIndex = Math.min(
    bars.length - 1,
    Math.max(0, Math.floor((startPercent / 100) * bars.length)),
  );
  const endIndex = Math.min(
    bars.length - 1,
    Math.max(
      startIndex,
      Math.ceil((endPercent / 100) * bars.length) - 1,
    ),
  );
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (let index = startIndex; index <= endIndex; index += 1) {
    minimum = Math.min(minimum, bars[index].low);
    maximum = Math.max(maximum, bars[index].high);
  }
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) return null;
  const span = maximum - minimum;
  const precision: 0 | 2 = maximum <= 20 ? 2 : 0;
  const padding =
    span > 0
      ? span * 0.04
      : Math.max(Math.abs(maximum) * 0.01, precision === 2 ? 0.01 : 1);
  const scale = precision === 2 ? 100 : 1;
  return {
    minimum: Math.floor((minimum - padding) * scale) / scale,
    maximum: Math.ceil((maximum + padding) * scale) / scale,
    precision,
  };
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
  const defaultZoomWindow = useMemo(
    () => defaultPriceDataZoomWindow(bars.length),
    [bars.length],
  );
  const [zoomState, setZoomState] = useState<{
    dataKey: string;
    window: DataZoomWindow;
  }>(() => ({ dataKey, window: defaultZoomWindow }));
  const activeZoomWindow =
    zoomState.dataKey === dataKey ? zoomState.window : defaultZoomWindow;
  const handleDataZoomChange = useCallback(
    (window: DataZoomWindow) => {
      setZoomState((current) =>
        current.dataKey === dataKey &&
        Math.abs(current.window.start - window.start) < 1e-6 &&
        Math.abs(current.window.end - window.end) < 1e-6
          ? current
          : { dataKey, window },
      );
    },
    [dataKey],
  );
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
    const priceAxisRange = buildVisiblePriceAxisRange(
      bars,
      activeZoomWindow,
    );
    const layout = buildPriceChartLayout(
      times,
      paneCount,
      priceAxisRange?.precision ?? 0,
    );
    if (priceAxisRange) {
      layout.yAxes[0] = {
        ...layout.yAxes[0],
        min: priceAxisRange.minimum,
        max: priceAxisRange.maximum,
      };
    }
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
        tooltip: { valueFormatter: formatPriceChartTooltipValue },
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
        bars,
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
      tooltip: { valueFormatter: formatVolumeTooltipValue },
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
    activeZoomWindow,
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
      onDataZoomChange={handleDataZoomChange}
    />
  );
}
