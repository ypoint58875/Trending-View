export const COMMUNITY_INDICATOR_IDS = [
  "adaptiveRegressionBreakout",
  "autoAtrTrendTracker",
  "fractionalEmaKalman",
  "nadarayaWatsonTrend",
  "rsiDivergenceEngine",
  "squeezeMomentum",
  "supportResistanceSignals",
  "trendlineBreaks",
  "waveTrend",
  "keltnerChannels",
  "donchianChannels",
  "choppinessIndex",
  "aroon",
  "trix",
  "halfTrend",
  "qqeMod",
  "schaffTrendCycle",
  "sessionVolumeProfile",
  "anchoredVwap",
] as const;

export type CommunityIndicatorId = (typeof COMMUNITY_INDICATOR_IDS)[number];

interface CommunityIndicatorParameterDefinition {
  key: string;
  defaultValue: number;
  minimum: number;
  step: number;
  kind?: "number" | "datetime";
}

interface CommunityIndicatorDefinition {
  id: CommunityIndicatorId;
  placement: "overlay" | "pane";
  category:
    | "movingAverage"
    | "trend"
    | "volatility"
    | "momentum"
    | "volume"
    | "structure";
  parameters: readonly CommunityIndicatorParameterDefinition[];
}

const period = (
  key: string,
  defaultValue: number,
): CommunityIndicatorParameterDefinition => ({
  key,
  defaultValue,
  minimum: 1,
  step: 1,
});

const decimal = (
  key: string,
  defaultValue: number,
  minimum: number,
  step: number,
): CommunityIndicatorParameterDefinition => ({
  key,
  defaultValue,
  minimum,
  step,
});

export const COMMUNITY_INDICATOR_DEFINITIONS = [
  {
    id: "adaptiveRegressionBreakout",
    placement: "overlay",
    category: "structure",
    parameters: [
      period("regressionPeriod", 50),
      decimal("deviationMultiplier", 2, 0.1, 0.1),
      period("squeezeLookback", 100),
      decimal("squeezeThreshold", 20, 0, 1),
    ],
  },
  {
    id: "autoAtrTrendTracker",
    placement: "overlay",
    category: "trend",
    parameters: [
      period("atrPeriod", 14),
      decimal("spikeMultiplier", 2, 0.1, 0.1),
      decimal("trailingMultiplier", 3, 0.1, 0.1),
    ],
  },
  {
    id: "fractionalEmaKalman",
    placement: "overlay",
    category: "movingAverage",
    parameters: [
      decimal("factor", 0.5, 0.1, 0.1),
      decimal("secondFactor", 0.5, 0.1, 0.1),
      period("rPeriod", 50),
      decimal("baseQ", 0.002, 0.001, 0.001),
      decimal("fastQ", 0.005, 0.001, 0.001),
      decimal("gateMultiplier", 1, 0.1, 0.1),
    ],
  },
  {
    id: "nadarayaWatsonTrend",
    placement: "overlay",
    category: "trend",
    parameters: [
      period("lookback", 50),
      period("bandwidth", 8),
      decimal("bandwidthMultiplier", 2, 0.1, 0.1),
      decimal("bandMultiplier", 1.5, 0.1, 0.1),
    ],
  },
  {
    id: "rsiDivergenceEngine",
    placement: "pane",
    category: "momentum",
    parameters: [
      period("period", 14),
      period("leftBars", 47),
      period("rightBars", 1),
    ],
  },
  {
    id: "squeezeMomentum",
    placement: "pane",
    category: "momentum",
    parameters: [
      period("bbPeriod", 20),
      decimal("bbMultiplier", 2, 0.1, 0.1),
      period("kcPeriod", 20),
      decimal("kcMultiplier", 1.5, 0.1, 0.1),
    ],
  },
  {
    id: "supportResistanceSignals",
    placement: "overlay",
    category: "structure",
    parameters: [
      period("detectionPeriod", 15),
      decimal("margin", 2, 0.1, 0.1),
    ],
  },
  {
    id: "trendlineBreaks",
    placement: "overlay",
    category: "structure",
    parameters: [
      period("swingPeriod", 14),
      decimal("slopeMultiplier", 1, 0, 0.1),
    ],
  },
  {
    id: "waveTrend",
    placement: "pane",
    category: "momentum",
    parameters: [
      period("channelPeriod", 10),
      period("averagePeriod", 21),
    ],
  },
  {
    id: "keltnerChannels",
    placement: "overlay",
    category: "volatility",
    parameters: [
      period("period", 20),
      decimal("multiplier", 1.5, 0.1, 0.1),
    ],
  },
  {
    id: "donchianChannels",
    placement: "overlay",
    category: "structure",
    parameters: [period("period", 20)],
  },
  {
    id: "choppinessIndex",
    placement: "pane",
    category: "trend",
    parameters: [period("period", 14)],
  },
  {
    id: "aroon",
    placement: "pane",
    category: "trend",
    parameters: [period("period", 14)],
  },
  {
    id: "trix",
    placement: "pane",
    category: "momentum",
    parameters: [period("period", 18), period("signalPeriod", 9)],
  },
  {
    id: "halfTrend",
    placement: "overlay",
    category: "trend",
    parameters: [
      period("amplitude", 2),
      decimal("channelDeviation", 2, 0.1, 0.1),
    ],
  },
  {
    id: "qqeMod",
    placement: "pane",
    category: "momentum",
    parameters: [
      period("rsiPeriod", 6),
      period("smoothingPeriod", 5),
      decimal("primaryMultiplier", 3, 0.1, 0.01),
      decimal("secondaryMultiplier", 1.61, 0.1, 0.01),
      period("bollingerPeriod", 50),
      decimal("bollingerMultiplier", 0.35, 0.01, 0.01),
    ],
  },
  {
    id: "schaffTrendCycle",
    placement: "pane",
    category: "momentum",
    parameters: [
      period("cyclePeriod", 10),
      period("fastPeriod", 23),
      period("slowPeriod", 50),
      decimal("smoothingFactor", 0.5, 0, 0.05),
    ],
  },
  {
    id: "sessionVolumeProfile",
    placement: "overlay",
    category: "volume",
    parameters: [
      period("rows", 24),
      decimal("valueAreaPercent", 70, 1, 1),
    ],
  },
  {
    id: "anchoredVwap",
    placement: "overlay",
    category: "volume",
    parameters: [
      {
        key: "anchorTimestamp",
        defaultValue: 0,
        minimum: 0,
        step: 1,
        kind: "datetime",
      },
    ],
  },
] as const satisfies readonly CommunityIndicatorDefinition[];
