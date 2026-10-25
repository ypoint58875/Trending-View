export function singletonView(result, copy, period = 7, duration = "one") {
  const f = (v, digits = 2) => v == null || !Number.isFinite(v) ? "—" : v.toFixed(digits);
  const pct = (v) => v == null ? "—" : `${f(v)}%`, prob = (v) => v == null ? "—" : pct(v * 100);
  const table = (heads, rows) => `<div class="scroll"><table><thead><tr>${heads.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v) => `<td>${v ?? "—"}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  const groupName = (g) => [copy.small, copy.medium, copy.large][g.ordinal - 1];
  const range = (g) => `${f(g.lower, 3)}% – ${g.upper === null ? "∞" : f(g.upper, 3) + "%"}`;
  const section = (id, title, text, content) => `<section><h2 id="${id}">${title}</h2>${text ? `<p class="muted">${text}</p>` : ""}${content}</section>`;
  const durations = result.durations.filter((r) => r.period === period);
  let html = section("durations", copy.durationTitle, copy.definitionText, table([
    copy.side, copy.duration, copy.count, copy.share, copy.mean, copy.median, copy.typical, copy.sessions], durations.map((r) => [copy[r.direction], copy[r.duration],
      r.n, prob(r.share), pct(r.meanPct), pct(r.medianPct), `${pct(r.absQ25Pct)} – ${pct(r.absQ75Pct)}`, f(r.durationMedian, 1)])));
  const groups = result.amplitudes.filter((r) => r.period === period && r.duration === duration);
  html += section("groups", copy.groupsTitle + ` · ${copy[duration]}`, copy.groupsText, table([
    copy.side, copy.group, copy.range, copy.count, copy.groupShare, copy.mean, copy.median, copy.priorMean, copy.confirmationMean, copy.priorRatio], groups.map((g) => [copy[g.direction], groupName(g), range(g),
      g.n, prob(g.share), pct(g.meanPct), pct(g.medianPct), pct(g.priorDayMeanPct), pct(g.confirmationMeanPct), prob(g.priorDayRatioMedian)])));
  const types = ["up_internal", "up_turn", "down_internal", "down_turn"];
  const summary = (type) => result.summaries.find((r) => r.period === period && r.duration === duration && r.classification === type && r.direction === (type.startsWith("up") ? "down" : "up"));
  html += section("context", copy.contextTitle, copy.contextText, table([copy.type, copy.allCount, copy.selectedCount, copy.mean, copy.median, copy.typical, copy.relative, copy.relativeN, copy.transient],
    types.map((type) => { const row = summary(type); return [copy[type], result.summaries.filter((r) => r.period === period && r.classification === type).reduce((n, r) => n + r.n, 0),
      row.n, pct(row.meanPct), pct(row.medianPct), `${pct(row.absQ25Pct)} – ${pct(row.absQ75Pct)}`, prob(row.relativeMedian), row.relativeN, row.transientN]; })) + `<p class="muted">${copy.contextWarning}</p>`);
  const local = result.transitions.filter((r) => r.period === period && r.duration === duration);
  const count = (g, classification) => local.find((r) => r.id === g.id && r.classification === classification)?.n ?? 0;
  html += section("cross", copy.crossTitle, copy.crossText, table([copy.side, copy.group, copy.count, copy.internal, copy.turn, copy.same, copy.other],
    groups.map((g) => [copy[g.direction], groupName(g), g.n, count(g, g.direction === "up" ? "down_internal" : "up_internal"),
      count(g, g.direction === "up" ? "down_turn" : "up_turn"), count(g, "with_trend"), count(g, "neutral_or_unavailable")])));
  html += section("future", copy.futureTitle + ` · N = ${period}`, copy.futureText, table([
    copy.type, copy.future1, copy.future1Up, copy.futureN, copy.futureNUp, copy.futureNCount], types.map((type) => {
    const row = summary(type); return [copy[type], pct(row.future1MeanPct), prob(row.future1UpProbability), pct(row.futureNMeanPct), prob(row.futureNUpProbability), `${row.future1N} / ${row.futureNN}`]; })));
  const arrow = (s) => s === "1" ? "↑" : s === "-1" ? "↓" : "＝";
  html += section("sequences", copy.sequenceTitle, copy.sequenceText, table([copy.side, copy.sequence, copy.type, copy.count, copy.mean],
    result.sequences.filter((r) => r.period === period).map((r) => [copy[r.direction], r.sequence.split("/").map(arrow).join(" → "), copy[r.classification], r.n, pct(r.meanPct)])));
  html += section("examples", copy.examplesTitle, copy.parentsNote, table([copy.type, copy.date, copy.confirmed, copy.mean, copy.sequence, copy.parent],
    result.examples.filter((r) => r.period === period).map((r) => [copy[r.classification], r.end, r.confirmed, pct(r.movePct), r.observedMaSequence.split("/").map(arrow).join(" → "), r.parentIntervalId])));
  return html;
}

