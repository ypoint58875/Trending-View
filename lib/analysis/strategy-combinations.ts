import type {
  MarketBar,
  MarketInterval,
  MarketLatestBarStatus,
} from "@/lib/market/types";
import {
  runAllocationBacktest,
  runBacktestFromTarget,
  type AllocationIntrabarExecution,
  type AllocationSignalEvent,
  type AllocationBacktestResult,
  type BacktestResult,
  type BacktestSettings,
} from "./backtest";
import {
  DEFAULT_SCREENING_YIELD_EVERY,
  MAX_SCREENING_RESULTS_PER_CATEGORY,
  buildScreeningCandidates,
  compareScreeningResults,
  yieldForScreening,
  type ScreeningCandidate,
  type ScreeningObjective,
} from "./screening";
import {
  STRATEGIES,
  areStrategiesEquivalent,
  getStrategy,
  type StrategyId,
  type StrategyParameters,
} from "./strategies";
import {
  buildStrategyOrderTimeline,
  type StrategyOrderFill,
} from "./strategy-execution";
import type { StrategyOrderSeries } from "./strategy-orders";
import {
  applyMovingAverageSlopeEntryFilter,
  buildMovingAverageEntryAllowedSeries,
  cloneMovingAverageSlopeFilter,
  resolveMovingAverageEntryAllowedSeries,
  supportsScreeningMovingAverageSlopeFilter,
  type MovingAverageSlopeFilter,
} from "./entry-filter";

export const DEFAULT_STRATEGY_A_ALLOCATION = 0.6;
export const DEFAULT_STRATEGY_B_ALLOCATION = 0.4;
export const DEFAULT_TACTICAL_ALLOCATION_MODE = "add-on-short-entry" as const;
export const MULTI_STRATEGY_CONSENSUS_ENTRY_WEIGHT = 0.6;
export const MULTI_STRATEGY_CONSENSUS_EXIT_WEIGHT = 0.4;
export const TACTICAL_ALLOCATION_MODES = [
  DEFAULT_TACTICAL_ALLOCATION_MODE,
  "reduce-on-short-exit",
] as const;
export type TacticalAllocationMode =
  (typeof TACTICAL_ALLOCATION_MODES)[number];
export const ALLOWED_POSITION_LEVELS = [
  0,
  0.3,
  0.4,
  0.5,
  0.6,
  0.7,
  1,
] as const;
export const STRATEGY_LAYER_ALLOCATION_CANDIDATES = [
  0.3,
  0.4,
  0.5,
  0.6,
  0.7,
] as const;
export const COMBINATION_FINALISTS_PER_STRATEGY = 3;
export const ROLLING_SINGLE_FINALISTS_PER_STRATEGY = 10;
export const SCREENING_ENTRY_FILTER_FINALISTS_PER_STRATEGY = 60;
export const MAX_COMBINATION_PAIR_FINALISTS = 4_096;
export const MAX_COMBINATION_RESULTS = MAX_SCREENING_RESULTS_PER_CATEGORY;
export const MAX_MULTI_STRATEGY_RESULTS_PER_PRIMARY = 5;
export const MAX_MULTI_STRATEGY_FINALISTS_PER_PRIMARY = 20;
export const MAX_MULTI_STRATEGY_FINALISTS_PER_LEVEL =
  MAX_MULTI_STRATEGY_FINALISTS_PER_PRIMARY * STRATEGIES.length;
export const MAX_TRIPLE_PARENT_PAIRS =
  MAX_MULTI_STRATEGY_FINALISTS_PER_LEVEL;
export const MAX_TRIPLE_REFERENCE_FINALISTS =
  MAX_MULTI_STRATEGY_FINALISTS_PER_LEVEL;
export const MAX_QUADRUPLE_PARENT_TRIPLES =
  MAX_MULTI_STRATEGY_FINALISTS_PER_LEVEL;
export const MAX_QUADRUPLE_REFERENCE_FINALISTS =
  MAX_MULTI_STRATEGY_FINALISTS_PER_LEVEL;
export const MAX_QUINTUPLE_PARENT_QUADRUPLES =
  MAX_MULTI_STRATEGY_FINALISTS_PER_LEVEL;
export const MAX_QUINTUPLE_REFERENCE_FINALISTS =
  MAX_MULTI_STRATEGY_FINALISTS_PER_LEVEL;

export interface TwoStrategyAllocation {
  strategyAAllocation: number;
  strategyBAllocation: number;
  tacticalMode?: TacticalAllocationMode;
}

export interface ThreeStrategyAllocation extends TwoStrategyAllocation {
  strategyCAllocation: number;
}

export interface FourStrategyAllocation extends ThreeStrategyAllocation {
  strategyDAllocation: number;
}

export interface FiveStrategyAllocation extends FourStrategyAllocation {
  strategyEAllocation: number;
}

export interface SixStrategyAllocation extends FiveStrategyAllocation {
  strategyFAllocation: number;
}

export interface SevenStrategyAllocation extends SixStrategyAllocation {
  strategyGAllocation: number;
}

export interface EightStrategyAllocation extends SevenStrategyAllocation {
  strategyHAllocation: number;
}

export interface NineStrategyAllocation extends EightStrategyAllocation {
  strategyIAllocation: number;
}

export type HigherOrderStrategyCount = 4 | 5 | 6 | 7 | 8 | 9;
export type HigherOrderStrategyAllocation =
  | FourStrategyAllocation
  | FiveStrategyAllocation
  | SixStrategyAllocation
  | SevenStrategyAllocation
  | EightStrategyAllocation
  | NineStrategyAllocation;

export const TWO_STRATEGY_ALLOCATION_CANDIDATES: readonly TwoStrategyAllocation[] =
  TACTICAL_ALLOCATION_MODES.flatMap((tacticalMode) => [
    {
      strategyAAllocation: DEFAULT_STRATEGY_A_ALLOCATION,
      strategyBAllocation: DEFAULT_STRATEGY_B_ALLOCATION,
      tacticalMode,
    },
    {
      strategyAAllocation: DEFAULT_STRATEGY_B_ALLOCATION,
      strategyBAllocation: DEFAULT_STRATEGY_A_ALLOCATION,
      tacticalMode,
    },
    {
      strategyAAllocation: 0.5,
      strategyBAllocation: 0.5,
      tacticalMode,
    },
    {
      strategyAAllocation: 0.7,
      strategyBAllocation: 0.3,
      tacticalMode,
    },
    {
      strategyAAllocation: 0.3,
      strategyBAllocation: 0.7,
      tacticalMode,
    },
  ]);

export const THREE_STRATEGY_ALLOCATION_CANDIDATES: readonly ThreeStrategyAllocation[] =
  (() => {
    const allocations: ThreeStrategyAllocation[] = [];
    for (let strategyATenths = 1; strategyATenths <= 8; strategyATenths += 1) {
      for (
        let strategyBTenths = 1;
        strategyBTenths <= 9 - strategyATenths;
        strategyBTenths += 1
      ) {
        const strategyCTenths = 10 - strategyATenths - strategyBTenths;
        if (strategyCTenths < 1) continue;
        allocations.push({
          strategyAAllocation: strategyATenths / 10,
          strategyBAllocation: strategyBTenths / 10,
          strategyCAllocation: strategyCTenths / 10,
          tacticalMode: DEFAULT_TACTICAL_ALLOCATION_MODE,
        });
      }
    }
    return allocations;
  })();

function buildPositiveTenthAllocations(
  strategyCount: HigherOrderStrategyCount,
): number[][] {
  const allocations: number[][] = [];
  const build = (remainingTenths: number, current: number[]) => {
    if (current.length === strategyCount - 1) {
      if (remainingTenths >= 1) {
        allocations.push([...current, remainingTenths].map((value) => value / 10));
      }
      return;
    }
    const remainingSlots = strategyCount - current.length - 1;
    for (
      let allocation = 1;
      allocation <= remainingTenths - remainingSlots;
      allocation += 1
    ) {
      build(remainingTenths - allocation, [...current, allocation]);
    }
  };
  build(10, []);
  return allocations;
}

export const FOUR_STRATEGY_ALLOCATION_CANDIDATES: readonly FourStrategyAllocation[] =
  buildPositiveTenthAllocations(4).map(
      ([strategyAAllocation, strategyBAllocation, strategyCAllocation, strategyDAllocation]) => ({
        strategyAAllocation,
        strategyBAllocation,
        strategyCAllocation,
        strategyDAllocation,
        tacticalMode: DEFAULT_TACTICAL_ALLOCATION_MODE,
      }),
  );

export const FIVE_STRATEGY_ALLOCATION_CANDIDATES: readonly FiveStrategyAllocation[] =
  buildPositiveTenthAllocations(5).map(
      ([strategyAAllocation, strategyBAllocation, strategyCAllocation, strategyDAllocation, strategyEAllocation]) => ({
        strategyAAllocation,
        strategyBAllocation,
        strategyCAllocation,
        strategyDAllocation,
        strategyEAllocation,
        tacticalMode: DEFAULT_TACTICAL_ALLOCATION_MODE,
      }),
  );

function buildHigherOrderAllocationCandidates<T extends HigherOrderStrategyAllocation>(
  strategyCount: HigherOrderStrategyCount,
): readonly T[] {
  const allocationSlots = [
    "strategyA",
    "strategyB",
    "strategyC",
    "strategyD",
    "strategyE",
    "strategyF",
    "strategyG",
    "strategyH",
    "strategyI",
  ] as const;
  return buildPositiveTenthAllocations(strategyCount).map((allocations) => ({
    ...Object.fromEntries(
      allocations.map((allocation, index) => [
        `${allocationSlots[index]}Allocation`,
        allocation,
      ]),
    ),
    tacticalMode: DEFAULT_TACTICAL_ALLOCATION_MODE,
  })) as unknown as readonly T[];
}

export const SIX_STRATEGY_ALLOCATION_CANDIDATES =
  buildHigherOrderAllocationCandidates<SixStrategyAllocation>(6);
export const SEVEN_STRATEGY_ALLOCATION_CANDIDATES =
  buildHigherOrderAllocationCandidates<SevenStrategyAllocation>(7);
export const EIGHT_STRATEGY_ALLOCATION_CANDIDATES =
  buildHigherOrderAllocationCandidates<EightStrategyAllocation>(8);
export const NINE_STRATEGY_ALLOCATION_CANDIDATES =
  buildHigherOrderAllocationCandidates<NineStrategyAllocation>(9);

export interface StrategySelection {
  strategyId: StrategyId;
  parameters: StrategyParameters;
}

export interface StrategyAllocationPlan {
  strategyA: StrategySelection | null;
  strategyB: StrategySelection | null;
  strategyC?: StrategySelection | null;
  strategyD?: StrategySelection | null;
  strategyE?: StrategySelection | null;
  strategyF?: StrategySelection | null;
  strategyG?: StrategySelection | null;
  strategyH?: StrategySelection | null;
  strategyI?: StrategySelection | null;
  strategyAAllocation: number;
  strategyBAllocation: number;
  strategyCAllocation?: number;
  strategyDAllocation?: number;
  strategyEAllocation?: number;
  strategyFAllocation?: number;
  strategyGAllocation?: number;
  strategyHAllocation?: number;
  strategyIAllocation?: number;
  tacticalMode?: TacticalAllocationMode;
  strategyAEntryFilter?: MovingAverageSlopeFilter | null;
  strategyBEntryFilter?: MovingAverageSlopeFilter | null;
  strategyCEntryFilter?: MovingAverageSlopeFilter | null;
  strategyDEntryFilter?: MovingAverageSlopeFilter | null;
  strategyEEntryFilter?: MovingAverageSlopeFilter | null;
  strategyFEntryFilter?: MovingAverageSlopeFilter | null;
  strategyGEntryFilter?: MovingAverageSlopeFilter | null;
  strategyHEntryFilter?: MovingAverageSlopeFilter | null;
  strategyIEntryFilter?: MovingAverageSlopeFilter | null;
  /** Legacy shared filter, read only for backward compatibility. */
  entryFilter?: MovingAverageSlopeFilter | null;
}

export interface StrategyCombination {
  strategyAId: StrategyId;
  strategyAParameters: StrategyParameters;
  strategyBId: StrategyId;
  strategyBParameters: StrategyParameters;
  strategyCId?: StrategyId;
  strategyCParameters?: StrategyParameters;
  strategyDId?: StrategyId;
  strategyDParameters?: StrategyParameters;
  strategyEId?: StrategyId;
  strategyEParameters?: StrategyParameters;
  strategyFId?: StrategyId;
  strategyFParameters?: StrategyParameters;
  strategyGId?: StrategyId;
  strategyGParameters?: StrategyParameters;
  strategyHId?: StrategyId;
  strategyHParameters?: StrategyParameters;
  strategyIId?: StrategyId;
  strategyIParameters?: StrategyParameters;
  strategyAAllocation: number;
  strategyBAllocation: number;
  strategyCAllocation?: number;
  strategyDAllocation?: number;
  strategyEAllocation?: number;
  strategyFAllocation?: number;
  strategyGAllocation?: number;
  strategyHAllocation?: number;
  strategyIAllocation?: number;
  tacticalMode?: TacticalAllocationMode;
  strategyAEntryFilter?: MovingAverageSlopeFilter | null;
  strategyBEntryFilter?: MovingAverageSlopeFilter | null;
  strategyCEntryFilter?: MovingAverageSlopeFilter | null;
  strategyDEntryFilter?: MovingAverageSlopeFilter | null;
  strategyEEntryFilter?: MovingAverageSlopeFilter | null;
  strategyFEntryFilter?: MovingAverageSlopeFilter | null;
  strategyGEntryFilter?: MovingAverageSlopeFilter | null;
  strategyHEntryFilter?: MovingAverageSlopeFilter | null;
  strategyIEntryFilter?: MovingAverageSlopeFilter | null;
  /** Legacy shared filter, read only for backward compatibility. */
  entryFilter?: MovingAverageSlopeFilter | null;
}

