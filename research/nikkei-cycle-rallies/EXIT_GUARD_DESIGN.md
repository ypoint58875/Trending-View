# Deferred-exit trend guard experiment

This is retrospective research, not a production change. Freeze the existing
298 original selections, source bars, costs, close-proxy execution and SMA12
flat-account supplemental entry. Do not rerank strategies or split capital.

The user limited the longest guard average to 12 sessions during this study.
This supersedes the initial 12/20/40/60 exploratory menu; do not recommend its
longer averages or include their retained derived ledgers in the current summary.
Compare 30 fixed guards: SMA periods 7/8/9/10/11/12 crossed with daily normalized
slope > 0/0.1%/0.2%, close > SMA, and both close > SMA and slope > 0.
Slope is SMA(t)/SMA(t-1)-1, not a screen-coordinate angle. Conditions use only
completed bars. Missing warmup data cannot block an exit.

For the primary rules, original reductions are postponed while the guard is
true. Store the lowest pending target. Evaluate it on every subsequent close,
including skipped screening dates; execute once the guard fails. An original
increase cancels stale pending reductions and uses the shared signal resolver.
The existing reduce-then-increase hold exception remains. A same-day original
signal still blocks supplemental entry, even if unfilled. A guard never opens
a flat account and never forces an exit without an original pending reduction.

Primary scope protects all actual holdings. Add one diagnostic protecting only
supplement-initiated holdings and one discarding vetoed exits instead of storing
them (SMA12 both condition). Original entry ends supplemental-only ownership.
These diagnostics expose policy differences rather than silently changing them.

After the primary grid, add two explicit SMA12 slope-0.1% stability diagnostics:
arm above 0.1% and release only at nonpositive slope (hysteresis), or require
two consecutive bars at/below 0.1% to release. These use a causal daily trend
state, not a delay to the original two-bar screening signal. They are secondary
same-sample experiments and must not be represented as prespecified holdouts.

Reconcile the no-guard replay against SMA12 return and every executed target;
compare original cycle10, SMA12, prior 40/80 and holding on identical data.
Report full return/drawdown, fill count, inclusive positive-after-close coverage,
range returns, fixed subperiods, next-open sensitivity and exit-delay events.
No range boundaries or future prices enter decisions. All these data have
already been examined, so subperiod diagnostics are not independent holdouts.

Bounded input/cache checks and atomic outputs reuse existing study patterns.
At most 34 variants x 10000 bars are replayed sequentially; interrupted runs
can be rerun idempotently from the source-verified signal cache. A per-variant
checkpoint is unnecessary for this short calculation; summary commits last.
Keep frozen inputs; derived outputs are regenerable with no automatic deletion.

Approaches compared: slope-only is simple but can lag a sharp decline; price-only
responds to a break sooner but can whipsaw; their conjunction protects only when
both trend direction and price location agree. Pending exits avoid losing the
original sell request. None establishes a maximum loss or guarantees trend capture.

References accessed 2026-10-24: AQR trend-following research supports investigating
trend persistence, not these precise rules or thresholds:
https://www.aqr.com/insights/research/journal-article/a-century-of-evidence-on-trend-following-investing.
Repeated selection on the same sample is subject to backtest overfitting:
https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf.
