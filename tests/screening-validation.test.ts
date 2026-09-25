import assert from "node:assert/strict";
import test from "node:test";
import { runBacktest } from "../lib/analysis/backtest";
import {
  buildScreeningCandidates,
  compareScreeningResults,
} from "../lib/analysis/screening";
import { runStrategyCombinationBacktest } from "../lib/analysis/strategy-combinations";
import {
  DEFAULT_MOVING_AVERAGE_SLOPE_FILTER,
  SCREENING_MOVING_AVERAGE_SLOPE_PERIODS,
  buildScreeningMovingAverageSlopeFilters,
  supportsScreeningMovingAverageSlopeFilter,
} from "../lib/analysis/entry-filter";
import {
  DEFAULT_ROLLING_WINDOW_YEARS,
  DEFAULT_SAMPLE_VALIDATION_PERIODS,
  ScreeningValidationError,
  buildRollingValidationFolds,
  buildSampleValidationWindows,
  resolveScreeningProgressBarState,
  resolveTradingSessionRange,
  resolveTrailingTradingSessionRange,
  runScreeningWithValidation,
  validateMultiRangeWindows,
} from "../lib/analysis/screening-validation";
import type { MarketBar } from "../lib/market/types";
import {
  encompassingScreeningWindow,
  resolveScreeningResultChartWindows,
} from "../lib/analysis/screening-chart";
import type {
  ScreeningMultiRangeValidationReport,
  ScreeningSingleResult,
} from "../lib/analysis/screening-validation";

const completedOptimizationProgress = {
  completed: 39_927,
  total: 39_927,
  stageCompleted: 2_236,
  stageTotal: 2_236,
  failed: 0,
  stage: "sextupleAllocations" as const,
  strategyAId: null,
  strategyBId: null,
};

test("maps screening results to their exact chart windows", () => {
  const latestRange = {
    startTime: "2025-01-01",
    endTime: "2025-06-30",
  };
  const ranges = [
    { startTime: "2022-01-01", endTime: "2022-12-31" },
    latestRange,
  ];
  const result = {
    screeningValidation: {
      mode: "multi-range",
      rankingWindow: latestRange,
      evaluationWindow: latestRange,
    },
  } as ScreeningSingleResult;
  const report = {
    mode: "multi-range",
    ranges,
  } as ScreeningMultiRangeValidationReport;

  const resolved = resolveScreeningResultChartWindows(result, report);
  assert.deepEqual(resolved, ranges);
  assert.deepEqual(encompassingScreeningWindow(resolved), {
    startTime: "2022-01-01",
    endTime: "2025-06-30",
  });
});

test("fills period and range progress when their twelve-stage optimization completes", () => {
  for (const mode of ["sample", "range"] as const) {
    const progress = resolveScreeningProgressBarState(
      completedOptimizationProgress,
      {
        mode,
        phase: "optimization",
        foldIndex: 0,
        foldCount: 1,
        completed: completedOptimizationProgress.completed,
        total: completedOptimizationProgress.total,
        window: {
          startTime: "2026-01-01",
          endTime: "2026-07-27",
        },
        optimizationProgress: completedOptimizationProgress,
      },
    );

    assert.equal(progress.value, progress.maximum);
    assert.equal(progress.maximum, 12);
  }
});

test("adds one progress segment per rolling selection window", () => {
  const optimization = resolveScreeningProgressBarState(
    completedOptimizationProgress,
    {
      mode: "rolling",
      phase: "optimization",
      foldIndex: 0,
      foldCount: 3,
      completed: completedOptimizationProgress.completed,
      total: completedOptimizationProgress.total,
      window: {
        startTime: "2022-01-01",
        endTime: "2026-07-27",
      },
      optimizationProgress: completedOptimizationProgress,
    },
  );
  const middleWindow = resolveScreeningProgressBarState(
    completedOptimizationProgress,
    {
      mode: "rolling",
      phase: "selection",
      foldIndex: 1,
      foldCount: 3,
      completed: 50,
      total: 100,
      window: {
        startTime: "2023-01-01",
        endTime: "2023-12-31",
      },
    },
  );
  const completed = resolveScreeningProgressBarState(
    completedOptimizationProgress,
    {
      mode: "rolling",
      phase: "selection",
      foldIndex: 2,
      foldCount: 3,
      completed: 100,
      total: 100,
      window: {
        startTime: "2024-01-01",
        endTime: "2024-12-31",
      },
    },
  );

  assert.deepEqual(optimization, { value: 12, maximum: 15 });
  assert.deepEqual(middleWindow, { value: 13.5, maximum: 15 });
  assert.deepEqual(completed, { value: 15, maximum: 15 });
});

