# Technical research

## 2026-10-20 SOX 200-session directional proportions

Reuse `dailyDirectionBlocks` with a separate SOX source namespace and outputs.
Compare official Nasdaq identity/history against the existing Yahoo index-chart
adapter pattern. Nasdaq provides authoritative identity/methodology, but full
history can require additional access; Yahoo exposes the required long daily
index history without credentials and matches the previous Nikkei source style.
Use Yahoo `^SOX` daily unadjusted closes, validate INDEX identity and New York
session dates, retain raw JSON and disclose the provider. The official identity
is SOX (PHLX Semiconductor Sector), not a semiconductor ETF or XSOX total return.
References checked 2026-10-20:
https://indexes.nasdaq.com/Index/Overview/SOX
https://indexes.nasdaq.com/Index/Overview/XSOX

Use the same calendar endpoints as the prior Nikkei table (2000-01-04 through
2026-10-13), but 200 own-market trading sessions per block. Independent blocks
do not have identical Japan/US date boundaries. Initial download includes a
December-1999 preceding close. Later refresh uses a fourteen-calendar-day
overlap, keeps accepted dates locked, reports revisions, and appends only new
dates. Reuse complete fixed snapshots without a refresh; use explicit --refresh
for a new access or --offline for guaranteed local-only replay. No extra paid
provider or index proxy is needed. Missing/invalid dates are not invented.

## 2026-10-20 internal countertrend excursions versus MA turns

Scope correction before implementation: the user explicitly identified the
802 isolated up days and 883 isolated down days in the completed daily-run table.
Use consecutive daily runs as the primary population, not peak-recovery
excursions. The excursion alternative below is design background only and is
not implemented by the delivered singleton study. For each run, use the MA sign
on the preceding close as context. A countertrend run is internal only if the
MA keeps that direction throughout the run and its confirming reversal day;
an opposite MA sign anywhere in that window is turn-associated. Retain flips
that reverse again on confirmation as transient, rather than implying a lasting
trend reversal. Keep same-trend and flat/unavailable contexts separately.

Split isolated up/down amplitudes separately into empirical terciles over the
fixed snapshot. These are descriptive full-sample groups, not fitted predictive
thresholds. Lower edges inclusive, upper exclusive; tied edges may unbalance
counts. Joint tables cross these groups with SMA7/SMA20 contexts and retain
the original completed-run IDs, parent MA interval IDs, daily patterns and dates.
Future returns start at the pattern-confirming next close, never at the center
day whose following reversal is already part of the definition.

Compare two definitions before implementation. Consecutive daily opposite-sign
runs are simple and link to daily statistics, but one small intervening price
bounce splits the same unrecovered pullback. Anchor-based excursions retain
all fluctuations from an observed trend peak/trough until recovery or an MA
direction change; use this as the main definition, with daily/run counts as
linked context. No magnitude cutoff defines either SMA trends or excursions.

Initialize the running extremum at the first close where the MA direction is
known. For the next bar, evaluate the old trend's excursion before changing
state. Recovery while the MA retains direction is internal; an opposite MA
sign before recovery is a turn-associated excursion, ending on the confirmation
bar. Flat-MA transitions, recovered-on-turn boundaries and unfinished events
remain separate. Turns without an opposing price excursion must not be forced
into one of the four price-move classes. Classification describes an MA sign
change, not a confirmed lasting bull/bear regime.

Use existing SMA interval IDs to join each event to its parent single up/down
interval, its net return, daily up/down counts and consecutive daily runs. The
turn confirmation bar belongs to the next MA interval in the old interval
table, but is included only as a separately dated confirmation endpoint for
the old trend's excursion. Never sum these overlapping endpoint returns.

For causal threshold evidence, omit the recovery/turn resolution bar. Fit
quantiles using only excursions resolved by 2009, then count each later
episode's first pre-resolution crossing. Relative amplitude denominators use
only the parent trend gain/loss accumulated at the known peak/trough, never
the parent's future final return. Invalid denominators remain in raw summaries
but not ratio metrics. Report counts, recall, precision, coverage and lead time;
this is not a return backtest. Later historical dates have been inspected before.
Chronological evaluation reference rechecked 2026-10-20:
https://otexts.com/fpp3/toolbox.html . Nikkei index identity reference:
https://indexes.nikkei.co.jp/en/nkave/index/profile?idx=nk225 .

