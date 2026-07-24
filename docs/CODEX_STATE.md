# Codex State

## Current status

The index-and-ETF QuantScope version is implemented and buildable.

Implemented:

- Index/ETF-only search with individual-equity filtering.
- Eastmoney, Yahoo Finance, and Nasdaq market adapters with ordered fallback.
- Minute and daily intervals for tested global indexes and ETFs.
- Candlestick/line switching, volume, zoom, and 20 indicators.
- Twelve extended strategies plus independent equivalents of all 20 official
  TradingView built-in strategy templates.
- Date-range backtesting with next-bar-open execution, costs, metrics, equity,
  drawdown, long-only positions, and chart-level buy/sell markers.
- Automated screening across 96 parameter candidates, with three distinct
  parameter sets for each of the 32 strategies.
- Per-user D1-backed saved backtests with a right-side save action and shortcut
  bar for restoring index/ETF research settings.
- Chinese responsive UI with centralized locale copy.

## Verification status

- Live filtered searches for `N225`, `SOX`, and `SPY`: passed on 2026-07-24.
- Live daily series for N225, SOX, and SPY passed on 2026-07-24; the broader
  daily/5-minute N225, SOX, SPY, and 510300 matrix last passed on 2026-07-23.
- Analysis and adapter unit tests: 15 passed on 2026-07-24.
- Built-worker rendering test: 1 passed on 2026-07-24.
- Production build: passed on 2026-07-24.
- ESLint: passed on 2026-07-24.
- Browser workflow for Channel BreakOut, 74/74 screening, Apply, and visible
  buy/sell markers on N225: passed on 2026-07-24.
- Automated 96-candidate parameter coverage and distinctness tests: passed on
  2026-07-24.
- Saved-backtest payload validation, migration generation, and production
  build: passed on 2026-07-24.
- Long-only catalog, execution, and marker rules: passed on 2026-07-24.

## Next priorities

1. Replace public website endpoints with a licensed global market-data feed.
2. Add walk-forward and out-of-sample validation.
3. Add venue-specific trading constraints and adjustment-mode controls.
4. Move large screening jobs to a worker queue when the candidate space grows.
5. Add pyramiding and intrabar stop/limit simulation for templates that use
   those TradingView execution features.
