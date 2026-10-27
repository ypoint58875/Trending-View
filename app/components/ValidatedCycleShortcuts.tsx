"use client";

import { useEffect, useState } from "react";
import { readValidatedCycles, subscribeValidatedCycles, promoteValidatedCycleRules } from "@/lib/analysis/validated-cycle-strategy-store";
import { requestValidatedCyclePreview } from "@/lib/analysis/validated-cycle-preview-client";
import { validatedCycleRulesMatch } from "@/lib/analysis/validated-cycle-preview";
import { DEFAULT_POSITION_OVERLAY_OPTIONS } from "@/lib/analysis/sma-position-overlay";
import type { ValidatedCycleStrategy } from "@/lib/analysis/validated-cycle-strategy";
import { zhCN } from "../i18n/zh-CN";

export function useValidatedCycles() {
  const [records, setRecords] = useState<ValidatedCycleStrategy[]>([]);
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false;
    let request = 0;
    let upgrade: AbortController | null = null;
    const refresh = () => {
      const current = ++request;
      upgrade?.abort();
      const controller = new AbortController();
      upgrade = controller;
      void readValidatedCycles().then(async (value) => {
        if (!disposed && request === current) { setRecords(value); setError(false); setReady(true); }
        for (const record of value) {
          if (disposed || request !== current || controller.signal.aborted) return;
          if (validatedCycleRulesMatch(record, DEFAULT_POSITION_OVERLAY_OPTIONS)) continue;
          const preview = await requestValidatedCyclePreview(record, DEFAULT_POSITION_OVERLAY_OPTIONS, controller.signal);
          if (disposed || request !== current || controller.signal.aborted) return;
          const updated = await promoteValidatedCycleRules(record, DEFAULT_POSITION_OVERLAY_OPTIONS, preview);
          if (!updated && request === current) { refresh(); return; }
        }
      }).catch(() => { if (!disposed && request === current) { setError(true); setReady(true); } });
    };
    refresh();
    const unsubscribe = subscribeValidatedCycles(refresh);
    return () => { disposed = true; upgrade?.abort(); unsubscribe(); };
  }, []);
  return { records, error, ready, upgrading: records.some((record) => !validatedCycleRulesMatch(record, DEFAULT_POSITION_OVERLAY_OPTIONS)) };
}

export function ValidatedCycleShortcuts({ records, error, activeKey, onOpen, embedded = false }: {
  records: ValidatedCycleStrategy[]; error: boolean; activeKey?: string | null;
  onOpen?: (record: ValidatedCycleStrategy) => void;
  embedded?: boolean;
}) {
  const text = zhCN.validatedCycle;
  if (!records.length && !error) return null;
  return <div className="validated-cycle-shortcuts" aria-label={text.title}>
    {!embedded && <strong>{text.title}</strong>}
    {error && <span role="alert">{records.some((record) => !validatedCycleRulesMatch(record, DEFAULT_POSITION_OVERLAY_OPTIONS)) ? text.errors.rules : text.errors.storage}</span>}
    {records.map((record) => <button type="button" key={record.key}
      className={record.key === activeKey ? "active" : ""}
      onClick={() => onOpen?.(record)} disabled={!onOpen || !validatedCycleRulesMatch(record, DEFAULT_POSITION_OVERLAY_OPTIONS)}>
      <strong>{record.screeningWindow}{text.nameSuffix}</strong>
      <span>{embedded ? "" : `${record.series.instrument.name} · `}{record.report.evaluationEndTime}</span>
      <span>{text.rulesVersion} {record.settings.positionOverlay?.model?.split("-").at(-1) ?? "legacy"}
        {!validatedCycleRulesMatch(record, DEFAULT_POSITION_OVERLAY_OPTIONS) ? ` · ${text.rulesUpdating}` : ""}</span>
      <span>{text.position} {Math.round((record.report.rebalances.at(-1)?.targetAllocation ?? 0) * 100)}%
        {record.pending ? ` · ${text.pending}` : ""}</span>
    </button>)}
  </div>;
}
