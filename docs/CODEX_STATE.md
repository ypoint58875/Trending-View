# Codex State

## Current status

The index-and-ETF QuantScope version is implemented and buildable.

Implemented:

- Index/ETF-only search with individual-equity filtering.
- Eastmoney, Yahoo Finance, and Nasdaq market adapters with ordered fallback.
- Minute and daily intervals for tested global indexes and ETFs.
- Candlestick/line switching, volume, zoom, and 20 indicators.
- A directly draggable 22-pixel chart timeline selection with visible resize
  handles; parent rerenders and applied screening results preserve the active
  zoom window for the current instrument and interval.
- Twelve extended strategies plus independent equivalents of all 20 official
  TradingView built-in strategy templates.
- Date-range backtesting with next-bar-open execution, costs, metrics, equity,
  drawdown, long-only positions, and chart-level buy/sell markers.
- Bounded parameter-grid optimization across all 32 strategies, with a
  configurable hard cap of 2,500 combinations per strategy, chunked progress,
  cancellation, and best-per-strategy result retention. The default grids
  currently contain 27,584 valid combinations.
- Five deterministic screening objectives: balanced score, return/drawdown
  ratio, maximum return, minimum drawdown, and maximum Sharpe.
- Per-user D1-backed saved backtests with a dedicated upper-right shortcut bar
  for restoring index/ETF research settings.
- A lower research area that places the strategy lab and automated screening
  together while keeping the current-backtest save action in the lab.
- Chinese responsive UI with centralized locale copy.
- A Windows launcher that opens the deployed workspace in a new maximized Edge
  window when Edge is available, avoiding reuse of a browser split pane.

## Verification status

- Live filtered searches for `N225`, `SOX`, and `SPY`: passed on 2026-07-24.
- Live daily series for N225, SOX, and SPY passed on 2026-07-24; the broader
  daily/5-minute N225, SOX, SPY, and 510300 matrix last passed on 2026-07-23.
- Analysis, adapter, screening-objective, and chart-configuration unit tests:
  20 passed on 2026-07-24.
- Built-worker rendering test: 1 passed on 2026-07-24.
- Production build: passed on 2026-07-24.
- ESLint: passed on 2026-07-24.
- Browser workflow for Channel BreakOut, 74/74 screening, Apply, and visible
  buy/sell markers on N225: passed on 2026-07-24.
- Parameter-grid coverage, cap, uniqueness, best-per-strategy ordering,
  progress, and cancellation tests: passed on 2026-07-24.
- Saved-backtest payload validation, migration generation, and production
  build: passed on 2026-07-24.
- Long-only catalog, execution, and marker rules: passed on 2026-07-24.
- Chart zoom configuration tests and a real Edge
  drag-screen-apply-drag interaction: passed on 2026-07-24.
- A real Edge run selected the return/drawdown target, completed 32 parameter
  evaluations, applied the first-ranked result, retained the zoom window, and
  remained draggable on 2026-07-24.
- A 1,920-pixel Edge viewport reported matching 1,920-pixel document, body, and
  workspace widths on 2026-07-24.

## Next priorities

1. Replace public website endpoints with a licensed global market-data feed.
2. Add walk-forward and out-of-sample validation.
3. Add venue-specific trading constraints and adjustment-mode controls.
4. Move large screening jobs to a Web Worker or durable queue when browser
   execution time becomes unacceptable.
5. Add pyramiding and intrabar stop/limit simulation for templates that use
   those TradingView execution features.
