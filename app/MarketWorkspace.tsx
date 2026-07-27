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
  GripVertical,
  LineChart,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  Sparkles,
  Square,
  Trash2,
  Trophy,
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
  type BacktestPerformance,
  type BacktestResult,
  type BacktestSettings,
} from "@/lib/analysis/backtest";
import {
  INDICATOR_PREFERENCES_STORAGE_KEY,
  INDICATORS,
  createDefaultIndicatorSettings,
  getDefaultIndicatorParameters,
  getIndicator,
  indicatorConfigurationsEqual,
  parseIndicatorWorkspacePreferences,
  type IndicatorId,
} from "@/lib/analysis/indicator-registry";
import {
  SCREENING_OBJECTIVES,
  isIntegerStrategyParameterKey,
  normalizeStrategyParameterInput,
  screeningObjectiveValue,
  yieldForScreening,
  type ScreeningObjective,
} from "@/lib/analysis/screening";
import {
  STRATEGIES,
  areStrategiesEquivalent,
  getStrategy,
  type StrategyId,
  type StrategyParameters,
} from "@/lib/analysis/strategies";
import {
  DEFAULT_STRATEGY_A_ALLOCATION,
  DEFAULT_STRATEGY_B_ALLOCATION,
  STRATEGY_LAYER_ALLOCATION_CANDIDATES,
  TWO_STRATEGY_ALLOCATION_CANDIDATES,
  buildLiveAllocationGuidance,
  buildStrategyPlanTimeline,
  type CombinationScreeningProgress,
  type StrategyAllocationPlan,
  type StrategyCombinationResult,
} from "@/lib/analysis/strategy-combinations";
import {
  DEFAULT_ROLLING_WINDOW_YEARS,
  DEFAULT_SAMPLE_VALIDATION_PERIODS,
  DEFAULT_SAMPLE_VALIDATION_SESSIONS,
  SCREENING_VALIDATION_MODES,
  ScreeningValidationError,
  resolveTradingSessionRange,
  resolveTrailingTradingSessionRange,
  runScreeningWithValidation,
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
import {
  DEFAULT_STRATEGY_SHORTLIST_DEPUTY_COUNT,
  selectStrategyShortlist,
  type StrategyShortlistEntry,
} from "@/lib/analysis/strategy-shortlist";
import {
  MAX_SAVED_BACKTEST_SCROLL_RECORDS,
  canReuseSavedBacktestMarketSeries,
  createSaveBacktestInput,
  groupSavedBacktests,
  reorderSavedBacktestGroups,
  reorderSavedBacktestsWithinGroup,
  savedBacktestInstrumentKey,
  strategyPlansEqual,
  type SavedBacktestRecord,
} from "@/lib/analysis/saved-backtests";
import { buildLiveStrategyGuidance } from "@/lib/analysis/live-guidance";
import { buildAllocationTradeMarkers } from "@/lib/analysis/trade-markers";
import {
  analyzeStrategyStability,
  type StabilityEvidence,
  type StabilityEvidenceReason,
} from "@/lib/analysis/stability";
import type {
  MarketBar,
  MarketInstrument,
  MarketInterval,
  MarketSeries,
} from "@/lib/market/types";
import { DAILY_HISTORY_LIMIT } from "@/lib/market/history";
import { mergeLatestMarketSeries } from "@/lib/market/series";
import {
  readCachedMarketSeriesEntry,
  writeCachedMarketSeries,
} from "@/lib/market/client-cache";
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
  secid: "100.N225",
  code: "N225",
  name: copy.defaultInstrument.name,
  exchange: "JPX",
  assetType: "index",
  provider: "eastmoney",
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

const relativeLongStrategyLineLabels: StrategyLineLabels = {
  prefix: copy.chart.strategyLines.longPrefix,
  roles: { ...copy.chart.strategyLines.roles },
};

const relativeShortStrategyLineLabels: StrategyLineLabels = {
  prefix: copy.chart.strategyLines.shortPrefix,
  roles: { ...copy.chart.strategyLines.roles },
};

const backtestChartLabels = {
  equity: copy.chart.equity,
  drawdown: copy.chart.drawdown,
};

const DAILY_INTERVAL: MarketInterval = "1d";
const HISTORICAL_EXECUTION_POLICY = "hybrid" as const;
const STRATEGY_ALLOCATION_OPTIONS = STRATEGY_LAYER_ALLOCATION_CANDIDATES.map(
  (allocation) => allocation * 100,
);
const DUAL_ALLOCATION_OPTIONS = TWO_STRATEGY_ALLOCATION_CANDIDATES.map(
  ({ strategyAAllocation, strategyBAllocation }) => ({
    strategyA: strategyAAllocation * 100,
    strategyB: strategyBAllocation * 100,
  }),
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
    entryFilter: cloneMovingAverageSlopeFilter(plan.entryFilter),
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
    entryFilter: null,
  };
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

const LIVE_REFRESH_INTERVAL_MS = 60_000;

type SavedBacktestDragState =
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
    return runBacktest(
      bars,
      singleSelection.strategyId,
      singleSelection.parameters,
      settings,
    );
  }
  const timeline = buildStrategyPlanTimeline(bars, plan, settings);
  return runAllocationBacktest(
    bars,
    timeline.target,
    settings,
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
  ].includes(key);
}

function parameterStep(key: string) {
  if (key === "tick") return 0.01;
  if (isIntegerStrategyParameterKey(key)) return 1;
  return isDecimalParameter(key) ? 0.1 : 1;
}

function resultTone(result: BacktestPerformance) {
  return result.totalReturn > 0 && result.sharpe > 0 && result.tradeCount >= 2
    ? "positive"
    : "neutral";
}

type ScreeningCautionReason = keyof typeof copy.screening.cautionReasons;

function resultCautionReasons(
  result: BacktestPerformance,
): ScreeningCautionReason[] {
  const reasons: ScreeningCautionReason[] = [];
  if (result.totalReturn <= 0) reasons.push("return");
  if (result.sharpe <= 0) reasons.push("sharpe");
  if (result.tradeCount < 2) reasons.push("trades");
  return reasons;
}

function resultStatusTitle(result: BacktestPerformance) {
  const reasons = resultCautionReasons(result);
  if (reasons.length === 0) return copy.screening.suitableReason;
  return `${copy.screening.cautionReason}${copy.common.colon}${reasons
    .map((reason) => copy.screening.cautionReasons[reason])
    .join(` ${copy.common.separator} `)}`;
}

function formatObjectiveValue(
  result: BacktestPerformance,
  objective: ScreeningObjective,
) {
  const value = screeningObjectiveValue(result, objective);
  if (objective === "totalReturn") return formatPercent(value, true);
  return formatNumber(value, 2);
}