export interface StrategyCombinationResult extends AllocationBacktestResult {
  strategyAId: StrategyId;
  strategyAParameters: StrategyParameters;
  strategyBId: StrategyId;
  strategyBParameters: StrategyParameters;
  strategyCId?: StrategyId;
  strategyCParameters?: StrategyParameters;
  strategyDId?: StrategyId;
  strategyDParameters?: StrategyParameters;
  strategyEId?: StrategyId;
  strategyEParameters?: StrategyParameters;
  strategyFId?: StrategyId;
  strategyFParameters?: StrategyParameters;
  strategyGId?: StrategyId;
  strategyGParameters?: StrategyParameters;
  strategyHId?: StrategyId;
  strategyHParameters?: StrategyParameters;
  strategyIId?: StrategyId;
  strategyIParameters?: StrategyParameters;
  strategyAAllocation: number;
  strategyBAllocation: number;
  strategyCAllocation?: number;
  strategyDAllocation?: number;
  strategyEAllocation?: number;
  strategyFAllocation?: number;
  strategyGAllocation?: number;
  strategyHAllocation?: number;
  strategyIAllocation?: number;
  tacticalMode?: TacticalAllocationMode;
  relativeLongStrategy: StrategySlot;
  strategyAEntryFilter?: MovingAverageSlopeFilter | null;
  strategyBEntryFilter?: MovingAverageSlopeFilter | null;
  strategyCEntryFilter?: MovingAverageSlopeFilter | null;
  strategyDEntryFilter?: MovingAverageSlopeFilter | null;
  strategyEEntryFilter?: MovingAverageSlopeFilter | null;
  strategyFEntryFilter?: MovingAverageSlopeFilter | null;
  strategyGEntryFilter?: MovingAverageSlopeFilter | null;
  strategyHEntryFilter?: MovingAverageSlopeFilter | null;
  strategyIEntryFilter?: MovingAverageSlopeFilter | null;
  /** Legacy shared-filter compatibility; new results leave this unset. */
  entryFilter?: MovingAverageSlopeFilter | null;
}

export type StrategySlot =
  | "strategyA"
  | "strategyB"
  | "strategyC"
  | "strategyD"
  | "strategyE"
  | "strategyF"
  | "strategyG"
  | "strategyH"
  | "strategyI";

export const STRATEGY_SLOTS: readonly StrategySlot[] = [
  "strategyA",
  "strategyB",
  "strategyC",
  "strategyD",
  "strategyE",
  "strategyF",
  "strategyG",
  "strategyH",
  "strategyI",
];

export type CombinationScreeningStage =
  | "strategies"
  | "entryFilters"
  | "pairs"
  | "allocations"
  | "triples"
  | "tripleAllocations"
  | "quadruples"
  | "quadrupleAllocations"
  | "quintuples"
  | "quintupleAllocations"
  | "sextuples"
  | "sextupleAllocations"
  | "septuples"
  | "septupleAllocations"
  | "octuples"
  | "octupleAllocations"
  | "nonuples"
  | "nonupleAllocations";

export interface CombinationScreeningProgress {
  completed: number;
  total: number;
  stageCompleted: number;
  stageTotal: number;
  failed: number;
  stage: CombinationScreeningStage;
  strategyAId: StrategyId | null;
  strategyBId: StrategyId | null;
  strategyCId?: StrategyId | null;
  strategyDId?: StrategyId | null;
  strategyEId?: StrategyId | null;
  strategyFId?: StrategyId | null;
  strategyGId?: StrategyId | null;
  strategyHId?: StrategyId | null;
  strategyIId?: StrategyId | null;
}

export interface CombinationOptimizationResult {
  singleResults: BacktestResult[];
  singleCandidatePool: BacktestResult[];
  results: StrategyCombinationResult[];
  evaluatedCount: number;
  totalCandidates: number;
  failedCount: number;
  cancelled: boolean;
}

export interface OptimizeStrategyCombinationsOptions {
  candidates?: readonly ScreeningCandidate[];
  excludedStrategyIds?: readonly StrategyId[];
  objective?: ScreeningObjective;
  entryFilters?: readonly MovingAverageSlopeFilter[];
  allocationCandidates?: readonly TwoStrategyAllocation[];
  tripleAllocationCandidates?: readonly ThreeStrategyAllocation[];
  quadrupleAllocationCandidates?: readonly FourStrategyAllocation[];
  quintupleAllocationCandidates?: readonly FiveStrategyAllocation[];
  sextupleAllocationCandidates?: readonly SixStrategyAllocation[];
  septupleAllocationCandidates?: readonly SevenStrategyAllocation[];
  octupleAllocationCandidates?: readonly EightStrategyAllocation[];
  nonupleAllocationCandidates?: readonly NineStrategyAllocation[];
  includeTriples?: boolean;
  retainedSinglesPerStrategy?: number;
  maxPairFinalists?: number;
  maxTripleParentPairs?: number;
  maxTripleFinalists?: number;
  maxQuadrupleParentTriples?: number;
  maxQuadrupleFinalists?: number;
  maxQuintupleParentQuadruples?: number;
  maxQuintupleFinalists?: number;
  signal?: AbortSignal;
  yieldEvery?: number;
  onProgress?: (progress: CombinationScreeningProgress) => void;
}

interface StrategyFinalist {
  result: BacktestResult;
  target: number[];
  orderFills: StrategyOrderFill[][];
}

interface EntryFilterCandidate {
  result: BacktestResult;
  rawTarget: number[] | null;
  rawOrders?: StrategyOrderSeries;
}

interface StrategyPairFinalist {
  strategyA: StrategyFinalist;
  strategyB: StrategyFinalist;
  referenceResult: StrategyCombinationResult;
  settings: StrategyCombinationBacktestSettings;
}

type StrategyCombinationBacktestSettings = Omit<
  BacktestSettings,
  "interval"
> & {
  interval: MarketInterval;
};

function normalizeAllocation(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, 0), 1);
}

function assertAllocationPlanBounds(
  ...allocations: readonly number[]
) {
  if (
    allocations.some(
      (allocation) =>
        !Number.isFinite(allocation) || allocation < 0 || allocation > 1,
    ) ||
    allocations.reduce((sum, allocation) => sum + allocation, 0) > 1 + 1e-10
  ) {
    throw new Error(
      "Strategy allocations must be between zero and one and their sum cannot exceed one",
    );
  }
}

export function resolveTacticalAllocationMode(
  value: TacticalAllocationMode | null | undefined,
): TacticalAllocationMode {
  return value === "reduce-on-short-exit"
    ? value
    : DEFAULT_TACTICAL_ALLOCATION_MODE;
}

function assertAlignedTargets(
  targets: readonly (readonly number[] | null)[],
) {
  const aligned = targets.filter(
    (target): target is readonly number[] => target !== null,
  );
  if (aligned.length === 0) {
    throw new Error("At least one strategy target is required");
  }
  if (aligned.some((target) => target.length !== aligned[0].length)) {
    throw new Error("Strategy targets must align");
  }
}

interface StrategyTripleFinalist {
  strategyA: StrategyFinalist;
  strategyB: StrategyFinalist;
  strategyC: StrategyFinalist;
  referenceResult: StrategyCombinationResult;
  settings: StrategyCombinationBacktestSettings;
}

interface StrategyGroupFinalist {
  strategies: StrategyFinalist[];
  referenceResult: StrategyCombinationResult;
  settings: StrategyCombinationBacktestSettings;
}

export function buildStrategyPlanAllocationTarget(
  strategyATarget: readonly number[] | null,
  strategyBTarget: readonly number[] | null,
  strategyAAllocation: number,
  strategyBAllocation: number,
  tacticalMode: TacticalAllocationMode = DEFAULT_TACTICAL_ALLOCATION_MODE,
): number[] {
  return buildStrategyPlanTimelineFromTargets(
    strategyATarget,
    strategyBTarget,
    strategyAAllocation,
    strategyBAllocation,
    undefined,
    undefined,
    tacticalMode,
  ).target;
}

function buildSingleStrategyTimeline(
  sourceTarget: readonly number[],
): StrategyPlanTimeline {
  let wasActive = false;
  const target: number[] = [];
  const signalEvents: AllocationSignalEvent[][] = [];
  const layerStates: StrategyLayerState[] = [];

  sourceTarget.forEach((state) => {
    const active = state > 0;
    const events: AllocationSignalEvent[] = [];
    if (!wasActive && active) events.push("long-entry");
    if (wasActive && !active) events.push("long-exit");
    target.push(active ? 1 : 0);
    signalEvents.push(events);
    layerStates.push({ gateActive: active, activeTacticalSlots: [] });
    wasActive = active;
  });

  return {
    target,
    signalEvents,
    relativeLongStrategy: null,
    layerStates,
  };
}

export interface StrategySignalHorizon {
  averageActiveBars: number;
  activeRunCount: number;
  transitionCount: number;
}

export function summarizeStrategySignalHorizon(
  sourceTarget: readonly number[],
): StrategySignalHorizon {
  let activeBars = 0;
  let activeRunCount = 0;
  let transitionCount = 0;
  let wasActive = false;

  sourceTarget.forEach((state, index) => {
    const active = state > 0;
    if (active) activeBars += 1;
    if (active && !wasActive) activeRunCount += 1;
    if (index > 0 && active !== wasActive) transitionCount += 1;
    wasActive = active;
  });

  return {
    averageActiveBars:
      activeRunCount > 0 ? activeBars / activeRunCount : 0,
    activeRunCount,
    transitionCount,
  };
}

export function resolveRelativeLongStrategy(
  strategyATarget: readonly number[],
  strategyBTarget: readonly number[],
): StrategySlot {
  return resolveCoreStrategy([
    { slot: "strategyA", target: strategyATarget, allocation: 0 },
    { slot: "strategyB", target: strategyBTarget, allocation: 0 },
  ]);
}

interface StrategyTargetLeg {
  slot: StrategySlot;
  target: readonly number[];
  allocation: number;
}

interface StrategyLayerState {
  gateActive: boolean;
  activeTacticalSlots: StrategySlot[];
}

const STRATEGY_SLOT_ORDER = STRATEGY_SLOTS;

function resolveCoreStrategy(legs: readonly StrategyTargetLeg[]): StrategySlot {
  return [...legs]
    .map((leg) => ({
      ...leg,
      horizon: summarizeStrategySignalHorizon(leg.target),
    }))
    .sort((left, right) => {
      const averageDifference =
        right.horizon.averageActiveBars - left.horizon.averageActiveBars;
      if (Math.abs(averageDifference) > 1e-10) return averageDifference;
      if (left.horizon.transitionCount !== right.horizon.transitionCount) {
        return left.horizon.transitionCount - right.horizon.transitionCount;
      }
      return (
        STRATEGY_SLOT_ORDER.indexOf(left.slot) -
        STRATEGY_SLOT_ORDER.indexOf(right.slot)
      );
    })[0]!.slot;
}

function pushUniqueSignal(
  events: AllocationSignalEvent[],
  event: AllocationSignalEvent,
) {
  if (!events.includes(event)) events.push(event);
}

function buildHierarchicalStrategyTimeline(
  legs: readonly StrategyTargetLeg[],
  coreStrategy: StrategySlot,
  tacticalMode: TacticalAllocationMode,
): StrategyPlanTimeline {
  const coreLeg = legs.find((leg) => leg.slot === coreStrategy);
  if (!coreLeg) throw new Error("The core strategy must be selected");
  const tacticalLegs = legs.filter((leg) => leg.slot !== coreStrategy);
  let coreWasActive = false;
  const previousTacticalSignals = new Map<StrategySlot, boolean>();
  const activeTacticalSlots = new Set<StrategySlot>();
  const target: number[] = [];
  const signalEvents: AllocationSignalEvent[][] = [];
  const layerStates: StrategyLayerState[] = [];

  coreLeg.target.forEach((coreState, index) => {
    const coreActive = coreState > 0;
    const events: AllocationSignalEvent[] = [];

    if (!coreActive) {
      if (coreWasActive) {
        events.push("long-exit");
        if (activeTacticalSlots.size > 0) events.push("short-exit");
      }
      activeTacticalSlots.clear();
      target.push(0);
    } else if (!coreWasActive) {
      events.push("long-entry");
      activeTacticalSlots.clear();
      if (tacticalMode === "reduce-on-short-exit") {
        tacticalLegs.forEach((leg) => activeTacticalSlots.add(leg.slot));
      }
      target.push(
        coreLeg.allocation +
          tacticalLegs.reduce(
            (sum, leg) =>
              sum + (activeTacticalSlots.has(leg.slot) ? leg.allocation : 0),
            0,
          ),
      );
    } else {
      tacticalLegs.forEach((leg) => {
        const signalActive = (leg.target[index] ?? 0) > 0;
        const signalWasActive = previousTacticalSignals.get(leg.slot) ?? false;
        const layerActive = activeTacticalSlots.has(leg.slot);
        const shouldExit =
          layerActive &&
          (tacticalMode === "reduce-on-short-exit"
            ? signalWasActive && !signalActive
            : !signalActive);
        if (shouldExit) {
          activeTacticalSlots.delete(leg.slot);
          pushUniqueSignal(events, "short-exit");
        } else if (!layerActive && !signalWasActive && signalActive) {
          activeTacticalSlots.add(leg.slot);
          pushUniqueSignal(events, "short-entry");
        }
      });
      target.push(
        coreLeg.allocation +
          tacticalLegs.reduce(
            (sum, leg) =>
              sum + (activeTacticalSlots.has(leg.slot) ? leg.allocation : 0),
            0,
          ),
      );
    }

    signalEvents.push(events);
    layerStates.push({
      gateActive: coreActive,
      activeTacticalSlots: STRATEGY_SLOT_ORDER.filter((slot) =>
        activeTacticalSlots.has(slot),
      ),
    });
    coreWasActive = coreActive;
    tacticalLegs.forEach((leg) => {
      previousTacticalSignals.set(leg.slot, (leg.target[index] ?? 0) > 0);
    });
  });

  return {
    target,
    signalEvents,
    relativeLongStrategy: coreStrategy,
    layerStates,
  };
}

