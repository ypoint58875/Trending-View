"use client";

import { zhCN as copy } from "../i18n/zh-CN";
import { DEFAULT_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";

/** New workspace calculations use one fixed policy; archived plans keep their model. */
export function useSmaPositionOverlayPreferences() {
  return { settings: DEFAULT_POSITION_OVERLAY_OPTIONS, ready: true };
}

export function SmaPositionOverlayControls() {
  return <div className="position-policy-rules">
    <p className="position-policy-status">{copy.positionOverlay.alwaysEnabled}</p>
    <p className="position-policy-note">{copy.positionOverlay.priority}</p>
    <strong>{copy.positionOverlay.entryTitle}</strong>
    <ol>{copy.positionOverlay.entryRules.map(rule => <li key={rule}>{rule}</li>)}</ol>
    <strong>{copy.positionOverlay.exitTitle}</strong>
    <ol>{copy.positionOverlay.exitRules.map(rule => <li key={rule}>{rule}</li>)}</ol>
    <details className="position-policy-detail">
      <summary>{copy.positionOverlay.reversalDefinition}</summary>
      <p>{copy.positionOverlay.reversalDetail}</p>
    </details>
    <details className="position-policy-detail">
      <summary>{copy.positionOverlay.reboundDefinition}</summary>
      <p>{copy.positionOverlay.reboundDetail}</p>
    </details>
    <details className="position-policy-detail">
      <summary>{copy.positionOverlay.shapeDefinition}</summary>
      <p>{copy.positionOverlay.shapeDetail}</p>
    </details>
    <p className="position-policy-note">{copy.positionOverlay.executionNote}</p>
  </div>;
}