function rankingPerformance(
  result: ScreeningSingleResult | ScreeningCombinationResult,
): BacktestPerformance {
  return result.screeningValidation?.rankingPerformance ?? result;
}

function selectionScore(
  result: ScreeningSingleResult | ScreeningCombinationResult,
): number | null {
  return result.screeningValidation?.selectionScore ?? null;
}

function formatSelectionValue(
  result: ScreeningSingleResult | ScreeningCombinationResult,
  objective: ScreeningObjective,
) {
  const score = selectionScore(result);
  return score === null
    ? formatObjectiveValue(rankingPerformance(result), objective)
    : formatNumber(score, 2);
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
) {
  if (reason === "invalid-parameters") {
    return copy.stability.evidenceReasons.invalidParameters;
  }
  if (reason === "insufficient-observations") {
    return `${copy.stability.evidenceReasons.insufficientObservations} ${evidence.observationCount} / ${evidence.minimumObservationCount}`;
  }
  if (reason === "insufficient-trades") {
    return `${copy.stability.evidenceReasons.insufficientTrades} ${evidence.tradeCount} / ${evidence.minimumTradeCount}`;
  }
  return copy.stability.evidenceReasons.noNearbyVariants;
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
        <small>{copy.lab.automatic}</small>
      </div>
      <div className="parameter-grid">
        {Object.entries(parameters).map(([key, value]) => (
          <label className="field-label" key={key}>
            <span>
              {copy.parameters[key as keyof typeof copy.parameters] ?? key}
            </span>
            <input
              name={`${namePrefix}-${key}`}
              type="number"
              value={value}
              min={
                isIntegerStrategyParameterKey(key)
                  ? 1
                  : key === "tick"
                    ? 0
                    : undefined
              }
              step={parameterStep(key)}
              onChange={(event) =>
                onChange({
                  ...parameters,
                  [key]: normalizeStrategyParameterInput(
                    key,
                    Number(event.target.value),
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
}: {
  draft: MovingAverageSlopeFilterDraft;
  namePrefix: string;
  onChange: (draft: MovingAverageSlopeFilterDraft) => void;
  disabled?: boolean;
  context: "lab" | "screening";
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
            <span>{copy.entryFilter.period}</span>
            <output>
              {SCREENING_MOVING_AVERAGE_SLOPE_PERIODS[0]}
              {"–"}
              {SCREENING_MOVING_AVERAGE_SLOPE_PERIODS.at(-1)}
            </output>
          </label>
          <label>
            <span>{copy.entryFilter.minimumSlope}</span>
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
            <span>{copy.entryFilter.period}</span>
            <input
              name={`${namePrefix}-period`}
              type="number"
              min={2}
              max={MAX_MOVING_AVERAGE_SLOPE_PERIOD}
              step={1}
              value={draft.period}
              disabled={controlsDisabled}
              onChange={(event) => {
                const value = Number(event.target.value);
                onChange({
                  ...draft,
                  period: Math.min(
                    Math.max(
                      Number.isFinite(value) ? Math.floor(value) : 2,
                      2,
                    ),
                    MAX_MOVING_AVERAGE_SLOPE_PERIOD,
                  ),
                });
              }}
            />
          </label>
          <label>
            <span>{copy.entryFilter.minimumSlope}</span>
            <input
              name={`${namePrefix}-minimum-slope`}
              type="number"
              step={0.01}
              value={draft.minimumSlopePercent}
              disabled={controlsDisabled}
              onChange={(event) => {
                const value = Number(event.target.value);
                onChange({
                  ...draft,
                  minimumSlopePercent: Number.isFinite(value)
                    ? value
                    : 0,
                });
              }}
            />
          </label>
        </div>
      )}
      <small>
        {draft.enabled
          ? context === "screening"
            ? copy.entryFilter.screeningHint
            : copy.entryFilter.hint
          : copy.entryFilter.disabledHint}
      </small>
    </fieldset>
  );
}

export function MarketWorkspace() {
  const [instrument, setInstrument] =
    useState<MarketInstrument>(defaultInstrument);
  const [seriesState, setSeries] = useState<MarketSeries | null>(null);
  const series = isMarketSeries(seriesState) ? seriesState : null;
  const [chartType, setChartType] = useState<"candlestick" | "line">(
    "candlestick",
  );
  const [focusedIndicator, setFocusedIndicator] =
    useState<IndicatorId>("sma");
  const [visibleIndicatorIds, setVisibleIndicatorIds] = useState<IndicatorId[]>(
    [],
  );
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
  const [strategyEntryFilterDraft, setStrategyEntryFilterDraft] = useState(
    () => createMovingAverageSlopeFilterDraft(),
  );
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [initialCash, setInitialCash] = useState(100_000);
  const [commissionPercent, setCommissionPercent] = useState(0.03);
  const [slippagePercent, setSlippagePercent] = useState(0.02);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MarketInstrument[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorCode, setErrorCode] = useState("");
  const [cachedPreviewAt, setCachedPreviewAt] = useState<number | null>(
    null,
  );
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [screening, setScreening] = useState(false);
  const [screeningError, setScreeningError] = useState<
    ScreeningValidationErrorCode | "run" | ""
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
    () => createMovingAverageSlopeFilterDraft(),
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
  const [savedBacktests, setSavedBacktests] = useState<
    SavedBacktestRecord[]
  >([]);
  const [savedBacktestsLoading, setSavedBacktestsLoading] = useState(true);
  const [savedBacktestsError, setSavedBacktestsError] = useState(false);
  const [expandedSavedBacktestGroups, setExpandedSavedBacktestGroups] =
    useState<string[]>([]);
  const [savedBacktestDrag, setSavedBacktestDrag] =
    useState<SavedBacktestDragState | null>(null);
  const [savedBacktestDropTarget, setSavedBacktestDropTarget] = useState("");
  const [savedBacktestOrderSaving, setSavedBacktestOrderSaving] =
    useState(false);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const chartSectionRef = useRef<HTMLElement>(null);
  const screeningAbortRef = useRef<AbortController | null>(null);
  const currentSeriesKeyRef = useRef("");
  const latestSeriesDateRef = useRef("");
  const marketSeriesRef = useRef<MarketSeries | null>(null);
  const cachedSeriesActiveRef = useRef(false);
  const sharedRangeSessionsRef = useRef(
    DEFAULT_SAMPLE_VALIDATION_SESSIONS,
  );
  const sharedRangeRef = useRef({ startDate: "", endDate: "" });
  const activeIndicator = getIndicator(focusedIndicator);
  const indicatorParameters = indicatorSettings[focusedIndicator];
  const focusedIndicatorVisible =
    visibleIndicatorIds.includes(focusedIndicator);
  const visibleIndicators = useMemo<readonly ChartIndicatorConfiguration[]>(
    () =>
      visibleIndicatorIds.map((id) => ({
        id,
        parameters: indicatorSettings[id],
      })),
    [indicatorSettings, visibleIndicatorIds],
  );
  const savedBacktestGroups = useMemo(
    () => groupSavedBacktests(savedBacktests),
    [savedBacktests],
  );

  const fetchMarket = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setErrorCode("");
      const seriesKey = `${instrument.provider}:${instrument.secid}:${DAILY_INTERVAL}`;
      const seriesLimit = DAILY_HISTORY_LIMIT;
      const loadSeries = async (
        requestInstrument: MarketInstrument,
        mode: "history" | "latest",
        limit: number,
      ) => {
        const params = new URLSearchParams({
          secid: requestInstrument.secid,
          code: requestInstrument.code,
          name: requestInstrument.name,
          exchange: requestInstrument.exchange,
          provider: requestInstrument.provider,
          assetType: requestInstrument.assetType,
          interval: DAILY_INTERVAL,
          limit: String(limit),
          mode,
        });
        const response = await fetch(`/api/market?${params}`, {
          signal,
          cache: mode === "latest" ? "no-store" : "default",
        });
        const payload = (await response.json()) as MarketSeries & {
          error?: string;
        };
        if (!response.ok || payload.error) {
          throw new Error(payload.error || "UNKNOWN");
        }
        return payload;
      };

      try {
        const currentSeries = isMarketSeries(marketSeriesRef.current)
          ? marketSeriesRef.current
          : null;
        if (currentSeries === null && marketSeriesRef.current !== null) {
          marketSeriesRef.current = null;
          currentSeriesKeyRef.current = "";
          latestSeriesDateRef.current = "";
        }
        const refreshesLatestOnly =
          currentSeries !== null &&
          currentSeriesKeyRef.current === seriesKey &&
          !cachedSeriesActiveRef.current;
        const applyLoadedSeries = (payload: MarketSeries) => {
          marketSeriesRef.current = payload;
          setSeries(payload);

          if (!payload.bars.length) return;
          const sameSeries = currentSeriesKeyRef.current === seriesKey;
          const previousLatestDate = latestSeriesDateRef.current;
          const firstDate = datePart(payload.bars[0].time);
          const lastDate = datePart(
            payload.bars[payload.bars.length - 1].time,
          );
          const currentRange = sharedRangeRef.current;
          const followsLatest =
            sameSeries &&
            (!currentRange.endDate ||
              currentRange.endDate === previousLatestDate ||
              currentRange.endDate > lastDate);
          const keepsHistoricalRange =
            sameSeries &&
            !followsLatest &&
            currentRange.startDate >= firstDate &&
            currentRange.endDate <= lastDate;
          const nextRange = keepsHistoricalRange
            ? resolveTradingSessionRange(
                payload.bars,
                currentRange.startDate,
                currentRange.endDate,
              )
            : resolveTrailingTradingSessionRange(
                payload.bars,
                sharedRangeSessionsRef.current,
                lastDate,
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
          latestSeriesDateRef.current = lastDate;
        };

        if (!refreshesLatestOnly) {
          const cached = await readCachedMarketSeriesEntry(
            instrument,
            DAILY_INTERVAL,
          );
          if (signal.aborted) return;
          if (cached) {
            applyLoadedSeries(cached.series);
            cachedSeriesActiveRef.current = true;
            setCachedPreviewAt(cached.cachedAt);
            setErrorCode("CACHED_PREVIEW");
          }
        }

        let payload: MarketSeries;

        if (refreshesLatestOnly) {
          const latest = await loadSeries(
            currentSeries.instrument,
            "latest",
            5,
          );
          if (
            latest.source === currentSeries.source &&
            latest.priceAdjustment === currentSeries.priceAdjustment
          ) {
            payload = mergeLatestMarketSeries(
              currentSeries,
              latest,
              seriesLimit,
            );
            setErrorCode("");
          } else {
            payload = currentSeries;
            setErrorCode("LATEST_SERIES_MISMATCH");
          }
        } else {
          const history = await loadSeries(
            instrument,
            "history",
            seriesLimit,
          );
          payload = history;
          try {
            const latest = await loadSeries(
              history.instrument,
              "latest",
              5,
            );
            if (
              latest.source === history.source &&
              latest.priceAdjustment === history.priceAdjustment
            ) {
              payload = mergeLatestMarketSeries(
                history,
                latest,
                seriesLimit,
              );
              setErrorCode("");
            } else {
              setErrorCode("LATEST_SERIES_MISMATCH");
            }
          } catch (error) {
            if ((error as Error).name === "AbortError") throw error;
            // Cached history remains usable when the latest-bar request fails.
            setErrorCode("LATEST_UNAVAILABLE");
          }
        }
        applyLoadedSeries(payload);
        cachedSeriesActiveRef.current = false;
        setCachedPreviewAt(null);
        void writeCachedMarketSeries(payload, [instrument]);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setErrorCode((error as Error).message || "UNKNOWN");
        }
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [instrument],
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
    const refreshVisibleMarket = () => {
      if (document.visibilityState === "visible") {
        setRefreshVersion((value) => value + 1);
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshVisibleMarket();
    };
    const refreshTimer = window.setInterval(
      refreshVisibleMarket,
      LIVE_REFRESH_INTERVAL_MS,
    );
    window.addEventListener("focus", refreshVisibleMarket);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", refreshVisibleMarket);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (query.trim().length < 1) return;

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

  useEffect(
    () => () => {
      screeningAbortRef.current?.abort();
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
          settings: indicatorSettings,
        }),
      );
    } catch {
      // Indicator preferences remain available for the current page session.
    }
  }, [
    focusedIndicator,
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
        };
        if (!response.ok) throw new Error("PERSISTENCE_UNAVAILABLE");
        setSavedBacktests(payload.savedBacktests ?? []);
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

  const latest = series?.bars.at(-1);
  const previous = series?.bars.at(-2);
  const comparisonPrice =
    previous?.close ?? series?.previousClose ?? latest?.open ?? 0;
  const priceChange = latest ? latest.close - comparisonPrice : 0;
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
      entryFilter: activeMovingAverageSlopeFilter(
        strategyEntryFilterDraft,
      ),
    };
  }, [
    strategyAParameters,
    strategyAAllocationPercent,
    strategyAId,
    strategyBParameters,
    strategyBAllocationPercent,
    strategyBId,
    strategyEntryFilterDraft,
  ]);
  const singleSelection =
    strategyPlan &&
    Boolean(strategyPlan.strategyA) !== Boolean(strategyPlan.strategyB)
      ? (strategyPlan.strategyA ?? strategyPlan.strategyB)
      : null;
  const usesSingleFullAllocation =
    Boolean(singleSelection) &&
    (strategyPlan?.strategyA
      ? strategyPlan.strategyAAllocation === 1
      : strategyPlan?.strategyBAllocation === 1);
  const activeStrategyTimeline = useMemo(() => {
    if (!series?.bars.length || !strategyPlan) return null;
    try {
      return buildStrategyPlanTimeline(series.bars, strategyPlan, {
        startTime: startDate || series.bars[0].time,
        endTime: endDate || series.bars.at(-1)!.time,
      });
    } catch {
      return null;
    }
  }, [endDate, series, startDate, strategyPlan]);
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
  const appliedStrategyTimeline = useMemo(() => {
    if (!series?.bars.length || !appliedStrategyPlan) return null;
    try {
      return buildStrategyPlanTimeline(series.bars, appliedStrategyPlan, {
        startTime: startDate || series.bars[0].time,
        endTime: endDate || series.bars.at(-1)!.time,
      });
    } catch {
      return null;
    }
  }, [appliedStrategyPlan, endDate, series, startDate]);
  const appliedRelativeLongStrategy =
    appliedStrategyTimeline?.relativeLongStrategy;
  const liveGuidance = useMemo(() => {
    if (!series?.bars.length || !appliedStrategyPlan) return null;
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
              appliedStrategyPlan.entryFilter,
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
          appliedStrategyPlan.entryFilter,
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
          }
        : null;
    } catch {
      return null;
    }
  }, [
    appliedSingleSelection,
    appliedStrategyPlan,
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

  const backtest = useMemo<
    BacktestResult | AllocationBacktestResult | null
  >(() => {
    if (
      !series?.bars.length ||
      !startDate ||
      !endDate ||
      !strategyPlan
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
        interval: DAILY_INTERVAL,
        executionPolicy: HISTORICAL_EXECUTION_POLICY,
        entryFilter: strategyPlan.entryFilter,
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
    strategyPlan,
    usesSingleFullAllocation,
  ]);
  const appliedBacktest = useMemo<
    BacktestResult | AllocationBacktestResult | null
  >(() => {
    if (
      !series?.bars.length ||
      !startDate ||
      !endDate ||
      !appliedStrategyPlan
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
        interval: DAILY_INTERVAL,
        executionPolicy: HISTORICAL_EXECUTION_POLICY,
        entryFilter: appliedStrategyPlan.entryFilter,
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
    appliedStrategyTimeline,
    appliedUsesSingleFullAllocation,
    commissionPercent,
    endDate,
    initialCash,
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
          interval: DAILY_INTERVAL,
          executionPolicy: HISTORICAL_EXECUTION_POLICY,
          entryFilter: strategyPlan.entryFilter,
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
    series,
    singleSelection,
    slippagePercent,
    startDate,
    strategyPlan,
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
      appliedStrategyPlan
        ? [
            ...(appliedStrategyPlan.strategyA
              ? [
                  {
                    id: appliedStrategyPlan.strategyA.strategyId,
                    parameters: appliedStrategyPlan.strategyA.parameters,
                    lineLabels:
                      appliedRelativeLongStrategy === "strategyB"
                        ? relativeShortStrategyLineLabels
                        : relativeLongStrategyLineLabels,
                  },
                ]
              : []),
            ...(appliedStrategyPlan.strategyB
              ? [
                  {
                    id: appliedStrategyPlan.strategyB.strategyId,
                    parameters: appliedStrategyPlan.strategyB.parameters,
                    lineLabels:
                      appliedRelativeLongStrategy === "strategyB"
                        ? relativeLongStrategyLineLabels
                        : relativeShortStrategyLineLabels,
                  },
                ]
              : []),
          ]
        : [],
    [appliedRelativeLongStrategy, appliedStrategyPlan],
  );
  const allocationTradeMarkers =
    appliedBacktest && "rebalances" in appliedBacktest
      ? buildAllocationTradeMarkers(appliedBacktest.rebalances)
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
    setStrategyEntryFilterDraft(
      createMovingAverageSlopeFilterDraft(entryFilter),
    );
    setAppliedStrategyPlan({
      strategyA: {
        strategyId: nextStrategyId,
        parameters: { ...mergedParameters },
      },
      strategyB: null,
      strategyAAllocation: 1,
      strategyBAllocation: 0,
      entryFilter: cloneMovingAverageSlopeFilter(entryFilter),
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
    setStrategyEntryFilterDraft(
      createMovingAverageSlopeFilterDraft(result.entryFilter),
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
      entryFilter: cloneMovingAverageSlopeFilter(result.entryFilter),
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
    setVisibleIndicatorIds((current) =>
      current.includes(nextIndicator)
        ? current.filter((id) => id !== nextIndicator)
        : [...current, nextIndicator],
    );
  };

  const toggleFocusedIndicator = () => {
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
            DAILY_INTERVAL,
            appliedStrategyPlan,
            startDate,
            endDate,
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
      };
      if (!response.ok || !payload.savedBacktest) {
        throw new Error("PERSISTENCE_UNAVAILABLE");
      }
      const savedBacktest = payload.savedBacktest;
      setSavedBacktests((current) =>
        [
          savedBacktest,
          ...current.filter((record) => record.id !== savedBacktest.id),
        ].slice(0, MAX_SAVED_BACKTEST_SCROLL_RECORDS),
      );
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
    cachedSeriesActiveRef.current = false;
    currentSeriesKeyRef.current = "";
    latestSeriesDateRef.current = "";
    setSeries(null);
    setCachedPreviewAt(null);
    setErrorCode("");
    setLoading(true);
  };

  const openSavedBacktest = (saved: SavedBacktestRecord) => {
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
      DAILY_INTERVAL,
    );
    if (!sameCanonicalInstrument) {
      clearMarketSeries();
      setInstrument(saved.instrument);
    } else if (!reusesCurrentSeries) {
      clearMarketSeries();
      setRefreshVersion((value) => value + 1);
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
    setStrategyEntryFilterDraft(
      createMovingAverageSlopeFilterDraft(saved.plan.entryFilter),
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
      entryFilter: cloneMovingAverageSlopeFilter(saved.plan.entryFilter),
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

  const toggleSavedBacktestGroup = (groupKey: string) => {
    setExpandedSavedBacktestGroups((current) =>
      current.includes(groupKey)
        ? current.filter((key) => key !== groupKey)
        : [...current, groupKey],
    );
  };

  const startSavedBacktestDrag = (
    event: ReactDragEvent<HTMLElement>,
    drag: SavedBacktestDragState,
  ) => {
    if (savedBacktestOrderSaving) {
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
    if (
      savedBacktestDrag?.kind !== "group" ||
      savedBacktestDrag.groupKey === targetGroupKey
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
    if (
      savedBacktestDrag?.kind !== "record" ||
      savedBacktestDrag.groupKey !== targetGroupKey ||
      savedBacktestDrag.recordId === targetRecordId
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
    const groupIndex = savedBacktestGroups.findIndex(
      (group) => group.key === groupKey,
    );
    const target = savedBacktestGroups[groupIndex + offset];
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
    const recordIndex =
      group?.records.findIndex((record) => record.id === recordId) ?? -1;
    const target = group?.records[recordIndex + offset];
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
    const runObjective = screeningObjective;
    const latestDate = datePart(series.bars.at(-1)!.time);
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
    await yieldForScreening();

    try {
      const outcome = await runScreeningWithValidation(
        series.bars,
        {
          initialCash,
          commissionRate: commissionPercent / 100,
          slippageRate: slippagePercent / 100,
          startTime: startDate,
          endTime: endDate,
          interval: DAILY_INTERVAL,
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

  const minDate = series?.bars.length ? datePart(series.bars[0].time) : "";
  const maxDate = series?.bars.length
    ? datePart(series.bars[series.bars.length - 1].time)
    : "";
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
  const savedBacktestRangeMetrics = useMemo(() => {
    const metrics = new Map<number, BacktestPerformance | null>();
    if (!series?.bars.length || !startDate || !endDate) return metrics;
    for (const saved of savedBacktests) {
      if (
        saved.interval !== DAILY_INTERVAL ||
        savedBacktestInstrumentKey(saved.instrument) !==
          activeInstrumentKey
      ) {
        continue;
      }
      try {
        metrics.set(
          saved.id,
          runStrategyPlanRangeBacktest(series.bars, saved.plan, {
            initialCash: saved.initialCash,
            commissionRate: saved.commissionPercent / 100,
            slippageRate: saved.slippagePercent / 100,
            startTime: startDate,
            endTime: endDate,
            interval: DAILY_INTERVAL,
            executionPolicy: HISTORICAL_EXECUTION_POLICY,
            entryFilter: saved.plan.entryFilter,
          }),
        );
      } catch {
        metrics.set(saved.id, null);
      }
    }
    return metrics;
  }, [
    activeInstrumentKey,
    endDate,
    savedBacktests,
    series,
    startDate,
  ]);
  const screeningBusy = screening;
  const resultsValidationMode =
    screenResults[0]?.screeningValidation?.mode ??
    combinationResults[0]?.screeningValidation?.mode ??
    null;
  const hasScreeningResults =
    screenResults.length > 0 || combinationResults.length > 0;
  const screeningResultEntryFilter =
    screenResults[0]?.entryFilter ??
    combinationResults[0]?.entryFilter ??
    null;
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
  const screenProgressStageIndex =
    screenProgress.stage === "strategies"
      ? 0
      : screenProgress.stage === "entryFilters"
        ? 1
        : screenProgress.stage === "pairs"
          ? 2
          : 3;
  const screenProgressValue =
    screenProgressStageIndex +
    (screenProgress.stageTotal > 0
      ? Math.min(
          Math.max(
            screenProgress.stageCompleted / screenProgress.stageTotal,
            0,
          ),
          1,
        )
      : screenProgressStageIndex > 0
        ? 1
        : 0);
  const validationPhaseValue = validationProgress
    ? validationProgress.phase === "optimization"
      ? screenProgressValue
      : validationProgress.phase === "selection"
        ? 4 +
          (validationProgress.mode === "sample"
            ? validationProgress.foldIndex
            : 0) +
          (validationProgress.total > 0
            ? validationProgress.completed / validationProgress.total
            : 0)
        : validationProgress.phase === "display"
          ? 4 +
            validationProgress.foldCount +
            (validationProgress.total > 0
              ? validationProgress.completed /
                validationProgress.total
              : 0)
        : 5 +
          (validationProgress.total > 0
            ? validationProgress.completed / validationProgress.total
            : 0)
    : 0;
  const validationProgressMaximum =
    validationProgress?.mode === "rolling"
      ? Math.max(validationProgress.foldCount * 5, 1)
      : validationProgress?.mode === "range"
        ? 6
        : 5 + (validationProgress?.foldCount ?? 3);
  const validationProgressValue = validationProgress
    ? validationProgress.mode === "rolling"
      ? validationProgress.foldIndex * 5 +
        Math.min(validationPhaseValue, 5)
      : validationPhaseValue
    : screenProgressValue;
  const screeningProgressMaximum = validationProgress
    ? validationProgressMaximum
    : 4;
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
            {latest ? formatNumber(latest.close) : copy.common.unavailable}
          </strong>
          <span className={priceChange >= 0 ? "positive" : "negative"}>
            {priceChange >= 0 ? "+" : ""}
            {formatNumber(priceChange)} {copy.common.separator}{" "}
            {formatPercent(priceChangePercent, true)}
          </span>
        </div>

        <div className="market-stat-row">
          {[
            [copy.marketStats.open, latest?.open],
            [copy.marketStats.high, latest?.high],
            [copy.marketStats.low, latest?.low],
            [
              copy.marketStats.volume,
              latest?.volume
                ? compactFormatter.format(latest.volume)
                : undefined,
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
              ]
                .filter(Boolean)
                .join(` ${copy.common.separator} `)}
            </small>
          ))}
          <em>
            {copy.liveGuidance.execution[liveGuidance?.executionMode ?? "next-open"]}{" "}
            {copy.common.separator} {copy.liveGuidance.disclosure}{" "}
            {copy.common.separator}{" "}
             {copy.liveGuidance.autoRefresh}
             {series?.latestBarStatus === "in-progress"
               ? ` ${copy.common.separator} ${copy.liveGuidance.inProgressBar}`
               : series?.latestBarStatus === "unknown"
                 ? ` ${copy.common.separator} ${copy.liveGuidance.unknownBarStatus}`
                 : ""}
             {liveGuidance?.orderPrices.some(
              (order) => order.pendingNextOpenAction !== null,
            )
              ? ` ${copy.common.separator} ${copy.liveGuidance.pendingGapOverride}`
              : ""}
          </em>
        </div>

        <button
          className="icon-button"
          type="button"
          onClick={() => setRefreshVersion((value) => value + 1)}
          aria-label={copy.refresh}
          title={copy.refresh}
        >
          <RefreshCw size={16} className={loading ? "spin" : ""} />
        </button>
      </section>

      <section className="chart-toolbar">
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
        <div
          className="indicator-controls"
          role="group"
          aria-label={copy.indicatorsTitle}
        >
          {INDICATORS.map((item) => {
            const focused = focusedIndicator === item.id;
            const visible = visibleIndicatorIds.includes(item.id);
            const accessibleLabel = `${copy.indicators[item.id].name} ${copy.common.separator} ${
              visible
                ? copy.indicatorSettings.visible
                : copy.indicatorSettings.hidden
            }`;
            return (
              <button
                type="button"
                id={`indicator-tab-${item.id}`}
                aria-controls="indicator-settings-panel"
                aria-pressed={visible}
                aria-current={focused ? "true" : undefined}
                aria-label={accessibleLabel}
                key={item.id}
                className={`${focused ? "focused" : ""} ${
                  visible ? "visible" : ""
                }`.trim()}
                onClick={() => toggleIndicator(item.id)}
                title={accessibleLabel}
              >
                {copy.indicators[item.id].short}
              </button>
            );
          })}
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
        {activeIndicator.parameters.length > 0 ? (
          <div className="indicator-parameter-controls">
            {activeIndicator.parameters.map((parameter) => (
              <label key={parameter.key}>
                <span>
                  {copy.parameters[
                    parameter.key as keyof typeof copy.parameters
                  ]}
                </span>
                <input
                  name={`indicator-${parameter.key}`}
                  type="number"
                  value={indicatorParameters[parameter.key]}
                  min={parameter.minimum}
                  step={parameter.step}
                  onChange={(event) =>
                    updateIndicatorParameter(
                      parameter.key,
                      Number(event.target.value),
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
          className={`indicator-visibility-button ${
            focusedIndicatorVisible ? "visible" : ""
          }`}
          type="button"
          onClick={toggleFocusedIndicator}
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
                  {visibleIndicatorIds.length > 0
                    ? visibleIndicatorIds
                        .map((id) => copy.indicators[id].short)
                        .join(" / ")
                    : copy.indicatorSettings.none}
                </span>
                <small>
                  {copy.indicatorSettings.activeStrategy}{" "}
                  {copy.common.separator} {copy.chart.strategyLines.prefix}{" "}
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
                     <span>{copy.sources[series.source]}</span>
                     <span>
                       {
                         copy.chart.latestBarStatus[
                           series.latestBarStatus
                         ]
                       }
                     </span>
                     <span>
                      {copy.marketStats.asOf} {lastUpdated}
                    </span>
                    <span>{copy.liveGuidance.autoRefresh}</span>
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
                  onClick={() => setRefreshVersion((value) => value + 1)}
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
                tradeMarkers={allocationTradeMarkers}
                dataKey={`${activeInstrument.provider}:${activeInstrument.secid}:${DAILY_INTERVAL}`}
                chartType={chartType}
                visibleIndicators={visibleIndicators}
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
              {startDate && endDate && (
                <small className="saved-shortcuts-range">
                  {copy.savedBacktests.returnRange}
                  {copy.common.colon}
                  {startDate} — {endDate}
                  {" "}
                  {copy.common.separator}
                  {" "}
                  {sharedRangeSessions}
                  {copy.screening.tradingSessions}
                </small>
              )}
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
            ) : savedBacktests.length === 0 ? (
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
                {savedBacktestGroups.map((group) => {
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
                        if (
                          savedBacktestDrag?.kind === "group" &&
                          savedBacktestDrag.groupKey !== group.key
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
                      </div>

                      {expanded && (
                        <div
                          className="saved-shortcut-group-records"
                          id={groupPanelId}
                        >
                          {group.records.map((saved) => {
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
                              saved.interval === DAILY_INTERVAL &&
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
                            const currentRangeMetrics =
                              savedBacktestRangeMetrics.get(saved.id) ??
                              null;
                            const usesCurrentRange =
                              savedBacktestRangeMetrics.has(saved.id);
                            const displayedReturn =
                              currentRangeMetrics?.totalReturn ?? null;
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
                                  if (
                                    savedBacktestDrag?.kind === "record" &&
                                    savedBacktestDrag.groupKey === group.key &&
                                    savedBacktestDrag.recordId !== saved.id
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
                                  aria-label={`${copy.savedBacktests.open} ${group.instrument.name} ${strategyLabel}`}
                                >
                                  <span className="saved-shortcut-name">
                                    <strong>{strategyLabel}</strong>
                                    <b
                                      className={
                                        displayedReturn === null
                                          ? "neutral"
                                          : displayedReturn >= 0
                                            ? "positive"
                                            : "negative"
                                      }
                                    >
                                      {displayedReturn === null
                                        ? copy.common.unavailable
                                        : formatPercent(
                                            displayedReturn,
                                            true,
                                          )}
                                    </b>
                                  </span>
                                  <small>
                                    {usesCurrentRange
                                      ? copy.savedBacktests.currentRange
                                      : copy.savedBacktests
                                          .switchToCalculate}
                                  </small>
                                  <small>
                                    {copy.intervals[saved.interval]}{" "}
                                    {copy.common.separator}{" "}
                                    {saved.plan.strategyA
                                      ? `A ${Math.round(
                                          saved.plan
                                            .strategyAAllocation * 100,
                                        )}%`
                                      : ""}
                                    {saved.plan.strategyA &&
                                    saved.plan.strategyB
                                      ? " + "
                                      : ""}
                                    {saved.plan.strategyB
                                      ? `B ${Math.round(
                                          saved.plan
                                            .strategyBAllocation * 100,
                                        )}%`
                                      : ""}
                                  </small>
                                  <small>
                                    {copy.savedBacktests.indicatorsPrefix}{" "}
                                    {saved.indicators.length > 0
                                      ? saved.indicators
                                          .map(
                                            (indicator) =>
                                              copy.indicators[
                                                indicator.id
                                              ].short,
                                          )
                                          .join(" + ")
                                      : copy.savedBacktests.noIndicators}
                                  </small>
                                  <small>
                                    {copy.entryFilter.savedPrefix}{" "}
                                    {formatMovingAverageSlopeFilter(
                                      saved.plan.entryFilter,
                                    )}
                                  </small>
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
                })}
              </div>
            )}
          </section>
        </aside>
      </div>

      <section className="research-lab-grid">
        <aside className="strategy-panel panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">{copy.lab.title}</span>
              <div className="strategy-title-line">
                <strong>
                  {selectedStrategySummary || copy.lab.noStrategy}
                </strong>
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
            </div>
            <div className="lab-heading-actions">
              <button
                className="apply-current-strategy-button"
                type="button"
                onClick={applyCurrentStrategyToChart}
                aria-label={copy.lab.applyToChart}
                title={copy.lab.applyToChart}
              >
                <LineChart size={14} />
                <span>{copy.lab.apply}</span>
              </button>
              <FlaskConical size={19} />
            </div>
          </div>
          <p className="panel-copy">{copy.lab.subtitle}</p>

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
                        strategyBId
                          ? areStrategiesEquivalent(strategy.id, strategyBId)
                          : false
                      }
                    >
                      {copy.strategies[strategy.id].name}
                    </option>
                  ))}
                </select>
                <small>
                  {strategyAId
                    ? copy.strategies[strategyAId].description
                    : copy.lab.noStrategyADescription}
                </small>
              </label>
              {strategyAId && (
                <StrategyParameterFields
                  heading={copy.lab.strategyAParameters}
                  namePrefix="strategy-a"
                  parameters={strategyAParameters}
                  onChange={setStrategyAParameters}
                />
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
                        strategyAId
                          ? areStrategiesEquivalent(strategy.id, strategyAId)
                          : false
                      }
                    >
                      {copy.strategies[strategy.id].name}
                    </option>
                  ))}
                </select>
                <small>
                  {strategyBId
                    ? copy.strategies[strategyBId].description
                    : copy.lab.noStrategyBDescription}
                </small>
              </label>
              {strategyBId && (
                <StrategyParameterFields
                  heading={copy.lab.strategyBParameters}
                  namePrefix="strategy-b"
                  parameters={strategyBParameters}
                  onChange={setStrategyBParameters}
                />
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
              <small>{copy.lab.strategyAAllocationHint}</small>
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
              <small>{copy.lab.strategyBAllocationHint}</small>
            </label>
          </div>

          <MovingAverageSlopeFilterFields
            context="lab"
            namePrefix="strategy-entry-filter"
            draft={strategyEntryFilterDraft}
            onChange={setStrategyEntryFilterDraft}
          />

          <div className="date-grid">
            <label className="field-label">
              <span>{copy.lab.start}</span>
              <input
                type="date"
                value={startDate}
                min={minDate}
                max={endDate || maxDate}
                onChange={(event) => {
                  updateSharedRangeFromDates(
                    event.target.value,
                    endDate,
                  );
                }}
              />
            </label>
            <label className="field-label">
              <span>{copy.lab.end}</span>
              <input
                type="date"
                value={endDate}
                min={startDate || minDate}
                max={maxDate}
                onChange={(event) => {
                  updateSharedRangeFromDates(
                    startDate,
                    event.target.value,
                  );
                }}
              />
            </label>
          </div>

          <div className="settings-grid">
            <label className="field-label">
              <span>{copy.lab.initialCash}</span>
              <input
                type="number"
                value={initialCash}
                min={1000}
                step={10000}
                onChange={(event) => {
                  setInitialCash(Math.max(Number(event.target.value), 1000))
                }}
              />
            </label>
            <label className="field-label">
              <span>{copy.lab.commission} %</span>
              <input
                type="number"
                value={commissionPercent}
                min={0}
                step={0.01}
                onChange={(event) => {
                  setCommissionPercent(Math.max(Number(event.target.value), 0))
                }}
              />
            </label>
            <label className="field-label">
              <span>{copy.lab.slippage} %</span>
              <input
                type="number"
                value={slippagePercent}
                min={0}
                step={0.01}
                onChange={(event) => {
                  setSlippagePercent(Math.max(Number(event.target.value), 0))
                }}
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
              <p>{copy.stability.description}</p>

              {stability && !stability.evidence.sufficient && (
                <div className="stability-evidence" role="status">
                  <strong>{copy.stability.insufficientEvidence}</strong>
                  <ul>
                    {stability.evidence.reasons.map((reason) => (
                      <li key={reason}>
                        {formatStabilityEvidenceReason(
                          reason,
                          stability.evidence,
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
              ) : !stability ? (
                <div className="stability-unavailable">
                  {strategyPlan && !usesSingleFullAllocation
                    ? copy.stability.planUnavailable
                    : copy.stability.unavailable}
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
              <p>{copy.screening.description}</p>
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
                    <small>
                      {
                        copy.screening.objectiveDescriptions[
                          screeningObjective
                        ]
                      }
                    </small>
                  </label>
                  <div className="screening-control-field screening-full-traversal">
                    <span>{copy.screening.parameterTraversal}</span>
                    <strong>{copy.screening.fullTraversal}</strong>
                    <small>{copy.screening.fullTraversalHint}</small>
                  </div>
                </div>
              </fieldset>
              <MovingAverageSlopeFilterFields
                context="screening"
                namePrefix="screening-entry-filter"
                draft={screeningEntryFilterDraft}
                onChange={setScreeningEntryFilterDraft}
                disabled={screeningBusy}
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
                      <option value={value} key={value}>
                        {copy.screening.validationModes[value]}
                      </option>
                    ))}
                  </select>
                  <small>
                    {
                      copy.screening.validationDescriptions[
                        screeningValidationMode
                      ]
                    }
                  </small>
                </label>
              {screeningValidationMode === "sample" && (
                <fieldset className="screening-sample-windows">
                  <legend>{copy.screening.samplePeriodsTitle}</legend>
                  <label className="screening-sample-period-field">
                    <span>{copy.screening.samplePeriodSessions}</span>
                    <input
                      name="strategy-sample-period-sessions"
                      type="number"
                      min={3}
                      max={maximumSharedRangeSessions}
                      step={1}
                      value={sharedRangeSessions}
                      disabled={screeningBusy}
                      onChange={(event) => {
                        updateSharedRangeFromSessions(
                          Number(event.target.value),
                        );
                      }}
                    />
                  </label>
                  <small>{copy.screening.samplePeriodsHint}</small>
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
                      <span>{copy.lab.start}</span>
                      <input
                        name="strategy-screening-range-start"
                        type="date"
                        value={
                          screeningCustomRange.startTime || startDate
                        }
                        disabled={screeningBusy}
                        onChange={(event) => {
                          setScreeningCustomRange((current) => ({
                            ...current,
                            startTime: event.target.value,
                          }));
                        }}
                      />
                    </label>
                    <label>
                      <span>{copy.lab.end}</span>
                      <input
                        name="strategy-screening-range-end"
                        type="date"
                        value={
                          screeningCustomRange.endTime ||
                          endDate ||
                          maxDate
                        }
                        disabled={screeningBusy}
                        onChange={(event) => {
                          setScreeningCustomRange((current) => ({
                            ...current,
                            endTime: event.target.value,
                          }));
                        }}
                      />
                    </label>
                  </div>
                  {screeningValidationMode === "rolling" && (
                    <label className="screening-control-field screening-rolling-window">
                      <span>{copy.screening.rollingWindowYears}</span>
                      <input
                        name="strategy-rolling-window-years"
                        type="number"
                        min={1}
                        max={30}
                        step={1}
                        value={rollingWindowYears}
                        disabled={screeningBusy}
                        onChange={(event) => {
                          const nextValue = Number(event.target.value);
                          setRollingWindowYears(
                            Math.min(
                              Math.max(
                                Number.isFinite(nextValue)
                                  ? Math.floor(nextValue)
                                  : 1,
                                1,
                              ),
                              30,
                            ),
                          );
                        }}
                      />
                      <small>
                        {copy.screening.rollingWindowYearsHint}
                      </small>
                    </label>
                  )}
                </fieldset>
              )}
              </fieldset>
            </div>
            <div className="screening-action-field">
              <span>{copy.screening.actionLabel}</span>
              <button
                type="button"
                className={`primary-action ${screening ? "stop" : ""}`}
                disabled={!series}
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
          </div>
          <div className="screening-meta">
            <div className="screening-meta-copy">
              <p className="screening-status-rule">
                {copy.screening.statusRule}
              </p>
              {hasScreeningResults && (
                <p className="screening-result-context">
                  {copy.screening.resultSnapshotNotice}
                  {" "}
                  {copy.screening.sampleResultMetricNotice}
                  {" "}
                  {copy.screening.entryFilterSnapshot}{" "}
                  {copy.entryFilter.resultPrefix}
                  {copy.common.colon}
                  {formatMovingAverageSlopeFilter(
                    screeningResultEntryFilter,
                  )}
                </p>
              )}
            </div>
            <div className="risk-note">
              <ShieldAlert size={15} />
              <span>{copy.screening.validationOverfit}</span>
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
                            : validationProgress.phase === "selection"
                              ? copy.screening.runningValidation
                              : validationProgress.phase === "display"
                                ? copy.screening.runningDisplayMetrics
                              : copy.screening.runningTest
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
                max={screeningProgressMaximum}
                value={validationProgressValue}
              />
            </div>
          )}
        </div>

        {validationReport && (
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
            {validationReport.mode === "sample" ? (
              <>
                <div className="screening-validation-windows sample">
                  <div>
                    <span>
                      {copy.screening.sampleWindow} ·{" "}
                      {validationReport.periods[0]?.sessions}{" "}
                      {copy.screening.tradingSessions}
                    </span>
                    <strong>
                      {validationReport.window.startTime} —{" "}
                      {validationReport.window.endTime}
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
                    <span>{copy.screening.weightedRankScore}</span>
                    <strong>
                      {formatNumber(
                        validationReport.selectionScore,
                        2,
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>{copy.screening.displayPeriodReturn}</span>
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
                    <span>{copy.screening.longPeriodDrawdown}</span>
                    <strong className="negative">
                      {formatPercent(
                        validationReport.periods.at(-1)!
                          .performance.maxDrawdown,
                      )}
                    </strong>
                  </div>
                </div>
                <div className="results-table-wrap screening-period-table">
                  <table className="results-table">
                    <thead>
                      <tr>
                        <th>{copy.screening.samplePeriod}</th>
                        <th>{copy.screening.return}</th>
                        <th>{copy.screening.drawdown}</th>
                        <th>{copy.screening.sharpe}</th>
                        <th>{copy.screening.normalizedRankScore}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validationReport.periods.map((period) => (
                        <tr key={period.sessions}>
                          <td>
                            {period.sessions}{" "}
                            {copy.screening.tradingSessions}
                          </td>
                          <td
                            className={
                              period.performance.totalReturn >= 0
                                ? "positive"
                                : "negative"
                            }
                          >
                            {formatPercent(
                              period.performance.totalReturn,
                              true,
                            )}
                          </td>
                          <td className="negative">
                            {formatPercent(
                              period.performance.maxDrawdown,
                            )}
                          </td>
                          <td>
                            {formatNumber(
                              period.performance.sharpe,
                            )}
                          </td>
                          <td>
                            {formatNumber(period.rankScore, 2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : validationReport.mode === "range" ? (
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
                    <span>{copy.screening.weightedRankScore}</span>
                    <strong>
                      {formatNumber(
                        validationReport.selectionScore,
                        2,
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
                          <th>{copy.screening.normalizedRankScore}</th>
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
                            <td>
                              {formatNumber(fold.rankScore, 2)}
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
                          )}%`}
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
              <Trophy size={17} />
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
                    <th>{copy.screening.rank}</th>
                    <th>{copy.screening.strategy}</th>
                    <th>{copy.screening.return}</th>
                    <th>{copy.screening.drawdown}</th>
                    <th>{copy.screening.sharpe}</th>
                    <th>{copy.screening.trades}</th>
                    <th>
                      {resultsValidationMode === "sample"
                        ? copy.screening.weightedRankScore
                        : copy.screening.selectionObjectiveValue}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {screenResults.map((result, index) => (
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
                        <span className={`rank rank-${index + 1}`}>
                          {index + 1}
                        </span>
                      </td>
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
                          className={`fit-badge ${resultTone(result)}`}
                          title={resultStatusTitle(result)}
                        >
                          {resultTone(result) === "positive"
                            ? copy.screening.suitable
                            : copy.screening.caution}
                          <b>
                            {formatSelectionValue(
                              result,
                              screenResultsObjective,
                            )}
                          </b>
                        </span>
                      </td>
                    </tr>
                  ))}
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
                <Trophy size={17} />
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
                        <th>{copy.screening.rank}</th>
                        <th>{copy.combinationScreening.strategyA}</th>
                        <th>{copy.combinationScreening.strategyB}</th>
                        <th>{copy.combinationScreening.allocationPlan}</th>
                        <th>{copy.screening.return}</th>
                        <th>{copy.screening.drawdown}</th>
                        <th>{copy.screening.sharpe}</th>
                        <th>{copy.combinationScreening.rebalances}</th>
                        <th>
                          {resultsValidationMode === "sample"
                            ? copy.screening.weightedRankScore
                            : copy.screening.selectionObjectiveValue}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {combinationResults.map((result, index) => (
                        <tr
                          className="clickable-result-row"
                          key={`${result.strategyAId}-${result.strategyBId}`}
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
                            <span className={`rank rank-${index + 1}`}>
                              {index + 1}
                            </span>
                          </td>
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
                              {result.entryFilter && (
                                <small className="result-entry-filter">
                                  {formatMovingAverageSlopeFilter(
                                    result.entryFilter,
                                  )}
                                </small>
                              )}
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
                              className={`fit-badge ${resultTone(result)}`}
                              title={resultStatusTitle(result)}
                            >
                              {resultTone(result) === "positive"
                                ? copy.screening.suitable
                                : copy.screening.caution}
                              <b>
                                {formatSelectionValue(
                                  result,
                                  screenResultsObjective,
                                )}
                              </b>
                            </span>
                          </td>
                        </tr>
                      ))}
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
        <span>{copy.marketSource}</span>
        <span>{copy.footer}</span>
        <strong>{copy.researchOnly}</strong>
      </footer>
    </main>
  );
}
