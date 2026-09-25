"use client";

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
import { zhCN as copy } from "@/app/i18n/zh-CN";
import { StrategyCycleRollingChart } from "@/app/components/StrategyCycleRollingChart";
import {
  CYCLE_DAILY_SCREENING_WINDOW,
  DEFAULT_CYCLE_EVALUATION_SESSIONS,
  MAX_CYCLE_SCREENING_WINDOW,
  MAX_CYCLE_OPTIMIZATION_UNITS,
  MIN_CYCLE_SCREENING_WINDOW,
  barsAvailableAtCycleDecision,
  buildStrategyCycleRollingReport,
  buildStrategyCycleRollingSchedule,
  type StrategyCycleRollingReport,
  type StrategyCycleRollingMode,
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
import { assessMarketVolumeCoverage } from "@/lib/market/quality";
import type { MarketInstrument, MarketSeries } from "@/lib/market/types";

const DAILY_INTERVAL = "1d" as const;
const HISTORICAL_EXECUTION_POLICY = "hybrid" as const;
const DEFAULT_SCREENING_INTERVAL = 5;

interface ProgressState {
  completed: number;
  total: number;
  decisionTime: string;
  screeningWindow: number;
}

function marketRequestUrl(instrument: MarketInstrument): string {
  return `/api/market?${new URLSearchParams({
    secid: instrument.secid,
    code: instrument.code,
    name: instrument.name,
    exchange: instrument.exchange,
    assetType: instrument.assetType,
    provider: instrument.provider,
    interval: DAILY_INTERVAL,
    limit: "10000",
  })}`;
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
  updateIntervals: number[];
  evaluationSessions: number;
  objective: ScreeningObjective;
  initialCash: number;
  commissionPercent: number;
  slippagePercent: number;
}): string {
  return JSON.stringify({
    rollingSchedule: "trailing-window-next-interval-v1",
    instrumentKey: savedBacktestInstrumentKey(input.instrument),
    lastBar: input.series.bars.at(-1)?.time,
    barCount: input.series.bars.length,
    screeningWindows: input.screeningWindows,
    updateIntervals: input.updateIntervals,
    evaluationSessions: input.evaluationSessions,
    objective: input.objective,
    initialCash: input.initialCash,
    commissionPercent: input.commissionPercent,
    slippagePercent: input.slippagePercent,
  });
}

