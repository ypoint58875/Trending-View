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
  type StrategyLineLabels,
} from "./components/PriceChart";
import { zhCN as copy } from "./i18n/zh-CN";
import { runBacktest, type BacktestResult } from "@/lib/analysis/backtest";
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
  optimizeStrategies,
  screeningObjectiveValue,
  type ScreeningObjective,
  type ScreeningProgress,
} from "@/lib/analysis/screening";
import {
  STRATEGIES,
  getStrategy,
  type StrategyId,
  type StrategyParameters,
} from "@/lib/analysis/strategies";
import {
  createSaveBacktestInput,
  type SavedBacktestRecord,
} from "@/lib/analysis/saved-backtests";
import { buildLiveStrategyGuidance } from "@/lib/analysis/live-guidance";
import { analyzeStrategyStability } from "@/lib/analysis/stability";
import type {
  MarketInstrument,
  MarketInterval,
  MarketSeries,
} from "@/lib/market/types";
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
  buy: copy.chart.buy,
  sell: copy.chart.sell,
  rangeExit: copy.chart.rangeExit,
  series: { ...copy.chart.series },
};

const strategyLineLabels: StrategyLineLabels = {
  prefix: copy.chart.strategyLines.prefix,
  roles: { ...copy.chart.strategyLines.roles },
};

const backtestChartLabels = {
  equity: copy.chart.equity,
  drawdown: copy.chart.drawdown,
};

const DAILY_INTERVAL: MarketInterval = "1d";

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

function isPeriodParameter(key: string) {
  return (
    key.endsWith("Period") ||
    [
      "fast",
      "slow",
      "period",
      "signal",
      "length",
      "upBars",
      "downBars",
      "leftBars",
      "rightBars",
      "smoothK",
      "smoothD",
    ].includes(key)
  );
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
  return isDecimalParameter(key) ? 0.1 : 1;
}

function resultTone(result: BacktestResult) {
  return result.totalReturn > 0 && result.sharpe > 0 && result.tradeCount >= 2
    ? "positive"
    : "neutral";
}