## Adaptive partitions, exclusion and passive benchmark (current)

The user requires data-derived groups, per-group relative thresholds, prediction
quality and net performance versus holding. The 5%-10% range was only an example.

Equal-frequency groups versus one-dimensional clustering: quantiles are transparent
and maintain bounded sample counts; clustering can isolate regimes but can create
sparse tails and adds a model-count choice. Use early-only quantiles, maximum four
groups/minimum thirty references, reducing group count on ties; separate up/down.

Independent continuation-frequency selection versus joint portfolio optimization:
frequency ignores account state, gaps and payoff asymmetry; portfolio optimization
incorporates signals, exposure and fees. Use bounded validation-CAGR coordinate
search for the main schedule; publish accuracy-first rules separately. Training
peak-ratio quantiles generate candidates; group ranks differ. All attempts persist.
Chronological evaluation and simple benchmarks follow Forecasting: Principles and
Practice, rechecked 2026-10-15: https://otexts.com/fpp3/toolbox.html .

Small-reference exclusion compares zero/one/two lowest learned groups without
inventing an absolute cutoff. Exclusion suppresses relative orders on both sides,
so positions can remain invested; invalid-positive-reference MA exit remains.

Retrospective three-leg merging knows the final countertrend amplitude too early.
A causal alternative holds a countertrend pending, confirms its end on the next
MA turn, and absorbs it only when the original direction resumes and the final
amplitude is below a frozen training boundary. Earlier executed signals cannot
be removed. Anchors, confirmation delays, partitions and thresholds all require
refitting. Only exclusion is implemented here; merging remains a research design.

The 2016+ dates were inspected in older studies, so the revised result is not an
untouched holdout. Do not expand the search until it wins or claim significance.
Small-denominator explosions, rare triggers and all unsuccessful variants remain
visible. Net outperformance and prediction accuracy are separate measurements.

## Earlier adjacent-interval relative operations

The user clarified that both entries and exits must be triggered by the relative
ratio, and that thresholds must be conditioned on the preceding interval's
magnitude, explicitly including the 5%-10% group. This supersedes the provisional
MA-entry/relative-exit experiment described during implementation; that
provisional policy is not the delivered executable model.

SMA(7)/SMA(20) slope still defines independent intervals. Connect only directly
adjacent opposite intervals, with a completed prior interval whose actual return
matches its label. Do not filter the next interval by its eventual outcome.
The primary ratio is current opposite return percentage divided by absolute
previous interval return percentage. For 100 -> 105 -> 102.9 this ratio is 40%;
point retracement is 42%. Keep these conventions separate, and reject zero
denominators. A 100% percentage-return ratio is not exact recovery of the old
starting price.

Group by prior absolute return: [0,1), [1,3), [3,5), [5,10), [10,20), [20,+inf).
First publish full adjacent-pair distributions and incomplete/excluded counts.
Derive candidate ratios from the 2000-2009 positive maximum opposite-ratio
distribution within each MA/direction/group. Below ten positive group
observations, explicitly borrow the pooled distribution and record both local
and estimation sample counts; never claim an independent group estimate.

Compare two approaches:
1. First-crossing remaining-interval analysis estimates further extension or
   reversal through the new interval's end, rather than an arbitrary 20-day
   horizon. It directly answers the relative-movement question but does not prove
   profitable operation.
2. A causal long/flat policy buys on the next open after the rebound ratio crosses
   its bucket-specific entry threshold, and sells on the next open after the
   retracement ratio crosses its exit threshold. The sell line can protect a
   profit or realize a loss depending on the actual entry cost. It is not a
   separate fixed profit target. No unrequested initial fixed stop is added.

Use both. For the executable model, choose one entry quantile rank and one exit
quantile rank using 2010-2015 Calmar, with at least 20 completed validation trades.
Apply those ranks to each group's early fitted distribution. This avoids
selecting a hindsight maximum for every tiny group. The full 5-by-5 grid is
published for both MA periods. Entry participation is disclosed, not constrained
to match MA-only operation: the user's threshold-entry requirement deliberately
filters opportunities. That replaces the provisional 60% participation gate
that belonged to the earlier MA-entry experiment.

