"use client";

import {
  Activity,
  BarChart3,
  Bookmark,
  CandlestickChart,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Eye,
  EyeOff,
  FlaskConical,
  Folder,
  FolderPlus,
  GripVertical,
  LineChart,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  Sparkles,
  Star,
  Square,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  lazy,
  useMemo,
  useRef,
  Suspense,
  useState,
  type DragEvent as ReactDragEvent,
} from "react";
import Link from "next/link";
import type {
  ChartIndicatorConfiguration,
  ChartStrategyConfiguration,
  StrategyLineLabels,
} from "./components/PriceChart";
import { CommittedNumberInput } from "./components/CommittedNumberInput";
import { zhCN as copy } from "./i18n/zh-CN";
import {
  runAllocationBacktest,
  runBacktest,
  type AllocationBacktestResult,
  type BacktestResult,
  type BacktestSettings,
  type BacktestTrade,
} from "@/lib/analysis/backtest";
import {
  INDICATOR_PREFERENCES_STORAGE_KEY,
  DEFAULT_FAVORITE_INDICATOR_IDS,
  INDICATOR_CATEGORIES,
  INDICATORS,
  createDefaultIndicatorSettings,
  getDefaultIndicatorParameters,
  getIndicator,
  getIndicatorsByCategory,
  indicatorRequiresVolume,
  parseIndicatorWorkspacePreferences,
  type IndicatorCategoryId,
  type IndicatorId,
} from "@/lib/analysis/indicator-registry";
import {
  SCREENING_OBJECTIVES,
  isIntegerStrategyParameterKey,
  normalizeStrategyParameterInput,
  screeningObjectiveValue,
  type ScreeningObjective,
} from "@/lib/analysis/screening";
import {
  VOLUME_REQUIRED_STRATEGY_IDS,
  areStrategiesEquivalent,
  getStrategiesForInterval,
  getStrategy,
  strategyRequiresVolume,
  type StrategyId,
  type StrategyParameters,
} from "@/lib/analysis/strategies";
import {
  DEFAULT_STRATEGY_A_ALLOCATION,
  DEFAULT_STRATEGY_B_ALLOCATION,
    DEFAULT_TACTICAL_ALLOCATION_MODE,
    STRATEGY_SLOTS,
  STRATEGY_LAYER_ALLOCATION_CANDIDATES,
  TACTICAL_ALLOCATION_MODES,
  TWO_STRATEGY_ALLOCATION_CANDIDATES,
  buildLiveAllocationGuidance,
  buildStrategyPlanTimeline,
  resolveTacticalAllocationMode,
  type CombinationScreeningProgress,
  type StrategyAllocationPlan,
  type StrategyCombinationResult,
  type StrategySlot,
  type TacticalAllocationMode,
} from "@/lib/analysis/strategy-combinations";
import {
  DEFAULT_ROLLING_WINDOW_YEARS,
  DEFAULT_SAMPLE_VALIDATION_PERIODS,
  DEFAULT_SAMPLE_VALIDATION_SESSIONS,
  SCREENING_VALIDATION_MODES,
  ScreeningValidationError,
  resolveScreeningProgressBarState,
  resolveTradingSessionRange,
  resolveTrailingTradingSessionRange,
  type ScreeningCandidateReference,
  type ScreeningCombinationResult,
  type ScreeningDateWindow,
  type ScreeningRangeValidationConfig,
  type ScreeningSamplePeriodConfig,
  type ScreeningSingleResult,
  type ScreeningValidationConfig,
  type ScreeningValidationErrorCode,
  type ScreeningValidationMode,
  type ScreeningValidationProgress,
  type ScreeningValidationReport,
} from "@/lib/analysis/screening-validation";
import { runScreeningInWorker } from "@/lib/analysis/screening-worker-client";
import {
  combinationScreeningResultPlan as combinationResultPlan,
  singleScreeningResultPlan as singleResultPlan,
} from "@/lib/analysis/screening-plan";
import type { LocalScreeningEngineStatus } from "@/lib/analysis/screening-local-engine-protocol";
import {
  clearLatestScreeningResult,
  readLatestScreeningResult,
  writeLatestScreeningResult,
} from "@/lib/analysis/screening-result-cache";
import {
  createSaveScreeningRunInput,
  fingerprintMarketSeries,
  type ScreeningRunRecord,
} from "@/lib/analysis/screening-runs";
import {
  SHORTCUT_BATCH_CHECKPOINT_KEY,
  createShortcutBatchConfigSignature,
  parseShortcutBatchCheckpoint,
  pendingShortcutBatchInstrumentKeys,
  selectBestShortcutScreeningResult,
  type ShortcutBatchCheckpoint,
} from "@/lib/analysis/shortcut-batch-screening";

import {
  DEFAULT_STRATEGY_SHORTLIST_DEPUTY_COUNT,
  evaluateRecentStrategyEffectiveness,
  selectStrategyShortlist,
  type RecentEffectivenessReview,
  type StrategyShortlistEntry,
} from "@/lib/analysis/strategy-shortlist";
import {
  buildStrategyConsensusAdvice,
  type StrategyConsensusEvidence,
} from "@/lib/analysis/strategy-consensus";
import {
  MAX_SAVED_BACKTEST_SCROLL_RECORDS,
  SAVED_BACKTEST_ROLLING_SESSIONS,
  canReuseSavedBacktestMarketSeries,
  createSaveBacktestInput,
  findStrategyShortcutMatch,
  groupSavedBacktests,
  promoteSavedBacktestWithinFolder,
  reorderSavedBacktestFolders,
  reorderSavedBacktestGroups,
  reorderSavedBacktestsWithinGroup,
  resolveSavedBacktestReturnDisplay,
  savedBacktestInstrumentKey,
  strategyPlansEqual,
  type StrategyShortcutMatch,
  type SavedBacktestRecord,
  type SavedBacktestFolder,
} from "@/lib/analysis/saved-backtests";
import { buildLiveStrategyGuidance } from "@/lib/analysis/live-guidance";
import {
  buildAllocationTradeMarkers,
  buildTradeMarkers,
  type TradeMarkers,
} from "@/lib/analysis/trade-markers";
import {
  encompassingScreeningWindow,
  resolveScreeningResultChartWindows,
} from "@/lib/analysis/screening-chart";
import {
  analyzeStrategyStability,
  type StabilityEvidence,
  type StabilityEvidenceReason,
} from "@/lib/analysis/stability";
import type {
  MarketBar,
  MarketInstrument,
  MarketInterval,
  MarketReferenceSeries,
  MarketSeries,
  MarketTemporaryQuote,
} from "@/lib/market/types";
import { DAILY_HISTORY_LIMIT } from "@/lib/market/history";
import {
  mergeCanonicalMarketSeries,
  mergePreferredTemporaryQuote,
  selectCanonicalFallbackSeries,
  temporaryQuoteFromMarketSeries,
  type CanonicalFallbackCandidate,
} from "@/lib/market/series";
import {
  refreshShortcutMarketInstrument,
  type ShortcutMarketRefreshResult,
} from "@/lib/market/shortcut-refresh";
import {
  canonicalSeriesNeedsFullHistoryReplacement,
  canonicalMarketInstrumentKey,
  resolveCanonicalMarketProfile,
  type CanonicalMarketSourceDefinition,
} from "@/lib/market/canonical";
import {
  readCanonicalMarketSeriesEntry,
  readMarketSourceHealth,
  recordMarketSourceAttempt,
  writeCanonicalMarketSeries,
  writeMarketReferenceSnapshot,
  writeMarketSourceSnapshot,
  type MarketSourceHealthRecord,
} from "@/lib/market/canonical-cache";
import { readCachedMarketSeriesEntry } from "@/lib/market/client-cache";
import {
  assessMarketVolumeCoverage,
  measureMarketReferenceQuality,
  measureMarketSeriesQuality,
  missingPublishedVolumeRepairKey,
} from "@/lib/market/quality";
import {
  INTRADAY_MARKET_REFRESH_INTERVAL_MS,
  marketRefreshFailureBackoffMs,
  resolveMarketAutoRefreshPolicy,
  UNKNOWN_MARKET_REFRESH_INTERVAL_MS,
} from "@/lib/market/session";
import {
  orderMarketRecoveryDefinitions,
  selectMarketSourceByRollingHealth,
  summarizeMarketSourceHealth,
} from "@/lib/market/source-health";
import {
  DEFAULT_MOVING_AVERAGE_SLOPE_FILTER,
  MAX_MOVING_AVERAGE_SLOPE_PERIOD,
  MOVING_AVERAGE_SLOPE_TYPES,
  SCREENING_MOVING_AVERAGE_SLOPE_MINIMUM_PERCENT,
  SCREENING_MOVING_AVERAGE_SLOPE_PERIODS,
  buildScreeningMovingAverageSlopeFilters,
  cloneMovingAverageSlopeFilter,
  type MovingAverageSlopeFilter,
  type MovingAverageSlopeType,
} from "@/lib/analysis/entry-filter";

const PriceChart = lazy(async () => {
  const chartModule = await import("./components/PriceChart");
  return { default: chartModule.PriceChart };
});
const BacktestChart = lazy(async () => {
  const chartModule = await import("./components/BacktestChart");
  return { default: chartModule.BacktestChart };
});

const defaultInstrument: MarketInstrument = {
  secid: "^N225",
  code: "N225",
  name: copy.defaultInstrument.name,
  exchange: "JPX",
  assetType: "index",
  provider: "yahoo",
};

const priceChartLabels = {
  price: copy.chart.price,
  close: copy.chart.close,
  volume: copy.chart.volume,
  openPosition: copy.chart.open,
  carryPosition: copy.chart.carryPosition,
  closePosition: copy.chart.closePosition,
  shortBuy: copy.chart.shortBuy,
  shortSell: copy.chart.shortSell,
  rangeExit: copy.chart.rangeExit,
  series: { ...copy.chart.series },
};

function chartStrategyLineLabels(
  strategyId: StrategyId,
  horizon: "long" | "short",
): StrategyLineLabels {
  return {
    prefix: `${
      horizon === "long" ? copy.lab.relativeLong : copy.lab.relativeShort
    } · ${copy.strategies[strategyId].name}`,
    roles: { ...copy.chart.strategyLines.roles },
    actionRoles:
      horizon === "long"
        ? {
            entry: copy.chart.open,
            exit: copy.chart.lightPosition,
          }
        : {
            entry: copy.chart.shortBuy,
            exit: copy.chart.shortSell,
          },
  };
}

const backtestChartLabels = {
  equity: copy.chart.equity,
  drawdown: copy.chart.drawdown,
};

type WorkspaceInterval = Extract<MarketInterval, "1d" | "1m">;

const DAILY_INTERVAL: WorkspaceInterval = "1d";
const INTRADAY_INTERVAL: WorkspaceInterval = "1m";
const INTRADAY_HISTORY_LIMIT = 2_500;
const HISTORICAL_EXECUTION_POLICY = "hybrid" as const;
const DEFAULT_COMMISSION_PERCENT = 0.05;
const STRATEGY_ALLOCATION_OPTIONS = STRATEGY_LAYER_ALLOCATION_CANDIDATES.map(
  (allocation) => allocation * 100,
);
const TRIPLE_ALLOCATION_OPTIONS = Array.from(
  { length: 8 },
  (_, index) => (index + 1) * 10,
);
const DUAL_ALLOCATION_OPTIONS = TWO_STRATEGY_ALLOCATION_CANDIDATES.map(
  ({ strategyAAllocation, strategyBAllocation }) => ({
    strategyA: strategyAAllocation * 100,
    strategyB: strategyBAllocation * 100,
  }),
).filter(
  (option, index, options) =>
    options.findIndex(
      (candidate) =>
        candidate.strategyA === option.strategyA &&
        candidate.strategyB === option.strategyB,
    ) === index,
);
const DEFAULT_SCREENING_CUSTOM_RANGE: ScreeningRangeValidationConfig["range"] = {
  startTime: "",
  endTime: "",
};
const DEFAULT_SCREENING_MULTI_RANGES: ScreeningDateWindow[] = [
  { startTime: "", endTime: "" },
  { startTime: "", endTime: "" },
];
const SCREENING_PREFERENCES_STORAGE_KEY =
  "quantscope.screening-preferences.v1";

function defaultMultiRangeWindows(
  bars: readonly MarketBar[],
  startTime: string,
  endTime: string,
): ScreeningDateWindow[] {
  const selected = resolveTradingSessionRange(bars, startTime, endTime);
  if (!selected || selected.sessions < 6) {
    return DEFAULT_SCREENING_MULTI_RANGES.map((range) => ({ ...range }));
  }
  const selectedBars = bars.filter(
    (bar) => bar.time >= selected.startTime && bar.time <= selected.endTime,
  );
  const midpoint = Math.max(3, Math.floor(selectedBars.length / 2));
  return [
    {
      startTime: selectedBars[0].time,
      endTime: selectedBars[midpoint - 1].time,
    },
    {
      startTime: selectedBars[midpoint].time,
      endTime: selectedBars.at(-1)!.time,
    },
  ];
}

function cloneStrategyPlan(
  plan: StrategyAllocationPlan | null,
): StrategyAllocationPlan | null {
  if (!plan) return null;
  const planRecord = plan as StrategyAllocationPlan & Record<string, unknown>;
  return {
    ...Object.fromEntries(
      STRATEGY_SLOTS.flatMap((slot) => {
        const selection = planRecord[slot] as
          | StrategyAllocationPlan["strategyA"]
          | null
          | undefined;
        return [
          [
            slot,
            selection
              ? {
                  strategyId: selection.strategyId,
                  parameters: { ...selection.parameters },
                }
              : null,
          ],
          [
            `${slot}Allocation`,
            (planRecord[`${slot}Allocation`] as number | undefined) ?? 0,
          ],
          [
            `${slot}EntryFilter`,
            cloneMovingAverageSlopeFilter(
              (planRecord[`${slot}EntryFilter`] as
                | MovingAverageSlopeFilter
                | null
                | undefined) ?? plan.entryFilter,
            ),
          ],
        ];
      }),
    ),
    tacticalMode: resolveTacticalAllocationMode(plan.tacticalMode),
  } as StrategyAllocationPlan;
}

function strategyPlanEntryFilter(
  plan: StrategyAllocationPlan,
  slot: StrategySlot,
): MovingAverageSlopeFilter | null {
  return cloneMovingAverageSlopeFilter(
    plan[`${slot}EntryFilter`] ?? plan.entryFilter,
  );
}

function nearestDualAllocation(
  strategyAAllocation: number,
  strategyBAllocation: number,
) {
  return DUAL_ALLOCATION_OPTIONS.reduce((nearest, option) => {
    const nearestDistance =
      Math.abs(nearest.strategyA - strategyAAllocation) +
      Math.abs(nearest.strategyB - strategyBAllocation);
    const optionDistance =
      Math.abs(option.strategyA - strategyAAllocation) +
      Math.abs(option.strategyB - strategyBAllocation);
    return optionDistance < nearestDistance ? option : nearest;
  });
}

const compactFormatter = new Intl.NumberFormat("zh-CN", {
  notation: "compact",
  maximumFractionDigits: 2,
});

const EMPTY_PRICE_CHART_TRADES: BacktestTrade[] = [];

const updateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const cacheTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function formatDatetimeLocalValue(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
  const date = new Date(timestamp);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

const AUTO_REFRESH_POLICY_CHECK_INTERVAL_MS = 30_000;
const BACKUP_SOURCE_AUDIT_INTERVAL_MS = 30 * 60 * 1_000;
const SHORTCUT_REFRESH_COOLDOWN_MS = 60_000;

interface ShortcutRefreshProgress {
  completed: number;
  total: number;
  updated: number;
  retained: number;
}

type SavedBacktestDragState =
  | {
      kind: "folder";
      folderId: number;
      scope: SavedBacktestFolder["scope"];
      contextKey: string;
    }
  | { kind: "group"; groupKey: string }
  | { kind: "record"; groupKey: string; recordId: number };

function formatPercent(value: number, signed = false) {
  const prefix = signed && value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}%`;
}

function formatNumber(value: number, digits = 2) {
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function datePart(time: string) {
  return time.slice(0, 10);
}

function workspaceTimeInputValue(
  time: string,
  interval: WorkspaceInterval,
) {
  return interval === INTRADAY_INTERVAL ? time.replace(" ", "T") : datePart(time);
}

function marketTimeFromInput(value: string) {
  return value.replace("T", " ");
}

function runStrategyPlanRangeBacktest(
  bars: MarketBar[],
  plan: StrategyAllocationPlan,
  settings: BacktestSettings,
): BacktestResult | AllocationBacktestResult {
  const singleSelection =
    STRATEGY_SLOTS.map((slot) => plan[slot] ?? null).filter(Boolean)
      .length === 1
      ? STRATEGY_SLOTS.map((slot) => plan[slot] ?? null).find(Boolean) ?? null
      : null;
  const usesSingleFullAllocation =
    Boolean(singleSelection) &&
    STRATEGY_SLOTS.some(
      (slot) =>
        plan[slot] === singleSelection &&
        ((plan as StrategyAllocationPlan & Record<string, unknown>)[
          `${slot}Allocation`
        ] as number | undefined) === 1,
    );
  if (usesSingleFullAllocation && singleSelection) {
    const selectedSlot = STRATEGY_SLOTS.find(
      (slot) => plan[slot] === singleSelection,
    )!;
    const entryFilter = strategyPlanEntryFilter(plan, selectedSlot);
    return runBacktest(
      bars,
      singleSelection.strategyId,
      singleSelection.parameters,
      {
        ...settings,
        entryFilter,
        entryFilterAllowed: undefined,
      },
    );
  }
  const timeline = buildStrategyPlanTimeline(bars, plan, settings);
  return runAllocationBacktest(
    bars,
    timeline.target,
    {
      ...settings,
      entryFilter: null,
      entryFilterAllowed: undefined,
    },
    timeline.signalEvents,
    timeline.intrabarExecutions,
  );
}

function isMarketSeries(value: unknown): value is MarketSeries {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<MarketSeries>;
  return (
    Array.isArray(candidate.bars) &&
    candidate.instrument !== undefined &&
    typeof candidate.interval === "string" &&
    typeof candidate.fetchedAt === "string"
  );
}

function strategyPlanRequiresVolume(plan: StrategyAllocationPlan): boolean {
  return STRATEGY_SLOTS.map((slot) => plan[slot] ?? null).some(
    (selection) =>
      selection !== null && strategyRequiresVolume(selection.strategyId),
  );
}

function isMarketReferenceSeries(
  value: unknown,
): value is MarketReferenceSeries {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<MarketReferenceSeries>;
  return (
    Array.isArray(candidate.observations) &&
    candidate.source === "fred" &&
    candidate.interval === "1d" &&
    typeof candidate.fetchedAt === "string"
  );
}

function canonicalizeSearchQuery(query: string) {
  const normalized = query.trim();
  const alias = Object.entries(copy.searchAliases).find(
    ([localized]) => localized === normalized,
  );
  return alias?.[1] ?? normalized;
}

function isDecimalParameter(key: string) {
  return [
    "width",
    "multiplier",
    "entryPercent",
    "exitPercent",
    "start",
    "increment",
    "maximum",
    "minimumBodyPercent",
    "tick",
    "bbWidth",
    "kcWidth",
  ].includes(key);
}

function parameterStep(key: string) {
  if (key === "tick") return 0.01;
  if (isIntegerStrategyParameterKey(key)) return 1;
  return isDecimalParameter(key) ? 0.1 : 1;
}

function emptyCombinationProgress(): CombinationScreeningProgress {
  return {
    completed: 0,
    total: 0,
    stageCompleted: 0,
    stageTotal: 0,
    failed: 0,
    stage: "strategies",
    strategyAId: null,
    strategyBId: null,
  };
}

function formatStabilityEvidenceReason(
  reason: StabilityEvidenceReason,
  evidence: StabilityEvidence,
  interval: WorkspaceInterval,
) {
  if (reason === "invalid-parameters") {
    return copy.stability.evidenceReasons.invalidParameters;
  }
  if (reason === "insufficient-observations") {
    const label =
      interval === INTRADAY_INTERVAL
        ? copy.stability.evidenceReasons.insufficientBars
        : copy.stability.evidenceReasons.insufficientObservations;
    return `${label} ${evidence.observationCount} / ${evidence.minimumObservationCount}`;
  }
  if (reason === "insufficient-trades") {
    return `${copy.stability.evidenceReasons.insufficientTrades} ${evidence.tradeCount} / ${evidence.minimumTradeCount}`;
  }
  return copy.stability.evidenceReasons.noNearbyVariants;
}

interface ShortcutBatchProgress {
  completed: number;
  total: number;
  saved: number;
  failed: number;
  currentInstrument: string;
  status: "idle" | "running" | "cancelled" | "completed" | "error";
}

function formatScreeningDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "--";
  const rounded = Math.max(Math.round(seconds), 0);
  const hours = Math.floor(rounded / 3_600);
  const minutes = Math.floor((rounded % 3_600) / 60);
  const remainingSeconds = rounded % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
    : `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function combinationResultSlotData(
  result: ScreeningCombinationResult,
) {
  const record = result as ScreeningCombinationResult & Record<string, unknown>;
  return STRATEGY_SLOTS.flatMap((slot) => {
    const strategyId = record[`${slot}Id`] as StrategyId | null | undefined;
    const parameters = record[`${slot}Parameters`] as
      | StrategyParameters
      | null
      | undefined;
    if (!strategyId || !parameters) return [];
    return [{
      slot,
      strategyId,
      parameters,
      entryFilter: record[`${slot}EntryFilter`] as
        | MovingAverageSlopeFilter
        | null
        | undefined,
      allocation: (record[`${slot}Allocation`] as number | undefined) ?? 0,
    }];
  });
}

function combinationResultKey(result: ScreeningCombinationResult) {
  return `${combinationResultSlotData(result)
    .map(({ strategyId, allocation }) => `${strategyId}:${allocation}`)
    .join("|")}:${resolveTacticalAllocationMode(result.tacticalMode)}`;
}

function recentValidationTitle(review: RecentEffectivenessReview): string {
  if (review.status === "insufficient") {
    return `${copy.screening.validationDetails.insufficient} ${review.executionCount} / 2`;
  }
  const recentExcess =
    review.recentExcessReturn === null
      ? copy.common.unavailable
      : formatPercent(review.recentExcessReturn, true);
  const recentDrawdown =
    review.recentMaxDrawdown === null
      ? copy.common.unavailable
      : formatPercent(review.recentMaxDrawdown);
  const confirmation =
    review.confirmationExcessReturn === null
      ? copy.common.unavailable
      : formatPercent(review.confirmationExcessReturn, true);
  return `${copy.screening.validationDetails.recentExcess} ${recentExcess} ${copy.common.separator} ${copy.screening.drawdown} ${recentDrawdown} ${copy.common.separator} ${copy.screening.validationDetails.confirmationExcess} ${confirmation}`;
}

function recentValidationLabel(review: RecentEffectivenessReview): string {
  return copy.screening.validationStatuses[review.status];
}

interface StrategyPlanPresentation {
  strategyCount: number;
  shortName: string;
  fullName: string;
  primaryName: string;
  otherNames: string[];
}

function strategyPlanPresentation(
  plan: Pick<StrategyAllocationPlan, StrategySlot>,
  relativeLongStrategy: StrategySlot | null | undefined,
): StrategyPlanPresentation {
  const legs = STRATEGY_SLOTS
    .map((slot) => ({ slot, selection: plan[slot] ?? null }))
    .filter((leg) => Boolean(leg.selection));
  const naturalNames = legs.map(
    (leg) => copy.strategies[leg.selection!.strategyId].name,
  );
  const orderedNames = [...legs]
    .sort((left, right) =>
      left.slot === relativeLongStrategy
        ? -1
        : right.slot === relativeLongStrategy
          ? 1
          : left.slot.localeCompare(right.slot),
    )
    .map((leg) => copy.strategies[leg.selection!.strategyId].name);
  const primaryName = naturalNames[0] ?? copy.lab.noStrategy;
  return {
    strategyCount: legs.length,
    shortName:
      legs.length >= 3
        ? copy.combinationScreening.consensusShortName
            .replace("{name}", primaryName)
            .replace("{count}", String(legs.length))
        : orderedNames.join(" + "),
    fullName: naturalNames.join(" + "),
    primaryName,
    otherNames: naturalNames.slice(1),
  };
}

function strategyPlanDisplayName(
  plan: Pick<StrategyAllocationPlan, StrategySlot>,
  relativeLongStrategy: StrategySlot | null | undefined,
): string {
  return strategyPlanPresentation(plan, relativeLongStrategy).shortName;
}

function shortcutMatchTitle(match: StrategyShortcutMatch): string {
  if (match.kind === "exact") {
    return copy.screening.shortcutMatch.exactDetail;
  }
  const differences = match.parameterDifferences.slice(0, 4).map(
    (difference) =>
      `${copy.parameters[difference.key as keyof typeof copy.parameters] ?? difference.key} ${difference.savedValue ?? copy.common.unavailable} → ${difference.candidateValue ?? copy.common.unavailable}`,
  );
  if (match.allocationDifferent) {
    differences.push(copy.screening.shortcutMatch.allocationDifferent);
  }
  if (match.entryFilterDifferent) {
    differences.push(copy.screening.shortcutMatch.filterDifferent);
  }
  if (match.tacticalModeDifferent) {
    differences.push(copy.screening.shortcutMatch.tacticalDifferent);
  }
  return `${copy.screening.shortcutMatch.sameType}${
    differences.length > 0
      ? `${copy.common.colon}${differences.join(` ${copy.common.separator} `)}`
      : ""
  }`;
}

function StrategyParameterFields({
  heading,
  namePrefix,
  parameters,
  onChange,
}: {
  heading: string;
  namePrefix: string;
  parameters: StrategyParameters;
  onChange: (parameters: StrategyParameters) => void;
}) {
  return (
    <div className="parameter-block">
      <div className="subheading">
        <span>{heading}</span>
      </div>
      <div className="parameter-grid">
        {Object.entries(parameters).map(([key, value]) => (
          <label className="field-label" key={key}>
            <span>
              {copy.parameters[key as keyof typeof copy.parameters] ?? key}
            </span>
            <CommittedNumberInput
              name={`${namePrefix}-${key}`}
              value={value}
              min={
                isIntegerStrategyParameterKey(key)
                  ? 1
                  : key === "tick"
                    ? 0
                    : undefined
              }
              step={parameterStep(key)}
              integer={isIntegerStrategyParameterKey(key)}
              onCommit={(nextValue) =>
                onChange({
                  ...parameters,
                  [key]: normalizeStrategyParameterInput(
                    key,
                    nextValue,
                  ),
                })
              }
            />
          </label>
        ))}
      </div>
    </div>
  );
}

interface MovingAverageSlopeFilterDraft extends MovingAverageSlopeFilter {
  enabled: boolean;
}

function shortcutMatchLabel(match: StrategyShortcutMatch): string {
  return match.kind === "exact"
    ? copy.screening.shortcutMatch.exact
    : copy.screening.shortcutMatch.sameType;
}

interface IntervalResearchSnapshot {
  strategyAId: StrategyId | "";
  strategyAParameters: StrategyParameters;
  strategyBId: StrategyId | "";
  strategyBParameters: StrategyParameters;
  strategyCId: StrategyId | "";
  strategyCParameters: StrategyParameters;
  strategyAEntryFilterDraft: MovingAverageSlopeFilterDraft;
  strategyBEntryFilterDraft: MovingAverageSlopeFilterDraft;
  strategyCEntryFilterDraft: MovingAverageSlopeFilterDraft;
  appliedStrategyPlan: StrategyAllocationPlan | null;
  appliedChartRange: AppliedChartRange;
  strategyAAllocationPercent: number;
  strategyBAllocationPercent: number;
  strategyCAllocationPercent: number;
  tacticalAllocationMode: TacticalAllocationMode;
  screeningObjective: ScreeningObjective;
  screenResultsObjective: ScreeningObjective;
  screeningValidationMode: ScreeningValidationMode;
  screeningEntryFilterDraft: MovingAverageSlopeFilterDraft;
  sampleValidationPeriods: ScreeningSamplePeriodConfig[];
  screeningCustomRange: ScreeningRangeValidationConfig["range"];
  screeningMultiRanges: ScreeningDateWindow[];
  rollingWindowYears: number;
  screenResults: ScreeningSingleResult[];
  combinationResults: ScreeningCombinationResult[];
  validationReport: ScreeningValidationReport | null;
  screenProgress: CombinationScreeningProgress;
}

type AppliedChartRange =
  | { kind: "workspace" }
  | { kind: "screening"; windows: ScreeningDateWindow[] }
  | { kind: "saved-recent" };

function createMovingAverageSlopeFilterDraft(
  filter?: MovingAverageSlopeFilter | null,
): MovingAverageSlopeFilterDraft {
  return {
    ...(filter ?? DEFAULT_MOVING_AVERAGE_SLOPE_FILTER),
    enabled: Boolean(filter),
  };
}

function createIntervalResearchSnapshot(
  interval: WorkspaceInterval,
): IntervalResearchSnapshot {
  return {
    strategyAId: "",
    strategyAParameters: {},
    strategyBId: "",
    strategyBParameters: {},
    strategyCId: "",
    strategyCParameters: {},
    strategyAEntryFilterDraft: createMovingAverageSlopeFilterDraft(),
    strategyBEntryFilterDraft: createMovingAverageSlopeFilterDraft(),
    strategyCEntryFilterDraft: createMovingAverageSlopeFilterDraft(),
    appliedStrategyPlan: null,
    appliedChartRange: { kind: "workspace" },
    strategyAAllocationPercent: 100,
    strategyBAllocationPercent: 0,
    strategyCAllocationPercent: 0,
    tacticalAllocationMode: DEFAULT_TACTICAL_ALLOCATION_MODE,
    screeningObjective: "totalReturn",
    screenResultsObjective: "totalReturn",
    screeningValidationMode:
      interval === INTRADAY_INTERVAL ? "range" : "sample",
    screeningEntryFilterDraft: createMovingAverageSlopeFilterDraft(
      DEFAULT_MOVING_AVERAGE_SLOPE_FILTER,
    ),
    sampleValidationPeriods: DEFAULT_SAMPLE_VALIDATION_PERIODS.map(
      (period) => ({ ...period }),
    ),
    screeningCustomRange: { ...DEFAULT_SCREENING_CUSTOM_RANGE },
    screeningMultiRanges: DEFAULT_SCREENING_MULTI_RANGES.map((range) => ({
      ...range,
    })),
    rollingWindowYears: DEFAULT_ROLLING_WINDOW_YEARS,
    screenResults: [],
    combinationResults: [],
    validationReport: null,
    screenProgress: emptyCombinationProgress(),
  };
}

function activeMovingAverageSlopeFilter(
  draft: MovingAverageSlopeFilterDraft,
): MovingAverageSlopeFilter | null {
  return draft.enabled
    ? {
        movingAverageType: draft.movingAverageType,
        period: draft.period,
        minimumSlopePercent: draft.minimumSlopePercent,
      }
    : null;
}

function formatMovingAverageSlopeFilter(
  filter: MovingAverageSlopeFilter | null | undefined,
) {
  if (!filter) return copy.entryFilter.disabled;
  return `${filter.movingAverageType.toUpperCase()}(${filter.period}) ${copy.entryFilter.slopeAtLeast} ${formatNumber(filter.minimumSlopePercent)}%`;
}

function MovingAverageSlopeFilterFields({
  draft,
  namePrefix,
  onChange,
  disabled = false,
  context,
  intraday = false,
}: {
  draft: MovingAverageSlopeFilterDraft;
  namePrefix: string;
  onChange: (draft: MovingAverageSlopeFilterDraft) => void;
  disabled?: boolean;
  context: "lab" | "screening";
  intraday?: boolean;
}) {
  const controlsDisabled = disabled || !draft.enabled;
  return (
    <fieldset className={`entry-filter-fields ${context}`}>
      <legend>{copy.entryFilter.title}</legend>
      <label className="entry-filter-toggle">
        <input
          name={`${namePrefix}-enabled`}
          type="checkbox"
          checked={draft.enabled}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...(context === "screening"
                ? DEFAULT_MOVING_AVERAGE_SLOPE_FILTER
                : draft),
              enabled: event.target.checked,
            })
          }
        />
        <span>{copy.entryFilter.enabled}</span>
      </label>
      {context === "screening" ? (
        <div
          className={`entry-filter-inputs screening-fixed ${controlsDisabled ? "disabled" : ""}`}
        >
          <label>
            <span>{copy.entryFilter.movingAverageType}</span>
            <output>EMA</output>
          </label>
          <label>
            <span>
              {intraday
                ? copy.entryFilter.periodBars
                : copy.entryFilter.period}
            </span>
            <output>
              {SCREENING_MOVING_AVERAGE_SLOPE_PERIODS[0]}
              {"–"}
              {SCREENING_MOVING_AVERAGE_SLOPE_PERIODS.at(-1)}
            </output>
          </label>
          <label>
            <span>
              {intraday
                ? copy.entryFilter.minimumSlopeBars
                : copy.entryFilter.minimumSlope}
            </span>
            <output>
              {SCREENING_MOVING_AVERAGE_SLOPE_MINIMUM_PERCENT}%
            </output>
          </label>
        </div>
      ) : (
        <div className="entry-filter-inputs">
          <label>
            <span>{copy.entryFilter.movingAverageType}</span>
            <select
              name={`${namePrefix}-moving-average-type`}
              value={draft.movingAverageType}
              disabled={controlsDisabled}
              onChange={(event) =>
                onChange({
                  ...draft,
                  movingAverageType:
                    event.target.value as MovingAverageSlopeType,
                })
              }
            >
              {MOVING_AVERAGE_SLOPE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>
              {intraday
                ? copy.entryFilter.periodBars
                : copy.entryFilter.period}
            </span>
            <CommittedNumberInput
              name={`${namePrefix}-period`}
              min={2}
              max={MAX_MOVING_AVERAGE_SLOPE_PERIOD}
              step={1}
              value={draft.period}
              disabled={controlsDisabled}
              integer
              onCommit={(value) => {
                onChange({
                  ...draft,
                  period: value,
                });
              }}
            />
          </label>
          <label>
            <span>
              {intraday
                ? copy.entryFilter.minimumSlopeBars
                : copy.entryFilter.minimumSlope}
            </span>
            <CommittedNumberInput
              name={`${namePrefix}-minimum-slope`}
              step={0.01}
              value={draft.minimumSlopePercent}
              disabled={controlsDisabled}
              onCommit={(value) => {
                onChange({
                  ...draft,
                  minimumSlopePercent: value,
                });
              }}
            />
          </label>
        </div>
      )}
    </fieldset>
  );
}

