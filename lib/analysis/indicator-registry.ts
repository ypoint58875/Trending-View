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

export interface IndicatorParameters {
  [key: string]: number;
}

export interface IndicatorParameterDefinition {
  key: string;
  defaultValue: number;
  minimum: number;
  step: number;
}

export interface IndicatorDefinition {
  id: IndicatorId;
  placement: "overlay" | "pane";
  parameters: readonly IndicatorParameterDefinition[];
}

function parameter(
  key: string,
  defaultValue: number,
  minimum: number,
  step: number,
): IndicatorParameterDefinition {
  return { key, defaultValue, minimum, step };
}

function period(
  key: string,
  defaultValue: number,
): IndicatorParameterDefinition {
  return parameter(key, defaultValue, 1, 1);
}

function decimal(
  key: string,
  defaultValue: number,
  minimum: number,
  step: number,
): IndicatorParameterDefinition {
  return parameter(key, defaultValue, minimum, step);
}

function definition(
  id: IndicatorId,
  placement: IndicatorDefinition["placement"],
  ...parameters: IndicatorParameterDefinition[]
): IndicatorDefinition {
  return { id, placement, parameters };
}

export const INDICATORS: readonly IndicatorDefinition[] = [
  definition("sma", "overlay", period("fast", 10), period("slow", 30)),
  definition("ema", "overlay", period("fast", 12), period("slow", 26)),
  definition("wma", "overlay", period("fast", 20), period("slow", 50)),
  definition("dema", "overlay", period("fast", 20), period("slow", 50)),
  definition(
    "bollinger",
    "overlay",
    period("period", 20),
    decimal("width", 2, 0.1, 0.1),
  ),
  definition("vwap", "overlay"),
  definition(
    "supertrend",
    "overlay",
    period("period", 10),
    decimal("multiplier", 3, 0.1, 0.1),
  ),
  definition(
    "ichimoku",
    "overlay",
    period("conversionPeriod", 9),
    period("basePeriod", 26),
    period("spanPeriod", 52),
  ),
  definition("rsi", "pane", period("period", 14)),
  definition(
    "macd",
    "pane",
    period("fast", 12),
    period("slow", 26),
    period("signal", 9),
  ),
  definition("kdj", "pane", period("period", 9)),
  definition(
    "stochasticRsi",
    "pane",
    period("rsiPeriod", 14),
    period("stochasticPeriod", 14),
    period("smoothPeriod", 3),
  ),
  definition("cci", "pane", period("period", 20)),
  definition("williamsR", "pane", period("period", 14)),
  definition("adx", "pane", period("period", 14)),
  definition("roc", "pane", period("period", 12)),
  definition("mfi", "pane", period("period", 14)),
  definition("cmf", "pane", period("period", 20)),
  definition("atr", "pane", period("period", 14)),
  definition("obv", "pane"),
];

export function getIndicator(id: IndicatorId): IndicatorDefinition {
  const indicator = INDICATORS.find((candidate) => candidate.id === id);
  if (!indicator) throw new Error(`Unknown indicator: ${id}`);
  return indicator;
}

export function getDefaultIndicatorParameters(
  id: IndicatorId,
): IndicatorParameters {
  return Object.fromEntries(
    getIndicator(id).parameters.map((item) => [
      item.key,
      item.defaultValue,
    ]),
  );
}

export function createDefaultIndicatorSettings(): Record<
  IndicatorId,
  IndicatorParameters
> {
  return Object.fromEntries(
    INDICATORS.map((indicator) => [
      indicator.id,
      getDefaultIndicatorParameters(indicator.id),
    ]),
  ) as Record<IndicatorId, IndicatorParameters>;
}
