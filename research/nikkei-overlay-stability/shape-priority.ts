import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atomic, root } from "./analyze";
import { fallbackMetrics } from "./sma20-fallback";
import { contributionReplay } from "./contribution-study";
import { rsi, wma } from "../../lib/analysis/indicators";
import { SmaPositionOverlay, ATR_POSITION_OVERLAY_OPTIONS as DEFAULT_POSITION_OVERLAY_OPTIONS } from "../../lib/analysis/sma-position-overlay";
import { strategyCycleSignalDirection, strategyCycleRecentSignals, runStrategyCycleCloseBacktest,
  type StrategyCycleRecentSignal, type StrategyCycleSelectionSnapshot } from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest, type BacktestSettings } from "../../lib/analysis/backtest";
import type { MarketBar } from "../../lib/market/types";

type EntryShape = "off" | "close4" | "high4" | "higher-low";
type ExitShape = "off" | "opens4" | "highs4" | "low4";
type EntryRsi = "off" | "rising" | "above50" | "rising40-70" | "rebound40";
type ExitRsi = "off" | "falling" | "below50" | "from70";
export type SequencePriceField = "open" | "close" | "high" | "low";
export interface ShapeRsiSettings {
  period: number; threshold?: number; lower?: number; upper?: number; lookback?: number;
}
export interface ShapePolicy {
  id: string; entry: EntryShape; decline: number; entryPriority: "fallback" | "before-supplements";
  wmaGate: boolean; entryRsi: EntryRsi; exit: ExitShape;
  declineScope: "recent10" | "flat10";
  exitPriority: "guarded" | "no-signal-force" | "risk-first"; exitRsi: ExitRsi;
  descending?: { field: SequencePriceField; sessions: number };
  entryRsiSettings?: ShapeRsiSettings;
  exitRsiSettings?: ShapeRsiSettings;
}
export const shapeBaseline: ShapePolicy = { id: "baseline", entry: "off", decline: 0.05,
  entryPriority: "fallback", wmaGate: true, entryRsi: "off", declineScope: "recent10",
  exit: "off", exitPriority: "risk-first", exitRsi: "off" };