export function MarketWorkspace() {
  const [instrument, setInstrument] =
    useState<MarketInstrument>(defaultInstrument);
  const [seriesState, setSeries] = useState<MarketSeries | null>(null);
  const series = isMarketSeries(seriesState) ? seriesState : null;
  const [researchInterval] = useState<WorkspaceInterval>(DAILY_INTERVAL);
  const [chartType, setChartType] = useState<"candlestick" | "line">(
    "candlestick",
  );
  const [focusedIndicator, setFocusedIndicator] =
    useState<IndicatorId>("sma");
  const [visibleIndicatorIds, setVisibleIndicatorIds] = useState<IndicatorId[]>(
    [],
  );
  const [favoriteIndicatorIds, setFavoriteIndicatorIds] = useState<
    IndicatorId[]
  >([...DEFAULT_FAVORITE_INDICATOR_IDS]);
  const [openIndicatorCategory, setOpenIndicatorCategory] =
    useState<IndicatorCategoryId | null>(null);
  const [indicatorSettings, setIndicatorSettings] = useState(
    createDefaultIndicatorSettings,
  );
  const [indicatorPreferencesReady, setIndicatorPreferencesReady] =
    useState(false);
  const [strategyAId, setStrategyAId] = useState<StrategyId | "">("");
  const [strategyAParameters, setStrategyAParameters] =
    useState<StrategyParameters>({});
  const [strategyBId, setStrategyBId] = useState<StrategyId | "">("");
  const [strategyBParameters, setStrategyBParameters] =
    useState<StrategyParameters>({});
  const [strategyCId, setStrategyCId] = useState<StrategyId | "">("");
  const [strategyCParameters, setStrategyCParameters] =
    useState<StrategyParameters>({});
  const [appliedStrategyPlan, setAppliedStrategyPlan] =
    useState<StrategyAllocationPlan | null>(null);
  const [appliedChartRange, setAppliedChartRange] =
    useState<AppliedChartRange>({ kind: "workspace" });
  const [strategyAEntryFilterDraft, setStrategyAEntryFilterDraft] = useState(
    () => createMovingAverageSlopeFilterDraft(),
  );
  const [strategyBEntryFilterDraft, setStrategyBEntryFilterDraft] = useState(
    () => createMovingAverageSlopeFilterDraft(),
  );
  const [strategyCEntryFilterDraft, setStrategyCEntryFilterDraft] = useState(
    () => createMovingAverageSlopeFilterDraft(),
  );
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [initialCash, setInitialCash] = useState(100_000);
  const [commissionPercent, setCommissionPercent] = useState(
    DEFAULT_COMMISSION_PERCENT,
  );
  const [slippagePercent, setSlippagePercent] = useState(0.02);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MarketInstrument[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorCode, setErrorCode] = useState("");
  const [cachedPreviewAt, setCachedPreviewAt] = useState<number | null>(
    null,
  );
  const [temporaryQuote, setTemporaryQuote] =
    useState<MarketTemporaryQuote | null>(null);
  const [refreshedShortcutMarkets, setRefreshedShortcutMarkets] =
    useState<Map<string, ShortcutMarketRefreshResult>>(
      () => new Map(),
    );
  const [refreshingSavedMarkets, setRefreshingSavedMarkets] =
    useState(false);
  const [shortcutRefreshProgress, setShortcutRefreshProgress] =
    useState<ShortcutRefreshProgress | null>(null);
  const [shortcutRefreshCoolingDown, setShortcutRefreshCoolingDown] =
    useState(false);
  const [sourceHealth, setSourceHealth] = useState<
    MarketSourceHealthRecord[]
  >([]);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [shortcutRefreshRequestVersion, setShortcutRefreshRequestVersion] =
    useState(0);
  const [screening, setScreening] = useState(false);
  const [screeningError, setScreeningError] = useState<
    ScreeningValidationErrorCode | "volume-unavailable" | "run" | ""
  >("");
  const [screenResults, setScreenResults] = useState<
    ScreeningSingleResult[]
  >([]);
  const [screeningObjective, setScreeningObjective] =
    useState<ScreeningObjective>("totalReturn");
  const [screenResultsObjective, setScreenResultsObjective] =
    useState<ScreeningObjective>("totalReturn");
  const [screeningValidationMode, setScreeningValidationMode] =
    useState<ScreeningValidationMode>("sample");
  const [screeningEntryFilterDraft, setScreeningEntryFilterDraft] = useState(
    () =>
      createMovingAverageSlopeFilterDraft(
        DEFAULT_MOVING_AVERAGE_SLOPE_FILTER,
      ),
  );
  const [sampleValidationPeriods, setSampleValidationPeriods] =
    useState<ScreeningSamplePeriodConfig[]>(() =>
      DEFAULT_SAMPLE_VALIDATION_PERIODS.map((period) => ({
        ...period,
      })),
    );
  const [screeningCustomRange, setScreeningCustomRange] = useState(
    DEFAULT_SCREENING_CUSTOM_RANGE,
  );
  const [screeningMultiRanges, setScreeningMultiRanges] = useState<
    ScreeningDateWindow[]
  >(() => DEFAULT_SCREENING_MULTI_RANGES.map((range) => ({ ...range })));
  const [screeningPreferencesReady, setScreeningPreferencesReady] =
    useState(false);
  const [rollingWindowYears, setRollingWindowYears] = useState(
    DEFAULT_ROLLING_WINDOW_YEARS,
  );
  const [validationProgress, setValidationProgress] =
    useState<ScreeningValidationProgress | null>(null);
  const [validationReport, setValidationReport] =
    useState<ScreeningValidationReport | null>(null);
  const [screenProgress, setScreenProgress] =
    useState<CombinationScreeningProgress>(emptyCombinationProgress);
  const [screenEngineStatus, setScreenEngineStatus] =
    useState<LocalScreeningEngineStatus | null>(null);
  const [combinationResults, setCombinationResults] = useState<
    ScreeningCombinationResult[]
  >([]);
  const [chartResultGroupKey, setChartResultGroupKey] = useState("single");
  const [chartResultIndex, setChartResultIndex] = useState(0);
  const [strategyAAllocationPercent, setStrategyAAllocationPercent] = useState(
    DEFAULT_STRATEGY_A_ALLOCATION * 100,
  );
  const [strategyBAllocationPercent, setStrategyBAllocationPercent] = useState(
    DEFAULT_STRATEGY_B_ALLOCATION * 100,
  );
  const [strategyCAllocationPercent, setStrategyCAllocationPercent] =
    useState(0);
  const [tacticalAllocationMode, setTacticalAllocationMode] =
    useState<TacticalAllocationMode>(DEFAULT_TACTICAL_ALLOCATION_MODE);
  const intervalResearchSnapshotsRef = useRef<
    Record<WorkspaceInterval, IntervalResearchSnapshot>
  >({
    "1d": createIntervalResearchSnapshot(DAILY_INTERVAL),
    "1m": createIntervalResearchSnapshot(INTRADAY_INTERVAL),
  });
  const [savedBacktests, setSavedBacktests] = useState<
    SavedBacktestRecord[]
  >([]);
  const [savedBacktestFolders, setSavedBacktestFolders] = useState<
    SavedBacktestFolder[]
  >([]);
  const [savedBacktestsLoading, setSavedBacktestsLoading] = useState(true);
  const [savedBacktestsError, setSavedBacktestsError] = useState(false);
  const [expandedSavedBacktestGroups, setExpandedSavedBacktestGroups] =
    useState<string[]>([]);
  const [collapsedSavedBacktestFolderIds, setCollapsedSavedBacktestFolderIds] =
    useState<number[]>([]);
  const [savedBacktestDrag, setSavedBacktestDrag] =
    useState<SavedBacktestDragState | null>(null);
  const [savedBacktestDropTarget, setSavedBacktestDropTarget] = useState("");
  const [savedBacktestOrderSaving, setSavedBacktestOrderSaving] =
    useState(false);
  const [savedBacktestFolderSaving, setSavedBacktestFolderSaving] =
    useState(false);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [shortcutBatchProgress, setShortcutBatchProgress] =
    useState<ShortcutBatchProgress>({
      completed: 0,
      total: 0,
      saved: 0,
      failed: 0,
      currentInstrument: "",
      status: "idle",
    });
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const indicatorMenusRef = useRef<HTMLDivElement>(null);
  const chartSectionRef = useRef<HTMLElement>(null);
  const screeningAbortRef = useRef<AbortController | null>(null);
  const visibleInstrumentKeyRef = useRef(
    savedBacktestInstrumentKey(defaultInstrument),
  );
  const shortcutBatchAbortRef = useRef<AbortController | null>(null);
  const shortcutBatchStopRequestedRef = useRef(false);
  const screeningCacheRestoreKeyRef = useRef("");
  const screenProgressRef = useRef<CombinationScreeningProgress>(
    emptyCombinationProgress(),
  );
  const shortcutRefreshAbortRef = useRef<AbortController | null>(null);
  const currentSeriesKeyRef = useRef("");
  const latestSeriesDateRef = useRef("");
  const marketSeriesRef = useRef<MarketSeries | null>(null);
  const canonicalSeriesRef = useRef<MarketSeries | null>(null);
  const temporaryQuoteRef = useRef<MarketTemporaryQuote | null>(null);
  const refreshedShortcutMarketsRef = useRef<
    Map<string, ShortcutMarketRefreshResult>
  >(new Map());
  const cachedSeriesActiveRef = useRef(false);
  const sourceHistoryAuditKeyRef = useRef("");
  const volumeRepairAttemptKeyRef = useRef("");
  const latestSourceAuditAtRef = useRef(0);
  const credentialAuditRetryAfterRef = useRef(
    new Map<string, number>(),
  );
  const lastMarketRefreshAttemptAtRef = useRef(0);
  const automaticRefreshBackoffRef = useRef({
    failures: 0,
    retryAfter: 0,
  });
  const shortcutRefreshCooldownTimerRef = useRef<number | null>(null);
  const handledShortcutRefreshRequestVersionRef = useRef(0);
  const savedBacktestRollingSyncRef = useRef(new Map<string, string>());
  const primaryBackoffRef = useRef({
    instrumentKey: "",
    failures: 0,
    retryAfter: 0,
  });
  const sharedRangeSessionsRef = useRef(
    DEFAULT_SAMPLE_VALIDATION_SESSIONS,
  );
  const sharedRangeRef = useRef({ startDate: "", endDate: "" });
  const activeIndicator = getIndicator(focusedIndicator);
  const indicatorParameters = indicatorSettings[focusedIndicator];
  const volumeCoverage = useMemo(
    () => assessMarketVolumeCoverage(series?.bars ?? []),
    [series],
  );
  const reliableVolume = volumeCoverage.reliable;
  const focusedIndicatorVolumeUnavailable =
    indicatorRequiresVolume(focusedIndicator) && !reliableVolume;
  const focusedIndicatorVisible =
    visibleIndicatorIds.includes(focusedIndicator) &&
    !focusedIndicatorVolumeUnavailable;
  const effectiveVisibleIndicatorIds = useMemo(
    () =>
      visibleIndicatorIds.filter(
        (id) => reliableVolume || !indicatorRequiresVolume(id),
      ),
    [reliableVolume, visibleIndicatorIds],
  );
  const visibleIndicators = useMemo<readonly ChartIndicatorConfiguration[]>(
    () =>
      effectiveVisibleIndicatorIds.map((id) => ({
        id,
        parameters: indicatorSettings[id],
      })),
    [effectiveVisibleIndicatorIds, indicatorSettings],
  );
  const chartIndicators = visibleIndicators;
  const savedBacktestGroups = useMemo(
    () => groupSavedBacktests(savedBacktests),
    [savedBacktests],
  );
  const availableStrategies = useMemo(
    () => getStrategiesForInterval(researchInterval),
    [researchInterval],
  );
  const instrumentShortcutFolders = useMemo(
    () =>
      savedBacktestFolders.filter((folder) => folder.scope === "instrument"),
    [savedBacktestFolders],
  );
  const savedBacktestInstrumentSections = useMemo(() => {
    const sections: Array<{
      folder: SavedBacktestFolder | null;
      groups: typeof savedBacktestGroups;
    }> = instrumentShortcutFolders.map((folder) => ({
      folder,
      groups: savedBacktestGroups.filter(
        (group) => group.instrumentFolderId === folder.id,
      ),
    }));
    const unfiledGroups = savedBacktestGroups.filter(
      (group) =>
        group.instrumentFolderId === null ||
        !instrumentShortcutFolders.some(
          (folder) => folder.id === group.instrumentFolderId,
        ),
    );
    if (unfiledGroups.length > 0) {
      sections.push({ folder: null, groups: unfiledGroups });
    }
    return sections;
  }, [instrumentShortcutFolders, savedBacktestGroups]);
  const activeScreeningRunInstrumentKey = savedBacktestInstrumentKey(
    series?.instrument ?? instrument,
  );
  const activeSavedBacktestGroup = savedBacktestGroups.find(
    (group) => group.key === activeScreeningRunInstrumentKey,
  );
  const activeSavedGroupRequiresVolume =
    activeSavedBacktestGroup?.records.some(
      (record) =>
        record.interval === researchInterval &&
        strategyPlanRequiresVolume(record.plan),
    ) ?? false;
  const screeningBlockedByVolume =
    !reliableVolume && activeSavedGroupRequiresVolume;
  const applyTemporaryQuote = useCallback(
    (quote: MarketTemporaryQuote | null) => {
      temporaryQuoteRef.current = quote;
      setTemporaryQuote(quote);
    },
    [],
  );
  const markMarketRefreshSuccess = useCallback(() => {
    automaticRefreshBackoffRef.current = {
      failures: 0,
      retryAfter: 0,
    };
  }, []);
  const markMarketRefreshFailure = useCallback(() => {
    const failures = Math.min(
      automaticRefreshBackoffRef.current.failures + 1,
      3,
    );
    automaticRefreshBackoffRef.current = {
      failures,
      retryAfter:
        Date.now() + marketRefreshFailureBackoffMs(failures),
    };
  }, []);

  const fetchMarket = useCallback(
    async (signal: AbortSignal) => {
      lastMarketRefreshAttemptAtRef.current = Date.now();
      setLoading(true);
      setErrorCode("");
      const profile = resolveCanonicalMarketProfile(instrument);
      const profileBackoffKey = `${profile.key}:${researchInterval}`;
      const sourceHealthKey =
        researchInterval === DAILY_INTERVAL
          ? profile.key
          : `${profile.key}:${researchInterval}`;
      if (
        primaryBackoffRef.current.instrumentKey !== profileBackoffKey
      ) {
        primaryBackoffRef.current = {
          instrumentKey: profileBackoffKey,
          failures: 0,
          retryAfter: 0,
        };
      }
      const seriesKey = `${profile.key}:${researchInterval}`;
      const seriesLimit =
        researchInterval === DAILY_INTERVAL
          ? DAILY_HISTORY_LIMIT
          : INTRADAY_HISTORY_LIMIT;
      const loadSeries = async (
        requestInstrument: MarketInstrument,
        mode: "history" | "latest",
        limit: number,
        audit = false,
      ) => {
        const params = new URLSearchParams({
          secid: requestInstrument.secid,
          code: requestInstrument.code,
          name: requestInstrument.name,
          exchange: requestInstrument.exchange,
          provider: requestInstrument.provider,
          assetType: requestInstrument.assetType,
          interval: researchInterval,
          limit: String(limit),
          mode,
          strictProvider: "1",
        });
        if (audit) params.set("audit", "1");
        const response = await fetch(`/api/market?${params}`, {
          signal,
          cache: mode === "latest" ? "no-store" : "no-cache",
        });
        const payload = (await response.json()) as MarketSeries & {
          error?: string;
        };
        if (!response.ok || payload.error) {
          throw new Error(payload.error || "UNKNOWN");
        }
        return payload;
      };
      const loadReference = async (
        mode: "history" | "latest",
        limit: number,
      ) => {
        const params = new URLSearchParams({
          provider: "fred",
          code: "N225",
          mode,
          limit: String(limit),
          audit: "1",
        });
        const response = await fetch(`/api/market/reference?${params}`, {
          signal,
          cache: mode === "latest" ? "no-store" : "default",
        });
        const payload = (await response.json()) as MarketReferenceSeries & {
          error?: string;
        };
        if (
          !response.ok ||
          payload.error ||
          !isMarketReferenceSeries(payload)
        ) {
          throw new Error(payload.error || "UNKNOWN");
        }
        return payload;
      };

      try {
        let currentSeries = isMarketSeries(canonicalSeriesRef.current)
          ? canonicalSeriesRef.current
          : null;
        if (
          currentSeries &&
          (savedBacktestInstrumentKey(currentSeries.instrument) !==
            profile.key ||
            currentSeries.interval !== researchInterval)
        ) {
          currentSeries = null;
        }
        if (currentSeries === null && marketSeriesRef.current !== null) {
          marketSeriesRef.current = null;
          canonicalSeriesRef.current = null;
          currentSeriesKeyRef.current = "";
          latestSeriesDateRef.current = "";
        }
        const missingVolumeDates = currentSeries
          ? missingPublishedVolumeRepairKey(currentSeries.bars)
          : "";
        const volumeRepairAttemptKey = missingVolumeDates
          ? `${seriesKey}:${currentSeries?.source ?? ""}:${missingVolumeDates}`
          : "";
        const repairsMissingVolume =
          volumeRepairAttemptKey !== "" &&
          volumeRepairAttemptKeyRef.current !== volumeRepairAttemptKey;
        if (repairsMissingVolume) {
          volumeRepairAttemptKeyRef.current = volumeRepairAttemptKey;
        }
        const refreshesLatestOnly =
          currentSeries !== null &&
          currentSeries.bars.length >= 120 &&
          currentSeriesKeyRef.current === seriesKey &&
          !canonicalSeriesNeedsFullHistoryReplacement(
            profile,
            currentSeries,
          ) &&
          !repairsMissingVolume;
        const applyLoadedSeries = (
          payload: MarketSeries,
          canonicalPayload = payload,
        ) => {
          marketSeriesRef.current = payload;
          canonicalSeriesRef.current = canonicalPayload;
          setSeries(payload);

          if (!payload.bars.length) return;
          const sameSeries = currentSeriesKeyRef.current === seriesKey;
          const previousLatestDate = latestSeriesDateRef.current;
          const firstTime = payload.bars[0].time;
          const lastTime = payload.bars[payload.bars.length - 1].time;
          const currentRange = sharedRangeRef.current;
          const followsLatest =
            sameSeries &&
            (!currentRange.endDate ||
              currentRange.endDate === previousLatestDate ||
              currentRange.endDate > lastTime);
          const keepsHistoricalRange =
            sameSeries &&
            !followsLatest &&
            currentRange.startDate >= firstTime &&
            currentRange.endDate <= lastTime;
          const nextRange = keepsHistoricalRange
            ? resolveTradingSessionRange(
                payload.bars,
                currentRange.startDate,
                currentRange.endDate,
              )
            : researchInterval === INTRADAY_INTERVAL
              ? resolveTradingSessionRange(
                  payload.bars,
                  firstTime,
                  lastTime,
                )
              : resolveTrailingTradingSessionRange(
                  payload.bars,
                  sharedRangeSessionsRef.current,
                  lastTime,
                );
          if (nextRange) {
            sharedRangeRef.current = {
              startDate: nextRange.startTime,
              endDate: nextRange.endTime,
            };
            sharedRangeSessionsRef.current = nextRange.sessions;
            setStartDate(nextRange.startTime);
            setEndDate(nextRange.endTime);
            setSampleValidationPeriods([
              { sessions: nextRange.sessions, weight: 100 },
            ]);
          }
          currentSeriesKeyRef.current = seriesKey;
          latestSeriesDateRef.current = lastTime;
        };

        if (!refreshesLatestOnly) {
          let cached = await readCanonicalMarketSeriesEntry(
            profile.primary.instrument,
            researchInterval,
          );
          if (!cached) {
            const legacyCandidates = [
              profile.primary.instrument,
              instrument,
            ].filter(
              (candidate, index, candidates) =>
                candidates.findIndex(
                  (item) =>
                    item.provider === candidate.provider &&
                    item.secid === candidate.secid,
                ) === index,
            );
            for (const candidate of legacyCandidates) {
              const legacy = await readCachedMarketSeriesEntry(
                candidate,
                researchInterval,
              );
              if (
                legacy &&
                legacy.series.bars.length >= 120 &&
                savedBacktestInstrumentKey(legacy.series.instrument) ===
                  profile.key
              ) {
                const migrated =
                  legacy.series.source === profile.primary.provider
                    ? mergeCanonicalMarketSeries(
                        null,
                        legacy.series,
                        seriesLimit,
                        profile,
                      )
                    : {
                        ...legacy.series,
                        instrument: profile.primary.instrument,
                        bars: legacy.series.bars.slice(-seriesLimit),
                      };
                cached = {
                  ...legacy,
                  fingerprint: await fingerprintMarketSeries(migrated),
                  series: migrated,
                };
                await writeCanonicalMarketSeries(migrated, profile);
                break;
              }
            }
          }
          if (signal.aborted) return;
          if (cached) {
            currentSeries = cached.series;
            applyLoadedSeries(cached.series);
            cachedSeriesActiveRef.current = true;
            setCachedPreviewAt(cached.cachedAt);
            setErrorCode("CACHED_PREVIEW");
          }
        }

        let knownSourceHealth = await readMarketSourceHealth(sourceHealthKey);
        if (!signal.aborted) setSourceHealth(knownSourceHealth);
        const updateSourceHealth = async () => {
          const health = await readMarketSourceHealth(sourceHealthKey);
          knownSourceHealth = health;
          if (!signal.aborted) setSourceHealth(health);
        };
        const loadTrackedSeries = async (
          definition: CanonicalMarketSourceDefinition & {
            instrument: MarketInstrument;
          },
          mode: "history" | "latest",
          limit: number,
          canonical: MarketSeries | null,
          audit = false,
        ) => {
          const startedAt = performance.now();
          try {
            const source = await loadSeries(
              definition.instrument,
              mode,
              limit,
              audit,
            );
            const latencyMs = performance.now() - startedAt;
            await writeMarketSourceSnapshot(source, profile, mode);
            await recordMarketSourceAttempt({
              instrumentKey: sourceHealthKey,
              provider: definition.provider,
              success: true,
              latencyMs,
              quality: measureMarketSeriesQuality(
                canonical,
                source,
                definition,
                latencyMs,
              ),
            });
            credentialAuditRetryAfterRef.current.delete(
              definition.provider,
            );
            return source;
          } catch (error) {
            if ((error as Error).name !== "AbortError") {
              if (
                definition.networkRoute === "credentialed" &&
                (error as Error).message ===
                  "PROVIDER_CREDENTIAL_INVALID"
              ) {
                credentialAuditRetryAfterRef.current.set(
                  definition.provider,
                  Date.now() + 24 * 60 * 60 * 1_000,
                );
              }
              await recordMarketSourceAttempt({
                instrumentKey: sourceHealthKey,
                provider: definition.provider,
                success: false,
                latencyMs: performance.now() - startedAt,
                errorCode: (error as Error).message || "UNKNOWN",
              });
            }
            throw error;
          }
        };
        const auditBackupSources = async (
          mode: "history" | "latest",
          limit: number,
          canonical: MarketSeries | null,
        ): Promise<{
          candidates: CanonicalFallbackCandidate[];
          quotes: MarketTemporaryQuote[];
        }> => {
          const backupResults = await Promise.all(
            profile.backups
              .filter((definition) => {
                if (definition.networkRoute !== "credentialed") {
                  return true;
                }
                if (
                  instrument.assetType !== "commodity" ||
                  !["fmp", "alltick"].includes(definition.provider)
                ) {
                  return false;
                }
                return (
                  Date.now() >=
                  (credentialAuditRetryAfterRef.current.get(
                    definition.provider,
                  ) ?? 0)
                );
              })
              .map(async (definition) => {
              try {
                const source = await loadTrackedSeries(
                  definition,
                  mode,
                  limit,
                  canonical,
                  true,
                );
                return {
                  definition,
                  source,
                  quote: canonical
                    ? temporaryQuoteFromMarketSeries(
                        source,
                        canonical,
                        profile,
                      )
                    : null,
                };
              } catch (error) {
                if ((error as Error).name === "AbortError") throw error;
                return null;
              }
              }),
          );
          await Promise.all(
            profile.references.map(async (definition) => {
              const startedAt = performance.now();
              try {
                const reference = await loadReference(mode, limit);
                const latencyMs = performance.now() - startedAt;
                await writeMarketReferenceSnapshot(reference, mode);
                await recordMarketSourceAttempt({
                  instrumentKey: sourceHealthKey,
                  provider: definition.provider,
                  success: true,
                  latencyMs,
                  quality: measureMarketReferenceQuality(
                    canonical,
                    reference,
                    definition,
                    latencyMs,
                  ),
                });
              } catch (error) {
                if ((error as Error).name === "AbortError") throw error;
                await recordMarketSourceAttempt({
                  instrumentKey: sourceHealthKey,
                  provider: definition.provider,
                  success: false,
                  latencyMs: performance.now() - startedAt,
                  errorCode: (error as Error).message || "UNKNOWN",
                });
              }
            }),
          );
          await updateSourceHealth();
          const successful = backupResults.filter(
            (
              result,
            ): result is NonNullable<typeof result> => result !== null,
          );
          return {
            candidates: successful.map(({ definition, source }) => ({
              definition,
              series: source,
            })),
            quotes: successful
              .map(({ quote }) => quote)
              .filter(
                (quote): quote is MarketTemporaryQuote => quote !== null,
              )
            .sort(
              (left, right) =>
                right.time.localeCompare(left.time) ||
                right.fetchedAt.localeCompare(left.fetchedAt),
            ),
          };
        };
        const recoverFromBackupSources = async (
          mode: "history" | "latest",
          limit: number,
          canonical: MarketSeries | null,
        ): Promise<{
          promoted: MarketSeries | null;
          quote: MarketTemporaryQuote | null;
        }> => {
          const quotes: MarketTemporaryQuote[] = [];
          const candidates: CanonicalFallbackCandidate[] = [];
          const recoveryDefinitions =
            researchInterval === DAILY_INTERVAL
              ? orderMarketRecoveryDefinitions(profile, knownSourceHealth)
              : [];
          for (const definition of recoveryDefinitions) {
            if (
              definition.provider === "juhe" &&
              (!canonical || quotes.length > 0)
            ) {
              continue;
            }
            try {
              const source = await loadTrackedSeries(
                definition,
                mode,
                limit,
                canonical,
                true,
              );
              candidates.push({ definition, series: source });
              const quote = canonical
                ? temporaryQuoteFromMarketSeries(
                    source,
                    canonical,
                    profile,
                  )
                : null;
              if (quote) quotes.push(quote);
            } catch (error) {
              if ((error as Error).name === "AbortError") throw error;
            }
          }
          await updateSourceHealth();
          const promoted = selectCanonicalFallbackSeries(
            canonical,
            candidates,
            seriesLimit,
            profile,
          );
          quotes.sort(
            (left, right) =>
              right.time.localeCompare(left.time) ||
              right.fetchedAt.localeCompare(left.fetchedAt),
          );
          return {
            promoted,
            quote: quotes[0] ?? null,
          };
        };

        const primaryMode = refreshesLatestOnly ? "latest" : "history";
        const primaryLimit = refreshesLatestOnly ? 5 : seriesLimit;
        const replacesCanonicalHistory = currentSeries
          ? canonicalSeriesNeedsFullHistoryReplacement(
              profile,
              currentSeries,
            )
          : false;
        const initialSourceSelection =
          selectMarketSourceByRollingHealth(
            profile,
            knownSourceHealth,
          );
        const rollingHealthSkipsPrimary =
          researchInterval === DAILY_INTERVAL &&
          initialSourceSelection.configuredPrimaryDegraded &&
          !initialSourceSelection.shouldProbeConfiguredPrimary;
        if (
          Date.now() < primaryBackoffRef.current.retryAfter ||
          rollingHealthSkipsPrimary
        ) {
          const backup = await recoverFromBackupSources(
            currentSeries && !replacesCanonicalHistory
              ? "latest"
              : "history",
            currentSeries && !replacesCanonicalHistory
              ? 10
              : seriesLimit,
            currentSeries,
          );
          if (backup.promoted) {
            const displayed = mergePreferredTemporaryQuote(
              backup.promoted,
              [backup.quote, temporaryQuoteRef.current],
              seriesLimit,
            );
            applyLoadedSeries(displayed.series, backup.promoted);
            cachedSeriesActiveRef.current = false;
            setCachedPreviewAt(null);
            applyTemporaryQuote(displayed.quote);
            setErrorCode(
              displayed.quote
                ? "PRIMARY_SOURCE_TEMPORARY_QUOTE"
                : "VERIFIED_BACKUP_ACTIVE",
            );
            await writeCanonicalMarketSeries(backup.promoted, profile);
            markMarketRefreshSuccess();
          } else {
            const displayed = currentSeries
              ? mergePreferredTemporaryQuote(
                  currentSeries,
                  [backup.quote, temporaryQuoteRef.current],
                  seriesLimit,
                )
              : null;
            if (displayed && currentSeries) {
              applyLoadedSeries(displayed.series, currentSeries);
            }
            applyTemporaryQuote(displayed?.quote ?? null);
            setErrorCode(
              displayed?.quote
                ? "PRIMARY_SOURCE_TEMPORARY_QUOTE"
                : "PRIMARY_SOURCE_UNAVAILABLE",
            );
            if (backup.quote) {
              markMarketRefreshSuccess();
            } else {
              markMarketRefreshFailure();
            }
          }
          return;
        }
        try {
          const realtimeQuoteDefinition =
            researchInterval === DAILY_INTERVAL
              ? orderMarketRecoveryDefinitions(
                  profile,
                  knownSourceHealth,
                ).find((definition) => definition.provider === "tencent")
              : undefined;
          const realtimeQuoteSourcePromise = realtimeQuoteDefinition
            ? loadTrackedSeries(
                realtimeQuoteDefinition,
                "latest",
                10,
                currentSeries,
                true,
              ).catch(() => null)
            : Promise.resolve(null);
          const primary = await loadTrackedSeries(
            profile.primary,
            primaryMode,
            primaryLimit,
            currentSeries,
          );
          const payload = mergeCanonicalMarketSeries(
            currentSeries,
            primary,
            seriesLimit,
            profile,
          );
          applyLoadedSeries(payload);
          cachedSeriesActiveRef.current = false;
          primaryBackoffRef.current = {
            instrumentKey: profileBackoffKey,
            failures: 0,
            retryAfter: 0,
          };
          setCachedPreviewAt(null);
          applyTemporaryQuote(null);
          setErrorCode("");
          await writeCanonicalMarketSeries(payload, profile);
          const realtimeQuoteSource = await realtimeQuoteSourcePromise;
          if (realtimeQuoteSource && !signal.aborted) {
            const realtimeQuote = temporaryQuoteFromMarketSeries(
              realtimeQuoteSource,
              payload,
              profile,
            );
            if (realtimeQuote) {
              const displayed = mergePreferredTemporaryQuote(
                payload,
                [realtimeQuote, temporaryQuoteRef.current],
                seriesLimit,
              );
              applyLoadedSeries(displayed.series, payload);
              applyTemporaryQuote(displayed.quote);
            }
          }
          await updateSourceHealth();
          markMarketRefreshSuccess();

          const now = Date.now();
          const auditsHistory =
            researchInterval === DAILY_INTERVAL &&
            sourceHistoryAuditKeyRef.current !== profile.key;
          const auditsLatest =
            researchInterval === DAILY_INTERVAL &&
            now - latestSourceAuditAtRef.current >=
            BACKUP_SOURCE_AUDIT_INTERVAL_MS;
          if (auditsHistory || auditsLatest) {
            sourceHistoryAuditKeyRef.current = profile.key;
            latestSourceAuditAtRef.current = now;
            void auditBackupSources(
              auditsHistory ? "history" : "latest",
              auditsHistory ? seriesLimit : 10,
              payload,
            ).catch(() => {
              // An aborted or failed audit never changes the canonical chart.
            });
          }
        } catch (error) {
          if ((error as Error).name === "AbortError") throw error;
          const failures = Math.min(
            primaryBackoffRef.current.failures + 1,
            3,
          );
          primaryBackoffRef.current = {
            instrumentKey: profileBackoffKey,
            failures,
            retryAfter:
              Date.now() + marketRefreshFailureBackoffMs(failures),
          };
          const retained = currentSeries;
          const replacesRetainedHistory = retained
            ? canonicalSeriesNeedsFullHistoryReplacement(
                profile,
                retained,
              )
            : false;
          const backup = await recoverFromBackupSources(
            retained && !replacesRetainedHistory
              ? "latest"
              : "history",
            retained && !replacesRetainedHistory ? 10 : seriesLimit,
            retained,
          );
          if (backup.promoted) {
            const displayed = mergePreferredTemporaryQuote(
              backup.promoted,
              [backup.quote, temporaryQuoteRef.current],
              seriesLimit,
            );
            applyLoadedSeries(displayed.series, backup.promoted);
            cachedSeriesActiveRef.current = false;
            setCachedPreviewAt(null);
            applyTemporaryQuote(displayed.quote);
            setErrorCode(
              displayed.quote
                ? "PRIMARY_SOURCE_TEMPORARY_QUOTE"
                : "VERIFIED_BACKUP_ACTIVE",
            );
            await writeCanonicalMarketSeries(
              backup.promoted,
              profile,
            );
            markMarketRefreshSuccess();
            return;
          }
          if (!retained) {
            applyTemporaryQuote(null);
            setErrorCode("PRIMARY_SOURCE_UNAVAILABLE");
            throw error;
          }
          const displayed = mergePreferredTemporaryQuote(
            retained,
            [backup.quote, temporaryQuoteRef.current],
            seriesLimit,
          );
          applyLoadedSeries(displayed.series, retained);
          applyTemporaryQuote(displayed.quote);
          setErrorCode(
            displayed.quote
              ? "PRIMARY_SOURCE_TEMPORARY_QUOTE"
              : "PRIMARY_SOURCE_UNAVAILABLE",
          );
          if (backup.quote) {
            markMarketRefreshSuccess();
          } else {
            markMarketRefreshFailure();
          }
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          markMarketRefreshFailure();
          setErrorCode((current) =>
            current || (error as Error).message || "UNKNOWN",
          );
        }
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [
      applyTemporaryQuote,
      instrument,
      markMarketRefreshFailure,
      markMarketRefreshSuccess,
      researchInterval,
    ],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetchMarket(controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [fetchMarket, refreshVersion]);

  useEffect(() => {
    const refreshVisibleMarket = (isExplicitUserInteraction = false) => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now < automaticRefreshBackoffRef.current.retryAfter) return;
      const policy = resolveMarketAutoRefreshPolicy(
        instrument,
        new Date(now),
      );
      const minInterval = policy.enabled
        ? researchInterval === INTRADAY_INTERVAL
          ? Math.min(
              policy.minimumIntervalMs,
              INTRADAY_MARKET_REFRESH_INTERVAL_MS,
            )
          : policy.minimumIntervalMs
        : researchInterval === INTRADAY_INTERVAL
          ? INTRADAY_MARKET_REFRESH_INTERVAL_MS
          : UNKNOWN_MARKET_REFRESH_INTERVAL_MS;
      const allowClosedRefresh =
        isExplicitUserInteraction &&
        marketSeriesRef.current?.latestBarStatus !== "complete";
      if (!policy.enabled && !allowClosedRefresh) {
        return;
      }
      if (now - lastMarketRefreshAttemptAtRef.current < minInterval) {
        return;
      }
      lastMarketRefreshAttemptAtRef.current = now;
      setRefreshVersion((value) => value + 1);
      if (researchInterval === DAILY_INTERVAL) {
        setShortcutRefreshRequestVersion((value) => value + 1);
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshVisibleMarket(true);
    };
    const handleFocus = () => {
      refreshVisibleMarket(true);
    };
    const refreshTimer = window.setInterval(
      () => refreshVisibleMarket(false),
      AUTO_REFRESH_POLICY_CHECK_INTERVAL_MS,
    );
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [instrument, researchInterval]);

  useEffect(() => {
    const controller = new AbortController();
    const normalizedQuery = canonicalizeSearchQuery(query);
    if (normalizedQuery.length < 1) {
      setSearchResults([]);
      setSearching(false);
      return () => controller.abort();
    }
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(normalizedQuery)}`,
          { signal: controller.signal },
        );
        const payload = (await response.json()) as {
          results?: MarketInstrument[];
        };
        setSearchResults(payload.results ?? []);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setSearchResults([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 260);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    const closeSearch = (event: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setSearchResults([]);
      }
    };
    document.addEventListener("mousedown", closeSearch);
    return () => document.removeEventListener("mousedown", closeSearch);
  }, []);

  useEffect(() => {
    if (!openIndicatorCategory) return;

    const closeIndicatorMenu = (event: MouseEvent) => {
      if (
        indicatorMenusRef.current &&
        !indicatorMenusRef.current.contains(event.target as Node)
      ) {
        setOpenIndicatorCategory(null);
      }
    };
    const closeIndicatorMenuOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenIndicatorCategory(null);
    };

    document.addEventListener("mousedown", closeIndicatorMenu);
    document.addEventListener("keydown", closeIndicatorMenuOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeIndicatorMenu);
      document.removeEventListener("keydown", closeIndicatorMenuOnEscape);
    };
  }, [openIndicatorCategory]);

  useEffect(
    () => () => {
      screeningAbortRef.current?.abort();
      shortcutBatchAbortRef.current?.abort();
      shortcutRefreshAbortRef.current?.abort();
      if (shortcutRefreshCooldownTimerRef.current !== null) {
        window.clearTimeout(shortcutRefreshCooldownTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(
          INDICATOR_PREFERENCES_STORAGE_KEY,
        );
        if (stored) {
          const preferences = parseIndicatorWorkspacePreferences(
            JSON.parse(stored) as unknown,
          );
          if (preferences) {
            setFocusedIndicator(preferences.focusedIndicator);
            setVisibleIndicatorIds(preferences.visibleIndicatorIds);
            setFavoriteIndicatorIds(preferences.favoriteIndicatorIds);
            setIndicatorSettings(preferences.settings);
          } else {
            window.localStorage.removeItem(INDICATOR_PREFERENCES_STORAGE_KEY);
          }
        }
      } catch {
        // Indicator preferences remain at safe defaults when storage is blocked.
      } finally {
        setIndicatorPreferencesReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!indicatorPreferencesReady) return;
    try {
      window.localStorage.setItem(
        INDICATOR_PREFERENCES_STORAGE_KEY,
        JSON.stringify({
          focusedIndicator,
          visibleIndicatorIds,
          favoriteIndicatorIds,
          settings: indicatorSettings,
        }),
      );
    } catch {
      // Indicator preferences remain available for the current page session.
    }
  }, [
    focusedIndicator,
    favoriteIndicatorIds,
    indicatorPreferencesReady,
    indicatorSettings,
    visibleIndicatorIds,
  ]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(
        SCREENING_PREFERENCES_STORAGE_KEY,
      );
      if (stored) {
        const parsed = JSON.parse(stored) as {
          mode?: unknown;
          ranges?: unknown;
        };
        if (
          typeof parsed.mode === "string" &&
          SCREENING_VALIDATION_MODES.includes(
            parsed.mode as ScreeningValidationMode,
          )
        ) {
          setScreeningValidationMode(parsed.mode as ScreeningValidationMode);
        }
        if (
          Array.isArray(parsed.ranges) &&
          parsed.ranges.length >= 2 &&
          parsed.ranges.every(
            (range) =>
              typeof range === "object" &&
              range !== null &&
              typeof (range as ScreeningDateWindow).startTime === "string" &&
              typeof (range as ScreeningDateWindow).endTime === "string",
          )
        ) {
          setScreeningMultiRanges(
            (parsed.ranges as ScreeningDateWindow[]).map((range) => ({
              ...range,
            })),
          );
        }
      }
    } catch {
      // Screening preferences remain at safe defaults when storage is blocked.
    } finally {
      setScreeningPreferencesReady(true);
    }
  }, []);

  useEffect(() => {
    if (!screeningPreferencesReady) return;
    try {
      window.localStorage.setItem(
        SCREENING_PREFERENCES_STORAGE_KEY,
        JSON.stringify({
          mode: screeningValidationMode,
          ranges: screeningMultiRanges,
        }),
      );
    } catch {
      // Screening preferences remain available for the current page session.
    }
  }, [
    screeningMultiRanges,
    screeningPreferencesReady,
    screeningValidationMode,
  ]);

  useEffect(() => {
    if (!series?.bars.length || screening) return;
    const instrumentKey = canonicalMarketInstrumentKey(series.instrument);
    const restoreKey = `${instrumentKey}:${researchInterval}`;
    if (screeningCacheRestoreKeyRef.current === restoreKey) return;
    screeningCacheRestoreKeyRef.current = restoreKey;
    let cancelled = false;
    void readLatestScreeningResult().then((cached) => {
      if (
        cancelled ||
        !cached ||
        cached.instrumentKey !== instrumentKey ||
        cached.interval !== researchInterval ||
        !Array.isArray(cached.singleResults) ||
        !Array.isArray(cached.combinationResults)
      ) {
        return;
      }
      setScreenResults(cached.singleResults);
      setCombinationResults(cached.combinationResults);
      setScreenResultsObjective(cached.objective);
      setValidationReport(cached.validationReport);
      setScreenProgress(cached.progress);
      setScreeningError("");
    });
    return () => {
      cancelled = true;
    };
  }, [researchInterval, screening, series]);

  useEffect(() => {
    screenProgressRef.current = screenProgress;
  }, [screenProgress]);

  const loadSavedBacktests = useCallback(
    async (signal?: AbortSignal) => {
      setSavedBacktestsLoading(true);
      setSavedBacktestsError(false);
      try {
        const response = await fetch("/api/saved-backtests", {
          signal,
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          savedBacktests?: SavedBacktestRecord[];
          savedBacktestFolders?: SavedBacktestFolder[];
        };
        if (!response.ok) throw new Error("PERSISTENCE_UNAVAILABLE");
        setSavedBacktests(payload.savedBacktests ?? []);
        setSavedBacktestFolders(payload.savedBacktestFolders ?? []);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setSavedBacktestsError(true);
        }
      } finally {
        if (!signal?.aborted) setSavedBacktestsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadSavedBacktests(controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadSavedBacktests]);

  const startShortcutRefreshCooldown = useCallback(() => {
    if (shortcutRefreshCooldownTimerRef.current !== null) {
      window.clearTimeout(shortcutRefreshCooldownTimerRef.current);
    }
    setShortcutRefreshCoolingDown(true);
    shortcutRefreshCooldownTimerRef.current = window.setTimeout(() => {
      shortcutRefreshCooldownTimerRef.current = null;
      setShortcutRefreshCoolingDown(false);
      setShortcutRefreshProgress(null);
    }, SHORTCUT_REFRESH_COOLDOWN_MS);
  }, []);

  const startSavedMarketRefresh = useCallback((refreshActive: boolean) => {
    if (
      refreshingSavedMarkets ||
      shortcutRefreshCoolingDown ||
      shortcutRefreshAbortRef.current !== null ||
      shortcutRefreshCooldownTimerRef.current !== null
    ) {
      return false;
    }
    if (refreshActive) {
      primaryBackoffRef.current = {
        instrumentKey: "",
        failures: 0,
        retryAfter: 0,
      };
      automaticRefreshBackoffRef.current = {
        failures: 0,
        retryAfter: 0,
      };
      setRefreshVersion((value) => value + 1);
    }
    const controller = new AbortController();
    shortcutRefreshAbortRef.current = controller;
    const activeKey = savedBacktestInstrumentKey(
      series?.instrument ?? instrument,
    );
    const instruments = new Map<string, MarketInstrument>();
    for (const saved of savedBacktests) {
      const key = savedBacktestInstrumentKey(saved.instrument);
      if (key !== activeKey && !instruments.has(key)) {
        instruments.set(key, saved.instrument);
      }
    }
    if (instruments.size === 0) {
      shortcutRefreshAbortRef.current = null;
      setRefreshingSavedMarkets(false);
      setShortcutRefreshProgress({
        completed: 0,
        total: 0,
        updated: 0,
        retained: 0,
      });
      startShortcutRefreshCooldown();
      return true;
    }
    setRefreshingSavedMarkets(true);
    setShortcutRefreshProgress({
      completed: 0,
      total: instruments.size,
      updated: 0,
      retained: 0,
    });
    void (async () => {
      for (const [key, savedInstrument] of instruments) {
        if (controller.signal.aborted) return;
        let updated = false;
        try {
          const result = await refreshShortcutMarketInstrument(
            savedInstrument,
            {
              signal: controller.signal,
              previousTemporaryQuote:
                refreshedShortcutMarketsRef.current.get(key)
                  ?.temporaryQuote ?? null,
            },
          );
          if (controller.signal.aborted) return;
          if (result) {
            updated = result.status !== "retained";
            refreshedShortcutMarketsRef.current = new Map(
              refreshedShortcutMarketsRef.current,
            ).set(key, result);
            setRefreshedShortcutMarkets(
              new Map(refreshedShortcutMarketsRef.current),
            );
          }
        } catch (error) {
          if ((error as Error).name === "AbortError") throw error;
        } finally {
          if (!controller.signal.aborted) {
            setShortcutRefreshProgress((current) => ({
              completed: (current?.completed ?? 0) + 1,
              total: current?.total ?? instruments.size,
              updated: (current?.updated ?? 0) + Number(updated),
              retained:
                (current?.retained ?? 0) + Number(!updated),
            }));
          }
        }
      }
    })()
      .catch((error) => {
        if ((error as Error).name !== "AbortError") {
          console.error("Shortcut market refresh failed", {
            message:
              error instanceof Error ? error.message : "Unknown error",
          });
        }
      })
      .finally(() => {
        if (shortcutRefreshAbortRef.current === controller) {
          shortcutRefreshAbortRef.current = null;
          setRefreshingSavedMarkets(false);
          startShortcutRefreshCooldown();
        }
      });
    return true;
  }, [
    instrument,
    refreshingSavedMarkets,
    savedBacktests,
    series,
    shortcutRefreshCoolingDown,
    startShortcutRefreshCooldown,
  ]);

  const requestImmediateMarketRefresh = useCallback(() => {
    if (researchInterval === INTRADAY_INTERVAL) {
      primaryBackoffRef.current = {
        instrumentKey: "",
        failures: 0,
        retryAfter: 0,
      };
      automaticRefreshBackoffRef.current = {
        failures: 0,
        retryAfter: 0,
      };
      setRefreshVersion((value) => value + 1);
      return;
    }
    startSavedMarketRefresh(true);
  }, [researchInterval, startSavedMarketRefresh]);

  useEffect(() => {
    if (
      shortcutRefreshRequestVersion === 0 ||
      shortcutRefreshRequestVersion <=
        handledShortcutRefreshRequestVersionRef.current
    ) {
      return;
    }
    if (startSavedMarketRefresh(false)) {
      handledShortcutRefreshRequestVersionRef.current =
        shortcutRefreshRequestVersion;
    }
  }, [shortcutRefreshRequestVersion, startSavedMarketRefresh]);

  const latest = series?.bars.at(-1);
  const previous = series?.bars.at(-2);
  const comparisonPrice =
    previous?.close ?? series?.previousClose ?? latest?.open ?? 0;
  const displayedPrice = temporaryQuote?.price ?? latest?.close;
  const priceChange =
    displayedPrice === undefined ? 0 : displayedPrice - comparisonPrice;
  const priceChangePercent =
    comparisonPrice === 0 ? 0 : (priceChange / comparisonPrice) * 100;
  const strategyPlan = useMemo<StrategyAllocationPlan | null>(() => {
    if (!strategyAId && !strategyBId && !strategyCId) return null;
    const selectedCount = [strategyAId, strategyBId, strategyCId].filter(
      Boolean,
    ).length;
    const rawAllocations = [
      strategyAId ? strategyAAllocationPercent : 0,
      strategyBId ? strategyBAllocationPercent : 0,
      strategyCId ? strategyCAllocationPercent : 0,
    ].map((allocation) => Math.min(Math.max(allocation / 100, 0), 1));
    const allocationTotal = rawAllocations.reduce(
      (sum, allocation) => sum + allocation,
      0,
    );
    const allocationFor = (index: number) =>
      selectedCount === 1
        ? rawAllocations[index] > 0
          ? 1
          : 0
        : allocationTotal > 0
          ? rawAllocations[index] / allocationTotal
          : 0;
    return {
      strategyA: strategyAId
        ? {
            strategyId: strategyAId,
            parameters: strategyAParameters,
          }
        : null,
      strategyB: strategyBId
        ? {
            strategyId: strategyBId,
            parameters: strategyBParameters,
          }
        : null,
      strategyC: strategyCId
        ? {
            strategyId: strategyCId,
            parameters: strategyCParameters,
          }
        : null,
      strategyAAllocation: allocationFor(0),
      strategyBAllocation: allocationFor(1),
      strategyCAllocation: allocationFor(2),
      tacticalMode: tacticalAllocationMode,
      strategyAEntryFilter: activeMovingAverageSlopeFilter(
        strategyAEntryFilterDraft,
      ),
      strategyBEntryFilter: activeMovingAverageSlopeFilter(
        strategyBEntryFilterDraft,
      ),
      strategyCEntryFilter: activeMovingAverageSlopeFilter(
        strategyCEntryFilterDraft,
      ),
    };
  }, [
    strategyAParameters,
    strategyAAllocationPercent,
    strategyAId,
    strategyBParameters,
    strategyBAllocationPercent,
    strategyBId,
    strategyCParameters,
    strategyCAllocationPercent,
    strategyCId,
    strategyAEntryFilterDraft,
    strategyBEntryFilterDraft,
    strategyCEntryFilterDraft,
    tacticalAllocationMode,
  ]);
  const singleSelection =
    strategyPlan &&
    [
      strategyPlan.strategyA,
      strategyPlan.strategyB,
      strategyPlan.strategyC ?? null,
    ].filter(Boolean).length === 1
      ? (strategyPlan.strategyA ??
        strategyPlan.strategyB ??
        strategyPlan.strategyC ??
        null)
      : null;
  const strategyPlanVolumeUnavailable = Boolean(
    strategyPlan && !reliableVolume && strategyPlanRequiresVolume(strategyPlan),
  );
  const usesSingleFullAllocation =
    Boolean(singleSelection) &&
    (strategyPlan?.strategyA
      ? strategyPlan.strategyAAllocation === 1
      : strategyPlan?.strategyB
        ? strategyPlan.strategyBAllocation === 1
        : strategyPlan?.strategyCAllocation === 1);
  const activeStrategyTimeline = useMemo(() => {
    if (
      !series?.bars.length ||
      !strategyPlan ||
      strategyPlanVolumeUnavailable
    ) {
      return null;
    }
    try {
      return buildStrategyPlanTimeline(series.bars, strategyPlan, {
        startTime: startDate || series.bars[0].time,
        endTime: endDate || series.bars.at(-1)!.time,
      });
    } catch {
      return null;
    }
  }, [
    endDate,
    series,
    startDate,
    strategyPlan,
    strategyPlanVolumeUnavailable,
  ]);
  const relativeLongStrategy = activeStrategyTimeline?.relativeLongStrategy;
  const appliedSelections = appliedStrategyPlan
    ? STRATEGY_SLOTS.flatMap((slot) => {
        const selection = appliedStrategyPlan[slot] ?? null;
        return selection ? [{ slot, selection }] : [];
      })
    : [];
  const appliedSingleLeg =
    appliedSelections.length === 1 ? appliedSelections[0] : null;
  const appliedSingleSelection = appliedSingleLeg?.selection ?? null;
  const appliedSingleSlot = appliedSingleLeg?.slot ?? null;
  const appliedUsesSingleFullAllocation =
    Boolean(appliedSingleSelection) &&
    Boolean(
      appliedStrategyPlan &&
        appliedSingleLeg &&
        appliedStrategyPlan[`${appliedSingleLeg.slot}Allocation`] === 1,
    );
  const appliedChartWindows = useMemo<ScreeningDateWindow[]>(() => {
    if (!series?.bars.length) return [];
    if (appliedChartRange.kind === "saved-recent") {
      const range = resolveTrailingTradingSessionRange(
        series.bars,
        SAVED_BACKTEST_ROLLING_SESSIONS,
      );
      return range
        ? [{ startTime: range.startTime, endTime: range.endTime }]
        : [];
    }
    const requestedWindows =
      appliedChartRange.kind === "screening"
        ? appliedChartRange.windows
        : [
            {
              startTime: startDate || series.bars[0].time,
              endTime: endDate || series.bars.at(-1)!.time,
            },
          ];
    return requestedWindows.flatMap((window) => {
      const range = resolveTradingSessionRange(
        series.bars,
        window.startTime,
        window.endTime,
      );
      return range
        ? [{ startTime: range.startTime, endTime: range.endTime }]
        : [];
    });
  }, [appliedChartRange, endDate, series, startDate]);
  const appliedChartFocusRange =
    appliedChartRange.kind === "screening"
      ? encompassingScreeningWindow(appliedChartWindows)
      : null;
  const primaryAppliedChartWindow = appliedChartWindows.at(-1) ?? null;
  const appliedStrategyPlanVolumeUnavailable = Boolean(
    appliedStrategyPlan &&
      !reliableVolume &&
      strategyPlanRequiresVolume(appliedStrategyPlan),
  );
  const appliedStrategyTimeline = useMemo(() => {
    if (
      !series?.bars.length ||
      !appliedStrategyPlan ||
      appliedStrategyPlanVolumeUnavailable
    ) {
      return null;
    }
    try {
      return buildStrategyPlanTimeline(series.bars, appliedStrategyPlan, {
        startTime:
          primaryAppliedChartWindow?.startTime ?? series.bars[0].time,
        endTime:
          primaryAppliedChartWindow?.endTime ?? series.bars.at(-1)!.time,
      });
    } catch {
      return null;
    }
  }, [
    appliedStrategyPlan,
    appliedStrategyPlanVolumeUnavailable,
    primaryAppliedChartWindow,
    series,
  ]);
  const appliedRelativeLongStrategy =
    appliedStrategyTimeline?.relativeLongStrategy;
  const liveGuidance = useMemo(() => {
    if (
      !series?.bars.length ||
      !appliedStrategyPlan ||
      appliedStrategyPlanVolumeUnavailable
    ) {
      return null;
    }
    try {
      const allocation = buildLiveAllocationGuidance(
        series.bars,
        appliedStrategyPlan,
        {
          startTime: startDate || series.bars[0].time,
          endTime: endDate || series.bars.at(-1)!.time,
        },
        series.latestBarStatus,
      );
      const exact =
        appliedUsesSingleFullAllocation && appliedSingleSelection
          ? buildLiveStrategyGuidance(
              series.bars,
              appliedSingleSelection.strategyId,
              appliedSingleSelection.parameters,
              series.latestBarStatus,
              strategyPlanEntryFilter(
                appliedStrategyPlan,
                appliedSingleSlot!,
              ),
            )
          : null;
      const orderPrices = STRATEGY_SLOTS.map((slot) => ({
        slot,
        selection: appliedStrategyPlan[slot] ?? null,
      })).flatMap((item) => {
        if (!item.selection) return [];
        const guidance = buildLiveStrategyGuidance(
          series.bars,
          item.selection.strategyId,
          item.selection.parameters,
          series.latestBarStatus,
          strategyPlanEntryFilter(
            appliedStrategyPlan,
            item.slot,
          ),
        );
        if (
          !guidance ||
          (guidance.executionMode !== "intrabar-order" &&
            guidance.pendingNextOpenAction === null) ||
          (guidance.todayEntryPrice === null &&
            guidance.todayExitPrice === null &&
            guidance.pendingNextOpenAction === null)
        ) {
          return [];
        }
        return [
          {
            slot: item.slot.slice(-1).toUpperCase(),
            entryPrice: guidance.todayEntryPrice,
            exitPrice: guidance.todayExitPrice,
            pendingNextOpenAction: guidance.pendingNextOpenAction,
            entryBlockedByFilter: guidance.entryBlockedByFilter,
          },
        ];
      });
      const exactAction = exact
        ? (exact.pendingNextOpenAction ?? exact.action)
        : ("wait" as const);
      const exactAllocation = exact
        ? {
            action:
              exactAction === "buy"
                ? ("increase" as const)
                : exactAction === "sell"
                  ? ("reduce" as const)
                  : exactAction,
            previousAllocation:
              exactAction === "buy" || exactAction === "wait" ? 0 : 1,
            targetAllocation:
              exactAction === "buy" || exactAction === "hold" ? 1 : 0,
          }
        : null;
      return allocation
        ? {
            ...(exactAllocation ?? allocation),
            barTime: exact?.barTime ?? series.bars.at(-1)?.time ?? "",
            executionMode:
              (exact?.pendingNextOpenAction
                ? ("next-open" as const)
                : exact?.executionMode) ??
              (orderPrices.length > 0
                ? ("hybrid-plan" as const)
                : "next-open"),
            triggerPrice: exact?.triggerPrice ?? null,
            orderPrices,
            entryBlockedByFilter: Boolean(
              exact?.entryBlockedByFilter ||
                orderPrices.some((order) => order.entryBlockedByFilter),
            ),
          }
        : null;
    } catch {
      return null;
    }
  }, [
    appliedSingleSelection,
    appliedSingleSlot,
    appliedStrategyPlan,
    appliedStrategyPlanVolumeUnavailable,
    appliedUsesSingleFullAllocation,
    endDate,
    series,
    startDate,
  ]);
  const lastUpdated = series?.fetchedAt
    ? updateTimeFormatter.format(new Date(series.fetchedAt))
    : copy.common.unavailable;
  const cachedPreviewTime =
    cachedPreviewAt === null
      ? null
      : cacheTimeFormatter.format(new Date(cachedPreviewAt));
  const sourceHealthSummary = sourceHealth
    .map((record) => {
      const quality = record.quality;
      const rolling = summarizeMarketSourceHealth(record);
      const rollingAvailability = (
        window: typeof rolling.sevenDays,
      ) =>
        window.availabilityPercent === null
          ? copy.common.unavailable
          : `${window.availabilityPercent.toFixed(1)}%`;
      const details = [
        `${copy.chart.availability7Days} ${rollingAvailability(
          rolling.sevenDays,
        )}`,
        `${copy.chart.availability30Days} ${rollingAvailability(
          rolling.thirtyDays,
        )}`,
        `${copy.chart.latency} ${Math.round(record.averageLatencyMs)} ms`,
      ];
      if (rolling.demotedAt) {
        details.push(copy.chart.temporarilyDemoted);
      }
      if (quality?.missingDatePercent !== null && quality) {
        details.push(
          `${copy.chart.dateGaps} ${quality.missingDatePercent.toFixed(2)}%`,
        );
      }
      if (quality?.meanCloseErrorPercent !== null && quality) {
        details.push(
          `${copy.chart.closeError} ${quality.meanCloseErrorPercent.toFixed(2)}%`,
        );
      }
      if (
        quality?.volumeCoveragePercent !== undefined &&
        quality.volumeCoveragePercent !== null
      ) {
        details.push(
          `${copy.marketStats.volume} ${quality.volumeCoveragePercent.toFixed(1)}%`,
        );
      }
      if (record.lastErrorCode) {
        const translatedError =
          copy.errors[
            record.lastErrorCode as keyof typeof copy.errors
          ] ?? record.lastErrorCode;
        details.push(
          `${copy.chart.lastSourceError} ${translatedError}`,
        );
      }
      return `${copy.sources[record.provider]}: ${details.join(" · ")}`;
    })
    .join("\n");
  const credentialIssueCount = sourceHealth.filter(
    (record) =>
      record.lastErrorCode === "PROVIDER_CREDENTIAL_INVALID",
  ).length;

  const backtest = useMemo<
    BacktestResult | AllocationBacktestResult | null
  >(() => {
    if (
      !series?.bars.length ||
      !startDate ||
      !endDate ||
      !strategyPlan ||
      strategyPlanVolumeUnavailable
    ) {
      return null;
    }
    try {
      const settings = {
        initialCash,
        commissionRate: commissionPercent / 100,
        slippageRate: slippagePercent / 100,
        startTime: startDate,
        endTime: endDate,
        interval: researchInterval,
        executionPolicy: HISTORICAL_EXECUTION_POLICY,
        entryFilter: strategyPlan.strategyA
          ? strategyPlanEntryFilter(strategyPlan, "strategyA")
          : strategyPlanEntryFilter(strategyPlan, "strategyB"),
      } as const;
      if (usesSingleFullAllocation && singleSelection) {
        return runBacktest(
          series.bars,
          singleSelection.strategyId,
          singleSelection.parameters,
          settings,
        );
      }
      const timeline =
        activeStrategyTimeline ??
        buildStrategyPlanTimeline(series.bars, strategyPlan, {
          startTime: startDate,
          endTime: endDate,
        });
      return runAllocationBacktest(
        series.bars,
        timeline.target,
        settings,
        timeline.signalEvents,
        timeline.intrabarExecutions,
      );
    } catch {
      return null;
    }
  }, [
    commissionPercent,
    endDate,
    initialCash,
    series,
    singleSelection,
    slippagePercent,
    startDate,
    activeStrategyTimeline,
    researchInterval,
    strategyPlan,
    strategyPlanVolumeUnavailable,
    usesSingleFullAllocation,
  ]);
  const appliedBacktests = useMemo<
    Array<BacktestResult | AllocationBacktestResult>
  >(() => {
    if (
      !series?.bars.length ||
      !appliedStrategyPlan ||
      appliedStrategyPlanVolumeUnavailable ||
      appliedChartWindows.length === 0
    ) {
      return [];
    }
    return appliedChartWindows.flatMap((window) => {
      try {
        return [
          runStrategyPlanRangeBacktest(
            series.bars,
            appliedStrategyPlan,
            {
              initialCash,
              commissionRate: commissionPercent / 100,
              slippageRate: slippagePercent / 100,
              startTime: window.startTime,
              endTime: window.endTime,
              interval: researchInterval,
              executionPolicy: HISTORICAL_EXECUTION_POLICY,
              entryFilter: appliedStrategyPlan.strategyA
                ? strategyPlanEntryFilter(
                    appliedStrategyPlan,
                    "strategyA",
                  )
                : strategyPlanEntryFilter(
                    appliedStrategyPlan,
                    "strategyB",
                  ),
            },
          ),
        ];
      } catch {
        return [];
      }
    });
  }, [
    appliedChartWindows,
    appliedStrategyPlan,
    appliedStrategyPlanVolumeUnavailable,
    commissionPercent,
    initialCash,
    researchInterval,
    series,
    slippagePercent,
  ]);
  const appliedBacktest = appliedBacktests.at(-1) ?? null;
  const savedShortcutRange = useMemo(() => {
    if (!series?.bars.length) return null;
    return resolveTrailingTradingSessionRange(
      series.bars,
      SAVED_BACKTEST_ROLLING_SESSIONS,
    );
  }, [series]);
  const savedShortcutBacktest = useMemo<
    BacktestResult | AllocationBacktestResult | null
  >(() => {
    if (
      !series?.bars.length ||
      !savedShortcutRange ||
      !appliedStrategyPlan ||
      appliedStrategyPlanVolumeUnavailable
    ) {
      return null;
    }
    try {
      return runStrategyPlanRangeBacktest(
        series.bars,
        appliedStrategyPlan,
        {
          initialCash,
          commissionRate: commissionPercent / 100,
          slippageRate: slippagePercent / 100,
          startTime: savedShortcutRange.startTime,
          endTime: savedShortcutRange.endTime,
          interval: researchInterval,
          executionPolicy: HISTORICAL_EXECUTION_POLICY,
          entryFilter: appliedStrategyPlan.strategyA
            ? strategyPlanEntryFilter(appliedStrategyPlan, "strategyA")
            : strategyPlanEntryFilter(appliedStrategyPlan, "strategyB"),
        },
      );
    } catch {
      return null;
    }
  }, [
    appliedStrategyPlan,
    appliedStrategyPlanVolumeUnavailable,
    commissionPercent,
    initialCash,
    researchInterval,
    savedShortcutRange,
    series,
    slippagePercent,
  ]);

  const stability = useMemo(() => {
    if (
      !series?.bars.length ||
      !startDate ||
      !endDate ||
      !strategyPlan ||
      strategyPlanVolumeUnavailable ||
      !singleSelection ||
      !usesSingleFullAllocation
    ) {
      return null;
    }
    try {
      const analysis = analyzeStrategyStability(
        series.bars,
        singleSelection.strategyId,
        singleSelection.parameters,
        {
          initialCash,
          commissionRate: commissionPercent / 100,
          slippageRate: slippagePercent / 100,
          startTime: startDate,
          endTime: endDate,
          interval: researchInterval,
          executionPolicy: HISTORICAL_EXECUTION_POLICY,
          entryFilter: strategyPlan.strategyA
            ? strategyPlanEntryFilter(strategyPlan, "strategyA")
            : strategyPlanEntryFilter(strategyPlan, "strategyB"),
        },
      );
      return analysis;
    } catch {
      return null;
    }
  }, [
    commissionPercent,
    endDate,
    initialCash,
    researchInterval,
    series,
    singleSelection,
    slippagePercent,
    startDate,
    strategyPlan,
    strategyPlanVolumeUnavailable,
    usesSingleFullAllocation,
  ]);
  const stabilityNearby = stability?.nearby ?? null;
  const stabilityState = !stability
    ? "unavailable"
    : !stability.evidence.sufficient
      ? "insufficient"
      : stabilityNearby?.stable
        ? "stable"
        : "sensitive";
  const strategyConfigurations = useMemo<
    readonly ChartStrategyConfiguration[]
  >(
    () =>
      appliedStrategyPlan && !appliedStrategyPlanVolumeUnavailable
        ? STRATEGY_SLOTS.flatMap((slot) => {
            const selection = appliedStrategyPlan[slot] ?? null;
            return (
            selection
              ? [
                  {
                    id: selection.strategyId,
                    parameters: selection.parameters,
                    lineLabels: chartStrategyLineLabels(
                      selection.strategyId,
                      appliedRelativeLongStrategy === slot
                        ? "long"
                        : "short",
                    ),
                  },
                ]
              : []
            );
          })
        : [],
    [
      appliedRelativeLongStrategy,
      appliedStrategyPlan,
      appliedStrategyPlanVolumeUnavailable,
    ],
  );
  const appliedTradeMarkers = useMemo<TradeMarkers | undefined>(() => {
    if (appliedBacktests.length === 0) return undefined;
    return appliedBacktests.reduce<TradeMarkers>(
      (combined, result) => {
        const markers =
          "rebalances" in result
            ? buildAllocationTradeMarkers(
                result.rebalances,
                result.openingPosition,
              )
            : buildTradeMarkers(result.trades, result.openPosition);
        combined.buys.push(...markers.buys);
        combined.sells.push(...markers.sells);
        combined.rangeExits.push(...markers.rangeExits);
        return combined;
      },
      { buys: [], sells: [], rangeExits: [] },
    );
  }, [appliedBacktests]);

  const scrollToStrategyChart = () => {
    window.requestAnimationFrame(() =>
      chartSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }),
    );
  };

  const applyCurrentStrategyToChart = () => {
    setAppliedChartRange({ kind: "workspace" });
    setAppliedStrategyPlan(cloneStrategyPlan(strategyPlan));
    scrollToStrategyChart();
  };

  const applySingleStrategy = (
    nextStrategyId: StrategyId,
    nextParameters?: StrategyParameters,
    entryFilter?: MovingAverageSlopeFilter | null,
    screeningWindows?: ScreeningDateWindow[],
    shouldScrollToChart = true,
  ) => {
    const next = getStrategy(nextStrategyId);
    const mergedParameters = {
      ...next.defaultParameters,
      ...nextParameters,
    };
    setStrategyAId(nextStrategyId);
    setStrategyAParameters(mergedParameters);
    setStrategyBId("");
    setStrategyBParameters({});
    setStrategyCId("");
    setStrategyCParameters({});
    setStrategyAAllocationPercent(100);
    setStrategyBAllocationPercent(0);
    setStrategyCAllocationPercent(0);
    setTacticalAllocationMode(DEFAULT_TACTICAL_ALLOCATION_MODE);
    setStrategyAEntryFilterDraft(
      createMovingAverageSlopeFilterDraft(entryFilter),
    );
    setStrategyBEntryFilterDraft(
      createMovingAverageSlopeFilterDraft(),
    );
    setStrategyCEntryFilterDraft(
      createMovingAverageSlopeFilterDraft(),
    );
    setAppliedStrategyPlan({
      strategyA: {
        strategyId: nextStrategyId,
        parameters: { ...mergedParameters },
      },
      strategyB: null,
      strategyC: null,
      strategyAAllocation: 1,
      strategyBAllocation: 0,
      strategyCAllocation: 0,
      tacticalMode: DEFAULT_TACTICAL_ALLOCATION_MODE,
      strategyAEntryFilter: cloneMovingAverageSlopeFilter(entryFilter),
      strategyBEntryFilter: null,
      strategyCEntryFilter: null,
    });
    setAppliedChartRange(
      screeningWindows?.length
        ? { kind: "screening", windows: screeningWindows }
        : { kind: "workspace" },
    );
    if (shouldScrollToChart) scrollToStrategyChart();
  };

  const selectStrategyA = (nextStrategyId: StrategyId | "") => {
    if (
      nextStrategyId &&
      [strategyBId, strategyCId].some(
        (strategyId) =>
          strategyId && areStrategiesEquivalent(nextStrategyId, strategyId),
      )
    ) {
      return;
    }
    setStrategyAId(nextStrategyId);
    setStrategyAParameters(
      nextStrategyId
        ? { ...getStrategy(nextStrategyId).defaultParameters }
        : {},
    );
    if (!nextStrategyId) {
      setStrategyAAllocationPercent(0);
      if (strategyBId && strategyCId) {
        setStrategyBAllocationPercent(60);
        setStrategyCAllocationPercent(40);
      } else if (strategyBId) {
        setStrategyBAllocationPercent(100);
      } else if (strategyCId) {
        setStrategyCAllocationPercent(100);
      }
    } else if (strategyBId && strategyCId) {
      setStrategyAAllocationPercent(40);
      setStrategyBAllocationPercent(30);
      setStrategyCAllocationPercent(30);
    } else if (strategyBId) {
      const nextAllocation = nearestDualAllocation(
        strategyAAllocationPercent,
        strategyBAllocationPercent,
      );
      setStrategyAAllocationPercent(nextAllocation.strategyA);
      setStrategyBAllocationPercent(nextAllocation.strategyB);
    } else if (strategyCId) {
      setStrategyAAllocationPercent(60);
      setStrategyCAllocationPercent(40);
    } else {
      setStrategyAAllocationPercent(100);
    }
  };

  const selectStrategyB = (nextStrategyId: StrategyId | "") => {
    if (
      nextStrategyId &&
      [strategyAId, strategyCId].some(
        (strategyId) =>
          strategyId && areStrategiesEquivalent(nextStrategyId, strategyId),
      )
    ) {
      return;
    }
    setStrategyBId(nextStrategyId);
    setStrategyBParameters(
      nextStrategyId
        ? { ...getStrategy(nextStrategyId).defaultParameters }
        : {},
    );
    if (!nextStrategyId) {
      setStrategyBAllocationPercent(0);
      if (strategyAId && strategyCId) {
        setStrategyAAllocationPercent(60);
        setStrategyCAllocationPercent(40);
      } else if (strategyAId) {
        setStrategyAAllocationPercent(100);
      } else if (strategyCId) {
        setStrategyCAllocationPercent(100);
      }
    } else if (strategyAId && strategyCId) {
      setStrategyAAllocationPercent(40);
      setStrategyBAllocationPercent(30);
      setStrategyCAllocationPercent(30);
    } else if (strategyAId) {
      const nextAllocation = nearestDualAllocation(
        strategyAAllocationPercent,
        strategyBAllocationPercent ||
          DEFAULT_STRATEGY_B_ALLOCATION * 100,
      );
      setStrategyAAllocationPercent(nextAllocation.strategyA);
      setStrategyBAllocationPercent(nextAllocation.strategyB);
    } else if (strategyCId) {
      setStrategyBAllocationPercent(60);
      setStrategyCAllocationPercent(40);
    } else {
      setStrategyBAllocationPercent(100);
    }
  };

  const selectStrategyC = (nextStrategyId: StrategyId | "") => {
    if (
      nextStrategyId &&
      [strategyAId, strategyBId].some(
        (strategyId) =>
          strategyId && areStrategiesEquivalent(nextStrategyId, strategyId),
      )
    ) {
      return;
    }
    setStrategyCId(nextStrategyId);
    setStrategyCParameters(
      nextStrategyId
        ? { ...getStrategy(nextStrategyId).defaultParameters }
        : {},
    );
    if (!nextStrategyId) {
      setStrategyCAllocationPercent(0);
      if (strategyAId && strategyBId) {
        const nextAllocation = nearestDualAllocation(
          strategyAAllocationPercent,
          strategyBAllocationPercent,
        );
        setStrategyAAllocationPercent(nextAllocation.strategyA);
        setStrategyBAllocationPercent(nextAllocation.strategyB);
      } else if (strategyAId) {
        setStrategyAAllocationPercent(100);
      } else if (strategyBId) {
        setStrategyBAllocationPercent(100);
      }
    } else if (strategyAId && strategyBId) {
      setStrategyAAllocationPercent(40);
      setStrategyBAllocationPercent(30);
      setStrategyCAllocationPercent(30);
    } else if (strategyAId || strategyBId) {
      const nextAllocation = nearestDualAllocation(
        strategyAId ? strategyAAllocationPercent : 40,
        strategyBId ? strategyBAllocationPercent : 40,
      );
      if (strategyAId) {
        setStrategyAAllocationPercent(nextAllocation.strategyA);
        setStrategyCAllocationPercent(nextAllocation.strategyB);
      } else {
        setStrategyBAllocationPercent(nextAllocation.strategyA);
        setStrategyCAllocationPercent(nextAllocation.strategyB);
      }
    } else {
      setStrategyCAllocationPercent(100);
    }
  };

  const selectTripleAllocation = (
    slot: StrategySlot,
    nextAllocation: number,
  ) => {
    const current = {
      strategyA: strategyAAllocationPercent,
      strategyB: strategyBAllocationPercent,
      strategyC: strategyCAllocationPercent,
    };
    const otherSlots = (
      ["strategyA", "strategyB", "strategyC"] as const
    ).filter((candidate) => candidate !== slot);
    const remaining = 100 - nextAllocation;
    const firstOther = Math.min(
      Math.max(Math.round(current[otherSlots[0]] / 10) * 10, 10),
      remaining - 10,
    );
    const next = {
      ...current,
      [slot]: nextAllocation,
      [otherSlots[0]]: firstOther,
      [otherSlots[1]]: remaining - firstOther,
    };
    setStrategyAAllocationPercent(next.strategyA);
    setStrategyBAllocationPercent(next.strategyB);
    setStrategyCAllocationPercent(next.strategyC);
  };

  const selectStrategyAAllocation = (nextStrategyAAllocation: number) => {
    if (strategyAId && strategyBId && strategyCId) {
      selectTripleAllocation("strategyA", nextStrategyAAllocation);
      return;
    }
    if (!strategyBId && strategyCId) {
      setStrategyAAllocationPercent(nextStrategyAAllocation);
      setStrategyCAllocationPercent(100 - nextStrategyAAllocation);
      return;
    }
    if (!strategyBId) {
      setStrategyAAllocationPercent(100);
      return;
    }
    const compatible = DUAL_ALLOCATION_OPTIONS.filter(
      (option) => option.strategyA === nextStrategyAAllocation,
    );
    const nextAllocation = compatible.reduce((nearest, option) =>
      Math.abs(option.strategyB - strategyBAllocationPercent) <
      Math.abs(nearest.strategyB - strategyBAllocationPercent)
        ? option
        : nearest,
    );
    setStrategyAAllocationPercent(nextAllocation.strategyA);
    setStrategyBAllocationPercent(nextAllocation.strategyB);
  };

  const selectStrategyBAllocation = (nextStrategyBAllocation: number) => {
    if (strategyAId && strategyBId && strategyCId) {
      selectTripleAllocation("strategyB", nextStrategyBAllocation);
      return;
    }
    if (!strategyAId && strategyCId) {
      setStrategyBAllocationPercent(nextStrategyBAllocation);
      setStrategyCAllocationPercent(100 - nextStrategyBAllocation);
      return;
    }
    if (!strategyAId) {
      setStrategyBAllocationPercent(100);
      return;
    }
    const compatible = DUAL_ALLOCATION_OPTIONS.filter(
      (option) => option.strategyB === nextStrategyBAllocation,
    );
    const nextAllocation = compatible.reduce((nearest, option) =>
      Math.abs(option.strategyA - strategyAAllocationPercent) <
      Math.abs(nearest.strategyA - strategyAAllocationPercent)
        ? option
        : nearest,
    );
    setStrategyAAllocationPercent(nextAllocation.strategyA);
    setStrategyBAllocationPercent(nextAllocation.strategyB);
  };

  const applyCombinationResult = (
    result: StrategyCombinationResult,
    screeningWindows?: ScreeningDateWindow[],
    shouldScrollToChart = true,
  ) => {
    setStrategyAId(result.strategyAId);
    setStrategyAParameters({ ...result.strategyAParameters });
    setStrategyBId(result.strategyBId);
    setStrategyBParameters({ ...result.strategyBParameters });
    setStrategyCId(result.strategyCId ?? "");
    setStrategyCParameters({ ...(result.strategyCParameters ?? {}) });
    setStrategyAAllocationPercent(
      Math.round(result.strategyAAllocation * 100),
    );
    setStrategyBAllocationPercent(
      Math.round(result.strategyBAllocation * 100),
    );
    setStrategyCAllocationPercent(
      Math.round((result.strategyCAllocation ?? 0) * 100),
    );
    setTacticalAllocationMode(
      resolveTacticalAllocationMode(result.tacticalMode),
    );
    setStrategyAEntryFilterDraft(
      createMovingAverageSlopeFilterDraft(
        result.strategyAEntryFilter,
      ),
    );
    setStrategyBEntryFilterDraft(
      createMovingAverageSlopeFilterDraft(
        result.strategyBEntryFilter,
      ),
    );
    setStrategyCEntryFilterDraft(
      createMovingAverageSlopeFilterDraft(result.strategyCEntryFilter),
    );
    setAppliedStrategyPlan(combinationResultPlan(result));
    setAppliedChartRange(
      screeningWindows?.length
        ? { kind: "screening", windows: screeningWindows }
        : { kind: "workspace" },
    );
    if (shouldScrollToChart) scrollToStrategyChart();
  };

  const selectStrategyCAllocation = (nextStrategyCAllocation: number) => {
    if (strategyAId && strategyBId && strategyCId) {
      selectTripleAllocation("strategyC", nextStrategyCAllocation);
      return;
    }
    if (!strategyAId && !strategyBId) {
      setStrategyCAllocationPercent(100);
      return;
    }
    const companionIsA = Boolean(strategyAId);
    const nextAllocation = nearestDualAllocation(
      companionIsA
        ? strategyAAllocationPercent
        : strategyBAllocationPercent,
      nextStrategyCAllocation,
    );
    if (companionIsA) {
      setStrategyAAllocationPercent(nextAllocation.strategyA);
    } else {
      setStrategyBAllocationPercent(nextAllocation.strategyA);
    }
    setStrategyCAllocationPercent(nextAllocation.strategyB);
  };

  const applyShortlistEntry = (entry: StrategyShortlistEntry) => {
    if (entry.kind === "single") {
      applySingleStrategy(
        entry.result.strategyId,
        entry.result.parameters,
        entry.result.entryFilter,
        resolveScreeningResultChartWindows(
          entry.result,
          validationReport,
        ),
      );
      return;
    }
    applyCombinationResult(
      entry.result,
      resolveScreeningResultChartWindows(
        entry.result,
        validationReport,
      ),
    );
  };

  const toggleIndicator = (nextIndicator: IndicatorId) => {
    setFocusedIndicator(nextIndicator);
    if (!reliableVolume && indicatorRequiresVolume(nextIndicator)) return;
    setVisibleIndicatorIds((current) =>
      current.includes(nextIndicator)
        ? current.filter((id) => id !== nextIndicator)
        : [...current, nextIndicator],
    );
  };

  const toggleFocusedIndicator = () => {
    if (focusedIndicatorVolumeUnavailable) return;
    setVisibleIndicatorIds((current) =>
      current.includes(focusedIndicator)
        ? current.filter((id) => id !== focusedIndicator)
        : [...current, focusedIndicator],
    );
  };

  const updateIndicatorParameter = (key: string, value: number) => {
    const definition = activeIndicator.parameters.find(
      (parameter) => parameter.key === key,
    );
    if (!definition) return;

    const finiteValue = Number.isFinite(value)
      ? value
      : definition.minimum;
    const steppedValue =
      definition.step === 1 ? Math.round(finiteValue) : finiteValue;
    const nextValue = Math.max(steppedValue, definition.minimum);

    setIndicatorSettings((current) => ({
      ...current,
      [focusedIndicator]: {
        ...current[focusedIndicator],
        [key]: nextValue,
      },
    }));
  };

  const resetIndicator = () => {
    setIndicatorSettings((current) => ({
      ...current,
      [focusedIndicator]: getDefaultIndicatorParameters(focusedIndicator),
    }));
  };

  const saveCurrentBacktest = async () => {
    if (!savedShortcutBacktest || !savedShortcutRange || !appliedStrategyPlan) {
      return;
    }
    setSaveStatus("saving");
    try {
      const response = await fetch("/api/saved-backtests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          createSaveBacktestInput(
            series?.instrument ?? instrument,
            researchInterval,
            appliedStrategyPlan,
            datePart(savedShortcutRange.startTime),
            datePart(savedShortcutRange.endTime),
            initialCash,
            commissionPercent,
            slippagePercent,
            savedShortcutBacktest,
            visibleIndicators,
          ),
        ),
      });
      const payload = (await response.json()) as {
        savedBacktest?: SavedBacktestRecord;
        replaced?: boolean;
      };
      if (!response.ok || !payload.savedBacktest) {
        throw new Error("PERSISTENCE_UNAVAILABLE");
      }
      const savedBacktest = payload.savedBacktest;
      setSavedBacktests((current) => {
        const existingIndex = current.findIndex(
          (record) => record.id === savedBacktest.id,
        );
        if (payload.replaced && existingIndex >= 0) {
          return current.map((record, index) =>
            index === existingIndex ? savedBacktest : record,
          );
        }
        return [
          savedBacktest,
          ...current.filter((record) => record.id !== savedBacktest.id),
        ].slice(0, MAX_SAVED_BACKTEST_SCROLL_RECORDS);
      });
      const savedGroupKey = savedBacktestInstrumentKey(
        savedBacktest.instrument,
      );
      setExpandedSavedBacktestGroups((current) =>
        current.includes(savedGroupKey)
          ? current
          : [...current, savedGroupKey],
      );
      setSavedBacktestsError(false);
      setSaveStatus("saved");
      window.setTimeout(() => setSaveStatus("idle"), 1600);
    } catch {
      setSaveStatus("error");
    }
  };

  const clearScreeningPresentationForInstrumentChange = () => {
    setScreeningError("");
    setScreenResults([]);
    setCombinationResults([]);
    setValidationReport(null);
    if (!screeningAbortRef.current) {
      setValidationProgress(null);
      setScreenEngineStatus(null);
      setScreenProgress(emptyCombinationProgress());
    }
  };

  const captureIntervalResearchSnapshot = (): IntervalResearchSnapshot => ({
    strategyAId,
    strategyAParameters: { ...strategyAParameters },
    strategyBId,
    strategyBParameters: { ...strategyBParameters },
    strategyCId,
    strategyCParameters: { ...strategyCParameters },
    strategyAEntryFilterDraft: { ...strategyAEntryFilterDraft },
    strategyBEntryFilterDraft: { ...strategyBEntryFilterDraft },
    strategyCEntryFilterDraft: { ...strategyCEntryFilterDraft },
    appliedStrategyPlan: cloneStrategyPlan(appliedStrategyPlan),
    appliedChartRange:
      appliedChartRange.kind === "screening"
        ? {
            kind: "screening",
            windows: appliedChartRange.windows.map((window) => ({ ...window })),
          }
        : { ...appliedChartRange },
    strategyAAllocationPercent,
    strategyBAllocationPercent,
    strategyCAllocationPercent,
    tacticalAllocationMode,
    screeningObjective,
    screenResultsObjective,
    screeningValidationMode,
    screeningEntryFilterDraft: { ...screeningEntryFilterDraft },
    sampleValidationPeriods: sampleValidationPeriods.map((period) => ({
      ...period,
    })),
    screeningCustomRange: { ...screeningCustomRange },
    screeningMultiRanges: screeningMultiRanges.map((range) => ({ ...range })),
    rollingWindowYears,
    screenResults: [...screenResults],
    combinationResults: [...combinationResults],
    validationReport,
    screenProgress: { ...screenProgress },
  });

  const restoreIntervalResearchSnapshot = (
    snapshot: IntervalResearchSnapshot,
  ) => {
    setStrategyAId(snapshot.strategyAId);
    setStrategyAParameters({ ...snapshot.strategyAParameters });
    setStrategyBId(snapshot.strategyBId);
    setStrategyBParameters({ ...snapshot.strategyBParameters });
    setStrategyCId(snapshot.strategyCId);
    setStrategyCParameters({ ...snapshot.strategyCParameters });
    setStrategyAEntryFilterDraft({ ...snapshot.strategyAEntryFilterDraft });
    setStrategyBEntryFilterDraft({ ...snapshot.strategyBEntryFilterDraft });
    setStrategyCEntryFilterDraft({ ...snapshot.strategyCEntryFilterDraft });
    setAppliedStrategyPlan(cloneStrategyPlan(snapshot.appliedStrategyPlan));
    setAppliedChartRange(
      snapshot.appliedChartRange.kind === "screening"
        ? {
            kind: "screening",
            windows: snapshot.appliedChartRange.windows.map((window) => ({
              ...window,
            })),
          }
        : { ...snapshot.appliedChartRange },
    );
    setStrategyAAllocationPercent(snapshot.strategyAAllocationPercent);
    setStrategyBAllocationPercent(snapshot.strategyBAllocationPercent);
    setStrategyCAllocationPercent(snapshot.strategyCAllocationPercent);
    setTacticalAllocationMode(snapshot.tacticalAllocationMode);
    setScreeningObjective(snapshot.screeningObjective);
    setScreenResultsObjective(snapshot.screenResultsObjective);
    setScreeningValidationMode(snapshot.screeningValidationMode);
    setScreeningEntryFilterDraft({ ...snapshot.screeningEntryFilterDraft });
    setSampleValidationPeriods(
      snapshot.sampleValidationPeriods.map((period) => ({ ...period })),
    );
    setScreeningCustomRange({ ...snapshot.screeningCustomRange });
    setScreeningMultiRanges(
      snapshot.screeningMultiRanges.map((range) => ({ ...range })),
    );
    setRollingWindowYears(snapshot.rollingWindowYears);
    setScreenResults([...snapshot.screenResults]);
    setCombinationResults([...snapshot.combinationResults]);
    setValidationReport(snapshot.validationReport);
    setScreenProgress({ ...snapshot.screenProgress });
    setScreeningError("");
    setValidationProgress(null);
    setScreenEngineStatus(null);
  };

  const clearMarketSeries = () => {
    marketSeriesRef.current = null;
    canonicalSeriesRef.current = null;
    cachedSeriesActiveRef.current = false;
    currentSeriesKeyRef.current = "";
    latestSeriesDateRef.current = "";
    lastMarketRefreshAttemptAtRef.current = 0;
    automaticRefreshBackoffRef.current = {
      failures: 0,
      retryAfter: 0,
    };
    setSeries(null);
    setCachedPreviewAt(null);
    applyTemporaryQuote(null);
    setSourceHealth([]);
    setErrorCode("");
    setLoading(true);
  };

  const toggleIndicatorFavorite = (indicatorId: IndicatorId) => {
    setFavoriteIndicatorIds((current) =>
      current.includes(indicatorId)
        ? current.filter((id) => id !== indicatorId)
        : [...current, indicatorId],
    );
  };

  const renderIndicatorControl = (
    item: (typeof INDICATORS)[number],
    keyPrefix: string,
    closeMenuOnSelect = false,
  ) => {
    const focused = focusedIndicator === item.id;
    const volumeUnavailable =
      indicatorRequiresVolume(item.id) && !reliableVolume;
    const visible = effectiveVisibleIndicatorIds.includes(item.id);
    const accessibleLabel = `${copy.indicators[item.id].name} ${copy.common.separator} ${
      volumeUnavailable
        ? copy.indicatorSettings.volumeUnavailable
        : visible
          ? copy.indicatorSettings.visible
          : copy.indicatorSettings.hidden
    }`;
    return (
      <button
        type="button"
        id={`indicator-tab-${keyPrefix}-${item.id}`}
        aria-controls="indicator-settings-panel"
        aria-pressed={visible}
        aria-current={focused ? "true" : undefined}
        aria-label={accessibleLabel}
        disabled={volumeUnavailable}
        key={`${keyPrefix}-${item.id}`}
        className={`${focused ? "focused" : ""} ${
          visible ? "visible" : ""
        }`.trim()}
        onClick={() => {
          toggleIndicator(item.id);
          if (closeMenuOnSelect) setOpenIndicatorCategory(null);
        }}
        title={accessibleLabel}
      >
        {copy.indicators[item.id].short}
      </button>
    );
  };

  const renderIndicatorMenuItem = (
    item: (typeof INDICATORS)[number],
    category: IndicatorCategoryId,
  ) => {
    const favorite = favoriteIndicatorIds.includes(item.id);
    const favoriteLabel = `${
      favorite
        ? copy.indicatorSettings.removeFavorite
        : copy.indicatorSettings.addFavorite
    } ${copy.indicators[item.id].name}`;

    return (
      <div
        className="indicator-category-item"
        key={`${category}-${item.id}`}
      >
        {renderIndicatorControl(item, category, true)}
        <button
          id={`indicator-favorite-${category}-${item.id}`}
          className={`indicator-item-favorite ${favorite ? "favorite" : ""}`}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            toggleIndicatorFavorite(item.id);
          }}
          aria-pressed={favorite}
          aria-label={favoriteLabel}
          title={favoriteLabel}
        >
          <Star
            size={13}
            fill={favorite ? "currentColor" : "none"}
            aria-hidden="true"
          />
        </button>
      </div>
    );
  };

  const openSavedBacktest = (saved: SavedBacktestRecord) => {
    const savedWorkspaceInterval = DAILY_INTERVAL;
    const restoredStrategyB =
      saved.plan.strategyA &&
      saved.plan.strategyB &&
      areStrategiesEquivalent(
        saved.plan.strategyA.strategyId,
        saved.plan.strategyB.strategyId,
      )
        ? null
        : saved.plan.strategyB;
    const restoredStrategyC =
      saved.plan.strategyC &&
      [saved.plan.strategyA, restoredStrategyB].some(
        (selection) =>
          selection &&
          areStrategiesEquivalent(
            saved.plan.strategyC!.strategyId,
            selection.strategyId,
          ),
      )
        ? null
        : (saved.plan.strategyC ?? null);
    const sameCanonicalInstrument =
      savedBacktestInstrumentKey(saved.instrument) ===
      savedBacktestInstrumentKey(series?.instrument ?? instrument);
    const reusesCurrentSeries = canReuseSavedBacktestMarketSeries(
      saved.instrument,
      series?.instrument ?? instrument,
      series,
      savedWorkspaceInterval,
    );
    if (
      !sameCanonicalInstrument ||
      !reusesCurrentSeries ||
      researchInterval !== savedWorkspaceInterval
    ) {
      clearScreeningPresentationForInstrumentChange();
    }
    if (!sameCanonicalInstrument) {
      visibleInstrumentKeyRef.current = savedBacktestInstrumentKey(
        saved.instrument,
      );
      clearMarketSeries();
      setInstrument(saved.instrument);
    } else if (!reusesCurrentSeries) {
      clearMarketSeries();
      setRefreshVersion((value) => value + 1);
    }
    setStrategyAId(saved.plan.strategyA?.strategyId ?? "");
    setStrategyAParameters(
      saved.plan.strategyA ? { ...saved.plan.strategyA.parameters } : {},
    );
    setStrategyBId(restoredStrategyB?.strategyId ?? "");
    setStrategyBParameters(
      restoredStrategyB ? { ...restoredStrategyB.parameters } : {},
    );
    setStrategyCId(restoredStrategyC?.strategyId ?? "");
    setStrategyCParameters(
      restoredStrategyC ? { ...restoredStrategyC.parameters } : {},
    );
    setStrategyAEntryFilterDraft(
      createMovingAverageSlopeFilterDraft(
        strategyPlanEntryFilter(saved.plan, "strategyA"),
      ),
    );
    setStrategyBEntryFilterDraft(
      createMovingAverageSlopeFilterDraft(
        strategyPlanEntryFilter(saved.plan, "strategyB"),
      ),
    );
    setStrategyCEntryFilterDraft(
      createMovingAverageSlopeFilterDraft(
        strategyPlanEntryFilter(saved.plan, "strategyC"),
      ),
    );
    setTacticalAllocationMode(
      resolveTacticalAllocationMode(saved.plan.tacticalMode),
    );
    const savedStrategyAAllocation = Math.round(
      saved.plan.strategyAAllocation * 100,
    );
    const savedStrategyBAllocation = Math.round(
      saved.plan.strategyBAllocation * 100,
    );
    const savedStrategyCAllocation = Math.round(
      (saved.plan.strategyCAllocation ?? 0) * 100,
    );
    const selectedCount = [
      saved.plan.strategyA,
      restoredStrategyB,
      restoredStrategyC,
    ].filter(Boolean).length;
    const restoredStrategyAAllocation = saved.plan.strategyA
      ? selectedCount === 1
        ? 100
        : savedStrategyAAllocation
      : 0;
    const restoredStrategyBAllocation = restoredStrategyB
      ? selectedCount === 1
        ? 100
        : savedStrategyBAllocation
      : 0;
    const restoredStrategyCAllocation = restoredStrategyC
      ? selectedCount === 1
        ? 100
        : savedStrategyCAllocation
      : 0;
    setStrategyAAllocationPercent(restoredStrategyAAllocation);
    setStrategyBAllocationPercent(restoredStrategyBAllocation);
    setStrategyCAllocationPercent(restoredStrategyCAllocation);
    setAppliedStrategyPlan({
      ...cloneStrategyPlan(saved.plan)!,
      strategyAAllocation: restoredStrategyAAllocation / 100,
      strategyBAllocation: restoredStrategyBAllocation / 100,
      strategyCAllocation: restoredStrategyCAllocation / 100,
    });
    setAppliedChartRange({ kind: "saved-recent" });
    setInitialCash(saved.initialCash);
    setCommissionPercent(saved.commissionPercent);
    setSlippagePercent(saved.slippagePercent);
  };

  const openSavedBacktestGroup = (
    group: (typeof savedBacktestGroups)[number],
  ) => {
    const activeInstrument = series?.instrument ?? instrument;
    const sameCanonicalInstrument =
      savedBacktestInstrumentKey(group.instrument) ===
      savedBacktestInstrumentKey(activeInstrument);
    const reusesCurrentSeries = canReuseSavedBacktestMarketSeries(
      group.instrument,
      activeInstrument,
      series,
      researchInterval,
    );

    if (!sameCanonicalInstrument || !reusesCurrentSeries) {
      clearScreeningPresentationForInstrumentChange();
    }
    if (!sameCanonicalInstrument) {
      visibleInstrumentKeyRef.current = savedBacktestInstrumentKey(
        group.instrument,
      );
      clearMarketSeries();
      setInstrument(group.instrument);
    } else if (!reusesCurrentSeries) {
      clearMarketSeries();
      setRefreshVersion((value) => value + 1);
    }

    setStrategyAId("");
    setStrategyAParameters({});
    setStrategyBId("");
    setStrategyBParameters({});
    setStrategyCId("");
    setStrategyCParameters({});
    setStrategyAAllocationPercent(0);
    setStrategyBAllocationPercent(0);
    setStrategyCAllocationPercent(0);
    setAppliedStrategyPlan(null);
    setAppliedChartRange({ kind: "workspace" });
  };

  const deleteSavedBacktest = async (id: number) => {
    try {
      const response = await fetch(`/api/saved-backtests?id=${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("PERSISTENCE_UNAVAILABLE");
      await loadSavedBacktests();
    } catch {
      setSavedBacktestsError(true);
    }
  };

  const deleteSavedBacktestGroup = async (groupKey: string) => {
    if (!window.confirm(copy.savedBacktests.removeGroupConfirm)) return;
    try {
      const response = await fetch(
        `/api/saved-backtests?instrumentKey=${encodeURIComponent(groupKey)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("PERSISTENCE_UNAVAILABLE");
      setSavedBacktests((current) =>
        current.filter(
          (record) => savedBacktestInstrumentKey(record.instrument) !== groupKey,
        ),
      );
      setExpandedSavedBacktestGroups((current) =>
        current.filter((key) => key !== groupKey),
      );
      savedBacktestRollingSyncRef.current.delete(groupKey);
      setSavedBacktestsError(false);
    } catch {
      setSavedBacktestsError(true);
    }
  };

  const strategyShortcutFoldersForGroup = (groupKey: string) =>
    savedBacktestFolders.filter(
      (folder) =>
        folder.scope === "strategy" && folder.contextKey === groupKey,
    );

  const strategyShortcutSectionsForGroup = (
    group: (typeof savedBacktestGroups)[number],
  ) => {
    const folders = strategyShortcutFoldersForGroup(group.key);
    const activeRecords = group.records.filter(
      (record) => record.interval === researchInterval,
    );
    const sections: Array<{
      folder: SavedBacktestFolder | null;
      records: SavedBacktestRecord[];
    }> = folders.map((folder) => ({
      folder,
      records: activeRecords.filter(
        (record) => record.strategyFolderId === folder.id,
      ),
    }));
    const unfiledRecords = activeRecords.filter(
      (record) =>
        !record.strategyFolderId ||
        !folders.some((folder) => folder.id === record.strategyFolderId),
    );
    if (unfiledRecords.length > 0) {
      sections.push({ folder: null, records: unfiledRecords });
    }
    return sections;
  };

  const createSavedBacktestFolder = async (
    scope: SavedBacktestFolder["scope"],
    contextKey = "root",
  ) => {
    const name = window.prompt(
      scope === "instrument"
        ? copy.savedBacktests.createInstrumentFolderPrompt
        : copy.savedBacktests.createStrategyFolderPrompt,
    )?.trim();
    if (!name) return;
    setSavedBacktestFolderSaving(true);
    try {
      const response = await fetch("/api/saved-backtest-folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, contextKey, name }),
      });
      const payload = (await response.json()) as {
        folder?: SavedBacktestFolder;
      };
      if (!response.ok || !payload.folder) {
        throw new Error("PERSISTENCE_UNAVAILABLE");
      }
      setSavedBacktestFolders((current) => [
        payload.folder!,
        ...current.filter((folder) => folder.id !== payload.folder!.id),
      ]);
      setCollapsedSavedBacktestFolderIds((current) =>
        current.filter((id) => id !== payload.folder!.id),
      );
      setSavedBacktestsError(false);
    } catch {
      setSavedBacktestsError(true);
    } finally {
      setSavedBacktestFolderSaving(false);
    }
  };

  const renameSavedBacktestFolder = async (folder: SavedBacktestFolder) => {
    const name = window.prompt(
      copy.savedBacktests.renameFolderPrompt,
      folder.name,
    )?.trim();
    if (!name || name === folder.name) return;
    setSavedBacktestFolderSaving(true);
    try {
      const response = await fetch("/api/saved-backtest-folders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: folder.id, name }),
      });
      const payload = (await response.json()) as {
        folder?: SavedBacktestFolder;
      };
      if (!response.ok || !payload.folder) {
        throw new Error("PERSISTENCE_UNAVAILABLE");
      }
      setSavedBacktestFolders((current) =>
        current.map((item) =>
          item.id === folder.id ? payload.folder! : item,
        ),
      );
      setSavedBacktestsError(false);
    } catch {
      setSavedBacktestsError(true);
    } finally {
      setSavedBacktestFolderSaving(false);
    }
  };

  const deleteSavedBacktestFolder = async (folder: SavedBacktestFolder) => {
    if (!window.confirm(copy.savedBacktests.deleteFolderConfirm)) return;
    setSavedBacktestFolderSaving(true);
    try {
      const response = await fetch(
        `/api/saved-backtest-folders?id=${folder.id}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("PERSISTENCE_UNAVAILABLE");
      setSavedBacktestFolders((current) =>
        current.filter((item) => item.id !== folder.id),
      );
      setCollapsedSavedBacktestFolderIds((current) =>
        current.filter((id) => id !== folder.id),
      );
      setSavedBacktests((current) =>
        current.map((record) =>
          folder.scope === "instrument" &&
          record.instrumentFolderId === folder.id
            ? { ...record, instrumentFolderId: null }
            : folder.scope === "strategy" &&
                record.strategyFolderId === folder.id
              ? { ...record, strategyFolderId: null }
              : record,
        ),
      );
      setSavedBacktestsError(false);
    } catch {
      setSavedBacktestsError(true);
    } finally {
      setSavedBacktestFolderSaving(false);
    }
  };

  const assignSavedBacktestInstrumentFolder = async (
    instrumentKey: string,
    folderId: number | null,
  ) => {
    setSavedBacktestFolderSaving(true);
    try {
      const response = await fetch("/api/saved-backtest-folders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "instrument", instrumentKey, folderId }),
      });
      if (!response.ok) throw new Error("PERSISTENCE_UNAVAILABLE");
      setSavedBacktests((current) =>
        current.map((record) =>
          savedBacktestInstrumentKey(record.instrument) === instrumentKey
            ? { ...record, instrumentFolderId: folderId }
            : record,
        ),
      );
      setSavedBacktestsError(false);
    } catch {
      setSavedBacktestsError(true);
    } finally {
      setSavedBacktestFolderSaving(false);
    }
  };

  const assignSavedBacktestStrategyFolder = async (
    savedBacktestId: number,
    folderId: number | null,
  ) => {
    setSavedBacktestFolderSaving(true);
    try {
      const response = await fetch("/api/saved-backtest-folders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "strategy",
          savedBacktestId,
          folderId,
        }),
      });
      if (!response.ok) throw new Error("PERSISTENCE_UNAVAILABLE");
      setSavedBacktests((current) =>
        current.map((record) =>
          record.id === savedBacktestId
            ? { ...record, strategyFolderId: folderId }
            : record,
        ),
      );
      setSavedBacktestsError(false);
    } catch {
      setSavedBacktestsError(true);
    } finally {
      setSavedBacktestFolderSaving(false);
    }
  };

  const toggleSavedBacktestGroup = (groupKey: string) => {
    setExpandedSavedBacktestGroups((current) =>
      current.includes(groupKey)
        ? current.filter((key) => key !== groupKey)
        : [...current, groupKey],
    );
  };

  const toggleSavedBacktestFolder = (folderId: number) => {
    setCollapsedSavedBacktestFolderIds((current) =>
      current.includes(folderId)
        ? current.filter((id) => id !== folderId)
        : [...current, folderId],
    );
  };

  const startSavedBacktestDrag = (
    event: ReactDragEvent<HTMLElement>,
    drag: SavedBacktestDragState,
  ) => {
    if (
      drag.kind === "folder"
        ? savedBacktestFolderSaving
        : savedBacktestOrderSaving
    ) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(
      "application/x-quantscope-saved-backtest",
      JSON.stringify(drag),
    );
    setSavedBacktestDrag(drag);
  };

  const finishSavedBacktestDrag = () => {
    setSavedBacktestDrag(null);
    setSavedBacktestDropTarget("");
  };

  const persistSavedBacktestFolderOrder = async (
    nextOrder: SavedBacktestFolder[],
    scope: SavedBacktestFolder["scope"],
    contextKey: string,
  ) => {
    if (
      nextOrder.length !== savedBacktestFolders.length ||
      nextOrder.every(
        (folder, index) => folder.id === savedBacktestFolders[index]?.id,
      )
    ) {
      finishSavedBacktestDrag();
      return;
    }
    const previousOrder = savedBacktestFolders;
    const orderedIds = nextOrder
      .filter(
        (folder) =>
          folder.scope === scope && folder.contextKey === contextKey,
      )
      .map((folder) => folder.id);
    setSavedBacktestFolders(nextOrder);
    setSavedBacktestsError(false);
    setSavedBacktestFolderSaving(true);
    finishSavedBacktestDrag();
    try {
      const response = await fetch("/api/saved-backtest-folders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, contextKey, orderedIds }),
      });
      if (!response.ok) throw new Error("PERSISTENCE_UNAVAILABLE");
    } catch {
      setSavedBacktestFolders(previousOrder);
      setSavedBacktestsError(true);
    } finally {
      setSavedBacktestFolderSaving(false);
    }
  };

  const dropSavedBacktestFolder = (
    event: ReactDragEvent<HTMLElement>,
    targetFolder: SavedBacktestFolder,
  ) => {
    if (savedBacktestDrag?.kind !== "folder") return;
    event.stopPropagation();
    if (
      savedBacktestDrag.folderId === targetFolder.id ||
      savedBacktestDrag.scope !== targetFolder.scope ||
      savedBacktestDrag.contextKey !== targetFolder.contextKey
    ) {
      finishSavedBacktestDrag();
      return;
    }
    event.preventDefault();
    void persistSavedBacktestFolderOrder(
      reorderSavedBacktestFolders(
        savedBacktestFolders,
        targetFolder.scope,
        targetFolder.contextKey,
        savedBacktestDrag.folderId,
        targetFolder.id,
      ),
      targetFolder.scope,
      targetFolder.contextKey,
    );
  };

  const moveSavedBacktestFolderByOffset = (
    folder: SavedBacktestFolder,
    offset: -1 | 1,
  ) => {
    const siblings = savedBacktestFolders.filter(
      (candidate) =>
        candidate.scope === folder.scope &&
        candidate.contextKey === folder.contextKey,
    );
    const folderIndex = siblings.findIndex(
      (candidate) => candidate.id === folder.id,
    );
    const target = siblings[folderIndex + offset];
    if (!target) return;
    void persistSavedBacktestFolderOrder(
      reorderSavedBacktestFolders(
        savedBacktestFolders,
        folder.scope,
        folder.contextKey,
        folder.id,
        target.id,
      ),
      folder.scope,
      folder.contextKey,
    );
  };

  const persistSavedBacktestOrder = async (
    nextOrder: SavedBacktestRecord[],
  ) => {
    if (
      nextOrder.length !== savedBacktests.length ||
      nextOrder.every(
        (record, index) => record.id === savedBacktests[index]?.id,
      )
    ) {
      finishSavedBacktestDrag();
      return;
    }
    const previousOrder = savedBacktests;
    setSavedBacktests(nextOrder);
    setSavedBacktestsError(false);
    setSavedBacktestOrderSaving(true);
    finishSavedBacktestDrag();
    try {
      const response = await fetch("/api/saved-backtests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderedIds: nextOrder.map((record) => record.id),
        }),
      });
      if (!response.ok) throw new Error("PERSISTENCE_UNAVAILABLE");
    } catch {
      setSavedBacktests(previousOrder);
      setSavedBacktestsError(true);
    } finally {
      setSavedBacktestOrderSaving(false);
    }
  };

  const dropSavedBacktestGroup = (
    event: ReactDragEvent<HTMLElement>,
    targetGroupKey: string,
  ) => {
    if (savedBacktestDrag?.kind !== "group") return;
    event.stopPropagation();
    const sourceGroup =
      savedBacktestDrag?.kind === "group"
        ? savedBacktestGroups.find(
            (group) => group.key === savedBacktestDrag.groupKey,
          )
        : undefined;
    const targetGroup = savedBacktestGroups.find(
      (group) => group.key === targetGroupKey,
    );
    if (
      savedBacktestDrag.groupKey === targetGroupKey ||
      (sourceGroup?.instrumentFolderId ?? null) !==
        (targetGroup?.instrumentFolderId ?? null)
    ) {
      finishSavedBacktestDrag();
      return;
    }
    event.preventDefault();
    void persistSavedBacktestOrder(
      reorderSavedBacktestGroups(
        savedBacktests,
        savedBacktestDrag.groupKey,
        targetGroupKey,
      ),
    );
  };

  const dropSavedBacktestRecord = (
    event: ReactDragEvent<HTMLElement>,
    targetGroupKey: string,
    targetRecordId: number,
  ) => {
    if (savedBacktestDrag?.kind !== "record") return;
    event.stopPropagation();
    const draggedRecordId =
      savedBacktestDrag?.kind === "record"
        ? savedBacktestDrag.recordId
        : null;
    const group = savedBacktestGroups.find(
      (candidate) => candidate.key === targetGroupKey,
    );
    const sourceRecord = group?.records.find(
      (record) => record.id === draggedRecordId,
    );
    const targetRecord = group?.records.find(
      (record) => record.id === targetRecordId,
    );
    if (
      savedBacktestDrag.groupKey !== targetGroupKey ||
      savedBacktestDrag.recordId === targetRecordId ||
      (sourceRecord?.strategyFolderId ?? null) !==
        (targetRecord?.strategyFolderId ?? null)
    ) {
      finishSavedBacktestDrag();
      return;
    }
    event.preventDefault();
    void persistSavedBacktestOrder(
      reorderSavedBacktestsWithinGroup(
        savedBacktests,
        targetGroupKey,
        savedBacktestDrag.recordId,
        targetRecordId,
      ),
    );
  };

  const moveSavedBacktestGroupByOffset = (
    groupKey: string,
    offset: -1 | 1,
  ) => {
    const currentGroup = savedBacktestGroups.find(
      (group) => group.key === groupKey,
    );
    const siblingGroups = savedBacktestGroups.filter(
      (group) =>
        (group.instrumentFolderId ?? null) ===
        (currentGroup?.instrumentFolderId ?? null),
    );
    const groupIndex = siblingGroups.findIndex(
      (group) => group.key === groupKey,
    );
    const target = siblingGroups[groupIndex + offset];
    if (!target) return;
    void persistSavedBacktestOrder(
      reorderSavedBacktestGroups(savedBacktests, groupKey, target.key),
    );
  };

  const moveSavedBacktestRecordByOffset = (
    groupKey: string,
    recordId: number,
    offset: -1 | 1,
  ) => {
    const group = savedBacktestGroups.find(
      (candidate) => candidate.key === groupKey,
    );
    const currentRecord = group?.records.find(
      (record) => record.id === recordId,
    );
    const siblingRecords = group?.records.filter(
      (record) =>
        (record.strategyFolderId ?? null) ===
        (currentRecord?.strategyFolderId ?? null),
    );
    const recordIndex =
      siblingRecords?.findIndex((record) => record.id === recordId) ?? -1;
    const target = siblingRecords?.[recordIndex + offset];
    if (!target) return;
    void persistSavedBacktestOrder(
      reorderSavedBacktestsWithinGroup(
        savedBacktests,
        groupKey,
        recordId,
        target.id,
      ),
    );
  };

  const runShortcutBatchScreening = async () => {
    if (shortcutBatchProgress.status === "running") {
      shortcutBatchStopRequestedRef.current = true;
      window.localStorage.removeItem(SHORTCUT_BATCH_CHECKPOINT_KEY);
      shortcutBatchAbortRef.current?.abort();
      return;
    }
    const sessions = Math.max(
      3,
      Math.round(
        sampleValidationPeriods[0]?.sessions ??
          DEFAULT_SAMPLE_VALIDATION_SESSIONS,
      ),
    );
    const shortcutGroups = savedBacktestGroups;
    if (shortcutGroups.length === 0) {
      setShortcutBatchProgress({
        completed: 0,
        total: 0,
        saved: 0,
        failed: 0,
        currentInstrument: "",
        status: "error",
      });
      return;
    }
    const configSignature = createShortcutBatchConfigSignature({
      sessions,
      objective: screeningObjective,
      initialCash,
      commissionPercent,
      slippagePercent,
      entryFilterEnabled: screeningEntryFilterDraft.enabled,
    });
    const storedCheckpoint = parseShortcutBatchCheckpoint(
      window.localStorage.getItem(SHORTCUT_BATCH_CHECKPOINT_KEY),
    );
    const allKeys = shortcutGroups.map((group) => group.key);
    let pendingKeys = pendingShortcutBatchInstrumentKeys(
      allKeys,
      storedCheckpoint,
      configSignature,
    );
    let checkpoint =
      storedCheckpoint?.configSignature === configSignature
        ? storedCheckpoint
        : null;
    if (pendingKeys.length === 0) {
      checkpoint = null;
      pendingKeys = [...allKeys];
    }
    const completedKeys = new Set(checkpoint?.completedInstrumentKeys ?? []);
    const failedKeys = new Set<string>();
    const batchRunId = checkpoint?.runId ?? window.crypto.randomUUID();
    const controller = new AbortController();
    shortcutBatchStopRequestedRef.current = false;
    shortcutBatchAbortRef.current = controller;
    const initialCompleted = allKeys.length - pendingKeys.length;
    let savedCount = initialCompleted;
    setShortcutBatchProgress({
      completed: initialCompleted,
      total: allKeys.length,
      saved: initialCompleted,
      failed: 0,
      currentInstrument: "",
      status: "running",
    });

    let checkpointPersistenceEnabled = checkpoint !== null;
    let lastCheckpointError = checkpoint?.lastError ?? "";
    const persistFailureCheckpoint = (lastError: string) => {
      const nextCheckpoint: ShortcutBatchCheckpoint = {
        version: 2,
        resumeReason: "failure",
        runId: batchRunId,
        configSignature,
        sessions,
        completedInstrumentKeys: [...completedKeys],
        failedInstrumentKeys: [...failedKeys],
        updatedAt: new Date().toISOString(),
        lastError,
      };
      window.localStorage.setItem(
        SHORTCUT_BATCH_CHECKPOINT_KEY,
        JSON.stringify(nextCheckpoint),
      );
    };

    try {
      for (const instrumentKey of pendingKeys) {
        if (controller.signal.aborted) break;
        const group = shortcutGroups.find(
          (candidate) => candidate.key === instrumentKey,
        );
        if (!group) continue;
        setShortcutBatchProgress((current) => ({
          ...current,
          currentInstrument: group.instrument.name,
        }));
        setScreenProgress(emptyCombinationProgress());
        setValidationProgress(null);
        setScreenEngineStatus(null);
        try {
          const refreshed = await refreshShortcutMarketInstrument(
            group.instrument,
            { signal: controller.signal },
          );
          if (!refreshed?.canonicalSeries.bars.length) {
            throw new Error("MARKET_DATA_UNAVAILABLE");
          }
          const marketSeries = refreshed.canonicalSeries;
          const range = resolveTrailingTradingSessionRange(
            marketSeries.bars,
            sessions,
          );
          if (!range) throw new Error("INSUFFICIENT_SAMPLE_DATA");
          const hasReliableVolume = assessMarketVolumeCoverage(
            marketSeries.bars,
          ).reliable;
          const outcome = await runScreeningInWorker(
            marketSeries.bars,
            {
              initialCash,
              commissionRate: commissionPercent / 100,
              slippageRate: slippagePercent / 100,
              startTime: range.startTime,
              endTime: range.endTime,
              interval: DAILY_INTERVAL,
              executionPolicy: HISTORICAL_EXECUTION_POLICY,
              entryFilter: activeMovingAverageSlopeFilter(
                screeningEntryFilterDraft,
              ),
            },
            {
              mode: "sample",
              periods: [{ sessions, weight: 100 }],
            },
            {
              objective: screeningObjective,
              checkpointNamespace: `${instrumentKey}:1d:shortcut-batch:${sessions}:${batchRunId}`,
              entryFilters: screeningEntryFilterDraft.enabled
                ? buildScreeningMovingAverageSlopeFilters()
                : undefined,
              excludedStrategyIds: hasReliableVolume
                ? undefined
                : VOLUME_REQUIRED_STRATEGY_IDS,
              signal: controller.signal,
              onProgress: (progress) => {
                screenProgressRef.current = progress;
                setScreenProgress(progress);
              },
              onValidationProgress: setValidationProgress,
              onEngineStatus: setScreenEngineStatus,
            },
          );
          const best = selectBestShortcutScreeningResult(
            outcome.singleResults,
            outcome.results,
            screeningObjective,
          );
          if (!best) throw new Error("NO_SCREENING_RESULT");
          const plan =
            best.kind === "single"
              ? singleResultPlan(best.result)
              : combinationResultPlan(best.result);
          const saveResponse = await fetch("/api/saved-backtests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              createSaveBacktestInput(
                marketSeries.instrument,
                DAILY_INTERVAL,
                plan,
                datePart(range.startTime),
                datePart(range.endTime),
                initialCash,
                commissionPercent,
                slippagePercent,
                best.result,
              ),
            ),
            signal: controller.signal,
          });
          const savePayload = (await saveResponse.json()) as {
            savedBacktest?: SavedBacktestRecord;
          };
          if (!saveResponse.ok || !savePayload.savedBacktest) {
            throw new Error("PERSISTENCE_UNAVAILABLE");
          }

          const folderName = `${sessions}日`;
          let folder = savedBacktestFolders.find(
            (candidate) =>
              candidate.scope === "strategy" &&
              candidate.contextKey === instrumentKey &&
              candidate.name === folderName,
          );
          if (!folder) {
            const folderResponse = await fetch(
              "/api/saved-backtest-folders",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  scope: "strategy",
                  contextKey: instrumentKey,
                  name: folderName,
                }),
                signal: controller.signal,
              },
            );
            if (folderResponse.ok) {
              folder = ((await folderResponse.json()) as {
                folder?: SavedBacktestFolder;
              }).folder;
            } else if (folderResponse.status === 409) {
              const reloadResponse = await fetch("/api/saved-backtests", {
                cache: "no-store",
                signal: controller.signal,
              });
              const reloadPayload = (await reloadResponse.json()) as {
                savedBacktestFolders?: SavedBacktestFolder[];
              };
              folder = reloadPayload.savedBacktestFolders?.find(
                (candidate) =>
                  candidate.scope === "strategy" &&
                  candidate.contextKey === instrumentKey &&
                  candidate.name === folderName,
              );
            }
          }
          if (!folder) throw new Error("FOLDER_UNAVAILABLE");
          const resolvedFolder = folder;
          const assignResponse = await fetch(
            "/api/saved-backtest-folders",
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                scope: "strategy",
                folderId: resolvedFolder.id,
                savedBacktestId: savePayload.savedBacktest.id,
              }),
              signal: controller.signal,
            },
          );
          if (!assignResponse.ok) throw new Error("FOLDER_ASSIGNMENT_FAILED");
          const assignedSavedBacktest = {
            ...savePayload.savedBacktest,
            strategyFolderId: resolvedFolder.id,
          };
          const orderedResponse = await fetch("/api/saved-backtests", {
            cache: "no-store",
            signal: controller.signal,
          });
          if (!orderedResponse.ok) throw new Error("PERSISTENCE_UNAVAILABLE");
          const orderedPayload = (await orderedResponse.json()) as {
            savedBacktests?: SavedBacktestRecord[];
          };
          const fetchedRecords = orderedPayload.savedBacktests;
          if (
            !fetchedRecords?.some(
              (record) => record.id === assignedSavedBacktest.id,
            )
          ) {
            throw new Error("SAVED_BACKTEST_NOT_IN_SHORTCUT_LIST");
          }
          const nextRecords = promoteSavedBacktestWithinFolder(
            fetchedRecords,
            resolvedFolder.id,
            assignedSavedBacktest.id,
          );
          if (
            nextRecords.some(
              (record, index) => record.id !== fetchedRecords[index]?.id,
            )
          ) {
            const orderResponse = await fetch("/api/saved-backtests", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                orderedIds: nextRecords.map((record) => record.id),
              }),
              signal: controller.signal,
            });
            if (!orderResponse.ok) throw new Error("PERSISTENCE_UNAVAILABLE");
          }
          setSavedBacktests(nextRecords);
          setSavedBacktestFolders((current) =>
            current.some((candidate) => candidate.id === resolvedFolder.id)
              ? current
              : [resolvedFolder, ...current],
          );
          completedKeys.add(instrumentKey);
          failedKeys.delete(instrumentKey);
          savedCount += 1;
          if (checkpointPersistenceEnabled && lastCheckpointError) {
            persistFailureCheckpoint(lastCheckpointError);
          }
        } catch (error) {
          if (controller.signal.aborted) break;
          failedKeys.add(instrumentKey);
          lastCheckpointError = (error as Error).message || "UNKNOWN";
          checkpointPersistenceEnabled = true;
          persistFailureCheckpoint(lastCheckpointError);
        }
        setShortcutBatchProgress((current) => ({
          ...current,
          completed: completedKeys.size,
          saved: savedCount,
          failed: failedKeys.size,
        }));
      }
      if (controller.signal.aborted) {
        if (shortcutBatchStopRequestedRef.current) {
          window.localStorage.removeItem(SHORTCUT_BATCH_CHECKPOINT_KEY);
        }
        setShortcutBatchProgress((current) => ({
          ...current,
          currentInstrument: "",
          status: "cancelled",
        }));
      } else {
        if (failedKeys.size === 0) {
          window.localStorage.removeItem(SHORTCUT_BATCH_CHECKPOINT_KEY);
        } else if (lastCheckpointError) {
          persistFailureCheckpoint(lastCheckpointError);
        }
        setShortcutBatchProgress((current) => ({
          ...current,
          completed: completedKeys.size,
          saved: savedCount,
          failed: failedKeys.size,
          currentInstrument: "",
          status: failedKeys.size === 0 ? "completed" : "error",
        }));
      }
      await loadSavedBacktests();
    } finally {
      if (shortcutBatchAbortRef.current === controller) {
        shortcutBatchAbortRef.current = null;
      }
      shortcutBatchStopRequestedRef.current = false;
    }
  };

  const startScreening = async () => {
    if (!series?.bars.length) return;
    if (screeningBlockedByVolume) {
      setScreeningError("volume-unavailable");
      return;
    }
    const runObjective = screeningObjective;
    const runSeries = series;
    const runInstrumentKey = canonicalMarketInstrumentKey(
      runSeries.instrument,
    );
    const latestDate = runSeries.bars.at(-1)!.time;
    const resolvedMultiRanges = screeningMultiRanges.every(
      (range) => range.startTime && range.endTime,
    )
      ? screeningMultiRanges
      : defaultMultiRangeWindows(
          runSeries.bars,
          startDate,
          endDate || latestDate,
        );
    const validationConfig: ScreeningValidationConfig =
      screeningValidationMode === "sample"
        ? {
            mode: "sample",
            periods: sampleValidationPeriods.map((period) => ({
              ...period,
            })),
          }
        : screeningValidationMode === "range"
          ? {
              mode: "range",
              range: {
                ...screeningCustomRange,
                startTime: screeningCustomRange.startTime || startDate,
                endTime:
                  screeningCustomRange.endTime || endDate || latestDate,
              },
            }
          : screeningValidationMode === "multi-range"
            ? {
                mode: "multi-range",
                ranges: resolvedMultiRanges.map((range) => ({ ...range })),
              }
          : {
              mode: "rolling",
              range: {
                ...screeningCustomRange,
                startTime: screeningCustomRange.startTime || startDate,
                endTime:
                  screeningCustomRange.endTime || endDate || latestDate,
              },
              windowYears: rollingWindowYears,
            };
    screeningAbortRef.current?.abort();
    const controller = new AbortController();
    screeningAbortRef.current = controller;
    screeningCacheRestoreKeyRef.current = `${runInstrumentKey}:${researchInterval}`;
    void clearLatestScreeningResult();
    setScreening(true);
    setScreeningError("");
    setScreenEngineStatus(null);
    setScreenResults([]);
    setCombinationResults([]);
    setValidationProgress(null);
    setValidationReport(null);
    setScreenProgress(emptyCombinationProgress());
    try {
      const outcome = await runScreeningInWorker(
        runSeries.bars,
        {
          initialCash,
          commissionRate: commissionPercent / 100,
          slippageRate: slippagePercent / 100,
          startTime: startDate,
          endTime: endDate,
          interval: researchInterval,
          executionPolicy: HISTORICAL_EXECUTION_POLICY,
          entryFilter: activeMovingAverageSlopeFilter(
            screeningEntryFilterDraft,
          ),
        },
        validationConfig,
        {
          objective: runObjective,
          checkpointNamespace: `${runInstrumentKey}:${researchInterval}`,
          entryFilters: screeningEntryFilterDraft.enabled
            ? buildScreeningMovingAverageSlopeFilters()
            : undefined,
          excludedStrategyIds: reliableVolume
            ? undefined
            : VOLUME_REQUIRED_STRATEGY_IDS,
          signal: controller.signal,
          onProgress: (progress) => {
            screenProgressRef.current = progress;
            setScreenProgress(progress);
          },
          onValidationProgress: setValidationProgress,
          onEngineStatus: setScreenEngineStatus,
        },
      );

      if (screeningAbortRef.current !== controller) return;
      const completedProgress = {
        ...screenProgressRef.current,
        completed: outcome.evaluatedCount,
        total: outcome.totalCandidates,
        failed: outcome.failedCount,
      };
      if (visibleInstrumentKeyRef.current === runInstrumentKey) {
        setScreenResults(outcome.singleResults);
        setCombinationResults(outcome.results);
        setScreenResultsObjective(runObjective);
        setValidationReport(outcome.validationReport);
        setScreenProgress(completedProgress);
      }
      try {
        await writeLatestScreeningResult({
          instrumentKey: runInstrumentKey,
          interval: researchInterval,
          objective: runObjective,
          singleResults: outcome.singleResults,
          combinationResults: outcome.results,
          validationReport: outcome.validationReport,
          progress: completedProgress,
        });
      } catch {
        // The completed in-memory result remains valid when optional local
        // result caching is unavailable or the browser storage quota is full.
      }
      try {
        const dataFingerprint = await fingerprintMarketSeries(runSeries);
        if (controller.signal.aborted) return;
        const archiveInput = createSaveScreeningRunInput(
          runSeries,
          validationConfig,
          runObjective,
          {
            initialCash,
            commissionPercent,
            slippagePercent,
          },
          outcome,
          dataFingerprint,
          temporaryQuote,
        );
        const archiveResponse = await fetch("/api/screening-runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(archiveInput),
          signal: controller.signal,
        });
        const archivePayload = (await archiveResponse.json()) as {
          screeningRun?: ScreeningRunRecord;
        };
        if (!archiveResponse.ok || !archivePayload.screeningRun) {
          throw new Error("PERSISTENCE_UNAVAILABLE");
        }
        setSavedBacktestsError(false);
      } catch (archiveError) {
        if ((archiveError as Error).name !== "AbortError") {
          setSavedBacktestsError(true);
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setScreeningError(
          error instanceof ScreeningValidationError
            ? error.code
            : "run",
        );
      }
    } finally {
      if (screeningAbortRef.current === controller) {
        setScreening(false);
        screeningAbortRef.current = null;
      }
    }
  };

  const stopScreening = () => {
    screeningAbortRef.current?.abort();
  };

  const chooseInstrument = (nextInstrument: MarketInstrument) => {
    clearScreeningPresentationForInstrumentChange();
    for (const interval of [DAILY_INTERVAL, INTRADAY_INTERVAL] as const) {
      const snapshot = intervalResearchSnapshotsRef.current[interval];
      intervalResearchSnapshotsRef.current[interval] = {
        ...snapshot,
        screenResults: [],
        combinationResults: [],
        validationReport: null,
        screenProgress: emptyCombinationProgress(),
      };
    }
    visibleInstrumentKeyRef.current = savedBacktestInstrumentKey(
      nextInstrument,
    );
    clearMarketSeries();
    setInstrument(nextInstrument);
    setQuery("");
    setSearchResults([]);
  };

  const updateQuery = (value: string) => {
    setQuery(value);
    if (value.trim().length < 1) {
      setSearchResults([]);
      setSearching(false);
    }
  };

  const minDate = series?.bars.length ? series.bars[0].time : "";
  const maxDate = series?.bars.length
    ? series.bars[series.bars.length - 1].time
    : "";
  const screeningRangeSessions = series?.bars.length
    ? (resolveTradingSessionRange(
        series.bars,
        screeningCustomRange.startTime || startDate,
        screeningCustomRange.endTime || endDate || maxDate,
      )?.sessions ?? 0)
    : 0;
  const activeInstrument = series?.instrument ?? instrument;
  const activeInstrumentKey = savedBacktestInstrumentKey(activeInstrument);
  const sharedRangeSessions =
    sampleValidationPeriods[0]?.sessions ??
    DEFAULT_SAMPLE_VALIDATION_SESSIONS;
  const maximumSharedRangeSessions = Math.max(
    3,
    series?.bars.length ?? DEFAULT_SAMPLE_VALIDATION_SESSIONS,
  );
  const applySharedTradingSessionRange = (
    range: ReturnType<typeof resolveTradingSessionRange>,
  ) => {
    if (!range) return;
    const normalizedRange =
      range.sessions >= 3 || !series?.bars.length
        ? range
        : resolveTrailingTradingSessionRange(
            series.bars,
            3,
            range.endTime,
          );
    if (!normalizedRange) return;
    sharedRangeRef.current = {
      startDate: normalizedRange.startTime,
      endDate: normalizedRange.endTime,
    };
    sharedRangeSessionsRef.current = normalizedRange.sessions;
    setStartDate(normalizedRange.startTime);
    setEndDate(normalizedRange.endTime);
    setSampleValidationPeriods([
      { sessions: normalizedRange.sessions, weight: 100 },
    ]);
  };
  const updateSharedRangeFromDates = (
    nextStartDate: string,
    nextEndDate: string,
  ) => {
    if (!series?.bars.length) return;
    applySharedTradingSessionRange(
      resolveTradingSessionRange(
        series.bars,
        nextStartDate,
        nextEndDate,
      ),
    );
  };
  const updateSharedRangeFromSessions = (requestedSessions: number) => {
    const sessions = Math.min(
      Math.max(
        Number.isFinite(requestedSessions)
          ? Math.floor(requestedSessions)
          : DEFAULT_SAMPLE_VALIDATION_SESSIONS,
        3,
      ),
      maximumSharedRangeSessions,
    );
    sharedRangeSessionsRef.current = sessions;
    if (!series?.bars.length) {
      setSampleValidationPeriods([{ sessions, weight: 100 }]);
      return;
    }
    applySharedTradingSessionRange(
      resolveTrailingTradingSessionRange(
        series.bars,
        sessions,
        endDate || maxDate,
      ),
    );
  };
  const savedBacktestRollingGroups = useMemo(() => {
    const groups: Array<{
      instrumentKey: string;
      marketSeries: MarketSeries;
      rollingRange: {
        startTime: string;
        endTime: string;
      };
      evaluations: Array<{
        id: number;
        performance: BacktestResult | AllocationBacktestResult;
        relativeLongStrategy: StrategySlot | null;
      }>;
    }> = [];
    for (const group of savedBacktestGroups) {
      const marketSeries =
        group.key === activeInstrumentKey
          ? series
          : refreshedShortcutMarkets.get(group.key)
              ?.displayedSeries ?? null;
      if (!marketSeries?.bars.length) continue;
      const rollingRange = resolveTrailingTradingSessionRange(
        marketSeries.bars,
        SAVED_BACKTEST_ROLLING_SESSIONS,
      );
      if (!rollingRange || rollingRange.sessions < 3) continue;
      const evaluations: Array<{
        id: number;
        performance: BacktestResult | AllocationBacktestResult;
        relativeLongStrategy: StrategySlot | null;
      }> = [];
      const marketHasReliableVolume = assessMarketVolumeCoverage(
        marketSeries.bars,
      ).reliable;
      for (const saved of group.records) {
        if (
          saved.interval !== marketSeries.interval ||
          !marketHasReliableVolume &&
          strategyPlanRequiresVolume(saved.plan)
        ) {
          continue;
        }
        try {
          evaluations.push({
            id: saved.id,
            relativeLongStrategy: buildStrategyPlanTimeline(
              marketSeries.bars,
              saved.plan,
              {
                startTime: rollingRange.startTime,
                endTime: rollingRange.endTime,
              },
            ).relativeLongStrategy,
            performance: runStrategyPlanRangeBacktest(
              marketSeries.bars,
              saved.plan,
              {
                initialCash: saved.initialCash,
                commissionRate: saved.commissionPercent / 100,
                slippageRate: saved.slippagePercent / 100,
                startTime: rollingRange.startTime,
                endTime: rollingRange.endTime,
                interval: marketSeries.interval,
                executionPolicy: HISTORICAL_EXECUTION_POLICY,
                entryFilter: null,
              },
            ),
          });
        } catch {
          // One invalid legacy plan must not block the remaining shortcuts.
        }
      }
      if (evaluations.length > 0) {
        groups.push({
          instrumentKey: group.key,
          marketSeries,
          rollingRange: {
            startTime: rollingRange.startTime,
            endTime: rollingRange.endTime,
          },
          evaluations,
        });
      }
    }
    return groups;
  }, [
    activeInstrumentKey,
    refreshedShortcutMarkets,
    savedBacktestGroups,
    series,
  ]);
  const savedBacktestRollingMetrics = useMemo(
    () =>
      new Map(
        savedBacktestRollingGroups.flatMap((group) =>
          group.evaluations.map((evaluation) => [
            evaluation.id,
            evaluation.performance,
          ] as const),
        ),
      ),
    [savedBacktestRollingGroups],
  );
  const savedBacktestRelativeLongStrategies = useMemo(
    () =>
      new Map(
        savedBacktestRollingGroups.flatMap((group) =>
          group.evaluations.map((evaluation) => [
            evaluation.id,
            evaluation.relativeLongStrategy,
          ] as const),
        ),
      ),
    [savedBacktestRollingGroups],
  );
  const savedBacktestLiveGuidance = useMemo(() => {
    const guidance = new Map<
      number,
      {
        action: "increase" | "reduce" | "hold" | "wait";
        targetAllocation: number;
        strategyCount: number;
        activeStrategyCount: number;
        activeWeight: number;
        exitSupportCount: number;
        coreActive: boolean;
        tacticalStrategyCount: number;
        activeTacticalStrategyCount: number;
        tacticalSupport: number;
        volatilityRiskCap: number;
        orderPrices: Array<{
          slot: string;
          entryPrice: number | null;
          exitPrice: number | null;
          pendingNextOpenAction: "buy" | "sell" | null;
        }>;
      }
    >();
    const savedById = new Map(savedBacktests.map((saved) => [saved.id, saved]));
    for (const group of savedBacktestRollingGroups) {
      for (const evaluation of group.evaluations) {
        const saved = savedById.get(evaluation.id);
        if (!saved) continue;
        try {
          const allocation = buildLiveAllocationGuidance(
            group.marketSeries.bars,
            saved.plan,
            group.rollingRange,
            group.marketSeries.latestBarStatus,
          );
          if (!allocation) continue;
          const orderedLegs = STRATEGY_SLOTS.flatMap((planSlot) => {
            const selection = saved.plan[planSlot] ?? null;
            return selection ? [{ planSlot, selection }] : [];
          }).sort((left, right) =>
            left.planSlot === evaluation.relativeLongStrategy
              ? -1
              : right.planSlot === evaluation.relativeLongStrategy
                ? 1
                : left.planSlot.localeCompare(right.planSlot),
          );
          const orderPrices = allocation.strategyCount >= 3
            ? []
            : orderedLegs.flatMap((item, index) => {
            if (!item) return [];
            const displaySlot = String.fromCharCode(65 + index);
            const itemGuidance = buildLiveStrategyGuidance(
              group.marketSeries.bars,
              item.selection.strategyId,
              item.selection.parameters,
              group.marketSeries.latestBarStatus,
              strategyPlanEntryFilter(
                saved.plan,
                item.planSlot,
              ),
            );
            return itemGuidance
              ? [{
                  slot: displaySlot,
                  entryPrice: itemGuidance.todayEntryPrice,
                  exitPrice: itemGuidance.todayExitPrice,
                  pendingNextOpenAction: itemGuidance.pendingNextOpenAction,
                }]
              : [];
          });
          guidance.set(saved.id, {
            action: allocation.action,
            targetAllocation: allocation.targetAllocation,
            strategyCount: allocation.strategyCount,
            activeStrategyCount: allocation.activeStrategyCount,
            activeWeight: allocation.activeWeight,
            exitSupportCount: allocation.exitSupportCount,
            coreActive: allocation.coreActive,
            tacticalStrategyCount: allocation.tacticalStrategyCount,
            activeTacticalStrategyCount:
              allocation.activeTacticalStrategyCount,
            tacticalSupport: allocation.tacticalSupport,
            volatilityRiskCap: allocation.volatilityRiskCap,
            orderPrices,
          });
        } catch {
          // One invalid legacy shortcut must not block the remaining advice.
        }
      }
    }
    return guidance;
  }, [savedBacktestRollingGroups, savedBacktests]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      for (const group of savedBacktestRollingGroups) {
        if (controller.signal.aborted) return;
        const marketFingerprint = await fingerprintMarketSeries(
          group.marketSeries,
        );
        const evaluationIds = group.evaluations
          .map((evaluation) => evaluation.id)
          .sort((left, right) => left - right);
        const syncKey = `${marketFingerprint}:${evaluationIds.join(",")}`;
        if (
          savedBacktestRollingSyncRef.current.get(group.instrumentKey) ===
          syncKey
        ) {
          continue;
        }
        savedBacktestRollingSyncRef.current.set(
          group.instrumentKey,
          syncKey,
        );
        try {
          const response = await fetch("/api/saved-backtests", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              instrumentKey: group.instrumentKey,
              marketFingerprint,
              evaluations: group.evaluations.map((evaluation) => ({
                id: evaluation.id,
                totalReturn: evaluation.performance.totalReturn,
              })),
            }),
          });
          const payload = (await response.json()) as {
            rollingUpdates?: Array<{
              id: number;
              rollingTotalReturn: number | null;
            }>;
          };
          if (!response.ok || !payload.rollingUpdates) {
            throw new Error("PERSISTENCE_UNAVAILABLE");
          }
          const updates = new Map(
            payload.rollingUpdates.map((update) => [update.id, update]),
          );
          setSavedBacktests((current) =>
            current.map((record) => {
              const update = updates.get(record.id);
              return update
                ? {
                    ...record,
                    rollingTotalReturn: update.rollingTotalReturn,
                  }
                : record;
            }),
          );
          setSavedBacktestsError(false);
        } catch (error) {
          if ((error as Error).name === "AbortError") return;
          if (
            savedBacktestRollingSyncRef.current.get(group.instrumentKey) ===
            syncKey
          ) {
            savedBacktestRollingSyncRef.current.delete(group.instrumentKey);
          }
          setSavedBacktestsError(true);
        }
      }
    })();
    return () => controller.abort();
  }, [savedBacktestRollingGroups]);
  const screeningBusy = screening;
  const shortcutBatchSessions = Math.max(
    3,
    Math.round(
      sampleValidationPeriods[0]?.sessions ??
        DEFAULT_SAMPLE_VALIDATION_SESSIONS,
    ),
  );
  const screeningResultShortcutMatch = (
    result: ScreeningSingleResult | ScreeningCombinationResult,
  ) =>
    findStrategyShortcutMatch(
      "strategyId" in result
        ? singleResultPlan(result)
        : combinationResultPlan(result),
      savedBacktests,
      {
        instrument: series?.instrument ?? instrument,
        interval: researchInterval,
      },
    );
  const strategyShortlist = useMemo(
    () =>
      selectStrategyShortlist(
        screenResults,
        combinationResults,
        series?.bars ?? [],
        {
          objective: screenResultsObjective,
          size: 5,
          selectionScore: (result) => {
            const screeningResult = result as
              | ScreeningSingleResult
              | ScreeningCombinationResult;
            if (
              screeningResult.screeningValidation?.selectionScore !==
              undefined
            ) {
              return (
                screeningResult.screeningValidation.selectionScore ??
                null
              );
            }
            return screeningObjectiveValue(
              screeningResult.screeningValidation
                ?.rankingPerformance ?? screeningResult,
              screenResultsObjective,
            );
          },
        },
      ),
    [
      combinationResults,
      screenResults,
      screenResultsObjective,
      series?.bars,
    ],
  );
  const strategyConsensus = useMemo(() => {
    if (!series?.bars.length || strategyShortlist.length === 0) return null;
    const evidence = strategyShortlist.flatMap<StrategyConsensusEvidence>(
      (entry, index) => {
        const guidance = buildLiveAllocationGuidance(
          series.bars,
          entry.plan,
          {
            startTime: startDate || series.bars[0].time,
            endTime: endDate || series.bars.at(-1)!.time,
          },
          series.latestBarStatus,
        );
        return guidance
          ? [
              {
                key: entry.key,
                strategyIds: entry.strategyIds,
                previousAllocation: guidance.previousAllocation,
                targetAllocation: guidance.targetAllocation,
                weight: strategyShortlist.length - index,
              },
            ]
          : [];
      },
    );
    return buildStrategyConsensusAdvice(evidence);
  }, [endDate, series, startDate, strategyShortlist]);
  const strategyShortlistDeputyCount = strategyShortlist.filter(
    (entry) => entry.role === "secondary",
  ).length;
  const strategyShortlistNeedsIndependentDeputies =
    strategyShortlist.length > 0 &&
    strategyShortlistDeputyCount <
      DEFAULT_STRATEGY_SHORTLIST_DEPUTY_COUNT;
  const screeningProgressBar = resolveScreeningProgressBarState(
    screenProgress,
    validationProgress,
  );
  const shortcutBatchCurrentFraction =
    shortcutBatchProgress.status === "running" &&
    screeningProgressBar.maximum > 0
      ? Math.min(
          Math.max(
            screeningProgressBar.value / screeningProgressBar.maximum,
            0,
          ),
          1,
        )
      : 0;
  const shortcutBatchContinuousProgress = Math.min(
    shortcutBatchProgress.completed + shortcutBatchCurrentFraction,
    shortcutBatchProgress.total,
  );
  const screeningStageLabel = {
    strategies: copy.combinationScreening.runningStrategies,
    entryFilters: copy.combinationScreening.runningEntryFilters,
    pairs: copy.combinationScreening.runningPairs,
    allocations: copy.combinationScreening.runningAllocations,
    triples: copy.combinationScreening.runningTriples,
    tripleAllocations: copy.combinationScreening.runningTripleAllocations,
    quadruples: copy.combinationScreening.runningQuadruples,
    quadrupleAllocations:
      copy.combinationScreening.runningQuadrupleAllocations,
    quintuples: copy.combinationScreening.runningQuintuples,
    quintupleAllocations:
      copy.combinationScreening.runningQuintupleAllocations,
    sextuples: copy.combinationScreening.runningSextuples,
    sextupleAllocations:
      copy.combinationScreening.runningSextupleAllocations,
  }[screenProgress.stage];
  const selectedValidationCandidateName = (
    reference: ScreeningCandidateReference,
  ) => {
    const record = reference as ScreeningCandidateReference &
      Record<string, unknown>;
    return STRATEGY_SLOTS.flatMap((slot) => {
      const strategyId = record[`${slot}Id`] as StrategyId | null | undefined;
      return strategyId ? [copy.strategies[strategyId].name] : [];
    }).join(" + ");
  };
  const selectedStrategySummary = strategyPlan
    ? strategyPlanDisplayName(strategyPlan, relativeLongStrategy)
    : "";
  const appliedStrategyPresentation = appliedStrategyPlan
    ? strategyPlanPresentation(
        appliedStrategyPlan,
        appliedRelativeLongStrategy,
      )
    : null;
  const appliedStrategySummary = appliedStrategyPresentation?.shortName ?? "";
  const shortcutRefreshStatusText = shortcutRefreshProgress
    ? shortcutRefreshProgress.total > 0
      ? [
          `${copy.refreshStatus.progress} ${shortcutRefreshProgress.completed}/${shortcutRefreshProgress.total}`,
          `${copy.refreshStatus.updated} ${shortcutRefreshProgress.updated}`,
          `${copy.refreshStatus.retained} ${shortcutRefreshProgress.retained}`,
          shortcutRefreshCoolingDown
            ? copy.refreshStatus.cooldown
            : null,
        ]
          .filter(Boolean)
          .join(` ${copy.common.separator} `)
      : [
          copy.refreshStatus.currentOnly,
          shortcutRefreshCoolingDown
            ? copy.refreshStatus.cooldown
            : null,
        ]
          .filter(Boolean)
          .join(` ${copy.common.separator} `)
    : null;
  const refreshActionLabel =
    shortcutRefreshStatusText || copy.refresh;
  const combinationResultsByCount = new Map(
    Array.from({ length: 5 }, (_, index) => {
      const strategyCount = index + 2;
      return [
        strategyCount,
        combinationResults.filter(
          (result) => combinationResultSlotData(result).length === strategyCount,
        ),
      ] as const;
    }),
  );
  const chartResultGroups = [
    {
      key: "single",
      title: copy.screening.singleResultsTitle,
      kind: "single" as const,
      results: screenResults,
    },
    ...Array.from({ length: 5 }, (_, index) => {
      const strategyCount = index + 2;
      const titles = [
        copy.screening.dualResultsTitle,
        copy.screening.tripleResultsTitle,
        copy.screening.quadrupleResultsTitle,
        copy.screening.quintupleResultsTitle,
        copy.screening.sextupleResultsTitle,
      ];
      return {
        key: String(strategyCount),
        title: titles[index]!,
        kind: "combination" as const,
        results: combinationResultsByCount.get(strategyCount) ?? [],
      };
    }),
  ];
  const availableChartResultGroups = chartResultGroups.filter(
    (group) => group.results.length > 0,
  );
  const selectedChartResultGroup =
    availableChartResultGroups.find(
      (group) => group.key === chartResultGroupKey,
    ) ?? availableChartResultGroups[0] ?? null;
  const selectedChartResultIndex = selectedChartResultGroup
    ? Math.min(chartResultIndex, selectedChartResultGroup.results.length - 1)
    : 0;
  const selectedChartResult = selectedChartResultGroup
    ? selectedChartResultGroup.results[selectedChartResultIndex]
    : null;
  const selectedChartResultName = !selectedChartResult
    ? ""
    : "strategyId" in selectedChartResult
      ? copy.strategies[selectedChartResult.strategyId].name
      : copy.strategies[selectedChartResult.strategyAId].name;
  const selectedChartResultTitle = !selectedChartResult
    ? ""
    : "strategyId" in selectedChartResult
      ? selectedChartResultName
      : strategyPlanPresentation(
          combinationResultPlan(selectedChartResult),
          selectedChartResult.relativeLongStrategy,
        ).fullName;
  const applyChartResult = (
    group: (typeof chartResultGroups)[number],
    index: number,
  ) => {
    const result = group.results[index];
    if (!result) return;
    setChartResultGroupKey(group.key);
    setChartResultIndex(index);
    if (group.kind === "single") {
      const single = result as ScreeningSingleResult;
      applySingleStrategy(
        single.strategyId,
        single.parameters,
        single.entryFilter,
        resolveScreeningResultChartWindows(single, validationReport),
        false,
      );
      return;
    }
    const combination = result as ScreeningCombinationResult;
    applyCombinationResult(
      combination,
      resolveScreeningResultChartWindows(combination, validationReport),
      false,
    );
  };

  return (
    <main className="workspace-shell">
      <header className="topbar">
        <div className="brand-lockup" aria-label={copy.appName}>
          <span className="brand-mark">
            <Activity size={17} strokeWidth={2.4} />
          </span>
          <span>
            <strong>{copy.appName}</strong>
            <small>{copy.appTagline}</small>
          </span>
        </div>

        <div className="market-search" ref={searchContainerRef}>
          <Search size={16} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            placeholder={copy.searchPlaceholder}
            aria-label={copy.searchPlaceholder}
          />
          {searching && (
            <LoaderCircle className="spin" size={15} aria-hidden="true" />
          )}
          {(searchResults.length > 0 || (query && !searching)) && (
            <div className="search-popover">
              <div className="search-popover-label">{copy.searchHint}</div>
              {searchResults.map((result) => (
                <button
                  key={result.secid}
                  type="button"
                  onClick={() => chooseInstrument(result)}
                >
                  <span>
                    <strong>{result.name}</strong>
                    <small>{copy.assetTypes[result.assetType]}</small>
                  </span>
                  <span className="search-code">
                    {result.exchange}:{result.code}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="topbar-actions">
          <Link className="cycle-validation-link" href="/strategy-validation">
            <FlaskConical size={15} />
            {copy.cycleValidation.openPage}
          </Link>
          <div className="source-pill">
            <span className="live-dot" />
            {copy.marketDelayed}
          </div>
        </div>
      </header>

      <section className="instrument-strip">
        <div className="instrument-identity">
          <span className="exchange-badge">{activeInstrument.exchange}</span>
          <div>
            <h1>{activeInstrument.name}</h1>
            <p>
              {activeInstrument.exchange}:{activeInstrument.code}{" "}
              {copy.common.separator}{" "}
              {copy.assetTypes[activeInstrument.assetType]}
            </p>
          </div>
        </div>

        <div className="price-block">
          <strong>
            {displayedPrice !== undefined
              ? formatNumber(displayedPrice)
              : copy.common.unavailable}
          </strong>
          <span className={priceChange >= 0 ? "positive" : "negative"}>
            {priceChange >= 0 ? "+" : ""}
            {formatNumber(priceChange)} {copy.common.separator}{" "}
            {formatPercent(priceChangePercent, true)}
          </span>
          {temporaryQuote ? (
            <small>
              {copy.chart.temporaryQuote}{" "}
              {copy.sources[temporaryQuote.provider]}{" "}
              {copy.common.separator} {temporaryQuote.time}
            </small>
          ) : null}
          {activeInstrument.assetType === "commodity" ? (
            <small className="commodity-proxy-note">
              {copy.lab.commodityProxyDisclosure}
            </small>
          ) : null}
        </div>

        <div className="market-stat-row">
          {[
            [copy.marketStats.open, latest?.open],
            [copy.marketStats.high, latest?.high],
            [copy.marketStats.low, latest?.low],
            [
              copy.marketStats.volume,
              reliableVolume && latest?.volume
                ? compactFormatter.format(latest.volume)
                : copy.marketStats.volumeUnavailable,
            ],
            [
              copy.marketStats.amount,
              latest?.amount
                ? compactFormatter.format(latest.amount)
                : undefined,
            ],
          ].map(([label, value]) => (
            <div className="market-stat" key={String(label)}>
              <span>{label}</span>
              <strong>
                {typeof value === "number"
                  ? formatNumber(value)
                  : value ?? copy.common.unavailable}
              </strong>
            </div>
          ))}
        </div>

        <button
          className="icon-button"
          type="button"
          onClick={requestImmediateMarketRefresh}
          disabled={
            refreshingSavedMarkets || shortcutRefreshCoolingDown
          }
          aria-label={refreshActionLabel}
          title={refreshActionLabel}
        >
          <RefreshCw
            size={16}
            className={
              loading || refreshingSavedMarkets ? "spin" : ""
            }
          />
        </button>
      </section>

      <section className="chart-toolbar">
        <div className="chart-toolbar-menu-row">
          <span className="interval-workspace-badge">
            {copy.chart.dailyWorkspace}
          </span>
          <span className="toolbar-divider" />
          <div className="toolbar-group chart-type-tabs">
            <button
              type="button"
              className={chartType === "candlestick" ? "active" : ""}
              onClick={() => setChartType("candlestick")}
            >
              <CandlestickChart size={15} />
              {copy.chart.candlestick}
            </button>
            <button
              type="button"
              className={chartType === "line" ? "active" : ""}
              onClick={() => setChartType("line")}
            >
              <LineChart size={15} />
              {copy.chart.line}
            </button>
          </div>
          <span className="toolbar-divider" />
          <div className="indicator-menu-system" ref={indicatorMenusRef}>
            <div
              className="indicator-category-menus"
              aria-label={copy.indicatorSettings.menus}
            >
              {INDICATOR_CATEGORIES.map((category) => {
                const open = openIndicatorCategory === category;
                const menuId = `indicator-category-${category}`;
                return (
                  <div
                    className={`indicator-category-menu ${open ? "open" : ""}`}
                    key={category}
                  >
                    <button
                      className="indicator-category-trigger"
                      type="button"
                      aria-expanded={open}
                      aria-controls={menuId}
                      onClick={() =>
                        setOpenIndicatorCategory((current) =>
                          current === category ? null : category,
                        )
                      }
                    >
                      {copy.indicatorCategories[category]}
                      <ChevronDown size={12} aria-hidden="true" />
                    </button>
                    <div
                      id={menuId}
                      className="indicator-controls indicator-category-items"
                      hidden={!open}
                    >
                      {getIndicatorsByCategory(category).map((item) =>
                        renderIndicatorMenuItem(item, category),
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div
          className="indicator-controls indicator-favorites"
          role="group"
          aria-label={copy.indicatorSettings.favorites}
        >
          <span className="indicator-menu-label">
            <Star size={12} aria-hidden="true" />
            {copy.indicatorSettings.favorites}
          </span>
          {favoriteIndicatorIds.map((id) =>
            renderIndicatorControl(getIndicator(id), "favorite"),
          )}
        </div>
      </section>

      <section
        id="indicator-settings-panel"
        className="indicator-settings-bar"
        aria-label={copy.indicatorSettings.title}
      >
        <div className="indicator-settings-title">
          <span>{copy.indicatorSettings.eyebrow}</span>
          <strong>{copy.indicators[focusedIndicator].name}</strong>
        </div>
        {focusedIndicatorVolumeUnavailable ? (
          <span className="indicator-volume-warning" role="status">
            {copy.indicatorSettings.volumeUnavailable}
          </span>
        ) : null}
        {activeIndicator.parameters.length > 0 ? (
          <div className="indicator-parameter-controls">
            {activeIndicator.parameters.map((parameter) => (
              <label key={parameter.key}>
                <span>
                  {copy.parameters[
                    parameter.key as keyof typeof copy.parameters
                  ]}
                </span>
                {parameter.kind === "datetime" ? (
                  <input
                    name={`indicator-${parameter.key}`}
                    type="datetime-local"
                    value={formatDatetimeLocalValue(indicatorParameters[parameter.key])}
                    onChange={(event) =>
                      updateIndicatorParameter(
                        parameter.key,
                        event.target.value ? new Date(event.target.value).getTime() : 0,
                      )
                    }
                  />
                ) : (
                  <CommittedNumberInput
                    name={`indicator-${parameter.key}`}
                    value={indicatorParameters[parameter.key]}
                    min={parameter.minimum}
                    step={parameter.step}
                    integer={parameter.step >= 1}
                    onCommit={(value) =>
                      updateIndicatorParameter(
                        parameter.key,
                        value,
                      )
                    }
                  />
                )}
              </label>
            ))}
          </div>
        ) : (
          <span className="indicator-no-parameters">
            {copy.indicatorSettings.noParameters}
          </span>
        )}
        <button
          className={`indicator-favorite-button ${
            favoriteIndicatorIds.includes(focusedIndicator) ? "favorite" : ""
          }`}
          type="button"
          onClick={() => toggleIndicatorFavorite(focusedIndicator)}
          aria-pressed={favoriteIndicatorIds.includes(focusedIndicator)}
          aria-label={`${
            favoriteIndicatorIds.includes(focusedIndicator)
              ? copy.indicatorSettings.removeFavorite
              : copy.indicatorSettings.addFavorite
          } ${copy.indicators[focusedIndicator].name}`}
        >
          <Star
            size={13}
            fill={
              favoriteIndicatorIds.includes(focusedIndicator)
                ? "currentColor"
                : "none"
            }
          />
          {favoriteIndicatorIds.includes(focusedIndicator)
            ? copy.indicatorSettings.removeFavorite
            : copy.indicatorSettings.addFavorite}
        </button>
        <button
          className={`indicator-visibility-button ${
            focusedIndicatorVisible ? "visible" : ""
          }`}
          type="button"
          onClick={toggleFocusedIndicator}
          disabled={focusedIndicatorVolumeUnavailable}
          aria-pressed={focusedIndicatorVisible}
          aria-label={`${
            focusedIndicatorVisible
              ? copy.indicatorSettings.hide
              : copy.indicatorSettings.show
          } ${copy.indicators[focusedIndicator].name}`}
        >
          {focusedIndicatorVisible ? (
            <EyeOff size={13} aria-hidden="true" />
          ) : (
            <Eye size={13} aria-hidden="true" />
          )}
          {focusedIndicatorVisible
            ? copy.indicatorSettings.hide
            : copy.indicatorSettings.show}
        </button>
        {activeIndicator.parameters.length > 0 ? (
          <button
            className="indicator-reset-button"
            type="button"
            onClick={resetIndicator}
          >
            <RotateCcw size={13} />
            {copy.indicatorSettings.reset}
          </button>
        ) : null}
      </section>

      <div className="workspace-grid">
        <section className="chart-card panel" ref={chartSectionRef}>
          <div className="panel-heading chart-heading">
            <div>
              <span className="eyebrow">{copy.chart.title}</span>
              <strong>
                <span>
                  {copy.indicatorSettings.visibleIndicators}{" "}
                  {copy.common.separator}{" "}
                  {chartIndicators.length > 0
                    ? chartIndicators
                        .map((indicator) => copy.indicators[indicator.id].short)
                        .join(" / ")
                    : copy.indicatorSettings.none}
                </span>
                <small title={appliedStrategyPresentation?.fullName}>
                  {copy.indicatorSettings.activeStrategy}{" "}
                  {copy.common.separator}{" "}
                  {appliedStrategySummary || copy.lab.noStrategy}
                </small>
              </strong>
            </div>
            <div className="chart-heading-side">
              <div
                className="chart-direction-legend"
                aria-label={copy.chart.directionLegend}
              >
                <span>
                  <i className="rise" />
                  {copy.chart.rise}
                </span>
                <span>
                  <i className="fall" />
                  {copy.chart.fall}
                </span>
              </div>
              <div
                className="chart-meta"
                title={`${copy.chart.priceAdjustment.label}: ${copy.chart.priceAdjustment["corporate-action-adjusted"]} / ${copy.chart.priceAdjustment.raw}`}
                data-supported-price-adjustments={`corporate-action-adjusted=${copy.chart.priceAdjustment["corporate-action-adjusted"]}|raw=${copy.chart.priceAdjustment.raw}`}
              >
                <span>
                  {copy.chart.priceAdjustment.label}{" "}
                  {copy.common.separator}{" "}
                  {series
                    ? copy.chart.priceAdjustment[series.priceAdjustment]
                    : copy.common.unavailable}
                </span>
                {series && (
                  <>
                    <span>
                      {series.bars.length} {copy.chart.bars}
                    </span>
                     <span>
                       {copy.chart.canonicalSource}{" "}
                       {copy.sources[series.source]}
                     </span>
                     <span
                       title={
                         sourceHealthSummary ||
                         copy.chart.sourceHealthUnavailable
                       }
                     >
                       {copy.chart.sourceHealth} {sourceHealth.length}
                     </span>
                     {credentialIssueCount > 0 && (
                       <span
                         className="source-credential-warning"
                         title={
                           copy.errors.PROVIDER_CREDENTIAL_INVALID
                         }
                       >
                         {copy.chart.credentialIssues}{" "}
                         {credentialIssueCount}
                       </span>
                     )}
                     <span>
                       {copy.chart.latestBarStatus[series.latestBarStatus]}
                     </span>
                     <span>
                      {copy.marketStats.asOf} {lastUpdated}
                    </span>
                    <span>
                      {copy.liveGuidance.autoRefresh}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="chart-stage">
            {loading && !series && (
              <div className="chart-state">
                <LoaderCircle className="spin" size={22} />
                <span>{copy.loading}</span>
              </div>
            )}
            {errorCode && !series && (
              <div className="chart-state error-state">
                <ShieldAlert size={24} />
                <strong>
                  {copy.errors[errorCode as keyof typeof copy.errors] ??
                    copy.errors.UNKNOWN}
                </strong>
                <button
                  type="button"
                  onClick={requestImmediateMarketRefresh}
                >
                  {copy.retry}
                </button>
              </div>
            )}
             {series && (
              <Suspense fallback={<div className="chart-state" />}>
               <PriceChart
                bars={series.bars}
                interval={researchInterval}
                trades={
                  appliedBacktest && "trades" in appliedBacktest
                    ? appliedBacktest.trades
                    : EMPTY_PRICE_CHART_TRADES
                }
                tradeMarkers={appliedTradeMarkers}
                dataKey={`${activeInstrument.provider}:${activeInstrument.secid}:${researchInterval}`}
                focusRange={appliedChartFocusRange}
                chartType={chartType}
                visibleIndicators={chartIndicators}
                strategyConfigurations={strategyConfigurations}
                ariaLabel={copy.chart.aria}
                labels={priceChartLabels}
               />
              </Suspense>
             )}
             {errorCode && series && (
               <div className="chart-refresh-warning" role="status">
                 <ShieldAlert size={14} />
                 <span>
                   {copy.errors[
                     errorCode as keyof typeof copy.errors
                   ] ?? copy.errors.UNKNOWN}
                   {cachedPreviewTime
                     ? ` ${copy.common.separator} ${copy.chart.cacheTime}${copy.common.colon}${cachedPreviewTime}`
                     : ""}
                 </span>
               </div>
             )}
           </div>
          {selectedChartResultGroup && selectedChartResult && (
            <nav
              className="chart-result-navigator"
              aria-label={copy.screening.resultNavigator}
            >
              <div className="chart-result-group-selector">
                <label>
                  <span>{copy.screening.resultGroup}</span>
                  <select
                    value={selectedChartResultGroup.key}
                    onChange={(event) => {
                      const group = availableChartResultGroups.find(
                        (candidate) => candidate.key === event.target.value,
                      );
                      if (group) applyChartResult(group, 0);
                    }}
                  >
                    {availableChartResultGroups.map((group) => (
                      <option key={group.key} value={group.key}>
                        {group.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="chart-result-item-selector">
                <button
                type="button"
                disabled={selectedChartResultIndex === 0}
                onClick={() =>
                  applyChartResult(
                    selectedChartResultGroup,
                    selectedChartResultIndex - 1,
                  )
                }
                aria-label={copy.screening.previousResult}
                title={copy.screening.previousResult}
              >
                <ChevronUp size={15} />
                </button>
              <strong title={selectedChartResultTitle}>
                {selectedChartResultName} · #{selectedChartResultIndex + 1}
              </strong>
              <span>
                {selectedChartResultIndex + 1}/
                {selectedChartResultGroup.results.length}
              </span>
                <button
                type="button"
                disabled={
                  selectedChartResultIndex >=
                  selectedChartResultGroup.results.length - 1
                }
                onClick={() =>
                  applyChartResult(
                    selectedChartResultGroup,
                    selectedChartResultIndex + 1,
                  )
                }
                aria-label={copy.screening.nextResult}
                title={copy.screening.nextResult}
              >
                <ChevronDown size={15} />
                </button>
              </div>
            </nav>
          )}
        </section>

        <aside className="saved-shortcuts-panel panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">{copy.savedBacktests.eyebrow}</span>
              <strong>{copy.savedBacktests.title}</strong>
            </div>
            <div className="saved-shortcuts-save">
              <button
                className={`save-backtest-button ${saveStatus}`}
                type="button"
                disabled={!savedShortcutBacktest || saveStatus === "saving"}
                onClick={() => void saveCurrentBacktest()}
                aria-label={copy.savedBacktests.save}
                title={copy.savedBacktests.save}
              >
                {saveStatus === "saving" ? (
                  <LoaderCircle className="spin" size={14} />
                ) : (
                  <Save size={14} />
                )}
                <span>
                  {saveStatus === "saving"
                    ? copy.savedBacktests.saving
                    : saveStatus === "saved"
                      ? copy.savedBacktests.saved
                      : saveStatus === "error"
                        ? copy.savedBacktests.saveError
                        : copy.savedBacktests.save}
                  </span>
              </button>
              <button
                className="saved-shortcut-folder-create"
                type="button"
                disabled={savedBacktestFolderSaving}
                onClick={() => void createSavedBacktestFolder("instrument")}
                aria-label={copy.savedBacktests.createInstrumentFolder}
                title={copy.savedBacktests.createInstrumentFolder}
              >
                <FolderPlus size={15} />
              </button>
              <Bookmark size={19} />
            </div>
          </div>

          <section
            className="saved-backtest-shortcuts"
            aria-label={copy.savedBacktests.title}
          >
            {savedBacktestsLoading ? (
              <div className="saved-shortcuts-state">
                <LoaderCircle className="spin" size={14} />
                {copy.savedBacktests.loading}
              </div>
            ) : savedBacktests.length === 0 && savedBacktestFolders.length === 0 ? (
              <div className="saved-shortcuts-state">
                {savedBacktestsError
                  ? copy.savedBacktests.loadError
                  : copy.savedBacktests.empty}
              </div>
            ) : (
              <div className="saved-shortcuts-list">
                {savedBacktestsError && (
                  <div className="saved-shortcuts-inline-error" role="status">
                    {copy.savedBacktests.loadError}
                  </div>
                )}
                {savedBacktestInstrumentSections.map((section) => {
                  const folderExpanded = section.folder
                    ? !collapsedSavedBacktestFolderIds.includes(
                        section.folder.id,
                      )
                    : true;
                  const folderPanelId = section.folder
                    ? `saved-backtest-folder-${section.folder.id}`
                    : undefined;
                  const folderDropKey = section.folder
                    ? `folder:${section.folder.id}`
                    : "";
                  return (
                    <div
                      className={`saved-shortcut-folder-section ${
                        section.folder ? "filed" : "unfiled"
                      } ${
                        section.folder &&
                        savedBacktestDrag?.kind === "folder" &&
                        savedBacktestDrag.folderId === section.folder.id
                          ? "dragging"
                          : ""
                      } ${
                        section.folder &&
                        savedBacktestDropTarget === folderDropKey
                          ? "drag-over"
                          : ""
                      }`}
                      key={
                        section.folder
                          ? `folder-${section.folder.id}`
                          : "unfiled"
                      }
                      onDragOver={(event) => {
                        if (
                          section.folder &&
                          savedBacktestDrag?.kind === "folder" &&
                          savedBacktestDrag.folderId !== section.folder.id &&
                          savedBacktestDrag.scope === section.folder.scope &&
                          savedBacktestDrag.contextKey ===
                            section.folder.contextKey
                        ) {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          setSavedBacktestDropTarget(folderDropKey);
                        }
                      }}
                      onDrop={(event) => {
                        if (section.folder) {
                          dropSavedBacktestFolder(event, section.folder);
                        }
                      }}
                    >
                      {section.folder && (
                        <div className="saved-shortcut-folder-heading">
                          <button
                            className="saved-shortcut-folder-drag-handle"
                            type="button"
                            draggable={!savedBacktestFolderSaving}
                            onDragStart={(event) =>
                              startSavedBacktestDrag(event, {
                                kind: "folder",
                                folderId: section.folder!.id,
                                scope: section.folder!.scope,
                                contextKey: section.folder!.contextKey,
                              })
                            }
                            onDragEnd={finishSavedBacktestDrag}
                            onKeyDown={(event) => {
                              if (event.key === "ArrowUp") {
                                event.preventDefault();
                                moveSavedBacktestFolderByOffset(
                                  section.folder!,
                                  -1,
                                );
                              } else if (event.key === "ArrowDown") {
                                event.preventDefault();
                                moveSavedBacktestFolderByOffset(
                                  section.folder!,
                                  1,
                                );
                              }
                            }}
                            aria-label={`${copy.savedBacktests.reorderFolder} ${section.folder.name}`}
                          >
                            <GripVertical size={13} />
                          </button>
                          <button
                            className="saved-shortcut-folder-toggle"
                            type="button"
                            onClick={() =>
                              toggleSavedBacktestFolder(section.folder!.id)
                            }
                            aria-expanded={folderExpanded}
                            aria-controls={folderPanelId}
                          >
                            {folderExpanded ? (
                              <ChevronDown size={13} />
                            ) : (
                              <ChevronRight size={13} />
                            )}
                            <Folder size={14} aria-hidden="true" />
                            <strong>{section.folder.name}</strong>
                            <small>
                              {section.groups.length > 0
                                ? `${section.groups.length}`
                                : copy.savedBacktests.emptyFolder}
                            </small>
                          </button>
                          <button
                            className="saved-shortcut-folder-edit"
                            type="button"
                            disabled={savedBacktestFolderSaving}
                            onClick={() =>
                              void renameSavedBacktestFolder(section.folder!)
                            }
                            aria-label={`${copy.savedBacktests.renameFolder} ${section.folder.name}`}
                            title={copy.savedBacktests.renameFolder}
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            className="saved-shortcut-folder-delete"
                            type="button"
                            disabled={savedBacktestFolderSaving}
                            onClick={() =>
                              void deleteSavedBacktestFolder(section.folder!)
                            }
                            aria-label={`${copy.savedBacktests.deleteFolder} ${section.folder.name}`}
                            title={copy.savedBacktests.deleteFolder}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                      {folderExpanded && (
                        <div
                          className="saved-shortcut-folder-contents"
                          id={folderPanelId}
                        >
                          {section.groups.map((group) => {
                  const expanded =
                    expandedSavedBacktestGroups.includes(group.key);
                  const groupPanelId = `saved-backtest-group-${group.key.replace(
                    /[^A-Za-z0-9_-]/g,
                    "-",
                  )}`;
                  const groupDropKey = `group:${group.key}`;
                  return (
                    <div
                      className={`saved-shortcut-group ${
                        savedBacktestDrag?.kind === "group" &&
                        savedBacktestDrag.groupKey === group.key
                          ? "dragging"
                          : ""
                      } ${
                        savedBacktestDropTarget === groupDropKey
                          ? "drag-over"
                          : ""
                      }`}
                      key={group.key}
                      onDragOver={(event) => {
                        const sourceGroup =
                          savedBacktestDrag?.kind === "group"
                            ? savedBacktestGroups.find(
                                (candidate) =>
                                  candidate.key ===
                                  savedBacktestDrag.groupKey,
                              )
                            : undefined;
                        if (
                          savedBacktestDrag?.kind === "group" &&
                          savedBacktestDrag.groupKey !== group.key &&
                          (sourceGroup?.instrumentFolderId ?? null) ===
                            (group.instrumentFolderId ?? null)
                        ) {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          setSavedBacktestDropTarget(groupDropKey);
                        }
                      }}
                      onDrop={(event) =>
                        dropSavedBacktestGroup(event, group.key)
                      }
                    >
                      <div className="saved-shortcut-group-heading">
                        <button
                          className="saved-shortcut-drag-handle"
                          type="button"
                          draggable={!savedBacktestOrderSaving}
                          onDragStart={(event) =>
                            startSavedBacktestDrag(event, {
                              kind: "group",
                              groupKey: group.key,
                            })
                          }
                          onDragEnd={finishSavedBacktestDrag}
                          onKeyDown={(event) => {
                            if (event.key === "ArrowUp") {
                              event.preventDefault();
                              moveSavedBacktestGroupByOffset(group.key, -1);
                            } else if (event.key === "ArrowDown") {
                              event.preventDefault();
                              moveSavedBacktestGroupByOffset(group.key, 1);
                            }
                          }}
                          aria-label={`${copy.savedBacktests.reorderGroup} ${group.instrument.name}`}
                        >
                          <GripVertical size={14} />
                        </button>
                        <button
                          className="saved-shortcut-group-toggle"
                          type="button"
                          onClick={() => {
                            openSavedBacktestGroup(group);
                            toggleSavedBacktestGroup(group.key);
                          }}
                          aria-expanded={expanded}
                          aria-controls={groupPanelId}
                          aria-label={`${copy.savedBacktests.openCleanChart} ${group.instrument.name}`}
                          title={copy.savedBacktests.openCleanChart}
                        >
                          {expanded ? (
                            <ChevronDown size={14} />
                          ) : (
                            <ChevronRight size={14} />
                          )}
                          <span>
                            <strong>{group.instrument.name}</strong>
                            <small>
                              {group.instrument.exchange}:
                              {group.instrument.code}
                            </small>
                          </span>
                          <b>
                            {
                              group.records.filter(
                                (record) =>
                                  record.interval === researchInterval,
                              ).length
                            }
                            {copy.savedBacktests.savedPlans}
                          </b>
                        </button>
                        <select
                          className="saved-shortcut-folder-select"
                          value={group.instrumentFolderId ?? ""}
                          disabled={savedBacktestFolderSaving}
                          onChange={(event) =>
                            void assignSavedBacktestInstrumentFolder(
                              group.key,
                              event.target.value
                                ? Number(event.target.value)
                                : null,
                            )
                          }
                          aria-label={`${copy.savedBacktests.moveToFolder} ${group.instrument.name}`}
                          title={copy.savedBacktests.instrumentFolder}
                        >
                          <option value="">{copy.savedBacktests.unfiled}</option>
                          {instrumentShortcutFolders.map((folder) => (
                            <option key={folder.id} value={folder.id}>
                              {folder.name}
                            </option>
                          ))}
                        </select>
                        <button
                          className="saved-shortcut-group-folder-create"
                          type="button"
                          disabled={savedBacktestFolderSaving}
                          onClick={() =>
                            void createSavedBacktestFolder("strategy", group.key)
                          }
                          aria-label={`${copy.savedBacktests.createStrategyFolder} ${group.instrument.name}`}
                          title={copy.savedBacktests.createStrategyFolder}
                        >
                          <FolderPlus size={13} />
                        </button>
                        <button
                          className="saved-shortcut-group-delete"
                          type="button"
                          onClick={() =>
                            void deleteSavedBacktestGroup(group.key)
                          }
                          aria-label={`${copy.savedBacktests.removeGroup} ${group.instrument.name}`}
                          title={copy.savedBacktests.removeGroup}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      {expanded && (
                        <div
                          className="saved-shortcut-group-records"
                          id={groupPanelId}
                        >
                          {strategyShortcutSectionsForGroup(group).map(
                            (strategySection) => {
                              const strategyFolderExpanded =
                                strategySection.folder
                                  ? !collapsedSavedBacktestFolderIds.includes(
                                      strategySection.folder.id,
                                    )
                                  : true;
                              const strategyFolderPanelId =
                                strategySection.folder
                                  ? `saved-backtest-folder-${strategySection.folder.id}`
                                  : undefined;
                              const strategyFolderDropKey =
                                strategySection.folder
                                  ? `folder:${strategySection.folder.id}`
                                  : "";
                              return (
                                <div
                                  className={`saved-shortcut-strategy-folder-section ${
                                    strategySection.folder
                                      ? "filed"
                                      : "unfiled"
                                  } ${
                                    strategySection.folder &&
                                    savedBacktestDrag?.kind === "folder" &&
                                    savedBacktestDrag.folderId ===
                                      strategySection.folder.id
                                      ? "dragging"
                                      : ""
                                  } ${
                                    strategySection.folder &&
                                    savedBacktestDropTarget ===
                                      strategyFolderDropKey
                                      ? "drag-over"
                                      : ""
                                  }`}
                                  key={
                                    strategySection.folder
                                      ? `strategy-folder-${strategySection.folder.id}`
                                      : `strategy-unfiled-${group.key}`
                                  }
                                  onDragOver={(event) => {
                                    if (
                                      strategySection.folder &&
                                      savedBacktestDrag?.kind === "folder" &&
                                      savedBacktestDrag.folderId !==
                                        strategySection.folder.id &&
                                      savedBacktestDrag.scope ===
                                        strategySection.folder.scope &&
                                      savedBacktestDrag.contextKey ===
                                        strategySection.folder.contextKey
                                    ) {
                                      event.preventDefault();
                                      event.dataTransfer.dropEffect = "move";
                                      setSavedBacktestDropTarget(
                                        strategyFolderDropKey,
                                      );
                                    }
                                  }}
                                  onDrop={(event) => {
                                    if (strategySection.folder) {
                                      dropSavedBacktestFolder(
                                        event,
                                        strategySection.folder,
                                      );
                                    }
                                  }}
                                >
                                  {strategySection.folder && (
                                    <div className="saved-shortcut-strategy-folder-heading">
                                      <button
                                        className="saved-shortcut-folder-drag-handle"
                                        type="button"
                                        draggable={!savedBacktestFolderSaving}
                                        onDragStart={(event) =>
                                          startSavedBacktestDrag(event, {
                                            kind: "folder",
                                            folderId:
                                              strategySection.folder!.id,
                                            scope:
                                              strategySection.folder!.scope,
                                            contextKey:
                                              strategySection.folder!
                                                .contextKey,
                                          })
                                        }
                                        onDragEnd={finishSavedBacktestDrag}
                                        onKeyDown={(event) => {
                                          if (event.key === "ArrowUp") {
                                            event.preventDefault();
                                            moveSavedBacktestFolderByOffset(
                                              strategySection.folder!,
                                              -1,
                                            );
                                          } else if (
                                            event.key === "ArrowDown"
                                          ) {
                                            event.preventDefault();
                                            moveSavedBacktestFolderByOffset(
                                              strategySection.folder!,
                                              1,
                                            );
                                          }
                                        }}
                                        aria-label={`${copy.savedBacktests.reorderFolder} ${strategySection.folder.name}`}
                                      >
                                        <GripVertical size={12} />
                                      </button>
                                      <button
                                        className="saved-shortcut-folder-toggle"
                                        type="button"
                                        onClick={() =>
                                          toggleSavedBacktestFolder(
                                            strategySection.folder!.id,
                                          )
                                        }
                                        aria-expanded={strategyFolderExpanded}
                                        aria-controls={strategyFolderPanelId}
                                      >
                                        {strategyFolderExpanded ? (
                                          <ChevronDown size={12} />
                                        ) : (
                                          <ChevronRight size={12} />
                                        )}
                                        <Folder size={13} aria-hidden="true" />
                                        <strong>
                                          {strategySection.folder.name}
                                        </strong>
                                        <small>
                                          {strategySection.records.length > 0
                                            ? `${strategySection.records.length}`
                                            : copy.savedBacktests.emptyFolder}
                                        </small>
                                      </button>
                                      <button
                                        className="saved-shortcut-folder-edit"
                                        type="button"
                                        disabled={savedBacktestFolderSaving}
                                        onClick={() =>
                                          void renameSavedBacktestFolder(
                                            strategySection.folder!,
                                          )
                                        }
                                        aria-label={`${copy.savedBacktests.renameFolder} ${strategySection.folder.name}`}
                                        title={copy.savedBacktests.renameFolder}
                                      >
                                        <Pencil size={11} />
                                      </button>
                                      <button
                                        className="saved-shortcut-folder-delete"
                                        type="button"
                                        disabled={savedBacktestFolderSaving}
                                        onClick={() =>
                                          void deleteSavedBacktestFolder(
                                            strategySection.folder!,
                                          )
                                        }
                                        aria-label={`${copy.savedBacktests.deleteFolder} ${strategySection.folder.name}`}
                                        title={copy.savedBacktests.deleteFolder}
                                      >
                                        <Trash2 size={11} />
                                      </button>
                                    </div>
                                  )}
                                  {strategyFolderExpanded && (
                                    <div
                                      className="saved-shortcut-folder-contents"
                                      id={strategyFolderPanelId}
                                    >
                                      {strategySection.records.map((saved, index) => {
                            const requestedInstrumentActive =
                              saved.instrument.secid === instrument.secid &&
                              saved.instrument.provider ===
                                instrument.provider;
                            const resolvedInstrumentActive =
                              saved.instrument.secid ===
                                activeInstrument.secid &&
                              saved.instrument.provider ===
                                activeInstrument.provider;
                            const active =
                              (requestedInstrumentActive ||
                                resolvedInstrumentActive) &&
                              saved.interval === researchInterval &&
                              appliedStrategyPlan !== null &&
                              strategyPlansEqual(
                                saved.plan,
                                appliedStrategyPlan,
                              ) &&
                              saved.initialCash === initialCash &&
                              saved.commissionPercent ===
                                commissionPercent &&
                              saved.slippagePercent === slippagePercent;
                            const strategyPresentation = strategyPlanPresentation(
                              saved.plan,
                              savedBacktestRelativeLongStrategies.get(
                                saved.id,
                              ),
                            );
                            const strategyLabel = strategyPresentation.shortName;
                            const recordDropKey = `record:${saved.id}`;
                            const rollingMetrics =
                              savedBacktestRollingMetrics.get(saved.id) ??
                              null;
                            const shortcutGuidance =
                              savedBacktestLiveGuidance.get(saved.id) ??
                              null;
                            const displayedReturn =
                              resolveSavedBacktestReturnDisplay(
                                rollingMetrics,
                                saved.metrics,
                                saved.rollingTotalReturn,
                              );
                            return (
                              <div
                                className={`saved-shortcut ${
                                  active
                                    ? "active"
                                    : ""
                                } ${
                                  savedBacktestDrag?.kind === "record" &&
                                  savedBacktestDrag.recordId === saved.id
                                    ? "dragging"
                                    : ""
                                } ${
                                  savedBacktestDropTarget === recordDropKey
                                    ? "drag-over"
                                    : ""
                                }`}
                                key={saved.id}
                                onDragOver={(event) => {
                                  const draggedRecordId =
                                    savedBacktestDrag?.kind === "record"
                                      ? savedBacktestDrag.recordId
                                      : null;
                                  const sourceRecord = group.records.find(
                                    (record) =>
                                      record.id === draggedRecordId,
                                  );
                                  if (
                                    savedBacktestDrag?.kind === "record" &&
                                    savedBacktestDrag.groupKey === group.key &&
                                    savedBacktestDrag.recordId !== saved.id &&
                                    (sourceRecord?.strategyFolderId ?? null) ===
                                      (saved.strategyFolderId ?? null)
                                  ) {
                                    event.preventDefault();
                                    event.dataTransfer.dropEffect = "move";
                                    setSavedBacktestDropTarget(recordDropKey);
                                  }
                                }}
                                onDrop={(event) =>
                                  dropSavedBacktestRecord(
                                    event,
                                    group.key,
                                    saved.id,
                                  )
                                }
                              >
                                <button
                                  className="saved-shortcut-drag-handle"
                                  type="button"
                                  draggable={!savedBacktestOrderSaving}
                                  onDragStart={(event) =>
                                    startSavedBacktestDrag(event, {
                                      kind: "record",
                                      groupKey: group.key,
                                      recordId: saved.id,
                                    })
                                  }
                                  onDragEnd={finishSavedBacktestDrag}
                                  onKeyDown={(event) => {
                                    if (event.key === "ArrowUp") {
                                      event.preventDefault();
                                      moveSavedBacktestRecordByOffset(
                                        group.key,
                                        saved.id,
                                        -1,
                                      );
                                    } else if (
                                      event.key === "ArrowDown"
                                    ) {
                                      event.preventDefault();
                                      moveSavedBacktestRecordByOffset(
                                        group.key,
                                        saved.id,
                                        1,
                                      );
                                    }
                                  }}
                                  aria-label={`${copy.savedBacktests.reorderRecord} ${strategyPresentation.fullName}`}
                                >
                                  <GripVertical size={12} />
                                </button>
                                <button
                                  className="saved-shortcut-main"
                                  type="button"
                                  onClick={() => openSavedBacktest(saved)}
                                  aria-label={`${copy.savedBacktests.open} ${group.instrument.name} ${strategyPresentation.fullName}`}
                                >
                                  <span className="saved-shortcut-name">
                                    <span className="saved-shortcut-number">
                                      {index + 1}.
                                    </span>
                                    <strong title={strategyPresentation.fullName}>
                                      {strategyLabel}
                                    </strong>
                                  </span>
                                  {shortcutGuidance ? (
                                    <span className="saved-shortcut-guidance">
                                      {shortcutGuidance.strategyCount >= 3 ? (
                                        <>
                                          <small>
                                            <span>{copy.savedBacktests.currentPosition}：</span>
                                            <b className={`position-value ${shortcutGuidance.targetAllocation > 0 ? "positive" : "negative"}`}>
                                              {Math.round(shortcutGuidance.targetAllocation * 100)}%
                                            </b>
                                          </small>
                                          <small>
                                            <span>{copy.savedBacktests.supportStrength}：</span>
                                            <b>{shortcutGuidance.activeTacticalStrategyCount}/{shortcutGuidance.tacticalStrategyCount} · {copy.savedBacktests.supportWeight} {Math.round(shortcutGuidance.tacticalSupport * 100)}%</b>
                                          </small>
                                          <small>
                                            <span>{copy.savedBacktests.currentAction}：</span>
                                            <b>
                                              {shortcutGuidance.action === "increase"
                                                ? shortcutGuidance.targetAllocation >= 1
                                                  ? copy.savedBacktests.establishPosition
                                                  : copy.savedBacktests.increasePosition
                                                : shortcutGuidance.action === "reduce"
                                                  ? shortcutGuidance.targetAllocation <= 0
                                                    ? copy.savedBacktests.clearPosition
                                                    : copy.savedBacktests.reducePosition
                                                  : shortcutGuidance.targetAllocation > 0
                                                    ? copy.savedBacktests.continueHolding
                                                    : copy.savedBacktests.continueWaiting}
                                            </b>
                                          </small>
                                          <small>
                                            <span>{copy.savedBacktests.exitCondition}：</span>
                                            <b>{shortcutGuidance.coreActive ? copy.savedBacktests.coreHolding : copy.savedBacktests.coreFlat} · {copy.savedBacktests.volatilityCap} {Math.round(shortcutGuidance.volatilityRiskCap * 100)}%</b>
                                          </small>
                                        </>
                                      ) : (
                                        <small>
                                          <span>{copy.savedBacktests.currentPosition}：</span>
                                          <b className={`position-value ${shortcutGuidance.targetAllocation > 0 ? "positive" : "negative"}`}>
                                            {Math.round(shortcutGuidance.targetAllocation * 100)}%
                                          </b>
                                        </small>
                                      )}
                                      {shortcutGuidance.orderPrices.flatMap((order) => [
                                        <small className="entry-price" key={`${order.slot}-entry`}>
                                          <span>{order.slot}{copy.savedBacktests.entryPrice}：</span>
                                          <b>
                                            {order.entryPrice !== null
                                              ? formatNumber(order.entryPrice)
                                              : order.pendingNextOpenAction === "buy"
                                                ? copy.liveGuidance.pendingNextOpen.buy
                                                : copy.common.unavailable}
                                          </b>
                                        </small>,
                                        <small className="exit-price" key={`${order.slot}-exit`}>
                                          <span>{order.slot}{copy.savedBacktests.exitPrice}：</span>
                                          <b>
                                            {order.exitPrice !== null
                                              ? formatNumber(order.exitPrice)
                                              : order.pendingNextOpenAction === "sell"
                                                ? copy.liveGuidance.pendingNextOpen.sell
                                                : copy.common.unavailable}
                                          </b>
                                        </small>,
                                      ])}
                                    </span>
                                  ) : null}
                                  {saved.interval !== DAILY_INTERVAL && (
                                    <span className="saved-shortcut-legacy">
                                      {
                                        copy.savedBacktests
                                          .legacyIntervalPrefix
                                      }{" "}
                                      {copy.intervals[saved.interval]}{" "}
                                      {
                                        copy.savedBacktests
                                          .legacyIntervalSuffix
                                      }
                                    </span>
                                  )}
                                </button>
                                <span className="saved-shortcut-outcome">
                                  <b
                                    className={
                                      displayedReturn.totalReturn >= 0
                                        ? "positive"
                                        : "negative"
                                    }
                                  >
                                    {formatPercent(
                                      displayedReturn.totalReturn,
                                      true,
                                    )}
                                  </b>
                                </span>
                                <select
                                  className="saved-shortcut-folder-select strategy"
                                  value={saved.strategyFolderId ?? ""}
                                  disabled={savedBacktestFolderSaving}
                                  onChange={(event) =>
                                    void assignSavedBacktestStrategyFolder(
                                      saved.id,
                                      event.target.value
                                        ? Number(event.target.value)
                                        : null,
                                    )
                                  }
                                  aria-label={`${copy.savedBacktests.moveToFolder} ${strategyLabel}`}
                                  title={copy.savedBacktests.strategyFolder}
                                >
                                  <option value="">
                                    {copy.savedBacktests.unfiled}
                                  </option>
                                  {strategyShortcutFoldersForGroup(
                                    group.key,
                                  ).map((folder) => (
                                    <option key={folder.id} value={folder.id}>
                                      {folder.name}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  className="saved-shortcut-delete"
                                  type="button"
                                  onClick={() =>
                                    void deleteSavedBacktest(saved.id)
                                  }
                                  aria-label={`${copy.savedBacktests.remove} ${group.instrument.name} ${strategyLabel}`}
                                  title={copy.savedBacktests.remove}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                              );
                            },
                          )}
                        </div>
                      )}
                    </div>
                  );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </aside>
      </div>

      <section className="research-lab-grid">
        <aside className="strategy-panel panel">
          <div className="panel-heading strategy-panel-heading">
            <div>
              <span className="eyebrow">{copy.lab.title}</span>
              <div className="strategy-title-line">
                <strong>
                  {selectedStrategySummary || copy.lab.noStrategy}
                </strong>
              </div>
            </div>
            <div className="strategy-heading-controls">
              <div className="strategy-horizon-badges">
                {relativeLongStrategy &&
                  [
                    ["strategyA", "A", strategyAId],
                    ["strategyB", "B", strategyBId],
                    ["strategyC", "C", strategyCId],
                  ].map(([slot, label, strategyId]) =>
                    strategyId ? (
                      <span
                        key={slot}
                        className={`horizon-badge ${
                          relativeLongStrategy === slot ? "long" : "short"
                        }`}
                      >
                        {label} ·{" "}
                        {relativeLongStrategy === slot
                          ? copy.lab.relativeLong
                          : copy.lab.relativeShort}
                      </span>
                    ) : null,
                  )}
              </div>
              <div className="lab-heading-actions">
                <button
                  className="apply-current-strategy-button"
                  type="button"
                  onClick={applyCurrentStrategyToChart}
                  disabled={strategyPlanVolumeUnavailable}
                  aria-label={copy.lab.applyToChart}
                  title={copy.lab.applyToChart}
                >
                  <LineChart size={14} />
                  <span>{copy.lab.apply}</span>
                </button>
                <FlaskConical size={19} />
              </div>
            </div>
          </div>
          <div className="strategy-selector-grid">
            <div className="strategy-selector-card">
              <label className="field-label">
                <span>{copy.lab.strategyA}</span>
                <select
                  name="strategy-a"
                  value={strategyAId}
                  onChange={(event) =>
                    selectStrategyA(
                      event.target.value as StrategyId | "",
                    )
                  }
                >
                  <option value="">{copy.lab.noStrategyA}</option>
                  {availableStrategies.map((strategy) => (
                    <option
                      key={strategy.id}
                      value={strategy.id}
                      disabled={
                        (!reliableVolume &&
                          strategyRequiresVolume(strategy.id)) ||
                        (strategyBId
                          ? areStrategiesEquivalent(strategy.id, strategyBId)
                          : false) ||
                        (strategyCId
                          ? areStrategiesEquivalent(strategy.id, strategyCId)
                          : false)
                      }
                    >
                      {copy.strategies[strategy.id].name}
                      {!reliableVolume &&
                      strategyRequiresVolume(strategy.id)
                        ? ` (${copy.lab.volumeRequiredSuffix})`
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
              {strategyAId && (
                <>
                  <StrategyParameterFields
                    heading={copy.lab.strategyAParameters}
                    namePrefix="strategy-a"
                    parameters={strategyAParameters}
                    onChange={setStrategyAParameters}
                  />
                  <MovingAverageSlopeFilterFields
                    context="lab"
                    namePrefix="strategy-a-entry-filter"
                    draft={strategyAEntryFilterDraft}
                    onChange={setStrategyAEntryFilterDraft}
                    intraday={researchInterval === INTRADAY_INTERVAL}
                  />
                </>
              )}
            </div>
            <div className="strategy-selector-card">
              <label className="field-label">
                <span>{copy.lab.strategyB}</span>
                <select
                  name="strategy-b"
                  value={strategyBId}
                  onChange={(event) =>
                    selectStrategyB(
                      event.target.value as StrategyId | "",
                    )
                  }
                >
                  <option value="">{copy.lab.noStrategyB}</option>
                  {availableStrategies.map((strategy) => (
                    <option
                      key={strategy.id}
                      value={strategy.id}
                      disabled={
                        (!reliableVolume &&
                          strategyRequiresVolume(strategy.id)) ||
                        (strategyAId
                          ? areStrategiesEquivalent(strategy.id, strategyAId)
                          : false) ||
                        (strategyCId
                          ? areStrategiesEquivalent(strategy.id, strategyCId)
                          : false)
                      }
                    >
                      {copy.strategies[strategy.id].name}
                      {!reliableVolume &&
                      strategyRequiresVolume(strategy.id)
                        ? ` (${copy.lab.volumeRequiredSuffix})`
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
              {strategyBId && (
                <>
                  <StrategyParameterFields
                    heading={copy.lab.strategyBParameters}
                    namePrefix="strategy-b"
                    parameters={strategyBParameters}
                    onChange={setStrategyBParameters}
                  />
                  <MovingAverageSlopeFilterFields
                    context="lab"
                    namePrefix="strategy-b-entry-filter"
                    draft={strategyBEntryFilterDraft}
                    onChange={setStrategyBEntryFilterDraft}
                    intraday={researchInterval === INTRADAY_INTERVAL}
                  />
                </>
              )}
            </div>
            <div className="strategy-selector-card">
              <label className="field-label">
                <span>{copy.lab.strategyC}</span>
                <select
                  name="strategy-c"
                  value={strategyCId}
                  onChange={(event) =>
                    selectStrategyC(event.target.value as StrategyId | "")
                  }
                >
                  <option value="">{copy.lab.noStrategyC}</option>
                  {availableStrategies.map((strategy) => (
                    <option
                      key={strategy.id}
                      value={strategy.id}
                      disabled={
                        (!reliableVolume &&
                          strategyRequiresVolume(strategy.id)) ||
                        (strategyAId
                          ? areStrategiesEquivalent(strategy.id, strategyAId)
                          : false) ||
                        (strategyBId
                          ? areStrategiesEquivalent(strategy.id, strategyBId)
                          : false)
                      }
                    >
                      {copy.strategies[strategy.id].name}
                      {!reliableVolume && strategyRequiresVolume(strategy.id)
                        ? ` (${copy.lab.volumeRequiredSuffix})`
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
              {strategyCId && (
                <>
                  <StrategyParameterFields
                    heading={copy.lab.strategyCParameters}
                    namePrefix="strategy-c"
                    parameters={strategyCParameters}
                    onChange={setStrategyCParameters}
                  />
                  <MovingAverageSlopeFilterFields
                    context="lab"
                    namePrefix="strategy-c-entry-filter"
                    draft={strategyCEntryFilterDraft}
                    onChange={setStrategyCEntryFilterDraft}
                    intraday={researchInterval === INTRADAY_INTERVAL}
                  />
                </>
              )}
            </div>
          </div>

          <div className="allocation-grid">
            <label className="field-label">
              <span>{copy.lab.strategyAAllocation}</span>
              <select
                name="strategy-a-allocation"
                value={
                  strategyPlan?.strategyA
                    ? Math.round(strategyPlan.strategyAAllocation * 100)
                    : 0
                }
                disabled={
                  [strategyAId, strategyBId, strategyCId].filter(Boolean)
                    .length <= 1
                }
                onChange={(event) =>
                  selectStrategyAAllocation(Number(event.target.value))
                }
              >
                {!strategyAId ? (
                  <option value={0}>0%</option>
                ) : [strategyAId, strategyBId, strategyCId].filter(Boolean)
                    .length === 1 ? (
                  <option value={100}>100%</option>
                ) : (
                  (strategyAId && strategyBId && strategyCId
                    ? TRIPLE_ALLOCATION_OPTIONS
                    : STRATEGY_ALLOCATION_OPTIONS
                  ).map((allocation) => (
                    <option key={allocation} value={allocation}>
                      {allocation}%
                    </option>
                  ))
                )}
              </select>
            </label>
            <label className="field-label">
              <span>{copy.lab.strategyBAllocation}</span>
              <select
                name="strategy-b-allocation"
                value={
                  strategyPlan?.strategyB
                    ? Math.round(strategyPlan.strategyBAllocation * 100)
                    : 0
                }
                disabled={
                  [strategyAId, strategyBId, strategyCId].filter(Boolean)
                    .length <= 1
                }
                onChange={(event) =>
                  selectStrategyBAllocation(Number(event.target.value))
                }
              >
                {!strategyBId ? (
                  <option value={0}>0%</option>
                ) : [strategyAId, strategyBId, strategyCId].filter(Boolean)
                    .length === 1 ? (
                  <option value={100}>100%</option>
                ) : (
                  (strategyAId && strategyBId && strategyCId
                    ? TRIPLE_ALLOCATION_OPTIONS
                    : STRATEGY_ALLOCATION_OPTIONS
                  ).map((allocation) => (
                    <option key={allocation} value={allocation}>
                      {allocation}%
                    </option>
                  ))
                )}
              </select>
            </label>
            <label className="field-label">
              <span>{copy.lab.strategyCAllocation}</span>
              <select
                name="strategy-c-allocation"
                value={
                  strategyPlan?.strategyC
                    ? Math.round((strategyPlan.strategyCAllocation ?? 0) * 100)
                    : 0
                }
                disabled={
                  [strategyAId, strategyBId, strategyCId].filter(Boolean)
                    .length <= 1
                }
                onChange={(event) =>
                  selectStrategyCAllocation(Number(event.target.value))
                }
              >
                {!strategyCId ? (
                  <option value={0}>0%</option>
                ) : [strategyAId, strategyBId, strategyCId].filter(Boolean)
                    .length === 1 ? (
                  <option value={100}>100%</option>
                ) : (
                  (strategyAId && strategyBId && strategyCId
                    ? TRIPLE_ALLOCATION_OPTIONS
                    : STRATEGY_ALLOCATION_OPTIONS
                  ).map((allocation) => (
                    <option key={allocation} value={allocation}>
                      {allocation}%
                    </option>
                  ))
                )}
              </select>
            </label>
            <label className="field-label tactical-allocation-mode">
              <span>{copy.lab.tacticalMode}</span>
              <select
                name="tactical-allocation-mode"
                value={tacticalAllocationMode}
                disabled={
                  [strategyAId, strategyBId, strategyCId].filter(Boolean)
                    .length <= 1
                }
                onChange={(event) =>
                  setTacticalAllocationMode(
                    event.target.value as TacticalAllocationMode,
                  )
                }
              >
                {TACTICAL_ALLOCATION_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {copy.lab.tacticalModes[mode]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="date-grid">
            <label className="field-label">
              <span>
                {researchInterval === INTRADAY_INTERVAL
                  ? copy.lab.startTime
                  : copy.lab.start}
              </span>
              <input
                type={
                  researchInterval === INTRADAY_INTERVAL
                    ? "datetime-local"
                    : "date"
                }
                value={workspaceTimeInputValue(startDate, researchInterval)}
                min={workspaceTimeInputValue(minDate, researchInterval)}
                max={workspaceTimeInputValue(
                  endDate || maxDate,
                  researchInterval,
                )}
                onChange={(event) => {
                  updateSharedRangeFromDates(
                    marketTimeFromInput(event.target.value),
                    endDate,
                  );
                }}
              />
            </label>
            <label className="field-label">
              <span>
                {researchInterval === INTRADAY_INTERVAL
                  ? copy.lab.endTime
                  : copy.lab.end}
              </span>
              <input
                type={
                  researchInterval === INTRADAY_INTERVAL
                    ? "datetime-local"
                    : "date"
                }
                value={workspaceTimeInputValue(endDate, researchInterval)}
                min={workspaceTimeInputValue(
                  startDate || minDate,
                  researchInterval,
                )}
                max={workspaceTimeInputValue(maxDate, researchInterval)}
                onChange={(event) => {
                  updateSharedRangeFromDates(
                    startDate,
                    marketTimeFromInput(event.target.value),
                  );
                }}
              />
            </label>
          </div>

          <div className="settings-grid">
            <label className="field-label">
              <span>{copy.lab.initialCash}</span>
              <CommittedNumberInput
                value={initialCash}
                min={1000}
                step={10000}
                onCommit={setInitialCash}
              />
            </label>
            <label className="field-label">
              <span>{copy.lab.commission} %</span>
              <CommittedNumberInput
                value={commissionPercent}
                min={0}
                step={0.01}
                onCommit={setCommissionPercent}
              />
            </label>
            <label className="field-label">
              <span>{copy.lab.slippage} %</span>
              <CommittedNumberInput
                value={slippagePercent}
                min={0}
                step={0.01}
                onCommit={setSlippagePercent}
              />
            </label>
          </div>

          <div className="backtest-summary-grid">
            {backtest ? (
              <div className="metric-grid">
                {[
                  [
                    copy.metrics.totalReturn,
                    formatPercent(backtest.totalReturn, true),
                    backtest.totalReturn >= 0,
                  ],
                  [
                    copy.metrics.maxDrawdown,
                    formatPercent(backtest.maxDrawdown),
                    false,
                  ],
                  [
                    copy.metrics.sharpe,
                    formatNumber(backtest.sharpe),
                    backtest.sharpe >= 0,
                  ],
                  ...("winRate" in backtest
                    ? [
                        [
                          copy.metrics.winRate,
                          formatPercent(backtest.winRate),
                          backtest.winRate >= 50,
                        ],
                      ]
                    : [
                        [
                          copy.metrics.targetAllocation,
                          formatPercent(
                            (liveGuidance?.targetAllocation ?? 0) * 100,
                          ),
                          (liveGuidance?.targetAllocation ?? 0) > 0,
                        ],
                      ]),
                  [
                    "rebalances" in backtest
                      ? copy.metrics.rebalances
                      : copy.metrics.trades,
                    String(backtest.tradeCount),
                    true,
                  ],
                  [
                    copy.metrics.benchmarkReturn,
                    formatPercent(backtest.benchmarkReturn, true),
                    backtest.totalReturn >= backtest.benchmarkReturn,
                  ],
                ].map(([label, value, good]) => (
                  <div className="metric" key={String(label)}>
                    <span>{label}</span>
                    <strong className={good ? "positive" : ""}>{value}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-result">{copy.lab.noResult}</div>
            )}

            <section
              className={`stability-card ${stabilityState}`}
              aria-labelledby="stability-card-title"
            >
              <div className="stability-card-heading">
                <div>
                  <span className="eyebrow">{copy.stability.eyebrow}</span>
                  <strong id="stability-card-title">
                    {copy.stability.title}
                  </strong>
                </div>
                <span className="stability-status">
                  {stabilityState === "stable"
                    ? copy.stability.stable
                    : stabilityState === "sensitive"
                      ? copy.stability.sensitive
                      : stabilityState === "insufficient"
                        ? copy.stability.insufficientEvidence
                        : copy.common.unavailable}
                </span>
              </div>
              {stability && !stability.evidence.sufficient && (
                <div className="stability-evidence" role="status">
                  <strong>{copy.stability.insufficientEvidence}</strong>
                  <ul>
                    {stability.evidence.reasons.map((reason) => (
                      <li key={reason}>
                        {formatStabilityEvidenceReason(
                          reason,
                          stability.evidence,
                          researchInterval,
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {stability && stabilityNearby ? (
                <>
                  <dl className="stability-stat-grid">
                    <div>
                      <dt>{copy.stability.nearbyVariants}</dt>
                      <dd>{stability.variantResults.length}</dd>
                    </div>
                    <div>
                      <dt>{copy.stability.signAgreement}</dt>
                      <dd>
                        {formatPercent(
                          stabilityNearby.signAgreement.ratio * 100,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>{copy.stability.totalReturnRange}</dt>
                      <dd>
                        {formatPercent(
                          stabilityNearby.totalReturnRange.minimum,
                          true,
                        )}{" "}
                        {copy.stability.rangeSeparator}{" "}
                        {formatPercent(
                          stabilityNearby.totalReturnRange.maximum,
                          true,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>{copy.stability.drawdownRange}</dt>
                      <dd>
                        {formatPercent(
                          stabilityNearby.drawdownRange.minimum,
                        )}{" "}
                        {copy.stability.rangeSeparator}{" "}
                        {formatPercent(
                          stabilityNearby.drawdownRange.maximum,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>{copy.stability.tradeCountRange}</dt>
                      <dd>
                        {stabilityNearby.tradeCountRange.minimum}{" "}
                        {copy.stability.rangeSeparator}{" "}
                        {stabilityNearby.tradeCountRange.maximum}
                      </dd>
                    </div>
                  </dl>

                  <div className="stability-regime-block">
                    <span>{copy.stability.regimes}</span>
                    <dl className="stability-regime-grid">
                      {(["up", "sideways", "down"] as const).map((regime) => {
                        const summary = stability.regimes[regime];
                        return (
                          <div key={regime}>
                            <dt>{copy.stability[regime]}</dt>
                            <dd>
                              <strong>
                                {summary.returnPercent === null
                                  ? copy.common.unavailable
                                  : formatPercent(
                                      summary.returnPercent,
                                      true,
                                    )}
                              </strong>
                              <small>
                                {summary.periodCount} {copy.stability.periods}
                              </small>
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  </div>
                </>
              ) : !stability &&
                (!strategyPlan || usesSingleFullAllocation) ? (
                <div className="stability-unavailable">
                  {copy.stability.unavailable}
                </div>
              ) : null}
            </section>
          </div>

          {backtest ? (
            <Suspense fallback={<div className="chart-state" />}>
            <BacktestChart
              result={backtest}
              ariaLabel={copy.chart.backtestAria}
              labels={backtestChartLabels}
            />
            </Suspense>
          ) : null}
        </aside>

      <section className="screening-panel panel">
        <div className="screening-intro">
          <div className="screening-intro-main">
            <div className="screening-title">
              <span className="eyebrow">{copy.screening.eyebrow}</span>
              <h2>
                <Sparkles size={21} />
                {copy.screening.title}
              </h2>
            </div>
            <div className="screening-config">
              <fieldset className="screening-config-group screening-optimization-group">
                <legend>{copy.screening.optimizationGroup}</legend>
                <div className="screening-optimization-grid">
                  <label className="screening-control-field">
                    <span>{copy.screening.objective}</span>
                    <select
                      name="strategy-screening-objective"
                      value={screeningObjective}
                      disabled={screeningBusy}
                      onChange={(event) => {
                        setScreeningObjective(
                          event.target.value as ScreeningObjective,
                        );
                      }}
                    >
                      {SCREENING_OBJECTIVES.map((value) => (
                        <option value={value} key={value}>
                          {copy.screening.objectives[value]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="screening-control-field screening-full-traversal">
                    <span>{copy.screening.parameterTraversal}</span>
                    <strong>{copy.screening.fullTraversal}</strong>
                  </div>
                </div>
              </fieldset>
              <MovingAverageSlopeFilterFields
                context="screening"
                namePrefix="screening-entry-filter"
                draft={screeningEntryFilterDraft}
                onChange={setScreeningEntryFilterDraft}
                disabled={screeningBusy}
                intraday={researchInterval === INTRADAY_INTERVAL}
              />
              <fieldset className="screening-config-group screening-validation-group">
                <legend>{copy.screening.validationGroup}</legend>
                <label className="screening-control-field screening-validation-mode">
                  <span>{copy.screening.validationMode}</span>
                  <select
                    name="strategy-screening-validation"
                    value={screeningValidationMode}
                    disabled={screeningBusy}
                    onChange={(event) => {
                      const nextMode =
                        event.target.value as ScreeningValidationMode;
                      setScreeningValidationMode(nextMode);
                      if (
                        nextMode === "multi-range" &&
                        series?.bars.length &&
                        screeningMultiRanges.every(
                          (range) => !range.startTime && !range.endTime,
                        )
                      ) {
                        setScreeningMultiRanges(
                          defaultMultiRangeWindows(
                            series.bars,
                            startDate,
                            endDate || maxDate,
                          ),
                        );
                      }
                    }}
                  >
                    {SCREENING_VALIDATION_MODES.map((value) => (
                      <option
                        value={value}
                        key={value}
                        disabled={
                          researchInterval === INTRADAY_INTERVAL &&
                          value === "rolling"
                        }
                      >
                        {copy.screening.validationModes[value]}
                      </option>
                    ))}
                  </select>
                </label>
              {screeningValidationMode === "sample" && (
                <fieldset className="screening-sample-windows">
                  <legend>{copy.screening.samplePeriodsTitle}</legend>
                  <label className="screening-sample-period-field">
                    <span>
                      {researchInterval === INTRADAY_INTERVAL
                        ? copy.screening.samplePeriodBars
                        : copy.screening.samplePeriodSessions}
                    </span>
                    <CommittedNumberInput
                      name="strategy-sample-period-sessions"
                      min={3}
                      max={maximumSharedRangeSessions}
                      step={1}
                      value={sharedRangeSessions}
                      disabled={screeningBusy}
                      integer
                      onCommit={updateSharedRangeFromSessions}
                    />
                  </label>
                </fieldset>
              )}
              {screeningValidationMode === "multi-range" && (
                <fieldset className="screening-date-windows multi-range">
                  <legend>{copy.screening.multiRangeValidationTitle}</legend>
                  {screeningMultiRanges.map((range, rangeIndex) => (
                    <div className="screening-date-window" key={rangeIndex}>
                      <strong className="screening-period-label">
                        {copy.screening.multiRangePeriod} {rangeIndex + 1}
                      </strong>
                      <label>
                        <span>
                          {researchInterval === INTRADAY_INTERVAL
                            ? copy.lab.startTime
                            : copy.lab.start}
                        </span>
                        <input
                          name={`strategy-screening-multi-range-${rangeIndex}-start`}
                          type={
                            researchInterval === INTRADAY_INTERVAL
                              ? "datetime-local"
                              : "date"
                          }
                          value={workspaceTimeInputValue(
                            range.startTime,
                            researchInterval,
                          )}
                          disabled={screeningBusy}
                          onChange={(event) => {
                            const startTime = marketTimeFromInput(
                              event.target.value,
                            );
                            setScreeningMultiRanges((current) =>
                              current.map((item, index) =>
                                index === rangeIndex
                                  ? { ...item, startTime }
                                  : item,
                              ),
                            );
                          }}
                        />
                      </label>
                      <label>
                        <span>
                          {researchInterval === INTRADAY_INTERVAL
                            ? copy.lab.endTime
                            : copy.lab.end}
                        </span>
                        <input
                          name={`strategy-screening-multi-range-${rangeIndex}-end`}
                          type={
                            researchInterval === INTRADAY_INTERVAL
                              ? "datetime-local"
                              : "date"
                          }
                          value={workspaceTimeInputValue(
                            range.endTime,
                            researchInterval,
                          )}
                          disabled={screeningBusy}
                          onChange={(event) => {
                            const endTime = marketTimeFromInput(
                              event.target.value,
                            );
                            setScreeningMultiRanges((current) =>
                              current.map((item, index) =>
                                index === rangeIndex
                                  ? { ...item, endTime }
                                  : item,
                              ),
                            );
                          }}
                        />
                      </label>
                      {rangeIndex === screeningMultiRanges.length - 1 && (
                        <div className="screening-multi-range-actions">
                          <button
                            type="button"
                            aria-label={copy.screening.multiRangeAdd}
                            title={copy.screening.multiRangeAdd}
                            disabled={screeningBusy || screeningMultiRanges.length >= 8}
                            onClick={() =>
                              setScreeningMultiRanges((current) => [
                                ...current,
                                { startTime: "", endTime: "" },
                              ])
                            }
                          >
                            +
                          </button>
                          <button
                            type="button"
                            aria-label={copy.screening.multiRangeRemove}
                            title={copy.screening.multiRangeRemove}
                            disabled={screeningBusy || screeningMultiRanges.length <= 2}
                            onClick={() =>
                              setScreeningMultiRanges((current) =>
                                current.slice(0, -1),
                              )
                            }
                          >
                            −
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </fieldset>
              )}
              {(screeningValidationMode === "range" ||
                screeningValidationMode === "rolling") && (
                <fieldset
                  className={`screening-date-windows ${
                    screeningValidationMode === "rolling"
                      ? "rolling-range"
                      : "single-range"
                  }`}
                >
                  <legend>
                    {screeningValidationMode === "rolling"
                      ? copy.screening.rollingRangeTitle
                      : copy.screening.rangeValidationTitle}
                  </legend>
                  <div className="screening-date-window">
                    <label>
                      <span>
                        {researchInterval === INTRADAY_INTERVAL
                          ? copy.lab.startTime
                          : copy.lab.start}
                      </span>
                      <input
                        name="strategy-screening-range-start"
                        type={
                          researchInterval === INTRADAY_INTERVAL
                            ? "datetime-local"
                            : "date"
                        }
                        value={workspaceTimeInputValue(
                          screeningCustomRange.startTime || startDate,
                          researchInterval,
                        )}
                        disabled={screeningBusy}
                        onChange={(event) => {
                          setScreeningCustomRange((current) => ({
                            ...current,
                            startTime: marketTimeFromInput(event.target.value),
                          }));
                        }}
                      />
                    </label>
                    <label>
                      <span>
                        {researchInterval === INTRADAY_INTERVAL
                          ? copy.lab.endTime
                          : copy.lab.end}
                      </span>
                      <input
                        name="strategy-screening-range-end"
                        type={
                          researchInterval === INTRADAY_INTERVAL
                            ? "datetime-local"
                            : "date"
                        }
                        value={workspaceTimeInputValue(
                          screeningCustomRange.endTime ||
                            endDate ||
                            maxDate,
                          researchInterval,
                        )}
                        disabled={screeningBusy}
                        onChange={(event) => {
                          setScreeningCustomRange((current) => ({
                            ...current,
                            endTime: marketTimeFromInput(event.target.value),
                          }));
                        }}
                      />
                    </label>
                    <div className="screening-range-session-count">
                      <span>
                        {researchInterval === INTRADAY_INTERVAL
                          ? copy.screening.rangeBars
                          : copy.screening.rangeSessions}
                      </span>
                      <output>
                        {screeningRangeSessions > 0
                          ? screeningRangeSessions
                          : copy.common.unavailable}
                      </output>
                    </div>
                  </div>
                  {screeningValidationMode === "rolling" && (
                    <label className="screening-control-field screening-rolling-window">
                      <span>{copy.screening.rollingWindowYears}</span>
                      <CommittedNumberInput
                        name="strategy-rolling-window-years"
                        min={1}
                        max={30}
                        step={1}
                        value={rollingWindowYears}
                        disabled={screeningBusy}
                        integer
                        onCommit={setRollingWindowYears}
                      />
                    </label>
                  )}
                </fieldset>
              )}
              </fieldset>
            </div>
            <div className="screening-action-field">
              <div className="screening-action-buttons">
                <button
                  type="button"
                  className={`primary-action batch ${
                    shortcutBatchProgress.status === "running" ? "stop" : ""
                  }`}
                  disabled={
                    screening ||
                    savedBacktestsLoading ||
                    savedBacktestGroups.length === 0
                  }
                  onClick={() => void runShortcutBatchScreening()}
                >
                  {shortcutBatchProgress.status === "running" ? (
                    <Square size={14} fill="currentColor" />
                  ) : (
                    <Sparkles size={16} />
                  )}
                  {shortcutBatchProgress.status === "running"
                    ? copy.screening.batchStop
                    : copy.screening.batchAction.replace(
                        "{sessions}",
                        String(shortcutBatchSessions),
                      )}
                </button>
                <button
                  type="button"
                  className={`primary-action ${screening ? "stop" : ""}`}
                  disabled={
                    !series ||
                    screeningBlockedByVolume ||
                    shortcutBatchProgress.status === "running"
                  }
                  onClick={() =>
                    screening ? stopScreening() : void startScreening()
                  }
                >
                  {screening ? (
                    <Square size={14} fill="currentColor" />
                  ) : (
                    <Sparkles size={16} />
                  )}
                  {screening ? copy.screening.stop : copy.screening.action}
                </button>
              </div>
              {!reliableVolume ? (
                <small className="screening-volume-notice" role="status">
                  {copy.screening.volumeLimited}
                </small>
              ) : null}
            </div>
          </div>
          {screeningError && (
            <div className="screening-run-error" role="alert">
              <ShieldAlert size={14} />
              <span>
                {copy.screening.validationErrors[screeningError]}
              </span>
            </div>
          )}
          {(shortcutBatchProgress.status !== "idle" ||
            screenProgress.total > 0) && (
            <div
              className={`screening-progress ${
                shortcutBatchProgress.status !== "idle" ? "batch" : ""
              }`}
              aria-live="polite"
            >
              <div>
                <span>
                  {shortcutBatchProgress.status !== "idle"
                    ? `${copy.screening.batchAction.replace(
                        "{sessions}",
                        String(shortcutBatchSessions),
                      )}${
                        shortcutBatchProgress.currentInstrument
                          ? ` ${copy.common.separator} ${shortcutBatchProgress.currentInstrument}${
                              screenProgress.total > 0
                                ? ` ${copy.common.separator} ${screeningStageLabel}`
                                : ""
                            }`
                          : ""
                      }`
                    : screening
                    ? validationProgress
                      ? `${
                        validationProgress.mode === "rolling"
                          ? `${copy.screening.rollingWindow} ${
                              validationProgress.foldIndex + 1
                            } / ${validationProgress.foldCount} ${copy.common.separator} `
                          : validationProgress.mode === "sample" &&
                              validationProgress.phase === "selection"
                            ? `${copy.screening.sampleWindow} ${
                                validationProgress.foldIndex + 1
                              } / ${validationProgress.foldCount} ${copy.common.separator} `
                          : ""
                        }${
                          validationProgress.phase === "optimization"
                            ? screeningStageLabel
                            : copy.screening.runningValidation
                        }`
                      : screeningStageLabel
                    : screenProgress.completed < screenProgress.total
                      ? copy.screening.stopped
                    : copy.screening.completed}
                </span>
                <strong>
                  {shortcutBatchProgress.status !== "idle"
                    ? copy.screening.batchProgress
                        .replace(
                          "{completed}",
                          String(shortcutBatchProgress.completed),
                        )
                        .replace("{total}", String(shortcutBatchProgress.total))
                        .replace("{saved}", String(shortcutBatchProgress.saved))
                        .replace("{failed}", String(shortcutBatchProgress.failed))
                    : `${
                        validationProgress &&
                        validationProgress.phase !== "optimization"
                          ? validationProgress.completed
                          : screenProgress.stageCompleted
                      } / ${
                        validationProgress &&
                        validationProgress.phase !== "optimization"
                          ? validationProgress.total
                          : screenProgress.stageTotal
                      }${
                        screenProgress.failed > 0
                          ? ` · ${screenProgress.failed} ${copy.screening.skipped}`
                          : ""
                      }`}
                </strong>
              </div>
              <progress
                max={
                  shortcutBatchProgress.status !== "idle"
                    ? Math.max(shortcutBatchProgress.total, 1)
                    : screeningProgressBar.maximum
                }
                value={
                  shortcutBatchProgress.status !== "idle"
                    ? shortcutBatchContinuousProgress
                    : screeningProgressBar.value
                }
              />
              {(screening || shortcutBatchProgress.status === "running") &&
                screenEngineStatus && (
                <small className="screening-engine-status">
                  <span>
                    {copy.screening.engineSpeed}{copy.common.colon}
                    {Math.round(screenEngineStatus.evaluationsPerSecond)} /s
                  </span>
                  <span>
                    {copy.screening.engineEta}{copy.common.colon}
                    {formatScreeningDuration(
                      screenEngineStatus.estimatedRemainingSeconds,
                    )}
                  </span>
                  <span>
                    {copy.screening.engineMemory}{copy.common.colon}
                    {(screenEngineStatus.residentBytes / 1_048_576).toFixed(0)} MB
                  </span>
                  <span>
                    {copy.screening.engineRestarts}{copy.common.colon}
                    {screenEngineStatus.restartCount}
                  </span>
                  {screenEngineStatus.checkpointWriteMilliseconds !== undefined && (
                    <span>
                      {copy.screening.engineCheckpoint}{copy.common.colon}
                      {(screenEngineStatus.checkpointBytes! / 1_048_576).toFixed(1)} MB /{" "}
                      {screenEngineStatus.checkpointWriteMilliseconds.toFixed(0)} ms
                    </span>
                  )}
                </small>
              )}
            </div>
          )}
        </div>

        {validationReport && validationReport.mode !== "sample" && (
          <section className="screening-validation-report">
            <div className="screening-validation-report-heading">
              <div>
                <ShieldAlert size={16} />
                <strong>
                  {
                    copy.screening.validationReportTitles[
                      validationReport.mode
                    ]
                  }
                </strong>
              </div>
              <p>
                {
                  copy.screening.validationResultRules[
                    validationReport.mode
                  ]
                }
              </p>
            </div>
            {validationReport.mode === "range" ? (
              <>
                <div className="screening-validation-windows">
                  <div>
                    <span>{copy.screening.rangeWindow}</span>
                    <strong>
                      {validationReport.range.startTime} —{" "}
                      {validationReport.range.endTime}
                    </strong>
                  </div>
                </div>
                <div className="screening-validation-summary">
                  <div>
                    <span>{copy.screening.selectedCandidate}</span>
                    <strong>
                      {selectedValidationCandidateName(
                        validationReport.selected,
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>{copy.screening.rangeReturn}</span>
                    <strong
                      className={
                        validationReport.performance.totalReturn >= 0
                          ? "positive"
                          : "negative"
                      }
                    >
                      {formatPercent(
                        validationReport.performance.totalReturn,
                        true,
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>{copy.screening.drawdown}</span>
                    <strong className="negative">
                      {formatPercent(
                        validationReport.performance.maxDrawdown,
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>{copy.screening.sharpe}</span>
                    <strong>
                      {formatNumber(
                        validationReport.performance.sharpe,
                      )}
                    </strong>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="screening-validation-summary rolling">
                  <div>
                    <span>{copy.screening.selectedCandidate}</span>
                    <strong>
                      {selectedValidationCandidateName(
                        validationReport.selected,
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>{copy.screening.completedWindows}</span>
                    <strong>{validationReport.folds.length}</strong>
                  </div>
                  <div>
                    <span>{copy.screening.positiveWindows}</span>
                    <strong>
                      {validationReport.positiveFoldCount} /{" "}
                      {validationReport.folds.length}
                    </strong>
                  </div>
                  <div>
                    <span>{copy.screening.averageReturn}</span>
                    <strong
                      className={
                        validationReport.averageReturn >= 0
                          ? "positive"
                          : "negative"
                      }
                    >
                      {formatPercent(
                        validationReport.averageReturn,
                        true,
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>{copy.screening.worstDrawdown}</span>
                    <strong className="negative">
                      {formatPercent(validationReport.worstDrawdown)}
                    </strong>
                  </div>
                </div>
                <details className="screening-fold-details">
                  <summary>{copy.screening.viewRollingDetails}</summary>
                  <div className="results-table-wrap">
                    <table className="results-table">
                      <thead>
                        <tr>
                          <th>{copy.screening.rollingWindow}</th>
                          <th>{copy.screening.return}</th>
                          <th>{copy.screening.drawdown}</th>
                          <th>{copy.screening.sharpe}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validationReport.folds.map((fold) => (
                          <tr
                            key={`${fold.window.startTime}-${fold.window.endTime}`}
                          >
                            <td>
                              {fold.window.startTime} —{" "}
                              {fold.window.endTime}
                              {fold.partial
                                ? ` ${copy.screening.partialWindow}`
                                : ""}
                            </td>
                            <td
                              className={
                                fold.performance.totalReturn >= 0
                                  ? "positive"
                                  : "negative"
                              }
                            >
                              {formatPercent(
                                fold.performance.totalReturn,
                                true,
                              )}
                            </td>
                            <td className="negative">
                              {formatPercent(
                                fold.performance.maxDrawdown,
                              )}
                            </td>
                            <td>
                              {formatNumber(fold.performance.sharpe)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </>
            )}
          </section>
        )}

        {strategyConsensus && (
          <section
            className="strategy-consensus"
            aria-labelledby="strategy-consensus-title"
          >
            <div className="strategy-shortlist-heading">
              <div>
                <Sparkles size={17} />
                <strong id="strategy-consensus-title">
                  {copy.consensus.title}
                </strong>
              </div>
              <p>{copy.consensus.description}</p>
            </div>
            <div className={`strategy-consensus-card ${strategyConsensus.action}`}>
              <span>
                <small>{copy.consensus.advice}</small>
                <strong>{copy.consensus.actions[strategyConsensus.action]}</strong>
              </span>
              <span>
                <small>{copy.consensus.targetPosition}</small>
                <strong>{Math.round(strategyConsensus.targetAllocation * 100)}%</strong>
              </span>
              <span>
                <small>{copy.consensus.confidence}</small>
                <strong>{copy.consensus.confidenceLevels[strategyConsensus.confidence]}</strong>
              </span>
              <span>
                <small>{copy.consensus.agreement}</small>
                <strong>{Math.round(strategyConsensus.agreement * 100)}%</strong>
              </span>
              <p>
                {copy.consensus.evidence.replace(
                  "{count}",
                  String(strategyConsensus.evidenceCount),
                )}{" "}
                {copy.common.separator}{" "}
                {copy.consensus.bullish.replace(
                  "{count}",
                  String(strategyConsensus.bullishCount),
                )}{" "}
                {copy.common.separator}{" "}
                {copy.consensus.bearish.replace(
                  "{count}",
                  String(strategyConsensus.bearishCount),
                )}
              </p>
            </div>
          </section>
        )}

        {strategyShortlist.length > 0 && (
          <section
            className="strategy-shortlist"
            aria-labelledby="strategy-shortlist-title"
          >
            <div className="strategy-shortlist-heading">
              <div>
                <ShieldAlert size={17} />
                <strong id="strategy-shortlist-title">
                  {copy.shortlist.title}
                </strong>
              </div>
              <p>{copy.shortlist.description}</p>
            </div>
            <div className="strategy-shortlist-grid">
              {strategyShortlist.map((entry) => {
                const strategyPresentation =
                  entry.kind === "combination"
                    ? strategyPlanPresentation(
                        entry.plan,
                        entry.result.relativeLongStrategy,
                      )
                    : null;
                const strategyName =
                  entry.kind === "single"
                    ? copy.strategies[entry.result.strategyId].name
                    : strategyPresentation!.shortName;
                const strategyFullName =
                  strategyPresentation?.fullName ?? strategyName;
                const recentExcess = entry.recentReview.recentExcessReturn;
                return (
                  <button
                    className={`strategy-shortlist-card ${entry.role}`}
                    key={entry.key}
                    type="button"
                    aria-label={`${copy.screening.applyToChart}: ${strategyFullName}`}
                    onClick={() => applyShortlistEntry(entry)}
                  >
                    <span className="strategy-shortlist-card-topline">
                      <b>
                        {entry.role === "primary"
                          ? copy.shortlist.primary
                          : entry.role === "secondary"
                            ? `${copy.shortlist.secondary} ${entry.roleIndex}`
                            : `${copy.shortlist.alternative} ${entry.roleIndex}`}
                      </b>
                      <small>
                        {entry.kind === "single"
                          ? copy.shortlist.single
                          : copy.shortlist.combination}
                      </small>
                    </span>
                    <strong
                      className="strategy-shortlist-name"
                      title={strategyFullName}
                    >
                      {strategyName}
                    </strong>
                    <span className="strategy-shortlist-detail">
                      {entry.kind === "single"
                        ? Object.entries(entry.result.parameters)
                            .map(([key, value]) => `${key} ${value}`)
                            .join(` ${copy.common.separator} `)
                        : `A ${Math.round(
                            entry.result.strategyAAllocation * 100,
                          )}% + B ${Math.round(
                            entry.result.strategyBAllocation * 100,
                          )}%${
                            entry.result.strategyCId
                              ? ` + C ${Math.round(
                                  (entry.result.strategyCAllocation ?? 0) * 100,
                                )}%`
                              : ""
                          } ${copy.common.separator} ${
                            copy.lab.tacticalModes[
                              resolveTacticalAllocationMode(
                                entry.result.tacticalMode,
                              )
                            ]
                          }`}
                    </span>
                    <dl className="strategy-shortlist-metrics">
                      <div>
                        <dt>{copy.screening.return}</dt>
                        <dd
                          className={
                            entry.result.totalReturn >= 0
                              ? "positive"
                              : "negative"
                          }
                        >
                          {formatPercent(entry.result.totalReturn, true)}
                        </dd>
                      </div>
                      <div>
                        <dt>{copy.screening.drawdown}</dt>
                        <dd className="negative">
                          {formatPercent(entry.result.maxDrawdown)}
                        </dd>
                      </div>
                      <div>
                        <dt>{copy.screening.sharpe}</dt>
                        <dd>{formatNumber(entry.result.sharpe)}</dd>
                      </div>
                      <div>
                        <dt>{copy.screening.trades}</dt>
                        <dd>{entry.result.tradeCount}</dd>
                      </div>
                    </dl>
                    <span className="strategy-shortlist-review">
                      <b
                        className={`review-${entry.recentReview.status}`}
                      >
                        {
                          copy.shortlist.reviewStatuses[
                            entry.recentReview.status
                          ]
                        }
                      </b>
                      <small>
                        {copy.shortlist.recentExcess}{" "}
                        {recentExcess === null
                          ? copy.common.unavailable
                          : formatPercent(recentExcess, true)}
                      </small>
                    </span>
                    {entry.role !== "primary" && (
                      <span className="strategy-shortlist-similarity">
                        {copy.shortlist.similarity}{" "}
                        <b>
                          {copy.shortlist.similarityLevels[entry.similarity]}
                        </b>
                        {entry.maxCorrelationToSelected !== null && (
                          <small>
                            {copy.shortlist.correlation}{" "}
                            {formatNumber(
                              entry.maxCorrelationToSelected,
                              2,
                            )}
                          </small>
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {strategyShortlistNeedsIndependentDeputies && (
              <p className="strategy-shortlist-independent-warning">
                <ShieldAlert size={14} />
                {copy.shortlist.insufficientDeputies}
              </p>
            )}
            <p className="strategy-shortlist-note">
              <ShieldAlert size={14} />
              {copy.shortlist.note}
            </p>
          </section>
        )}

        <div className="screening-results-stack">
          <details
            className="screening-result-column screening-results"
            open
          >
          <summary className="results-heading">
            <div>
              <Activity size={17} />
              <strong id="single-strategy-results-title">
                {copy.screening.singleResultsTitle}
              </strong>
            </div>
            {screenResults.length > 0 && (
              <span>
                {screenResults.length} {copy.screening.bestResults}
                {" "}
                {copy.common.separator} {screenProgress.completed}{" "}
                {copy.screening.backtests}
              </span>
            )}
          </summary>

          {screenResults.length === 0 ? (
            <div className="screening-empty">
              <BarChart3 size={27} />
              <p>{copy.screening.empty}</p>
            </div>
          ) : (
            <div className="results-table-wrap">
              <table className="results-table">
                <thead>
                  <tr>
                    <th>{copy.screening.rank}</th>
                    <th>{copy.screening.strategy}</th>
                    <th>{copy.screening.return}</th>
                    <th>{copy.screening.drawdown}</th>
                    <th>{copy.screening.sharpe}</th>
                    <th>{copy.screening.trades}</th>
                    <th>{copy.screening.validationPrompt}</th>
                  </tr>
                </thead>
                <tbody>
                  {screenResults.map((result, resultIndex) => {
                    const recentReview = evaluateRecentStrategyEffectiveness(
                      result,
                      series?.bars ?? [],
                    );
                    const shortcutMatch =
                      screeningResultShortcutMatch(result);
                    return (
                    <tr
                      className="clickable-result-row"
                      key={`${result.strategyId}-${JSON.stringify(result.parameters)}`}
                      tabIndex={0}
                      title={copy.screening.applyToChart}
                      aria-label={`${copy.screening.applyToChart}: ${
                        copy.strategies[result.strategyId].name
                      }`}
                      onClick={() =>
                        applySingleStrategy(
                          result.strategyId,
                          result.parameters,
                          result.entryFilter,
                          resolveScreeningResultChartWindows(
                            result,
                            validationReport,
                          ),
                        )
                      }
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        applySingleStrategy(
                          result.strategyId,
                          result.parameters,
                          result.entryFilter,
                          resolveScreeningResultChartWindows(
                            result,
                            validationReport,
                          ),
                        );
                      }}
                    >
                      <td>
                        <span className={`rank rank-${resultIndex + 1}`}>
                          {resultIndex + 1}
                        </span>
                      </td>
                      <td>
                        <div className="strategy-cell">
                          <div className="strategy-name-line">
                            <strong>
                              {copy.strategies[result.strategyId].name}
                            </strong>
                          </div>
                          <small>
                            {Object.entries(result.parameters)
                              .map(([key, value]) => `${key} ${value}`)
                              .join(` ${copy.common.separator} `)}
                          </small>
                          {result.entryFilter && (
                            <small className="result-entry-filter">
                              {formatMovingAverageSlopeFilter(
                                result.entryFilter,
                              )}
                            </small>
                          )}
                          {shortcutMatch && (
                            <small
                              className={`shortcut-match-badge ${shortcutMatch.kind}`}
                              title={shortcutMatchTitle(shortcutMatch)}
                            >
                              {shortcutMatchLabel(shortcutMatch)}
                            </small>
                          )}
                        </div>
                      </td>
                      <td
                        className={
                          result.totalReturn >= 0 ? "positive" : "negative"
                        }
                      >
                        {formatPercent(result.totalReturn, true)}
                      </td>
                      <td className="negative">
                        {formatPercent(result.maxDrawdown)}
                      </td>
                      <td>{formatNumber(result.sharpe)}</td>
                      <td>{result.tradeCount}</td>
                      <td>
                        <span
                              className={`fit-badge review-${recentReview.status}`}
                              title={recentValidationTitle(recentReview)}
                            >
                              {recentValidationLabel(recentReview)}
                        </span>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          </details>

        {[
          {
            key: "dual",
            title: copy.screening.dualResultsTitle,
            results: combinationResultsByCount.get(2) ?? [],
            strategyCount: 2,
          },
          {
            key: "triple",
            title: copy.screening.tripleResultsTitle,
            results: combinationResultsByCount.get(3) ?? [],
            strategyCount: 3,
          },
          {
            key: "quadruple",
            title: copy.screening.quadrupleResultsTitle,
            results: combinationResultsByCount.get(4) ?? [],
            strategyCount: 4,
          },
          {
            key: "quintuple",
            title: copy.screening.quintupleResultsTitle,
            results: combinationResultsByCount.get(5) ?? [],
            strategyCount: 5,
          },
          {
            key: "sextuple",
            title: copy.screening.sextupleResultsTitle,
            results: combinationResultsByCount.get(6) ?? [],
            strategyCount: 6,
          },
        ].map((resultGroup) => (
          <details
            className={`screening-result-column combination-results ${resultGroup.key}-strategy-results`}
            key={resultGroup.key}
            open
          >
            <summary className="results-heading">
              <div>
                <Activity size={17} />
                <strong id={`${resultGroup.key}-strategy-results-title`}>
                  {resultGroup.title}
                </strong>
              </div>
              {resultGroup.results.length > 0 && (
                <span>
                  {resultGroup.results.length}{" "}
                  {copy.combinationScreening.bestResults}
                  {" · "}
                  {screenProgress.completed}{" "}
                  {copy.screening.backtests}
                </span>
              )}
            </summary>

            {resultGroup.results.length === 0 ? (
              <div className="screening-empty combination-empty">
                <BarChart3 size={27} />
                <p>{copy.combinationScreening.empty}</p>
              </div>
            ) : (
              <>
                <div className="results-table-wrap">
                  <table className="results-table combination-table">
                    <thead>
                      <tr>
                        <th>{copy.screening.rank}</th>
                        {resultGroup.strategyCount === 2 ? (
                          <>
                            <th>{copy.combinationScreening.strategyA}</th>
                            <th>{copy.combinationScreening.strategyB}</th>
                          </>
                        ) : (
                          <th>{copy.combinationScreening.strategyGroup}</th>
                        )}
                        <th>
                          {resultGroup.strategyCount >= 3
                            ? copy.combinationScreening.decisionWeights
                            : copy.combinationScreening.allocationPlan}
                        </th>
                        <th>{copy.screening.return}</th>
                        <th>{copy.screening.drawdown}</th>
                        <th>{copy.screening.sharpe}</th>
                        <th>{copy.combinationScreening.rebalances}</th>
                        <th>{copy.screening.validationPrompt}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultGroup.results.map((result, resultIndex) => {
                        const recentReview =
                          evaluateRecentStrategyEffectiveness(
                            result,
                            series?.bars ?? [],
                          );
                        const shortcutMatch =
                          screeningResultShortcutMatch(result);
                        const resultPresentation = strategyPlanPresentation(
                          combinationResultPlan(result),
                          result.relativeLongStrategy,
                        );
                        const strategyRoleLabel = (slot: StrategySlot) =>
                          resultGroup.strategyCount >= 3
                            ? result.relativeLongStrategy === slot
                              ? copy.combinationScreening.primarySignal
                              : copy.combinationScreening.supportingSignal
                            : result.relativeLongStrategy === slot
                              ? copy.strategyHorizons.long
                              : copy.strategyHorizons.short;
                        return (
                        <tr
                          className="clickable-result-row"
                          key={combinationResultKey(result)}
                          tabIndex={0}
                          title={copy.screening.applyToChart}
                          aria-label={`${copy.screening.applyToChart}: ${resultPresentation.fullName}`}
                          onClick={() =>
                            applyCombinationResult(
                              result,
                              resolveScreeningResultChartWindows(
                                result,
                                validationReport,
                              ),
                            )
                          }
                          onKeyDown={(event) => {
                            if (
                              event.key !== "Enter" &&
                              event.key !== " "
                            ) {
                              return;
                            }
                            event.preventDefault();
                            applyCombinationResult(
                              result,
                              resolveScreeningResultChartWindows(
                                result,
                                validationReport,
                              ),
                            );
                          }}
                        >
                          <td>
                            <span className={`rank rank-${resultIndex + 1}`}>
                              {resultIndex + 1}
                            </span>
                          </td>
                          {resultGroup.strategyCount === 2 ? (
                            <>
                          <td>
                            <div className="strategy-cell">
                              <div className="strategy-name-line">
                                <strong>
                                  {copy.strategies[result.strategyAId].name}
                                </strong>
                                <span
                                  className={`horizon-badge ${
                                    result.relativeLongStrategy === "strategyA"
                                      ? "long"
                                      : "short"
                                  }`}
                                >
                                  {strategyRoleLabel("strategyA")}
                                </span>
                              </div>
                              <small>
                                {Object.entries(result.strategyAParameters)
                                  .map(
                                    ([key, value]) => `${key} ${value}`,
                                  )
                                  .join(` ${copy.common.separator} `)}
                              </small>
                              {result.strategyAEntryFilter && (
                                <small className="result-entry-filter">
                                  {formatMovingAverageSlopeFilter(
                                    result.strategyAEntryFilter,
                                  )}
                                </small>
                              )}
                              {shortcutMatch && (
                                <small
                                  className={`shortcut-match-badge ${shortcutMatch.kind}`}
                                  title={shortcutMatchTitle(shortcutMatch)}
                                >
                                  {shortcutMatchLabel(shortcutMatch)}
                                </small>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="strategy-cell">
                              <div className="strategy-name-line">
                                <strong>
                                  {copy.strategies[result.strategyBId].name}
                                </strong>
                                <span
                                  className={`horizon-badge ${
                                    result.relativeLongStrategy === "strategyB"
                                      ? "long"
                                      : "short"
                                  }`}
                                >
                                  {strategyRoleLabel("strategyB")}
                                </span>
                              </div>
                              <small>
                                {Object.entries(result.strategyBParameters)
                                  .map(
                                    ([key, value]) => `${key} ${value}`,
                                  )
                                  .join(` ${copy.common.separator} `)}
                              </small>
                              {result.strategyBEntryFilter && (
                                <small className="result-entry-filter">
                                  {formatMovingAverageSlopeFilter(
                                    result.strategyBEntryFilter,
                                  )}
                                </small>
                              )}
                            </div>
                          </td>
                            </>
                          ) : (
                            <td className="multi-strategy-summary-cell">
                              <div className="strategy-cell">
                                <div className="strategy-name-line">
                                  <strong title={resultPresentation.fullName}>
                                    {resultPresentation.shortName}
                                  </strong>
                                </div>
                                <small
                                  className="multi-strategy-other-names"
                                  title={resultPresentation.fullName}
                                >
                                  {copy.combinationScreening.otherStrategies}
                                  {copy.common.colon}
                                  {resultPresentation.otherNames.join(
                                    ` ${copy.common.separator} `,
                                  )}
                                </small>
                                {shortcutMatch && (
                                  <small
                                    className={`shortcut-match-badge ${shortcutMatch.kind}`}
                                    title={shortcutMatchTitle(shortcutMatch)}
                                  >
                                    {shortcutMatchLabel(shortcutMatch)}
                                  </small>
                                )}
                              </div>
                            </td>
                          )}
                          <td>
                            <div className="allocation-plan-cell">
                              <strong>
                                {resultGroup.strategyCount >= 3 ? (
                                  <>
                                    A {Math.round(result.strategyAAllocation * 100)}%
                                    {` ${copy.common.separator} `}
                                    {copy.combinationScreening.otherAllocation}{" "}
                                    {Math.round((1 - result.strategyAAllocation) * 100)}%
                                  </>
                                ) : (
                                  <>
                                    A {Math.round(result.strategyAAllocation * 100)}%
                                    {" + "}B {Math.round(result.strategyBAllocation * 100)}%
                                  </>
                                )}
                              </strong>
                              <small>
                                {resultGroup.strategyCount >= 3
                                  ? copy.combinationScreening.consensusPosition
                                  : `${copy.combinationScreening.maximumHolding} ${Math.round(
                                      (result.strategyAAllocation +
                                        result.strategyBAllocation) * 100,
                                    )}%`}
                              </small>
                              <small>
                                {resultGroup.strategyCount >= 3
                                  ? copy.combinationScreening.weightedConsensus
                                  :
                                  copy.lab.tacticalModes[
                                    resolveTacticalAllocationMode(
                                      result.tacticalMode,
                                    )
                                  ]
                                }
                              </small>
                            </div>
                          </td>
                          <td
                            className={
                              result.totalReturn >= 0
                                ? "positive"
                                : "negative"
                            }
                          >
                            {formatPercent(result.totalReturn, true)}
                          </td>
                          <td className="negative">
                            {formatPercent(result.maxDrawdown)}
                          </td>
                          <td>{formatNumber(result.sharpe)}</td>
                          <td>{result.tradeCount}</td>
                          <td>
                            <span
                              className={`fit-badge review-${recentReview.status}`}
                              title={recentValidationTitle(recentReview)}
                            >
                              {recentValidationLabel(recentReview)}
                            </span>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

              </>
            )}
          </details>
        ))}
        </div>
        {(screenResults.length > 0 || combinationResults.length > 0) && (
          <p className="screening-results-note">
            <ShieldAlert size={14} />
            {copy.screening.validationNote}
          </p>
        )}
      </section>
      </section>

      <footer className="app-footer">
        <span>{copy.footer}</span>
        <strong>{copy.researchOnly}</strong>
      </footer>
    </main>
  );
}
