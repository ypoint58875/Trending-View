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
restores the instrument, strategy, parameters, date range, capital, commission,
and slippage; the current UI remains daily. Displayed metrics remain a saved
summary while the current chart recalculates from current market data.
Always label a shortcut with its stored interval. If that provenance is
non-daily, disclose that opening retains the daily workspace and recalculates
the selected setup on daily bars.

For one-click local Windows use, retain the same D1 schema and owner-scoped
queries but map unauthenticated loopback requests to
`local@quantscope.invalid`. Persist the local D1 database under
`.wrangler/state`. This local identity is accepted only for `localhost` and
`127.0.0.1`; non-loopback hosted requests still require injected
authentication.

## D-009: Dynamic-bar strategy guidance

Return full history with one-hour HTTP freshness and one-day
`stale-while-revalidate`, then fetch a separate `no-store` window of recent
bars on page open, manual refresh, every 60 seconds while visible, and whenever
the page regains focus or visibility. The API permits up to ten latest bars and
the current UI requests five. Merge matching bar times idempotently only when
history and latest share source, interval, and price-adjustment mode. If source
or adjustment mode changes, retain the complete compatible history until a
full compatible refresh succeeds.
Evaluate the provider's newest bar immediately, even when it is still forming,
and label the result as a preview that can change before close.

Keep this guidance separate from historical backtest execution. Historical
close-derived signals continue to fill at the next open, while predefined stop
orders continue to fill when touched. Reuse the same strategy registry for both
paths. Distinguish a range-end valuation close from a genuine sell marker.

## D-010: Daily-only manual product boundary

Present one index or ETF at a time at a fixed daily interval. Do not expose
intraday interval controls in the current UI. Keep interval support in provider
adapters, the market API, and persistence types for internal compatibility, but
treat any return of interval selection as an explicit product decision.

The application supports manual decisions only. Browser refresh timers,
backtests, stability diagnostics, and parameter screening do not place trades
or constitute scheduled server jobs.

## D-011: Dividend/split-aware normalized price series

Set `MarketSeries.priceAdjustment` on every provider result and treat it as the
authoritative UI label. Eastmoney requests `fqt=1` and is marked
`corporate-action-adjusted`. For Yahoo daily data, scale each bar's OHLC by a
finite positive `adjclose / raw close`; when a parsed bar lacks a valid factor,
leave that bar raw and mark the whole series `raw`. Keep Yahoo intraday raw
internally and mark Nasdaq as a raw daily fallback. Never rescale provider
volume. For an all-adjusted Yahoo parse, scale provider previous close by the
first accepted factor. After slicing, use the immediately preceding normalized
bar as previous close when available; raw/mixed fallback remains raw.

Feed the same normalized `MarketBar[]` to chart history, indicators, strategy
price lines, latest guidance, stability, and backtests. For ETFs, this prevents
mechanical distribution/split gaps from becoming ordinary analysis signals
where adjusted data is available. For indexes, it records a provider-adjusted
price series whose symbol/methodology may be a price index or a total-return
index; QuantScope does not convert between those methodologies or process
constituent operating-company events and fundamentals. It does not implement
separate cash distributions, cash yield, reinvestment, exchange-rate handling,
or multi-asset alignment.

## D-012: Diagnostic-only local stability

Build nearby parameter sets from the existing constrained screening domains.
Require exactly the registered keys, finite values within each domain's
minimum/maximum, and all cross-field constraints. Invalid parameters return no
nearby sets and do not run a backtest. For a valid base, change one field at a
time to the immediately lower or higher configured value and report facts;
never rank, select, or apply a nearby set.

Require at least 120 daily observations inside the current backtest range, two
completed base trades, and one valid nearby variant before a stable/sensitive
label is allowed. Otherwise show insufficient evidence with explicit reasons
and keep any factual nearby/regime output available. With sufficient evidence,
use inclusive thresholds: at least 75% of variants share the base return sign,
the return range is at most 15 percentage points, and worst drawdown is no more
than 10 points below base. Classify regimes with the current 60-day SMA and its
20-bar slope; earlier bars may remain only for causal warm-up. This label is
not predictive or a substitute for out-of-sample validation.

## D-013: Indicator collection and strategy price references

Keep the focused indicator separate from the ordered-visible collection and
retain independent settings for every indicator during the page session.
Render overlays on the main price axes and allocate one lower pane per visible
pane indicator. Share zoom across price, volume, and every pane. Build every
parameterized legend name from its actual settings, keep VWAP/OBV
parameter-free, and use a scrolling legend with reserved top clearance.

Calculate strategy price references through a pure, bar-aligned contract.
Price-order strategies must reuse their actual order plans. Render returned
references as dashed lines on the main price axes; return no lines for a rule
without a continuous price reference. Technical Ratings exposes the same
EMA-20 and SMA-50 used by its price votes. These visuals do not infer or
execute trades.
