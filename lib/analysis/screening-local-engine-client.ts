import type { BacktestSettings } from "./backtest";
import type { MarketBar, MarketInterval } from "@/lib/market/types";
import type {
  ScreeningValidationConfig,
  ScreeningValidationOutcome,
} from "./screening-validation";
import type { WorkerScreeningOptions } from "./screening-worker-client";
import {
  LOCAL_SCREENING_ENGINE_URL,
  LOCAL_SCREENING_ENGINE_VERSION,
  type LocalScreeningJobBatchUnit,
  type LocalScreeningJobRequest,
  type LocalScreeningJobSnapshot,
} from "./screening-local-engine-protocol";
import {
  LOCAL_SCREENING_BINARY_CONTENT_TYPE,
  encodeLocalScreeningJobBatchRequest,
  encodeLocalScreeningJobRequest,
} from "./screening-local-engine-bars";

const HEALTH_TIMEOUT_MS = 800;
const POLL_INTERVAL_MS = 200;
const COMPLETED_RESULT_READ_ATTEMPTS = 5;

function abortError() {
  return new DOMException("Screening cancelled", "AbortError");
}

export async function localScreeningEngineAvailable(): Promise<boolean> {
  if (
    typeof window === "undefined" ||
    !["127.0.0.1", "localhost"].includes(window.location.hostname)
  ) {
    return false;
  }
  try {
    const response = await fetch(`${LOCAL_SCREENING_ENGINE_URL}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    if (!response.ok) return false;
    const payload = (await response.json()) as {
      screeningEngine?: boolean;
      screeningEngineVersion?: number;
    };
    return (
      payload.screeningEngine === true &&
      payload.screeningEngineVersion === LOCAL_SCREENING_ENGINE_VERSION
    );
  } catch {
    return false;
  }
}

export function screeningJobRequest(
  bars: MarketBar[],
  settings: Omit<BacktestSettings, "interval"> & {
    interval: MarketInterval;
  },
  config: ScreeningValidationConfig,
  options: WorkerScreeningOptions,
  checkpoint: { key: string; signature: string },
): LocalScreeningJobRequest {
  const { executionContext: _executionContext, ...serializableSettings } =
    settings;
  void _executionContext;
  return {
    version: LOCAL_SCREENING_ENGINE_VERSION,
    bars,
    settings: serializableSettings,
    config,
    checkpoint,
    options: {
      objective: options.objective,
      entryFilters: options.entryFilters
        ? [...options.entryFilters]
        : undefined,
      excludedStrategyIds: options.excludedStrategyIds
        ? [...options.excludedStrategyIds]
        : undefined,
    },
  };
}

export async function enqueueScreeningBatchInLocalEngine(
  bars: MarketBar[],
  jobs: LocalScreeningJobBatchUnit[],
  signal?: AbortSignal,
): Promise<string[] | null> {
  if (signal?.aborted) throw abortError();
  const requestBody = encodeLocalScreeningJobBatchRequest({
    version: LOCAL_SCREENING_ENGINE_VERSION,
    bars,
    jobs,
  });
  try {
    const response = await fetch(
      `${LOCAL_SCREENING_ENGINE_URL}/screening/job-batches`,
      {
        method: "POST",
        headers: { "Content-Type": LOCAL_SCREENING_BINARY_CONTENT_TYPE },
        body: requestBody,
        signal,
      },
    );
    if (!response.ok) return null;
    const created = (await response.json()) as { jobIds?: string[] };
    return created.jobIds?.length === jobs.length ? created.jobIds : null;
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    return null;
  }
}

export async function enqueueScreeningInLocalEngine(
  bars: MarketBar[],
  settings: Omit<BacktestSettings, "interval"> & {
    interval: MarketInterval;
  },
  config: ScreeningValidationConfig,
  options: WorkerScreeningOptions,
  checkpoint: { key: string; signature: string },
): Promise<string | null> {
  if (options.signal?.aborted) throw abortError();
  const requestBody = encodeLocalScreeningJobRequest(
    screeningJobRequest(bars, settings, config, options, checkpoint),
  );
  try {
    const response = await fetch(`${LOCAL_SCREENING_ENGINE_URL}/screening/jobs`, {
      method: "POST",
      headers: { "Content-Type": LOCAL_SCREENING_BINARY_CONTENT_TYPE },
      body: requestBody,
      signal: options.signal,
    });
    if (!response.ok) return null;
    const created = (await response.json()) as { jobId?: string };
    return created.jobId ?? null;
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    return null;
  }
}

export async function cancelScreeningInLocalEngine(
  jobIds: readonly string[],
): Promise<void> {
  await Promise.allSettled(
    [...new Set(jobIds)].map((jobId) =>
      fetch(`${LOCAL_SCREENING_ENGINE_URL}/screening/jobs/${jobId}`, {
        method: "DELETE",
        keepalive: true,
      }),
    ),
  );
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timeout = window.setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        reject(abortError());
      },
      { once: true },
    );
  });
}

export async function runScreeningInLocalEngine(
  bars: MarketBar[],
  settings: Omit<BacktestSettings, "interval"> & {
    interval: MarketInterval;
  },
  config: ScreeningValidationConfig,
  options: WorkerScreeningOptions,
  checkpoint: { key: string; signature: string },
): Promise<ScreeningValidationOutcome | null> {
  if (!(await localScreeningEngineAvailable())) return null;
  if (options.signal?.aborted) throw abortError();
  const createJob = () =>
    enqueueScreeningInLocalEngine(bars, settings, config, options, checkpoint);
  const jobId = await createJob();
  if (!jobId) return null;
  return waitForScreeningInLocalEngine(jobId, options, createJob);
}

export async function waitForScreeningInLocalEngine(
  jobId: string,
  options: WorkerScreeningOptions,
  restoreJob?: () => Promise<string | null>,
): Promise<ScreeningValidationOutcome> {
  let jobUrl = `${LOCAL_SCREENING_ENGINE_URL}/screening/jobs/${jobId}`;
  const cancel = () => {
    void fetch(jobUrl, { method: "DELETE", keepalive: true }).catch(() => {});
  };
  if (!options.preserveLocalJobOnAbort) {
    options.signal?.addEventListener("abort", cancel, { once: true });
  }
  let lastProgress = "";
  let lastValidationProgress = "";
  let reconnectAttempts = 0;
  try {
    while (true) {
      if (options.signal?.aborted) throw abortError();
      let statusResponse: Response;
      try {
        statusResponse = await fetch(jobUrl, {
          cache: "no-store",
          signal: options.signal,
        });
      } catch (error) {
        if ((error as Error).name === "AbortError") throw error;
        statusResponse = new Response(null, { status: 503 });
      }
      if (!statusResponse.ok) {
        reconnectAttempts += 1;
        if (reconnectAttempts > 20) {
          throw new Error("Local screening engine job is unavailable");
        }
        await delay(500, options.signal);
        try {
          const restoredJobId = await restoreJob?.();
          if (restoredJobId) {
            jobUrl = `${LOCAL_SCREENING_ENGINE_URL}/screening/jobs/${restoredJobId}`;
          }
        } catch (error) {
          if ((error as Error).name === "AbortError") throw error;
        }
        continue;
      }
      reconnectAttempts = 0;
      const snapshot = (await statusResponse.json()) as LocalScreeningJobSnapshot;
      if (snapshot.engine) options.onEngineStatus?.(snapshot.engine);
      if (snapshot.progress) {
        const serialized = JSON.stringify(snapshot.progress);
        if (serialized !== lastProgress) {
          lastProgress = serialized;
          options.onProgress?.(snapshot.progress);
        }
      }
      if (snapshot.validationProgress) {
        const serialized = JSON.stringify(snapshot.validationProgress);
        if (serialized !== lastValidationProgress) {
          lastValidationProgress = serialized;
          options.onValidationProgress?.(snapshot.validationProgress);
        }
      }
      if (snapshot.status === "completed") {
        for (
          let attempt = 1;
          attempt <= COMPLETED_RESULT_READ_ATTEMPTS;
          attempt += 1
        ) {
          try {
            const resultResponse = await fetch(`${jobUrl}/result`, {
              cache: "no-store",
              signal: options.signal,
            });
            if (resultResponse.ok) {
              return (await resultResponse.json()) as ScreeningValidationOutcome;
            }
          } catch (error) {
            if ((error as Error).name === "AbortError") throw error;
          }
          if (attempt < COMPLETED_RESULT_READ_ATTEMPTS) {
            await delay(POLL_INTERVAL_MS, options.signal);
          }
        }
        throw new Error("Local screening engine result is unavailable");
      }
      if (snapshot.status === "cancelled") throw abortError();
      if (snapshot.status === "error") {
        throw new Error(
          snapshot.error?.message ?? "Local screening engine failed",
        );
      }
      await delay(POLL_INTERVAL_MS, options.signal);
    }
  } finally {
    if (!options.preserveLocalJobOnAbort) {
      options.signal?.removeEventListener("abort", cancel);
    }
  }
}
