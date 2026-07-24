# Decisions

## D-001: Independent product implementation

Use TradingView only as a product reference. Do not redistribute its library
files or copy protected Pine scripts.

## D-002: Provider adapter boundary

Use Eastmoney first, Yahoo Finance for broader discovery/history, and Nasdaq
for supported daily-history fallback. Keep all formats isolated behind
`lib/market/` and preserve a shorter valid series if longer-history sources
fail.

## D-003: Next-bar-open fills

Signals are generated from completed bars and executed at the next bar open.
This avoids same-bar close look-ahead. Commission and slippage apply on both
entry and exit.

## D-004: Client-side first-version screening

Run 96 candidates in the browser for immediate feedback. Every strategy must
contribute exactly three distinct parameter sets so the ranking never compares
single-default strategies against tuned strategies. Revisit this decision when
jobs become durable, multi-user, or materially CPU-intensive.

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
author-owned, and not a finite catalog. Templates that rely on pyramiding,
intrabar orders, or TradingView's Technical Ratings implementation are exposed
as documented target-state equivalents rather than execution-identical clones.

## D-007: Long-only target execution

Represent desired position as `0` or `1`. Execute a changed target at the next
bar open. A positive signal buys or maintains a long position; a flat or
negative reference signal sells the long position and remains in cash. Apply
slippage and commission on entry and exit. Derive displayed buy and sell points
only from the resulting completed long trades.

## D-008: Durable saved backtest shortcuts

Persist saved index/ETF backtests in D1 instead of browser storage. Use the
authenticated ChatGPT email as the owner key and include it in every query.
Keep one latest snapshot per owner, provider, and instrument. A shortcut
restores the instrument, interval, strategy, parameters, date range, capital,
commission, and slippage; displayed metrics remain a saved summary while the
current chart recalculates from current market data.
