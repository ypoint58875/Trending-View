import assert from "node:assert/strict";
import test from "node:test";
import {
  runAllocationBacktest,
  runBacktest,
  runBacktestFromTarget,
  type BacktestResult,
} from "../lib/analysis/backtest";
import {
  adx,
  atr,
  bollingerBands,
  cci,
  cmf,
  dema,
  ema,
  ichimoku,
  kdj,
  macd,
  mfi,
  obv,
  parabolicSar,
  roc,
  rsi,
  rollingHighLow,
  sma,
  stochasticRsi,
  stochasticSlow,
  supportResistanceBreaks,
  supertrend,
  vwap,
  williamsR,
  wma,
  type NumericSeries,
} from "../lib/analysis/indicators";
import {
  DEFAULT_SCREENING_YIELD_EVERY,
  MAX_SCREENING_RESULTS_PER_CATEGORY,
  SCREENING_OBJECTIVES,
  buildNearbyParameterSets,
  buildScreeningCandidates,
  compareScreeningResults,
  isIntegerStrategyParameterKey,
  isValidStrategyParameters,
  normalizeStrategyParameterInput,
  optimizeStrategies,
  screeningObjectiveValue,
} from "../lib/analysis/screening";
import {
  MAX_SAVED_BACKTEST_SCROLL_RECORDS,
  SAVED_BACKTEST_ROLLING_SESSIONS,
  findStrategyShortcutMatch,
  groupSavedBacktests,
  parseAssignSavedBacktestFolderInput,
  parseCreateSavedBacktestFolderInput,
  parseRenameSavedBacktestFolderInput,
  parseSavedBacktestFolderOrderInput,
  parseSaveBacktestInput,
  parseSavedBacktestOrderInput,
  parseSavedBacktestRollingUpdateInput,
  parseStrategyAllocationPlan,
  promoteSavedBacktestWithinFolder,
  reorderSavedBacktestGroups,
  reorderSavedBacktestFolders,
  reorderSavedBacktestsWithinGroup,
  resolveSavedBacktestReturnDisplay,
  savedBacktestEvaluationsCoverIds,
  savedBacktestInstrumentKey,
  shouldReplaceSavedBacktest,
  strategyPlansEqual,
  type SavedBacktestRecord,
} from "../lib/analysis/saved-backtests";
import {
  MAX_SCREENING_RUN_HISTORY,
  compareScreeningRuns,
  createSaveScreeningRunInput,
  fingerprintMarketSeries,
  parseSaveScreeningRunInput,
  parseScreeningRunCandidates,
  screeningRunCandidateKeyForPlan,
  screeningRunCandidateRankByKey,
} from "../lib/analysis/screening-runs";
import {
  compactCycleScreeningOutcome,
  createShortcutBatchConfigSignature,
  parseShortcutBatchCheckpoint,
  pendingShortcutBatchInstrumentKeys,
  selectBestShortcutScreeningResult,
} from "../lib/analysis/shortcut-batch-screening";
import {
  INTRABAR_PRICE_ORDER_STRATEGY_IDS,
  LONG_HORIZON_STRATEGY_IDS,
  SHORT_HORIZON_STRATEGY_IDS,
  VOLUME_REQUIRED_STRATEGY_IDS,
  areStrategiesEquivalent,
  getStrategy,
  getStrategiesByHorizon,
  STRATEGIES,
} from "../lib/analysis/strategies";
import {
  MIN_INTRADAY_SCREENING_SESSIONS,
  countIntradayTradingSessions,
  hasIntradayScreeningEvidence,
} from "../lib/analysis/intraday";
import {
  COMBINATION_FINALISTS_PER_STRATEGY,
  FIVE_STRATEGY_ALLOCATION_CANDIDATES,
  FOUR_STRATEGY_ALLOCATION_CANDIDATES,
  SIX_STRATEGY_ALLOCATION_CANDIDATES,
  MAX_COMBINATION_PAIR_FINALISTS,
  MAX_COMBINATION_RESULTS,
  MAX_MULTI_STRATEGY_FINALISTS_PER_LEVEL,
  MAX_MULTI_STRATEGY_FINALISTS_PER_PRIMARY,
  MAX_MULTI_STRATEGY_RESULTS_PER_PRIMARY,
  SCREENING_ENTRY_FILTER_FINALISTS_PER_STRATEGY,
  STRATEGY_SLOTS,
  STRATEGY_LAYER_ALLOCATION_CANDIDATES,
  THREE_STRATEGY_ALLOCATION_CANDIDATES,
  TWO_STRATEGY_ALLOCATION_CANDIDATES,
  buildLiveAllocationGuidance,
  buildMultiStrategyVolatilityRiskCaps,
  buildStrategyPlanAllocationTarget,
  buildStrategyPlanTimeline,
  buildStrategyPlanTimelineFromTargets,
  buildThreeStrategyPlanTimelineFromTargets,
  buildStrategyCombinationTarget,
  optimizeStrategyCombinations,
  runStrategyCombinationBacktest,
  resolveRelativeLongStrategy,
  summarizeStrategySignalHorizon,
  type CombinationScreeningProgress,
  type CombinationOptimizationCheckpoint,
} from "../lib/analysis/strategy-combinations";
import { buildStrategyConsensusAdvice } from "../lib/analysis/strategy-consensus";
import {
  packMarketBars,
  unpackMarketBars,
} from "../lib/analysis/screening-worker-bars";
import {
  TRADINGVIEW_BUILT_IN_STRATEGY_IDS,
} from "../lib/analysis/built-in-strategies";
import { buildLiveStrategyGuidance } from "../lib/analysis/live-guidance";
import { buildStrategyOrderTimeline } from "../lib/analysis/strategy-execution";
import type { StrategyOrderSeries } from "../lib/analysis/strategy-orders";
import {
  DEFAULT_MOVING_AVERAGE_SLOPE_FILTER,
  SCREENING_MOVING_AVERAGE_SLOPE_PERIODS,
  SCREENING_MOVING_AVERAGE_SLOPE_STRATEGY_IDS,
  applyMovingAverageSlopeEntryFilter,
  buildMovingAverageEntryAllowedSeries,
  buildMovingAverageSlopeSeries,
  buildScreeningMovingAverageSlopeFilters,
  supportsScreeningMovingAverageSlopeFilter,
} from "../lib/analysis/entry-filter";
import {
  MINIMUM_STABILITY_OBSERVATIONS,
  MINIMUM_STABILITY_TRADES,
  STABILITY_THRESHOLDS,
  analyzeStrategyStability,
  classifyMarketRegimes,
  summarizeNearbyBacktests,
  summarizeRegimeReturns,
} from "../lib/analysis/stability";
import {
  buildStrategyOrders,
  buildStrategyPriceLines,
} from "../lib/analysis/strategy-visuals";
import {
  buildAllocationTradeMarkers,
  buildTradeMarkers,
} from "../lib/analysis/trade-markers";
import {
  COMMODITY_CATALOG,
  searchCommodityCatalog,
} from "../lib/market/commodities";
import { searchIndexCatalog } from "../lib/market/index-catalog";
import {
  fetchEastmoneySeries,
  parseKlineRow,
  searchEastmoney,
} from "../lib/market/eastmoney";
import {
  fetchTencentDailySeries,
  parseTencentDailySeries,
} from "../lib/market/tencent";
import {
  fetchNasdaqDailySeries,
  parseNasdaqRows,
} from "../lib/market/nasdaq";
import {
  DAILY_HISTORY_LIMIT,
  DAILY_HISTORY_START_DATE,
  DAILY_HISTORY_START_TIMESTAMP_SECONDS,
  clampMarketSeriesLimit,
  requestsExtendedDailyHistory,
} from "../lib/market/history";
import type { MarketPriceAdjustment } from "../lib/market";
import type {
  MarketBar,
  MarketInstrument,
} from "../lib/market/types";
import {
  mergeCanonicalMarketSeries,
  mergeLatestMarketSeries,
  mergeTemporaryQuoteIntoMarketSeries,
  normalizeMarketBars,
  temporaryQuoteFromMarketSeries,
} from "../lib/market/series";
import { resolveCanonicalMarketProfile } from "../lib/market/canonical";
import {
  marketSeriesCacheKey,
  readCachedMarketSeries,
  readCachedMarketSeriesEntry,
  writeCachedMarketSeries,
} from "../lib/market/client-cache";
import {
  ACTIVE_MARKET_REFRESH_INTERVAL_MS,
  UNKNOWN_MARKET_REFRESH_INTERVAL_MS,
  estimateIntradayDataDelayMinutes,
  marketRefreshFailureBackoffMs,
  resolveLatestDailyBarStatus,
  resolveLatestIntradayBarStatus,
  resolveMarketAutoRefreshPolicy,
} from "../lib/market/session";
import {
  fetchYahooSeries,
  parseYahooChart,
  searchYahoo,
  yahooSymbolForInstrument,
} from "../lib/market/yahoo";

function firstScreeningCandidatesPerStrategy(limit: number) {
  const counts = new Map<string, number>();
  return buildScreeningCandidates().filter((candidate) => {
    const count = counts.get(candidate.strategyId) ?? 0;
    if (count >= limit) return false;
    counts.set(candidate.strategyId, count + 1);
    return true;
  });
}

function makeBars(closes: number[]): MarketBar[] {
  return closes.map((close, index) => {
    const date = new Date(Date.UTC(2025, 0, index + 1));
    const time = date.toISOString().slice(0, 10);
    return {
      time,
      timestamp: date.getTime(),
      open: close + 0.1,
      close,
      high: close + 0.5,
      low: close - 0.5,
      volume: 1000 + index * 10,
      amount: close * (1000 + index * 10),
      amplitude: 0,
      changePercent: 0,
      change: 0,
      turnoverRate: 0,
    };
  });
}

function makeIntradayBars(
  sessions: number,
  barsPerSession: number,
): MarketBar[] {
  const bars: MarketBar[] = [];
  for (let session = 0; session < sessions; session += 1) {
    const date = new Date(Date.UTC(2025, 0, session + 1));
    const day = date.toISOString().slice(0, 10);
    for (let minute = 0; minute < barsPerSession; minute += 1) {
      const close = 100 + session + minute * 0.1;
      bars.push({
        time: `${day} 09:${String(30 + minute).padStart(2, "0")}`,
        timestamp: date.getTime() + (30 + minute) * 60_000,
        open: close,
        high: close + 0.2,
        low: close - 0.2,
        close,
        volume: 1_000,
        amount: close * 1_000,
        amplitude: 0,
        changePercent: 0,
        change: 0,
        turnoverRate: 0,
      });
    }
  }
  return bars;
}

test("summary-only backtests preserve ranking metrics without detail arrays", () => {
  const bars = makeBars([
    100, 102, 101, 105, 104, 108, 107, 111, 109, 114, 112, 116,
  ]);
  const target = [0, 1, 1, 0, 0, 1, 1, 1, 0, 1, 1, 0];
  const settings = {
    initialCash: 100_000,
    commissionRate: 0.001,
    slippageRate: 0.0005,
    interval: "1d" as const,
  };
  const detailed = runBacktestFromTarget(
    bars,
    "sma-cross",
    { fast: 2, slow: 3 },
    target,
    settings,
  );
  const summary = runBacktestFromTarget(
    bars,
    "sma-cross",
    { fast: 2, slow: 3 },
    target,
    { ...settings, summaryOnly: true },
  );
  for (const key of [
    "totalReturn",
    "annualizedReturn",
    "benchmarkReturn",
    "maxDrawdown",
    "sharpe",
    "finalEquity",
    "score",
    "winRate",
    "profitFactor",
  ] as const) {
    assert.ok(Math.abs(detailed[key] - summary[key]) < 1e-10, key);
  }
  assert.equal(detailed.tradeCount, summary.tradeCount);
  assert.equal(summary.equity.length, 0);
  assert.equal(summary.trades.length, 0);

  const detailedAllocation = runAllocationBacktest(bars, target, settings);
  const summaryAllocation = runAllocationBacktest(bars, target, {
    ...settings,
    summaryOnly: true,
  });
  for (const key of [
    "totalReturn",
    "annualizedReturn",
    "benchmarkReturn",
    "maxDrawdown",
    "sharpe",
    "finalEquity",
    "score",
  ] as const) {
    assert.ok(
      Math.abs(detailedAllocation[key] - summaryAllocation[key]) < 1e-10,
      key,
    );
  }
  assert.equal(detailedAllocation.tradeCount, summaryAllocation.tradeCount);
  assert.equal(summaryAllocation.equity.length, 0);
  assert.equal(summaryAllocation.rebalances.length, 0);
});

test("packs screening bars into a transferable numeric buffer losslessly", () => {
  const bars = makeBars([100.25, 99.75, 101.5]);
  const packed = packMarketBars(bars);
  assert.ok(packed.values instanceof Float64Array);
  assert.deepEqual(unpackMarketBars(packed), bars);
});

test("combination optimization resumes from a persisted internal checkpoint", async () => {
  const bars = makeBars(Array.from({ length: 80 }, (_, index) => 100 + index));
  const candidates = firstScreeningCandidatesPerStrategy(1).slice(0, 4);
  const settings = {
    initialCash: 100_000,
    commissionRate: 0.001,
    slippageRate: 0.0005,
    interval: "1d" as const,
  };
  const controller = new AbortController();
  let checkpoint: CombinationOptimizationCheckpoint | null = null;
  const interrupted = await optimizeStrategyCombinations(bars, settings, {
    candidates,
    allocationCandidates: TWO_STRATEGY_ALLOCATION_CANDIDATES.slice(0, 2),
    includeTriples: false,
    yieldEvery: 1,
    signal: controller.signal,
    onCheckpoint: (nextCheckpoint) => {
      checkpoint = structuredClone(nextCheckpoint);
      if (
        nextCheckpoint.progress.stage === "pairs" &&
        nextCheckpoint.progress.stageCompleted ===
          nextCheckpoint.progress.stageTotal
      ) {
        controller.abort();
      }
    },
  });
  assert.equal(interrupted.cancelled, true);
  assert.ok(checkpoint);
  const persistedCheckpoint = checkpoint as CombinationOptimizationCheckpoint;
  const persistedFinalist =
    persistedCheckpoint.finalistsByStrategy[0]?.[1][0];
  assert.ok(persistedFinalist?.target instanceof Uint8Array);
  assert.ok(persistedFinalist?.orderFills instanceof Map);

  const resumed = await optimizeStrategyCombinations(bars, settings, {
    candidates,
    allocationCandidates: TWO_STRATEGY_ALLOCATION_CANDIDATES.slice(0, 2),
    includeTriples: false,
    yieldEvery: 1,
    resumeCheckpoint: checkpoint,
  });
  const uninterrupted = await optimizeStrategyCombinations(bars, settings, {
    candidates,
    allocationCandidates: TWO_STRATEGY_ALLOCATION_CANDIDATES.slice(0, 2),
    includeTriples: false,
    yieldEvery: 1,
  });
  const compact = (result: typeof resumed) => ({
    singles: result.singleResults.map((item) => [
      item.strategyId,
      item.parameters,
      item.totalReturn,
      item.sharpe,
      item.maxDrawdown,
    ]),
    combinations: result.results.map((item) => [
      item.strategyAId,
      item.strategyBId,
      item.strategyAParameters,
      item.strategyBParameters,
      item.totalReturn,
      item.sharpe,
      item.maxDrawdown,
    ]),
  });
  assert.deepEqual(compact(resumed), compact(uninterrupted));
  assert.equal(resumed.evaluatedCount, uninterrupted.evaluatedCount);
});

test("combination optimization emits exact intra-stage checkpoints", async () => {
  const bars = makeBars(Array.from({ length: 40 }, (_, index) => 100 + index));
  const candidates = firstScreeningCandidatesPerStrategy(1).slice(0, 4);
  const controller = new AbortController();
  let checkpoint: CombinationOptimizationCheckpoint | null = null;
  const settings = {
    initialCash: 100_000,
    commissionRate: 0.001,
    slippageRate: 0.0005,
    interval: "1d" as const,
  };
  const options = {
    candidates,
    allocationCandidates: TWO_STRATEGY_ALLOCATION_CANDIDATES.slice(0, 1),
    includeTriples: false,
    yieldEvery: 1,
  };
  await optimizeStrategyCombinations(
    bars,
    settings,
    {
      ...options,
      checkpointEvery: 2,
      signal: controller.signal,
      onCheckpoint: (nextCheckpoint) => {
        if (
          nextCheckpoint.progress.stage === "strategies" &&
          nextCheckpoint.progress.stageCompleted === 2
        ) {
          checkpoint = structuredClone(nextCheckpoint);
          controller.abort();
        }
      },
    },
  );
  assert.ok(checkpoint);
  const persisted = checkpoint as CombinationOptimizationCheckpoint;
  assert.equal(persisted.progress.stage, "strategies");
  assert.equal(persisted.progress.stageCompleted, 2);
  assert.ok(persisted.progress.stageCompleted < persisted.progress.stageTotal);
  const resumed = await optimizeStrategyCombinations(bars, settings, {
    ...options,
    resumeCheckpoint: persisted,
  });
  const uninterrupted = await optimizeStrategyCombinations(
    bars,
    settings,
    options,
  );
  assert.deepEqual(
    resumed.results.map((result) => ({
      ids: [result.strategyAId, result.strategyBId],
      score: result.score,
      totalReturn: result.totalReturn,
      maxDrawdown: result.maxDrawdown,
    })),
    uninterrupted.results.map((result) => ({
      ids: [result.strategyAId, result.strategyBId],
      score: result.score,
      totalReturn: result.totalReturn,
      maxDrawdown: result.maxDrawdown,
    })),
  );
  assert.equal(resumed.evaluatedCount, uninterrupted.evaluatedCount);
});

test("requires five complete intraday sessions before screening", () => {
  const fourSessions = makeIntradayBars(4, 10);
  const fiveSessions = makeIntradayBars(5, 10);

  assert.equal(MIN_INTRADAY_SCREENING_SESSIONS, 5);
  assert.equal(countIntradayTradingSessions(fourSessions), 4);
  assert.equal(countIntradayTradingSessions(fiveSessions), 5);
  assert.equal(hasIntradayScreeningEvidence(fourSessions), false);
  assert.equal(hasIntradayScreeningEvidence(fiveSessions), true);
});

function makeOhlcBars(
  rows: Array<{
    open: number;
    high: number;
    low: number;
    close: number;
  }>,
): MarketBar[] {
  return rows.map((row, index) => {
    const date = new Date(Date.UTC(2025, 0, index + 1));
    return {
      ...row,
      time: date.toISOString().slice(0, 10),
      timestamp: date.getTime(),
      volume: 1_000,
      amount: row.close * 1_000,
      amplitude: 0,
      changePercent: 0,
      change: 0,
      turnoverRate: 0,
    };
  });
}

const yahooInstrument: MarketInstrument = {
  secid: "^SOX",
  code: "SOX",
  name: "SOX",
  exchange: "PHLX",
  assetType: "index",
  provider: "yahoo",
};

const yahooCorporateActionFixture = {
  chart: {
    result: [
      {
        meta: {
          symbol: "^SOX",
          longName: "PHLX Semiconductor Sector",
          chartPreviousClose: 100,
          exchangeTimezoneName: "America/New_York",
          exchangeName: "NIM",
        },
        timestamp: [1_752_710_400, 1_752_796_800],
        indicators: {
          quote: [
            {
              open: [98, 49],
              close: [100, 50],
              high: [104, 52],
              low: [96, 48],
              volume: [1_000, 2_000],
            },
          ],
          adjclose: [{ adjclose: [50, 50] }],
        },
      },
    ],
  },
};

test("calculates common indicators without future values", () => {
  const values = [1, 2, 3, 4, 5, 6];
  assert.deepEqual(sma(values, 3), [null, null, 2, 3, 4, 5]);

  const exponential = ema(values, 3);
  assert.deepEqual(exponential.slice(0, 3), [null, null, 2]);
  assert.equal(exponential[3], 3);

  const strength = rsi(values, 3);
  assert.equal(strength[3], 100);
  assert.equal(strength[5], 100);
});

test("normalizes moving-average slope and delays only new entries", () => {
  const bars = makeBars([10, 9, 8, 9, 10, 9, 8]);
  const filter = {
    movingAverageType: "ema" as const,
    period: 2,
    minimumSlopePercent: 0,
  };
  const slopes = buildMovingAverageSlopeSeries(bars, filter);
  const entryAllowed = buildMovingAverageEntryAllowedSeries(bars, filter);

  assert.deepEqual(slopes.slice(0, 3), [null, null, slopes[2]]);
  assert.ok(slopes[2] !== null && slopes[2] < 0);
  assert.ok(slopes[3] !== null && slopes[3] > 0);
  assert.deepEqual(entryAllowed, [
    false,
    false,
    false,
    true,
    true,
    false,
    false,
  ]);
  assert.deepEqual(
    applyMovingAverageSlopeEntryFilter(
      [0, 1, 1, 1, 1, 0, 0],
      entryAllowed,
    ),
    [0, 0, 0, 1, 1, 0, 0],
  );

  const result = runBacktestFromTarget(
    bars,
    "sma-cross",
    { fast: 2, slow: 3 },
    [0, 1, 1, 1, 1, 0, 0],
    {
      initialCash: 100_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
      executionPolicy: "next-open",
      entryFilter: filter,
    },
  );
  assert.equal(result.trades[0]?.entryTime, bars[4].time);
  assert.equal(result.trades[0]?.exitTime, bars[6].time);
  assert.deepEqual(result.entryFilter, filter);
});

test("uses the previous completed slope for intrabar entry orders", () => {
  const bars = makeOhlcBars([
    { open: 10, high: 11, low: 9, close: 10 },
    { open: 9, high: 10, low: 8, close: 9 },
    { open: 8, high: 9, low: 7, close: 8 },
    { open: 9, high: 10, low: 8, close: 9 },
    { open: 10, high: 11, low: 9, close: 10 },
  ]);
  const entryAllowed = buildMovingAverageEntryAllowedSeries(bars, {
    ...DEFAULT_MOVING_AVERAGE_SLOPE_FILTER,
    period: 2,
  });
  const orders: StrategyOrderSeries = bars.map(() => ({
    entryStop: 1,
    exitStop: null,
  }));
  const timeline = buildStrategyOrderTimeline(
    bars,
    orders,
    entryAllowed,
  );

  assert.deepEqual(timeline.target, [0, 0, 0, 0, 1]);
  assert.equal(timeline.fills[4][0]?.action, "buy");
});

test("parses daily and intraday Eastmoney rows", () => {
  const daily = parseKlineRow(
    "2026-07-23,34.80,33.36,35.10,33.20,83369,281930489.00,5.50,-3.50,-1.21,1.95",
  );
  const minute = parseKlineRow(
    "2026-07-23 09:31,34.80,34.49,34.88,34.26,2605,9025544.00,1.79,-0.23,-0.08,0.06",
  );

  assert.equal(daily?.close, 33.36);
  assert.equal(daily?.time, "2026-07-23");
  assert.ok(Number.isFinite(daily?.timestamp));
  assert.equal(minute?.volume, 2605);
  assert.ok(Number.isFinite(minute?.timestamp));
});

test("keeps only indexes and ETFs in Eastmoney search results", async () => {
  const mockFetch = (async () =>
    new Response(
      JSON.stringify({
        QuotationCodeTable: {
          Data: [
            {
              Code: "N225",
              Name: "Nikkei 225",
              QuoteID: "100.N225",
              MktNum: "100",
              SecurityTypeName: "指数",
              SecurityType: "11",
            },
            {
              Code: "510300",
              Name: "CSI 300 ETF",
              QuoteID: "1.510300",
              MktNum: "1",
              SecurityTypeName: "ETF",
              SecurityType: "8",
            },
            {
              Code: "688484",
              Name: "Example Equity",
              QuoteID: "1.688484",
              MktNum: "1",
              SecurityTypeName: "沪A",
              SecurityType: "1",
            },
          ],
        },
      }),
      { status: 200 },
    )) as typeof fetch;

  const results = await searchEastmoney("N225", mockFetch);
  assert.deepEqual(
    results.map((item) => [item.code, item.assetType]),
    [
      ["N225", "index"],
      ["510300", "etf"],
    ],
  );
});

test("keeps only indexes, ETFs, and commodity futures in Yahoo search results", async () => {
  const mockFetch = (async () =>
    new Response(
      JSON.stringify({
        quotes: [
          {
            symbol: "^SOX",
            longname: "PHLX Semiconductor Sector",
            quoteType: "INDEX",
            exchange: "NIM",
          },
          {
            symbol: "SPY",
            longname: "SPDR S&P 500 ETF Trust",
            quoteType: "ETF",
            exchange: "PCX",
          },
          {
            symbol: "NVDA",
            longname: "NVIDIA Corporation",
            quoteType: "EQUITY",
            exchange: "NMS",
          },
          {
            symbol: "GC=F",
            longname: "Gold Futures",
            quoteType: "FUTURE",
            exchange: "CMX",
          },
        ],
      }),
      { status: 200 },
    )) as typeof fetch;

  const results = await searchYahoo("sox", mockFetch);
  assert.deepEqual(
    results.map((item) => [item.code, item.assetType]),
    [
      ["SOX", "index"],
      ["SPY", "etf"],
      ["GC=F", "commodity"],
    ],
  );
});

test("finds deterministic commodity proxies without remote search", () => {
  assert.deepEqual(
    COMMODITY_CATALOG.map(({ code, assetType, provider }) => [
      code,
      assetType,
      provider,
    ]),
    [
      ["GC=F", "commodity", "eastmoney"],
      ["SI=F", "commodity", "eastmoney"],
      ["CL=F", "commodity", "eastmoney"],
      ["HG=F", "commodity", "eastmoney"],
    ],
  );
  assert.deepEqual(
    searchCommodityCatalog("silver").map((instrument) => instrument.code),
    ["SI=F"],
  );
  assert.deepEqual(
    searchCommodityCatalog("GC=F").map((instrument) => instrument.code),
    ["GC=F"],
  );
  assert.deepEqual(searchCommodityCatalog("bank"), []);
});

test("finds common global and Chinese indexes without remote search", () => {
  assert.deepEqual(
    searchIndexCatalog("000300").map((instrument) => [
      instrument.code,
      instrument.secid,
      instrument.provider,
    ]),
    [["000300", "000300.SS", "yahoo"]],
  );
  assert.deepEqual(
    searchIndexCatalog("NDX").map((instrument) => instrument.code),
    ["NDX"],
  );
  assert.deepEqual(
    searchIndexCatalog("TOPIX").map((instrument) => [
      instrument.code,
      instrument.secid,
      instrument.exchange,
      instrument.assetType,
    ]),
    [["1306.T", "1306.T", "JPX", "etf"]],
  );
  assert.deepEqual(
    searchIndexCatalog("\u4e1c\u8bc1\u6307\u6570").map(
      (instrument) => instrument.code,
    ),
    ["1306.T"],
  );
  assert.deepEqual(searchIndexCatalog("not-a-market"), []);
});

