# Independent Indicator and Strategy Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the selected strategy and technical indicator independent, render both strategy trade markers and the selected indicator together, and expose configurable inputs for every parameterized indicator.

**Architecture:** Add a pure indicator metadata registry under `lib/analysis/`, keep localized labels in the locale file, and pass the active indicator's parameter object explicitly from `MarketWorkspace` to `PriceChart`. Strategy selection updates only strategy state; indicator selection and reset update only the per-indicator settings map.

**Tech Stack:** TypeScript 5.9, React 19, vinext, Apache ECharts 6, Node test runner, ESLint.

## Global Constraints

- Keep source code, tests, logs, and internal documentation in English.
- Keep Chinese user-facing copy in `app/i18n/zh-CN.ts`.
- One strategy and one technical indicator are active at a time.
- Strategy changes must not change indicator ID or indicator parameters.
- Indicator changes must not change strategy ID, strategy parameters, backtest, or live guidance.
- Strategy trade markers and the selected indicator must render together.
- Indicator settings remain browser-session UI state and are not added to D1 saved-backtest records.
- Preserve aligned `null` warm-up values and never use future bars.
- Do not change strategy execution timing, screening, data providers, or the saved-backtest schema.
- Run `npm test` before handoff.

---

### Task 1: Add the indicator registry

**Files:**
- Create: `lib/analysis/indicator-registry.ts`
- Create: `tests/indicator-registry.test.ts`
- Modify: `docs/MODULE_PATTERNS.md`

**Interfaces:**
- Produces: `IndicatorId`, `IndicatorParameters`, `IndicatorParameterDefinition`, `IndicatorDefinition`, `INDICATORS`, `getIndicator(id)`, `getDefaultIndicatorParameters(id)`, and `createDefaultIndicatorSettings()`.
- Consumes: no UI copy, ECharts types, or strategy state.

- [ ] **Step 1: Write the failing registry test**

Create `tests/indicator-registry.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  INDICATORS,
  createDefaultIndicatorSettings,
  getDefaultIndicatorParameters,
  getIndicator,
} from "../lib/analysis/indicator-registry";

const expectedIds = [
  "sma",
  "ema",
  "wma",
  "dema",
  "bollinger",
  "vwap",
  "supertrend",
  "ichimoku",
  "rsi",
  "macd",
  "kdj",
  "stochasticRsi",
  "cci",
  "williamsR",
  "adx",
  "roc",
  "mfi",
  "cmf",
  "atr",
  "obv",
];

test("registers all configurable chart indicators once", () => {
  assert.deepEqual(
    INDICATORS.map((indicator) => indicator.id),
    expectedIds,
  );
  assert.equal(new Set(expectedIds).size, 20);

  for (const indicator of INDICATORS) {
    const keys = indicator.parameters.map((parameter) => parameter.key);
    assert.equal(new Set(keys).size, keys.length);
    for (const parameter of indicator.parameters) {
      assert.ok(Number.isFinite(parameter.defaultValue));
      assert.ok(Number.isFinite(parameter.minimum));
      assert.ok(parameter.step > 0);
      assert.ok(parameter.defaultValue >= parameter.minimum);
    }
  }
});

test("creates independent defaults for every indicator", () => {
  assert.deepEqual(getDefaultIndicatorParameters("sma"), {
    fast: 10,
    slow: 30,
  });
  assert.deepEqual(getDefaultIndicatorParameters("stochasticRsi"), {
    rsiPeriod: 14,
    stochasticPeriod: 14,
    smoothPeriod: 3,
  });
  assert.equal(getIndicator("sma").placement, "overlay");
  assert.equal(getIndicator("macd").placement, "pane");

  const first = createDefaultIndicatorSettings();
  const second = createDefaultIndicatorSettings();
  first.sma.fast = 5;
  assert.equal(second.sma.fast, 10);
});
```

- [ ] **Step 2: Run the test and verify the red state**

