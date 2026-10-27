"use client";
import { SmaPositionOverlayControls, useSmaPositionOverlayPreferences } from "../components/SmaPositionOverlayControls";
import { ValidatedCycleShortcuts, useValidatedCycles } from "../components/ValidatedCycleShortcuts";
import { assertValidatedCycleHistory, createValidatedCycleStrategy, ValidatedCycleError, type ValidatedCycleStrategy } from "@/lib/analysis/validated-cycle-strategy";
import { publishValidatedCycle, readValidatedCycles } from "@/lib/analysis/validated-cycle-strategy-store";
import { validatedCycleRulesMatch } from "@/lib/analysis/validated-cycle-preview";

import {
  Activity,
  ArrowLeft,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SCREENING_RESULT_MODEL_VERSION } from "@/lib/analysis/strategy-combinations";
import { ScreeningValidationError } from "@/lib/analysis/screening-validation";
import { zhCN as copy } from "@/app/i18n/zh-CN";
import { CommittedNumberInput } from "@/app/components/CommittedNumberInput";
import { StrategyCycleRollingChart } from "@/app/components/StrategyCycleRollingChart";
import { DEFAULT_CYCLE_MONITORING_RANGES, cycleMonitoringCoverage, isValidCycleMonitoringRange, type CycleMonitoringRange } from "@/lib/analysis/strategy-cycle-monitoring";
import {
  CYCLE_DAILY_SCREENING_WINDOW,
  DEFAULT_CYCLE_EVALUATION_SESSIONS,
  MAX_CYCLE_SCREENING_WINDOW,
  MAX_CYCLE_OPTIMIZATION_UNITS,
  MIN_CYCLE_SCREENING_WINDOW,
  NIKKEI_CYCLE_MODEL,
  NIKKEI_CYCLE_CONFLICT_POLICY,
  completedNikkeiCycleSeries,
  isNikkeiCycleInstrument,
  barsAvailableAtCycleDecision,
  buildCycleScreeningWindows,
  buildStrategyCycleRollingReport,
  buildStrategyCycleRollingSchedule,
  type StrategyCycleRollingReport,
  type StrategyCycleSelectionSnapshot,
} from "@/lib/analysis/strategy-cycle-validation";
import {
  clearStrategyCycleValidationTask,
  readLatestStrategyCycleValidationTask,
  writeStrategyCycleValidationTask,
  type StoredStrategyCycleValidationTask,
} from "@/lib/analysis/strategy-cycle-validation-store";
import {
  cancelScreeningInLocalEngine,
  enqueueScreeningBatchInLocalEngine,
  holdScreeningBatchLeaseInLocalEngine,
  LocalScreeningEngineProtocolError,
  LocalScreeningEngineSubmissionError,
  localScreeningEngineAvailable,
  screeningJobRequest,
  waitForScreeningBatchInLocalEngine,
} from "@/lib/analysis/screening-local-engine-client";
import type { LocalScreeningJobBatchUnit } from "@/lib/analysis/screening-local-engine-protocol";
import {
  SCREENING_OBJECTIVES,
  type ScreeningObjective,
} from "@/lib/analysis/screening";
import { screeningResultPlan } from "@/lib/analysis/screening-plan";
import {
  buildCheckpointIdentity,
  hashMarketBars,
  runScreeningInWorker,
  type WorkerScreeningOptions,
} from "@/lib/analysis/screening-worker-client";
import {
  resolveTrailingTradingSessionRange,
  type ScreeningValidationOutcome,
} from "@/lib/analysis/screening-validation";
import { selectBestShortcutScreeningResult } from "@/lib/analysis/shortcut-batch-screening";
import {
  groupSavedBacktests,
  savedBacktestInstrumentKey,
  type SavedBacktestRecord,
} from "@/lib/analysis/saved-backtests";
import { VOLUME_REQUIRED_STRATEGY_IDS, type StrategyId } from "@/lib/analysis/strategies";
import { resolveCanonicalMarketProfile } from "@/lib/market/canonical";
import {
  readCanonicalMarketSeriesEntry,
  writeCanonicalMarketSeries,
} from "@/lib/market/canonical-cache";
import { assessMarketVolumeCoverage } from "@/lib/market/quality";
import { mergeCanonicalMarketSeries, selectCanonicalFallbackSeries } from "@/lib/market/series";
import type { MarketInstrument, MarketSeries } from "@/lib/market/types";

const DAILY_INTERVAL = "1d" as const;
const CYCLE_MAX_COMBINATION_STRATEGIES = 6;
const MONITORING_STORAGE_KEY = "quantscope-cycle-monitoring-ranges-v1";
const HISTORICAL_EXECUTION_POLICY = "hybrid" as const;
interface ProgressState {
  completed: number;
  total: number;
  decisionTime: string;
  screeningWindow: number;
}

function marketRequestUrl(instrument: MarketInstrument, mode: "history" | "latest" = "history"): string {
  return `/api/market?${new URLSearchParams({
    secid: instrument.secid,
    code: instrument.code,
    name: instrument.name,
    exchange: instrument.exchange,
    assetType: instrument.assetType,
    provider: instrument.provider,
    interval: DAILY_INTERVAL,
    mode,
    limit: mode === "latest" ? "5" : "10000",
  })}`;
}

