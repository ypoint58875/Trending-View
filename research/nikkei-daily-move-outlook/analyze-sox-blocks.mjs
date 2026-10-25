import { readFile, writeFile, appendFile, mkdir, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { csv, validateBars } from "./lib/core.mjs";
import { dailyDirectionBlocks } from "./lib/daily-blocks.mjs";
import { parseSoxPayload, mergeLockedBars } from "./lib/sox-source.mjs";

const root = path.dirname(fileURLToPath(import.meta.url)), file = (p) => path.join(root, p);
const hash = (s) => createHash("sha256").update(s).digest("hex"), json = (x) => JSON.stringify(x, null, 2) + "\n";
const configText = await readFile(file("sox-config.json"), "utf8"), config = JSON.parse(configText);
const offline = process.argv.includes("--offline"), refresh = process.argv.includes("--refresh");
if ((offline && refresh) || process.argv.slice(2).some((a) => !["--offline", "--refresh"].includes(a))) throw new Error("Usage: node research/nikkei-daily-move-outlook/analyze-sox-blocks.mjs [--offline|--refresh]");
async function atomic(name, content) {
  const target = file(name); await mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.tmp`; await writeFile(temp, content, "utf8"); await rename(temp, target);
}
async function readOptional(name) {
  try { return await readFile(file(name), "utf8"); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
const stateText = await readOptional("data/state/sox-sync.json");
let state = stateText ? JSON.parse(stateText) : null;
if (state && (state.schemaVersion !== config.schemaVersion || state.symbol !== config.symbol || state.timeZone !== config.timeZone)) throw new Error("Incompatible SOX sync state; preserve the snapshot and use a separate source namespace");
if (state && hash(csv(state.bars)) !== state.dataHash) throw new Error("SOX committed state hash mismatch");
if (state) validateBars(state.bars, config.maximumBars);
const complete = state?.bars.at(-1)?.date >= config.analysisEnd;
if (!offline && (!complete || refresh)) {
  const from = state ? new Date(Date.parse(state.bars.at(-1).date + "T00:00:00Z") - config.overlapDays * 86400000).toISOString().slice(0, 10) : config.sourceStart;
  const parameters = { period1: Math.floor(Date.parse(from + "T00:00:00Z") / 1000),
    period2: Math.floor(Date.parse(config.analysisEnd + "T00:00:00Z") / 1000) + 86400,
    interval: "1d", events: "history" };
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(config.symbol)}?${new URLSearchParams(parameters)}`;
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Independent-Index-Direction-Research/1.0" }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`SOX acquisition failed with HTTP ${response.status}`);
  let bytes = 0; const chunks = [];
  for await (const chunk of response.body) { bytes += chunk.length; if (bytes > config.maximumResponseBytes) throw new Error("SOX source exceeds byte limit"); chunks.push(chunk); }
  const raw = Buffer.concat(chunks).toString("utf8"), accessedAt = new Date().toISOString();
  const rawHash = hash(raw), rawPath = `data/raw/sox/yahoo-${rawHash.slice(0, 20)}.json`;
  await atomic(rawPath, raw);
  const parsed = parseSoxPayload(JSON.parse(raw), config);
  const merged = mergeLockedBars(state?.bars ?? [], parsed.bars, config.maximumBars);
  const source = { provider: "Yahoo Finance", url, accessedAt, parameters, rawPath, rawHash,
    identity: parsed.identity, rejectedDates: parsed.rejected, revisions: merged.revisions };
  state = { schemaVersion: config.schemaVersion, symbol: config.symbol, timeZone: config.timeZone,
    bars: merged.bars, dataHash: hash(csv(merged.bars)), source };
  const registry = await readOptional("data/source_registry.jsonl") ?? "";
  const key = hash(url + rawHash);
  if (!registry.split(/\r?\n/).filter(Boolean).some((line) => JSON.parse(line).sourceKey === key)) {
    await appendFile(file("data/source_registry.jsonl"), json({ type: "sox_index_history", sourceKey: key, ...source }).trim().replaceAll("\n", " ") + "\n", "utf8");
  }
  await atomic("data/processed/sox-daily.csv", csv(state.bars));
  await atomic("data/state/sox-sync.json", json(state));
}
if (!state) throw new Error("No local SOX snapshot; run once without --offline");
if (state.bars.at(-1).date < config.analysisEnd) throw new Error("SOX snapshot does not reach the requested end date");
const bars = state.bars.filter((b) => b.date <= config.analysisEnd);
if (bars[0].date >= config.analysisStart || !bars.some((b) => b.date === config.analysisStart)) throw new Error("Missing SOX analysis start or preceding close");
await atomic("data/processed/sox-daily.csv", csv(state.bars));
const rows = dailyDirectionBlocks(bars, config.analysisStart, config.blockSize);
const total = rows.reduce((a, r) => ({ sessions: a.sessions + r.sessions, upDays: a.upDays + r.upDays,
  downDays: a.downDays + r.downDays, flatDays: a.flatDays + r.flatDays }), { sessions: 0, upDays: 0, downDays: 0, flatDays: 0 });
const copy = JSON.parse(await readFile(file("sox-copy.zh-CN.json"), "utf8"));
const pct = (v) => v.toFixed(2) + "%";
const result = { config, generatedAt: new Date().toISOString(), source: state.source, sourceHash: state.dataHash,
  firstDate: rows[0].startDate, lastDate: rows.at(-1).endDate, total, rows };
const headers = [copy.block, copy.start, copy.end, copy.days, copy.up, copy.upPct, copy.down, copy.downPct, copy.flat, copy.flatPct];
const tableRows = rows.map((r) => [r.block + (r.complete ? "" : ` (${copy.partial})`), r.startDate, r.endDate, r.sessions,
  r.upDays, pct(r.upPct), r.downDays, pct(r.downPct), r.flatDays, pct(r.flatPct)]);
const totalRow = [copy.total, result.firstDate, result.lastDate, total.sessions, total.upDays, pct(total.upDays / total.sessions * 100),
  total.downDays, pct(total.downDays / total.sessions * 100), total.flatDays, pct(total.flatDays / total.sessions * 100)];
const points = rows.map((r, i) => `${55 + i / Math.max(1, rows.length - 1) * 925},${280 - r.upPct * 4}`).join(" ");
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>${copy.title}</title>
<style>*{box-sizing:border-box}body{margin:0;background:#f3f6fa;color:#20324d;font:15px/1.7 system-ui,"Microsoft YaHei",sans-serif}main{max-width:1400px;margin:auto;padding:24px}section{background:#fff;border:1px solid #dce5f1;border-radius:12px;padding:22px;margin:18px 0}h1{font-size:27px}.muted{font-size:13px;color:#65758b}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;white-space:nowrap}th,td{padding:9px 12px;border-bottom:1px solid #e3eaf3;text-align:right}th{background:#edf3fb;font-size:13px}td:first-child,th:first-child{text-align:left}tfoot{font-weight:bold}svg{width:100%;height:auto}a{color:#245ccd}.digest{overflow-wrap:anywhere}@media(max-width:650px){main{padding:12px}section{padding:14px}h1{font-size:23px}}</style></head><body><main>
<h1>${copy.title}</h1><p>${copy.snapshot}</p><section><p>${copy.method}</p><p class="muted">${copy.calendar}</p><a href="sox-200-session-blocks.csv">${copy.download}</a> · <a href="daily-200-session-report.zh-CN.html">${copy.nikkei}</a></section>
<section><svg role="img" aria-label="${copy.upPct}" viewBox="0 0 1020 225"><line x1="55" x2="980" y1="80" y2="80" stroke="#8392a8" stroke-dasharray="6 5"/>
<text x="5" y="25">65%</text><text x="5" y="85">50%</text><text x="5" y="145">35%</text><polyline fill="none" stroke="#245ccd" stroke-width="2.5" points="${points}"/><text x="55" y="205">${result.firstDate}</text><text x="880" y="205">${result.lastDate}</text></svg></section>
<section class="scroll"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${tableRows.map((r) => `<tr>${r.map((v) => `<td>${v}</td>`).join("")}</tr>`).join("")}</tbody><tfoot><tr>${totalRow.map((v) => `<td>${v}</td>`).join("")}</tr></tfoot></table></section>
<section><h2>${copy.source}</h2><p><a href="${config.officialIdentityUrl}">${copy.official}</a> · <a href="https://finance.yahoo.com/quote/%5ESOX/history/">Yahoo Finance ^SOX</a></p>
<p>${copy.accessed} ${state.source.accessedAt}<br>${copy.accepted} ${bars.length}<br>${copy.rejected} ${state.source.rejectedDates.length}</p><p class="digest">SHA-256 ${state.dataHash}</p></section></main></body></html>`;
const outputs = [["output/sox-200-session-blocks.csv", csv(rows)], ["output/sox-200-session-blocks.json", json(result)], ["output/sox-200-session-report.zh-CN.html", html]];
for (const [name, content] of outputs) await atomic(name, content);
const manifest = { status: "complete", configHash: hash(configText), sourceHash: state.dataHash, rawHash: state.source.rawHash,
  generatedAt: result.generatedAt, firstDate: result.firstDate, lastDate: result.lastDate,
  artifacts: Object.fromEntries(outputs.map(([name, content]) => [name, hash(content)])) };
await atomic("output/sox-200-session-manifest.json", json(manifest));
await atomic("data/state/sox-200-session-completion.json", json({ manifestHash: hash(json(manifest)), sourceHash: state.dataHash }));
console.log(json({ report: file("output/sox-200-session-report.zh-CN.html"), ...result }));
