# Changelog

## 2026-07-24

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
