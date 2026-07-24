# Changelog

## 2026-07-24

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
