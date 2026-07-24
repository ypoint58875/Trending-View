# Decisions

## D-001: Independent product implementation

Use TradingView only as a product reference. Do not redistribute its library
files or copy protected Pine scripts.

## D-002: Provider adapter boundary

Use Eastmoney first, Yahoo Finance for broader discovery/history, and Nasdaq
for supported daily-history fallback. Keep all formats isolated behind
`lib/market/` and preserve a shorter valid series if longer-history sources
fail.

## D-003: Hybrid target and price-order fills

Close-derived target signals are generated from completed bars and execute at
the next bar open. Strategies that predefine stop prices from completed-bar
data may keep those orders active inside the following bar. A touched stop
fills at its stop price; a gap crossing the stop fills at the bar open. This
preserves no-look-ahead behavior while avoiding a one-bar delay for price-based
orders. Commission and slippage apply on both entry and exit.

## D-004: Bounded client-side parameter optimization

Generate constrained parameter grids for every registered strategy and allow
at most 2,500 combinations per strategy. If a grid is larger, sample it
deterministically across the full ordered range while retaining the default
parameters. Run the current search in small asynchronous browser chunks, expose
progress and cancellation, and retain only the best result for each strategy.
Move execution to a Web Worker or durable queue when jobs become concurrent,
durable, or materially more CPU-intensive.

## D-005: Index and ETF product scope

Search, defaults, UI labels, examples, and traceability data include only
indexes and ETFs. Provider results classified as individual equities are
discarded before reaching the browser.

## D-006: Independent indicator and strategy catalog

Implement common formulas and strategy rules independently. Do not claim or
attempt a verbatim copy of TradingView's proprietary/community Pine catalog.
Keep every built-in formula deterministic, bar-aligned, and covered by catalog
tests.

The completeness boundary is the 20-entry official built-in-strategy support
directory checked on 2026-07-24. Free community scripts are dynamic,
author-owned, and not a finite catalog. Five templates with auditable
stop-price rules use the shared price-order contract. Templates that rely on
pyramiding, multi-order brackets, lower-timeframe Bar Magnifier data, or
TradingView's Technical Ratings implementation remain documented independent
equivalents rather than execution-identical clones.

## D-007: Long-only execution

Represent close-derived desired position as `0` or `1`; execute a changed
target at the next bar open. For price-order strategies, map the reference long
stop to entry and the reference short stop to a long exit. Never open a short
position. Apply slippage and commission on entry and exit. Derive displayed buy
and sell points only from the resulting completed long trades.

## D-008: Durable saved backtest shortcuts

Persist saved index/ETF backtests in D1 instead of browser storage. Use the
authenticated ChatGPT email as the owner key and include it in every query.
Keep one latest snapshot per owner, provider, and instrument. A shortcut
restores the instrument, interval, strategy, parameters, date range, capital,
commission, and slippage; displayed metrics remain a saved summary while the
current chart recalculates from current market data.

For one-click local Windows use, retain the same D1 schema and owner-scoped
queries but map unauthenticated loopback requests to
`local@quantscope.invalid`. Persist the local D1 database under
`.wrangler/state`. This local identity is accepted only for `localhost` and
`127.0.0.1`; non-loopback hosted requests still require injected
authentication.

## D-009: Dynamic-bar strategy guidance

Cache full history for one hour, then fetch a separate uncached window of recent
bars on page open, manual refresh, every 60 seconds while visible, and whenever
the page regains focus or visibility. Merge only matching provider/interval bar
times so completed history is reused while the current bar is replaced.
Evaluate the provider's newest bar immediately, even when it is still forming,
and label the result as a preview that can change before close.

Keep this guidance separate from historical backtest execution. Historical
close-derived signals continue to fill at the next open, while predefined stop
orders continue to fill when touched. Reuse the same strategy registry for both
paths. Distinguish a range-end valuation close from a genuine sell marker.