test("adjusts daily Yahoo OHLC and derived changes without rescaling volume", () => {
  const series = parseYahooChart(
    yahooCorporateActionFixture,
    yahooInstrument,
    "1d",
  );

  assert.equal(series.priceAdjustment, "corporate-action-adjusted");
  assert.equal(series.previousClose, 100);
  assert.deepEqual(
    series.bars.map(({ open, close, high, low, volume, change, changePercent }) => ({
      open,
      close,
      high,
      low,
      volume,
      change,
      changePercent,
    })),
    [
      {
        open: 49,
        close: 50,
        high: 52,
        low: 48,
        volume: 1_000,
        change: 1,
        changePercent: (1 / 49) * 100,
      },
      {
        open: 49,
        close: 50,
        high: 52,
        low: 48,
        volume: 2_000,
        change: 0,
        changePercent: 0,
      },
    ],
  );
});

test("marks mixed daily Yahoo prices raw when any parsed bar is unadjusted", () => {
  const series = parseYahooChart(
    {
      chart: {
        result: [
          {
            ...yahooCorporateActionFixture.chart.result[0],
            indicators: {
              quote: [
                {
                  open: [98, 59],
                  close: [100, 60],
                  high: [104, 62],
                  low: [96, 58],
                  volume: [1_000, 2_000],
                },
              ],
              adjclose: [{ adjclose: [50, null] }],
            },
          },
        ],
      },
    },
    yahooInstrument,
    "1d",
  );

  assert.equal(series.bars.length, 2);
  assert.equal(series.priceAdjustment, "raw");
  assert.equal(series.previousClose, 100);
  assert.deepEqual(
    series.bars.map(({ open, close, high, low }) => ({
      open,
      close,
      high,
      low,
    })),
    [
      { open: 98, close: 100, high: 104, low: 96 },
      { open: 59, close: 60, high: 62, low: 58 },
    ],
  );
});

test("rejects invalid computed Yahoo daily adjustment ratios", () => {
  const series = parseYahooChart(
    {
      chart: {
        result: [
          {
            ...yahooCorporateActionFixture.chart.result[0],
            indicators: {
              quote: [
                {
                  open: [Number.MIN_VALUE, Number.MAX_VALUE],
                  close: [Number.MIN_VALUE, Number.MAX_VALUE],
                  high: [Number.MIN_VALUE, Number.MAX_VALUE],
                  low: [Number.MIN_VALUE, Number.MAX_VALUE],
                  volume: [1_000, 2_000],
                },
              ],
              adjclose: [
                { adjclose: [Number.MAX_VALUE, Number.MIN_VALUE] },
              ],
            },
          },
        ],
      },
    },
    yahooInstrument,
    "1d",
  );

  assert.equal(series.bars.length, 2);
  assert.equal(series.priceAdjustment, "raw");
  assert.deepEqual(
    series.bars.map(({ open, close, high, low }) => ({
      open,
      close,
      high,
      low,
    })),
    [
      {
        open: Number.MIN_VALUE,
        close: Number.MIN_VALUE,
        high: Number.MIN_VALUE,
        low: Number.MIN_VALUE,
      },
      {
        open: Number.MAX_VALUE,
        close: Number.MAX_VALUE,
        high: Number.MAX_VALUE,
        low: Number.MAX_VALUE,
      },
    ],
  );
});

test("keeps intraday Yahoo OHLC raw when adjusted closes are present", () => {
  const series = parseYahooChart(
    yahooCorporateActionFixture,
    yahooInstrument,
    "5m",
  );

  assert.equal(series.priceAdjustment, "raw");
  assert.deepEqual(
    series.bars.map(({ open, close, high, low, volume }) => ({
      open,
      close,
      high,
      low,
      volume,
    })),
    [
      { open: 98, close: 100, high: 104, low: 96, volume: 1_000 },
      { open: 49, close: 50, high: 52, low: 48, volume: 2_000 },
    ],
  );
});

test("falls back to raw Yahoo OHLC when adjusted close is absent or invalid", () => {
  for (const adjustedClose of [undefined, -1]) {
    const series = parseYahooChart(
      {
        chart: {
          result: [
            {
              meta: {
                symbol: "^SOX",
                longName: "PHLX Semiconductor Sector",
                chartPreviousClose: 5200,
                exchangeTimezoneName: "America/New_York",
                exchangeName: "NIM",
              },
              timestamp: [1_752_710_400, 1_752_796_800],
              indicators: {
                quote: [
                  {
                    open: [5300, null],
                    close: [5350, 5400],
                    high: [5380, 5420],
                    low: [5280, 5360],
                    volume: [0, 0],
                  },
                ],
                ...(adjustedClose === undefined
                  ? {}
                  : { adjclose: [{ adjclose: [adjustedClose, null] }] }),
              },
            },
          ],
        },
      },
      yahooInstrument,
      "1d",
    );

    assert.equal(series.bars.length, 1);
    assert.equal(series.priceAdjustment, "raw");
    assert.deepEqual(
      {
        open: series.bars[0].open,
        close: series.bars[0].close,
        high: series.bars[0].high,
        low: series.bars[0].low,
      },
      { open: 5300, close: 5350, high: 5380, low: 5280 },
    );
    assert.equal(series.source, "yahoo");
    assert.equal(series.instrument.code, "SOX");
  }
});

test("uses the preceding normalized Yahoo bar after applying the fetch limit", async () => {
  const payload = {
    chart: {
      result: [
        {
          meta: {
            symbol: "^SOX",
            longName: "PHLX Semiconductor Sector",
            chartPreviousClose: 98,
            exchangeTimezoneName: "America/New_York",
            exchangeName: "NIM",
          },
          timestamp: [
            1_752_710_400,
            1_752_796_800,
            1_752_883_200,
            1_752_969_600,
          ],
          indicators: {
            quote: [
              {
                open: [98, 100, 102, 104],
                close: [100, 102, 104, 106],
                high: [102, 104, 106, 108],
                low: [96, 98, 100, 102],
                volume: [1_000, 2_000, 3_000, 4_000],
              },
            ],
            adjclose: [{ adjclose: [50, 51, 52, 53] }],
          },
        },
      ],
    },
  };
  const mockFetch = (async () =>
    new Response(JSON.stringify(payload), { status: 200 })) as typeof fetch;

  const series = await fetchYahooSeries(
    yahooInstrument,
    "1d",
    2,
    mockFetch,
  );

  assert.equal(series.priceAdjustment, "corporate-action-adjusted");
  assert.deepEqual(
    series.bars.map((bar) => bar.close),
    [52, 53],
  );
  assert.equal(series.previousClose, 51);
});

test("uses the Yahoo backup host after a primary network failure", async () => {
  const requestedHosts: string[] = [];
  const mockFetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    requestedHosts.push(url.hostname);
    if (url.hostname === "query1.finance.yahoo.com") {
      throw new TypeError("Simulated network failure");
    }
    return new Response(JSON.stringify(yahooCorporateActionFixture), {
      status: 200,
    });
  }) as typeof fetch;

  const series = await fetchYahooSeries(
    yahooInstrument,
    "1d",
    2,
    mockFetch,
    "no-store",
  );

  assert.deepEqual(requestedHosts, [
    "query1.finance.yahoo.com",
    "query2.finance.yahoo.com",
  ]);
  assert.equal(series.source, "yahoo");
  assert.equal(series.bars.length, 2);
});

test("normalizes Yahoo fallback identity for later latest refreshes", async () => {
  const fallbackInstrument: MarketInstrument = {
    secid: "100.N225",
    code: "N225",
    name: "Nikkei 225",
    exchange: "JPX",
    assetType: "index",
    provider: "eastmoney",
  };
  const legacySavedInstrument: MarketInstrument = {
    ...fallbackInstrument,
    provider: "yahoo",
  };
  const payload = {
    chart: {
      result: [
        {
          ...yahooCorporateActionFixture.chart.result[0],
          meta: {
            ...yahooCorporateActionFixture.chart.result[0].meta,
            symbol: "^N225",
            longName: "Nikkei 225",
          },
        },
      ],
    },
  };
  let requestedSymbol = "";
  const mockFetch = (async (input: string | URL | Request) => {
    requestedSymbol = decodeURIComponent(new URL(String(input)).pathname);
    return new Response(JSON.stringify(payload), {
      status: 200,
    });
  }) as typeof fetch;

  const series = await fetchYahooSeries(
    fallbackInstrument,
    "1d",
    2,
    mockFetch,
  );

  assert.equal(yahooSymbolForInstrument(legacySavedInstrument), "^N225");
  assert.match(requestedSymbol, /\/\^N225$/);
  assert.equal(series.source, "yahoo");
  assert.equal(series.instrument.provider, "yahoo");
  assert.equal(series.instrument.secid, "^N225");
});

test("bounds extended daily history without expanding intraday requests", () => {
  assert.equal(DAILY_HISTORY_START_DATE, "2000-01-01");
  assert.equal(DAILY_HISTORY_LIMIT, 10_000);
  assert.equal(clampMarketSeriesLimit(50_000, "1d"), 10_000);
  assert.equal(clampMarketSeriesLimit(50_000, "1m"), 2_500);
  assert.equal(clampMarketSeriesLimit(50_000, "5m"), 1_500);
  assert.equal(requestsExtendedDailyHistory("1d", 10_000), true);
  assert.equal(requestsExtendedDailyHistory("1d", 1_500), false);
  assert.equal(requestsExtendedDailyHistory("5m", 10_000), false);
});

test("requests Yahoo daily history from 2000 for the extended workspace", async () => {
  let requestedUrl = "";
  const mockFetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify(yahooCorporateActionFixture), {
      status: 200,
    });
  }) as typeof fetch;

  const series = await fetchYahooSeries(
    yahooInstrument,
    "1d",
    DAILY_HISTORY_LIMIT,
    mockFetch,
  );
  const url = new URL(requestedUrl);

  assert.equal(
    url.searchParams.get("period1"),
    String(DAILY_HISTORY_START_TIMESTAMP_SECONDS),
  );
  assert.ok(Number(url.searchParams.get("period2")) > 0);
  assert.equal(url.searchParams.has("range"), false);
  assert.equal(series.bars.length, 2);
});

test("requests Eastmoney daily history from the shared 2000 boundary", async () => {
  let requestedUrl = "";
  const payload = {
    data: {
      code: "000001",
      market: 1,
      name: "SSE Composite",
      preKPrice: 99,
      klines: [
        "2000-01-04,100,101,102,99,1000,100000,3,1,1,0.5",
        "2000-01-05,101,102,103,100,1100,110000,3,1,1,0.5",
      ],
    },
  };
  const mockFetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify(payload), { status: 200 });
  }) as typeof fetch;

  const series = await fetchEastmoneySeries(
    {
      secid: "1.000001",
      code: "000001",
      name: "SSE Composite",
      exchange: "SSE",
      assetType: "index",
      provider: "eastmoney",
    },
    "1d",
    DAILY_HISTORY_LIMIT,
    mockFetch,
  );
  const url = new URL(requestedUrl);

  assert.equal(url.searchParams.get("beg"), "20000101");
  assert.equal(url.searchParams.get("lmt"), String(DAILY_HISTORY_LIMIT));
  assert.equal(series.bars[0].time, "2000-01-04");
});

test("falls back to the same Eastmoney host over HTTP after a TLS failure", async () => {
  const requestedProtocols: string[] = [];
  const payload = {
    data: {
      code: "SPY",
      market: 107,
      name: "SPDR S&P 500 ETF",
      preKPrice: 99,
      klines: [
        "2026-07-23,100,101,102,99,1000,100000,3,1,1,0.5",
        "2026-07-24,101,102,103,100,1100,110000,3,1,1,0.5",
      ],
    },
  };
  const mockFetch = (async (input: string | URL | Request) => {
    const protocol = new URL(String(input)).protocol;
    requestedProtocols.push(protocol);
    if (protocol === "https:") throw new TypeError("fetch failed");
    return new Response(JSON.stringify(payload), { status: 200 });
  }) as typeof fetch;

  const series = await fetchEastmoneySeries(
    {
      secid: "107.SPY",
      code: "SPY",
      name: "SPDR S&P 500 ETF",
      exchange: "NYSE_ARCA",
      assetType: "etf",
      provider: "eastmoney",
    },
    "1d",
    10,
    mockFetch,
  );

  assert.deepEqual(requestedProtocols, ["https:", "http:"]);
  assert.equal(series.source, "eastmoney");
  assert.equal(series.instrument.exchange, "NYSE_ARCA");
  assert.equal(series.bars.length, 2);
});

test("falls back to the alternate Eastmoney history host", async () => {
  const requestedHosts: string[] = [];
  const payload = {
    data: {
      code: "164824",
      market: 0,
      name: "India Fund LOF",
      preKPrice: 1,
      klines: [
        "2026-09-14,1.20,1.22,1.23,1.19,1000,100000,3,1,0.02,0.5",
        "2026-09-15,1.22,1.27,1.28,1.21,1100,110000,3,1,0.05,0.5",
      ],
    },
  };
  const mockFetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    requestedHosts.push(`${url.protocol}//${url.hostname}`);
    if (url.hostname === "push2his.eastmoney.com") {
      throw new TypeError("fetch failed");
    }
    return new Response(JSON.stringify(payload), { status: 200 });
  }) as typeof fetch;

  const series = await fetchEastmoneySeries(
    {
      secid: "0.164824",
      code: "164824",
      name: "India Fund LOF",
      exchange: "SZSE",
      assetType: "etf",
      provider: "eastmoney",
    },
    "1d",
    10,
    mockFetch,
  );

  assert.deepEqual(requestedHosts, [
    "https://push2his.eastmoney.com",
    "http://push2his.eastmoney.com",
    "https://push2.eastmoney.com",
  ]);
  assert.equal(series.bars.at(-1)?.time, "2026-09-15");
});

test("parses Tencent raw daily history on the Shanghai display date", () => {
  const instrument: MarketInstrument = {
    secid: "sz164824",
    code: "164824",
    name: "India Fund LOF",
    exchange: "SZSE",
    assetType: "etf",
    provider: "tencent",
  };
  const series = parseTencentDailySeries(
    {
      code: 0,
      data: {
        sz164824: {
          day: [
            ["2026-09-14", "1.20", "1.22", "1.23", "1.19", "1000"],
            ["2026-09-15", "1.22", "1.27", "1.28", "1.21", "1100"],
          ],
          qt: { sz164824: ["", "", "164824", "1.27", "1.22"] },
        },
      },
    },
    instrument,
    10,
    new Date("2026-09-15T06:00:00.000Z"),
  );

  assert.equal(series.source, "tencent");
  assert.equal(series.priceAdjustment, "raw");
  assert.equal(series.previousClose, 1.22);
  assert.equal(series.bars.length, 2);
  assert.equal(series.bars.at(-1)?.time, "2026-09-15");
  assert.equal(
    series.bars.at(-1)?.timestamp,
    Date.parse("2026-09-15T00:00:00+08:00"),
  );
  assert.equal(series.latestBarStatus, "in-progress");
});

test("bounds Tencent daily requests to 2000 raw bars", async () => {
  let requestedUrl = "";
  const rows = Array.from({ length: 2_001 }, (_, index) => {
    const time = new Date(
      Date.UTC(2020, 0, index + 1),
    ).toISOString().slice(0, 10);
    return [time, "1.20", "1.22", "1.23", "1.19", "1000"];
  });
  const mockFetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(
      JSON.stringify({
        code: 0,
        data: {
          sz164824: {
            day: rows,
          },
        },
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  const series = await fetchTencentDailySeries(
    {
      secid: "sz164824",
      code: "164824",
      name: "India Fund LOF",
      exchange: "SZSE",
      assetType: "etf",
      provider: "tencent",
    },
    DAILY_HISTORY_LIMIT,
    mockFetch,
  );

  assert.equal(
    new URL(requestedUrl).searchParams.get("param"),
    "sz164824,day,,,2000,none",
  );
  assert.equal(series.bars.length, 2_000);
});

test("re-exports the market price-adjustment type from the market barrel", () => {
  const adjustment: MarketPriceAdjustment = "corporate-action-adjusted";
  assert.equal(adjustment, "corporate-action-adjusted");
});

test("parses Nasdaq history into chronological index bars", () => {
  const bars = parseNasdaqRows([
    {
      date: "07/22/2026",
      close: "12,410.66",
      volume: "--",
      open: "12,356.16",
      high: "12,525.70",
      low: "12,113.95",
    },
    {
      date: "07/21/2026",
      close: "12,356.16",
      volume: "--",
      open: "12,300.00",
      high: "12,404.11",
      low: "12,085.99",
    },
  ]);

  assert.equal(bars.length, 2);
  assert.equal(bars[0].time, "2026-07-21");
  assert.equal(bars[1].close, 12_410.66);
  assert.equal(bars[1].volume, 0);
});

test("requests Nasdaq provider aliases from 2000 by provider secid", async () => {
  let requestedUrl = "";
  const payload = {
    data: {
      tradesTable: {
        rows: [
          {
            date: "01/05/2000",
            close: "102",
            volume: "1100",
            open: "101",
            high: "103",
            low: "100",
          },
          {
            date: "01/04/2000",
            close: "101",
            volume: "1000",
            open: "100",
            high: "102",
            low: "99",
          },
        ],
      },
    },
    status: { rCode: 200 },
  };
  const mockFetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify(payload), { status: 200 });
  }) as typeof fetch;

  const series = await fetchNasdaqDailySeries(
    {
      secid: "NDX",
      code: "NDX100",
      name: "Nasdaq 100",
      exchange: "NASDAQ",
      assetType: "index",
      provider: "nasdaq",
    },
    DAILY_HISTORY_LIMIT,
    mockFetch,
  );
  const url = new URL(requestedUrl);

  assert.equal(url.searchParams.get("fromdate"), DAILY_HISTORY_START_DATE);
  assert.equal(url.searchParams.get("limit"), String(DAILY_HISTORY_LIMIT));
  assert.equal(url.pathname, "/api/quote/NDX/historical");
  assert.equal(series.bars[0].time, "2000-01-04");
});

test("resolves exchange close status conservatively for daily bars", () => {
  assert.equal(
    resolveLatestDailyBarStatus(
      "2026-07-24",
      "JPX",
      new Date("2026-07-24T06:29:00.000Z"),
    ),
    "in-progress",
  );
  assert.equal(
    resolveLatestDailyBarStatus(
      "2026-07-24",
      "JPX",
      new Date("2026-07-24T06:30:00.000Z"),
    ),
    "complete",
  );
  assert.equal(
    resolveLatestDailyBarStatus(
      "2026-07-23",
      "OTHER",
      new Date("2026-07-24T06:30:00.000Z"),
    ),
    "complete",
  );
  assert.equal(
    resolveLatestDailyBarStatus(
      "2026-07-24",
      "OTHER",
      new Date("2026-07-24T06:30:00.000Z"),
    ),
    "unknown",
  );
  assert.equal(
    resolveLatestDailyBarStatus(
      "2026-07-24",
      "HKEX",
      new Date("2026-07-24T04:01:00.000Z"),
      Date.parse("2026-07-24T04:00:00.000Z") / 1000,
    ),
    "complete",
  );
  assert.equal(
    resolveLatestDailyBarStatus(
      "2026-07-24",
      "XETRA",
      new Date("2026-07-24T15:29:00.000Z"),
    ),
    "in-progress",
  );
  assert.equal(
    resolveLatestDailyBarStatus(
      "2026-07-24",
      "XETRA",
      new Date("2026-07-24T15:30:00.000Z"),
    ),
    "complete",
  );
});

test("classifies a native one-minute bar at its own close", () => {
  const barStart = Date.parse("2026-08-07T06:29:00.000Z");
  assert.equal(
    resolveLatestIntradayBarStatus(
      barStart,
      new Date("2026-08-07T06:29:59.999Z"),
    ),
    "in-progress",
  );
  assert.equal(
    resolveLatestIntradayBarStatus(
      barStart,
      new Date("2026-08-07T06:30:00.000Z"),
    ),
    "complete",
  );
});

test("refreshes visible markets by session and stops after the close grace period", () => {
  const jpxInstrument: Pick<
    MarketInstrument,
    "assetType" | "exchange"
  > = {
    assetType: "index",
    exchange: "JPX",
  };
  assert.deepEqual(
    resolveMarketAutoRefreshPolicy(
      jpxInstrument,
      new Date("2026-07-28T00:00:00.000Z"),
    ),
    {
      phase: "open",
      enabled: true,
      minimumIntervalMs: ACTIVE_MARKET_REFRESH_INTERVAL_MS,
    },
  );
  assert.equal(
    resolveMarketAutoRefreshPolicy(
      jpxInstrument,
      new Date("2026-07-28T06:45:00.000Z"),
    ).phase,
    "post-close",
  );
  assert.equal(
    resolveMarketAutoRefreshPolicy(
      jpxInstrument,
      new Date("2026-07-28T07:01:00.000Z"),
    ).enabled,
    false,
  );
  assert.equal(
    resolveMarketAutoRefreshPolicy(
      jpxInstrument,
      new Date("2026-07-27T23:59:00.000Z"),
    ).enabled,
    false,
  );
  assert.equal(
    resolveMarketAutoRefreshPolicy(
      jpxInstrument,
      new Date("2026-08-01T03:00:00.000Z"),
    ).enabled,
    false,
  );

  assert.equal(
    resolveMarketAutoRefreshPolicy(
      { assetType: "commodity", exchange: "COMEX" },
      new Date("2026-08-01T03:00:00.000Z"),
    ).enabled,
    false,
  );
  assert.equal(
    resolveMarketAutoRefreshPolicy(
      { assetType: "commodity", exchange: "COMEX" },
      new Date("2026-08-02T22:05:00.000Z"),
    ).phase,
    "continuous",
  );
  assert.equal(
    resolveMarketAutoRefreshPolicy(
      { assetType: "commodity", exchange: "COMEX" },
      new Date("2026-07-28T21:15:00.000Z"),
    ).phase,
    "post-close",
  );
  assert.equal(
    resolveMarketAutoRefreshPolicy(
      { assetType: "commodity", exchange: "COMEX" },
      new Date("2026-07-28T21:45:00.000Z"),
    ).enabled,
    false,
  );
  assert.equal(
    resolveMarketAutoRefreshPolicy(
      { assetType: "commodity", exchange: "COMEX" },
      new Date("2026-07-28T22:05:00.000Z"),
    ).phase,
    "continuous",
  );
  assert.deepEqual(
    resolveMarketAutoRefreshPolicy(
      { assetType: "index", exchange: "OTHER" },
      new Date("2026-07-28T03:00:00.000Z"),
    ),
    {
      phase: "unknown",
      enabled: true,
      minimumIntervalMs: UNKNOWN_MARKET_REFRESH_INTERVAL_MS,
    },
  );
});

test("backs off complete market refresh failures for 15, 30, then 60 minutes", () => {
  assert.equal(marketRefreshFailureBackoffMs(1), 15 * 60 * 1_000);
  assert.equal(marketRefreshFailureBackoffMs(2), 30 * 60 * 1_000);
  assert.equal(marketRefreshFailureBackoffMs(3), 60 * 60 * 1_000);
  assert.equal(marketRefreshFailureBackoffMs(4), 60 * 60 * 1_000);
});

test("builds isolated persistent cache keys per provider, instrument, and interval", () => {
  const instrument: MarketInstrument = {
    secid: "100.N225",
    code: "N225",
    name: "N225",
    exchange: "JPX",
    assetType: "index",
    provider: "eastmoney",
  };
  assert.equal(
    marketSeriesCacheKey(instrument, "1d"),
    "eastmoney:100.N225:1d",
  );
  assert.notEqual(
    marketSeriesCacheKey(
      { ...instrument, provider: "yahoo", secid: "^N225" },
      "1d",
    ),
    marketSeriesCacheKey(instrument, "1d"),
  );
});

test("groups and reorders the bounded saved-backtest scroll list", () => {
  const makeSavedRecord = (
    id: number,
    instrument: SavedBacktestRecord["instrument"],
  ): SavedBacktestRecord => ({
    id,
    instrument,
    interval: "1d",
    strategyId: "sma-cross",
    parameters: { fast: 10, slow: 30 },
    plan: {
      strategyA: {
        strategyId: "sma-cross",
        parameters: { fast: 10, slow: 30 },
      },
      strategyB: null,
      strategyAAllocation: 1,
      strategyBAllocation: 0,
    },
    indicators: [{ id: "sma", parameters: { fast: 5, slow: 20 } }],
    startDate: "2024-01-01",
    endDate: "2025-01-01",
    initialCash: 100_000,
    commissionPercent: 0.03,
    slippagePercent: 0.02,
    metrics: {
      totalReturn: 12.3,
      maxDrawdown: 8.1,
      sharpe: 1.2,
      tradeCount: 10,
      score: 42,
    },
    rollingTotalReturn: null,
    createdAt: "2026-07-26T00:00:00.000Z",
    updatedAt: "2026-07-26T00:00:00.000Z",
  });
  const nikkei = makeSavedRecord(1, {
    secid: "100.N225",
    code: "N225",
    name: "Nikkei 225",
    exchange: "JPX",
    assetType: "index",
    provider: "eastmoney",
  });
  const gold = makeSavedRecord(2, {
    secid: "GC=F",
    code: "GC=F",
    name: "Gold Futures Proxy",
    exchange: "OTHER",
    assetType: "commodity",
    provider: "yahoo",
  });
  const nikkeiFallback = makeSavedRecord(3, {
    secid: "^N225",
    code: "^N225",
    name: "Nikkei 225",
    exchange: "JPX",
    assetType: "index",
    provider: "yahoo",
  });
  nikkei.instrumentFolderId = 7;
  nikkeiFallback.instrumentFolderId = 7;
  const records = [nikkei, gold, nikkeiFallback];
  const nikkeiKey = savedBacktestInstrumentKey(nikkei.instrument);
  const goldKey = savedBacktestInstrumentKey(gold.instrument);

  assert.equal(MAX_SAVED_BACKTEST_SCROLL_RECORDS, 200);
  assert.equal(
    nikkeiKey,
    savedBacktestInstrumentKey(nikkeiFallback.instrument),
  );
  assert.deepEqual(
    groupSavedBacktests(records).map((group) => ({
      key: group.key,
      instrumentFolderId: group.instrumentFolderId,
      ids: group.records.map((record) => record.id),
    })),
    [
      { key: nikkeiKey, instrumentFolderId: 7, ids: [1, 3] },
      { key: goldKey, instrumentFolderId: null, ids: [2] },
    ],
  );
  assert.deepEqual(
    reorderSavedBacktestGroups(records, nikkeiKey, goldKey).map(
      (record) => record.id,
    ),
    [2, 1, 3],
  );
  assert.deepEqual(
    reorderSavedBacktestsWithinGroup(records, nikkeiKey, 1, 3).map(
      (record) => record.id,
    ),
    [3, 1, 2],
  );
  const folderRecords = [
    { ...nikkei, strategyFolderId: 4 },
    { ...gold, strategyFolderId: 9 },
    { ...nikkeiFallback, strategyFolderId: 4 },
    { ...nikkei, id: 4, strategyFolderId: 4 },
  ];
  assert.deepEqual(
    promoteSavedBacktestWithinFolder(folderRecords, 4, 4).map(
      (record) => record.id,
    ),
    [4, 1, 2, 3],
  );
  assert.deepEqual(
    promoteSavedBacktestWithinFolder(folderRecords, 4, 2).map(
      (record) => record.id,
    ),
    [1, 2, 3, 4],
  );
  assert.deepEqual(parseSavedBacktestOrderInput({ orderedIds: [3, 1, 2] }), {
    orderedIds: [3, 1, 2],
  });
  assert.equal(
    parseSavedBacktestOrderInput({ orderedIds: [1, 1] }),
    null,
  );
  assert.equal(
    parseSavedBacktestOrderInput({
      orderedIds: Array.from(
        { length: MAX_SAVED_BACKTEST_SCROLL_RECORDS + 1 },
        (_, index) => index + 1,
      ),
    }),
    null,
  );
});

