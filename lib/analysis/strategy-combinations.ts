import type {
  MarketBar,
  MarketInterval,
  MarketLatestBarStatus,
} from "@/lib/market/types";
import {
  createBacktestExecutionContext,
  runAllocationBacktest,
  runBacktest,
  runBacktestFromTarget,
  type AllocationIntrabarExecution,
  type AllocationSignalEvent,
  type AllocationTimelineReader,
  type AllocationTimelineState,
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
export const SCREENING_POSITIONING_MODEL_VERSION = 2;
export const SCREENING_RESULT_MODEL_VERSION = 4;
export const DEFAULT_TACTICAL_ALLOCATION_MODE = "add-on-short-entry" as const;
export const MULTI_STRATEGY_CORE_ALLOCATION = 0.6;
export const MULTI_STRATEGY_BALANCED_ALLOCATION = 0.8;
export const MULTI_STRATEGY_TACTICAL_FULL_SUPPORT = 0.7;
export const MULTI_STRATEGY_TACTICAL_BASE_SUPPORT = 0.3;
export const MULTI_STRATEGY_FULL_HOLD_SUPPORT = 0.4;
export const MULTI_STRATEGY_BASE_HOLD_SUPPORT = 0.6;
export const MULTI_STRATEGY_VOLATILITY_ELEVATED_RATIO = 1.25;
export const MULTI_STRATEGY_VOLATILITY_HIGH_RATIO = 1.5;
export const MULTI_STRATEGY_VOLATILITY_SEVERE_RATIO = 2;
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
export const MAX_MULTI_STRATEGY_RESULTS_PER_PRIMARY = 3;
export const MAX_MULTI_STRATEGY_FINALISTS_PER_PRIMARY = 16;
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
  | "sextupleAllocations";

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
  entryFilterAllowedByKey?: ReadonlyMap<string, readonly boolean[]>;
  allocationCandidates?: readonly TwoStrategyAllocation[];
  tripleAllocationCandidates?: readonly ThreeStrategyAllocation[];
  quadrupleAllocationCandidates?: readonly FourStrategyAllocation[];
  quintupleAllocationCandidates?: readonly FiveStrategyAllocation[];
  sextupleAllocationCandidates?: readonly SixStrategyAllocation[];
  includeTriples?: boolean;
  maxCombinationStrategies?: number;
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
  /** Persist an exact intra-stage checkpoint after this many evaluations. */
  checkpointEvery?: number;
  onProgress?: (progress: CombinationScreeningProgress) => void;
  resumeCheckpoint?: CombinationOptimizationCheckpoint | null;
  onCheckpoint?: (checkpoint: CombinationOptimizationCheckpoint) => void;
}

type NumericTargetSeries = readonly number[] | Uint8Array;

export interface StrategyFinalist {
  result: BacktestResult;
  target: Uint8Array;
  orderFills: ReadonlyMap<number, readonly StrategyOrderFill[]>;
  screeningHorizon: StrategySignalHorizon;
}

export interface EntryFilterCandidate {
  result: BacktestResult;
  rawTarget: number[] | null;
  rawOrders?: StrategyOrderSeries;
}

export interface StrategyPairFinalist {
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
  targets: readonly (NumericTargetSeries | null)[],
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

export interface StrategyTripleFinalist {
  strategyA: StrategyFinalist;
  strategyB: StrategyFinalist;
  strategyC: StrategyFinalist;
  referenceResult: StrategyCombinationResult;
  settings: StrategyCombinationBacktestSettings;
}

export interface StrategyGroupFinalist {
  strategies: StrategyFinalist[];
  referenceResult: StrategyCombinationResult;
  settings: StrategyCombinationBacktestSettings;
}

export interface CombinationOptimizationCheckpoint {
  version: 1;
  progress: CombinationScreeningProgress;
  entryFilterCandidateCount?: number;
  finalistsByStrategy: Array<[StrategyId, StrategyFinalist[]]>;
  entryFilterCandidatesByStrategy: Array<[StrategyId, EntryFilterCandidate[]]>;
  pairFinalists: StrategyPairFinalist[];
  tripleFinalists: StrategyTripleFinalist[];
  higherOrderFinalists: Array<[
    HigherOrderStrategyCount,
    StrategyGroupFinalist[],
  ]>;
  results: StrategyCombinationResult[];
}

const OPTIMIZATION_STAGE_ORDER: readonly CombinationScreeningStage[] = [
  "strategies", "entryFilters", "pairs", "allocations", "triples",
  "tripleAllocations", "quadruples", "quadrupleAllocations",
  "quintuples", "quintupleAllocations", "sextuples",
  "sextupleAllocations",
];


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
  sourceTarget: NumericTargetSeries,
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
  sourceTarget: NumericTargetSeries,
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
  target: NumericTargetSeries;
  allocation: number;
}

interface StrategyLayerState {
  gateActive: boolean;
  activeTacticalSlots: StrategySlot[];
}

interface CoreSatelliteState {
  targetAllocation: number;
}

const STRATEGY_SLOT_ORDER = STRATEGY_SLOTS;
const EMPTY_ALLOCATION_SIGNALS: readonly AllocationSignalEvent[] = [];
const LONG_ENTRY_SIGNALS: readonly AllocationSignalEvent[] = ["long-entry"];
const LONG_EXIT_SIGNALS: readonly AllocationSignalEvent[] = ["long-exit"];
const TACTICAL_ENTRY_SIGNALS: readonly AllocationSignalEvent[] = ["short-entry"];
const TACTICAL_EXIT_SIGNALS: readonly AllocationSignalEvent[] = ["short-exit"];
const EMPTY_INTRABAR_EXECUTIONS: readonly AllocationIntrabarExecution[] = [];

const volatilityRiskCapCache = new WeakMap<object, Float64Array>();

export function buildMultiStrategyVolatilityRiskCaps(
  bars: readonly MarketBar[],
): Float64Array {
  const cached = volatilityRiskCapCache.get(bars);
  if (cached) return cached;
  const caps = new Float64Array(bars.length);
  let fastRange = 0;
  let slowRange = 0;
  let currentCap = 1;
  let recoveryCandidate = 1;
  let recoveryCount = 0;
  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index]!;
    const previousClose = index > 0 ? bars[index - 1]!.close : bar.open;
    const trueRange = Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - previousClose),
      Math.abs(bar.low - previousClose),
    );
    const rangePercent = trueRange / Math.max(Math.abs(previousClose), 1e-10);
    fastRange = index === 0
      ? rangePercent
      : fastRange + (rangePercent - fastRange) / 3;
    slowRange = index === 0
      ? rangePercent
      : slowRange + (rangePercent - slowRange) / 10.5;
    const ratio = slowRange > 1e-12 ? fastRange / slowRange : 1;
    const rawCap = index < 19
      ? 1
      : ratio >= MULTI_STRATEGY_VOLATILITY_SEVERE_RATIO
        ? 0
        : ratio >= MULTI_STRATEGY_VOLATILITY_HIGH_RATIO
          ? MULTI_STRATEGY_CORE_ALLOCATION
          : ratio >= MULTI_STRATEGY_VOLATILITY_ELEVATED_RATIO
            ? MULTI_STRATEGY_BALANCED_ALLOCATION
            : 1;
    if (rawCap < currentCap) {
      currentCap = rawCap;
      recoveryCandidate = rawCap;
      recoveryCount = 0;
    } else if (rawCap > currentCap) {
      if (rawCap === recoveryCandidate) recoveryCount += 1;
      else {
        recoveryCandidate = rawCap;
        recoveryCount = 1;
      }
      if (recoveryCount >= 2) {
        currentCap = rawCap;
        recoveryCount = 0;
      }
    } else {
      recoveryCandidate = rawCap;
      recoveryCount = 0;
    }
    caps[index] = currentCap;
  }
  volatilityRiskCapCache.set(bars, caps);
  return caps;
}

