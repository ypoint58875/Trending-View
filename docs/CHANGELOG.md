# Changelog

## 2026-07-25

- Classified all 32 strategies into explicit, disjoint long- and short-horizon
  groups and exposed those groups in the strategy selector and screening
  results.
- Added hierarchical targets where the long rule gates exposure and the short
  rule switches between a configurable core allocation and full planned
  allocation inside the long uptrend.
- Added a partial-allocation next-open backtest with per-rebalance commission,
  slippage, range-end liquidation, and shared screening metrics.
- Added bounded two-stage combination screening: two standalone finalists per
  strategy, retained long/short pairing, shared objectives, progress,
  cancellation, ranked results, and an equity/drawdown preview.
- Added coverage for horizon completeness, hierarchy truth tables, prefix
  invariance, allocation execution and costs, bounded role-safe optimization,
  progress, cancellation, and rendered UI order.

## 2026-07-24

- Prevented all adjusted/raw latest-history merges and retained the complete
  compatible series across source or adjustment-mode mismatches.
- Added exact strategy-parameter validation and explicit stability evidence:
  120 in-range daily observations, two completed base trades, and a nearby
  variant are required before stable/sensitive can appear.
- Made all configurable indicator legend names reflect actual parameters,
  changed the legend to a scrolling layout with reserved plot clearance, and
  added exact Technical Ratings EMA-20/SMA-50 price references.
- Preserved legacy shortcut interval provenance while keeping all reopened
  setups daily, normalized Yahoo previous-close scale/slice behavior, and
  re-exported `MarketPriceAdjustment` from the market barrel.
- Made the interactive workspace daily-only for one index or ETF at a time
  while retaining interval support inside provider/API types.
- Added authoritative `MarketSeries.priceAdjustment` metadata: Eastmoney
  `fqt=1` is adjusted, Yahoo daily OHLC uses a validated per-bar
  `adjclose / raw close` factor with whole-series raw fallback metadata, Yahoo
  intraday remains raw internally, and Nasdaq is a raw daily fallback.
- Kept provider volume unscaled and routed the same normalized `MarketBar[]`
  through charts, indicators, strategy visuals, guidance, stability, and
  backtests.
- Added focused versus ordered-visible indicator state, independent settings,
  overlay versus one-pane-per-indicator layout, and shared zoom across price,
  volume, and all indicator panes.
- Added a pure strategy price-visual contract for 17 price-based strategies,
  including direct reuse of the five price-order plans, dashed main-axis
  rendering, and empty output for strategies without continuous references.
- Added nearby-parameter stability diagnostics using adjacent valid screening
  values, inclusive 75%/15-point/10-point thresholds, and prefix-safe 60-day
  SMA/20-bar-slope market regimes. The diagnostic never selects parameters.
- Added `DATA_PIPELINE.md` and `CACHE_POLICY.md` to distinguish current HTTP
  caching and in-memory latest-bar merge behavior from future ingestion,
  archival, retention, and cleanup recommendations.
- Added cached full history plus uncached recent-bar overlays on open, focus,
  visibility, and 60-second visible-page intervals.
- Added current dynamic-bar buy, sell, continue-holding, and remain-flat
  strategy guidance without changing historical backtest execution.
- Added explicit green-up/red-down chart copy and separated neutral range-end
  valuation closes from genuine strategy sell markers.
- Added a shared price-order strategy contract and hybrid backtest execution:
  close targets still fill at the next open, while predefined stops can fill
  inside the following bar with gap-aware prices.
- Migrated Channel BreakOut, Momentum, Pivot Reversal, Price Channel, and Volty
  Expan Close to the shared stop-order model without enabling short positions.
- Added configurable and optimizable tick values to Channel BreakOut, Momentum,
  and Pivot Reversal, increasing the default grid to 31,172 combinations.
- Added stop-touch, gap-fill, selected-range first-bar, prefix-invariance, and
  price-order registry coverage tests.
- Matched the N225 Channel BreakOut length-4/tick-0.1 reference trade dates and
  restored the same-period result from 31.52% to 45.01%.
- Preserved the active main-chart zoom window when an optimized strategy is
  applied by updating the existing ECharts instance instead of recreating it.
- Added selectable balanced, return/drawdown, maximum-return,
  minimum-drawdown, and maximum-Sharpe screening targets with deterministic
  tie-breaking and target-value display.
- Made the selected chart timeline range directly draggable, enlarged its
  interaction area and resize handles, and stabilized chart label props so
  parent rerenders do not reconstruct the chart.
- Updated the Windows launcher to open a new maximized Edge window, preventing
  an existing browser split pane from appearing as unused application width.
- Added slider configuration tests and real-browser drag/full-width checks.
- Replaced the fixed three-presets-per-strategy screen with constrained
  parameter grids, a configurable 2,500-combination per-strategy hard cap, and
  27,584 valid default candidates.
- Added chunked screening progress, cancellation, deterministic over-cap
  sampling, and best-per-strategy result retention.
- Moved the strategy lab and automated screening into one lower research area;
  the upper-right sidebar now contains only saved backtest shortcuts.
- Added automated coverage for grid uniqueness and caps, optimizer progress,
  cancellation, best-result sorting, and rendered layout order.
- Added per-user D1 persistence for saved index/ETF backtests.
- Added a right-side save action and shortcut bar that restores the complete
  saved backtest setup and displays its saved return.
- Added an ownership-scoped upsert/list/delete API, schema migration, payload
  validation, and rendered UI coverage.
- Added a root-level Windows launcher for the deployed application.
- Expanded screening to 96 candidates so every strategy is tested with three
  distinct parameter sets, with automated coverage and distinctness checks.
- Added a minimum candle-body filter to parameterize the four previously
  parameterless candle-pattern strategies.
- Restricted every strategy and backtest to long-only execution: buy opens a
  long position and sell closes it; negative reference signals now remain flat.
- Removed short-direction parameters, short trade accounting, and short marker
  mapping while preserving all 32 strategies and 74 screening candidates.
- Added buy and sell annotations to the main chart for the active backtest,
  including immediately applied screening results.
- Upgraded the backtest engine from long-only targets to next-open long, flat,
  short, and reversal execution with direction-aware costs.
- Added independent equivalents of all 20 official TradingView built-in
  strategy templates, including Channel BreakOut.
- Expanded automated screening from 36 to 74 parameter candidates.
- Added catalog completeness, Channel BreakOut, short execution, and trade
  marker mapping tests.

## 2026-07-23

- Created the QuantScope market strategy workspace.
- Added Eastmoney search and OHLCV routes.
- Added chart switching, volume, eight indicators, six strategy families,
  configurable backtesting, and 18-candidate screening.
- Added responsive Chinese UI, tests, documentation, and source traceability.
- Restricted search and examples to global indexes and ETFs; removed the
  individual-equity sample.
- Added Yahoo Finance discovery/history and Nasdaq daily-history fallback.
- Expanded the chart catalog from 8 to 20 indicators, the strategy registry
  from 6 to 12 families, and automated screening from 18 to 36 candidates.
- Added provider filtering, parser, full-catalog alignment, full-strategy
  signal, and live multi-symbol integration coverage.