function firstScreeningCandidatePerStrategy() {
  const seen = new Set<string>();
  return buildScreeningCandidates().filter((candidate) => {
    if (seen.has(candidate.strategyId)) return false;
    seen.add(candidate.strategyId);
    return true;
  });
}

function createMonthlyBars(
  startYear: number,
  endYear: number,
  finalMonth = 12,
): MarketBar[] {
  const bars: MarketBar[] = [];
  let previousClose = 100;
  for (let year = startYear; year <= endYear; year += 1) {
    const monthLimit = year === endYear ? finalMonth : 12;
    for (let month = 1; month <= monthLimit; month += 1) {
      const time = `${year}-${String(month).padStart(2, "0")}-01`;
      const change = Math.sin(bars.length / 4) * 2 + 0.35;
      const open = previousClose;
      const close = Math.max(open + change, 1);
      bars.push({
        time,
        timestamp: Date.parse(`${time}T00:00:00Z`),
        open,
        close,
        high: Math.max(open, close) + 1,
        low: Math.min(open, close) - 1,
        volume: 1_000 + bars.length,
        amount: close * (1_000 + bars.length),
        amplitude: 2,
        changePercent: (change / open) * 100,
        change,
        turnoverRate: 1,
      });
      previousClose = close;
    }
  }
  return bars;
}

test("builds fixed-width annual rolling folds with a labelled partial year", () => {
  const bars = createMonthlyBars(2000, 2012, 6);
  const folds = buildRollingValidationFolds(
    bars,
    {
      startTime: "2000-01-01",
      endTime: "2012-06-01",
    },
    9,
  );

  assert.equal(DEFAULT_ROLLING_WINDOW_YEARS, 1);
  assert.equal(folds.length, 5);
  assert.deepEqual(folds[0], {
    window: {
      startTime: "2000-01-01",
      endTime: "2008-12-01",
    },
    partial: false,
  });
  assert.deepEqual(folds.at(-1), {
    window: {
      startTime: "2004-01-01",
      endTime: "2012-06-01",
    },
    partial: true,
  });
});

test("builds one 128-session sample window without a separate training period", () => {
  const bars = createMonthlyBars(2000, 2025);
  const selectedBars = bars.slice(-128);
  const windows = buildSampleValidationWindows(
    bars,
    {
      startTime: selectedBars[0].time,
      endTime: "2025-12-31",
    },
    DEFAULT_SAMPLE_VALIDATION_PERIODS,
  );

  assert.deepEqual(
    windows.periods.map(({ sessions, weight }) => ({
      sessions,
      weight,
    })),
    [{ sessions: 128, weight: 1 }],
  );
  assert.equal(windows.window.startTime, selectedBars[0].time);
  assert.equal(windows.window.endTime, "2025-12-01");
  assert.equal(
    windows.periods[0].evaluation.startTime,
    selectedBars[0].time,
  );
  assert.equal(
    windows.periods[0].evaluation.endTime,
    "2025-12-01",
  );
});

test("keeps calendar ranges and trailing session counts synchronized", () => {
  const bars = createMonthlyBars(2024, 2025);

  assert.deepEqual(
    resolveTradingSessionRange(
      bars,
      "2024-03-15",
      "2024-08-20",
    ),
    {
      startTime: "2024-04-01",
      endTime: "2024-08-01",
      sessions: 5,
    },
  );
  assert.deepEqual(
    resolveTrailingTradingSessionRange(
      bars,
      6,
      "2025-06-20",
    ),
    {
      startTime: "2025-01-01",
      endTime: "2025-06-01",
      sessions: 6,
    },
  );
  assert.deepEqual(
    resolveTrailingTradingSessionRange(bars, 128),
    {
      startTime: "2024-01-01",
      endTime: "2025-12-01",
      sessions: bars.length,
    },
  );
});