test("keeps an in-memory history fallback when persistent browser storage is unavailable", async () => {
  const instrument: MarketInstrument = {
    secid: "100.N225-memory-cache",
    code: "N225",
    name: "N225 memory cache",
    exchange: "JPX",
    assetType: "index",
    provider: "eastmoney",
  };
  const bars = makeBars([10, 11, 12]);
  await writeCachedMarketSeries({
    instrument,
    interval: "1d",
    priceAdjustment: "corporate-action-adjusted",
    previousClose: 9,
    bars,
    latestBarStatus: "unknown",
    source: "eastmoney",
    fetchedAt: "2026-07-26T00:00:00.000Z",
  });

  const cached = await readCachedMarketSeries(instrument, "1d");
  assert.deepEqual(cached?.bars, bars);
  assert.equal(cached?.instrument.secid, instrument.secid);
});

test("keeps an old cached history available without a time expiry", async () => {
  const instrument: MarketInstrument = {
    secid: "100.N225-old-cache",
    code: "N225",
    name: "N225 old cache",
    exchange: "JPX",
    assetType: "index",
    provider: "eastmoney",
  };
  const originalDateNow = Date.now;
  const cachedAt = Date.parse("2020-01-02T03:04:00.000Z");
  try {
    Date.now = () => cachedAt;
    await writeCachedMarketSeries({
      instrument,
      interval: "1d",
      priceAdjustment: "corporate-action-adjusted",
      previousClose: 9,
      bars: makeBars([10, 11, 12]),
      latestBarStatus: "complete",
      source: "eastmoney",
      fetchedAt: "2020-01-02T03:04:00.000Z",
    });
    Date.now = () => Date.parse("2026-07-26T00:00:00.000Z");

    const cached = await readCachedMarketSeriesEntry(instrument, "1d");
    assert.equal(cached?.cachedAt, cachedAt);
    assert.equal(cached?.series.instrument.secid, instrument.secid);
    assert.equal(cached?.series.bars.length, 3);
  } finally {
    Date.now = originalDateNow;
  }
});

test("reads provider-fallback history through the originally requested instrument key", async () => {
  const requestedInstrument: MarketInstrument = {
    secid: "251.SOX-cache-alias",
    code: "SOX",
    name: "SOX request",
    exchange: "PHLX",
    assetType: "index",
    provider: "eastmoney",
  };
  const resolvedInstrument: MarketInstrument = {
    ...requestedInstrument,
    secid: "^SOX-cache-alias",
    name: "SOX resolved",
    provider: "yahoo",
  };
  await writeCachedMarketSeries(
    {
      instrument: resolvedInstrument,
      interval: "1d",
      priceAdjustment: "corporate-action-adjusted",
      previousClose: 9,
      bars: makeBars([10, 11, 12]),
      latestBarStatus: "complete",
      source: "yahoo",
      fetchedAt: "2026-07-26T00:00:00.000Z",
    },
    [requestedInstrument],
  );

  const cached = await readCachedMarketSeries(requestedInstrument, "1d");
  assert.equal(cached?.instrument.provider, "yahoo");
  assert.equal(cached?.instrument.secid, resolvedInstrument.secid);
});

test("orders daily bars by trading date when provider timestamps disagree", () => {
  const bars = makeBars([10, 11, 12]);
  const disordered = [
    { ...bars[1], timestamp: bars[2].timestamp + 10_000 },
    { ...bars[2], timestamp: bars[0].timestamp - 10_000 },
    bars[0],
  ];

  assert.deepEqual(
    normalizeMarketBars(disordered).map((bar) => bar.time),
    bars.map((bar) => bar.time),
  );
});

test("merges overlapping latest bars idempotently only for one adjustment mode", () => {
  const instrument: MarketInstrument = {
    secid: "100.N225",
    code: "N225",
    name: "N225",
    exchange: "JPX",
    assetType: "index",
    provider: "eastmoney",
  };
  const historyBars = makeBars([10, 11, 12, 13]);
  const latestBars = makeBars([12, 15]).map((bar, index) => ({
    ...bar,
    time: historyBars[index + 2].time,
    timestamp: historyBars[index + 2].timestamp,
  }));
  const history = {
    instrument,
    interval: "1d" as const,
    priceAdjustment: "corporate-action-adjusted" as const,
    previousClose: 9,
    bars: historyBars,
    source: "eastmoney" as const,
    fetchedAt: "2026-07-24T01:00:00.000Z",
    latestBarStatus: "complete" as const,
  };
  for (const priceAdjustment of [
    "corporate-action-adjusted",
    "raw",
  ] as const) {
    const scenarioHistory = {
      ...history,
      priceAdjustment,
    };
    const latest = {
      ...scenarioHistory,
      bars: latestBars,
      fetchedAt: "2026-07-24T01:01:00.000Z",
    };

    const merged = mergeLatestMarketSeries(scenarioHistory, latest, 1000);
    const remerged = mergeLatestMarketSeries(merged, latest, 1000);

    assert.equal(
      merged.priceAdjustment,
      priceAdjustment,
      priceAdjustment,
    );
    assert.deepEqual(
      merged.bars.map((bar) => bar.close),
      [10, 11, 12, 15],
      priceAdjustment,
    );
    assert.equal(merged.bars[0], historyBars[0], priceAdjustment);
    assert.equal(merged.bars[2], latestBars[0], priceAdjustment);
    assert.equal(merged.bars[3], latestBars[1], priceAdjustment);
    assert.deepEqual(remerged, merged, priceAdjustment);
    assert.equal(merged.fetchedAt, latest.fetchedAt, priceAdjustment);
  }
});

test("rejects adjusted/raw market-series merges in either direction", () => {
  const instrument: MarketInstrument = {
    secid: "100.N225",
    code: "N225",
    name: "N225",
    exchange: "JPX",
    assetType: "index",
    provider: "eastmoney",
  };
  const adjusted = {
    instrument,
    interval: "1d" as const,
    priceAdjustment: "corporate-action-adjusted" as const,
    previousClose: 9,
    bars: makeBars([10, 11, 12]),
    source: "eastmoney" as const,
    fetchedAt: "2026-07-24T01:00:00.000Z",
    latestBarStatus: "complete" as const,
  };
  const raw = {
    ...adjusted,
    priceAdjustment: "raw" as const,
  };

  for (const [history, latest] of [
    [adjusted, raw],
    [raw, adjusted],
  ] as const) {
    assert.throws(
      () => mergeLatestMarketSeries(history, latest, 1_000),
      /price adjustment/i,
    );
  }
});

test("locks confirmed canonical bars across a primary-policy change", () => {
  const eastmoneyInstrument: MarketInstrument = {
    secid: "100.N225",
    code: "N225",
    name: "N225",
    exchange: "JPX",
    assetType: "index",
    provider: "eastmoney",
  };
  const profile = resolveCanonicalMarketProfile(eastmoneyInstrument);
  const history = {
    instrument: eastmoneyInstrument,
    interval: "1d" as const,
    priceAdjustment: "corporate-action-adjusted" as const,
    previousClose: 9,
    bars: makeBars([10, 11, 12, 13]),
    source: "eastmoney" as const,
    fetchedAt: "2026-07-24T01:00:00.000Z",
    latestBarStatus: "complete" as const,
  };
  const primary = {
    ...history,
    instrument: profile.primary.instrument,
    bars: makeBars([20, 21, 22, 23, 24]),
    source: "yahoo" as const,
    fetchedAt: "2026-07-24T01:01:00.000Z",
  };

  const canonical = mergeCanonicalMarketSeries(
    history,
    primary,
    1_000,
    profile,
  );

  assert.equal(canonical.source, "yahoo");
  assert.deepEqual(
    canonical.bars.map((bar) => bar.close),
    [10, 11, 12, 13, 24],
  );
});

test("backfills same-source volume without rewriting completed OHLC", () => {
  const profile = resolveCanonicalMarketProfile({
    secid: "^N225",
    code: "N225",
    name: "N225",
    exchange: "JPX",
    assetType: "index",
    provider: "yahoo",
  });
  const history = {
    instrument: profile.primary.instrument,
    interval: "1d" as const,
    priceAdjustment: "corporate-action-adjusted" as const,
    previousClose: 9,
    bars: makeBars([10, 11, 12]),
    source: "yahoo" as const,
    fetchedAt: "2026-08-09T01:00:00.000Z",
    latestBarStatus: "complete" as const,
  };
  history.bars[0] = { ...history.bars[0], volume: 0 };
  history.bars[1] = { ...history.bars[1], volume: 0 };
  const primary = {
    ...history,
    bars: makeBars([10, 11, 12]),
    fetchedAt: "2026-08-09T01:01:00.000Z",
  };
  primary.bars[0] = {
    ...primary.bars[0],
    close: 10.25,
    volume: 20_000,
  };
  primary.bars[1] = {
    ...primary.bars[1],
    volume: 21_000,
    amount: 999,
  };
  primary.bars[2] = {
    ...primary.bars[2],
    close: 12.25,
  };

  const canonical = mergeCanonicalMarketSeries(
    history,
    primary,
    1_000,
    profile,
  );

  assert.equal(canonical.bars[0].close, 10);
  assert.equal(canonical.bars[0].volume, 20_000);
  assert.equal(canonical.bars[1].close, 11);
  assert.equal(canonical.bars[1].volume, 21_000);
  assert.equal(canonical.bars[1].amount, history.bars[1].amount);
  assert.equal(canonical.bars[2].close, 12);
});

test("validates shortcut folder creation, rename, and assignment inputs", () => {
  assert.deepEqual(
    parseCreateSavedBacktestFolderInput({
      scope: "instrument",
      contextKey: "ignored",
      name: "  Macro  ",
    }),
    { scope: "instrument", contextKey: "root", name: "Macro" },
  );
  assert.deepEqual(
    parseCreateSavedBacktestFolderInput({
      scope: "strategy",
      contextKey: "index:nikkei-225",
      name: "Momentum",
    }),
    {
      scope: "strategy",
      contextKey: "index:nikkei-225",
      name: "Momentum",
    },
  );
  assert.equal(
    parseCreateSavedBacktestFolderInput({
      scope: "strategy",
      name: "Momentum",
    }),
    null,
  );
  assert.deepEqual(
    parseRenameSavedBacktestFolderInput({ id: 4, name: "  Core  " }),
    { id: 4, name: "Core" },
  );
  assert.deepEqual(
    parseSavedBacktestFolderOrderInput({
      scope: "instrument",
      contextKey: "ignored",
      orderedIds: [4, 2],
    }),
    { scope: "instrument", contextKey: "root", orderedIds: [4, 2] },
  );
  assert.equal(
    parseSavedBacktestFolderOrderInput({
      scope: "strategy",
      contextKey: "index:n225",
      orderedIds: [3, 3],
    }),
    null,
  );
  assert.deepEqual(
    parseAssignSavedBacktestFolderInput({
      scope: "instrument",
      folderId: null,
      instrumentKey: "index:nikkei-225",
    }),
    {
      scope: "instrument",
      folderId: null,
      instrumentKey: "index:nikkei-225",
    },
  );
  assert.deepEqual(
    parseAssignSavedBacktestFolderInput({
      scope: "strategy",
      folderId: 3,
      savedBacktestId: 11,
    }),
    { scope: "strategy", folderId: 3, savedBacktestId: 11 },
  );
});

test("reorders only sibling shortcut folders", () => {
  const folders = [
    {
      id: 1,
      scope: "instrument" as const,
      contextKey: "root",
      name: "Macro",
      displayOrder: 3,
      createdAt: "2026-08-09",
      updatedAt: "2026-08-09",
    },
    {
      id: 3,
      scope: "strategy" as const,
      contextKey: "index:n225",
      name: "Risk",
      displayOrder: 2,
      createdAt: "2026-08-09",
      updatedAt: "2026-08-09",
    },
    {
      id: 2,
      scope: "instrument" as const,
      contextKey: "root",
      name: "Core",
      displayOrder: 1,
      createdAt: "2026-08-09",
      updatedAt: "2026-08-09",
    },
    {
      id: 4,
      scope: "strategy" as const,
      contextKey: "index:n225",
      name: "Trend",
      displayOrder: 1,
      createdAt: "2026-08-09",
      updatedAt: "2026-08-09",
    },
  ];
  assert.deepEqual(
    reorderSavedBacktestFolders(
      folders,
      "strategy",
      "index:n225",
      4,
      3,
    ).map((folder) => folder.id),
    [1, 4, 2, 3],
  );
});

test("updates only an unconfirmed canonical bar and appends a validated temporary quote", () => {
  const requestedInstrument: MarketInstrument = {
    secid: "100.N225",
    code: "N225",
    name: "N225",
    exchange: "JPX",
    assetType: "index",
    provider: "eastmoney",
  };
  const profile = resolveCanonicalMarketProfile(requestedInstrument);
  const instrument = profile.primary.instrument;
  const history = {
    instrument,
    interval: "1d" as const,
    priceAdjustment: "corporate-action-adjusted" as const,
    previousClose: 63_000,
    bars: makeBars([64_000, 64_500, 65_000]),
    source: "yahoo" as const,
    fetchedAt: "2026-07-24T01:00:00.000Z",
    latestBarStatus: "in-progress" as const,
  };
  const primary = {
    ...history,
    bars: makeBars([64_100, 64_600, 65_100]),
    fetchedAt: "2026-07-24T01:01:00.000Z",
    latestBarStatus: "complete" as const,
  };
  const canonical = mergeCanonicalMarketSeries(
    history,
    primary,
    1_000,
    profile,
  );
  assert.deepEqual(
    canonical.bars.map((bar) => bar.close),
    [64_000, 64_500, 65_100],
  );

  const backup = {
    ...canonical,
    instrument: {
      ...profile.backups[0].instrument,
    },
    bars: makeBars([11_900, 12_100, 12_000]),
    source: "eastmoney" as const,
    fetchedAt: "2026-07-24T01:02:00.000Z",
  };
  assert.equal(
    temporaryQuoteFromMarketSeries(backup, canonical, profile),
    null,
  );

  const plausibleBackup = {
    ...backup,
    bars: makeBars([64_050, 64_550, 65_080]),
  };
  assert.equal(
    temporaryQuoteFromMarketSeries(plausibleBackup, canonical, profile),
    null,
  );

  const canonicalLatest = canonical.bars.at(-1)!;
  const nextTimestamp = canonicalLatest.timestamp + 24 * 60 * 60 * 1_000;
  const nextTime = new Date(nextTimestamp).toISOString().slice(0, 10);
  const futureBackup = {
    ...plausibleBackup,
    previousClose: canonicalLatest.close,
    bars: [
      {
        ...plausibleBackup.bars.at(-1)!,
        time: nextTime,
        timestamp: nextTimestamp,
      },
    ],
    latestBarStatus: "in-progress" as const,
  };
  const quote = temporaryQuoteFromMarketSeries(
    futureBackup,
    canonical,
    profile,
  );
  assert.equal(quote?.price, 65_080);

  const displayed = mergeTemporaryQuoteIntoMarketSeries(
    canonical,
    quote!,
    1_000,
  );
  assert.equal(canonical.bars.length, 3);
  assert.equal(displayed.bars.length, 4);
  assert.equal(displayed.bars.at(-1)?.time, nextTime);
  assert.equal(displayed.bars.at(-1)?.close, 65_080);
  assert.equal(displayed.latestBarStatus, "in-progress");
  assert.equal(displayed.source, canonical.source);
});

test("calculates every catalog indicator with aligned finite output", () => {
  const bars = makeBars(
    Array.from({ length: 240 }, (_, index) => {
      return 100 + index * 0.08 + Math.sin(index / 6) * 4;
    }),
  );
  const closes = bars.map((bar) => bar.close);
  const series: NumericSeries[] = [
    sma(closes, 20),
    ema(closes, 20),
    wma(closes, 20),
    dema(closes, 20),
    bollingerBands(closes).middle,
    vwap(bars),
    supertrend(bars).trend,
    ichimoku(bars).spanB,
    rsi(closes),
    macd(closes).histogram,
    kdj(bars).j,
    stochasticRsi(closes).d,
    cci(bars),
    williamsR(bars),
    adx(bars).adx,
    roc(closes),
    mfi(bars),
    cmf(bars),
    atr(bars),
    obv(bars),
    supportResistanceBreaks(bars).resistance,
  ];

  assert.equal(series.length, 21);
  series.forEach((values) => {
    assert.equal(values.length, bars.length);
    assert.ok(values.some((value) => value !== null && Number.isFinite(value)));
  });

  [stochasticSlow(bars).d, parabolicSar(bars)].forEach((values) => {
    assert.equal(values.length, bars.length);
    assert.ok(values.some((value) => value !== null && Number.isFinite(value)));
  });
});

test("keeps volume-derived indicators unavailable when all volume is missing", () => {
  const bars = makeBars(
    Array.from({ length: 40 }, (_, index) => 100 + index),
  ).map((bar) => ({ ...bar, volume: 0, amount: 0 }));

  for (const values of [vwap(bars), mfi(bars), cmf(bars), obv(bars)]) {
    assert.equal(values.length, bars.length);
    assert.ok(values.every((value) => value === null));
  }
});

test("computes rolling high and low values without changing window semantics", () => {
  const bars = makeBars([10, 13, 9, 15, 12, 14]);
  const period = 3;
  const range = rollingHighLow(bars, period);

  assert.deepEqual(range.highest.slice(0, period - 1), [null, null]);
  assert.deepEqual(range.lowest.slice(0, period - 1), [null, null]);
  for (let index = period - 1; index < bars.length; index += 1) {
    const window = bars.slice(index - period + 1, index + 1);
    assert.equal(
      range.highest[index],
      Math.max(...window.map((bar) => bar.high)),
    );
    assert.equal(
      range.lowest[index],
      Math.min(...window.map((bar) => bar.low)),
    );
  }
});

test("builds aligned long-only signals for every strategy", () => {
  const bars = makeBars(
    Array.from({ length: 240 }, (_, index) => {
      return 50 + index * 0.03 + Math.sin(index / 4) * 3;
    }),
  );

  assert.equal(STRATEGIES.length, 57);
  assert.equal(TRADINGVIEW_BUILT_IN_STRATEGY_IDS.length, 20);
  assert.deepEqual(
    STRATEGIES.filter((strategy) => strategy.id.startsWith("tv-")).map(
      (strategy) => strategy.id,
    ),
    [...TRADINGVIEW_BUILT_IN_STRATEGY_IDS],
  );
  STRATEGIES.forEach((strategy) => {
    const target = strategy.buildTarget(
      bars,
      strategy.defaultParameters,
    );
    assert.equal(target.length, bars.length);
    assert.ok(target.every((value) => value === 0 || value === 1));
  });

  assert.deepEqual(
    STRATEGIES.filter((strategy) => strategy.buildOrders).map(
      (strategy) => strategy.id,
    ),
    [...INTRABAR_PRICE_ORDER_STRATEGY_IDS],
  );
});

test("classifies every registered strategy into one explicit holding horizon", () => {
  assert.deepEqual(LONG_HORIZON_STRATEGY_IDS, [
    "sma-cross",
    "ema-cross",
    "macd-momentum",
    "donchian-breakout",
    "donchian-intrabar",
    "supertrend-trend",
    "supertrend-stop",
    "ichimoku-trend",
    "roc-momentum",
    "tv-bollinger-directed",
    "tv-keltner-channels",
    "tv-macd",
    "tv-momentum",
    "tv-parabolic-sar",
    "tv-price-channel",
    "tv-supertrend",
    "tv-technical-ratings",
    "community-squeeze-momentum",
    "community-ut-bot",
    "community-hull-suite",
    "community-chandelier-exit",
    "community-ssl-channel",
    "community-range-filter",
    "community-kama-trend",
    "community-dual-supertrend",
    "community-alligator-fractal",
    "community-trendline-break",
    "community-nadaraya-watson",
    "community-kalman-velocity",
    "community-mcginley-dynamic",
    "community-vortex",
    "community-volume-weighted-macd",
    "community-half-trend",
  ]);
  assert.deepEqual(SHORT_HORIZON_STRATEGY_IDS, [
    "rsi-reversal",
    "bollinger-reversion",
    "kdj-reversal",
    "mfi-reversal",
    "vwap-reversion",
    "tv-bar-up-down",
    "tv-bollinger-bands",
    "tv-channel-breakout",
    "tv-consecutive-up-down",
    "tv-greedy",
    "tv-inside-bar",
    "tv-outside-bar",
    "tv-pivot-extension",
    "tv-pivot-reversal",
    "tv-rsi",
    "tv-stochastic-slow",
    "tv-volty-expan-close",
    "community-bollinger-rsi",
    "community-wave-trend",
    "community-elder-ray",
    "community-tma-bands",
    "community-mfi-rsi",
    "community-qqe-mod",
    "community-schaff-trend-cycle",
  ]);

  const categorizedIds = [
    ...LONG_HORIZON_STRATEGY_IDS,
    ...SHORT_HORIZON_STRATEGY_IDS,
  ];
  assert.equal(categorizedIds.length, STRATEGIES.length);
  assert.equal(new Set(categorizedIds).size, STRATEGIES.length);
  assert.deepEqual(
    getStrategiesByHorizon("long").map((strategy) => strategy.id),
    LONG_HORIZON_STRATEGY_IDS,
  );
  assert.deepEqual(
    getStrategiesByHorizon("short").map((strategy) => strategy.id),
    SHORT_HORIZON_STRATEGY_IDS,
  );
  for (const strategy of STRATEGIES) {
    assert.ok(
      strategy.horizon === "long" || strategy.horizon === "short",
      strategy.id,
    );
  }
});

test("builds gated zero, A, and A plus B allocation targets", () => {
  const combined = buildStrategyPlanAllocationTarget(
    [0, 1, 1, 1, 0],
    [1, 0, 1, 0, 1],
    0.6,
    0.4,
  );
  assert.deepEqual(combined, [0, 0.6, 1, 0.6, 0]);
  assert.throws(
    () =>
      buildStrategyPlanAllocationTarget([1], [1, 0], 0.6, 0.4),
    /align/i,
  );
  assert.throws(
    () => buildStrategyPlanAllocationTarget([1], [1], -0.1, 0.4),
    /between zero and one/i,
  );
});

test("builds optional A, optional B, and hierarchical dual-strategy allocations", () => {
  assert.deepEqual(
    buildStrategyPlanAllocationTarget([0, 1, 1], [1, 0, 1], 0.4, 0.3),
    [0, 0.4, 0.7],
  );
  assert.deepEqual(
    buildStrategyPlanAllocationTarget([0, 1, 1], null, 0.4, 0.3),
    [0, 1, 1],
  );
  assert.deepEqual(
    buildStrategyPlanAllocationTarget(null, [0, 1, 0], 0.4, 0.3),
    [0, 1, 0],
  );
  assert.throws(
    () => buildStrategyPlanAllocationTarget(null, null, 0.4, 0.3),
    /strategy/i,
  );
  assert.throws(
    () => buildStrategyPlanAllocationTarget([1], [1], 0.9, 0.2),
    /sum/i,
  );
});

test("builds five full-allocation assignments for both tactical modes", () => {
  assert.deepEqual(
    STRATEGY_LAYER_ALLOCATION_CANDIDATES,
    [0.3, 0.4, 0.5, 0.6, 0.7],
  );
  assert.equal(TWO_STRATEGY_ALLOCATION_CANDIDATES.length, 10);
  assert.deepEqual(
    new Set(
      TWO_STRATEGY_ALLOCATION_CANDIDATES.map(
        ({ tacticalMode }) => tacticalMode,
      ),
    ),
    new Set(["add-on-short-entry", "reduce-on-short-exit"]),
  );
  assert.ok(
    TWO_STRATEGY_ALLOCATION_CANDIDATES.every(
      ({ strategyAAllocation, strategyBAllocation }) =>
        [0.3, 0.4, 0.5, 0.6, 0.7].includes(strategyAAllocation) &&
        [0.3, 0.4, 0.5, 0.6, 0.7].includes(strategyBAllocation) &&
        strategyAAllocation + strategyBAllocation === 1,
    ),
  );
});

test("classifies the relatively longer signal by average active duration", () => {
  assert.deepEqual(
    summarizeStrategySignalHorizon([0, 1, 1, 1, 0, 1, 1]),
    {
      averageActiveBars: 2.5,
      activeRunCount: 2,
      transitionCount: 3,
    },
  );
  assert.equal(
    resolveRelativeLongStrategy(
      [0, 1, 0, 1, 0],
      [0, 1, 1, 1, 0],
    ),
    "strategyB",
  );
  assert.equal(
    resolveRelativeLongStrategy(
      [0, 1, 1, 0],
      [0, 1, 1, 0],
    ),
    "strategyA",
  );
});

test("pairs short entries with exits and attributes a gated final clear to both relative roles", () => {
  const timeline = buildStrategyPlanTimelineFromTargets(
    [0, 1, 1, 0, 0],
    [0, 0, 1, 1, 0],
    0.6,
    0.4,
  );

  assert.deepEqual(timeline.target, [0, 0.6, 1, 0, 0]);
  assert.deepEqual(timeline.signalEvents, [
    [],
    ["long-entry"],
    ["short-entry"],
    ["long-exit", "short-exit"],
    [],
  ]);
  assert.equal(timeline.relativeLongStrategy, "strategyA");
  const shortEntries = timeline.signalEvents.flat().filter(
    (event) => event === "short-entry",
  ).length;
  const shortExits = timeline.signalEvents.flat().filter(
    (event) => event === "short-exit",
  ).length;
  assert.equal(shortEntries, shortExits);
});

test("does not inherit an already-active short signal at the first long entry", () => {
  const timeline = buildStrategyPlanTimelineFromTargets(
    [0, 1, 1, 1, 0],
    [1, 1, 0, 1, 1],
    0.4,
    0.6,
  );

  assert.deepEqual(timeline.target, [0, 0.4, 0.4, 1, 0]);
  assert.deepEqual(timeline.signalEvents, [
    [],
    ["long-entry"],
    [],
    ["short-entry"],
    ["long-exit", "short-exit"],
  ]);
});

test("lets strategy B become the relative long-cycle gate", () => {
  const timeline = buildStrategyPlanTimelineFromTargets(
    [0, 0, 1, 0, 1, 0],
    [0, 1, 1, 1, 1, 0],
    0.4,
    0.6,
  );

  assert.equal(timeline.relativeLongStrategy, "strategyB");
  assert.deepEqual(timeline.target, [0, 0.6, 1, 0.6, 1, 0]);
  assert.deepEqual(timeline.signalEvents, [
    [],
    ["long-entry"],
    ["short-entry"],
    ["short-exit"],
    ["short-entry"],
    ["long-exit", "short-exit"],
  ]);
});

