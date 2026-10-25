import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { averageSlopes, averageTypes, atomic, loadStudy, root, sha, type AverageType } from "./ma-type";

export function downturnSignals(closes: number[], period: number, type: AverageType, warning = false) {
  const { slope, sign } = averageSlopes(closes, period, type);
  return slope.map((value, i) => warning
    ? value != null && sign[i]! > 0 && slope[i - 1] != null && slope[i - 2] != null && value < slope[i - 1]! && slope[i - 1]! >= slope[i - 2]!
    : sign[i] != null && sign[i]! <= 0 && sign[i - 1] != null && sign[i - 1]! > 0);
}
/** Future prices label evaluation targets only; this function must never feed a signal. */
export function retrospectivePeaks(closes: number[], start: number) {
  const peaks: number[] = [];
  for (let i = Math.max(start, 5); i + 10 < closes.length; i++) {
    if (closes[i]! < Math.max(...closes.slice(i - 5, i + 6)) || closes.slice(i - 5, i).includes(closes[i]!) ||
      Math.min(...closes.slice(i + 1, i + 11)) / closes[i]! - 1 > -0.03) continue;
    const last = peaks.at(-1);
    if (last != null && i - last <= 10) {
      if (closes[i]! > closes[last]!) peaks[peaks.length - 1] = i;
    } else peaks.push(i);
  }
  return peaks;
}
async function main() {
  const { bars, start, sourceHash } = await loadStudy(), closes = bars.map(b => b.close);
  const designHash = sha(await readFile(fileURLToPath(import.meta.url), "utf8"));
  const peaks = retrospectivePeaks(closes, start), variants = [];
  for (const type of averageTypes) for (let period = 3; period <= 12; period++) for (const warning of [false, true]) {
    const signal = downturnSignals(closes, period, type, warning);
    const indexes = signal.flatMap((v, i) => v && i >= start ? [i] : []);
    const eligible = indexes.filter(i => i + 10 < bars.length);
    const hit = peaks.map(peak => {
      const index = indexes.find(i => i >= peak && i <= peak + 10);
      const firstDrop = closes.findIndex((v, i) => i > peak && i <= peak + 10 && v <= closes[peak]! * 0.97);
      return { peak: bars[peak]!.time, signal: index === undefined ? null : bars[index]!.time,
        delay: index === undefined ? null : index - peak,
        before3PercentDrop: index !== undefined && index < firstDrop,
        returnAtSignal: index === undefined ? null : (closes[index]! / closes[peak]! - 1) * 100 };
    });
    const detected = hit.filter(r => r.delay !== null), lag = detected.map(r => r.delay!);
    variants.push({ id: `${type}${period}-${warning ? "weakening" : "nonpositive"}`, type, period, warning,
      count: indexes.length, evaluable: eligible.length,
      down5: eligible.filter(i => closes[i + 5]! < closes[i]!).length,
      down10: eligible.filter(i => closes[i + 10]! < closes[i]!).length,
      down2Percent10: eligible.filter(i => closes[i + 10]! / closes[i]! - 1 <= -0.02).length,
      fall2Within10: eligible.filter(i => Math.min(...closes.slice(i + 1, i + 11)) / closes[i]! - 1 <= -0.02).length,
      meanReturn10: eligible.reduce((sum, i) => sum + (closes[i + 10]! / closes[i]! - 1) * 100, 0) / eligible.length,
      peaksDetected: detected.length, meanPeakDelay: lag.length ? lag.reduce((a, b) => a + b, 0) / lag.length : null,
      before3PercentDrop: hit.filter(r => r.before3PercentDrop).length,
      meanPeakReturnAtSignal: detected.length ? detected.reduce((sum, r) => sum + r.returnAtSignal!, 0) / detected.length : null,
      peakMatches: hit, signals: indexes.map(i => bars[i]!.time) });
  }
  await atomic(join(root, "output/downturn-signals-3-12-summary.json"), { sourceHash, designHash, start: bars[start]!.time,
    end: bars.at(-1)!.time, peakDefinition: "centered five-session local closing high; at least 3% subsequent closing decline within ten sessions; nearby ten-session peaks merged by higher price; retrospective labels only",
    peaks: peaks.map(i => ({ time: bars[i]!.time, close: closes[i] })), variants });
  console.log(JSON.stringify({ peaks: peaks.length, variants: variants.map(({ peakMatches, signals, ...m }) => m) }, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
