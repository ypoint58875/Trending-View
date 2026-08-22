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
  type LocalScreeningJobRequest,
  type LocalScreeningJobSnapshot,
} from "./screening-local-engine-protocol";

const HEALTH_TIMEOUT_MS = 800;
const POLL_INTERVAL_MS = 200;

function abortError() {
  return new DOMException("Screening cancelled", "AbortError");
}

async function localEngineAvailable(): Promise<boolean> {
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
  if (!(await localEngineAvailable())) return null;
  if (options.signal?.aborted) throw abortError();
  const { executionContext: _executionContext, ...serializableSettings } =
    settings;
  void _executionContext;
  const request: LocalScreeningJobRequest = {
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
  const createJob = () =>
    fetch(`${LOCAL_SCREENING_ENGINE_URL}/screening/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: options.signal,
    });
  let response: Response;
  try {
    response = await createJob();
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    return null;
  }
  if (!response.ok) return null;
  const created = (await response.json()) as { jobId?: string };
  if (!created.jobId) return null;
  let jobUrl = `${LOCAL_SCREENING_ENGINE_URL}/screening/jobs/${created.jobId}`;
  const cancel = () => {
    void fetch(jobUrl, { method: "DELETE", keepalive: true }).catch(() => {});
  };
  options.signal?.addEventListener("abort", cancel, { once: true });
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
          const restoredResponse = await createJob();
          if (restoredResponse.ok) {
            const restored = (await restoredResponse.json()) as {
              jobId?: string;
            };
            if (restored.jobId) {
              jobUrl = `${LOCAL_SCREENING_ENGINE_URL}/screening/jobs/${restored.jobId}`;
            }
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
      if (snapshot.status === "completed" && snapshot.outcome) {
        return snapshot.outcome;
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
    options.signal?.removeEventListener("abort", cancel);
  }
}
