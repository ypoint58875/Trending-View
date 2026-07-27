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
export const COMBINATION_FINALISTS_PER_STRATEGY = 1;
export const ROLLING_SINGLE_FINALISTS_PER_STRATEGY = 10;
export const SCREENING_ENTRY_FILTER_FINALISTS_PER_STRATEGY = 60;
export const MAX_COMBINATION_PAIR_FINALISTS = 4_096;
export const MAX_COMBINATION_RESULTS = 32;

export interface TwoStrategyAllocation {
  strategyAAllocation: number;
  strategyBAllocation: number;
}

export const TWO_STRATEGY_ALLOCATION_CANDIDATES: readonly TwoStrategyAllocation[] =
  [
    {
      strategyAAllocation: DEFAULT_STRATEGY_A_ALLOCATION,
      strategyBAllocation: DEFAULT_STRATEGY_B_ALLOCATION,
    },
    {
      strategyAAllocation: DEFAULT_STRATEGY_B_ALLOCATION,
      strategyBAllocation: DEFAULT_STRATEGY_A_ALLOCATION,
    },
    {
      strategyAAllocation: 0.5,
      strategyBAllocation: 0.5,
    },
    {
      strategyAAllocation: 0.7,
      strategyBAllocation: 0.3,
    },
    {
      strategyAAllocation: 0.3,
      strategyBAllocation: 0.7,
    },
  ];

export interface StrategySelection {
  strategyId: StrategyId;
  parameters: StrategyParameters;
}

export interface StrategyAllocationPlan {
  strategyA: StrategySelection | null;
  strategyB: StrategySelection | null;
  strategyAAllocation: number;
  strategyBAllocation: number;
  strategyAEntryFilter?: MovingAverageSlopeFilter | null;
  strategyBEntryFilter?: MovingAverageSlopeFilter | null;
  /** Legacy shared filter, read only for backward compatibility. */
  entryFilter?: MovingAverageSlopeFilter | null;
}

export interface StrategyCombination {
  strategyAId: StrategyId;
  strategyAParameters: StrategyParameters;
  strategyBId: StrategyId;
  strategyBParameters: StrategyParameters;
  strategyAAllocation: number;
  strategyBAllocation: number;
  strategyAEntryFilter?: MovingAverageSlopeFilter | null;
  strategyBEntryFilter?: MovingAverageSlopeFilter | null;
  /** Legacy shared filter, read only for backward compatibility. */
  entryFilter?: MovingAverageSlopeFilter | null;
}

export interface StrategyCombinationResult extends AllocationBacktestResult {
  strategyAId: StrategyId;
  strategyAParameters: StrategyParameters;
  strategyBId: StrategyId;
  strategyBParameters: StrategyParameters;
  strategyAAllocation: number;
  strategyBAllocation: number;
  relativeLongStrategy: StrategySlot;
  strategyAEntryFilter?: MovingAverageSlopeFilter | null;
  strategyBEntryFilter?: MovingAverageSlopeFilter | null;
  /** Legacy shared-filter compatibility; new results leave this unset. */
  entryFilter?: MovingAverageSlopeFilter | null;
}

export type StrategySlot = "strategyA" | "strategyB";

export type CombinationScreeningStage =
  | "strategies"
  | "entryFilters"
  | "pairs"
  | "allocations";

export interface CombinationScreeningProgress {
  completed: number;
  total: number;
  stageCompleted: number;
  stageTotal: number;
  failed: number;
  stage: CombinationScreeningStage;
  strategyAId: StrategyId | null;
  strategyBId: StrategyId | null;
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
  objective?: ScreeningObjective;
  entryFilters?: readonly MovingAverageSlopeFilter[];
  allocationCandidates?: readonly TwoStrategyAllocation[];
  retainedSinglesPerStrategy?: number;
  maxPairFinalists?: number;
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
  rawTarget: number[];
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
  strategyAAllocation: number,
  strategyBAllocation: number,
) {
  if (
    !Number.isFinite(strategyAAllocation) ||
    !Number.isFinite(strategyBAllocation) ||
    strategyAAllocation < 0 ||
    strategyBAllocation < 0 ||
    strategyAAllocation > 1 ||
    strategyBAllocation > 1 ||
    strategyAAllocation + strategyBAllocation > 1 + 1e-10
  ) {
    throw new Error(
      "Strategy allocations must be between zero and one and their sum cannot exceed one",
    );
  }
}

