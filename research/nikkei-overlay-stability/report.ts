import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { deserialize } from "node:v8";
import { root, current, parameterId, Features, targets, atomic, pathMetrics, type Parameters } from "./analyze";
import { runStrategyCycleCloseBacktest, type StrategyCycleRecentSignal } from "../../lib/analysis/strategy-cycle-validation";
import { runAllocationBacktest } from "../../lib/analysis/backtest";
import { text as t } from "./ui-text";

const output = join(root, "output"), s = JSON.parse(await readFile(join(output, "summary.json"), "utf8"));
const input = JSON.parse(await readFile(join(root, "data/input.json"), "utf8"));
const cached = JSON.parse(await readFile(join(root, "data/signals.json"), "utf8"));
if (cached.sourceHash !== s.sourceHash) throw new Error("Report source differs");
type GridRow = Parameters & { id: string; totalReturn: number; maxDrawdown: number; rebalances: number;
  block1Return: number; block2Return: number; block3Return: number; block4Return: number };
const rows: GridRow[] = [], prefixes = new Map<string, Float64Array>();
for (const file of (await readdir(join(output, "cache"))).filter(n => n.endsWith(".bin"))) {
  const chunk = deserialize(await readFile(join(output, "cache", file)));
  if (chunk.sourceHash !== s.sourceHash || chunk.designHash !== s.designHash) throw new Error("Report grid differs");
  rows.push(...chunk.rows); chunk.ids.forEach((id: string, i: number) => prefixes.set(id, chunk.prefixes[i]));
}
const c = rows.find(x => x.id === parameterId(current))!;
const dimensions = ["entry", "exit", "gate", "threshold"] as const;
const single = dimensions.map(d => {
  const candidates = rows.filter(x => x.flags === 7 && dimensions.every(k => k === d || x[k] === c[k]));
  return { dimension: d, selected: candidates.map(x => ({ ...x, first1500Return: pathMetrics(prefixes.get(x.id)!, 0, 1500).totalReturn }))
    .sort((a, b) => b.first1500Return - a.first1500Return || a.id.localeCompare(b.id))[0]! };
});
const ema8: Parameters = { ...current, entry: 8 };
const ema8row = rows.find(x => x.id === parameterId(ema8))!;
const decisions = new Map<number, StrategyCycleRecentSignal[]>(cached.rows.map((r: { index: number; signals: StrategyCycleRecentSignal[] }) => [r.index, r.signals]));
const start = input.bars.length - 2000;
const target = targets(input.bars, decisions, start, ema8, new Features(input.bars));
const sensitivity = [];
for (const extraBps of [0, 5, 10]) for (const execution of ["close-proxy", "next-open"] as const) {
  const settings = { ...input.settings, commissionRate: input.settings.commissionRate + extraBps / 10000 };
  const result = execution === "close-proxy" ? runStrategyCycleCloseBacktest(input.bars, target, settings) : runAllocationBacktest(input.bars, target, { ...settings, executionPolicy: "next-open" });
  sensitivity.push({ extraBps, execution, totalReturn: result.totalReturn, maxDrawdown: result.maxDrawdown });
}
const neighbors = rows.filter(x => x.flags === 7 && Math.abs(x.entry - 8) <= 1 && Math.abs(x.exit - 10) <= 1 && Math.abs(x.gate - 14) <= 1 && Math.abs(x.threshold - 0.001) <= 0.0002500001);
const robustness = { count: neighbors.length, beatCurrent: neighbors.filter(x => x.totalReturn > c.totalReturn).length,
  medianReturn: neighbors.map(x => x.totalReturn).sort((a, b) => a - b)[Math.floor(neighbors.length / 2)] };
await atomic(join(output, "supplemental-diagnostics.json"), { sourceHash: s.sourceHash, designHash: s.designHash,
  status: "Post hoc one-dimension diagnostics; not an untouched validation", single, ema8: ema8row, sensitivity, robustness });
const q = (x: unknown) => '"' + String(x).replaceAll('"', '""') + '"';
await writeFile(join(output, "one-parameter.csv"), ["dimension,selected_value,first1500_return,final500_return,full_return,max_drawdown",
  ...single.map(x => [x.dimension, x.selected[x.dimension as keyof typeof x.selected], x.selected.first1500Return, x.selected.block4Return, x.selected.totalReturn, x.selected.maxDrawdown].map(q).join(","))].join("\n") + "\n");
