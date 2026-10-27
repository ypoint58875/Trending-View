import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atomic, root } from "./analyze";
import { segmentFeatures, confirmedPhases, volatilityLabels, contiguousSegments, occupancy, type Phase } from "./ma-atr-segmentation";
import { efficiency, wilderAtr } from "./regime-tuning";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import type { MarketBar } from "../../lib/market/types";

export interface DerivativeConfig { id: string; lag: number; efficiency: boolean; curvature: boolean }
export const primaryDerivative: DerivativeConfig = { id: "combined-h3", lag: 3, efficiency: true, curvature: true };
export function derivativeMenu(): DerivativeConfig[] {
  return ([{ id: "slope", efficiency: false, curvature: false }, { id: "efficiency", efficiency: true, curvature: false },
    { id: "curvature", efficiency: false, curvature: true }, { id: "combined", efficiency: true, curvature: true }])
    .flatMap(config => [1, 3].map(lag => ({ ...config, id: `${config.id}-h${lag}`, lag })));
}
export function backwardDerivatives(values: (number | null)[], index: number, lag: number, atr: number | null) {
  if (index < 2 * lag || atr === null || atr <= 0 || values[index] == null || values[index - lag] == null || values[index - 2 * lag] == null)
    return { d1: null, d2: null };
  return { d1: (values[index]! - values[index - lag]!) / (lag * atr),
    d2: (values[index]! - 2 * values[index - lag]! + values[index - 2 * lag]!) / (lag * lag * atr) };
}
export function derivativeMotion(d1: number | null, d2: number | null): string {
  if (d1 === null || d2 === null) return "unknown";
  if (Math.abs(d1) <= 1e-12) return "flat";
  if (Math.abs(d2) <= 1e-12) return d1 > 0 ? "rising-steady" : "falling-steady";
  return d1 > 0 ? d2 > 0 ? "rising-accelerating" : "rising-decelerating"
    : d2 > 0 ? "falling-decelerating" : "falling-accelerating";
}
export function classifyDerivatives(bars: MarketBar[], config: DerivativeConfig) {
  const base = segmentFeatures(bars, { id: "EMA20", type: "EMA", period: 20, confirmation: 2 });
  const averages = base.map(point => point.average), atr = wilderAtr(bars), closes = bars.map(bar => bar.close);
  const features = base.map((point, index) => ({ ...point, ...backwardDerivatives(averages, index, config.lag, atr[index - 1] ?? null),
    er5: efficiency(closes, index, 5), er20: efficiency(closes, index, 20) }));
  const raw: (Phase | null)[] = features.map((point, index) => {
    if (point.d1 === null || point.d2 === null || point.atrRank === null || point.er20 === null) return null;
    if (config.efficiency && point.er20 <= 0.30) return "range";
    if (config.curvature && ((point.d1 >= 0.05 && point.d2 <= -0.005 && closes[index]! < point.average!) ||
      (point.d1 <= -0.05 && point.d2 >= 0.005 && closes[index]! > point.average!))) return "transition";
    if (point.d1 >= 0.05) return "trend-up";
    if (point.d1 <= -0.05) return "trend-down";
    return Math.abs(point.d1) <= 0.025 || !config.efficiency ? "range" : "transition";
  });
  const confirmed = confirmedPhases(raw, 2), volatility = volatilityLabels(features, 3);
  let previousLabel = "warmup", previousPhase: Phase = "warmup";
  return bars.map((bar, index) => {
    const point = features[index]!, background: Phase = raw[index] === null ? "warmup" : raw[index] === confirmed[index] ? confirmed[index]! : "transition";
    let phase = background, reason = "background";
    if (raw[index] !== null && point.shock !== null) { phase = point.shock === "up" ? "rapid-up" : "rapid-down"; reason = "shock"; }
    else if (raw[index] !== null && point.moveAtr !== null && point.return5 !== null && point.d1 !== null && point.d2 !== null &&
      (!config.efficiency || (point.er5 ?? 0) >= 0.55)) {
      if (point.moveAtr >= 1.5 && point.return5 >= 0.03 && (point.d1 >= 0.05 || (config.curvature && point.d2 >= 0.005))) { phase = "rapid-up"; reason = "sustained"; }
      if (point.moveAtr <= -1.5 && point.return5 <= -0.03 && (point.d1 <= -0.05 || (config.curvature && point.d2 <= -0.005))) { phase = "rapid-down"; reason = "sustained"; }
    }
    const label = phase === "range" ? `range-${volatility[index] ?? "unknown"}` : phase;
    const effectiveLabel = previousLabel, effectivePhase = previousPhase; previousLabel = label; previousPhase = phase;
    const motion = derivativeMotion(point.d1, point.d2);
    return { index, time: bar.time, open: bar.open, close: bar.close, previousClose: bars[index - 1]?.close ?? bar.close,
      ...point, rawPhase: raw[index], phaseAtClose: phase, backgroundAtClose: background, volatilityAtClose: volatility[index]!,
      labelAtClose: label, effectiveLabel, effectivePhase, reason, motion };
  });
}
export type DerivativeDay = ReturnType<typeof classifyDerivatives>[number];
export function derivativeWarnings(rows: DerivativeDay[], from: number) {
  const warnings = [], crossings = [];
  let censored = 0;
  for (let index = Math.max(1, from); index < rows.length; index++) {
    const current = rows[index]!, previous = rows[index - 1]!;
    if (current.d1 === null || current.d2 === null || previous.d1 === null || previous.d2 === null) continue;
    const cross = current.d1 > 0 && previous.d1 <= 0 ? 1 : current.d1 < 0 && previous.d1 >= 0 ? -1 : 0;
    if (cross && index + 5 < rows.length) crossings.push({ index, direction: cross,
      aligned: (rows[index + 5]!.close / current.close - 1) * cross > 0 });
    const warning = current.d2 > 0.005 && previous.d2 <= 0.005 && current.d1 <= 0 ? 1
      : current.d2 < -0.005 && previous.d2 >= -0.005 && current.d1 >= 0 ? -1 : 0;
    if (!warning) continue;
    if (index + 10 >= rows.length) { censored++; continue; }
    let lead: number | null = null;
    for (let offset = 1; offset <= 10; offset++) {
      const value = rows[index + offset]!.d1, prior = rows[index + offset - 1]!.d1;
      if (value != null && prior != null && (warning > 0 ? value > 0 && prior <= 0 : value < 0 && prior >= 0)) { lead = offset; break; }
    }
    warnings.push({ time: current.time, direction: warning, lead, confirmationIndex: lead === null ? null : index + lead,
      aligned5: (rows[index + 5]!.close / current.close - 1) * warning > 0 });
  }
  const matched = warnings.filter(warning => warning.lead !== null), leads = matched.map(warning => warning.lead!).sort((left, right) => left - right);
  const middle = Math.floor(leads.length / 2);
  return { warnings: warnings.length, censored, confirmations: matched.length, uniqueConfirmations: new Set(matched.map(warning => warning.confirmationIndex)).size,
    unconfirmedRate: warnings.length ? 1 - matched.length / warnings.length : 0,
    medianLead: leads.length ? (leads[middle]! + leads[Math.floor((leads.length - 1) / 2)]!) / 2 : null,
    aligned5Rate: warnings.length ? warnings.filter(warning => warning.aligned5).length / warnings.length : 0,
    slopeCrossings: crossings.length, slopeAligned5Rate: crossings.length ? crossings.filter(crossing => crossing.aligned).length / crossings.length : 0,
    events: warnings };
}
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
async function main() {
  const inputPath = join(root, "data/full-screen-6-15/input.json"), output = join(root, "output/ma-derivatives");
  assert.ok((await stat(inputPath)).size <= 16 * 1024 ** 2);
  const input = JSON.parse(await readFile(inputPath, "utf8")) as { bars: MarketBar[]; barsHash: string; accessedAt: string; batch: string };
  const { bars } = input, sourceHash = sha(JSON.stringify(input)); assert.ok(bars.length <= 10000 && bars.length >= 2000);
  assert.equal(sha(JSON.stringify(bars)), input.barsHash);
  const implementationHash = sha((await Promise.all(["MA_DERIVATIVE_DESIGN.md", "ma-derivative-study.ts", "ma-derivative-plot.py",
    "ma-atr-segmentation.ts", "regime-tuning.ts", "../../lib/analysis/indicators.ts"].map(path => readFile(join(root, path), "utf8")))).join("\n"));
  const start = bars.length - 2000, recentStart = bars.findIndex(bar => bar.time > "2026-07-21"); assert.ok(recentStart >= start);
  const primary = classifyDerivatives(bars, primaryDerivative);
  const observedRows = primary.map(row => ({ ...row, effectiveLabel: row.labelAtClose }));
  const backgroundRows = primary.map(row => ({ ...row, effectiveLabel: row.backgroundAtClose === "range"
    ? `range-${row.volatilityAtClose ?? "unknown"}` : row.backgroundAtClose }));
  const backgroundSegments = contiguousSegments(backgroundRows);
  const segments = contiguousSegments(observedRows), effectiveSegments = contiguousSegments(primary);
  assert.equal(segments.reduce((total, segment) => total + segment.sessions, 0), bars.length);
  const comparisons = [];
  for (const config of derivativeMenu()) {
    assert.ok(process.memoryUsage().rss <= 1.5 * 1024 ** 3);
    const rows = classifyDerivatives(bars, config), observed = rows.map(row => ({ ...row, effectiveLabel: row.labelAtClose }));
    const spans = contiguousSegments(observed.slice(start));
    comparisons.push({ config, segments: spans.length, singleDaySegments: spans.filter(span => span.sessions === 1).length,
      studyOccupancy: occupancy(observed, start), recentOccupancy: occupancy(observed, recentStart), warnings: derivativeWarnings(rows, start) });
  }
  await atomic(join(output, "daily.json"), { sourceHash, implementationHash, config: primaryDerivative, rows: primary });
  await atomic(join(output, "segments.json"), { sourceHash, implementationHash, background: backgroundSegments, observedBursts: segments, nextBarEffective: effectiveSegments });
  const summary = { sourceHash, implementationHash, sourceAccessedAt: input.accessedAt, generatedAt: new Date().toISOString(), batch: input.batch,
    source: { start: bars[0]!.time, end: bars.at(-1)!.time, bars: bars.length }, primaryDerivative, studyStart: bars[start]!.time,
    observedStudyOccupancy: occupancy(observedRows, start), observedRecentOccupancy: occupancy(observedRows, recentStart),
    backgroundStudyOccupancy: occupancy(backgroundRows, start), backgroundRecentOccupancy: occupancy(backgroundRows, recentStart),
    recentBackgroundSegments: backgroundSegments.filter(segment => segment.endIndex >= recentStart),
    recentSegments: segments.filter(segment => segment.endIndex >= recentStart),
    latest: primary.at(-1), comparisons,
    limitation: "Research segmentation, not trading returns or guaranteed reversal prediction. Backward differences only; observed labels known at close and effective next bar. Future prices evaluate warnings only, never create labels. No production changes." };
  await atomic(join(output, "summary.json"), summary);
  const csv = "label,start,end,sessions,marketReturn,marketDrawdown,shockDays,open\n" + segments.map(segment =>
    [segment.label, segment.start, segment.end, segment.sessions, segment.marketReturn, segment.marketDrawdown, segment.shockDays, segment.open].join(",")).join("\n") + "\n";
  await writeFile(join(output, "segments.csv.tmp"), csv); await replaceFileAtomically(join(output, "segments.csv.tmp"), join(output, "segments.csv"));
  const backgroundCsv = "label,start,end,sessions,marketReturn,marketDrawdown,shockDays,open\n" + backgroundSegments.map(segment =>
    [segment.label, segment.start, segment.end, segment.sessions, segment.marketReturn, segment.marketDrawdown, segment.shockDays, segment.open].join(",")).join("\n") + "\n";
  await writeFile(join(output, "background-segments.csv.tmp"), backgroundCsv);
  await replaceFileAtomically(join(output, "background-segments.csv.tmp"), join(output, "background-segments.csv"));
  const table = comparisons.map(row => `| ${row.config.id} | ${row.segments} | ${row.singleDaySegments} | ${row.warnings.warnings} | ${row.warnings.medianLead ?? "n/a"} | ${(row.warnings.unconfirmedRate * 100).toFixed(1)} | ${(row.warnings.aligned5Rate * 100).toFixed(1)} |`).join("\n");
  const recentTable = summary.recentBackgroundSegments.map(segment => `| ${segment.start} | ${segment.end} | ${segment.label} | ${segment.sessions} |`).join("\n");
  const report = `# EMA20 slope, curvature and directional/range segmentation\n\nAll${bars.length} frozen bars ${summary.source.start}..${summary.source.end}; study last2000 from${summary.studyStart}. Primary combined-h3 is predeclared; initial lagged EMA20-only prototype remains under output/ma-atr-segmentation.\n\nD1=(M[t]-M[t-h])/(h*priorATR14); D2=(M[t]-2M[t-h]+M[t-2h])/(h^2*priorATR14). Both are backward-only, h=1 or3. ATR scales the same price numerator rather than being differentiated.\n\nPositive D1/positive D2 means rising acceleration; positive D1/negative D2 means rising deceleration. Negative D1/positive D2 means falling deceleration, not already rising. Negative D1/negative D2 means accelerating decline. D2 alone cannot set directional burst labels; actual price displacement and volatility thresholds are also required.\n\n## Warning evaluation over last2000 sessions\n\n| Model | Segments | One-day segments | Complete curvature warnings | Median lead to slope zero-cross | Unconfirmed within10 days % | Forward5 direction agreement % |\n|---|---:|---:|---:|---:|---:|---:|\n${table}\n\nThe same warnings appear across models with the same h because derivative features are independent of classification. Only warnings with a complete10-session future are scored. Repeated warnings can share one confirmation; unique counts and D1-only5-session comparison are in summary.json. Neither matching a later zero-cross nor forward direction agreement is a profitable trade test.\n\n## Observed-close segments overlapping post-July21\n\n| Actual start | Last observed date | Label | Sessions |\n|---|---|---|---:|\n${recentTable}\n\nBackground and burst are separate layers: a range can contain shock or sustained rapid sub-moves. Pending background changes publish transition instead of stale direction. Full segment market returns in segments.csv include classification-day moves and are descriptive only. Final segment remains open. No backfill.\n\nSee MA_DERIVATIVE_DESIGN.md for exact thresholds and the8 fixed configurations. Run ma-derivative-plot.py for charts. Source/design/code hashes accompany every JSON artifact.\n\n${summary.limitation}\n`;
  const primaryComparison = comparisons.find(row => row.config.id === primaryDerivative.id)!;
  const efficiencyComparison = comparisons.find(row => row.config.id === "efficiency-h3")!;
  const fastComparison = comparisons.find(row => row.config.id === "combined-h1")!;
  const warning = primaryComparison.warnings;
  const hierarchyNote = `\n## Hierarchy and limitations\n\nThe date table above is the background layer. background-segments.csv retains broad regimes; segments.csv separately records rapid sub-moves and transitions. Combining every event into one flat segmentation makes${primaryComparison.segments} segments in2000 sessions (${primaryComparison.singleDaySegments} one-day segments), versus${efficiencyComparison.segments} without curvature at h3. This is excessive for a broad regime switch and is evidence against blindly using second derivatives as direct switches. The chart therefore shades the background and uses a narrow upper strip for internal bursts.\n\nThe three-session derivative has${warning.warnings} complete warnings,${warning.confirmations} matched warning events but${warning.uniqueConfirmations} unique later slope crossings;${warning.warnings - warning.confirmations} warnings do not confirm within10 sessions. Median matched lead is${warning.medianLead} sessions;5-session directional agreement${(warning.aligned5Rate * 100).toFixed(1)}%. This is not a probability of a profitable trade, and repeated/overlapping events are dependent. The one-session version creates${fastComparison.warnings.warnings} warnings with${(fastComparison.warnings.aligned5Rate * 100).toFixed(1)}% directional agreement. Retain curvature as an observed acceleration/deceleration and uncertainty attribute until stronger validation is available.\n`;
  await writeFile(join(output, "REPORT.md.tmp"), report + hierarchyNote); await replaceFileAtomically(join(output, "REPORT.md.tmp"), join(output, "REPORT.md"));
  console.log(JSON.stringify({ recent: summary.observedRecentOccupancy, recentSegments: summary.recentSegments,
    warningComparisons: comparisons.filter(row => row.config.id.startsWith("combined")).map(row => ({ id: row.config.id, ...row.warnings, events: undefined })),
    latest: summary.latest }, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
