# Strategy Plan and Commodity Support Design

> The allocation model is superseded by
> `2026-07-25-two-layer-positioning-design.md`. Commodity support and saved
> JSON compatibility remain current.

## Goal

Turn hierarchical screening results into directly applicable strategy-lab
plans, make position control an explicit and optimizable part of those plans,
allow either horizon to operate independently, preserve saved plans, and add
daily commodity futures quote proxies alongside the existing index/ETF scope.

## Strategy Plan Model

A strategy plan contains:

- an optional long-horizon strategy and its complete parameters;
- an optional short-horizon strategy and its complete parameters;
- core allocation in `[0, 1]`;
- maximum allocation in `[0, 1]`, with core no greater than maximum.

At least one strategy must be selected for a runnable plan.

### Allocation truth table

When both strategies are selected:

| Long target | Short target | Allocation |
| --- | --- | --- |
| Flat | Any | 0 |
| Long | Flat | Core allocation |
| Long | Long | Maximum allocation |

When only the long strategy is selected, its long/flat target controls
maximum/zero allocation. When only the short strategy is selected, its
long/flat target controls maximum/zero allocation. The unused core allocation
does not alter a single-horizon plan.

Every close-derived allocation target executes no earlier than the following
bar open. A multi-strategy or partial-allocation plan does not combine
component intrabar stop contracts.

## Position Optimization

One-click combination screening evaluates the fixed core-allocation ladder:

```text
0%, 20%, 40%, 60%, 80%, 100%
```

Maximum allocation remains 100% during screening. This makes the resulting
holding mode interpretable:

- `0%`: the long rule identifies the valid trend; the short rule controls
  flat/full timing.
- `100%`: the long rule starts and maintains full planned exposure; the short
  rule does not reduce exposure.
- intermediate: the long rule maintains core exposure and the short rule adds
  or removes the tactical sleeve.

The allocation ladder is evaluated after the existing standalone-finalist
stage. Progress totals include every strategy candidate and every
long-finalist by short-finalist by allocation evaluation.

## Apply Workflow

Every combination result row exposes Apply. Applying a result:

1. selects the result's long strategy and parameters in the long selector;
2. selects the result's short strategy and parameters in the short selector;
3. sets core allocation to the optimized value;
4. sets maximum allocation to 100%;
5. leaves the completed screening results visible for comparison.

The strategy lab recalculates immediately.

## Strategy Lab

The previous single mixed selector becomes two selectors:

- long-horizon strategy, with a None option;
- short-horizon strategy, with a None option.

Each selected strategy has an independent parameter block. The lab exposes
core and maximum allocation inputs. Maximum allocation is used by every plan;
core allocation is active only when both horizons are selected.

The main chart renders the necessary price-reference lines for both selected
strategies with horizon-qualified legend prefixes. Allocation rebalances
render as buy/increase, sell/reduce, and range-end markers.

Single-strategy full-allocation plans keep the existing hybrid execution path,
including intrabar price orders. Multi-strategy or partial-allocation plans use
the next-open allocation engine. The stability diagnostic remains available
only for a single full-allocation strategy because its current evidence model
does not represent two linked parameter neighborhoods.

The live guidance card reports the current target allocation and whether the
newest dynamic bar increases, reduces, holds, or keeps zero exposure.

## Persistence

Saved backtests gain a nullable strategy-plan JSON column. New records always
store the complete plan while retaining the existing primary strategy and
parameter columns for compatibility. Reading a legacy row with no plan derives
a one-strategy plan from the stored strategy's horizon and uses 100% maximum
allocation.

Commodity instruments are valid saved records. The existing owner/provider/
instrument uniqueness rule remains unchanged.

## Commodity Support

`MarketAssetType` adds `commodity`.

Yahoo search maps:

- `INDEX` to `index`;
- `ETF` to `etf`;
- `FUTURE` to `commodity`;
- every other quote type to rejection.

A deterministic Yahoo-backed catalog ensures direct discovery of:

| Name | Symbol | Type |
| --- | --- | --- |
| Gold Futures Proxy | `GC=F` | commodity |
| Silver Futures Proxy | `SI=F` | commodity |
| Crude Oil Futures Proxy | `CL=F` | commodity |
| Copper Futures Proxy | `HG=F` | commodity |

Chinese search aliases are stored in localized UI copy and canonicalized before
the API request. Remote Yahoo futures outside the catalog remain discoverable.

Yahoo is the only history provider for a `commodity` instrument. Nasdaq
fallback is skipped. The chart and footer disclose that futures quotes are
research proxies and that contract roll, multiplier, margin, expiry, and
delivery are not modeled.

## Non-goals

- No spot-price provider.
- No futures contract chain, roll schedule, or back-adjustment engine.
- No margin, leverage, multiplier, delivery, or tax accounting.
- No automatic position sizing from volatility or account risk.
- No multi-asset portfolio.
- No intraday UI.
- No change to strategy or indicator formulas.

## Verification

- Pure truth-table and validation tests for optional plans, core/maximum
  allocation, and allocation guidance.
- Combination optimizer tests for the six position candidates, deterministic
  ranking, progress totals, and cancellation.
- Apply/source rendering tests for the new result action and dual selectors.
- Save-parser and API-source tests for new plans and legacy plan derivation.
- Commodity catalog, Yahoo `FUTURE`, market-route, and saved commodity tests.
- Real Yahoo daily history for gold and silver.
- Real browser checks for Apply, dual parameter blocks, target allocation,
  commodity search, desktop layout, and narrow layout.
