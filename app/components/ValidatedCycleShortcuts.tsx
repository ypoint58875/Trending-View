"use client";

import { useEffect, useMemo, useState } from "react";
import { buildNikkeiContextMonitor, type ContextObservation } from "@/lib/analysis/market-context";
import type { MarketSeries } from "@/lib/market/types";
import { resolveCanonicalMarketProfile } from "@/lib/market/canonical";
import { readValidatedCycles, subscribeValidatedCycles, promoteValidatedCycleRules } from "@/lib/analysis/validated-cycle-strategy-store";
import { requestValidatedCyclePreview } from "@/lib/analysis/validated-cycle-preview-client";
import { validatedCycleRulesMatch } from "@/lib/analysis/validated-cycle-preview";
import { DEFAULT_POSITION_OVERLAY_OPTIONS } from "@/lib/analysis/sma-position-overlay";
import type { ValidatedCycleStrategy } from "@/lib/analysis/validated-cycle-strategy";
import { zhCN } from "../i18n/zh-CN";
import { useWorkspaceMarket } from "./WorkspaceMarketProvider";

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

export function contextObservationLabel(observation: ContextObservation): string {
  const text = zhCN.marketContext;
  if (observation.direction === "warmup") return text.warmup;
  if (observation.direction === "mixed") return observation.confirmed
    ? `${text.previous[observation.confirmed]}，${text.disagreement}` : text.mixed;
  const current = text[observation.direction][Math.min(observation.consecutive, 3) - 1];
  return observation.confirmed && observation.confirmed !== observation.direction
    ? `${text.previous[observation.confirmed]} · ${current}` : current;
}

export function MarketContextMonitor({ series }: { series: MarketSeries }) {
  const text = zhCN.marketContext;
  const shared = useWorkspaceMarket();
  const matching = [shared.series, shared.nikkei].find(value => value && resolveCanonicalMarketProfile(value.instrument).key === resolveCanonicalMarketProfile(series.instrument).key);
  const basis = matching && (matching.bars.at(-1)?.time ?? "") >= (series.bars.at(-1)?.time ?? "") ? matching : series;
  const result = useMemo(() => {
    try { return { observation: buildNikkeiContextMonitor(basis), error: false }; }
    catch { return { observation: null, error: true }; }
  }, [basis]);
  const observation = result.observation;
  return <span className="market-context-monitor" title={`${text.rule} ${text.note}`}>
    <strong>{text.title}</strong>
    <span className={`context-state ${observation?.direction === "up" ? "context-up" : observation?.direction === "down" ? "context-down" : ""} ${observation && observation.consecutive >= 3 ? "context-confirmed" : ""}`}>
      {result.error ? text.invalid : observation ? contextObservationLabel(observation) : text.unavailable}
    </span>
    <span>{text.basis} {observation?.time ?? "—"}</span>
    {observation && observation.consecutive > 0 && <span>{text.consecutive.replace("{days}", String(observation.consecutive))}</span>}
    {observation?.confirmedTime && <span>{text.previous[observation.confirmed!]} {observation.confirmedTime}</span>}
  </span>;
}

export function ValidatedCycleShortcuts({ records, error, activeKey, onOpen, embedded = false, marketSeriesForRecord }: {
  records: ValidatedCycleStrategy[]; error: boolean; activeKey?: string | null;
  onOpen?: (record: ValidatedCycleStrategy) => void;
  embedded?: boolean;
  marketSeriesForRecord?: (record: ValidatedCycleStrategy) => MarketSeries;
}) {
  const text = zhCN.validatedCycle;
  if (!records.length && !error) return null;
  const contextSeries = new Map<string, MarketSeries>();
  for (const record of records) {
    const candidate = marketSeriesForRecord?.(record) ?? record.series;
    const key = resolveCanonicalMarketProfile(candidate.instrument).key;
    const previous = contextSeries.get(key);
    const date = candidate.bars.at(-1)?.time ?? "";
    const previousDate = previous?.bars.at(-1)?.time ?? "";
    if (!previous || date > previousDate || (date === previousDate && candidate.bars.length > previous.bars.length)) {
      contextSeries.set(key, candidate);
    }
  }
  return <div className="validated-cycle-shortcuts" aria-label={text.title}>
    {!embedded && <strong>{text.title}</strong>}
    {error && <span role="alert">{records.some((record) => !validatedCycleRulesMatch(record, DEFAULT_POSITION_OVERLAY_OPTIONS)) ? text.errors.rules : text.errors.storage}</span>}
    {[...contextSeries].map(([key, series]) => <div className="market-context-card" key={key}>
      {!embedded && <strong>{series.instrument.name}</strong>}
      <MarketContextMonitor series={series} />
    </div>)}
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