function buildWeightedConsensusStrategyTimeline(
  legs: readonly StrategyTargetLeg[],
  referenceStrategy: StrategySlot,
): StrategyPlanTimeline {
  const totalWeight = legs.reduce((sum, leg) => sum + leg.allocation, 0);
  if (totalWeight <= 0) {
    throw new Error("A consensus plan requires positive strategy weights");
  }
  const entrySupportCount = Math.floor(legs.length / 2) + 1;
  const exitSupportCount = Math.ceil(legs.length / 2);
  let positionActive = false;
  const target: number[] = [];
  const signalEvents: AllocationSignalEvent[][] = [];
  const layerStates: StrategyLayerState[] = [];

  legs[0].target.forEach((_, index) => {
    const activeLegs = legs.filter((leg) => (leg.target[index] ?? 0) > 0);
    const activeWeight =
      activeLegs.reduce((sum, leg) => sum + leg.allocation, 0) / totalWeight;
    const shouldEnter =
      !positionActive &&
      activeLegs.length >= entrySupportCount &&
      activeWeight >= MULTI_STRATEGY_CONSENSUS_ENTRY_WEIGHT - 1e-10;
    const shouldExit =
      positionActive &&
      (activeLegs.length < exitSupportCount ||
        activeWeight <= MULTI_STRATEGY_CONSENSUS_EXIT_WEIGHT + 1e-10);
    const events: AllocationSignalEvent[] = [];
    if (shouldEnter) {
      positionActive = true;
      events.push("long-entry");
    } else if (shouldExit) {
      positionActive = false;
      events.push("long-exit");
    }
    target.push(positionActive ? 1 : 0);
    signalEvents.push(events);
    layerStates.push({ gateActive: positionActive, activeTacticalSlots: [] });
  });

  return {
    target,
    signalEvents,
    relativeLongStrategy: referenceStrategy,
    layerStates,
  };
}

export interface StrategyPlanTimeline {
  target: number[];
  signalEvents: AllocationSignalEvent[][];
  relativeLongStrategy: StrategySlot | null;
  intrabarExecutions?: AllocationIntrabarExecution[][];
  layerStates?: StrategyLayerState[];
}

type StrategyRoleTargets = Partial<Record<StrategySlot, readonly number[]>> & {
  strategyA: readonly number[];
  strategyB: readonly number[];
};

function selectRoleTargetWindow(
  bars: readonly MarketBar[],
  target: readonly number[],
  roleWindow?: Pick<BacktestSettings, "startTime" | "endTime">,
): number[] {
  if (!roleWindow?.startTime && !roleWindow?.endTime) return [...target];
  return target.filter((_, index) => {
    const time = bars[index].time;
    return (
      (!roleWindow.startTime || time >= roleWindow.startTime) &&
      (!roleWindow.endTime || time <= roleWindow.endTime)
    );
  });
}

export function buildStrategyPlanTimelineFromTargets(
  strategyATarget: readonly number[] | null,
  strategyBTarget: readonly number[] | null,
  strategyAAllocation: number,
  strategyBAllocation: number,
  roleTargets?: StrategyRoleTargets,
  fixedRelativeLongStrategy?: StrategySlot,
  tacticalMode: TacticalAllocationMode = DEFAULT_TACTICAL_ALLOCATION_MODE,
): StrategyPlanTimeline {
  return buildMultiStrategyPlanTimelineFromTargets(
    [
      strategyATarget
        ? {
            slot: "strategyA",
            target: strategyATarget,
            allocation: strategyAAllocation,
          }
        : null,
      strategyBTarget
        ? {
            slot: "strategyB",
            target: strategyBTarget,
            allocation: strategyBAllocation,
          }
        : null,
    ],
    roleTargets,
    fixedRelativeLongStrategy,
    tacticalMode,
  );
}

function buildMultiStrategyPlanTimelineFromTargets(
  requestedLegs: readonly (StrategyTargetLeg | null)[],
  roleTargets: StrategyRoleTargets | undefined,
  fixedCoreStrategy: StrategySlot | undefined,
  tacticalMode: TacticalAllocationMode,
): StrategyPlanTimeline {
  const legs = requestedLegs.filter(
    (leg): leg is StrategyTargetLeg => leg !== null,
  );
  assertAlignedTargets(legs.map((leg) => leg.target));
  assertAllocationPlanBounds(
    ...STRATEGY_SLOTS.map(
      (slot) => legs.find((leg) => leg.slot === slot)?.allocation ?? 0,
    ),
  );
  if (legs.length === 1) return buildSingleStrategyTimeline(legs[0].target);

  const roleLegs = legs.map((leg) => ({
    ...leg,
    target: roleTargets?.[leg.slot] ?? leg.target,
  }));
  const coreStrategy = fixedCoreStrategy ?? resolveCoreStrategy(roleLegs);
  if (!legs.some((leg) => leg.slot === coreStrategy)) {
    throw new Error("The fixed core strategy must be selected");
  }
  if (legs.length >= 3) {
    return buildWeightedConsensusStrategyTimeline(legs, coreStrategy);
  }
  return buildHierarchicalStrategyTimeline(
    legs,
    coreStrategy,
    tacticalMode,
  );
}

export function buildThreeStrategyPlanTimelineFromTargets(
  strategyATarget: readonly number[],
  strategyBTarget: readonly number[],
  strategyCTarget: readonly number[],
  strategyAAllocation: number,
  strategyBAllocation: number,
  strategyCAllocation: number,
  roleTargets?: StrategyRoleTargets,
  fixedCoreStrategy?: StrategySlot,
  tacticalMode: TacticalAllocationMode = DEFAULT_TACTICAL_ALLOCATION_MODE,
): StrategyPlanTimeline {
  return buildMultiStrategyPlanTimelineFromTargets(
    [
      {
        slot: "strategyA",
        target: strategyATarget,
        allocation: strategyAAllocation,
      },
      {
        slot: "strategyB",
        target: strategyBTarget,
        allocation: strategyBAllocation,
      },
      {
        slot: "strategyC",
        target: strategyCTarget,
        allocation: strategyCAllocation,
      },
    ],
    roleTargets,
    fixedCoreStrategy,
    tacticalMode,
  );
}

function buildSelectionTarget(
  bars: MarketBar[],
  selection: StrategySelection | null,
): number[] | null {
  if (!selection) return null;
  const strategy = getStrategy(selection.strategyId);
  return strategy.buildTarget(bars, selection.parameters);
}

interface StrategyExecutionSeries {
  target: number[] | null;
  orderFills: StrategyOrderFill[][];
  orders?: StrategyOrderSeries;
}

function buildStrategyExecutionSeries(
  bars: MarketBar[],
  selection: StrategySelection | null,
  fallbackTarget: readonly number[] | null,
  entryAllowed: readonly boolean[] | null = null,
  cachedOrders?: StrategyOrderSeries,
): StrategyExecutionSeries {
  if (!selection) {
    return {
      target: null,
      orderFills: Array.from({ length: bars.length }, () => []),
    };
  }
  const strategy = getStrategy(selection.strategyId);
  const orders =
    cachedOrders ?? strategy.buildOrders?.(bars, selection.parameters);
  if (!orders) {
    if (!fallbackTarget) {
      throw new Error("A target strategy requires an aligned target");
    }
    return {
      target: applyMovingAverageSlopeEntryFilter(
        fallbackTarget,
        entryAllowed,
      ),
      orderFills: Array.from({ length: bars.length }, () => []),
    };
  }
  if (orders.length !== bars.length) {
    throw new Error("Strategy execution plan must align with market bars");
  }

  const execution = buildStrategyOrderTimeline(
    bars,
    orders,
    entryAllowed,
  );
  return {
    target: execution.target,
    orderFills: execution.fills,
    orders,
  };
}

function planEntryFilter(
  plan: StrategyAllocationPlan,
  slot: StrategySlot,
): MovingAverageSlopeFilter | null {
  const slotFilter = {
    strategyA: plan.strategyAEntryFilter,
    strategyB: plan.strategyBEntryFilter,
    strategyC: plan.strategyCEntryFilter,
    strategyD: plan.strategyDEntryFilter,
    strategyE: plan.strategyEEntryFilter,
    strategyF: plan.strategyFEntryFilter,
    strategyG: plan.strategyGEntryFilter,
    strategyH: plan.strategyHEntryFilter,
    strategyI: plan.strategyIEntryFilter,
  }[slot];
  return cloneMovingAverageSlopeFilter(slotFilter ?? plan.entryFilter);
}

function planSelection(
  plan: StrategyAllocationPlan,
  slot: StrategySlot,
): StrategySelection | null {
  return {
    strategyA: plan.strategyA,
    strategyB: plan.strategyB,
    strategyC: plan.strategyC ?? null,
    strategyD: plan.strategyD ?? null,
    strategyE: plan.strategyE ?? null,
    strategyF: plan.strategyF ?? null,
    strategyG: plan.strategyG ?? null,
    strategyH: plan.strategyH ?? null,
    strategyI: plan.strategyI ?? null,
  }[slot];
}

function planAllocation(plan: StrategyAllocationPlan, slot: StrategySlot): number {
  return {
    strategyA: plan.strategyAAllocation,
    strategyB: plan.strategyBAllocation,
    strategyC: plan.strategyCAllocation ?? 0,
    strategyD: plan.strategyDAllocation ?? 0,
    strategyE: plan.strategyEAllocation ?? 0,
    strategyF: plan.strategyFAllocation ?? 0,
    strategyG: plan.strategyGAllocation ?? 0,
    strategyH: plan.strategyHAllocation ?? 0,
    strategyI: plan.strategyIAllocation ?? 0,
  }[slot];
}

interface StrategyExecutionLeg {
  slot: StrategySlot;
  allocation: number;
  execution: StrategyExecutionSeries;
}

function buildPlanIntrabarExecutions(
  timeline: StrategyPlanTimeline,
  legs: readonly StrategyExecutionLeg[],
  tacticalMode: TacticalAllocationMode,
): AllocationIntrabarExecution[][] {
  if (legs.length === 1) {
    const selectedFills = legs[0].execution.orderFills;
    return selectedFills.map((fills) =>
      fills.map((fill) => ({
        targetAllocation: fill.action === "buy" ? 1 : 0,
        fillPrice: fill.fillPrice,
        signals: [fill.action === "buy" ? "long-entry" : "long-exit"],
      })),
    );
  }
  if (legs.length >= 3) {
    return Array.from({ length: timeline.target.length }, () => []);
  }

  const coreSlot = timeline.relativeLongStrategy;
  const coreLeg = legs.find((leg) => leg.slot === coreSlot);
  if (!coreSlot || !coreLeg) {
    throw new Error("A multi-strategy plan requires a core strategy");
  }
  const tacticalLegs = legs.filter((leg) => leg.slot !== coreSlot);
  const allocationForState = (
    gateActive: boolean,
    activeTacticalSlots: ReadonlySet<StrategySlot>,
  ) =>
    gateActive
      ? coreLeg.allocation +
        tacticalLegs.reduce(
          (sum, leg) =>
            sum + (activeTacticalSlots.has(leg.slot) ? leg.allocation : 0),
          0,
        )
      : 0;

  return timeline.target.map((_, index) => {
    const previousState = index > 0 ? timeline.layerStates?.[index - 1] : null;
    let gateActive = previousState?.gateActive ?? false;
    const activeTacticalSlots = new Set(
      previousState?.activeTacticalSlots ?? [],
    );
    let currentAllocation = allocationForState(
      gateActive,
      activeTacticalSlots,
    );
    const executions: AllocationIntrabarExecution[] = [];

    const orderedFills = legs
      .flatMap((leg) =>
        (leg.execution.orderFills[index] ?? []).map((fill) => ({
          fill,
          leg,
        })),
      )
      .sort((left, right) => {
      if (left.fill.action !== right.fill.action) {
        return left.fill.action === "buy" ? -1 : 1;
      }
      const priceDifference =
        left.fill.action === "buy"
          ? left.fill.fillPrice - right.fill.fillPrice
          : right.fill.fillPrice - left.fill.fillPrice;
      if (Math.abs(priceDifference) > 1e-10) return priceDifference;
      if (left.leg.slot === coreSlot && right.leg.slot !== coreSlot) return -1;
      if (right.leg.slot === coreSlot && left.leg.slot !== coreSlot) return 1;
      return (
        STRATEGY_SLOT_ORDER.indexOf(left.leg.slot) -
        STRATEGY_SLOT_ORDER.indexOf(right.leg.slot)
      );
    });
    orderedFills.forEach(({ fill, leg }) => {
      const signals: AllocationSignalEvent[] = [];
      if (leg.slot === coreSlot) {
        if (fill.action === "buy" && !gateActive) {
          gateActive = true;
          activeTacticalSlots.clear();
          if (tacticalMode === "reduce-on-short-exit") {
            tacticalLegs.forEach((candidate) =>
              activeTacticalSlots.add(candidate.slot),
            );
          }
          signals.push("long-entry");
        } else if (fill.action === "sell" && gateActive) {
          signals.push("long-exit");
          if (activeTacticalSlots.size > 0) signals.push("short-exit");
          gateActive = false;
          activeTacticalSlots.clear();
        }
      } else if (
        gateActive &&
        fill.action === "buy" &&
        !activeTacticalSlots.has(leg.slot)
      ) {
        activeTacticalSlots.add(leg.slot);
        signals.push("short-entry");
      } else if (
        gateActive &&
        fill.action === "sell" &&
        activeTacticalSlots.has(leg.slot)
      ) {
        activeTacticalSlots.delete(leg.slot);
        signals.push("short-exit");
      }
      const targetAllocation = allocationForState(
        gateActive,
        activeTacticalSlots,
      );
      if (Math.abs(targetAllocation - currentAllocation) > 1e-10) {
        executions.push({
          targetAllocation,
          fillPrice: fill.fillPrice,
          signals,
        });
        currentAllocation = targetAllocation;
      }
    });
    return executions;
  });
}

