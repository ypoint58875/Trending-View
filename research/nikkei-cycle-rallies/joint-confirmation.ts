import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import { ema, adx } from "../../lib/analysis/indicators";
import { getStrategy } from "../../lib/analysis/strategies";
import { runStrategyCycleCloseBacktest } from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest, type BacktestSettings } from "../../lib/analysis/backtest";
import type { MarketBar } from "../../lib/market/types";
import { jointCandidates } from "./joint-cycles";
import { indicatorStates } from "./regime-detection";
import { rallyWindows, segmentReturn } from "./analyze";

const root = dirname(fileURLToPath(import.meta.url));
export const confirmations = ["ema", "efficiency", "directional", "breakout", "protected-score", "directional-latch", "direction-only-latch"] as const;
export type Confirmation = typeof confirmations[number];
export function qualityFeatures(bars: readonly MarketBar[]) {
  const closes = bars.map(b => b.close), average = ema(closes, 10), directional = adx([...bars], 14), standard = indicatorStates(bars);
  return bars.map((bar, i) => {
    const variation = i >= 20 ? closes.slice(i - 19, i + 1).reduce((sum, close, n) => sum + Math.abs(close - closes[i - 20 + n]!), 0) : 0;
    const momentum = i >= 20 ? closeRatio(bar.close, closes[i - 20]!) : 0;
    const efficiency = i >= 20 && variation ? Math.abs(bar.close - closes[i - 20]!) / variation : 0;
    const current = average[i], previous = average[i - 1];
    const s = standard[i]!;
    return { aboveEma: current !== null && bar.close > current, emaRising: current !== null && previous !== null && previous !== undefined && current > previous,
      belowEma: current !== null && bar.close < current,
      efficient: efficiency >= 0.25 && momentum > 0 && s.sma20 !== null && bar.close > s.sma20,
      directional: (directional.adx[i] ?? 0) >= 20 && (directional.plusDi[i] ?? 0) > (directional.minusDi[i] ?? 0),
      directionPositive: (directional.plusDi[i] ?? 0) > (directional.minusDi[i] ?? 0),
      breakout: i >= 10 && bar.close > Math.max(...bars.slice(i - 10, i).map(b => b.high)),
      technical: s.sma20 !== null && bar.close > s.sma20 && s.slope20 !== null && s.slope20 > 0 ? 1 : 0,
      efficiency, adx: directional.adx[i], plusDi: directional.plusDi[i], minusDi: directional.minusDi[i], ema10: current };
  });
}
function closeRatio(a: number, b: number) { return a / b - 1; }
export function confirmedTargets(a: readonly number[], b: readonly number[], c: readonly number[], features: ReturnType<typeof qualityFeatures>, start: number, kind: Confirmation) {
  const target = new Array<number>(a.length).fill(0);
  let inherited = 0, belowCount = 0, negativeDirectionCount = 0;
  for (let i = start; i < a.length; i += 1) {
    const f = features[i]!, support = b[i]! >= 0.5 && c[i]! >= 0.5;
    belowCount = f.belowEma ? belowCount + 1 : 0;
    negativeDirectionCount = f.directionPositive ? 0 : negativeDirectionCount + 1;
    if (kind === "ema") inherited = support && f.aboveEma && f.emaRising ? 1 : a[i]!;
    else if (kind === "efficiency") inherited = support && f.efficient ? 1 : a[i]!;
    else if (kind === "directional") inherited = support && f.directional ? 1 : a[i]!;
    else if (kind === "directional-latch" || kind === "direction-only-latch") {
      if (support && (kind === "directional-latch" ? f.directional : f.directionPositive)) inherited = 1;
      else if (negativeDirectionCount >= 2 || b[i]! < 0.5 && c[i]! < 0.5) inherited = a[i]!;
      else inherited = Math.max(inherited, a[i]!);
    }
    else if (kind === "breakout") {
      if (support && f.breakout) inherited = 1;
      else if (belowCount >= 2 || b[i]! < 0.5 && c[i]! < 0.5) inherited = a[i]!;
      else inherited = Math.max(inherited, a[i]!);
    } else {
      const score = 50 * a[i]! + 20 * b[i]! + 20 * c[i]! + 10 * f.technical;
      if (score >= 50 && f.aboveEma) inherited = 1;
      else if (score <= 20 || belowCount >= 2) inherited = a[i]!;
      else inherited = Math.max(inherited, a[i]!);
    }
    target[i] = inherited;
  }
  return target;
}
async function atomic(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true }); await writeFile(`${path}.tmp`, `${JSON.stringify(value)}\n`); await replaceFileAtomically(`${path}.tmp`, path);
}
async function main() {
  const text = await readFile(join(root, "data/input.json"), "utf8");
  const input = JSON.parse(text) as { bars: MarketBar[]; barsHash: string; settings: BacktestSettings; evaluationSessions: number; snapshots: { decisionIndex: number }[] };
  const { bars, settings } = input, start = bars.length - input.evaluationSessions;
  const baseStudy = JSON.parse(await readFile(join(root, "output/joint-summary.json"), "utf8"));
  const sourceHash = createHash("sha256").update(text).digest("hex");
  if (sourceHash !== baseStudy.sourceHash || JSON.stringify(jointCandidates()) !== JSON.stringify(baseStudy.candidates)) throw new Error("Joint source/menu changed");
  const candidates = jointCandidates(), series = candidates.map(candidate => getStrategy(candidate.id).buildTarget(bars, candidate.parameters));
  const selections = (await Promise.all(input.snapshots.map(s => readFile(join(root, `output/joint-selections/${s.decisionIndex}.json`), "utf8"))))
    .flatMap(text => JSON.parse(text) as { index: number; period: number; candidate: number }[]);
  const evidence = new Map<number, number[]>();
  for (const period of [20, 40, 60, 80, 120]) {
    const decisions = new Map(selections.filter(s => s.period === period).map(s => [s.index, s.candidate]));
    const values = new Array<number>(bars.length).fill(0); let selected = -1;
    for (let i = start; i < bars.length; i += 1) { selected = decisions.get(i) ?? selected; values[i] = selected < 0 ? 0 : series[selected]![i]!; }
    evidence.set(period, values);
  }
  const baseline = JSON.parse(await readFile(join(root, "output/cycle10.json"), "utf8"));
  const fills = new Map<string, number>(baseline.rebalances.map((fill: { time: string; targetAllocation: number }) => [fill.time, fill.targetAllocation]));
  const a = new Array<number>(bars.length).fill(0); let inherited = 0;
  for (let i = start; i < bars.length; i += 1) { inherited = fills.get(bars[i]!.time) ?? inherited; a[i] = inherited; }
  const features = qualityFeatures(bars), summary: Record<string, unknown> = {};
  let primaryTarget: number[] = [];
  let primaryFills: { time: string; fromAllocation: number; targetAllocation: number }[] = [];
  for (const [b, c] of [[20, 40], [40, 80], [60, 120]]) {
    for (const kind of confirmations) {
      const id = `${b}-${c}-${kind}`, target = confirmedTargets(a, evidence.get(b!)!, evidence.get(c!)!, features, start, kind);
      const result = runStrategyCycleCloseBacktest(bars, target, settings), next = runAllocationBacktest(bars, target, { ...settings, executionPolicy: "next-open" });
      const metrics = { totalReturn: result.totalReturn, maxDrawdown: result.maxDrawdown, tradeCount: result.tradeCount,
        nextOpenReturn: next.totalReturn, nextOpenMaxDrawdown: next.maxDrawdown,
        segments: rallyWindows.map(([from, to]) => ({ from, to, return: segmentReturn(result.equity, from, to),
          firstFullTarget: bars.find((bar, i) => bar.time >= from && bar.time <= to && target[i] === 1)?.time ?? null })) };
      summary[id] = metrics;
      if (id === "40-80-directional") { primaryTarget = target; primaryFills = result.rebalances; }
      await atomic(join(root, `output/joint-confirmation/${id}.json`), { ...metrics, target: target.slice(start), equity: result.equity, rebalances: result.rebalances });
      console.log(`${id}: ${result.totalReturn.toFixed(3)}%, DD ${result.maxDrawdown.toFixed(3)}%, next ${next.totalReturn.toFixed(3)}%, rallies ${metrics.segments.map(s => s.return.toFixed(2)).join("/")}`);
    }
  }
  const oracleTarget = [...a];
  for (const [from, to] of rallyWindows) {
    for (let i = start; i < bars.length; i += 1) if (bars[i]!.time >= from && bars[i]!.time < to) oracleTarget[i] = 1;
  }
  const oracle = runStrategyCycleCloseBacktest(bars, oracleTarget, settings);
  await atomic(join(root, "output/joint-confirmation-summary.json"), { model: "joint-confirmation-v1", sourceHash,
    designHash: createHash("sha256").update(await readFile(join(root, "JOINT_GATES_DESIGN.md"), "utf8"))
      .update(await readFile(join(root, "DIRECTIONAL_DESIGN.md"), "utf8")).digest("hex"),
    retrospective: true, sourceSelectionsFingerprint: baseStudy.fingerprint, start: settings.startTime, end: settings.endTime,
    oracleDiagnostic: { notTradable: true, requiresFutureStartEnd: true, totalReturn: oracle.totalReturn, maxDrawdown: oracle.maxDrawdown,
      description: "Actual cycle10 target outside the four future-known rally intervals; full target inside. Not a signal system or ranked candidate." }, variants: summary });
  const selectedByIndex = new Map(selections.filter(s => s.period === 40 || s.period === 80).map(s => [`${s.period}:${s.index}`, s.candidate]));
  const fillByTime = new Map(primaryFills.map(fill => [fill.time, fill]));
  const rows = ["date,cycle10_target,selected40,selected80,long40,long80,adx14,plus_di14,minus_di14,confirmation_pass,final_target,pretrade_actual_allocation,trade_direction"];
  let selected40 = -1, selected80 = -1;
  for (let i = start; i < bars.length; i += 1) {
    selected40 = selectedByIndex.get(`40:${i}`) ?? selected40;
    selected80 = selectedByIndex.get(`80:${i}`) ?? selected80;
    const f = features[i]!, fill = fillByTime.get(bars[i]!.time);
    rows.push([bars[i]!.time, a[i], candidates[selected40]!.key.replaceAll('"', "'").replaceAll(",", ";"),
      candidates[selected80]!.key.replaceAll('"', "'").replaceAll(",", ";"), evidence.get(40)![i], evidence.get(80)![i],
      f.adx, f.plusDi, f.minusDi, f.directional && evidence.get(40)![i]! >= 0.5 && evidence.get(80)![i]! >= 0.5 ? 1 : 0,
      primaryTarget[i], fill?.fromAllocation ?? "", fill ? fill.targetAllocation > fill.fromAllocation ? "increase" : "reduce" : "hold"]
      .map(value => typeof value === "number" ? Number(value.toFixed(6)) : value ?? "").join(","));
  }
  const csv = join(root, "output/joint-confirmed-decision-plan.csv"); await writeFile(`${csv}.tmp`, `${rows.join("\n")}\n`); await replaceFileAtomically(`${csv}.tmp`, csv);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
