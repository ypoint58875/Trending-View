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
  assert.match(html, /<html lang="zh-CN">/i);
  assert.match(html, /<title>QuantScope \| Market Strategy Lab<\/title>/i);
  assert.match(html, /QuantScope/);
  assert.match(html, /\u91cf\u5316\u7b56\u7565\u7814\u7a76\u53f0/);
  assert.match(html, /\u4e00\u952e\u7b56\u7565\u7b5b\u9009/);
  assert.match(html, /\u7b56\u7565\u5b9e\u9a8c\u5ba4/);
  assert.match(html, /\u6307\u6807\u8bbe\u7f6e/);
  assert.match(html, /\u6062\u590d\u9ed8\u8ba4/);
  assert.doesNotMatch(
    html,
    />\s*(?:1|5|15|30|60) \u5206\s*</,
  );
  assert.doesNotMatch(html, /interval-tabs/);

  const indicatorGroup = html.match(
    /<div\b[^>]*class="indicator-controls"[^>]*>/,
  )?.[0];
  assert.ok(indicatorGroup, "indicator group should render");
  assert.match(indicatorGroup, /role="group"/);
  assert.match(indicatorGroup, /aria-label="\u6307\u6807"/);
  assert.doesNotMatch(indicatorGroup, /role="toolbar"/);
  assert.doesNotMatch(indicatorGroup, /role="tablist"/);

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
    /\u7b56\u7565\u53e0\u52a0[\s\S]*?\u7b56\u7565\u53c2\u8003\u7ebf[\s\S]*?SMA \u53cc\u5747\u7ebf/,
  );

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
  assert.match(html, /\u4e0d\u8fdb\u884c\u53c2\u6570\u4f18\u5316/);
  assert.match(html, /name="indicator-fast"/);
  assert.match(html, /name="indicator-slow"/);
  assert.match(html, /\u6700\u65b0\u7b56\u7565\u5efa\u8bae/);
  assert.match(html, /\u7eff\u8272\uff1a\u4e0a\u6da8/);
  assert.match(html, /\u7ea2\u8272\uff1a\u4e0b\u8dcc/);
  assert.match(html, /\u6bcf 60 \u79d2\u81ea\u52a8\u5237\u65b0/);
  assert.match(html, /\u56de\u6d4b\u5feb\u6377\u680f/);
  assert.match(html, />\u4fdd\u5b58\u5f53\u524d\u7b56\u7565</);
  assert.match(html, /\u65e5\u7ecf 225/);
  assert.match(
    html,
    /\u5148\u5b8c\u6210\u5168\u90e8 34 \u7c7b\u5355\u7b56\u7565\u53c2\u6570\u7b5b\u9009/,
  );
  assert.match(html, /60%\/40%/);
  assert.match(html, /40%\/60%/);
  assert.match(html, /\u5168\u90e8\u6709\u9650\u53c2\u6570\u7ec4\u5408/);
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
  assert.match(
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
  assert.match(html, /\u5355\u4e00\u7b56\u7565\u7ed3\u679c/);
  assert.match(html, /\u7ec4\u5408\u7b56\u7565\u7ed3\u679c/);
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
    /name="strategy-a-allocation"[\s\S]*?<option value="100" selected="">100%<\/option>/,
  );
  assert.match(
    html,
    /name="strategy-b-allocation"[\s\S]*?<option value="0" selected="">0%<\/option>/,
  );
  assert.match(html, /name="strategy-screening-objective"/);
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
    html.indexOf("\u5355\u4e00\u7b56\u7565\u7ed3\u679c") <
      html.indexOf("\u7ec4\u5408\u7b56\u7565\u7ed3\u679c"),
  );
  assert.ok(
    html.indexOf("\u56de\u6d4b\u5feb\u6377\u680f") <
      html.indexOf("\u7b56\u7565\u5b9e\u9a8c\u5ba4"),
  );
  assert.match(html, /Channel BreakOut/);
  assert.match(html, /Technical Ratings/);
  assert.match(html, /\u4ec5\u505a\u591a/);
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
  const marketRoute = await readFile(
    new URL("../app/api/market/route.ts", import.meta.url),
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
  const shortlist = await readFile(
    new URL("../lib/analysis/strategy-shortlist.ts", import.meta.url),
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
  const marketSession = await readFile(
    new URL("../lib/market/session.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    workspace,
    /latest\.priceAdjustment === currentSeries\.priceAdjustment/,
  );
  assert.match(
    workspace,
    /latest\.priceAdjustment === history\.priceAdjustment/,
  );
  assert.match(workspace, /copy\.intervals\[saved\.interval\]/);
  assert.match(workspace, /saved\.interval !== DAILY_INTERVAL/);
  assert.doesNotMatch(workspace, /copy\.intervals\[DAILY_INTERVAL\]/);
  assert.doesNotMatch(workspace, /setInterval\(saved\.interval\)/);
  assert.match(workspace, /runScreeningWithValidation/);
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
    locale,
    /sample: "\u5468\u671f\u7b5b\u9009"/,
  );
  assert.match(locale, /range: "\u533a\u95f4\u7b5b\u9009"/);
  assert.match(locale, /rolling: "\u6eda\u52a8\u7b5b\u9009"/);
  assert.match(
    workspace,
    /name="strategy-sample-period-sessions"/,
  );
  assert.doesNotMatch(
    workspace,
    /strategy-sample-period-\$\{index\}-weight/,
  );
  assert.match(
    workspace,
    /resolveTrailingTradingSessionRange\(\s*payload\.bars,\s*sharedRangeSessionsRef\.current/,
  );
  assert.match(workspace, /const updateSharedRangeFromDates/);
  assert.match(workspace, /const updateSharedRangeFromSessions/);
  assert.match(workspace, /const savedBacktestRangeMetrics = useMemo/);
  assert.match(workspace, /runStrategyPlanRangeBacktest/);
  assert.match(workspace, /copy\.savedBacktests\.returnRange/);
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
    /SCREENING_ENTRY_FILTER_FINALISTS_PER_STRATEGY = 30/,
  );
  assert.match(
    combinations,
    /COMBINATION_FINALISTS_PER_STRATEGY = 1/,
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
    2,
  );
  assert.doesNotMatch(workspace, /entry-filter-inputs fixed/);
  assert.match(styles, /\.entry-filter-inputs\.screening-fixed/);
  assert.match(workspace, /function resultCautionReasons/);
  assert.match(workspace, /title=\{resultStatusTitle\(result\)\}/);
  assert.match(locale, /statusRule:/);
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
    workspace,
    /setScreenProgress\(emptyCombinationProgress\(\)\);\s+await yieldForScreening\(\);/,
  );
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
    2,
  );
  assert.match(workspace, /namePrefix="strategy-entry-filter"/);
  assert.match(workspace, /namePrefix="screening-entry-filter"/);
  assert.match(workspace, /entryFilter: strategyPlan\.entryFilter/);
  assert.match(
    workspace,
    /entryFilter: activeMovingAverageSlopeFilter\(\s*screeningEntryFilterDraft/,
  );
  assert.match(
    combinations,
    /entryFilter: cloneMovingAverageSlopeFilter/,
  );
  assert.match(styles, /\.entry-filter-fields\s*\{/);
  assert.match(strategies, /equivalenceGroup: "macd-cross"/);
  assert.match(strategies, /equivalenceGroup: "supertrend-close"/);
  assert.match(combinations, /areStrategiesEquivalent/);
  assert.match(workspace, /pendingNextOpenAction/);
  assert.match(locale, /pendingGapOverride:/);
  assert.match(viteConfig, /ignored: \["\*\*\/\.wrangler\/\*\*"\]/);
  const saveCurrentBacktestSource = workspace.match(
    /const saveCurrentBacktest = async \(\) => \{[\s\S]*?\n  \};/,
  )?.[0];
  assert.ok(saveCurrentBacktestSource);
  assert.doesNotMatch(saveCurrentBacktestSource, /resetScreening/);
  assert.match(saveCurrentBacktestSource, /appliedStrategyPlan/);
  assert.match(saveCurrentBacktestSource, /appliedBacktest/);
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
  assert.doesNotMatch(openSavedBacktestSource, /resetScreening/);
  assert.match(
    openSavedBacktestSource,
    /canReuseSavedBacktestMarketSeries/,
  );
  assert.doesNotMatch(
    openSavedBacktestSource,
    /setStartDate\(saved\.startDate\)|setEndDate\(saved\.endDate\)/,
  );
  assert.doesNotMatch(workspace, /getStrategiesByHorizon/);
  assert.match(combinations, /resolveRelativeLongStrategy/);
  assert.match(combinations, /strategyBIndex = strategyAIndex \+ 1/);
  assert.match(workspace, /applyCombinationResult/);
  assert.equal(
    workspace.match(/className="clickable-result-row"/g)?.length,
    2,
  );
  assert.match(workspace, /onClick=\{\(\) => applyCombinationResult\(result\)\}/);
  assert.match(
    workspace,
    /onClick=\{\(\) =>\s*applySingleStrategy\(/,
  );
  assert.doesNotMatch(workspace, /className="apply-button"/);
  assert.doesNotMatch(workspace, /bestCombination|combination-preview/);
  assert.doesNotMatch(locale, /内置 ·/);
  assert.match(workspace, /copy\.combinationScreening\.strategyA/);
  assert.match(workspace, /copy\.combinationScreening\.strategyB/);
  assert.equal(workspace.match(/className="strategy-name-line"/g)?.length, 3);
  assert.doesNotMatch(workspace, /className="strategy-pair-cell"/);
  assert.match(workspace, /className="screening-action-field"/);
  assert.match(styles, /\.screening-panel\s*\{\s*display: flex;/);
  assert.match(workspace, /className="strategy-shortlist"/);
  assert.match(workspace, /applyShortlistEntry\(entry\)/);
  const shortlistMarkup = workspace.slice(
    workspace.indexOf('className="strategy-shortlist"'),
    workspace.indexOf('className="screening-results-grid"'),
  );
  assert.doesNotMatch(shortlistMarkup, /\btitle=/);
  assert.doesNotMatch(workspace, /copy\.shortlist\.reviewDescriptions/);
  assert.ok(
    workspace.indexOf('className="strategy-shortlist"') <
      workspace.indexOf('className="screening-results-grid"'),
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
  assert.match(locale, /同类备选/);
  assert.match(styles, /\.results-table-wrap\s*\{[\s\S]*?overflow-x: hidden;/);
  assert.match(styles, /\.results-table\s*\{[\s\S]*?table-layout: fixed;/);
  assert.match(
    styles,
    /\.combination-table th:nth-child\(4\),[\s\S]*?text-align: center;/,
  );
  assert.match(workspace, /buildStrategyPlanTimeline/);
  assert.match(workspace, /buildAllocationTradeMarkers/);
  assert.doesNotMatch(workspace, /combination-allocation-ladder/);
  assert.match(workspace, /setScreenResults\(outcome\.singleResults\)/);
  assert.match(workspace, /setScreenResultsObjective\(runObjective\)/);
  assert.equal(workspace.match(/resetScreening\(\);/g)?.length, 1);
  assert.match(workspace, /copy\.screening\.resultSnapshotNotice/);
  assert.match(workspace, /copy\.screening\.sampleResultMetricNotice/);
  assert.match(workspace, /validationReport\.performance/);
  assert.match(locale, /筛选结果保留为上次运行快照/);
  assert.match(
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
  assert.match(workspace, /appliedStrategySummary/);
  assert.match(workspace, /className="lab-heading-actions"/);
  assert.match(workspace, /className="strategy-selector-card"/);
  assert.match(workspace, /<select\s+name="strategy-a-allocation"/);
  assert.match(workspace, /<select\s+name="strategy-b-allocation"/);
  assert.match(workspace, /STRATEGIES\.map/);
  assert.match(workspace, /relativeLongStrategy/);
  assert.match(workspace, /className="saved-shortcuts-save"/);
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
  assert.match(workspace, /indicatorConfigurationsEqual/);
  assert.match(workspace, /onClick=\{\(\) => toggleIndicator\(item\.id\)\}/);
  assert.match(workspace, /setVisibleIndicatorIds\(saved\.indicators\.map/);
  assert.match(workspace, /visibleIndicators,\s*\n\s*\),/);
  assert.match(workspace, /window\.localStorage\.setItem/);
  assert.match(indicatorRegistry, /quantscope\.indicator-preferences\.v1/);
  assert.match(schema, /indicatorConfigurationsJson/);
  assert.match(savedBacktestRoute, /indicatorConfigurationsJson/);
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
    /savedBacktestGroups\.map\(\(group\) =>/,
  );
  assert.match(workspace, /className="saved-shortcut-group-toggle"/);
  assert.match(workspace, /aria-expanded=\{expanded\}/);
  assert.match(workspace, /draggable=\{!savedBacktestOrderSaving\}/);
  assert.match(workspace, /className="saved-shortcut-group-records"/);
  assert.match(workspace, /persistSavedBacktestOrder/);
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
  assert.match(
    workspace,
    /const HISTORICAL_EXECUTION_POLICY = "hybrid" as const/,
  );
  assert.match(workspace, /todayEntryPrice/);
  assert.match(workspace, /todayExitPrice/);
  assert.doesNotMatch(workspace, /classifyManualExecutionWindow/);
  assert.match(workspace, /seriesLimit = DAILY_HISTORY_LIMIT/);
  assert.match(workspace, /readCachedMarketSeriesEntry/);
  assert.match(workspace, /writeCachedMarketSeries/);
  assert.match(workspace, /isMarketSeries\(seriesState\)/);
  assert.match(clientCache, /export async function readCachedMarketSeries\(/);
  assert.match(clientCache, /return cached\?\.series \?\? null/);
  assert.match(workspace, /series\.latestBarStatus/);
  assert.match(clientCache, /MAX_CACHE_ENTRIES = 32/);
  assert.doesNotMatch(clientCache, /MAX_CACHE_AGE_MS/);
  assert.doesNotMatch(clientCache, /Date\.now\(\) - record\.cachedAt/);
  assert.match(marketSession, /JPX: \{ timeZone: "Asia\/Tokyo", closeMinute: 15 \* 60 \+ 30 \}/);
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
  assert.match(locale, /closePosition:\s*"清仓"/);
});