async function loadStrategyValidationMarketSeries(
  instrument: MarketInstrument,
  signal: AbortSignal,
  refreshLatest = false,
): Promise<MarketSeries> {
  const profile = resolveCanonicalMarketProfile(instrument);
  const cached = await readCanonicalMarketSeriesEntry(
    profile.primary.instrument,
    DAILY_INTERVAL,
  );
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
  if (cached?.series.bars.length && !refreshLatest) return completedNikkeiCycleSeries(cached.series);

  const response = await fetch(marketRequestUrl(profile.primary.instrument, cached?.series.bars.length ? "latest" : "history"), {
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error(copy.cycleValidation.marketError);
  const incoming = await response.json() as MarketSeries;
  const backup = profile.backups.find((definition) => definition.provider === incoming.source);
  const series = incoming.source === profile.primary.provider
    ? mergeCanonicalMarketSeries(cached?.series ?? null, incoming, 10_000, profile)
    : backup ? selectCanonicalFallbackSeries(cached?.series ?? null, [{ definition: backup, series: incoming }], 10_000, profile)
      : null;
  if (!series) throw new Error(copy.cycleValidation.marketError);
  if (!series.bars.length) throw new Error(copy.cycleValidation.marketError);
  await writeCanonicalMarketSeries(series, profile);
  return completedNikkeiCycleSeries(series);
}

function resultLabel(result: Parameters<typeof screeningResultPlan>[0]): string {
  const parameterSuffix = (parameters: unknown) => {
    if (!parameters || typeof parameters !== "object") return "";
    const values = Object.values(parameters as Record<string, number>);
    return values.length ? ` (${values.join("/")})` : "";
  };
  if ("strategyId" in result) {
    return `${copy.strategies[result.strategyId].name}${parameterSuffix(result.parameters)}`;
  }
  const source = result as unknown as Record<string, unknown>;
  const names = "ABCDEFGHI".split("").flatMap((letter) => {
    const id = source[`strategy${letter}Id`];
    return typeof id === "string"
      ? [`${copy.strategies[id as StrategyId].name}${parameterSuffix(source[`strategy${letter}Parameters`])}`]
      : [];
  });
  return names.join(" + ");
}

function formatReturn(value: number | null): string {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function taskSignature(input: {
  instrument: MarketInstrument;
  series: MarketSeries;
  screeningWindows: number[];
  maxCombinationStrategies: number;
  evaluationSessions: number;
  objective: ScreeningObjective;
  initialCash: number;
  commissionPercent: number;
  slippagePercent: number;
}): string {
  return JSON.stringify({
    rollingSchedule: NIKKEI_CYCLE_MODEL,
    resultModelVersion: SCREENING_RESULT_MODEL_VERSION,
    conflictPolicy: NIKKEI_CYCLE_CONFLICT_POLICY,
    instrumentKey: savedBacktestInstrumentKey(input.instrument),
    lastBar: input.series.bars.at(-1)?.time,
    barCount: input.series.bars.length,
    screeningWindows: input.screeningWindows,
    maxCombinationStrategies: input.maxCombinationStrategies,
    evaluationSessions: input.evaluationSessions,
    objective: input.objective,
    initialCash: input.initialCash,
    commissionPercent: input.commissionPercent,
    slippagePercent: input.slippagePercent,
  });
}

export function StrategyValidationWorkspace() {
  const c = copy.cycleValidation;
  const validatedCycles = useValidatedCycles();
  const [records, setRecords] = useState<SavedBacktestRecord[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [evaluationSessions, setEvaluationSessions] = useState(
    DEFAULT_CYCLE_EVALUATION_SESSIONS,
  );
  const [availableBarCount, setAvailableBarCount] = useState<number | null>(null);
  const [screeningWindow, setScreeningWindow] = useState(CYCLE_DAILY_SCREENING_WINDOW);
  const [screeningWindowMaximum, setScreeningWindowMaximum] = useState(CYCLE_DAILY_SCREENING_WINDOW);
  const [screeningWindowStep, setScreeningWindowStep] = useState(2);
  const maxCombinationStrategies = CYCLE_MAX_COMBINATION_STRATEGIES;
  const smaOverlay = useSmaPositionOverlayPreferences();
  const reportInputsRef = useRef<{
    series: MarketSeries; snapshots: StrategyCycleSelectionSnapshot[]; sessions: number; windows: readonly number[];
    costs?: { initialCash: number; commissionPercent: number; slippagePercent: number };
  } | null>(null);
  const [objective, setObjective] = useState<ScreeningObjective>("totalReturn");
  const [initialCash, setInitialCash] = useState(100_000);
  const [commissionPercent, setCommissionPercent] = useState(0.03);
  const [slippagePercent, setSlippagePercent] = useState(0.02);
  const [loading, setLoading] = useState(true);
  const [shortcutsReady, setShortcutsReady] = useState(false);
  const [shortcutLoadError, setShortcutLoadError] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [storedTask, setStoredTask] = useState<StoredStrategyCycleValidationTask | null>(null);
  const [rollingReports, setRollingReports] = useState<StrategyCycleRollingReport[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selectedReportWindow, setSelectedReportWindow] = useState(CYCLE_DAILY_SCREENING_WINDOW);
  const [reportBars, setReportBars] = useState<MarketSeries["bars"]>([]);
  const [monitoringRanges, setMonitoringRanges] = useState<CycleMonitoringRange[]>(
    () => DEFAULT_CYCLE_MONITORING_RANGES.map((range) => ({ ...range })),
  );
  const [monitoringStorageError, setMonitoringStorageError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const pauseRequestedRef = useRef(false);
  const runningRef = useRef(false);
  const queuedJobIdsRef = useRef<string[]>([]);
  const restoredReportSignatureRef = useRef("");
  const autoResumeSignatureRef = useRef("");


  const groups = useMemo(() => {
    const result = groupSavedBacktests(records).filter((group) => isNikkeiCycleInstrument(group.instrument));
    const localInstruments = [storedTask?.instrument, ...validatedCycles.records.map((record) => record.series.instrument)];
    for (const instrument of localInstruments) {
      if (!instrument || !isNikkeiCycleInstrument(instrument)) continue;
      const key = savedBacktestInstrumentKey(instrument);
      if (!result.some((group) => group.key === key)) result.push({ key, instrument, instrumentFolderId: null, records: [] });
    }
    return result;
  }, [records, storedTask?.instrument, validatedCycles.records]);
  const selectedGroup = groups.find((group) => group.key === selectedKey) ?? groups[0] ?? null;
  const screeningWindows = useMemo(
    () => buildCycleScreeningWindows(screeningWindow, screeningWindowMaximum, screeningWindowStep),
    [screeningWindow, screeningWindowMaximum, screeningWindowStep],
  );
  const rollingReport = rollingReports.find(
    (report) => report.screeningWindow === selectedReportWindow,
  ) ?? rollingReports[0] ?? null;
  const monitoringValid = monitoringRanges.every(isValidCycleMonitoringRange);
  const monitoringCoverage = useMemo(() => rollingReport && monitoringValid
    ? cycleMonitoringCoverage(reportBars, rollingReport.rebalances, monitoringRanges) : [],
  [monitoringRanges, monitoringValid, reportBars, rollingReport]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(MONITORING_STORAGE_KEY);
      if (saved !== null) {
        const parsed: unknown = JSON.parse(saved);
        if (!Array.isArray(parsed) || !parsed.every((range) => range &&
          typeof range.startTime === "string" && typeof range.endTime === "string")) {
          throw new Error("Invalid monitoring preferences");
        }
        setMonitoringRanges(parsed);
      }
    } catch {
      setMonitoringStorageError(true);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void readLatestStrategyCycleValidationTask().then((restoredTask) => {
      if (!active) return;
      const task = restoredTask?.signature.includes(`"rollingSchedule":"${NIKKEI_CYCLE_MODEL}"`)
        && restoredTask.signature.includes(`"conflictPolicy":"${NIKKEI_CYCLE_CONFLICT_POLICY}"`)
        && isNikkeiCycleInstrument(restoredTask.instrument)
        ? restoredTask
        : null;
      setStoredTask(task);
      queuedJobIdsRef.current = task?.queuedUnits.map((unit) => unit.jobId) ?? [];
      if (task) setSelectedKey(savedBacktestInstrumentKey(task.instrument));
      if (task) {
        const restoredWindow = task.screeningWindows[0] ?? CYCLE_DAILY_SCREENING_WINDOW;
        setScreeningWindow(restoredWindow);
        setScreeningWindowMaximum(task.screeningWindows.at(-1) ?? restoredWindow);
        setScreeningWindowStep(task.screeningWindows.length > 1
          ? task.screeningWindows[1]! - task.screeningWindows[0]!
          : 2);
        setSelectedReportWindow(restoredWindow);
        setEvaluationSessions(Math.max(3, task.evaluationSessions));
        setObjective(task.objective);
        setInitialCash(task.initialCash);
        setCommissionPercent(task.commissionPercent);
        setSlippagePercent(task.slippagePercent);
        setProgress({
          completed: task.completedUnits,
          total: task.totalUnits,
          decisionTime: task.snapshots.at(-1)?.decisionTime ?? "",
          screeningWindow: task.snapshots.at(-1)?.screeningWindow ?? 0,
        });
      }
      setLoading(false);
    }).catch(() => {
      if (active) {
        setError(c.restoreError);
        setLoading(false);
      }
    });
    return () => {
      active = false;
      abortRef.current?.abort();
    };
  }, [c.restoreError]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 10_000);
    void fetch("/api/saved-backtests", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("PERSISTENCE_UNAVAILABLE");
      const payload = await response.json() as { savedBacktests?: SavedBacktestRecord[] };
      if (!controller.signal.aborted) setRecords(payload.savedBacktests ?? []);
    }).catch(() => {
      if (active) setShortcutLoadError(true);
    }).finally(() => {
      window.clearTimeout(timer);
      if (active) setShortcutsReady(true);
    });
    return () => { active = false; window.clearTimeout(timer); controller.abort(); };
  }, []);

  useEffect(() => {
    if (!selectedGroup) {
      setAvailableBarCount(null);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setAvailableBarCount(null);
    void loadStrategyValidationMarketSeries(
      selectedGroup.instrument,
      controller.signal,
    ).then((series) => {
      if (!active) return;
      setAvailableBarCount(series.bars.length);
    }).catch((caught) => {
      if ((caught as Error).name !== "AbortError" && active) {
        setAvailableBarCount(null);
      }
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [c.marketError, selectedGroup]);

  useEffect(() => {
    if (availableBarCount === null) return;
    setEvaluationSessions((current) =>
      Math.min(
        availableBarCount,
        Math.max(2, current),
      ),
    );
  }, [availableBarCount]);

  const calculateReports = useCallback((
    series: MarketSeries,
    snapshots: StrategyCycleSelectionSnapshot[],
    sessions: number,
    windows: readonly number[],
    restoredCosts?: {
      initialCash: number;
      commissionPercent: number;
      slippagePercent: number;
    },
  ) => {
    const schedule = buildStrategyCycleRollingSchedule(series.bars, sessions, Math.max(...windows));
    if (!schedule) return;
    reportInputsRef.current = { series, snapshots, sessions, windows, costs: restoredCosts };
    const reportInitialCash = restoredCosts?.initialCash ?? initialCash;
    const reportCommissionPercent =
      restoredCosts?.commissionPercent ?? commissionPercent;
    const reportSlippagePercent = restoredCosts?.slippagePercent ?? slippagePercent;
    const settings = {
      positionOverlay: smaOverlay.settings,
      initialCash: reportInitialCash,
      commissionRate: reportCommissionPercent / 100,
      slippageRate: reportSlippagePercent / 100,
      interval: DAILY_INTERVAL,
      executionPolicy: HISTORICAL_EXECUTION_POLICY,
    };
    const reports = windows.map((window) => buildStrategyCycleRollingReport(
      series.bars, snapshots, sessions, window, settings,
    ));
    setReportBars(series.bars.slice(schedule.evaluationStartIndex, schedule.evaluationEndIndex + 1));
    setRollingReports(reports);
    void Promise.all(windows.map((window) => publishValidatedCycle(
      createValidatedCycleStrategy(series, snapshots, sessions, window, settings),
    ))).catch((caught) => {
      setError(copy.validatedCycle.errors[caught instanceof ValidatedCycleError ? caught.code : "storage"]);
    });
    setSelectedReportWindow((current) =>
      windows.includes(current) ? current : windows[0] ?? CYCLE_DAILY_SCREENING_WINDOW,
    );
  }, [commissionPercent, initialCash, slippagePercent, smaOverlay.settings?.supplementalEntry, smaOverlay.settings?.exitGuard, smaOverlay.settings?.entrySlopeGate, smaOverlay.settings?.model]);

  useEffect(() => {
    const input = reportInputsRef.current;
    if (input && smaOverlay.ready && !running) calculateReports(input.series, input.snapshots, input.sessions, input.windows, input.costs);
  }, [calculateReports, smaOverlay.ready, running]);

  useEffect(() => {
    if (
      !storedTask ||
      storedTask.status !== "completed" ||
      rollingReports.length > 0 ||
      running ||
      !smaOverlay.ready ||
      !validatedCycles.ready ||
      validatedCycles.records.some((record) => record.screeningWindow === selectedReportWindow &&
        resolveCanonicalMarketProfile(record.series.instrument).key === resolveCanonicalMarketProfile(storedTask.instrument).key) ||
      restoredReportSignatureRef.current === storedTask.signature
    ) {
      return;
    }
    restoredReportSignatureRef.current = storedTask.signature;
    const controller = new AbortController();
    void loadStrategyValidationMarketSeries(
      storedTask.instrument,
      controller.signal,
    ).then((series) => {
      const signature = JSON.parse(storedTask.signature) as { lastBar: string; barCount: number };
      series = { ...series, bars: series.bars.filter((bar) => bar.time <= signature.lastBar) };
      if (series.bars.length !== signature.barCount) throw new Error(c.staleTask);
      if (taskSignature({
        instrument: storedTask.instrument,
        series,
        screeningWindows: storedTask.screeningWindows,
        maxCombinationStrategies: storedTask.maxCombinationStrategies ?? 6,
        evaluationSessions: storedTask.evaluationSessions,
        objective: storedTask.objective,
        initialCash: storedTask.initialCash,
        commissionPercent: storedTask.commissionPercent,
        slippagePercent: storedTask.slippagePercent,
      }) !== storedTask.signature) throw new Error(c.staleTask);
      calculateReports(
        series,
        storedTask.snapshots,
        storedTask.evaluationSessions,
        storedTask.screeningWindows,
        {
          initialCash: storedTask.initialCash,
          commissionPercent: storedTask.commissionPercent,
          slippagePercent: storedTask.slippagePercent,
        },
      );
    }).catch((caught) => {
      if ((caught as Error).name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : c.marketError);
    });
    return () => controller.abort();
  }, [c.marketError, c.staleTask, calculateReports, rollingReports.length, running, storedTask,
    validatedCycles.ready, validatedCycles.records, selectedReportWindow, smaOverlay.ready]);

  const showValidatedCycle = useCallback((record: ValidatedCycleStrategy) => {
    reportInputsRef.current = null;
    setReportBars(record.series.bars.filter((bar) => bar.time >= record.startTime));
    setSelectedReportWindow(record.screeningWindow);
    const synchronized = validatedCycleRulesMatch(record, smaOverlay.settings);
    setPreviewLoading(!synchronized);
    setRollingReports(synchronized ? [record.report] : []);
  }, [smaOverlay.settings]);

  useEffect(() => {
    if (running || loading || !smaOverlay.ready) return;
    const instrument = selectedGroup?.instrument ?? storedTask?.instrument;
    const profiles = validatedCycles.records.filter((record) => instrument &&
      resolveCanonicalMarketProfile(record.series.instrument).key === resolveCanonicalMarketProfile(instrument).key);
    const profile = profiles.find((record) => record.screeningWindow === selectedReportWindow) ?? (!storedTask ? profiles[0] : undefined);
    if (profile) showValidatedCycle(profile);
  }, [validatedCycles.records, loading, running, selectedReportWindow, selectedGroup, storedTask, showValidatedCycle, smaOverlay.ready]);

  const start = useCallback(async () => {
    if (!selectedGroup || running) return;
    setError("");
    setRollingReports([]);
    setPreviewLoading(false);
    setReportBars([]);
    reportInputsRef.current = null;
    const controller = new AbortController();
    abortRef.current = controller;
    pauseRequestedRef.current = false;
    runningRef.current = true;
    setRunning(true);
    let currentTask: Omit<StoredStrategyCycleValidationTask, "key" | "version" | "updatedAt"> | null = null;
    try {
      const series = await loadStrategyValidationMarketSeries(
        selectedGroup.instrument,
        controller.signal,
        true,
      );
      if (screeningWindows.length === 0) throw new Error(c.invalidPeriods);
      const profiles = (await readValidatedCycles()).filter((record) =>
        resolveCanonicalMarketProfile(record.series.instrument).key === resolveCanonicalMarketProfile(selectedGroup.instrument).key &&
        screeningWindows.includes(record.screeningWindow));
      profiles.forEach((profile) => assertValidatedCycleHistory(profile, series));
      const profileStart = profiles.map((profile) => series.bars.findIndex((bar) => bar.time === profile.startTime));
      const runEvaluationSessions = profileStart.length && profileStart.every((index) => index >= 0)
        ? Math.max(evaluationSessions, series.bars.length - Math.min(...profileStart)) : evaluationSessions;
      const schedule = buildStrategyCycleRollingSchedule(
        series.bars,
        runEvaluationSessions,
        screeningWindows.at(-1)!,
      );
      if (!schedule) throw new Error(c.insufficientHistory);
      const optimizationUnits = schedule.optimizationUnits * screeningWindows.length;
      const signature = taskSignature({
        instrument: selectedGroup.instrument,
        series,
        screeningWindows,
        maxCombinationStrategies,
        evaluationSessions: runEvaluationSessions,
        objective,
        initialCash,
        commissionPercent,
        slippagePercent,
      });
      if (storedTask && storedTask.signature !== signature) {
        await cancelScreeningInLocalEngine(
          storedTask.queuedUnits.map((unit) => unit.jobId),
        );
      }
      const reusable = storedTask?.signature === signature ? storedTask.snapshots : profiles.flatMap((profile) =>
        profile.snapshots.map((snapshot) => ({ ...snapshot,
          decisionIndex: series.bars.findIndex((bar) => bar.time === snapshot.decisionTime),
        })).filter((snapshot) => schedule.decisionIndexes.includes(snapshot.decisionIndex)));
      const snapshots = [...reusable];
      const completed = new Set(
        snapshots.map((snapshot) => `${snapshot.screeningWindow}:${snapshot.decisionIndex}`),
      );
      const pendingUnits = optimizationUnits - completed.size;
      if (pendingUnits > MAX_CYCLE_OPTIMIZATION_UNITS) {
        throw new Error(c.tooManyUnits.replace("{count}", String(pendingUnits)));
      }
      currentTask = {
        signature,
        instrument: selectedGroup.instrument,
        screeningWindows,
        updateIntervals: [],
        maxCombinationStrategies,
        evaluationSessions: runEvaluationSessions,
        objective,
        initialCash,
        commissionPercent,
        slippagePercent,
        completedUnits: completed.size,
        totalUnits: optimizationUnits,
        snapshots,
        queuedUnits: storedTask?.signature === signature
          ? [...storedTask.queuedUnits]
          : [],
        status: "running",
        lastError: null,
      };

      const settings = {
        initialCash,
        commissionRate: commissionPercent / 100,
        slippageRate: slippagePercent / 100,
        interval: DAILY_INTERVAL,
        executionPolicy: HISTORICAL_EXECUTION_POLICY,
      };
      const localEngine = await localScreeningEngineAvailable();
      if (
        !localEngine &&
        storedTask?.signature === signature &&
        storedTask.queuedUnits.length > 0
      ) {
        throw new Error(c.localEngineError);
      }
      if (localEngine) {
        await writeStrategyCycleValidationTask(currentTask);
        const queuedByKey = new Map(
          currentTask.queuedUnits.map((unit) => [
            `${unit.screeningWindow}:${unit.decisionIndex}`,
            unit,
          ]),
        );
        const batchJobs: LocalScreeningJobBatchUnit[] = [];
        const batchUnits: Array<{
          decisionIndex: number;
          decisionTime: string;
          screeningWindow: number;
          unitKey: string;
        }> = [];
        for (const decisionIndex of schedule.decisionIndexes) {
          const availableBars = barsAvailableAtCycleDecision(series.bars, decisionIndex);
          const barsHash = hashMarketBars(availableBars);
          const volumeReliable = assessMarketVolumeCoverage(availableBars).reliable;
          for (const screeningWindow of screeningWindows) {
            if (controller.signal.aborted) throw new DOMException("Paused", "AbortError");
            const unitKey = `${screeningWindow}:${decisionIndex}`;
            if (completed.has(unitKey)) continue;
            const range = resolveTrailingTradingSessionRange(availableBars, screeningWindow);
            if (!range) throw new Error(c.insufficientHistory);
            const options: WorkerScreeningOptions = {
              objective,
              excludedStrategyIds: volumeReliable ? undefined : VOLUME_REQUIRED_STRATEGY_IDS,
              checkpointNamespace: `cycle:${selectedGroup.key}:${decisionIndex}:${screeningWindow}`,
              signal: controller.signal,
              preserveLocalJobOnAbort: true,
              maxCombinationStrategies,
            };
            const validationConfig = {
              mode: "sample" as const,
              periods: [{ sessions: screeningWindow, weight: 100 }],
            };
            const checkpoint = buildCheckpointIdentity(
              availableBars,
              { ...settings, startTime: range.startTime, endTime: range.endTime },
              validationConfig,
              options,
              barsHash,
            );
            const request = screeningJobRequest(
              availableBars,
              { ...settings, startTime: range.startTime, endTime: range.endTime },
              validationConfig,
              options,
              checkpoint,
            );
            const { bars: _bars, ...unitRequest } = request;
            void _bars;
            batchJobs.push({ ...unitRequest, barCount: availableBars.length });
            batchUnits.push({
              decisionIndex,
              decisionTime: series.bars[decisionIndex]!.time,
              screeningWindow,
              unitKey,
            });
          }
        }
        const recordQueued = async (jobIds: string[], offset: number) => {
          jobIds.forEach((jobId, index) => {
            const unit = batchUnits[offset + index]!;
            queuedByKey.set(unit.unitKey, {
              decisionIndex: unit.decisionIndex,
              decisionTime: unit.decisionTime,
              screeningWindow: unit.screeningWindow,
              jobId,
            });
          });
          if (!currentTask) throw new Error(c.localEngineError);
          currentTask = { ...currentTask, queuedUnits: [...queuedByKey.values()] };
          queuedJobIdsRef.current = currentTask.queuedUnits.map(unit => unit.jobId);
          await writeStrategyCycleValidationTask(currentTask);
          setStoredTask({ ...currentTask, key: "latest", version: 2, updatedAt: new Date().toISOString() });
        };
        const jobIds = batchJobs.length
          ? await enqueueScreeningBatchInLocalEngine(
              series.bars,
              batchJobs,
              controller.signal,
              recordQueued,
            )
          : [];
        if (!jobIds) throw new Error(c.localEngineError);
        void holdScreeningBatchLeaseInLocalEngine(
          queuedJobIdsRef.current,
          controller.signal,
        );
      }

      const recordOutcome = async (
        unit: {
          decisionIndex: number;
          decisionTime: string;
          screeningWindow: number;
        },
        outcome: ScreeningValidationOutcome,
      ) => {
        const unitKey = `${unit.screeningWindow}:${unit.decisionIndex}`;
        if (completed.has(unitKey)) return;
        const best = selectBestShortcutScreeningResult(
          outcome.singleResults,
          outcome.results,
          objective,
        );
        if (!best) throw new Error(c.noResult);
        snapshots.push({
          decisionIndex: unit.decisionIndex,
          decisionTime: unit.decisionTime,
          screeningWindow: unit.screeningWindow,
          plan: screeningResultPlan(best.result),
          fixedRelativeLongStrategy:
            best.kind === "combination" ? best.result.relativeLongStrategy : null,
          label: resultLabel(best.result),
        });
        completed.add(unitKey);
        currentTask = {
          ...currentTask!,
          completedUnits: completed.size,
          snapshots,
          status: "running",
        };
        await writeStrategyCycleValidationTask(currentTask);
        setStoredTask({ ...currentTask, key: "latest", version: 2, updatedAt: new Date().toISOString() });
        setProgress({
          completed: completed.size,
          total: optimizationUnits,
          decisionTime: unit.decisionTime,
          screeningWindow: unit.screeningWindow,
        });
      };

      if (localEngine) {
        const pendingUnits = currentTask.queuedUnits.filter(
          (unit) => !completed.has(`${unit.screeningWindow}:${unit.decisionIndex}`),
        );
        const unitByJobId = new Map(
          pendingUnits.map((unit) => [unit.jobId, unit]),
        );
        await waitForScreeningBatchInLocalEngine(
          pendingUnits.map((unit) => unit.jobId),
          { signal: controller.signal },
          async (jobId, outcome) => {
            const unit = unitByJobId.get(jobId);
            if (!unit) throw new Error(c.localEngineError);
            await recordOutcome(unit, outcome);
          },
        );
      } else {
        for (const decisionIndex of schedule.decisionIndexes) {
          const availableBars = barsAvailableAtCycleDecision(series.bars, decisionIndex);
          const volumeReliable = assessMarketVolumeCoverage(availableBars).reliable;
          for (const screeningWindow of screeningWindows) {
            if (controller.signal.aborted) throw new DOMException("Paused", "AbortError");
            const unitKey = `${screeningWindow}:${decisionIndex}`;
            if (completed.has(unitKey)) continue;
            const range = resolveTrailingTradingSessionRange(availableBars, screeningWindow);
            if (!range) throw new Error(c.insufficientHistory);
            setProgress({
              completed: completed.size,
              total: optimizationUnits,
              decisionTime: series.bars[decisionIndex]!.time,
              screeningWindow,
            });
            const workerOptions: WorkerScreeningOptions = {
              objective,
              excludedStrategyIds: volumeReliable ? undefined : VOLUME_REQUIRED_STRATEGY_IDS,
              checkpointNamespace: `cycle:${selectedGroup.key}:${decisionIndex}:${screeningWindow}`,
              signal: controller.signal,
              preserveLocalJobOnAbort: true,
              maxCombinationStrategies,
            };
            const outcome = await runScreeningInWorker(
                availableBars,
                {
                  ...settings,
                  startTime: range.startTime,
                  endTime: range.endTime,
                },
                { mode: "sample", periods: [{ sessions: screeningWindow, weight: 100 }] },
                workerOptions,
              );
            await recordOutcome({
              decisionIndex,
              decisionTime: series.bars[decisionIndex]!.time,
              screeningWindow,
            }, outcome);
          }
        }
      }
      currentTask = { ...currentTask, completedUnits: completed.size, snapshots, status: "completed" };
      queuedJobIdsRef.current = [];
      await writeStrategyCycleValidationTask(currentTask);
      setStoredTask({ ...currentTask, key: "latest", version: 2, updatedAt: new Date().toISOString() });
      setProgress({
        completed: completed.size,
              total: optimizationUnits,
        decisionTime: snapshots.at(-1)?.decisionTime ?? "",
        screeningWindow: snapshots.at(-1)?.screeningWindow ?? 0,
      });
      calculateReports(series, snapshots, runEvaluationSessions, screeningWindows);
    } catch (caught) {
      if ((caught as Error).name === "AbortError") {
        if (pauseRequestedRef.current && currentTask) {
          await cancelScreeningInLocalEngine(
            currentTask.queuedUnits.map((unit) => unit.jobId),
          );
        }
        if (pauseRequestedRef.current && currentTask) {
          await writeStrategyCycleValidationTask({ ...currentTask, status: "paused" });
        }
      } else {
        const message = caught instanceof ScreeningValidationError
          ? copy.screening.validationErrors[caught.code]
          : caught instanceof ValidatedCycleError
          ? copy.validatedCycle.errors[caught.code] + (caught.code === "gap" ? caught.dates.join(", ") : "")
          : caught instanceof LocalScreeningEngineProtocolError
          ? c.localEngineRestartRequired
          : caught instanceof LocalScreeningEngineSubmissionError
          ? c.localEngineSubmissionFailed.replace("{status}", String(caught.status)).replace("{detail}", caught.detail)
          : caught instanceof Error
            ? caught.message
            : c.unknownError;
        setError(message);
        if (currentTask) await writeStrategyCycleValidationTask({ ...currentTask, status: "error", lastError: message });
      }
    } finally {
      controller.abort();
      abortRef.current = null;
      runningRef.current = false;
      setRunning(false);
    }
  }, [
    c,
    calculateReports,
    commissionPercent,
    evaluationSessions,
    initialCash,
    maxCombinationStrategies,
    objective,
    running,
    screeningWindow,
    screeningWindowMaximum,
    screeningWindowStep,
    screeningWindows,
    selectedGroup,
    slippagePercent,
    storedTask,
  ]);

  useEffect(() => {
    if (
      loading ||
      validatedCycles.upgrading ||
      running ||
      !selectedGroup ||
      storedTask?.status !== "running" ||
      (storedTask.maxCombinationStrategies ?? CYCLE_MAX_COMBINATION_STRATEGIES) !== maxCombinationStrategies ||
      autoResumeSignatureRef.current === storedTask.signature
    ) {
      return;
    }
    autoResumeSignatureRef.current = storedTask.signature;
    void start();
  }, [loading, validatedCycles.upgrading, running, selectedGroup, start, storedTask, maxCombinationStrategies]);

  const reset = async () => {
    setPreviewLoading(false);
    pauseRequestedRef.current = true;
    abortRef.current?.abort();
    await cancelScreeningInLocalEngine(
      storedTask?.queuedUnits.map((unit) => unit.jobId) ?? [],
    );
    await clearStrategyCycleValidationTask();
    queuedJobIdsRef.current = [];
    setStoredTask(null);
    setProgress(null);
    setRollingReports([]);
    setReportBars([]);
    reportInputsRef.current = null;
    setError("");
  };

  const pause = () => {
    pauseRequestedRef.current = true;
    abortRef.current?.abort();
  };

  const evaluationSessionMaximum =
    availableBarCount ?? Math.max(DEFAULT_CYCLE_EVALUATION_SESSIONS, evaluationSessions);

  return (
    <main className="cycle-validation-shell">
      <header className="cycle-validation-topbar">
        <Link href="/" className="cycle-back-link"><ArrowLeft size={16} />{c.back}</Link>
        <div className="cycle-brand"><Activity size={18} /><div><strong>{c.title}</strong><small>{c.subtitle}</small></div></div>
        <span className="cycle-local-badge">{c.localOnly}</span>
      </header>

      <section className="cycle-validation-layout">
        <aside className="cycle-settings panel">
          <ValidatedCycleShortcuts records={validatedCycles.records} error={validatedCycles.error}
            onOpen={running ? undefined : showValidatedCycle} />
          <div className="panel-heading"><div><span className="eyebrow">{c.settingsEyebrow}</span><strong>{c.settingsTitle}</strong></div></div>
          {loading && <p className="cycle-muted"><LoaderCircle className="spin" size={15} />{c.loading}</p>}
            <div className="cycle-form">
              <label><span>{c.instrument}</span><select value={selectedGroup?.key ?? ""} disabled={running} onChange={(event) => setSelectedKey(event.target.value)}>
                {groups.map((group) => <option key={group.key} value={group.key}>{group.instrument.name} · {group.instrument.code}</option>)}
              </select></label>
              {shortcutLoadError && <p className="cycle-warning" role="alert">{c.loadError}</p>}
              {!loading && shortcutsReady && validatedCycles.ready && groups.length === 0 && <p className="cycle-warning">{c.noShortcuts}</p>}
              <div className="cycle-form-row">
                <label><span>{c.cycleScreeningPeriodStart}</span><CommittedNumberInput value={screeningWindow} min={MIN_CYCLE_SCREENING_WINDOW} max={MAX_CYCLE_SCREENING_WINDOW} step={1} integer disabled={running} onCommit={(value) => { setScreeningWindow(value); setScreeningWindowMaximum((current) => Math.max(current, value)); }} /></label>
                <label><span>{c.cycleScreeningPeriodEnd}</span><CommittedNumberInput value={screeningWindowMaximum} min={MIN_CYCLE_SCREENING_WINDOW} max={MAX_CYCLE_SCREENING_WINDOW} step={1} integer disabled={running} onCommit={(value) => { setScreeningWindowMaximum(value); setScreeningWindow((current) => Math.min(current, value)); }} /></label>
                <label><span>{c.cycleScreeningPeriodStep}</span><CommittedNumberInput value={screeningWindowStep} min={1} max={MAX_CYCLE_SCREENING_WINDOW - MIN_CYCLE_SCREENING_WINDOW} step={1} integer disabled={running} onCommit={setScreeningWindowStep} /></label>
              </div>
              <label><span>{c.evaluationSessions}</span><CommittedNumberInput value={evaluationSessions} min={Math.min(3, evaluationSessionMaximum)} max={evaluationSessionMaximum} step={1} integer disabled={running} onCommit={setEvaluationSessions} /></label>
              <label><span>{c.objective}</span><select value={objective} disabled={running} onChange={(event) => setObjective(event.target.value as ScreeningObjective)}>
                {SCREENING_OBJECTIVES.map((value) => <option key={value} value={value}>{c.objectives[value]}</option>)}
              </select></label>
              <div className="cycle-form-row">
                <label><span>{c.initialCash}</span><input type="number" min={1} value={initialCash} disabled={running} onChange={(event) => setInitialCash(Math.max(1, Number(event.target.value) || 1))} /></label>
                <label><span>{c.commission}</span><input type="number" min={0} step="0.01" value={commissionPercent} disabled={running} onChange={(event) => setCommissionPercent(Math.max(0, Number(event.target.value) || 0))} /></label>
                <label><span>{c.slippage}</span><input type="number" min={0} step="0.01" value={slippagePercent} disabled={running} onChange={(event) => setSlippagePercent(Math.max(0, Number(event.target.value) || 0))} /></label>
              </div>
              <div className="cycle-actions">
                <button type="button" className="primary" disabled={loading || !validatedCycles.ready || validatedCycles.upgrading || running || !selectedGroup} onClick={() => void start()}><Play size={15} />{storedTask ? c.resume : c.start}</button>
                <button type="button" disabled={!running} onClick={pause}><Pause size={15} />{c.pause}</button>
                <button type="button" disabled={running} onClick={() => void reset()}><RotateCcw size={15} />{c.reset}</button>
              </div>
              <SmaPositionOverlayControls />
            </div>
        </aside>

        <div className="cycle-results">
          <section className="panel cycle-progress-card">
            <div className="panel-heading"><div><span className="eyebrow">{c.progressEyebrow}</span><strong>{c.progressTitle}</strong></div><span>{progress ? `${progress.completed}/${progress.total}` : "0/0"}</span></div>
            <progress value={progress?.completed ?? 0} max={Math.max(progress?.total ?? 1, 1)} />
            <p>{running && progress ? c.runningUnit.replace("{date}", progress.decisionTime.slice(0, 10)).replace("{window}", String(progress.screeningWindow)) : storedTask?.status === "completed" ? c.completed : c.ready}</p>
            {error && <div className="cycle-error" role="alert">{error}</div>}
          </section>

          <section className="panel cycle-matrix-card">
            <div className="panel-heading"><div><span className="eyebrow">{c.matrixEyebrow}</span><strong>{c.matrixTitle}</strong></div></div>
            {rollingReport ? <div className="cycle-report-section">
              <p className="cycle-hint">{c.previewRules.replace("{version}", smaOverlay.settings?.model?.split("-").at(-1) ?? "legacy")}</p>
              <p className="cycle-hint">{c.rollingPeriod.replace("{start}", rollingReport.evaluationStartTime).replace("{end}", rollingReport.evaluationEndTime).replace("{count}", String(rollingReport.decisionCount)).replace("{skipped}", String(rollingReport.skippedDecisionCount)).replace("{window}", String(rollingReport.screeningWindow))}</p>
              <div className="cycle-horizon-grid">{([
                [c.rollingBenchmark, rollingReport.benchmarkReturn],
                [c.rollingLatest, rollingReport.updateReturn],
              ] as const).map(([label, value]) => <article key={label}>
                <strong>{label}</strong>
                <b className={value >= 0 ? "positive" : "negative"}>{formatReturn(value)}</b>
              </article>)}</div>
              <p className="cycle-hint">{c.rollingConflictHint.replace("{count}", String(rollingReport.conflictCount))}</p>
              {monitoringStorageError && <p className="cycle-warning" role="alert">{c.monitoringStorageError}</p>}
              {monitoringCoverage.length > 0 && <section aria-label={c.monitoringCoverage}>
                <strong>{c.monitoringCoverage}</strong>
                <p className="cycle-hint">{c.monitoringCoverageHint}</p>
                <div className="cycle-horizon-grid">{monitoringCoverage.map((range, index) => <article key={index}>
                  <strong>{range.startTime} ~ {range.endTime}</strong>
                  <b>{range.coveragePercent === null ? c.monitoringNoData : `${range.coveragePercent.toFixed(2)}%`}</b>
                  <small>{c.monitoringCounts.replace("{held}", String(range.heldSessions)).replace("{total}", String(range.sessions))}</small>
                  {range.actualStartTime && <small>{c.monitoringActual.replace("{start}", range.actualStartTime).replace("{end}", range.actualEndTime!)}</small>}
                </article>)}</div>
              </section>}
              <div className="cycle-rolling-chart-section">
                <strong>{c.rollingChartTitle}</strong>
                <div className="cycle-rolling-mode-buttons" role="group" aria-label={c.rollingChartTitle}>
                  {rollingReports.map((report) => <button key={report.screeningWindow} type="button" aria-pressed={report.screeningWindow === rollingReport.screeningWindow} onClick={() => setSelectedReportWindow(report.screeningWindow)}>{c.screeningWindowOption.replace("{window}", String(report.screeningWindow))}</button>)}
                </div>
                <StrategyCycleRollingChart
                  bars={reportBars}
                  rebalances={rollingReport.rebalances}
                  labels={{
                    price: c.price,
                    establish: c.rollingEstablish,
                    increase: c.rollingIncrease,
                    reduce: c.rollingReduce,
                    clear: c.rollingClear,
                    targetAllocation: c.targetAllocation,
                    fillPrice: c.rollingFillPrice,
                  }}
                  ariaLabel={c.rollingChartAriaLabel.replace("{mode}", c.rollingLatest)}
                  dataKey={`${rollingReport.screeningWindow}:${rollingReport.evaluationStartTime}:${rollingReport.evaluationEndTime}`}
                />
                <p className="cycle-hint">{c.rollingChartHint}</p>
              </div>
            </div> : <p className="cycle-empty">{previewLoading ? c.previewLoading : c.noMatrix}</p>}
          </section>
        </div>
      </section>
    </main>
  );
}
