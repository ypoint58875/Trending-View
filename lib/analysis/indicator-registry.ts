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

export type IndicatorSettings = Record<IndicatorId, IndicatorParameters>;

export interface IndicatorConfiguration {
  id: IndicatorId;
  parameters: IndicatorParameters;
}

export interface IndicatorWorkspacePreferences {
  focusedIndicator: IndicatorId;
  visibleIndicatorIds: IndicatorId[];
  settings: IndicatorSettings;
}

export const INDICATOR_PREFERENCES_STORAGE_KEY =
  "quantscope.indicator-preferences.v1";

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

export function createDefaultIndicatorSettings(): IndicatorSettings {
  return Object.fromEntries(
    INDICATORS.map((indicator) => [
      indicator.id,
      getDefaultIndicatorParameters(indicator.id),
    ]),
  ) as IndicatorSettings;
}

export function createDefaultIndicatorWorkspacePreferences(): IndicatorWorkspacePreferences {
  return {
    focusedIndicator: "sma",
    visibleIndicatorIds: [],
    settings: createDefaultIndicatorSettings(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIndicatorId(value: unknown): value is IndicatorId {
  return (
    typeof value === "string" &&
    INDICATORS.some((indicator) => indicator.id === value)
  );
}

function parseIndicatorParameters(
  indicatorId: IndicatorId,
  value: unknown,
): IndicatorParameters | null {
  if (!isRecord(value)) return null;
  const definition = getIndicator(indicatorId);
  const parameterKeys = new Set(
    definition.parameters.map((parameter) => parameter.key),
  );
  if (
    Object.keys(value).length !== parameterKeys.size ||
    Object.keys(value).some((key) => !parameterKeys.has(key))
  ) {
    return null;
  }

  const parameters: IndicatorParameters = {};
  for (const parameter of definition.parameters) {
    const candidate = value[parameter.key];
    if (
      typeof candidate !== "number" ||
      !Number.isFinite(candidate) ||
      candidate < parameter.minimum ||
      candidate > 1_000_000 ||
      (parameter.step === 1 && !Number.isInteger(candidate))
    ) {
      return null;
    }
    parameters[parameter.key] = candidate;
  }
  return parameters;
}

export function createIndicatorConfigurations(
  visibleIndicatorIds: readonly IndicatorId[],
  settings: IndicatorSettings,
): IndicatorConfiguration[] {
  return visibleIndicatorIds.map((id) => ({
    id,
    parameters: { ...settings[id] },
  }));
}

export function parseIndicatorConfigurations(
  value: unknown,
): IndicatorConfiguration[] | null {
  if (!Array.isArray(value) || value.length > INDICATORS.length) return null;

  const configurations: IndicatorConfiguration[] = [];
  const seen = new Set<IndicatorId>();
  for (const item of value) {
    if (!isRecord(item) || !isIndicatorId(item.id) || seen.has(item.id)) {
      return null;
    }
    const parameters = parseIndicatorParameters(item.id, item.parameters);
    if (!parameters) return null;
    seen.add(item.id);
    configurations.push({ id: item.id, parameters });
  }
  return configurations;
}

export function parseIndicatorWorkspacePreferences(
  value: unknown,
): IndicatorWorkspacePreferences | null {
  if (
    !isRecord(value) ||
    !isIndicatorId(value.focusedIndicator) ||
    !Array.isArray(value.visibleIndicatorIds) ||
    !isRecord(value.settings)
  ) {
    return null;
  }

  const visibleIndicatorIds: IndicatorId[] = [];
  const seen = new Set<IndicatorId>();
  for (const indicatorId of value.visibleIndicatorIds) {
    if (!isIndicatorId(indicatorId) || seen.has(indicatorId)) return null;
    seen.add(indicatorId);
    visibleIndicatorIds.push(indicatorId);
  }

  const settings = createDefaultIndicatorSettings();
  for (const indicator of INDICATORS) {
    if (!(indicator.id in value.settings)) continue;
    const parameters = parseIndicatorParameters(
      indicator.id,
      value.settings[indicator.id],
    );
    if (!parameters) return null;
    settings[indicator.id] = parameters;
  }

  return {
    focusedIndicator: value.focusedIndicator,
    visibleIndicatorIds,
    settings,
  };
}

export function indicatorConfigurationsEqual(
  left: readonly IndicatorConfiguration[],
  right: readonly IndicatorConfiguration[],
): boolean {
  return (
    left.length === right.length &&
    left.every((configuration, index) => {
      const other = right[index];
      if (!other || configuration.id !== other.id) return false;
      const entries = Object.entries(configuration.parameters);
      return (
        entries.length === Object.keys(other.parameters).length &&
        entries.every(([key, value]) => other.parameters[key] === value)
      );
    })
  );
}
