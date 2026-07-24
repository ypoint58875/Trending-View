# Clear Trade Marker Colors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give actual buy and sell markers a dedicated high-contrast blue/orange palette that remains clear on the dark price chart.

**Architecture:** Extract the existing trade-marker ECharts series construction into an exported pure helper in `PriceChart.tsx`. Test the effective series styles directly, then let the React component append the helper output without changing trade data or chart behavior.

**Tech Stack:** TypeScript 5.9, React 19, ECharts 6, Node test runner, vinext.

## Global Constraints

- Buy fill is `#38bdf8`; buy border and label are `#e0f2fe`.
- Sell fill is `#fb923c`; sell border and label are `#ffedd5`.
- Both labels use `rgba(7, 15, 22, 0.82)` backgrounds.
- Buy remains an upward triangle; sell remains a 180-degree downward triangle.
- Range-end valuation exits remain gray `#94a3b8`.
- Do not change trade data, timestamps, prices, execution, candlestick colors,
  volume colors, live-guidance colors, or Chinese UI copy.
- Keep source, tests, and internal documentation in English.
- Run focused tests, `npm test`, `npm run lint`, and a local dark-chart visual
  inspection before completion.

---

### Task 1: Add tested dedicated trade-marker styles

**Files:**

- Modify: `tests/chart-config.test.ts`
- Modify: `app/components/PriceChart.tsx`
- Modify: `docs/FEATURE_MAP.md`
- Modify: `docs/CODEX_STATE.md`

**Interfaces:**

- Consumes: `BacktestTrade[]`, `buildTradeMarkers`, and labels `{ buy, sell,
  rangeExit }`.
- Produces: `buildTradeMarkerSeries(trades, labels): SeriesOption[]`, consumed
  by `PriceChart` and chart-configuration tests.

- [ ] **Step 1: Write the failing marker-style test**

Replace the `PriceChart` import in `tests/chart-config.test.ts`:

```ts
import * as priceChartModule from "../app/components/PriceChart";

const { buildPriceDataZoom } = priceChartModule;
```

Add:

```ts
type MarkerSeries = {
  symbol?: string;
  symbolRotate?: number;
  itemStyle?: {
    color?: string;
    borderColor?: string;
    borderWidth?: number;
  };
  label?: {
    color?: string;
    backgroundColor?: string;
  };
};

test("uses dedicated high-contrast colors for trade markers", () => {
  const buildTradeMarkerSeries = (
    priceChartModule as unknown as {
      buildTradeMarkerSeries?: (
        trades: [],
        labels: { buy: string; sell: string; rangeExit: string },
      ) => unknown[];
    }
  ).buildTradeMarkerSeries;
  assert.equal(typeof buildTradeMarkerSeries, "function");

  const [buy, sell, rangeExit] = buildTradeMarkerSeries!([], {
    buy: "Buy",
    sell: "Sell",
    rangeExit: "Range exit",
  }) as unknown as MarkerSeries[];

  assert.equal(buy.symbol, "triangle");
  assert.equal(buy.symbolRotate, undefined);
  assert.equal(buy.itemStyle?.color, "#38bdf8");
  assert.equal(buy.itemStyle?.borderColor, "#e0f2fe");
  assert.equal(buy.itemStyle?.borderWidth, 1.5);
  assert.equal(buy.label?.color, "#e0f2fe");
  assert.equal(buy.label?.backgroundColor, "rgba(7, 15, 22, 0.82)");

  assert.equal(sell.symbol, "triangle");
  assert.equal(sell.symbolRotate, 180);
  assert.equal(sell.itemStyle?.color, "#fb923c");
  assert.equal(sell.itemStyle?.borderColor, "#ffedd5");
  assert.equal(sell.itemStyle?.borderWidth, 1.5);
  assert.equal(sell.label?.color, "#ffedd5");
  assert.equal(sell.label?.backgroundColor, "rgba(7, 15, 22, 0.82)");

  assert.equal(rangeExit.itemStyle?.color, "#94a3b8");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npx tsx --test tests/chart-config.test.ts
```

Expected: FAIL with `actual: "undefined", expected: "function"` because
`buildTradeMarkerSeries` is not exported yet.

- [ ] **Step 3: Add the dedicated palette and pure series helper**

Extend `colors` in `app/components/PriceChart.tsx`:

```ts
const colors = {
  up: "#22c55e",
  down: "#ef5350",
  line: "#dfe8e4",
  cyan: "#22d3ee",
  amber: "#fbbf24",
  violet: "#a78bfa",
  muted: "#64748b",
  tradeBuy: "#38bdf8",
  tradeBuyText: "#e0f2fe",
  tradeSell: "#fb923c",
  tradeSellText: "#ffedd5",
  tradeLabelBackground: "rgba(7, 15, 22, 0.82)",
  rangeExit: "#94a3b8",
};
```