test("executes attributed long and short signals at the following open", () => {
  const bars = makeOhlcBars([
    { open: 10, high: 10, low: 10, close: 10 },
    { open: 11, high: 11, low: 11, close: 11 },
    { open: 12, high: 12, low: 12, close: 12 },
    { open: 13, high: 13, low: 13, close: 13 },
    { open: 14, high: 14, low: 14, close: 14 },
  ]);
  const timeline = buildStrategyPlanTimelineFromTargets(
    [0, 1, 1, 0, 0],
    [0, 0, 1, 1, 0],
    0.6,
    0.4,
  );
  const result = runAllocationBacktest(
    bars,
    timeline.target,
    {
      initialCash: 10_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
    },
    timeline.signalEvents,
  );

  assert.deepEqual(
    result.rebalances.map((rebalance) => rebalance.signals),
    [
      ["long-entry"],
      ["short-entry"],
      ["long-exit", "short-exit"],
    ],
  );
  assert.equal(result.rebalances.at(-1)?.targetAllocation, 0);
  assert.equal(result.rebalances.at(-1)?.reason, "strategy");
});

test("reports current plan allocation and increase, reduce, hold, or wait", () => {
  const bars = makeOhlcBars([
    { open: 10, high: 10.5, low: 9.5, close: 10 },
    { open: 11, high: 12.5, low: 10.8, close: 12 },
    { open: 12, high: 13.5, low: 11.8, close: 13 },
    { open: 12, high: 12.2, low: 10.8, close: 11 },
    { open: 11, high: 11.2, low: 10.8, close: 11 },
  ]);
  const strategyBOnly = {
    strategyA: null,
    strategyB: {
      strategyId: "tv-bar-up-down" as const,
      parameters: { minimumBodyPercent: 0 },
    },
    strategyAAllocation: 0,
    strategyBAllocation: 0.4,
  };

  assert.deepEqual(
    buildLiveAllocationGuidance(bars.slice(0, 2), strategyBOnly),
    {
      action: "increase",
      previousAllocation: 0,
      targetAllocation: 1,
      strategyCount: 1,
      activeStrategyCount: 1,
      activeWeight: 1,
      entrySupportCount: 1,
      exitSupportCount: 1,
      coreStrategy: null,
      coreActive: false,
      tacticalStrategyCount: 0,
      activeTacticalStrategyCount: 0,
      tacticalSupport: 0,
      volatilityRiskCap: 1,
    },
  );
  assert.equal(
    buildLiveAllocationGuidance(bars.slice(0, 3), strategyBOnly)?.action,
    "hold",
  );
  assert.deepEqual(
    buildLiveAllocationGuidance(bars.slice(0, 4), strategyBOnly),
    {
      action: "reduce",
      previousAllocation: 1,
      targetAllocation: 0,
      strategyCount: 1,
      activeStrategyCount: 0,
      activeWeight: 0,
      entrySupportCount: 1,
      exitSupportCount: 1,
      coreStrategy: null,
      coreActive: false,
      tacticalStrategyCount: 0,
      activeTacticalStrategyCount: 0,
      tacticalSupport: 0,
      volatilityRiskCap: 1,
    },
  );
  assert.equal(
    buildLiveAllocationGuidance(bars, strategyBOnly)?.action,
    "wait",
  );
});

test("accepts two strategies from the same catalog horizon", () => {
  const bars = makeBars(
    Array.from({ length: 180 }, (_, index) => {
      return 100 + index * 0.08 + Math.sin(index / 5) * 4;
    }),
  );
  const combination = {
    strategyAId: "sma-cross" as const,
    strategyAParameters: { fast: 10, slow: 30 },
    strategyBId: "ema-cross" as const,
    strategyBParameters: { fast: 8, slow: 25 },
    strategyAAllocation: 0.6,
    strategyBAllocation: 0.4,
  };
  const fullTarget = buildStrategyCombinationTarget(bars, combination);

  assert.equal(getStrategy(combination.strategyAId).horizon, "long");
  assert.equal(getStrategy(combination.strategyBId).horizon, "long");
  assert.equal(fullTarget.length, bars.length);
  assert.ok(
    fullTarget.every(
      (allocation) =>
        allocation === 0 ||
        allocation === 0.4 ||
        allocation === 0.6 ||
        allocation === 1,
    ),
  );
});

test("groups mathematically equivalent strategies and rejects duplicate pairs", () => {
  assert.equal(areStrategiesEquivalent("macd-momentum", "tv-macd"), true);
  assert.equal(
    areStrategiesEquivalent("supertrend-trend", "tv-supertrend"),
    true,
  );
  assert.equal(areStrategiesEquivalent("sma-cross", "ema-cross"), false);

  const bars = makeBars(Array.from({ length: 120 }, (_, index) => 100 + index));
  assert.throws(
    () =>
      buildStrategyPlanTimeline(bars, {
        strategyA: {
          strategyId: "macd-momentum",
          parameters: { fast: 12, slow: 26, signal: 9 },
        },
        strategyB: {
          strategyId: "tv-macd",
          parameters: { fast: 12, slow: 26, signal: 9 },
        },
        strategyAAllocation: 0.6,
        strategyBAllocation: 0.4,
      }),
    /equivalent/i,
  );
});

test("rebalances hierarchical allocations at the next open and applies costs", () => {
  const bars = makeOhlcBars([
    { open: 10, high: 10, low: 10, close: 10 },
    { open: 11, high: 11, low: 11, close: 11 },
    { open: 12, high: 12, low: 12, close: 12 },
    { open: 13, high: 13, low: 13, close: 13 },
    { open: 14, high: 14, low: 14, close: 14 },
  ]);
  const target = [0, 1, 0.6, 1, 0];
  const result = runAllocationBacktest(bars, target, {
    initialCash: 10_000,
    commissionRate: 0.001,
    slippageRate: 0.001,
    interval: "1d",
  });

  assert.equal(result.rebalances[0].time, bars[2].time);
  assert.equal(result.rebalances[0].targetAllocation, 1);
  assert.equal(result.rebalances[1].time, bars[3].time);
  assert.equal(result.rebalances[1].targetAllocation, 0.6);
  assert.equal(result.rebalances[2].time, bars[4].time);
  assert.equal(result.rebalances[2].targetAllocation, 1);
  assert.equal(result.rebalances.at(-1)?.reason, "strategy");
  assert.equal(result.rebalances.length, 3);
  assert.equal(result.tradeCount, result.rebalances.length);
  assert.ok(result.finalEquity > 10_000);
  assert.ok(result.finalEquity < 12_000);
  assert.ok(result.maxDrawdown <= 0);
});

test("does not trade again while a planned allocation state is unchanged", () => {
  const bars = makeOhlcBars([
    { open: 10, high: 10, low: 10, close: 10 },
    { open: 11, high: 11, low: 11, close: 11 },
    { open: 12, high: 12, low: 12, close: 12 },
    { open: 13, high: 13, low: 13, close: 13 },
    { open: 14, high: 14, low: 14, close: 14 },
    { open: 15, high: 15, low: 15, close: 15 },
  ]);
  const result = runAllocationBacktest(
    bars,
    [0, 0.6, 0.6, 0.6, 0, 0],
    {
      initialCash: 10_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
    },
  );

  assert.deepEqual(
    result.rebalances.map(({ time, targetAllocation, reason }) => ({
      time,
      targetAllocation,
      reason,
    })),
    [
      {
        time: bars[2].time,
        targetAllocation: 0.6,
        reason: "strategy",
      },
      {
        time: bars[5].time,
        targetAllocation: 0,
        reason: "strategy",
      },
    ],
  );
});

test("Channel BreakOut sells to flat on a lower-channel break", () => {
  const bars = makeBars([10, 10, 10, 10, 10, 12, 9]);
  const strategy = STRATEGIES.find(
    (candidate) => candidate.id === "tv-channel-breakout",
  );
  assert.ok(strategy);

  const target = strategy.buildTarget(bars, { length: 3 });
  assert.equal(target[5], 1);
  assert.equal(target[6], 0);
});

test("executes a close signal at the next bar open and applies costs", () => {
  const bars = makeBars([10, 9, 8, 9, 10, 11, 10, 9, 8]);
  const result = runBacktest(
    bars,
    "sma-cross",
    { fast: 2, slow: 3 },
    {
      initialCash: 10_000,
      commissionRate: 0.001,
      slippageRate: 0.001,
      interval: "1d",
    },
  );

  assert.equal(result.tradeCount, 1);
  assert.equal(result.trades[0].entryTime, bars[5].time);
  assert.ok(result.trades[0].entryPrice > bars[5].open);
  assert.ok(result.finalEquity < 10_000);
  assert.ok(result.maxDrawdown <= 0);
});

test("fills Channel BreakOut stops on the touched bar using the configured tick", () => {
  const bars = makeOhlcBars([
    { open: 9.5, high: 10, low: 9, close: 9.5 },
    { open: 10, high: 11, low: 9.5, close: 10.5 },
    { open: 11, high: 12, low: 10, close: 11.5 },
    { open: 9.8, high: 10, low: 9, close: 9.2 },
    { open: 9.2, high: 9.5, low: 8.8, close: 9 },
  ]);
  const result = runBacktest(
    bars,
    "tv-channel-breakout",
    { length: 2, tick: 0.1 },
    {
      initialCash: 10_000,
      commissionRate: 0,
      slippageRate: 0,
      startTime: bars[2].time,
      endTime: bars[4].time,
      interval: "1d",
    },
  );

  assert.equal(result.tradeCount, 1);
  assert.equal(result.trades[0].entryTime, bars[2].time);
  assert.equal(result.trades[0].entryPrice, 11.1);
  assert.equal(result.trades[0].exitTime, bars[3].time);
  assert.equal(result.trades[0].exitPrice, 9.4);
});

test("aligns selected-range capital to the complete-history opening state", () => {
  const bars = makeOhlcBars([
    { open: 10, high: 11, low: 9, close: 10 },
    { open: 11, high: 12, low: 10, close: 11 },
    { open: 12, high: 13, low: 11, close: 12 },
    { open: 13, high: 14, low: 12, close: 13 },
    { open: 14, high: 15, low: 13, close: 14 },
    { open: 15, high: 16, low: 14, close: 15 },
  ]);
  const settings = {
    initialCash: 10_000,
    commissionRate: 0,
    slippageRate: 0,
    startTime: bars[3].time,
    endTime: bars[5].time,
    interval: "1d" as const,
    executionPolicy: "hybrid" as const,
  };
  const fullTarget = [0, 1, 1, 1, 1, 0];
  const direct = runBacktestFromTarget(
    bars,
    "sma-cross",
    { fast: 2, slow: 3 },
    fullTarget,
    settings,
  );
  const allocation = runAllocationBacktest(bars, fullTarget, settings);

  assert.equal(direct.tradeCount, 0);
  assert.equal(direct.trades.length, 0);
  assert.equal(direct.openPosition, null);
  assert.equal(allocation.tradeCount, 0);
  assert.equal(allocation.rebalances.length, 0);
  assert.equal(direct.finalEquity, allocation.finalEquity);
  assert.ok(direct.finalEquity > settings.initialCash);
});

test("carries a price-order position into a selected range before resolving exits", () => {
  const bars = makeOhlcBars([
    { open: 10, high: 11, low: 9, close: 10 },
    { open: 11, high: 12, low: 10, close: 11 },
    { open: 12, high: 13, low: 11, close: 12 },
    { open: 13, high: 14, low: 12, close: 13 },
    { open: 14, high: 15, low: 13, close: 14 },
    { open: 15, high: 16, low: 14, close: 15 },
  ]);
  const orders: StrategyOrderSeries = bars.map(() => ({
    entryStop: null,
    exitStop: null,
  }));
  orders[1] = { entryStop: 11.5, exitStop: null };
  orders[4] = { entryStop: null, exitStop: 13.5 };
  const result = runBacktestFromTarget(
    bars,
    "tv-channel-breakout",
    { length: 2, tick: 0 },
    [0, 1, 1, 1, 0, 0],
    {
      initialCash: 10_000,
      commissionRate: 0,
      slippageRate: 0,
      startTime: bars[3].time,
      endTime: bars[5].time,
      interval: "1d",
      executionPolicy: "hybrid",
    },
    orders,
  );

  assert.equal(result.tradeCount, 0);
  assert.equal(result.trades.length, 0);
  assert.ok(result.finalEquity > 10_000);
});

test("executes price-reference strategies at following opens in manual history", () => {
  const bars = makeBars([10, 10, 10, 10, 10, 12, 11, 9, 9]);
  const result = runBacktest(
    bars,
    "tv-channel-breakout",
    { length: 3, tick: 0.1 },
    {
      initialCash: 10_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
      executionPolicy: "next-open",
    },
  );

  assert.equal(result.tradeCount, 1);
  assert.equal(result.trades[0].entryTime, bars[6].time);
  assert.equal(result.trades[0].entryPrice, bars[6].open);
  assert.equal(result.trades[0].exitTime, bars[8].time);
  assert.equal(result.trades[0].exitPrice, bars[8].open);
});

test("fills intrabar stop gaps at the bar open", () => {
  const bars = makeOhlcBars([
    { open: 9.5, high: 10, low: 9, close: 9.5 },
    { open: 10, high: 11, low: 9.5, close: 10.5 },
    { open: 12, high: 12.5, low: 11.5, close: 12 },
    { open: 8, high: 8.5, low: 7.5, close: 8 },
    { open: 8, high: 8.2, low: 7.8, close: 8 },
  ]);
  const result = runBacktest(
    bars,
    "tv-channel-breakout",
    { length: 2, tick: 0.1 },
    {
      initialCash: 10_000,
      commissionRate: 0,
      slippageRate: 0,
      startTime: bars[2].time,
      endTime: bars[4].time,
      interval: "1d",
    },
  );

  assert.equal(result.tradeCount, 1);
  assert.equal(result.trades[0].entryPrice, 12);
  assert.equal(result.trades[0].exitPrice, 8);
});

test("executes Greedy gaps immediately and candle colors at the next open", () => {
  const gapBars = makeOhlcBars([
    { open: 10, high: 10.5, low: 9.5, close: 10 },
    { open: 11, high: 11.5, low: 10.8, close: 11 },
    { open: 10, high: 10.2, low: 9.8, close: 10 },
  ]);
  const gapResult = runBacktest(
    gapBars,
    "tv-greedy",
    { minimumBodyPercent: 3 },
    {
      initialCash: 10_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
    },
  );

  assert.equal(gapResult.trades[0].entryTime, gapBars[1].time);
  assert.equal(gapResult.trades[0].entryPrice, gapBars[1].open);
  assert.equal(gapResult.trades[0].exitTime, gapBars[2].time);
  assert.equal(gapResult.trades[0].exitPrice, gapBars[2].open);

  const candleBars = makeOhlcBars([
    { open: 10, high: 10.6, low: 9.8, close: 10.5 },
    { open: 10.4, high: 10.6, low: 10, close: 10.1 },
    { open: 10.2, high: 10.3, low: 9.9, close: 10.2 },
  ]);
  const candleResult = runBacktest(
    candleBars,
    "tv-greedy",
    { minimumBodyPercent: 0 },
    {
      initialCash: 10_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
    },
  );

  assert.equal(candleResult.trades[0].entryTime, candleBars[1].time);
  assert.equal(candleResult.trades[0].entryPrice, candleBars[1].open);
  assert.equal(candleResult.trades[0].exitTime, candleBars[2].time);
  assert.equal(candleResult.trades[0].exitPrice, candleBars[2].open);
});

test("executes Parabolic SAR reversals on the touched bar", () => {
  const bars = makeOhlcBars([
    { open: 10, high: 11, low: 9, close: 10 },
    { open: 9.5, high: 10, low: 8, close: 9 },
    { open: 10, high: 11.5, low: 9.5, close: 11 },
    { open: 9, high: 9.5, low: 7.5, close: 8 },
  ]);
  const result = runBacktest(
    bars,
    "tv-parabolic-sar",
    { start: 0.02, increment: 0.02, maximum: 0.2 },
    {
      initialCash: 10_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
    },
  );

  assert.equal(result.trades[0].entryTime, bars[2].time);
  assert.equal(result.trades[0].entryPrice, 11);
  assert.equal(result.trades[0].exitTime, bars[3].time);
  assert.equal(result.trades[0].exitPrice, 8);
});

test("keeps Donchian close confirmation and adds a touched-bar variant", () => {
  const bars = makeOhlcBars([
    { open: 9.5, high: 10, low: 9, close: 9.5 },
    { open: 10, high: 11, low: 9.5, close: 10.5 },
    { open: 10.5, high: 12, low: 10, close: 10.8 },
    { open: 10.8, high: 11, low: 10.2, close: 10.7 },
  ]);
  const settings = {
    initialCash: 10_000,
    commissionRate: 0,
    slippageRate: 0,
    interval: "1d" as const,
  };
  const intrabar = runBacktest(
    bars,
    "donchian-intrabar",
    { entryPeriod: 2, exitPeriod: 1 },
    settings,
  );
  const closeConfirmed = runBacktest(
    bars,
    "donchian-breakout",
    { entryPeriod: 2, exitPeriod: 1 },
    settings,
  );

  assert.equal(intrabar.tradeCount, 0);
  assert.ok(intrabar.finalEquity < settings.initialCash);
  assert.equal(closeConfirmed.finalEquity, settings.initialCash);
  assert.equal(closeConfirmed.tradeCount, 0);
});

test("executes the Supertrend stop variant at prior completed bands", () => {
  const bars = makeOhlcBars([
    { open: 10, high: 11, low: 9, close: 10 },
    { open: 10, high: 11, low: 9, close: 10 },
    { open: 11, high: 12.5, low: 10, close: 12 },
    { open: 10, high: 10.5, low: 8.5, close: 9 },
  ]);
  const result = runBacktest(
    bars,
    "supertrend-stop",
    { period: 2, multiplier: 1 },
    {
      initialCash: 10_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
    },
  );

  assert.equal(result.trades[0].entryTime, bars[2].time);
  assert.equal(result.trades[0].entryPrice, 12);
  assert.equal(result.trades[0].exitTime, bars[3].time);
  assert.equal(result.trades[0].exitPrice, 9);
});

test("builds price orders only from information available before each bar", () => {
  const bars = makeBars(
    Array.from({ length: 80 }, (_, index) => {
      return 100 + index * 0.08 + Math.sin(index / 4) * 5;
    }),
  );

  for (const strategyId of INTRABAR_PRICE_ORDER_STRATEGY_IDS) {
    const strategy = getStrategy(strategyId);
    assert.ok(strategy.buildOrders, strategyId);
    const fullOrders = strategy.buildOrders(
      bars,
      strategy.defaultParameters,
    );
    assert.ok(
      fullOrders.some(
        (orders) => orders.entryStop !== null || orders.entryAtOpen,
      ),
      `${strategyId}:entry`,
    );
    assert.ok(
      fullOrders.some(
        (orders) => orders.exitStop !== null || orders.exitAtOpen,
      ),
      `${strategyId}:exit`,
    );

    for (const prefixLength of [20, 40, 60]) {
      const prefixOrders = strategy.buildOrders(
        bars.slice(0, prefixLength),
        strategy.defaultParameters,
      );
      assert.deepEqual(
        fullOrders.slice(0, prefixLength),
        prefixOrders,
        `${strategyId}:${prefixLength}`,
      );
    }
  }
});

test("initializes every price-order selected range from executed order state", () => {
  const bars = makeOhlcBars(
    Array.from({ length: 240 }, (_, index) => {
      const close =
        100 +
        index * 0.03 +
        Math.sin(index / 5) * 8 +
        Math.sin(index / 17) * 4;
      const open = close + Math.sin(index) * 1.2;
      return {
        open,
        high: Math.max(open, close) + 2.4,
        low: Math.min(open, close) - 2.4,
        close,
      };
    }),
  );
  const settings = {
    initialCash: 10_000,
    commissionRate: 0.0003,
    slippageRate: 0.0002,
    startTime: bars[120].time,
    endTime: bars.at(-1)!.time,
    interval: "1d" as const,
    executionPolicy: "hybrid" as const,
  };
  let distinctSignalTargetCount = 0;

  for (const strategyId of INTRABAR_PRICE_ORDER_STRATEGY_IDS) {
    const strategy = getStrategy(strategyId);
    const orders = strategy.buildOrders!(
      bars,
      strategy.defaultParameters,
    );
    const executedTarget = buildStrategyOrderTimeline(bars, orders).target;
    const signalTarget = strategy.buildTarget(
      bars,
      strategy.defaultParameters,
    );
    if (signalTarget.some((value, index) => value !== executedTarget[index])) {
      distinctSignalTargetCount += 1;
    }
    const expected = runBacktestFromTarget(
      bars,
      strategyId,
      strategy.defaultParameters,
      executedTarget,
      settings,
      orders,
    );
    const actual = runBacktest(
      bars,
      strategyId,
      strategy.defaultParameters,
      settings,
    );

    assert.deepEqual(actual.trades, expected.trades, strategyId);
    assert.equal(actual.finalEquity, expected.finalEquity, strategyId);
  }
  assert.ok(distinctSignalTargetCount >= 2);
});

test("builds Channel BreakOut entry and exit visuals from its order plan", () => {
  const bars = makeOhlcBars([
    { open: 9.5, high: 10, low: 9, close: 9.5 },
    { open: 10, high: 11, low: 9.5, close: 10.5 },
    { open: 11, high: 12, low: 10, close: 11.5 },
    { open: 9.8, high: 10, low: 9, close: 9.2 },
  ]);
  const parameters = { length: 2, tick: 0.1 };
  const orders = buildStrategyOrders(
    bars,
    "tv-channel-breakout",
    parameters,
  );

  assert.ok(orders);
  assert.deepEqual(
    buildStrategyPriceLines(
      bars,
      "tv-channel-breakout",
      parameters,
    ),
    [
      {
        id: "tv-channel-breakout:entry",
        role: "entry",
        data: orders.map((order) => order.entryStop),
      },
      {
        id: "tv-channel-breakout:exit",
        role: "exit",
        data: orders.map((order) => order.exitStop),
      },
    ],
  );
});

test("builds every price-order visual directly from its aligned order plan", () => {
  const bars = makeBars(
    Array.from({ length: 100 }, (_, index) => {
      return 100 + index * 0.08 + Math.sin(index / 4) * 5;
    }),
  );

  for (const strategyId of INTRABAR_PRICE_ORDER_STRATEGY_IDS) {
    const strategy = getStrategy(strategyId);
    const orders = buildStrategyOrders(
      bars,
      strategyId,
      strategy.defaultParameters,
    );
    const lines = buildStrategyPriceLines(
      bars,
      strategyId,
      strategy.defaultParameters,
    );

    assert.ok(orders, strategyId);
    if (strategyId === "tv-greedy") {
      assert.deepEqual(
        lines.map((line) => line.data),
        [
          [null, ...bars.slice(0, -1).map((bar) => bar.high)],
          [null, ...bars.slice(0, -1).map((bar) => bar.low)],
        ],
      );
      continue;
    }
    assert.deepEqual(
      lines.map((line) => line.data),
      [
        orders.map((order) => order.entryStop),
        orders.map((order) => order.exitStop),
      ],
      strategyId,
    );
  }
});

test("builds strategy price references from the same indicator calculations", () => {
  const bars = makeBars(
    Array.from({ length: 80 }, (_, index) => {
      return 100 + index * 0.1 + Math.sin(index / 3) * 4;
    }),
  );
  const closes = bars.map((bar) => bar.close);

  const smaParameters = { fast: 5, slow: 12 };
  assert.deepEqual(
    buildStrategyPriceLines(bars, "sma-cross", smaParameters),
    [
      {
        id: "sma-cross:fast",
        role: "fast",
        data: sma(closes, smaParameters.fast),
      },
      {
        id: "sma-cross:slow",
        role: "slow",
        data: sma(closes, smaParameters.slow),
      },
    ],
  );

  const bollingerParameters = { period: 10, width: 1.5 };
  const bands = bollingerBands(
    closes,
    bollingerParameters.period,
    bollingerParameters.width,
  );
  assert.deepEqual(
    buildStrategyPriceLines(
      bars,
      "tv-bollinger-bands",
      bollingerParameters,
    ),
    [
      {
        id: "tv-bollinger-bands:middle",
        role: "middle",
        data: bands.middle,
      },
      {
        id: "tv-bollinger-bands:upper",
        role: "upper",
        data: bands.upper,
      },
      {
        id: "tv-bollinger-bands:lower",
        role: "lower",
        data: bands.lower,
      },
    ],
  );

  const supertrendParameters = { period: 7, multiplier: 2.5 };
  assert.deepEqual(
    buildStrategyPriceLines(
      bars,
      "supertrend-trend",
      supertrendParameters,
    ),
    [
      {
        id: "supertrend-trend:trend",
        role: "trend",
        data: supertrend(
          bars,
          supertrendParameters.period,
          supertrendParameters.multiplier,
        ).trend,
      },
    ],
  );
  assert.deepEqual(
    buildStrategyPriceLines(
      bars,
      "rsi-reversal",
      getStrategy("rsi-reversal").defaultParameters,
    ),
    [],
  );
});

test("uses the exact Technical Ratings EMA-20 and SMA-50 price votes", () => {
  const bars = makeBars(
    Array.from({ length: 80 }, (_, index) => {
      return 100 + index * 0.1 + Math.sin(index / 3) * 4;
    }),
  );
  const closes = bars.map((bar) => bar.close);

  assert.deepEqual(
    buildStrategyPriceLines(
      bars,
      "tv-technical-ratings",
      getStrategy("tv-technical-ratings").defaultParameters,
    ),
    [
      {
        id: "tv-technical-ratings:ema-20",
        role: "fast",
        data: ema(closes, 20),
      },
      {
        id: "tv-technical-ratings:sma-50",
        role: "slow",
        data: sma(closes, 50),
      },
    ],
  );
});

