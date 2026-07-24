# Daily Manual Swing Workflow Design

## Goal

Make QuantScope a daily-only, single-instrument workspace for manual swing
decisions. Historical indicators and strategy signals must not react to
mechanical dividend or split gaps, multiple indicators must remain visible at
the same time, each strategy must draw the price references it actually uses,
and parameter checking must discourage fragile tuning without becoming an
optimizer.

## Scope

This change covers:

- corporate-action-aware daily OHLC normalization and source metadata;
- a fixed daily interval in the UI;
- simultaneous chart indicators with independent settings;
- dynamic indicator panes;
- price-reference lines for strategies;
- a lightweight nearby-parameter and market-regime stability report;
- linked tests, Chinese UI copy, and project documentation.

This change does not alter:

- strategy entry or exit rules;
- backtest fill timing or transaction-cost rules;
- saved-backtest storage schema;
- authentication, launchers, search, or database behavior;
- the existing exhaustive screening engine.

## Research Summary

TradingView documents that a dividend mechanically reduces the share price and
that a dividend-adjusted chart represents total shareholder return. QuantConnect
documents that splits and dividends must be reflected in normalized prices or
indicator state to avoid discontinuities. QuantConnect also warns that
parameters that perform well historically but fail under small changes are a
sign of overfitting.

These sources support two design decisions:

1. Price normalization is data correctness, not optional strategy tuning.
2. The manual workflow should test small parameter perturbations and different
   market conditions, not search for the historical maximum.

## Considered Approaches

### Corporate actions

1. Replace only Yahoo `close` with `adjclose`.
   - Small change.
   - Rejected because candles, ATR, channels, stops, and close-derived
     indicators would use incompatible price scales.
2. Scale Yahoo daily OHLC by `adjclose / close`.
   - Keeps every price field on one adjusted scale.
   - Preserves the latest raw scale because the latest factor is normally one.
   - Selected.
3. Store separate raw and adjusted bars and run a dual-price execution engine.
   - Most complete for institutional accounting.
   - Rejected for this manual, long-only daily workflow because it materially
     expands the data and backtest model.

Yahoo daily data uses approach 2 when a finite positive adjusted close is
available. Eastmoney retains `fqt=1`. Nasdaq remains a transparent raw fallback;
the series metadata prevents raw fallback data from being mistaken for adjusted
data. Volume remains source-native because a combined dividend/split adjustment
factor cannot safely infer a volume factor.

### Parameter stability

1. Exhaustive grid optimization.
   - Finds a historical maximum.
   - Rejected for the manual workflow because it increases selection bias.
2. Walk-forward or rolling optimization.
   - More rigorous but adds an optimizer and repeated retuning.
   - Rejected as unnecessary complexity for the stated workflow.
3. Current parameters plus the nearest lower and higher valid value for each
   parameter.
   - Small, deterministic, easy to interpret, and does not choose a winner.
   - Selected.

The report shows the total-return range, worst drawdown, trade-count range, and
the share of nearby variants with the same return sign as the current rule. It
also reports current-rule performance in up, sideways, and down regimes. A
regime is classified without future data using the current close relative to a
60-day SMA and the direction of that SMA over the previous 20 bars.

The stability label is a diagnostic, not a prediction. A rule is labelled
stable only when at least 75% of valid nearby variants share the base return
sign, the return range is no wider than 15 percentage points, and the worst
nearby drawdown is no more than 10 percentage points below the base drawdown.

### Multiple indicators

1. Make every indicator tab a direct on/off toggle.
   - Fast to operate but unclear which indicator's parameters are being edited.
2. Keep a focused indicator and a separate visible-indicator collection.
   - Makes settings ownership explicit and allows accumulation.
   - Selected.
3. Allow several overlays but only one lower pane.
   - Rejected because oscillators on incompatible scales would be misleading.

Clicking an indicator focuses it and adds it when absent. The settings strip
edits the focused indicator and provides a show/hide action. Overlay indicators
share the price axis. Every pane indicator receives its own grid and axes.

### Strategy visuals

1. Recalculate lines ad hoc in the React component.
   - Easy to start but risks divergence from strategy rules.
2. Add a pure strategy-visual builder in `lib/analysis/`.
   - Testable and reusable, with no ECharts dependency.
   - Selected.

Stop-order strategies expose their existing aligned entry and exit order prices.
Price-based target strategies expose the moving averages, bands, channels,
trend lines, VWAP levels, or SAR values they use. Oscillator-only strategies
have no price-axis reference, so their trade markers remain the applicable
price-chart visual.

## Data Flow

1. A daily provider response is normalized to `MarketSeries`.
2. `MarketSeries.priceAdjustment` declares whether prices include corporate
   actions.
3. The same adjusted `MarketBar[]` feeds the chart, indicators, strategy
   visuals, guidance, stability report, and backtest.
4. `MarketWorkspace` owns focused and visible indicator state.
5. `PriceChart` assigns overlay indicators to the price grid and one grid per
   pane indicator, then adds strategy price-reference lines and trade markers.
6. The stability analyzer builds nearby valid parameter sets, runs the existing
   backtest engine, and summarizes sensitivity and regimes without choosing new
   parameters.

## Error Handling

- Missing or invalid Yahoo adjusted-close values fall back per bar to raw OHLC.
- A Yahoo series is marked adjusted only when all parsed daily bars had a valid
  adjusted-close factor.
- Stability analysis omits invalid nearby parameter combinations and reports
  unavailable regime results when there are too few classified bars.
- Strategy visual builders return an empty array for strategies without a
  meaningful price reference.

## Verification

- Parser tests prove adjusted-close factors scale every OHLC field and remove a
  synthetic dividend gap.
- Stability tests prove nearby variants are valid, bounded, deterministic, and
  regime classification uses only prefix data.
- Strategy visual tests prove Channel BreakOut lines equal its existing order
  plan and are prefix invariant.
- Chart tests prove arbitrary indicator pane axes are used and zoom covers all
  grids.
- SSR tests prove intraday controls are absent and multi-indicator/stability
  controls are present.
- Full verification runs `npm test`, `npm run lint`, and a local browser check.
