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
position after a bar closes: `1` for long, `0` for flat, and `-1` for short.
Execution belongs only in the backtest engine. Extended product strategies
stay in `strategies.ts`; independently implemented external reference catalogs
belong in a dedicated module and are spread into the shared registry. Every
reference catalog exports an ordered ID list so a catalog test can prove that
no documented entry is missing.

Trade annotations are derived from completed `BacktestTrade` records by a pure
mapping helper. A long entry and short exit are buys; a short entry and long
exit are sells. Chart components consume the mapped markers but never infer
trades from indicator lines.

## UI copy

Chinese user-facing strings live in `app/i18n/zh-CN.ts`. Business logic,
internal errors, identifiers, and tests remain English. Provider-defined field
values may retain their source language when required for parsing.