test("aligns Donchian, VWAP, Keltner, and SAR price references", () => {
  const bars = makeOhlcBars([
    { open: 9, high: 10, low: 8, close: 9 },
    { open: 10, high: 12, low: 9, close: 11 },
    { open: 9, high: 11, low: 7, close: 10 },
    { open: 12, high: 13, low: 10, close: 12 },
    { open: 11, high: 12, low: 9, close: 11 },
    { open: 13, high: 14, low: 11, close: 13 },
  ]);

  const donchian = buildStrategyPriceLines(
    bars,
    "donchian-breakout",
    { entryPeriod: 2, exitPeriod: 3 },
  );
  assert.deepEqual(donchian[0].data, [null, null, 12, 12, 13, 13]);
  assert.deepEqual(donchian[1].data, [null, null, null, 7, 7, 7]);

  const vwapParameters = { entryPercent: 2, exitPercent: 1 };
  const vwapValues = vwap(bars);
  assert.deepEqual(
    buildStrategyPriceLines(bars, "vwap-reversion", vwapParameters),
    [
      {
        id: "vwap-reversion:vwap",
        role: "reference",
        data: vwapValues,
      },
      {
        id: "vwap-reversion:entry",
        role: "entry",
        data: vwapValues.map((value) =>
          value === null
            ? null
            : value * (1 - vwapParameters.entryPercent / 100),
        ),
      },
      {
        id: "vwap-reversion:exit",
        role: "exit",
        data: vwapValues.map((value) =>
          value === null
            ? null
            : value * (1 + vwapParameters.exitPercent / 100),
        ),
      },
    ],
  );

  const keltnerParameters = { period: 3, multiplier: 1.5 };
  const middle = ema(
    bars.map((bar) => bar.close),
    keltnerParameters.period,
  );
  const volatility = atr(bars, keltnerParameters.period);
  assert.deepEqual(
    buildStrategyPriceLines(
      bars,
      "tv-keltner-channels",
      keltnerParameters,
    ),
    [
      {
        id: "tv-keltner-channels:middle",
        role: "middle",
        data: middle,
      },
      {
        id: "tv-keltner-channels:upper",
        role: "upper",
        data: middle.map((value, index) =>
          value === null || volatility[index] === null
            ? null
            : value + volatility[index]! * keltnerParameters.multiplier,
        ),
      },
      {
        id: "tv-keltner-channels:lower",
        role: "lower",
        data: middle.map((value, index) =>
          value === null || volatility[index] === null
            ? null
            : value - volatility[index]! * keltnerParameters.multiplier,
        ),
      },
    ],
  );

  const sarParameters = {
    start: 0.03,
    increment: 0.02,
    maximum: 0.25,
  };
  const sarOrders = buildStrategyOrders(
    bars,
    "tv-parabolic-sar",
    sarParameters,
  );
  assert.ok(sarOrders);
  assert.deepEqual(
    buildStrategyPriceLines(bars, "tv-parabolic-sar", sarParameters).map(
      (line) => line.data,
    ),
    [
      sarOrders.map((order) => order.entryStop),
      sarOrders.map((order) => order.exitStop),
    ],
  );
});

test("returns only declared aligned finite price lines for every strategy", () => {
  const bars = makeBars(
    Array.from({ length: 100 }, (_, index) => {
      return 100 + index * 0.08 + Math.sin(index / 4) * 5;
    }),
  );
  const expectedLineSuffixes = new Map<string, string[]>([
    ["sma-cross", ["fast", "slow"]],
    ["ema-cross", ["fast", "slow"]],
    ["bollinger-reversion", ["middle", "upper", "lower"]],
    ["donchian-breakout", ["entry", "exit"]],
    ["donchian-intrabar", ["entry", "exit"]],
    ["supertrend-trend", ["trend"]],
    ["supertrend-stop", ["entry", "exit"]],
    ["ichimoku-trend", ["conversion", "base", "span-a", "span-b"]],
    ["vwap-reversion", ["vwap", "entry", "exit"]],
    ["tv-bollinger-bands", ["middle", "upper", "lower"]],
    ["tv-bollinger-directed", ["middle", "upper", "lower"]],
    ["tv-channel-breakout", ["entry", "exit"]],
    ["tv-greedy", ["entry", "exit"]],
    ["tv-keltner-channels", ["middle", "upper", "lower"]],
    ["tv-momentum", ["entry", "exit"]],
    ["tv-parabolic-sar", ["entry", "exit"]],
    ["tv-pivot-reversal", ["entry", "exit"]],
    ["tv-price-channel", ["entry", "exit"]],
    ["tv-supertrend", ["trend"]],
    ["tv-technical-ratings", ["ema-20", "sma-50"]],
    ["tv-volty-expan-close", ["entry", "exit"]],
  ]);

  for (const strategy of STRATEGIES) {
    const lines = buildStrategyPriceLines(
      bars,
      strategy.id,
      strategy.defaultParameters,
    );
    assert.deepEqual(
      lines.map((line) => line.id),
      (expectedLineSuffixes.get(strategy.id) ?? []).map(
        (suffix) => `${strategy.id}:${suffix}`,
      ),
      strategy.id,
    );
    assert.equal(
      new Set(lines.map((line) => line.id)).size,
      lines.length,
      strategy.id,
    );
    for (const line of lines) {
      assert.equal(line.data.length, bars.length, line.id);
      assert.ok(
        line.data.every(
          (value) => value === null || Number.isFinite(value),
        ),
        line.id,
      );
    }
  }
});

test("keeps every strategy price line invariant across input prefixes", () => {
  const bars = makeBars(
    Array.from({ length: 100 }, (_, index) => {
      return 100 + index * 0.08 + Math.sin(index / 4) * 5;
    }),
  );

  for (const strategy of STRATEGIES) {
    const fullLines = buildStrategyPriceLines(
      bars,
      strategy.id,
      strategy.defaultParameters,
    );
    for (const prefixLength of [20, 40, 80]) {
      const prefixLines = buildStrategyPriceLines(
        bars.slice(0, prefixLength),
        strategy.id,
        strategy.defaultParameters,
      );
      assert.deepEqual(
        prefixLines,
        fullLines.map((line) => ({
          ...line,
          data: line.data.slice(0, prefixLength),
        })),
        `${strategy.id}:${prefixLength}`,
      );
    }
  }
});

test("executes only long trades and maps entries and exits to buy/sell markers", () => {
  const bars = makeBars([10, 10, 10, 12, 13, 8, 7, 9, 11]);
  const result = runBacktest(
    bars,
    "tv-channel-breakout",
    { length: 2 },
    {
      initialCash: 10_000,
      commissionRate: 0.001,
      slippageRate: 0.001,
      interval: "1d",
    },
  );

  assert.ok(result.tradeCount > 0);
  assert.ok(
    result.trades.every(
      (trade) => !Object.prototype.hasOwnProperty.call(trade, "direction"),
    ),
  );

  const markers = buildTradeMarkers(result.trades);
  assert.equal(markers.buys.length, result.tradeCount);
  assert.equal(
    markers.sells.length + markers.rangeExits.length,
    result.tradeCount,
  );
  assert.ok(markers.buys.every((marker) => marker.event === "entry"));
  assert.ok(markers.sells.every((marker) => marker.event === "exit"));
  assert.ok(
    markers.rangeExits.every((marker) => marker.event === "range-exit"),
  );
});

test("reports live buy, hold, sell, and flat guidance from the latest bar", () => {
  const bars = makeOhlcBars([
    { open: 10, high: 10.5, low: 9.5, close: 10 },
    { open: 11, high: 12.5, low: 10.8, close: 12 },
    { open: 12, high: 13.5, low: 11.8, close: 13 },
    { open: 12, high: 12.2, low: 10.8, close: 11 },
    { open: 11, high: 11.2, low: 10.8, close: 11 },
  ]);
  const parameters = { minimumBodyPercent: 0 };

  assert.equal(
    buildLiveStrategyGuidance(
      bars.slice(0, 2),
      "tv-bar-up-down",
      parameters,
    )?.action,
    "buy",
  );
  assert.equal(
    buildLiveStrategyGuidance(
      bars.slice(0, 2),
      "tv-bar-up-down",
      parameters,
    )?.executionMode,
    "next-open",
  );
  assert.equal(
    buildLiveStrategyGuidance(
      bars.slice(0, 3),
      "tv-bar-up-down",
      parameters,
    )?.action,
    "hold",
  );
  assert.equal(
    buildLiveStrategyGuidance(
      bars.slice(0, 4),
      "tv-bar-up-down",
      parameters,
    )?.action,
    "sell",
  );
  assert.equal(
    buildLiveStrategyGuidance(
      bars,
      "tv-bar-up-down",
      parameters,
    )?.action,
    "wait",
  );
});

test("uses touched stop orders for live price-strategy guidance", () => {
  const bars = makeOhlcBars([
    { open: 9.5, high: 10, low: 9, close: 9.5 },
    { open: 10, high: 11, low: 9.5, close: 10.5 },
    { open: 11, high: 12, low: 10, close: 11.5 },
    { open: 9.8, high: 10, low: 9, close: 9.2 },
  ]);

  const entry = buildLiveStrategyGuidance(
    bars.slice(0, 3),
    "tv-channel-breakout",
    { length: 2, tick: 0.1 },
  );
  const exit = buildLiveStrategyGuidance(
    bars,
    "tv-channel-breakout",
    { length: 2, tick: 0.1 },
  );

  assert.equal(entry?.action, "buy");
  assert.equal(entry?.triggerPrice, 11.1);
  assert.equal(entry?.todayEntryPrice, 11.1);
  assert.equal(entry?.executionMode, "intrabar-order");
  assert.equal(exit?.action, "sell");
  assert.equal(exit?.triggerPrice, 9.4);
  assert.equal(exit?.todayExitPrice, 9.4);
  assert.equal(exit?.executionMode, "intrabar-order");
});

test("reports a touched entry that is blocked by the entry filter", () => {
  const bars = makeOhlcBars([
    { open: 9.5, high: 10, low: 9, close: 9.5 },
    { open: 10, high: 11, low: 9.5, close: 10.5 },
    { open: 11, high: 12, low: 10, close: 11.5 },
  ]);

  const guidance = buildLiveStrategyGuidance(
    bars,
    "tv-channel-breakout",
    { length: 2, tick: 0.1 },
    "complete",
    {
      movingAverageType: "ema",
      period: 2,
      minimumSlopePercent: 0,
    },
  );

  assert.equal(guidance?.action, "wait");
  assert.equal(guidance?.position, "flat");
  assert.equal(guidance?.todayEntryPrice, 11.1);
  assert.equal(guidance?.entryBlockedByFilter, true);
});

test("ignores incomplete close signals while retaining intrabar stop fills", () => {
  const closeSignalBars = makeOhlcBars([
    { open: 10, high: 10.5, low: 9.5, close: 10 },
    { open: 11, high: 12.5, low: 10.8, close: 12 },
  ]);
  assert.equal(
    buildLiveStrategyGuidance(
      closeSignalBars,
      "tv-bar-up-down",
      { minimumBodyPercent: 0 },
      "complete",
    )?.action,
    "buy",
  );
  assert.equal(
    buildLiveStrategyGuidance(
      closeSignalBars,
      "tv-bar-up-down",
      { minimumBodyPercent: 0 },
      "in-progress",
    )?.action,
    "wait",
  );

  const stopBars = makeOhlcBars([
    { open: 9.5, high: 10, low: 9, close: 9.5 },
    { open: 10, high: 11, low: 9.5, close: 10.5 },
    { open: 11, high: 12, low: 10, close: 11.5 },
  ]);
  assert.equal(
    buildLiveStrategyGuidance(
      stopBars,
      "tv-channel-breakout",
      { length: 2, tick: 0.1 },
      "in-progress",
    )?.action,
    "buy",
  );
  assert.equal(
    buildLiveAllocationGuidance(
      closeSignalBars,
      {
        strategyA: {
          strategyId: "tv-bar-up-down",
          parameters: { minimumBodyPercent: 0 },
        },
        strategyB: null,
        strategyAAllocation: 1,
        strategyBAllocation: 0,
      },
      undefined,
      "in-progress",
    )?.action,
    "wait",
  );
  assert.equal(
    buildLiveAllocationGuidance(
      stopBars,
      {
        strategyA: {
          strategyId: "tv-channel-breakout",
          parameters: { length: 2, tick: 0.1 },
        },
        strategyB: null,
        strategyAAllocation: 1,
        strategyBAllocation: 0,
      },
      undefined,
      "in-progress",
    )?.action,
    "increase",
  );
});

test("reports open-only Greedy and projected SAR prices in live guidance", () => {
  const greedyBars = makeOhlcBars([
    { open: 10, high: 10.5, low: 9.5, close: 10 },
    { open: 11, high: 11.5, low: 10.8, close: 11 },
  ]);
  const greedy = buildLiveStrategyGuidance(
    greedyBars,
    "tv-greedy",
    { minimumBodyPercent: 3 },
  );

  assert.equal(greedy?.action, "buy");
  assert.equal(greedy?.triggerPrice, 11);
  assert.equal(greedy?.todayEntryPrice, 11);
  assert.equal(greedy?.executionMode, "intrabar-order");

  const pendingGreedy = buildLiveStrategyGuidance(
    makeOhlcBars([
      { open: 10, high: 10.5, low: 9.5, close: 10 },
      { open: 10, high: 11.2, low: 9.9, close: 11 },
    ]),
    "tv-greedy",
    { minimumBodyPercent: 3 },
  );
  assert.equal(pendingGreedy?.action, "wait");
  assert.equal(pendingGreedy?.position, "flat");
  assert.equal(pendingGreedy?.pendingNextOpenAction, "buy");

  const sarBars = makeOhlcBars([
    { open: 10, high: 11, low: 9, close: 10 },
    { open: 9.5, high: 10, low: 8, close: 9 },
    { open: 10, high: 11.5, low: 9.5, close: 11 },
  ]);
  const sar = buildLiveStrategyGuidance(
    sarBars,
    "tv-parabolic-sar",
    { start: 0.02, increment: 0.02, maximum: 0.2 },
  );

  assert.equal(sar?.action, "buy");
  assert.equal(sar?.triggerPrice, 11);
  assert.equal(sar?.todayEntryPrice, 11);
  assert.equal(sar?.executionMode, "intrabar-order");
});

test("executes allocation price orders on the touched bar", () => {
  const bars = makeOhlcBars([
    { open: 9.5, high: 10, low: 9, close: 9.5 },
    { open: 10, high: 11, low: 9.5, close: 10.5 },
    { open: 11, high: 12, low: 10, close: 11.5 },
    { open: 9.8, high: 10, low: 9, close: 9.2 },
    { open: 9.2, high: 9.5, low: 8.8, close: 9 },
  ]);
  const timeline = buildStrategyPlanTimeline(bars, {
    strategyA: {
      strategyId: "tv-channel-breakout",
      parameters: { length: 2, tick: 0.1 },
    },
    strategyB: null,
    strategyAAllocation: 1,
    strategyBAllocation: 0,
  });
  const result = runAllocationBacktest(
    bars,
    timeline.target,
    {
      initialCash: 10_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
      executionPolicy: "hybrid",
    },
    timeline.signalEvents,
    timeline.intrabarExecutions,
  );

  assert.equal(result.rebalances[0].time, bars[2].time);
  assert.equal(result.rebalances[0].fillPrice, 11.1);
  assert.equal(result.rebalances[1].time, bars[3].time);
  assert.equal(result.rebalances[1].fillPrice, 9.4);
});

test("orders different same-bar combination stops without discarding fills", () => {
  const bars = makeOhlcBars([
    { open: 9.5, high: 10, low: 9, close: 9.5 },
    { open: 10, high: 11, low: 9.5, close: 10.5 },
    { open: 10.8, high: 12, low: 10.7, close: 11.5 },
  ]);
  const timeline = buildStrategyPlanTimeline(bars, {
    strategyA: {
      strategyId: "tv-channel-breakout",
      parameters: { length: 2, tick: 0.1 },
    },
    strategyB: {
      strategyId: "tv-price-channel",
      parameters: { length: 2 },
    },
    strategyAAllocation: 0.6,
    strategyBAllocation: 0.4,
  });

  assert.equal(timeline.relativeLongStrategy, "strategyA");
  assert.deepEqual(timeline.intrabarExecutions?.[2], [
    {
      targetAllocation: 0.6,
      fillPrice: 11.1,
      signals: ["long-entry"],
    },
  ]);
});

test("uses a conservative entry-then-exit path when both channel stops touch", () => {
  const bars = makeOhlcBars([
    { open: 9.5, high: 10, low: 9, close: 9.5 },
    { open: 10, high: 11, low: 9.5, close: 10.5 },
    { open: 10, high: 12, low: 8, close: 10 },
  ]);
  const timeline = buildStrategyPlanTimeline(bars, {
    strategyA: {
      strategyId: "tv-channel-breakout",
      parameters: { length: 2, tick: 0.1 },
    },
    strategyB: null,
    strategyAAllocation: 1,
    strategyBAllocation: 0,
  });

  assert.equal(timeline.target[2], 0);
  assert.deepEqual(timeline.intrabarExecutions?.[2], [
    {
      targetAllocation: 1,
      fillPrice: 11.1,
      signals: ["long-entry"],
    },
    {
      targetAllocation: 0,
      fillPrice: 8.9,
      signals: ["long-exit"],
    },
  ]);
  const result = runAllocationBacktest(
    bars,
    timeline.target,
    {
      initialCash: 10_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
      executionPolicy: "hybrid",
    },
    timeline.signalEvents,
    timeline.intrabarExecutions,
  );
  assert.equal(result.rebalances.length, 2);
  assert.ok(result.totalReturn < 0);

  const direct = runBacktest(
    bars,
    "tv-channel-breakout",
    { length: 2, tick: 0.1 },
    {
      initialCash: 10_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
      executionPolicy: "hybrid",
    },
  );
  assert.equal(direct.tradeCount, 1);
  assert.equal(direct.trades[0].entryTime, bars[2].time);
  assert.equal(direct.trades[0].exitTime, bars[2].time);
  assert.ok(direct.totalReturn < 0);
});

test("marks an open final position to market without a synthetic sell", () => {
  const bars = makeOhlcBars([
    { open: 10, high: 10.5, low: 9.5, close: 10 },
    { open: 11, high: 12.5, low: 10.8, close: 12 },
    { open: 12, high: 13.5, low: 11.8, close: 13 },
  ]);
  const result = runBacktest(
    bars,
    "tv-bar-up-down",
    { minimumBodyPercent: 0 },
    {
      initialCash: 10_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
    },
  );

  assert.equal(result.tradeCount, 0);
  assert.ok(result.finalEquity > 10_000);
  assert.deepEqual(result.openPosition, {
    entryTime: bars[2].time,
    entryPrice: bars[2].open,
  });
  const markers = buildTradeMarkers(result.trades, result.openPosition);
  assert.equal(markers.buys.length, 1);
  assert.equal(markers.buys[0].time, bars[2].time);
  assert.equal(markers.buys[0].price, bars[2].open);
  assert.equal(markers.sells.length, 0);
  assert.equal(markers.rangeExits.length, 0);
});

test("maps an unclosed price-order entry without inventing an exit", () => {
  const bars = makeOhlcBars([
    { open: 9.5, high: 10, low: 9, close: 9.5 },
    { open: 10, high: 11, low: 9.5, close: 10.5 },
    { open: 11, high: 12, low: 10.5, close: 11.5 },
    { open: 11.5, high: 12.5, low: 11, close: 12 },
  ]);
  const result = runBacktest(
    bars,
    "tv-channel-breakout",
    { length: 2, tick: 0.1 },
    {
      initialCash: 10_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
      executionPolicy: "hybrid",
    },
  );

  assert.equal(result.tradeCount, 0);
  assert.deepEqual(result.openPosition, {
    entryTime: bars[2].time,
    entryPrice: 11.1,
  });
  const markers = buildTradeMarkers(result.trades, result.openPosition);
  assert.deepEqual(markers.buys.map(({ time, price }) => ({ time, price })), [
    { time: bars[2].time, price: 11.1 },
  ]);
  assert.equal(markers.sells.length, 0);
  assert.equal(markers.rangeExits.length, 0);
});

test("maps allocation increases, reductions, and valuation exits to markers", () => {
  const markers = buildAllocationTradeMarkers([
    {
      time: "2026-01-02",
      fromAllocation: 0,
      targetAllocation: 0.6,
      fillPrice: 101,
      reason: "strategy",
      signals: ["long-entry"],
    },
    {
      time: "2026-01-03",
      fromAllocation: 0.6,
      targetAllocation: 1,
      fillPrice: 103,
      reason: "strategy",
      signals: ["short-entry"],
    },
    {
      time: "2026-01-04",
      fromAllocation: 1,
      targetAllocation: 0.6,
      fillPrice: 99,
      reason: "strategy",
      signals: ["short-exit"],
    },
    {
      time: "2026-01-05",
      fromAllocation: 0.6,
      targetAllocation: 0,
      fillPrice: 98,
      reason: "range-end",
    },
  ]);

  assert.equal(markers.buys.length, 2);
  assert.equal(markers.sells.length, 1);
  assert.equal(markers.rangeExits.length, 1);
  assert.deepEqual(markers.buys.map((marker) => marker.price), [101, 103]);
  assert.deepEqual(markers.buys.map((marker) => marker.signals), [
    ["long-entry"],
    ["short-entry"],
  ]);
  assert.deepEqual(markers.buys.map((marker) => marker.action), [
    "open",
    "short-buy",
  ]);
  assert.equal(markers.sells[0].price, 99);
  assert.deepEqual(markers.sells[0].signals, ["short-exit"]);
  assert.equal(markers.sells[0].action, "short-sell");
  assert.equal(markers.rangeExits[0].price, 98);
});

test("adds the current Asia-Shanghai Yahoo daily bar from market metadata", () => {
  const previousTimestamp =
    Date.parse("2026-09-14T04:00:00.000Z") / 1_000;
  const currentTimestamp =
    Date.parse("2026-09-15T00:30:00.000Z") / 1_000;
  const series = parseYahooChart(
    {
      chart: {
        result: [
          {
            meta: {
              symbol: "GC=F",
              longName: "Gold Futures",
              chartPreviousClose: 4_300,
              exchangeTimezoneName: "America/New_York",
              exchangeName: "CMX",
              regularMarketTime: currentTimestamp,
              regularMarketPrice: 4_340,
              regularMarketOpen: 4_320,
              regularMarketDayHigh: 4_350,
              regularMarketDayLow: 4_310,
              regularMarketVolume: 12_345,
              currentTradingPeriod: {
                regular: {
                  end: Date.parse("2026-09-15T05:00:00.000Z") / 1_000,
                },
              },
            },
            timestamp: [previousTimestamp],
            indicators: {
              quote: [
                {
                  open: [4_280],
                  close: [4_300],
                  high: [4_310],
                  low: [4_270],
                  volume: [10_000],
                },
              ],
              adjclose: [{ adjclose: [4_300] }],
            },
          },
        ],
      },
    },
    {
      secid: "GC=F",
      code: "GC=F",
      name: "Gold Futures",
      exchange: "COMEX",
      assetType: "commodity",
      provider: "yahoo",
    },
    "1d",
    new Date("2026-09-15T00:31:00.000Z"),
  );

  assert.deepEqual(
    series.bars.map((bar) => bar.time),
    ["2026-09-14", "2026-09-15"],
  );
  assert.deepEqual(
    {
      open: series.bars.at(-1)?.open,
      close: series.bars.at(-1)?.close,
      high: series.bars.at(-1)?.high,
      low: series.bars.at(-1)?.low,
      volume: series.bars.at(-1)?.volume,
    },
    {
      open: 4_320,
      close: 4_340,
      high: 4_350,
      low: 4_310,
      volume: 12_345,
    },
  );
  assert.equal(series.latestBarStatus, "in-progress");
});

test("labels inherited range exposure as an opening position without adding a trade", () => {
  const bars = makeOhlcBars([
    { open: 10, high: 10, low: 10, close: 10 },
    { open: 11, high: 11, low: 11, close: 11 },
    { open: 12, high: 12, low: 12, close: 12 },
    { open: 13, high: 13, low: 13, close: 13 },
    { open: 14, high: 14, low: 14, close: 14 },
  ]);
  const result = runAllocationBacktest(bars, [0, 1, 1, 0, 0], {
    initialCash: 10_000,
    commissionRate: 0,
    slippageRate: 0,
    interval: "1d",
    startTime: bars[2].time,
    endTime: bars[4].time,
  });
  const markers = buildAllocationTradeMarkers(
    result.rebalances,
    result.openingPosition,
  );

  assert.deepEqual(result.openingPosition, {
    time: bars[2].time,
    price: bars[2].open,
    allocation: 1,
  });
  assert.equal(result.tradeCount, 1);
  assert.equal(result.rebalances.length, 1);
  assert.equal(markers.buys[0].action, "carry");
  assert.equal(markers.buys[0].time, bars[2].time);
  assert.equal(markers.sells.length, 1);
});

test("classifies a simultaneous long and short exit as one close marker", () => {
  const markers = buildAllocationTradeMarkers([
    {
      time: "2026-01-05",
      fromAllocation: 1,
      targetAllocation: 0,
      fillPrice: 98,
      reason: "strategy",
      signals: ["long-exit", "short-exit"],
    },
  ]);

  assert.equal(markers.sells.length, 1);
  assert.equal(markers.sells[0].action, "close");
});

test("optimizes every strategy and sorts best results by score", async () => {
  const bars = makeBars(
    Array.from({ length: 180 }, (_, index) => {
      return 20 + index * 0.04 + Math.sin(index / 5) * 1.8;
    }),
  );
  const progress: number[] = [];
  const outcome = await optimizeStrategies(
    bars,
    {
      initialCash: 100_000,
      commissionRate: 0.0003,
      slippageRate: 0.0002,
      interval: "1d",
    },
    {
      candidates: firstScreeningCandidatesPerStrategy(3),
      yieldEvery: 24,
      onProgress: (update) => progress.push(update.completed),
    },
  );

  assert.equal(outcome.totalCandidates, STRATEGIES.length * 3);
  assert.equal(outcome.evaluatedCount, outcome.totalCandidates);
  assert.equal(
    outcome.results.length,
    MAX_SCREENING_RESULTS_PER_CATEGORY,
  );
  assert.equal(outcome.cancelled, false);
  assert.equal(outcome.failedCount, 0);
  assert.equal(progress.at(0), 0);
  assert.equal(progress.at(-1), outcome.totalCandidates);
  assert.equal(
    new Set(outcome.results.map((result) => result.strategyId)).size,
    MAX_SCREENING_RESULTS_PER_CATEGORY,
  );
  for (let index = 1; index < outcome.results.length; index += 1) {
    assert.ok(
      outcome.results[index - 1].score >= outcome.results[index].score,
    );
  }
});

test("builds complete horizon-filtered screening candidates", () => {
  const longCandidates = buildScreeningCandidates(["long"]);
  const shortCandidates = buildScreeningCandidates(["short"]);

  assert.ok(longCandidates.length > LONG_HORIZON_STRATEGY_IDS.length);
  assert.ok(shortCandidates.length > SHORT_HORIZON_STRATEGY_IDS.length);
  assert.ok(
    longCandidates.every(
      (candidate) => getStrategy(candidate.strategyId).horizon === "long",
    ),
  );
  assert.ok(
    shortCandidates.every(
      (candidate) => getStrategy(candidate.strategyId).horizon === "short",
    ),
  );
});

test("excludes volume-dependent strategies from screening when requested", () => {
  const candidates = buildScreeningCandidates(
    ["long", "short"],
    VOLUME_REQUIRED_STRATEGY_IDS,
  );
  assert.equal(candidates.length, 39_934);
  assert.ok(
    candidates.every(
      (candidate) => !VOLUME_REQUIRED_STRATEGY_IDS.includes(
        candidate.strategyId as (typeof VOLUME_REQUIRED_STRATEGY_IDS)[number],
      ),
    ),
  );
  assert.ok(
    candidates.some((candidate) => candidate.strategyId === "community-half-trend"),
  );
  assert.ok(
    candidates.some((candidate) => candidate.strategyId === "community-qqe-mod"),
  );
  assert.ok(
    candidates.some(
      (candidate) => candidate.strategyId === "community-schaff-trend-cycle",
    ),
  );
});

