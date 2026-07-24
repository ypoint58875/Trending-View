# Module Patterns

## Market provider

Every provider must:

1. Keep endpoint-specific response types inside its adapter.
2. Validate HTTP status and required payload fields.
3. Convert output to `MarketInstrument` and `MarketSeries`.
4. Use an explicit timeout and log only non-sensitive error metadata.
5. Add source documentation and a reproducible raw sample.

Provider orchestration belongs in `lib/market/index.ts`, not in individual
adapters. Search results must normalize to the shared index/ETF asset types and
must not expose individual equities. Fallbacks preserve the last valid series,
prefer longer daily history when available, and never merge bars from different
sources into one series.

## Indicator

Indicators are pure, bar-aligned functions. Warm-up entries are `null`; values
must never be shifted backward or use future bars.

## Strategy

Strategies are registry entries with an ID, linked indicator, default
parameters, and a `buildTarget` function. The function describes desired
position after a bar closes: `1` for long and `0` for flat. The product is
long-only. A negative signal in an external reference strategy must be
normalized to `0`, closing an existing long position without opening a short.
Execution belongs only in the backtest engine. Extended product strategies stay
in `strategies.ts`; independently implemented external reference catalogs
belong in a dedicated module and are spread into the shared registry. Every
reference catalog exports an ordered ID list so a catalog test can prove that
no documented entry is missing.

Every registered strategy must have one constrained parameter-space entry in
`screening.ts`. Domains must be finite, economically meaningful, and expressed
with stable numeric precision. Cross-field rules such as fast-period less than
slow-period belong in the parameter-space constraint. The generated candidates
must include the strategy default, remain JSON-distinct, and never exceed the
shared per-strategy hard cap.

Large candidate spaces are sampled deterministically across the full ordered
grid. Screening executes in interruptible chunks and retains only the best
result per strategy under one explicit scalar objective. Objective comparison
and tie-breaking belong in the shared screening module, not the UI. Tests
enforce registry coverage, uniqueness, the cap, objective ordering,
best-result sorting, progress completion, and cancellation.

Trade annotations are derived from completed `BacktestTrade` records by a pure
mapping helper. Every entry is a buy and every exit is a sell. Chart components
consume the mapped markers but never infer trades from indicator lines.

Shared ECharts wrappers initialize and dispose the canvas only at component
mount/unmount. Option changes update the existing instance. Interactive state
that must survive an option update is captured explicitly and reapplied; reset
keys define the business boundary where that state should be discarded.

## Saved record

Saved product records use a shared input/record type, pure boundary validation,
an authenticated API route, and a D1 table. Every query includes the owner key.
The instrument identity is limited to the same index/ETF types accepted by the
market layer. Upserts use the owner, provider, and provider symbol as the
de-duplication key. UI components consume API records and do not access D1
bindings directly.

## UI copy

Chinese user-facing strings live in `app/i18n/zh-CN.ts`. Business logic,
internal errors, identifiers, and tests remain English. Provider-defined field
values may retain their source language when required for parsing.
