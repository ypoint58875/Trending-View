import {
  ScreeningValidationError,
  runScreeningWithValidation,
  type RunScreeningWithValidationOptions,
  type ScreeningValidationConfig,
  type ScreeningValidationOutcome,
} from "./screening-validation";
import type { BacktestSettings } from "./backtest";
import type {
  ScreeningWorkerRequest,
  ScreeningWorkerResponse,
} from "./screening-worker-protocol";
import type { MarketBar, MarketInterval } from "@/lib/market/types";
import { packMarketBars } from "./screening-worker-bars";
import {
  SCREENING_POSITIONING_MODEL_VERSION,
  SCREENING_RESULT_MODEL_VERSION,
} from "./strategy-combinations";
import { runScreeningInLocalEngine } from "./screening-local-engine-client";
import type { LocalScreeningEngineStatus } from "./screening-local-engine-protocol";

export type WorkerScreeningOptions = Pick<
  RunScreeningWithValidationOptions,
  | "objective"
  | "entryFilters"
  | "excludedStrategyIds"
  | "onProgress"
  | "onValidationProgress"
> & {
  signal?: AbortSignal;
  checkpointNamespace?: string;
  onEngineStatus?: (status: LocalScreeningEngineStatus) => void;
};

let nextScreeningWorkerRequestId = 0;

function hashText(hash: number, value: string): number {
  let next = hash;
  for (let index = 0; index < value.length; index += 1) {
    next ^= value.charCodeAt(index);
    next = Math.imul(next, 16_777_619);
  }
  return next >>> 0;
}

export function buildCheckpointIdentity(
  bars: readonly MarketBar[],
  settings: Omit<BacktestSettings, "interval"> & {
    interval: MarketInterval;
  },
  config: ScreeningValidationConfig,
  options: WorkerScreeningOptions,
) {
  let hash = 2_166_136_261;
  for (const bar of bars) {
    hash = hashText(
      hash,
      `${bar.time}|${bar.open}|${bar.high}|${bar.low}|${bar.close}|${bar.volume};`,
    );
  }
  const signature = JSON.stringify({
    positioningModelVersion: SCREENING_POSITIONING_MODEL_VERSION,
    resultModelVersion: SCREENING_RESULT_MODEL_VERSION,
    namespace: options.checkpointNamespace ?? "default",
    barsHash: hash.toString(16),
    barCount: bars.length,
    settings,
    config,
    objective: options.objective,
    entryFilters: options.entryFilters,
    excludedStrategyIds: options.excludedStrategyIds,
  });
  return {
    key: `screening:${options.checkpointNamespace ?? "default"}`,
    signature,
  };
}

function abortError() {
  return new DOMException("Screening cancelled", "AbortError");
}

function runScreeningInBrowserWorker(
  bars: MarketBar[],
  settings: Omit<BacktestSettings, "interval"> & {
    interval: MarketInterval;
  },
  config: ScreeningValidationConfig,
  options: WorkerScreeningOptions = {},
): Promise<ScreeningValidationOutcome> {
  if (typeof Worker === "undefined") {
    return runScreeningWithValidation(bars, settings, config, options);
  }
  if (options.signal?.aborted) return Promise.reject(abortError());

  const requestId = `screening-${Date.now()}-${nextScreeningWorkerRequestId++}`;
  const checkpoint = buildCheckpointIdentity(bars, settings, config, options);
  return new Promise((resolve, reject) => {
    let settled = false;
    let worker: Worker;
    const createRequest = (): ScreeningWorkerRequest => ({
        type: "run",
        requestId,
        bars: packMarketBars(bars),
        settings,
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
      });
    const finish = (
      callback: () => void,
    ) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener("abort", onAbort);
      worker.terminate();
      callback();
    };
    const onAbort = () => {
      const cancelRequest: ScreeningWorkerRequest = {
        type: "cancel",
        requestId,
      };
      worker.postMessage(cancelRequest);
      finish(() => reject(abortError()));
    };

    const handleMessage = (event: MessageEvent<ScreeningWorkerResponse>) => {
      const response = event.data;
      if (response.requestId !== requestId) return;
      if (response.type === "restart") {
        worker.terminate();
        startWorker();
        return;
      }
      if (response.type === "optimization-progress") {
        options.onProgress?.(response.progress);
        return;
      }
      if (response.type === "validation-progress") {
        options.onValidationProgress?.(response.progress);
        return;
      }
      if (response.type === "result") {
        finish(() => resolve(response.outcome));
        return;
      }
      finish(() =>
        reject(
          response.code
            ? new ScreeningValidationError(response.code)
            : new Error(response.message),
        ),
      );
    };
    const handleError = (event: ErrorEvent) => {
      finish(() =>
        reject(new Error(event.message || "Screening worker failed")),
      );
    };
    const startWorker = () => {
      worker = new Worker(
        new URL("./screening.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.onmessage = handleMessage;
      worker.onerror = handleError;
      const request = createRequest();
      if (request.type === "run") {
        worker.postMessage(request, [request.bars.values.buffer]);
      }
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });
    startWorker();
  });
}

export async function runScreeningInWorker(
  bars: MarketBar[],
  settings: Omit<BacktestSettings, "interval"> & {
    interval: MarketInterval;
  },
  config: ScreeningValidationConfig,
  options: WorkerScreeningOptions = {},
): Promise<ScreeningValidationOutcome> {
  if (options.signal?.aborted) throw abortError();
  const checkpoint = buildCheckpointIdentity(bars, settings, config, options);
  const localOutcome = await runScreeningInLocalEngine(
    bars,
    settings,
    config,
    options,
    checkpoint,
  );
  if (localOutcome) return localOutcome;
  return runScreeningInBrowserWorker(bars, settings, config, options);
}
