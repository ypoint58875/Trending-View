import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { csv, validateBars } from "./lib/core.mjs";
import { dailyDirectionBlocks } from "./lib/daily-blocks.mjs";

const root = path.dirname(fileURLToPath(import.meta.url)), file = (p) => path.join(root, p);
const hash = (s) => createHash("sha256").update(s).digest("hex"), json = (x) => JSON.stringify(x, null, 2) + "\n";
async function atomic(name, content) {
  const target = file(name); await mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.tmp`; await writeFile(temp, content, "utf8"); await rename(temp, target);
}
if (process.argv.length > 2) throw new Error("Usage: node research/nikkei-daily-move-outlook/analyze-daily-blocks.mjs");
const source = await readFile(file("data/processed/nikkei225-daily.csv"), "utf8");
const original = JSON.parse(await readFile(file("output/run-manifest.json"), "utf8"));
if (hash(source) !== original.dataHash) throw new Error("Accepted source hash mismatch");
const bars = source.trim().split(/\r?\n/).slice(1).map((line) => {
  const [date, open, high, low, close] = line.replaceAll('"', "").split(",");
  return { date, open: +open, high: +high, low: +low, close: +close };
});
validateBars(bars, 20000);
const config = { startDate: "2000-01-04", blockSize: 200, maximumBars: 20000 };
const rows = dailyDirectionBlocks(bars, config.startDate, config.blockSize);
const total = rows.reduce((a, r) => ({ sessions: a.sessions + r.sessions, upDays: a.upDays + r.upDays,
  downDays: a.downDays + r.downDays, flatDays: a.flatDays + r.flatDays }), { sessions: 0, upDays: 0, downDays: 0, flatDays: 0 });
const copy = JSON.parse(await readFile(file("block-copy.zh-CN.json"), "utf8"));
const pct = (v) => v.toFixed(2) + "%";
const header = [copy.block, copy.start, copy.end, copy.days, copy.up, copy.upPct, copy.down, copy.downPct, copy.flat, copy.flatPct];
const body = rows.map((r) => [r.block + (r.complete ? "" : ` (${copy.partial})`), r.startDate, r.endDate, r.sessions,
  r.upDays, pct(r.upPct), r.downDays, pct(r.downPct), r.flatDays, pct(r.flatPct)]);
const footer = [copy.total, rows[0].startDate, rows.at(-1).endDate, total.sessions, total.upDays,
  pct(total.upDays / total.sessions * 100), total.downDays, pct(total.downDays / total.sessions * 100), total.flatDays, pct(total.flatDays / total.sessions * 100)];
const points = rows.map((r, i) => `${55 + i / (rows.length - 1) * 925},${280 - r.upPct * 4}`).join(" ");
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>${copy.title}</title>
<style>*{box-sizing:border-box}body{margin:0;background:#f3f6fa;color:#20324d;font:15px/1.7 system-ui,"Microsoft YaHei",sans-serif}main{max-width:1400px;margin:auto;padding:24px}section{background:#fff;border:1px solid #dce5f1;border-radius:12px;padding:22px;margin:18px 0}h1{font-size:27px}.muted{font-size:13px;color:#65758b}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;white-space:nowrap}th,td{padding:9px 12px;border-bottom:1px solid #e3eaf3;text-align:right}th{background:#edf3fb;font-size:13px}td:first-child,th:first-child{text-align:left}tfoot{font-weight:bold}svg{width:100%;height:auto}a{color:#245ccd}@media(max-width:650px){main{padding:12px}section{padding:14px}h1{font-size:23px}}</style></head><body><main>
<h1>${copy.title}</h1><p>${copy.snapshot}</p><section><p>${copy.method}</p><a href="daily-200-session-blocks.csv">${copy.download}</a></section>
<section><h2>${copy.chart}</h2><svg role="img" aria-label="${copy.chart}" viewBox="0 0 1020 225"><line x1="55" x2="980" y1="80" y2="80" stroke="#8392a8" stroke-dasharray="6 5"/>
<text x="5" y="25">65%</text><text x="5" y="85">50%</text><text x="5" y="145">35%</text><polyline fill="none" stroke="#245ccd" stroke-width="2.5" points="${points}"/>
<text x="55" y="205">${rows[0].startDate}</text><text x="880" y="205">${rows.at(-1).endDate}</text></svg><p class="muted">${copy.note}</p></section>
<section class="scroll"><table><thead><tr>${header.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((v) => `<td>${v}</td>`).join("")}</tr>`).join("")}</tbody><tfoot><tr>${footer.map((v) => `<td>${v}</td>`).join("")}</tr></tfoot></table></section>
<p class="muted">SHA-256 ${hash(source)}</p></main></body></html>`;
const result = { config, generatedAt: new Date().toISOString(), sourceHash: hash(source), total, rows };
const outputs = [["output/daily-200-session-blocks.csv", csv(rows)], ["output/daily-200-session-blocks.json", json(result)], ["output/daily-200-session-report.zh-CN.html", html]];
for (const [name, content] of outputs) await atomic(name, content);
const manifest = { ...config, sourceHash: hash(source), generatedAt: result.generatedAt,
  artifacts: Object.fromEntries(outputs.map(([name, text]) => [name, hash(text)])) };
await atomic("output/daily-200-session-manifest.json", json(manifest));
await atomic("data/state/daily-200-session-completion.json", json({ manifestHash: hash(json(manifest)), sourceHash: hash(source) }));
console.log(json({ report: file("output/daily-200-session-report.zh-CN.html"), ...result }));
