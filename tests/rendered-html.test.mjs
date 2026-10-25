import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the QuantScope research workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  for (const name of ["research-ema7-supplemental-entry", "research-sma11-exit-guard", "research-wma14-entry-slope-gate"]) {
    const input = html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0];
    assert.ok(input, `${name} must render`);
    assert.match(input, /checked/);
  }
  assert.match(html, /EMA7/);
  assert.match(html, /SMA11/);
  assert.match(html, /0\.125%/);
  assert.match(html, /WMA14/);
  assert.doesNotMatch(html, /class="[^"]*screening-full-traversal/);
  assert.doesNotMatch(html, /每策略前 3 组参数|screening-quick-toggle/);
  assert.match(html, /<html lang="zh-CN">/i);
  assert.match(html, /<title>QuantScope \| Market Strategy Lab<\/title>/i);
  assert.match(html, /QuantScope/);
  assert.match(html, /\u91cf\u5316\u7b56\u7565\u7814\u7a76\u53f0/);
  assert.match(html, /\u4e00\u952e\u7b56\u7565\u7b5b\u9009/);
  assert.match(html, /\u7b56\u7565\u5b9e\u9a8c\u5ba4/);
  assert.match(html, /\u6307\u6807\u8bbe\u7f6e/);
  assert.match(html, /\u6062\u590d\u9ed8\u8ba4/);
  assert.match(html, /\u65e5\u7ebf\u72ec\u7acb\u7b56\u7565\u677f\u5757/);
  assert.doesNotMatch(html, />\s*(?:1|5|15|30|60) \u5206\s*</);
  assert.doesNotMatch(html, /chart-interval-tabs/);

  const indicatorGroup = html.match(
    /<div\b[^>]*class="[^"]*\bindicator-favorites\b[^"]*"[^>]*>/,
  )?.[0];
  assert.ok(indicatorGroup, "indicator group should render");
  assert.match(indicatorGroup, /role="group"/);
  assert.match(indicatorGroup, /aria-label="\u5feb\u6377\u6307\u6807"/);
  assert.doesNotMatch(indicatorGroup, /role="toolbar"/);
  assert.doesNotMatch(indicatorGroup, /role="tablist"/);
  assert.ok(
    html.indexOf('class="chart-toolbar-menu-row"') <
      html.indexOf('class="indicator-controls indicator-favorites"'),
    "favorite indicators should render on their own row below the menus",
  );

  const categoryTriggers = html.match(
    /<button\b[^>]*class="indicator-category-trigger"[^>]*>/g,
  );
  assert.equal(categoryTriggers?.length, 6);
  for (const trigger of categoryTriggers ?? []) {
    assert.match(trigger, /aria-expanded="false"/);
  }

  const smaButton = html.match(/<button\b[^>]*>SMA<\/button>/)?.[0];
  assert.ok(smaButton, "default SMA indicator button should render");
  assert.doesNotMatch(smaButton, /role="tab"/);
  assert.match(smaButton, /class="focused"/);
  assert.doesNotMatch(smaButton, /class="[^"]*visible/);
  assert.match(smaButton, /aria-pressed="false"/);
  assert.match(smaButton, /aria-current="true"/);
  assert.match(
    smaButton,
    /aria-label="\u7b80\u5355\u79fb\u52a8\u5e73\u5747\u7ebf \u00b7 \u672a\u663e\u793a"/,
  );

  const visibilityButton = html.match(
    /<button\b[^>]*class="indicator-visibility-button "[^>]*>[\s\S]*?<\/button>/,
  )?.[0];
  assert.ok(visibilityButton, "focused indicator visibility button should render");
  assert.match(visibilityButton, /aria-pressed="false"/);
  assert.match(
    visibilityButton,
    /aria-label="\u663e\u793a\u6307\u6807 \u7b80\u5355\u79fb\u52a8\u5e73\u5747\u7ebf"/,
  );
  assert.ok(
    visibilityButton.endsWith("\u663e\u793a\u6307\u6807</button>"),
    "visibility button should expose its localized action as text",
  );

  const settingsRegion = html.match(
    /<section\b[^>]*id="indicator-settings-panel"[^>]*>/,
  )?.[0];
  assert.ok(settingsRegion, "indicator settings region should render");
  assert.doesNotMatch(settingsRegion, /\srole="/);
  assert.match(settingsRegion, /aria-label="\u6307\u6807\u8bbe\u7f6e"/);

  const chartHeadingStart = html.indexOf(
    '<div class="panel-heading chart-heading">',
  );
  const chartHeadingEnd = html.indexOf(
    '<div class="chart-heading-side">',
    chartHeadingStart,
  );
  assert.ok(
    chartHeadingStart >= 0 && chartHeadingEnd > chartHeadingStart,
    "chart heading should render before chart metadata",
  );
  const chartHeading = html.slice(chartHeadingStart, chartHeadingEnd);
  assert.match(
    chartHeading,
    /\u7b56\u7565\u53e0\u52a0[\s\S]*?\u5c1a\u672a\u9009\u62e9\u7b56\u7565/,
  );

  const supportResistanceFavorite = html.match(
    /<button\b[^>]*id="indicator-tab-favorite-supportResistanceBreaks"[^>]*>[\s\S]*?S\/R Break<\/button>/,
  )?.[0];
  assert.ok(
    supportResistanceFavorite,
    "confirmed support/resistance should render in the default favorites strip",
  );
  assert.match(supportResistanceFavorite, /aria-pressed="false"/);
  const supportResistanceFavoriteStar = html.match(
    /<button\b[^>]*id="indicator-favorite-structure-supportResistanceBreaks"[^>]*>/,
  )?.[0];
  assert.ok(
    supportResistanceFavoriteStar,
    "each categorized indicator should render an independent favorite star",
  );
  assert.match(supportResistanceFavoriteStar, /class="indicator-item-favorite favorite"/);
  assert.match(supportResistanceFavoriteStar, /aria-pressed="true"/);

  const smaFavoriteStar = html.match(
    /<button\b[^>]*id="indicator-favorite-movingAverage-sma"[^>]*>/,
  )?.[0];
  assert.ok(smaFavoriteStar, "unfavorited indicators should render a hollow star action");
  assert.match(smaFavoriteStar, /class="indicator-item-favorite "/);
  assert.match(smaFavoriteStar, /aria-pressed="false"/);
  assert.doesNotMatch(chartHeading, /\u7b56\u7565\u53c2\u8003\u7ebf/);

  const chartMeta = html.match(/<div\b[^>]*class="chart-meta"[^>]*>/)?.[0];
  assert.ok(chartMeta, "chart metadata should render");
  assert.match(
    chartMeta,
    /title="\u4ef7\u683c\u53e3\u5f84: \u5206\u7ea2\/\u62c6\u5206\u8c03\u6574\u4ef7 \/ \u539f\u59cb\u672a\u590d\u6743\u4ef7"/,
  );
  assert.match(
    chartMeta,
    /data-supported-price-adjustments="corporate-action-adjusted=\u5206\u7ea2\/\u62c6\u5206\u8c03\u6574\u4ef7\|raw=\u539f\u59cb\u672a\u590d\u6743\u4ef7"/,
  );
  assert.doesNotMatch(html, /\u516c\u53f8\u884c\u4e3a\u8c03\u6574\u4ef7/);

  assert.match(html, /\u53c2\u6570\u7a33\u5b9a\u6027/);
  assert.doesNotMatch(
    html,
    /\u4e0d\u8fdb\u884c\u53c2\u6570\u4f18\u5316/,
  );
  assert.match(html, /name="indicator-fast"/);
  assert.match(html, /name="indicator-slow"/);
  assert.doesNotMatch(html, /\u6700\u65b0\u7b56\u7565\u5efa\u8bae/);
  assert.match(html, /\u7eff\u8272\uff1a\u4e0a\u6da8/);
  assert.match(html, /\u7ea2\u8272\uff1a\u4e0b\u8dcc/);
  assert.doesNotMatch(html, /\u6bcf 60 \u79d2\u81ea\u52a8\u5237\u65b0/);
  assert.match(html, /\u56de\u6d4b\u5feb\u6377\u680f/);
  assert.match(html, />\u4fdd\u5b58\u5f53\u524d\u7b56\u7565</);
  assert.match(html, /\u65e5\u7ecf 225/);
  assert.doesNotMatch(
    html,
    /\u5148\u5b8c\u6574\u904d\u5386\u5168\u90e8 34 \u7c7b\u5355\u7b56\u7565\u53c2\u6570/,
  );
  assert.doesNotMatch(html, /50\/50、60\/40、40\/60、70\/30、30\/70/);
  assert.doesNotMatch(html, /\u5168\u90e8\u6709\u9650\u53c2\u6570\u7ec4\u5408/);
  assert.doesNotMatch(html, /name="strategy-max-parameter-sets"/);
  assert.match(
    html,
    />\u5468\u671f\u7b5b\u9009<\/option>/,
  );
  assert.match(
    html,
    /name="strategy-sample-period-sessions"[^>]*value="128"/,
  );
  assert.doesNotMatch(html, /strategy-sample-period-\d/);
  assert.doesNotMatch(html, /strategy-sample-period-weight/);
  assert.match(html, /\u4f18\u5316\u89c4\u6a21/);
  assert.match(html, /\u9a8c\u8bc1\u65b9\u5f0f/);
  assert.match(html, /\u4f18\u5316\u76ee\u6807/);
  assert.doesNotMatch(
    html,
    /\u6536\u76ca\u56de\u64a4\u6bd4\u6700\u5927/,
  );
  assert.match(html, /\u6700\u5927\u6536\u76ca/);
  assert.doesNotMatch(html, /\u6700\u5c0f\u56de\u64a4/);
  assert.match(html, /\u6700\u5927\u590f\u666e/);
  assert.doesNotMatch(
    html,
    /\u72b6\u6001\u4e0d\u5f71\u54cd\u6392\u540d/,
  );
  assert.match(html, /name="strategy-a"/);
  assert.match(html, /name="strategy-b"/);
  assert.match(html, /\u7b56\u7565 A/);
  assert.match(html, /\u7b56\u7565 B/);
  assert.match(html, />\u4e0d\u4f7f\u7528\u7b56\u7565 A</);
  assert.match(html, />\u4e0d\u4f7f\u7528\u7b56\u7565 B</);
  assert.match(html, /\u4e00\u952e\u7b56\u7565\u7b5b\u9009/);
  assert.match(html, /\u5355\u7b56\u7565\u7ed3\u679c/);
  assert.match(html, /\u53cc\u7b56\u7565\u7ed3\u679c/);
  assert.match(html, /\u4e09\u7b56\u7565\u7ed3\u679c/);
  assert.match(html, /\u7b56\u7565 A \u4ed3\u4f4d/);
  assert.match(html, /\u7b56\u7565 B \u4ed3\u4f4d/);
  assert.match(
    html,
    /aria-label="\u5e94\u7528\u5f53\u524d\u7b56\u7565\u5230\u8d70\u52bf\u56fe"/,
  );
  assert.match(html, /name="strategy-a-allocation"/);
  assert.match(html, /name="strategy-b-allocation"/);
  assert.match(
    html,
    /name="strategy-a-allocation"[\s\S]*?<option value="0" selected="">0%<\/option>/,
  );
  assert.match(
    html,
    /name="strategy-b-allocation"[\s\S]*?<option value="0" selected="">0%<\/option>/,
  );
  assert.match(html, /name="strategy-screening-objective"/);
  assert.match(
    html,
    /name="strategy-screening-objective"[\s\S]*?<option value="totalReturn" selected="">/,
  );
  assert.doesNotMatch(html, /name="strategy-max-parameter-sets"/);
  assert.doesNotMatch(html, /name="single-screening-objective"/);
  assert.doesNotMatch(html, /name="combination-screening-objective"/);
  assert.doesNotMatch(html, /combination-allocation-ladder/);
  assert.doesNotMatch(html, /\u673a\u52a8\u4ed3/);
  assert.match(html, />\u5e94\u7528</);
  assert.match(html, /\u9ec4\u91d1/);
  assert.match(html, /\u767d\u94f6/);
  assert.match(html, /\u5927\u5b97\u5546\u54c1/);
  assert.ok(
    html.indexOf("\u5355\u7b56\u7565\u7ed3\u679c") <
      html.indexOf("\u53cc\u7b56\u7565\u7ed3\u679c") &&
      html.indexOf("\u53cc\u7b56\u7565\u7ed3\u679c") <
        html.indexOf("\u4e09\u7b56\u7565\u7ed3\u679c"),
  );
  assert.ok(
    html.indexOf("\u56de\u6d4b\u5feb\u6377\u680f") <
      html.indexOf("\u7b56\u7565\u5b9e\u9a8c\u5ba4"),
  );
  assert.match(html, /Channel BreakOut/);
  assert.match(html, /Technical Ratings/);
  assert.doesNotMatch(html, /\u4ec5\u505a\u591a\uff1a/);
  assert.doesNotMatch(
    html,
    /\u505a\u7a7a|\u591a\u7a7a|\-1 \u7a7a/,
  );
  assert.match(html, /Stoch RSI/);
  assert.match(html, /Supertrend/);
  assert.doesNotMatch(
    html,
    /\u641c\u7d22\u80a1\u7968|\u4e2a\u80a1|688484/,
  );
  assert.doesNotMatch(html, /\u5185\u7f6e \u00b7/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("server-renders the strategy cycle validation route", async () => {
  const workspace = await readFile(
    new URL(
      "../app/strategy-validation/StrategyValidationWorkspace.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const committedNumberInput = await readFile(
    new URL("../app/components/CommittedNumberInput.tsx", import.meta.url),
    "utf8",
  );
  const locale = await readFile(
    new URL("../app/i18n/zh-CN.ts", import.meta.url),
    "utf8",
  );
  const response = await render("/strategy-validation");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  // The cycle form appears after browser storage/shortcut hydration, not in its loading HTML.
  assert.match(workspace, /c\.initialCash[\s\S]*SmaPositionOverlayControls/);
  assert.doesNotMatch(workspace, /quickScreening|screening-parameter/);
  assert.match(html, /\u7b56\u7565\u5468\u671f\u9a8c\u8bc1/);
  assert.match(html, /\u65e5\u7ecf\u5b8c\u6574\u65e5\u7ebf\u7b5b\u9009\u4e0e\u5f53\u65e5\u6536\u76d8\u4ef7\u6a21\u62df\u6210\u4ea4/);
  assert.match(html, /\u6bcf\u6b21\u66f4\u65b0\u4e0e\u6536\u76ca\u57fa\u51c6/);
  assert.match(html, /\u8fd4\u56de\u7814\u7a76\u53f0/);
  assert.match(
    workspace,
    /useState<ScreeningObjective>\("totalReturn"\)/,
  );
  assert.match(workspace, /loadStrategyValidationMarketSeries/);
  assert.match(
    workspace,
    /readCanonicalMarketSeriesEntry\([\s\S]*?cached\?\.series\.bars\.length && !refreshLatest[\s\S]*?completedNikkeiCycleSeries\(cached\.series\)[\s\S]*?fetch\(marketRequestUrl/,
  );
  assert.match(workspace, /writeCanonicalMarketSeries\(series, profile\)/);
  assert.match(workspace, /isNikkeiCycleInstrument\(group\.instrument\)/);
  assert.match(workspace, /rollingSchedule: NIKKEI_CYCLE_MODEL/);
  assert.match(workspace, /conflictPolicy: NIKKEI_CYCLE_CONFLICT_POLICY/);
  assert.doesNotMatch(workspace, /\[c\.rollingOldOnConflict,\s*rollingReport\.oldOnConflictReturn\]/);
  assert.match(workspace, /rebalances=\{rollingReport\.rebalances\}/);
  assert.match(workspace, /signature\.includes\(`"conflictPolicy"/);
  assert.match(workspace, /\[c\.rollingLatest,\s*rollingReport\.updateReturn\]/);
  assert.match(workspace, /selectedGroup\.instrument,\s*controller\.signal,\s*true/);
  assert.match(workspace, /storedTask\.status !== "completed"/);
  assert.doesNotMatch(workspace, /cycleScreeningInterval/);
  assert.match(workspace, /buildStrategyCycleRollingReport/);
  assert.match(workspace, /StrategyCycleRollingChart/);
  assert.match(workspace, /rebalances=\{rollingReport\.rebalances\}/);
  assert.match(workspace, /rollingReports\.map[\s\S]{0,350}setSelectedReportWindow/);
  assert.doesNotMatch(workspace, /selectedRollingMode|rollingReport\.previousReturn|rollingReport\.higherReturn|rollingReport\.lowerReturn/);
  assert.match(
    workspace,
    /calculateReports\([\s\S]*?storedTask\.snapshots[\s\S]*?storedTask\.evaluationSessions/,
  );
  assert.match(workspace, /setAvailableBarCount\(series\.bars\.length\)/);
  assert.match(
    workspace,
    /cycleScreeningPeriodStart[\s\S]{0,500}<CommittedNumberInput[\s\S]{0,500}setScreeningWindow/,
  );
  assert.match(workspace, /cycleScreeningPeriodEnd[\s\S]{0,350}setScreeningWindowMaximum/);
  assert.match(workspace, /cycleScreeningPeriodStep[\s\S]{0,300}onCommit=\{setScreeningWindowStep\}/);
  assert.match(workspace, /maxCombinationStrategies[\s\S]{0,300}max=\{6\}/);
  assert.match(
    workspace,
    /evaluationSessions[\s\S]{0,300}<CommittedNumberInput[\s\S]{0,300}onCommit=\{setEvaluationSessions\}/,
  );
  assert.match(committedNumberInput, /event\.currentTarget\.select\(\)/);
  assert.match(committedNumberInput, /onChange=\{\(event\) => setDraft\(event\.target\.value\)\}/);
  assert.match(committedNumberInput, /onBlur=\{commit\}/);
  assert.match(committedNumberInput, /event\.key === "Enter"/);
  assert.match(workspace, /max=\{evaluationSessionMaximum\}/);
  assert.doesNotMatch(
    workspace,
    /max=\{512\}[\s\S]{0,200}value=\{evaluationSessions\}/,
  );
  assert.doesNotMatch(workspace, /beforeunload|pagehide|stopOnPageExit/);
  assert.match(
    workspace,
    /holdScreeningBatchLeaseInLocalEngine\([\s\S]*?queuedJobIdsRef\.current[\s\S]*?controller\.signal/,
  );
  assert.match(
    workspace,
    /storedTask\?\.status !== "running"[\s\S]*?autoResumeSignatureRef\.current = storedTask\.signature;[\s\S]*?void start\(\)/,
  );
  assert.match(
    locale,
    /cycleValidation:[\s\S]*?objective: "优化目标"[\s\S]*?balanced: "综合评分"[\s\S]*?totalReturn: "最大收益"[\s\S]*?sharpe: "最大夏普"/,
  );
});

test("rejects removed intraday market intervals", async () => {
  const response = await render("/api/market?interval=1m");
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "UNSUPPORTED_INTERVAL" });
});

test("keeps daily refresh, evidence, and legacy shortcut provenance explicit in source", async () => {
  const workspace = await readFile(
    new URL("../app/MarketWorkspace.tsx", import.meta.url),
    "utf8",
  );
  const locale = await readFile(
    new URL("../app/i18n/zh-CN.ts", import.meta.url),
    "utf8",
  );
  const styles = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  const priceChart = await readFile(
    new URL("../app/components/PriceChart.tsx", import.meta.url),
    "utf8",
  );
  const echart = await readFile(
    new URL("../app/components/EChart.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    workspace,
    /const EMPTY_PRICE_CHART_TRADES: BacktestTrade\[\] = \[\];/,
  );
  assert.match(workspace, /: EMPTY_PRICE_CHART_TRADES\s*\}/);
  assert.doesNotMatch(
    workspace,
    /<PriceChart[\s\S]*?trades=\{[\s\S]*?: \[\][\s\S]*?\}/,
  );
  const backtestChart = await readFile(
    new URL("../app/components/BacktestChart.tsx", import.meta.url),
    "utf8",
  );
  const marketRoute = await readFile(
    new URL("../app/api/market/route.ts", import.meta.url),
    "utf8",
  );
  const marketIndex = await readFile(
    new URL("../lib/market/index.ts", import.meta.url),
    "utf8",
  );
  const marketSeries = await readFile(
    new URL("../lib/market/series.ts", import.meta.url),
    "utf8",
  );
  const shortcutRefresh = await readFile(
    new URL("../lib/market/shortcut-refresh.ts", import.meta.url),
    "utf8",
  );
  const marketFingerprint = await readFile(
    new URL("../lib/market/fingerprint.ts", import.meta.url),
    "utf8",
  );
  const screening = await readFile(
    new URL("../lib/analysis/screening.ts", import.meta.url),
    "utf8",
  );
  const combinations = await readFile(
    new URL("../lib/analysis/strategy-combinations.ts", import.meta.url),
    "utf8",
  );
  const screeningValidation = await readFile(
    new URL(
      "../lib/analysis/screening-validation.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const screeningWorkerClient = await readFile(
    new URL(
      "../lib/analysis/screening-worker-client.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const screeningWorker = await readFile(
    new URL("../lib/analysis/screening.worker.ts", import.meta.url),
    "utf8",
  );
  const screeningRuns = await readFile(
    new URL("../lib/analysis/screening-runs.ts", import.meta.url),
    "utf8",
  );
  const screeningResultCache = await readFile(
    new URL("../lib/analysis/screening-result-cache.ts", import.meta.url),
    "utf8",
  );
  const screeningRunsRoute = await readFile(
    new URL("../app/api/screening-runs/route.ts", import.meta.url),
    "utf8",
  );
  const shortlist = await readFile(
    new URL("../lib/analysis/strategy-shortlist.ts", import.meta.url),
    "utf8",
  );
  const consensus = await readFile(
    new URL("../lib/analysis/strategy-consensus.ts", import.meta.url),
    "utf8",
  );
  const strategies = await readFile(
    new URL("../lib/analysis/strategies.ts", import.meta.url),
    "utf8",
  );
  const builtInStrategies = await readFile(
    new URL("../lib/analysis/built-in-strategies.ts", import.meta.url),
    "utf8",
  );
  const strategyExecution = await readFile(
    new URL("../lib/analysis/strategy-execution.ts", import.meta.url),
    "utf8",
  );
  const entryFilter = await readFile(
    new URL("../lib/analysis/entry-filter.ts", import.meta.url),
    "utf8",
  );
  const savedBacktestRoute = await readFile(
    new URL("../app/api/saved-backtests/route.ts", import.meta.url),
    "utf8",
  );
  const savedBacktestFolderRoute = await readFile(
    new URL("../app/api/saved-backtest-folders/route.ts", import.meta.url),
    "utf8",
  );
  const schema = await readFile(
    new URL("../db/schema.ts", import.meta.url),
    "utf8",
  );
  const viteConfig = await readFile(
    new URL("../vite.config.ts", import.meta.url),
    "utf8",
  );
  const indicatorRegistry = await readFile(
    new URL("../lib/analysis/indicator-registry.ts", import.meta.url),
    "utf8",
  );
  const clientCache = await readFile(
    new URL("../lib/market/client-cache.ts", import.meta.url),
    "utf8",
  );
  const canonicalMarket = await readFile(
    new URL("../lib/market/canonical.ts", import.meta.url),
    "utf8",
  );
  const canonicalCache = await readFile(
    new URL("../lib/market/canonical-cache.ts", import.meta.url),
    "utf8",
  );
  const marketQuality = await readFile(
    new URL("../lib/market/quality.ts", import.meta.url),
    "utf8",
  );
  const marketExchanges = await readFile(
    new URL("../lib/market/exchanges.ts", import.meta.url),
    "utf8",
  );
  const referenceRoute = await readFile(
    new URL("../app/api/market/reference/route.ts", import.meta.url),
    "utf8",
  );
  const marketSession = await readFile(
    new URL("../lib/market/session.ts", import.meta.url),
    "utf8",
  );
  const providerErrors = await readFile(
    new URL("../lib/market/provider-errors.ts", import.meta.url),
    "utf8",
  );

  assert.match(workspace, /resolveCanonicalMarketProfile/);
  assert.match(workspace, /resolveMarketAutoRefreshPolicy/);
  assert.match(workspace, /automaticRefreshBackoffRef/);
  assert.match(workspace, /SHORTCUT_REFRESH_COOLDOWN_MS/);
  assert.doesNotMatch(workspace, /LIVE_REFRESH_INTERVAL_MS/);
  assert.match(workspace, /strictProvider: "1"/);
  assert.match(workspace, /writeMarketSourceSnapshot/);
  assert.match(workspace, /temporaryQuoteFromMarketSeries/);
  assert.match(workspace, /mergePreferredTemporaryQuote/);
  assert.match(workspace, /return \{\s*promoted,\s*quote:/);
  assert.doesNotMatch(workspace, /promoted:\s*null/);
  assert.match(workspace, /canonicalSeriesRef/);
  assert.match(marketRoute, /strictProvider/);
  assert.match(
    marketRoute,
    /const allowedIntervals = new Set<MarketInterval>\(\["1d"\]\)/,
  );
  assert.match(marketRoute, /error: "UNSUPPORTED_INTERVAL"/);
  assert.match(marketRoute, /classifyMarketProviderError/);
  assert.match(providerErrors, /PROVIDER_CREDENTIAL_INVALID/);
  assert.match(workspace, /source-credential-warning/);
  assert.doesNotMatch(workspace, /intraday-delay-warning/);
  assert.doesNotMatch(workspace, /estimateIntradayDataDelayMinutes/);
  assert.doesNotMatch(workspace, /className=\{`live-guidance-card/);
  assert.match(
    marketRoute,
    /bypassCache = mode === "latest"/,
  );
  assert.match(
    marketIndex,
    /options\.strictProvider[\s\S]*fetchStrictProviderSeries/,
  );
  assert.match(marketSeries, /export function mergeCanonicalMarketSeries/);
  assert.match(
    marketSeries,
    /export function mergeTemporaryQuoteIntoMarketSeries/,
  );
  assert.match(marketSeries, /existing\.latestBarStatus === "complete"/);
  assert.match(
    marketSession,
    /POST_CLOSE_REFRESH_GRACE_MS = 30 \* 60 \* 1_000/,
  );
  assert.match(
    marketSession,
    /MARKET_REFRESH_FAILURE_BACKOFF_MS/,
  );
  assert.match(
    shortcutRefresh,
    /status: "primary" \| "backup" \| "retained"/,
  );
  assert.match(locale, /refreshStatus:/);
  assert.doesNotMatch(workspace, /copy\.lab\.automatic/);
  assert.doesNotMatch(workspace, /copy\.screening\.actionLabel/);
  assert.doesNotMatch(locale, /\bautomatic:\s*/);
  assert.doesNotMatch(locale, /\bactionLabel:\s*/);
  assert.match(
    styles,
    /\.strategy-panel-heading\s*\{[\s\S]*?flex-direction:\s*column/,
  );
  assert.match(
    styles,
    /\.entry-filter-inputs\s*\{[\s\S]*?minmax\(130px,\s*1\.3fr\)/,
  );
  assert.match(canonicalMarket, /key: "index:N225"[\s\S]*provider: "yahoo"/);
  assert.match(canonicalMarket, /key: "index:SOX"[\s\S]*provider: "yahoo"/);
  assert.match(canonicalCache, /SOURCE_SNAPSHOT_STORE = "sourceSnapshots"/);
  assert.match(canonicalCache, /REFERENCE_SNAPSHOT_STORE = "referenceSnapshots"/);
  assert.match(canonicalCache, /SOURCE_HEALTH_STORE = "sourceHealth"/);
  assert.match(marketQuality, /meanCloseErrorPercent/);
  assert.match(referenceRoute, /fetchFredNikkei225Reference/);
  assert.match(marketExchanges, /GDAXI: "XETRA"/);
  assert.match(marketExchanges, /FTSE: "LSE"/);
  assert.match(workspace, /copy\.intervals\[saved\.interval\]/);
  assert.match(workspace, /saved\.interval !== DAILY_INTERVAL/);
  assert.match(workspace, /copy\.chart\.dailyWorkspace/);
  assert.doesNotMatch(workspace, /copy\.intervals\[INTRADAY_INTERVAL\]/);
  assert.match(workspace, /const savedWorkspaceInterval = DAILY_INTERVAL/);
  assert.match(workspace, /interval: researchInterval/);
  assert.match(workspace, /runScreeningInWorker/);
  assert.match(workspace, /const runShortcutBatchScreening = async/);
  assert.match(workspace, /const shortcutGroups = savedBacktestGroups;/);
  assert.doesNotMatch(workspace, /const indexGroups = savedBacktestGroups\.filter/);
  assert.match(workspace, /className=\{`screening-progress \$\{/);
  assert.match(styles, /\.screening-progress\.batch progress/);
  assert.match(workspace, /const shortcutBatchContinuousProgress = Math\.min/);
  assert.match(workspace, /SHORTCUT_BATCH_CHECKPOINT_KEY/);
  assert.match(workspace, /shortcutBatchStopRequestedRef\.current = true/);
  assert.match(
    workspace,
    /shortcutBatchStopRequestedRef\.current = true;[\s\S]{0,180}localStorage\.removeItem\(SHORTCUT_BATCH_CHECKPOINT_KEY\)/,
  );
  assert.match(workspace, /selectBestShortcutScreeningResult/);
  assert.match(workspace, /name: folderName/);
  assert.match(workspace, /const assignedSavedBacktest =/);
  assert.match(workspace, /strategyFolderId: resolvedFolder\.id/);
  assert.match(workspace, /const folderName = `\$\{sessions\}日`/);
  assert.match(workspace, /promoteSavedBacktestWithinFolder\(/);
  assert.match(workspace, /orderedIds: nextRecords\.map\(\(record\) => record\.id\)/);
  assert.match(workspace, /strategySection\.records\.map\(\(saved, index\) =>/);
  assert.match(workspace, /className="saved-shortcut-number"/);
  assert.match(styles, /\.saved-shortcut-number\s*\{[^}]*color: var\(--text\)/);
  assert.match(
    savedBacktestRoute,
    /displayOrder:\s*existingInstrumentRow\?\.displayOrder/,
  );
  assert.match(locale, /batchAction: "一键\{sessions\}日"/);
  assert.match(workspace, /SCREENING_VALIDATION_MODES/);
  assert.match(screeningValidation, /optimizeStrategyCombinations/);
  assert.match(
    screeningValidation,
    /DEFAULT_ROLLING_WINDOW_YEARS = 1/,
  );
  assert.match(
    screeningValidation,
    /DEFAULT_SAMPLE_VALIDATION_SESSIONS = 128[\s\S]*DEFAULT_SAMPLE_VALIDATION_PERIODS = \[[\s\S]*sessions: DEFAULT_SAMPLE_VALIDATION_SESSIONS, weight: 100/,
  );
  assert.match(
    workspace,
    /Number\.isFinite\(requestedSessions\)[\s\S]*?: DEFAULT_SAMPLE_VALIDATION_SESSIONS/,
  );
  assert.match(
    locale,
    /sample: "\u5468\u671f\u7b5b\u9009"/,
  );
  assert.match(locale, /range: "\u533a\u95f4\u7b5b\u9009"/);
  assert.match(locale, /"multi-range": "\u591a\u5468\u671f\u7b5b\u9009"/);
  assert.match(locale, /rolling: "\u6eda\u52a8\u7b5b\u9009"/);
  assert.match(
    workspace,
    /name="strategy-sample-period-sessions"/,
  );
  assert.doesNotMatch(
    workspace,
    /strategy-sample-period-\$\{index\}-weight/,
  );
  assert.match(workspace, /screeningMultiRanges\.map/);
  assert.match(workspace, /SCREENING_PREFERENCES_STORAGE_KEY/);
  assert.match(workspace, /strategy-screening-multi-range-\$\{rangeIndex\}-start/);
  assert.match(workspace, /copy\.screening\.multiRangeAdd/);
  assert.match(screeningValidation, /runMultiRangeValidation/);
  assert.match(
    workspace,
    /resolveTrailingTradingSessionRange\(\s*payload\.bars,\s*sharedRangeSessionsRef\.current/,
  );
  assert.match(workspace, /const updateSharedRangeFromDates/);
  assert.match(workspace, /const updateSharedRangeFromSessions/);
  assert.match(workspace, /const savedBacktestRollingGroups = useMemo/);
  assert.match(workspace, /SAVED_BACKTEST_ROLLING_SESSIONS/);
  assert.match(
    workspace,
    /relativeLongStrategy: buildStrategyPlanTimeline\([\s\S]*?startTime: rollingRange\.startTime,[\s\S]*?endTime: rollingRange\.endTime/,
  );
  assert.match(
    workspace,
    /buildLiveAllocationGuidance\(\s*group\.marketSeries\.bars,\s*saved\.plan,\s*group\.rollingRange/,
  );
  assert.doesNotMatch(workspace, /startTime: saved\.startDate/);
  assert.doesNotMatch(workspace, /endTime: saved\.endDate/);
  assert.match(workspace, /method: "PUT"/);
  assert.doesNotMatch(workspace, /savedBacktestEvaluations/);
  assert.match(workspace, /runStrategyPlanRangeBacktest/);
  assert.doesNotMatch(workspace, /copy\.savedBacktests\.returnRange/);
  assert.match(screeningValidation, /resolveTradingSessionRange/);
  assert.doesNotMatch(screeningValidation, /phase: "display"/);
  assert.doesNotMatch(screeningValidation, /phase: "test"/);
  assert.doesNotMatch(screening, /MAX_PARAMETER_SETS_PER_STRATEGY/);
  assert.doesNotMatch(screening, /DEFAULT_PARAMETER_SETS_PER_STRATEGY/);
  assert.match(
    screening,
    /buildParameterSets\(\s*PARAMETER_SPACES\[strategy\.id\],?\s*\)/,
  );
  assert.match(
    combinations,
    /SCREENING_ENTRY_FILTER_FINALISTS_PER_STRATEGY = 60/,
  );
  assert.match(
    combinations,
    /ROLLING_SINGLE_FINALISTS_PER_STRATEGY = 10/,
  );
  assert.match(
    combinations,
    /COMBINATION_FINALISTS_PER_STRATEGY = 6/,
  );
  assert.match(combinations, /THREE_STRATEGY_ALLOCATION_CANDIDATES/);
  assert.match(
    combinations,
    /MAX_MULTI_STRATEGY_FINALISTS_PER_PRIMARY = 16/,
  );
  assert.match(
    combinations,
    /MAX_MULTI_STRATEGY_FINALISTS_PER_PRIMARY \* STRATEGIES\.length/,
  );
  assert.match(combinations, /stage: "triples"/);
  assert.match(combinations, /stage: "tripleAllocations"/);
  for (const stage of [
    "quadruples",
    "quadrupleAllocations",
    "quintuples",
    "quintupleAllocations",
    "sextuples",
    "sextupleAllocations",
  ]) {
    assert.match(combinations, new RegExp(`"${stage}"`));
  }
  assert.doesNotMatch(
    combinations,
    /"septuples"|"septupleAllocations"|"octuples"|"octupleAllocations"/,
  );
  assert.match(
    entryFilter,
    /SCREENING_MOVING_AVERAGE_SLOPE_PERIODS = \[\s*5,\s*6,\s*7,\s*8,\s*\]/,
  );
  assert.match(entryFilter, /"tv-channel-breakout"/);
  assert.match(entryFilter, /"tv-price-channel"/);
  assert.match(entryFilter, /supportsScreeningMovingAverageSlopeFilter/);
  assert.match(workspace, /buildScreeningMovingAverageSlopeFilters\(\)/);
  assert.match(workspace, /className="screening-config-group screening-optimization-group"/);
  assert.match(workspace, /className="screening-config-group screening-validation-group"/);
  assert.equal(
    workspace.match(/className="result-entry-filter"/g)?.length,
    3,
  );
  assert.doesNotMatch(workspace, /entry-filter-inputs fixed/);
  assert.match(styles, /\.entry-filter-inputs\.screening-fixed/);
  assert.doesNotMatch(workspace, /function resultCautionReasons/);
  assert.match(workspace, /recentValidationTitle\(recentReview\)/);
  assert.match(workspace, /recentValidationLabel\(recentReview\)/);
  assert.match(workspace, /copy\.screening\.validationStatuses/);
  assert.doesNotMatch(locale, /statusRule:/);
  assert.match(locale, /cautionReasons:/);
  assert.match(screening, /scheduler\?: CooperativeScheduler/);
  assert.match(screening, /await cooperativeScheduler\.yield\(\)/);
  assert.match(screening, /setTimeout\(resolve, 0\)/);
  assert.equal(
    screening.match(/await yieldForScreening\(\);/g)?.length,
    2,
  );
  assert.ok(
    (combinations.match(/await yieldForScreening\(\);/g)?.length ?? 0) >= 8,
  );
  assert.match(
    screeningWorkerClient,
    /new Worker\(\s*new URL\("\.\/screening\.worker\.ts", import\.meta\.url\),\s*\{\s*type: "module"\s*\}/,
  );
  assert.match(
    screeningWorkerClient,
    /type: "cancel",[\s\S]*?worker\.postMessage\(cancelRequest\)/,
  );
  assert.match(screeningWorkerClient, /response\.type === "restart"/);
  assert.match(
    screeningWorkerClient,
    /worker\.postMessage\(request, \[request\.bars\.values\.buffer\]\)/,
  );
  assert.match(screeningWorker, /runScreeningWithValidation/);
  assert.match(screeningWorker, /const controller = new AbortController\(\)/);
  assert.match(screeningWorker, /stageRestartRequested/);
  assert.match(combinations, /createStreamingCombinationTimeline/);
  assert.match(combinations, /Uint8Array\.from/);
  assert.match(combinations, /MULTI_STRATEGY_CORE_ALLOCATION = 0\.6/);
  assert.match(combinations, /buildMultiStrategyVolatilityRiskCaps/);
  assert.match(combinations, /resolveCoreSatelliteTarget/);
  assert.match(
    screeningWorkerClient,
    /positioningModelVersion: SCREENING_POSITIONING_MODEL_VERSION/,
  );
  assert.match(
    screeningWorkerClient,
    /resultModelVersion: SCREENING_RESULT_MODEL_VERSION/,
  );
  assert.match(combinations, /getCombinationResultIndex/);
  assert.match(combinations, /removeWorstCombinationResult/);
  assert.doesNotMatch(combinations, /combinationStrategySetKeyCache/);
  assert.match(combinations, /entryFilterCandidatesByStrategy\.clear\(\)/);
  assert.match(
    combinations,
    /canDiscardOrderFills[\s\S]*?orderFills: new Map\(\)/,
  );
  assert.doesNotMatch(workspace, /await yieldForScreening\(\)/);
  assert.match(strategies, /"donchian-intrabar"/);
  assert.match(strategies, /"supertrend-stop"/);
  assert.match(builtInStrategies, /buildOrders: greedyOrders/);
  assert.match(builtInStrategies, /buildOrders: parabolicSarOrders/);
  assert.match(strategyExecution, /resolveStrategyOrderFill/);
  assert.match(strategyExecution, /resolveStrategyOrderFills/);
  assert.match(strategyExecution, /buildStrategyOrderTimeline/);
  assert.match(
    entryFilter,
    /movingAverageType: "ema",[\s\S]*period: 7,[\s\S]*minimumSlopePercent: 0/,
  );
  assert.match(entryFilter, /applyMovingAverageSlopeEntryFilter/);
  assert.equal(
    workspace.match(/<MovingAverageSlopeFilterFields/g)?.length,
    4,
  );
  assert.match(workspace, /namePrefix="strategy-a-entry-filter"/);
  assert.match(workspace, /namePrefix="strategy-b-entry-filter"/);
  assert.match(workspace, /namePrefix="strategy-c-entry-filter"/);
  assert.match(workspace, /namePrefix="screening-entry-filter"/);
  assert.match(
    workspace,
    /screeningEntryFilterDraft[\s\S]*createMovingAverageSlopeFilterDraft\(\s*DEFAULT_MOVING_AVERAGE_SLOPE_FILTER/,
  );
  assert.match(workspace, /strategyPlanEntryFilter\(\s*strategyPlan,\s*"strategyA"/);
  assert.match(workspace, /strategyPlanEntryFilter\(\s*strategyPlan,\s*"strategyB"/);
  assert.match(workspace, /cloneStrategyPlan\(saved\.plan\)/);
  assert.match(
    workspace,
    /entryFilter: activeMovingAverageSlopeFilter\(\s*screeningEntryFilterDraft/,
  );
  assert.match(
    combinations,
    /strategyAEntryFilter: cloneMovingAverageSlopeFilter/,
  );
  assert.match(
    combinations,
    /strategyBEntryFilter: cloneMovingAverageSlopeFilter/,
  );
  assert.match(
    combinations,
    /strategyCEntryFilter: cloneMovingAverageSlopeFilter/,
  );
  assert.match(styles, /\.entry-filter-fields\s*\{/);
  assert.match(strategies, /equivalenceGroup: "macd-cross"/);
  assert.match(strategies, /equivalenceGroup: "supertrend-close"/);
  assert.match(combinations, /areStrategiesEquivalent/);
  assert.match(workspace, /pendingNextOpenAction/);
  assert.doesNotMatch(locale, /pendingGapOverride:/);
  assert.match(viteConfig, /"\*\*\/\.wrangler\/\*\*"/);
  assert.match(
    viteConfig,
    /"\*\*\/data\/state\/screening-engine\/\*\*"/,
  );
  const saveCurrentBacktestSource = workspace.match(
    /const saveCurrentBacktest = async \(\) => \{[\s\S]*?\n  \};/,
  )?.[0];
  assert.ok(saveCurrentBacktestSource);
  assert.doesNotMatch(saveCurrentBacktestSource, /resetScreening/);
  assert.match(saveCurrentBacktestSource, /appliedStrategyPlan/);
  assert.match(saveCurrentBacktestSource, /savedShortcutBacktest/);
  assert.match(saveCurrentBacktestSource, /savedShortcutRange/);
  assert.match(saveCurrentBacktestSource, /setSavedBacktests/);
  assert.doesNotMatch(saveCurrentBacktestSource, /await loadSavedBacktests/);
  assert.doesNotMatch(
    saveCurrentBacktestSource,
    /createSaveBacktestInput\([\s\S]*?\n\s*strategyPlan,/,
  );
  const openSavedBacktestSource = workspace.match(
    /const openSavedBacktest = \(saved: SavedBacktestRecord\) => \{[\s\S]*?\n  \};/,
  )?.[0];
  assert.ok(openSavedBacktestSource);
  assert.doesNotMatch(openSavedBacktestSource, /resetScreening|\.abort\(\)/);
  assert.match(
    openSavedBacktestSource,
    /clearScreeningPresentationForInstrumentChange/,
  );
  assert.match(
    openSavedBacktestSource,
    /canReuseSavedBacktestMarketSeries/,
  );
  assert.doesNotMatch(
    openSavedBacktestSource,
    /setStartDate\(saved\.startDate\)|setEndDate\(saved\.endDate\)/,
  );
  assert.match(openSavedBacktestSource, /kind: "saved-recent"/);
  const chooseInstrumentSource = workspace.match(
    /const chooseInstrument = \(nextInstrument: MarketInstrument\) => \{[\s\S]*?\n  \};/,
  )?.[0];
  assert.ok(chooseInstrumentSource);
  assert.doesNotMatch(chooseInstrumentSource, /\.abort\(\)|resetScreening/);
  assert.match(
    workspace,
    /visibleInstrumentKeyRef\.current === runInstrumentKey/,
  );
  assert.doesNotMatch(workspace, /getStrategiesByHorizon/);
  assert.match(combinations, /resolveRelativeLongStrategy/);
  assert.match(combinations, /strategyBIndex = strategyAIndex \+ 1/);
  assert.match(workspace, /applyCombinationResult/);
  assert.equal(
    workspace.match(/className="clickable-result-row"/g)?.length,
    2,
  );
  assert.match(workspace, /resolveScreeningResultChartWindows/);
  assert.match(workspace, /focusRange=\{appliedChartFocusRange\}/);
  assert.match(
    workspace,
    /appliedChartRange\.kind === "screening"[\s\S]*?encompassingScreeningWindow\(appliedChartWindows\)[\s\S]*?: null/,
  );
  assert.match(
    workspace,
    /onClick=\{\(\) =>\s*applySingleStrategy\(/,
  );
  assert.doesNotMatch(workspace, /className="apply-button"/);
  assert.doesNotMatch(workspace, /bestCombination|combination-preview/);
  assert.doesNotMatch(locale, /内置 ·/);
  assert.match(workspace, /copy\.combinationScreening\.strategyGroup/);
  assert.match(workspace, /resultPresentation\.shortName/);
  assert.match(workspace, /className="multi-strategy-other-names"/);
  assert.match(locale, /consensusShortName: "\{name\} · \{count\}策分层"/);
  assert.match(locale, /"multi-range": "\u591a\u5468\u671f\u7b5b\u9009"/);
  assert.doesNotMatch(locale, /\u591a\u5468\u671f\u56de\u6d4b/);
  assert.ok((workspace.match(/className="strategy-name-line"/g)?.length ?? 0) >= 3);
  assert.doesNotMatch(workspace, /className="strategy-pair-cell"/);
  assert.match(workspace, /className="screening-action-field"/);
  assert.match(
    styles,
    /\.screening-action-buttons\s*\{[\s\S]*?width: calc\(200% \+ 8px\);[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
  );
  assert.match(
    styles,
    /\.screening-action-buttons \.primary-action\s*\{[\s\S]*?white-space: nowrap;/,
  );
  assert.match(styles, /\.screening-panel\s*\{\s*display: flex;/);
  assert.match(workspace, /className="strategy-shortlist"/);
  assert.match(workspace, /className="strategy-consensus"/);
  assert.match(workspace, /buildStrategyConsensusAdvice/);
  assert.match(consensus, /export function buildStrategyConsensusAdvice/);
  assert.match(consensus, /Math\.round\(boundedAllocation\(value\) \* 10\) \/ 10/);
  assert.match(workspace, /applyShortlistEntry\(entry\)/);
  const shortlistMarkup = workspace.slice(
    workspace.indexOf('className="strategy-shortlist"'),
    workspace.indexOf('className="screening-results-stack"'),
  );
  assert.match(shortlistMarkup, /title=\{strategyFullName\}/);
  assert.doesNotMatch(workspace, /copy\.shortlist\.reviewDescriptions/);
  assert.ok(
    workspace.indexOf('className="strategy-shortlist"') <
      workspace.indexOf('className="screening-results-stack"'),
  );
  assert.match(styles, /\.strategy-shortlist-grid\s*\{/);
  assert.match(shortlist, /selectStrategyShortlist/);
  assert.match(shortlist, /equityReturnCorrelation/);
  assert.match(shortlist, /evaluateRecentStrategyEffectiveness/);
  assert.match(
    shortlist,
    /similarityToSelected\(candidate, recommendations\)\.similarity ===\s+"low"/,
  );
  assert.match(shortlist, /"alternative"/);
  assert.match(workspace, /copy\.shortlist\.insufficientDeputies/);
  assert.match(locale, /同类对照/);
  assert.match(styles, /\.results-table-wrap\s*\{[\s\S]*?overflow-x: hidden;/);
  assert.match(styles, /\.results-table\s*\{[\s\S]*?table-layout: fixed;/);
  assert.match(
    styles,
    /\.screening-results-stack\s*\{[\s\S]*?gap: 10px;/,
  );
  assert.match(styles, /\.screening-results \.results-table\s*\{\s*min-width: 0;/);
  assert.match(styles, /\.combination-table\s*\{\s*min-width: 0;/);
  assert.match(workspace, /shortcutMatchLabel\(shortcutMatch\)/);
  assert.match(
    workspace,
    /findStrategyShortcutMatch\([\s\S]*?savedBacktests,[\s\S]*?instrument: series\?\.instrument \?\? instrument,[\s\S]*?interval: researchInterval/,
  );
  assert.match(workspace, /const combinationResultsByCount = new Map\(/);
  assert.match(locale, /quadrupleResultsTitle: "四策略结果"/);
  assert.match(locale, /quintupleResultsTitle: "五策略结果"/);
  assert.doesNotMatch(locale, /septupleResultsTitle/);
  assert.doesNotMatch(locale, /octupleResultsTitle/);
  assert.doesNotMatch(locale, /nonupleResultsTitle/);
  assert.doesNotMatch(
    styles,
    /\.quadruple-strategy-results \.results-table-wrap,[\s\S]*?overflow-x: auto;/,
  );
  assert.match(styles, /\.multi-strategy-other-names\s*\{[\s\S]*?-webkit-line-clamp: 2;/);
  assert.match(workspace, /screenResults\.map\(\(result, resultIndex\) =>/);
  assert.match(workspace, /resultGroup\.results\.map\(\(result, resultIndex\) =>/);
  assert.match(workspace, /<summary className="results-heading">/);
  assert.match(workspace, /copy\.screening\.validationNote/);
  assert.match(styles, /\.screening-results-note\s*\{/);
  assert.match(
    styles,
    /\.dual-strategy-results \.combination-table th:nth-child\(4\),[\s\S]*?text-align: center;/,
  );
  assert.match(workspace, /buildStrategyPlanTimeline/);
  assert.match(workspace, /buildAllocationTradeMarkers/);
  assert.doesNotMatch(workspace, /combination-allocation-ladder/);
  assert.match(workspace, /setScreenResults\(outcome\.singleResults\)/);
  assert.match(workspace, /setScreenResultsObjective\(runObjective\)/);
  assert.match(workspace, /readLatestScreeningResult\(\)/);
  assert.match(workspace, /writeLatestScreeningResult\(\{/);
  assert.match(workspace, /clearLatestScreeningResult\(\)/);
  assert.match(screeningResultCache, /quantscope-screening-result/);
  assert.match(screeningResultCache, /LATEST_RESULT_KEY = "latest"/);
  assert.match(
    screeningResultCache,
    /result\?\.positioningModelVersion === SCREENING_POSITIONING_MODEL_VERSION/,
  );
  assert.match(
    screeningResultCache,
    /result\.resultModelVersion === SCREENING_RESULT_MODEL_VERSION/,
  );
  assert.match(workspace, /shortcutGuidance\.tacticalSupport/);
  assert.match(workspace, /shortcutGuidance\.volatilityRiskCap/);
  assert.doesNotMatch(workspace, /chooseResearchInterval/);
  assert.doesNotMatch(workspace, /setResearchInterval/);
  assert.doesNotMatch(
    workspace,
    /copy\.screening\.resultSnapshotNotice/,
  );
  assert.doesNotMatch(
    workspace,
    /copy\.screening\.sampleResultMetricNotice/,
  );
  assert.match(workspace, /validationReport\.performance/);
  assert.match(
    workspace,
    /validationReport && validationReport\.mode !== "sample"/,
  );
  assert.doesNotMatch(workspace, /validationReport\.periods\.map/);
  assert.doesNotMatch(locale, /不写入筛选结果缓存/);
  assert.doesNotMatch(locale, /50\/50、60\/40、40\/60、70\/30、30\/70 仓位/);
  assert.doesNotMatch(
    locale,
    /结果表中的收益、回撤、夏普和综合分都来自当前筛选区间/,
  );
  assert.match(
    workspace,
    /name="strategy-screening-objective"[\s\S]*?onChange=\{\(event\) => \{[\s\S]*?setScreeningObjective[\s\S]*?\}\}[\s\S]*?<\/select>/,
  );
  assert.doesNotMatch(
    workspace.match(
      /name="strategy-screening-objective"[\s\S]*?<\/select>/,
    )?.[0] ?? "",
    /resetScreening/,
  );
  assert.doesNotMatch(workspace, /name="strategy-max-parameter-sets"/);
  assert.doesNotMatch(workspace, /\.slice\(0,\s*8\)/);
  assert.match(workspace, /screenProgress\.stageCompleted/);
  assert.match(workspace, /screenProgress\.stageTotal/);
  assert.doesNotMatch(workspace, /combinationScreeningObjective/);
  assert.doesNotMatch(workspace, /combinationMaxParameterSets/);
  assert.match(workspace, /applyCurrentStrategyToChart/);
  assert.match(workspace, /setAppliedStrategyPlan\(cloneStrategyPlan\(strategyPlan\)\)/);
  assert.match(
    workspace,
    /const \[strategyAId, setStrategyAId\] = useState<StrategyId \| "">\(""\)/,
  );
  assert.match(
    workspace,
    /useState<StrategyAllocationPlan \| null>\(null\)/,
  );
  assert.match(
    workspace,
    /function createIntervalResearchSnapshot[\s\S]*?strategyAId: ""[\s\S]*?strategyBId: ""[\s\S]*?appliedStrategyPlan: null/,
  );
  assert.match(
    workspace,
    /onClick=\{applyCurrentStrategyToChart\}[\s\S]*?disabled=\{strategyPlanVolumeUnavailable\}/,
  );
  assert.doesNotMatch(workspace, /live-guidance-card/);
  assert.match(locale, /noStrategyDescription: "走势图当前未应用任何策略"/);
  assert.doesNotMatch(workspace, /defaultAppliedStrategyPlan/);
  assert.match(workspace, /appliedStrategySummary/);
  assert.match(workspace, /className="lab-heading-actions"/);
  assert.match(workspace, /className="strategy-selector-card"/);
  assert.match(workspace, /<select\s+name="strategy-a-allocation"/);
  assert.match(workspace, /<select\s+name="strategy-b-allocation"/);
  assert.match(workspace, /availableStrategies\.map/);
  assert.match(
    workspace,
    /getStrategiesForInterval\(researchInterval\)/,
  );
  assert.match(workspace, /const INTRADAY_HISTORY_LIMIT = 2_500/);
  assert.match(
    workspace,
    /researchInterval === INTRADAY_INTERVAL[\s\S]*?resolveTradingSessionRange\([\s\S]*?firstTime,[\s\S]*?lastTime/,
  );
  assert.match(workspace, /<strong title=\{strategyPresentation\.fullName\}>/);
  assert.match(
    workspace,
    /function strategyPlanPresentation\([\s\S]*?legs\.length >= 3[\s\S]*?consensusShortName[\s\S]*?fullName: naturalNames\.join\(" \+ "\)/,
  );
  assert.match(
    workspace,
    /const selectedStrategySummary = strategyPlan[\s\S]*?strategyPlanDisplayName\(strategyPlan, relativeLongStrategy\)/,
  );
  assert.match(
    workspace,
    /const appliedStrategyPresentation = appliedStrategyPlan[\s\S]*?strategyPlanPresentation\([\s\S]*?appliedRelativeLongStrategy[\s\S]*?const appliedStrategySummary = appliedStrategyPresentation\?\.shortName/,
  );
  assert.match(
    workspace,
    /const strategyPresentation = strategyPlanPresentation\([\s\S]*?savedBacktestRelativeLongStrategies\.get[\s\S]*?const strategyLabel = strategyPresentation\.shortName/,
  );
  assert.match(
    workspace,
    /entry\.kind === "combination"[\s\S]*?strategyPlanPresentation\([\s\S]*?entry\.plan,[\s\S]*?entry\.result\.relativeLongStrategy/,
  );
  assert.match(
    styles,
    /\.saved-shortcut-name strong\s*\{[\s\S]*?overflow-wrap: anywhere;[\s\S]*?white-space: normal;/,
  );
  assert.match(workspace, /relativeLongStrategy/);
  assert.doesNotMatch(
    workspace,
    /copy\.strategies\[result\.strategyId\]\.name[\s\S]{0,500}copy\.strategyHorizons\[/,
  );
  assert.match(
    workspace,
    /const strategyRoleLabel = \(slot: StrategySlot\)[\s\S]{0,500}resultGroup\.strategyCount >= 3[\s\S]{0,300}copy\.combinationScreening\.primarySignal[\s\S]{0,150}copy\.combinationScreening\.supportingSignal[\s\S]{0,250}copy\.strategyHorizons\.long[\s\S]{0,100}copy\.strategyHorizons\.short/,
  );
  assert.match(workspace, /className="saved-shortcuts-save"/);
  assert.match(workspace, /className="chart-result-navigator"/);
  assert.match(
    workspace,
    /availableChartResultGroups[\s\S]*?copy\.screening\.previousResult[\s\S]*?copy\.screening\.nextResult/,
  );
  assert.match(
    workspace,
    /const applyChartResult = \([\s\S]*?applySingleStrategy\([\s\S]*?false[\s\S]*?applyCombinationResult\([\s\S]*?false/,
  );
  assert.match(styles, /\.chart-result-navigator\s*\{/);
  assert.match(locale, /resultNavigator: "回测结果快捷导航"/);
  assert.match(workspace, /className="saved-shortcut-group-delete"/);
  assert.match(workspace, /copy\.savedBacktests\.removeGroupConfirm/);
  assert.doesNotMatch(workspace, /copy\.savedBacktests\.rankHistory/);
  assert.doesNotMatch(workspace, /copy\.savedBacktests\.notRanked/);
  assert.doesNotMatch(workspace, /saved\.rankHistory\.map/);
  assert.match(workspace, /savedBacktestLiveGuidance/);
  assert.match(workspace, /currentAllocation: evaluation\.performance\.executedAllocation \?\? 0/);
  assert.match(workspace, /Math\.round\(shortcutGuidance\.currentAllocation \* 100\)/);
  assert.match(workspace, /shortcutGuidance\.orderPrices\.flatMap/);
  assert.doesNotMatch(workspace, /ShortcutRebalanceOutlook|savedBacktestOutlooks|savedBacktests\.signalDate/);
  assert.match(workspace, /saved-shortcut-guidance/);
  assert.doesNotMatch(workspace, /className={`saved-shortcut-validation/);
  assert.match(
    workspace,
    /className="saved-shortcut-main"[\s\S]*?saved-shortcut-guidance[\s\S]*?<\/button>[\s\S]*?<span className="saved-shortcut-outcome">[\s\S]*?<b[\s\S]*?displayedReturn\.totalReturn[\s\S]*?<select/,
  );
  assert.match(
    styles,
    /\.saved-shortcut-outcome\s*\{[\s\S]*?grid-column: 3 \/ 5;[\s\S]*?grid-row: 1;[\s\S]*?margin-left: -12px;[\s\S]*?justify-content: flex-end;[\s\S]*?overflow: hidden;/,
  );
  assert.match(
    styles,
    /\.saved-shortcut-main\s*\{[\s\S]*?grid-column: 2;[\s\S]*?grid-row: 1 \/ span 2;/,
  );
  assert.match(
    styles,
    /\.saved-shortcut-main\s*\{[\s\S]*?padding: 8px 14px 8px 9px;/,
  );
  assert.match(
    styles,
    /\.saved-shortcut-name strong\s*\{[\s\S]*?display: block;[\s\S]*?overflow-wrap: anywhere;/,
  );
  assert.match(locale, /removeGroup: "删除该股指全部回测"/);
  assert.doesNotMatch(locale, /rankHistory: "近 5 次排名"/);
  const savedShortcutButtonStart = workspace.indexOf(
    'className="saved-shortcut-main"',
  );
  const savedShortcutContentStart = workspace.indexOf(
    '<span className="saved-shortcut-name">',
    savedShortcutButtonStart,
  );
  const savedShortcutMainButtonAttributes = workspace.slice(
    savedShortcutButtonStart,
    savedShortcutContentStart,
  );
  assert.match(savedShortcutMainButtonAttributes, /aria-label=/);
  assert.doesNotMatch(savedShortcutMainButtonAttributes, /title=/);
  assert.match(
    workspace,
    /strategyPlansEqual\(\s*saved\.plan,\s*appliedStrategyPlan,\s*\)/,
  );
  assert.doesNotMatch(workspace, /indicatorConfigurationsEqual/);
  assert.match(
    workspace,
    /toggleIndicator\(item\.id\);\s*if \(closeMenuOnSelect\) setOpenIndicatorCategory\(null\);/,
  );
  assert.doesNotMatch(workspace, /setVisibleIndicatorIds\(saved\.indicators\.map/);
  assert.doesNotMatch(workspace, /buildStrategyLinkedPaneIndicators|mergeChartIndicatorConfigurations/);
  assert.match(workspace, /window\.localStorage\.setItem/);
  assert.match(indicatorRegistry, /quantscope\.indicator-preferences\.v1/);
  assert.match(schema, /indicatorConfigurationsJson/);
  assert.match(schema, /rollingTotalReturn/);
  assert.match(schema, /rankHistoryJson/);
  assert.match(schema, /lastRankSnapshotKey/);
  assert.match(schema, /export const savedBacktestFolders = sqliteTable/);
  assert.match(schema, /instrumentFolderId: integer\("instrument_folder_id"\)/);
  assert.match(schema, /strategyFolderId: integer\("strategy_folder_id"\)/);
  assert.match(schema, /onDelete: "set null"/);
  assert.match(savedBacktestRoute, /indicatorConfigurationsJson/);
  assert.match(savedBacktestRoute, /savedBacktestFolders/);
  assert.match(savedBacktestFolderRoute, /export async function POST/);
  assert.match(savedBacktestFolderRoute, /export async function PATCH/);
  assert.match(savedBacktestFolderRoute, /export async function PUT/);
  assert.match(savedBacktestFolderRoute, /export async function DELETE/);
  assert.match(savedBacktestFolderRoute, /parseSavedBacktestFolderOrderInput/);
  assert.match(savedBacktestFolderRoute, /INVALID_FOLDER_ORDER/);
  assert.match(savedBacktestFolderRoute, /savedBacktestFolders\.displayOrder/);
  assert.match(savedBacktestFolderRoute, /savedBacktestInstrumentKey/);
  assert.match(savedBacktestRoute, /export async function PUT/);
  assert.doesNotMatch(savedBacktestRoute, /buildArchivedScreeningRankHistories/);
  assert.doesNotMatch(savedBacktestRoute, /appendSavedBacktestRank/);
  assert.doesNotMatch(screeningRunsRoute, /rankByCandidateKey/);
  assert.doesNotMatch(screeningRunsRoute, /screening-rank-v5/);
  assert.doesNotMatch(screeningRunsRoute, /savedBacktestEvaluationsCoverIds/);
  assert.match(savedBacktestRoute, /instrumentKey\) \{/);
  assert.match(savedBacktestRoute, /shouldReplaceSavedBacktest/);
  assert.match(savedBacktestRoute, /replaced: true/);
  assert.match(savedBacktestRoute, /createdAt: row\.createdAt/);
  assert.match(locale, /addedAt: "加入时间"/);
  assert.doesNotMatch(
    workspace,
    /const addedAt = cacheTimeFormatter\.format\(\s*new Date\(saved\.createdAt\),\s*\)/,
  );
  assert.doesNotMatch(workspace, /<time dateTime=\{saved\.createdAt\}>/);
  assert.match(workspace, /copy\.savedBacktests\.currentPosition/);
  assert.doesNotMatch(workspace, /copy\.savedBacktests\.adjustmentPrice/);
  assert.match(workspace, /saved-shortcut-guidance/);
  assert.doesNotMatch(workspace, /saved-shortcuts-range/);
  assert.doesNotMatch(
    workspace,
    /copy\.savedBacktests\.(?:returnRange|currentRange|savedRange)/,
  );
  assert.doesNotMatch(workspace, /savedEntryFilterSummary/);
  assert.doesNotMatch(
    workspace,
    /copy\.intervals\[saved\.interval\]\}\{" "\}\s*\{copy\.common\.separator\}/,
  );
  assert.match(
    styles,
    /\.saved-shortcut-main small \{[\s\S]*?color: var\(--muted\);[\s\S]*?font-size: 11px;/,
  );
  assert.match(
    styles,
    /\.saved-shortcut-name strong \{[\s\S]*?font-size: 11px;/,
  );
  assert.doesNotMatch(styles, /\.live-guidance-card/);
  assert.match(priceChart, /buildVisiblePriceAxisRange/);
  assert.match(priceChart, /min: priceAxisRange\.minimum/);
  assert.match(priceChart, /formatPriceAxisValue\(value, priceAxisPrecision\)/);
  assert.match(priceChart, /maximum <= 20 \? 2 : 0/);
  assert.match(priceChart, /onDataZoomChange=\{handleDataZoomChange\}/);
  assert.match(echart, /chart\.on\("datazoom", handleDataZoom\)/);
  assert.doesNotMatch(echart, /import \* as echarts from "echarts"/);
  assert.match(echart, /from "echarts\/charts"/);
  assert.match(echart, /from "echarts\/components"/);
  assert.match(echart, /from "echarts\/renderers"/);
  assert.match(echart, /CandlestickChart/);
  assert.match(echart, /ScatterChart/);
  assert.match(
    workspace,
    /if \(normalizedQuery\.length < 1\) \{[\s\S]*?setSearchResults\(\[\]\);[\s\S]*?return \(\) => controller\.abort\(\);/,
  );
  assert.doesNotMatch(
    workspace,
    /<em>[\s\S]*copy\.liveGuidance\.execution/,
  );
  for (const removedCopyKey of [
    "screening.description",
    "objectiveDescriptions",
    "fullTraversalHint",
    "validationDescriptions",
    "samplePeriodsHint",
    "rollingWindowYearsHint",
    "noStrategyADescription",
    "noStrategyBDescription",
    "strategyAAllocationHint",
    "strategyBAllocationHint",
    "planUnavailable",
  ]) {
    assert.equal(
      workspace.includes(removedCopyKey),
      false,
      `removed explanatory copy key remains: ${removedCopyKey}`,
    );
  }
  assert.doesNotMatch(styles, /font-size:\s*[7-9]px/);
  assert.doesNotMatch(priceChart, /fontSize:\s*[7-9](?:,|\s*\})/);
  assert.doesNotMatch(backtestChart, /fontSize:\s*[7-9](?:,|\s*\})/);
  assert.match(saveCurrentBacktestSource, /payload\.replaced/);
  assert.match(workspace, /setStrategyAAllocationPercent\(100\)/);
  assert.match(workspace, /setStrategyBAllocationPercent\(100\)/);
  assert.doesNotMatch(savedBacktestRoute, /onConflictDoUpdate/);
  assert.match(
    savedBacktestRoute,
    /\.limit\(MAX_SAVED_BACKTEST_SCROLL_RECORDS\)/,
  );
  assert.match(savedBacktestRoute, /desc\(savedBacktests\.displayOrder\)/);
  assert.match(savedBacktestRoute, /export async function PATCH/);
  assert.match(savedBacktestRoute, /orderedIds/);
  assert.doesNotMatch(savedBacktestRoute, /normalizeSavedBacktestPagination/);
  assert.match(
    workspace,
    /savedBacktestInstrumentSections\.map\(\(section\) =>/,
  );
  assert.match(workspace, /strategyShortcutSectionsForGroup\(group\)\.map/);
  assert.match(workspace, /className="saved-shortcut-folder-select"/);
  assert.match(workspace, /className="saved-shortcut-folder-select strategy"/);
  assert.match(workspace, /renameSavedBacktestFolder/);
  assert.match(workspace, /deleteSavedBacktestFolder/);
  assert.match(workspace, /toggleSavedBacktestFolder/);
  assert.match(workspace, /persistSavedBacktestFolderOrder/);
  assert.match(workspace, /className="saved-shortcut-folder-drag-handle"/);
  assert.match(workspace, /className="saved-shortcut-folder-toggle"/);
  assert.match(workspace, /aria-expanded=\{folderExpanded\}/);
  assert.match(workspace, /aria-expanded=\{strategyFolderExpanded\}/);
  assert.match(workspace, /className="saved-shortcut-group-toggle"/);
  assert.match(workspace, /const openSavedBacktestGroup =/);
  assert.match(workspace, /openSavedBacktestGroup\(group\)/);
  assert.match(workspace, /setAppliedStrategyPlan\(null\)/);
  assert.match(workspace, /copy\.savedBacktests\.openCleanChart/);
  assert.match(locale, /openCleanChart: "打开无策略行情图"/);
  assert.match(workspace, /aria-expanded=\{expanded\}/);
  assert.match(workspace, /draggable=\{!savedBacktestOrderSaving\}/);
  assert.match(
    workspace,
    /if \(savedBacktestDrag\?\.kind !== "record"\) return;[\s\S]*?event\.stopPropagation\(\)/,
  );
  assert.match(
    workspace,
    /if \(savedBacktestDrag\?\.kind !== "group"\) return;[\s\S]*?event\.stopPropagation\(\)/,
  );
  assert.match(workspace, /className="saved-shortcut-group-records"/);
  assert.match(workspace, /persistSavedBacktestOrder/);
  assert.match(
    savedBacktestRoute,
    /const SAVED_BACKTEST_ORDER_UPDATE_CHUNK_SIZE = 25;/,
  );
  assert.match(
    savedBacktestRoute,
    /offset \+= SAVED_BACKTEST_ORDER_UPDATE_CHUNK_SIZE[\s\S]*?inArray\(savedBacktests\.id, chunkIds\)/,
  );
  assert.doesNotMatch(workspace, /saved-shortcuts-summary/);
  assert.doesNotMatch(workspace, /saved-shortcuts-pagination/);
  assert.doesNotMatch(workspace, /savedBacktestTotalPages/);
  assert.match(workspace, /setErrorCode\("CACHED_PREVIEW"\)/);
  assert.match(workspace, /setCachedPreviewAt\(cached\.cachedAt\)/);
  assert.match(workspace, /copy\.chart\.cacheTime/);
  assert.match(
    workspace,
    /canReuseSavedBacktestMarketSeries\(/,
  );
  assert.match(locale, /CACHED_PREVIEW:/);
  assert.match(schema, /saved_backtests_owner_instrument_idx/);
  assert.match(schema, /displayOrder: integer\("display_order"\)/);
  assert.match(schema, /saved_backtests_owner_display_order_idx/);
  assert.doesNotMatch(schema, /saved_backtests_owner_instrument_unique/);
  assert.match(schema, /export const screeningRuns = sqliteTable/);
  assert.match(schema, /dataFingerprint: text\("data_fingerprint"\)/);
  assert.match(
    schema,
    /temporaryQuoteProvider: text\("temporary_quote_provider"\)/,
  );
  assert.match(
    schema,
    /temporaryQuoteFetchedAt: text\("temporary_quote_fetched_at"\)/,
  );
  assert.match(schema, /screening_runs_owner_instrument_created_idx/);
  assert.match(screeningRuns, /export \{ fingerprintMarketSeries \}/);
  assert.match(marketFingerprint, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(screeningRuns, /compareScreeningRuns/);
  assert.match(screeningRuns, /MAX_SCREENING_RUN_HISTORY = 6/);
  assert.match(screeningRuns, /MAX_SCREENING_RUN_CANDIDATES = 400/);
  assert.match(screeningRunsRoute, /export async function GET/);
  assert.match(screeningRunsRoute, /export async function POST/);
  assert.match(screeningRunsRoute, /previousRun/);
  assert.match(screeningRunsRoute, /temporaryQuoteProvider/);
  assert.doesNotMatch(screeningRunsRoute, /db\.batch\(batchQueries\)/);
  assert.doesNotMatch(screeningRunsRoute, /screening-rank-v5:/);
  assert.doesNotMatch(savedBacktestRoute, /eq\(screeningRuns\.objective/);
  assert.doesNotMatch(screeningRunsRoute, /eq\(screeningRuns\.objective/);
  assert.doesNotMatch(workspace, /includedPlans/);
  assert.match(screeningRunsRoute, /ROW_NUMBER\(\) OVER/);
  assert.match(
    screeningRunsRoute,
    /history_rank > \$\{MAX_SCREENING_RUN_HISTORY\}/,
  );
  assert.doesNotMatch(workspace, /`\/api\/screening-runs\?instrumentKey=/);
  assert.match(workspace, /createSaveScreeningRunInput\([\s\S]*?dataFingerprint/);
  assert.match(
    workspace,
    /refreshShortcutMarketInstrument\([\s\S]*?previousTemporaryQuote/,
  );
  assert.match(
    workspace,
    /refreshedShortcutMarkets\.get\(group\.key\)/,
  );
  assert.match(
    shortcutRefresh,
    /for \(const definition of recoveryDefinitions\)/,
  );
  assert.match(
    marketSeries,
    /export function mergePreferredTemporaryQuote\(/,
  );
  assert.match(locale, /refresh: "刷新当前行情与全部快捷栏"/);
  assert.doesNotMatch(
    styles,
    /\.market-stat-row,\s*\.instrument-strip \.icon-button\s*\{\s*display: none/,
  );
  assert.match(workspace, /fetch\("\/api\/screening-runs", \{\s*method: "POST"/);
  assert.doesNotMatch(workspace, /className="screening-history"/);
  assert.doesNotMatch(styles, /\.screening-history/);
  assert.match(workspace, /startSavedMarketRefresh\(false\)/);
  assert.match(workspace, /setShortcutRefreshRequestVersion/);
  assert.match(workspace, /assessMarketVolumeCoverage/);
  assert.match(workspace, /VOLUME_REQUIRED_STRATEGY_IDS/);
  assert.match(workspace, /indicatorRequiresVolume/);
  assert.match(marketQuality, /volumeCoveragePercent/);
  assert.match(indicatorRegistry, /VOLUME_REQUIRED_INDICATOR_IDS/);
  assert.match(strategies, /VOLUME_REQUIRED_STRATEGY_IDS/);
  assert.match(savedBacktestRoute, /rollingTotalReturn:\s*sql<number>`CASE/);
  assert.match(workspace, /className="screening-range-session-count"/);
  assert.match(
    workspace,
    /const HISTORICAL_EXECUTION_POLICY = "hybrid" as const/,
  );
  assert.match(workspace, /const DEFAULT_COMMISSION_PERCENT = 0\.05/);
  assert.match(
    workspace,
    /useState\(\s*DEFAULT_COMMISSION_PERCENT,\s*\)/,
  );
  assert.match(workspace, /todayEntryPrice/);
  assert.match(workspace, /todayExitPrice/);
  assert.doesNotMatch(workspace, /classifyManualExecutionWindow/);
  assert.match(
    workspace,
    /researchInterval === DAILY_INTERVAL[\s\S]*?DAILY_HISTORY_LIMIT[\s\S]*?INTRADAY_HISTORY_LIMIT/,
  );
  assert.match(workspace, /readCanonicalMarketSeriesEntry/);
  assert.match(workspace, /writeCanonicalMarketSeries/);
  assert.match(workspace, /readCachedMarketSeriesEntry/);
  assert.match(workspace, /isMarketSeries\(seriesState\)/);
  assert.match(clientCache, /export async function readCachedMarketSeries\(/);
  assert.match(clientCache, /return cached\?\.series \?\? null/);
  assert.match(workspace, /series\.latestBarStatus/);
  assert.match(clientCache, /MAX_CACHE_ENTRIES = 32/);
  assert.doesNotMatch(clientCache, /MAX_CACHE_AGE_MS/);
  assert.doesNotMatch(clientCache, /Date\.now\(\) - record\.cachedAt/);
  assert.match(
    marketSession,
    /JPX: \{[\s\S]*?timeZone: "Asia\/Tokyo"[\s\S]*?closeMinute: 15 \* 60 \+ 30/,
  );
  assert.match(
    marketSession,
    /XETRA: \{[\s\S]*?timeZone: "Europe\/Berlin"[\s\S]*?closeMinute: 17 \* 60 \+ 30/,
  );
  assert.match(marketRoute, /clampMarketSeriesLimit/);
  assert.match(marketRoute, /DAILY_HISTORY_LIMIT/);

  assert.match(locale, /insufficientEvidence:\s*"证据不足"/);
  assert.match(locale, /invalidParameters:\s*"当前策略参数无效/);
  assert.match(locale, /insufficientObservations:\s*"当前回测区间/);
  assert.match(locale, /insufficientTrades:\s*"当前规则完成的交易/);
  assert.match(locale, /noNearbyVariants:\s*"没有可用的邻近参数组合/);
  assert.match(locale, /legacyIntervalPrefix:\s*"此保存结果使用旧版"/);
  assert.match(locale, /legacyIntervalSuffix:\s*"周期；打开后会在日线数据上重新计算所选设置。"/);
  assert.match(locale, /gold:\s*"黄金"/);
  assert.match(locale, /silver:\s*"白银"/);
  assert.match(locale, /open:\s*"建仓"/);
  assert.match(locale, /lightPosition:\s*"清仓"/);
  assert.match(locale, /closePosition:\s*"清仓"/);
  assert.match(locale, /rangeSessions:\s*"区间交易日"/);
});
