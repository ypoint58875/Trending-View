# Community Indicator and Strategy Imports

## Purpose

Downloaded or web-referenced TradingView Pine scripts are research inputs, not
runtime dependencies. QuantScope does not execute Pine. Each accepted item is
implemented as a typed, independently maintained TypeScript formula that uses
the existing `MarketBar[]` and backtest contracts.

## Stable intake path

1. Preserve the original script outside the repository unless redistribution
   is explicitly permitted. Record its title, source location, access date,
   declared `indicator()` or `strategy()` kind, author/license header, inputs,
   alerts, and any `request.security` or backpainting behavior.
2. Add one provenance entry to `lib/analysis/community/catalog.ts`. State
   whether the port is formula-compatible or adapted, the causal boundary, and
   every omitted or host-controlled feature.
3. For an indicator, add its ID and parameter definition to
   `lib/analysis/community/registry.ts`, implement the pure aligned series in
   `lib/analysis/community/indicators.ts`, and add chart rendering plus
   localized names. The main registry imports this catalog automatically.
4. For a strategy, add its ID, defaults, horizon, and target builder to
   `lib/analysis/community/strategies.ts`; add a finite parameter domain to
   `lib/analysis/screening.ts`. The main strategy registry imports the
   community collection automatically.
5. Close-derived decisions must use completed bars and execute no earlier than
   the next bar open. A pivot appears only on its confirmation bar. A higher
   timeframe request must be implemented through an explicit normalized
   aggregation adapter or documented as chart-timeframe-only; silently
   approximating MTF behavior is forbidden.
6. Add catalog/registry coverage, aligned-length, finite-output, input-prefix
   causality, parameter-domain, and execution-timing tests. Update the explicit
   strategy-grid and pair counts when domains or strategy IDs change.
7. Update `DATA_SOURCES.md`, `data/source_registry.jsonl`, `FEATURE_MAP.md`,
   `CODEX_STATE.md`, and this file when the import contract changes.

## Current batch

The 2026-08-11 batch contains nine indicators and three strategies. Decorative
objects, alerts, account sizing, leverage, session controls, partial exits, and
TradingView-only visual fills are not host business logic. The Support and
Resistance MTF port runs on the current chart timeframe. The RSI divergence and
trendline ports publish pivots and divergence markers only after confirmation.
All three strategies are long-only host adaptations and use QuantScope's costs,
range, allocation, and following-open execution settings.

## Website acquisition

When the user supplies a TradingView page instead of a file, capture only
content the page makes available to the current signed-in browser session and
record the URL/access date. Invite-only, protected, or otherwise unavailable
source cannot be reconstructed from screenshots or descriptions. License and
redistribution constraints still apply even when source is visible.
