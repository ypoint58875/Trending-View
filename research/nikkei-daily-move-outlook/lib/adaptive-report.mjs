export function adaptiveView(result, copy, period = 7, sample = "evaluation") {
  const f = (v, digits = 2) => v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toFixed(digits);
  const pct = (v) => `${f(v)}%`, prob = (v) => v == null ? "—" : pct(v * 100);
  const esc = (s) => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
  const table = (headers, rows) => `<div class="table-scroll"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v) => `<td>${v ?? "—"}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  const bins = result.partitions.filter((b) => b.period === period), policy = result.policies.find((p) => p.period === period);
  const range = (bin) => `${f(bin.lower)}% – ${bin.upper === null ? "∞" : pct(bin.upper)}`;
  const heading = (id, label, note = "") => `<h2 id="${id}">${label}</h2>${note ? `<p class="muted">${note}</p>` : ""}`;
  if (!policy?.evaluation) return `<p>${copy.none}</p>`;
  const metrics = (a, b) => table(["", copy.strategy, copy.hold], [
    [copy.cagr, pct(a.cagrPct), pct(b.cagrPct)], [copy.return, pct(a.totalReturnPct), pct(b.totalReturnPct)],
    [copy.drawdown, pct(a.maxDrawdownPct), pct(b.maxDrawdownPct)],
    [copy.trades, a.closedTrades, "—"], [copy.exposure, prob(a.exposure), prob(b.exposure)]
  ]);
  let html = `<section><h2>${copy.summary} · SMA(${period})</h2><p class="verdict">${policy.robust ? copy.passed : copy.failed}</p>
    <div class="cards"><div>${copy.cagr}${copy.excess}<strong>${f(policy.evaluation.cagrPct - policy.buyHold.cagrPct)}</strong></div>
    <div>${copy.positiveYears}<strong>${policy.annual.filter((a) => a.excessPct > 0).length} / ${policy.annual.length}</strong></div>
    <div>${copy.trades}<strong>${policy.evaluation.closedTrades}</strong></div></div>
    <p>${policy.outperform ? copy.outperform : copy.negative}${policy.evidence ? "" : ` · ${copy.sparse}`}</p>
    <h3>${copy.evaluationCompare}</h3>${metrics(policy.evaluation, policy.buyHold)}
    <details><summary>${copy.validationCompare}</summary>${metrics(policy.validation, policy.validationBuyHold)}</details></section>`;
  html += `<section>${heading("census", copy.census, copy.censusNote)}${table([copy.direction, copy.n, copy.median, copy.agree, copy.duration],
    result.census.filter((r) => r.period === period && r.direction !== "flat").map((r) => [r.direction === "up" ? copy.upLabel : copy.downLabel,
      r.n, pct(r.median), prob(r.agreementProbability), f(r.durationMedian, 1)]))}</section>`;
  html += `<section>${heading("filtering", copy.filtering, copy.filteringNote)}${table([
    copy.excludeCount, copy.buyFloor, copy.sellFloor, copy.valCagr, copy.testCagr, copy.drawdown, copy.trades, ""],
    (policy.filteringComparisons ?? []).map((r) => [r.excludedGroups, pct(r.minimumReferenceByDirection.up), pct(r.minimumReferenceByDirection.down),
      pct(r.validation?.cagrPct), pct(r.evaluation?.cagrPct), pct(r.evaluation?.maxDrawdownPct), r.evaluation?.closedTrades ?? "—", r.selected ? copy.chosen : ""]))}
    ${(policy.filteringComparisons ?? []).filter((r) => r.excludedGroups > 0 && r.thresholds).map((r) => `<details><summary>${copy.excludeCount} ${r.excludedGroups} · ${copy.thresholds}</summary>${table([
      copy.operation, copy.range, copy.threshold, copy.coverage, copy.accuracy], r.thresholds.map((t) => {
      const bin = bins.find((b) => b.id === t.bucket), s = result.statistics.find((x) => x.bucket === t.bucket && x.quantileRank === t.quantileRank && x.sample === sample);
      return [copy[t.direction], range(bin), prob(t.ratio), `${s.n} / ${s.matureOpportunities}`, prob(s.continuedProbability)];
    }))}</details>`).join("")}
    <p class="muted">${copy.mergeNote}</p></section>`;
  html += `<section>${heading("groups", copy.groups, copy.groupsNote)}${table([copy.operation, copy.range, copy.partitionN, copy.n, copy.groupNext, copy.groupRatio],
    bins.map((b) => { const s = result.groupStatistics.find((r) => r.id === b.id && r.sample === sample);
      return [copy[b.direction], range(b), b.trainingN, s.n, prob(s.nextAlignedProbability), prob(s.finalRatioMedian)]; }))}</section>`;
  html += `<section>${heading("thresholds", copy.thresholds, copy.thresholdNote)}<p class="formula">${copy.formula}</p>${table([
    copy.operation, copy.range, copy.threshold, copy.rank, copy.fitN, copy.coverage, copy.accuracy, copy.baseAccuracy, copy.remaining, copy.remainingSessions, copy.late],
    bins.map((b) => { const c = policy.thresholds.find((t) => t.bucket === b.id);
      if (!c) return [copy[b.direction], range(b), copy.excluded, "—", "—", "—", "—", "—", "—", "—", "—"];
      const s = result.statistics.find((r) => r.bucket === b.id && r.quantileRank === c.quantileRank && r.sample === sample);
      return [copy[b.direction], range(b), `<b>${prob(c.ratio)}</b>${c.fallbackToPooled ? `<br><small>${copy.pool}</small>` : ""}`,
        f(c.quantileRank, 2), c.trainingPairs, `${s.n} / ${s.matureOpportunities} (${prob(s.coverage)})`, `${prob(s.continuedProbability)}${s.n < 10 ? `<br><small>${copy.lowN}</small>` : ""}`,
        prob(s.noThresholdContinuation), pct(s.meanRemainingPct), f(s.medianRemainingSessions, 1), s.endedOnTriggerN]; }))}
    <p class="muted">${copy.predictionNote}</p><p class="muted">${copy.ratioWarning}</p></section>`;
  const accuracy = policy.accuracyPolicy;
  if (accuracy) {
    html += `<section>${heading("accuracy", copy.accuracyPolicy, copy.accuracyPolicyNote)}${metrics(accuracy.evaluation, policy.buyHold)}${table([
      copy.operation, copy.range, copy.returnThreshold, copy.accuracyThreshold, copy.validationEvidence, copy.evaluationEvidence], bins.map((b) => {
      const t = accuracy.thresholds.find((c) => c.bucket === b.id), g = accuracy.groups.find((r) => r.bucket === b.id);
      if (!t) return [copy[b.direction], range(b), copy.excluded, copy.excluded, "—", "—"];
      const s = result.statistics.find((r) => r.bucket === b.id && r.quantileRank === t.quantileRank && r.sample === "evaluation");
      return [copy[b.direction], range(b), prob(policy.thresholds.find((c) => c.bucket === b.id).ratio), prob(t.ratio),
        g.supported ? `${g.validationN} / ${prob(g.validationProbability)}` : copy.fallback,
        `${s.n} / ${prob(s.continuedProbability)}${s.n < 10 ? `<br><small>${copy.lowN}</small>` : ""}`];
    }))}</section>`;
  }
  const chart = result.chart.find((r) => r.period === period)?.rows ?? [];
  if (chart.length) {
    const max = Math.max(1, ...chart.flatMap((r) => [r.value, r.buyHold]));
    const points = (key) => chart.map((r, i) => `${(i / (chart.length - 1) * 920 + 55).toFixed(1)},${(285 - r[key] / max * 255).toFixed(1)}`).join(" ");
    html += `<section>${heading("equity", copy.equity)}<div class="legend"><span class="active">${copy.strategy}</span><span class="passive">${copy.hold}</span></div>
    <svg role="img" aria-label="${esc(copy.equity)}" viewBox="0 0 1000 330"><line x1="55" x2="975" y1="285" y2="285" stroke="#bcc9dc"/>
      <text x="5" y="35">${f(max, 1)}</text><text x="18" y="289">0</text>
      <polyline fill="none" stroke="#27867f" stroke-width="2.5" points="${points("buyHold")}"/>
      <polyline fill="none" stroke="#245ccd" stroke-width="2.5" points="${points("value")}"/>
      <text x="55" y="315">${chart[0].date}</text><text x="880" y="315">${chart.at(-1).date}</text></svg></section>`;
  }
  html += `<section>${heading("costs", copy.costs)}${table([copy.cost, copy.strategy + copy.cagr, copy.hold + copy.cagr, copy.excess],
    policy.sensitivity.map((s) => [s.costBps, pct(s.strategyCagr), pct(s.buyHoldCagr), f(s.excessCagr)]))}</section>`;
  html += `<section>${heading("years", copy.years, copy.yearNote)}${table([copy.year, copy.strategy, copy.hold, copy.excess],
    policy.annual.map((r) => [r.year, pct(r.strategyPct), pct(r.buyHoldPct), f(r.excessPct)]))}</section>`;
  html += `<section>${heading("cohorts", copy.cohorts, copy.cohortNote)}${table([copy.operation, copy.range, copy.trades, copy.win, copy.meanTrade],
    bins.map((b) => { const c = result.cohorts.find((r) => r.bucket === b.id); return [copy[b.direction], range(b), c?.n ?? 0,
      prob(c?.winProbability), pct(c?.meanNetTradePct)]; }))}</section>`;
  const current = result.current.find((r) => r.period === period);
  html += `<section>${heading("current", copy.current, copy.currentNote)}${current?.available ? table([copy.operation, copy.previous, copy.observed, copy.threshold, copy.price],
    [[copy[current.direction], pct(current.previousMovePct), prob(current.observedRatio), prob(current.threshold), f(current.triggerPrice)]]) : copy.none}</section>`;
  return html;
}

