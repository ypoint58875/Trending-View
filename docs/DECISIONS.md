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

Run 74 candidates in the browser for immediate feedback. Revisit this decision
when jobs become durable, multi-user, or materially CPU-intensive.

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

## D-007: Signed target execution

Represent desired position as `-1`, `0`, or `1`. Execute a changed target at the
next bar open, closing the old direction before opening the new one. Apply
direction-aware slippage and commission on both legs. Derive displayed buy and
sell points only from the resulting completed trades.