Add this interface and helper after `compactFormatter`:

```ts
interface TradeMarkerLabels {
  buy: string;
  sell: string;
  rangeExit: string;
}

export function buildTradeMarkerSeries(
  trades: BacktestTrade[],
  labels: TradeMarkerLabels,
): SeriesOption[] {
  const tradeMarkers = buildTradeMarkers(trades);

  return [
    {
      name: labels.buy,
      type: "scatter",
      data: tradeMarkers.buys.map((marker) => ({
        value: [marker.time, marker.price],
      })),
      symbol: "triangle",
      symbolSize: 14,
      symbolOffset: [0, 8],
      itemStyle: {
        color: colors.tradeBuy,
        borderColor: colors.tradeBuyText,
        borderWidth: 1.5,
      },
      label: {
        show: true,
        formatter: labels.buy,
        position: "bottom",
        distance: 3,
        color: colors.tradeBuyText,
        backgroundColor: colors.tradeLabelBackground,
        borderRadius: 3,
        padding: [2, 4],
        fontSize: 9,
        fontWeight: 700,
      },
      z: 20,
    },
    {
      name: labels.sell,
      type: "scatter",
      data: tradeMarkers.sells.map((marker) => ({
        value: [marker.time, marker.price],
      })),
      symbol: "triangle",
      symbolRotate: 180,
      symbolSize: 14,
      symbolOffset: [0, -8],
      itemStyle: {
        color: colors.tradeSell,
        borderColor: colors.tradeSellText,
        borderWidth: 1.5,
      },
      label: {
        show: true,
        formatter: labels.sell,
        position: "top",
        distance: 3,
        color: colors.tradeSellText,
        backgroundColor: colors.tradeLabelBackground,
        borderRadius: 3,
        padding: [2, 4],
        fontSize: 9,
        fontWeight: 700,
      },
      z: 20,
    },
    {
      name: labels.rangeExit,
      type: "scatter",
      data: tradeMarkers.rangeExits.map((marker) => ({
        value: [marker.time, marker.price],
      })),
      symbol: "diamond",
      symbolSize: 10,
      symbolOffset: [0, -7],
      itemStyle: {
        color: colors.rangeExit,
        borderColor: "#e2e8f0",
        borderWidth: 1,
      },
      label: {
        show: true,
        formatter: labels.rangeExit,
        position: "top",
        distance: 3,
        color: colors.rangeExit,
        fontSize: 8,
        fontWeight: 650,
      },
      z: 19,
    },
  ];
}
```

Replace the existing inline `const tradeMarkers` and three-series
`series.push(...)` block with:

```ts
series.push(...buildTradeMarkerSeries(trades, labels));
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
npx tsx --test tests/chart-config.test.ts
```

Expected: four passing chart-configuration tests and zero failures.

- [ ] **Step 5: Update feature linkage**

In `docs/FEATURE_MAP.md`, update the chart feature row so its UI cell includes
`dedicated blue/orange trade-marker palette` and its Tests cell includes
`trade-marker palette`.

In `docs/CODEX_STATE.md`, add under `Implemented:`:

```markdown
- Dedicated sky-blue buy and orange sell markers with light borders and dark
  label backgrounds, visually separated from green-up/red-down candles.
```

Do not add a verification claim yet.

- [ ] **Step 6: Run full automated verification**

Run:

```powershell
npm test
npm run lint
```

Expected: all TypeScript tests, production build, rendered-worker test, and
ESLint pass with exit code `0`.

- [ ] **Step 7: Inspect the real dark chart**

Start the local application through `scripts/start-local.ps1`, open
`http://127.0.0.1:3000`, wait for the default backtest markers, and capture the
price chart. Confirm that:

- Buy triangles and labels are visibly sky blue.
- Sell triangles and labels are visibly orange.
- Both labels remain legible over chart content.
- Candlesticks remain green/red and range exits remain gray.

- [ ] **Step 8: Record verified state**

Only after Steps 6 and 7 pass, add under `## Verification status` in
`docs/CODEX_STATE.md`:

```markdown
- Dedicated blue/orange trade-marker palette test, full test/build suite,
  ESLint, and dark-chart browser inspection: passed on 2026-07-24.
```

- [ ] **Step 9: Review and commit**

Run:

```powershell
git diff --check
git diff -- app/components/PriceChart.tsx tests/chart-config.test.ts docs/FEATURE_MAP.md docs/CODEX_STATE.md
git add app/components/PriceChart.tsx tests/chart-config.test.ts docs/FEATURE_MAP.md docs/CODEX_STATE.md
git commit -m "Clarify buy and sell marker colors"
```

Expected: one commit containing only the four planned files.
