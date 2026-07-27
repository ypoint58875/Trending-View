import {
  ScreeningValidationError,
  runScreeningWithValidation,
} from "./screening-validation";
import type {
  ScreeningWorkerRequest,
  ScreeningWorkerResponse,
} from "./screening-worker-protocol";

interface WorkerScope {
  onmessage:
    | ((event: MessageEvent<ScreeningWorkerRequest>) => void)
    | null;
  postMessage(message: ScreeningWorkerResponse): void;
}

const workerScope = globalThis as unknown as WorkerScope;
const controllers = new Map<string, AbortController>();

function post(message: ScreeningWorkerResponse) {
  workerScope.postMessage(message);
}

workerScope.onmessage = (event) => {
  const request = event.data;
  if (request.type === "cancel") {
    controllers.get(request.requestId)?.abort();
    return;
  }

  const controller = new AbortController();
  controllers.set(request.requestId, controller);
  void runScreeningWithValidation(
    request.bars,
    request.settings,
    request.config,
    {
      ...request.options,
      signal: controller.signal,
      onProgress: (progress) =>
        post({
          type: "optimization-progress",
          requestId: request.requestId,
          progress,
        }),
      onValidationProgress: (progress) =>
        post({
          type: "validation-progress",
          requestId: request.requestId,
          progress,
        }),
    },
  )
    .then((outcome) =>
      post({
        type: "result",
        requestId: request.requestId,
        outcome,
      }),
    )
    .catch((error: unknown) =>
      post({
        type: "error",
        requestId: request.requestId,
        ...(error instanceof ScreeningValidationError
          ? { code: error.code }
          : {}),
        message:
          error instanceof Error
            ? error.message
            : "Screening worker failed",
      }),
    )
    .finally(() => {
      controllers.delete(request.requestId);
    });
};