interface ResearchState {
  allocation: number; pending: number | null; lastSupplement: number | null; flatStart: number | null;
  previousCloseAllocation: number; entryIndex: number | null; entryClose: number;
  recoveryTarget: number | null; stoppedAt: number; blockedUntil: number; lastClosedIndex: number;
}
export class ShapeContext {
  readonly strength: (number | null)[];
  readonly average: (number | null)[];
  private readonly closes: number[];
  private readonly strengthByPeriod = new Map<number, (number | null)[]>();
  constructor(readonly bars: MarketBar[]) {
    this.closes = bars.map((bar) => bar.close);
    this.strength = this.strengthFor(14); this.average = wma(this.closes, 7);
  }
  strengthFor(period: number) {
    if (!Number.isInteger(period) || period < 2 || period > 100) throw new Error("Invalid research RSI period");
    let values = this.strengthByPeriod.get(period);
    if (!values) { values = rsi(this.closes, period); this.strengthByPeriod.set(period, values); }
    return values;
  }
}
export function descendingFour(values: readonly number[], index: number): boolean {
  return strictlyDescending(values, index, 4);
}
export function strictlyDescending(values: readonly number[], index: number, sessions: number): boolean {
  if (!Number.isInteger(sessions) || sessions < 3 || sessions > 6 ||
    !Number.isInteger(index) || index < sessions - 1 || index >= values.length) return false;
  for (let cursor = index - sessions + 2; cursor <= index; cursor += 1) {
    if (!Number.isFinite(values[cursor - 1]) || !Number.isFinite(values[cursor]) ||
      values[cursor - 1]! <= values[cursor]!) return false;
  }
  return true;
}
export function shapeEntryEvidence(context: ShapeContext, index: number, flatStart: number) {
  const bars = context.bars;
  if (index < 4) return { decline: 0, close4: false, high4: false, higherLow: false };
  const from = Math.max(0, flatStart, index - 10);
  let lowIndex = from;
  for (let cursor = from + 1; cursor < index; cursor += 1)
    if (bars[cursor]!.close <= bars[lowIndex]!.close) lowIndex = cursor;
  let peak = 0;
  for (let cursor = Math.max(0, lowIndex - 10); cursor < lowIndex; cursor += 1)
    peak = Math.max(peak, bars[cursor]!.close);
  const close = bars[index]!.close, previous = bars.slice(index - 4, index);
  return { decline: from < index && peak > 0 ? 1 - bars[lowIndex]!.close / peak : 0,
    close4: close > Math.max(...previous.map((bar) => bar.close)),
    high4: close > Math.max(...previous.map((bar) => bar.high)),
    higherLow: bars[index]!.low > bars[index - 1]!.low && close > bars[index - 1]!.high };
}
export function entryRsiPass(context: ShapeContext, index: number, mode: EntryRsi, settings?: ShapeRsiSettings) {
  if (mode === "off") return true;
  const strength = context.strengthFor(settings?.period ?? 14);
  const current = strength[index], previous = strength[index - 1];
  if (current == null || previous == null) return false;
  const rising = current > previous;
  if (mode === "rising") return rising;
  if (mode === "above50") return current > (settings?.threshold ?? 50);
  if (mode === "rising40-70") return rising && current >= (settings?.lower ?? 40) && current <= (settings?.upper ?? 70);
  return rising && strength.slice(Math.max(0, index - (settings?.lookback ?? 14)), index)
    .some((value) => value !== null && value <= (settings?.threshold ?? 40));
}
export function exitRsiPass(context: ShapeContext, index: number, mode: ExitRsi, settings?: ShapeRsiSettings) {
  if (mode === "off") return true;
  const strength = context.strengthFor(settings?.period ?? 14);
  const current = strength[index], previous = strength[index - 1];
  if (current == null || previous == null) return false;
  if (mode === "below50") return current < (settings?.threshold ?? 50);
  if (mode === "falling") return current < previous;
  return current < previous && strength.slice(Math.max(0, index - (settings?.lookback ?? 14)), index)
    .some((value) => value !== null && value >= (settings?.threshold ?? 70));
}
function exitShapePass(context: ShapeContext, index: number, mode: ExitShape) {
  if (mode === "off" || index < 3 || (mode === "low4" && index < 4)) return false;
  const bars = context.bars;
  if (mode === "low4") return bars[index]!.close < Math.min(...bars.slice(index - 4, index).map((bar) => bar.low));
  const key = mode === "opens4" ? "open" : "high";
  return bars[index - 3]![key] > bars[index - 2]![key] && bars[index - 2]![key] > bars[index - 1]![key] &&
    bars[index - 1]![key] > bars[index]![key];
}
export function shapeReplay(context: ShapeContext, decisions: ReadonlyMap<number, StrategyCycleRecentSignal[]>,
  start: number, policy: ShapePolicy, detailed = false, omitted = new Set<number>()) {
  const account = new SmaPositionOverlay(context.bars, DEFAULT_POSITION_OVERLAY_OPTIONS);
  const state = account as unknown as ResearchState;
  const targets = context.bars.map(() => 0);
  const events: { index: number; time: string; kind: string; before: number; target: number; strength: number | null }[] = [];
  let entries = 0, requests = 0, forced = 0;
  const sequenceValues = policy.descending ? context.bars.map((bar) => bar[policy.descending!.field]) : null;
  const enter = (index: number, afterClose: boolean) => {
    state.allocation = 1; state.pending = null; state.lastSupplement = index;
    if (afterClose) {
      state.entryIndex = index; state.entryClose = context.bars[index]!.close;
      state.recoveryTarget = null; state.flatStart = null; state.previousCloseAllocation = 1;
    }
    entries += 1;
  };
  for (let index = start; index < context.bars.length; index += 1) {
    const before = account.allocation, signals = decisions.get(index) ?? [];
    const direction = strategyCycleSignalDirection(signals);
    if (direction) account.request(direction, signals.at(-1)!.targetAllocation, index);
    const allowed = !omitted.has(index);
    const pattern = sequenceValues ? strictlyDescending(sequenceValues, index, policy.descending!.sessions)
      : exitShapePass(context, index, policy.exit);
    const exit = allowed && before > 1e-10 && pattern && exitRsiPass(context, index, policy.exitRsi, policy.exitRsiSettings);
    const guarded = exit && policy.exitPriority === "guarded" && direction !== "increase";
    if (guarded) { account.request("reduce", 0, index); requests += 1; }
    const evidence = policy.entry !== "off" && before <= 1e-10
      ? shapeEntryEvidence(context, index, policy.declineScope === "flat10" ? state.flatStart ?? index : Math.max(0, index - 10)) : null;
    const shape = evidence && (policy.entry === "close4" ? evidence.close4 : policy.entry === "high4" ? evidence.high4 : evidence.higherLow);
    const gate = !policy.wmaGate || (context.average[index] != null && context.average[index - 1] != null &&
      context.average[index]! >= context.average[index - 1]!);
    const entry = allowed && shape && evidence!.decline + 1e-12 >= policy.decline && before <= 1e-10 &&
      signals.length === 0 && index >= state.blockedUntil && state.pending === null && gate && entryRsiPass(context, index, policy.entryRsi, policy.entryRsiSettings);
    let added = false;
    if (entry && policy.entryPriority === "before-supplements" && account.allocation <= 1e-10) {
      enter(index, false); added = true;
    }
    account.close(index, signals.length > 0 || guarded);
    if (entry && policy.entryPriority === "fallback" && account.allocation <= 1e-10 && state.pending === null) {
      enter(index, true); added = true;
    }
    const force = exit && account.allocation > 1e-10 && (policy.exitPriority === "risk-first" ||
      (policy.exitPriority === "no-signal-force" && signals.length === 0));
    if (force) {
      state.allocation = 0; state.pending = null; state.lastSupplement = null;
      state.entryIndex = null; state.entryClose = 0; state.recoveryTarget = null;
      state.stoppedAt = index; state.blockedUntil = Math.max(state.blockedUntil, index + 1);
      state.flatStart = index; state.previousCloseAllocation = 0; forced += 1;
    }
    assert.ok(account.allocation >= 0 && account.allocation <= 1);
    targets[index] = account.allocation;
    if (detailed && (added || guarded || force)) events.push({ index, time: context.bars[index]!.time,
      kind: added ? "entry" : force ? "forced-exit" : "exit-request", before, target: account.allocation,
      strength: context.strengthFor((added ? policy.entryRsiSettings : policy.exitRsiSettings)?.period ?? 14)[index] ?? null });
  }
  return { targets, entries, requests, forced, events };
}
export function shapeMenu(): ShapePolicy[] {
  const menu = [{ ...shapeBaseline }];
  for (const entry of ["close4", "high4", "higher-low"] as const)
    for (const percent of [5, 6, 7, 8, 9, 10]) for (const entryPriority of ["fallback", "before-supplements"] as const)
      for (const wmaGate of [true, false]) for (const entryRsi of ["off", "rising", "above50", "rising40-70", "rebound40"] as const)
        menu.push({ ...shapeBaseline, id: `entry-${entry}-${percent}-${entryPriority}-wma${Number(wmaGate)}-${entryRsi}`,
          entry, decline: percent / 100, entryPriority, wmaGate, entryRsi });
  for (const exit of ["opens4", "highs4", "low4"] as const)
    for (const exitPriority of ["guarded", "no-signal-force", "risk-first"] as const)
      for (const exitRsi of ["off", "falling", "below50", "from70"] as const)
        menu.push({ ...shapeBaseline, id: `exit-${exit}-${exitPriority}-${exitRsi}`, exit, exitPriority, exitRsi });
  for (const percent of [5, 6, 7, 8, 9, 10]) for (const entryPriority of ["fallback", "before-supplements"] as const)
    for (const wmaGate of [true, false]) menu.push({ ...shapeBaseline,
      id: `entry-close4-${percent}-${entryPriority}-wma${Number(wmaGate)}-off-flat10`,
      entry: "close4", decline: percent / 100, entryPriority, wmaGate, declineScope: "flat10" });
  return menu;
}
const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function bounded(path: string) {
  assert.ok((await stat(path)).size < 16 * 1024 ** 2);
  return JSON.parse(await readFile(path, "utf8"));
}
async function main() {
  const input = await bounded(join(root, "data/full-screen-6-15/input.json")) as {
    bars: MarketBar[]; barsHash: string; snapshots: StrategyCycleSelectionSnapshot[]; settings: BacktestSettings;
  };
  const saved = await bounded(join(root, "data/full-screen-6-15/signals.json")) as {
    sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[];
  };
  const sourceHash = sha(input); assert.equal(sourceHash, saved.sourceHash); assert.equal(sha(input.bars), input.barsHash);
  assert.ok(input.bars.length <= 10000); assert.deepEqual(saved.rows.map((row) => row.index), input.snapshots.map((row) => row.decisionIndex));
  const { bars, settings } = input, start = bars.length - 2000;
  const boundary = bars.findIndex((bar) => bar.time === "2026-07-21") - start + 1;
  const decisions = new Map(saved.rows.map((row) => [row.index, row.signals]));
  const context = new ShapeContext(bars);
  const baselinePath = shapeReplay(context, decisions, start, shapeBaseline);
  assert.deepEqual(baselinePath.targets, contributionReplay(bars, decisions, start, DEFAULT_POSITION_OVERLAY_OPTIONS).targets);
  assert.deepEqual(baselinePath.targets, (await bounded(join(root, "output/risk-exit-validation/ema3-atr2-anchor.json"))).targets);
  const measure = (targets: number[], nextOpen = false) => fallbackMetrics(nextOpen
    ? runAllocationBacktest(bars, targets, { ...settings, positionOverlay: undefined, executionPolicy: "hybrid" })
    : runStrategyCycleCloseBacktest(bars, targets, settings), settings.initialCash, boundary);
  const run = (policy: ShapePolicy, detailed = false, omitted?: Set<number>) => {
    const path = shapeReplay(context, decisions, start, policy, detailed, omitted);
    return { policy, targetHash: sha(path.targets), entries: path.entries, requests: path.requests,
      forced: path.forced, ...measure(path.targets) };
  };
  type Row = ReturnType<typeof run>;
  const menu = shapeMenu(), rows: Row[] = [];
  const implementationHash = sha(await Promise.all(["shape-priority.ts", "SHAPE_PRIORITY_DESIGN.md",
    "../../lib/analysis/sma-position-overlay.ts", "../../lib/analysis/indicators.ts",
    "../../lib/analysis/backtest.ts", "../../lib/analysis/strategy-cycle-validation.ts"].map((path) => readFile(join(root, path), "utf8"))));
  const identity = sha({ sourceHash, implementationHash, menu });
  const checkpoint = join(root, "data/shape-priority", identity, "rows.json");
  try {
    const stored = await bounded(checkpoint); assert.equal(stored.identity, identity);
    assert.ok(stored.rows.length <= 1000);
    assert.equal(new Set(stored.rows.map((row: Row) => row.policy.id)).size, stored.rows.length);
    stored.rows.slice(0, menu.length).forEach((row: Row, index: number) => assert.deepEqual(row.policy, menu[index]));
    rows.push(...stored.rows);
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  let stopping = false;
  process.on("SIGINT", () => { stopping = true; }); process.on("SIGTERM", () => { stopping = true; });
  const evaluate = async (policies: ShapePolicy[]) => {
    for (const policy of policies) {
      if (rows.some((row) => row.policy.id === policy.id)) continue;
      if (stopping || process.memoryUsage().rss > 2 * 1024 ** 3) throw new Error("Interrupted or RSS limit; resume the same command");
      rows.push(run(policy)); await atomic(checkpoint, { identity, rows });
      if (rows.length % 40 === 0) console.log(`Completed ${rows.length} shape policies`);
    }
  };
  await evaluate(menu);
  const baseline = rows[0]!;
  const score = (row: Row) => Math.min(row.totalReturn - baseline.totalReturn, row.final500.totalReturn - baseline.final500.totalReturn);
  const rank = (values: Row[]) => [...values].sort((left, right) => score(right) - score(left) || right.totalReturn - left.totalReturn);
  const entries = rows.filter((row) => row.policy.entry !== "off" && row.policy.exit === "off");
  const exits = rows.filter((row) => row.policy.entry === "off" && row.policy.exit !== "off");
  const selectedEntries = [...rank(entries.filter((row) => row.policy.entryRsi === "off")).slice(0, 4),
    ...rank(entries.filter((row) => row.policy.entryRsi !== "off")).slice(0, 4)];
  const selectedExits = [...rank(exits.filter((row) => row.policy.exitRsi === "off")).slice(0, 3),
    ...rank(exits.filter((row) => row.policy.exitRsi !== "off")).slice(0, 3)];
  const selectedCombined = selectedEntries.flatMap((entry) => selectedExits.map((exit) => ({ ...entry.policy,
    id: `combined:${entry.policy.id}:${exit.policy.id}`, exit: exit.policy.exit, exitPriority: exit.policy.exitPriority, exitRsi: exit.policy.exitRsi })));
  const primaryCombined = entries.filter((row) => row.policy.entry === "close4" && row.policy.declineScope === "recent10" &&
    row.policy.entryPriority === "fallback" && row.policy.wmaGate).flatMap((entry) =>
      exits.filter((row) => row.policy.exit === "opens4").map((exit) => ({ ...entry.policy,
        id: `combined:${entry.policy.id}:${exit.policy.id}`, exit: exit.policy.exit,
        exitPriority: exit.policy.exitPriority, exitRsi: exit.policy.exitRsi })));
  const combined = [...new Map([...selectedCombined, ...primaryCombined].map((policy) => [policy.id, policy])).values()];
  rows.slice(menu.length).forEach((row, index) => assert.deepEqual(row.policy, combined[index]));
  await evaluate(combined);
  const six = await bounded(join(root, "output/six-vs-five/summary.json")); assert.equal(six.sourceHash, sourceHash);
  const max5 = new Map(decisions);
  for (const row of six.rows) {
    const original = input.snapshots.find((snapshot) => snapshot.decisionIndex === row.index)!;
    const regenerated = strategyCycleRecentSignals(bars, { ...original, plan: row.max5.plan,
      fixedRelativeLongStrategy: row.max5.relativeLongStrategy }, row.index);
    assert.deepEqual(regenerated, row.max5.signals);
    max5.set(row.index, regenerated);
  }
  const maxPath = contributionReplay(bars, max5, start, DEFAULT_POSITION_OVERLAY_OPTIONS);
  const missed = maxPath.daily.findIndex((day) => day.time === "2023-12-15"); assert.ok(missed >= 0);
  const nextEntry = maxPath.daily.slice(missed).find((day) => day.before <= 1e-10 && day.target > 1e-10);
  const missedIndex = bars.findIndex((bar) => bar.time === "2023-12-15");
  const nextIndex = nextEntry ? bars.findIndex((bar) => bar.time === nextEntry.time) : bars.length - 1;
  const gapEvidence = bars.slice(missedIndex, nextIndex + 1).map((bar, offset) => ({ time: bar.time, close: bar.close,
    ...shapeEntryEvidence(context, missedIndex + offset, Math.max(0, missedIndex + offset - 10)) }));
  const best = rank(rows.filter((row) => row.policy.id !== "baseline"));
  const sensitivity = [];
  const selected = [...new Map([baseline, ...best.slice(0, 5), ...rank(entries).slice(0, 2), ...rank(exits).slice(0, 2),
    ...entries.filter((row) => row.policy.entry === "close4" && row.policy.entryPriority === "fallback" && row.policy.wmaGate &&
      row.policy.declineScope === "recent10" && row.policy.entryRsi === "off" && [0.05, 0.08].includes(row.policy.decline)),
    ...exits.filter((row) => row.policy.exit === "opens4" && row.policy.exitRsi === "off")].map((row) => [row.policy.id, row])).values()];
  for (const row of selected) {
    const path = shapeReplay(context, decisions, start, row.policy, true);
    sensitivity.push({ id: row.policy.id, nextOpen: measure(path.targets, true), events: path.events });
  }
  const concentration = [];
  for (const row of best.slice(0, 2)) {
    const path = shapeReplay(context, decisions, start, row.policy, true);
    const omitted = path.events.slice(0, 100).map((event) => ({ time: event.time, kind: event.kind,
      ...run(row.policy, false, new Set([event.index])) }));
    concentration.push({ id: row.policy.id, eventCount: path.events.length, checked: omitted.length,
      worstOmission: [...omitted].sort((left, right) => left.totalReturn - right.totalReturn)[0] ?? null });
  }
  const firstSelected = [...rows].sort((left, right) => right.first1500.totalReturn - left.first1500.totalReturn)[0]!;
  const primaryRsi = rank(entries.filter((row) => row.policy.entry === "close4" && row.policy.entryPriority === "fallback" &&
    row.policy.wmaGate && row.policy.declineScope === "recent10" && row.policy.entryRsi !== "off"));
  const rescue = [shapeBaseline, ...entries.filter((row) => row.policy.entry === "close4" && row.policy.entryPriority === "fallback" &&
    row.policy.wmaGate && row.policy.declineScope === "recent10" && row.policy.entryRsi === "off").map((row) => row.policy)];
  const max5ShapeRescue = rescue.map((policy) => {
    const path = shapeReplay(context, max5, start, policy, true);
    const index = bars.findIndex((bar) => bar.time === "2023-12-15");
    let previous = path.targets[index - 1] ?? 0;
    let entry: string | null = null;
    for (let cursor = index; cursor < bars.length; cursor += 1) {
      if (previous <= 1e-10 && path.targets[cursor]! > 1e-10) { entry = bars[cursor]!.time; break; }
      previous = path.targets[cursor]!;
    }
    return { id: policy.id, nextEntry: entry, ...measure(path.targets) };
  });
  const episodePolicy = entries.find((row) => row.policy.id === "entry-close4-5-fallback-wma1-off")!.policy;
  const episodePath = shapeReplay(context, decisions, start, episodePolicy, true);
  const entryEpisodes = episodePath.events.filter((event) => event.kind === "entry").map((event) => {
    let end = event.index + 1;
    while (end < bars.length && episodePath.targets[end]! > 1e-10) end += 1;
    end = Math.min(end, bars.length - 1);
    const price = bars[event.index]!.close, prices = bars.slice(event.index, end + 1).map((bar) => bar.close);
    return { entry: event.time, exit: bars[end]!.time, sessions: end - event.index,
      priceReturn: (bars[end]!.close / price - 1) * 100, mfe: (Math.max(...prices) / price - 1) * 100,
      mae: (Math.min(...prices) / price - 1) * 100, strength: event.strength };
  });
  const summary = { identity, sourceHash, implementationHash, sessions: 2000, start: bars[start]!.time,
    end: bars.at(-1)!.time, policies: rows.length, baseline,
    missedEntry: { missedDay: "2023-12-15", nextEntry, following20: maxPath.daily.slice(missed, missed + 40),
      baselineFirstEntry: contributionReplay(bars, decisions, start, DEFAULT_POSITION_OVERLAY_OPTIONS).daily[missed],
      limitation: "Seven six-leg dates replaced with max5 winners; not a full max5 rescreen" },
    primaryEntries: entries.filter((row) => row.policy.entry === "close4" && row.policy.entryPriority === "fallback" && row.policy.wmaGate && row.policy.entryRsi === "off" && row.policy.declineScope === "recent10"),
    primaryExits: exits.filter((row) => row.policy.exit === "opens4"),
    topEntries: rank(entries).slice(0, 12), topExits: rank(exits).slice(0, 12),
    topCombined: rank(rows.filter((row) => row.policy.id.startsWith("combined:"))).slice(0, 12),
    doubleImprovers: best.filter((row) => score(row) > 1e-9).length,
    tripleImprovers: best.filter((row) => score(row) > 1e-9 && row.maxDrawdown > baseline.maxDrawdown + 1e-9).length,
    first1500Selected: firstSelected, sensitivity, concentration, primaryRsi, max5ShapeRescue, entryEpisodes,
    max5GapEvidence: { sessions: nextIndex - missedIndex, rows: gapEvidence,
      maxPriorDecline: Math.max(...gapEvidence.map((row) => row.decline)),
      closeChange: (bars[nextIndex]!.close / bars[missedIndex]!.close - 1) * 100 }, rows };
  await atomic(join(root, "output/shape-priority/summary.json"), summary);
  const table = (values: Row[]) => ["| Rule | Full2000 | Last500 | MaxDD | Entries / forced exits |", "|---|---:|---:|---:|---:|",
    ...values.map((row) => `| ${row.policy.id} | ${row.totalReturn.toFixed(2)}% | ${row.final500.totalReturn.toFixed(2)}% | ${Math.abs(row.maxDrawdown).toFixed(2)}% | ${row.entries} / ${row.forced} |`)].join("\n");
  await writeFile(join(root, "output/shape-priority/REPORT.md"), `# Shape priority research\n\nFrozen ${summary.start}..${summary.end}; ${rows.length} exploratory policies.\n\nMax5 missed entry next enters ${nextEntry?.time ?? "never"}. Only seven six-leg dates were replaced, not a full max5 search.\n\n## Primary entry thresholds\n\n${table([baseline, ...summary.primaryEntries])}\n\n## Four descending opens\n\n${table(summary.primaryExits)}\n\n## Best entry shapes\n\n${table(summary.topEntries)}\n\n## Best exits\n\n${table(summary.topExits)}\n\n## Combined\n\n${table(summary.topCombined)}\n\nAll rows use the Nikkei close proxy, original costs and frozen winners. Next-open sensitivity, event omissions and first1500-selected evaluation are in summary.json. Historical search winners are not unseen evidence; production remains unchanged.\n`);
  console.log(JSON.stringify({ policies: rows.length, baseline, nextEntry, best: best.slice(0, 3), double: summary.doubleImprovers, triple: summary.tripleImprovers }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