function assertAlignedTargets(
  strategyATarget: readonly number[] | null,
  strategyBTarget: readonly number[] | null,
) {
  if (!strategyATarget && !strategyBTarget) {
    throw new Error("At least one strategy target is required");
  }
  if (
    strategyATarget &&
    strategyBTarget &&
    strategyATarget.length !== strategyBTarget.length
  ) {
    throw new Error("Strategy targets must align");
  }
}

export function buildStrategyPlanAllocationTarget(
  strategyATarget: readonly number[] | null,
  strategyBTarget: readonly number[] | null,
  strategyAAllocation: number,
  strategyBAllocation: number,
): number[] {
  return buildStrategyPlanTimelineFromTargets(
    strategyATarget,
    strategyBTarget,
    strategyAAllocation,
    strategyBAllocation,
  ).target;
}

function buildSingleStrategyTimeline(
  sourceTarget: readonly number[],
): StrategyPlanTimeline {
  let wasActive = false;
  const target: number[] = [];
  const signalEvents: AllocationSignalEvent[][] = [];

  sourceTarget.forEach((state) => {
    const active = state > 0;
    const events: AllocationSignalEvent[] = [];
    if (!wasActive && active) events.push("long-entry");
    if (wasActive && !active) events.push("long-exit");
    target.push(active ? 1 : 0);
    signalEvents.push(events);
    wasActive = active;
  });

  return { target, signalEvents, relativeLongStrategy: null };
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
  const strategyA = summarizeStrategySignalHorizon(strategyATarget);
  const strategyB = summarizeStrategySignalHorizon(strategyBTarget);
  const averageDifference =
    strategyA.averageActiveBars - strategyB.averageActiveBars;
  if (Math.abs(averageDifference) > 1e-10) {
    return averageDifference > 0 ? "strategyA" : "strategyB";
  }
  if (strategyA.transitionCount !== strategyB.transitionCount) {
    return strategyA.transitionCount < strategyB.transitionCount
      ? "strategyA"
      : "strategyB";
  }
  return "strategyA";
}

function buildHierarchicalStrategyTimeline(
  longTarget: readonly number[],
  shortTarget: readonly number[],
  longAllocation: number,
  shortAllocation: number,
  relativeLongStrategy: StrategySlot,
): StrategyPlanTimeline {
  let longWasActive = false;
  let shortSignalWasActive = false;
  let shortLayerActive = false;
  const target: number[] = [];
  const signalEvents: AllocationSignalEvent[][] = [];

  longTarget.forEach((longState, index) => {
    const longActive = longState > 0;
    const shortSignalActive = shortTarget[index] > 0;
    const events: AllocationSignalEvent[] = [];

    if (!longActive) {
      if (longWasActive) {
        events.push("long-exit");
        if (shortLayerActive) events.push("short-exit");
      }
      shortLayerActive = false;
      target.push(0);
    } else if (!longWasActive) {
      events.push("long-entry");
      shortLayerActive = false;
      target.push(longAllocation);
    } else {
      if (shortLayerActive && !shortSignalActive) {
        shortLayerActive = false;
        events.push("short-exit");
      } else if (
        !shortLayerActive &&
        !shortSignalWasActive &&
        shortSignalActive
      ) {
        shortLayerActive = true;
        events.push("short-entry");
      }
      target.push(
        longAllocation + (shortLayerActive ? shortAllocation : 0),
      );
    }

    signalEvents.push(events);
    longWasActive = longActive;
    shortSignalWasActive = shortSignalActive;
  });

  return { target, signalEvents, relativeLongStrategy };
}

export interface StrategyPlanTimeline {
  target: number[];
  signalEvents: AllocationSignalEvent[][];
  relativeLongStrategy: StrategySlot | null;
  intrabarExecutions?: AllocationIntrabarExecution[][];
}