test("validates multiple explicit non-overlapping backtest ranges", () => {
  const bars = createMonthlyBars(2020, 2025);
  const ranges = [
    { startTime: "2021-01-01", endTime: "2021-12-31" },
    { startTime: "2024-01-01", endTime: "2024-12-31" },
  ];
  assert.deepEqual(
    validateMultiRangeWindows(bars, { mode: "multi-range", ranges }),
    [
      { startTime: "2021-01-01", endTime: "2021-12-01" },
      { startTime: "2024-01-01", endTime: "2024-12-01" },
    ],
  );
  assert.throws(
    () =>
      validateMultiRangeWindows(bars, {
        mode: "multi-range",
        ranges: [
          { startTime: "2021-01-01", endTime: "2022-06-01" },
          { startTime: "2022-01-01", endTime: "2023-01-01" },
        ],
      }),
    (error) =>
      error instanceof ScreeningValidationError &&
      error.code === "invalid-multi-range",
  );
});

test("multi-range screening evaluates and equally ranks every selected interval", async () => {
  const bars = createMonthlyBars(2000, 2008);
  const candidates = buildScreeningCandidates().filter(
    (candidate) =>
      (candidate.strategyId === "sma-cross" &&
        candidate.parameters.fast === 10 &&
        candidate.parameters.slow === 30) ||
      (candidate.strategyId === "rsi-reversal" &&
        candidate.parameters.period === 14 &&
        candidate.parameters.entry === 30 &&
        candidate.parameters.exit === 65),
  );
  const outcome = await runScreeningWithValidation(
    bars,
    {
      initialCash: 100_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
      executionPolicy: "next-open",
    },
    {
      mode: "multi-range",
      ranges: [
        { startTime: "2001-01-01", endTime: "2002-12-31" },
        { startTime: "2006-01-01", endTime: "2007-12-31" },
      ],
    },
    {
      objective: "balanced",
      candidates,
      maxPairFinalists: 1,
      allocationCandidates: [
        { strategyAAllocation: 0.6, strategyBAllocation: 0.4 },
      ],
      yieldEvery: 10_000,
    },
  );
  assert.equal(outcome.cancelled, false);
  assert.equal(outcome.validationReport?.mode, "multi-range");
  if (outcome.validationReport?.mode !== "multi-range") {
    assert.fail("Expected a multi-range validation report");
  }
  assert.equal(outcome.validationReport.folds.length, 2);
  assert.ok(outcome.singleResults.length > 0);
  assert.equal(
    outcome.singleResults[0].screeningValidation?.foldCount,
    2,
  );
  assert.equal(outcome.singleResults[0].equity.length, 0);
});

test("keeps native one-minute ranges exact within the same trading day", () => {
  const bars: MarketBar[] = Array.from({ length: 10 }, (_, index) => {
    const minute = 30 + index;
    const close = 100 + index;
    return {
      time: `2026-08-07 09:${minute}`,
      timestamp: Date.parse(`2026-08-07T00:${minute}:00.000Z`),
      open: close - 0.5,
      close,
      high: close + 0.5,
      low: close - 1,
      volume: 1_000 + index,
      amount: 0,
      amplitude: 1,
      changePercent: 0.1,
      change: 0.1,
      turnoverRate: 0,
    };
  });

  assert.deepEqual(
    resolveTradingSessionRange(
      bars,
      "2026-08-07 09:33",
      "2026-08-07 09:36",
    ),
    {
      startTime: "2026-08-07 09:33",
      endTime: "2026-08-07 09:36",
      sessions: 4,
    },
  );
  assert.deepEqual(
    resolveTrailingTradingSessionRange(
      bars,
      3,
      "2026-08-07 09:38",
    ),
    {
      startTime: "2026-08-07 09:36",
      endTime: "2026-08-07 09:38",
      sessions: 3,
    },
  );

  const result = runBacktest(
    bars,
    "sma-cross",
    { fast: 2, slow: 3 },
    {
      initialCash: 100_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1m",
      executionPolicy: "next-open",
      entryFilter: null,
      startTime: "2026-08-07 09:33",
      endTime: "2026-08-07 09:36",
    },
  );
  assert.equal(result.equity[0].time, "2026-08-07 09:33");
  assert.equal(result.equity.at(-1)!.time, "2026-08-07 09:36");
});