export function buildStrategyPlanTarget(
  bars: MarketBar[],
  plan: StrategyAllocationPlan,
  roleWindow?: Pick<BacktestSettings, "startTime" | "endTime">,
): number[] {
  return buildStrategyPlanTimeline(bars, plan, roleWindow).target;
}

export function buildStrategyPlanTimeline(
  bars: MarketBar[],
  plan: StrategyAllocationPlan,
  roleWindow?: Pick<BacktestSettings, "startTime" | "endTime">,
  fixedRelativeLongStrategy?: StrategySlot,
): StrategyPlanTimeline {
  const requested = STRATEGY_SLOTS.map((slot) => ({
    slot,
    selection: planSelection(plan, slot),
    allocation: planAllocation(plan, slot),
  })).filter(
    (
      item,
    ): item is {
      slot: StrategySlot;
      selection: StrategySelection;
      allocation: number;
    } => item.selection !== null,
  );
  requested.forEach((left, leftIndex) => {
    requested.slice(leftIndex + 1).forEach((right) => {
      if (
        areStrategiesEquivalent(
          left.selection.strategyId,
          right.selection.strategyId,
        )
      ) {
        throw new Error("Selected strategies must not be equivalent");
      }
    });
  });
  const executionLegs: StrategyExecutionLeg[] = requested.map((item) => {
    const entryAllowed = buildMovingAverageEntryAllowedSeries(
      bars,
      planEntryFilter(plan, item.slot),
    );
    return {
      slot: item.slot,
      allocation: item.allocation,
      execution: buildStrategyExecutionSeries(
        bars,
        item.selection,
        buildSelectionTarget(bars, item.selection),
        entryAllowed,
      ),
    };
  });
  const roleTargets =
    roleWindow && executionLegs.length > 1
      ? (Object.fromEntries(
          executionLegs.map((leg) => [
            leg.slot,
            selectRoleTargetWindow(
              bars,
              leg.execution.target ?? [],
              roleWindow,
            ),
          ]),
        ) as unknown as StrategyRoleTargets)
      : undefined;
  const timeline = buildMultiStrategyPlanTimelineFromTargets(
    executionLegs.map((leg) => ({
      slot: leg.slot,
      target: leg.execution.target ?? [],
      allocation: leg.allocation,
    })),
    roleTargets,
    fixedRelativeLongStrategy,
    resolveTacticalAllocationMode(plan.tacticalMode),
  );
  const intrabarExecutions = buildPlanIntrabarExecutions(
    timeline,
    executionLegs,
    resolveTacticalAllocationMode(plan.tacticalMode),
  );
  return {
    ...timeline,
    intrabarExecutions,
  };
}

export interface LiveAllocationGuidance {
  action: "increase" | "reduce" | "hold" | "wait";
  previousAllocation: number;
  targetAllocation: number;
  strategyCount: number;
  activeStrategyCount: number;
  activeWeight: number;
  entrySupportCount: number;
  exitSupportCount: number;
}

export function buildLiveAllocationGuidance(
  bars: MarketBar[],
  plan: StrategyAllocationPlan,
  roleWindow?: Pick<BacktestSettings, "startTime" | "endTime">,
  latestBarStatus: MarketLatestBarStatus = "complete",
): LiveAllocationGuidance | null {
  if (
    bars.length === 0 ||
    STRATEGY_SLOTS.every((slot) => !planSelection(plan, slot))
  ) {
    return null;
  }
  const buildLiveTarget = (
    selection: StrategySelection | null,
    entryAllowed: readonly boolean[] | null,
  ) => {
    const execution = buildStrategyExecutionSeries(
      bars,
      selection,
      buildSelectionTarget(bars, selection),
      entryAllowed,
    );
    if (
      latestBarStatus !== "complete" &&
      !execution.orders &&
      execution.target &&
      execution.target.length > 1
    ) {
      execution.target[execution.target.length - 1] =
        execution.target[execution.target.length - 2] ?? 0;
    }
    return execution.target;
  };
  const liveLegs = STRATEGY_SLOTS.map((slot) => ({
    slot,
    selection: planSelection(plan, slot),
    allocation: planAllocation(plan, slot),
  }))
    .filter(
      (
        item,
      ): item is {
        slot: StrategySlot;
        selection: StrategySelection;
        allocation: number;
      } => item.selection !== null,
    )
    .map((item) => {
      const entryAllowed = buildMovingAverageEntryAllowedSeries(
        bars,
        planEntryFilter(plan, item.slot),
      );
      if (entryAllowed && latestBarStatus !== "complete") {
        entryAllowed[entryAllowed.length - 1] = false;
      }
      return {
        ...item,
        target: buildLiveTarget(item.selection, entryAllowed),
      };
    });
  const roleTargets =
    roleWindow && liveLegs.length > 1
      ? (Object.fromEntries(
          liveLegs.map((leg) => [
            leg.slot,
            selectRoleTargetWindow(bars, leg.target ?? [], roleWindow),
          ]),
        ) as unknown as StrategyRoleTargets)
      : undefined;
  const target = buildMultiStrategyPlanTimelineFromTargets(
    liveLegs.map((leg) => ({
      slot: leg.slot,
      target: leg.target ?? [],
      allocation: leg.allocation,
    })),
    roleTargets,
    undefined,
    resolveTacticalAllocationMode(plan.tacticalMode),
  ).target;
  const targetAllocation = target.at(-1) ?? 0;
  const previousAllocation = target.at(-2) ?? 0;
  const action =
    targetAllocation > previousAllocation
      ? "increase"
      : targetAllocation < previousAllocation
        ? "reduce"
        : targetAllocation > 0
          ? "hold"
          : "wait";
  const totalWeight = liveLegs.reduce((sum, leg) => sum + leg.allocation, 0);
  const activeLegs = liveLegs.filter((leg) => (leg.target?.at(-1) ?? 0) > 0);
  return {
    action,
    previousAllocation,
    targetAllocation,
    strategyCount: liveLegs.length,
    activeStrategyCount: activeLegs.length,
    activeWeight:
      totalWeight > 0
        ? activeLegs.reduce((sum, leg) => sum + leg.allocation, 0) / totalWeight
        : 0,
    entrySupportCount: Math.floor(liveLegs.length / 2) + 1,
    exitSupportCount: Math.ceil(liveLegs.length / 2),
  };
}

export function buildStrategyCombinationTarget(
  bars: MarketBar[],
  combination: StrategyCombination,
): number[] {
  return buildStrategyPlanTarget(bars, {
    strategyA: {
      strategyId: combination.strategyAId,
      parameters: combination.strategyAParameters,
    },
    strategyB: {
      strategyId: combination.strategyBId,
      parameters: combination.strategyBParameters,
    },
    strategyC:
      combination.strategyCId && combination.strategyCParameters
        ? {
            strategyId: combination.strategyCId,
            parameters: combination.strategyCParameters,
          }
        : null,
    strategyD:
      combination.strategyDId && combination.strategyDParameters
        ? {
            strategyId: combination.strategyDId,
            parameters: combination.strategyDParameters,
          }
        : null,
    strategyE:
      combination.strategyEId && combination.strategyEParameters
        ? {
            strategyId: combination.strategyEId,
            parameters: combination.strategyEParameters,
          }
        : null,
    strategyF:
      combination.strategyFId && combination.strategyFParameters
        ? { strategyId: combination.strategyFId, parameters: combination.strategyFParameters }
        : null,
    strategyG:
      combination.strategyGId && combination.strategyGParameters
        ? { strategyId: combination.strategyGId, parameters: combination.strategyGParameters }
        : null,
    strategyH:
      combination.strategyHId && combination.strategyHParameters
        ? { strategyId: combination.strategyHId, parameters: combination.strategyHParameters }
        : null,
    strategyI:
      combination.strategyIId && combination.strategyIParameters
        ? { strategyId: combination.strategyIId, parameters: combination.strategyIParameters }
        : null,
    strategyAAllocation: normalizeAllocation(
      combination.strategyAAllocation,
      DEFAULT_STRATEGY_A_ALLOCATION,
    ),
    strategyBAllocation: normalizeAllocation(
      combination.strategyBAllocation,
      DEFAULT_STRATEGY_B_ALLOCATION,
    ),
    strategyCAllocation: normalizeAllocation(
      combination.strategyCAllocation ?? 0,
      0,
    ),
    strategyDAllocation: normalizeAllocation(
      combination.strategyDAllocation ?? 0,
      0,
    ),
    strategyEAllocation: normalizeAllocation(
      combination.strategyEAllocation ?? 0,
      0,
    ),
    strategyFAllocation: normalizeAllocation(combination.strategyFAllocation ?? 0, 0),
    strategyGAllocation: normalizeAllocation(combination.strategyGAllocation ?? 0, 0),
    strategyHAllocation: normalizeAllocation(combination.strategyHAllocation ?? 0, 0),
    strategyIAllocation: normalizeAllocation(combination.strategyIAllocation ?? 0, 0),
    tacticalMode: resolveTacticalAllocationMode(combination.tacticalMode),
    strategyAEntryFilter: cloneMovingAverageSlopeFilter(
      combination.strategyAEntryFilter ?? combination.entryFilter,
    ),
    strategyBEntryFilter: cloneMovingAverageSlopeFilter(
      combination.strategyBEntryFilter ?? combination.entryFilter,
    ),
    strategyCEntryFilter: cloneMovingAverageSlopeFilter(
      combination.strategyCEntryFilter ?? combination.entryFilter,
    ),
    strategyDEntryFilter: cloneMovingAverageSlopeFilter(
      combination.strategyDEntryFilter ?? combination.entryFilter,
    ),
    strategyEEntryFilter: cloneMovingAverageSlopeFilter(
      combination.strategyEEntryFilter ?? combination.entryFilter,
    ),
    strategyFEntryFilter: cloneMovingAverageSlopeFilter(
      combination.strategyFEntryFilter ?? combination.entryFilter,
    ),
    strategyGEntryFilter: cloneMovingAverageSlopeFilter(
      combination.strategyGEntryFilter ?? combination.entryFilter,
    ),
    strategyHEntryFilter: cloneMovingAverageSlopeFilter(
      combination.strategyHEntryFilter ?? combination.entryFilter,
    ),
    strategyIEntryFilter: cloneMovingAverageSlopeFilter(
      combination.strategyIEntryFilter ?? combination.entryFilter,
    ),
  });
}

