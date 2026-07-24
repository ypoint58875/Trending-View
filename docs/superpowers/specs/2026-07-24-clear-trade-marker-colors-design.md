# Clear Trade Marker Colors Design

Date: 2026-07-24

## Goal

Make actual buy and sell markers easier to distinguish on the dark price chart
without changing trading behavior, candlestick colors, or range-end valuation
markers.

## Current Problem

Buy markers reuse the chart's green up-candle color and sell markers reuse its
red down-candle color. Markers can visually blend into candlesticks, volume
bars, and indicator content even though their triangle direction differs.

## Considered Approaches

### Dedicated blue and orange trade colors

Use sky blue for buys and orange for sells. These colors remain distinct from
green up candles, red down candles, and the neutral gray range-exit marker.
Blue and orange also provide a stronger non-red/green distinction.

### Brighter green and red

This preserves the existing financial convention but does not solve blending
with candlesticks and volume bars.

### Monochrome markers with shape-only differentiation

This avoids reliance on color but makes rapid scanning less immediate than a
two-color system.

## Decision

Use dedicated colors:

- Buy fill: `#38bdf8`
- Buy border and label: `#e0f2fe`
- Sell fill: `#fb923c`
- Sell border and label: `#ffedd5`
- Shared label background: `rgba(7, 15, 22, 0.82)`

Keep the existing upward buy triangle, downward sell triangle, positions,
offsets, and trade-derived data. Use a 1.5-pixel light border and a compact
dark label background so both colors remain legible over candles and indicator
lines. Keep range-end valuation exits gray and visually subordinate.

## Architecture

Extract trade-marker series construction from the `PriceChart` component into
an exported pure helper in the same file. The component continues to receive
completed `BacktestTrade` records, the helper continues to use
`buildTradeMarkers`, and the returned ECharts series are appended unchanged to
the chart option.

This boundary lets chart tests inspect the effective buy, sell, and range-exit
series styles without rendering React or duplicating implementation constants
in a source-text assertion.

## Testing

Add a failing chart-configuration test that calls the pure series builder and
asserts:

- Buy and sell use the dedicated fill, border, and label colors.
- Both labels use the shared dark background.
- Buy and sell retain opposing triangle rotations.
- Range exits retain the existing neutral gray fill.

Then implement the helper and palette, run the focused chart test, the full
test/build suite, ESLint, and a local browser inspection on the dark chart.

## Change Boundaries

Planned files:

- `app/components/PriceChart.tsx`
- `tests/chart-config.test.ts`
- `docs/FEATURE_MAP.md`
- `docs/CODEX_STATE.md`

Explicitly unchanged:

- Trade generation and backtest execution
- Buy/sell timestamps and prices
- Candlestick and volume up/down colors
- Live-guidance card colors
- Chinese UI copy
- Range-end marker meaning and shape

Risk level: low. The change is limited to ECharts series construction and
presentation tests.
