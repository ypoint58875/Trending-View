# Technical research: Nikkei 225 moving-average slope conditions

Access date: 2026-10-03.

## Approaches compared

### A. Quantile cells and fixed-threshold conjunctions

Fit slope boundaries only in a training sample, express every rule as readable
percent-per-session conditions, and apply the frozen conditions to later data.
This approach is transparent, easy to audit, and directly answers questions
such as “SMA(3) slope is at least X while SMA(10) slope is at least Y.” Its main
weakness is sparse samples as the number of simultaneous conditions increases.

### B. Logistic and quantile regression with interactions

Fit a logistic model for the probability of a positive forward return and a
robust or quantile regression for magnitude. Continuous predictors use data
more efficiently than discrete cells, and interaction terms can represent
multiple moving averages. The result depends more heavily on functional-form,
regularization, calibration, and feature-selection choices, making it less
auditable for this first study.

### Decision

Approach A is the primary implementation because the user asked for explicit
slope thresholds and combinations of up to five moving averages. A fixed
SMA(3)-by-SMA(10) quintile table provides the requested two-average example.
The program chooses one direction and threshold for each declared moving
average in training, exhaustively searches all one-through-five combinations
of those frozen predicates in validation, and reports only untouched holdout
performance as evidence. Regression remains a possible robustness extension.

## Statistical controls

- Close-derived slopes are observable only after the session closes. Tradable
  tests enter at the next session open.
- Overlapping daily events are descriptive. Inferential results use a single
  non-overlapping position and stationary bootstrap on the trade sequence.
- Time splits include training through 1999, validation from 2000 through
  2015, and an untouched holdout from 2016 onward.
- Multiple comparisons are visible through the complete validation-search
  table. Bootstrap p-values receive an exploratory Benjamini-Hochberg
  correction; final interpretation remains based on holdout effect intervals.
- White Reality Check or Hansen SPA would be the preferred heavier extension
  for testing the entire strategy family against a common benchmark.

## Primary sources

- Nikkei official profile and historical-data entry:
  https://indexes.nikkei.co.jp/en/nkave/index/profile?idx=nk225
- Nikkei data coverage and licensing:
  https://indexes.nikkei.co.jp/nkave/data/index.en.html
- Nikkei Stock Average guidebook:
  https://indexes.nikkei.co.jp/nkave/archives/file/nikkei_stock_average_guidebook_en.pdf
- Newey and West, heteroskedasticity/autocorrelation-consistent covariance:
  https://www.nber.org/papers/t0055
- Politis and Romano, stationary bootstrap:
  https://doi.org/10.1080/01621459.1994.10476870
- White, Reality Check for data snooping:
  https://doi.org/10.1111/1468-0262.00152
- Hansen, Superior Predictive Ability test:
  https://doi.org/10.1198/073500105000000063
- Sullivan, Timmermann, and White, technical trading rules and data snooping:
  https://www.fmg.ac.uk/publications/discussion-papers/data-snooping-technical-trading-rule-performance-and-bootstrap

