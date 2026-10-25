const escape = (x) => String(x ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const number = (x, digits = 2) => x === null || x === undefined || !Number.isFinite(x) ? "—" : x.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const pct = (x) => `${number(x)}%`;
const prob = (x) => x === null || x === undefined ? "—" : pct(x * 100);
const signed = (x) => `${x > 0 ? "+" : ""}${pct(x)}`;
const td = (x) => `<td>${escape(x)}</td>`;
const table = (head, rows) => `<div class="table-wrap"><table><thead><tr>${head.map((x) => `<th>${escape(x)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map(td).join("")}</tr>`).join("")}</tbody></table></div>`;
const section = (id, title, note, body) => `<section id="${id}"><h2>${escape(title)}</h2><p class="note">${escape(note)}</p>${body}</section>`;

export function fanSvg(outlook, c) {
  const width = 1000, height = 305, left = 180, right = 70;
  const finite = outlook.flatMap((r) => [r.q10, r.q90]).filter(Number.isFinite);
  const min = Math.floor(Math.min(-1, ...finite)), max = Math.ceil(Math.max(1, ...finite));
  const x = (v) => left + (v - min) / (max - min) * (width - left - right);
  let body = "";
  for (let v = min; v <= max; v += Math.max(1, Math.ceil((max - min) / 10))) {
    body += `<line x1="${x(v)}" y1="25" x2="${x(v)}" y2="255" stroke="#dce3e9"/><text x="${x(v)}" y="285" text-anchor="middle">${v}%</text>`;
  }
  body += `<line x1="${x(0)}" y1="25" x2="${x(0)}" y2="255" stroke="#687b8e" stroke-dasharray="4 4"/>`;
  outlook.forEach((r, i) => {
    if (r.q10 === null) return;
    const y = 55 + i * 57;
    body += `<text x="130" y="${y + 6}" text-anchor="end">${r.horizon} ${escape(c.horizon)}</text><line x1="${x(r.q10)}" y1="${y}" x2="${x(r.q90)}" y2="${y}" stroke="#c9dce9" stroke-width="25" stroke-linecap="round"/><line x1="${x(r.q25)}" y1="${y}" x2="${x(r.q75)}" y2="${y}" stroke="#467d9f" stroke-width="25" stroke-linecap="round"/><circle cx="${x(r.median)}" cy="${y}" r="5" fill="#102d42"/><title>${r.horizon}: ${r.q10} / ${r.median} / ${r.q90}</title>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escape(c.fanTitle)}" viewBox="0 0 ${width} ${height}"><style>text{font:16px 'Microsoft YaHei',sans-serif;fill:#435467}</style>${body}</svg>`;
}

export function historySvg(features, c) {
  const rows = features.slice(-252), width = 1000, height = 300, left = 90, top = 20, bottom = 250;
  const values = rows.flatMap((r) => [r.close, r.ma20, r.ma60]).filter(Number.isFinite);
  const min = Math.min(...values) * 0.98, max = Math.max(...values) * 1.02;
  const x = (i) => left + i / (rows.length - 1) * 875;
  const y = (v) => bottom - (v - min) / (max - min) * (bottom - top);
  let body = "";
  for (let k = 0; k <= 4; k++) {
    const value = min + k / 4 * (max - min);
    body += `<line x1="${left}" x2="965" y1="${y(value)}" y2="${y(value)}" stroke="#e6ebef"/><text x="75" y="${y(value) + 5}" text-anchor="end">${number(value, 0)}</text>`;
  }
  for (const [key, color] of [["close", "#142f43"], ["ma20", "#218472"], ["ma60", "#c2843f"]]) {
    body += `<polyline fill="none" stroke="${color}" stroke-width="${key === "close" ? 2 : 1.5}" points="${rows.map((r, i) => `${x(i)},${y(r[key])}`).join(" ")}"/>`;
  }
  for (const i of [0, Math.floor(rows.length / 2), rows.length - 1]) body += `<text x="${x(i)}" y="285" text-anchor="${i === rows.length - 1 ? "end" : "middle"}">${rows[i].date}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escape(c.close)} / MA20 / MA60" viewBox="0 0 ${width} ${height}"><style>text{font:14px sans-serif;fill:#526679}</style>${body}</svg>`;
}

export function renderReport(result, c) {
  const { current, periods, outlook, evaluation, waveSummary, runSummary, bucketSummary, sources } = result;
  const improved = evaluation.rows.filter((r) => r.brier < r.baselineBrier).length;
  const stale = sources.official?.lastDate > current.date;
  const freshness = (result.offline ? `${c.offline} ` : "") + (stale ? c.stale.replace("{date}", current.date).replace("{official}", sources.official.lastDate) : sources.official?.status === "ok" ? c.fresh : c.noCheck);
  const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "—");
  const magnitudeSummary = fill(c.magnitudeSummary, { prob: prob(periods[0].upProbability), up: signed(periods[0].meanUp), down: signed(periods[0].meanDown) });
  const primary = outlook.at(-1);
  const outlookSummary = fill(c.outlookSummary, { prob: prob(primary.upProbability), base: prob(primary.baseline.upProbability), mean: signed(primary.mean), lo: signed(primary.q10), hi: signed(primary.q90), level: c[primary.level] });
  const tiles = [[c.close, number(current.close)], [c.daily, signed(current.daily)], [c.regime, c[current.regime]], [c.vol, pct(current.dailyVol20)]];
  const distribution = table([c.period, c.n, c.prob, c.meanUp, c.meanDown, c.median, c.range80], periods.map((p) => [p.label === "all" || p.label === "recent" ? c[p.label] : p.label, p.n, prob(p.upProbability), signed(p.meanUp), signed(p.meanDown), signed(p.median), `${signed(p.q10)} ~ ${signed(p.q90)}`]));
  const expectation = table([c.horizon, c.n, c.level, c.prob, c.baseline, c.mean, c.meanUp, c.meanDown, c.range80], outlook.map((r) => [r.horizon, r.n, c[r.level], prob(r.upProbability), prob(r.baseline.upProbability), signed(r.mean), signed(r.meanUp), signed(r.meanDown), `${signed(r.q10)} ~ ${signed(r.q90)}`]));
  const path = table([c.horizon, c.upside, c.downside, c.priceBand], outlook.map((r) => [r.horizon, signed(r.meanUpside), signed(r.meanDownside), `${number(r.priceQ10)} ~ ${number(r.priceQ90)}`]));
  const last = outlook.at(-1);
  const tails = `<div class="tail-grid">${[[c.above3, last.probabilityAbove3], [c.below3, last.probabilityBelowMinus3], [c.touchUp, last.touchUp3], [c.touchDown, last.touchDown3]].map(([label, value]) => `<div><span>${escape(label)}</span><strong>${prob(value)}</strong></div>`).join("")}</div>`;
  const buckets = table([c.bucket, c.bucketCounts, c.next1, c.next5, c.next20, c.next20Prob], bucketSummary.map((r) => [r.label, `${r.n1}/${r.n5}/${r.n20}`, signed(r.mean1), signed(r.mean5), signed(r.mean20), prob(r.probability20)]));
  const waveRows = [...runSummary.map((r) => ({ ...r, label: c.run, lag: null })), ...waveSummary];
  const waveTable = table([c.threshold, c.direction, c.n, c.moveMedian, c.moveQ90, c.duration, c.lag], waveRows.map((r) => [r.label ?? `${r.thresholdPct}%`, c[r.direction === "up" ? "rising" : "falling"], r.n, signed(r.median), pct(r.absQ90), number(r.durationMedian, 1), number(r.lag, 1)]));
  const currentWave = result.currentWaves.find((w) => w?.thresholdPct === 5);
  const waveNow = currentWave ? `<h3>${escape(c.currentWave)}</h3><p>${escape(c.start)} ${currentWave.start} · ${escape(c.extreme)} ${currentWave.extremeDate} · ${escape(c.moveExtreme)} ${signed(currentWave.moveToExtreme)} · ${escape(c.retrace)} ${signed(currentWave.retracement)}</p>` : "";
  const validation = table([c.horizon, c.n, c.brier, c.baseBrier, c.accuracy, c.alwaysUp, c.mae, c.zeroMae, c.coverage], evaluation.rows.map((r) => [r.horizon, r.n, number(r.brier, 4), number(r.baselineBrier, 4), prob(r.accuracy), prob(r.alwaysUpAccuracy), number(r.mae, 3), number(r.zeroReturnMae, 3), prob(r.coverage80)]));
  const official = sources.official;
  const verification = official?.status === "ok" ? `${official.overlapDates} overlap dates; mean absolute close error ${number(official.meanAbsoluteCloseErrorPct, 7)}%; max ${number(official.maxAbsoluteCloseErrorPct, 7)}%. Accessed ${official.accessedAt}.` : escape(official?.error ?? c.noCheck);
  const downloads = [["run-manifest.json", c.manifest], ["../data/processed/daily-features.csv", c.dailyCsv], ["outlook.csv", c.outlookCsv], ["evaluation-summary.csv", c.evalCsv], ["confirmed-waves.csv", c.waveCsv]];
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>${escape(c.title)}</title><style>.chart-wrap{overflow-x:auto}.chart-wrap svg{min-width:650px}
  :root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f0f3f5;color:#183044;font-family:"Microsoft YaHei","PingFang SC",system-ui,sans-serif;line-height:1.7}main{max-width:1280px;margin:auto;padding:45px 48px 70px;background:#fff}header{padding-bottom:22px;border-bottom:2px solid #183044}.eyebrow{font-size:12px;letter-spacing:2px;color:#547185}h1{font-size:35px;margin:10px 0;line-height:1.35}h2{font-size:23px;margin:0 0 10px}h3{font-size:18px;margin:24px 0 10px}p{margin:10px 0}.intro,.note{color:#5a6d7c}.note{font-size:14px;max-width:1050px}.stamp{display:flex;gap:30px;flex-wrap:wrap;font-size:13px;color:#526778}.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:26px 0}.tile{padding:18px;background:#f2f6f8;border-top:3px solid #57819a}.tile span{display:block;font-size:12px;color:#5c6f7e}.tile strong{display:block;font-size:25px;margin-top:5px}.verdict{padding:20px 24px;background:#eaf2f2;border-left:4px solid #267b74}.verdict strong{font-size:17px}.freshness{font-size:13px;background:#fbf5e8;padding:12px 16px;margin-top:16px}section{padding-top:36px;margin-top:26px;border-top:1px solid #dfe7ed}.table-wrap{overflow-x:auto;margin:18px 0}table{border-collapse:collapse;width:100%;font-size:12px;font-variant-numeric:tabular-nums}th,td{text-align:right;padding:11px 10px;border-bottom:1px solid #e0e7ec;white-space:nowrap}th{color:#456176;background:#eff4f7;font-weight:600}th:first-child,td:first-child{text-align:left}tr:nth-child(even){background:#fafbfd}svg{width:100%;display:block;margin:18px 0}.tail-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.tail-grid div{padding:15px 18px;border:1px solid #dae4e8}.tail-grid span{font-size:12px;color:#5a6e7f;display:block}.tail-grid strong{font-size:25px}a{color:#256a91;text-decoration:none}a:hover{text-decoration:underline}.links{display:flex;flex-wrap:wrap;gap:12px 25px;font-size:13px}footer{font-size:12px;color:#607381;margin-top:35px}@media(max-width:750px){main{padding:25px 18px}h1{font-size:28px}.tiles,.tail-grid{grid-template-columns:repeat(2,1fr)}.tile strong{font-size:21px}.stamp{gap:8px 20px}section{padding-top:25px}h2{font-size:20px}}@media print{body{background:white}main{max-width:none;padding:10px}.table-wrap{overflow:visible}table{font-size:9px}th,td{padding:6px 4px}section{break-inside:avoid}}
  </style></head><body><main><header><div class="eyebrow">${escape(c.eyebrow)}</div><h1>${escape(c.title)}</h1><p class="intro">${escape(c.intro)}</p><div class="stamp"><span>${escape(c.asof)} ${current.date}</span><span>${escape(c.sample)} ${result.firstDate} → ${current.date} / ${result.barCount}</span></div></header>
  <div class="tiles">${tiles.map(([label, value]) => `<div class="tile"><span>${escape(label)}</span><strong>${escape(value)}</strong></div>`).join("")}</div>
  <div class="verdict"><strong>${escape(c.lead)}</strong><p>${escape(magnitudeSummary)}</p><p>${escape(improved ? c.someEdge : c.noEdge)}</p></div><div class="freshness">${escape(freshness)}</div>
  <div class="chart-wrap">${historySvg(result.features, c)}</div><p class="note">${escape(c.close)} / MA20 / MA60 · Yahoo Chart ^N225 · ${current.date}</p>
  ${section("distribution", c.distribution, c.distributionNote, distribution)}
  ${section("outlook", c.excursions, c.outlookNote, `<p>${escape(outlookSummary)}</p>` + expectation + `<h3>${escape(c.fanTitle)}</h3><div class="chart-wrap">${fanSvg(outlook, c)}</div><p class="note">${escape(c.fanNote)}</p>` + path + `<h3>${escape(c.tail)}</h3>${tails}<p class="note">${escape(c.tailNote)}</p>`)}
  ${section("conditions", c.conditions, c.conditionsNote, buckets)}
  ${section("waves", c.waves, c.wavesNote, waveTable + waveNow)}
  ${section("evaluation", c.oos, c.oosNote, validation + `<p class="note">${escape(c.metricNote)}</p>`)}
  ${section("triggers", c.triggers, "", `<p>${escape(c.triggerUp)}</p><p>MA20: ${number(current.ma20)} · MA60: ${number(current.ma60)} · 5d: ${signed(current.return5)} · 20d: ${signed(current.return20)}</p><p>${escape(c.triggerRisk)}</p><p>${escape(c.triggerTrade)}</p>`)}
  ${section("method", c.method, "", `<p>${escape(c.method1)}</p><p>${escape(c.method2)}</p><p>${escape(c.method3)}</p><h3>${escape(c.source)}</h3><p>${escape(c.sourceNote)}</p><p class="links"><a href="https://finance.yahoo.com/quote/%5EN225/history/">Yahoo ^N225</a><a href="https://indexes.nikkei.co.jp/en/nkave/index?type=download">Nikkei official</a><a href="https://otexts.com/fpp3/toolbox.html">Forecasting: Principles and Practice</a></p><h3>${escape(c.verify)}</h3><p class="note">${verification}</p><h3>${escape(c.download)}</h3><div class="links">${downloads.map(([href, label]) => `<a href="${href}">${escape(label)}</a>`).join("")}</div>`)}
  <footer>${escape(c.units)}<br>${escape(result.generatedAt)}</footer></main></body></html>`;
}
