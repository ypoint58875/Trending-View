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

type WorkerScreeningOptions = Pick<
  RunScreeningWithValidationOptions,
  "objective" | "entryFilters" | "onProgress" | "onValidationProgress"
> & {
  signal?: AbortSignal;
};

let nextScreeningWorkerRequestId = 0;

function abortError() {
  return new DOMException("Screening cancelled", "AbortError");
}

export function runScreeningInWorker(
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
  const worker = new Worker(
    new URL("./screening.worker.ts", import.meta.url),
    { type: "module" },
  );

  return new Promise((resolve, reject) => {
    let settled = false;
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

    worker.onmessage = (event: MessageEvent<ScreeningWorkerResponse>) => {
      const response = event.data;
      if (response.requestId !== requestId) return;
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
    worker.onerror = (event) => {
      finish(() =>
        reject(new Error(event.message || "Screening worker failed")),
      );
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });

    const request: ScreeningWorkerRequest = {
      type: "run",
      requestId,
      bars,
      settings,
      config,
      options: {
        objective: options.objective,
        entryFilters: options.entryFilters
          ? [...options.entryFilters]
          : undefined,
      },
    };
    worker.postMessage(request);
  });
}
