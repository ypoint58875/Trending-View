# Two-Layer Positioning Design

## Goal

Make the shortcut save action visible where saved strategies are consumed,
give single and combination screening independent configuration, and replace
core/maximum/tactical position terminology with an explicit long layer A and
short layer B.

## Position Rules

For a dual-horizon plan:

| Long target | Short target | Planned allocation |
| --- | --- | --- |
| Flat | Any | 0 |
| Long | Flat | A |
| Long | Long | A + B |

The long transition from long to flat clears the complete position. A short
transition from long to flat while the long target remains active removes only
B. Every historical buy, sell, add, or reduce signal shown by the manual
workspace executes at the following bar's open, including strategies that also
have internal predefined price-order references.

The live guidance uses an explicit `Asia/Shanghai` 15:00 cutoff. Before 15:00
it labels the action for the current day's tail session; at or after 15:00 it
labels the action for the next trading day's open. Historical metrics always
use following-open execution and do not change with page-open time.

For a long-only plan, the long target switches between zero and A. For a
short-only plan, the short target switches between zero and B.

Both allocations are bounded from zero through 100%, and A+B may not exceed
100%.

## Combination Optimization

The combination screen owns its own optimization objective and maximum
parameter combinations per strategy. It retains the existing two-stage
search:

1. rank standalone parameter candidates and retain two finalists per strategy;
2. compare every retained long/short pair across the bounded A/B choices.

The automatic A/B choices use positive 20% steps and require A+B no greater
than 100%, producing ten pairs. Every pair is replayed through the
partial-allocation backtest so costs, return, drawdown, Sharpe, and rebalance
count reflect the actual holding plan. All user-facing historical strategies
use following-open execution.

Every ranked result displays A and B and retains Apply. Apply restores both
strategies, both parameter sets, A, and B, then scrolls to the trend chart.

## Save Shortcut

The shortcut panel exposes one persistent “Save current strategy” action above
the saved rows. It writes the complete current strategy plan and backtest
settings through the existing D1 route, then inserts or updates the shortcut
row immediately. The duplicate lower-lab save action is removed.

Saved plan JSON writes `longAllocation` and `shortAllocation`. The parser
accepts the prior `coreAllocation`/`maximumAllocation` shape and converts it to
the new representation. The D1 table and ownership rules do not change.

## Copy and Layout

- Rename “One-click screening” to “One-click single strategy”.
- Remove core, maximum, tactical, and holding-controller terminology from the
  active UI.
- Label A as the long-horizon initial position and B as the short-horizon
  added position.
- Give the combination introduction the same objective and parameter-cap
  controls as the single-strategy introduction.

## Verification

- Pure truth tables for dual, long-only, and short-only targets.
- Bounds and backward-compatible saved-plan parsing.
- Ten deterministic A/B screening choices and progress totals.
- Source-render checks for the shortcut save action, renamed single screen,
  independent combination controls, and removed tactical terminology.
- Full build, lint, local persistence round trip, and browser interaction.
