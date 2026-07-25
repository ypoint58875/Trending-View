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
  assert.match(html, /\u4e00\u952e\u5355\u4e00\u7b56\u7565/);
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

  const macdButton = html.match(/<button\b[^>]*>MACD<\/button>/)?.[0];
  assert.ok(macdButton, "default MACD indicator button should render");
  assert.doesNotMatch(macdButton, /role="tab"/);
  assert.match(macdButton, /class="focused visible"/);
  assert.match(macdButton, /aria-pressed="true"/);
  assert.match(macdButton, /aria-current="true"/);
  assert.match(
    macdButton,
    /aria-label="\u6307\u6570\u5e73\u6ed1\u5f02\u540c\u79fb\u52a8\u5e73\u5747\u7ebf \u00b7 \u5df2\u663e\u793a"/,
  );

  const visibilityButton = html.match(
    /<button\b[^>]*class="indicator-visibility-button visible"[^>]*>[\s\S]*?<\/button>/,
  )?.[0];
  assert.ok(visibilityButton, "focused indicator visibility button should render");
  assert.match(visibilityButton, /aria-pressed="true"/);
  assert.match(
    visibilityButton,
    /aria-label="\u9690\u85cf\u6307\u6807 \u6307\u6570\u5e73\u6ed1\u5f02\u540c\u79fb\u52a8\u5e73\u5747\u7ebf"/,
  );
  assert.ok(
    visibilityButton.endsWith("\u9690\u85cf\u6307\u6807</button>"),
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
    /\u904d\u5386\u5168\u90e8 32 \u7c7b\u7b56\u7565\u7684\u53c2\u6570\u7f51\u683c/,
  );
  assert.match(html, /value="2500"/);
  assert.match(html, /\u4f18\u5316\u76ee\u6807/);
  assert.match(html, /\u6536\u76ca\u56de\u64a4\u7ec4\u5408/);
  assert.match(html, /\u6700\u5927\u6536\u76ca/);
  assert.match(html, /\u6700\u5c0f\u56de\u64a4/);
  assert.match(html, /\u6700\u5927\u590f\u666e/);
  assert.match(html, /name="long-strategy"/);
  assert.match(html, /name="short-strategy"/);
  assert.match(html, /\u957f\u5468\u671f\u7b56\u7565/);
  assert.match(html, /\u77ed\u5468\u671f\u7b56\u7565/);
  assert.match(html, />\u4e0d\u4f7f\u7528\u957f\u5468\u671f\u7b56\u7565</);
  assert.match(html, />\u4e0d\u4f7f\u7528\u77ed\u5468\u671f\u7b56\u7565</);
  assert.match(html, /\u4e00\u952e\u7ec4\u5408\u7b56\u7565/);
  assert.match(html, /\u957f\u5468\u671f\u4e70\u70b9\u5efa\u7acb A%/);
  assert.match(html, /\u77ed\u5468\u671f\u4e70\u70b9\u589e\u52a0 B%/);
  assert.match(html, /\u957f\u5468\u671f\u4ed3\u4f4d A/);
  assert.match(html, /\u77ed\u5468\u671f\u52a0\u4ed3 B/);
  assert.match(html, /name="long-allocation"/);
  assert.match(html, /name="short-allocation"/);
  assert.match(html, /value="60"/);
  assert.match(html, /value="40"/);
  assert.match(html, /name="combination-screening-objective"/);
  assert.match(html, /name="combination-max-parameter-sets"/);
  assert.doesNotMatch(html, /\u673a\u52a8\u4ed3/);
  assert.match(html, />\u5e94\u7528</);
  assert.match(html, /\u9ec4\u91d1/);
  assert.match(html, /\u767d\u94f6/);
  assert.match(html, /\u5927\u5b97\u5546\u54c1/);
  assert.ok(
    html.indexOf("\u4e00\u952e\u5355\u4e00\u7b56\u7565") <
      html.indexOf("\u4e00\u952e\u7ec4\u5408\u7b56\u7565"),
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
  assert.match(workspace, /optimizeStrategyCombinations/);
  assert.match(workspace, /getStrategiesByHorizon\("long"\)/);
  assert.match(workspace, /getStrategiesByHorizon\("short"\)/);
  assert.match(workspace, /applyCombinationResult/);
  assert.match(workspace, /buildStrategyPlanAllocationTarget|buildStrategyPlanTarget/);
  assert.match(workspace, /buildAllocationTradeMarkers/);
  assert.match(workspace, /combinationScreeningObjective/);
  assert.match(workspace, /combinationMaxParameterSets/);
  assert.match(workspace, /className="saved-shortcuts-save"/);
  assert.match(workspace, /HISTORICAL_EXECUTION_POLICY/);

  assert.match(locale, /insufficientEvidence:\s*"证据不足"/);
  assert.match(locale, /invalidParameters:\s*"当前策略参数无效/);
  assert.match(locale, /insufficientObservations:\s*"当前回测区间/);
  assert.match(locale, /insufficientTrades:\s*"当前规则完成的交易/);
  assert.match(locale, /noNearbyVariants:\s*"没有可用的邻近参数组合/);
  assert.match(locale, /legacyIntervalPrefix:\s*"此保存结果使用旧版"/);
  assert.match(locale, /legacyIntervalSuffix:\s*"周期；打开后会在日线数据上重新计算所选设置。"/);
  assert.match(locale, /gold:\s*"黄金"/);
  assert.match(locale, /silver:\s*"白银"/);
});
