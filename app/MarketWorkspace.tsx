"use client";

import {
  Activity,
  BarChart3,
  Bookmark,
  CandlestickChart,
  ChevronDown,
  ChevronRight,
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
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react";
import { BacktestChart } from "./components/BacktestChart";
import {
  PriceChart,
  type ChartIndicatorConfiguration,
  type ChartStrategyConfiguration,
  type StrategyLineLabels,
} from "./components/PriceChart";
import { zhCN as copy } from "./i18n/zh-CN";
import {
  runAllocationBacktest,
  runBacktest,
  type AllocationBacktestResult,
  type BacktestResult,
  type BacktestSettings,
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
  indicatorConfigurationsEqual,
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
  STRATEGIES,
  VOLUME_REQUIRED_STRATEGY_IDS,
  areStrategiesEquivalent,
  getStrategy,
  strategyRequiresVolume,
  type StrategyId,
  type StrategyParameters,
} from "@/lib/analysis/strategies";
import {
  DEFAULT_STRATEGY_A_ALLOCATION,
  DEFAULT_STRATEGY_B_ALLOCATION,
  DEFAULT_TACTICAL_ALLOCATION_MODE,
  STRATEGY_LAYER_ALLOCATION_CANDIDATES,
  TACTICAL_ALLOCATION_MODES,
  TWO_STRATEGY_ALLOCATION_CANDIDATES,
  buildLiveAllocationGuidance,
  buildStrategyPlanTimeline,
  resolveTacticalAllocationMode,
  type CombinationScreeningProgress,
  type StrategyAllocationPlan,
  type StrategyCombinationResult,
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
  createSaveScreeningRunInput,
  fingerprintMarketSeries,
  type ScreeningRunRecord,
} from "@/lib/analysis/screening-runs";
import {
  DEFAULT_STRATEGY_SHORTLIST_DEPUTY_COUNT,
  evaluateRecentStrategyEffectiveness,
  selectStrategyShortlist,
  type RecentEffectivenessReview,
  type StrategyShortlistEntry,
} from "@/lib/analysis/strategy-shortlist";
import {
  MAX_SAVED_BACKTEST_SCROLL_RECORDS,
  SAVED_BACKTEST_ROLLING_SESSIONS,
  canReuseSavedBacktestMarketSeries,
  createSaveBacktestInput,
  findStrategyShortcutMatch,
  groupSavedBacktests,
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
  buildStrategyLinkedPaneIndicators,
  mergeChartIndicatorConfigurations,
} from "@/lib/analysis/strategy-indicators";
import {
  buildAllocationTradeMarkers,
  buildTradeMarkers,
} from "@/lib/analysis/trade-markers";
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
const INTRADAY_HISTORY_LIMIT = 1_500;
const HISTORICAL_EXECUTION_POLICY = "hybrid" as const;
const DEFAULT_COMMISSION_PERCENT = 0.05;
const STRATEGY_ALLOCATION_OPTIONS = STRATEGY_LAYER_ALLOCATION_CANDIDATES.map(
  (allocation) => allocation * 100,
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

function cloneStrategyPlan(
  plan: StrategyAllocationPlan | null,
): StrategyAllocationPlan | null {
  if (!plan) return null;
  return {
    strategyA: plan.strategyA
      ? {
          strategyId: plan.strategyA.strategyId,
          parameters: { ...plan.strategyA.parameters },
        }
      : null,
    strategyB: plan.strategyB
      ? {
          strategyId: plan.strategyB.strategyId,
          parameters: { ...plan.strategyB.parameters },
        }
      : null,
    strategyAAllocation: plan.strategyAAllocation,
    strategyBAllocation: plan.strategyBAllocation,
    tacticalMode: resolveTacticalAllocationMode(plan.tacticalMode),
    strategyAEntryFilter: cloneMovingAverageSlopeFilter(
      plan.strategyAEntryFilter ?? plan.entryFilter,
    ),
    strategyBEntryFilter: cloneMovingAverageSlopeFilter(
      plan.strategyBEntryFilter ?? plan.entryFilter,
    ),
  };
}

function defaultAppliedStrategyPlan(): StrategyAllocationPlan {
  return {
    strategyA: {
      strategyId: "sma-cross",
      parameters: { ...getStrategy("sma-cross").defaultParameters },
    },
    strategyB: null,
    strategyAAllocation: 1,
    strategyBAllocation: 0,
    tacticalMode: DEFAULT_TACTICAL_ALLOCATION_MODE,
    strategyAEntryFilter: null,
    strategyBEntryFilter: null,
  };
}

function strategyPlanEntryFilter(
  plan: StrategyAllocationPlan,
  slot: "strategyA" | "strategyB",
): MovingAverageSlopeFilter | null {
  return cloneMovingAverageSlopeFilter(
    slot === "strategyA"
      ? plan.strategyAEntryFilter ?? plan.entryFilter
      : plan.strategyBEntryFilter ?? plan.entryFilter,
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

const updateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const cacheTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

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
    Boolean(plan.strategyA) !== Boolean(plan.strategyB)
      ? (plan.strategyA ?? plan.strategyB)
      : null;
  const usesSingleFullAllocation =
    Boolean(singleSelection) &&
    (plan.strategyA
      ? plan.strategyAAllocation === 1
      : plan.strategyBAllocation === 1);
  if (usesSingleFullAllocation && singleSelection) {
    const entryFilter = plan.strategyA
      ? plan.strategyAEntryFilter ?? plan.entryFilter
      : plan.strategyBEntryFilter ?? plan.entryFilter;
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
  return [plan.strategyA, plan.strategyB].some(
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

function singleResultPlan(result: ScreeningSingleResult): StrategyAllocationPlan {
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

function combinationResultPlan(
  result: ScreeningCombinationResult,
): StrategyAllocationPlan {
  return {
    strategyA: {
      strategyId: result.strategyAId,
      parameters: { ...result.strategyAParameters },
    },
    strategyB: {
      strategyId: result.strategyBId,
      parameters: { ...result.strategyBParameters },
    },
    strategyAAllocation: result.strategyAAllocation,
    strategyBAllocation: result.strategyBAllocation,
    tacticalMode: resolveTacticalAllocationMode(result.tacticalMode),
    strategyAEntryFilter: result.strategyAEntryFilter ?? null,
    strategyBEntryFilter: result.strategyBEntryFilter ?? null,
  };
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
  if (review.status === "insufficient") {
    return `${copy.screening.validationDetails.recentExecutions} ${review.executionCount} / 2 ${copy.screening.validationDetails.executionUnit} ${copy.common.separator} ${copy.screening.validationStatuses.insufficient}`;
  }
  return copy.screening.validationStatuses[review.status];
}

function shortcutMatchTitle(match: StrategyShortcutMatch): string {
  if (match.kind === "exact") return copy.screening.shortcutMatch.exact;
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

function CommittedNumberInput({
  value,
  onCommit,
  min,
  max,
  step,
  name,
  disabled = false,
  integer = false,
  normalize,
}: {
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  name?: string;
  disabled?: boolean;
  integer?: boolean;
  normalize?: (value: number) => number;
}) {
  const [draft, setDraft] = useState(String(value));
  const editingRef = useRef(false);

  useEffect(() => {
    if (!editingRef.current) setDraft(String(value));
  }, [value]);

  const restore = () => setDraft(String(value));
  const commit = () => {
    editingRef.current = false;
    const parsed = draft.trim() === "" ? Number.NaN : Number(draft);
    if (!Number.isFinite(parsed)) {
      restore();
      return;
    }
    let nextValue = integer ? Math.floor(parsed) : parsed;
    if (min !== undefined) nextValue = Math.max(nextValue, min);
    if (max !== undefined) nextValue = Math.min(nextValue, max);
    if (normalize) nextValue = normalize(nextValue);
    setDraft(String(nextValue));
    onCommit(nextValue);
  };

  return (
    <input
      name={name}
      type="number"
      value={draft}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onFocus={(event) => {
        editingRef.current = true;
        event.currentTarget.select();
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          editingRef.current = false;
          restore();
          event.currentTarget.blur();
        }
      }}
    />
  );
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

function createMovingAverageSlopeFilterDraft(
  filter?: MovingAverageSlopeFilter | null,
): MovingAverageSlopeFilterDraft {
  return {
    ...(filter ?? DEFAULT_MOVING_AVERAGE_SLOPE_FILTER),
    enabled: Boolean(filter),
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
  const [researchInterval, setResearchInterval] =
    useState<WorkspaceInterval>(DAILY_INTERVAL);
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
  const [strategyAId, setStrategyAId] = useState<StrategyId | "">(
    "sma-cross",
  );
  const [strategyAParameters, setStrategyAParameters] =
    useState<StrategyParameters>(
    getStrategy("sma-cross").defaultParameters,
  );
  const [strategyBId, setStrategyBId] = useState<StrategyId | "">("");
  const [strategyBParameters, setStrategyBParameters] =
    useState<StrategyParameters>({});
  const [appliedStrategyPlan, setAppliedStrategyPlan] =
    useState<StrategyAllocationPlan | null>(defaultAppliedStrategyPlan);
  const [strategyAEntryFilterDraft, setStrategyAEntryFilterDraft] = useState(
    () => createMovingAverageSlopeFilterDraft(),
  );
  const [strategyBEntryFilterDraft, setStrategyBEntryFilterDraft] = useState(
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
    useState<ScreeningObjective>("balanced");
  const [screenResultsObjective, setScreenResultsObjective] =
    useState<ScreeningObjective>("balanced");
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
  const [rollingWindowYears, setRollingWindowYears] = useState(
    DEFAULT_ROLLING_WINDOW_YEARS,
  );
  const [validationProgress, setValidationProgress] =
    useState<ScreeningValidationProgress | null>(null);
  const [validationReport, setValidationReport] =
    useState<ScreeningValidationReport | null>(null);
  const [screenProgress, setScreenProgress] =
    useState<CombinationScreeningProgress>(emptyCombinationProgress);
  const [combinationResults, setCombinationResults] = useState<
    ScreeningCombinationResult[]
  >([]);
  const [strategyAAllocationPercent, setStrategyAAllocationPercent] = useState(
    DEFAULT_STRATEGY_A_ALLOCATION * 100,
  );
  const [strategyBAllocationPercent, setStrategyBAllocationPercent] = useState(
    DEFAULT_STRATEGY_B_ALLOCATION * 100,
  );
  const [tacticalAllocationMode, setTacticalAllocationMode] =
    useState<TacticalAllocationMode>(DEFAULT_TACTICAL_ALLOCATION_MODE);
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
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const indicatorMenusRef = useRef<HTMLDivElement>(null);
  const chartSectionRef = useRef<HTMLElement>(null);
  const screeningAbortRef = useRef<AbortController | null>(null);
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
  const strategyLinkedIndicators = useMemo(
    () => buildStrategyLinkedPaneIndicators(appliedStrategyPlan),
    [appliedStrategyPlan],
  );
  const chartIndicators = useMemo(
    () =>
      mergeChartIndicatorConfigurations(
        visibleIndicators,
        strategyLinkedIndicators,
      ),
    [strategyLinkedIndicators, visibleIndicators],
  );
  const savedBacktestGroups = useMemo(
    () => groupSavedBacktests(savedBacktests),
    [savedBacktests],
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
    activeSavedBacktestGroup?.records.some((record) =>
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
            currentSeries ? "latest" : "history",
            currentSeries ? 10 : seriesLimit,
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
          const backup = await recoverFromBackupSources(
            retained ? "latest" : "history",
            retained ? 10 : seriesLimit,
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
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(canonicalizeSearchQuery(query))}`,
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
    if (!strategyAId && !strategyBId) return null;
    const dualStrategy = Boolean(strategyAId && strategyBId);
    const strategyAAllocation = strategyAId
      ? dualStrategy
        ? Math.min(Math.max(strategyAAllocationPercent / 100, 0), 1)
        : 1
      : 0;
    const strategyBAllocation = strategyBId
      ? dualStrategy
        ? Math.min(
            Math.max(strategyBAllocationPercent / 100, 0),
            1 - strategyAAllocation,
          )
        : 1
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
      strategyAAllocation,
      strategyBAllocation,
      tacticalMode: tacticalAllocationMode,
      strategyAEntryFilter: activeMovingAverageSlopeFilter(
        strategyAEntryFilterDraft,
      ),
      strategyBEntryFilter: activeMovingAverageSlopeFilter(
        strategyBEntryFilterDraft,
      ),
    };
  }, [
    strategyAParameters,
    strategyAAllocationPercent,
    strategyAId,
    strategyBParameters,
    strategyBAllocationPercent,
    strategyBId,
    strategyAEntryFilterDraft,
    strategyBEntryFilterDraft,
    tacticalAllocationMode,
  ]);
  const singleSelection =
    strategyPlan &&
    Boolean(strategyPlan.strategyA) !== Boolean(strategyPlan.strategyB)
      ? (strategyPlan.strategyA ?? strategyPlan.strategyB)
      : null;
  const strategyPlanVolumeUnavailable = Boolean(
    strategyPlan && !reliableVolume && strategyPlanRequiresVolume(strategyPlan),
  );
  const usesSingleFullAllocation =
    Boolean(singleSelection) &&
    (strategyPlan?.strategyA
      ? strategyPlan.strategyAAllocation === 1
      : strategyPlan?.strategyBAllocation === 1);
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
  const appliedSingleSelection =
    appliedStrategyPlan &&
    Boolean(appliedStrategyPlan.strategyA) !==
      Boolean(appliedStrategyPlan.strategyB)
      ? (appliedStrategyPlan.strategyA ?? appliedStrategyPlan.strategyB)
      : null;
  const appliedUsesSingleFullAllocation =
    Boolean(appliedSingleSelection) &&
    (appliedStrategyPlan?.strategyA
      ? appliedStrategyPlan.strategyAAllocation === 1
      : appliedStrategyPlan?.strategyBAllocation === 1);
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
        startTime: startDate || series.bars[0].time,
        endTime: endDate || series.bars.at(-1)!.time,
      });
    } catch {
      return null;
    }
  }, [
    appliedStrategyPlan,
    appliedStrategyPlanVolumeUnavailable,
    endDate,
    series,
    startDate,
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
                appliedStrategyPlan.strategyA
                  ? "strategyA"
                  : "strategyB",
              ),
            )
          : null;
      const orderPrices = [
        appliedStrategyPlan.strategyA
          ? {
              slot: "A",
              selection: appliedStrategyPlan.strategyA,
            }
          : null,
        appliedStrategyPlan.strategyB
          ? {
              slot: "B",
              selection: appliedStrategyPlan.strategyB,
            }
          : null,
      ].flatMap((item) => {
        if (!item) return [];
        const guidance = buildLiveStrategyGuidance(
          series.bars,
          item.selection.strategyId,
          item.selection.parameters,
          series.latestBarStatus,
          strategyPlanEntryFilter(
            appliedStrategyPlan,
            item.slot === "A" ? "strategyA" : "strategyB",
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
            slot: item.slot,
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
  const lastUpdatedAt = series?.fetchedAt
    ? cacheTimeFormatter.format(new Date(series.fetchedAt))
    : null;
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
  const appliedBacktest = useMemo<
    BacktestResult | AllocationBacktestResult | null
  >(() => {
    if (
      !series?.bars.length ||
      !startDate ||
      !endDate ||
      !appliedStrategyPlan ||
      appliedStrategyPlanVolumeUnavailable
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
        entryFilter: appliedStrategyPlan.strategyA
          ? strategyPlanEntryFilter(
              appliedStrategyPlan,
              "strategyA",
            )
          : strategyPlanEntryFilter(
              appliedStrategyPlan,
              "strategyB",
            ),
      } as const;
      if (appliedUsesSingleFullAllocation && appliedSingleSelection) {
        return runBacktest(
          series.bars,
          appliedSingleSelection.strategyId,
          appliedSingleSelection.parameters,
          settings,
        );
      }
      const timeline =
        appliedStrategyTimeline ??
        buildStrategyPlanTimeline(series.bars, appliedStrategyPlan, {
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
    appliedSingleSelection,
    appliedStrategyPlan,
    appliedStrategyPlanVolumeUnavailable,
    appliedStrategyTimeline,
    appliedUsesSingleFullAllocation,
    commissionPercent,
    endDate,
    initialCash,
    researchInterval,
    series,
    slippagePercent,
    startDate,
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
        ? [
            ...(appliedStrategyPlan.strategyA
              ? [
                  {
                    id: appliedStrategyPlan.strategyA.strategyId,
                    parameters: appliedStrategyPlan.strategyA.parameters,
                    lineLabels: chartStrategyLineLabels(
                      appliedStrategyPlan.strategyA.strategyId,
                      appliedRelativeLongStrategy === "strategyB"
                        ? "short"
                        : "long",
                    ),
                  },
                ]
              : []),
            ...(appliedStrategyPlan.strategyB
              ? [
                  {
                    id: appliedStrategyPlan.strategyB.strategyId,
                    parameters: appliedStrategyPlan.strategyB.parameters,
                    lineLabels: chartStrategyLineLabels(
                      appliedStrategyPlan.strategyB.strategyId,
                      appliedRelativeLongStrategy === "strategyB"
                        ? "long"
                        : "short",
                    ),
                  },
                ]
              : []),
          ]
        : [],
    [
      appliedRelativeLongStrategy,
      appliedStrategyPlan,
      appliedStrategyPlanVolumeUnavailable,
    ],
  );
  const appliedTradeMarkers = appliedBacktest
    ? "rebalances" in appliedBacktest
      ? buildAllocationTradeMarkers(appliedBacktest.rebalances)
      : buildTradeMarkers(
          appliedBacktest.trades,
          appliedBacktest.openPosition,
        )
    : undefined;

  const scrollToStrategyChart = () => {
    window.requestAnimationFrame(() =>
      chartSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }),
    );
  };

  const applyCurrentStrategyToChart = () => {
    setAppliedStrategyPlan(cloneStrategyPlan(strategyPlan));
    scrollToStrategyChart();
  };

  const applySingleStrategy = (
    nextStrategyId: StrategyId,
    nextParameters?: StrategyParameters,
    entryFilter?: MovingAverageSlopeFilter | null,
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
    setStrategyAAllocationPercent(100);
    setStrategyBAllocationPercent(0);
    setTacticalAllocationMode(DEFAULT_TACTICAL_ALLOCATION_MODE);
    setStrategyAEntryFilterDraft(
      createMovingAverageSlopeFilterDraft(entryFilter),
    );
    setStrategyBEntryFilterDraft(
      createMovingAverageSlopeFilterDraft(),
    );
    setAppliedStrategyPlan({
      strategyA: {
        strategyId: nextStrategyId,
        parameters: { ...mergedParameters },
      },
      strategyB: null,
      strategyAAllocation: 1,
      strategyBAllocation: 0,
      tacticalMode: DEFAULT_TACTICAL_ALLOCATION_MODE,
      strategyAEntryFilter: cloneMovingAverageSlopeFilter(entryFilter),
      strategyBEntryFilter: null,
    });
    scrollToStrategyChart();
  };

  const selectStrategyA = (nextStrategyId: StrategyId | "") => {
    if (
      nextStrategyId &&
      strategyBId &&
      areStrategiesEquivalent(nextStrategyId, strategyBId)
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
      if (strategyBId) setStrategyBAllocationPercent(100);
    } else if (strategyBId) {
      const nextAllocation = nearestDualAllocation(
        strategyAAllocationPercent,
        strategyBAllocationPercent,
      );
      setStrategyAAllocationPercent(nextAllocation.strategyA);
      setStrategyBAllocationPercent(nextAllocation.strategyB);
    } else {
      setStrategyAAllocationPercent(100);
    }
  };

  const selectStrategyB = (nextStrategyId: StrategyId | "") => {
    if (
      nextStrategyId &&
      strategyAId &&
      areStrategiesEquivalent(nextStrategyId, strategyAId)
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
      if (strategyAId) setStrategyAAllocationPercent(100);
    } else if (strategyAId) {
      const nextAllocation = nearestDualAllocation(
        strategyAAllocationPercent,
        strategyBAllocationPercent ||
          DEFAULT_STRATEGY_B_ALLOCATION * 100,
      );
      setStrategyAAllocationPercent(nextAllocation.strategyA);
      setStrategyBAllocationPercent(nextAllocation.strategyB);
    } else {
      setStrategyBAllocationPercent(100);
    }
  };

  const selectStrategyAAllocation = (nextStrategyAAllocation: number) => {
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

  const applyCombinationResult = (result: StrategyCombinationResult) => {
    setStrategyAId(result.strategyAId);
    setStrategyAParameters({ ...result.strategyAParameters });
    setStrategyBId(result.strategyBId);
    setStrategyBParameters({ ...result.strategyBParameters });
    setStrategyAAllocationPercent(
      Math.round(result.strategyAAllocation * 100),
    );
    setStrategyBAllocationPercent(
      Math.round(result.strategyBAllocation * 100),
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
    setAppliedStrategyPlan({
      strategyA: {
        strategyId: result.strategyAId,
        parameters: { ...result.strategyAParameters },
      },
      strategyB: {
        strategyId: result.strategyBId,
        parameters: { ...result.strategyBParameters },
      },
      strategyAAllocation: result.strategyAAllocation,
      strategyBAllocation: result.strategyBAllocation,
      tacticalMode: resolveTacticalAllocationMode(result.tacticalMode),
      strategyAEntryFilter: cloneMovingAverageSlopeFilter(
        result.strategyAEntryFilter,
      ),
      strategyBEntryFilter: cloneMovingAverageSlopeFilter(
        result.strategyBEntryFilter,
      ),
    });
    scrollToStrategyChart();
  };

  const applyShortlistEntry = (entry: StrategyShortlistEntry) => {
    if (entry.kind === "single") {
      applySingleStrategy(
        entry.result.strategyId,
        entry.result.parameters,
        entry.result.entryFilter,
      );
      return;
    }
    applyCombinationResult(entry.result);
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
    if (!appliedBacktest || !appliedStrategyPlan) return;
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
            datePart(startDate),
            datePart(endDate),
            initialCash,
            commissionPercent,
            slippagePercent,
            appliedBacktest,
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

  const resetScreening = () => {
    screeningAbortRef.current?.abort();
    screeningAbortRef.current = null;
    setScreening(false);
    setScreeningError("");
    setScreenResults([]);
    setCombinationResults([]);
    setValidationProgress(null);
    setValidationReport(null);
    setScreenProgress(emptyCombinationProgress());
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

  const chooseResearchInterval = (nextInterval: WorkspaceInterval) => {
    if (nextInterval === researchInterval) return;
    resetScreening();
    clearMarketSeries();
    sharedRangeRef.current = { startDate: "", endDate: "" };
    setScreeningCustomRange(DEFAULT_SCREENING_CUSTOM_RANGE);
    if (
      nextInterval === INTRADAY_INTERVAL &&
      screeningValidationMode === "rolling"
    ) {
      setScreeningValidationMode("sample");
    }
    setResearchInterval(nextInterval);
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
    const savedWorkspaceInterval =
      saved.interval === INTRADAY_INTERVAL
        ? INTRADAY_INTERVAL
        : DAILY_INTERVAL;
    const restoredStrategyB =
      saved.plan.strategyA &&
      saved.plan.strategyB &&
      areStrategiesEquivalent(
        saved.plan.strategyA.strategyId,
        saved.plan.strategyB.strategyId,
      )
        ? null
        : saved.plan.strategyB;
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
      resetScreening();
    }
    if (!sameCanonicalInstrument) {
      clearMarketSeries();
      setInstrument(saved.instrument);
    } else if (!reusesCurrentSeries) {
      clearMarketSeries();
      setRefreshVersion((value) => value + 1);
    }
    if (researchInterval !== savedWorkspaceInterval) {
      sharedRangeRef.current = { startDate: "", endDate: "" };
      setResearchInterval(savedWorkspaceInterval);
    }
    setVisibleIndicatorIds(saved.indicators.map((indicator) => indicator.id));
    setIndicatorSettings((current) => {
      const next = { ...current };
      for (const indicator of saved.indicators) {
        next[indicator.id] = { ...indicator.parameters };
      }
      return next;
    });
    setFocusedIndicator(saved.indicators[0]?.id ?? "sma");
    setStrategyAId(saved.plan.strategyA?.strategyId ?? "");
    setStrategyAParameters(
      saved.plan.strategyA ? { ...saved.plan.strategyA.parameters } : {},
    );
    setStrategyBId(restoredStrategyB?.strategyId ?? "");
    setStrategyBParameters(
      restoredStrategyB ? { ...restoredStrategyB.parameters } : {},
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
    setTacticalAllocationMode(
      resolveTacticalAllocationMode(saved.plan.tacticalMode),
    );
    const savedStrategyAAllocation = Math.round(
      saved.plan.strategyAAllocation * 100,
    );
    const savedStrategyBAllocation = Math.round(
      saved.plan.strategyBAllocation * 100,
    );
    let restoredStrategyAAllocation = 0;
    let restoredStrategyBAllocation = 0;
    if (saved.plan.strategyA && restoredStrategyB) {
      const nextAllocation = nearestDualAllocation(
        savedStrategyAAllocation,
        savedStrategyBAllocation,
      );
      restoredStrategyAAllocation = nextAllocation.strategyA;
      restoredStrategyBAllocation = nextAllocation.strategyB;
      setStrategyAAllocationPercent(nextAllocation.strategyA);
      setStrategyBAllocationPercent(nextAllocation.strategyB);
    } else if (saved.plan.strategyA) {
      restoredStrategyAAllocation = 100;
      setStrategyAAllocationPercent(100);
      setStrategyBAllocationPercent(0);
    } else {
      restoredStrategyBAllocation = 100;
      setStrategyAAllocationPercent(0);
      setStrategyBAllocationPercent(100);
    }
    setAppliedStrategyPlan({
      strategyA: saved.plan.strategyA
        ? {
            strategyId: saved.plan.strategyA.strategyId,
            parameters: { ...saved.plan.strategyA.parameters },
          }
        : null,
      strategyB: restoredStrategyB
        ? {
            strategyId: restoredStrategyB.strategyId,
            parameters: { ...restoredStrategyB.parameters },
          }
        : null,
      strategyAAllocation: restoredStrategyAAllocation / 100,
      strategyBAllocation: restoredStrategyBAllocation / 100,
      tacticalMode: resolveTacticalAllocationMode(saved.plan.tacticalMode),
      strategyAEntryFilter: strategyPlanEntryFilter(
        saved.plan,
        "strategyA",
      ),
      strategyBEntryFilter: strategyPlanEntryFilter(
        saved.plan,
        "strategyB",
      ),
    });
    setInitialCash(saved.initialCash);
    setCommissionPercent(saved.commissionPercent);
    setSlippagePercent(saved.slippagePercent);
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
    const sections: Array<{
      folder: SavedBacktestFolder | null;
      records: SavedBacktestRecord[];
    }> = folders.map((folder) => ({
      folder,
      records: group.records.filter(
        (record) => record.strategyFolderId === folder.id,
      ),
    }));
    const unfiledRecords = group.records.filter(
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
    event.stopPropagation();
    if (
      savedBacktestDrag?.kind !== "folder" ||
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
      savedBacktestDrag?.kind !== "group" ||
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
      savedBacktestDrag?.kind !== "record" ||
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

  const startScreening = async () => {
    if (!series?.bars.length) return;
    if (screeningBlockedByVolume) {
      setScreeningError("volume-unavailable");
      return;
    }
    const runObjective = screeningObjective;
    const latestDate = series.bars.at(-1)!.time;
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
    setScreening(true);
    setScreeningError("");
    setScreenResults([]);
    setCombinationResults([]);
    setValidationProgress(null);
    setValidationReport(null);
    setScreenProgress(emptyCombinationProgress());
    try {
      const outcome = await runScreeningInWorker(
        series.bars,
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
          entryFilters: screeningEntryFilterDraft.enabled
            ? buildScreeningMovingAverageSlopeFilters()
            : undefined,
          excludedStrategyIds: reliableVolume
            ? undefined
            : VOLUME_REQUIRED_STRATEGY_IDS,
          signal: controller.signal,
          onProgress: setScreenProgress,
          onValidationProgress: setValidationProgress,
        },
      );

      if (screeningAbortRef.current !== controller) return;
      setScreenResults(outcome.singleResults);
      setCombinationResults(outcome.results);
      setScreenResultsObjective(runObjective);
      setValidationReport(outcome.validationReport);
      setScreenProgress((current) => ({
        ...current,
        completed: outcome.evaluatedCount,
        total: outcome.totalCandidates,
        failed: outcome.failedCount,
      }));
      try {
        const dataFingerprint = await fingerprintMarketSeries(series);
        if (controller.signal.aborted) return;
        const archiveInput = createSaveScreeningRunInput(
          series,
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
    resetScreening();
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
          : 3,
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
      evaluations: Array<{
        id: number;
        performance: BacktestResult | AllocationBacktestResult;
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
  const savedBacktestRecentReviews = useMemo(
    () =>
      new Map(
        savedBacktestRollingGroups.flatMap((group) =>
          group.evaluations.map((evaluation) => [
            evaluation.id,
            evaluateRecentStrategyEffectiveness(
              evaluation.performance,
              group.marketSeries.bars,
            ),
          ] as const),
        ),
      ),
    [savedBacktestRollingGroups],
  );

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
  const activeShortcutRecords =
    activeSavedBacktestGroup?.records.filter(
      (record) => record.interval === researchInterval,
    ) ?? [];
  const screeningResultShortcutMatch = (
    result: ScreeningSingleResult | ScreeningCombinationResult,
  ) =>
    findStrategyShortcutMatch(
      "strategyId" in result
        ? singleResultPlan(result)
        : combinationResultPlan(result),
      activeShortcutRecords,
    );
  const strategyShortlist = useMemo(
    () =>
      selectStrategyShortlist(
        screenResults,
        combinationResults,
        series?.bars ?? [],
        {
          objective: screenResultsObjective,
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
  const selectedValidationCandidateName = (
    reference: ScreeningCandidateReference,
  ) => {
    const strategyAName = copy.strategies[reference.strategyAId].name;
    return reference.strategyBId
      ? `${strategyAName} + ${copy.strategies[reference.strategyBId].name}`
      : strategyAName;
  };
  const selectedStrategySummary = [
    ...(strategyPlan?.strategyA
      ? [copy.strategies[strategyPlan.strategyA.strategyId].name]
      : []),
    ...(strategyPlan?.strategyB
      ? [copy.strategies[strategyPlan.strategyB.strategyId].name]
      : []),
  ].join(" + ");
  const appliedStrategySummary = [
    ...(appliedStrategyPlan?.strategyA
      ? [copy.strategies[appliedStrategyPlan.strategyA.strategyId].name]
      : []),
    ...(appliedStrategyPlan?.strategyB
      ? [copy.strategies[appliedStrategyPlan.strategyB.strategyId].name]
      : []),
  ].join(" + ");
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

        <div className="source-pill">
          <span className="live-dot" />
          {copy.marketDelayed}
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

        <div
          className={`live-guidance-card ${liveGuidance?.action ?? "loading"}`}
          aria-live="polite"
        >
          <span>{copy.liveGuidance.title}</span>
          <strong>
            {liveGuidance
              ? `${copy.liveGuidance.actions[liveGuidance.action]} ${Math.round(
                  liveGuidance.targetAllocation * 100,
                )}%`
              : copy.liveGuidance.calculating}
          </strong>
          <small>
            {liveGuidance
              ? `${copy.liveGuidance.descriptions[liveGuidance.action]} ${copy.common.separator} ${liveGuidance.barTime}`
              : copy.liveGuidance.waitingForData}
          </small>
          {series?.fetchedAt && lastUpdatedAt && (
            <small>
              {copy.liveGuidance.lastUpdated} ·{" "}
              <time dateTime={series.fetchedAt}>{lastUpdatedAt}</time>
              {" · "}
              {copy.liveGuidance.source} ·{" "}
              {copy.sources[series.source]}
            </small>
          )}
          {liveGuidance?.orderPrices.map((order) => (
            <small key={order.slot}>
              {[
                order.entryPrice !== null
                  ? `${order.slot} ${copy.liveGuidance.todayEntryPrice} ${formatNumber(
                      order.entryPrice,
                    )}`
                  : null,
                order.exitPrice !== null
                  ? `${order.slot} ${copy.liveGuidance.todayExitPrice} ${formatNumber(
                      order.exitPrice,
                    )}`
                  : null,
                order.pendingNextOpenAction
                  ? `${order.slot} ${
                      copy.liveGuidance.pendingNextOpen[
                        order.pendingNextOpenAction
                      ]
                    }`
                  : null,
                order.entryBlockedByFilter
                  ? `${order.slot} ${copy.liveGuidance.entryBlockedByFilter}`
                  : null,
              ]
                .filter(Boolean)
                .join(` ${copy.common.separator} `)}
            </small>
          ))}
          {liveGuidance?.entryBlockedByFilter &&
            !liveGuidance.orderPrices.some(
              (order) => order.entryBlockedByFilter,
            ) && (
              <small className="live-guidance-entry-blocked" role="status">
                {copy.liveGuidance.entryBlockedByFilter}
              </small>
            )}
          {shortcutRefreshStatusText ? (
            <small
              className="market-refresh-status"
              role="status"
              aria-live="polite"
            >
              {shortcutRefreshStatusText}
            </small>
          ) : null}
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
          <div
            className="toolbar-group chart-interval-tabs"
            role="group"
            aria-label={copy.chart.intervalMode}
          >
            <button
              type="button"
              className={researchInterval === DAILY_INTERVAL ? "active" : ""}
              aria-pressed={researchInterval === DAILY_INTERVAL}
              onClick={() => chooseResearchInterval(DAILY_INTERVAL)}
            >
              {copy.intervals[DAILY_INTERVAL]}
            </button>
            <button
              type="button"
              className={
                researchInterval === INTRADAY_INTERVAL ? "active" : ""
              }
              aria-pressed={researchInterval === INTRADAY_INTERVAL}
              onClick={() => chooseResearchInterval(INTRADAY_INTERVAL)}
            >
              {copy.intervals[INTRADAY_INTERVAL]}
            </button>
          </div>
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
                <small>
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
                       {researchInterval === INTRADAY_INTERVAL
                         ? copy.chart.latestIntradayBarStatus[
                             series.latestBarStatus
                           ]
                         : copy.chart.latestBarStatus[
                             series.latestBarStatus
                           ]}
                     </span>
                     <span>
                      {copy.marketStats.asOf} {lastUpdated}
                    </span>
                    <span>
                      {researchInterval === INTRADAY_INTERVAL
                        ? copy.liveGuidance.intradayAutoRefresh
                        : copy.liveGuidance.autoRefresh}
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
               <PriceChart
                bars={series.bars}
                trades={
                  appliedBacktest && "trades" in appliedBacktest
                    ? appliedBacktest.trades
                    : []
                }
                tradeMarkers={appliedTradeMarkers}
                dataKey={`${activeInstrument.provider}:${activeInstrument.secid}:${researchInterval}`}
                chartType={chartType}
                visibleIndicators={chartIndicators}
                strategyConfigurations={strategyConfigurations}
                ariaLabel={copy.chart.aria}
                labels={priceChartLabels}
               />
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
                disabled={!appliedBacktest || saveStatus === "saving"}
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
                          onClick={() =>
                            toggleSavedBacktestGroup(group.key)
                          }
                          aria-expanded={expanded}
                          aria-controls={groupPanelId}
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
                            {group.records.length}
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
                                      {strategySection.records.map((saved) => {
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
                            const indicatorsActive =
                              indicatorConfigurationsEqual(
                                saved.indicators,
                                visibleIndicators,
                              );
                            const strategyLabel = [
                              saved.plan.strategyA
                                ? copy.strategies[
                                    saved.plan.strategyA.strategyId
                                  ].name
                                : null,
                              saved.plan.strategyB
                                ? copy.strategies[
                                    saved.plan.strategyB.strategyId
                                  ].name
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" + ");
                            const recordDropKey = `record:${saved.id}`;
                            const rollingMetrics =
                              savedBacktestRollingMetrics.get(saved.id) ??
                              null;
                            const recentReview =
                              savedBacktestRecentReviews.get(saved.id) ??
                              null;
                            const displayedReturn =
                              resolveSavedBacktestReturnDisplay(
                                rollingMetrics,
                                saved.metrics,
                                saved.rollingTotalReturn,
                              );
                            const addedAt = cacheTimeFormatter.format(
                              new Date(saved.createdAt),
                            );
                            const savedStrategyAEntryFilter =
                              strategyPlanEntryFilter(
                                saved.plan,
                                "strategyA",
                              );
                            const savedStrategyBEntryFilter =
                              strategyPlanEntryFilter(
                                saved.plan,
                                "strategyB",
                              );
                            const savedEntryFilterSummary = [
                              saved.plan.strategyA &&
                              savedStrategyAEntryFilter
                                ? `A ${formatMovingAverageSlopeFilter(
                                    savedStrategyAEntryFilter,
                                  )}`
                                : null,
                              saved.plan.strategyB &&
                              savedStrategyBEntryFilter
                                ? `B ${formatMovingAverageSlopeFilter(
                                    savedStrategyBEntryFilter,
                                  )}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" / ");
                            return (
                              <div
                                className={`saved-shortcut ${
                                  active && indicatorsActive
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
                                  aria-label={`${copy.savedBacktests.reorderRecord} ${strategyLabel}`}
                                >
                                  <GripVertical size={12} />
                                </button>
                                <button
                                  className="saved-shortcut-main"
                                  type="button"
                                  onClick={() => openSavedBacktest(saved)}
                                  aria-label={`${copy.savedBacktests.open} ${group.instrument.name} ${strategyLabel} ${copy.savedBacktests.addedAt} ${addedAt}`}
                                >
                                  <span className="saved-shortcut-name">
                                    <strong>{strategyLabel}</strong>
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
                                  <small>
                                    {copy.savedBacktests.addedAt} ·{" "}
                                    <time dateTime={saved.createdAt}>
                                      {addedAt}
                                    </time>
                                  </small>
                                  {recentReview && (
                                    <small
                                      className={`saved-shortcut-validation review-${recentReview.status}`}
                                      title={recentValidationTitle(recentReview)}
                                    >
                                      {recentValidationLabel(recentReview)}
                                    </small>
                                  )}
                                  {saved.plan.strategyA &&
                                    saved.plan.strategyB && (
                                      <>
                                        <small>
                                          A{" "}
                                          {Math.round(
                                            saved.plan
                                              .strategyAAllocation * 100,
                                          )}
                                          % + B{" "}
                                          {Math.round(
                                            saved.plan
                                              .strategyBAllocation * 100,
                                          )}
                                          %
                                        </small>
                                        <small>
                                          {
                                            copy.lab.tacticalModes[
                                              resolveTacticalAllocationMode(
                                                saved.plan.tacticalMode,
                                              )
                                            ]
                                          }
                                        </small>
                                      </>
                                    )}
                                  {saved.indicators.length > 0 && (
                                    <small>
                                      {copy.savedBacktests.indicatorsPrefix}{" "}
                                      {saved.indicators
                                        .map(
                                          (indicator) =>
                                            copy.indicators[indicator.id].short,
                                        )
                                        .join(" + ")}
                                    </small>
                                  )}
                                  {savedEntryFilterSummary.length > 0 && (
                                    <small>
                                      {copy.entryFilter.savedPrefix}{" "}
                                      {savedEntryFilterSummary}
                                    </small>
                                  )}
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
                {strategyAId && strategyBId && relativeLongStrategy && (
                  <span
                    className={`horizon-badge ${
                      relativeLongStrategy === "strategyA" ? "long" : "short"
                    }`}
                  >
                    A ·{" "}
                    {relativeLongStrategy === "strategyA"
                      ? copy.lab.relativeLong
                      : copy.lab.relativeShort}
                  </span>
                )}
                {strategyAId && strategyBId && relativeLongStrategy && (
                  <span
                    className={`horizon-badge ${
                      relativeLongStrategy === "strategyB" ? "long" : "short"
                    }`}
                  >
                    B ·{" "}
                    {relativeLongStrategy === "strategyB"
                      ? copy.lab.relativeLong
                      : copy.lab.relativeShort}
                    </span>
                )}
              </div>
              <div className="lab-heading-actions">
                <button
                  className="apply-current-strategy-button"
                  type="button"
                  onClick={applyCurrentStrategyToChart}
                  disabled={!strategyPlan || strategyPlanVolumeUnavailable}
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
                  {STRATEGIES.map((strategy) => (
                    <option
                      key={strategy.id}
                      value={strategy.id}
                      disabled={
                        (!reliableVolume &&
                          strategyRequiresVolume(strategy.id)) ||
                        (strategyBId
                          ? areStrategiesEquivalent(strategy.id, strategyBId)
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
                  {STRATEGIES.map((strategy) => (
                    <option
                      key={strategy.id}
                      value={strategy.id}
                      disabled={
                        (!reliableVolume &&
                          strategyRequiresVolume(strategy.id)) ||
                        (strategyAId
                          ? areStrategiesEquivalent(strategy.id, strategyAId)
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
                disabled={!strategyAId || !strategyBId}
                onChange={(event) =>
                  selectStrategyAAllocation(Number(event.target.value))
                }
              >
                {!strategyAId ? (
                  <option value={0}>0%</option>
                ) : !strategyBId ? (
                  <option value={100}>100%</option>
                ) : (
                  STRATEGY_ALLOCATION_OPTIONS.map((allocation) => (
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
                disabled={!strategyAId || !strategyBId}
                onChange={(event) =>
                  selectStrategyBAllocation(Number(event.target.value))
                }
              >
                {!strategyBId ? (
                  <option value={0}>0%</option>
                ) : !strategyAId ? (
                  <option value={100}>100%</option>
                ) : (
                  STRATEGY_ALLOCATION_OPTIONS.map((allocation) => (
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
                disabled={!strategyAId || !strategyBId}
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
            <BacktestChart
              result={backtest}
              ariaLabel={copy.chart.backtestAria}
              labels={backtestChartLabels}
            />
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
                      setScreeningValidationMode(
                        event.target.value as ScreeningValidationMode,
                      );
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
              <button
                type="button"
                className={`primary-action ${screening ? "stop" : ""}`}
                disabled={!series || screeningBlockedByVolume}
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
          {screenProgress.total > 0 && (
            <div className="screening-progress" aria-live="polite">
              <div>
                <span>
                  {screening
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
                            ? screenProgress.stage === "strategies"
                              ? copy.combinationScreening.runningStrategies
                              : screenProgress.stage === "entryFilters"
                                ? copy.combinationScreening
                                    .runningEntryFilters
                                : screenProgress.stage === "pairs"
                                  ? copy.combinationScreening.runningPairs
                                  : copy.combinationScreening
                                      .runningAllocations
                            : copy.screening.runningValidation
                        }`
                      : screenProgress.stage === "strategies"
                        ? copy.combinationScreening.runningStrategies
                        : screenProgress.stage === "entryFilters"
                          ? copy.combinationScreening.runningEntryFilters
                          : screenProgress.stage === "pairs"
                            ? copy.combinationScreening.runningPairs
                            : copy.combinationScreening.runningAllocations
                    : screenProgress.completed < screenProgress.total
                      ? copy.screening.stopped
                    : copy.screening.completed}
                </span>
                <strong>
                  {validationProgress &&
                  validationProgress.phase !== "optimization"
                    ? validationProgress.completed
                    : screenProgress.stageCompleted}{" "}
                  /{" "}
                  {validationProgress &&
                  validationProgress.phase !== "optimization"
                    ? validationProgress.total
                    : screenProgress.stageTotal}
                  {screenProgress.failed > 0
                    ? ` · ${screenProgress.failed} ${copy.screening.skipped}`
                    : ""}
                </strong>
              </div>
              <progress
                max={screeningProgressBar.maximum}
                value={screeningProgressBar.value}
              />
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
                const strategyName =
                  entry.kind === "single"
                    ? copy.strategies[entry.result.strategyId].name
                    : `${copy.strategies[entry.result.strategyAId].name} + ${
                        copy.strategies[entry.result.strategyBId].name
                      }`;
                const recentExcess = entry.recentReview.recentExcessReturn;
                return (
                  <button
                    className={`strategy-shortlist-card ${entry.role}`}
                    key={entry.key}
                    type="button"
                    aria-label={`${copy.screening.applyToChart}: ${strategyName}`}
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
                    <strong className="strategy-shortlist-name">
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
                          )}% ${copy.common.separator} ${
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

        <div className="screening-results-grid">
          <section
            className="screening-result-column screening-results"
            aria-labelledby="single-strategy-results-title"
          >
          <div className="results-heading">
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
          </div>

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
                    <th>{copy.screening.strategy}</th>
                    <th>{copy.screening.return}</th>
                    <th>{copy.screening.drawdown}</th>
                    <th>{copy.screening.sharpe}</th>
                    <th>{copy.screening.trades}</th>
                    <th>{copy.screening.validationPrompt}</th>
                  </tr>
                </thead>
                <tbody>
                  {screenResults.map((result) => {
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
                        )
                      }
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        applySingleStrategy(
                          result.strategyId,
                          result.parameters,
                          result.entryFilter,
                        );
                      }}
                    >
                      <td>
                        <div className="strategy-cell">
                          <div className="strategy-name-line">
                            <strong>
                              {copy.strategies[result.strategyId].name}
                            </strong>
                            <span
                              className={`horizon-badge ${getStrategy(result.strategyId).horizon}`}
                            >
                              {
                                copy.strategyHorizons[
                                  getStrategy(result.strategyId).horizon
                                ]
                              }
                            </span>
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
                              {shortcutMatchTitle(shortcutMatch)}
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
          </section>

        <section
          className="screening-result-column combination-results"
          aria-labelledby="combination-strategy-results-title"
        >
            <div className="results-heading">
              <div>
                <Activity size={17} />
                <strong id="combination-strategy-results-title">
                  {copy.screening.combinationResultsTitle}
                </strong>
              </div>
              {combinationResults.length > 0 && (
                <span>
                  {combinationResults.length}{" "}
                  {copy.combinationScreening.bestResults}
                  {" · "}
                  {screenProgress.completed}{" "}
                  {copy.screening.backtests}
                </span>
              )}
            </div>

            {combinationResults.length === 0 ? (
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
                        <th>{copy.combinationScreening.strategyA}</th>
                        <th>{copy.combinationScreening.strategyB}</th>
                        <th>{copy.combinationScreening.allocationPlan}</th>
                        <th>{copy.screening.return}</th>
                        <th>{copy.screening.drawdown}</th>
                        <th>{copy.screening.sharpe}</th>
                        <th>{copy.combinationScreening.rebalances}</th>
                        <th>{copy.screening.validationPrompt}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {combinationResults.map((result) => {
                        const recentReview =
                          evaluateRecentStrategyEffectiveness(
                            result,
                            series?.bars ?? [],
                          );
                        const shortcutMatch =
                          screeningResultShortcutMatch(result);
                        return (
                        <tr
                          className="clickable-result-row"
                          key={`${result.strategyAId}-${result.strategyBId}-${result.strategyAAllocation}-${result.strategyBAllocation}-${resolveTacticalAllocationMode(result.tacticalMode)}`}
                          tabIndex={0}
                          title={copy.screening.applyToChart}
                          aria-label={`${copy.screening.applyToChart}: ${
                            copy.strategies[result.strategyAId].name
                          } + ${copy.strategies[result.strategyBId].name}`}
                          onClick={() => applyCombinationResult(result)}
                          onKeyDown={(event) => {
                            if (
                              event.key !== "Enter" &&
                              event.key !== " "
                            ) {
                              return;
                            }
                            event.preventDefault();
                            applyCombinationResult(result);
                          }}
                        >
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
                                  {result.relativeLongStrategy === "strategyA"
                                    ? copy.lab.relativeLong
                                    : copy.lab.relativeShort}
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
                                  {shortcutMatchTitle(shortcutMatch)}
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
                                  {result.relativeLongStrategy === "strategyB"
                                    ? copy.lab.relativeLong
                                    : copy.lab.relativeShort}
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
                          <td>
                            <div className="allocation-plan-cell">
                              <strong>
                                A{" "}
                                {Math.round(
                                  result.strategyAAllocation * 100,
                                )}
                                %
                                {" + "}
                                B{" "}
                                {Math.round(
                                  result.strategyBAllocation * 100,
                                )}
                                %
                              </strong>
                              <small>
                                {copy.combinationScreening.maximumHolding}{" "}
                                {Math.round(
                                  (result.strategyAAllocation +
                                    result.strategyBAllocation) *
                                    100,
                                )}%
                              </small>
                              <small>
                                {
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
        </section>
        </div>
      </section>
      </section>

      <footer className="app-footer">
        <span>{copy.footer}</span>
        <strong>{copy.researchOnly}</strong>
      </footer>
    </main>
  );
}