export function renderAdaptiveReport(result, copy) {
  const safe = (value) => JSON.stringify(value).replaceAll("<", "\\u003c");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,">
  <title>${copy.title}</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f2f5fa;color:#1d2d45;font:15px/1.7 system-ui,"Microsoft YaHei",sans-serif}main{max-width:1400px;margin:auto;padding:28px}
  header{padding:16px 2px}h1{font-size:30px;line-height:1.3;margin:0 0 12px}h2{font-size:21px;margin:0 0 12px;scroll-margin-top:100px}h3{font-size:16px}
  section,.controls,aside{background:white;border:1px solid #dce4f0;border-radius:12px;padding:24px;margin:18px 0}aside{background:#fff7e7;border-color:#e9d2a6}
  .controls{position:sticky;top:0;z-index:2;display:flex;gap:20px;flex-wrap:wrap;padding:12px 20px;box-shadow:0 3px 15px #132b4810}select{font:inherit;padding:5px 10px;border:1px solid #bbcadd;border-radius:6px;margin-left:8px}
  .table-scroll{max-width:100%;overflow:auto}table{width:100%;border-collapse:collapse;white-space:nowrap}th,td{text-align:right;padding:10px 12px;border-bottom:1px solid #e5ebf4}th{font-size:13px;color:#546883;background:#f5f8fc}td:first-child,th:first-child{text-align:left}small{font-size:11px;white-space:normal;display:inline-block;max-width:150px}.muted{color:#65748b;font-size:13px}.verdict{font-size:19px;font-weight:650;color:#8d4a12}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.cards>div{background:#f3f6fc;border-radius:8px;padding:14px;color:#52647c}.cards strong{display:block;font-size:25px;color:#183d7a}svg{width:100%;height:auto}svg text{font-size:13px;fill:#65748b}.legend{display:flex;gap:30px}.active{color:#245ccd}.passive{color:#27867f}.formula{background:#edf3fd;padding:12px;border-radius:7px}a{color:#245ccd}nav{display:flex;gap:18px;flex-wrap:wrap}details{margin-top:15px}footer{font-size:12px;overflow-wrap:anywhere}
  @media(max-width:650px){main{padding:12px}h1{font-size:24px}section,aside{padding:16px}.controls{gap:8px;padding:10px;position:static}select{max-width:210px}.cards{grid-template-columns:1fr}.cards strong{font-size:23px}table{font-size:13px}th,td{padding:8px}}
  </style></head><body><main><header><h1>${copy.title}</h1><p>${copy.subtitle}</p><p class="muted">${copy.asOf} ${result.lastDate} · ${result.firstDate} – ${result.lastDate}</p>
  <nav><a href="#groups">${copy.groups}</a><a href="#thresholds">${copy.thresholds}</a><a href="#equity">${copy.equity}</a><a href="#years">${copy.years}</a></nav></header>
  <aside>${copy.historyWarning}</aside><div class="controls"><label>${copy.period}<select id="period"><option value="7">SMA(7)</option><option value="20">SMA(20)</option></select></label>
  <label>${copy.sample}<select id="sample"><option value="evaluation">${copy.evaluation}</option><option value="validation">${copy.validation}</option><option value="training">${copy.training}</option></select></label></div>
  <div id="view">${adaptiveView(result, copy)}</div><section><h2>${copy.method}</h2><p>${copy.methodText}</p>
  <p>${copy.source}：<a href="https://indexes.nikkei.co.jp/en/nkave/index/profile?idx=nk225">Nikkei</a> · <a href="https://otexts.com/fpp3/toolbox.html">Forecasting: Principles and Practice</a></p>
  <h3>${copy.files}</h3><ul><li><a href="adaptive-results.json">${copy.data}</a></li><li><a href="adaptive-validation-search.json">${copy.search}</a></li>
  <li><a href="adaptive-prediction-evidence.csv">${copy.evidence}</a></li><li><a href="adaptive-trades.csv">${copy.tradeFile}</a></li></ul></section>
  <footer>SHA-256 ${result.sourceDataHash}<br>node research/nikkei-daily-move-outlook/analyze-adaptive-thresholds.mjs</footer></main>
  <script>const result=${safe(result)},copy=${safe(copy)};const render=${adaptiveView.toString()};function update(){document.getElementById('view').innerHTML=render(result,copy,Number(document.getElementById('period').value),document.getElementById('sample').value)}document.getElementById('period').addEventListener('change',update);document.getElementById('sample').addEventListener('change',update);window.addEventListener('pageshow',update);update();</script></body></html>`;
}
