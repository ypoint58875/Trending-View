"use client";

import { Activity, ArrowLeft, LoaderCircle, Pause, Play, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { zhCN as copy } from "@/app/i18n/zh-CN";
import {
  DEFAULT_CYCLE_EVALUATION_SESSIONS,
  DEFAULT_CYCLE_FORWARD_HORIZONS,
  DEFAULT_CYCLE_SCREENING_WINDOWS,
  DEFAULT_CYCLE_UPDATE_INTERVALS,
  MAX_CYCLE_OPTIMIZATION_UNITS,
  barsAvailableAtCycleDecision,
  buildStrategyCycleMatrix,
  buildStrategyCycleSchedule,
  evaluateStrategyCycleEffectiveness,
  normalizeCycleValues,
  type StrategyCycleEffectivenessPoint,
  type StrategyCycleMatrixResult,
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
  localScreeningEngineAvailable,
  screeningJobRequest,
  waitForScreeningInLocalEngine,
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
import { resolveTrailingTradingSessionRange } from "@/lib/analysis/screening-validation";
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

interface ProgressState {
  completed: number;
  total: number;
  decisionTime: string;
  screeningWindow: number;
}

function parseNumberList(value: string, minimum: number, maximum: number): number[] {
  return normalizeCycleValues(
    value.split(/[,，\s]+/).map(Number),
    minimum,
    maximum,
  );
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
  if ("strategyId" in result) return copy.strategies[result.strategyId].name;
  const source = result as unknown as Record<string, unknown>;
  const names = "ABCDEFGHI".split("").flatMap((letter) => {
    const id = source[`strategy${letter}Id`];
    return typeof id === "string" ? [copy.strategies[id as StrategyId].name] : [];
  });
  return names.join(" + ");
}

function formatPercent(value: number): string {
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
  const [screeningWindowsText, setScreeningWindowsText] = useState(
    DEFAULT_CYCLE_SCREENING_WINDOWS.join(", "),
  );
  const [updateIntervalsText, setUpdateIntervalsText] = useState(
    DEFAULT_CYCLE_UPDATE_INTERVALS.join(", "),
  );
  const [evaluationSessions, setEvaluationSessions] = useState(
    DEFAULT_CYCLE_EVALUATION_SESSIONS,
  );
  const [objective, setObjective] = useState<ScreeningObjective>("balanced");
  const [initialCash, setInitialCash] = useState(100_000);
  const [commissionPercent, setCommissionPercent] = useState(0.03);
  const [slippagePercent, setSlippagePercent] = useState(0.02);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [storedTask, setStoredTask] = useState<StoredStrategyCycleValidationTask | null>(null);
  const [matrix, setMatrix] = useState<StrategyCycleMatrixResult[]>([]);
  const [effectiveness, setEffectiveness] = useState<StrategyCycleEffectivenessPoint[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const pauseRequestedRef = useRef(false);

  const groups = useMemo(() => groupSavedBacktests(records), [records]);
  const selectedGroup = groups.find((group) => group.key === selectedKey) ?? groups[0] ?? null;
  const screeningWindows = useMemo(
    () => parseNumberList(screeningWindowsText, 20, 2_000),
    [screeningWindowsText],
  );
  const updateIntervals = useMemo(
    () => parseNumberList(updateIntervalsText, 1, 252),
    [updateIntervalsText],
  );

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
      const nextGroups = groupSavedBacktests(nextRecords);
      const restoredKey = task ? savedBacktestInstrumentKey(task.instrument) : "";
      setSelectedKey(nextGroups.some((group) => group.key === restoredKey) ? restoredKey : nextGroups[0]?.key ?? "");
      if (task) {
        setScreeningWindowsText(task.screeningWindows.join(", "));
        setUpdateIntervalsText(task.updateIntervals.join(", "));
        setEvaluationSessions(task.evaluationSessions);
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

  const calculateReports = useCallback((
    series: MarketSeries,
    snapshots: StrategyCycleSelectionSnapshot[],
    windows: number[],
    intervals: number[],
    sessions: number,
  ) => {
    const schedule = buildStrategyCycleSchedule(series.bars.length, windows, intervals, sessions);
    if (!schedule) return;
    const settings = {
      initialCash,
      commissionRate: commissionPercent / 100,
      slippageRate: slippagePercent / 100,
      interval: DAILY_INTERVAL,
      executionPolicy: HISTORICAL_EXECUTION_POLICY,
    };
    setMatrix(buildStrategyCycleMatrix(
      series.bars,
      snapshots,
      windows,
      intervals,
      schedule.evaluationStartIndex,
      schedule.evaluationEndIndex,
      settings,
    ));
    setEffectiveness(evaluateStrategyCycleEffectiveness(
      series.bars,
      snapshots,
      DEFAULT_CYCLE_FORWARD_HORIZONS,
      settings,
    ));
  }, [commissionPercent, initialCash, slippagePercent]);

  const start = useCallback(async () => {
    if (!selectedGroup || running) return;
    setError("");
    setMatrix([]);
    setEffectiveness([]);
    if (screeningWindows.length === 0 || updateIntervals.length === 0) {
      setError(c.invalidPeriods);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    pauseRequestedRef.current = false;
    setRunning(true);
    let currentTask: Omit<StoredStrategyCycleValidationTask, "key" | "version" | "updatedAt"> | null = null;
    try {
      const marketResponse = await fetch(marketRequestUrl(selectedGroup.instrument), {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!marketResponse.ok) throw new Error(c.marketError);
      const series = await marketResponse.json() as MarketSeries;
      const schedule = buildStrategyCycleSchedule(
        series.bars.length,
        screeningWindows,
        updateIntervals,
        evaluationSessions,
      );
      if (!schedule) throw new Error(c.insufficientHistory);
      if (schedule.optimizationUnits > MAX_CYCLE_OPTIMIZATION_UNITS) {
        throw new Error(c.tooManyUnits.replace("{count}", String(schedule.optimizationUnits)));
      }
      const signature = taskSignature({
        instrument: selectedGroup.instrument,
        series,
        screeningWindows,
        updateIntervals,
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
        screeningWindows,
        updateIntervals,
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
      const queuedJobByKey = new Map<string, string>();
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
          queuedJobByKey.set(unit.unitKey, jobId);
        });
        currentTask = {
          ...currentTask,
          queuedUnits: [...queuedByKey.values()],
        };
        await writeStrategyCycleValidationTask(currentTask);
        setStoredTask({ ...currentTask, key: "latest", version: 2, updatedAt: new Date().toISOString() });
      }

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
          const queuedJobId = queuedJobByKey.get(unitKey);
          if (localEngine && !queuedJobId) throw new Error(c.localEngineError);
          const outcome = localEngine
            ? await waitForScreeningInLocalEngine(
                queuedJobId!,
                workerOptions,
              )
            : await runScreeningInWorker(
                availableBars,
                {
                  ...settings,
                  startTime: range.startTime,
                  endTime: range.endTime,
                },
                { mode: "sample", periods: [{ sessions: screeningWindow, weight: 100 }] },
                workerOptions,
              );
          const best = selectBestShortcutScreeningResult(
            outcome.singleResults,
            outcome.results,
            objective,
          );
          if (!best) throw new Error(c.noResult);
          snapshots.push({
            decisionIndex,
            decisionTime: series.bars[decisionIndex]!.time,
            screeningWindow,
            plan: screeningResultPlan(best.result),
            fixedRelativeLongStrategy:
              best.kind === "combination" ? best.result.relativeLongStrategy : null,
            label: resultLabel(best.result),
          });
          completed.add(unitKey);
          currentTask = {
            ...currentTask,
            completedUnits: completed.size,
            snapshots,
            status: "running",
          };
          await writeStrategyCycleValidationTask(currentTask);
          setStoredTask({ ...currentTask, key: "latest", version: 2, updatedAt: new Date().toISOString() });
        }
      }
      currentTask = { ...currentTask, completedUnits: completed.size, snapshots, status: "completed" };
      await writeStrategyCycleValidationTask(currentTask);
      setStoredTask({ ...currentTask, key: "latest", version: 2, updatedAt: new Date().toISOString() });
      setProgress({
        completed: completed.size,
        total: schedule.optimizationUnits,
        decisionTime: snapshots.at(-1)?.decisionTime ?? "",
        screeningWindow: snapshots.at(-1)?.screeningWindow ?? 0,
      });
      calculateReports(series, snapshots, screeningWindows, updateIntervals, evaluationSessions);
    } catch (caught) {
      if ((caught as Error).name === "AbortError") {
        if (pauseRequestedRef.current && currentTask) {
          await cancelScreeningInLocalEngine(
            currentTask.queuedUnits.map((unit) => unit.jobId),
          );
        }
        if (currentTask) await writeStrategyCycleValidationTask({ ...currentTask, status: "paused" });
      } else {
        const message = caught instanceof Error ? caught.message : c.unknownError;
        setError(message);
        if (currentTask) await writeStrategyCycleValidationTask({ ...currentTask, status: "error", lastError: message });
      }
    } finally {
      abortRef.current = null;
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
    screeningWindows,
    selectedGroup,
    slippagePercent,
    storedTask,
    updateIntervals,
  ]);

  const reset = async () => {
    pauseRequestedRef.current = true;
    abortRef.current?.abort();
    await cancelScreeningInLocalEngine(
      storedTask?.queuedUnits.map((unit) => unit.jobId) ?? [],
    );
    await clearStrategyCycleValidationTask();
    setStoredTask(null);
    setProgress(null);
    setMatrix([]);
    setEffectiveness([]);
    setError("");
  };

  const pause = () => {
    pauseRequestedRef.current = true;
    abortRef.current?.abort();
  };

  const best = matrix.length
    ? [...matrix].sort((left, right) => right.performance.score - left.performance.score)[0]
    : null;

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
              <label><span>{c.screeningWindows}</span><input value={screeningWindowsText} disabled={running} onChange={(event) => setScreeningWindowsText(event.target.value)} /></label>
              <label><span>{c.updateIntervals}</span><input value={updateIntervalsText} disabled={running} onChange={(event) => setUpdateIntervalsText(event.target.value)} /></label>
              <label><span>{c.evaluationSessions}</span><input type="number" min={120} max={1500} value={evaluationSessions} disabled={running} onChange={(event) => setEvaluationSessions(Math.max(120, Math.min(1500, Number(event.target.value) || 120)))} /></label>
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
            {best && <div className="cycle-recommendation"><span>{c.currentBest}</span><strong>{best.screeningWindow}{c.dayWindow} · {best.updateInterval}{c.dayUpdate}</strong><small>{c.currentBestNote}</small></div>}
            {matrix.length ? <div className="cycle-table-wrap"><table><thead><tr><th>{c.screeningWindow}</th><th>{c.updateInterval}</th><th>{c.totalReturn}</th><th>{c.sharpe}</th><th>{c.maxDrawdown}</th><th>{c.rebalances}</th></tr></thead><tbody>
              {matrix.map((result) => <tr key={`${result.screeningWindow}:${result.updateInterval}`} className={result === best ? "best" : ""}><td>{result.screeningWindow}</td><td>{result.updateInterval}</td><td className={result.performance.totalReturn >= 0 ? "positive" : "negative"}>{formatPercent(result.performance.totalReturn)}</td><td>{result.performance.sharpe.toFixed(2)}</td><td>{formatPercent(result.performance.maxDrawdown)}</td><td>{result.performance.tradeCount}</td></tr>)}
            </tbody></table></div> : <p className="cycle-empty">{c.noMatrix}</p>}
          </section>

          <section className="panel cycle-effectiveness-card">
            <div className="panel-heading"><div><span className="eyebrow">{c.effectivenessEyebrow}</span><strong>{c.effectivenessTitle}</strong></div></div>
            {effectiveness.length ? <div className="cycle-effectiveness-grid">{effectiveness.map((point) => <div key={point.sessions}><span>{point.sessions}{c.sessionsAfter}</span><strong className={point.medianReturn >= 0 ? "positive" : "negative"}>{formatPercent(point.medianReturn)}</strong><small>{c.excess} {formatPercent(point.medianExcessReturn)} · {c.positiveRate} {(point.positiveRate * 100).toFixed(0)}% · n={point.sampleCount}</small></div>)}</div> : <p className="cycle-empty">{c.noEffectiveness}</p>}
          </section>
        </div>
      </section>
    </main>
  );
}
