# Codex State

## Current status

The index-and-ETF QuantScope version is implemented and buildable.

Implemented:

- Index/ETF-only search with individual-equity filtering.
- Eastmoney, Yahoo Finance, and Nasdaq market adapters with ordered fallback.
- Minute and daily intervals for tested global indexes and ETFs.
- Candlestick/line switching, volume, zoom, and 20 indicators.
- Twelve configurable long-only strategy families.
- Date-range backtesting with next-bar-open execution, costs, metrics, equity,
  and drawdown.
- Automated screening across 36 parameter candidates.
- Chinese responsive UI with centralized locale copy.

## Verification status

- Live filtered searches for `N225`, `SOX`, and `SPY`: passed on 2026-07-23.
- Live daily and 5-minute series for N225, SOX, SPY, and 510300: 8 passed on
  2026-07-23.
- Analysis and adapter unit tests: 10 passed on 2026-07-23.
- Built-worker rendering test: 1 passed on 2026-07-23.
- Production build: passed on 2026-07-23.
- ESLint: passed on 2026-07-23.

## Next priorities

1. Replace public website endpoints with a licensed global market-data feed.
2. Add walk-forward and out-of-sample validation.
3. Add venue-specific trading constraints and adjustment-mode controls.
4. Move large screening jobs to a worker queue when the candidate space grows.
