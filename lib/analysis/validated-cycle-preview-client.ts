import type { ValidatedCycleStrategy } from "./validated-cycle-strategy";
import type { SmaPositionOverlayOptions } from "./sma-position-overlay";
import { cachedValidatedCyclePreview, validatedCyclePreviewKey, type ValidatedCyclePreview } from "./validated-cycle-preview";

export function requestValidatedCyclePreview(profile: ValidatedCycleStrategy, overlay: SmaPositionOverlayOptions | undefined,
  signal: AbortSignal): Promise<ValidatedCyclePreview> {
  if (signal.aborted) return Promise.reject(new DOMException("Cancelled", "AbortError"));
  const cached = cachedValidatedCyclePreview(profile, overlay);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./validated-cycle-preview.worker.ts", import.meta.url), { type: "module" });
    const timer = setTimeout(() => { finish(); reject(new Error("Validated cycle preview timed out")); }, 120_000);
    const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", cancel); worker.terminate(); };
    const cancel = () => { finish(); reject(new DOMException("Cancelled", "AbortError")); };
    signal.addEventListener("abort", cancel, { once: true });
    worker.onerror = () => { finish(); reject(new Error("Validated cycle preview worker failed")); };
    worker.onmessageerror = () => { finish(); reject(new Error("Invalid validated cycle preview message")); };
    worker.onmessage = (event: MessageEvent<{ preview?: ValidatedCyclePreview; error?: string }>) => {
      finish();
      if (event.data.preview?.key === validatedCyclePreviewKey(profile, overlay)) resolve(event.data.preview);
      else reject(new Error(event.data.error ?? "Invalid validated cycle preview response"));
    };
    try { worker.postMessage({ profile, overlay }); }
    catch (error) { finish(); reject(error); }
  });
}
