import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atomic, root } from "./analyze";
import { efficiency, observations, wilderAtr } from "./regime-tuning";
import { ema, sma } from "../../lib/analysis/indicators";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import type { MarketBar } from "../../lib/market/types";

export type Phase = "rapid-up" | "rapid-down" | "range" | "trend-up" | "trend-down" | "transition" | "warmup";
export interface SegmentConfig { id: string; type: "EMA" | "SMA"; period: number; confirmation: number }
export const primaryConfig: SegmentConfig = { id: "EMA20-confirm3", type: "EMA", period: 20, confirmation: 3 };
export function segmentationMenu(): SegmentConfig[] {
  return ([{ type: "EMA", period: 14 }, { type: "EMA", period: 20 }, { type: "EMA", period: 30 }, { type: "SMA", period: 20 }] as const)
    .flatMap(average => [1, 3, 5].map(confirmation => ({ ...average, confirmation, id: `${average.type}${average.period}-confirm${confirmation}` })));
}
export interface SegmentFeature {
  average: number | null; slopeAtr: number | null; moveAtr: number | null; return5: number | null;
  er10: number | null; atrPercent: number | null; atrRank: number | null; shock: "up" | "down" | null;
}
export function segmentFeatures(bars: MarketBar[], config: SegmentConfig): SegmentFeature[] {
  const closes = bars.map(bar => bar.close), average = config.type === "EMA" ? ema(closes, config.period) : sma(closes, config.period);
  const points = observations(bars), atr = wilderAtr(bars);
  return bars.map((bar, index) => {
    const currentAtr = atr[index], laggedAtr = atr[index - 1];
    const change = index > 0 ? bar.close - closes[index - 1]! : 0;
    const shock = laggedAtr != null && laggedAtr > 0 && Math.abs(change) >= 2 * laggedAtr &&
      Math.abs(bar.close / closes[index - 1]! - 1) >= 0.02 ? change > 0 ? "up" : "down" : null;
    return { average: average[index]!,
      slopeAtr: average[index] != null && average[index - 5] != null && currentAtr != null && currentAtr > 0
        ? (average[index]! - average[index - 5]!) / (5 * currentAtr) : null,
      moveAtr: index >= 5 && laggedAtr != null && laggedAtr > 0 ? (bar.close - closes[index - 5]!) / laggedAtr : null,
      return5: index >= 5 ? bar.close / closes[index - 5]! - 1 : null,
      er10: efficiency(closes, index, 10), atrPercent: points[index]!.atrPercent, atrRank: points[index]!.atrRank, shock };
  });
}
export function rawPhase(feature: SegmentFeature): Phase | null {
  const { slopeAtr, moveAtr, return5, er10, atrRank } = feature;
  if (slopeAtr === null || moveAtr === null || return5 === null || er10 === null || atrRank === null) return null;
  if (slopeAtr >= 0.05 && moveAtr >= 2 && return5 >= 0.03 && er10 >= 0.45) return "rapid-up";
  if (slopeAtr <= -0.05 && moveAtr <= -2 && return5 <= -0.03 && er10 >= 0.45) return "rapid-down";
  if (er10 <= 0.25 || (Math.abs(slopeAtr) <= 0.025 && Math.abs(moveAtr) < 1)) return "range";
  if (slopeAtr >= 0.05 && er10 >= 0.25) return "trend-up";
  if (slopeAtr <= -0.05 && er10 >= 0.25) return "trend-down";
  return "transition";
}
export function confirmedPhases(raw: readonly (Phase | null)[], confirmation: number): Phase[] {
  assert.ok(Number.isInteger(confirmation) && confirmation > 0);
  let current: Phase = "warmup", candidate: Phase | null = null, count = 0;
  return raw.map(phase => {
    if (phase === null) { candidate = null; count = 0; return current; }
    if (phase === current) { candidate = null; count = 0; return current; }
    if (phase === candidate) count++;
    else { candidate = phase; count = 1; }
    if (count >= confirmation) { current = phase; candidate = null; count = 0; }
    return current;
  });
}
export function volatilityLabels(features: readonly SegmentFeature[], confirmation: number): ("wide" | "normal" | null)[] {
  let wide = false, count = 0;
  return features.map(feature => {
    if (feature.atrRank === null) { count = 0; return null; }
    const change = wide ? feature.atrRank <= 0.4 : feature.atrRank >= 0.6;
    count = change ? count + 1 : 0;
    if (count >= confirmation) { wide = !wide; count = 0; }
    return wide ? "wide" : "normal";
  });
}
export function classifyHistory(bars: MarketBar[], config: SegmentConfig) {
  const features = segmentFeatures(bars, config), raw = features.map(rawPhase);
  const phases = confirmedPhases(raw, config.confirmation), volatility = volatilityLabels(features, config.confirmation);
  const labels = phases.map((phase, index) => phase === "range" ? `range-${volatility[index] ?? "unknown"}` : phase);
  return bars.map((bar, index) => ({ index, time: bar.time, open: bar.open, close: bar.close,
    previousClose: bars[index - 1]?.close ?? bar.close, ...features[index]!, rawPhase: raw[index],
    phaseAtClose: phases[index]!, volatilityAtClose: volatility[index]!, labelAtClose: labels[index]!,
    effectiveLabel: labels[index - 1] ?? "warmup", effectivePhase: phases[index - 1] ?? "warmup" }));
}
export type ClassifiedDay = ReturnType<typeof classifyHistory>[number];
export function contiguousSegments(rows: ClassifiedDay[]) {
  const segments: { label: string; start: string; end: string; startIndex: number; endIndex: number;
    sessions: number; marketReturn: number; marketDrawdown: number; meanAtrPercent: number;
    meanEr10: number; shockDays: number; open: boolean }[] = [];
  let from = 0;
  while (from < rows.length) {
    let to = from + 1;
    while (to < rows.length && rows[to]!.effectiveLabel === rows[from]!.effectiveLabel) to++;
    const base = rows[from]!.previousClose;
    let peak = base, drawdown = 0;
    for (let index = from; index < to; index++) { peak = Math.max(peak, rows[index]!.close); drawdown = Math.min(drawdown, (rows[index]!.close / peak - 1) * 100); }
    const span = rows.slice(from, to);
    const meanKnown = (values: (number | null)[]) => {
      const known = values.filter((value): value is number => value !== null);
      return known.length ? known.reduce((total, value) => total + value, 0) / known.length : 0;
    };
    segments.push({ label: rows[from]!.effectiveLabel, start: rows[from]!.time, end: rows[to - 1]!.time,
      startIndex: from, endIndex: to - 1, sessions: to - from, marketReturn: (rows[to - 1]!.close / base - 1) * 100,
      marketDrawdown: drawdown, meanAtrPercent: meanKnown(span.map(row => row.atrPercent)),
      meanEr10: meanKnown(span.map(row => row.er10)), shockDays: span.filter(row => row.shock !== null).length, open: to === rows.length });
    from = to;
  }
  return segments;
}
export function occupancy(rows: ClassifiedDay[], from: number) {
  const counts: Record<string, number> = {};
  for (const row of rows.slice(from)) counts[row.effectiveLabel] = (counts[row.effectiveLabel] ?? 0) + 1;
  return Object.entries(counts).map(([label, sessions]) => ({ label, sessions, share: sessions / (rows.length - from) }));
}
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
async function main() {
  const inputPath = join(root, "data/full-screen-6-15/input.json"), output = join(root, "output/ma-atr-segmentation");
  assert.ok((await stat(inputPath)).size <= 16 * 1024 ** 2);
  const input = JSON.parse(await readFile(inputPath, "utf8")) as { bars: MarketBar[]; barsHash: string; accessedAt: string; batch: string };
  const sourceHash = sha(JSON.stringify(input)), { bars } = input;
  assert.ok(bars.length <= 10000 && bars.length >= 2000); assert.equal(sha(JSON.stringify(bars)), input.barsHash);
  const implementationHash = sha((await Promise.all(["SEGMENTATION_DESIGN.md", "ma-atr-segmentation.ts", "ma-atr-segmentation-plot.py",
    "regime-tuning.ts", "../../lib/analysis/indicators.ts"].map(path => readFile(join(root, path), "utf8")))).join("\n"));
  const primary = classifyHistory(bars, primaryConfig), segments = contiguousSegments(primary);
  assert.equal(segments.reduce((total, segment) => total + segment.sessions, 0), bars.length);
  const studyStart = bars.length - 2000, recentStart = bars.findIndex(bar => bar.time > "2026-07-21"); assert.ok(recentStart >= studyStart);
  const sensitivity = []; let stopping = false;
  process.on("SIGINT", () => { stopping = true; }); process.on("SIGTERM", () => { stopping = true; });
  for (const config of segmentationMenu()) {
    if (stopping || process.memoryUsage().rss > 1.5 * 1024 ** 3) throw new Error("Stopped safely; rerun the finite12-case segmentation");
    const rows = classifyHistory(bars, config), spans = contiguousSegments(rows.slice(studyStart));
    const lengths = spans.map(segment => segment.sessions).sort((left, right) => left - right);
    sensitivity.push({ config, segments: spans.length, medianSessions: lengths[Math.floor(lengths.length / 2)]!,
      singleDaySegments: lengths.filter(length => length === 1).length,
      agreementWithPrimary: rows.slice(studyStart).filter((row, index) => row.effectiveLabel === primary[studyStart + index]!.effectiveLabel).length / 2000,
      occupancy: occupancy(rows, studyStart), recent: occupancy(rows, recentStart) });
    await new Promise<void>(done => setImmediate(done));
  }
  await atomic(join(output, "daily.json"), { sourceHash, implementationHash, config: primaryConfig, rows: primary });
  await atomic(join(output, "segments.json"), { sourceHash, implementationHash, segments });
  const header = "label,start,end,sessions,marketReturn,marketDrawdown,meanAtrPercent,meanEr10,shockDays,open";
  const csv = segments.map(segment => [segment.label, segment.start, segment.end, segment.sessions, segment.marketReturn,
    segment.marketDrawdown, segment.meanAtrPercent, segment.meanEr10, segment.shockDays, segment.open].join(",")).join("\n");
  await writeFile(join(output, "segments.csv.tmp"), `${header}\n${csv}\n`);
  await replaceFileAtomically(join(output, "segments.csv.tmp"), join(output, "segments.csv"));
  const summary = { sourceHash, implementationHash, sourceAccessedAt: input.accessedAt, generatedAt: new Date().toISOString(),
    batch: input.batch, primaryConfig, source: { start: bars[0]!.time, end: bars.at(-1)!.time, bars: bars.length },
    studyStart: bars[studyStart]!.time, recentStart: bars[recentStart]!.time, segments: segments.length,
    allOccupancy: occupancy(primary, 0), studyOccupancy: occupancy(primary, studyStart), recentOccupancy: occupancy(primary, recentStart),
    recentSegments: segments.filter(segment => segment.endIndex >= recentStart),
    latest: primary.at(-1), sensitivity,
    shockEvents: primary.filter(day => day.shock !== null).map(day => ({ time: day.time, direction: day.shock,
      dailyReturn: (day.close / day.previousClose - 1) * 100, phaseAtClose: day.phaseAtClose, effectiveLabel: day.effectiveLabel })),
    limitation: "Operational retrospective segmentation, not a trained optimal classifier or trading strategy. Labels confirm at close and apply next bar. Shock events are observed at close; no historical label backfill. Final segment remains open." };
  await atomic(join(output, "summary.json"), summary);
  const stateTable = summary.studyOccupancy.map(row => `| ${row.label} | ${row.sessions} | ${(row.share * 100).toFixed(2)} |`).join("\n");
  const recentTable = summary.recentSegments.map(segment => `| ${segment.start} | ${segment.end} | ${segment.label} | ${segment.sessions} | ${segment.marketReturn.toFixed(2)} |`).join("\n");
  const sensitivityTable = sensitivity.map(row => `| ${row.config.id} | ${row.segments} | ${row.medianSessions} | ${row.singleDaySegments} | ${(row.agreementWithPrimary * 100).toFixed(1)} |`).join("\n");
  const report = `# Moving-average / ATR / efficiency segmentation\n\nSource: ${summary.source.start} through ${summary.source.end},${bars.length} daily bars. Primary: EMA20, five-session slope/displacement, WilderATR14, ER10, three-session confirmation. Separate two-ATR/two-percent one-day shock flags.\n\n## Timing and purpose\n\nDistinguish rapid one-way movement from ranges, including wide ranges. Confirmed background is not changed retroactively; effective labels use the preceding close. Single shocks can occur inside a range. Warmup requires252 valid preceding ATR-percent observations. Rapid labels mean five-session move>=3% and>=2 prior ATR, ER10>=0.45 and aligned MA slope; they are declared definitions, not verified ground truth.\n\n## Last2000 sessions\n\n${summary.studyStart} through ${summary.source.end}.\n\n| Effective label | Sessions | Share % |\n|---|---:|---:|\n${stateTable}\n\n## Segments overlapping the recent interval\n\nRecent interval starts${summary.recentStart}; first segment may have begun before this boundary. Returns are full-segment observed market changes after the previous close, not strategy returns or classifier inputs. Final segment is open.\n\n| Actual segment start | Last observed date | Label | Full segment sessions | Full segment market return % |\n|---|---|---|---:|---:|\n${recentTable}\n\n## Fixed sensitivity checks\n\n| Configuration | Last2000 segments | Median sessions | One-day segments | Label agreement % |\n|---|---:|---:|---:|---:|\n${sensitivityTable}\n\nNo configuration is chosen from returns or recent label fit. segments.csv covers all dates once without gaps; daily.json contains raw/confirmed/effective labels and observed shock flags. Run ma-atr-segmentation-plot.py for all-history, last2000 and recent PNG charts.\n\n${summary.limitation}\n`;
  await writeFile(join(output, "REPORT.md.tmp"), report); await replaceFileAtomically(join(output, "REPORT.md.tmp"), join(output, "REPORT.md"));
  console.log(JSON.stringify({ source: summary.source, segments: segments.length, study: summary.studyOccupancy,
    recent: summary.recentOccupancy, recentSegments: summary.recentSegments, latest: summary.latest,
    primarySensitivity: sensitivity.find(row => row.config.id === primaryConfig.id) }, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