test("period screening ranks and reports only the selected window", async () => {
  const bars = createMonthlyBars(2000, 2025);
  const selectedBars = bars.slice(-128);
  const outcome = await runScreeningWithValidation(
    bars,
    {
      initialCash: 100_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
      executionPolicy: "next-open",
      entryFilter: DEFAULT_MOVING_AVERAGE_SLOPE_FILTER,
      startTime: selectedBars[0].time,
      endTime: "2025-12-31",
    },
    {
      mode: "sample",
      periods: DEFAULT_SAMPLE_VALIDATION_PERIODS,
    },
    {
      objective: "balanced",
      candidates: firstScreeningCandidatePerStrategy(),
      entryFilters: buildScreeningMovingAverageSlopeFilters(),
      maxPairFinalists: 1,
      allocationCandidates: [
        {
          strategyAAllocation: 0.6,
          strategyBAllocation: 0.4,
        },
      ],
      yieldEvery: 10_000,
    },
  );

  assert.equal(outcome.cancelled, false);
  assert.equal(outcome.validationReport?.mode, "sample");
  if (outcome.validationReport?.mode !== "sample") {
    assert.fail("Expected a sample validation report");
  }
  assert.deepEqual(
    outcome.validationReport.periods.map((period) => period.sessions),
    [128],
  );
  assert.ok(
    outcome.validationReport.selectionScore >= 0 &&
      outcome.validationReport.selectionScore <= 100,
  );
  assert.ok(outcome.singleResults.length > 0);
  assert.equal(outcome.singleResults[0].equity.length, 0);
  const displayedSingle = outcome.singleResults[0];
  const directSingle = runBacktest(
    bars,
    displayedSingle.strategyId,
    displayedSingle.parameters,
    {
      initialCash: 100_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
      executionPolicy: "next-open",
      entryFilter: displayedSingle.entryFilter,
      startTime: selectedBars[0].time,
      endTime: "2025-12-31",
    },
  );
  assert.equal(displayedSingle.totalReturn, directSingle.totalReturn);
  assert.equal(displayedSingle.maxDrawdown, directSingle.maxDrawdown);
  assert.equal(displayedSingle.sharpe, directSingle.sharpe);
  assert.equal(displayedSingle.tradeCount, directSingle.tradeCount);
  assert.ok(
    Math.abs(
      displayedSingle.score -
        (displayedSingle.totalReturn * 0.45 +
          Math.max(Math.min(displayedSingle.sharpe, 5), -5) * 8 +
          displayedSingle.maxDrawdown * 0.35),
    ) < 1e-10,
  );
  for (const result of outcome.singleResults) {
    if (!supportsScreeningMovingAverageSlopeFilter(result.strategyId)) {
      assert.equal(result.entryFilter, undefined);
      continue;
    }
    if (!result.entryFilter) continue;
    assert.equal(result.entryFilter.movingAverageType, "ema");
    assert.equal(result.entryFilter.minimumSlopePercent, 0);
    assert.ok(
      SCREENING_MOVING_AVERAGE_SLOPE_PERIODS.includes(
        result.entryFilter.period as
          (typeof SCREENING_MOVING_AVERAGE_SLOPE_PERIODS)[number],
      ),
    );
  }
  const displayedCombination = outcome.results[0];
  assert.ok(displayedCombination);
  const directCombination = runStrategyCombinationBacktest(
    bars,
    displayedCombination,
    {
      initialCash: 100_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
      executionPolicy: "next-open",
      entryFilter: null,
      startTime: selectedBars[0].time,
      endTime: "2025-12-31",
    },
  );
  assert.equal(
    displayedCombination.totalReturn,
    directCombination.totalReturn,
  );
  assert.equal(
    displayedCombination.relativeLongStrategy,
    directCombination.relativeLongStrategy,
  );
  const firstEvidence =
    outcome.singleResults[0].screeningValidation;
  assert.deepEqual(firstEvidence?.rankingWindow, {
    startTime: selectedBars[0].time,
    endTime: "2025-12-01",
  });
  assert.equal(
    firstEvidence?.rankingPerformance.totalReturn,
    outcome.singleResults[0].totalReturn,
  );
  assert.equal(firstEvidence?.samplePeriods?.length, 1);
  assert.ok(firstEvidence?.selectionScore !== undefined);
  assert.ok(
    Math.abs(
      (firstEvidence?.samplePeriods?.reduce(
        (sum, period) => sum + period.weight * period.rankScore,
        0,
      ) ?? 0) - (firstEvidence?.selectionScore ?? 0),
    ) < 1e-9,
  );
  for (let index = 1; index < outcome.singleResults.length; index += 1) {
    const previous =
      outcome.singleResults[index - 1].screeningValidation
        ?.selectionScore;
    const current =
      outcome.singleResults[index].screeningValidation
        ?.selectionScore;
    assert.ok(previous !== undefined && current !== undefined);
    assert.ok(previous >= current);
  }
});

