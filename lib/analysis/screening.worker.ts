import {
  ScreeningValidationError,
  runScreeningWithValidation,
} from "./screening-validation";
import type {
  ScreeningWorkerRequest,
  ScreeningWorkerResponse,
} from "./screening-worker-protocol";
import {
  clearScreeningCheckpoint,
  readScreeningCheckpoint,
  writeScreeningCheckpoint,
} from "./screening-checkpoint-store";
import { unpackMarketBars } from "./screening-worker-bars";

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
  let checkpointWrites = Promise.resolve();
  let stageRestartRequested = false;
  const bars = unpackMarketBars(request.bars);
  void readScreeningCheckpoint(
    request.checkpoint.key,
    request.checkpoint.signature,
  )
    .then((resumeCheckpoint) =>
      runScreeningWithValidation(
        bars,
        request.settings,
        request.config,
        {
          ...request.options,
          resumeCheckpoint,
          // Restarting at an exact intra-stage checkpoint bounds the worker
          // heap without pruning or changing candidate evaluation order.
          checkpointEvery: 4_096,
          signal: controller.signal,
          onCheckpoint: (checkpoint) => {
            checkpointWrites = checkpointWrites.then(() =>
              writeScreeningCheckpoint(
                request.checkpoint.key,
                request.checkpoint.signature,
                checkpoint,
              ),
            );
            stageRestartRequested = true;
            controller.abort();
          },
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
      ),
    )
    .then(async (outcome) => {
      await checkpointWrites;
      if (stageRestartRequested) {
        post({ type: "restart", requestId: request.requestId });
        return;
      }
      if (!outcome.cancelled) {
        await clearScreeningCheckpoint(request.checkpoint.key);
      }
      post({
        type: "result",
        requestId: request.requestId,
        outcome,
      });
    })
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
