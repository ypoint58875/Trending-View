import type { MarketBar } from "@/lib/market/types";
import {
  runBacktest,
  type BacktestResult,
  type BacktestSettings,
  type EquityPoint,
} from "./backtest";
import {
  buildNearbyParameterSets,
  isValidStrategyParameters,
} from "./screening";
import type {
  StrategyId,
  StrategyParameters,
} from "./strategies";

export const STABILITY_THRESHOLDS = {
  minimumSignAgreement: 0.75,
  maximumReturnRange: 15,
  maximumDrawdownDeterioration: 10,
} as const;

export const MINIMUM_STABILITY_OBSERVATIONS = 120;
export const MINIMUM_STABILITY_TRADES = 2;

const REGIME_SMA_PERIOD = 60;
const REGIME_SMA_LOOKBACK = 20;

export type MarketRegime = "up" | "sideways" | "down";

export interface RegimeReturnSummary {
  returnPercent: number | null;
  periodCount: number;
}

export type RegimeReturnSummaries = Record<
  MarketRegime,
  RegimeReturnSummary
>;

export interface NumericRange {
  minimum: number;
  maximum: number;
}

export interface TotalReturnRange extends NumericRange {
  width: number;
}

export interface SignAgreement {
  matchingVariants: number;
  variantCount: number;
  ratio: number;
}

export interface StabilityThresholdChecks {
  signAgreement: boolean;
  returnRange: boolean;
  drawdownDeterioration: boolean;
}

export interface NearbyBacktestSummary {
  totalReturnRange: TotalReturnRange;
  drawdownRange: NumericRange;
  worstDrawdown: number;
  drawdownDeterioration: number;
  tradeCountRange: NumericRange;
  signAgreement: SignAgreement;
  thresholdChecks: StabilityThresholdChecks;
  stable: boolean;
}

export type StabilityEvidenceReason =
  | "invalid-parameters"
  | "insufficient-observations"
  | "insufficient-trades"
  | "no-nearby-variants";

export interface StabilityEvidence {
  sufficient: boolean;
  reasons: StabilityEvidenceReason[];
  observationCount: number;
  minimumObservationCount: number;
  tradeCount: number;
  minimumTradeCount: number;
}

export interface StrategyStabilityAnalysis {
  baseResult: BacktestResult | null;
  variantResults: BacktestResult[];
  nearby: NearbyBacktestSummary | null;
  regimes: RegimeReturnSummaries;
  evidence: StabilityEvidence;
}

function countInRangeObservations(
  bars: MarketBar[],
  settings: BacktestSettings,
): number {
  const normalize = (value: string) => value.replace("T", " ");
  const start = settings.startTime ? normalize(settings.startTime) : "";
  const end = settings.endTime
    ? settings.endTime.length === 10
      ? `${settings.endTime} 23:59`
      : normalize(settings.endTime)
    : "";
  return bars.filter((bar) => {
    const time = normalize(bar.time);
    return (!start || time >= start) && (!end || time <= end);
  }).length;
}

export function classifyMarketRegimes(
  bars: MarketBar[],
): Array<MarketRegime | null> {
  const movingAverages: Array<number | null> = new Array(
    bars.length,
  ).fill(null);
  let windowSum = 0;
  let invalidValueCount = 0;

  for (let index = 0; index < bars.length; index += 1) {
    const close = bars[index].close;
    if (Number.isFinite(close)) {
      windowSum += close;
    } else {
      invalidValueCount += 1;
    }

    if (index >= REGIME_SMA_PERIOD) {
      const expiredClose = bars[index - REGIME_SMA_PERIOD].close;
      if (Number.isFinite(expiredClose)) {
        windowSum -= expiredClose;
      } else {
        invalidValueCount -= 1;
      }
    }

    if (
      index >= REGIME_SMA_PERIOD - 1 &&
      invalidValueCount === 0
    ) {
      movingAverages[index] = windowSum / REGIME_SMA_PERIOD;
    }
  }

  return bars.map((bar, index) => {
    const currentAverage = movingAverages[index];
    const previousAverage =
      movingAverages[index - REGIME_SMA_LOOKBACK] ?? null;
    if (
      currentAverage === null ||
      previousAverage === null ||
      !Number.isFinite(bar.close)
    ) {
      return null;
    }
    if (
      bar.close > currentAverage &&
      currentAverage > previousAverage
    ) {
      return "up";
    }
    if (
      bar.close < currentAverage &&
      currentAverage < previousAverage
    ) {
      return "down";
    }
    return "sideways";
  });
}

