function buildView(data, c, period, horizon, sample) {
  const escape = (x) => String(x ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const num = (x, d = 2) => x === null || x === undefined || !Number.isFinite(x) ? "—" : x.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
  const pct = (x) => x === null || x === undefined ? "—" : `${num(x)}%`;
  const probability = (x) => x === null || x === undefined ? "—" : pct(x * 100);
  const signed = (x) => x === null || x === undefined ? "—" : `${x > 0 ? "+" : ""}${pct(x)}`;
  const table = (head, rows) => `<div class="table-wrap"><table><thead><tr>${head.map((x) => `<th>${escape(x)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((x) => `<td>${escape(x)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  const label = (row) => `${Math.round(row.quantileRank * 100)}%`;
  const stats = data.statistics.filter((r) => r.period === period && r.sample === sample);
  const thresholds = data.candidates.filter((r) => r.period === period);
  const results = data.summaries.filter((r) => r.period === period && r.horizon === horizon && r.sample === sample);
  const selected = (direction) => results.filter((r) => r.direction === direction).sort((a, b) => a.thresholdPct - b.thresholdPct);
  const outcomeTable = (direction) => table([
    c.percentileLabel, c.threshold, c.nWithPending, direction === "down" ? c.probUp : c.probDown,
    direction === "down" ? c.counterMeanUp : c.counterMeanDown, c.continued, c.continuedMean,
    c.baseline, c.quality
  ], selected(direction).map((r) => [label(r), pct(r.thresholdPct), `${r.n} / ${r.censoredN}`, probability(r.counterProbability),
    pct(r.counterMeanWhenOccursPct), probability(r.continuationProbability),
    pct(r.continuationMeanWhenOccursPct), probability(r.baselineCounterProbability),
    r.sparse ? c.sparse.replace("30", String(data.config.minimumDisplaySamples)) : c.descriptive]));
  const summary = table([c.direction, c.count, c.countShare, c.timeShare, c.agreement, c.meanReturn,
    c.medianReturn, c.duration, c.durationQ90, c.sameDays], stats.map((r) => [c[r.direction], r.n,
    probability(r.countShare), probability(r.sessionShare), probability(r.agreementProbability), signed(r.mean),
    signed(r.median), num(r.durationMedian, 1), num(r.durationQ90, 1), probability(r.sameDirectionDayShare)]));
  const magnitudes = table([c.direction, c.alignedCount, c.q25, c.q50, c.q75, c.q90, c.q95],
    stats.filter((r) => r.direction !== "flat").map((r) => [c[r.direction], r.alignedN,
      pct(r.alignedAbsQ25), pct(r.alignedAbsQ50), pct(r.alignedAbsQ75), pct(r.alignedAbsQ90), pct(r.alignedAbsQ95)]));
  const thresholdTable = table([c.direction, c.quantile, c.threshold, c.calibrationN, c.calibrationEnd],
    thresholds.map((r) => [c[r.direction], label(r), pct(r.thresholdPct), r.calibrationN, r.calibrationEnd]));
  const risks = table([c.direction, c.threshold, c.n, c.counterPath, c.adversePath, c.nonOverlapN, c.nonOverlapProb],
    ["down", "up"].flatMap((direction) => selected(direction).map((r) => [c[direction], pct(r.thresholdPct), r.n,
      pct(r.medianCounterMaxPct), pct(r.medianAdverseMaxPct), r.nonOverlapN, probability(r.nonOverlapCounterProbability)])));
  const active = data.active.find((r) => r.period === period);
  const currentSummary = active ? table([c.direction, c.start, c.anchorDate, c.currentMove, c.sessions],
    [[c[active.direction], active.startDate, active.anchorDate, signed(active.movePct), active.sessions]]) : "";
  const currentEvents = active ? thresholds.filter((r) => r.direction === active.direction).map((r) => {
    const event = data.events.find((e) => e.intervalId === active.id && e.quantileRank === r.quantileRank && e.direction === r.direction);
    return [label(r), pct(r.thresholdPct), event?.date ?? c.notReached, event ? active.endIndex - event.index >= horizon ? c.yes : c.no : "—"];
  }) : [];
  const current = currentSummary + table([c.quantile, c.threshold, c.triggerDate, c.currentFollowup], currentEvents);
  const recent = table([c.direction, c.start, c.end, c.confirmed, c.sessions, c.meanReturn],
    data.completed.filter((r) => r.period === period).slice(-12).map((r) => [c[r.direction], r.startDate, r.endDate,
      r.confirmedDate, r.sessions, signed(r.movePct)]));

  const chart = data.charts.find((r) => r.period === period), chartBars = chart.bars;
  const w = 1100, h = 340, left = 90, right = 1065, top = 22, bottom = 258;
  const prices = [...chartBars.map((r) => r.close), ...chart.ma.map((r) => r.ma)];
  const low = Math.min(...prices) * 0.985, high = Math.max(...prices) * 1.015;
  const x = (i) => left + i / (chartBars.length - 1) * (right - left);
  const y = (v) => bottom - (v - low) / (high - low) * (bottom - top);
  const indexFor = (date) => Math.max(0, chartBars.findIndex((r) => r.date >= date));
  let graph = "";
  for (let k = 0; k < 5; k++) {
    const v = low + k / 4 * (high - low);
    graph += `<line x1="${left}" x2="${right}" y1="${y(v)}" y2="${y(v)}" stroke="#e1e8ed"/><text x="75" y="${y(v) + 5}" text-anchor="end">${num(v, 0)}</text>`;
  }
  for (const interval of chart.intervals) {
    const from = interval.startDate <= chartBars[0].date ? 0 : indexFor(interval.startDate);
    const to = interval.endDate >= chartBars.at(-1).date ? chartBars.length - 1 : indexFor(interval.endDate);
    const color = interval.direction === "up" ? "#27866f" : interval.direction === "down" ? "#ba5655" : "#9aa6af";
    graph += `<rect x="${x(from)}" y="276" width="${Math.max(1.5, x(to + 1) - x(from))}" height="14" fill="${color}" ${interval.status === "unfinished" ? 'stroke="#203e52" stroke-dasharray="3 3"' : ""}><title>${escape(c[interval.direction])}: ${interval.startDate} / ${interval.endDate}</title></rect>`;
  }
  graph += `<polyline points="${chartBars.map((r, i) => `${x(i)},${y(r.close)}`).join(" ")}" fill="none" stroke="#15364c" stroke-width="1.8"/>`;
  graph += `<polyline points="${chart.ma.map((r, i) => `${x(i)},${y(r.ma)}`).join(" ")}" fill="none" stroke="#c58b3e" stroke-width="1.6"/>`;
  for (const i of [0, Math.floor(chartBars.length / 2), chartBars.length - 1]) graph += `<text x="${x(i)}" y="320" text-anchor="${i === chartBars.length - 1 ? "end" : "middle"}">${chartBars[i].date}</text>`;
  const history = `<div class="chart-wrap"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${escape(c.chartCaption)}"><style>text{font:14px 'Microsoft YaHei',sans-serif;fill:#526d7f}</style>${graph}</svg></div>`;

  const cw = 1100, ch = 330, cleft = 85, cright = 1055, ctop = 20, cbottom = 265;
  const maxX = Math.max(1, ...results.filter((r) => r.n > 0).map((r) => r.thresholdPct)) * 1.05;
  const cx = (v) => cleft + v / maxX * (cright - cleft), cy = (v) => cbottom - v * (cbottom - ctop);
  let curve = "";
  for (let p = 0; p <= 1; p += 0.2) curve += `<line x1="${cleft}" x2="${cright}" y1="${cy(p)}" y2="${cy(p)}" stroke="#e1e8ed"/><text x="65" y="${cy(p) + 5}" text-anchor="end">${Math.round(p * 100)}%</text>`;
  for (let k = 0; k <= 5; k++) curve += `<text x="${cx(k / 5 * maxX)}" y="300" text-anchor="middle">${num(k / 5 * maxX)}%</text>`;
  for (const direction of ["down", "up"]) {
    const values = selected(direction).filter((r) => r.counterProbability !== null);
    const color = direction === "down" ? "#27866f" : "#ba5655";
    if (values.length) curve += `<line x1="${cleft}" x2="${cright}" y1="${cy(values[0].baselineCounterProbability)}" y2="${cy(values[0].baselineCounterProbability)}" stroke="${color}" stroke-dasharray="4 5" opacity="0.65"/>`;
    curve += `<polyline points="${values.map((r) => `${cx(r.thresholdPct)},${cy(r.counterProbability)}`).join(" ")}" fill="none" stroke="${color}" stroke-width="2"/>`;
    for (const r of values) curve += `<circle cx="${cx(r.thresholdPct)}" cy="${cy(r.counterProbability)}" r="${3 + Math.min(5, Math.sqrt(r.n) / 5)}" fill="${r.sparse ? "#a3adb6" : color}"><title>${escape(c[direction])}: X=${num(r.thresholdPct)}%; n=${r.n}; ${probability(r.counterProbability)}</title></circle>`;
  }
  const curves = `<div class="legend"><span class="green">${escape(c.downQuestion)}</span><span class="red">${escape(c.upQuestion)}</span></div><div class="chart-wrap"><svg viewBox="0 0 ${cw} ${ch}" role="img" aria-label="${escape(c.curves)}"><style>text{font:14px 'Microsoft YaHei',sans-serif;fill:#526d7f}</style>${curve}</svg></div>`;
  return { summary, magnitudes, thresholdTable, down: outcomeTable("down"), up: outcomeTable("up"), risks, current, recent, history, curves };
}

export function renderIntervalReport(result, copy) {
  const escape = (x) => String(x ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const c = copy, p = result.config.maPeriods[0], h = result.config.defaultHorizon, sample = "all";
  const view = buildView(result, c, p, h, sample);
  const section = (id, title, note, body) => `<section id="${id}"><h2>${escape(title)}</h2><p class="note">${escape(note)}</p>${body}</section>`;
  const slot = (id, html) => `<div id="${id}">${html}</div>`;
  const officialDate = result.source.official?.lastDate;
  const sourceNote = officialDate && officialDate > result.lastDate ? c.sourceLag.replace("{date}", result.lastDate).replace("{official}", officialDate) : c.sourceFixed;
  const payload = { ...result, source: undefined, sourceHash: undefined, generatedAt: undefined };
  const embedded = JSON.stringify(payload).replaceAll("<", "\\u003c");
  const copyEmbedded = JSON.stringify(c).replaceAll("<", "\\u003c");
  const downloads = [["ma-interval-statistics.csv", c.downloadStats], ["ma-interval-completed.csv", c.downloadIntervals],
    ["ma-interval-thresholds.csv", c.downloadThresholds], ["ma-interval-events.csv", c.downloadEvents],
    ["ma-interval-reversal-summary.csv", c.downloadSummary], ["ma-interval-event-outcomes.csv", c.downloadOutcomes],
    ["ma-interval-manifest.json", c.downloadManifest], ["report.zh-CN.html", c.oldReport]];
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>${escape(c.title)}</title><style>
  :root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#eff3f5;color:#20394b;font-family:"Microsoft YaHei","PingFang SC",system-ui,sans-serif;line-height:1.75}main{max-width:1380px;margin:auto;padding:40px 48px 65px;background:#fff}header{border-bottom:2px solid #243f52;padding-bottom:20px}.eyebrow{color:#648195;font-size:12px;letter-spacing:1.5px}h1{font-size:32px;margin:8px 0}h2{font-size:23px;margin:0 0 10px}h3{font-size:18px;margin:28px 0 10px}p{margin:10px 0}.note,.meta{font-size:13px;color:#617486}.intro{max-width:1120px;color:#526c7f}.flow{background:#edf4f4;border-left:4px solid #27866f;padding:13px 18px;margin:22px 0}.freshness{font-size:12px;background:#fbf4e6;padding:10px 15px}.controls{position:sticky;top:0;z-index:2;background:#fffef8ed;backdrop-filter:blur(7px);display:grid;grid-template-columns:1fr 1.5fr 1.3fr;gap:18px;padding:15px 0;border-bottom:1px solid #dce5eb}.controls label{display:block;font-size:12px;color:#62788b}.controls select{display:block;margin-top:5px;width:100%;border:1px solid #b5c7d4;background:white;border-radius:4px;padding:9px;font:inherit;color:#203e53}section{border-top:1px solid #dfe7ed;margin-top:28px;padding-top:28px}.table-wrap,.chart-wrap{overflow-x:auto;margin:18px 0}.chart-wrap svg{display:block;width:100%;min-width:700px}table{width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums}th,td{padding:10px 9px;text-align:right;border-bottom:1px solid #dfe7ee;white-space:nowrap}th{background:#eef4f7;color:#4a687e;font-weight:600}th:first-child,td:first-child{text-align:left}tbody tr:nth-child(even){background:#fafcfd}a{color:#286f96;text-decoration:none}a:hover{text-decoration:underline}.links,.legend{display:flex;gap:12px 25px;flex-wrap:wrap;font-size:12px}.green{color:#237e67}.red{color:#af514f}.method-box{border-left:3px solid #7497ae;padding-left:17px}footer{color:#617b8e;font-size:12px;margin-top:30px}@media(max-width:760px){main{padding:24px 17px}h1{font-size:27px;line-height:1.4}.controls{grid-template-columns:1fr;gap:9px;position:static}.controls select{padding:8px}.flow{font-size:13px}h2{font-size:21px}}@media print{body{background:#fff}main{max-width:none;padding:0}.controls{position:static}.table-wrap{overflow:visible}table{font-size:8px}th,td{padding:4px}.chart-wrap svg{min-width:0}section{break-inside:avoid}}
  section{scroll-margin-top:120px}th{white-space:normal;min-width:65px;max-width:150px}@media(max-width:760px){section{scroll-margin-top:10px}}
  </style></head><body><main><header><div class="eyebrow">${escape(c.eyebrow)}</div><h1>${escape(c.title)}</h1><p class="intro">${escape(c.intro)}</p><p class="meta">${escape(c.asof)} ${result.lastDate} · ${result.firstDate} → ${result.lastDate} · ${result.barCount} ${escape(c.sampleBars)}</p></header>
  <div class="flow">${escape(c.steps)}</div><p class="freshness">${escape(sourceNote)}</p>
  <div class="controls"><label>${escape(c.maPeriod)}<select id="period">${result.config.maPeriods.map((n) => `<option value="${n}" ${n === p ? "selected" : ""}>SMA(${n})</option>`).join("")}</select></label><label>${escape(c.sample)}<select id="sample">${["all", "calibration", "evaluation"].map((s) => `<option value="${s}" ${s === sample ? "selected" : ""}>${escape(c[s])}</option>`).join("")}</select></label><label>${escape(c.horizon)}<select id="horizon">${result.config.horizons.map((n) => `<option value="${n}" ${n === h ? "selected" : ""}>${n}</option>`).join("")}</select></label></div>
  ${section("definition", c.methodTitle, "", `<div class="method-box"><p>${escape(c.method)}</p><p>${escape(c.anchor)}</p><p class="note">${escape(c.confirm)}</p></div>${slot("history", view.history)}<p class="note">${escape(c.chartCaption)}</p>`)}
  ${section("statistics", c.statisticsTitle, c.statisticsNote, slot("summary", view.summary) + `<h3>${escape(c.magnitudeTitle)}</h3><p class="note">${escape(c.magnitudeNote)}</p>` + slot("magnitudes", view.magnitudes))}
  ${section("thresholds", c.thresholdTitle, c.thresholdNote, slot("thresholdTable", view.thresholdTable))}
  ${section("down", c.downQuestion, c.eventNote, slot("downResults", view.down))}
  ${section("up", c.upQuestion, c.eventNote, slot("upResults", view.up) + `<h3>${escape(c.curves)}</h3><p class="note">${escape(c.curveNote)}</p>` + slot("curves", view.curves))}
  ${section("risks", c.riskTitle, c.riskNote, slot("risksTable", view.risks))}
  ${section("current", c.currentTitle, c.currentNote, slot("currentTable", view.current) + `<h3>${escape(c.recentTitle)}</h3>` + slot("recent", view.recent))}
  ${section("limits", c.limitsTitle, "", `<p>${escape(c.limit1)}</p><p>${escape(c.limit2)}</p><p>${escape(c.limit3)}</p><h3>${escape(c.sourceTitle)}</h3><p>${escape(c.sourceNote)}</p><p class="links"><a href="https://finance.yahoo.com/quote/%5EN225/history/">Yahoo ^N225</a><a href="https://indexes.nikkei.co.jp/en/nkave/index?type=download">Nikkei official</a><a href="run-manifest.json">${escape(c.downloadManifest)}</a></p><h3>${escape(c.downloads)}</h3><div class="links">${downloads.map(([href, text]) => `<a href="${href}">${escape(text)}</a>`).join("")}</div>`)}
  <footer>${escape(c.units)}<br>${escape(result.generatedAt)}</footer></main>
  <script>"use strict";const data=${embedded};const copy=${copyEmbedded};const buildView=${buildView.toString()};function update(){const p=Number(document.getElementById("period").value),h=Number(document.getElementById("horizon").value),s=document.getElementById("sample").value;const v=buildView(data,copy,p,h,s);const slots={summary:"summary",magnitudes:"magnitudes",thresholdTable:"thresholdTable",downResults:"down",upResults:"up",risksTable:"risks",currentTable:"current",recent:"recent",history:"history",curves:"curves"};for(const [id,key]of Object.entries(slots))document.getElementById(id).innerHTML=v[key];}for(const id of ["period","horizon","sample"])document.getElementById(id).addEventListener("change",update);</script></body></html>`;
}