Run:

```bash
npx tsx --test tests/indicator-registry.test.ts
```

Expected: fail because `lib/analysis/indicator-registry.ts` does not exist.

- [ ] **Step 3: Implement the registry**

Create `lib/analysis/indicator-registry.ts` with these public types:

```ts
export type IndicatorId =
  | "sma"
  | "ema"
  | "wma"
  | "dema"
  | "bollinger"
  | "vwap"
  | "supertrend"
  | "ichimoku"
  | "rsi"
  | "macd"
  | "kdj"
  | "stochasticRsi"
  | "cci"
  | "williamsR"
  | "adx"
  | "roc"
  | "mfi"
  | "cmf"
  | "atr"
  | "obv";

export interface IndicatorParameters {
  [key: string]: number;
}

export interface IndicatorParameterDefinition {
  key: string;
  defaultValue: number;
  minimum: number;
  step: number;
}

export interface IndicatorDefinition {
  id: IndicatorId;
  placement: "overlay" | "pane";
  parameters: readonly IndicatorParameterDefinition[];
}
```

Declare the ordered registry with the exact defaults from the design:

```ts
function parameter(
  key: string,
  defaultValue: number,
  minimum: number,
  step: number,
): IndicatorParameterDefinition {
  return { key, defaultValue, minimum, step };
}

function period(
  key: string,
  defaultValue: number,
): IndicatorParameterDefinition {
  return parameter(key, defaultValue, 1, 1);
}

function decimal(
  key: string,
  defaultValue: number,
  minimum: number,
  step: number,
): IndicatorParameterDefinition {
  return parameter(key, defaultValue, minimum, step);
}

function definition(
  id: IndicatorId,
  placement: IndicatorDefinition["placement"],
  ...parameters: IndicatorParameterDefinition[]
): IndicatorDefinition {
  return { id, placement, parameters };
}

export const INDICATORS: readonly IndicatorDefinition[] = [
  definition("sma", "overlay", period("fast", 10), period("slow", 30)),
  definition("ema", "overlay", period("fast", 12), period("slow", 26)),
  definition("wma", "overlay", period("fast", 20), period("slow", 50)),
  definition("dema", "overlay", period("fast", 20), period("slow", 50)),
  definition(
    "bollinger",
    "overlay",
    period("period", 20),
    decimal("width", 2, 0.1, 0.1),
  ),
  definition("vwap", "overlay"),
  definition(
    "supertrend",
    "overlay",
    period("period", 10),
    decimal("multiplier", 3, 0.1, 0.1),
  ),
  definition(
    "ichimoku",
    "overlay",
    period("conversionPeriod", 9),
    period("basePeriod", 26),
    period("spanPeriod", 52),
  ),
  definition("rsi", "pane", period("period", 14)),
  definition(
    "macd",
    "pane",
    period("fast", 12),
    period("slow", 26),
    period("signal", 9),
  ),
  definition("kdj", "pane", period("period", 9)),
  definition(
    "stochasticRsi",
    "pane",
    period("rsiPeriod", 14),
    period("stochasticPeriod", 14),
    period("smoothPeriod", 3),
  ),
  definition("cci", "pane", period("period", 20)),
  definition("williamsR", "pane", period("period", 14)),
  definition("adx", "pane", period("period", 14)),
  definition("roc", "pane", period("period", 12)),
  definition("mfi", "pane", period("period", 14)),
  definition("cmf", "pane", period("period", 20)),
  definition("atr", "pane", period("period", 14)),
  definition("obv", "pane"),
];
```

Implement lookups and fresh default objects:

