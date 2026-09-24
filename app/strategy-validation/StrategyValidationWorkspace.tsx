"use client";

import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { zhCN as copy } from "@/app/i18n/zh-CN";
import { StrategyCycleTransitionChart } from "@/app/components/StrategyCycleTransitionChart";
import {
  CYCLE_DAILY_SCREENING_WINDOW,
  CYCLE_DAILY_UPDATE_INTERVAL,
  DEFAULT_CYCLE_EVALUATION_SESSIONS,
  MAX_CYCLE_OPTIMIZATION_UNITS,
  MIN_CYCLE_DAILY_EVALUATION_SESSIONS,
  barsAvailableAtCycleDecision,
  buildStrategyCycleDailyValidationReport,
  buildStrategyCycleDailySchedule,
  type StrategyCycleDailyValidationReport,
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
const DAILY_SCREENING_WINDOWS = [CYCLE_DAILY_SCREENING_WINDOW];
const DAILY_UPDATE_INTERVALS = [CYCLE_DAILY_UPDATE_INTERVAL];

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

function formatGroupedAdvantage(
  value: number | null,
  labels: {
    newBetter: string;
    oldBetter: string;
    equal: string;
    insufficient: string;
  },
): string {
  if (value === null) return labels.insufficient;
  const template = value > 0
    ? labels.newBetter
    : value < 0
      ? labels.oldBetter
      : labels.equal;
  return template.replace("{average}", formatReturn(value));
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
    dailySchedule: "evaluation-minus-148-v1",
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
  const [objective, setObjective] = useState<ScreeningObjective>("totalReturn");
  const [initialCash, setInitialCash] = useState(100_000);
  const [commissionPercent, setCommissionPercent] = useState(0.03);
  const [slippagePercent, setSlippagePercent] = useState(0.02);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [storedTask, setStoredTask] = useState<StoredStrategyCycleValidationTask | null>(null);
  const [dailyReport, setDailyReport] = useState<StrategyCycleDailyValidationReport | null>(null);
  const [selectedTransitionIndex, setSelectedTransitionIndex] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const pauseRequestedRef = useRef(false);
  const runningRef = useRef(false);
  const queuedJobIdsRef = useRef<string[]>([]);
  const restoredReportSignatureRef = useRef("");

  const groups = useMemo(() => groupSavedBacktests(records), [records]);
  const selectedGroup = groups.find((group) => group.key === selectedKey) ?? groups[0] ?? null;
  const selectedTransition = dailyReport?.transitions[
    Math.min(selectedTransitionIndex, Math.max(dailyReport.transitions.length - 1, 0))
  ] ?? null;

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch("/api/saved-backtests", { cache: "no-store" }).then((response) => response.json()),
      readLatestStrategyCycleValidationTask(),
    ]).then(([payload, task]) => {
      if (!active) return;
      const nextRecords = (payload as { savedBacktests?: SavedBacktestRecord[] }).savedBacktests ?? [];
      setRecords(nextRecords);
      setStoredTask(task);
      queuedJobIdsRef.current = task?.queuedUnits.map((unit) => unit.jobId) ?? [];
      const nextGroups = groupSavedBacktests(nextRecords);
      const restoredKey = task ? savedBacktestInstrumentKey(task.instrument) : "";
      setSelectedKey(nextGroups.some((group) => group.key === restoredKey) ? restoredKey : nextGroups[0]?.key ?? "");
      if (task) {
        setEvaluationSessions(Math.max(
          MIN_CYCLE_DAILY_EVALUATION_SESSIONS,
          Math.min(512, task.evaluationSessions),
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
    restoredCosts?: {
      initialCash: number;
      commissionPercent: number;
      slippagePercent: number;
    },
  ) => {
    const schedule = buildStrategyCycleDailySchedule(series.bars.length, sessions);
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
    const report = buildStrategyCycleDailyValidationReport(
      series.bars,
      snapshots,
      settings,
    );
    setDailyReport(report);
    setSelectedTransitionIndex(Math.max(0, report.transitions.length - 1));
  }, [commissionPercent, initialCash, slippagePercent]);

  useEffect(() => {
    if (
      !storedTask ||
      storedTask.status !== "completed" ||
      dailyReport ||
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
      calculateReports(
        series,
        storedTask.snapshots,
        storedTask.evaluationSessions,
        {
          initialCash: storedTask.initialCash,
          commissionPercent: storedTask.commissionPercent,
          slippagePercent: storedTask.slippagePercent,
        },
      );
    }).catch((caught) => {
      if ((caught as Error).name === "AbortError") return;
      restoredReportSignatureRef.current = "";
      setError(c.marketError);
    });
    return () => controller.abort();
  }, [c.marketError, calculateReports, dailyReport, running, storedTask]);

  const start = useCallback(async () => {
    if (!selectedGroup || running) return;
    setError("");
    setDailyReport(null);
    setSelectedTransitionIndex(0);
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
      const schedule = buildStrategyCycleDailySchedule(
        series.bars.length,
        evaluationSessions,
      );
      if (!schedule) throw new Error(c.insufficientHistory);
      if (schedule.optimizationUnits > MAX_CYCLE_OPTIMIZATION_UNITS) {
        throw new Error(c.tooManyUnits.replace("{count}", String(schedule.optimizationUnits)));
      }
      const signature = taskSignature({
        instrument: selectedGroup.instrument,
        series,
        screeningWindows: DAILY_SCREENING_WINDOWS,
        updateIntervals: DAILY_UPDATE_INTERVALS,
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
        screeningWindows: DAILY_SCREENING_WINDOWS,
        updateIntervals: DAILY_UPDATE_INTERVALS,
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
          for (const screeningWindow of DAILY_SCREENING_WINDOWS) {
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
          for (const screeningWindow of DAILY_SCREENING_WINDOWS) {
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
      calculateReports(series, snapshots, evaluationSessions);
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
    setDailyReport(null);
    setSelectedTransitionIndex(0);
    setError("");
  };

  const pause = () => {
    pauseRequestedRef.current = true;
    abortRef.current?.abort();
  };

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
              <div className="cycle-fixed-method"><span>{c.fixedScreeningWindow}</span><strong>{CYCLE_DAILY_SCREENING_WINDOW} {c.sessionUnit}</strong><span>{c.fixedUpdateInterval}</span><strong>{c.everyTradingDay}</strong></div>
              <label><span>{c.evaluationSessions}</span><input type="number" min={MIN_CYCLE_DAILY_EVALUATION_SESSIONS} max={512} value={evaluationSessions} disabled={running} onChange={(event) => setEvaluationSessions(Math.max(MIN_CYCLE_DAILY_EVALUATION_SESSIONS, Math.min(512, Number(event.target.value) || MIN_CYCLE_DAILY_EVALUATION_SESSIONS)))} /></label>
              <label><span>{c.objective}</span><select value={objective} disabled={running} onChange={(event) => setObjective(event.target.value as ScreeningObjective)}>
                {SCREENING_OBJECTIVES.map((value) => <option key={value} value={value}>{c.objectives[value]}</option>)}
              </select></label>
              <div className="cycle-form-row">
                <label><span>{c.initialCash}</span><input type="number" min={1} value={initialCash} disabled={running} onChange={(event) => setInitialCash(Math.max(1, Number(event.target.value) || 1))} /></label>
                <label><span>{c.commission}</span><input type="number" min={0} step="0.01" value={commissionPercent} disabled={running} onChange={(event) => setCommissionPercent(Math.max(0, Number(event.target.value) || 0))} /></label>
                <label><span>{c.slippage}</span><input type="number" min={0} step="0.01" value={slippagePercent} disabled={running} onChange={(event) => setSlippagePercent(Math.max(0, Number(event.target.value) || 0))} /></label>
              </div>
              <p className="cycle-hint">{c.calculationHint}</p>
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
            <p className="cycle-hint">{c.dailyValidationNote}</p>
            {dailyReport ? <>
              <div className="cycle-report-section">
                <div className="cycle-report-heading"><div><span className="eyebrow">{c.transitionEyebrow}</span><strong>{c.transitionTitle}</strong></div><small>{c.transitionHint}</small></div>
                <div className="cycle-horizon-grid">{dailyReport.transitionSummaries.map((summary) => <article key={summary.sessions}>
                  <strong>{summary.sessions} {c.sessionUnit}</strong><small>{c.samples.replace("{count}", String(summary.sampleCount))}</small>
                  <dl>
                    <div><dt>{c.medianOldReturn}</dt><dd>{formatReturn(summary.medianOldReturn)}</dd></div>
                    <div><dt>{c.medianNewReturn}</dt><dd>{formatReturn(summary.medianNewReturn)}</dd></div>
                    <div><dt>{c.medianReturnDifference}</dt><dd className={(summary.medianReturnDifference ?? 0) >= 0 ? "positive" : "negative"}>{formatReturn(summary.medianReturnDifference)}</dd></div>
                    <div><dt>{c.meanReturnDifference}</dt><dd className={(summary.meanReturnDifference ?? 0) >= 0 ? "positive" : "negative"}>{formatReturn(summary.meanReturnDifference)}</dd></div>
                    <div><dt>{c.returnDifferenceRange}</dt><dd>{formatReturn(summary.minimumReturnDifference)} ～ {formatReturn(summary.maximumReturnDifference)}</dd></div>
                    <div><dt>{c.comparisonCounts}</dt><dd>{c.comparisonCountsValue.replace("{new}", String(summary.newBetterCount)).replace("{old}", String(summary.oldBetterCount))}</dd></div>
                  </dl>
                  <div className="cycle-screening-split">
                    <strong>{c.screeningSplitTitle}</strong>
                    <span><small>{c.screeningNewLed} · {summary.screeningNewLedCount}</small><b className={(summary.screeningNewLedMeanDifference ?? 0) > 0 ? "positive" : (summary.screeningNewLedMeanDifference ?? 0) < 0 ? "negative" : undefined}>{formatGroupedAdvantage(summary.screeningNewLedMeanDifference, { newBetter: c.groupedNewBetter, oldBetter: c.groupedOldBetter, equal: c.groupedEqual, insufficient: c.groupedInsufficient })}</b></span>
                    <span><small>{c.screeningOldLed} · {summary.screeningOldLedCount}</small><b className={(summary.screeningOldLedMeanDifference ?? 0) > 0 ? "positive" : (summary.screeningOldLedMeanDifference ?? 0) < 0 ? "negative" : undefined}>{formatGroupedAdvantage(summary.screeningOldLedMeanDifference, { newBetter: c.groupedNewBetter, oldBetter: c.groupedOldBetter, equal: c.groupedEqual, insufficient: c.groupedInsufficient })}</b></span>
                  </div>
                </article>)}</div>
              </div>

              {selectedTransition && <div className="cycle-transition-explorer">
                <div className="cycle-transition-navigator">
                  <div><span className="eyebrow">{c.pairEyebrow}</span><strong>{c.pairPosition.replace("{current}", String(selectedTransitionIndex + 1)).replace("{total}", String(dailyReport.transitions.length))}</strong></div>
                  <div className="cycle-transition-nav-buttons">
                    <button type="button" aria-label={c.previousPair} title={c.previousPair} disabled={selectedTransitionIndex <= 0} onClick={() => setSelectedTransitionIndex((value) => Math.max(0, value - 1))}><ArrowUp size={16} /></button>
                    <button type="button" aria-label={c.nextPair} title={c.nextPair} disabled={selectedTransitionIndex >= dailyReport.transitions.length - 1} onClick={() => setSelectedTransitionIndex((value) => Math.min(dailyReport.transitions.length - 1, value + 1))}><ArrowDown size={16} /></button>
                  </div>
                </div>
                <div className="cycle-transition-pair-title"><time>{selectedTransition.decisionTime}</time><span>{selectedTransition.oldLabel}</span><b>→</b><span>{selectedTransition.newLabel}</span></div>
                <div className="cycle-transition-meta">
                  <span>{c.oldDuration.replace("{sessions}", String(selectedTransition.oldDurationSessions))}</span>
                  <span>{c.performanceWindow.replace("{sessions}", String(selectedTransition.requestedPerformanceSessions)).replace("{start}", selectedTransition.performanceStartTime).replace("{end}", selectedTransition.performanceEndTime)}</span>
                  <span>{c.screeningPairDifference.replace("{old}", formatReturn(selectedTransition.screeningOldReturn)).replace("{new}", formatReturn(selectedTransition.screeningNewReturn)).replace("{difference}", formatReturn(selectedTransition.screeningReturnDifference))}</span>
                </div>
                <div className="cycle-transition-horizons">{selectedTransition.horizons.map((horizon) => <span key={horizon.sessions}>
                  <small>{c.forwardSessions.replace("{sessions}", String(horizon.sessions))}</small>
                  <b>{c.oldShort} {formatReturn(horizon.oldReturn)}</b><b>{c.newShort} {formatReturn(horizon.newReturn)}</b>
                  <em className={(horizon.returnDifference ?? 0) >= 0 ? "positive" : "negative"}>{c.differenceShort} {formatReturn(horizon.returnDifference)}</em>
                </span>)}</div>
                <StrategyCycleTransitionChart
                  transition={selectedTransition}
                  labels={{ oldStrategy: c.oldStrategyCurve, newStrategy: c.newStrategyCurve, difference: c.differenceCurve, returnUnit: c.returnUnit, changeDate: c.changeDate, oldRebalance: c.oldRebalance, newRebalance: c.newRebalance, targetAllocation: c.targetAllocation }}
                  ariaLabel={c.transitionChartAriaLabel.replace("{date}", selectedTransition.decisionTime)}
                />
                <p className="cycle-hint">{c.transitionChartNote}</p>
              </div>}
            </> : <p className="cycle-empty">{c.noMatrix}</p>}
          </section>
        </div>
      </section>
    </main>
  );
}
