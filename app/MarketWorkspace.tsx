"use client";

import {
  Activity,
  BarChart3,
  Bookmark,
  CandlestickChart,
  ChevronRight,
  Eye,
  EyeOff,
  FlaskConical,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
} from "@/lib/analysis/backtest";
import {
  INDICATORS,
  createDefaultIndicatorSettings,
  getDefaultIndicatorParameters,
  getIndicator,
  type IndicatorId,
} from "@/lib/analysis/indicator-registry";
import {
  DEFAULT_PARAMETER_SETS_PER_STRATEGY,
  MAX_PARAMETER_SETS_PER_STRATEGY,
  SCREENING_OBJECTIVES,
  isIntegerStrategyParameterKey,
  normalizeStrategyParameterInput,
  optimizeStrategies,
  screeningObjectiveValue,
  type ScreeningObjective,
  type ScreeningProgress,
} from "@/lib/analysis/screening";
import {
  getStrategy,
  getStrategiesByHorizon,
  type StrategyId,
  type StrategyParameters,
} from "@/lib/analysis/strategies";
import {
  DEFAULT_LONG_ALLOCATION,
  DEFAULT_SHORT_ALLOCATION,
  LONG_LAYER_ALLOCATION_CANDIDATES,
  SHORT_LAYER_ALLOCATION_CANDIDATES,
  TWO_LAYER_ALLOCATION_CANDIDATES,
  buildLiveAllocationGuidance,
  buildStrategyPlanTimeline,
  optimizeStrategyCombinations,
  type CombinationScreeningProgress,
  type StrategyAllocationPlan,
  type StrategyCombinationResult,
} from "@/lib/analysis/strategy-combinations";
import {
  createSaveBacktestInput,
  type SavedBacktestRecord,
} from "@/lib/analysis/saved-backtests";
import { buildLiveStrategyGuidance } from "@/lib/analysis/live-guidance";
import {
  classifyManualExecutionWindow,
  type ManualExecutionWindow,
} from "@/lib/analysis/execution-timing";
import { buildAllocationTradeMarkers } from "@/lib/analysis/trade-markers";
import {
  analyzeStrategyStability,
  type StabilityEvidence,
  type StabilityEvidenceReason,
} from "@/lib/analysis/stability";
import type {
  MarketInstrument,
  MarketInterval,
  MarketSeries,
} from "@/lib/market/types";
import { DAILY_HISTORY_LIMIT } from "@/lib/market/history";
import { mergeLatestMarketSeries } from "@/lib/market/series";

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

const longStrategyLineLabels: StrategyLineLabels = {
  prefix: copy.chart.strategyLines.longPrefix,
  roles: { ...copy.chart.strategyLines.roles },
};

const shortStrategyLineLabels: StrategyLineLabels = {
  prefix: copy.chart.strategyLines.shortPrefix,
  roles: { ...copy.chart.strategyLines.roles },
};

const backtestChartLabels = {
  equity: copy.chart.equity,
  drawdown: copy.chart.drawdown,
};

const DAILY_INTERVAL: MarketInterval = "1d";
const HISTORICAL_EXECUTION_POLICY = "next-open" as const;
const LONG_ALLOCATION_OPTIONS = LONG_LAYER_ALLOCATION_CANDIDATES.map(
  (allocation) => allocation * 100,
);
const SHORT_ALLOCATION_OPTIONS = SHORT_LAYER_ALLOCATION_CANDIDATES.map(
  (allocation) => allocation * 100,
);
const DUAL_ALLOCATION_OPTIONS = TWO_LAYER_ALLOCATION_CANDIDATES.map(
  ({ longAllocation, shortAllocation }) => ({
    long: longAllocation * 100,
    short: shortAllocation * 100,
  }),
);

function nearestAllocation(
  options: readonly number[],
  value: number,
): number {
  return options.reduce((nearest, option) =>
    Math.abs(option - value) < Math.abs(nearest - value) ? option : nearest,
  );
}