const pct = (v: number) => `${v.toFixed(2)}%`;
const escape = (v: unknown) => String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const table = (headers: string[], data: unknown[][]) => `<div class="table"><table><thead><tr>${headers.map(x => `<th>${escape(x)}</th>`).join("")}</tr></thead><tbody>${data.map(r => `<tr>${r.map(x => `<td>${escape(x)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
const fixedData = [[t.current, c], [t.simple, ema8row], [t.fullbest, s.fullBestDiagnostic],
  [t.off, rows.find(x => x.flags === 0)], [t.holding, { totalReturn: s.controls.holding.full.totalReturn, maxDrawdown: s.controls.holding.full.maxDrawdown, block4Return: s.controls.holding.final500.totalReturn }]] as [string, Record<string, number>][];
const policies = [s.selectedPolicy, s.policies.find((p: any) => p.id === "return-L756-U60"), s.policies.find((p: any) => p.id === "return-L756-U20")];
const age = s.ageRows.filter((x: any) => x.lookback === 756 && x.score === "return");
const dimLabels = { entry: t.entry, exit: t.exit, gate: t.gate, threshold: t.threshold };
const dates = `${input.settings.startTime} — ${input.settings.endTime}`;
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t.title}</title><style>
body{background:#0b1518;color:#e9f0ec;font:16px/1.8 system-ui,"Microsoft YaHei",sans-serif;margin:0}main{max-width:1120px;margin:auto;padding:48px 28px 80px}h1{font-size:32px;line-height:1.3}h2{font-size:23px;margin-top:44px;color:#8de4ba}p{color:#d0dcd5}.sub{color:#9cb7aa}.lead{background:#18342b;border-left:4px solid #72d9a3;padding:18px 22px;font-size:20px}.note{background:#302b1b;border:1px solid #786238;padding:18px 22px;font-size:14px}.table{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:15px}td,th{padding:12px 14px;border-bottom:1px solid #355044;text-align:right;white-space:nowrap}td:first-child,th:first-child{text-align:left}th{background:#172c25;color:#a0e6bf}a{color:#8de4ba}img{width:100%;background:#10201a;border-radius:10px}.files{display:flex;flex-wrap:wrap;gap:12px 24px}li{margin-bottom:12px}footer{color:#9cb7aa;margin-top:36px;font-size:13px}</style><main>
<h1>${t.title}</h1><p class="sub">${t.subtitle}<br>${dates} · 1293 decisions · 5839 configurations</p><div class="lead">${t.conclusion}</div><p>${t.lead}</p><p class="note">${t.caveat}</p>
<h2>${t.overview}</h2>${table([t.method, t.ret, t.dd, t.last], fixedData.map(([label, r]) => [label, pct(r.totalReturn!), pct(r.maxDrawdown!), pct(r.block4Return!)]))}
<h2>${t.blocks}</h2>${table([t.dates, t.current, t.off, t.holding], s.controls.current.blocks.map((b: any, i: number) => [b.from + " — " + b.to, pct(b.totalReturn), pct(s.controls.noOverlay.blocks[i].totalReturn), pct(s.controls.holding.blocks[i].totalReturn)]))}
<h2>${t.chart}</h2><img src="analysis.png" alt="Equity curves and 500-session return comparison">
<h2>${t.parameter}</h2><ul>${t.rules.map(x => `<li>${x}</li>`).join("")}</ul>
<h2>${t.single}</h2>${table([t.dimension, t.chosen, t.train, t.last], single.map(x => [dimLabels[x.dimension], x.dimension === "threshold" ? `${(x.selected.threshold * 100).toFixed(3)}%` : x.selected[x.dimension as keyof typeof x.selected], pct(x.selected.first1500Return), pct(x.selected.block4Return)]))}<p>${t.posthoc}</p><p>${t.plateau}</p>
<h2>${t.rolling}</h2><p>${t.rollingintro}</p>${table([t.policy, t.dev, t.common, t.last], [...policies.map((p: any, i: number) => [[t.selected, t.quarterly, t.monthly][i], pct(p.developmentReturn), pct(p.commonReturn), pct(p.final500Return)]), [t.fixed, pct(s.controls.current.development.totalReturn), pct(s.controls.current.common.totalReturn), pct(s.controls.current.final500.totalReturn)]] )}<p>${t.cadenceConclusion}</p>
<h2>${t.age}</h2><p>${t.ageintro}</p>${table([t.ageband, t.excess, t.win], age.map((x: any) => [`${x.ageFrom}–${x.ageTo}`, pct(x.excessCurrent), pct(x.beatCurrentPercent)]))}<p>${t.ageConclusion}</p>
<h2>${t.cost}</h2><p>${t.costintro}</p>${table([t.method, t.execution, t.ret, t.dd], [[t.current, t.close, pct(c.totalReturn), pct(c.maxDrawdown)],
  [t.current, t.next, pct(s.sensitivities.find((x: any) => x.id === "current" && x.extraBps === 0 && x.execution === "next-open").totalReturn), pct(s.sensitivities.find((x: any) => x.id === "current" && x.extraBps === 0 && x.execution === "next-open").maxDrawdown)],
  ...sensitivity.filter(x => x.extraBps <= 5 && (x.extraBps === 0 || x.execution === "close-proxy")).map(x => [t.simple, x.extraBps ? t.increased : x.execution === "close-proxy" ? t.close : t.next, pct(x.totalReturn), pct(x.maxDrawdown)])])}
<h2>${t.proof}</h2><p>${t.verification}</p><p><a href="https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html">TimeSeriesSplit</a> · <a href="https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf">The Probability of Backtest Overfitting</a></p>
<h2>${t.downloads}</h2><div class="files">${["fixed-grid.csv", "walk-forward.csv", "parameter-age.csv", "one-parameter.csv", "cost-timing.csv", "selected-policy-decisions.csv", "summary.json"].map((x, i) => `<a href="${x}">${t.links[i]}</a>`).join("")}</div><footer>source SHA-256: ${s.sourceHash}<br>design SHA-256: ${s.designHash}</footer></main></html>`;
await writeFile(join(output, "report.html"), html, "utf8");
const mainCsv = (await readFile(join(output, "daily-equity.csv"), "utf8")).trim().split("\n");
await writeFile(join(output, "report-equity.csv"), [mainCsv[0] + ',"ema8"', ...mainCsv.slice(1).map((line, i) => line + ',' + q(Math.exp(prefixes.get(parameterId(ema8))![i + 1]!)))].join("\n") + "\n");
console.log(JSON.stringify({ ema8: ema8row, sensitivity, single, robustness }, null, 2));