function resolveCoreSatelliteTarget(
  previousTarget: number,
  coreActive: boolean,
  tacticalSupport: number,
  volatilityRiskCap: number,
): number {
  if (!coreActive) return 0;
  let desiredTarget: number;
  if (tacticalSupport >= MULTI_STRATEGY_TACTICAL_FULL_SUPPORT - 1e-10) {
    desiredTarget = 1;
  } else if (
    tacticalSupport <= MULTI_STRATEGY_TACTICAL_BASE_SUPPORT + 1e-10
  ) {
    desiredTarget = MULTI_STRATEGY_CORE_ALLOCATION;
  } else if (
    previousTarget >= 1 - 1e-10 &&
    tacticalSupport > MULTI_STRATEGY_FULL_HOLD_SUPPORT + 1e-10
  ) {
    desiredTarget = 1;
  } else if (
    previousTarget > 0 &&
    previousTarget <= MULTI_STRATEGY_CORE_ALLOCATION + 1e-10 &&
    tacticalSupport < MULTI_STRATEGY_BASE_HOLD_SUPPORT - 1e-10
  ) {
    desiredTarget = MULTI_STRATEGY_CORE_ALLOCATION;
  } else {
    desiredTarget = MULTI_STRATEGY_BALANCED_ALLOCATION;
  }
  return Math.min(desiredTarget, volatilityRiskCap);
}

function allocationTransitionSignals(
  previousTarget: number,
  nextTarget: number,
): readonly AllocationSignalEvent[] {
  if (previousTarget <= 0 && nextTarget > 0) return LONG_ENTRY_SIGNALS;
  if (previousTarget > 0 && nextTarget <= 0) return LONG_EXIT_SIGNALS;
  if (nextTarget > previousTarget + 1e-10) return TACTICAL_ENTRY_SIGNALS;
  if (nextTarget < previousTarget - 1e-10) return TACTICAL_EXIT_SIGNALS;
  return EMPTY_ALLOCATION_SIGNALS;
}

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

