# Daily Manual Swing Workflow Implementation Plan

> **For Codex:** Follow the test-driven sequence below. Do not modify
> `AGENTS.md`, launcher/authentication files, database schema, or backtest fill
> semantics.

**Goal:** Deliver a daily-only manual swing workspace with corporate-action-aware
prices, multiple simultaneous indicators, strategy price-reference lines, and a
small stability diagnostic around the user's chosen parameters.

**Architecture:** Normalize provider prices before they enter `MarketSeries`.
Keep indicator and strategy calculations pure under `lib/analysis/`. Let
`MarketWorkspace` own selection state and summaries, while `PriceChart` converts
pure indicator/strategy values into dynamic ECharts grids and series.

**Tech Stack:** TypeScript, React 19, ECharts 6, Vinext/Vite, Node test runner.

---

### Task 1: Lock corporate-action price semantics with tests

**Files:**

- Modify: `tests/analysis.test.ts`
- Modify: `lib/market/types.ts`
- Modify: `lib/market/yahoo.ts`
- Modify: `lib/market/eastmoney.ts`
- Modify: `lib/market/nasdaq.ts`

**Steps:**

1. Add a Yahoo fixture with raw OHLC, adjusted closes, and a synthetic dividend
   discontinuity.
2. Assert that daily Yahoo OHLC uses the adjusted-close factor and that the
   series declares corporate-action adjustment.
3. Assert raw fallback behavior when adjusted close is absent.
4. Run the focused test and confirm the new assertions fail.
5. Add `MarketPriceAdjustment` and `MarketSeries.priceAdjustment`.
6. Parse Yahoo `indicators.adjclose`, scale daily OHLC consistently, and
   recompute derived change fields from adjusted values.
7. Mark Eastmoney `fqt=1` as corporate-action adjusted and Nasdaq as raw.
8. Run the focused test and commit.

### Task 2: Add nearby-parameter and regime stability analysis

**Files:**

- Modify: `tests/analysis.test.ts`
- Modify: `lib/analysis/screening.ts`
- Create: `lib/analysis/stability.ts`

**Steps:**

1. Add tests for nearest valid lower/higher parameter variants.
2. Add tests for deterministic regime classification, prefix invariance, and
   stability summary bounds.
3. Run the focused tests and confirm they fail.
4. Export a helper from the existing parameter-space registry that returns the
   base parameters plus one-at-a-time adjacent valid variants.
5. Implement base/variant backtests, return/drawdown/trade ranges, sign
   agreement, transparent thresholds, and 60/20-day regime summaries.
6. Run the focused tests and commit.

### Task 3: Add pure strategy price-reference visuals

**Files:**

- Modify: `tests/analysis.test.ts`
- Create: `lib/analysis/strategy-visuals.ts`

**Steps:**

1. Add tests that Channel BreakOut visual entry/exit values equal
   `buildStrategyOrders`.
2. Add prefix-invariance tests to prevent future-data leakage.
3. Add representative tests for SMA, Bollinger, Supertrend, and a strategy with
   no price reference.
4. Run the tests and confirm failure.
5. Implement typed price-line roles and builders using existing order and
   indicator functions.
6. Run the focused tests and commit.

### Task 4: Refactor the chart for multiple indicators and strategy lines

**Files:**

- Modify: `tests/chart-config.test.ts`
- Modify: `app/components/EChart.tsx`
- Modify: `app/components/PriceChart.tsx`
- Modify: `app/globals.css`

**Steps:**

1. Update tests to pass explicit target axes to indicator-series builders.
2. Add tests that zoom links every requested x-axis.
3. Add tests for strategy-line ECharts styling and axis placement.
4. Run chart tests and confirm failure.
5. Change `PriceChart` props from one indicator to a visible-indicator array and
   current strategy.
6. Generate one dynamic pane/grid per pane indicator and a dynamic chart height.
7. Add strategy price lines on the main price axis with distinct dashed styles.
8. Preserve zoom across every dynamic grid.
9. Run chart tests and commit.

### Task 5: Make the workspace daily-only and add multi-indicator/stability UI

**Files:**

- Modify: `tests/rendered-html.test.mjs`
- Modify: `app/MarketWorkspace.tsx`
- Modify: `app/i18n/zh-CN.ts`
- Modify: `app/globals.css`

**Steps:**

1. Add SSR assertions that intraday interval buttons are absent and that
   show/hide indicator plus stability copy is present.
2. Run the SSR test and confirm failure.
3. Replace interval state with a fixed daily constant and make saved backtests
   restore daily data.
4. Add focused/visible indicator state, accumulate indicators on selection, and
   add a localized show/hide control.
5. Pass visible indicators and strategy parameters to `PriceChart`.
6. Compute and render the stability card beside the current backtest metrics.
7. Display the provider adjustment status in chart metadata.
8. Add responsive styles and run the SSR test.
9. Commit.

### Task 6: Update linked project documentation

**Files:**

- Modify: `README.md`
- Modify: `docs/CODEX_STATE.md`
- Modify: `docs/FEATURE_MAP.md`
- Modify: `docs/FUNCTIONS.md`
- Modify: `docs/MODULE_PATTERNS.md`
- Modify: `docs/TECH_RESEARCH.md`
- Modify: `docs/DATA_SOURCES.md`
- Modify: `docs/CHANGELOG.md`
- Modify: `docs/DECISIONS.md`

**Steps:**

1. Document the daily-only manual workflow, adjustment metadata, stability
   methodology, indicator collection state, and strategy visual contract.
2. Record the TradingView and QuantConnect research sources and the chosen
   trade-offs.
3. Record that Nasdaq is a raw fallback and volume is not rescaled.
4. Confirm `docs/CODEX_STATE.md` and `docs/FEATURE_MAP.md` link all changed
   feature parts.
5. Commit.

### Task 7: Full verification and review

**Files:**

- Verify all planned files only.

**Steps:**

1. Run `npm test`.
2. Run `npm run lint`.
3. Inspect `git status` and `git diff --check`.
4. Start the isolated app on an unused loopback port.
5. Verify in a real browser:
   - no interval row is present;
   - SMA and MACD can remain visible together;
   - indicator settings affect only the focused indicator;
   - Channel BreakOut shows upper/lower stop lines;
   - the stability card updates with strategy parameters;
   - adjustment status is visible.
6. Request an independent code review and address validated findings.
7. Re-run the full verification suite.
8. Merge the feature branch into the main workspace without changing the
   user-owned `AGENTS.md`.
9. Remove the isolated worktree and restart the local server on
   `http://127.0.0.1:3000`.
