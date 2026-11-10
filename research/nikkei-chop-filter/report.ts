import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Row } from "./model";
const root = dirname(fileURLToPath(import.meta.url));
const summary = JSON.parse(await readFile(join(root, "output/summary.json"), "utf8")) as {
  rows: Row[]; baseline: Row; splits: { start: string; end: string; sessions: number }[];
  baselineEpisodes: { days: number; noisy: boolean; return: number }[];
  details: { id: string; missedUpBlocks: number; upBlockCount: number; gross: { full: { totalReturn: number } };
    stress: { full: { totalReturn: number } }; nextOpen: { full: { totalReturn: number }; audit: { totalReturn: number } } }[];
  unqualifiedValidationLeaders: Row[]; identity: string; sourceHash: string; rssMiB: number;
};
const fmt = (value: number) => value.toFixed(2);
const counts = { candidates: summary.rows.length - 1,
  fullReturnImprovers: summary.rows.slice(1).filter((row) => row.full.totalReturn > summary.baseline.full.totalReturn).length,
  fillReducers: summary.rows.slice(1).filter((row) => row.full.fills < summary.baseline.full.fills).length };
const group = (noisy: boolean, days: number) => {
  const episodes = summary.baselineEpisodes.filter((row) => row.noisy === noisy && row.days <= days);
  return { noisy, maxDays: days, count: episodes.length, wins: episodes.filter((row) => row.return > 0).length,
    meanReturn: episodes.length ? episodes.reduce((sum, row) => sum + row.return, 0) / episodes.length : null };
};
const diagnostics = [group(true, 7), group(false, 7), group(true, 14), group(false, 14), group(true, 10000), group(false, 10000)];
const short = summary.baselineEpisodes.filter((row) => row.days <= 7);
const bestFull = [...summary.rows.slice(1)].sort((a, b) => b.full.totalReturn - a.full.totalReturn)[0];
const extra = { counts, diagnostics, shortEpisodes: { count: short.length, losses: short.filter((row) => row.return < 0).length,
  meanReturn: short.reduce((sum, row) => sum + row.return, 0) / short.length }, bestFullPostHoc: bestFull };
await writeFile(join(root, "output/diagnostics.json"), JSON.stringify(extra, null, 2));
const lines = await readFile(join(root, "RESULTS.md"), "utf8");
const separator = "\n## Diagnostic interpretation";
const original = lines.split(separator)[0];
await writeFile(join(root, "RESULTS.md"), `${original}${separator}\n\nAll${counts.candidates} alternatives reduce full-sample fills;${counts.fullReturnImprovers} improve full-sample return.\n${short.length} closed rounds last<=7 sessions;${extra.shortEpisodes.losses} lose; average net account return per such round:${fmt(extra.shortEpisodes.meanReturn)}%.\nThe predeclared low-width/low-ER entry label identifies only${diagnostics[0].count} of those short rounds. The broad entry-time label is not a reliable substitute for the screenshots' specific losing intervals. Partial rebalances are fills, not additional independent roundtrips.\n\n| Entry label | Maximum holding sessions | Closed rounds | Wins | Mean net round return % |\n| --- | ---: | ---: | ---: | ---: |\n${diagnostics.map((row) => `| ${row.noisy ? "low-width/ER" : "other"} | ${row.maxDays} | ${row.count} | ${row.wins} | ${row.meanReturn === null ? "n/a" : fmt(row.meanReturn)} |`).join("\n")}\n\n## Cost and missed-rally sensitivity\n\n| Policy | Gross full return | Net actual cost | Stress20bps full | Next-open full | Next-open final500 | Underperforming upward blocks / total |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: |\n${summary.details.map((detail) => {
  const row = summary.rows.find((row) => row.policy.id === detail.id)!;
  return `| ${detail.id} | ${fmt(detail.gross.full.totalReturn)}% | ${fmt(row.full.totalReturn)}% | ${fmt(detail.stress.full.totalReturn)}% | ${fmt(detail.nextOpen.full.totalReturn)}% | ${fmt(detail.nextOpen.audit.totalReturn)}% | ${detail.missedUpBlocks}/${detail.upBlockCount} |`;
}).join("\n")}\n\nRally blocks are fixed nonoverlapping20-session intervals with>=5% price gains, used for descriptive missed-opportunity accounting only. Actual cost is3bps commission plus2bps slippage per executed side. Gross/net differences include compounding and are not a sum of fee cash payments. The ATR-buffer definition requires persistence of the original request and a directional move from its initial price. Transient requests can disappear, so dramatic turnover reduction is accompanied by lost entries.\n\n## Time splits and limitations\n\n${summary.splits.map((split, index) => `- ${["Development", "Validation", "Conditional audit"][index]}:${split.start}..${split.end},${split.sessions} sessions.`).join("\n")}\n\nProduction v8 and the frozen winners were previously inspected and selected on this historical input. The final500 is therefore conditional, not an untouched real-world holdout. No causal inference about the screenshots' exact dates is possible because their date axes were not supplied. Risk exits remain unfiltered. No new production rule is recommended by this screen. Best full-period candidate shown solely as post-hoc context:${bestFull.policy.id},${fmt(bestFull.full.totalReturn)}% return,${bestFull.full.fills} fills; it still trails baseline and is not selected using audit returns.\n\nVerification: source/bar identity, exact production baseline, full153-target/metric audit, zero-filter equivalence, serialized replay resume, causal-prefix tests and study resource bound. See output/audit.json. Peak observed process RSS:${summary.rssMiB}MiB in the main run.\n`);
console.log(JSON.stringify(extra));
