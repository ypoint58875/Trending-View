# Independent Indicator and Strategy Controls Design

## Goal

Separate technical-indicator selection and configuration from strategy
selection while keeping both visible on the same price chart. A strategy owns
backtesting, live guidance, and trade markers. An indicator owns only its chart
series and display parameters.

## User-visible behavior

- One strategy and one technical indicator remain active at a time.
- Changing the strategy does not change the selected indicator or its
  parameters.
- Changing the indicator does not change the selected strategy, strategy
  parameters, backtest, or live guidance.
- Strategy buy, sell, and range-end markers remain visible while the selected
  indicator is rendered on the main chart or its lower pane.
- Every indicator with configurable inputs exposes them in a compact indicator
  settings bar below the chart toolbar.
- Indicator settings are retained per indicator for the current browser
  session. Switching from SMA to MACD and back restores the edited SMA values.
- SMA defaults to fast period 10 and slow period 30. Both periods are editable.
- VWAP and OBV expose an explicit no-parameters message.
- Indicator settings are display-only and are not copied into strategy
  parameters or saved-backtest records.

## Recommended architecture

Add an indicator registry under `lib/analysis/`. Each entry declares:

- a stable `IndicatorId`;
- whether it renders over price or in the lower indicator pane;
- default numeric parameters; and
- parameter metadata such as minimum value and input step.

The registry contains no localized copy and no ECharts styling. Chinese labels
remain in `app/i18n/zh-CN.ts`, while ECharts series construction remains in
`app/components/PriceChart.tsx`.

`MarketWorkspace` owns two independent state groups:

1. strategy ID plus strategy parameters; and
2. indicator ID plus a parameter map keyed by indicator ID.

The strategy selection helper updates only the first group. The indicator
controls update only the second group. `PriceChart` receives the active
indicator ID and active indicator parameters explicitly.

## Indicator parameter model

The initial registry uses the existing formula defaults:

- SMA: fast 10, slow 30
- EMA: fast 12, slow 26
- WMA: fast 20, slow 50
- DEMA: fast 20, slow 50
- Bollinger Bands: period 20, width 2
- VWAP: no parameters
- Supertrend: period 10, multiplier 3
- Ichimoku: conversion 9, base 26, span 52
- RSI: period 14
- MACD: fast 12, slow 26, signal 9
- KDJ: period 9
- Stochastic RSI: RSI period 14, stochastic period 14, smoothing 3
- CCI: period 20
- Williams %R: period 14
- ADX: period 14
- ROC: period 12
- MFI: period 14
- CMF: period 20
- ATR: period 14
- OBV: no parameters

Period-like fields have a minimum of 1 and step 1. Multiplier and width fields
use their declared decimal step. Invalid or temporarily empty numeric inputs
are clamped to the declared minimum before reaching indicator formulas.

## Chart construction

Extract indicator-series construction into an exported pure helper in
`PriceChart.tsx`. It accepts bars, the indicator ID, parameters, and series
labels, and returns the ECharts series for that indicator.

The helper passes configured parameters to the existing pure formulas. Chart
layout uses the registry placement instead of a duplicated hard-coded overlay
list. Trade-marker series are constructed independently and remain present
regardless of indicator changes.

## UI layout

Keep the existing horizontal indicator tabs in the chart toolbar. Add a
separate settings row directly below:

- an "Indicator settings" label;
- the active indicator name;
- compact numeric inputs for that indicator;
- a reset-to-default action; or
- a no-parameters message for VWAP and OBV.

The chart heading displays the active indicator and active strategy as separate
layer labels. The strategy laboratory keeps its existing strategy selector and
strategy parameter block.

## Persistence and compatibility

No database migration is required. Saved backtests continue to restore only
strategy and backtest settings. Opening a saved backtest must not change the
currently selected display indicator.

The initial indicator selection remains MACD. Existing strategy defaults,
screening behavior, trade execution, and saved record payloads remain
unchanged.

## Error handling

- Registry lookups throw for unknown indicator IDs during development.
- UI numeric inputs clamp values to their metadata minimum.
- Indicator formulas retain their existing aligned `null` warm-up behavior.
- An indicator rendering error must not alter strategy state. Existing chart
  and backtest error behavior otherwise remains unchanged.

## Testing

- Registry tests prove all 20 indicator IDs are unique, complete, and have
  valid defaults and metadata.
- Chart configuration tests prove custom SMA periods change the generated
  series and that custom oscillator periods reach the lower-pane series.
- UI-source or rendered-output coverage proves indicator settings and strategy
  settings are separate and both active layer labels are rendered.
- A real-browser check changes SMA periods, changes strategies, and confirms
  the SMA selection and values remain while strategy trade markers stay
  visible.
- The full test, production build, rendered-worker test, and ESLint suites must
  pass.

## Non-goals

- Multiple simultaneous technical indicators.
- Saving indicator settings in D1.
- Changing strategy formulas or execution timing.
- Adding new market-data sources.
- Redesigning the screening workflow.