function buildCoreSatelliteStrategyTimeline(
  legs: readonly StrategyTargetLeg[],
  coreStrategy: StrategySlot,
  volatilityRiskCaps?: ArrayLike<number>,
  initialTargetAllocation = 0,
): StrategyPlanTimeline {
  if (volatilityRiskCaps && volatilityRiskCaps.length !== legs[0].target.length) {
    throw new Error("Volatility risk caps must align with strategy targets");
  }
  const coreLeg = legs.find((leg) => leg.slot === coreStrategy);
  if (!coreLeg) throw new Error("A core-satellite plan requires a core strategy");
  const tacticalLegs = legs.filter((leg) => leg.slot !== coreStrategy);
  const tacticalWeight = tacticalLegs.reduce(
    (sum, leg) => sum + leg.allocation,
    0,
  );
  if (tacticalWeight <= 0) {
    throw new Error("A core-satellite plan requires tactical strategy weight");
  }
  const state: CoreSatelliteState = {
    targetAllocation: initialTargetAllocation,
  };
  const target: number[] = [];
  const signalEvents: AllocationSignalEvent[][] = [];
  const layerStates: StrategyLayerState[] = [];

  legs[0].target.forEach((_, index) => {
    let activeTacticalWeight = 0;
    const activeTacticalSlots: StrategySlot[] = [];
    for (const leg of tacticalLegs) {
      if ((leg.target[index] ?? 0) <= 0) continue;
      activeTacticalWeight += leg.allocation;
      activeTacticalSlots.push(leg.slot);
    }
    const nextTarget = resolveCoreSatelliteTarget(
      state.targetAllocation,
      (coreLeg.target[index] ?? 0) > 0,
      activeTacticalWeight / tacticalWeight,
      volatilityRiskCaps?.[index] ?? 1,
    );
    signalEvents.push([
      ...allocationTransitionSignals(state.targetAllocation, nextTarget),
    ]);
    target.push(nextTarget);
    layerStates.push({
      gateActive: (coreLeg.target[index] ?? 0) > 0,
      activeTacticalSlots,
    });
    state.targetAllocation = nextTarget;
  });

  return {
    target,
    signalEvents,
    relativeLongStrategy: coreStrategy,
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

type StrategyRoleTargets = Partial<Record<StrategySlot, NumericTargetSeries>> & {
  strategyA: NumericTargetSeries;
  strategyB: NumericTargetSeries;
};

function selectRoleTargetWindow(
  bars: readonly MarketBar[],
  target: NumericTargetSeries,
  roleWindow?: Pick<BacktestSettings, "startTime" | "endTime">,
): number[] {
  if (!roleWindow?.startTime && !roleWindow?.endTime) return [...target];
  return Array.from(target).filter((_, index) => {
    const time = bars[index].time;
    return (
      (!roleWindow.startTime || time >= roleWindow.startTime) &&
      (!roleWindow.endTime || time <= roleWindow.endTime)
    );
  });
}

export function buildStrategyPlanTimelineFromTargets(
  strategyATarget: NumericTargetSeries | null,
  strategyBTarget: NumericTargetSeries | null,
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
  volatilityRiskCaps?: ArrayLike<number>,
  initialTargetAllocation = 0,
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
    return buildCoreSatelliteStrategyTimeline(
      legs,
      coreStrategy,
      volatilityRiskCaps,
      initialTargetAllocation,
    );
  }
  return buildHierarchicalStrategyTimeline(
    legs,
    coreStrategy,
    tacticalMode,
  );
}

export function buildThreeStrategyPlanTimelineFromTargets(
  strategyATarget: NumericTargetSeries,
  strategyBTarget: NumericTargetSeries,
  strategyCTarget: NumericTargetSeries,
  strategyAAllocation: number,
  strategyBAllocation: number,
  strategyCAllocation: number,
  roleTargets?: StrategyRoleTargets,
  fixedCoreStrategy?: StrategySlot,
  tacticalMode: TacticalAllocationMode = DEFAULT_TACTICAL_ALLOCATION_MODE,
  volatilityRiskCaps?: ArrayLike<number>,
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
    volatilityRiskCaps,
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
  execution: {
    target: NumericTargetSeries | null;
    orderFills:
      | readonly (readonly StrategyOrderFill[])[]
      | ReadonlyMap<number, readonly StrategyOrderFill[]>;
    screeningHorizon?: StrategySignalHorizon;
  };
}

function orderFillsAt(
  collection: StrategyExecutionLeg["execution"]["orderFills"],
  index: number,
): readonly StrategyOrderFill[] {
  return Array.isArray(collection)
    ? (collection[index] ?? [])
    : ((collection as ReadonlyMap<number, readonly StrategyOrderFill[]>).get(index) ?? []);
}

function compactOrderFills(
  collection: readonly (readonly StrategyOrderFill[])[],
): ReadonlyMap<number, readonly StrategyOrderFill[]> {
  const compact = new Map<number, readonly StrategyOrderFill[]>();
  collection.forEach((fills, index) => {
    if (fills.length > 0) compact.set(index, fills);
  });
  return compact;
}

function compactTarget(target: readonly number[]): Uint8Array {
  return Uint8Array.from(target, (value) => (value > 0 ? 1 : 0));
}

function buildPlanIntrabarExecutions(
  timeline: StrategyPlanTimeline,
  legs: readonly StrategyExecutionLeg[],
  tacticalMode: TacticalAllocationMode,
): AllocationIntrabarExecution[][] {
  if (legs.length === 1) {
    const selectedFills = legs[0].execution.orderFills;
    return Array.from({ length: timeline.target.length }, (_, index) =>
      orderFillsAt(selectedFills, index).map((fill) => ({
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
        orderFillsAt(leg.execution.orderFills, index).map((fill) => ({
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

function resolveCoreStrategyForWindow(
  bars: readonly MarketBar[],
  legs: readonly StrategyExecutionLeg[],
  settings: Pick<BacktestSettings, "startTime" | "endTime">,
): StrategySlot {
  const summaries = legs.map((leg) => {
    if (leg.execution.screeningHorizon) {
      return { slot: leg.slot, ...leg.execution.screeningHorizon };
    }
    let activeBars = 0;
    let activeRunCount = 0;
    let transitionCount = 0;
    let wasActive = false;
    let hasPrevious = false;
    for (let index = 0; index < bars.length; index += 1) {
      const time = bars[index]!.time;
      if (settings.startTime && time < settings.startTime) continue;
      if (settings.endTime && time > settings.endTime) continue;
      const active = (leg.execution.target?.[index] ?? 0) > 0;
      if (active) activeBars += 1;
      if (active && !wasActive) activeRunCount += 1;
      if (hasPrevious && active !== wasActive) transitionCount += 1;
      wasActive = active;
      hasPrevious = true;
    }
    return {
      slot: leg.slot,
      averageActiveBars:
        activeRunCount > 0 ? activeBars / activeRunCount : 0,
      transitionCount,
    };
  });
  return summaries.sort((left, right) => {
    const averageDifference =
      right.averageActiveBars - left.averageActiveBars;
    if (Math.abs(averageDifference) > 1e-10) return averageDifference;
    if (left.transitionCount !== right.transitionCount) {
      return left.transitionCount - right.transitionCount;
    }
    return (
      STRATEGY_SLOT_ORDER.indexOf(left.slot) -
      STRATEGY_SLOT_ORDER.indexOf(right.slot)
    );
  })[0]!.slot;
}

function summarizeStrategySignalHorizonForWindow(
  bars: readonly MarketBar[],
  target: readonly number[],
  settings: Pick<BacktestSettings, "startTime" | "endTime">,
): StrategySignalHorizon {
  let activeBars = 0;
  let activeRunCount = 0;
  let transitionCount = 0;
  let wasActive = false;
  let hasPrevious = false;
  for (let index = 0; index < bars.length; index += 1) {
    const time = bars[index]!.time;
    if (settings.startTime && time < settings.startTime) continue;
    if (settings.endTime && time > settings.endTime) continue;
    const active = (target[index] ?? 0) > 0;
    if (active) activeBars += 1;
    if (active && !wasActive) activeRunCount += 1;
    if (hasPrevious && active !== wasActive) transitionCount += 1;
    wasActive = active;
    hasPrevious = true;
  }
  return {
    averageActiveBars:
      activeRunCount > 0 ? activeBars / activeRunCount : 0,
    activeRunCount,
    transitionCount,
  };
}

function streamIntrabarExecutionsAtIndex(
  index: number,
  previousState: StrategyLayerState | null,
  legs: readonly StrategyExecutionLeg[],
  coreSlot: StrategySlot,
  tacticalMode: TacticalAllocationMode,
): readonly AllocationIntrabarExecution[] {
  if (legs.length >= 3) return EMPTY_INTRABAR_EXECUTIONS;
  const coreLeg = legs.find((leg) => leg.slot === coreSlot);
  if (!coreLeg) throw new Error("A strategy pair requires a core strategy");
  const tacticalLegs = legs.filter((leg) => leg.slot !== coreSlot);
  let gateActive = previousState?.gateActive ?? false;
  const activeTacticalSlots = new Set(
    previousState?.activeTacticalSlots ?? [],
  );
  const allocationForState = () =>
    gateActive
      ? coreLeg.allocation +
        tacticalLegs.reduce(
          (sum, leg) =>
            sum + (activeTacticalSlots.has(leg.slot) ? leg.allocation : 0),
          0,
        )
      : 0;
  let currentAllocation = allocationForState();
  const executions: AllocationIntrabarExecution[] = [];
  const orderedFills = legs
    .flatMap((leg) =>
      orderFillsAt(leg.execution.orderFills, index).map((fill) => ({ fill, leg })),
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
  for (const { fill, leg } of orderedFills) {
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
    const targetAllocation = allocationForState();
    if (Math.abs(targetAllocation - currentAllocation) > 1e-10) {
      executions.push({
        targetAllocation,
        fillPrice: fill.fillPrice,
        signals,
      });
      currentAllocation = targetAllocation;
    }
  }
  return executions;
}

function createStreamingCombinationTimeline(
  bars: readonly MarketBar[],
  legs: readonly StrategyExecutionLeg[],
  settings: Pick<BacktestSettings, "startTime" | "endTime">,
  tacticalMode: TacticalAllocationMode,
  initialTargetAllocation = 0,
): {
  reader: AllocationTimelineReader;
  relativeLongStrategy: StrategySlot;
} {
  const relativeLongStrategy = resolveCoreStrategyForWindow(
    bars,
    legs,
    settings,
  );
  const coreLeg = legs.find((leg) => leg.slot === relativeLongStrategy)!;
  const tacticalLegs = legs.filter(
    (leg) => leg.slot !== relativeLongStrategy,
  );
  let lastIndex = -1;
  let lastState: AllocationTimelineState = {
    targetAllocation: 0,
    signals: EMPTY_ALLOCATION_SIGNALS,
    intrabarExecutions: EMPTY_INTRABAR_EXECUTIONS,
  };
  const reusableCoreSatelliteStates: [
    AllocationTimelineState,
    AllocationTimelineState,
  ] = [
    {
      targetAllocation: 0,
      signals: EMPTY_ALLOCATION_SIGNALS,
      intrabarExecutions: EMPTY_INTRABAR_EXECUTIONS,
    },
    {
      targetAllocation: 0,
      signals: EMPTY_ALLOCATION_SIGNALS,
      intrabarExecutions: EMPTY_INTRABAR_EXECUTIONS,
    },
  ];
  let previousLayerState: StrategyLayerState | null = null;
  let coreWasActive = false;
  const previousTacticalSignals = new Map<StrategySlot, boolean>();
  const activeTacticalSlots = new Set<StrategySlot>();
  let coreSatelliteTarget = initialTargetAllocation;
  const tacticalWeight = tacticalLegs.reduce(
    (sum, leg) => sum + leg.allocation,
    0,
  );
  const volatilityRiskCaps = buildMultiStrategyVolatilityRiskCaps(bars);

  const advance = (index: number): AllocationTimelineState => {
    if (legs.length >= 3) {
      let activeTacticalWeight = 0;
      for (const leg of tacticalLegs) {
        if ((leg.execution.target?.[index] ?? 0) <= 0) continue;
        activeTacticalWeight += leg.allocation;
      }
      const nextTarget = resolveCoreSatelliteTarget(
        coreSatelliteTarget,
        (coreLeg.execution.target?.[index] ?? 0) > 0,
        tacticalWeight > 0 ? activeTacticalWeight / tacticalWeight : 0,
        volatilityRiskCaps[index] ?? 1,
      );
      const signals = allocationTransitionSignals(
        coreSatelliteTarget,
        nextTarget,
      );
      coreSatelliteTarget = nextTarget;
      // The backtest only retains the previous state. Alternating two mutable
      // records removes one short-lived object allocation per bar and candidate.
      const state = reusableCoreSatelliteStates[index & 1];
      state.targetAllocation = nextTarget;
      state.signals = signals;
      state.intrabarExecutions = EMPTY_INTRABAR_EXECUTIONS;
      return state;
    }

    const intrabarExecutions = streamIntrabarExecutionsAtIndex(
      index,
      previousLayerState,
      legs,
      relativeLongStrategy,
      tacticalMode,
    );
    const signals: AllocationSignalEvent[] = [];
    let targetAllocation = 0;
    let nextLayerState: StrategyLayerState;
    {
      const coreActive = (coreLeg.execution.target?.[index] ?? 0) > 0;
      if (!coreActive) {
        if (coreWasActive) {
          signals.push("long-exit");
          if (activeTacticalSlots.size > 0) signals.push("short-exit");
        }
        activeTacticalSlots.clear();
      } else if (!coreWasActive) {
        signals.push("long-entry");
        activeTacticalSlots.clear();
        if (tacticalMode === "reduce-on-short-exit") {
          tacticalLegs.forEach((leg) => activeTacticalSlots.add(leg.slot));
        }
      } else {
        tacticalLegs.forEach((leg) => {
          const signalActive = (leg.execution.target?.[index] ?? 0) > 0;
          const signalWasActive =
            previousTacticalSignals.get(leg.slot) ?? false;
          const layerActive = activeTacticalSlots.has(leg.slot);
          const shouldExit =
            layerActive &&
            (tacticalMode === "reduce-on-short-exit"
              ? signalWasActive && !signalActive
              : !signalActive);
          if (shouldExit) {
            activeTacticalSlots.delete(leg.slot);
            pushUniqueSignal(signals, "short-exit");
          } else if (!layerActive && !signalWasActive && signalActive) {
            activeTacticalSlots.add(leg.slot);
            pushUniqueSignal(signals, "short-entry");
          }
        });
      }
      targetAllocation = coreActive
        ? coreLeg.allocation +
          tacticalLegs.reduce(
            (sum, leg) =>
              sum + (activeTacticalSlots.has(leg.slot) ? leg.allocation : 0),
            0,
          )
        : 0;
      nextLayerState = {
        gateActive: coreActive,
        activeTacticalSlots: STRATEGY_SLOT_ORDER.filter((slot) =>
          activeTacticalSlots.has(slot),
        ),
      };
      coreWasActive = coreActive;
      tacticalLegs.forEach((leg) => {
        previousTacticalSignals.set(
          leg.slot,
          (leg.execution.target?.[index] ?? 0) > 0,
        );
      });
    }
    previousLayerState = nextLayerState;
    return { targetAllocation, signals, intrabarExecutions };
  };

  return {
    relativeLongStrategy,
    reader: {
      length: bars.length,
      stateAt(index: number) {
        if (index < lastIndex) {
          throw new Error("Streaming timeline indexes must be monotonic");
        }
        while (lastIndex < index) {
          lastIndex += 1;
          lastState = advance(lastIndex);
        }
        return lastState;
      },
    },
  };
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
    executionLegs.length >= 3
      ? buildMultiStrategyVolatilityRiskCaps(bars)
      : undefined,
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
  coreStrategy: StrategySlot | null;
  coreActive: boolean;
  tacticalStrategyCount: number;
  activeTacticalStrategyCount: number;
  tacticalSupport: number;
  volatilityRiskCap: number;
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
  const timeline = buildMultiStrategyPlanTimelineFromTargets(
    liveLegs.map((leg) => ({
      slot: leg.slot,
      target: leg.target ?? [],
      allocation: leg.allocation,
    })),
    roleTargets,
    undefined,
    resolveTacticalAllocationMode(plan.tacticalMode),
    liveLegs.length >= 3 ? buildMultiStrategyVolatilityRiskCaps(bars) : undefined,
  );
  const target = timeline.target;
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
  const usesCoreSatellite = liveLegs.length >= 3;
  const coreStrategy = usesCoreSatellite ? timeline.relativeLongStrategy : null;
  const coreLeg = liveLegs.find((leg) => leg.slot === coreStrategy);
  const tacticalLegs = usesCoreSatellite
    ? liveLegs.filter((leg) => leg.slot !== coreStrategy)
    : [];
  const activeTacticalLegs = tacticalLegs.filter(
    (leg) => (leg.target?.at(-1) ?? 0) > 0,
  );
  const tacticalWeight = tacticalLegs.reduce(
    (sum, leg) => sum + leg.allocation,
    0,
  );
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
    coreStrategy,
    coreActive: (coreLeg?.target?.at(-1) ?? 0) > 0,
    tacticalStrategyCount: tacticalLegs.length,
    activeTacticalStrategyCount: activeTacticalLegs.length,
    tacticalSupport:
      tacticalWeight > 0
        ? activeTacticalLegs.reduce((sum, leg) => sum + leg.allocation, 0) /
          tacticalWeight
        : 0,
    volatilityRiskCap:
      liveLegs.length >= 3
        ? (buildMultiStrategyVolatilityRiskCaps(bars).at(-1) ?? 1)
        : 1,
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
  const index = getCombinationResultIndex(results);
  const resultKey = combinationStrategySetKey(result);
  const existing = index.byKey.get(resultKey);
  if (
    existing &&
    compareScreeningResults(result, existing, objective) >= 0
  ) {
    return;
  }
  if (existing) {
    const existingIndex = results.indexOf(existing);
    if (existingIndex >= 0) results.splice(existingIndex, 1);
    index.byKey.delete(resultKey);
  }
  insertSorted(results, result, (left, right) =>
    compareScreeningResults(left, right, objective),
  );
  index.byKey.set(resultKey, result);

  const resultStrategyCount = combinationStrategyCount(result);
  if (resultStrategyCount >= 3) {
    let primaryCount = 0;
    for (const candidate of results) {
      if (
        combinationStrategyCount(candidate) === resultStrategyCount &&
        candidate.strategyAId === result.strategyAId
      ) {
        primaryCount += 1;
      }
    }
    if (primaryCount > MAX_MULTI_STRATEGY_RESULTS_PER_PRIMARY) {
      removeWorstCombinationResult(
        results,
        index,
        (candidate) =>
          combinationStrategyCount(candidate) === resultStrategyCount &&
          candidate.strategyAId === result.strategyAId,
      );
    }
  }

  let categoryCount = 0;
  for (const candidate of results) {
    if (combinationStrategyCount(candidate) === resultStrategyCount) {
      categoryCount += 1;
    }
  }
  if (categoryCount > MAX_COMBINATION_RESULTS) {
    removeWorstCombinationResult(
      results,
      index,
      (candidate) =>
        combinationStrategyCount(candidate) === resultStrategyCount,
    );
  }
}

function compactCombinationResult(
  result: StrategyCombinationResult,
): StrategyCombinationResult {
  return { ...result, equity: [], rebalances: [] };
}

interface CombinationResultIndex {
  byKey: Map<string, StrategyCombinationResult>;
}

const combinationResultIndexes = new WeakMap<
  StrategyCombinationResult[],
  CombinationResultIndex
>();

function getCombinationResultIndex(
  results: StrategyCombinationResult[],
): CombinationResultIndex {
  let index = combinationResultIndexes.get(results);
  if (index) return index;
  index = {
    byKey: new Map(
      results.map((result) => [combinationStrategySetKey(result), result]),
    ),
  };
  combinationResultIndexes.set(results, index);
  return index;
}

function removeWorstCombinationResult(
  results: StrategyCombinationResult[],
  index: CombinationResultIndex,
  matches: (candidate: StrategyCombinationResult) => boolean,
): void {
  for (let candidateIndex = results.length - 1; candidateIndex >= 0; candidateIndex -= 1) {
    const candidate = results[candidateIndex]!;
    if (!matches(candidate)) continue;
    results.splice(candidateIndex, 1);
    index.byKey.delete(combinationStrategySetKey(candidate));
    return;
  }
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

function combinationStrategyCount(
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
): number {
  return 2 +
    Number(Boolean(result.strategyCId)) +
    Number(Boolean(result.strategyDId)) +
    Number(Boolean(result.strategyEId)) +
    Number(Boolean(result.strategyFId)) +
    Number(Boolean(result.strategyGId)) +
    Number(Boolean(result.strategyHId)) +
    Number(Boolean(result.strategyIId));
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

function insertSorted<T>(
  values: T[],
  value: T,
  compare: (left: T, right: T) => number,
): void {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (compare(value, values[middle]!) < 0) high = middle;
    else low = middle + 1;
  }
  values.splice(low, 0, value);
}

interface DiverseFinalistIndex<T> {
  byKey: Map<string, T>;
  primaryCounts: Map<StrategyId, number>;
}

const diverseFinalistIndexes = new WeakMap<
  object,
  DiverseFinalistIndex<unknown>
>();

function getDiverseFinalistIndex<T>(
  finalists: T[],
  resultOf: (candidate: T) => StrategyCombinationResult,
): DiverseFinalistIndex<T> {
  const cached = diverseFinalistIndexes.get(finalists) as
    | DiverseFinalistIndex<T>
    | undefined;
  if (cached) return cached;
  const index: DiverseFinalistIndex<T> = {
    byKey: new Map(),
    primaryCounts: new Map(),
  };
  for (const finalist of finalists) {
    const result = resultOf(finalist);
    index.byKey.set(combinationStrategySetKey(result), finalist);
    index.primaryCounts.set(
      result.strategyAId,
      (index.primaryCounts.get(result.strategyAId) ?? 0) + 1,
    );
  }
  diverseFinalistIndexes.set(
    finalists,
    index as DiverseFinalistIndex<unknown>,
  );
  return index;
}

function retainPrimaryDiverseFinalist<T>(
  finalists: T[],
  finalist: T,
  resultOf: (candidate: T) => StrategyCombinationResult,
  objective: ScreeningObjective,
  limit: number,
  perPrimaryLimit: number,
): void {
  const index = getDiverseFinalistIndex(finalists, resultOf);
  const result = resultOf(finalist);
  const key = combinationStrategySetKey(result);
  const existing = index.byKey.get(key);
  if (
    existing &&
    compareScreeningResults(result, resultOf(existing), objective) >= 0
  ) {
    return;
  }
  if (existing) {
    const existingIndex = finalists.indexOf(existing);
    if (existingIndex >= 0) finalists.splice(existingIndex, 1);
    const existingPrimary = resultOf(existing).strategyAId;
    index.primaryCounts.set(
      existingPrimary,
      (index.primaryCounts.get(existingPrimary) ?? 1) - 1,
    );
  }

  insertSorted(finalists, finalist, (left, right) =>
    compareScreeningResults(resultOf(left), resultOf(right), objective),
  );
  index.byKey.set(key, finalist);
  const primary = result.strategyAId;
  const primaryCount = (index.primaryCounts.get(primary) ?? 0) + 1;
  index.primaryCounts.set(primary, primaryCount);

  if (primaryCount > perPrimaryLimit) {
    for (let candidateIndex = finalists.length - 1; candidateIndex >= 0; candidateIndex -= 1) {
      const candidate = finalists[candidateIndex]!;
      if (resultOf(candidate).strategyAId !== primary) continue;
      finalists.splice(candidateIndex, 1);
      index.byKey.delete(combinationStrategySetKey(resultOf(candidate)));
      index.primaryCounts.set(primary, primaryCount - 1);
      break;
    }
  }

  if (finalists.length > limit) {
    const removed = finalists.pop()!;
    const removedResult = resultOf(removed);
    const removedPrimary = removedResult.strategyAId;
    index.byKey.delete(combinationStrategySetKey(removedResult));
    index.primaryCounts.set(
      removedPrimary,
      (index.primaryCounts.get(removedPrimary) ?? 1) - 1,
    );
  }
}

const pairFinalistIndexes = new WeakMap<
  StrategyPairFinalist[],
  Map<string, StrategyPairFinalist>
>();

function retainPairFinalist(
  finalists: StrategyPairFinalist[],
  finalist: StrategyPairFinalist,
  objective: ScreeningObjective,
  limit: number,
) {
  let index = pairFinalistIndexes.get(finalists);
  if (!index) {
    index = new Map(
      finalists.map((existing) => [
        `${existing.strategyA.result.strategyId}:${existing.strategyB.result.strategyId}`,
        existing,
      ]),
    );
    pairFinalistIndexes.set(finalists, index);
  }
  const key = `${finalist.strategyA.result.strategyId}:${finalist.strategyB.result.strategyId}`;
  const existing = index.get(key);
  if (
    existing &&
    compareScreeningResults(
      finalist.referenceResult,
      existing.referenceResult,
      objective,
    ) >= 0
  ) {
    return;
  }
  if (existing) {
    const existingIndex = finalists.indexOf(existing);
    if (existingIndex >= 0) finalists.splice(existingIndex, 1);
  }
  insertSorted(finalists, finalist, (left, right) =>
    compareScreeningResults(
      left.referenceResult,
      right.referenceResult,
      objective,
    )
  );
  index.set(key, finalist);
  if (finalists.length > limit) {
    const removed = finalists.pop()!;
    index.delete(
      `${removed.strategyA.result.strategyId}:${removed.strategyB.result.strategyId}`,
    );
  }
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
  retainPrimaryDiverseFinalist(
    finalists,
    finalist,
    (candidate) => candidate.referenceResult,
    objective,
    limit,
    MAX_MULTI_STRATEGY_FINALISTS_PER_PRIMARY,
  );
}

function retainStrategyGroupFinalist(
  finalists: StrategyGroupFinalist[],
  finalist: StrategyGroupFinalist,
  objective: ScreeningObjective,
  limit: number,
) {
  retainPrimaryDiverseFinalist(
    finalists,
    finalist,
    (candidate) => candidate.referenceResult,
    objective,
    limit,
    MAX_MULTI_STRATEGY_FINALISTS_PER_PRIMARY,
  );
}

export function entryFilterKey(
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
  const tacticalMode = resolveTacticalAllocationMode(allocation.tacticalMode);
  if (settings.summaryOnly) {
    const legs: StrategyExecutionLeg[] = [
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
    ];
    const stream = createStreamingCombinationTimeline(
      bars,
      legs,
      settings,
      tacticalMode,
    );
    return {
      ...runAllocationBacktest(bars, stream.reader, settings),
      strategyAId: strategyAFinalist.result.strategyId,
      strategyAParameters: strategyAFinalist.result.parameters,
      strategyBId: strategyBFinalist.result.strategyId,
      strategyBParameters: strategyBFinalist.result.parameters,
      strategyAAllocation: allocation.strategyAAllocation,
      strategyBAllocation: allocation.strategyBAllocation,
      tacticalMode,
      relativeLongStrategy: stream.relativeLongStrategy,
      strategyAEntryFilter: cloneMovingAverageSlopeFilter(
        strategyAFinalist.result.entryFilter,
      ),
      strategyBEntryFilter: cloneMovingAverageSlopeFilter(
        strategyBFinalist.result.entryFilter,
      ),
    };
  }
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
      tacticalMode,
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
    tacticalMode,
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
  const tacticalMode = resolveTacticalAllocationMode(
    allocation.tacticalMode,
  );
  if (settings.summaryOnly) {
    const legs: StrategyExecutionLeg[] = [
      { slot: "strategyA", allocation: allocation.strategyAAllocation, execution: strategyAFinalist },
      { slot: "strategyB", allocation: allocation.strategyBAllocation, execution: strategyBFinalist },
      { slot: "strategyC", allocation: allocation.strategyCAllocation, execution: strategyCFinalist },
    ];
    const stream = createStreamingCombinationTimeline(
      bars,
      legs,
      settings,
      tacticalMode,
    );
    return {
      ...runAllocationBacktest(bars, stream.reader, settings),
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
      relativeLongStrategy: stream.relativeLongStrategy,
      strategyAEntryFilter: cloneMovingAverageSlopeFilter(strategyAFinalist.result.entryFilter),
      strategyBEntryFilter: cloneMovingAverageSlopeFilter(strategyBFinalist.result.entryFilter),
      strategyCEntryFilter: cloneMovingAverageSlopeFilter(strategyCFinalist.result.entryFilter),
    };
  }
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
    buildMultiStrategyVolatilityRiskCaps(bars),
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

function screeningExecutionWindow(
  bars: readonly MarketBar[],
  settings: Pick<BacktestSettings, "startTime" | "endTime">,
): { start: number; endExclusive: number } {
  const startTime = settings.startTime;
  const selectedStart = startTime
    ? bars.findIndex((bar) => bar.time >= startTime)
    : 0;
  const normalizedSelectedStart = selectedStart < 0 ? 0 : selectedStart;
  let endExclusive = bars.length;
  if (settings.endTime) {
    const firstAfterEnd = bars.findIndex((bar) => bar.time > settings.endTime!);
    if (firstAfterEnd >= 0) endExclusive = firstAfterEnd;
  }
  return {
    start: Math.max(normalizedSelectedStart - 1, 0),
    endExclusive,
  };
}

function buildHigherOrderStrategyFields(
  finalists: readonly StrategyFinalist[],
  allocation: HigherOrderStrategyAllocation,
  cloneEntryFilters: boolean,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (let index = 0; index < finalists.length; index += 1) {
    const finalist = finalists[index]!;
    const slot = STRATEGY_SLOTS[index];
    fields[`${slot}Id`] = finalist.result.strategyId;
    fields[`${slot}Parameters`] = finalist.result.parameters;
    fields[`${slot}Allocation`] = allocationForSlot(allocation, slot);
    fields[`${slot}EntryFilter`] = cloneEntryFilters
      ? cloneMovingAverageSlopeFilter(finalist.result.entryFilter)
      : finalist.result.entryFilter;
  }
  return fields;
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
  const fullLegs = finalists.map((finalist, index) => {
    const slot = STRATEGY_SLOTS[index];
    return {
      slot,
      allocation: allocationForSlot(allocation, slot),
      execution: finalist,
    };
  });
  if (settings.summaryOnly) {
    const stream = createStreamingCombinationTimeline(
      bars,
      fullLegs,
      settings,
      tacticalMode,
    );
    const strategyFields = buildHigherOrderStrategyFields(
      finalists,
      allocation,
      false,
    );
    return {
      ...runAllocationBacktest(bars, stream.reader, settings),
      ...strategyFields,
      tacticalMode,
      relativeLongStrategy: stream.relativeLongStrategy,
    } as StrategyCombinationResult;
  }
  const executionWindow = screeningExecutionWindow(bars, settings);
  const relativeLongStrategy = resolveCoreStrategyForWindow(
    bars,
    fullLegs,
    settings,
  );
  const executionBars = bars.slice(
    executionWindow.start,
    executionWindow.endExclusive,
  );
  const fullTimeline = buildMultiStrategyPlanTimelineFromTargets(
    fullLegs.map((leg) => ({
      slot: leg.slot,
      target: leg.execution.target,
      allocation: leg.allocation,
    })),
    undefined,
    relativeLongStrategy,
    tacticalMode,
    buildMultiStrategyVolatilityRiskCaps(bars),
  );
  if (!fullTimeline.relativeLongStrategy) {
    throw new Error("A strategy group requires a core strategy");
  }
  const target = fullTimeline.target.slice(
    executionWindow.start,
    executionWindow.endExclusive,
  );
  const signalEvents = fullTimeline.signalEvents.slice(
    executionWindow.start,
    executionWindow.endExclusive,
  );
  const performance = runAllocationBacktest(
    executionBars,
    target,
    settings,
    signalEvents,
    Array.from({ length: target.length }, () => []),
  );
  const strategyFields = buildHigherOrderStrategyFields(
    finalists,
    allocation,
    true,
  );
  return {
    ...performance,
    ...strategyFields,
    tacticalMode,
    relativeLongStrategy: fullTimeline.relativeLongStrategy,
  } as StrategyCombinationResult;
}

export async function optimizeStrategyCombinations(
  bars: MarketBar[],
  settings: Omit<BacktestSettings, "interval"> & {
    interval: MarketInterval;
  },
  options: OptimizeStrategyCombinationsOptions = {},
): Promise<CombinationOptimizationResult> {
  settings = { ...settings, summaryOnly: true };
  settings = {
    ...settings,
    executionContext: createBacktestExecutionContext(bars, settings),
  };
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
      : options.entryFilterAllowedByKey?.get(entryFilterKey(baseEntryFilter)) ??
          settings.entryFilterAllowed,
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
  const requestedMaxCombinationStrategies = options.maxCombinationStrategies ?? 6;
  const maxCombinationStrategies = Number.isFinite(requestedMaxCombinationStrategies)
    ? Math.min(6, Math.max(2, Math.floor(requestedMaxCombinationStrategies)))
    : 6;
  const includeTriples = (options.includeTriples ?? true) && maxCombinationStrategies >= 3;
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
  ]);
  const higherOrderFinalistLimits = new Map<HigherOrderStrategyCount, number>([
    [4, quadrupleFinalistLimit],
    [5, quintupleFinalistLimit],
    [6, MAX_QUINTUPLE_REFERENCE_FINALISTS],
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
  const checkpointEvery = Number.isFinite(options.checkpointEvery)
    ? Math.max(Math.floor(options.checkpointEvery!), 1)
    : Number.POSITIVE_INFINITY;
  const resumeCheckpoint =
    options.resumeCheckpoint?.version === 1 &&
    OPTIMIZATION_STAGE_ORDER.includes(options.resumeCheckpoint.progress.stage)
      ? options.resumeCheckpoint
      : null;
  const finalistsByStrategy = new Map<StrategyId, StrategyFinalist[]>(
    resumeCheckpoint?.finalistsByStrategy ?? [],
  );
  const entryFilterCandidatesByStrategy = new Map<
    StrategyId,
    EntryFilterCandidate[]
  >(resumeCheckpoint?.entryFilterCandidatesByStrategy ?? []);
  let entryFilterCandidateCount =
    resumeCheckpoint?.entryFilterCandidateCount ?? 0;
  const pairFinalists: StrategyPairFinalist[] =
    resumeCheckpoint?.pairFinalists.map((finalist) => ({
      ...finalist,
      settings: { ...finalist.settings, executionContext: settings.executionContext },
    })) ?? [];
  const tripleFinalists: StrategyTripleFinalist[] =
    resumeCheckpoint?.tripleFinalists.map((finalist) => ({
      ...finalist,
      settings: { ...finalist.settings, executionContext: settings.executionContext },
    })) ?? [];
  const higherOrderFinalists = new Map<
    HigherOrderStrategyCount,
    StrategyGroupFinalist[]
  >(
    resumeCheckpoint?.higherOrderFinalists.map(([count, finalists]) => [
      count,
      finalists.map((finalist) => ({
        ...finalist,
        settings: {
          ...finalist.settings,
          executionContext: settings.executionContext,
        },
      })),
    ]) ?? [],
  );
  const results: StrategyCombinationResult[] =
    resumeCheckpoint?.results ?? [];
  const pendingCombinationResults = new Map<
    string,
    StrategyCombinationResult
  >();
  const retainPendingCombinationResult = (
    result: StrategyCombinationResult,
  ) => {
    const key = combinationStrategySetKey(result);
    const pending = pendingCombinationResults.get(key);
    const retained = getCombinationResultIndex(results).byKey.get(key);
    const current = pending ?? retained;
    if (
      current &&
      compareScreeningResults(result, current, objective) >= 0
    ) {
      return;
    }
    pendingCombinationResults.set(key, result);
  };
  const flushPendingCombinationResults = () => {
    for (const result of pendingCombinationResults.values()) {
      retainCombinationResult(results, result, objective);
    }
    pendingCombinationResults.clear();
  };
  let evaluatedCount = 0;
  let failedCount = 0;
  const strategyCandidateCount = candidates.length;
  let totalCandidates = candidates.length;

  const resumeStageIndex = resumeCheckpoint
    ? OPTIMIZATION_STAGE_ORDER.indexOf(resumeCheckpoint.progress.stage)
    : -1;
  const shouldSkipCheckpointedEvaluation = (
    stage: CombinationScreeningStage,
    ordinal: number,
  ): boolean => {
    if (!resumeCheckpoint) return false;
    const stageIndex = OPTIMIZATION_STAGE_ORDER.indexOf(stage);
    return (
      stageIndex < resumeStageIndex ||
      (stageIndex === resumeStageIndex &&
        ordinal <= resumeCheckpoint.progress.stageCompleted)
    );
  };
  const originalOnProgress = options.onProgress;
  const reportProgress = (progress: CombinationScreeningProgress) => {
    const progressStageIndex = OPTIMIZATION_STAGE_ORDER.indexOf(progress.stage);
    const isReplayedCheckpoint = Boolean(
      resumeCheckpoint &&
        (progressStageIndex < resumeStageIndex ||
          (progressStageIndex === resumeStageIndex &&
            progress.stageCompleted <=
              resumeCheckpoint.progress.stageCompleted)),
    );
    if (isReplayedCheckpoint) return;
    originalOnProgress?.(progress);
    const isStageBoundary =
      progress.stageTotal > 0 &&
      progress.stageCompleted === progress.stageTotal;
    const isCheckpointBoundary =
      progress.stageCompleted > 0 &&
      progress.stageCompleted % checkpointEvery === 0;
    if (!isStageBoundary && !isCheckpointBoundary) return;
    flushPendingCombinationResults();
    const entryFilterStageIndex = OPTIMIZATION_STAGE_ORDER.indexOf("entryFilters");
    const allocationStageIndex = OPTIMIZATION_STAGE_ORDER.indexOf("allocations");
    const entryFiltersComplete =
      progressStageIndex > entryFilterStageIndex ||
      (progress.stage === "entryFilters" && isStageBoundary);
    const canDiscardOrderFills =
      progressStageIndex > allocationStageIndex ||
      (progress.stage === "allocations" && isStageBoundary);
    const compactedFinalists = new Map<StrategyFinalist, StrategyFinalist>();
    const checkpointFinalist = (finalist: StrategyFinalist) => {
      if (!canDiscardOrderFills) return finalist;
      const cached = compactedFinalists.get(finalist);
      if (cached) return cached;
      const compacted = { ...finalist, orderFills: new Map() };
      compactedFinalists.set(finalist, compacted);
      return compacted;
    };
    options.onCheckpoint?.({
      version: 1,
      progress,
      entryFilterCandidateCount,
      finalistsByStrategy: [...finalistsByStrategy].map(
        ([strategyId, finalists]) => [
          strategyId,
          finalists.map(checkpointFinalist),
        ],
      ),
      entryFilterCandidatesByStrategy: entryFiltersComplete
        ? []
        : [...entryFilterCandidatesByStrategy],
      pairFinalists: pairFinalists.map((finalist) => ({
        ...finalist,
        strategyA: checkpointFinalist(finalist.strategyA),
        strategyB: checkpointFinalist(finalist.strategyB),
        settings: { ...finalist.settings, executionContext: undefined },
      })),
      tripleFinalists: tripleFinalists.map((finalist) => ({
        ...finalist,
        strategyA: checkpointFinalist(finalist.strategyA),
        strategyB: checkpointFinalist(finalist.strategyB),
        strategyC: checkpointFinalist(finalist.strategyC),
        settings: { ...finalist.settings, executionContext: undefined },
      })),
      higherOrderFinalists: [...higherOrderFinalists].map(
        ([count, finalists]) => [
          count,
          finalists.map((finalist) => ({
            ...finalist,
            strategies: finalist.strategies.map(checkpointFinalist),
            settings: { ...finalist.settings, executionContext: undefined },
          })),
        ],
      ),
      results,
    });
  };

  reportProgress({
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
    if (shouldSkipCheckpointedEvaluation("strategies", evaluatedCount + 1)) {
      evaluatedCount += 1;
      continue;
    }
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
          target: compactTarget(target),
          orderFills: compactOrderFills(execution.orderFills),
          screeningHorizon: summarizeStrategySignalHorizonForWindow(
            bars,
            target,
            settings,
          ),
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
  reportProgress({
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

  if (entryFilterCandidateCount === 0) {
    entryFilterCandidateCount =
      requestedEntryFilters.length *
      [...entryFilterCandidatesByStrategy.values()].reduce(
        (sum, candidatesForStrategy) =>
          sum + candidatesForStrategy.length,
        0,
      );
  }
  const entryFilterStageIndex = OPTIMIZATION_STAGE_ORDER.indexOf("entryFilters");
  const entryFilterStageAlreadyComplete = Boolean(
    resumeCheckpoint &&
      (resumeStageIndex > entryFilterStageIndex ||
        (resumeStageIndex === entryFilterStageIndex &&
          resumeCheckpoint.progress.stageCompleted ===
            resumeCheckpoint.progress.stageTotal)),
  );
  if (
    !options.signal?.aborted &&
    requestedEntryFilters.length > 0 &&
    !entryFilterStageAlreadyComplete
  ) {
    totalCandidates += entryFilterCandidateCount;
  reportProgress({
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
      const cachedEntryAllowed = options.entryFilterAllowedByKey?.get(
        entryFilterKey(entryFilter),
      );
      const entryAllowed = cachedEntryAllowed
        ? [...cachedEntryAllowed]
        : buildMovingAverageEntryAllowedSeries(bars, entryFilter);
      const filterSettings: StrategyCombinationBacktestSettings = {
        ...settings,
        entryFilter,
        entryFilterAllowed: entryAllowed ?? undefined,
      };
      for (const [strategyId, candidatesForStrategy] of
        entryFilterCandidatesByStrategy) {
        for (const candidate of candidatesForStrategy) {
          if (options.signal?.aborted) break entryFilterLoop;
          if (
            shouldSkipCheckpointedEvaluation(
              "entryFilters",
              evaluatedEntryFilterCount + 1,
            )
          ) {
            evaluatedCount += 1;
            evaluatedEntryFilterCount += 1;
            continue;
          }
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
                target: compactTarget(target),
                orderFills: compactOrderFills(execution.orderFills),
                screeningHorizon: summarizeStrategySignalHorizonForWindow(
                  bars,
                  target,
                  settings,
                ),
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
  reportProgress({
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
  if (entryFilterStageAlreadyComplete) {
    evaluatedCount += entryFilterCandidateCount;
  }
  entryFilterCandidatesByStrategy.clear();

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
    totalCandidates += entryFilterCandidateCount;

  reportProgress({
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
        if (
          shouldSkipCheckpointedEvaluation("pairs", evaluatedPairCount + 1)
        ) {
          evaluatedCount += 1;
          evaluatedPairCount += 1;
          continue;
        }
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
  reportProgress({
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
  reportProgress({
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
        retainPendingCombinationResult(finalist.referenceResult);
        for (const allocation of remainingAllocations) {
          if (options.signal?.aborted) break allocationLoop;
          if (
            shouldSkipCheckpointedEvaluation(
              "allocations",
              evaluatedAllocationCount + 1,
            )
          ) {
            evaluatedCount += 1;
            evaluatedAllocationCount += 1;
            continue;
          }
          try {
            retainPendingCombinationResult(
              runCombinationCandidate(
                bars,
                finalist.strategyA,
                finalist.strategyB,
                allocation,
                finalist.settings,
              ),
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
  reportProgress({
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

    if (!options.signal?.aborted && includeTriples) {
      for (const finalists of finalistsByStrategy.values()) {
        for (const finalist of finalists) {
          finalist.orderFills = new Map();
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
  reportProgress({
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
          if (
            shouldSkipCheckpointedEvaluation(
              "triples",
              evaluatedTripleCount + 1,
            )
          ) {
            evaluatedCount += 1;
            evaluatedTripleCount += 1;
            continue;
          }
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
  reportProgress({
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
  reportProgress({
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
          retainPendingCombinationResult(finalist.referenceResult);
          for (const allocation of remainingTripleAllocations) {
            if (options.signal?.aborted) break tripleAllocationLoop;
            if (
              shouldSkipCheckpointedEvaluation(
                "tripleAllocations",
                evaluatedTripleAllocationCount + 1,
              )
            ) {
              evaluatedCount += 1;
              evaluatedTripleAllocationCount += 1;
              continue;
            }
            try {
              retainPendingCombinationResult(
                runTripleCombinationCandidate(
                  bars,
                  finalist.strategyA,
                  finalist.strategyB,
                  finalist.strategyC,
                  allocation,
                  finalist.settings,
                ),
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
  reportProgress({
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
        Extract<HigherOrderStrategyCount, 4 | 5 | 6>,
        {
          discovery: CombinationScreeningStage;
          allocations: CombinationScreeningStage;
        }
      > = {
        4: { discovery: "quadruples", allocations: "quadrupleAllocations" },
        5: { discovery: "quintuples", allocations: "quintupleAllocations" },
        6: { discovery: "sextuples", allocations: "sextupleAllocations" },
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
      > => ({
        strategyAId: strategies[0]?.result.strategyId ?? null,
        strategyBId: strategies[1]?.result.strategyId ?? null,
        strategyCId: strategies[2]?.result.strategyId ?? null,
        strategyDId: strategies[3]?.result.strategyId ?? null,
        strategyEId: strategies[4]?.result.strategyId ?? null,
        strategyFId: strategies[5]?.result.strategyId ?? null,
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

      higherOrderLoop: for (const strategyCount of [4, 5, 6] as const) {
        if (strategyCount > maxCombinationStrategies) break;
        if (options.signal?.aborted) break;
        const referenceAllocation =
          higherOrderReferenceAllocations.get(strategyCount);
        if (!referenceAllocation || parentGroups.length === 0) break;
        const stages = higherOrderStageNames[strategyCount];
        const parents = parentGroups.slice(
          0,
          higherOrderParentLimits.get(strategyCount),
        );
        const finalists = higherOrderFinalists.get(strategyCount) ?? [];
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
  reportProgress({
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
            if (
              shouldSkipCheckpointedEvaluation(
                stages.discovery,
                evaluatedDiscoveryCount + 1,
              )
            ) {
              evaluatedCount += 1;
              evaluatedDiscoveryCount += 1;
              continue;
            }
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
  reportProgress({
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
  reportProgress({
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
          retainPendingCombinationResult(finalist.referenceResult);
          for (const allocation of remainingAllocations) {
            if (options.signal?.aborted) break higherOrderLoop;
            if (
              shouldSkipCheckpointedEvaluation(
                stages.allocations,
                evaluatedAllocationCount + 1,
              )
            ) {
              evaluatedCount += 1;
              evaluatedAllocationCount += 1;
              continue;
            }
            try {
              retainPendingCombinationResult(
                runHigherOrderCombinationCandidate(
                  bars,
                  finalist.strategies,
                  allocation,
                  finalist.settings,
                ),
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
  reportProgress({
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

  flushPendingCombinationResults();
  const detailedSettings = { ...settings, summaryOnly: false };
  const materializedSingles = options.signal?.aborted
    ? singleFinalists.map((finalist) => compactBacktestResult(finalist.result))
    : singleFinalists.map((finalist) =>
        compactBacktestResult(
          runBacktest(
            bars,
            finalist.result.strategyId,
            finalist.result.parameters,
            {
              ...detailedSettings,
              entryFilter: finalist.result.entryFilter ?? null,
              entryFilterAllowed: undefined,
            },
          ),
        ),
      );
  const materializedResults = options.signal?.aborted
    ? results.map(compactCombinationResult)
    : results.map((result) =>
        compactCombinationResult(
          runStrategyCombinationBacktest(
            bars,
            result,
            {
              ...detailedSettings,
              entryFilter: null,
              entryFilterAllowed: undefined,
            },
            result.relativeLongStrategy,
          ),
        ),
      );

  return {
    singleResults: materializedSingles
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
    results: materializedResults,
    evaluatedCount,
    totalCandidates,
    failedCount,
    cancelled: Boolean(options.signal?.aborted),
  };
}