Evaluate the frozen schedule from 2016 onward. All these dates have appeared in
prior research, so do not call this an untouched holdout. Compare with MA-only
operation under the same valid-prior-denominator condition, and with identical
threshold entries followed by MA exits. Report 0/5/10 bps per-side cost proxies,
every trade, daily marked equity, entry/exit bucket cohorts, and open positions.
Cohorts are conditional trade summaries, not standalone portfolio returns.
When an up interval actually lost price and cannot provide a valid gain
denominator, an existing long exits next open on that down-turn confirmation;
the fallback reason is separately recorded. Do not silently retain an unusable
reference or use a future amplitude.

Daily close signals are preferred over intrabar stops here to follow the
project's causal execution pattern and avoid unknown daily high/low ordering.
MA confirmation itself lags: a small ratio may already have been exceeded when
the new interval becomes knowable. Publish nominal and first-observed ratios,
and actual next-open fills; never assume an execution exactly at the drawn
trigger line. Finer intrabar data alone cannot remove MA endpoint hindsight.

The defined evaluation screen requires sufficient completed trades, positive
cost-stressed returns, improved Calmar versus both controls, and no deeper
drawdown than MA-only operation. This is a declared research comparison, not a
universal utility function. A return/drawdown tradeoff can be interesting without
passing this stricter screen, but cannot establish a unique suitable real-trade
threshold for an unspecified risk budget. Do not widen the declared candidate
grid after reading evaluation results.

Planned writes remain exclusively inside this study: relative configuration and
isolated Chinese copy, adjacent-pair and operation modules, the new generator,
relative tests, prefixed output artifacts, and linked README/state/feature/
pipeline/source/cache documentation. Preserve all earlier delivered reports and
parent application files.

Primary sources checked on 2026-10-15:
- https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-15
  distinguishes stop triggers from actual execution prices.
- https://www.tradingview.com/support/solutions/43000786181-broker-emulator/
  documents causal fills and execution costs.
- https://www.tradingview.com/support/solutions/43000669285-what-is-bar-magnifier-backtesting-mode/
  explains limits of daily intrabar fill assumptions.
- https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf
  discusses parameter selection and overfitting.

## MA-defined intervals: revised research question

The revised user requirement is to define upward/downward intervals first,
measure their empirical distributions second, and only then analyze return
thresholds. The user explicitly selected moving averages such as 7 and 20
sessions to reduce daily noise. Percentage reversal thresholds must not define
these intervals.

Compare two interval definitions:

1. Consecutive close-to-close signs require no magnitude threshold and are fully
   reproducible, but small daily fluctuations create many one-session intervals.
2. Consecutive SMA-slope signs retain a threshold-free direction rule while
   smoothing noise. They lag price reversals and can label a price-losing
   interval as MA-up, so report actual price-direction agreement rather than
   assume every interval matches its MA label. Use SMA(7) and SMA(20), without
   selecting whichever gives the best result.

The user selected approach 2. A positive change in SMA(N) defines MA-up, a
negative change defines MA-down, and exact equality is neutral. Consecutive
equal direction labels define an interval. Price return is measured from the
close immediately before its first labeled session. An interval is completed
only when a later session changes its label; its confirmation date is distinct
from its final labeled date. Initial history warms the SMA; omit intervals that
start before the analysis boundary, and retain the latest unfinished interval
separately.

Stage 1 summarizes counts, time share, actual price-direction agreement, signed
price magnitude, duration and empirical quantiles. Stage 2 derives candidate
amplitudes from the completed, direction-aligned interval distributions available
through 2015. Quantile ranks specify where to inspect a distribution; no numeric
return threshold is chosen before measuring it. Freeze those numeric values
when evaluating 2016 onward. Also publish all-sample descriptive results.

For each interval and threshold, record its first observed close reaching the
threshold in the MA-labeled direction. Include intervals whose eventual price
return disagrees with the MA direction and the unfinished interval; do not
filter events using their eventual outcome. The event is observable at its close.
Measure opposite-direction terminal probability and conditional magnitude after
1/5/10/20/60 sessions. Do not call eventual interval reversal a prediction: a
completed-interval definition would make such a probability tautological.
Publish continued-direction losses, unconditional benchmarks, sparse counts,
subperiods and non-overlapping event sensitivity. These are exploratory
historical frequencies, not calibrated predictions or a parameter search.

