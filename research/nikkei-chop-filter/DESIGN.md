# Frozen-v8 whipsaw parameter screen

Research only. No application/controller/account/provider/engine changes.

## Sources and baseline

Reuse ../nikkei-overlay-stability/data/full-screen-6-15/{input,signals}.json.
Validate JSON/source/bar hashes and all decision indices. Read at most16MiB per
file,10000 bars and2048 decisions. Freeze v8 DEFAULT_POSITION_OVERLAY_OPTIONS.
The baseline must exactly reproduce the archived2000-session target path and
440.9807031454993% close-proxy return before interpreting candidates.

## Compared approaches

Post-processing a baseline target path is rejected: suppressed orders would
leave the overlay's entry age, stop price and pending reductions attached to
trades that never executed. Instead run the production controller from the
accepted account state on every day. Checkpoint before each decision, then
commit accepted orders. A blocked entry preserves real entry/flat/recovery
state; a blocked ordinary reduction retains its pending target. Daily close
markers still advance. Early4% and prior-ATR2 shock exits always bypass filters.
All rules apply to completed closes. Main execution retains the existing Nikkei
close proxy; selected next-open sensitivity is reported separately.

ER measures net displacement/total absolute movement. Low Bollinger bandwidth
measures small fluctuations, not necessarily lack of trend. Compare the two
independent methods and an ER-only control before any combined model.

Primary references accessed2026-11-05:
- https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/kaufmans-adaptive-moving-average-kama
- https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/bollinger-band-squeeze

## Declared153 candidates

- Baseline1.
- Regime108: ER periods10/20/30; ER ceilings0.15/0.25/0.35; BB20 width rank
  ceilings0.20/0.35/0.50; confirmation2/3 consecutive eligible close decisions;
  scope entry/increase-only or both ordinary directions.
- ER-only control36: same ER/confirmation/scope grid, no width condition.
- Price buffer8:0.25/0.50/1.00/1.50 times prior ATR14, entry-only or both.

Bandwidth is4 population-standard-deviations/SMA20. Rank compares today's
width with the preceding252 valid widths, excluding today. No filter before
warmup. Regime confirmation is required only while regime is active; an
opposite/no-op request resets the waiting count. A close outside the previous
20-session high/low channel bypasses regime confirmation for the matching
direction, without generating a new strategy signal. Buffer candidates anchor
at the first suppressed ordinary request's close and prior ATR14; the same
direction must remain requested and price must move at least the specified
distance in that direction. Opposite/no-op requests discard the anchor.

## Selection frozen before results

Run one continuous2000-day account. First1000 sessions are development;
next500 are validation; last500 are conditional historical audit. The dataset
and v8 policy have been repeatedly studied, so this is not an untouched holdout.
Within each family, training eligibility requires >=10% fewer fills, return
no more than3 percentage points below baseline, and drawdown no more than3
points worse. Validation additionally requires >=10% fewer fills, return at
least baseline, and drawdown no more than2 points worse. Among admissible
candidates select highest validation return, then fewer fills, then stable ID.
If none qualify, select baseline for that family. Audit never enters selection.
Also disclose validation-return leader when no candidate qualifies, labelled
unqualified; report all rows rather than tuning thresholds after inspection.

Metrics: net return, max drawdown, fills and turnover on full/train/validation/
audit, fixed250-session blocks, gross-cost difference, baseline closed-roundtrip
profit/holding duration under a predeclared ER20<=.25/width-rank<=.35 diagnostic,
and missed fixed20-session price-up>=5% blocks (descriptive only).
Selected policies: actual3bps commission+2bps slippage;0 and20bps/side sensitivity;
next-open sensitivity and gross/net results. Keep risk exits and normal execution
semantics distinct. No deployment follows automatically from a high return.

## Persistence and resource limits

Single process, no unbounded queue or cache. Reuse finite indicators, keep only
153 compact rows and one live replay. RSS ceiling1.5GiB. Atomic row checkpoints
after every candidate, keyed by source/design/implementation hashes. Explicit
signals stop between candidates; --limit N provides bounded interruption tests.
Rerunning resumes only a validated contiguous completed prefix. Incompatible
identity fails without overwriting it. Raw backups/provenance live in ignored
data/; derived grids/ledgers in ignored output/. RESULTS.md is the compact report.
