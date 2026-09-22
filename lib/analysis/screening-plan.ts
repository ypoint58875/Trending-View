import type { ScreeningCombinationResult, ScreeningSingleResult } from "./screening-validation";
import {
  STRATEGY_SLOTS,
  resolveTacticalAllocationMode,
  type StrategyAllocationPlan,
} from "./strategy-combinations";
import type { StrategyId, StrategyParameters } from "./strategies";

export function singleScreeningResultPlan(
  result: ScreeningSingleResult,
): StrategyAllocationPlan {
  return {
    strategyA: {
      strategyId: result.strategyId,
      parameters: { ...result.parameters },
    },
    strategyB: null,
    strategyAAllocation: 1,
    strategyBAllocation: 0,
    strategyAEntryFilter: result.entryFilter ?? null,
    strategyBEntryFilter: null,
  };
}

export function combinationScreeningResultPlan(
  result: ScreeningCombinationResult,
): StrategyAllocationPlan {
  const source = result as ScreeningCombinationResult & Record<string, unknown>;
  return {
    ...Object.fromEntries(
      STRATEGY_SLOTS.flatMap((slot) => {
        const id = source[`${slot}Id`] as StrategyId | null | undefined;
        const parameters = source[`${slot}Parameters`] as
          | StrategyParameters
          | null
          | undefined;
        return [
          [slot, id && parameters ? { strategyId: id, parameters: { ...parameters } } : null],
          [`${slot}Allocation`, source[`${slot}Allocation`] ?? 0],
          [`${slot}EntryFilter`, source[`${slot}EntryFilter`] ?? null],
        ];
      }),
    ),
    tacticalMode: resolveTacticalAllocationMode(result.tacticalMode),
  } as StrategyAllocationPlan;
}

export function screeningResultPlan(
  result: ScreeningSingleResult | ScreeningCombinationResult,
): StrategyAllocationPlan {
  return "strategyId" in result
    ? singleScreeningResultPlan(result)
    : combinationScreeningResultPlan(result);
}