Implementation stays within this study: new `interval-config.json`,
`interval-copy.zh-CN.json`, `analyze-intervals.mjs`, `lib/intervals.mjs`,
`lib/interval-report.mjs`, interval tests, `output/ma-interval-*` artifacts, and
linked README / study documentation. Existing daily-analysis outputs are kept as
supplementary context. No parent application file changes.

References checked on 2026-10-15:

- https://www.tradingview.com/support/solutions/43000591664-zigzag-indicator/
  explains retrospective pivot confirmation; it is a contrast, not the chosen
  segmentation algorithm.
- https://link.springer.com/article/10.1007/s10462-022-10307-0
  discusses percentage-defined directional-change events; these do not satisfy
  the revised threshold-free segmentation requirement.
- https://otexts.com/fpp3/toolbox.html for chronological evaluation, benchmark
  comparison and separating descriptive fit from forecast evidence.

Research access date: 2026-10-15 (Asia/Shanghai).

## Compared approaches

1. Fixed empirical conditional distributions: group completed daily observations
   by observable trend and fixed daily-return buckets. Estimate terminal return,
   positive/negative conditional magnitude, and intrahorizon high/low excursions.
   This directly answers magnitude and directional-expectation questions, makes
   sparse cells visible, and requires no fitted coefficients. Its weaknesses are
   overlapping outcomes, regime instability, and limited extreme-event samples.
2. ARIMA mean plus GARCH volatility forecasts: mature implementations can estimate
   time-varying volatility and simulate forecast distributions. They share the
   need for chronological evaluation and uncertainty reporting. They use data
   more continuously but add distributional assumptions, parameter estimation,
   dependencies, and selection risk; volatility forecasts alone do not establish
   a directional edge.

Choose approach 1 for this first standalone study. Freeze bins and trend rules
before calculating results; use expanding-time availability inside a bounded
2,520-session lookback. Compare chronological forecasts against unconditional
positive-return probability, always-up direction, and zero-return point forecasts.
Do not optimize on evaluation results or describe them as an untouched holdout:
these dates have already been used by the separate earlier research project.

## Data approaches

- Reuse the existing local Yahoo-normalized CSV read-only, preserve a copy and
  original acquisition metadata, and incrementally request its trailing overlap.
  This preserves provenance and avoids another full-history request.
- Download the publisher CSV as the only dataset. Publisher identity is stronger,
  but the free window is short and its reproduction notice restricts retention.
  Use it in memory only to cross-check the Yahoo overlap and latest available
  date. Do not splice provider prices into the canonical history.

## Primary sources checked

- Nikkei profile and index definition:
  https://indexes.nikkei.co.jp/en/nkave/index/profile?idx=nk225
- Nikkei download center and daily CSV:
  https://indexes.nikkei.co.jp/en/nkave/index?type=download
  https://indexes.nikkei.co.jp/nkave/historical/nikkei_stock_average_daily_en.csv
- Nikkei data provision / permissions:
  https://indexes.nikkei.co.jp/nkave/data/index.en.html
- Forecasting: Principles and Practice, chronological evaluation and baselines:
  https://otexts.com/fpp3/toolbox.html
- Forecasting: Principles and Practice, forecast distributions:
  https://otexts.com/fpp3/prediction-intervals.html
- arch project, analytical/simulation/bootstrap volatility forecasting:
  https://arch.readthedocs.io/en/latest/univariate/forecasting.html

## Interpretation controls

Full-sample tables are descriptive. Current outlook uses historical events whose
entire horizon has ended. Evaluation origins are spaced by the forecast horizon
so their future return intervals do not overlap; training samples still overlap.
Empirical 10th/90th percentiles are reference outcome ranges, not confidence
intervals for the mean, guaranteed coverage, or calibrated future probabilities.
No p-values or independent-binomial confidence intervals are asserted. Wave
pivots are dated retrospectively and separately record reversal confirmation.
No trading-profit or cost-adjusted edge is claimed from close-anchored returns.
