# Hierarchical Strategy Screening Design

## Goal

Classify every registered QuantScope strategy by its intended holding horizon
and add a second one-click research workflow below the existing single-strategy
screen. The new workflow combines one long-horizon strategy with one
short-horizon strategy so the long rule defines the investable uptrend and the
short rule adjusts exposure inside that trend.

## Product Semantics

The daily-only product keeps one bar interval. "Long" and "short" refer to
signal horizons, not weekly or intraday bars.

Every strategy receives one explicit `horizon` value:

- `long`: slower trend, breakout, channel, or persistent momentum rules that
  can define an investable uptrend;
- `short`: faster reversal, candle, pivot, oscillator, or volatility rules
  that can describe a smaller move inside the long trend.

The combined target is hierarchical rather than a vote:

| Long target | Short target | Combined allocation |
| --- | --- | --- |
| Flat | Any | 0% |
| Long | Flat | Configured core allocation, default 60% |
| Long | Long | 100% |

The allocation percentage is relative to the user's planned strategy capital.
It is configurable in the combination panel but is not optimized. A target
calculated after a completed daily bar executes at the next bar open. The
combined workflow does not use intrabar order fills because its input is the
completed-bar state of two different strategy contracts.

## Research Summary

Research on trend following distinguishes slower and faster signals. Slow
signals tend to capture persistent moves but react later, while fast signals
react earlier and produce more false changes. Research on momentum turning
points finds that the intersection of slow and fast directions contains useful
information, supporting a hierarchical multi-horizon state rather than adding
indicators as equal votes.

Backtesting.py documents constrained grid optimization, absolute evaluation
limits, next-open market fills, and partial position closing. Its optimization
examples also warn against overfitting. These are compatible with QuantScope's
existing deterministic bounded-grid architecture.

Sources:

- https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3489539
- https://www.aqr.com/Insights/Research/Alternative-Thinking/Should-Your-Portfolio-Protection-Work-Fast-or-Slow
- https://kernc.github.io/backtesting.py/doc/backtesting/backtesting.html
- https://kernc.github.io/backtesting.py/doc/examples/Parameter%20Heatmap%20%26%20Optimization.html

## Considered Approaches

### Horizon classification

1. Infer the horizon from current numeric parameters.
   - A strategy could change category when a parameter changes.
   - Rejected because strategy meaning and UI grouping would become unstable.
2. Infer the horizon from measured historical holding time.
   - Asset- and date-dependent and would leak backtest results into product
     taxonomy.
   - Rejected.
3. Store an explicit horizon in the strategy registry.
   - Stable, auditable, and shared by the lab, single screen, and combination
     screen.
   - Selected.

### Combined exposure

1. Require both rules to be long and otherwise hold cash.
   - Simple binary intersection.
   - Rejected because a fast false negative can remove the entire long-horizon
     position and defeat the purpose of a core trend.
2. Average two independent votes.
   - Produces similar numeric weights but gives the short rule authority
     outside the long trend.
   - Rejected.
3. Let the long rule gate exposure and let the short rule choose core versus
   full allocation inside the gate.
   - Preserves a core position during short pullbacks while respecting the
     long rule's flat state.
   - Selected.

### Combination search

1. Evaluate the complete Cartesian product of every long parameter set and
   every short parameter set.
   - Most exhaustive.
   - Rejected because the current 31,172 individual candidates would expand
     to an impractical number of pairs and amplify selection bias.
2. Combine only each strategy's single standalone winner.
   - Very small and deterministic.
   - Rejected because a second-best standalone parameter set can interact
     better in a hierarchy.
3. Retain a small fixed number of standalone finalists per strategy, then
   evaluate the bounded Cartesian product of long and short finalists.
   - Preserves several alternatives while keeping the browser workload
     bounded and transparent.
   - Selected with two finalists per strategy.

## Architecture

### Strategy registry

`StrategyDefinition.horizon` is the source of truth. Registry helpers return
the long and short collections, and tests prove every strategy appears exactly
once.

### Allocation backtest

The existing single-strategy engine remains unchanged for binary target and
price-order strategies. A separate pure allocation backtest:

1. validates and clamps aligned targets to `[0, 1]`;
2. applies the prior completed-bar target at the next bar open;
3. buys or sells only the delta required to approach the target allocation;
4. applies commission and slippage to every rebalance;
5. liquidates remaining units at the selected range end;
6. returns the common performance and equity fields used by screening and the
   equity chart.

Combination trade count means allocation-changing rebalances, including the
range-end liquidation. It is not presented as completed round trips or used to
claim a win rate.

### Combination optimizer

The optimizer reuses:

- the shared strategy registry and horizon metadata;
- existing constrained parameter spaces and candidate cap;
- existing scalar screening objectives and deterministic tie-breakers;
- chunked yielding, progress reporting, abort signals, and failure counting.

Stage one retains two best standalone parameter sets for each strategy. Stage
two constructs one combined target for every retained long/short pair and
runs the allocation backtest. Results are sorted by the selected screening
objective.

### User interface

- The strategy selector uses two localized option groups.
- Single-strategy results display a horizon label.
- A dedicated combination section appears below the existing single-strategy
  results.
- The combination section has its own start/stop action, progress, core
  allocation control, ranked result table, and equity/drawdown preview.
- Changing instrument, range, costs, objective, cap, or core allocation clears
  stale combination results.

## Error Handling

- Missing data disables both screening actions.
- An aborted run retains completed combination results when available.
- A failed standalone or pair backtest increments the skipped count without
  stopping the remaining search.
- No long or short finalists produces an empty result with explicit UI copy.
- Invalid, non-finite, or out-of-range core allocation input is clamped in the
  UI and again in the pure combination target builder.

## Non-goals

- No change to market providers, adjusted-price behavior, or data caching.
- No intraday or weekly interval UI.
- No short selling, leverage, risk parity, or multi-ETF allocation.
- No automatic optimization of the core allocation percentage.
- No saved-backtest schema change.
- No claim that the in-sample top combination maximizes future return or
  minimizes future drawdown.

## Verification

- Registry tests cover all 32 strategies exactly once across the two horizons.
- Pure target tests prove the 0/core/full hierarchy, alignment, clamping, and
  prefix invariance.
- Allocation tests prove next-open rebalancing, costs, partial exposure, and
  range-end liquidation.
- Optimizer tests prove bounded finalists, deterministic ordering, progress,
  cancellation, and no long/short role reversal.
- Render tests prove grouped strategy options and the combination section are
  present below the single-strategy results.
- Full verification runs `npm test`, `npm run lint`, `git diff --check`, and a
  real local browser workflow.