```ts
export function getIndicator(id: IndicatorId): IndicatorDefinition {
  const indicator = INDICATORS.find((candidate) => candidate.id === id);
  if (!indicator) throw new Error(`Unknown indicator: ${id}`);
  return indicator;
}

export function getDefaultIndicatorParameters(
  id: IndicatorId,
): IndicatorParameters {
  return Object.fromEntries(
    getIndicator(id).parameters.map((parameter) => [
      parameter.key,
      parameter.defaultValue,
    ]),
  );
}

export function createDefaultIndicatorSettings(): Record<
  IndicatorId,
  IndicatorParameters
> {
  return Object.fromEntries(
    INDICATORS.map((indicator) => [
      indicator.id,
      getDefaultIndicatorParameters(indicator.id),
    ]),
  ) as Record<IndicatorId, IndicatorParameters>;
}
```

- [ ] **Step 4: Document the registry pattern**

Add to `docs/MODULE_PATTERNS.md` under `## Indicator`:

```md
Display metadata belongs in the shared indicator registry. The registry owns
stable IDs, main-chart versus lower-pane placement, defaults, minimums, and
input steps. It contains no localized text and no chart styling. UI controls
and chart calculations consume the same registry entry so a displayed setting
cannot drift from the formula input.
```

- [ ] **Step 5: Run the registry test**

Run:

```bash
npx tsx --test tests/indicator-registry.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/analysis/indicator-registry.ts tests/indicator-registry.test.ts docs/MODULE_PATTERNS.md
git commit -m "Add configurable indicator registry"
```

---

### Task 2: Parameterize indicator chart series

**Files:**
- Modify: `app/components/PriceChart.tsx`
- Modify: `tests/chart-config.test.ts`

**Interfaces:**
- Consumes: `IndicatorId`, `IndicatorParameters`, `getDefaultIndicatorParameters()`, and `getIndicator()` from Task 1.
- Produces: `buildIndicatorSeries(bars, indicator, parameters, labels): SeriesOption[]`.

- [ ] **Step 1: Write failing custom-parameter tests**

Extend `tests/chart-config.test.ts`:

```ts
import {
  buildIndicatorSeries,
  buildPriceDataZoom,
  buildTradeMarkerSeries,
} from "../app/components/PriceChart";

const indicatorLabels = {
  smaFast: "SMA fast",
  smaSlow: "SMA slow",
  rsi: "RSI",
};

const bars = [1, 2, 3, 4].map((close, index) => ({
  time: `2026-01-0${index + 1}`,
  open: close,
  high: close + 0.5,
  low: close - 0.5,
  close,
  volume: 100,
}));

test("builds SMA lines from display parameters", () => {
  const [fast, slow] = buildIndicatorSeries(
    bars,
    "sma",
    { fast: 2, slow: 3 },
    indicatorLabels,
  ) as Array<{ data?: Array<number | null> }>;

  assert.deepEqual(fast.data, [null, 1.5, 2.5, 3.5]);
  assert.deepEqual(slow.data, [null, null, 2, 3]);
});

test("passes custom periods to lower-pane indicators", () => {
  const [strength] = buildIndicatorSeries(
    bars,
    "rsi",
    { period: 2 },
    indicatorLabels,
  ) as Array<{
    data?: Array<number | null>;
    xAxisIndex?: number;
    yAxisIndex?: number;
  }>;

  assert.equal(strength.xAxisIndex, 2);
  assert.equal(strength.yAxisIndex, 2);
  assert.equal(strength.data?.[2], 100);
});
```

- [ ] **Step 2: Run the chart test and verify failure**

Run:

```bash
npx tsx --test tests/chart-config.test.ts
```

Expected: fail because `buildIndicatorSeries` is not exported.

- [ ] **Step 3: Move the indicator type and add parameters**

In `app/components/PriceChart.tsx`:

```ts
import {
  getDefaultIndicatorParameters,
  getIndicator,
  type IndicatorId,
  type IndicatorParameters,
} from "@/lib/analysis/indicator-registry";

interface PriceChartProps {
  bars: MarketBar[];
  trades: BacktestTrade[];
  dataKey: string;
  chartType: "candlestick" | "line";
  indicator: IndicatorId;
  indicatorParameters: IndicatorParameters;
  ariaLabel: string;
  labels: {
    price: string;
    close: string;
    volume: string;
    buy: string;
    sell: string;
    rangeExit: string;
    series: Record<string, string>;
  };
}
```