function nearestDualAllocation(
  longAllocation: number,
  shortAllocation: number,
) {
  return DUAL_ALLOCATION_OPTIONS.reduce((nearest, option) => {
    const nearestDistance =
      Math.abs(nearest.long - longAllocation) +
      Math.abs(nearest.short - shortAllocation);
    const optionDistance =
      Math.abs(option.long - longAllocation) +
      Math.abs(option.short - shortAllocation);
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

const LIVE_REFRESH_INTERVAL_MS = 60_000;

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

function formatObjectiveValue(
  result: BacktestPerformance,
  objective: ScreeningObjective,
) {
  const value = screeningObjectiveValue(result, objective);
  if (objective === "totalReturn" || objective === "minDrawdown") {
    return formatPercent(value, objective === "totalReturn");
  }
  return formatNumber(value, 2);
}

const longStrategies = getStrategiesByHorizon("long");
const shortStrategies = getStrategiesByHorizon("short");

function emptyCombinationProgress(): CombinationScreeningProgress {
  return {
    completed: 0,
    total: 0,
    failed: 0,
    stage: "strategies",
    longStrategyId: null,
    shortStrategyId: null,
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

export function MarketWorkspace() {
  const [instrument, setInstrument] =
    useState<MarketInstrument>(defaultInstrument);
  const [series, setSeries] = useState<MarketSeries | null>(null);
  const [chartType, setChartType] = useState<"candlestick" | "line">(
    "candlestick",
  );
  const [focusedIndicator, setFocusedIndicator] =
    useState<IndicatorId>("macd");
  const [visibleIndicatorIds, setVisibleIndicatorIds] = useState<IndicatorId[]>(
    ["macd"],
  );
  const [indicatorSettings, setIndicatorSettings] = useState(
    createDefaultIndicatorSettings,
  );
  const [longStrategyId, setLongStrategyId] = useState<StrategyId | "">(
    "sma-cross",
  );
  const [longParameters, setLongParameters] = useState<StrategyParameters>(
    getStrategy("sma-cross").defaultParameters,
  );
  const [shortStrategyId, setShortStrategyId] = useState<StrategyId | "">("");
  const [shortParameters, setShortParameters] =
    useState<StrategyParameters>({});
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
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [screening, setScreening] = useState(false);
  const [screenResults, setScreenResults] = useState<BacktestResult[]>([]);
  const [maxParameterSets, setMaxParameterSets] = useState(
    DEFAULT_PARAMETER_SETS_PER_STRATEGY,
  );
  const [screeningObjective, setScreeningObjective] =
    useState<ScreeningObjective>("balanced");
  const [screenProgress, setScreenProgress] = useState<ScreeningProgress>({
    completed: 0,
    total: 0,
    failed: 0,
    strategyId: null,
  });
  const [combinationScreening, setCombinationScreening] = useState(false);
  const [
    combinationScreeningObjective,
    setCombinationScreeningObjective,
  ] = useState<ScreeningObjective>("balanced");
  const [combinationMaxParameterSets, setCombinationMaxParameterSets] =
    useState(DEFAULT_PARAMETER_SETS_PER_STRATEGY);
  const [combinationResults, setCombinationResults] = useState<
    StrategyCombinationResult[]
  >([]);
  const [longAllocationPercent, setLongAllocationPercent] = useState(
    DEFAULT_LONG_ALLOCATION * 100,
  );
  const [shortAllocationPercent, setShortAllocationPercent] = useState(
    DEFAULT_SHORT_ALLOCATION * 100,
  );
  const [combinationProgress, setCombinationProgress] =
    useState<CombinationScreeningProgress>(emptyCombinationProgress);
  const [savedBacktests, setSavedBacktests] = useState<
    SavedBacktestRecord[]
  >([]);
  const [savedBacktestsLoading, setSavedBacktestsLoading] = useState(true);
  const [savedBacktestsError, setSavedBacktestsError] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [manualExecutionWindow, setManualExecutionWindow] =
    useState<ManualExecutionWindow>("next-open");
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const chartSectionRef = useRef<HTMLElement>(null);
  const pendingSavedBacktestRef = useRef<SavedBacktestRecord | null>(null);
  const screeningAbortRef = useRef<AbortController | null>(null);
  const combinationAbortRef = useRef<AbortController | null>(null);
  const currentSeriesKeyRef = useRef("");
  const latestSeriesDateRef = useRef("");
  const marketSeriesRef = useRef<MarketSeries | null>(null);
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
        const currentSeries = marketSeriesRef.current;
        const refreshesLatestOnly =
          currentSeries !== null &&
          currentSeriesKeyRef.current === seriesKey;
        let payload: MarketSeries;

        if (refreshesLatestOnly) {
          const latest = await loadSeries(
            currentSeries.instrument,
            "latest",
            5,
          );
          payload =
            latest.source === currentSeries.source &&
            latest.priceAdjustment === currentSeries.priceAdjustment
              ? mergeLatestMarketSeries(currentSeries, latest, seriesLimit)
              : currentSeries;
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
            }
          } catch (error) {
            if ((error as Error).name === "AbortError") throw error;
            // Cached history remains usable when the latest-bar request fails.
          }
        }
        marketSeriesRef.current = payload;
        setSeries(payload);

        if (payload.bars.length) {
          const sameSeries = currentSeriesKeyRef.current === seriesKey;
          const previousLatestDate = latestSeriesDateRef.current;
          const firstDate = datePart(payload.bars[0].time);
          const rangeStart = datePart(
            payload.bars[Math.max(0, payload.bars.length - 500)].time,
          );
          const lastDate = datePart(
            payload.bars[payload.bars.length - 1].time,
          );
          const saved = pendingSavedBacktestRef.current;
          const restoresSavedRange =
            saved?.instrument.secid === instrument.secid &&
            saved.instrument.provider === instrument.provider;
          setStartDate((current) => {
            if (
              restoresSavedRange &&
              saved.startDate >= firstDate &&
              saved.startDate <= lastDate
            ) {
              return saved.startDate;
            }
            if (sameSeries && current >= firstDate && current <= lastDate) {
              return current;
            }
            return rangeStart;
          });
          setEndDate((current) => {
            if (
              restoresSavedRange &&
              saved.endDate >= firstDate &&
              saved.endDate <= lastDate
            ) {
              return saved.endDate;
            }
            const followsLatest =
              sameSeries &&
              (!current ||
                current === previousLatestDate ||
                current > lastDate);
            if (followsLatest || !sameSeries) return lastDate;
            return current;
          });
          if (restoresSavedRange) pendingSavedBacktestRef.current = null;
          currentSeriesKeyRef.current = seriesKey;
          latestSeriesDateRef.current = lastDate;
        }
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
    const refreshExecutionWindow = () => {
      setManualExecutionWindow(classifyManualExecutionWindow());
    };
    const refreshVisibleMarket = () => {
      if (document.visibilityState === "visible") {
        refreshExecutionWindow();
        setRefreshVersion((value) => value + 1);
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshVisibleMarket();
    };
    const initialExecutionTimer = window.setTimeout(refreshExecutionWindow, 0);
    const refreshTimer = window.setInterval(
      refreshVisibleMarket,
      LIVE_REFRESH_INTERVAL_MS,
    );
    window.addEventListener("focus", refreshVisibleMarket);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearTimeout(initialExecutionTimer);
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
      combinationAbortRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    const loadSavedBacktests = async () => {
      setSavedBacktestsLoading(true);
      setSavedBacktestsError(false);
      try {
        const response = await fetch("/api/saved-backtests", {
          signal: controller.signal,
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
        if (!controller.signal.aborted) setSavedBacktestsLoading(false);
      }
    };
    void loadSavedBacktests();
    return () => controller.abort();
  }, []);

  const latest = series?.bars.at(-1);
  const previous = series?.bars.at(-2);
  const comparisonPrice =
    previous?.close ?? series?.previousClose ?? latest?.open ?? 0;
  const priceChange = latest ? latest.close - comparisonPrice : 0;
  const priceChangePercent =
    comparisonPrice === 0 ? 0 : (priceChange / comparisonPrice) * 100;
  const strategyPlan = useMemo<StrategyAllocationPlan | null>(() => {
    if (!longStrategyId && !shortStrategyId) return null;
    const longAllocation = longStrategyId
      ? Math.min(Math.max(longAllocationPercent / 100, 0), 1)
      : 0;
    const shortAllocation = Math.min(
      shortStrategyId
        ? Math.max(shortAllocationPercent / 100, 0)
        : 0,
      1 - longAllocation,
    );
    return {
      long: longStrategyId
        ? {
            strategyId: longStrategyId,
            parameters: longParameters,
          }
        : null,
      short: shortStrategyId
        ? {
            strategyId: shortStrategyId,
            parameters: shortParameters,
          }
        : null,
      longAllocation,
      shortAllocation,
    };
  }, [
    longParameters,
    longAllocationPercent,
    longStrategyId,
    shortParameters,
    shortAllocationPercent,
    shortStrategyId,
  ]);
  const singleSelection =
    strategyPlan && Boolean(strategyPlan.long) !== Boolean(strategyPlan.short)
      ? (strategyPlan.long ?? strategyPlan.short)
      : null;
  const usesSingleFullAllocation =
    Boolean(singleSelection) &&
    (strategyPlan?.long
      ? strategyPlan.longAllocation === 1
      : strategyPlan?.shortAllocation === 1);
  const liveGuidance = useMemo(() => {
    if (!series?.bars.length || !strategyPlan) return null;
    try {
      const allocation = buildLiveAllocationGuidance(
        series.bars,
        strategyPlan,
      );
      const exact =
        usesSingleFullAllocation && singleSelection
          ? buildLiveStrategyGuidance(
              series.bars,
              singleSelection.strategyId,
              singleSelection.parameters,
            )
          : null;
      const exactAllocation = exact
        ? {
            action:
              exact.action === "buy"
                ? ("increase" as const)
                : exact.action === "sell"
                  ? ("reduce" as const)
                  : exact.action,
            previousAllocation:
              exact.action === "buy" || exact.action === "wait" ? 0 : 1,
            targetAllocation:
              exact.action === "buy" || exact.action === "hold" ? 1 : 0,
          }
        : null;
      return allocation
        ? {
            ...(exactAllocation ?? allocation),
            barTime: exact?.barTime ?? series.bars.at(-1)?.time ?? "",
          }
        : null;
    } catch {
      return null;
    }
  }, [
    series,
    singleSelection,
    strategyPlan,
    usesSingleFullAllocation,
  ]);
  const lastUpdated = series?.fetchedAt
    ? updateTimeFormatter.format(new Date(series.fetchedAt))
    : copy.common.unavailable;

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
      } as const;
      if (usesSingleFullAllocation && singleSelection) {
        return runBacktest(
          series.bars,
          singleSelection.strategyId,
          singleSelection.parameters,
          settings,
        );
      }
      const timeline = buildStrategyPlanTimeline(series.bars, strategyPlan);
      return runAllocationBacktest(
        series.bars,
        timeline.target,
        settings,
        timeline.signalEvents,
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
    strategyPlan,
    usesSingleFullAllocation,
  ]);

  const stability = useMemo(() => {
    if (
      !series?.bars.length ||
      !startDate ||
      !endDate ||
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
      strategyPlan
        ? [
            ...(strategyPlan.long
              ? [
                  {
                    id: strategyPlan.long.strategyId,
                    parameters: strategyPlan.long.parameters,
                    lineLabels: longStrategyLineLabels,
                  },
                ]
              : []),
            ...(strategyPlan.short
              ? [
                  {
                    id: strategyPlan.short.strategyId,
                    parameters: strategyPlan.short.parameters,
                    lineLabels: shortStrategyLineLabels,
                  },
                ]
              : []),
          ]
        : [],
    [strategyPlan],
  );
  const allocationTradeMarkers =
    backtest && "rebalances" in backtest
      ? buildAllocationTradeMarkers(backtest.rebalances)
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
    if (!strategyPlan) return;
    scrollToStrategyChart();
  };

  const applySingleStrategy = (
    nextStrategyId: StrategyId,
    nextParameters?: StrategyParameters,
  ) => {
    const next = getStrategy(nextStrategyId);
    const mergedParameters = {
      ...next.defaultParameters,
      ...nextParameters,
    };
    if (next.horizon === "long") {
      setLongStrategyId(nextStrategyId);
      setLongParameters(mergedParameters);
      setShortStrategyId("");
      setShortParameters({});
    } else {
      setLongStrategyId("");
      setLongParameters({});
      setShortStrategyId(nextStrategyId);
      setShortParameters(mergedParameters);
    }
    setLongAllocationPercent(
      next.horizon === "long" ? DEFAULT_LONG_ALLOCATION * 100 : 0,
    );
    setShortAllocationPercent(
      next.horizon === "short" ? DEFAULT_SHORT_ALLOCATION * 100 : 0,
    );
    scrollToStrategyChart();
  };

  const selectLongStrategy = (nextStrategyId: StrategyId | "") => {
    setLongStrategyId(nextStrategyId);
    setLongParameters(
      nextStrategyId
        ? { ...getStrategy(nextStrategyId).defaultParameters }
        : {},
    );
    if (!nextStrategyId) {
      setLongAllocationPercent(0);
    } else if (shortStrategyId) {
      const nextAllocation = nearestDualAllocation(
        longAllocationPercent,
        shortAllocationPercent,
      );
      setLongAllocationPercent(nextAllocation.long);
      setShortAllocationPercent(nextAllocation.short);
    } else {
      setLongAllocationPercent((current) =>
        nearestAllocation(LONG_ALLOCATION_OPTIONS, current),
      );
    }
  };

  const selectShortStrategy = (nextStrategyId: StrategyId | "") => {
    setShortStrategyId(nextStrategyId);
    setShortParameters(
      nextStrategyId
        ? { ...getStrategy(nextStrategyId).defaultParameters }
        : {},
    );
    if (!nextStrategyId) {
      setShortAllocationPercent(0);
    } else if (longStrategyId) {
      const nextAllocation = nearestDualAllocation(
        longAllocationPercent,
        shortAllocationPercent || DEFAULT_SHORT_ALLOCATION * 100,
      );
      setLongAllocationPercent(nextAllocation.long);
      setShortAllocationPercent(nextAllocation.short);
    } else {
      setShortAllocationPercent((current) =>
        nearestAllocation(
          SHORT_ALLOCATION_OPTIONS,
          current || DEFAULT_SHORT_ALLOCATION * 100,
        ),
      );
    }
  };

  const selectLongAllocation = (nextLongAllocation: number) => {
    if (!shortStrategyId) {
      setLongAllocationPercent(nextLongAllocation);
      return;
    }
    const compatible = DUAL_ALLOCATION_OPTIONS.filter(
      (option) => option.long === nextLongAllocation,
    );
    const nextAllocation = compatible.reduce((nearest, option) =>
      Math.abs(option.short - shortAllocationPercent) <
      Math.abs(nearest.short - shortAllocationPercent)
        ? option
        : nearest,
    );
    setLongAllocationPercent(nextAllocation.long);
    setShortAllocationPercent(nextAllocation.short);
  };

  const selectShortAllocation = (nextShortAllocation: number) => {
    if (!longStrategyId) {
      setShortAllocationPercent(nextShortAllocation);
      return;
    }
    const compatible = DUAL_ALLOCATION_OPTIONS.filter(
      (option) => option.short === nextShortAllocation,
    );
    const nextAllocation = compatible.reduce((nearest, option) =>
      Math.abs(option.long - longAllocationPercent) <
      Math.abs(nearest.long - longAllocationPercent)
        ? option
        : nearest,
    );
    setLongAllocationPercent(nextAllocation.long);
    setShortAllocationPercent(nextAllocation.short);
  };

  const applyCombinationResult = (result: StrategyCombinationResult) => {
    setLongStrategyId(result.longStrategyId);
    setLongParameters({ ...result.longParameters });
    setShortStrategyId(result.shortStrategyId);
    setShortParameters({ ...result.shortParameters });
    setLongAllocationPercent(Math.round(result.longAllocation * 100));
    setShortAllocationPercent(Math.round(result.shortAllocation * 100));
    scrollToStrategyChart();
  };

  const focusIndicator = (nextIndicator: IndicatorId) => {
    setFocusedIndicator(nextIndicator);
    setVisibleIndicatorIds((current) =>
      current.includes(nextIndicator)
        ? current
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
    if (!backtest || !strategyPlan) return;
    setSaveStatus("saving");
    try {
      const response = await fetch("/api/saved-backtests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          createSaveBacktestInput(
            instrument,
            DAILY_INTERVAL,
            strategyPlan,
            startDate,
            endDate,
            initialCash,
            commissionPercent,
            slippagePercent,
            backtest,
          ),
        ),
      });
      const payload = (await response.json()) as {
        savedBacktest?: SavedBacktestRecord;
      };
      if (!response.ok || !payload.savedBacktest) {
        throw new Error("PERSISTENCE_UNAVAILABLE");
      }
      setSavedBacktests((current) => [
        payload.savedBacktest!,
        ...current.filter((item) => item.id !== payload.savedBacktest!.id),
      ]);
      setSavedBacktestsError(false);
      setSaveStatus("saved");
      window.setTimeout(() => setSaveStatus("idle"), 1600);
    } catch {
      setSaveStatus("error");
    }
  };

  const resetSingleScreening = () => {
    screeningAbortRef.current?.abort();
    screeningAbortRef.current = null;
    setScreening(false);
    setScreenResults([]);
    setScreenProgress({
      completed: 0,
      total: 0,
      failed: 0,
      strategyId: null,
    });
  };

  const resetCombinationScreening = () => {
    combinationAbortRef.current?.abort();
    combinationAbortRef.current = null;
    setCombinationScreening(false);
    setCombinationResults([]);
    setCombinationProgress(emptyCombinationProgress());
  };

  const resetScreening = () => {
    resetSingleScreening();
    resetCombinationScreening();
  };

  const openSavedBacktest = (saved: SavedBacktestRecord) => {
    resetScreening();
    const changesInstrument =
      saved.instrument.secid !== instrument.secid ||
      saved.instrument.provider !== instrument.provider;
    const requiresMarketReload =
      changesInstrument || !series || series.interval !== DAILY_INTERVAL;
    pendingSavedBacktestRef.current = requiresMarketReload ? saved : null;
    if (changesInstrument) {
      setInstrument(saved.instrument);
    } else if (requiresMarketReload) {
      setRefreshVersion((value) => value + 1);
    }
    setLongStrategyId(saved.plan.long?.strategyId ?? "");
    setLongParameters(
      saved.plan.long ? { ...saved.plan.long.parameters } : {},
    );
    setShortStrategyId(saved.plan.short?.strategyId ?? "");
    setShortParameters(
      saved.plan.short ? { ...saved.plan.short.parameters } : {},
    );
    const savedLongAllocation = Math.round(saved.plan.longAllocation * 100);
    const savedShortAllocation = Math.round(saved.plan.shortAllocation * 100);
    if (saved.plan.long && saved.plan.short) {
      const nextAllocation = nearestDualAllocation(
        savedLongAllocation,
        savedShortAllocation,
      );
      setLongAllocationPercent(nextAllocation.long);
      setShortAllocationPercent(nextAllocation.short);
    } else if (saved.plan.long) {
      setLongAllocationPercent(
        nearestAllocation(LONG_ALLOCATION_OPTIONS, savedLongAllocation),
      );
      setShortAllocationPercent(0);
    } else {
      setLongAllocationPercent(0);
      setShortAllocationPercent(
        nearestAllocation(
          SHORT_ALLOCATION_OPTIONS,
          savedShortAllocation || DEFAULT_SHORT_ALLOCATION * 100,
        ),
      );
    }
    setStartDate(saved.startDate);
    setEndDate(saved.endDate);
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
      setSavedBacktests((current) =>
        current.filter((saved) => saved.id !== id),
      );
    } catch {
      setSavedBacktestsError(true);
    }
  };

  const startScreening = async () => {
    if (!series?.bars.length) return;
    screeningAbortRef.current?.abort();
    const controller = new AbortController();
    screeningAbortRef.current = controller;
    setScreening(true);
    setScreenResults([]);
    setScreenProgress({
      completed: 0,
      total: 0,
      failed: 0,
      strategyId: null,
    });

    const outcome = await optimizeStrategies(
      series.bars,
      {
        initialCash,
        commissionRate: commissionPercent / 100,
        slippageRate: slippagePercent / 100,
        startTime: startDate,
        endTime: endDate,
        interval: DAILY_INTERVAL,
        executionPolicy: HISTORICAL_EXECUTION_POLICY,
      },
      {
        maxPerStrategy: maxParameterSets,
        objective: screeningObjective,
        signal: controller.signal,
        onProgress: setScreenProgress,
      },
    );

    if (screeningAbortRef.current !== controller) return;
    setScreenResults(outcome.results);
    setScreenProgress((current) => ({
      ...current,
      completed: outcome.evaluatedCount,
      total: outcome.totalCandidates,
      failed: outcome.failedCount,
    }));
    setScreening(false);
    screeningAbortRef.current = null;
  };

  const stopScreening = () => {
    screeningAbortRef.current?.abort();
  };

  const startCombinationScreening = async () => {
    if (!series?.bars.length) return;
    combinationAbortRef.current?.abort();
    const controller = new AbortController();
    combinationAbortRef.current = controller;
    setCombinationScreening(true);
    setCombinationResults([]);
    setCombinationProgress(emptyCombinationProgress());

    const outcome = await optimizeStrategyCombinations(
      series.bars,
      {
        initialCash,
        commissionRate: commissionPercent / 100,
        slippageRate: slippagePercent / 100,
        startTime: startDate,
        endTime: endDate,
        interval: DAILY_INTERVAL,
        executionPolicy: HISTORICAL_EXECUTION_POLICY,
      },
      {
        maxPerStrategy: combinationMaxParameterSets,
        objective: combinationScreeningObjective,
        signal: controller.signal,
        onProgress: setCombinationProgress,
      },
    );

    if (combinationAbortRef.current !== controller) return;
    setCombinationResults(outcome.results);
    setCombinationProgress((current) => ({
      ...current,
      completed: outcome.evaluatedCount,
      total: outcome.totalCandidates,
      failed: outcome.failedCount,
    }));
    setCombinationScreening(false);
    combinationAbortRef.current = null;
  };

  const stopCombinationScreening = () => {
    combinationAbortRef.current?.abort();
  };

  const chooseInstrument = (nextInstrument: MarketInstrument) => {
    resetScreening();
    pendingSavedBacktestRef.current = null;
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
  const screeningBusy = screening || combinationScreening;
  const bestCombination = combinationResults[0] ?? null;
  const selectedStrategySummary = [
    ...(strategyPlan?.long
      ? [copy.strategies[strategyPlan.long.strategyId].name]
      : []),
    ...(strategyPlan?.short
      ? [copy.strategies[strategyPlan.short.strategyId].name]
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
          <span className="exchange-badge">{instrument.exchange}</span>
          <div>
            <h1>{series?.instrument.name ?? instrument.name}</h1>
            <p>
              {instrument.exchange}:{instrument.code} {copy.common.separator}{" "}
              {copy.assetTypes[instrument.assetType]}
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
          <em>
            {copy.liveGuidance.execution[manualExecutionWindow]}{" "}
            {copy.common.separator} {copy.liveGuidance.disclosure}{" "}
            {copy.common.separator}{" "}
            {copy.liveGuidance.autoRefresh}
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
                onClick={() => focusIndicator(item.id)}
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
                  {selectedStrategySummary || copy.lab.noStrategy}
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
                  backtest && "trades" in backtest
                    ? backtest.trades
                    : []
                }
                tradeMarkers={allocationTradeMarkers}
                dataKey={`${instrument.secid}:${DAILY_INTERVAL}`}
                chartType={chartType}
                visibleIndicators={visibleIndicators}
                strategyConfigurations={strategyConfigurations}
                ariaLabel={copy.chart.aria}
                labels={priceChartLabels}
              />
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
                disabled={!backtest || saveStatus === "saving"}
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
            <div className="saved-shortcuts-summary">
              <span>{copy.savedBacktests.savedCount}</span>
              <strong>{savedBacktests.length}</strong>
            </div>
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
                {savedBacktests.map((saved) => {
                  const active =
                    saved.instrument.secid === instrument.secid &&
                    saved.instrument.provider === instrument.provider;
                  return (
                    <div
                      className={`saved-shortcut ${active ? "active" : ""}`}
                      key={saved.id}
                    >
                      <button
                        className="saved-shortcut-main"
                        type="button"
                        onClick={() => openSavedBacktest(saved)}
                        title={copy.savedBacktests.open}
                      >
                        <span className="saved-shortcut-name">
                          <strong>{saved.instrument.name}</strong>
                          <b
                            className={
                              saved.metrics.totalReturn >= 0
                                ? "positive"
                                : "negative"
                            }
                          >
                            {formatPercent(
                              saved.metrics.totalReturn,
                              true,
                            )}
                          </b>
                        </span>
                        <small>
                          {saved.instrument.exchange}:{saved.instrument.code}
                          {" "}
                          {copy.common.separator}{" "}
                          {copy.intervals[saved.interval]}
                          {" "}
                          {copy.common.separator}{" "}
                          {[
                            saved.plan.long
                              ? copy.strategies[
                                  saved.plan.long.strategyId
                                ].name
                              : null,
                            saved.plan.short
                              ? copy.strategies[
                                  saved.plan.short.strategyId
                                ].name
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" + ")}
                          {" "}
                          {copy.common.separator}{" "}
                          {saved.plan.long
                            ? `A ${Math.round(saved.plan.longAllocation * 100)}%`
                            : ""}
                          {saved.plan.long && saved.plan.short ? " + " : ""}
                          {saved.plan.short
                            ? `B ${Math.round(saved.plan.shortAllocation * 100)}%`
                            : ""}
                        </small>
                        {saved.interval !== DAILY_INTERVAL && (
                          <span className="saved-shortcut-legacy">
                            {copy.savedBacktests.legacyIntervalPrefix}{" "}
                            {copy.intervals[saved.interval]}{" "}
                            {copy.savedBacktests.legacyIntervalSuffix}
                          </span>
                        )}
                      </button>
                      <button
                        className="saved-shortcut-delete"
                        type="button"
                        onClick={() => void deleteSavedBacktest(saved.id)}
                        aria-label={`${copy.savedBacktests.remove} ${saved.instrument.name}`}
                        title={copy.savedBacktests.remove}
                      >
                        <Trash2 size={12} />
                      </button>
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
                {longStrategyId && (
                  <span className="horizon-badge long">
                    {copy.strategyHorizons.long}
                  </span>
                )}
                {shortStrategyId && (
                  <span className="horizon-badge short">
                    {copy.strategyHorizons.short}
                  </span>
                )}
              </div>
            </div>
            <div className="lab-heading-actions">
              <button
                className="apply-current-strategy-button"
                type="button"
                disabled={!strategyPlan}
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
                <span>{copy.lab.longStrategy}</span>
                <select
                  name="long-strategy"
                  value={longStrategyId}
                  onChange={(event) =>
                    selectLongStrategy(
                      event.target.value as StrategyId | "",
                    )
                  }
                >
                  <option value="">{copy.lab.noLongStrategy}</option>
                  {longStrategies.map((strategy) => (
                    <option key={strategy.id} value={strategy.id}>
                      {copy.strategies[strategy.id].name}
                    </option>
                  ))}
                </select>
                <small>
                  {longStrategyId
                    ? copy.strategies[longStrategyId].description
                    : copy.lab.noLongDescription}
                </small>
              </label>
              {longStrategyId && (
                <StrategyParameterFields
                  heading={copy.lab.longParameters}
                  namePrefix="long"
                  parameters={longParameters}
                  onChange={setLongParameters}
                />
              )}
            </div>
            <div className="strategy-selector-card">
              <label className="field-label">
                <span>{copy.lab.shortStrategy}</span>
                <select
                  name="short-strategy"
                  value={shortStrategyId}
                  onChange={(event) =>
                    selectShortStrategy(
                      event.target.value as StrategyId | "",
                    )
                  }
                >
                  <option value="">{copy.lab.noShortStrategy}</option>
                  {shortStrategies.map((strategy) => (
                    <option key={strategy.id} value={strategy.id}>
                      {copy.strategies[strategy.id].name}
                    </option>
                  ))}
                </select>
                <small>
                  {shortStrategyId
                    ? copy.strategies[shortStrategyId].description
                    : copy.lab.noShortDescription}
                </small>
              </label>
              {shortStrategyId && (
                <StrategyParameterFields
                  heading={copy.lab.shortParameters}
                  namePrefix="short"
                  parameters={shortParameters}
                  onChange={setShortParameters}
                />
              )}
            </div>
          </div>

          <div className="allocation-grid">
            <label className="field-label">
              <span>{copy.lab.longAllocation}</span>
              <select
                name="long-allocation"
                value={longAllocationPercent}
                disabled={!longStrategyId}
                onChange={(event) =>
                  selectLongAllocation(Number(event.target.value))
                }
              >
                {LONG_ALLOCATION_OPTIONS.map((allocation) => (
                  <option key={allocation} value={allocation}>
                    {allocation}%
                  </option>
                ))}
              </select>
              <small>{copy.lab.longAllocationHint}</small>
            </label>
            <label className="field-label">
              <span>{copy.lab.shortAllocation}</span>
              <select
                name="short-allocation"
                value={shortAllocationPercent}
                disabled={!shortStrategyId}
                onChange={(event) =>
                  selectShortAllocation(Number(event.target.value))
                }
              >
                {!shortStrategyId && <option value={0}>0%</option>}
                {SHORT_ALLOCATION_OPTIONS.map((allocation) => (
                  <option key={allocation} value={allocation}>
                    {allocation}%
                  </option>
                ))}
              </select>
              <small>{copy.lab.shortAllocationHint}</small>
            </label>
          </div>

          <div className="date-grid">
            <label className="field-label">
              <span>{copy.lab.start}</span>
              <input
                type="date"
                value={startDate}
                min={minDate}
                max={endDate || maxDate}
                onChange={(event) => {
                  resetScreening();
                  setStartDate(event.target.value);
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
                  resetScreening();
                  setEndDate(event.target.value);
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
                  resetScreening();
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
                  resetScreening();
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
                  resetScreening();
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
          <span className="eyebrow">{copy.screening.eyebrow}</span>
          <h2>
            <Sparkles size={21} />
            {copy.screening.title}
          </h2>
          <p>{copy.screening.description}</p>
          <div className="screening-config">
            <label className="screening-control-field">
              <span>{copy.screening.objective}</span>
              <select
                name="single-screening-objective"
                value={screeningObjective}
                disabled={screeningBusy}
                onChange={(event) => {
                  setScreeningObjective(
                    event.target.value as ScreeningObjective,
                  );
                  resetSingleScreening();
                }}
              >
                {SCREENING_OBJECTIVES.map((value) => (
                  <option value={value} key={value}>
                    {copy.screening.objectives[value]}
                  </option>
                ))}
              </select>
              <small>
                {copy.screening.objectiveDescriptions[screeningObjective]}
              </small>
            </label>
            <label className="screening-control-field">
              <span>{copy.screening.maxPerStrategy}</span>
              <input
                name="single-max-parameter-sets"
                type="number"
                min={1}
                max={MAX_PARAMETER_SETS_PER_STRATEGY}
                step={50}
                value={maxParameterSets}
                disabled={screeningBusy}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  setMaxParameterSets(
                    Math.min(
                      Math.max(
                        Number.isFinite(nextValue)
                          ? Math.floor(nextValue)
                          : 1,
                        1,
                      ),
                      MAX_PARAMETER_SETS_PER_STRATEGY,
                    ),
                  );
                  resetSingleScreening();
                }}
              />
              <small>
                {copy.screening.limitHint}{" "}
                {MAX_PARAMETER_SETS_PER_STRATEGY}
              </small>
            </label>
          </div>
          <button
            type="button"
            className={`primary-action ${screening ? "stop" : ""}`}
            disabled={!series || combinationScreening}
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
          {screenProgress.total > 0 && (
            <div className="screening-progress" aria-live="polite">
              <div>
                <span>
                  {screening
                    ? copy.screening.running
                    : screenProgress.completed < screenProgress.total
                      ? copy.screening.stopped
                    : copy.screening.completed}
                </span>
                <strong>
                  {screenProgress.completed} / {screenProgress.total}
                  {screenProgress.failed > 0
                    ? ` · ${screenProgress.failed} ${copy.screening.skipped}`
                    : ""}
                </strong>
              </div>
              <progress
                max={screenProgress.total}
                value={screenProgress.completed}
              />
            </div>
          )}
          <div className="risk-note">
            <ShieldAlert size={15} />
            <span>{copy.screening.overfit}</span>
          </div>
        </div>

        <div className="screening-results">
          <div className="results-heading">
            <div>
              <Trophy size={17} />
              <strong>
                {screenResults.length
                  ? copy.screening.completed
                  : copy.screening.title}
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
                    <th>{copy.screening.objectiveValue}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {screenResults.slice(0, 8).map((result, index) => (
                    <tr
                      key={`${result.strategyId}-${JSON.stringify(result.parameters)}`}
                    >
                      <td>
                        <span className={`rank rank-${index + 1}`}>
                          {index + 1}
                        </span>
                      </td>
                      <td>
                        <div className="strategy-cell">
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
                          <small>
                            {Object.entries(result.parameters)
                              .map(([key, value]) => `${key} ${value}`)
                              .join(` ${copy.common.separator} `)}
                          </small>
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
                        <span className={`fit-badge ${resultTone(result)}`}>
                          {resultTone(result) === "positive"
                            ? copy.screening.suitable
                            : copy.screening.caution}
                          <b>
                            {formatObjectiveValue(
                              result,
                              screeningObjective,
                            )}
                          </b>
                        </span>
                      </td>
                      <td>
                        <button
                          className="apply-button"
                          type="button"
                          title={copy.screening.applyToChart}
                          onClick={() =>
                            applySingleStrategy(
                              result.strategyId,
                              result.parameters,
                            )
                          }
                        >
                          {copy.screening.use}
                          <ChevronRight size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <section
          className="combination-screening"
          aria-labelledby="combination-screening-title"
        >
          <div className="combination-intro">
            <span className="eyebrow">
              {copy.combinationScreening.eyebrow}
            </span>
            <h2 id="combination-screening-title">
              <Sparkles size={21} />
              {copy.combinationScreening.title}
            </h2>
            <p>{copy.combinationScreening.description}</p>

            <div className="screening-config">
              <label className="screening-control-field">
                <span>{copy.screening.objective}</span>
                <select
                  name="combination-screening-objective"
                  value={combinationScreeningObjective}
                  disabled={screeningBusy}
                  onChange={(event) => {
                    setCombinationScreeningObjective(
                      event.target.value as ScreeningObjective,
                    );
                    resetCombinationScreening();
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
                      combinationScreeningObjective
                    ]
                  }
                </small>
              </label>
              <label className="screening-control-field">
                <span>{copy.screening.maxPerStrategy}</span>
                <input
                  name="combination-max-parameter-sets"
                  type="number"
                  min={1}
                  max={MAX_PARAMETER_SETS_PER_STRATEGY}
                  step={50}
                  value={combinationMaxParameterSets}
                  disabled={screeningBusy}
                  onChange={(event) => {
                    const nextValue = Number(event.target.value);
                    setCombinationMaxParameterSets(
                      Math.min(
                        Math.max(
                          Number.isFinite(nextValue)
                            ? Math.floor(nextValue)
                            : 1,
                          1,
                        ),
                        MAX_PARAMETER_SETS_PER_STRATEGY,
                      ),
                    );
                    resetCombinationScreening();
                  }}
                />
                <small>
                  {copy.screening.limitHint}{" "}
                  {MAX_PARAMETER_SETS_PER_STRATEGY}
                </small>
              </label>
            </div>

            <button
              type="button"
              className={`primary-action ${combinationScreening ? "stop" : ""}`}
              disabled={!series || screening}
              onClick={() =>
                combinationScreening
                  ? stopCombinationScreening()
                  : void startCombinationScreening()
              }
            >
              {combinationScreening ? (
                <Square size={14} fill="currentColor" />
              ) : (
                <Sparkles size={16} />
              )}
              {combinationScreening
                ? copy.combinationScreening.stop
                : copy.combinationScreening.action}
            </button>

            {combinationProgress.total > 0 && (
              <div className="screening-progress" aria-live="polite">
                <div>
                  <span>
                    {combinationScreening
                      ? combinationProgress.stage === "strategies"
                        ? copy.combinationScreening.runningStrategies
                        : combinationProgress.stage === "pairs"
                          ? copy.combinationScreening.runningPairs
                          : copy.combinationScreening.runningAllocations
                      : combinationProgress.completed <
                          combinationProgress.total
                        ? copy.combinationScreening.stopped
                        : copy.combinationScreening.completed}
                  </span>
                  <strong>
                    {combinationProgress.completed} /{" "}
                    {combinationProgress.total}
                    {combinationProgress.failed > 0
                      ? ` · ${combinationProgress.failed} ${copy.screening.skipped}`
                      : ""}
                  </strong>
                </div>
                <progress
                  max={combinationProgress.total}
                  value={combinationProgress.completed}
                />
              </div>
            )}

            <div className="risk-note">
              <ShieldAlert size={15} />
              <span>{copy.combinationScreening.overfit}</span>
            </div>
          </div>

          <div className="combination-results">
            <div className="results-heading">
              <div>
                <Trophy size={17} />
                <strong>
                  {combinationResults.length
                    ? copy.combinationScreening.completed
                    : copy.combinationScreening.title}
                </strong>
              </div>
              {combinationResults.length > 0 && (
                <span>
                  {combinationResults.length}{" "}
                  {copy.combinationScreening.bestResults}
                  {" · "}
                  {combinationProgress.completed}{" "}
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
                        <th>{copy.combinationScreening.longStrategy}</th>
                        <th>{copy.combinationScreening.shortStrategy}</th>
                        <th>{copy.combinationScreening.allocationPlan}</th>
                        <th>{copy.screening.return}</th>
                        <th>{copy.screening.drawdown}</th>
                        <th>{copy.screening.sharpe}</th>
                        <th>{copy.combinationScreening.rebalances}</th>
                        <th>{copy.screening.objectiveValue}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {combinationResults.slice(0, 8).map((result, index) => (
                        <tr
                          key={`${result.longStrategyId}-${JSON.stringify(result.longParameters)}-${result.shortStrategyId}-${JSON.stringify(result.shortParameters)}-${result.longAllocation}-${result.shortAllocation}`}
                        >
                          <td>
                            <span className={`rank rank-${index + 1}`}>
                              {index + 1}
                            </span>
                          </td>
                          <td>
                            <div className="strategy-cell">
                              <strong>
                                {copy.strategies[result.longStrategyId].name}
                              </strong>
                              <span className="horizon-badge long">
                                {copy.strategyHorizons.long}
                              </span>
                              <small>
                                {Object.entries(result.longParameters)
                                  .map(
                                    ([key, value]) => `${key} ${value}`,
                                  )
                                  .join(` ${copy.common.separator} `)}
                              </small>
                            </div>
                          </td>
                          <td>
                            <div className="strategy-cell">
                              <strong>
                                {copy.strategies[result.shortStrategyId].name}
                              </strong>
                              <span className="horizon-badge short">
                                {copy.strategyHorizons.short}
                              </span>
                              <small>
                                {Object.entries(result.shortParameters)
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
                                A {Math.round(result.longAllocation * 100)}%
                                {" + "}
                                B {Math.round(result.shortAllocation * 100)}%
                              </strong>
                              <small>
                                {copy.combinationScreening.maximumHolding}{" "}
                                {Math.round(
                                  (result.longAllocation +
                                    result.shortAllocation) *
                                    100,
                                )}%
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
                              className={`fit-badge ${resultTone(result)}`}
                            >
                              {resultTone(result) === "positive"
                                ? copy.screening.suitable
                                : copy.screening.caution}
                              <b>
                                {formatObjectiveValue(
                                  result,
                                  combinationScreeningObjective,
                                )}
                              </b>
                            </span>
                          </td>
                          <td>
                            <button
                              className="apply-button"
                              type="button"
                              title={copy.screening.applyToChart}
                              onClick={() =>
                                applyCombinationResult(result)
                              }
                            >
                              {copy.screening.use}
                              <ChevronRight size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {bestCombination ? (
                  <div className="combination-preview">
                    <strong>{copy.combinationScreening.preview}</strong>
                    <span>
                      {copy.strategies[bestCombination.longStrategyId].name}
                      {" + "}
                      {copy.strategies[bestCombination.shortStrategyId].name}
                      {" · "}
                      A {Math.round(bestCombination.longAllocation * 100)}%
                      {" + "}
                      B {Math.round(bestCombination.shortAllocation * 100)}%
                    </span>
                    <BacktestChart
                      result={bestCombination}
                      ariaLabel={copy.chart.backtestAria}
                      labels={backtestChartLabels}
                    />
                  </div>
                ) : (
                  <div className="screening-empty">
                    <p>{copy.combinationScreening.noPreview}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
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
