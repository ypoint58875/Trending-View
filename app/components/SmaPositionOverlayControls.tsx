"use client";

import { useCallback, useEffect, useState } from "react";
import { zhCN as copy } from "../i18n/zh-CN";
import { MIXED_POSITION_OVERLAY_MODEL, normalizeSmaPositionOverlay, type SmaPositionOverlayOptions } from "../../lib/analysis/sma-position-overlay";

export function useSmaPositionOverlayPreferences(scope: "research" | "cycle") {
  const [options, setOptions] = useState<SmaPositionOverlayOptions>({ model: MIXED_POSITION_OVERLAY_MODEL, supplementalEntry: true, exitGuard: true, entrySlopeGate: true });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const key = `quantscope-position-overlay-v3:${scope}`;
  const previousKey = `quantscope-sma12-position-overlay-v2:${scope}`;
  const legacyKey = `quantscope-sma12-position-overlay-v1:${scope}`;
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      const previous = stored ? null : localStorage.getItem(previousKey);
      const legacy = stored || previous ? null : localStorage.getItem(legacyKey);
      if (stored || previous || legacy) {
        const value = JSON.parse((stored ?? previous ?? legacy)!) as SmaPositionOverlayOptions;
        if (typeof value.supplementalEntry !== "boolean" || typeof value.exitGuard !== "boolean" ||
          (value.entrySlopeGate !== undefined && typeof value.entrySlopeGate !== "boolean")) throw new Error("Invalid SMA overlay preferences");
        setOptions({ model: MIXED_POSITION_OVERLAY_MODEL, supplementalEntry: value.supplementalEntry, exitGuard: value.exitGuard,
          entrySlopeGate: stored || previous ? value.entrySlopeGate ?? true : true });
      }
    } catch { setError(true); }
    setReady(true);
  }, [key, previousKey, legacyKey]);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(key, JSON.stringify({ supplementalEntry: !!options.supplementalEntry, exitGuard: !!options.exitGuard, entrySlopeGate: !!options.entrySlopeGate })); }
    catch { setError(true); }
  }, [key, options, ready]);
  const updateOptions = useCallback((value: SmaPositionOverlayOptions) => setOptions({ ...value, model: MIXED_POSITION_OVERLAY_MODEL }), []);
  return { options, setOptions: updateOptions, settings: normalizeSmaPositionOverlay(options), ready, error };
}

export function SmaPositionOverlayControls({ options, onChange, disabled, cycle, error }: {
  options: SmaPositionOverlayOptions;
  onChange: (options: SmaPositionOverlayOptions) => void;
  disabled?: boolean; cycle?: boolean; error?: boolean;
}) {
  return <div className="sma-position-overlay-controls">
    <label className={cycle ? "cycle-overlay-toggle" : "entry-filter-toggle screening-overlay-toggle"}>
      <input name={`${cycle ? "cycle" : "research"}-ema7-supplemental-entry`} type="checkbox"
        checked={!!options.supplementalEntry} disabled={disabled}
        onChange={event => onChange({ ...options, supplementalEntry: event.target.checked })} />
      <span>{copy.positionOverlay.supplementalEntry}</span>
    </label>
    <label className={cycle ? "cycle-overlay-toggle" : "entry-filter-toggle screening-overlay-toggle"}>
      <input name={`${cycle ? "cycle" : "research"}-sma11-exit-guard`} type="checkbox"
        checked={!!options.exitGuard} disabled={disabled}
        onChange={event => onChange({ ...options, exitGuard: event.target.checked })} />
      <span>{copy.positionOverlay.exitGuard}</span>
    </label>
    <label className={cycle ? "cycle-overlay-toggle" : "entry-filter-toggle screening-overlay-toggle"}>
      <input name={`${cycle ? "cycle" : "research"}-wma14-entry-slope-gate`} type="checkbox"
        checked={!!options.entrySlopeGate} disabled={disabled}
        onChange={event => onChange({ ...options, entrySlopeGate: event.target.checked })} />
      <span>{copy.positionOverlay.entrySlopeGate}</span>
    </label>
    {error && <p role="alert">{copy.positionOverlay.storageError}</p>}
  </div>;
}