Remove the component-local `IndicatorId` union.

- [ ] **Step 4: Extract parameterized series construction**

Add:

```ts
export function buildIndicatorSeries(
  bars: MarketBar[],
  indicator: IndicatorId,
  inputParameters: IndicatorParameters,
  labels: Record<string, string>,
): SeriesOption[] {
  const parameters = {
    ...getDefaultIndicatorParameters(indicator),
    ...inputParameters,
  };
  const closes = bars.map((bar) => bar.close);

  if (indicator === "sma") {
    return [
      lineSeries(labels.smaFast, sma(closes, parameters.fast), colors.cyan),
      lineSeries(labels.smaSlow, sma(closes, parameters.slow), colors.amber),
    ];
  }
  if (indicator === "rsi") {
    return [
      lineSeries(
        labels.rsi,
        rsi(closes, parameters.period),
        colors.violet,
        2,
        2,
      ),
    ];
  }
  if (indicator === "ema") {
    return [
      lineSeries(labels.emaFast, ema(closes, parameters.fast), colors.cyan),
      lineSeries(labels.emaSlow, ema(closes, parameters.slow), colors.violet),
    ];
  }
  if (indicator === "wma") {
    return [
      lineSeries(labels.wmaFast, wma(closes, parameters.fast), colors.cyan),
      lineSeries(labels.wmaSlow, wma(closes, parameters.slow), colors.amber),
    ];
  }
  if (indicator === "dema") {
    return [
      lineSeries(labels.demaFast, dema(closes, parameters.fast), colors.cyan),
      lineSeries(labels.demaSlow, dema(closes, parameters.slow), colors.violet),
    ];
  }
  if (indicator === "bollinger") {
    const bands = bollingerBands(
      closes,
      parameters.period,
      parameters.width,
    );
    return [
      lineSeries(labels.bollMiddle, bands.middle, colors.amber),
      lineSeries(labels.bollUpper, bands.upper, colors.cyan),
      lineSeries(labels.bollLower, bands.lower, colors.cyan),
    ];
  }
  if (indicator === "vwap") {
    return [lineSeries(labels.vwap, vwap(bars), colors.amber)];
  }
  if (indicator === "supertrend") {
    const values = supertrend(
      bars,
      parameters.period,
      parameters.multiplier,
    );
    return [
      lineSeries(labels.supertrend, values.trend, colors.up),
    ];
  }
  if (indicator === "ichimoku") {
    const values = ichimoku(
      bars,
      parameters.conversionPeriod,
      parameters.basePeriod,
      parameters.spanPeriod,
    );
    return [
      lineSeries(labels.ichimokuConversion, values.conversion, colors.cyan),
      lineSeries(labels.ichimokuBase, values.base, colors.amber),
      lineSeries(labels.ichimokuSpanA, values.spanA, colors.up),
      lineSeries(labels.ichimokuSpanB, values.spanB, colors.down),
    ];
  }
  if (indicator === "macd") {
    const values = macd(
      closes,
      parameters.fast,
      parameters.slow,
      parameters.signal,
    );
    return [
      lineSeries(labels.macdLine, values.line, colors.cyan, 2, 2),
      lineSeries(labels.macdSignal, values.signal, colors.amber, 2, 2),
      {
        name: labels.macdHistogram,
        type: "bar",
        data: values.histogram.map((value) => ({
          value,
          itemStyle: {
            color:
              (value ?? 0) >= 0
                ? "rgba(34,197,94,.62)"
                : "rgba(239,83,80,.62)",
          },
        })),
        xAxisIndex: 2,
        yAxisIndex: 2,
        barMaxWidth: 5,
      },
    ];
  }
  if (indicator === "kdj") {
    const values = kdj(bars, parameters.period);
    return [
      lineSeries(labels.kdjK, values.k, colors.cyan, 2, 2),
      lineSeries(labels.kdjD, values.d, colors.amber, 2, 2),
      lineSeries(labels.kdjJ, values.j, colors.violet, 2, 2),
    ];
  }
  if (indicator === "stochasticRsi") {
    const values = stochasticRsi(
      closes,
      parameters.rsiPeriod,
      parameters.stochasticPeriod,
      parameters.smoothPeriod,
    );
    return [
      lineSeries(labels.stochRsiK, values.k, colors.cyan, 2, 2),
      lineSeries(labels.stochRsiD, values.d, colors.amber, 2, 2),
    ];
  }
  if (indicator === "cci") {
    return [
      lineSeries(
        labels.cci,
        cci(bars, parameters.period),
        colors.violet,
        2,
        2,
      ),
    ];
  }
  if (indicator === "williamsR") {
    return [
      lineSeries(
        labels.williamsR,
        williamsR(bars, parameters.period),
        colors.cyan,
        2,
        2,
      ),
    ];
  }
  if (indicator === "adx") {
    const values = adx(bars, parameters.period);
    return [
      lineSeries(labels.adx, values.adx, colors.violet, 2, 2),
      lineSeries(labels.plusDi, values.plusDi, colors.up, 2, 2),
      lineSeries(labels.minusDi, values.minusDi, colors.down, 2, 2),
    ];
  }
  if (indicator === "roc") {
    return [
      lineSeries(
        labels.roc,
        roc(closes, parameters.period),
        colors.amber,
        2,
        2,
      ),
    ];
  }
  if (indicator === "mfi") {
    return [
      lineSeries(
        labels.mfi,
        mfi(bars, parameters.period),
        colors.violet,
        2,
        2,
      ),
    ];
  }
  if (indicator === "cmf") {
    return [
      lineSeries(
        labels.cmf,
        cmf(bars, parameters.period),
        colors.cyan,
        2,
        2,
      ),
    ];
  }
  if (indicator === "atr") {
    return [
      lineSeries(
        labels.atr,
        atr(bars, parameters.period),
        colors.amber,
        2,
        2,
      ),
    ];
  }
  if (indicator === "obv") {
    return [lineSeries(labels.obv, obv(bars), colors.cyan, 2, 2)];
  }
  return [];
}
```