test("accepts a period window with no earlier bars", () => {
  const bars = createMonthlyBars(2000, 2010, 8);
  assert.equal(bars.length, 128);

  const windows = buildSampleValidationWindows(
    bars,
    {
      startTime: "2000-01-01",
      endTime: "2010-08-01",
    },
    DEFAULT_SAMPLE_VALIDATION_PERIODS,
  );
  assert.deepEqual(windows.window, {
    startTime: "2000-01-01",
    endTime: "2010-08-01",
  });
});

test("rejects multiple sample periods", () => {
  const bars = createMonthlyBars(2000, 2025);

  assert.throws(
    () =>
      buildSampleValidationWindows(
        bars,
        {
          startTime: "2000-01-01",
          endTime: "2025-12-01",
        },
        [
          { sessions: 64, weight: 40 },
          { sessions: 64, weight: 35 },
          { sessions: 256, weight: 25 },
        ],
      ),
    (error) =>
      error instanceof ScreeningValidationError &&
      error.code === "invalid-sample-periods",
  );
});

test("range screening uses one custom interval for selection and metrics", async () => {
  const bars = createMonthlyBars(2000, 2008);
  const outcome = await runScreeningWithValidation(
    bars,
    {
      initialCash: 100_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
      executionPolicy: "next-open",
    },
    {
      mode: "range",
      range: {
        startTime: "2005-01-01",
        endTime: "2006-12-31",
      },
    },
    {
      objective: "balanced",
      candidates: firstScreeningCandidatePerStrategy(),
      maxPairFinalists: 4,
      allocationCandidates: [
        {
          strategyAAllocation: 0.6,
          strategyBAllocation: 0.4,
        },
      ],
      yieldEvery: 10_000,
    },
  );

  assert.equal(outcome.cancelled, false);
  assert.equal(outcome.validationReport?.mode, "range");
  assert.ok(outcome.singleResults.length > 0);
  for (const result of outcome.singleResults) {
    assert.equal(result.screeningValidation?.mode, "range");
    assert.deepEqual(result.screeningValidation?.rankingWindow, {
      startTime: "2005-01-01",
      endTime: "2006-12-01",
    });
    assert.deepEqual(result.screeningValidation?.evaluationWindow, {
      startTime: "2005-01-01",
      endTime: "2006-12-01",
    });
  }
  for (let index = 1; index < outcome.singleResults.length; index += 1) {
    const previous =
      outcome.singleResults[index - 1].screeningValidation
        ?.rankingPerformance;
    const current =
      outcome.singleResults[index].screeningValidation
        ?.rankingPerformance;
    assert.ok(previous && current);
    assert.ok(
      compareScreeningResults(previous, current, "balanced") <= 0,
    );
  }
  for (const result of outcome.results) {
    assert.equal(result.equity.length, 0);
    assert.equal(
      result.relativeLongStrategy,
      result.screeningValidation?.rankingPerformance &&
        "relativeLongStrategy" in
          result.screeningValidation.rankingPerformance
        ? result.screeningValidation.rankingPerformance
            .relativeLongStrategy
      : null,
    );
  }
  if (outcome.validationReport?.mode !== "range") {
    assert.fail("Expected a range validation report");
  }
  assert.deepEqual(outcome.validationReport.range, {
    startTime: "2005-01-01",
    endTime: "2006-12-01",
  });
  const displayedSingle = outcome.singleResults[0];
  const directSingle = runBacktest(
    bars,
    displayedSingle.strategyId,
    displayedSingle.parameters,
    {
      initialCash: 100_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
      executionPolicy: "next-open",
      entryFilter: displayedSingle.entryFilter,
      startTime: "2005-01-01",
      endTime: "2006-12-31",
    },
  );
  assert.equal(displayedSingle.totalReturn, directSingle.totalReturn);
});