test("builds all positive tenth-based three-strategy allocations", () => {
  assert.equal(THREE_STRATEGY_ALLOCATION_CANDIDATES.length, 36);
  assert.deepEqual(
    new Set(
      THREE_STRATEGY_ALLOCATION_CANDIDATES.map(
        ({ tacticalMode }) => tacticalMode,
      ),
    ),
    new Set(["add-on-short-entry"]),
  );
  assert.ok(
    THREE_STRATEGY_ALLOCATION_CANDIDATES.every((allocation) => {
      const values = [
        allocation.strategyAAllocation,
        allocation.strategyBAllocation,
        allocation.strategyCAllocation,
      ];
      return (
        values.every(
          (value) => value >= 0.1 && Number.isInteger(value * 10),
        ) &&
        Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) <
          1e-10
      );
    }),
  );
});

test("builds flexible positive tenth-based four- through six-strategy allocations", () => {
  assert.equal(FOUR_STRATEGY_ALLOCATION_CANDIDATES.length, 84);
  assert.equal(FIVE_STRATEGY_ALLOCATION_CANDIDATES.length, 126);
  assert.equal(SIX_STRATEGY_ALLOCATION_CANDIDATES.length, 126);
  for (const candidates of [
    FOUR_STRATEGY_ALLOCATION_CANDIDATES,
    FIVE_STRATEGY_ALLOCATION_CANDIDATES,
    SIX_STRATEGY_ALLOCATION_CANDIDATES,
  ] as const) {
    assert.ok(
      candidates.every((allocation) => {
        const values = Object.entries(allocation)
          .filter(([key]) => key.endsWith("Allocation"))
          .map(([, value]) => Number(value));
        return (
          values.every(
            (value) => value >= 0.1 && Number.isInteger(value * 10),
          ) &&
          Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) < 1e-10
        );
      }),
    );
  }
});

test("uses a long-cycle core with weighted tactical satellite exposure", () => {
  const timeline = buildThreeStrategyPlanTimelineFromTargets(
    [0, 1, 1, 1, 1, 0],
    [0, 0, 1, 0, 0, 0],
    [0, 1, 1, 0, 1, 0],
    0.4,
    0.3,
    0.3,
    undefined,
    "strategyA",
    "add-on-short-entry",
  );
  assert.deepEqual(timeline.target, [0, 0.8, 1, 0.6, 0.6, 0]);
  assert.deepEqual(timeline.signalEvents, [
    [],
    ["long-entry"],
    ["short-entry"],
    ["short-exit"],
    [],
    ["long-exit"],
  ]);
  assert.equal(timeline.relativeLongStrategy, "strategyA");
});

test("allows volatility risk to reduce or clear multi-strategy exposure immediately", () => {
  const timeline = buildThreeStrategyPlanTimelineFromTargets(
    [1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1],
    0.4,
    0.3,
    0.3,
    undefined,
    "strategyA",
    "add-on-short-entry",
    [1, 1, 0.8, 0.6, 0, 1, 1],
  );

  assert.deepEqual(timeline.target, [1, 1, 0.8, 0.6, 0, 1, 1]);
  assert.deepEqual(timeline.signalEvents, [
    ["long-entry"],
    [],
    ["short-exit"],
    ["short-exit"],
    ["long-exit"],
    ["long-entry"],
    [],
  ]);
});

test("builds causal volatility caps with immediate risk reduction", () => {
  const bars = makeOhlcBars([
    ...Array.from({ length: 24 }, (_, index) => ({
      open: 100 + index * 0.1,
      high: 101 + index * 0.1,
      low: 99 + index * 0.1,
      close: 100 + index * 0.1,
    })),
    { open: 102.4, high: 132, low: 72, close: 103 },
    { open: 103, high: 104, low: 102, close: 103.2 },
  ]);
  const caps = buildMultiStrategyVolatilityRiskCaps(bars);

  assert.equal(caps.length, bars.length);
  assert.ok(caps[24]! < 1);
  assert.ok(caps[25]! <= caps[24]!);
  assert.ok([...caps].every((cap) => [0, 0.6, 0.8, 1].includes(cap)));
  for (let length = 1; length <= bars.length; length += 1) {
    assert.equal(
      buildMultiStrategyVolatilityRiskCaps(bars.slice(0, length)).at(-1),
      caps[length - 1],
    );
  }
});

test("does not rebalance inside the tactical no-trade band", () => {
  const timeline = buildThreeStrategyPlanTimelineFromTargets(
    [0, 1, 1, 1, 1, 0],
    [0, 1, 0, 1, 1, 0],
    [0, 1, 1, 0, 1, 1],
    0.4,
    0.3,
    0.3,
    undefined,
    "strategyA",
    "reduce-on-short-exit",
  );
  assert.deepEqual(timeline.target, [0, 1, 1, 1, 1, 0]);
  assert.deepEqual(timeline.signalEvents, [
    [],
    ["long-entry"],
    [],
    [],
    [],
    ["long-exit"],
  ]);
});

test("starts fully invested then tactically reduces and replenishes without shorting", () => {
  const timeline = buildStrategyPlanTimelineFromTargets(
    [0, 1, 1, 1, 1, 1, 0],
    [0, 1, 0, 1, 0, 1, 1],
    0.6,
    0.4,
    undefined,
    "strategyA",
    "reduce-on-short-exit",
  );

  assert.deepEqual(timeline.target, [0, 1, 0.6, 1, 0.6, 1, 0]);
  assert.deepEqual(timeline.signalEvents, [
    [],
    ["long-entry"],
    ["short-exit"],
    ["short-entry"],
    ["short-exit"],
    ["short-entry"],
    ["long-exit", "short-exit"],
  ]);
  assert.ok(timeline.target.every((allocation) => allocation >= 0));
  assert.ok(timeline.target.every((allocation) => allocation <= 1));
});

test("marks the buy-and-hold benchmark to market without exit costs", () => {
  const bars = makeBars([100, 105, 110]);
  const result = runBacktestFromTarget(
    bars,
    "sma-cross",
    { fast: 2, slow: 3 },
    [0, 0, 0],
    {
      initialCash: 100_000,
      commissionRate: 0.01,
      slippageRate: 0.02,
      interval: "1d",
      executionPolicy: "next-open",
    },
  );
  const expected =
    (bars.at(-1)!.close /
      (bars[0].open * (1 + 0.02) * (1 + 0.01)) -
      1) *
    100;
  assert.ok(Math.abs(result.benchmarkReturn - expected) < 1e-10);
});

test("keeps screening cards identical to applying the same full-history strategy", async () => {
  const bars = makeOhlcBars(
    Array.from({ length: 1_200 }, (_, index) => {
      if (index === 100) {
        return { open: 101, high: 111, low: 100, close: 110 };
      }
      if (index === 950) {
        return { open: 99, high: 100, low: 89, close: 90 };
      }
      return { open: 100, high: 101, low: 99, close: 100 };
    }),
  );
  const settings = {
    initialCash: 100_000,
    commissionRate: 0,
    slippageRate: 0,
    startTime: bars[900].time,
    endTime: bars[999].time,
    interval: "1d" as const,
    executionPolicy: "hybrid" as const,
  };
  const candidates = firstScreeningCandidatesPerStrategy(1).filter(
    (candidate) => candidate.strategyId === "tv-bar-up-down",
  );
  const outcome = await optimizeStrategies(bars, settings, {
    candidates,
    yieldEvery: 10_000,
  });
  const screened = outcome.results.find(
    (result) => result.strategyId === "tv-bar-up-down",
  );
  assert.ok(screened);

  const applied = runBacktest(
    bars,
    screened.strategyId,
    screened.parameters,
    settings,
  );
  assert.equal(screened.totalReturn, applied.totalReturn);
  assert.equal(screened.sharpe, applied.sharpe);
  assert.equal(screened.maxDrawdown, applied.maxDrawdown);
  assert.equal(screened.equity.length, 0);
  assert.equal(screened.trades.length, 0);
  assert.equal(screened.tradeCount, 0);

  const combinedOutcome = await optimizeStrategyCombinations(
    bars,
    settings,
    {
      candidates,
      maxPairFinalists: 1,
      allocationCandidates: [TWO_STRATEGY_ALLOCATION_CANDIDATES[0]],
      yieldEvery: 10_000,
    },
  );
  const combinedScreened = combinedOutcome.singleResults.find(
    (result) => result.strategyId === "tv-bar-up-down",
  );
  assert.ok(combinedScreened);
  const combinedApplied = runBacktest(
      bars,
      combinedScreened.strategyId,
      combinedScreened.parameters,
      settings,
    );
  assert.equal(combinedScreened.totalReturn, combinedApplied.totalReturn);
  assert.equal(combinedScreened.sharpe, combinedApplied.sharpe);
  assert.equal(combinedScreened.equity.length, 0);
});

test("optimizes automatic unique-winner two-strategy combinations", async () => {
  const bars = makeBars(
    Array.from({ length: 180 }, (_, index) => {
      return 30 + index * 0.05 + Math.sin(index / 5) * 2.4;
    }),
  );
  const progress: CombinationScreeningProgress[] = [];
  const outcome = await optimizeStrategyCombinations(
    bars,
    {
      initialCash: 100_000,
      commissionRate: 0.0003,
      slippageRate: 0.0002,
      interval: "1d",
    },
    {
      candidates: firstScreeningCandidatesPerStrategy(1),
      includeTriples: false,
      yieldEvery: 16,
      onProgress: (update) => progress.push({ ...update }),
    },
  );

  assert.equal(COMBINATION_FINALISTS_PER_STRATEGY, 3);
  const distinctStrategyPairCount = STRATEGIES.reduce(
    (count, strategyA, strategyAIndex) =>
      count +
      STRATEGIES.slice(strategyAIndex + 1).filter(
        (strategyB) =>
          !areStrategiesEquivalent(strategyA.id, strategyB.id),
      ).length,
    0,
  );
  assert.ok(
    MAX_COMBINATION_PAIR_FINALISTS >=
      distinctStrategyPairCount,
  );
  assert.equal(
    outcome.totalCandidates,
    STRATEGIES.length +
      distinctStrategyPairCount *
        TWO_STRATEGY_ALLOCATION_CANDIDATES.length,
  );
  assert.equal(outcome.evaluatedCount, outcome.totalCandidates);
  assert.equal(outcome.failedCount, 0);
  assert.equal(outcome.cancelled, false);
  assert.equal(
    outcome.singleResults.length,
    MAX_SCREENING_RESULTS_PER_CATEGORY,
  );
  assert.equal(
    new Set(outcome.singleResults.map((result) => result.strategyId)).size,
    outcome.singleResults.length,
  );
  assert.equal(
    outcome.results.length,
    MAX_COMBINATION_RESULTS,
  );
  assert.equal(progress.at(0)?.completed, 0);
  assert.equal(progress.at(-1)?.completed, outcome.totalCandidates);
  assert.deepEqual(
    new Set(progress.map((update) => update.stage)),
    new Set(["strategies", "pairs", "allocations"]),
  );
  const stageIndex = {
    strategies: 0,
    entryFilters: 1,
    pairs: 2,
    allocations: 3,
    triples: 4,
    tripleAllocations: 5,
    quadruples: 6,
    quadrupleAllocations: 7,
    quintuples: 8,
    quintupleAllocations: 9,
    sextuples: 10,
    sextupleAllocations: 11,
  } as const;
  const segmentedProgress = progress.map(
    (update) =>
      stageIndex[update.stage] +
      (update.stageTotal > 0
        ? update.stageCompleted / update.stageTotal
        : 1),
  );
  assert.ok(
    progress.every(
      (update) =>
        update.stageCompleted >= 0 &&
        update.stageCompleted <= update.stageTotal,
    ),
  );
  assert.ok(
    segmentedProgress.every(
      (value, index) =>
        index === 0 || value >= segmentedProgress[index - 1],
    ),
  );
  assert.equal(
    new Set(
      outcome.results.map(
        (result) => `${result.strategyAId}:${result.strategyBId}`,
      ),
    ).size,
    outcome.results.length,
  );
  assert.ok(
    outcome.results.every(
      (result) =>
        !areStrategiesEquivalent(result.strategyAId, result.strategyBId),
    ),
  );

  for (const result of outcome.results) {
    assert.notEqual(result.strategyAId, result.strategyBId);
    assert.ok(
      result.relativeLongStrategy === "strategyA" ||
        result.relativeLongStrategy === "strategyB",
    );
    assert.ok(
      TWO_STRATEGY_ALLOCATION_CANDIDATES.some(
        (candidate) =>
          candidate.strategyAAllocation === result.strategyAAllocation &&
          candidate.strategyBAllocation === result.strategyBAllocation &&
          candidate.tacticalMode === result.tacticalMode,
      ),
    );
    assert.equal(
      result.strategyAAllocation + result.strategyBAllocation,
      1,
    );
    assert.deepEqual(
      result.strategyAParameters,
      outcome.singleCandidatePool.find(
        (single) => single.strategyId === result.strategyAId,
      )?.parameters,
    );
    assert.deepEqual(
      result.strategyBParameters,
      outcome.singleCandidatePool.find(
        (single) => single.strategyId === result.strategyBId,
      )?.parameters,
    );
    assert.equal(result.rebalances.length, 0);
    const appliedTimeline = buildStrategyPlanTimeline(bars, {
      strategyA: {
        strategyId: result.strategyAId,
        parameters: result.strategyAParameters,
      },
      strategyB: {
        strategyId: result.strategyBId,
        parameters: result.strategyBParameters,
      },
      strategyAAllocation: result.strategyAAllocation,
      strategyBAllocation: result.strategyBAllocation,
      tacticalMode: result.tacticalMode,
    });
    const applied = runAllocationBacktest(
      bars,
      appliedTimeline.target,
      {
        initialCash: 100_000,
        commissionRate: 0.0003,
        slippageRate: 0.0002,
        interval: "1d",
      },
      appliedTimeline.signalEvents,
      appliedTimeline.intrabarExecutions,
    );
    assert.equal(result.totalReturn, applied.totalReturn);
    assert.equal(result.maxDrawdown, applied.maxDrawdown);
    assert.equal(result.tradeCount, applied.tradeCount);
  }
  for (let index = 1; index < outcome.results.length; index += 1) {
    assert.ok(
      compareScreeningResults(
        outcome.results[index - 1],
        outcome.results[index],
        "balanced",
      ) <= 0,
    );
  }
});

test("crosses the top three parameter finalists for every strategy pair", async () => {
  const bars = makeBars(
    Array.from({ length: 160 }, (_, index) =>
      40 + index * 0.04 + Math.sin(index / 5) * 2,
    ),
  );
  const completeCandidates = buildScreeningCandidates();
  const candidates = ["sma-cross", "rsi-reversal"].flatMap((strategyId) =>
    completeCandidates
      .filter((candidate) => candidate.strategyId === strategyId)
      .slice(0, COMBINATION_FINALISTS_PER_STRATEGY),
  );
  const progress: CombinationScreeningProgress[] = [];
  const outcome = await optimizeStrategyCombinations(
    bars,
    {
      initialCash: 100_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
    },
    {
      candidates,
      allocationCandidates: [TWO_STRATEGY_ALLOCATION_CANDIDATES[0]],
      yieldEvery: 10_000,
      onProgress: (update) => progress.push({ ...update }),
    },
  );

  assert.equal(
    progress.find((update) => update.stage === "pairs")?.stageTotal,
    COMBINATION_FINALISTS_PER_STRATEGY ** 2,
  );
  assert.equal(
    outcome.totalCandidates,
    candidates.length + COMBINATION_FINALISTS_PER_STRATEGY ** 2,
  );
  assert.equal(outcome.results.length, 1);
});

test("keeps the top thirty two- through six-strategy results independently", async () => {
  assert.equal(MAX_MULTI_STRATEGY_FINALISTS_PER_PRIMARY, 16);
  assert.equal(MAX_MULTI_STRATEGY_RESULTS_PER_PRIMARY, 3);
  assert.equal(
    MAX_MULTI_STRATEGY_FINALISTS_PER_LEVEL,
    STRATEGIES.length * MAX_MULTI_STRATEGY_FINALISTS_PER_PRIMARY,
  );
  const bars = makeBars(
    Array.from(
      { length: 180 },
      (_, index) => 40 + index * 0.08 + Math.sin(index / 6) * 2,
    ),
  );
  const strategyIds = [
    "sma-cross",
    "rsi-reversal",
    "macd-momentum",
    "bollinger-reversion",
    "donchian-breakout",
    "kdj-reversal",
    "ichimoku-trend",
    "roc-momentum",
  ] as const;
  const outcome = await optimizeStrategyCombinations(
    bars,
    {
      initialCash: 100_000,
      commissionRate: 0.0003,
      slippageRate: 0.0002,
      interval: "1d",
      startTime: bars[80].time,
      endTime: bars.at(-1)!.time,
    },
    {
      objective: "totalReturn",
      candidates: strategyIds.map((strategyId) => ({
        strategyId,
        parameters: { ...getStrategy(strategyId).defaultParameters },
      })),
      allocationCandidates: [TWO_STRATEGY_ALLOCATION_CANDIDATES[0]],
      tripleAllocationCandidates: [
        THREE_STRATEGY_ALLOCATION_CANDIDATES.find(
          (allocation) =>
            allocation.strategyAAllocation === 0.4 &&
            allocation.strategyBAllocation === 0.3 &&
            allocation.strategyCAllocation === 0.3 &&
            allocation.tacticalMode === "add-on-short-entry",
        )!,
      ],
      quadrupleAllocationCandidates: [FOUR_STRATEGY_ALLOCATION_CANDIDATES[0]],
      quintupleAllocationCandidates: [FIVE_STRATEGY_ALLOCATION_CANDIDATES[0]],
      sextupleAllocationCandidates: [SIX_STRATEGY_ALLOCATION_CANDIDATES[0]],
      retainedSinglesPerStrategy: 1,
      maxPairFinalists: 30,
      maxTripleParentPairs: 28,
      maxTripleFinalists: 56,
      yieldEvery: 64,
    },
  );
  const resultsByCount = new Map(
    Array.from({ length: 5 }, (_, index) => {
      const count = index + 2;
      return [
        count,
        outcome.results.filter((result) =>
          STRATEGY_SLOTS.filter((slot) =>
            Boolean((result as unknown as Record<string, unknown>)[`${slot}Id`]),
          ).length === count,
        ),
      ] as const;
    }),
  );
  assert.equal(outcome.cancelled, false);
  assert.equal(outcome.failedCount, 0);
  const sixStrategyResult = resultsByCount.get(6)?.[0];
  assert.ok(sixStrategyResult);
  const fullHistoryReplay = runStrategyCombinationBacktest(
    bars,
    sixStrategyResult,
    {
      initialCash: 100_000,
      commissionRate: 0.0003,
      slippageRate: 0.0002,
      interval: "1d",
      startTime: bars[80].time,
      endTime: bars.at(-1)!.time,
      executionPolicy: "next-open",
    },
  );
  assert.equal(sixStrategyResult.totalReturn, fullHistoryReplay.totalReturn);
  assert.equal(sixStrategyResult.sharpe, fullHistoryReplay.sharpe);
  assert.equal(sixStrategyResult.maxDrawdown, fullHistoryReplay.maxDrawdown);
  assert.equal(sixStrategyResult.tradeCount, fullHistoryReplay.tradeCount);
  for (let count = 2; count <= 6; count += 1) {
    const categoryResults = resultsByCount.get(count) ?? [];
    const categoryCount = categoryResults.length;
    assert.ok(categoryCount > 0);
    assert.ok(categoryCount <= MAX_COMBINATION_RESULTS);
    if (count >= 3) {
      const primaryCounts = new Map<string, number>();
      for (const result of categoryResults) {
        primaryCounts.set(
          result.strategyAId,
          (primaryCounts.get(result.strategyAId) ?? 0) + 1,
        );
      }
      assert.ok(
        [...primaryCounts.values()].every(
          (primaryCount) =>
            primaryCount <= MAX_MULTI_STRATEGY_RESULTS_PER_PRIMARY,
        ),
      );
    }
  }
  assert.equal(
    outcome.results.some(
      (result) =>
        STRATEGY_SLOTS.filter((slot) =>
          Boolean((result as unknown as Record<string, unknown>)[`${slot}Id`]),
        ).length === 7,
    ),
    false,
  );
  const tripleResults = resultsByCount.get(3)!;
  const quadrupleResults = resultsByCount.get(4)!;
  const quintupleResults = resultsByCount.get(5)!;
  assert.ok(
    tripleResults.every(
      (result) =>
        new Set([
          result.strategyAId,
          result.strategyBId,
          result.strategyCId,
        ]).size === 3,
    ),
  );
  assert.ok(quadrupleResults.every((result) => result.strategyDId));
  assert.ok(quintupleResults.every((result) => result.strategyEId));
});

test("screens EMA 5-8 only for the top 60 eligible-family parameter sets", async () => {
  assert.ok(
    SCREENING_MOVING_AVERAGE_SLOPE_STRATEGY_IDS.includes(
      "tv-channel-breakout",
    ),
  );
  assert.ok(
    SCREENING_MOVING_AVERAGE_SLOPE_STRATEGY_IDS.includes(
      "tv-price-channel",
    ),
  );
  assert.equal(
    supportsScreeningMovingAverageSlopeFilter("rsi-reversal"),
    false,
  );
  const bars = makeBars(
    Array.from({ length: 120 }, (_, index) => {
      return 40 + index * 0.04 + Math.sin(index / 4) * 1.8;
    }),
  );
  const progress: CombinationScreeningProgress[] = [];
  const completeCandidates = buildScreeningCandidates();
  const candidates = [
    ...completeCandidates
      .filter((candidate) => candidate.strategyId === "sma-cross")
      .slice(0, 75),
    ...completeCandidates
      .filter((candidate) => candidate.strategyId === "rsi-reversal")
      .slice(0, 1),
  ];
  const outcome = await optimizeStrategyCombinations(
    bars,
    {
      initialCash: 100_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
    },
    {
      candidates,
      entryFilters: buildScreeningMovingAverageSlopeFilters(),
      allocationCandidates: [
        {
          strategyAAllocation: 0.6,
          strategyBAllocation: 0.4,
        },
      ],
      maxPairFinalists: 16,
      yieldEvery: 10_000,
      onProgress: (update) => progress.push({ ...update }),
    },
  );

  assert.deepEqual(
    buildScreeningMovingAverageSlopeFilters().map((filter) => filter.period),
    SCREENING_MOVING_AVERAGE_SLOPE_PERIODS,
  );
  assert.equal(
    progress.find((update) => update.stage === "entryFilters")
      ?.stageTotal,
    SCREENING_ENTRY_FILTER_FINALISTS_PER_STRATEGY *
      SCREENING_MOVING_AVERAGE_SLOPE_PERIODS.length,
  );
  const rsiResult = outcome.singleResults.find(
    (result) => result.strategyId === "rsi-reversal",
  );
  assert.equal(rsiResult?.entryFilter, undefined);
  const smaResult = outcome.singleResults.find(
    (result) => result.strategyId === "sma-cross",
  );
  assert.ok(smaResult);
  if (smaResult.entryFilter) {
    assert.equal(smaResult.entryFilter.movingAverageType, "ema");
    assert.equal(smaResult.entryFilter.minimumSlopePercent, 0);
    assert.ok(
      SCREENING_MOVING_AVERAGE_SLOPE_PERIODS.includes(
        smaResult.entryFilter.period as
          (typeof SCREENING_MOVING_AVERAGE_SLOPE_PERIODS)[number],
      ),
    );
  }
  for (const result of outcome.results) {
    const strategyAResult = outcome.singleResults.find(
      (single) => single.strategyId === result.strategyAId,
    );
    const strategyBResult = outcome.singleResults.find(
      (single) => single.strategyId === result.strategyBId,
    );
    assert.deepEqual(
      result.strategyAParameters,
      strategyAResult?.parameters,
    );
    assert.deepEqual(
      result.strategyAEntryFilter ?? null,
      strategyAResult?.entryFilter ?? null,
    );
    assert.deepEqual(
      result.strategyBEntryFilter ?? null,
      strategyBResult?.entryFilter ?? null,
    );
    assert.deepEqual(
      result.strategyBParameters,
      outcome.singleResults.find(
        (single) => single.strategyId === result.strategyBId,
      )?.parameters,
    );
  }
});

test("bounds allocation optimization to the retained strategy-pair shortlist", async () => {
  const bars = makeBars(
    Array.from({ length: 80 }, (_, index) => {
      return 25 + index * 0.03 + Math.sin(index / 4);
    }),
  );
  const maxPairFinalists = 5;
  const outcome = await optimizeStrategyCombinations(
    bars,
    {
      initialCash: 100_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
    },
    {
      candidates: firstScreeningCandidatesPerStrategy(2),
      includeTriples: false,
      maxPairFinalists,
      yieldEvery: 10_000,
    },
  );
  const strategyCandidates = STRATEGIES.length * 2;
  const pairCandidates =
    STRATEGIES.reduce(
      (count, strategyA, strategyAIndex) =>
        count +
        STRATEGIES.slice(strategyAIndex + 1).filter(
          (strategyB) =>
            !areStrategiesEquivalent(strategyA.id, strategyB.id),
        ).length,
      0,
    ) * Math.min(2, COMBINATION_FINALISTS_PER_STRATEGY) ** 2;
  const remainingAllocationCandidates =
    TWO_STRATEGY_ALLOCATION_CANDIDATES.length - 1;

  assert.equal(
    outcome.totalCandidates,
    strategyCandidates +
      pairCandidates +
      maxPairFinalists * remainingAllocationCandidates,
  );
  assert.equal(outcome.evaluatedCount, outcome.totalCandidates);
  assert.ok(
    outcome.results.length > 0 &&
      outcome.results.length <= maxPairFinalists,
  );
  assert.equal(
    new Set(
      outcome.results.map(
        (result) => `${result.strategyAId}:${result.strategyBId}`,
      ),
    ).size,
    outcome.results.length,
  );
});

test("keeps only the best allocation for each retained strategy pair", async () => {
  const bars = makeBars(
    Array.from({ length: 120 }, (_, index) => {
      return 25 + index * 0.04 + Math.sin(index / 4) * 1.8;
    }),
  );
  const settings = {
    initialCash: 100_000,
    commissionRate: 0.0003,
    slippageRate: 0.0002,
    interval: "1d" as const,
  };
  const outcome = await optimizeStrategyCombinations(bars, settings, {
    candidates: firstScreeningCandidatesPerStrategy(1),
    includeTriples: false,
    maxPairFinalists: 1,
    yieldEvery: 10_000,
  });
  const retained = outcome.results[0];

  assert.equal(outcome.results.length, 1);
  for (const allocation of TWO_STRATEGY_ALLOCATION_CANDIDATES) {
    const alternative = runAllocationBacktest(
      bars,
      buildStrategyCombinationTarget(bars, {
        strategyAId: retained.strategyAId,
        strategyAParameters: retained.strategyAParameters,
        strategyBId: retained.strategyBId,
        strategyBParameters: retained.strategyBParameters,
        ...allocation,
      }),
      settings,
    );
    assert.ok(
      compareScreeningResults(retained, alternative, "balanced") <= 0,
    );
  }
});