Every existing branch must be moved without changing its colors, labels, axis
indices, or mark type.

- [ ] **Step 5: Use registry placement and the series helper**

Inside `PriceChart`:

```ts
const overlayIndicator = getIndicator(indicator).placement === "overlay";
// keep price, trade-marker, and volume series
series.push(
  ...buildIndicatorSeries(
    bars,
    indicator,
    indicatorParameters,
    labels.series,
  ),
);
```

Add `indicatorParameters` to the `useMemo` dependency list.

- [ ] **Step 6: Run chart and registry tests**

Run:

```bash
npx tsx --test tests/indicator-registry.test.ts tests/chart-config.test.ts
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add app/components/PriceChart.tsx tests/chart-config.test.ts
git commit -m "Parameterize chart indicators"
```

---

### Task 3: Separate indicator and strategy UI state

**Files:**
- Modify: `app/MarketWorkspace.tsx`
- Modify: `app/i18n/zh-CN.ts`
- Modify: `app/globals.css`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: `INDICATORS`, `createDefaultIndicatorSettings()`, `getDefaultIndicatorParameters()`, `getIndicator()`, `IndicatorId`, and `IndicatorParameters`.
- Produces: independent indicator settings controls and unchanged strategy selection behavior.

- [ ] **Step 1: Write the failing rendered-output assertions**

Add to `tests/rendered-html.test.mjs`:

```js
assert.match(html, /\u6307\u6807\u8bbe\u7f6e/);
assert.match(html, /\u7b56\u7565\u53e0\u52a0/);
assert.match(html, /\u6062\u590d\u9ed8\u8ba4/);
assert.match(html, /name="indicator-fast"/);
assert.match(html, /name="indicator-slow"/);
```

- [ ] **Step 2: Run the rendered test and verify failure**

Run:

```bash
npm run build
node --test tests/rendered-html.test.mjs
```

Expected: fail because the indicator settings row is not rendered.

- [ ] **Step 3: Add independent indicator state**

In `app/MarketWorkspace.tsx`, import the registry and initialize:

```ts
const [indicator, setIndicator] = useState<IndicatorId>("macd");
const [indicatorSettings, setIndicatorSettings] = useState(
  createDefaultIndicatorSettings,
);
const activeIndicator = getIndicator(indicator);
const indicatorParameters = indicatorSettings[indicator];
```

Remove the component-local `indicatorIds` list and map `INDICATORS` in the
toolbar.

Change `selectStrategy` so it updates only strategy state:

```ts
const selectStrategy = (
  nextStrategyId: StrategyId,
  nextParameters?: StrategyParameters,
) => {
  const next = getStrategy(nextStrategyId);
  setStrategyId(nextStrategyId);
  setParameters({
    ...next.defaultParameters,
    ...nextParameters,
  });
};
```

Do not call `setIndicator` or mutate `indicatorSettings` from
`selectStrategy`, `openSavedBacktest`, or screening Apply.

- [ ] **Step 4: Add indicator update and reset behavior**

Add:

```ts
const updateIndicatorParameter = (key: string, value: number) => {
  const definition = activeIndicator.parameters.find(
    (parameter) => parameter.key === key,
  );
  if (!definition) return;
  const nextValue = Number.isFinite(value)
    ? Math.max(value, definition.minimum)
    : definition.minimum;
  setIndicatorSettings((current) => ({
    ...current,
    [indicator]: {
      ...current[indicator],
      [key]: nextValue,
    },
  }));
};

const resetIndicator = () => {
  setIndicatorSettings((current) => ({
    ...current,
    [indicator]: getDefaultIndicatorParameters(indicator),
  }));
};
```

- [ ] **Step 5: Add localized copy**

In `app/i18n/zh-CN.ts`, add:

```ts
indicatorSettings: {
  eyebrow: "INDICATOR",
  title: "指标设置",
  reset: "恢复默认",
  noParameters: "此指标无需参数",
  activeIndicator: "指标",
  activeStrategy: "策略叠加",
},
```

Add parameter labels:

```ts
rsiPeriod: "RSI 周期",
stochasticPeriod: "随机计算周期",
smoothPeriod: "平滑周期",
```

- [ ] **Step 6: Render the settings row and layer labels**

Insert below `.chart-toolbar`:

```tsx
<section
  className="indicator-settings-bar"
  aria-label={copy.indicatorSettings.title}
>
  <div className="indicator-settings-title">
    <span>{copy.indicatorSettings.eyebrow}</span>
    <strong>{copy.indicators[indicator].name}</strong>
  </div>
  {activeIndicator.parameters.length > 0 ? (
    <div className="indicator-parameter-controls">
      {activeIndicator.parameters.map((parameter) => (
        <label key={parameter.key}>
          <span>
            {copy.parameters[
              parameter.key as keyof typeof copy.parameters
            ]}
          </span>
          <input
            name={`indicator-${parameter.key}`}
            type="number"
            value={indicatorParameters[parameter.key]}
            min={parameter.minimum}
            step={parameter.step}
            onChange={(event) =>
              updateIndicatorParameter(
                parameter.key,
                Number(event.target.value),
              )
            }
          />
        </label>
      ))}
    </div>
  ) : (
    <span className="indicator-no-parameters">
      {copy.indicatorSettings.noParameters}
    </span>
  )}
  <button type="button" onClick={resetIndicator}>
    {copy.indicatorSettings.reset}
  </button>
</section>
```