export function StrategyValidationWorkspace() {
  const c = copy.cycleValidation;
  const [records, setRecords] = useState<SavedBacktestRecord[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [evaluationSessions, setEvaluationSessions] = useState(
    DEFAULT_CYCLE_EVALUATION_SESSIONS,
  );
  const [availableBarCount, setAvailableBarCount] = useState<number | null>(null);
  const [screeningWindow, setScreeningWindow] = useState(CYCLE_DAILY_SCREENING_WINDOW);
  const [screeningInterval, setScreeningInterval] = useState(DEFAULT_SCREENING_INTERVAL);
  const [objective, setObjective] = useState<ScreeningObjective>("totalReturn");
  const [initialCash, setInitialCash] = useState(100_000);
  const [commissionPercent, setCommissionPercent] = useState(0.03);
  const [slippagePercent, setSlippagePercent] = useState(0.02);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [storedTask, setStoredTask] = useState<StoredStrategyCycleValidationTask | null>(null);
  const [rollingReport, setRollingReport] = useState<StrategyCycleRollingReport | null>(null);
  const [reportBars, setReportBars] = useState<MarketSeries["bars"]>([]);
  const [selectedRollingMode, setSelectedRollingMode] = useState<StrategyCycleRollingMode>("latest");
  const abortRef = useRef<AbortController | null>(null);
  const pauseRequestedRef = useRef(false);
  const runningRef = useRef(false);
  const queuedJobIdsRef = useRef<string[]>([]);
  const restoredReportSignatureRef = useRef("");

  const groups = useMemo(() => groupSavedBacktests(records), [records]);
  const selectedGroup = groups.find((group) => group.key === selectedKey) ?? groups[0] ?? null;

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch("/api/saved-backtests", { cache: "no-store" }).then((response) => response.json()),
      readLatestStrategyCycleValidationTask(),
    ]).then(([payload, restoredTask]) => {
      if (!active) return;
      const task = restoredTask?.signature.includes('"rollingSchedule":"trailing-window-next-interval-v1"')
        ? restoredTask
        : null;
      const nextRecords = (payload as { savedBacktests?: SavedBacktestRecord[] }).savedBacktests ?? [];
      setRecords(nextRecords);
      setStoredTask(task);
      queuedJobIdsRef.current = task?.queuedUnits.map((unit) => unit.jobId) ?? [];
      const nextGroups = groupSavedBacktests(nextRecords);
      const restoredKey = task ? savedBacktestInstrumentKey(task.instrument) : "";
      setSelectedKey(nextGroups.some((group) => group.key === restoredKey) ? restoredKey : nextGroups[0]?.key ?? "");
      if (task) {
        const restoredWindow = task.screeningWindows[0] ?? CYCLE_DAILY_SCREENING_WINDOW;
        setScreeningWindow(restoredWindow);
        setScreeningInterval(task.updateIntervals[0] ?? DEFAULT_SCREENING_INTERVAL);
        setEvaluationSessions(Math.max(
          (task.updateIntervals[0] ?? DEFAULT_SCREENING_INTERVAL) + 1,
          task.evaluationSessions,
        ));
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
        setError(c.loadError);
        setLoading(false);
      }
    });
    return () => {
      active = false;
      abortRef.current?.abort();
    };
  }, [c.loadError]);

  useEffect(() => {
    if (!selectedGroup) {
      setAvailableBarCount(null);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setAvailableBarCount(null);
    void fetch(marketRequestUrl(selectedGroup.instrument), {
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error(c.marketError);
      const series = await response.json() as MarketSeries;
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
        Math.max(screeningInterval + 1, current),
      ),
    );
  }, [availableBarCount, screeningInterval]);

  useEffect(() => {
    const stopOnPageExit = () => {
      if (!runningRef.current) return;
      pauseRequestedRef.current = true;
      abortRef.current?.abort();
      void cancelScreeningInLocalEngine(queuedJobIdsRef.current);
    };
    window.addEventListener("beforeunload", stopOnPageExit);
    window.addEventListener("pagehide", stopOnPageExit);
    return () => {
      window.removeEventListener("beforeunload", stopOnPageExit);
      window.removeEventListener("pagehide", stopOnPageExit);
    };
  }, []);

  const calculateReports = useCallback((
    series: MarketSeries,
    snapshots: StrategyCycleSelectionSnapshot[],
    sessions: number,
    window: number,
    interval: number,
    restoredCosts?: {
      initialCash: number;
      commissionPercent: number;
      slippagePercent: number;
    },
  ) => {
    const schedule = buildStrategyCycleRollingSchedule(series.bars.length, sessions, window, interval);
    if (!schedule) return;
    const reportInitialCash = restoredCosts?.initialCash ?? initialCash;
    const reportCommissionPercent =
      restoredCosts?.commissionPercent ?? commissionPercent;
    const reportSlippagePercent = restoredCosts?.slippagePercent ?? slippagePercent;
    const settings = {
      initialCash: reportInitialCash,
      commissionRate: reportCommissionPercent / 100,
      slippageRate: reportSlippagePercent / 100,
      interval: DAILY_INTERVAL,
      executionPolicy: HISTORICAL_EXECUTION_POLICY,
    };
    const report = buildStrategyCycleRollingReport(
      series.bars,
      snapshots,
      sessions,
      window,
      interval,
      settings,
    );
    setReportBars(series.bars.slice(schedule.evaluationStartIndex, schedule.evaluationEndIndex + 1));
    setRollingReport(report);
  }, [commissionPercent, initialCash, slippagePercent]);

  useEffect(() => {
    if (
      !storedTask ||
      storedTask.status !== "completed" ||
      rollingReport ||
      running ||
      restoredReportSignatureRef.current === storedTask.signature
    ) {
      return;
    }
    restoredReportSignatureRef.current = storedTask.signature;
    const controller = new AbortController();
    void fetch(marketRequestUrl(storedTask.instrument), {
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error(c.marketError);
      const series = await response.json() as MarketSeries;
      if (taskSignature({
        instrument: storedTask.instrument,
        series,
        screeningWindows: storedTask.screeningWindows,
        updateIntervals: storedTask.updateIntervals,
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
        storedTask.screeningWindows[0] ?? CYCLE_DAILY_SCREENING_WINDOW,
        storedTask.updateIntervals[0] ?? DEFAULT_SCREENING_INTERVAL,
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
  }, [c.marketError, c.staleTask, calculateReports, rollingReport, running, storedTask]);

  const start = useCallback(async () => {
    if (!selectedGroup || running) return;
    setError("");
    setRollingReport(null);
    setReportBars([]);
    setSelectedRollingMode("latest");
    const controller = new AbortController();
    abortRef.current = controller;
    pauseRequestedRef.current = false;
    runningRef.current = true;
    setRunning(true);
    let currentTask: Omit<StoredStrategyCycleValidationTask, "key" | "version" | "updatedAt"> | null = null;
    try {
      const marketResponse = await fetch(marketRequestUrl(selectedGroup.instrument), {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!marketResponse.ok) throw new Error(c.marketError);
      const series = await marketResponse.json() as MarketSeries;
      const schedule = buildStrategyCycleRollingSchedule(
        series.bars.length,
        evaluationSessions,
        screeningWindow,
        screeningInterval,
      );
      if (!schedule) throw new Error(c.insufficientHistory);
      if (schedule.optimizationUnits > MAX_CYCLE_OPTIMIZATION_UNITS) {
        throw new Error(c.tooManyUnits.replace("{count}", String(schedule.optimizationUnits)));
      }
      const signature = taskSignature({
        instrument: selectedGroup.instrument,
        series,
        screeningWindows: [screeningWindow],
        updateIntervals: [screeningInterval],
        evaluationSessions,
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
      const reusable = storedTask?.signature === signature ? storedTask.snapshots : [];
      const snapshots = [...reusable];
      const completed = new Set(
        snapshots.map((snapshot) => `${snapshot.screeningWindow}:${snapshot.decisionIndex}`),
      );
      currentTask = {
        signature,
        instrument: selectedGroup.instrument,
        screeningWindows: [screeningWindow],
        updateIntervals: [screeningInterval],
        evaluationSessions,
        objective,
        initialCash,
        commissionPercent,
        slippagePercent,
        completedUnits: completed.size,
        totalUnits: schedule.optimizationUnits,
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
      const screeningWindows = [screeningWindow];
      const localEngine = await localScreeningEngineAvailable();
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
        const jobIds = batchJobs.length
          ? await enqueueScreeningBatchInLocalEngine(
              series.bars,
              batchJobs,
              controller.signal,
            )
          : [];
        if (!jobIds) throw new Error(c.localEngineError);
        batchUnits.forEach((unit, index) => {
          const jobId = jobIds[index]!;
          queuedByKey.set(unit.unitKey, {
            decisionIndex: unit.decisionIndex,
            decisionTime: unit.decisionTime,
            screeningWindow: unit.screeningWindow,
            jobId,
          });
        });
        currentTask = {
          ...currentTask,
          queuedUnits: [...queuedByKey.values()],
        };
        queuedJobIdsRef.current = currentTask.queuedUnits.map((unit) => unit.jobId);
        void holdScreeningBatchLeaseInLocalEngine(
          queuedJobIdsRef.current,
          controller.signal,
        );
        await writeStrategyCycleValidationTask(currentTask);
        setStoredTask({ ...currentTask, key: "latest", version: 2, updatedAt: new Date().toISOString() });
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
          total: schedule.optimizationUnits,
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
              total: schedule.optimizationUnits,
              decisionTime: series.bars[decisionIndex]!.time,
              screeningWindow,
            });
            const workerOptions: WorkerScreeningOptions = {
              objective,
              excludedStrategyIds: volumeReliable ? undefined : VOLUME_REQUIRED_STRATEGY_IDS,
              checkpointNamespace: `cycle:${selectedGroup.key}:${decisionIndex}:${screeningWindow}`,
              signal: controller.signal,
              preserveLocalJobOnAbort: true,
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
        total: schedule.optimizationUnits,
        decisionTime: snapshots.at(-1)?.decisionTime ?? "",
        screeningWindow: snapshots.at(-1)?.screeningWindow ?? 0,
      });
      calculateReports(series, snapshots, evaluationSessions, screeningWindow, screeningInterval);
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
        const message = caught instanceof Error ? caught.message : c.unknownError;
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
    objective,
    running,
    screeningWindow,
    screeningInterval,
    selectedGroup,
    slippagePercent,
    storedTask,
  ]);

  const reset = async () => {
    pauseRequestedRef.current = true;
    abortRef.current?.abort();
    await cancelScreeningInLocalEngine(
      storedTask?.queuedUnits.map((unit) => unit.jobId) ?? [],
    );
    await clearStrategyCycleValidationTask();
    queuedJobIdsRef.current = [];
    setStoredTask(null);
    setProgress(null);
    setRollingReport(null);
    setReportBars([]);
    setSelectedRollingMode("latest");
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
          <div className="panel-heading"><div><span className="eyebrow">{c.settingsEyebrow}</span><strong>{c.settingsTitle}</strong></div></div>
          {loading ? <p className="cycle-muted"><LoaderCircle className="spin" size={15} />{c.loading}</p> : (
            <div className="cycle-form">
              <label><span>{c.instrument}</span><select value={selectedGroup?.key ?? ""} disabled={running} onChange={(event) => setSelectedKey(event.target.value)}>
                {groups.map((group) => <option key={group.key} value={group.key}>{group.instrument.name} · {group.instrument.code}</option>)}
              </select></label>
              {groups.length === 0 && <p className="cycle-warning">{c.noShortcuts}</p>}
              <label><span>{c.cycleScreeningInterval}</span><input type="number" min={1} max={252} step={1} value={screeningInterval} disabled={running} onChange={(event) => { const next = Math.max(1, Math.min(252, Math.trunc(Number(event.target.value) || 1))); setScreeningInterval(next); setEvaluationSessions((current) => Math.max(current, next + 1)); }} /></label>
              <label><span>{c.cycleScreeningPeriod}</span><input type="number" min={MIN_CYCLE_SCREENING_WINDOW} max={MAX_CYCLE_SCREENING_WINDOW} step={1} value={screeningWindow} disabled={running} onChange={(event) => setScreeningWindow(Math.max(MIN_CYCLE_SCREENING_WINDOW, Math.min(MAX_CYCLE_SCREENING_WINDOW, Math.trunc(Number(event.target.value) || MIN_CYCLE_SCREENING_WINDOW))))} /></label>
              <label><span>{c.evaluationSessions}</span><input type="number" min={Math.min(screeningInterval + 1, evaluationSessionMaximum)} max={evaluationSessionMaximum} step={1} value={evaluationSessions} disabled={running} onChange={(event) => setEvaluationSessions(Math.max(Math.min(screeningInterval + 1, evaluationSessionMaximum), Math.min(evaluationSessionMaximum, Math.trunc(Number(event.target.value) || screeningInterval + 1))))} /></label>
              <label><span>{c.objective}</span><select value={objective} disabled={running} onChange={(event) => setObjective(event.target.value as ScreeningObjective)}>
                {SCREENING_OBJECTIVES.map((value) => <option key={value} value={value}>{c.objectives[value]}</option>)}
              </select></label>
              <div className="cycle-form-row">
                <label><span>{c.initialCash}</span><input type="number" min={1} value={initialCash} disabled={running} onChange={(event) => setInitialCash(Math.max(1, Number(event.target.value) || 1))} /></label>
                <label><span>{c.commission}</span><input type="number" min={0} step="0.01" value={commissionPercent} disabled={running} onChange={(event) => setCommissionPercent(Math.max(0, Number(event.target.value) || 0))} /></label>
                <label><span>{c.slippage}</span><input type="number" min={0} step="0.01" value={slippagePercent} disabled={running} onChange={(event) => setSlippagePercent(Math.max(0, Number(event.target.value) || 0))} /></label>
              </div>
              <p className="cycle-hint">{c.calculationHint.replaceAll("{window}", String(screeningWindow)).replaceAll("{interval}", String(screeningInterval))}</p>
              <div className="cycle-actions">
                <button type="button" className="primary" disabled={running || !selectedGroup} onClick={() => void start()}><Play size={15} />{storedTask ? c.resume : c.start}</button>
                <button type="button" disabled={!running} onClick={pause}><Pause size={15} />{c.pause}</button>
                <button type="button" disabled={running} onClick={() => void reset()}><RotateCcw size={15} />{c.reset}</button>
              </div>
            </div>
          )}
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
              <p className="cycle-hint">{c.rollingPeriod.replace("{start}", rollingReport.evaluationStartTime).replace("{end}", rollingReport.evaluationEndTime).replace("{count}", String(rollingReport.decisionCount)).replace("{window}", String(rollingReport.screeningWindow)).replace("{interval}", String(rollingReport.screeningInterval))}</p>
              <div className="cycle-horizon-grid">{([
                [c.rollingBenchmark, rollingReport.benchmarkReturn],
                [c.rollingLatest, rollingReport.latestReturn],
                [c.rollingPrevious, rollingReport.previousReturn],
                [c.rollingHigher, rollingReport.higherReturn],
                [c.rollingLower, rollingReport.lowerReturn],
              ] as const).map(([label, value]) => <article key={label}>
                <strong>{label}</strong>
                <b className={value >= 0 ? "positive" : "negative"}>{formatReturn(value)}</b>
              </article>)}</div>
              <div className="cycle-rolling-chart-section">
                <strong>{c.rollingChartTitle}</strong>
                <div className="cycle-rolling-mode-buttons" role="group" aria-label={c.rollingChartTitle}>
                  {([
                    ["latest", c.rollingLatest],
                    ["previous", c.rollingPrevious],
                    ["higher", c.rollingHigher],
                    ["lower", c.rollingLower],
                  ] as const).map(([mode, label]) => <button key={mode} type="button" aria-pressed={selectedRollingMode === mode} onClick={() => setSelectedRollingMode(mode)}>{label}</button>)}
                </div>
                <StrategyCycleRollingChart
                  bars={reportBars}
                  rebalances={rollingReport.rebalances[selectedRollingMode]}
                  labels={{ price: c.price, buy: c.rollingBuy, sell: c.rollingSell, targetAllocation: c.targetAllocation, fillPrice: c.rollingFillPrice }}
                  ariaLabel={c.rollingChartAriaLabel.replace("{mode}", ({ latest: c.rollingLatest, previous: c.rollingPrevious, higher: c.rollingHigher, lower: c.rollingLower })[selectedRollingMode])}
                  dataKey={`${rollingReport.evaluationStartTime}:${rollingReport.evaluationEndTime}`}
                />
                <p className="cycle-hint">{c.rollingChartHint}</p>
              </div>
            </div> : <p className="cycle-empty">{c.noMatrix}</p>}
          </section>
        </div>
      </section>
    </main>
  );
}