export function runStrategyCombinationBacktest(
  bars: MarketBar[],
  combination: StrategyCombination,
  settings: Omit<BacktestSettings, "interval"> & {
    interval: MarketInterval;
  },
  fixedRelativeLongStrategy?: StrategySlot,
): StrategyCombinationResult {
  const plan: StrategyAllocationPlan = {
    strategyA: {
      strategyId: combination.strategyAId,
      parameters: { ...combination.strategyAParameters },
    },
    strategyB: {
      strategyId: combination.strategyBId,
      parameters: { ...combination.strategyBParameters },
    },
    strategyC:
      combination.strategyCId && combination.strategyCParameters
        ? {
            strategyId: combination.strategyCId,
            parameters: { ...combination.strategyCParameters },
          }
        : null,
    strategyD:
      combination.strategyDId && combination.strategyDParameters
        ? {
            strategyId: combination.strategyDId,
            parameters: { ...combination.strategyDParameters },
          }
        : null,
    strategyE:
      combination.strategyEId && combination.strategyEParameters
        ? {
            strategyId: combination.strategyEId,
            parameters: { ...combination.strategyEParameters },
          }
        : null,
    strategyF:
      combination.strategyFId && combination.strategyFParameters
        ? { strategyId: combination.strategyFId, parameters: { ...combination.strategyFParameters } }
        : null,
    strategyG:
      combination.strategyGId && combination.strategyGParameters
        ? { strategyId: combination.strategyGId, parameters: { ...combination.strategyGParameters } }
        : null,
    strategyH:
      combination.strategyHId && combination.strategyHParameters
        ? { strategyId: combination.strategyHId, parameters: { ...combination.strategyHParameters } }
        : null,
    strategyI:
      combination.strategyIId && combination.strategyIParameters
        ? { strategyId: combination.strategyIId, parameters: { ...combination.strategyIParameters } }
        : null,
    strategyAAllocation: combination.strategyAAllocation,
    strategyBAllocation: combination.strategyBAllocation,
    strategyCAllocation: combination.strategyCAllocation ?? 0,
    strategyDAllocation: combination.strategyDAllocation ?? 0,
    strategyEAllocation: combination.strategyEAllocation ?? 0,
    strategyFAllocation: combination.strategyFAllocation ?? 0,
    strategyGAllocation: combination.strategyGAllocation ?? 0,
    strategyHAllocation: combination.strategyHAllocation ?? 0,
    strategyIAllocation: combination.strategyIAllocation ?? 0,
    tacticalMode: resolveTacticalAllocationMode(combination.tacticalMode),
    strategyAEntryFilter: cloneMovingAverageSlopeFilter(
      combination.strategyAEntryFilter ??
        combination.entryFilter ??
        settings.entryFilter,
    ),
    strategyBEntryFilter: cloneMovingAverageSlopeFilter(
      combination.strategyBEntryFilter ??
        combination.entryFilter ??
        settings.entryFilter,
    ),
    strategyCEntryFilter: cloneMovingAverageSlopeFilter(
      combination.strategyCEntryFilter ??
        combination.entryFilter ??
        settings.entryFilter,
    ),
    strategyDEntryFilter: cloneMovingAverageSlopeFilter(
      combination.strategyDEntryFilter ??
        combination.entryFilter ??
        settings.entryFilter,
    ),
    strategyEEntryFilter: cloneMovingAverageSlopeFilter(
      combination.strategyEEntryFilter ??
        combination.entryFilter ??
        settings.entryFilter,
    ),
    strategyFEntryFilter: cloneMovingAverageSlopeFilter(
      combination.strategyFEntryFilter ?? combination.entryFilter ?? settings.entryFilter,
    ),
    strategyGEntryFilter: cloneMovingAverageSlopeFilter(
      combination.strategyGEntryFilter ?? combination.entryFilter ?? settings.entryFilter,
    ),
    strategyHEntryFilter: cloneMovingAverageSlopeFilter(
      combination.strategyHEntryFilter ?? combination.entryFilter ?? settings.entryFilter,
    ),
    strategyIEntryFilter: cloneMovingAverageSlopeFilter(
      combination.strategyIEntryFilter ?? combination.entryFilter ?? settings.entryFilter,
    ),
  };
  const timeline = buildStrategyPlanTimeline(
    bars,
    plan,
    fixedRelativeLongStrategy ? undefined : settings,
    fixedRelativeLongStrategy,
  );
  if (!timeline.relativeLongStrategy) {
    throw new Error("A strategy group requires a core strategy");
  }
  return {
    ...runAllocationBacktest(
      bars,
      timeline.target,
      settings,
      timeline.signalEvents,
      timeline.intrabarExecutions,
    ),
    strategyAId: combination.strategyAId,
    strategyAParameters: { ...combination.strategyAParameters },
    strategyBId: combination.strategyBId,
    strategyBParameters: { ...combination.strategyBParameters },
    ...(combination.strategyCId && combination.strategyCParameters
      ? {
          strategyCId: combination.strategyCId,
          strategyCParameters: { ...combination.strategyCParameters },
        }
      : {}),
    ...(combination.strategyDId && combination.strategyDParameters
      ? {
          strategyDId: combination.strategyDId,
          strategyDParameters: { ...combination.strategyDParameters },
        }
      : {}),
    ...(combination.strategyEId && combination.strategyEParameters
      ? {
          strategyEId: combination.strategyEId,
          strategyEParameters: { ...combination.strategyEParameters },
        }
      : {}),
    ...(combination.strategyFId && combination.strategyFParameters
      ? { strategyFId: combination.strategyFId, strategyFParameters: { ...combination.strategyFParameters } }
      : {}),
    ...(combination.strategyGId && combination.strategyGParameters
      ? { strategyGId: combination.strategyGId, strategyGParameters: { ...combination.strategyGParameters } }
      : {}),
    ...(combination.strategyHId && combination.strategyHParameters
      ? { strategyHId: combination.strategyHId, strategyHParameters: { ...combination.strategyHParameters } }
      : {}),
    ...(combination.strategyIId && combination.strategyIParameters
      ? { strategyIId: combination.strategyIId, strategyIParameters: { ...combination.strategyIParameters } }
      : {}),
    strategyAAllocation: combination.strategyAAllocation,
    strategyBAllocation: combination.strategyBAllocation,
    ...(combination.strategyCId
      ? { strategyCAllocation: combination.strategyCAllocation ?? 0 }
      : {}),
    ...(combination.strategyDId
      ? { strategyDAllocation: combination.strategyDAllocation ?? 0 }
      : {}),
    ...(combination.strategyEId
      ? { strategyEAllocation: combination.strategyEAllocation ?? 0 }
      : {}),
    ...(combination.strategyFId
      ? { strategyFAllocation: combination.strategyFAllocation ?? 0 }
      : {}),
    ...(combination.strategyGId
      ? { strategyGAllocation: combination.strategyGAllocation ?? 0 }
      : {}),
    ...(combination.strategyHId
      ? { strategyHAllocation: combination.strategyHAllocation ?? 0 }
      : {}),
    ...(combination.strategyIId
      ? { strategyIAllocation: combination.strategyIAllocation ?? 0 }
      : {}),
    tacticalMode: resolveTacticalAllocationMode(combination.tacticalMode),
    relativeLongStrategy: timeline.relativeLongStrategy,
    strategyAEntryFilter: cloneMovingAverageSlopeFilter(
      plan.strategyAEntryFilter,
    ),
    strategyBEntryFilter: cloneMovingAverageSlopeFilter(
      plan.strategyBEntryFilter,
    ),
    ...(combination.strategyCId
      ? {
          strategyCEntryFilter: cloneMovingAverageSlopeFilter(
            plan.strategyCEntryFilter,
          ),
        }
      : {}),
    ...(combination.strategyDId
      ? {
          strategyDEntryFilter: cloneMovingAverageSlopeFilter(
            plan.strategyDEntryFilter,
          ),
        }
      : {}),
    ...(combination.strategyEId
      ? {
          strategyEEntryFilter: cloneMovingAverageSlopeFilter(
            plan.strategyEEntryFilter,
          ),
        }
      : {}),
    ...(combination.strategyFId
      ? { strategyFEntryFilter: cloneMovingAverageSlopeFilter(plan.strategyFEntryFilter) }
      : {}),
    ...(combination.strategyGId
      ? { strategyGEntryFilter: cloneMovingAverageSlopeFilter(plan.strategyGEntryFilter) }
      : {}),
    ...(combination.strategyHId
      ? { strategyHEntryFilter: cloneMovingAverageSlopeFilter(plan.strategyHEntryFilter) }
      : {}),
    ...(combination.strategyIId
      ? { strategyIEntryFilter: cloneMovingAverageSlopeFilter(plan.strategyIEntryFilter) }
      : {}),
  };
}

function retainFinalist(
  finalistsByStrategy: Map<StrategyId, StrategyFinalist[]>,
  finalist: StrategyFinalist,
  objective: ScreeningObjective,
  limit: number,
) {
  const result = finalist.result;
  const finalists = finalistsByStrategy.get(result.strategyId) ?? [];
  finalists.push(finalist);
  finalists.sort((left, right) =>
    compareScreeningResults(left.result, right.result, objective),
  );
  finalistsByStrategy.set(
    result.strategyId,
    finalists.slice(0, limit),
  );
}

function compactBacktestResult(result: BacktestResult): BacktestResult {
  return {
    ...result,
    equity: [],
    trades: [],
  };
}

function retainEntryFilterCandidate(
  candidatesByStrategy: Map<StrategyId, EntryFilterCandidate[]>,
  candidate: EntryFilterCandidate,
  objective: ScreeningObjective,
) {
  const strategyId = candidate.result.strategyId;
  const candidates = candidatesByStrategy.get(strategyId) ?? [];
  candidates.push({
    ...candidate,
    result: compactBacktestResult(candidate.result),
  });
  candidates.sort((left, right) =>
    compareScreeningResults(left.result, right.result, objective),
  );
  candidatesByStrategy.set(
    strategyId,
    candidates.slice(0, SCREENING_ENTRY_FILTER_FINALISTS_PER_STRATEGY),
  );
}

function retainCombinationResult(
  results: StrategyCombinationResult[],
  result: StrategyCombinationResult,
  objective: ScreeningObjective,
) {
  const resultKey = combinationStrategySetKey(result);
  const existingIndex = results.findIndex(
    (existing) => combinationStrategySetKey(existing) === resultKey,
  );
  if (
    existingIndex >= 0 &&
    compareScreeningResults(result, results[existingIndex], objective) >= 0
  ) {
    return;
  }
  if (existingIndex >= 0) {
    results.splice(existingIndex, 1, result);
  } else {
    results.push(result);
  }
  results.sort((left, right) =>
    compareScreeningResults(left, right, objective),
  );
  const resultStrategyCount = combinationStrategyIds(result).length;
  const categoryResults = results.filter(
    (candidate) =>
      combinationStrategyIds(candidate).length === resultStrategyCount,
  );
  const retainedCategoryResults =
    resultStrategyCount >= 3
      ? selectPrimaryDiverseCandidates(
          categoryResults,
          (candidate) => candidate,
          objective,
          MAX_COMBINATION_RESULTS,
          MAX_MULTI_STRATEGY_RESULTS_PER_PRIMARY,
        )
      : categoryResults.slice(0, MAX_COMBINATION_RESULTS);
  results.splice(
    0,
    results.length,
    ...results
      .filter(
        (candidate) =>
          combinationStrategyIds(candidate).length !== resultStrategyCount,
      )
      .concat(retainedCategoryResults)
      .sort((left, right) =>
        compareScreeningResults(left, right, objective),
      ),
  );
}

function combinationStrategySetKey(
  result: Pick<
    StrategyCombinationResult,
    | "strategyAId"
    | "strategyBId"
    | "strategyCId"
    | "strategyDId"
    | "strategyEId"
    | "strategyFId"
    | "strategyGId"
    | "strategyHId"
    | "strategyIId"
  >,
): string {
  return combinationStrategyIds(result).sort().join("|");
}

function combinationStrategyIds(
  result: Pick<
    StrategyCombinationResult,
    | "strategyAId"
    | "strategyBId"
    | "strategyCId"
    | "strategyDId"
    | "strategyEId"
    | "strategyFId"
    | "strategyGId"
    | "strategyHId"
    | "strategyIId"
  >,
): StrategyId[] {
  return [
    result.strategyAId,
    result.strategyBId,
    result.strategyCId,
    result.strategyDId,
    result.strategyEId,
    result.strategyFId,
    result.strategyGId,
    result.strategyHId,
    result.strategyIId,
  ].filter((strategyId): strategyId is StrategyId => Boolean(strategyId));
}

function selectPrimaryDiverseCandidates<T>(
  candidates: readonly T[],
  resultOf: (candidate: T) => StrategyCombinationResult,
  objective: ScreeningObjective,
  limit: number,
  perPrimaryLimit: number,
): T[] {
  const primaryCounts = new Map<StrategyId, number>();
  const selected: T[] = [];
  const sorted = [...candidates].sort((left, right) =>
    compareScreeningResults(resultOf(left), resultOf(right), objective),
  );
  for (const candidate of sorted) {
    const primaryStrategyId = resultOf(candidate).strategyAId;
    const primaryCount = primaryCounts.get(primaryStrategyId) ?? 0;
    if (primaryCount >= perPrimaryLimit) continue;
    selected.push(candidate);
    primaryCounts.set(primaryStrategyId, primaryCount + 1);
    if (selected.length >= limit) break;
  }
  return selected;
}

function retainPairFinalist(
  finalists: StrategyPairFinalist[],
  finalist: StrategyPairFinalist,
  objective: ScreeningObjective,
  limit: number,
) {
  const existingIndex = finalists.findIndex(
    (existing) =>
      existing.strategyA.result.strategyId ===
        finalist.strategyA.result.strategyId &&
      existing.strategyB.result.strategyId ===
        finalist.strategyB.result.strategyId,
  );
  if (
    existingIndex >= 0 &&
    compareScreeningResults(
      finalist.referenceResult,
      finalists[existingIndex].referenceResult,
      objective,
    ) >= 0
  ) {
    return;
  }
  if (existingIndex >= 0) {
    finalists.splice(existingIndex, 1, finalist);
  } else {
    finalists.push(finalist);
  }
  finalists.sort((left, right) =>
    compareScreeningResults(
      left.referenceResult,
      right.referenceResult,
      objective,
    ),
  );
  if (finalists.length > limit) finalists.length = limit;
}

function sameAllocation(
  left: TwoStrategyAllocation,
  right: TwoStrategyAllocation,
): boolean {
  return (
    Math.abs(left.strategyAAllocation - right.strategyAAllocation) < 1e-10 &&
    Math.abs(left.strategyBAllocation - right.strategyBAllocation) < 1e-10 &&
    resolveTacticalAllocationMode(left.tacticalMode) ===
      resolveTacticalAllocationMode(right.tacticalMode)
  );
}

function sameThreeStrategyAllocation(
  left: ThreeStrategyAllocation,
  right: ThreeStrategyAllocation,
): boolean {
  return (
    sameAllocation(left, right) &&
    Math.abs(left.strategyCAllocation - right.strategyCAllocation) < 1e-10
  );
}

function sameHigherOrderAllocation(
  left: HigherOrderStrategyAllocation,
  right: HigherOrderStrategyAllocation,
  strategyCount: HigherOrderStrategyCount,
): boolean {
  return (
    STRATEGY_SLOTS.slice(0, strategyCount).every(
      (slot) =>
        Math.abs(allocationForSlot(left, slot) - allocationForSlot(right, slot)) <
        1e-10,
    ) &&
    resolveTacticalAllocationMode(left.tacticalMode) ===
      resolveTacticalAllocationMode(right.tacticalMode)
  );
}