Update the chart heading to show separate labels for
`copy.indicatorSettings.activeIndicator` and
`copy.indicatorSettings.activeStrategy`.

Pass the independent parameters:

```tsx
<PriceChart
  bars={series.bars}
  trades={backtest?.trades ?? []}
  dataKey={`${instrument.secid}:${interval}`}
  chartType={chartType}
  indicator={indicator}
  indicatorParameters={indicatorParameters}
  ariaLabel={copy.chart.aria}
  labels={priceChartLabels}
/>
```

- [ ] **Step 7: Style desktop and mobile layouts**

Add CSS for:

```css
.indicator-settings-bar {
  display: flex;
  min-height: 54px;
  align-items: center;
  gap: 14px;
  padding: 8px 22px;
  border-bottom: 1px solid var(--line);
  background: rgba(9, 15, 12, 0.72);
}

.indicator-parameter-controls {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
}

.indicator-parameter-controls label {
  display: grid;
  grid-template-columns: auto 68px;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.indicator-parameter-controls input {
  height: 30px;
}
```

At `max-width: 760px`, allow the settings bar to wrap and make the parameter
controls occupy a full row without changing the chart height.

- [ ] **Step 8: Run rendered and focused tests**

Run:

```bash
npx tsx --test tests/indicator-registry.test.ts tests/chart-config.test.ts
npm run build
node --test tests/rendered-html.test.mjs
```

Expected: all focused tests and the rendered-worker test pass.

- [ ] **Step 9: Commit**

```bash
git add app/MarketWorkspace.tsx app/i18n/zh-CN.ts app/globals.css tests/rendered-html.test.mjs
git commit -m "Separate indicator and strategy controls"
```

---

### Task 4: Documentation, browser verification, and regression

**Files:**
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/CODEX_STATE.md`
- Modify: `docs/FEATURE_MAP.md`
- Modify: `docs/FUNCTIONS.md`

**Interfaces:**
- Consumes: completed registry, chart, and UI behavior from Tasks 1-3.
- Produces: durable feature linkage and final verification evidence.

- [ ] **Step 1: Update linked documentation**

Document:

- independent indicator and strategy state;
- configurable indicator metadata registry;
- per-indicator browser-session settings;
- unchanged strategy execution and saved-backtest schema;
- focused and browser verification results.

Update the chart/indicator row in `docs/FEATURE_MAP.md` to link
`lib/analysis/indicator-registry.ts`, `MarketWorkspace.tsx`,
`PriceChart.tsx`, both focused tests, and the rendered/browser checks.

- [ ] **Step 2: Run the complete automated verification**

Run:

```bash
npm test
npm run lint
git diff --check
```

Expected:

- every TypeScript test passes;
- the production build passes;
- the rendered-worker test passes;
- ESLint reports no errors; and
- `git diff --check` reports no whitespace errors.

- [ ] **Step 3: Verify in a real browser**

Start the local app with:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/start-local.ps1
```

In Edge:

1. select SMA;
2. set fast to 5 and slow to 20;
3. record that both SMA lines change;
4. change the strategy from SMA Cross to MACD Momentum;
5. confirm SMA remains selected with 5 and 20;
6. confirm buy/sell strategy markers remain visible with the SMA lines;
7. select MACD and then return to SMA;
8. confirm SMA still shows 5 and 20;
9. reset SMA and confirm 10 and 30;
10. check the layout at desktop width and below 760 pixels.

- [ ] **Step 4: Commit documentation**

```bash
git add README.md docs/ARCHITECTURE.md docs/CODEX_STATE.md docs/FEATURE_MAP.md docs/FUNCTIONS.md
git commit -m "Document independent indicator controls"
```

- [ ] **Step 5: Review the complete branch**

Review the feature diff from its base commit. Fix every Critical or Important
finding, rerun affected tests, then rerun `npm test` and `npm run lint`.