test("rolling screening equally aggregates configured-window ranks", async () => {
  const bars = createMonthlyBars(2000, 2005, 6);
  const outcome = await runScreeningWithValidation(
    bars,
    {
      initialCash: 100_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
      executionPolicy: "next-open",
    },
    {
      mode: "rolling",
      range: {
        startTime: "2000-01-01",
        endTime: "2005-06-01",
      },
      windowYears: 3,
    },
    {
      objective: "balanced",
      candidates: firstScreeningCandidatePerStrategy(),
      maxPairFinalists: 1,
      allocationCandidates: [
        {
          strategyAAllocation: 0.6,
          strategyBAllocation: 0.4,
        },
      ],
      yieldEvery: 10_000,
    },
  );

  assert.equal(outcome.cancelled, false);
  assert.equal(outcome.validationReport?.mode, "rolling");
  if (outcome.validationReport?.mode !== "rolling") {
    assert.fail("Expected a rolling validation report");
  }
  assert.equal(outcome.validationReport.folds.length, 4);
  assert.equal(outcome.validationReport.folds.at(-1)?.partial, true);
  assert.ok(outcome.singleResults.length > 0);
  assert.equal(
    outcome.singleResults[0].screeningValidation?.foldIndex,
    0,
  );
  assert.equal(
    outcome.singleResults[0].screeningValidation?.foldCount,
    4,
  );
  assert.deepEqual(
    outcome.singleResults[0].screeningValidation?.rankingWindow,
    {
      startTime: "2000-01-01",
      endTime: "2005-06-01",
    },
  );
  assert.deepEqual(
    outcome.singleResults[0].screeningValidation?.evaluationWindow,
    {
      startTime: "2000-01-01",
      endTime: "2005-06-01",
    },
  );
  const finalFoldPerformance =
    outcome.validationReport.folds.at(-1)?.performance;
  assert.ok(finalFoldPerformance);
  assert.equal(finalFoldPerformance.equity.length, 0);
  assert.ok(Number.isFinite(finalFoldPerformance.totalReturn));
  assert.ok(
    Math.abs(
      outcome.validationReport.selectionScore -
        outcome.validationReport.folds.reduce(
          (sum, fold) => sum + fold.rankScore,
          0,
        ) /
          outcome.validationReport.folds.length,
    ) < 1e-9,
  );
  const displayedSingle = outcome.singleResults[0];
  const directSingle = runBacktest(
    bars,
    displayedSingle.strategyId,
    displayedSingle.parameters,
    {
      initialCash: 100_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
      executionPolicy: "next-open",
      entryFilter: displayedSingle.entryFilter,
      startTime: "2000-01-01",
      endTime: "2005-06-01",
    },
  );
  assert.equal(displayedSingle.totalReturn, directSingle.totalReturn);
});

test("rolling screening evaluates ten finalists per strategy before collapsing", async () => {
  const bars = createMonthlyBars(2000, 2005, 6);
  const completeCandidates = buildScreeningCandidates();
  const candidates = [
    ...completeCandidates
      .filter((candidate) => candidate.strategyId === "sma-cross")
      .slice(0, 12),
    ...completeCandidates
      .filter((candidate) => candidate.strategyId === "rsi-reversal")
      .slice(0, 1),
  ];
  const selectionTotals: number[] = [];
  const outcome = await runScreeningWithValidation(
    bars,
    {
      initialCash: 100_000,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
      executionPolicy: "next-open",
    },
    {
      mode: "rolling",
      range: {
        startTime: "2000-01-01",
        endTime: "2005-06-01",
      },
      windowYears: 3,
    },
    {
      candidates,
      maxPairFinalists: 1,
      allocationCandidates: [
        { strategyAAllocation: 0.6, strategyBAllocation: 0.4 },
      ],
      yieldEvery: 10_000,
      onValidationProgress: (progress) => {
        if (progress.phase === "selection") {
          selectionTotals.push(progress.total);
        }
      },
    },
  );

  assert.equal(
    outcome.singleResults.filter(
      (result) => result.strategyId === "sma-cross",
    ).length,
    1,
  );
  assert.ok(
    selectionTotals.some(
      (total) =>
        total >
        outcome.singleResults.length + outcome.results.length,
    ),
  );
});

test("rejects a reversed custom range", async () => {
  const bars = createMonthlyBars(2000, 2008);
  await assert.rejects(
    runScreeningWithValidation(
      bars,
      {
        initialCash: 100_000,
        commissionRate: 0,
        slippageRate: 0,
        interval: "1d",
      },
      {
        mode: "range",
        range: {
          startTime: "2007-01-01",
          endTime: "2006-12-31",
        },
      },
    ),
    (error) =>
      error instanceof ScreeningValidationError &&
      error.code === "invalid-range-order",
  );
});