export function summarizeRegimeReturns(
  bars: MarketBar[],
  equity: EquityPoint[],
): RegimeReturnSummaries {
  const regimes = classifyMarketRegimes(bars);
  const regimeByTime = new Map(
    bars.map((bar, index) => [bar.time, regimes[index]]),
  );
  const compoundedGrowth: Record<MarketRegime, number> = {
    up: 1,
    sideways: 1,
    down: 1,
  };
  const periodCounts: Record<MarketRegime, number> = {
    up: 0,
    sideways: 0,
    down: 0,
  };

  for (let index = 1; index < equity.length; index += 1) {
    const previousEquity = equity[index - 1].equity;
    const currentEquity = equity[index].equity;
    const regime = regimeByTime.get(equity[index].time);
    const growth =
      previousEquity === 0 ? Number.NaN : currentEquity / previousEquity;
    if (!regime || !Number.isFinite(growth)) continue;
    compoundedGrowth[regime] *= growth;
    periodCounts[regime] += 1;
  }

  return {
    up: {
      returnPercent:
        periodCounts.up === 0
          ? null
          : (compoundedGrowth.up - 1) * 100,
      periodCount: periodCounts.up,
    },
    sideways: {
      returnPercent:
        periodCounts.sideways === 0
          ? null
          : (compoundedGrowth.sideways - 1) * 100,
      periodCount: periodCounts.sideways,
    },
    down: {
      returnPercent:
        periodCounts.down === 0
          ? null
          : (compoundedGrowth.down - 1) * 100,
      periodCount: periodCounts.down,
    },
  };
}

export function summarizeNearbyBacktests(
  baseResult: BacktestResult,
  variantResults: BacktestResult[],
): NearbyBacktestSummary {
  const allResults = [baseResult, ...variantResults];
  const totalReturns = allResults.map((result) => result.totalReturn);
  const minimumReturn = Math.min(...totalReturns);
  const maximumReturn = Math.max(...totalReturns);
  const tradeCounts = allResults.map((result) => result.tradeCount);
  const drawdowns = allResults.map((result) => result.maxDrawdown);
  const worstDrawdown = Math.min(...drawdowns);
  const baseReturnSign = Math.sign(baseResult.totalReturn);
  const matchingVariants = variantResults.filter(
    (result) => Math.sign(result.totalReturn) === baseReturnSign,
  ).length;
  const variantCount = variantResults.length;
  const signAgreementRatio =
    variantCount === 0 ? 0 : matchingVariants / variantCount;
  const returnRangeWidth = maximumReturn - minimumReturn;
  const drawdownDeterioration = Math.max(
    0,
    baseResult.maxDrawdown - worstDrawdown,
  );
  const thresholdChecks = {
    signAgreement:
      variantCount > 0 &&
      signAgreementRatio >= STABILITY_THRESHOLDS.minimumSignAgreement,
    returnRange:
      returnRangeWidth <= STABILITY_THRESHOLDS.maximumReturnRange,
    drawdownDeterioration:
      drawdownDeterioration <=
      STABILITY_THRESHOLDS.maximumDrawdownDeterioration,
  };

  return {
    totalReturnRange: {
      minimum: minimumReturn,
      maximum: maximumReturn,
      width: returnRangeWidth,
    },
    drawdownRange: {
      minimum: worstDrawdown,
      maximum: Math.max(...drawdowns),
    },
    worstDrawdown,
    drawdownDeterioration,
    tradeCountRange: {
      minimum: Math.min(...tradeCounts),
      maximum: Math.max(...tradeCounts),
    },
    signAgreement: {
      matchingVariants,
      variantCount,
      ratio: signAgreementRatio,
    },
    thresholdChecks,
    stable: Object.values(thresholdChecks).every(Boolean),
  };
}

export function analyzeStrategyStability(
  bars: MarketBar[],
  strategyId: StrategyId,
  baseParameters: StrategyParameters,
  settings: BacktestSettings,
): StrategyStabilityAnalysis {
  const observationCount = countInRangeObservations(bars, settings);
  const minimumEvidence = {
    observationCount,
    minimumObservationCount: MINIMUM_STABILITY_OBSERVATIONS,
    minimumTradeCount: MINIMUM_STABILITY_TRADES,
  };

  if (!isValidStrategyParameters(strategyId, baseParameters)) {
    return {
      baseResult: null,
      variantResults: [],
      nearby: null,
      regimes: summarizeRegimeReturns(bars, []),
      evidence: {
        ...minimumEvidence,
        sufficient: false,
        reasons: ["invalid-parameters"],
        tradeCount: 0,
      },
    };
  }

  const parameterSets = buildNearbyParameterSets(
    strategyId,
    baseParameters,
  );
  const [baseParametersSet, ...variantParameterSets] = parameterSets;
  const baseResult =
    observationCount >= 3 && baseParametersSet
      ? runBacktest(bars, strategyId, baseParametersSet, settings)
      : null;
  const variantResults = baseResult
    ? variantParameterSets.map((parameters) =>
        runBacktest(bars, strategyId, parameters, settings),
      )
    : [];
  const reasons: StabilityEvidenceReason[] = [];
  if (observationCount < MINIMUM_STABILITY_OBSERVATIONS) {
    reasons.push("insufficient-observations");
  }
  const tradeCount = baseResult?.tradeCount ?? 0;
  if (tradeCount < MINIMUM_STABILITY_TRADES) {
    reasons.push("insufficient-trades");
  }
  if (variantParameterSets.length === 0) {
    reasons.push("no-nearby-variants");
  }
  const sufficient = reasons.length === 0;
  const nearby = baseResult
    ? summarizeNearbyBacktests(baseResult, variantResults)
    : null;
  if (nearby && !sufficient) nearby.stable = false;

  return {
    baseResult,
    variantResults,
    nearby,
    regimes: summarizeRegimeReturns(bars, baseResult?.equity ?? []),
    evidence: {
      ...minimumEvidence,
      sufficient,
      reasons,
      tradeCount,
    },
  };
}
