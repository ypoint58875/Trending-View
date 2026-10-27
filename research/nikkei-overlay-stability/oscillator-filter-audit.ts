import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atomic, root } from "./analyze";
import { FilterAccount, FilterContext, filterMenu, filterReplay, type FilterPolicy } from "./oscillator-filter-study";
import { fallbackMetrics, type FallbackPolicy } from "./sma20-fallback";
import { drawdownDates } from "./sma20-fallback-audit";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import { runStrategyCycleCloseBacktest, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import type { MarketBar } from "../../lib/market/types";
import type { BacktestSettings } from "../../lib/analysis/backtest";

export function omitFilteredEpisode(context: FilterContext, decisions: ReadonlyMap<number, StrategyCycleRecentSignal[]>, start: number,
  policy: FilterPolicy, from: number, through: number) {
  assert.ok(from >= start && through >= from && through < context.bars.length);
  let current = start;
  const base = new Proxy(policy.entry.entry.base, { get: (target, property) => property === "kind" && current >= from && current <= through ?
    "baseline" : Reflect.get(target, property) }) as FallbackPolicy;
  const entry = { ...policy.entry, entry: { ...policy.entry.entry, base } };
  const account = new FilterAccount(context, { ...policy, entry }, start), targets = context.bars.map(() => 0);
  for (current = start; current < context.bars.length; current++) targets[current] = account.step(current, decisions.get(current) ?? []).target;
  return targets;
}
export function applyFilterOnlyAt(context: FilterContext, decisions: ReadonlyMap<number, StrategyCycleRecentSignal[]>, start: number,
  policy: FilterPolicy, index: number) {
  assert.ok(index >= start && index < context.bars.length);
  let current = start;
  const view = new Proxy(policy, { get: (target, property) => property === "profile" && current !== index ? "off" : Reflect.get(target, property) });
  const account = new FilterAccount(context, view, start), targets = context.bars.map(() => 0);
  for (current = start; current < context.bars.length; current++) targets[current] = account.step(current, decisions.get(current) ?? []).target;
  return targets;
}
async function main() {
  const data = join(root, "data/full-screen-6-15"), priorOutput = join(root, "output/oscillator-filter"), output = join(root, "output/oscillator-filter-audit");
  for (const file of ["input.json", "signals.json"]) assert.ok((await stat(join(data, file))).size <= 16 * 1024 ** 2);
  const input = JSON.parse(await readFile(join(data, "input.json"), "utf8")) as { bars: MarketBar[]; settings: BacktestSettings };
  const saved = JSON.parse(await readFile(join(data, "signals.json"), "utf8")) as {
    sourceHash: string; rows: { index: number; signals: StrategyCycleRecentSignal[] }[];
  };
  const prior = JSON.parse(await readFile(join(priorOutput, "summary.json"), "utf8"));
  const ledger = JSON.parse(await readFile(join(priorOutput, "goal.json"), "utf8"));
  const controlLedger = JSON.parse(await readFile(join(priorOutput, "turn-control.json"), "utf8"));
  const sha = (value: string) => createHash("sha256").update(value).digest("hex");
  assert.equal(sha(JSON.stringify(input)), saved.sourceHash); assert.equal(prior.sourceHash, saved.sourceHash);
  assert.ok(input.bars.length <= 10000 && saved.rows.length <= 2048);
  const context = new FilterContext(input.bars), start = input.bars.length - 2000;
  const boundary = input.bars.findIndex(bar => bar.time === "2026-07-21") - start + 1;
  assert.equal(boundary, 1936);
  const decisions = new Map(saved.rows.map(row => [row.index, row.signals]));
  const policy = filterMenu().find(policy => policy.id === ledger.policy.id)!;
  const path = filterReplay(context, decisions, start, policy, true);
  assert.equal(sha(JSON.stringify(path.targets)), ledger.targetHash);
  const baselinePolicy = filterMenu()[0]!, baselinePath = filterReplay(context, decisions, start, baselinePolicy);
  const finalFork = filterReplay(context, decisions, start, policy, false, start + 1500);
  assert.deepEqual(finalFork.targets.slice(0, start + 1500), baselinePath.targets.slice(0, start + 1500));
  const baseline = prior.rows[0], control = prior.rows.find((row: { policy: FilterPolicy }) => row.policy.id === "turn4-baseline-unfiltered");
  let stopping = false;
  process.on("SIGINT", () => { stopping = true; }); process.on("SIGTERM", () => { stopping = true; });
  const evaluate = (targets: number[]) => {
    if (stopping || process.memoryUsage().rss > 1.5 * 1024 ** 3) throw new Error("Stopped safely; rerun finite oscillator attribution");
    const result = runStrategyCycleCloseBacktest(input.bars, targets, input.settings);
    return { ...fallbackMetrics(result, input.settings.initialCash, boundary),
      fullDrawdown: drawdownDates(result, input.settings.initialCash), recentDrawdown: drawdownDates(result, input.settings.initialCash, boundary) };
  };
  const omissions = [];
  for (let offset = 0; offset < path.daily.length; offset++) {
    const event = path.daily[offset]!; if (!event.added) continue;
    let end = offset + 1;
    while (end < path.daily.length && path.daily[end]!.target > 1e-10 && path.daily[end]!.tagged) end++;
    end = Math.min(end, path.daily.length - 1);
    const fromIndex = start + offset, throughIndex = start + end;
    const targets = omitFilteredEpisode(context, decisions, start, policy, fromIndex, throughIndex);
    assert.deepEqual(targets.slice(0, fromIndex), path.targets.slice(0, fromIndex));
    const row = evaluate(targets);
    omissions.push({ entry: event.time, through: path.daily[end]!.time, ...row,
      retainsDualGoal: row.totalReturn > baseline.totalReturn + 1e-9 && row.final500.totalReturn > baseline.final500.totalReturn + 1e-9 });
  }
  const controlDateCounterfactuals = [];
  for (const event of controlLedger.addedEntries) {
    if (path.daily.some(day => day.time === event.time && day.added)) continue;
    const index = input.bars.findIndex(bar => bar.time === event.time);
    const actual = path.daily.find(day => day.time === event.time)!;
    const targets = applyFilterOnlyAt(context, decisions, start, policy, index);
    assert.deepEqual(targets.slice(0, index), controlLedger.targets.slice(0, index));
    const result = evaluate(targets);
    controlDateCounterfactuals.push({ time: event.time, controlEvidence: event.evidence,
      candidateState: { before: actual.before, target: actual.target, filterPassed: actual.filterPassed, low: actual.low },
      differenceReason: actual.before > 1e-10 ? "already-held-different-path" : !actual.filterPassed ? "filter-veto" : "different-rebound-state", ...result,
      deltaFullFromUnfiltered: result.totalReturn - control.totalReturn,
      deltaFinal500FromUnfiltered: result.final500.totalReturn - control.final500.totalReturn });
  }
  const bandsCombined = prior.rows.find((row: { policy: FilterPolicy }) => row.policy.id === "turn4-baseline-both");
  const auditHash = sha((await Promise.all(["oscillator-filter-audit.ts", "oscillator-filter-study.ts", "oscillator-entry-study.ts", "dual-return-study.ts"]
    .map(file => readFile(join(root, file), "utf8")))).join("\n"));
  const summary = { sourceHash: prior.sourceHash, implementationHash: prior.implementationHash, auditHash, generatedAt: new Date().toISOString(),
    candidate: policy.id, candidateFull: ledger.totalReturn, candidateFinal500: ledger.final500,
    baselineFull: baseline.totalReturn, baselineFinal500: baseline.final500,
    bandConditionSameTargets: bandsCombined.targetHash === ledger.targetHash,
    candidateDrawdowns: evaluate(path.targets), commonFinal500: evaluate(finalFork.targets), omissions, controlDateCounterfactuals,
    limitation: "Five-entry concentration and three rejected-event counterfactuals are retrospective actual-account diagnostics. Known date/episode boundaries are evaluator-only; impacts are nonadditive. No untouched validation or future guarantee." };
  await atomic(join(output, "summary.json"), summary);
  const omissionTable = omissions.map(row => `| ${row.entry} | ${row.totalReturn.toFixed(3)} | ${row.final500.totalReturn.toFixed(3)} | ${row.recent.totalReturn.toFixed(3)} | ${row.retainsDualGoal} |`).join("\n");
  const rejectionTable = controlDateCounterfactuals.map(row => `| ${row.time} | ${row.differenceReason} | ${row.deltaFullFromUnfiltered.toFixed(3)} | ${row.deltaFinal500FromUnfiltered.toFixed(3)} |`).join("\n");
  const report = `# RSI rebound filter attribution audit\n\nCandidate:${policy.id}, full${ledger.totalReturn.toFixed(3)}%, final500${ledger.final500.totalReturn.toFixed(3)}%. Adding the Bollinger AND condition has identical targets:${summary.bandConditionSameTargets}. No additional band execution benefit is established.\n\n## Remove one added episode and replay native account behavior\n\n| Omitted entry | Full % | Final500 % | Recent % | Retains native dual goal |\n|---|---:|---:|---:|---|\n${omissionTable}\n\n## Apply RSI filter only on one control entry date\n\nAll other dates use the unfiltered rebound controller. Dates absent from the candidate can also reflect already-held positions or changed account paths, not direct RSI vetoes. Compare these nonadditive effects with the full filter, never isolated trade profits.\n\n| Control entry date | Actual candidate difference | Delta full/unfiltered pp | Delta final500/unfiltered pp |\n|---|---|---:|---:|\n${rejectionTable}\n\n## Common final500 starting state\n\nSuppress all modifications through the first1500 sessions, assert unchanged baseline target prefix, then enable the candidate for attribution only. Final500 return:${summary.commonFinal500.final500.totalReturn.toFixed(3)}%, DD:${summary.commonFinal500.final500.maxDrawdown.toFixed(3)}%. This evaluator date fork is not a live trading rule.\n\nCandidate full/recent drawdown dates:${JSON.stringify(summary.candidateDrawdowns.fullDrawdown)} / ${JSON.stringify(summary.candidateDrawdowns.recentDrawdown)}.\n\n${summary.limitation}\n`;
  await writeFile(join(output, "REPORT.md.tmp"), report); await replaceFileAtomically(join(output, "REPORT.md.tmp"), join(output, "REPORT.md"));
  console.log(JSON.stringify({ candidate: summary.candidate, bandConditionSameTargets: summary.bandConditionSameTargets,
    omissions, controlDateCounterfactuals, commonFinal500: summary.commonFinal500.final500,
    drawdowns: { full: summary.candidateDrawdowns.fullDrawdown, recent: summary.candidateDrawdowns.recentDrawdown } }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
