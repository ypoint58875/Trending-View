"use client";

import {
  Activity,
  BarChart3,
  CandlestickChart,
  ChevronRight,
  FlaskConical,
  LineChart,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Trophy,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BacktestChart } from "./components/BacktestChart";
import {
  PriceChart,
  type IndicatorId,
} from "./components/PriceChart";
import { zhCN as copy } from "./i18n/zh-CN";
import { runBacktest, type BacktestResult } from "@/lib/analysis/backtest";
import {
  SCREENING_CANDIDATES,
  screenStrategies,
} from "@/lib/analysis/screening";
import {
  STRATEGIES,
  getStrategy,
  type StrategyId,
  type StrategyParameters,
} from "@/lib/analysis/strategies";
import type {
  MarketInstrument,
  MarketInterval,
  MarketSeries,
} from "@/lib/market/types";

const defaultInstrument: MarketInstrument = {
  secid: "100.N225",
  code: "N225",
  name: copy.defaultInstrument.name,
  exchange: "JPX",
  assetType: "index",
  provider: "eastmoney",
};

const indicatorIds: IndicatorId[] = [
  "sma",
  "ema",
  "wma",
  "dema",
  "bollinger",
  "vwap",
  "supertrend",
  "ichimoku",
  "rsi",
  "macd",
  "kdj",
  "stochasticRsi",
  "cci",
  "williamsR",
  "adx",
  "roc",
  "mfi",
  "cmf",
  "atr",
  "obv",
];

const intervals: MarketInterval[] = [
  "1m",
  "5m",
  "15m",
  "30m",
  "60m",
  "1d",
];

const compactFormatter = new Intl.NumberFormat("zh-CN", {
  notation: "compact",
  maximumFractionDigits: 2,
});

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
  ].includes(key);
}

function resultTone(result: BacktestResult) {
  return result.totalReturn > 0 && result.sharpe > 0 && result.tradeCount >= 2
    ? "positive"
    : "neutral";
}

