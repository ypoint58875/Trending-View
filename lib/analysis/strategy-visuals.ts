import type { MarketBar } from "@/lib/market/types";
import {
  atr,
  bollingerBands,
  ema,
  ichimoku,
  parabolicSar,
  sma,
  supertrend,
  vwap,
  type NumericSeries,
} from "./indicators";
import type { StrategyOrderSeries } from "./strategy-orders";
import {
  getStrategy,
  type StrategyId,
  type StrategyParameters,
} from "./strategies";

export type StrategyPriceLineRole =
  | "entry"
  | "exit"
  | "fast"
  | "slow"
  | "middle"
  | "upper"
  | "lower"
  | "trend"
  | "conversion"
  | "base"
  | "span-a"
  | "span-b"
  | "reference";

export interface StrategyPriceLine {
  id: string;
  role: StrategyPriceLineRole;
  data: NumericSeries;
}

function builtInPeriod(
  parameters: StrategyParameters,
  key: string,
  fallback: number,
) {
  const candidate = parameters[key];
  return Math.max(
    Math.round(Number.isFinite(candidate) ? candidate : fallback),
    1,
  );
}

function builtInValue(
  parameters: StrategyParameters,
  key: string,
  fallback: number,
) {
  const candidate = parameters[key];
  return Number.isFinite(candidate) ? candidate : fallback;
}

function completeParameters(
  strategyId: StrategyId,
  parameters: StrategyParameters,
) {
  return {
    ...getStrategy(strategyId).defaultParameters,
    ...parameters,
  };
}

function priceLine(
  strategyId: StrategyId,
  suffix: string,
  role: StrategyPriceLineRole,
  data: NumericSeries,
  barsLength: number,
): StrategyPriceLine {
  if (data.length !== barsLength) {
    throw new Error("Strategy price line must align with market bars");
  }
  if (
    !data.every((lineValue) => {
      return lineValue === null || Number.isFinite(lineValue);
    })
  ) {
    throw new Error("Strategy price line values must be finite or null");
  }
  return {
    id: `${strategyId}:${suffix}`,
    role,
    data,
  };
}

function completedExtreme(
  bars: MarketBar[],
  windowLength: number,
  field: "high" | "low",
): NumericSeries {
  const output: NumericSeries = new Array(bars.length).fill(null);
  if (!Number.isFinite(windowLength) || windowLength <= 0) return output;

  for (let index = 1; index < bars.length; index += 1) {
    if (index < windowLength) continue;
    const values = bars
      .slice(index - windowLength, index)
      .map((bar) => bar[field]);
    output[index] =
      field === "high" ? Math.max(...values) : Math.min(...values);
  }
  return output;
}

function bandLines(
  bars: MarketBar[],
  strategyId: StrategyId,
  parameters: StrategyParameters,
) {
  const closes = bars.map((bar) => bar.close);
  const isBuiltIn = strategyId.startsWith("tv-");
  const period = isBuiltIn
    ? builtInPeriod(parameters, "period", 20)
    : parameters.period;
  const width = isBuiltIn
    ? builtInValue(parameters, "width", 2)
    : parameters.width;
  const bands = bollingerBands(closes, period, width);
  return [
    priceLine(
      strategyId,
      "middle",
      "middle",
      bands.middle,
      bars.length,
    ),
    priceLine(
      strategyId,
      "upper",
      "upper",
      bands.upper,
      bars.length,
    ),
    priceLine(
      strategyId,
      "lower",
      "lower",
      bands.lower,
      bars.length,
    ),
  ];
}

function supertrendLines(
  bars: MarketBar[],
  strategyId: StrategyId,
  parameters: StrategyParameters,
) {
  const isBuiltIn = strategyId.startsWith("tv-");
  const period = isBuiltIn
    ? builtInPeriod(parameters, "period", 10)
    : parameters.period;
  const multiplier = isBuiltIn
    ? builtInValue(parameters, "multiplier", 3)
    : parameters.multiplier;
  return [
    priceLine(
      strategyId,
      "trend",
      "trend",
      supertrend(bars, period, multiplier).trend,
      bars.length,
    ),
  ];
}

export function buildStrategyOrders(
  bars: MarketBar[],
  strategyId: StrategyId,
  inputParameters: StrategyParameters,
): StrategyOrderSeries | null {
  const strategy = getStrategy(strategyId);
  if (!strategy.buildOrders) return null;
  const parameters = completeParameters(strategyId, inputParameters);
  const orders = strategy.buildOrders(bars, parameters);
  if (orders.length !== bars.length) {
    throw new Error("Strategy order plan must align with market bars");
  }
  for (const order of orders) {
    if (
      (order.entryStop !== null && !Number.isFinite(order.entryStop)) ||
      (order.exitStop !== null && !Number.isFinite(order.exitStop))
    ) {
      throw new Error("Strategy order values must be finite or null");
    }
  }
  return orders;
}