interface StrategyRoleTargets {
  strategyA: readonly number[];
  strategyB: readonly number[];
}

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
): StrategyPlanTimeline {
  assertAlignedTargets(strategyATarget, strategyBTarget);
  assertAllocationPlanBounds(strategyAAllocation, strategyBAllocation);

  if (strategyATarget && strategyBTarget) {
    const relativeLongStrategy =
      fixedRelativeLongStrategy ??
      resolveRelativeLongStrategy(
        roleTargets?.strategyA ?? strategyATarget,
        roleTargets?.strategyB ?? strategyBTarget,
      );
    return relativeLongStrategy === "strategyA"
      ? buildHierarchicalStrategyTimeline(
          strategyATarget,
          strategyBTarget,
          strategyAAllocation,
          strategyBAllocation,
          relativeLongStrategy,
        )
      : buildHierarchicalStrategyTimeline(
          strategyBTarget,
          strategyATarget,
          strategyBAllocation,
          strategyAAllocation,
          relativeLongStrategy,
        );
  }

  return strategyATarget
    ? buildSingleStrategyTimeline(strategyATarget)
    : buildSingleStrategyTimeline(strategyBTarget ?? []);
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
  if (!selection || !fallbackTarget) {
    return {
      target: null,
      orderFills: Array.from({ length: bars.length }, () => []),
    };
  }
  const strategy = getStrategy(selection.strategyId);
  const orders =
    cachedOrders ?? strategy.buildOrders?.(bars, selection.parameters);
  if (!orders) {
    return {
      target: applyMovingAverageSlopeEntryFilter(
        fallbackTarget,
        entryAllowed,
      ),
      orderFills: Array.from({ length: bars.length }, () => []),
    };
  }
  if (orders.length !== bars.length || fallbackTarget.length !== bars.length) {
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
  const slotFilter =
    slot === "strategyA"
      ? plan.strategyAEntryFilter
      : plan.strategyBEntryFilter;
  return cloneMovingAverageSlopeFilter(slotFilter ?? plan.entryFilter);
}

function buildPlanIntrabarExecutions(
  timeline: StrategyPlanTimeline,
  strategyAAllocation: number,
  strategyBAllocation: number,
  strategyAFills: readonly (readonly StrategyOrderFill[])[],
  strategyBFills: readonly (readonly StrategyOrderFill[])[],
  hasStrategyA: boolean,
  hasStrategyB: boolean,
): AllocationIntrabarExecution[][] {
  if (!hasStrategyA || !hasStrategyB) {
    const selectedFills = hasStrategyA ? strategyAFills : strategyBFills;
    return selectedFills.map((fills) =>
      fills.map((fill) => ({
        targetAllocation: fill.action === "buy" ? 1 : 0,
        fillPrice: fill.fillPrice,
        signals: [fill.action === "buy" ? "long-entry" : "long-exit"],
      })),
    );
  }

  const longFills =
    timeline.relativeLongStrategy === "strategyB"
      ? strategyBFills
      : strategyAFills;
  const shortFills =
    timeline.relativeLongStrategy === "strategyB"
      ? strategyAFills
      : strategyBFills;
  const longAllocation =
    timeline.relativeLongStrategy === "strategyB"
      ? strategyBAllocation
      : strategyAAllocation;
  const shortAllocation =
    timeline.relativeLongStrategy === "strategyB"
      ? strategyAAllocation
      : strategyBAllocation;

  return timeline.target.map((_, index) => {
    const currentLongFills = longFills[index] ?? [];
    const currentShortFills = shortFills[index] ?? [];

    let currentAllocation = index > 0 ? timeline.target[index - 1] : 0;
    const executions: AllocationIntrabarExecution[] = [];
    const applyFills = (
      fills: readonly StrategyOrderFill[],
      role: "long" | "short",
    ) => {
      fills.forEach((fill) => {
        let targetAllocation = currentAllocation;
        let signals: AllocationSignalEvent[] = [];
        if (role === "long" && fill.action === "buy" && currentAllocation === 0) {
          targetAllocation = longAllocation;
          signals = ["long-entry"];
        } else if (
          role === "long" &&
          fill.action === "sell" &&
          currentAllocation > 0
        ) {
          targetAllocation = 0;
          signals =
            currentAllocation > longAllocation + 1e-10
              ? ["long-exit", "short-exit"]
              : ["long-exit"];
        } else if (
          role === "short" &&
          fill.action === "buy" &&
          Math.abs(currentAllocation - longAllocation) < 1e-10
        ) {
          targetAllocation = longAllocation + shortAllocation;
          signals = ["short-entry"];
        } else if (
          role === "short" &&
          fill.action === "sell" &&
          currentAllocation > longAllocation + 1e-10
        ) {
          targetAllocation = longAllocation;
          signals = ["short-exit"];
        }
        if (Math.abs(targetAllocation - currentAllocation) > 1e-10) {
          executions.push({
            targetAllocation,
            fillPrice: fill.fillPrice,
            signals,
          });
          currentAllocation = targetAllocation;
        }
      });
    };

    const orderedFills = [
      ...currentLongFills.map((fill) => ({
        fill,
        role: "long" as const,
      })),
      ...currentShortFills.map((fill) => ({
        fill,
        role: "short" as const,
      })),
    ].sort((left, right) => {
      if (left.fill.action !== right.fill.action) {
        return left.fill.action === "buy" ? -1 : 1;
      }
      const priceDifference =
        left.fill.action === "buy"
          ? left.fill.fillPrice - right.fill.fillPrice
          : right.fill.fillPrice - left.fill.fillPrice;
      if (Math.abs(priceDifference) > 1e-10) return priceDifference;
      return left.role === right.role ? 0 : left.role === "long" ? -1 : 1;
    });
    orderedFills.forEach(({ fill, role }) => applyFills([fill], role));
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
  if (
    plan.strategyA &&
    plan.strategyB &&
    areStrategiesEquivalent(
      plan.strategyA.strategyId,
      plan.strategyB.strategyId,
    )
  ) {
    throw new Error("Strategy A and Strategy B must not be equivalent");
  }
  const strategyAEntryAllowed = buildMovingAverageEntryAllowedSeries(
    bars,
    planEntryFilter(plan, "strategyA"),
  );
  const strategyBEntryAllowed = buildMovingAverageEntryAllowedSeries(
    bars,
    planEntryFilter(plan, "strategyB"),
  );
  const strategyAExecution = buildStrategyExecutionSeries(
    bars,
    plan.strategyA,
    buildSelectionTarget(bars, plan.strategyA),
    strategyAEntryAllowed,
  );
  const strategyBExecution = buildStrategyExecutionSeries(
    bars,
    plan.strategyB,
    buildSelectionTarget(bars, plan.strategyB),
    strategyBEntryAllowed,
  );
  const strategyATarget = strategyAExecution.target;
  const strategyBTarget = strategyBExecution.target;
  const roleTargets =
    roleWindow && strategyATarget && strategyBTarget
      ? {
          strategyA: selectRoleTargetWindow(
            bars,
            strategyATarget,
            roleWindow,
          ),
          strategyB: selectRoleTargetWindow(
            bars,
            strategyBTarget,
            roleWindow,
          ),
        }
      : undefined;
  const timeline = buildStrategyPlanTimelineFromTargets(
    strategyATarget,
    strategyBTarget,
    plan.strategyAAllocation,
    plan.strategyBAllocation,
    roleTargets,
    fixedRelativeLongStrategy,
  );
  const intrabarExecutions = buildPlanIntrabarExecutions(
    timeline,
    plan.strategyAAllocation,
    plan.strategyBAllocation,
    strategyAExecution.orderFills,
    strategyBExecution.orderFills,
    Boolean(plan.strategyA),
    Boolean(plan.strategyB),
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
}

export function buildLiveAllocationGuidance(
  bars: MarketBar[],
  plan: StrategyAllocationPlan,
  roleWindow?: Pick<BacktestSettings, "startTime" | "endTime">,
  latestBarStatus: MarketLatestBarStatus = "complete",
): LiveAllocationGuidance | null {
  if (bars.length === 0 || (!plan.strategyA && !plan.strategyB)) return null;
  const strategyAEntryAllowed = buildMovingAverageEntryAllowedSeries(
    bars,
    planEntryFilter(plan, "strategyA"),
  );
  const strategyBEntryAllowed = buildMovingAverageEntryAllowedSeries(
    bars,
    planEntryFilter(plan, "strategyB"),
  );
  if (strategyAEntryAllowed && latestBarStatus !== "complete") {
    strategyAEntryAllowed[strategyAEntryAllowed.length - 1] = false;
  }
  if (strategyBEntryAllowed && latestBarStatus !== "complete") {
    strategyBEntryAllowed[strategyBEntryAllowed.length - 1] = false;
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
  const strategyATarget = buildLiveTarget(
    plan.strategyA,
    strategyAEntryAllowed,
  );
  const strategyBTarget = buildLiveTarget(
    plan.strategyB,
    strategyBEntryAllowed,
  );
  const roleTargets =
    roleWindow && strategyATarget && strategyBTarget
      ? {
          strategyA: selectRoleTargetWindow(
            bars,
            strategyATarget,
            roleWindow,
          ),
          strategyB: selectRoleTargetWindow(
            bars,
            strategyBTarget,
            roleWindow,
          ),
        }
      : undefined;
  const target = buildStrategyPlanTimelineFromTargets(
    strategyATarget,
    strategyBTarget,
    plan.strategyAAllocation,
    plan.strategyBAllocation,
    roleTargets,
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
  return { action, previousAllocation, targetAllocation };
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
    strategyAAllocation: normalizeAllocation(
      combination.strategyAAllocation,
      DEFAULT_STRATEGY_A_ALLOCATION,
    ),
    strategyBAllocation: normalizeAllocation(
      combination.strategyBAllocation,
      DEFAULT_STRATEGY_B_ALLOCATION,
    ),
    strategyAEntryFilter: cloneMovingAverageSlopeFilter(
      combination.strategyAEntryFilter ?? combination.entryFilter,
    ),
    strategyBEntryFilter: cloneMovingAverageSlopeFilter(
      combination.strategyBEntryFilter ?? combination.entryFilter,
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
    strategyAAllocation: combination.strategyAAllocation,
    strategyBAllocation: combination.strategyBAllocation,
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
  };
  const timeline = buildStrategyPlanTimeline(
    bars,
    plan,
    fixedRelativeLongStrategy ? undefined : settings,
    fixedRelativeLongStrategy,
  );
  if (!timeline.relativeLongStrategy) {
    throw new Error("A strategy pair requires a relative long strategy");
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
    strategyAAllocation: combination.strategyAAllocation,
    strategyBAllocation: combination.strategyBAllocation,
    relativeLongStrategy: timeline.relativeLongStrategy,
    strategyAEntryFilter: cloneMovingAverageSlopeFilter(
      plan.strategyAEntryFilter,
    ),
    strategyBEntryFilter: cloneMovingAverageSlopeFilter(
      plan.strategyBEntryFilter,
    ),
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
  const existingIndex = results.findIndex(
    (existing) =>
      existing.strategyAId === result.strategyAId &&
      existing.strategyBId === result.strategyBId,
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
  if (results.length > MAX_COMBINATION_RESULTS) {
    results.length = MAX_COMBINATION_RESULTS;
  }
}

function retainPairFinalist(
  finalists: StrategyPairFinalist[],
  finalist: StrategyPairFinalist,
  objective: ScreeningObjective,
  limit: number,
) {
  finalists.push(finalist);
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
    Math.abs(left.strategyBAllocation - right.strategyBAllocation) < 1e-10
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
  );
  const performance = runAllocationBacktest(
    bars,
    timeline.target,
    settings,
    timeline.signalEvents,
    buildPlanIntrabarExecutions(
      timeline,
      allocation.strategyAAllocation,
      allocation.strategyBAllocation,
      strategyAFinalist.orderFills,
      strategyBFinalist.orderFills,
      true,
      true,
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
    relativeLongStrategy: timeline.relativeLongStrategy,
    strategyAEntryFilter: cloneMovingAverageSlopeFilter(
      strategyAFinalist.result.entryFilter,
    ),
    strategyBEntryFilter: cloneMovingAverageSlopeFilter(
      strategyBFinalist.result.entryFilter,
    ),
  };
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
    : buildScreeningCandidates();
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
          1e-10,
    ) ?? allocationCandidates[0];
  const remainingAllocations = referenceAllocation
    ? allocationCandidates.filter(
        (allocation) => !sameAllocation(allocation, referenceAllocation),
      )
    : [];
  const requestedPairFinalistLimit =
    options.maxPairFinalists ?? MAX_COMBINATION_PAIR_FINALISTS;
  const pairFinalistLimit = Number.isFinite(requestedPairFinalistLimit)
    ? Math.max(Math.floor(requestedPairFinalistLimit), 1)
    : MAX_COMBINATION_PAIR_FINALISTS;
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
      const rawTarget = strategy.buildTarget(
        bars,
        candidate.parameters,
      );
      const rawOrders = strategy.buildOrders?.(
        bars,
        candidate.parameters,
      );
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

  if (!options.signal?.aborted) {
    const pairCount = referenceAllocation
      ? singleFinalists.reduce(
          (count, strategyAFinalist, strategyAIndex) =>
            count +
            singleFinalists
              .slice(strategyAIndex + 1)
              .filter(
                (strategyBFinalist) =>
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
      strategyAIndex < singleFinalists.length;
      strategyAIndex += 1
    ) {
      const strategyAFinalist = singleFinalists[strategyAIndex];
      for (
        let strategyBIndex = strategyAIndex + 1;
        strategyBIndex < singleFinalists.length;
        strategyBIndex += 1
      ) {
        const strategyBFinalist = singleFinalists[strategyBIndex];
        const strategyAId = strategyAFinalist.result.strategyId;
        const strategyBId = strategyBFinalist.result.strategyId;
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
  }

  return {
    singleResults: singleFinalists
      .map((finalist) => finalist.result)
      .sort((left, right) =>
        compareScreeningResults(left, right, objective),
      ),
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