test("cancels combination optimization between chunks", async () => {
  const controller = new AbortController();
  const bars = makeBars(
    Array.from({ length: 100 }, (_, index) => 20 + index * 0.08),
  );
  const outcome = await optimizeStrategyCombinations(
    bars,
    {
      initialCash: 100_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
    },
    {
      candidates: firstScreeningCandidatesPerStrategy(2),
      signal: controller.signal,
      yieldEvery: 1,
      onProgress: ({ completed }) => {
        if (completed === 3) controller.abort();
      },
    },
  );

  assert.equal(outcome.cancelled, true);
  assert.equal(outcome.evaluatedCount, 3);
  assert.ok(outcome.evaluatedCount < outcome.totalCandidates);
  assert.equal(
    new Set(outcome.singleResults.map((result) => result.strategyId)).size,
    outcome.singleResults.length,
  );
});

test("ranks screening results by the selected optimization objective", () => {
  const base: BacktestResult = {
    strategyId: "sma-cross",
    parameters: { fast: 10, slow: 30 },
    totalReturn: 0,
    annualizedReturn: 0,
    benchmarkReturn: 0,
    maxDrawdown: 0,
    sharpe: 0,
    winRate: 0,
    profitFactor: 0,
    tradeCount: 1,
    finalEquity: 100_000,
    score: 0,
    equity: [],
    trades: [],
  };
  const aggressive = {
    ...base,
    totalReturn: 30,
    maxDrawdown: -25,
    sharpe: 0.8,
    score: 10,
  };
  const defensive = {
    ...base,
    totalReturn: 12,
    maxDrawdown: -4,
    sharpe: 1.8,
    score: 40,
  };

  assert.ok(
    compareScreeningResults(aggressive, defensive, "totalReturn") < 0,
  );
  for (const objective of ["balanced", "sharpe"] as const) {
    assert.ok(
      compareScreeningResults(defensive, aggressive, objective) < 0,
      objective,
    );
  }
  assert.deepEqual(
    SCREENING_OBJECTIVES,
    ["balanced", "totalReturn", "sharpe"],
  );
  assert.equal(screeningObjectiveValue(aggressive, "balanced"), 10);
  assert.equal(screeningObjectiveValue(aggressive, "totalReturn"), 30);
  assert.equal(screeningObjectiveValue(aggressive, "sharpe"), 0.8);
});

test("keeps the allocation-free screening comparator exactly rank-equivalent", () => {
  const base: BacktestResult = {
    strategyId: "sma-cross",
    parameters: { fast: 10, slow: 30 },
    totalReturn: 0,
    annualizedReturn: 0,
    benchmarkReturn: 0,
    maxDrawdown: 0,
    sharpe: 0,
    winRate: 0,
    profitFactor: 0,
    tradeCount: 0,
    finalEquity: 100_000,
    score: 0,
    equity: [],
    trades: [],
  };
  const samples = [
    base,
    { ...base, totalReturn: 12, maxDrawdown: -4, sharpe: 1.2, score: 20 },
    { ...base, totalReturn: 12, maxDrawdown: -8, sharpe: 1.2, score: 20 },
    { ...base, totalReturn: Number.NaN, sharpe: Number.NaN, score: -5 },
    { ...base, totalReturn: -3, maxDrawdown: -2, sharpe: 0.4, score: 20 },
  ];
  const finiteOrNegativeInfinity = (value: number) =>
    Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
  const compareDescending = (left: number, right: number) =>
    left === right ? 0 : left > right ? -1 : 1;
  const legacyCompare = (
    left: BacktestResult,
    right: BacktestResult,
    objective: (typeof SCREENING_OBJECTIVES)[number],
  ) =>
    [
      compareDescending(
        screeningObjectiveValue(left, objective),
        screeningObjectiveValue(right, objective),
      ),
      compareDescending(
        finiteOrNegativeInfinity(left.totalReturn),
        finiteOrNegativeInfinity(right.totalReturn),
      ),
      compareDescending(
        finiteOrNegativeInfinity(left.maxDrawdown),
        finiteOrNegativeInfinity(right.maxDrawdown),
      ),
      compareDescending(
        finiteOrNegativeInfinity(left.sharpe),
        finiteOrNegativeInfinity(right.sharpe),
      ),
      compareDescending(
        finiteOrNegativeInfinity(left.score),
        finiteOrNegativeInfinity(right.score),
      ),
    ].find((comparison) => comparison !== 0) ?? 0;

  for (const objective of SCREENING_OBJECTIVES) {
    for (const left of samples) {
      for (const right of samples) {
        assert.equal(
          compareScreeningResults(left, right, objective),
          legacyCompare(left, right, objective),
        );
      }
    }
  }
});

test("builds every unique parameter set without per-strategy sampling", () => {
  assert.equal(DEFAULT_SCREENING_YIELD_EVERY, 128);
  assert.equal(SCREENING_ENTRY_FILTER_FINALISTS_PER_STRATEGY, 60);
  assert.equal(buildScreeningCandidates().length, 45_196);

  const screeningCandidates = buildScreeningCandidates();
  assert.equal(screeningCandidates.length, 45_196);
  const candidatesByStrategy = new Map<
    string,
    Array<Record<string, number>>
  >();

  for (const candidate of screeningCandidates) {
    const candidates = candidatesByStrategy.get(candidate.strategyId) ?? [];
    candidates.push(candidate.parameters);
    candidatesByStrategy.set(candidate.strategyId, candidates);
  }

  assert.equal(candidatesByStrategy.size, STRATEGIES.length);
  for (const strategy of STRATEGIES) {
    const candidates = candidatesByStrategy.get(strategy.id) ?? [];
    assert.ok(candidates.length > 3, strategy.id);
    assert.equal(
      new Set(candidates.map((parameters) => JSON.stringify(parameters))).size,
      candidates.length,
      strategy.id,
    );
  }

  assert.equal(
    candidatesByStrategy.get("tv-channel-breakout")?.length,
    1_393,
  );
  assert.ok(
    candidatesByStrategy
      .get("tv-channel-breakout")
      ?.some(
        (parameters) =>
          parameters.length === 4 && parameters.tick === 0.01,
      ),
  );

  for (const strategyId of [
    "tv-channel-breakout",
    "tv-momentum",
    "tv-pivot-reversal",
  ] as const) {
    const candidates = candidatesByStrategy.get(strategyId) ?? [];
    assert.deepEqual(
      [
        ...new Set(candidates.map((parameters) => parameters.tick)),
      ].sort((left, right) => left - right),
      [0.01, 0.05, 0.1, 0.5, 1, 5, 10],
      strategyId,
    );
  }
});

test("builds deterministic nearest valid parameter variants without optimizing", () => {
  const baseParameters = { fast: 10, slow: 15 };
  const parameterSets = buildNearbyParameterSets(
    "sma-cross",
    baseParameters,
  );

  assert.deepEqual(parameterSets, [
    { fast: 10, slow: 15 },
    { fast: 8, slow: 15 },
    { fast: 12, slow: 15 },
    { fast: 10, slow: 20 },
  ]);
  assert.equal(
    parameterSets.filter(
      (parameters) =>
        JSON.stringify(parameters) === JSON.stringify(baseParameters),
    ).length,
    1,
  );
  parameterSets.slice(1).forEach((parameters) => {
    assert.equal(
      Object.keys(baseParameters).filter(
        (key) =>
          (parameters as Record<string, number>)[key] !==
          (baseParameters as Record<string, number>)[key],
      ).length,
      1,
    );
    assert.ok(parameters.fast < parameters.slow);
  });
});

test("shares integer strategy parameter semantics without classifying level thresholds", () => {
  for (const key of [
    "entryPeriod",
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
    "threshold",
  ]) {
    assert.equal(isIntegerStrategyParameterKey(key), true, key);
  }
  for (const key of ["entry", "exit", "oversold", "overbought", "width"]) {
    assert.equal(isIntegerStrategyParameterKey(key), false, key);
  }

  assert.equal(normalizeStrategyParameterInput("fast", 9.6), 10);
  assert.equal(normalizeStrategyParameterInput("period", 0.2), 1);
  assert.equal(normalizeStrategyParameterInput("threshold", 3.5), 4);
  assert.equal(normalizeStrategyParameterInput("entry", 22.5), 22.5);
  assert.equal(normalizeStrategyParameterInput("width", 2.25), 2.25);
});

test("validates exact strategy parameter keys, integer semantics, ranges, and cross-field rules", () => {
  assert.equal(
    isValidStrategyParameters("sma-cross", { fast: 9, slow: 31 }),
    true,
  );
  assert.equal(
    isValidStrategyParameters("sma-cross", { fast: 9.5, slow: 31 }),
    false,
  );
  assert.equal(
    isValidStrategyParameters("rsi-reversal", {
      period: 14,
      entry: 22.5,
      exit: 67.5,
    }),
    true,
  );
  assert.equal(
    isValidStrategyParameters("tv-rsi", {
      period: 14,
      oversold: 22.5,
      overbought: 72.5,
    }),
    true,
  );
  assert.equal(
    isValidStrategyParameters("tv-technical-ratings", { threshold: 2.5 }),
    false,
  );
  assert.equal(
    isValidStrategyParameters("sma-cross", { fast: 20, slow: 20 }),
    false,
  );
  assert.equal(
    isValidStrategyParameters("sma-cross", { fast: 1, slow: 30 }),
    false,
  );
  assert.equal(
    isValidStrategyParameters("sma-cross", {
      fast: Number.POSITIVE_INFINITY,
      slow: 30,
    }),
    false,
  );
  assert.equal(
    isValidStrategyParameters("sma-cross", { fast: 10 }),
    false,
  );
  assert.equal(
    isValidStrategyParameters("sma-cross", {
      fast: 10,
      slow: 30,
      extra: 1,
    }),
    false,
  );
  assert.deepEqual(
    buildNearbyParameterSets("sma-cross", { fast: 20, slow: 20 }),
    [],
  );
  assert.deepEqual(
    buildNearbyParameterSets("sma-cross", {
      fast: Number.NaN,
      slow: 30,
    }),
    [],
  );
  assert.deepEqual(
    buildNearbyParameterSets("sma-cross", {
      fast: 9.5,
      slow: 31,
    }),
    [],
  );
});

test("classifies trailing 60/20-day regimes deterministically without future data", () => {
  const risingBars = makeBars(
    Array.from({ length: 120 }, (_, index) => 100 + index),
  );
  const fallingBars = makeBars(
    Array.from({ length: 120 }, (_, index) => 300 - index),
  );
  const flatBars = makeBars(Array.from({ length: 120 }, () => 100));

  assert.deepEqual(classifyMarketRegimes([]), []);
  assert.ok(
    classifyMarketRegimes(risingBars.slice(0, 79)).every(
      (regime) => regime === null,
    ),
  );
  assert.equal(classifyMarketRegimes(risingBars)[79], "up");
  assert.equal(classifyMarketRegimes(fallingBars)[79], "down");
  assert.equal(classifyMarketRegimes(flatBars)[79], "sideways");

  const fullRegimes = classifyMarketRegimes(
    makeBars(
      Array.from(
        { length: 160 },
        (_, index) => 100 + index * 0.08 + Math.sin(index / 5) * 8,
      ),
    ),
  );
  for (const prefixLength of [80, 100, 140]) {
    assert.deepEqual(
      classifyMarketRegimes(
        makeBars(
          Array.from(
            { length: prefixLength },
            (_, index) => 100 + index * 0.08 + Math.sin(index / 5) * 8,
          ),
        ),
      ),
      fullRegimes.slice(0, prefixLength),
      `prefix:${prefixLength}`,
    );
  }
});

test("summarizes aligned consecutive equity returns by current-bar regime", () => {
  const bars = makeBars(
    Array.from({ length: 82 }, (_, index) => 100 + index),
  );
  const summaries = summarizeRegimeReturns(bars, [
    { time: bars[78].time, equity: 100, drawdown: 0 },
    { time: bars[79].time, equity: 110, drawdown: 0 },
    { time: bars[80].time, equity: 121, drawdown: 0 },
  ]);

  assert.equal(summaries.up.periodCount, 2);
  assert.ok(
    Math.abs((summaries.up.returnPercent ?? Number.NaN) - 21) < 1e-10,
  );
  assert.deepEqual(summaries.sideways, {
    returnPercent: null,
    periodCount: 0,
  });
  assert.deepEqual(summaries.down, {
    returnPercent: null,
    periodCount: 0,
  });
});

test("applies inclusive stability thresholds and retains factual ranges", () => {
  const makeResult = (
    totalReturn: number,
    maxDrawdown: number,
    tradeCount: number,
  ): BacktestResult => ({
    strategyId: "sma-cross",
    parameters: { fast: 10, slow: 15 },
    totalReturn,
    annualizedReturn: totalReturn,
    benchmarkReturn: 0,
    maxDrawdown,
    sharpe: 0,
    winRate: 0,
    profitFactor: 0,
    tradeCount,
    finalEquity: 100_000 * (1 + totalReturn / 100),
    score: 0,
    equity: [],
    trades: [],
  });
  const baseResult = makeResult(5, -10, 4);
  const variantResults = [
    makeResult(15, -8, 8),
    makeResult(10, -20, 6),
    makeResult(5, -12, 2),
    makeResult(0, -9, 5),
  ];

  assert.deepEqual(STABILITY_THRESHOLDS, {
    minimumSignAgreement: 0.75,
    maximumReturnRange: 15,
    maximumDrawdownDeterioration: 10,
  });
  const summary = summarizeNearbyBacktests(baseResult, variantResults);
  assert.deepEqual(summary.totalReturnRange, {
    minimum: 0,
    maximum: 15,
    width: 15,
  });
  assert.deepEqual(summary.tradeCountRange, {
    minimum: 2,
    maximum: 8,
  });
  assert.deepEqual(summary.drawdownRange, {
    minimum: -20,
    maximum: -8,
  });
  assert.equal(summary.worstDrawdown, -20);
  assert.equal(summary.drawdownDeterioration, 10);
  assert.deepEqual(summary.signAgreement, {
    matchingVariants: 3,
    variantCount: 4,
    ratio: 0.75,
  });
  assert.deepEqual(summary.thresholdChecks, {
    signAgreement: true,
    returnRange: true,
    drawdownDeterioration: true,
  });
  assert.equal(summary.stable, true);

  assert.equal(
    summarizeNearbyBacktests(baseResult, [
      ...variantResults.slice(0, 3),
      makeResult(-0.01, -9, 5),
    ]).stable,
    false,
  );
  assert.equal(
    summarizeNearbyBacktests(baseResult, [
      ...variantResults.slice(0, 1),
      makeResult(10, -20.01, 6),
      ...variantResults.slice(2),
    ]).stable,
    false,
  );
});

test("marks only sub-75-percent sign agreement as sensitive", () => {
  const baseResult: BacktestResult = {
    strategyId: "sma-cross",
    parameters: { fast: 10, slow: 15 },
    totalReturn: 5,
    annualizedReturn: 5,
    benchmarkReturn: 0,
    maxDrawdown: -10,
    sharpe: 0,
    winRate: 0,
    profitFactor: 0,
    tradeCount: 4,
    finalEquity: 105_000,
    score: 0,
    equity: [],
    trades: [],
  };
  const variantResults = [
    { ...baseResult, totalReturn: 5, maxDrawdown: -11 },
    { ...baseResult, totalReturn: 4, maxDrawdown: -12 },
    { ...baseResult, totalReturn: 0, maxDrawdown: -9 },
    { ...baseResult, totalReturn: 0, maxDrawdown: -8 },
  ];

  const summary = summarizeNearbyBacktests(
    baseResult,
    variantResults,
  );

  assert.deepEqual(summary.signAgreement, {
    matchingVariants: 2,
    variantCount: 4,
    ratio: 0.5,
  });
  assert.deepEqual(summary.thresholdChecks, {
    signAgreement: false,
    returnRange: true,
    drawdownDeterioration: true,
  });
  assert.ok(
    summary.totalReturnRange.width <=
      STABILITY_THRESHOLDS.maximumReturnRange,
  );
  assert.ok(
    summary.drawdownDeterioration <=
      STABILITY_THRESHOLDS.maximumDrawdownDeterioration,
  );
  assert.equal(summary.stable, false);
});

test("runs current and nearby backtests without selecting replacement parameters", () => {
  const bars = makeBars(
    Array.from(
      { length: 140 },
      (_, index) => 80 + index * 0.12 + Math.sin(index / 4) * 5,
    ),
  );
  const baseParameters = { fast: 10, slow: 15 };
  const analysis = analyzeStrategyStability(
    bars,
    "sma-cross",
    baseParameters,
    {
      initialCash: 100_000,
      commissionRate: 0.0003,
      slippageRate: 0.0002,
      interval: "1d",
    },
  );
  const expectedParameterSets = buildNearbyParameterSets(
    "sma-cross",
    baseParameters,
  );
  assert.ok(analysis.baseResult);
  assert.ok(analysis.nearby);
  const allResults = [analysis.baseResult, ...analysis.variantResults];

  assert.deepEqual(analysis.baseResult.parameters, baseParameters);
  assert.deepEqual(
    analysis.variantResults.map((result) => result.parameters),
    expectedParameterSets.slice(1),
  );
  assert.equal(analysis.nearby.signAgreement.variantCount, 3);
  assert.equal(
    analysis.nearby.totalReturnRange.minimum,
    Math.min(...allResults.map((result) => result.totalReturn)),
  );
  assert.equal(
    analysis.nearby.totalReturnRange.maximum,
    Math.max(...allResults.map((result) => result.totalReturn)),
  );
  assert.equal(
    analysis.nearby.drawdownRange.minimum,
    Math.min(...allResults.map((result) => result.maxDrawdown)),
  );
  assert.equal(
    analysis.nearby.drawdownRange.maximum,
    Math.max(...allResults.map((result) => result.maxDrawdown)),
  );
  assert.ok(analysis.nearby.signAgreement.ratio >= 0);
  assert.ok(analysis.nearby.signAgreement.ratio <= 1);
  assert.equal(
    Object.prototype.hasOwnProperty.call(analysis, "selectedParameters"),
    false,
  );

  const shortAnalysis = analyzeStrategyStability(
    bars.slice(0, 30),
    "sma-cross",
    baseParameters,
    {
      initialCash: 100_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
    },
  );
  for (const regime of ["up", "sideways", "down"] as const) {
    assert.deepEqual(shortAnalysis.regimes[regime], {
      returnPercent: null,
      periodCount: 0,
    });
  }
});

test("reports invalid strategy parameters without running a base backtest", () => {
  const bars = makeBars(
    Array.from({ length: 140 }, (_, index) => 100 + index * 0.1),
  );
  const analysis = analyzeStrategyStability(
    bars,
    "sma-cross",
    { fast: 30, slow: 10 },
    {
      initialCash: 100_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
    },
  );

  assert.equal(analysis.baseResult, null);
  assert.deepEqual(analysis.variantResults, []);
  assert.equal(analysis.nearby, null);
  assert.equal(analysis.evidence.sufficient, false);
  assert.ok(analysis.evidence.reasons.includes("invalid-parameters"));
  assert.equal(analysis.evidence.observationCount, 140);
  assert.equal(analysis.evidence.minimumObservationCount, 120);
  assert.equal(analysis.evidence.tradeCount, 0);
  assert.equal(analysis.evidence.minimumTradeCount, 2);
});

test("requires 120 in-range observations and two completed base trades", () => {
  const alternatingBars = makeOhlcBars(
    Array.from({ length: 140 }, (_, index) => {
      if (index === 0) {
        return { open: 100, high: 101, low: 99, close: 100 };
      }
      if (index % 2 === 1) {
        return {
          open: 101,
          high: 103,
          low: 100,
          close: 102,
        };
      }
      return {
        open: 101,
        high: 102,
        low: 99,
        close: 100,
      };
    }),
  );
  const settings = {
    initialCash: 100_000,
    commissionRate: 0,
    slippageRate: 0,
    interval: "1d" as const,
  };

  assert.equal(MINIMUM_STABILITY_OBSERVATIONS, 120);
  assert.equal(MINIMUM_STABILITY_TRADES, 2);

  const short = analyzeStrategyStability(
    alternatingBars.slice(0, 119),
    "tv-bar-up-down",
    { minimumBodyPercent: 0 },
    settings,
  );
  assert.equal(short.evidence.observationCount, 119);
  assert.ok(short.evidence.reasons.includes("insufficient-observations"));
  assert.equal(short.evidence.sufficient, false);
  assert.equal(short.nearby?.stable, false);

  const noTrades = analyzeStrategyStability(
    makeBars(Array.from({ length: 120 }, () => 100)),
    "sma-cross",
    { fast: 10, slow: 30 },
    settings,
  );
  assert.equal(noTrades.evidence.tradeCount, 0);
  assert.ok(noTrades.evidence.reasons.includes("insufficient-trades"));
  assert.equal(noTrades.evidence.sufficient, false);
  assert.equal(noTrades.nearby?.stable, false);

  const oneTradeBars = makeOhlcBars(
    Array.from({ length: 120 }, (_, index) => {
      if (index === 1) {
        return { open: 101, high: 103, low: 100, close: 102 };
      }
      if (index === 2) {
        return { open: 101, high: 102, low: 99, close: 100 };
      }
      return { open: 100, high: 101, low: 99, close: 100 };
    }),
  );
  const oneTrade = analyzeStrategyStability(
    oneTradeBars,
    "tv-bar-up-down",
    { minimumBodyPercent: 0 },
    settings,
  );
  assert.equal(oneTrade.evidence.tradeCount, 1);
  assert.ok(oneTrade.evidence.reasons.includes("insufficient-trades"));
  assert.equal(oneTrade.evidence.sufficient, false);
  assert.equal(oneTrade.nearby?.stable, false);

  const sufficient = analyzeStrategyStability(
    alternatingBars,
    "tv-bar-up-down",
    { minimumBodyPercent: 0 },
    {
      ...settings,
      startTime: alternatingBars[20].time,
      endTime: alternatingBars[139].time,
    },
  );
  assert.equal(sufficient.evidence.observationCount, 120);
  assert.ok(sufficient.evidence.tradeCount >= 2);
  assert.deepEqual(sufficient.evidence.reasons, []);
  assert.equal(sufficient.evidence.sufficient, true);
  assert.ok(sufficient.baseResult);
  assert.ok(sufficient.nearby);
});

test("counts exact one-minute observations in stability ranges", () => {
  const bars = makeOhlcBars(
    Array.from({ length: 140 }, (_, index) => ({
      open: 100 + index * 0.01,
      high: 101 + index * 0.01,
      low: 99 + index * 0.01,
      close: 100.5 + index * 0.01,
    })),
  ).map((bar, index) => {
    const timestamp = Date.parse("2026-08-07T00:00:00.000Z") + index * 60_000;
    const date = new Date(timestamp);
    const hour = String(9 + Math.floor(index / 60)).padStart(2, "0");
    const minute = String(index % 60).padStart(2, "0");
    return {
      ...bar,
      time: `2026-08-07 ${hour}:${minute}`,
      timestamp: date.getTime(),
    };
  });

  const analysis = analyzeStrategyStability(
    bars,
    "sma-cross",
    { fast: 10, slow: 30 },
    {
      initialCash: 100_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1m",
      startTime: bars[20].time,
      endTime: bars[139].time,
    },
  );
  assert.equal(analysis.evidence.observationCount, 120);
  assert.ok(!analysis.evidence.reasons.includes("insufficient-observations"));
});

test("cancels a parameter optimization between chunks", async () => {
  const controller = new AbortController();
  const bars = makeBars(
    Array.from({ length: 80 }, (_, index) => 20 + index * 0.1),
  );
  const outcome = await optimizeStrategies(
    bars,
    {
      initialCash: 100_000,
      commissionRate: 0.0003,
      slippageRate: 0.0002,
      interval: "1d",
    },
    {
      signal: controller.signal,
      yieldEvery: 1,
      onProgress: ({ completed }) => {
        if (completed === 3) controller.abort();
      },
    },
  );

  assert.equal(outcome.cancelled, true);
  assert.equal(outcome.evaluatedCount, 3);
  assert.ok(outcome.evaluatedCount < outcome.totalCandidates);
});

test("filters weak candle signals with the minimum body parameter", () => {
  const bars = makeBars([10, 10.04, 10.08]);
  bars[0] = { ...bars[0], open: 9.9, high: 10.1, low: 9.8 };
  bars[1] = {
    ...bars[1],
    open: 10.01,
    close: 10.04,
    high: 10.05,
    low: 10,
  };

  const strategy = getStrategy("tv-bar-up-down");
  const unfiltered = strategy.buildTarget(bars, {
    minimumBodyPercent: 0,
  });
  const filtered = strategy.buildTarget(bars, {
    minimumBodyPercent: 0.5,
  });

  assert.equal(unfiltered[1], 1);
  assert.equal(filtered[1], 0);
});

