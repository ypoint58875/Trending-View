import type { StrategyId } from "./strategies";

export type StrategyConsensusAction =
  | "buy"
  | "add"
  | "hold"
  | "reduce"
  | "sell"
  | "wait";

export type StrategyConsensusConfidence = "high" | "medium" | "low";

export interface StrategyConsensusEvidence {
  key: string;
  strategyIds: readonly StrategyId[];
  previousAllocation: number;
  targetAllocation: number;
  weight?: number;
}

export interface StrategyConsensusAdvice {
  action: StrategyConsensusAction;
  confidence: StrategyConsensusConfidence;
  previousAllocation: number;
  targetAllocation: number;
  agreement: number;
  increasePressure: number;
  reducePressure: number;
  evidenceCount: number;
  bullishCount: number;
  bearishCount: number;
}

function boundedAllocation(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

function roundedPosition(value: number): number {
  return Math.round(boundedAllocation(value) * 10) / 10;
}

export function buildStrategyConsensusAdvice(
  evidence: readonly StrategyConsensusEvidence[],
): StrategyConsensusAdvice | null {
  const uniqueEvidence = [
    ...new Map(evidence.map((item) => [item.key, item])).values(),
  ].filter(
    (item) =>
      Number.isFinite(item.previousAllocation) &&
      Number.isFinite(item.targetAllocation),
  );
  if (uniqueEvidence.length === 0) return null;

  const weighted = uniqueEvidence.map((item, index) => ({
    ...item,
    previousAllocation: boundedAllocation(item.previousAllocation),
    targetAllocation: boundedAllocation(item.targetAllocation),
    resolvedWeight:
      Number.isFinite(item.weight) && (item.weight ?? 0) > 0
        ? item.weight!
        : uniqueEvidence.length - index,
  }));
  const totalWeight = weighted.reduce(
    (sum, item) => sum + item.resolvedWeight,
    0,
  );
  const weightedAverage = (
    selector: (item: (typeof weighted)[number]) => number,
  ) =>
    weighted.reduce(
      (sum, item) => sum + selector(item) * item.resolvedWeight,
      0,
    ) / totalWeight;
  const rawPreviousAllocation = weightedAverage(
    (item) => item.previousAllocation,
  );
  const rawTargetAllocation = weightedAverage(
    (item) => item.targetAllocation,
  );
  const increasePressure = weightedAverage((item) =>
    Math.max(item.targetAllocation - item.previousAllocation, 0),
  );
  const reducePressure = weightedAverage((item) =>
    Math.max(item.previousAllocation - item.targetAllocation, 0),
  );
  const agreement = Math.max(
    0,
    1 -
      weightedAverage((item) =>
        Math.abs(item.targetAllocation - rawTargetAllocation),
      ),
  );
  const bullishCount = weighted.filter(
    (item) => item.targetAllocation >= 0.6,
  ).length;
  const bearishCount = weighted.filter(
    (item) => item.targetAllocation <= 0.4,
  ).length;

  let action: StrategyConsensusAction;
  if (rawTargetAllocation <= 0.25 && reducePressure >= 0.08) {
    action = "sell";
  } else if (rawTargetAllocation < 0.5 && reducePressure >= 0.05) {
    action = "reduce";
  } else if (rawTargetAllocation >= 0.65 && increasePressure >= 0.08) {
    action = rawPreviousAllocation <= 0.1 ? "buy" : "add";
  } else if (rawTargetAllocation >= 0.55 && increasePressure >= 0.05) {
    action = rawPreviousAllocation <= 0.1 ? "buy" : "add";
  } else if (rawTargetAllocation >= 0.45) {
    action = "hold";
  } else {
    action = "wait";
  }

  const confidence: StrategyConsensusConfidence =
    weighted.length >= 3 && agreement >= 0.72
      ? "high"
      : weighted.length >= 2 && agreement >= 0.58
        ? "medium"
        : "low";

  return {
    action,
    confidence,
    previousAllocation: roundedPosition(rawPreviousAllocation),
    targetAllocation: roundedPosition(rawTargetAllocation),
    agreement,
    increasePressure,
    reducePressure,
    evidenceCount: weighted.length,
    bullishCount,
    bearishCount,
  };
}
