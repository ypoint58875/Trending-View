import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import {
  runStrategyCycleCloseBacktest, strategyCycleRecentSignals,
  resolveStrategyCycleRecentSignals, type StrategyCycleSelectionSnapshot,
  type StrategyCycleRecentSignal,
} from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest, type BacktestSettings, type AllocationBacktestResult } from "../../lib/analysis/backtest";
import type { MarketBar } from "../../lib/market/types";
import { rallyWindows, segmentReturn } from "./analyze";

const root = dirname(fileURLToPath(import.meta.url));
const studyModel = "single-account-regimes-v1";
const sha = (data: string) => createHash("sha256").update(data).digest("hex");
export const detectorIds = [
  "slope7", "slope20", "slope7-confirm2", "price-sma20", "price-sma60", "price-sma120",
  "ema10-30", "fast-entry-slow-exit60", "fast-entry-slow-exit120",
  "score70-exit40", "score90-exit40", "slope-consensus", "breakout10-exit5", "breakout20-exit10",
] as const;
export type DetectorId = typeof detectorIds[number];
export interface IndicatorState {
  sma7: number | null; sma20: number | null; sma60: number | null; sma120: number | null;
  slope7: number | null; slope20: number | null; slope60: number | null;
  ema10: number; ema30: number; score: number;
}
export function indicatorStates(bars: readonly MarketBar[]): IndicatorState[] {
  const sums = new Map([7, 20, 60, 120].map(period => [period, 0]));
  const states: IndicatorState[] = [];
  let ema10 = 0, ema30 = 0;
  for (let i = 0; i < bars.length; i += 1) {
    const close = bars[i]!.close;
    const averages = new Map<number, number | null>();
    for (const period of sums.keys()) {
      const sum = sums.get(period)! + close - (i >= period ? bars[i - period]!.close : 0);
      sums.set(period, sum); averages.set(period, i >= period - 1 ? sum / period : null);
    }
    ema10 = i ? ema10 + 2 / 11 * (close - ema10) : close;
    ema30 = i ? ema30 + 2 / 31 * (close - ema30) : close;
    const previous = states[i - 1];
    const slope = (period: 7 | 20 | 60) => {
      const prior = previous?.[`sma${period}`], now = averages.get(period);
      return prior && now ? (now / prior - 1) * 100 : null;
    };
    const sma7 = averages.get(7)!, sma20 = averages.get(20)!, sma60 = averages.get(60)!, sma120 = averages.get(120)!;
    const slope7 = slope(7), slope20 = slope(20), slope60 = slope(60);
    const score = (slope7 !== null && slope7 > 0 ? 40 : 0) + (sma20 !== null && close > sma20 ? 30 : 0) +
      (slope20 !== null && slope20 > 0 ? 20 : 0) + (sma60 !== null && close > sma60 ? 10 : 0);
    states.push({ sma7, sma20, sma60, sma120, slope7, slope20, slope60, ema10, ema30, score });
  }
  return states;
}
export function detectRegime(bars: readonly MarketBar[], id: DetectorId, indicators = indicatorStates(bars)): number[] {
  const regimes: number[] = [];
  let active = 0, entryCount = 0, exitCount = 0;
  for (let i = 0; i < bars.length; i += 1) {
    const s = indicators[i]!, close = bars[i]!.close;
    const positive7 = s.slope7 !== null && s.slope7 > 0;
    const positive20 = s.slope20 !== null && s.slope20 > 0;
    let enter = false, exit = false, entryConfirm = 1, exitConfirm = 1;
    if (id === "slope7" || id === "slope7-confirm2") {
      enter = positive7; exit = !positive7; entryConfirm = exitConfirm = id === "slope7" ? 1 : 2;
    } else if (id === "slope20") { enter = positive20; exit = !positive20; }
    else if (id.startsWith("price-sma")) {
      const period = Number(id.slice(9)) as 20 | 60 | 120;
      const average = s[`sma${period}`];
      enter = average !== null && close > average; exit = average !== null && close < average; exitConfirm = 2;
    } else if (id === "ema10-30") { enter = i >= 29 && s.ema10 > s.ema30; exit = !enter; }
    else if (id.startsWith("fast-entry-slow-exit")) {
      const average = id.endsWith("120") ? s.sma120 : s.sma60;
      enter = positive7 && s.sma20 !== null && close > s.sma20;
      exit = average !== null && close < average; exitConfirm = 2;
    } else if (id.startsWith("score")) {
      enter = s.score >= (id.startsWith("score90") ? 90 : 70);
      exit = s.score <= 40; exitConfirm = 2;
    } else if (id === "slope-consensus") {
      const votes = [s.slope7, s.slope20, s.slope60].filter(value => value !== null && value > 0).length;
      enter = votes >= 2; exit = votes < 2; exitConfirm = 2;
    } else {
      const period = id === "breakout10-exit5" ? 10 : 20;
      enter = i >= period && close > Math.max(...bars.slice(i - period, i).map(bar => bar.high));
      exit = i >= period / 2 && close < Math.min(...bars.slice(i - period / 2, i).map(bar => bar.low));
    }
    entryCount = enter ? entryCount + 1 : 0;
    exitCount = exit ? exitCount + 1 : 0;
    if (!active && entryCount >= entryConfirm) active = 1;
    else if (active && exitCount >= exitConfirm) active = 0;
    regimes.push(active);
  }
  return regimes;
}
export function singleAccountTargets(
  regime: readonly number[], start: number,
  decisions: ReadonlyMap<number, readonly StrategyCycleRecentSignal[]>,
): number[] {
  const target = new Array<number>(regime.length).fill(0);
  let inherited = 0;
  for (let i = start; i < regime.length; i += 1) {
    if (regime[i]) inherited = 1;
    else if (i > start && regime[i - 1]) inherited = 0;
    else if (decisions.has(i)) inherited = resolveStrategyCycleRecentSignals(inherited, decisions.get(i)!).targetAllocation;
    target[i] = inherited;
  }
  return target;
}
async function atomic(path: string, data: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, `${JSON.stringify(data)}\n`);
  await replaceFileAtomically(`${path}.tmp`, path);
}
export function onsetDiagnostics(bars: readonly MarketBar[], regime: readonly number[], start: number) {
  const events = bars.flatMap((bar, i) => i >= start && regime[i] === 1 && regime[i - 1] !== 1 ? [{
    time: bar.time, index: i,
    future: [5, 10, 20].map(horizon => ({ horizon, return: bars[i + horizon] ? (bars[i + horizon]!.close / bar.close - 1) * 100 : null })),
  }] : []);
  return { events, horizons: [5, 10, 20].map(horizon => {
    const returns = events.map(e => e.future.find(f => f.horizon === horizon)!.return).filter((r): r is number => r !== null);
    return { horizon, completeSignals: returns.length, nonpositiveCount: returns.filter(r => r <= 0).length,
      averageReturn: returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : null };
  }) };
}
function recognition(bars: readonly MarketBar[], regime: readonly number[], equity: AllocationBacktestResult["equity"]) {
  return rallyWindows.map(([from, to]) => {
    const first = bars.findIndex(b => b.time >= from), last = bars.findLastIndex(b => b.time <= to);
    let seen = -1;
    for (let i = first; i <= last; i += 1) if (regime[i]) { seen = i; break; }
    let onset = seen;
    while (onset > 0 && regime[onset - 1]) onset -= 1;
    let exits = 0, active = 0;
    for (let i = first; i <= last; i += 1) {
      active += regime[i] ?? 0;
      if (i > first && regime[i - 1] && !regime[i]) exits += 1;
    }
    return { from, to, detected: seen >= 0, onset: seen < 0 ? null : bars[onset]!.time,
      firstActiveInWindow: seen < 0 ? null : bars[seen]!.time,
      delaySessions: seen < 0 ? null : seen - first, activeSessions: active, totalSessions: last - first + 1,
      exitsInsideWindow: exits, return: segmentReturn(equity, from, to) };
  });
}
function replay(bars: MarketBar[], target: number[], regime: number[], start: number, settings: BacktestSettings) {
  const close = runStrategyCycleCloseBacktest(bars, target, settings);
  const next = runAllocationBacktest(bars, target, { ...settings, executionPolicy: "next-open" });
  return { totalReturn: close.totalReturn, maxDrawdown: close.maxDrawdown, tradeCount: close.tradeCount,
    nextOpenReturn: next.totalReturn, nextOpenMaxDrawdown: next.maxDrawdown,
    recognition: recognition(bars, regime, close.equity), equity: close.equity, rebalances: close.rebalances,
    onsetDiagnostics: onsetDiagnostics(bars, regime, start) };
}
async function main() {
  const sourceText = await readFile(join(root, "data/input.json"), "utf8");
  const input = JSON.parse(sourceText) as { model: string; bars: MarketBar[]; barsHash: string; snapshots: StrategyCycleSelectionSnapshot[]; settings: BacktestSettings; evaluationSessions: number };
  if (input.bars.length > 10000 || input.snapshots.length > 2048 || sha(JSON.stringify(input.bars)) !== input.barsHash ||
    !input.model.endsWith("incoming-current-signals-on-conflict-v1")) throw new Error("Frozen input failed validation");
  const { bars, settings } = input;
  const sourceHash = sha(sourceText), designHash = sha(await readFile(join(root, "REGIME_DESIGN.md"), "utf8"));
  const start = bars.length - input.evaluationSessions;
  const decisions = new Map(input.snapshots.map(s => [s.decisionIndex, strategyCycleRecentSignals(bars, s, s.decisionIndex)]));
  const indicators = indicatorStates(bars);
  const checkpointPath = join(root, "data/regime-state.json");
  let state: { model: string; sourceHash: string; designHash: string; complete: string[] } = { model: studyModel, sourceHash, designHash, complete: [] };
  try {
    state = JSON.parse(await readFile(checkpointPath, "utf8"));
    if (state.model !== studyModel || state.sourceHash !== sourceHash || state.designHash !== designHash) throw new Error("Regime checkpoint incompatible");
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  let interrupted = false;
  process.on("SIGINT", () => { interrupted = true; });
  const results: Record<string, ReturnType<typeof replay>> = {};
  const allRegimes: Record<string, number[]> = {};
  for (const detector of detectorIds) {
    const raw = detectRegime(bars, detector, indicators);
    const active = raw.map((value, i) => i < start ? 0 : value);
    allRegimes[detector] = raw;
    for (const mode of ["alone", "cycle-switch"]) {
      const id = `${detector}:${mode}`;
      const path = join(root, `output/regimes/${detector}-${mode}.json`);
      if (state.complete.includes(id)) results[id] = JSON.parse(await readFile(path, "utf8"));
      else {
        const target = mode === "alone" ? active : singleAccountTargets(raw, start, decisions);
        results[id] = replay(bars, target, raw, start, settings);
        await atomic(path, results[id]);
        state.complete.push(id); await atomic(checkpointPath, state);
      }
      const r = results[id]!;
      console.log(`${id}: ${r.totalReturn.toFixed(3)}%, DD ${r.maxDrawdown.toFixed(3)}%, windows ${r.recognition.map(w => w.return.toFixed(2)).join("/")}`);
      if (interrupted) { console.log("Stopped at committed rule; rerun resumes"); return; }
    }
  }
  await atomic(join(root, "output/regime-summary.json"), { model: studyModel, sourceHash, designHash,
    start: settings.startTime, end: settings.endTime, retrospective: true, detectors: detectorIds.length,
    capitalSplit: false, primaryRule: "score70-exit40:cycle-switch",
    variants: Object.fromEntries(Object.entries(results).map(([id, result]) => {
      const { equity, rebalances, ...rest } = result; return [id, rest];
    })) });
  const rows = ["date,sma7_slope_percent,sma20_slope_percent,price_over_sma20,price_over_sma60,score,bull_regime,single_account_target,reason"];
  const primary = allRegimes["score70-exit40"]!;
  const primaryTarget = singleAccountTargets(primary, start, decisions);
  for (let i = start; i < bars.length; i += 1) {
    const s = indicators[i]!;
    rows.push([bars[i]!.time, s.slope7, s.slope20, s.sma20 !== null && bars[i]!.close > s.sma20 ? 1 : 0,
      s.sma60 !== null && bars[i]!.close > s.sma60 ? 1 : 0, s.score, primary[i], primaryTarget[i],
      primary[i] ? "trend-priority" : primary[i - 1] ? "trend-exit" : decisions.has(i) ? "cycle-signal" : "carry"]
      .map(value => typeof value === "number" ? Number(value.toFixed(6)) : value ?? "").join(","));
  }
  const csv = join(root, "output/single-account-regime-plan.csv");
  await writeFile(`${csv}.tmp`, `${rows.join("\n")}\n`); await replaceFileAtomically(`${csv}.tmp`, csv);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