test("validates saved backtests and rejects unsupported assets", () => {
  const payload = {
    instrument: {
      secid: "100.N225",
      code: "N225",
      name: "Nikkei 225",
      exchange: "JPX",
      assetType: "index",
      provider: "eastmoney",
    },
    interval: "1d",
    strategyId: "sma-cross",
    parameters: { fast: 10, slow: 30 },
    plan: {
      strategyA: {
        strategyId: "sma-cross",
        parameters: { fast: 10, slow: 30 },
      },
      strategyB: null,
      strategyAAllocation: 0.6,
      strategyBAllocation: 0,
    },
    indicators: [
      { id: "sma", parameters: { fast: 5, slow: 20 } },
      { id: "rsi", parameters: { period: 14 } },
    ],
    startDate: "2024-01-01",
    endDate: "2025-01-01",
    initialCash: 100_000,
    commissionPercent: 0.03,
    slippagePercent: 0.02,
    metrics: {
      totalReturn: 12.3,
      maxDrawdown: 8.1,
      sharpe: 1.2,
      tradeCount: 10,
      score: 42,
    },
  };

  const normalizedPayload = {
    ...payload,
    plan: {
      ...payload.plan,
      strategyAAllocation: 1,
      tacticalMode: "add-on-short-entry" as const,
    },
  };
  assert.deepEqual(parseSaveBacktestInput(payload), normalizedPayload);
  const filteredPayload = {
    ...payload,
    plan: {
      ...payload.plan,
      entryFilter: DEFAULT_MOVING_AVERAGE_SLOPE_FILTER,
    },
  };
  assert.deepEqual(
    parseSaveBacktestInput(filteredPayload)?.plan
      .strategyAEntryFilter,
    DEFAULT_MOVING_AVERAGE_SLOPE_FILTER,
  );
  assert.equal(
    parseSaveBacktestInput({
      ...filteredPayload,
      plan: {
        ...filteredPayload.plan,
        entryFilter: {
          ...DEFAULT_MOVING_AVERAGE_SLOPE_FILTER,
          period: 1,
        },
      },
    }),
    null,
  );
  assert.deepEqual(
    parseSaveBacktestInput({
      ...payload,
      instrument: {
        secid: "GC=F",
        code: "GC=F",
        name: "Gold Futures Proxy",
        exchange: "OTHER",
        assetType: "commodity",
        provider: "yahoo",
      },
    })?.instrument.assetType,
    "commodity",
  );
  const legacy = { ...payload } as Record<string, unknown>;
  delete legacy.plan;
  delete legacy.indicators;
  assert.deepEqual(parseSaveBacktestInput(legacy)?.plan, {
    strategyA: {
      strategyId: "sma-cross",
      parameters: { fast: 10, slow: 30 },
    },
    strategyB: null,
    strategyAAllocation: 1,
    strategyBAllocation: 0,
  });
  assert.deepEqual(parseSaveBacktestInput(legacy)?.indicators, []);
  const yahooResolvedEtfName =
    "E Fund Management Co., Ltd - CSI Semiconductor Material and Equipment Thematic ETF";
  const yahooResolvedEtf = parseSaveBacktestInput({
    ...payload,
    instrument: {
      secid: "159558.SZ",
      code: "159558.SZ",
      name: yahooResolvedEtfName,
      exchange: "SZSE",
      assetType: "etf",
      provider: "yahoo",
    },
    strategyId: "kdj-reversal",
    parameters: { period: 9, entry: 35, exit: 65 },
    plan: {
      strategyA: {
        strategyId: "kdj-reversal",
        parameters: { period: 9, entry: 35, exit: 65 },
      },
      strategyB: {
        strategyId: "tv-volty-expan-close",
        parameters: { period: 5, multiplier: 1.5 },
      },
      strategyAAllocation: 0.4,
      strategyBAllocation: 0.6,
    },
  });
  assert.equal(yahooResolvedEtf?.instrument.code, "159558.SZ");
  assert.equal(yahooResolvedEtf?.instrument.name, yahooResolvedEtfName);
  assert.equal(yahooResolvedEtf?.plan.strategyAAllocation, 0.4);
  assert.equal(yahooResolvedEtf?.plan.strategyBAllocation, 0.6);
  assert.equal(
    parseSaveBacktestInput({
      ...payload,
      instrument: { ...payload.instrument, name: "x".repeat(257) },
    }),
    null,
  );
  assert.deepEqual(
    parseSaveBacktestInput({
      ...payload,
      plan: {
        long: payload.plan.strategyA,
        short: null,
        coreAllocation: 0.6,
        maximumAllocation: 1,
      },
    })?.plan,
    normalizedPayload.plan,
  );
  assert.deepEqual(
    parseSaveBacktestInput({
      ...payload,
      plan: {
        long: payload.plan.strategyA,
        short: {
          strategyId: "tv-bar-up-down",
          parameters: { minimumBodyPercent: 0 },
        },
        longAllocation: 0.6,
        shortAllocation: 0.4,
      },
    })?.plan,
    {
      strategyA: payload.plan.strategyA,
      strategyB: {
        strategyId: "tv-bar-up-down",
        parameters: { minimumBodyPercent: 0 },
      },
      strategyAAllocation: 0.6,
      strategyBAllocation: 0.4,
      tacticalMode: "add-on-short-entry",
    },
  );
  assert.equal(
    parseSaveBacktestInput({
      ...payload,
      instrument: { ...payload.instrument, assetType: "equity" },
    }),
    null,
  );
  assert.equal(
    parseSaveBacktestInput({
      ...payload,
      plan: {
        ...payload.plan,
        strategyB: payload.plan.strategyA,
        strategyBAllocation: 0.4,
      },
    }),
    null,
  );
  assert.equal(
    parseSaveBacktestInput({
      ...payload,
      indicators: [
        { id: "sma", parameters: { fast: 0, slow: 30 } },
      ],
    }),
    null,
  );
  assert.equal(
    parseSaveBacktestInput({
      ...payload,
      parameters: { fast: Number.NaN, slow: 30 },
    }),
    null,
  );
  assert.equal(
    parseSaveBacktestInput({
      ...payload,
      plan: {
        ...payload.plan,
        strategyAAllocation: 1.2,
      },
    }),
    null,
  );
});

test("replaces a saved setup when only visible indicators change", () => {
  const baseInput = parseSaveBacktestInput({
    instrument: {
      secid: "100.N225",
      code: "N225",
      name: "Nikkei 225",
      exchange: "JPX",
      assetType: "index",
      provider: "eastmoney",
    },
    interval: "1d",
    strategyId: "tv-channel-breakout",
    parameters: { length: 4, tick: 0.01 },
    plan: {
      strategyA: {
        strategyId: "tv-channel-breakout",
        parameters: { length: 4, tick: 0.01 },
      },
      strategyB: null,
      strategyAAllocation: 1,
      strategyBAllocation: 0,
      strategyAEntryFilter: {
        movingAverageType: "ema",
        period: 8,
        minimumSlopePercent: 0,
      },
    },
    indicators: [],
    startDate: "2026-01-19",
    endDate: "2026-07-27",
    initialCash: 100_000,
    commissionPercent: 0.03,
    slippagePercent: 0.02,
    metrics: {
      totalReturn: 30.51,
      maxDrawdown: -5.64,
      sharpe: 2.64,
      tradeCount: 6,
      score: 32.31,
    },
  });
  assert.ok(baseInput);
  const existing: SavedBacktestRecord = {
    ...baseInput,
    id: 7,
    rollingTotalReturn: null,
    createdAt: "2026-07-20 00:00:00",
    updatedAt: "2026-07-20 00:00:00",
  };
  assert.equal(
    shouldReplaceSavedBacktest(existing, {
      ...baseInput,
      indicators: [
        { id: "ema", parameters: { period: 8 } },
      ],
    }),
    true,
  );
  assert.equal(
    shouldReplaceSavedBacktest(existing, {
      ...baseInput,
      startDate: "2026-01-21",
      endDate: "2026-07-29",
    }),
    true,
  );
  assert.equal(
    shouldReplaceSavedBacktest(existing, {
      ...baseInput,
      plan: {
        ...baseInput.plan,
        strategyA: {
          strategyId: "tv-channel-breakout",
          parameters: { length: 5, tick: 0.01 },
        },
      },
    }),
    false,
  );
});

test("prefers the current 128-session shortcut return and retains a durable fallback", () => {
  const savedMetrics = {
    totalReturn: 30.51,
    maxDrawdown: -5.64,
    sharpe: 2.64,
    tradeCount: 6,
    score: 32.31,
  };

  assert.deepEqual(
    resolveSavedBacktestReturnDisplay(undefined, savedMetrics),
    {
      totalReturn: 30.51,
      range: "saved",
    },
  );
  assert.deepEqual(
    resolveSavedBacktestReturnDisplay(undefined, savedMetrics, 18.75),
    {
      totalReturn: 18.75,
      range: "rolling",
    },
  );
  assert.deepEqual(
    resolveSavedBacktestReturnDisplay(
      { totalReturn: 14.02 },
      savedMetrics,
    ),
    {
      totalReturn: 14.02,
      range: "current",
    },
  );
});

test("validates bounded shortcut rolling updates", () => {
  assert.equal(SAVED_BACKTEST_ROLLING_SESSIONS, 128);
  const rollingUpdate = {
    instrumentKey: "index:N225",
    marketFingerprint: "a".repeat(64),
    evaluations: [
      { id: 7, totalReturn: 12.5 },
      { id: 8, totalReturn: -3.25 },
    ],
  };
  assert.deepEqual(
    parseSavedBacktestRollingUpdateInput(rollingUpdate),
    rollingUpdate,
  );
  assert.equal(
    parseSavedBacktestRollingUpdateInput({
      ...rollingUpdate,
      evaluations: [rollingUpdate.evaluations[0], rollingUpdate.evaluations[0]],
    }),
    null,
  );
  assert.equal(
    parseSavedBacktestRollingUpdateInput({
      ...rollingUpdate,
      marketFingerprint: "not-a-fingerprint",
    }),
    null,
  );
  assert.equal(
    savedBacktestEvaluationsCoverIds([7, 8], rollingUpdate.evaluations),
    true,
  );
  assert.equal(
    savedBacktestEvaluationsCoverIds([7, 8, 9], rollingUpdate.evaluations),
    false,
  );
  assert.equal(
    savedBacktestEvaluationsCoverIds([7, 8], [
      rollingUpdate.evaluations[0],
      rollingUpdate.evaluations[0],
    ]),
    false,
  );
});

test("fingerprints and compares compact screening run archives", async () => {
  assert.equal(MAX_SCREENING_RUN_HISTORY, 6);
  const bars = makeBars([10, 11, 12, 11, 13]);
  const series = {
    instrument: {
      secid: "100.N225",
      code: "N225",
      name: "Nikkei 225",
      exchange: "JPX" as const,
      assetType: "index" as const,
      provider: "eastmoney" as const,
    },
    interval: "1d" as const,
    priceAdjustment: "corporate-action-adjusted" as const,
    previousClose: 9,
    bars,
    latestBarStatus: "complete" as const,
    source: "eastmoney" as const,
    fetchedAt: "2026-07-27T08:00:00.000Z",
  };
  const result = runBacktest(
    bars,
    "sma-cross",
    { fast: 2, slow: 3 },
    {
      initialCash: 100_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
    },
  );
  const fingerprint = await fingerprintMarketSeries(series);
  assert.match(fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(await fingerprintMarketSeries(series), fingerprint);
  const validationConfig = {
    mode: "range" as const,
    range: {
      startTime: bars[0].time.slice(0, 10),
      endTime: bars.at(-1)!.time.slice(0, 10),
    },
  };
  const input = createSaveScreeningRunInput(
    series,
    validationConfig,
    "balanced",
    {
      initialCash: 100_000,
      commissionPercent: 0,
      slippagePercent: 0,
    },
    {
      singleResults: [result],
      results: [],
      evaluatedCount: 1,
      totalCandidates: 1,
      failedCount: 0,
      cancelled: false,
      validationReport: {
        mode: "range",
        range: validationConfig.range,
        selected: {
          kind: "single",
          strategyAId: result.strategyId,
          strategyBId: null,
        },
        performance: result,
      },
    },
    fingerprint,
    {
      instrumentKey: "index:N225",
      provider: "tencent",
      time: bars.at(-1)!.time.slice(0, 10),
      price: bars.at(-1)!.close,
      bar: bars.at(-1)!,
      previousClose: bars.at(-2)!.close,
      latestBarStatus: "in-progress",
      fetchedAt: "2026-07-27T08:01:00.000Z",
    },
  );
  const parsed = parseSaveScreeningRunInput(input);
  assert.equal(parsed?.temporaryQuote?.provider, "tencent");
  assert.equal(parsed?.temporaryQuote?.time, input.lastBarDate);
  assert.equal(
    parseSaveScreeningRunInput({
      ...input,
      instrumentKey: "index:fake",
    }),
    null,
  );
  assert.equal(
    parseSaveScreeningRunInput({
      ...input,
      selectedCandidateKey: "single:fake",
    }),
    null,
  );
  assert.equal(
    parseSaveScreeningRunInput({
      ...input,
      temporaryQuote: {
        ...input.temporaryQuote,
        provider: "unknown-provider",
      },
    }),
    null,
  );
  assert.equal(input.candidates.length, 1);
  assert.equal(
    screeningRunCandidateKeyForPlan({
      strategyA: {
        strategyId: result.strategyId,
        parameters: result.parameters,
      },
      strategyB: null,
      strategyAAllocation: 1,
      strategyBAllocation: 0,
    }),
    input.candidates[0].key,
  );
  assert.deepEqual(parseScreeningRunCandidates(input.candidates), input.candidates);
  assert.equal(
    parseScreeningRunCandidates([
      {
        ...input.candidates[0],
        rank: 0,
      },
    ]),
    null,
  );
  const combinationCandidate = {
    ...input.candidates[0],
    rank: 1,
    key: "combination:test",
    kind: "combination" as const,
    strategyBId: "ema-cross" as const,
    strategyBParameters: { fast: 2, slow: 4 },
    strategyCId: "rsi-reversal" as const,
    strategyCParameters: getStrategy("rsi-reversal").defaultParameters,
    strategyDId: "macd-momentum" as const,
    strategyDParameters: getStrategy("macd-momentum").defaultParameters,
    strategyDEntryFilter: null,
    strategyEId: "donchian-breakout" as const,
    strategyEParameters: getStrategy("donchian-breakout").defaultParameters,
    strategyEEntryFilter: null,
    strategyFId: "bollinger-reversion" as const,
    strategyFParameters: getStrategy("bollinger-reversion").defaultParameters,
    strategyFEntryFilter: null,
    strategyGId: "kdj-reversal" as const,
    strategyGParameters: getStrategy("kdj-reversal").defaultParameters,
    strategyGEntryFilter: null,
    strategyHId: "ichimoku-trend" as const,
    strategyHParameters: getStrategy("ichimoku-trend").defaultParameters,
    strategyHEntryFilter: null,
    strategyIId: "roc-momentum" as const,
    strategyIParameters: getStrategy("roc-momentum").defaultParameters,
    strategyIEntryFilter: null,
    strategyAAllocation: 0.2,
    strategyBAllocation: 0.1,
    strategyCAllocation: 0.1,
    strategyDAllocation: 0.1,
    strategyEAllocation: 0.1,
    strategyFAllocation: 0.1,
    strategyGAllocation: 0.1,
    strategyHAllocation: 0.1,
    strategyIAllocation: 0.1,
    relativeLongStrategy: "strategyI" as const,
  };
  const nativeCandidates = [input.candidates[0], combinationCandidate];
  assert.deepEqual(
    parseScreeningRunCandidates(nativeCandidates),
    nativeCandidates,
  );
  assert.ok(
    parseSaveScreeningRunInput({
      ...input,
      candidates: nativeCandidates,
      selectedCandidateKey: combinationCandidate.key,
    }),
  );
  assert.deepEqual(
    [...screeningRunCandidateRankByKey(nativeCandidates).values()],
    [1, 1],
  );
  assert.deepEqual(
    [
      ...screeningRunCandidateRankByKey([
        input.candidates[0],
        { ...combinationCandidate, rank: 2 },
      ]).values(),
    ],
    [1, 1],
  );
  assert.equal(
    JSON.stringify(input.validationReport).includes("equity"),
    false,
  );
  const previous = {
    id: 1,
    ...input,
    createdAt: "2026-07-20 00:00:00",
  };
  const current = {
    id: 2,
    ...input,
    candidates: input.candidates.map((candidate) => ({
      ...candidate,
      metrics: {
        ...candidate.metrics,
        totalReturn: candidate.metrics.totalReturn + 2,
      },
    })),
    createdAt: "2026-07-27 00:00:00",
  };
  const comparison = compareScreeningRuns(current, previous);
  assert.equal(comparison?.winnerChanged, false);
  assert.equal(comparison?.topTenOverlap, 1);
  assert.equal(comparison?.totalReturnDelta, 2);
});

test("matches saved strategy plans by selections, parameters, and allocations", () => {
  const strategyA = {
    strategyId: "sma-cross" as const,
    parameters: { fast: 10, slow: 30 },
  };
  const base = {
    strategyA,
    strategyB: null,
    strategyAAllocation: 1,
    strategyBAllocation: 0,
  };

  assert.equal(
    strategyPlansEqual(base, {
      ...base,
      strategyA: {
        ...strategyA,
        parameters: { slow: 30, fast: 10 },
      },
    }),
    true,
  );
  assert.equal(
    strategyPlansEqual(base, {
      ...base,
      strategyA: {
        ...strategyA,
        parameters: { fast: 12, slow: 30 },
      },
    }),
    false,
  );
  assert.equal(
    strategyPlansEqual(
      {
        ...base,
        entryFilter: DEFAULT_MOVING_AVERAGE_SLOPE_FILTER,
      },
      {
        ...base,
        entryFilter: {
          ...DEFAULT_MOVING_AVERAGE_SLOPE_FILTER,
          minimumSlopePercent: 0.1,
        },
      },
    ),
    false,
  );
  assert.equal(
    strategyPlansEqual(
      {
        ...base,
        strategyB: {
          strategyId: "ema-cross" as const,
          parameters: { fast: 8, slow: 24 },
        },
        strategyAAllocation: 0.6,
        strategyBAllocation: 0.4,
        tacticalMode: "add-on-short-entry",
      },
      {
        ...base,
        strategyB: {
          strategyId: "ema-cross" as const,
          parameters: { fast: 8, slow: 24 },
        },
        strategyAAllocation: 0.6,
        strategyBAllocation: 0.4,
        tacticalMode: "reduce-on-short-exit",
      },
    ),
    false,
  );
});

test("describes exact and same-type shortcut matches", () => {
  const instrument = {
    code: "N225",
    symbol: "^N225",
    secid: "100.N225",
    name: "Nikkei 225",
    exchange: "JPX" as const,
    assetType: "index" as const,
    provider: "yahoo" as const,
  };
  const scope = { instrument, interval: "1d" as const };
  const savedPlan = {
    strategyA: {
      strategyId: "sma-cross" as const,
      parameters: { fast: 10, slow: 30 },
    },
    strategyB: null,
    strategyAAllocation: 1,
    strategyBAllocation: 0,
  };
  const saved = {
    id: 91,
    instrument,
    interval: "1d",
    plan: savedPlan,
  } as unknown as SavedBacktestRecord;
  const otherInstrument = {
    ...saved,
    id: 92,
    instrument: {
      code: "GC=F",
      symbol: "GC=F",
      secid: "GC=F",
      name: "Gold Futures",
      exchange: "COMEX" as const,
      assetType: "commodity" as const,
      provider: "yahoo" as const,
    },
  };
  const otherInterval = {
    ...saved,
    id: 93,
    interval: "1m" as const,
  };

  assert.deepEqual(
    findStrategyShortcutMatch(
      savedPlan,
      [otherInstrument, otherInterval, saved],
      scope,
    ),
    {
    kind: "exact",
    savedBacktestId: 91,
    sharedStrategyIds: ["sma-cross"],
    parameterDifferences: [],
    allocationDifferent: false,
    entryFilterDifferent: false,
    tacticalModeDifferent: false,
    },
  );

  assert.equal(
    findStrategyShortcutMatch(savedPlan, [otherInstrument, otherInterval], scope),
    null,
  );

  const sameType = findStrategyShortcutMatch(
    {
      ...savedPlan,
      strategyA: {
        strategyId: "sma-cross",
        parameters: { fast: 12, slow: 30 },
      },
    },
    [saved],
    scope,
  );
  assert.equal(sameType?.kind, "same-type");
  assert.deepEqual(sameType?.parameterDifferences, [
    {
      strategyId: "sma-cross",
      key: "fast",
      savedValue: 10,
      candidateValue: 12,
    },
  ]);
  assert.equal(
    findStrategyShortcutMatch(
      {
        ...savedPlan,
        strategyA: {
          strategyId: "ema-cross",
          parameters: { fast: 12, slow: 26 },
        },
      },
      [saved],
      scope,
    ),
    null,
  );

  const savedCombination = {
    ...saved,
    id: 94,
    plan: {
      ...savedPlan,
      strategyAAllocation: 0.6,
      strategyB: {
        strategyId: "rsi-reversal" as const,
        parameters: { period: 14, entry: 30, exit: 65 },
      },
      strategyBAllocation: 0.4,
    },
  } as SavedBacktestRecord;
  assert.equal(
    findStrategyShortcutMatch(savedPlan, [savedCombination], scope),
    null,
  );
  const candidateCombination = {
    ...savedCombination.plan,
    strategyB: {
      strategyId: "macd-momentum" as const,
      parameters: { fast: 12, slow: 26, signal: 9 },
    },
  };

  assert.equal(
    findStrategyShortcutMatch(candidateCombination, [savedCombination], scope),
    null,
  );

  const matchingCombination = {
    ...candidateCombination,
    strategyB: {
      strategyId: "rsi-reversal" as const,
      parameters: { period: 10, entry: 25, exit: 70 },
    },
  };
  assert.deepEqual(
    findStrategyShortcutMatch(matchingCombination, [savedCombination], scope)
      ?.sharedStrategyIds,
    ["sma-cross", "rsi-reversal"],
  );
});

test("parses and compares backward-compatible three-strategy plans", () => {
  const strategyIds = ["sma-cross", "rsi-reversal", "macd-momentum"] as const;
  const parsed = parseStrategyAllocationPlan({
    strategyA: {
      strategyId: strategyIds[0],
      parameters: getStrategy(strategyIds[0]).defaultParameters,
    },
    strategyB: {
      strategyId: strategyIds[1],
      parameters: getStrategy(strategyIds[1]).defaultParameters,
    },
    strategyC: {
      strategyId: strategyIds[2],
      parameters: getStrategy(strategyIds[2]).defaultParameters,
    },
    strategyAAllocation: 0.4,
    strategyBAllocation: 0.3,
    strategyCAllocation: 0.3,
    tacticalMode: "add-on-short-entry",
  });
  assert.ok(parsed);
  assert.equal(parsed.strategyC?.strategyId, "macd-momentum");
  assert.equal(parsed.strategyCAllocation, 0.3);
  assert.equal(strategyPlansEqual(parsed, { ...parsed }), true);
  assert.equal(
    parseStrategyAllocationPlan({
      ...parsed,
      strategyC: parsed.strategyA,
    }),
    null,
  );
  const fiveStrategyPlan = parseStrategyAllocationPlan({
    ...parsed,
    strategyAAllocation: 0.4,
    strategyBAllocation: 0.2,
    strategyCAllocation: 0.2,
    strategyD: {
      strategyId: "donchian-breakout",
      parameters: getStrategy("donchian-breakout").defaultParameters,
    },
    strategyDAllocation: 0.1,
    strategyE: {
      strategyId: "bollinger-reversion",
      parameters: getStrategy("bollinger-reversion").defaultParameters,
    },
    strategyEAllocation: 0.1,
  });
  assert.ok(fiveStrategyPlan);
  assert.equal(fiveStrategyPlan.strategyD?.strategyId, "donchian-breakout");
  assert.equal(fiveStrategyPlan.strategyE?.strategyId, "bollinger-reversion");
  assert.equal(strategyPlansEqual(fiveStrategyPlan, { ...fiveStrategyPlan }), true);
  const nineStrategyPlan = parseStrategyAllocationPlan({
    ...fiveStrategyPlan,
    strategyAAllocation: 0.2,
    strategyBAllocation: 0.1,
    strategyCAllocation: 0.1,
    strategyDAllocation: 0.1,
    strategyEAllocation: 0.1,
    strategyF: {
      strategyId: "kdj-reversal",
      parameters: getStrategy("kdj-reversal").defaultParameters,
    },
    strategyFAllocation: 0.1,
    strategyG: {
      strategyId: "ichimoku-trend",
      parameters: getStrategy("ichimoku-trend").defaultParameters,
    },
    strategyGAllocation: 0.1,
    strategyH: {
      strategyId: "roc-momentum",
      parameters: getStrategy("roc-momentum").defaultParameters,
    },
    strategyHAllocation: 0.1,
    strategyI: {
      strategyId: "tv-bar-up-down",
      parameters: getStrategy("tv-bar-up-down").defaultParameters,
    },
    strategyIAllocation: 0.1,
  });
  assert.ok(nineStrategyPlan);
  assert.equal(nineStrategyPlan.strategyI?.strategyId, "tv-bar-up-down");
  assert.equal(strategyPlansEqual(nineStrategyPlan, { ...nineStrategyPlan }), true);
});

test("forms a weighted consensus buy point from independent live targets", () => {
  const advice = buildStrategyConsensusAdvice([
    {
      key: "single",
      strategyIds: ["sma-cross"],
      previousAllocation: 0,
      targetAllocation: 1,
      weight: 3,
    },
    {
      key: "pair",
      strategyIds: ["rsi-reversal", "macd-momentum"],
      previousAllocation: 0,
      targetAllocation: 0.8,
      weight: 2,
    },
    {
      key: "triple",
      strategyIds: ["donchian-breakout", "bollinger-reversion", "sma-cross"],
      previousAllocation: 0.1,
      targetAllocation: 0.7,
      weight: 1,
    },
  ]);
  assert.equal(advice?.action, "buy");
  assert.equal(advice?.confidence, "high");
  assert.equal(advice?.targetAllocation, 0.9);
  assert.equal(advice?.evidenceCount, 3);
});

test("reports material intraday data delay without flagging normal bar latency", () => {
  const fetchedAt = new Date("2026-08-14T01:55:00.000Z");
  assert.equal(
    estimateIntradayDataDelayMinutes(
      Date.parse("2026-08-14T01:40:00.000Z"),
      fetchedAt,
    ),
    15,
  );
  assert.equal(
    estimateIntradayDataDelayMinutes(
      Date.parse("2026-08-14T01:53:00.000Z"),
      fetchedAt,
    ),
    null,
  );
  assert.equal(estimateIntradayDataDelayMinutes(Number.NaN, fetchedAt), null);
});

test("selects the best shortcut batch result across singles and combinations", () => {
  const single = {
    strategyId: "sma-cross",
    parameters: {},
    totalReturn: 12,
    maxDrawdown: -5,
    sharpe: 1.1,
    tradeCount: 4,
    score: 14,
  } as never;
  const combination = {
    strategyAId: "sma-cross",
    strategyBId: "rsi-reversal",
    totalReturn: 15,
    maxDrawdown: -4,
    sharpe: 1.4,
    tradeCount: 5,
    score: 18,
  } as never;

  const best = selectBestShortcutScreeningResult(
    [single],
    [combination],
    "balanced",
  );

  assert.equal(best?.kind, "combination");
  assert.equal(best?.result.score, 18);
  const compact = compactCycleScreeningOutcome({
    singleResults: [single],
    results: [combination, { score: 1 } as never],
    evaluatedCount: 3,
  }, "balanced");
  assert.equal(compact.singleResults.length, 0);
  assert.deepEqual(compact.results, [combination]);
  assert.equal(compact.evaluatedCount, 3);
});

test("resumes shortcut batch screening only for an identical bounded config", () => {
  const signature = createShortcutBatchConfigSignature({
    sessions: 128,
    objective: "balanced",
    initialCash: 100_000,
    commissionPercent: 0.05,
    slippagePercent: 0.02,
    entryFilterEnabled: false,
  });
  const checkpoint = parseShortcutBatchCheckpoint(
    JSON.stringify({
      version: 2,
      resumeReason: "failure",
      runId: "batch-run-1",
      configSignature: signature,
      sessions: 128,
      completedInstrumentKeys: ["index:N225"],
      failedInstrumentKeys: ["index:HSI"],
      updatedAt: "2026-09-16T00:00:00.000Z",
      lastError: "UPSTREAM_UNAVAILABLE",
    }),
  );

  assert.ok(checkpoint);
  assert.deepEqual(
    pendingShortcutBatchInstrumentKeys(
      ["index:N225", "index:HSI", "index:000300"],
      checkpoint,
      signature,
    ),
    ["index:HSI", "index:000300"],
  );
  assert.deepEqual(
    pendingShortcutBatchInstrumentKeys(
      ["index:N225", "index:HSI"],
      checkpoint,
      `${signature}:changed`,
    ),
    ["index:N225", "index:HSI"],
  );
  assert.equal(parseShortcutBatchCheckpoint("{}"), null);
  assert.equal(
    parseShortcutBatchCheckpoint(JSON.stringify({
      ...checkpoint,
      version: 1,
    })),
    null,
  );
  assert.equal(
    parseShortcutBatchCheckpoint(JSON.stringify({
      ...checkpoint,
      lastError: null,
    })),
    null,
  );
});
