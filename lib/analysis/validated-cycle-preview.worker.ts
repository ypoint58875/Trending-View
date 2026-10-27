import { buildValidatedCyclePreview, type ValidatedCyclePreview } from "./validated-cycle-preview";
import type { ValidatedCycleStrategy } from "./validated-cycle-strategy";
import type { SmaPositionOverlayOptions } from "./sma-position-overlay";

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<{ profile: ValidatedCycleStrategy; overlay?: SmaPositionOverlayOptions }>) => void;
  postMessage(message: { preview?: ValidatedCyclePreview; error?: string }): void;
};
scope.onmessage = (event) => {
  try { scope.postMessage({ preview: buildValidatedCyclePreview(event.data.profile, event.data.overlay) }); }
  catch { scope.postMessage({ error: "Validated cycle preview calculation failed" }); }
};
