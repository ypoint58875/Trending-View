import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atomic, root, pathMetrics } from "./analyze";
import { RepairContext, mainFrames, repairReplay, type RepairPolicy, type MainFrame } from "./supplemental-repair";
import { runStrategyCycleCloseBacktest, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest, type AllocationBacktestResult, type BacktestSettings } from "../../lib/analysis/backtest";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import type { MarketBar } from "../../lib/market/types";

export function omitSleeveEpisode(targets: readonly number[], main: readonly MainFrame[], from: number, to: number): number[] {
  assert.ok(Number.isInteger(from) && Number.isInteger(to) && from >= 0 && from < to && to <= targets.length);
  assert.equal(main.length, targets.length);
  return targets.map((target, index) => index >= from && index < to ? main[index]!.target : target);
}
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
async function bounded(path: string) { assert.ok((await stat(path)).size <= 16 * 1024 ** 2); return readFile(path, "utf8"); }
async function main() {
  const data = join(root, "data/full-screen-6-15"), output = join(root, "output/supplemental-repair");
  const input = JSON.parse(await bounded(join(data, "input.json"))) as { bars: MarketBar[]; barsHash: string; settings: BacktestSettings };
  const signals = JSON.parse(await bounded(join(data, "signals.json"))) as { sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[] };
  const prior = JSON.parse(await bounded(join(output, "summary.json"))) as { sourceHash: string; implementationHash: string;
    rows: { policy: RepairPolicy; targetHash: string }[] };
  const sourceHash = sha(JSON.stringify(input)); assert.equal(sourceHash, signals.sourceHash); assert.equal(sourceHash, prior.sourceHash);
  assert.equal(sha(JSON.stringify(input.bars)), input.barsHash); assert.ok(input.bars.length <= 10000 && signals.rows.length <= 2048);
  const { bars, settings } = input, start = bars.length - 2000, context = new RepairContext(bars);
  const decisions = new Map(signals.rows.map(row => [row.index, row.signals]));
  const frames = mainFrames(context, decisions, start), cutoff = bars.findIndex(bar => bar.time === "2026-07-21"); assert.ok(cutoff >= start);
  const boundary = cutoff - start + 1;
  const metrics = (result: AllocationBacktestResult) => {
    assert.equal(result.equity.length, 2000);
    const prefix = Float64Array.from([0, ...result.equity.map(point => Math.log(point.equity / settings.initialCash))]);
    return { totalReturn: result.totalReturn, maxDrawdown: result.maxDrawdown,
      first1500: pathMetrics(prefix, 0, 1500), final500: pathMetrics(prefix, 1500, 2000), recent: pathMetrics(prefix, boundary, 2000) };
  };
  const ids = ["baseline", "wide-queued-a50-percent-age10-wma", "wide-queued-a75-percent-age10-wma", "wide-queued-a100-percent-age10-wma",
    "wide-queued-a50-percent-age20-wma", "wide-queued-a50-atr-age10-wma", "none-queued-a25-percent-age10-wma"];
  const audited = [];
  for (const id of ids) {
    const stored = prior.rows.find(row => row.policy.id === id)!; assert.ok(stored);
    const path = repairReplay(context, decisions, frames, start, stored.policy, true);
    assert.equal(sha(JSON.stringify(path.targets)), stored.targetHash);
    const result = runStrategyCycleCloseBacktest(bars, path.targets, settings), episodes = [];
    for (let offset = 0; offset < path.daily.length; offset++) {
      if (!path.daily[offset]!.entered) continue;
      const entry = start + offset;
      let end = entry + 1;
      while (end < bars.length && path.daily[end - start]!.sleeveTarget > 1e-10) end++;
      const omitted = omitSleeveEpisode(path.targets, frames, entry, end);
      episodes.push({ entry: bars[entry]!.time, exit: end < bars.length ? bars[end]!.time : null,
        reason: end < bars.length ? path.daily[end - start]!.reason : "open", allocation: stored.policy.allocation,
        observedPriceReturn: end < bars.length ? (bars[end]!.close / bars[entry]!.close - 1) * 100 : null,
        withoutEpisode: metrics(runStrategyCycleCloseBacktest(bars, omitted, settings)) });
    }
    const fork = repairReplay(context, decisions, frames, start, stored.policy, false, cutoff + 1);
    const doubleCost = runStrategyCycleCloseBacktest(bars, path.targets, { ...settings, commissionRate: settings.commissionRate * 2, slippageRate: settings.slippageRate * 2 });
    const nextOpen = runAllocationBacktest(bars, path.targets, { ...settings, executionPolicy: "next-open" });
    audited.push({ id, policy: stored.policy, ...metrics(result), episodes,
      doubleCost: metrics(doubleCost), nextOpen: metrics(nextOpen), commonState: metrics(runStrategyCycleCloseBacktest(bars, fork.targets, settings)).recent });
    await atomic(join(output, `audit-${id}.json`), { sourceHash, originalImplementationHash: prior.implementationHash, policy: stored.policy,
      result, daily: path.daily, episodes });
  }
  const candidate = audited.find(row => row.id === ids[1])!, baseline = audited[0]!;
  const curvature = prior.rows.find(row => row.policy.id === "wide-queued-a50-percent-age10-curvature")!;
  const original = prior.rows.find(row => row.policy.id === ids[1])!;
  const auditHash = sha((await Promise.all([readFile(fileURLToPath(import.meta.url), "utf8"), readFile(join(root, "supplemental-repair.ts"), "utf8")])).join("\n"));
  const summary = { sourceHash, originalImplementationHash: prior.implementationHash, auditHash, generatedAt: new Date().toISOString(),
    candidate: candidate.id, audited, curvatureSameTargets: curvature.targetHash === original.targetHash,
    readiness: "Exploratory candidate only: three supplemental episodes and first1500 selection does not prefer the candidate. No automatic adoption.",
    attributionMethod: "Remove one sleeve episode from the actual combined target array while keeping main targets and every other signal schedule fixed. Counterfactual returns are not additive and do not define a new live strategy." };
  await atomic(join(output, "audit-summary.json"), summary);
  const table = audited.map(row => `| ${row.id} | ${row.totalReturn.toFixed(3)} | ${row.maxDrawdown.toFixed(3)} | ${row.recent.totalReturn.toFixed(3)} | ${row.doubleCost.totalReturn.toFixed(3)} | ${row.doubleCost.recent.totalReturn.toFixed(3)} | ${row.nextOpen.totalReturn.toFixed(3)} | ${row.nextOpen.recent.totalReturn.toFixed(3)} |`).join("\n");
  const episodeTable = candidate.episodes.map(episode => `| ${episode.entry} | ${episode.exit ?? "open"} | ${episode.reason} | ${episode.withoutEpisode.totalReturn.toFixed(3)} | ${episode.withoutEpisode.recent.totalReturn.toFixed(3)} |`).join("\n");
  const report = `# Concrete research recommendation and attribution audit\n\nCandidate for observation: ${candidate.id},50% independent supplement. Frozen source ends2026-10-26. Preserve the current main controller and its positive targets exactly; only its flat periods permit the supplemental sleeve. Main target priority also applies during local sleeve cooldown.\n\n## Exact segmented entry/exit standard\n\nWide-range entry: three consecutive closes with ER20<=0.25, abs(EMA20 three-session backward slope/priorATR14)<=0.10, and ATR14/close rank>=0.60 against preceding252 valid ATR-percent values. Entry permission begins next bar. On a regime-exit close, no new sleeve is allowed.\n\nAfter at least five sessions, leave the regime on either two consecutive ER20>=0.40 and abs(slope)>=0.15 closes; two consecutive abs(five-session displacement)>=2 priorATR andER5>=0.60 closes; or three consecutive ATR-rank<=0.40 closes. A one-day close shock>=2 priorATR and>=2% exits immediately. Unknown inputs disable the mode. No segment is backfilled. mode-intervals.csv records every actual decision and eligibility boundary.\n\nSegmentation gates entries only; an existing sleeve follows the holding exits below even when the mode ends.\n\n## Entry, cancellation and holding exits\n\nWhen the main target is zero, an EMA7 turn on a day without original signals starts a three-session window including today. Buy50% only if the mode is eligible, EMA7 rises, WMA7 is nonnegative, close>SMA20, and no original signals/cooldowns apply. Cancel on resolved original reduction, nonpositive EMA7, expiry, acquired sleeve or a positive main target. An exit disarms entry until price/trend gates become false again.\n\nExisting main entries override the sleeve. A resolved original reduction creates pending exit intent; negative WMA7 releases it. Two closes belowEMA7 with current negativeWMA7 also exit. Cumulative sleeve loss>=4% exits immediately and blocks new sleeve entries for five subsequent bars. Age>=10 closes since entry exits; entry is age0. All fills use observed close proxy, not an assumed stop price. No automatic size restoration or mandatory hold7 is added to this separate sleeve. Ordinary main rules keep their original behavior.\n\n## Measured comparisons\n\n| Policy | Full return % | Full DD % | Recent % | Double-cost full % | Double-cost recent % | Next-open full % | Next-open recent % |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${table}\n\nRecent is strictly afterJuly21 close. Same-state candidate recent:${candidate.commonState.totalReturn.toFixed(3)}%. Baseline first1500:${baseline.first1500.totalReturn.toFixed(3)}%, candidate:${candidate.first1500.totalReturn.toFixed(3)}%; chronological selection therefore retains baseline. The50/75/100 allocations and10/20 time limits are disclosed neighbors, not independent forward validations.\n\n## Candidate episode attribution\n\n| Sleeve entry | Exit or handoff | Reason | Full return if omitted % | Recent return if omitted % |\n|---|---|---|---:|---:|\n${episodeTable}\n\n${summary.attributionMethod}\n\nCurvature/WMA target paths identical at the50% candidate:${summary.curvatureSameTargets}. Curvature adds no measured incremental execution benefit here, so the concrete candidate omits the curvature exit condition. Full-history improvement is concentrated in very few episodes; this cannot establish a durable edge.\n\n${summary.readiness}\n`;
  await writeFile(join(output, "RECOMMENDATION.md.tmp"), report); await replaceFileAtomically(join(output, "RECOMMENDATION.md.tmp"), join(output, "RECOMMENDATION.md"));
  console.log(JSON.stringify({ candidate: candidate.id, metrics: { full: candidate.totalReturn, drawdown: candidate.maxDrawdown, recent: candidate.recent,
    doubleCost: candidate.doubleCost, nextOpen: candidate.nextOpen, first1500: candidate.first1500 }, episodes: candidate.episodes,
    curvatureSameTargets: summary.curvatureSameTargets }, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
