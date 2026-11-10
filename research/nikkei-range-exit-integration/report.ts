import type { MarketBar } from "../../lib/market/types";
import type { Replay, Trace } from "./model";

export interface Spell {
  first: string; end: string; sessions: number; blockedAttempts: number; source: Trace["exitSource"];
  selection: string | null; entryTime: string | null; entryAge: number | null; firstRange: number;
  outcome: "full-exit" | "risk-exit" | "cancelled-by-increase" | "pending-at-end";
  firstClose: number; endClose: number; closeChange: number; mfe: number; mae: number;
  worstEntryLoss: number; postEarlyLossDays: number; partialSales: number;
}
export function diagnose(bars: MarketBar[], path: Replay) {
  const spells: Spell[] = [];
  let current: { first: Trace; blocked: number; high: number; low: number; worst: number; lateLoss: number; partialSales: number } | null = null;
  const fills = new Map<string, Replay["fills"]>();
  for (const fill of path.fills) fills.set(fill.time, [...(fills.get(fill.time) ?? []), fill]);
  const finish = (event: Trace, outcome: Spell["outcome"]) => {
    const entry = current!.first, firstClose = bars[entry.index].close, endClose = bars[event.index].close;
    spells.push({ first: entry.time, end: event.time, sessions: event.index - entry.index, blockedAttempts: current!.blocked,
      source: entry.exitSource, selection: entry.selection ?? entry.pendingBefore?.selection ?? null,
      entryTime: entry.episode ? bars[entry.episode.index].time : null,
      entryAge: entry.before.entryIndex === null ? null : entry.index - entry.before.entryIndex,
      firstRange: entry.measure!, outcome, firstClose, endClose, closeChange: (endClose / firstClose - 1) * 100,
      mfe: (current!.high / firstClose - 1) * 100, mae: (current!.low / firstClose - 1) * 100,
      worstEntryLoss: current!.worst, postEarlyLossDays: current!.lateLoss, partialSales: current!.partialSales });
    current = null;
  };
  for (const event of path.events) {
    if (!current && event.blocked) current = { first: event, blocked: 0, high: bars[event.index].close,
      low: bars[event.index].close, worst: 0, lateLoss: 0, partialSales: 0 };
    if (!current) continue;
    if (event.blocked) current.blocked++;
    current.high = Math.max(current.high, bars[event.index].close); current.low = Math.min(current.low, bars[event.index].close);
    if (event.episode) current.worst = Math.min(current.worst, (bars[event.index].close / event.episode.cost - 1) * 100);
    if (event.before.entryIndex !== null && event.index - event.before.entryIndex > 5 && event.before.entryClose > 0 &&
      bars[event.index].close <= event.before.entryClose * .96 && event.before.allocation > 1e-10) current.lateLoss++;
    current.partialSales += (fills.get(event.time) ?? []).filter((fill) => fill.targetAllocation > 1e-10 && fill.targetAllocation < fill.fromAllocation - 1e-10).length;
    if (event.target <= 1e-10) finish(event, event.risk ? "risk-exit" : "full-exit");
    else if (event.direction === "increase" && event.accepted.pending !== 0) finish(event, "cancelled-by-increase");
  }
  if (current) finish(path.events.at(-1)!, "pending-at-end");
  const names = ["base-clear", "base-pending", "controller", "risk"];
  const bySource = Object.fromEntries(names.map((source) => [source, { nativeFullExits: path.events.filter((event) => event.exitSource === source).length,
    blockedAttempts: path.events.filter((event) => event.exitSource === source && event.blocked).length,
    executedFullExits: path.events.filter((event) => event.exitSource === source && event.before.allocation > 1e-10 && event.target <= 1e-10).length }]));
  return { spells, bySource, blockedAttempts: path.events.filter((event) => event.blocked).length,
    blockedAfterEarlyAge: path.events.filter((event) => event.blocked && event.before.entryIndex !== null && event.index - event.before.entryIndex > 5).length,
    originalIncreases: path.events.filter((event) => event.direction === "increase").length,
    originalPartialReductions: path.events.filter((event) => event.direction === "reduce" && event.requestedTarget! > 1e-10).length,
    originalFullClears: path.events.filter((event) => event.direction === "reduce" && event.requestedTarget! <= 1e-10).length,
    postEarlyLossSpells: spells.filter((spell) => spell.postEarlyLossDays > 0).length,
    worstDeferredEntryLoss: Math.min(0, ...spells.map((spell) => spell.worstEntryLoss)) };
}