function retainTripleFinalist(
  finalists: StrategyTripleFinalist[],
  finalist: StrategyTripleFinalist,
  objective: ScreeningObjective,
  limit: number,
) {
  const finalistKey = combinationStrategySetKey(finalist.referenceResult);
  const existingIndex = finalists.findIndex(
    (existing) =>
      combinationStrategySetKey(existing.referenceResult) === finalistKey,
  );
  if (
    existingIndex >= 0 &&
    compareScreeningResults(
      finalist.referenceResult,
      finalists[existingIndex].referenceResult,
      objective,
    ) >= 0
  ) {
    return;
  }
  if (existingIndex >= 0) {
    finalists.splice(existingIndex, 1, finalist);
  } else {
    finalists.push(finalist);
  }
  finalists.splice(
    0,
    finalists.length,
    ...selectPrimaryDiverseCandidates(
      finalists,
      (candidate) => candidate.referenceResult,
      objective,
      limit,
      MAX_MULTI_STRATEGY_FINALISTS_PER_PRIMARY,
    ),
  );
}

function retainStrategyGroupFinalist(
  finalists: StrategyGroupFinalist[],
  finalist: StrategyGroupFinalist,
  objective: ScreeningObjective,
  limit: number,
) {
  const finalistKey = combinationStrategySetKey(finalist.referenceResult);
  const existingIndex = finalists.findIndex(
    (existing) =>
      combinationStrategySetKey(existing.referenceResult) === finalistKey,
  );
  if (
    existingIndex >= 0 &&
    compareScreeningResults(
      finalist.referenceResult,
      finalists[existingIndex].referenceResult,
      objective,
    ) >= 0
  ) {
    return;
  }
  if (existingIndex >= 0) {
    finalists.splice(existingIndex, 1, finalist);
  } else {
    finalists.push(finalist);
  }
  finalists.splice(
    0,
    finalists.length,
    ...selectPrimaryDiverseCandidates(
      finalists,
      (candidate) => candidate.referenceResult,
      objective,
      limit,
      MAX_MULTI_STRATEGY_FINALISTS_PER_PRIMARY,
    ),
  );
}

function entryFilterKey(
  filter: MovingAverageSlopeFilter | null | undefined,
): string {
  return filter
    ? `${filter.movingAverageType}:${filter.period}:${filter.minimumSlopePercent}`
    : "none";
}

function runCombinationCandidate(
  bars: MarketBar[],
  strategyAFinalist: StrategyFinalist,
  strategyBFinalist: StrategyFinalist,
  allocation: TwoStrategyAllocation,
  settings: StrategyCombinationBacktestSettings,
): StrategyCombinationResult {
  const roleTargets = {
    strategyA: selectRoleTargetWindow(
      bars,
      strategyAFinalist.target,
      settings,
    ),
    strategyB: selectRoleTargetWindow(
      bars,
      strategyBFinalist.target,
      settings,
    ),
  };
  const timeline = buildStrategyPlanTimelineFromTargets(
    strategyAFinalist.target,
    strategyBFinalist.target,
    allocation.strategyAAllocation,
    allocation.strategyBAllocation,
    roleTargets,
    undefined,
    resolveTacticalAllocationMode(allocation.tacticalMode),
  );
  const performance = runAllocationBacktest(
    bars,
    timeline.target,
    settings,
    timeline.signalEvents,
    buildPlanIntrabarExecutions(
      timeline,
      [
        {
          slot: "strategyA",
          allocation: allocation.strategyAAllocation,
          execution: {
            target: strategyAFinalist.target,
            orderFills: strategyAFinalist.orderFills,
          },
        },
        {
          slot: "strategyB",
          allocation: allocation.strategyBAllocation,
          execution: {
            target: strategyBFinalist.target,
            orderFills: strategyBFinalist.orderFills,
          },
        },
      ],
      resolveTacticalAllocationMode(allocation.tacticalMode),
    ),
  );
  if (!timeline.relativeLongStrategy) {
    throw new Error("A strategy pair requires a relative long strategy");
  }
  return {
    ...performance,
    strategyAId: strategyAFinalist.result.strategyId,
    strategyAParameters: strategyAFinalist.result.parameters,
    strategyBId: strategyBFinalist.result.strategyId,
    strategyBParameters: strategyBFinalist.result.parameters,
    strategyAAllocation: allocation.strategyAAllocation,
    strategyBAllocation: allocation.strategyBAllocation,
    tacticalMode: resolveTacticalAllocationMode(allocation.tacticalMode),
    relativeLongStrategy: timeline.relativeLongStrategy,
    strategyAEntryFilter: cloneMovingAverageSlopeFilter(
      strategyAFinalist.result.entryFilter,
    ),
    strategyBEntryFilter: cloneMovingAverageSlopeFilter(
      strategyBFinalist.result.entryFilter,
    ),
  };
}

function runTripleCombinationCandidate(
  bars: MarketBar[],
  strategyAFinalist: StrategyFinalist,
  strategyBFinalist: StrategyFinalist,
  strategyCFinalist: StrategyFinalist,
  allocation: ThreeStrategyAllocation,
  settings: StrategyCombinationBacktestSettings,
): StrategyCombinationResult {
  const roleTargets: StrategyRoleTargets = {
    strategyA: selectRoleTargetWindow(
      bars,
      strategyAFinalist.target,
      settings,
    ),
    strategyB: selectRoleTargetWindow(
      bars,
      strategyBFinalist.target,
      settings,
    ),
    strategyC: selectRoleTargetWindow(
      bars,
      strategyCFinalist.target,
      settings,
    ),
  };
  const tacticalMode = resolveTacticalAllocationMode(
    allocation.tacticalMode,
  );
  const timeline = buildThreeStrategyPlanTimelineFromTargets(
    strategyAFinalist.target,
    strategyBFinalist.target,
    strategyCFinalist.target,
    allocation.strategyAAllocation,
    allocation.strategyBAllocation,
    allocation.strategyCAllocation,
    roleTargets,
    undefined,
    tacticalMode,
  );
  const performance = runAllocationBacktest(
    bars,
    timeline.target,
    settings,
    timeline.signalEvents,
    buildPlanIntrabarExecutions(
      timeline,
      [
        {
          slot: "strategyA",
          allocation: allocation.strategyAAllocation,
          execution: strategyAFinalist,
        },
        {
          slot: "strategyB",
          allocation: allocation.strategyBAllocation,
          execution: strategyBFinalist,
        },
        {
          slot: "strategyC",
          allocation: allocation.strategyCAllocation,
          execution: strategyCFinalist,
        },
      ],
      tacticalMode,
    ),
  );
  if (!timeline.relativeLongStrategy) {
    throw new Error("A strategy group requires a core strategy");
  }
  return {
    ...performance,
    strategyAId: strategyAFinalist.result.strategyId,
    strategyAParameters: strategyAFinalist.result.parameters,
    strategyBId: strategyBFinalist.result.strategyId,
    strategyBParameters: strategyBFinalist.result.parameters,
    strategyCId: strategyCFinalist.result.strategyId,
    strategyCParameters: strategyCFinalist.result.parameters,
    strategyAAllocation: allocation.strategyAAllocation,
    strategyBAllocation: allocation.strategyBAllocation,
    strategyCAllocation: allocation.strategyCAllocation,
    tacticalMode,
    relativeLongStrategy: timeline.relativeLongStrategy,
    strategyAEntryFilter: cloneMovingAverageSlopeFilter(
      strategyAFinalist.result.entryFilter,
    ),
    strategyBEntryFilter: cloneMovingAverageSlopeFilter(
      strategyBFinalist.result.entryFilter,
    ),
    strategyCEntryFilter: cloneMovingAverageSlopeFilter(
      strategyCFinalist.result.entryFilter,
    ),
  };
}

function allocationForSlot(
  allocation: HigherOrderStrategyAllocation,
  slot: StrategySlot,
): number {
  const extended = allocation as NineStrategyAllocation;
  return {
    strategyA: extended.strategyAAllocation,
    strategyB: extended.strategyBAllocation,
    strategyC: extended.strategyCAllocation,
    strategyD: extended.strategyDAllocation,
    strategyE: extended.strategyEAllocation ?? 0,
    strategyF: extended.strategyFAllocation ?? 0,
    strategyG: extended.strategyGAllocation ?? 0,
    strategyH: extended.strategyHAllocation ?? 0,
    strategyI: extended.strategyIAllocation ?? 0,
  }[slot];
}

function runHigherOrderCombinationCandidate(
  bars: MarketBar[],
  finalists: readonly StrategyFinalist[],
  allocation: HigherOrderStrategyAllocation,
  settings: StrategyCombinationBacktestSettings,
): StrategyCombinationResult {
  if (finalists.length < 4 || finalists.length > STRATEGY_SLOTS.length) {
    throw new Error("Higher-order screening requires four to nine strategies");
  }
  const tacticalMode = resolveTacticalAllocationMode(allocation.tacticalMode);
  const legs = finalists.map((finalist, index) => {
    const slot = STRATEGY_SLOTS[index];
    return {
      slot,
      allocation: allocationForSlot(allocation, slot),
      execution: finalist,
    };
  });
  const roleTargets = Object.fromEntries(
    legs.map((leg) => [
      leg.slot,
      selectRoleTargetWindow(bars, leg.execution.target, settings),
    ]),
  ) as unknown as StrategyRoleTargets;
  const timeline = buildMultiStrategyPlanTimelineFromTargets(
    legs.map((leg) => ({
      slot: leg.slot,
      target: leg.execution.target,
      allocation: leg.allocation,
    })),
    roleTargets,
    undefined,
    tacticalMode,
  );
  if (!timeline.relativeLongStrategy) {
    throw new Error("A strategy group requires a core strategy");
  }
  const performance = runAllocationBacktest(
    bars,
    timeline.target,
    settings,
    timeline.signalEvents,
    buildPlanIntrabarExecutions(timeline, legs, tacticalMode),
  );
  const strategyFields = Object.fromEntries(
    finalists.flatMap((finalist, index) => {
      const slot = STRATEGY_SLOTS[index];
      return [
        [`${slot}Id`, finalist.result.strategyId],
        [`${slot}Parameters`, finalist.result.parameters],
        [`${slot}Allocation`, allocationForSlot(allocation, slot)],
        [
          `${slot}EntryFilter`,
          cloneMovingAverageSlopeFilter(finalist.result.entryFilter),
        ],
      ];
    }),
  );
  return {
    ...performance,
    ...strategyFields,
    tacticalMode,
    relativeLongStrategy: timeline.relativeLongStrategy,
  } as StrategyCombinationResult;
}