function formatObjectiveValue(
  result: BacktestResult,
  objective: ScreeningObjective,
) {
  const value = screeningObjectiveValue(result, objective);
  if (objective === "totalReturn" || objective === "minDrawdown") {
    return formatPercent(value, objective === "totalReturn");
  }
  return formatNumber(value, 2);
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
  const [strategyId, setStrategyId] = useState<StrategyId>("sma-cross");
  const [parameters, setParameters] = useState<StrategyParameters>(
    getStrategy("sma-cross").defaultParameters,
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
  const [savedBacktests, setSavedBacktests] = useState<
    SavedBacktestRecord[]
  >([]);
  const [savedBacktestsLoading, setSavedBacktestsLoading] = useState(true);
  const [savedBacktestsError, setSavedBacktestsError] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const pendingSavedBacktestRef = useRef<SavedBacktestRecord | null>(null);
  const screeningAbortRef = useRef<AbortController | null>(null);
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
      const seriesLimit = 1000;
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
            latest.source === currentSeries.source
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
            if (latest.source === history.source) {
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
          `/api/search?q=${encodeURIComponent(query.trim())}`,
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
  const liveGuidance = useMemo(() => {
    if (!series?.bars.length) return null;
    try {
      return buildLiveStrategyGuidance(
        series.bars,
        strategyId,
        parameters,
      );
    } catch {
      return null;
    }
  }, [parameters, series, strategyId]);
  const lastUpdated = series?.fetchedAt
    ? updateTimeFormatter.format(new Date(series.fetchedAt))
    : copy.common.unavailable;

  const backtest = useMemo(() => {
    if (!series?.bars.length || !startDate || !endDate) return null;
    try {
      return runBacktest(series.bars, strategyId, parameters, {
        initialCash,
        commissionRate: commissionPercent / 100,
        slippageRate: slippagePercent / 100,
        startTime: startDate,
        endTime: endDate,
        interval: DAILY_INTERVAL,
      });
    } catch {
      return null;
    }
  }, [
    commissionPercent,
    endDate,
    initialCash,
    parameters,
    series,
    slippagePercent,
    startDate,
    strategyId,
  ]);

  const stability = useMemo(() => {
    if (!series?.bars.length || !startDate || !endDate) return null;
    try {
      const analysis = analyzeStrategyStability(
        series.bars,
        strategyId,
        parameters,
        {
          initialCash,
          commissionRate: commissionPercent / 100,
          slippageRate: slippagePercent / 100,
          startTime: startDate,
          endTime: endDate,
          interval: DAILY_INTERVAL,
        },
      );
      return analysis.variantResults.length > 0 ? analysis : null;
    } catch {
      return null;
    }
  }, [
    commissionPercent,
    endDate,
    initialCash,
    parameters,
    series,
    slippagePercent,
    startDate,
    strategyId,
  ]);

  const selectStrategy = (
    nextStrategyId: StrategyId,
    nextParameters?: StrategyParameters,
  ) => {
    const next = getStrategy(nextStrategyId);
    setStrategyId(nextStrategyId);
    setParameters({
      ...next.defaultParameters,
      ...nextParameters,
    });
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
    if (!backtest) return;
    setSaveStatus("saving");
    try {
      const response = await fetch("/api/saved-backtests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          createSaveBacktestInput(
            instrument,
            DAILY_INTERVAL,
            strategyId,
            parameters,
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

  const resetScreening = () => {
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
    selectStrategy(saved.strategyId, saved.parameters);
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
              ? copy.liveGuidance.actions[liveGuidance.action]
              : copy.liveGuidance.calculating}
          </strong>
          <small>
            {liveGuidance
              ? `${copy.liveGuidance.descriptions[liveGuidance.action]} ${copy.common.separator} ${liveGuidance.barTime}`
              : copy.liveGuidance.waitingForData}
          </small>
          <em>
            {copy.liveGuidance.disclosure} {copy.common.separator}{" "}
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
          role="toolbar"
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
        role="group"
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
        <section className="chart-card panel">
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
                  {copy.common.separator} {strategyLineLabels.prefix}{" "}
                  {copy.common.separator} {copy.strategies[strategyId].name}
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
                trades={backtest?.trades ?? []}
                dataKey={`${instrument.secid}:${DAILY_INTERVAL}`}
                chartType={chartType}
                visibleIndicators={visibleIndicators}
                strategyId={strategyId}
                strategyParameters={parameters}
                strategyLineLabels={strategyLineLabels}
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
            <Bookmark size={19} />
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
                          {copy.intervals[DAILY_INTERVAL]}
                          {" "}
                          {copy.common.separator}{" "}
                          {copy.strategies[saved.strategyId].name}
                        </small>
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
              <strong>{copy.strategies[strategyId].name}</strong>
            </div>
            <div className="lab-heading-actions">
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
              <FlaskConical size={19} />
            </div>
          </div>
          <p className="panel-copy">{copy.lab.subtitle}</p>

          <label className="field-label">
            <span>{copy.lab.strategy}</span>
            <select
              value={strategyId}
              onChange={(event) =>
                selectStrategy(event.target.value as StrategyId)
              }
            >
              {STRATEGIES.map((strategy) => (
                <option key={strategy.id} value={strategy.id}>
                  {copy.strategies[strategy.id].name}
                </option>
              ))}
            </select>
          </label>
          <p className="strategy-description">
            {copy.strategies[strategyId].description}
          </p>

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

          <div className="parameter-block">
            <div className="subheading">
              <span>{copy.lab.parameters}</span>
              <small>{copy.lab.automatic}</small>
            </div>
            <div className="parameter-grid">
              {Object.entries(parameters).map(([key, value]) => (
                <label className="field-label" key={key}>
                  <span>
                    {copy.parameters[key as keyof typeof copy.parameters] ?? key}
                  </span>
                  <input
                    type="number"
                    value={value}
                    min={
                      isPeriodParameter(key) ? 1 : key === "tick" ? 0 : undefined
                    }
                    step={parameterStep(key)}
                    onChange={(event) =>
                      setParameters((current) => ({
                        ...current,
                        [key]: Number(event.target.value),
                      }))
                    }
                  />
                </label>
              ))}
            </div>
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
                  [
                    copy.metrics.winRate,
                    formatPercent(backtest.winRate),
                    backtest.winRate >= 50,
                  ],
                  [copy.metrics.trades, String(backtest.tradeCount), true],
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
              className={`stability-card ${
                stability
                  ? stability.nearby.stable
                    ? "stable"
                    : "sensitive"
                  : "unavailable"
              }`}
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
                  {stability
                    ? stability.nearby.stable
                      ? copy.stability.stable
                      : copy.stability.sensitive
                    : copy.common.unavailable}
                </span>
              </div>
              <p>{copy.stability.description}</p>

              {stability ? (
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
                          stability.nearby.signAgreement.ratio * 100,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>{copy.stability.totalReturnRange}</dt>
                      <dd>
                        {formatPercent(
                          stability.nearby.totalReturnRange.minimum,
                          true,
                        )}{" "}
                        {copy.stability.rangeSeparator}{" "}
                        {formatPercent(
                          stability.nearby.totalReturnRange.maximum,
                          true,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>{copy.stability.drawdownRange}</dt>
                      <dd>
                        {formatPercent(
                          stability.nearby.drawdownRange.minimum,
                        )}{" "}
                        {copy.stability.rangeSeparator}{" "}
                        {formatPercent(
                          stability.nearby.drawdownRange.maximum,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>{copy.stability.tradeCountRange}</dt>
                      <dd>
                        {stability.nearby.tradeCountRange.minimum}{" "}
                        {copy.stability.rangeSeparator}{" "}
                        {stability.nearby.tradeCountRange.maximum}
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
              ) : (
                <div className="stability-unavailable">
                  {copy.stability.unavailable}
                </div>
              )}
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
                value={screeningObjective}
                disabled={screening}
                onChange={(event) => {
                  setScreeningObjective(
                    event.target.value as ScreeningObjective,
                  );
                  setScreenResults([]);
                  setScreenProgress({
                    completed: 0,
                    total: 0,
                    failed: 0,
                    strategyId: null,
                  });
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
                type="number"
                min={1}
                max={MAX_PARAMETER_SETS_PER_STRATEGY}
                step={50}
                value={maxParameterSets}
                disabled={screening}
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
                  setScreenResults([]);
                  setScreenProgress({
                    completed: 0,
                    total: 0,
                    failed: 0,
                    strategyId: null,
                  });
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
                          onClick={() =>
                            selectStrategy(result.strategyId, result.parameters)
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
