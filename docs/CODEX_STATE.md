# Codex State

## Current status

The index-and-ETF QuantScope version is implemented and buildable.

Implemented:

- Index/ETF-only search with individual-equity filtering.
- Eastmoney, Yahoo Finance, and Nasdaq market adapters with ordered fallback.
- Minute and daily intervals for tested global indexes and ETFs.
- Candlestick/line switching, volume, zoom, and 20 indicators.
- Cached full history plus uncached five-bar overlays on page open, manual
  refresh, 60-second visible-page refresh, and page focus/visibility.
- A current-bar long-only strategy guidance card that reports buy, sell,
  continue holding, or remain flat from the newest available provider bar.
- An explicit green-up/red-down legend and a neutral range-end valuation marker
  that is separate from genuine strategy exits.
- Dedicated sky-blue buy and orange sell markers with light borders and dark
  label backgrounds, visually separated from green-up/red-down candles.
- A directly draggable 22-pixel chart timeline selection with visible resize
  handles; parent rerenders and applied screening results preserve the active
  zoom window for the current instrument and interval.
- Twelve extended strategies plus independent equivalents of all 20 official
  TradingView built-in strategy templates.
- Date-range backtesting with hybrid execution: close-derived targets fill at
  the next open, while Channel BreakOut, Momentum, Pivot Reversal, Price
  Channel, and Volty Expan Close use completed-bar stop orders that can fill
  inside the following bar with gap-aware prices.
- Long-only positions, costs, metrics, equity, drawdown, and chart-level
  buy/sell markers derived from actual fills.
- Bounded parameter-grid optimization across all 32 strategies, with a
  configurable hard cap of 2,500 combinations per strategy, chunked progress,
  cancellation, and best-per-strategy result retention. The default grids
  currently contain 31,172 valid combinations.
- Five deterministic screening objectives: balanced score, return/drawdown
  ratio, maximum return, minimum drawdown, and maximum Sharpe.
- Per-user D1-backed saved backtests with a dedicated upper-right shortcut bar
  for restoring index/ETF research settings.
- A lower research area that places the strategy lab and automated screening
  together while keeping the current-backtest save action in the lab.
- Chinese responsive UI with centralized locale copy.
- A one-click Windows local launcher that applies project-local D1 migrations,
  binds vinext to `127.0.0.1:3000`, requires no account, reuses an
  already-running QuantScope server, and opens a new maximized Edge window
  when Edge is available.

## Verification status

- Local launcher contract tests and PowerShell parser validation: passed on
  2026-07-24.
- PowerShell behavior tests for missing, damaged, and ready dependencies plus
  ready and early-exit server states: passed on 2026-07-24.
- Clean temporary D1 migration, local HTTP readiness, launcher reuse, and a
  create/list/delete saved-backtest round trip without authentication: passed
  on 2026-07-24.
- Full 34-test TypeScript suite, production build, rendered-worker test, and
  ESLint: passed after the local launcher reliability review on 2026-07-24.
- Dedicated blue/orange trade-marker palette test, full test/build suite,
  ESLint, and dark-chart browser inspection: passed on 2026-07-24.
- Live filtered searches for `N225`, `SOX`, and `SPY`: passed on 2026-07-24.
- Live daily series for N225, SOX, and SPY passed on 2026-07-24; the broader
  daily/5-minute N225, SOX, SPY, and 510300 matrix last passed on 2026-07-23.
- Analysis, adapter, screening-objective, and chart-configuration unit tests:
  23 passed on 2026-07-24.
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
- Synthetic intrabar-stop, gap-fill, range-boundary, no-future-data, and
  five-strategy order-plan tests passed on 2026-07-24.
- Live-guidance transition, price-order guidance, and range-end marker tests
  passed on 2026-07-24.
- Completed-history/recent-bar merge coverage increased the local suite to 27
  passing tests on 2026-07-24; the production build, rendered worker test, and
  ESLint also passed.
- Live N225 browser verification on 2026-07-24 returned 1,000 cacheable history
  bars and a separate five-bar `no-store` update, advanced the displayed update
  time after manual refresh, recalculated the latest strategy guidance, kept
  the green-up/red-down legend visible, and preserved a dragged timeline window
  across refresh.
- A live N225 Channel BreakOut comparison for 2025-07-24 through 2026-07-24,
  length 4 and tick 0.1, produced 45.01% return, -9.63% maximum drawdown, and
  16 trades; its first entry and exit matched the reference dates.
- A real Edge run displayed the new tick parameter, completed a 64/64
  two-candidate-per-strategy screen, applied the Channel BreakOut result,
  preserved the prior zoom window, and successfully dragged it again on
  2026-07-24.

## Next priorities

1. Replace public website endpoints with a licensed global market-data feed.
2. Add walk-forward and out-of-sample validation.
3. Add venue-specific trading constraints and adjustment-mode controls.
4. Move large screening jobs to a Web Worker or durable queue when browser
   execution time becomes unacceptable.
5. Add pyramiding, multi-order brackets, limit orders, and optional lower-
   timeframe Bar Magnifier data for templates that require those features.