export function renderSingletonReport(result, copy) {
  const safe = (x) => JSON.stringify(x).replaceAll("<", "\\u003c");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>${copy.title}</title>
  <style>*{box-sizing:border-box}body{margin:0;background:#f2f5fa;color:#1d2d45;font:15px/1.7 system-ui,"Microsoft YaHei",sans-serif}main{max-width:1400px;margin:auto;padding:28px}h1{font-size:29px}h2{font-size:21px;scroll-margin-top:95px}section,aside,.controls{background:white;border:1px solid #dce4ef;border-radius:12px;padding:22px;margin:18px 0}aside{background:#fff9ed}.muted{color:#65748b;font-size:13px}.controls{position:sticky;top:0;z-index:2;display:flex;gap:24px;flex-wrap:wrap;padding:12px 20px;box-shadow:0 3px 15px #132b4810}select{font:inherit;border:1px solid #b8c9dd;border-radius:6px;padding:5px 9px;margin-left:8px}.scroll{overflow:auto;max-width:100%}table{width:100%;border-collapse:collapse;white-space:nowrap}th,td{border-bottom:1px solid #e3eaf3;padding:10px 12px;text-align:right}th{font-size:13px;background:#f4f7fc;color:#516782}th:first-child,td:first-child{text-align:left}a{color:#245ccd}nav{display:flex;gap:22px;flex-wrap:wrap}code,footer{overflow-wrap:anywhere}footer{font-size:12px}svg{width:100%;height:auto}@media(max-width:650px){main{padding:12px}h1{font-size:24px}section,aside{padding:15px}.controls{position:static;gap:10px;padding:12px}select{max-width:220px}table{font-size:13px}th,td{padding:8px}}</style></head>
  <body><main><h1>${copy.title}</h1><p>${copy.subtitle}</p><p class="muted">${copy.asOf} ${result.lastDate} · ${result.firstDate} – ${result.lastDate}</p>
  <nav><a href="#durations">${copy.durationTitle}</a><a href="#groups">${copy.groupsTitle}</a><a href="#context">${copy.contextTitle}</a></nav>
  <aside><p>${copy.patternText}</p><p>${copy.sourceNote}<a href="report.zh-CN.html">${copy.oldDaily}</a> · <a href="ma-interval-report.zh-CN.html">${copy.oldIntervals}</a></p></aside>
  <div class="controls"><label>${copy.period}<select id="period"><option value="7">SMA(7)</option><option value="20">SMA(20)</option></select></label>
  <label>${copy.duration}<select id="duration"><option value="one">${copy.one}</option><option value="two">${copy.two}</option><option value="long">${copy.long}</option></select></label></div>
  <div id="view">${singletonView(result, copy)}</div><section><h2>${copy.files}</h2><p>${copy.pending}${result.currentRun ? `${copy[result.currentRun.direction]} ${result.currentRun.sessions}` : copy.none}</p>
  <ul><li><a href="singleton-results.json">${copy.data}</a></li><li><a href="singleton-all-runs.csv">${copy.allRuns}</a></li><li><a href="singleton-isolated-days.csv">${copy.isolated}</a></li><li><a href="singleton-parent-intervals.csv">${copy.parents}</a></li></ul>
  <p><code>node research/nikkei-daily-move-outlook/analyze-singletons.mjs</code></p></section><footer>SHA-256 ${result.sourceHash}</footer></main>
  <script>const result=${safe(result)},copy=${safe(copy)};const render=${singletonView.toString()};function update(){document.getElementById('view').innerHTML=render(result,copy,+document.getElementById('period').value,document.getElementById('duration').value)}document.getElementById('period').addEventListener('change',update);document.getElementById('duration').addEventListener('change',update);window.addEventListener('pageshow',update);update();</script></body></html>`;
}