export function MarketWorkspace() {
  const [instrument, setInstrument] =
    useState<MarketInstrument>(defaultInstrument);
  const [interval, setInterval] = useState<MarketInterval>("1d");
  const [series, setSeries] = useState<MarketSeries | null>(null);
  const [chartType, setChartType] = useState<"candlestick" | "line">(
    "candlestick",
  );
  const [indicator, setIndicator] = useState<IndicatorId>("macd");
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
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const fetchMarket = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setErrorCode("");
      const params = new URLSearchParams({
        secid: instrument.secid,
        code: instrument.code,
        name: instrument.name,
        exchange: instrument.exchange,
        provider: instrument.provider,
        assetType: instrument.assetType,
        interval,
        limit: interval === "1d" ? "1000" : "1500",
      });

      try {
        const response = await fetch(`/api/market?${params}`, {
          signal,
          cache: "no-store",
        });
        const payload = (await response.json()) as MarketSeries & {
          error?: string;
        };
        if (!response.ok || payload.error) {
          throw new Error(payload.error || "UNKNOWN");
        }
        setSeries(payload);

        if (payload.bars.length) {
          const rangeStart =
            payload.bars[Math.max(0, payload.bars.length - 500)];
          setStartDate(datePart(rangeStart.time));
          setEndDate(datePart(payload.bars[payload.bars.length - 1].time));
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setErrorCode((error as Error).message || "UNKNOWN");
        }
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [instrument, interval],
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

  const latest = series?.bars.at(-1);
  const previous = series?.bars.at(-2);
  const comparisonPrice =
    previous?.close ?? series?.previousClose ?? latest?.open ?? 0;
  const priceChange = latest ? latest.close - comparisonPrice : 0;
  const priceChangePercent =
    comparisonPrice === 0 ? 0 : (priceChange / comparisonPrice) * 100;

  const backtest = useMemo(() => {
    if (!series?.bars.length || !startDate || !endDate) return null;
    try {
      return runBacktest(series.bars, strategyId, parameters, {
        initialCash,
        commissionRate: commissionPercent / 100,
        slippageRate: slippagePercent / 100,
        startTime: startDate,
        endTime: endDate,
        interval,
      });
    } catch {
      return null;
    }
  }, [
    commissionPercent,
    endDate,
    initialCash,
    interval,
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
    setParameters(nextParameters ?? { ...next.defaultParameters });
    setIndicator(next.indicatorId as IndicatorId);
  };

  const startScreening = () => {
    if (!series?.bars.length) return;
    setScreening(true);
    setScreenResults([]);
    window.setTimeout(() => {
      const results = screenStrategies(series.bars, {
        initialCash,
        commissionRate: commissionPercent / 100,
        slippageRate: slippagePercent / 100,
        startTime: startDate,
        endTime: endDate,
        interval,
      });
      setScreenResults(results);
      setScreening(false);
    }, 40);
  };

  const chooseInstrument = (nextInstrument: MarketInstrument) => {
    setInstrument(nextInstrument);
    setQuery("");
    setSearchResults([]);
    setScreenResults([]);
  };

  const updateQuery = (value: string) => {
    setQuery(value);
    if (value.trim().length < 1) {
      setSearchResults([]);
      setSearching(false);
    }
  };

  const chooseInterval = (nextInterval: MarketInterval) => {
    setInterval(nextInterval);
    setScreenResults([]);
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
        <div className="toolbar-group interval-tabs">
          {intervals.map((item) => (
            <button
              type="button"
              key={item}
              className={interval === item ? "active" : ""}
              onClick={() => chooseInterval(item)}
            >
              {copy.intervals[item]}
            </button>
          ))}
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
        <div className="indicator-tabs" aria-label={copy.indicatorsTitle}>
          {indicatorIds.map((item) => (
            <button
              type="button"
              key={item}
              className={indicator === item ? "active" : ""}
              onClick={() => setIndicator(item)}
              title={copy.indicators[item].name}
            >
              {copy.indicators[item].short}
            </button>
          ))}
        </div>
      </section>

      <div className="workspace-grid">
        <section className="chart-card panel">
          <div className="panel-heading chart-heading">
            <div>
              <span className="eyebrow">{copy.chart.title}</span>
              <strong>
                {copy.indicators[indicator].name}
                <small>{copy.indicators[indicator].description}</small>
              </strong>
            </div>
            <div className="chart-meta">
              {series && (
                <>
                  <span>
                    {series.bars.length} {copy.chart.bars}
                  </span>
                  <span>
                    {copy.sources[series.source]}
                  </span>
                </>
              )}
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
                chartType={chartType}
                indicator={indicator}
                ariaLabel={copy.chart.aria}
                labels={{
                  price: copy.chart.price,
                  close: copy.chart.close,
                  volume: copy.chart.volume,
                  buy: copy.chart.buy,
                  sell: copy.chart.sell,
                  series: copy.chart.series,
                }}
              />
            )}
          </div>
        </section>

        <aside className="strategy-panel panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">{copy.lab.title}</span>
              <strong>{copy.strategies[strategyId].name}</strong>
            </div>
            <FlaskConical size={19} />
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
                  setStartDate(event.target.value);
                  setScreenResults([]);
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
                  setEndDate(event.target.value);
                  setScreenResults([]);
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
                onChange={(event) =>
                  setInitialCash(Math.max(Number(event.target.value), 1000))
                }
              />
            </label>
            <label className="field-label">
              <span>{copy.lab.commission} %</span>
              <input
                type="number"
                value={commissionPercent}
                min={0}
                step={0.01}
                onChange={(event) =>
                  setCommissionPercent(Math.max(Number(event.target.value), 0))
                }
              />
            </label>
            <label className="field-label">
              <span>{copy.lab.slippage} %</span>
              <input
                type="number"
                value={slippagePercent}
                min={0}
                step={0.01}
                onChange={(event) =>
                  setSlippagePercent(Math.max(Number(event.target.value), 0))
                }
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
                    min={isPeriodParameter(key) ? 1 : undefined}
                    step={isDecimalParameter(key) ? 0.1 : 1}
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

          {backtest ? (
            <>
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
              <BacktestChart
                result={backtest}
                ariaLabel={copy.chart.backtestAria}
                labels={{
                  equity: copy.chart.equity,
                  drawdown: copy.chart.drawdown,
                }}
              />
            </>
          ) : (
            <div className="empty-result">{copy.lab.noResult}</div>
          )}
        </aside>
      </div>

      <section className="screening-panel panel">
        <div className="screening-intro">
          <span className="eyebrow">{copy.screening.eyebrow}</span>
          <h2>
            <Sparkles size={21} />
            {copy.screening.title}
          </h2>
          <p>{copy.screening.description}</p>
          <button
            type="button"
            className="primary-action"
            disabled={screening || !series}
            onClick={startScreening}
          >
            {screening ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Sparkles size={16} />
            )}
            {screening ? copy.screening.running : copy.screening.action}
          </button>
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
                {screenResults.length} / {SCREENING_CANDIDATES.length}
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
                    <th>{copy.screening.score}</th>
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
                          <b>{formatNumber(result.score, 1)}</b>
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

      <footer className="app-footer">
        <span>{copy.marketSource}</span>
        <span>{copy.footer}</span>
        <strong>{copy.researchOnly}</strong>
      </footer>
    </main>
  );
}