export function buildStrategyPriceLines(
  bars: MarketBar[],
  strategyId: StrategyId,
  inputParameters: StrategyParameters,
): StrategyPriceLine[] {
  const parameters = completeParameters(strategyId, inputParameters);
  const orders = buildStrategyOrders(bars, strategyId, parameters);
  if (orders) {
    return [
      priceLine(
        strategyId,
        "entry",
        "entry",
        orders.map((order) => order.entryStop),
        bars.length,
      ),
      priceLine(
        strategyId,
        "exit",
        "exit",
        orders.map((order) => order.exitStop),
        bars.length,
      ),
    ];
  }

  const closes = bars.map((bar) => bar.close);
  if (strategyId === "sma-cross") {
    return [
      priceLine(
        strategyId,
        "fast",
        "fast",
        sma(closes, parameters.fast),
        bars.length,
      ),
      priceLine(
        strategyId,
        "slow",
        "slow",
        sma(closes, parameters.slow),
        bars.length,
      ),
    ];
  }
  if (strategyId === "ema-cross") {
    return [
      priceLine(
        strategyId,
        "fast",
        "fast",
        ema(closes, parameters.fast),
        bars.length,
      ),
      priceLine(
        strategyId,
        "slow",
        "slow",
        ema(closes, parameters.slow),
        bars.length,
      ),
    ];
  }
  if (
    strategyId === "bollinger-reversion" ||
    strategyId === "tv-bollinger-bands" ||
    strategyId === "tv-bollinger-directed"
  ) {
    return bandLines(bars, strategyId, parameters);
  }
  if (strategyId === "donchian-breakout") {
    return [
      priceLine(
        strategyId,
        "entry",
        "entry",
        completedExtreme(bars, parameters.entryPeriod, "high"),
        bars.length,
      ),
      priceLine(
        strategyId,
        "exit",
        "exit",
        completedExtreme(bars, parameters.exitPeriod, "low"),
        bars.length,
      ),
    ];
  }
  if (
    strategyId === "supertrend-trend" ||
    strategyId === "tv-supertrend"
  ) {
    return supertrendLines(bars, strategyId, parameters);
  }
  if (strategyId === "ichimoku-trend") {
    const values = ichimoku(
      bars,
      parameters.conversionPeriod,
      parameters.basePeriod,
      parameters.spanPeriod,
    );
    return [
      priceLine(
        strategyId,
        "conversion",
        "conversion",
        values.conversion,
        bars.length,
      ),
      priceLine(
        strategyId,
        "base",
        "base",
        values.base,
        bars.length,
      ),
      priceLine(
        strategyId,
        "span-a",
        "span-a",
        values.spanA,
        bars.length,
      ),
      priceLine(
        strategyId,
        "span-b",
        "span-b",
        values.spanB,
        bars.length,
      ),
    ];
  }
  if (strategyId === "vwap-reversion") {
    const reference = vwap(bars);
    return [
      priceLine(
        strategyId,
        "vwap",
        "reference",
        reference,
        bars.length,
      ),
      priceLine(
        strategyId,
        "entry",
        "entry",
        reference.map((lineValue) => {
          return lineValue === null
            ? null
            : lineValue * (1 - parameters.entryPercent / 100);
        }),
        bars.length,
      ),
      priceLine(
        strategyId,
        "exit",
        "exit",
        reference.map((lineValue) => {
          return lineValue === null
            ? null
            : lineValue * (1 + parameters.exitPercent / 100);
        }),
        bars.length,
      ),
    ];
  }
  if (strategyId === "tv-keltner-channels") {
    const period = builtInPeriod(parameters, "period", 20);
    const multiplier = builtInValue(parameters, "multiplier", 2);
    const middle = ema(closes, period);
    const volatility = atr(bars, period);
    const offset = (direction: 1 | -1) => {
      return middle.map((lineValue, index) => {
        const currentVolatility = volatility[index];
        if (lineValue === null || currentVolatility === null) return null;
        return lineValue + direction * currentVolatility * multiplier;
      });
    };
    return [
      priceLine(
        strategyId,
        "middle",
        "middle",
        middle,
        bars.length,
      ),
      priceLine(
        strategyId,
        "upper",
        "upper",
        offset(1),
        bars.length,
      ),
      priceLine(
        strategyId,
        "lower",
        "lower",
        offset(-1),
        bars.length,
      ),
    ];
  }
  if (strategyId === "tv-parabolic-sar") {
    return [
      priceLine(
        strategyId,
        "sar",
        "trend",
        parabolicSar(
          bars,
          builtInValue(parameters, "start", 0.02),
          builtInValue(parameters, "increment", 0.02),
          builtInValue(parameters, "maximum", 0.2),
        ),
        bars.length,
      ),
    ];
  }
  if (strategyId === "tv-technical-ratings") {
    return [
      priceLine(
        strategyId,
        "ema-20",
        "fast",
        ema(closes, 20),
        bars.length,
      ),
      priceLine(
        strategyId,
        "sma-50",
        "slow",
        sma(closes, 50),
        bars.length,
      ),
    ];
  }
  return [];
}