export async function optimizeStrategyCombinations(
  bars: MarketBar[],
  settings: Omit<BacktestSettings, "interval"> & {
    interval: MarketInterval;
  },
  options: OptimizeStrategyCombinationsOptions = {},
): Promise<CombinationOptimizationResult> {
  const candidates = options.candidates
    ? [...options.candidates]
    : buildScreeningCandidates(
        ["long", "short"],
        options.excludedStrategyIds,
        settings.interval,
      );
  const requestedEntryFilters = [
    ...new Map(
      (options.entryFilters ?? []).map((filter) => [
        entryFilterKey(filter),
        cloneMovingAverageSlopeFilter(filter)!,
      ]),
    ).values(),
  ];
  const baseEntryFilter =
    requestedEntryFilters.length > 0
      ? null
      : cloneMovingAverageSlopeFilter(settings.entryFilter);
  const baseEntryAllowed = resolveMovingAverageEntryAllowedSeries(
    bars,
    baseEntryFilter,
    requestedEntryFilters.length > 0
      ? undefined
      : settings.entryFilterAllowed,
  );
  const baseSettings: StrategyCombinationBacktestSettings = {
    ...settings,
    entryFilter: baseEntryFilter,
    entryFilterAllowed: baseEntryAllowed ?? undefined,
  };
  const objective = options.objective ?? "balanced";
  const allocationCandidates =
    options.allocationCandidates ?? TWO_STRATEGY_ALLOCATION_CANDIDATES;
  const referenceAllocation =
    allocationCandidates.find(
      (allocation) =>
        Math.abs(
          allocation.strategyAAllocation - DEFAULT_STRATEGY_A_ALLOCATION,
        ) <
          1e-10 &&
        Math.abs(
          allocation.strategyBAllocation - DEFAULT_STRATEGY_B_ALLOCATION,
        ) <
          1e-10 &&
        resolveTacticalAllocationMode(allocation.tacticalMode) ===
          DEFAULT_TACTICAL_ALLOCATION_MODE,
    ) ?? allocationCandidates[0];
  const remainingAllocations = referenceAllocation
    ? allocationCandidates.filter(
        (allocation) => !sameAllocation(allocation, referenceAllocation),
      )
    : [];
  const includeTriples = options.includeTriples ?? true;
  const tripleAllocationCandidates =
    options.tripleAllocationCandidates ??
    THREE_STRATEGY_ALLOCATION_CANDIDATES;
  const referenceTripleAllocation =
    tripleAllocationCandidates.find(
      (allocation) =>
        Math.abs(allocation.strategyAAllocation - 0.4) < 1e-10 &&
        Math.abs(allocation.strategyBAllocation - 0.3) < 1e-10 &&
        Math.abs(allocation.strategyCAllocation - 0.3) < 1e-10 &&
        resolveTacticalAllocationMode(allocation.tacticalMode) ===
          DEFAULT_TACTICAL_ALLOCATION_MODE,
    ) ?? tripleAllocationCandidates[0];
  const remainingTripleAllocations = referenceTripleAllocation
    ? tripleAllocationCandidates.filter(
        (allocation) =>
          !sameThreeStrategyAllocation(
            allocation,
            referenceTripleAllocation,
          ),
      )
      : [];
  const higherOrderAllocationCandidates = new Map<
    HigherOrderStrategyCount,
    readonly HigherOrderStrategyAllocation[]
  >([
    [4, options.quadrupleAllocationCandidates ?? FOUR_STRATEGY_ALLOCATION_CANDIDATES],
    [5, options.quintupleAllocationCandidates ?? FIVE_STRATEGY_ALLOCATION_CANDIDATES],
    [6, options.sextupleAllocationCandidates ?? SIX_STRATEGY_ALLOCATION_CANDIDATES],
    [7, options.septupleAllocationCandidates ?? SEVEN_STRATEGY_ALLOCATION_CANDIDATES],
    [8, options.octupleAllocationCandidates ?? EIGHT_STRATEGY_ALLOCATION_CANDIDATES],
    [9, options.nonupleAllocationCandidates ?? NINE_STRATEGY_ALLOCATION_CANDIDATES],
  ]);
  const higherOrderReferenceAllocations = new Map<
    HigherOrderStrategyCount,
    HigherOrderStrategyAllocation | undefined
  >();
  const higherOrderRemainingAllocations = new Map<
    HigherOrderStrategyCount,
    readonly HigherOrderStrategyAllocation[]
  >();
  for (const [strategyCount, allocations] of higherOrderAllocationCandidates) {
    const desiredTenths =
      strategyCount === 4
        ? [4, 2, 2, 2]
        : strategyCount === 5
          ? [2, 2, 2, 2, 2]
          : [
              ...Array.from({ length: 10 - strategyCount }, () => 2),
              ...Array.from(
                { length: strategyCount - (10 - strategyCount) },
                () => 1,
              ),
            ];
    const reference =
      allocations.find((allocation) =>
        STRATEGY_SLOTS.slice(0, strategyCount).every(
          (slot, index) =>
            Math.abs(
              allocationForSlot(allocation, slot) - desiredTenths[index] / 10,
            ) < 1e-10,
        ),
      ) ?? allocations[0];
    higherOrderReferenceAllocations.set(strategyCount, reference);
    higherOrderRemainingAllocations.set(
      strategyCount,
      reference
        ? allocations.filter(
            (allocation) =>
              !sameHigherOrderAllocation(allocation, reference, strategyCount),
          )
        : [],
    );
  }
  const requestedPairFinalistLimit =
    options.maxPairFinalists ?? MAX_COMBINATION_PAIR_FINALISTS;
  const pairFinalistLimit = Number.isFinite(requestedPairFinalistLimit)
    ? Math.max(Math.floor(requestedPairFinalistLimit), 1)
    : MAX_COMBINATION_PAIR_FINALISTS;
  const requestedTripleParentPairLimit =
    options.maxTripleParentPairs ?? MAX_TRIPLE_PARENT_PAIRS;
  const tripleParentPairLimit = Number.isFinite(
    requestedTripleParentPairLimit,
  )
    ? Math.max(Math.floor(requestedTripleParentPairLimit), 1)
    : MAX_TRIPLE_PARENT_PAIRS;
  const requestedTripleFinalistLimit =
    options.maxTripleFinalists ?? MAX_TRIPLE_REFERENCE_FINALISTS;
  const tripleFinalistLimit = Number.isFinite(requestedTripleFinalistLimit)
    ? Math.max(Math.floor(requestedTripleFinalistLimit), 1)
    : MAX_TRIPLE_REFERENCE_FINALISTS;
  const quadrupleParentTripleLimit = Math.max(
    Math.floor(
      options.maxQuadrupleParentTriples ?? MAX_QUADRUPLE_PARENT_TRIPLES,
    ),
    1,
  );
  const quadrupleFinalistLimit = Math.max(
    Math.floor(
      options.maxQuadrupleFinalists ?? MAX_QUADRUPLE_REFERENCE_FINALISTS,
    ),
    1,
  );
  const quintupleParentQuadrupleLimit = Math.max(
    Math.floor(
      options.maxQuintupleParentQuadruples ??
        MAX_QUINTUPLE_PARENT_QUADRUPLES,
    ),
    1,
  );
  const quintupleFinalistLimit = Math.max(
    Math.floor(
      options.maxQuintupleFinalists ?? MAX_QUINTUPLE_REFERENCE_FINALISTS,
    ),
    1,
  );
  const higherOrderParentLimits = new Map<HigherOrderStrategyCount, number>([
    [4, quadrupleParentTripleLimit],
    [5, quintupleParentQuadrupleLimit],
    [6, MAX_QUINTUPLE_PARENT_QUADRUPLES],
    [7, MAX_QUINTUPLE_PARENT_QUADRUPLES],
    [8, MAX_QUINTUPLE_PARENT_QUADRUPLES],
    [9, MAX_QUINTUPLE_PARENT_QUADRUPLES],
  ]);
  const higherOrderFinalistLimits = new Map<HigherOrderStrategyCount, number>([
    [4, quadrupleFinalistLimit],
    [5, quintupleFinalistLimit],
    [6, MAX_QUINTUPLE_REFERENCE_FINALISTS],
    [7, MAX_QUINTUPLE_REFERENCE_FINALISTS],
    [8, MAX_QUINTUPLE_REFERENCE_FINALISTS],
    [9, MAX_QUINTUPLE_REFERENCE_FINALISTS],
  ]);
  const retainedSinglesPerStrategy = Math.max(
    Math.floor(
      options.retainedSinglesPerStrategy ??
        COMBINATION_FINALISTS_PER_STRATEGY,
    ),
    1,
  );
  const yieldEvery = Math.max(
    Math.floor(options.yieldEvery ?? DEFAULT_SCREENING_YIELD_EVERY),
    1,
  );
  const finalistsByStrategy = new Map<
    StrategyId,
    StrategyFinalist[]
  >();
  const entryFilterCandidatesByStrategy = new Map<
    StrategyId,
    EntryFilterCandidate[]
  >();
  const pairFinalists: StrategyPairFinalist[] = [];
  const tripleFinalists: StrategyTripleFinalist[] = [];
  const higherOrderFinalists = new Map<
    HigherOrderStrategyCount,
    StrategyGroupFinalist[]
  >();
  const results: StrategyCombinationResult[] = [];
  let evaluatedCount = 0;
  let failedCount = 0;
  const strategyCandidateCount = candidates.length;
  let totalCandidates = candidates.length;

  options.onProgress?.({
    completed: 0,
    total: totalCandidates,
    stageCompleted: 0,
    stageTotal: strategyCandidateCount,
    failed: 0,
    stage: "strategies",
    strategyAId: null,
    strategyBId: null,
  });
  await yieldForScreening();

  for (const candidate of candidates) {
    if (options.signal?.aborted) break;
    try {
      const selection = {
        strategyId: candidate.strategyId,
        parameters: candidate.parameters,
      };
      const strategy = getStrategy(candidate.strategyId);
      const rawOrders = strategy.buildOrders?.(
        bars,
        candidate.parameters,
      );
      const rawTarget = rawOrders
        ? null
        : strategy.buildTarget(bars, candidate.parameters);
      const execution = buildStrategyExecutionSeries(
        bars,
        selection,
        rawTarget,
        baseEntryAllowed,
        rawOrders,
      );
      const target = execution.target ?? [];
      const result = runBacktestFromTarget(
        bars,
        candidate.strategyId,
        candidate.parameters,
        target,
        baseSettings,
        execution.orders,
      );
      retainFinalist(
        finalistsByStrategy,
        {
          result,
          target,
          orderFills: execution.orderFills,
        },
        objective,
        retainedSinglesPerStrategy,
      );
      if (
        requestedEntryFilters.length > 0 &&
        supportsScreeningMovingAverageSlopeFilter(strategy.id)
      ) {
        retainEntryFilterCandidate(
          entryFilterCandidatesByStrategy,
          {
            result,
            rawTarget,
            rawOrders,
          },
          objective,
        );
      }
    } catch {
      failedCount += 1;
    }
    evaluatedCount += 1;

    if (
      evaluatedCount % yieldEvery === 0 ||
      evaluatedCount === strategyCandidateCount
    ) {
      options.onProgress?.({
        completed: evaluatedCount,
        total: totalCandidates,
        stageCompleted: evaluatedCount,
        stageTotal: strategyCandidateCount,
        failed: failedCount,
        stage: "strategies",
        strategyAId: candidate.strategyId,
        strategyBId: null,
      });
      await yieldForScreening();
    }
  }

  if (
    !options.signal?.aborted &&
    requestedEntryFilters.length > 0
  ) {
    const entryFilterCandidateCount =
      requestedEntryFilters.length *
      [...entryFilterCandidatesByStrategy.values()].reduce(
        (sum, candidatesForStrategy) =>
          sum + candidatesForStrategy.length,
        0,
      );
    totalCandidates += entryFilterCandidateCount;
    options.onProgress?.({
      completed: evaluatedCount,
      total: totalCandidates,
      stageCompleted: 0,
      stageTotal: entryFilterCandidateCount,
      failed: failedCount,
      stage: "entryFilters",
      strategyAId: null,
      strategyBId: null,
    });
    await yieldForScreening();

    let evaluatedEntryFilterCount = 0;
    entryFilterLoop: for (const entryFilter of requestedEntryFilters) {
      const entryAllowed = buildMovingAverageEntryAllowedSeries(
        bars,
        entryFilter,
      );
      const filterSettings: StrategyCombinationBacktestSettings = {
        ...settings,
        entryFilter,
        entryFilterAllowed: entryAllowed ?? undefined,
      };
      for (const [strategyId, candidatesForStrategy] of
        entryFilterCandidatesByStrategy) {
        for (const candidate of candidatesForStrategy) {
          if (options.signal?.aborted) break entryFilterLoop;
          try {
            const selection = {
              strategyId,
              parameters: candidate.result.parameters,
            };
            const execution = buildStrategyExecutionSeries(
              bars,
              selection,
              candidate.rawTarget,
              entryAllowed,
              candidate.rawOrders,
            );
            const target = execution.target ?? [];
            retainFinalist(
              finalistsByStrategy,
              {
                result: runBacktestFromTarget(
                  bars,
                  strategyId,
                  candidate.result.parameters,
                  target,
                  filterSettings,
                  execution.orders,
                ),
                target,
                orderFills: execution.orderFills,
              },
              objective,
              retainedSinglesPerStrategy,
            );
          } catch {
            failedCount += 1;
          }
          evaluatedCount += 1;
          evaluatedEntryFilterCount += 1;

          if (
            evaluatedCount % yieldEvery === 0 ||
            evaluatedEntryFilterCount === entryFilterCandidateCount
          ) {
            options.onProgress?.({
              completed: evaluatedCount,
              total: totalCandidates,
              stageCompleted: evaluatedEntryFilterCount,
              stageTotal: entryFilterCandidateCount,
              failed: failedCount,
              stage: "entryFilters",
              strategyAId: strategyId,
              strategyBId: null,
            });
            await yieldForScreening();
          }
        }
      }
    }
  }

  const singleFinalists = STRATEGIES.map(
    (strategy) => finalistsByStrategy.get(strategy.id)?.[0],
  ).filter(
    (finalist): finalist is StrategyFinalist => Boolean(finalist),
  );
  const pairingFinalists = STRATEGIES.flatMap(
    (strategy) =>
      (finalistsByStrategy.get(strategy.id) ?? []).slice(
        0,
        COMBINATION_FINALISTS_PER_STRATEGY,
      ),
  );

  if (!options.signal?.aborted) {
    const pairCount = referenceAllocation
      ? pairingFinalists.reduce(
          (count, strategyAFinalist, strategyAIndex) =>
            count +
            pairingFinalists
              .slice(strategyAIndex + 1)
              .filter(
                (strategyBFinalist) =>
                  strategyAFinalist.result.strategyId !==
                    strategyBFinalist.result.strategyId &&
                  !areStrategiesEquivalent(
                    strategyAFinalist.result.strategyId,
                    strategyBFinalist.result.strategyId,
                  ),
              ).length,
          0,
        )
      : 0;
    totalCandidates = strategyCandidateCount + pairCount;
    if (requestedEntryFilters.length > 0) {
      totalCandidates +=
        requestedEntryFilters.length *
        [...entryFilterCandidatesByStrategy.values()].reduce(
          (sum, candidatesForStrategy) =>
            sum + candidatesForStrategy.length,
          0,
        );
    }

    options.onProgress?.({
      completed: evaluatedCount,
      total: totalCandidates,
      stageCompleted: 0,
      stageTotal: pairCount,
      failed: failedCount,
      stage: "pairs",
      strategyAId: null,
      strategyBId: null,
    });
    await yieldForScreening();
    let evaluatedPairCount = 0;
    const pairSettings: StrategyCombinationBacktestSettings = {
      ...settings,
      entryFilter: null,
      entryFilterAllowed: undefined,
    };

    pairLoop: for (
      let strategyAIndex = 0;
      strategyAIndex < pairingFinalists.length;
      strategyAIndex += 1
    ) {
      const strategyAFinalist = pairingFinalists[strategyAIndex];
      for (
        let strategyBIndex = strategyAIndex + 1;
        strategyBIndex < pairingFinalists.length;
        strategyBIndex += 1
      ) {
        const strategyBFinalist = pairingFinalists[strategyBIndex];
        const strategyAId = strategyAFinalist.result.strategyId;
        const strategyBId = strategyBFinalist.result.strategyId;
        if (strategyAId === strategyBId) continue;
        if (areStrategiesEquivalent(strategyAId, strategyBId)) continue;
        if (options.signal?.aborted || !referenceAllocation) break pairLoop;
        try {
          const referenceResult = runCombinationCandidate(
            bars,
            strategyAFinalist,
            strategyBFinalist,
            referenceAllocation,
            pairSettings,
          );
          retainPairFinalist(
            pairFinalists,
            {
              strategyA: strategyAFinalist,
              strategyB: strategyBFinalist,
              referenceResult,
              settings: pairSettings,
            },
            objective,
            pairFinalistLimit,
          );
        } catch {
          failedCount += 1;
        }
        evaluatedCount += 1;
        evaluatedPairCount += 1;

        if (
          evaluatedCount % yieldEvery === 0 ||
          evaluatedPairCount === pairCount
        ) {
          options.onProgress?.({
            completed: evaluatedCount,
            total: totalCandidates,
            stageCompleted: evaluatedPairCount,
            stageTotal: pairCount,
            failed: failedCount,
            stage: "pairs",
            strategyAId,
            strategyBId,
          });
          await yieldForScreening();
        }
      }
    }

    if (!options.signal?.aborted) {
      totalCandidates += pairFinalists.length * remainingAllocations.length;
      options.onProgress?.({
        completed: evaluatedCount,
        total: totalCandidates,
        stageCompleted: 0,
        stageTotal:
          pairFinalists.length * remainingAllocations.length,
        failed: failedCount,
        stage: "allocations",
        strategyAId: null,
        strategyBId: null,
      });
      await yieldForScreening();
      let evaluatedAllocationCount = 0;

      allocationLoop: for (const finalist of pairFinalists) {
        retainCombinationResult(
          results,
          finalist.referenceResult,
          objective,
        );
        for (const allocation of remainingAllocations) {
          if (options.signal?.aborted) break allocationLoop;
          try {
            retainCombinationResult(
              results,
              runCombinationCandidate(
                bars,
                finalist.strategyA,
                finalist.strategyB,
                allocation,
                finalist.settings,
              ),
              objective,
            );
          } catch {
            failedCount += 1;
          }
          evaluatedCount += 1;
          evaluatedAllocationCount += 1;

          if (
            evaluatedCount % yieldEvery === 0 ||
            evaluatedCount === totalCandidates
          ) {
            options.onProgress?.({
              completed: evaluatedCount,
              total: totalCandidates,
              stageCompleted: evaluatedAllocationCount,
              stageTotal:
                pairFinalists.length * remainingAllocations.length,
              failed: failedCount,
              stage: "allocations",
              strategyAId: finalist.strategyA.result.strategyId,
              strategyBId: finalist.strategyB.result.strategyId,
            });
            await yieldForScreening();
          }
        }
      }
    }

    if (
      !options.signal?.aborted &&
      includeTriples &&
      referenceTripleAllocation
    ) {
      const tripleParentPairs = selectPrimaryDiverseCandidates(
        pairFinalists,
        (candidate) => candidate.referenceResult,
        objective,
        tripleParentPairLimit,
        MAX_MULTI_STRATEGY_FINALISTS_PER_PRIMARY,
      );
      const isEligibleThirdStrategy = (
        parent: StrategyPairFinalist,
        candidate: StrategyFinalist,
      ) => {
        const candidateId = candidate.result.strategyId;
        const strategyAId = parent.strategyA.result.strategyId;
        const strategyBId = parent.strategyB.result.strategyId;
        return (
          candidateId !== strategyAId &&
          candidateId !== strategyBId &&
          !areStrategiesEquivalent(candidateId, strategyAId) &&
          !areStrategiesEquivalent(candidateId, strategyBId)
        );
      };
      const tripleCount = tripleParentPairs.reduce(
        (count, parent) =>
          count +
          pairingFinalists.filter((candidate) =>
            isEligibleThirdStrategy(parent, candidate),
          ).length,
        0,
      );
      totalCandidates += tripleCount;
      options.onProgress?.({
        completed: evaluatedCount,
        total: totalCandidates,
        stageCompleted: 0,
        stageTotal: tripleCount,
        failed: failedCount,
        stage: "triples",
        strategyAId: null,
        strategyBId: null,
        strategyCId: null,
      });
      await yieldForScreening();
      let evaluatedTripleCount = 0;

      tripleLoop: for (const parent of tripleParentPairs) {
        for (const strategyCFinalist of pairingFinalists) {
          if (!isEligibleThirdStrategy(parent, strategyCFinalist)) continue;
          if (options.signal?.aborted) break tripleLoop;
          try {
            const referenceResult = runTripleCombinationCandidate(
              bars,
              parent.strategyA,
              parent.strategyB,
              strategyCFinalist,
              referenceTripleAllocation,
              parent.settings,
            );
            retainTripleFinalist(
              tripleFinalists,
              {
                strategyA: parent.strategyA,
                strategyB: parent.strategyB,
                strategyC: strategyCFinalist,
                referenceResult,
                settings: parent.settings,
              },
              objective,
              tripleFinalistLimit,
            );
          } catch {
            failedCount += 1;
          }
          evaluatedCount += 1;
          evaluatedTripleCount += 1;
          if (
            evaluatedCount % yieldEvery === 0 ||
            evaluatedTripleCount === tripleCount
          ) {
            options.onProgress?.({
              completed: evaluatedCount,
              total: totalCandidates,
              stageCompleted: evaluatedTripleCount,
              stageTotal: tripleCount,
              failed: failedCount,
              stage: "triples",
              strategyAId: parent.strategyA.result.strategyId,
              strategyBId: parent.strategyB.result.strategyId,
              strategyCId: strategyCFinalist.result.strategyId,
            });
            await yieldForScreening();
          }
        }
      }

      if (!options.signal?.aborted) {
        const tripleAllocationCount =
          tripleFinalists.length * remainingTripleAllocations.length;
        totalCandidates += tripleAllocationCount;
        options.onProgress?.({
          completed: evaluatedCount,
          total: totalCandidates,
          stageCompleted: 0,
          stageTotal: tripleAllocationCount,
          failed: failedCount,
          stage: "tripleAllocations",
          strategyAId: null,
          strategyBId: null,
          strategyCId: null,
        });
        await yieldForScreening();
        let evaluatedTripleAllocationCount = 0;

        tripleAllocationLoop: for (const finalist of tripleFinalists) {
          retainCombinationResult(
            results,
            finalist.referenceResult,
            objective,
          );
          for (const allocation of remainingTripleAllocations) {
            if (options.signal?.aborted) break tripleAllocationLoop;
            try {
              retainCombinationResult(
                results,
                runTripleCombinationCandidate(
                  bars,
                  finalist.strategyA,
                  finalist.strategyB,
                  finalist.strategyC,
                  allocation,
                  finalist.settings,
                ),
                objective,
              );
            } catch {
              failedCount += 1;
            }
            evaluatedCount += 1;
            evaluatedTripleAllocationCount += 1;
            if (
              evaluatedCount % yieldEvery === 0 ||
              evaluatedTripleAllocationCount === tripleAllocationCount
            ) {
              options.onProgress?.({
                completed: evaluatedCount,
                total: totalCandidates,
                stageCompleted: evaluatedTripleAllocationCount,
                stageTotal: tripleAllocationCount,
                failed: failedCount,
                stage: "tripleAllocations",
                strategyAId: finalist.strategyA.result.strategyId,
                strategyBId: finalist.strategyB.result.strategyId,
                strategyCId: finalist.strategyC.result.strategyId,
              });
              await yieldForScreening();
            }
          }
        }
      }

      const higherOrderStageNames: Record<
        HigherOrderStrategyCount,
        {
          discovery: CombinationScreeningStage;
          allocations: CombinationScreeningStage;
        }
      > = {
        4: { discovery: "quadruples", allocations: "quadrupleAllocations" },
        5: { discovery: "quintuples", allocations: "quintupleAllocations" },
        6: { discovery: "sextuples", allocations: "sextupleAllocations" },
        7: { discovery: "septuples", allocations: "septupleAllocations" },
        8: { discovery: "octuples", allocations: "octupleAllocations" },
        9: { discovery: "nonuples", allocations: "nonupleAllocations" },
      };
      const progressStrategyIds = (
        strategies: readonly StrategyFinalist[] = [],
      ): Pick<
        CombinationScreeningProgress,
        | "strategyAId"
        | "strategyBId"
        | "strategyCId"
        | "strategyDId"
        | "strategyEId"
        | "strategyFId"
        | "strategyGId"
        | "strategyHId"
        | "strategyIId"
      > => ({
        strategyAId: strategies[0]?.result.strategyId ?? null,
        strategyBId: strategies[1]?.result.strategyId ?? null,
        strategyCId: strategies[2]?.result.strategyId ?? null,
        strategyDId: strategies[3]?.result.strategyId ?? null,
        strategyEId: strategies[4]?.result.strategyId ?? null,
        strategyFId: strategies[5]?.result.strategyId ?? null,
        strategyGId: strategies[6]?.result.strategyId ?? null,
        strategyHId: strategies[7]?.result.strategyId ?? null,
        strategyIId: strategies[8]?.result.strategyId ?? null,
      });
      const isEligibleNextStrategy = (
        parentStrategies: readonly StrategyFinalist[],
        candidate: StrategyFinalist,
      ) =>
        parentStrategies.every(
          (existing) =>
            existing.result.strategyId !== candidate.result.strategyId &&
            !areStrategiesEquivalent(
              existing.result.strategyId,
              candidate.result.strategyId,
            ),
        );
      let parentGroups: StrategyGroupFinalist[] = tripleFinalists.map(
        (parent) => ({
          strategies: [parent.strategyA, parent.strategyB, parent.strategyC],
          referenceResult: parent.referenceResult,
          settings: parent.settings,
        }),
      );

      higherOrderLoop: for (const strategyCount of [4, 5, 6, 7, 8, 9] as const) {
        if (options.signal?.aborted) break;
        const referenceAllocation =
          higherOrderReferenceAllocations.get(strategyCount);
        if (!referenceAllocation || parentGroups.length === 0) break;
        const stages = higherOrderStageNames[strategyCount];
        const parents = parentGroups.slice(
          0,
          higherOrderParentLimits.get(strategyCount),
        );
        const finalists: StrategyGroupFinalist[] = [];
        higherOrderFinalists.set(strategyCount, finalists);
        const discoveryCount = parents.reduce(
          (count, parent) =>
            count +
            pairingFinalists.filter((candidate) =>
              isEligibleNextStrategy(parent.strategies, candidate),
            ).length,
          0,
        );
        totalCandidates += discoveryCount;
        options.onProgress?.({
          completed: evaluatedCount,
          total: totalCandidates,
          stageCompleted: 0,
          stageTotal: discoveryCount,
          failed: failedCount,
          stage: stages.discovery,
          ...progressStrategyIds(),
        });
        await yieldForScreening();
        let evaluatedDiscoveryCount = 0;

        for (const parent of parents) {
          for (const candidate of pairingFinalists) {
            if (!isEligibleNextStrategy(parent.strategies, candidate)) continue;
            if (options.signal?.aborted) break higherOrderLoop;
            const strategies = [...parent.strategies, candidate];
            try {
              const referenceResult = runHigherOrderCombinationCandidate(
                bars,
                strategies,
                referenceAllocation,
                parent.settings,
              );
              retainStrategyGroupFinalist(
                finalists,
                { strategies, referenceResult, settings: parent.settings },
                objective,
                higherOrderFinalistLimits.get(strategyCount) ??
                  MAX_QUINTUPLE_REFERENCE_FINALISTS,
              );
            } catch {
              failedCount += 1;
            }
            evaluatedCount += 1;
            evaluatedDiscoveryCount += 1;
            if (
              evaluatedCount % yieldEvery === 0 ||
              evaluatedDiscoveryCount === discoveryCount
            ) {
              options.onProgress?.({
                completed: evaluatedCount,
                total: totalCandidates,
                stageCompleted: evaluatedDiscoveryCount,
                stageTotal: discoveryCount,
                failed: failedCount,
                stage: stages.discovery,
                ...progressStrategyIds(strategies),
              });
              await yieldForScreening();
            }
          }
        }

        if (options.signal?.aborted) break;
        const remainingAllocations =
          higherOrderRemainingAllocations.get(strategyCount) ?? [];
        const allocationCount = finalists.length * remainingAllocations.length;
        totalCandidates += allocationCount;
        options.onProgress?.({
          completed: evaluatedCount,
          total: totalCandidates,
          stageCompleted: 0,
          stageTotal: allocationCount,
          failed: failedCount,
          stage: stages.allocations,
          ...progressStrategyIds(),
        });
        await yieldForScreening();
        let evaluatedAllocationCount = 0;

        for (const finalist of finalists) {
          retainCombinationResult(
            results,
            finalist.referenceResult,
            objective,
          );
          for (const allocation of remainingAllocations) {
            if (options.signal?.aborted) break higherOrderLoop;
            try {
              retainCombinationResult(
                results,
                runHigherOrderCombinationCandidate(
                  bars,
                  finalist.strategies,
                  allocation,
                  finalist.settings,
                ),
                objective,
              );
            } catch {
              failedCount += 1;
            }
            evaluatedCount += 1;
            evaluatedAllocationCount += 1;
            if (
              evaluatedCount % yieldEvery === 0 ||
              evaluatedAllocationCount === allocationCount
            ) {
              options.onProgress?.({
                completed: evaluatedCount,
                total: totalCandidates,
                stageCompleted: evaluatedAllocationCount,
                stageTotal: allocationCount,
                failed: failedCount,
                stage: stages.allocations,
                ...progressStrategyIds(finalist.strategies),
              });
              await yieldForScreening();
            }
          }
        }
        parentGroups = finalists;
      }
    }
  }

  return {
    singleResults: singleFinalists
      .map((finalist) => finalist.result)
      .sort((left, right) =>
        compareScreeningResults(left, right, objective),
      )
      .slice(0, MAX_SCREENING_RESULTS_PER_CATEGORY),
    singleCandidatePool: [...finalistsByStrategy.values()]
      .flat()
      .map((finalist) => finalist.result)
      .sort((left, right) =>
        compareScreeningResults(left, right, objective),
      ),
    results,
    evaluatedCount,
    totalCandidates,
    failedCount,
    cancelled: Boolean(options.signal?.aborted),
  };
}
