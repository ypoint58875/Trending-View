# Descending OHLC sequence results

## Scope

Add one exit to the complete current v7 account; do not run the added rule as an
independent strategy. Frozen2000 sessions:2018-08-09..2026-10-26, unchanged
winners, execution costs and native overlay rules.193 configurations produce138
distinct target paths. None strictly improves both full2000 and final500 returns.
Production rules, browser accounts, market input and engine queues are unchanged.

For N=3..6, require N observed prices with N-1 strict consecutive decreases in
one selected OHLC field. Equal prices break the sequence. Evaluate on day N
close and recheck rolling windows on subsequent held days. Main results use
the Nikkei close proxy, not retrospective open fills.

## Unfiltered unconditional risk-priority exits

| Field | Sessions | Full2000 | Final500 | Max drawdown | Added forced exits |
|---|---:|---:|---:|---:|---:|
|Baseline|--|393.14%|98.14%|10.88%|0|
|Open|3|137.36%|37.71%|14.28%|92|
|Open|4|216.91%|65.99%|10.96%|45|
|Open|5|333.95%|89.79%|14.57%|17|
|Open|6|354.95%|94.45%|13.08%|6|
|Close|3|78.55%|15.24%|15.57%|101|
|Close|4|254.36%|87.08%|10.96%|40|
|Close|5|353.27%|88.36%|12.99%|13|
|Close|6|363.30%|94.58%|13.23%|4|
|High|3|120.99%|29.05%|15.57%|96|
|High|4|279.36%|74.35%|8.56%|42|
|High|5|324.65%|83.12%|10.92%|16|
|High|6|374.13%|88.96%|10.88%|5|
|Low|3|122.70%|26.94%|16.47%|89|
|Low|4|248.46%|85.00%|11.27%|38|
|Low|5|319.35%|85.00%|11.40%|17|
|Low|6|351.43%|94.58%|10.88%|4|

Three-session exits create89..101 additional forced exits and materially damage
both returns. Longer sequences trade less but are not universally safer:
five-open drawdown14.57% exceeds four-open10.96%. Choosing N alone cannot
guarantee less whipsaw or a better drawdown path.

## Priority and RSI: four descending highs

| Added exit policy | Full2000 | Final500 | Max drawdown |
|---|---:|---:|---:|
|Guarded, native buy wins, native hold/trend protection|299.94%|83.63%|10.92%|
|Force only without any original signal|286.93%|87.96%|9.36%|
|Unconditional force|279.36%|74.35%|8.56%|
|Unconditional force plus falling RSI14|303.01%|85.82%|8.56%|

This family can lower close-proxy drawdown, but the improved drawdown is bought
with substantial return losses. Falling RSI filters added exits only, preserving
existing native stops. The filtered version has36 new forced exits versus42.
Under next-open execution it becomes292.97%/83.71%/DD10.41%, compared with the
matching next-open baseline401.61%/97.42%/DD9.44%; its drawdown advantage reverses.
Omitting one shape-action date can raise its close-proxy drawdown to10.21%.

## Highest full-return candidate and concentration

Open prices decreasing across five sessions, combined with a prior14-session
RSI14 reading>=70 and RSI falling today, yields394.43%/98.14%/DD10.88%.
The three priorities generate the same target path here; the guarded request
executes immediately because its protections allow it. This is a full-return
gain of1.28 percentage points, not a strict final500 improvement.

Only one new exit occurs:2023-07-07. Suppressing that action date allows the
rolling sequence to trigger on2023-07-10 instead, reducing full return to391.39%.
Thus a leave-one-action-date test does not reset to baseline: it can create a
later action. This single-episode timing dependence is weak promotion evidence.

Next-open sensitivity also reverses the apparent gain:397.70%/97.42%/DD10.15%
versus matching baseline401.61%/97.42%/DD9.44%.

The first1500-only return winner is three descending highs with no-signal force
and recentRSI>=70/falling: first1500 return155.38% versus148.88% baseline, but
final50061.89% versus98.14%. Repeated historical screening means this is not a
truly untouched holdout claim.

## Reproduction and assessment

Run npx tsx research/nikkei-overlay-stability/descending-sequence.ts. Outputs:
output/descending-sequence/summary.json and REPORT.md. Identity-keyed atomic
checkpoints retain all193 rows and same-command resume reuses them. Nine focused
tests, typecheck, targeted ESLint, baseline anchor parity and all24 legacy
four-open/four-high priority/RSI paths pass. Earlier shape studies are preserved.

Do not add the grid winner to production based on this experiment. Distinguish
an optional drawdown/return tradeoff from the user's requirement to improve both
returns. Research contextual failed rebounds or position P/L before simply
relaxing duration or adding more filters to the same historical sample.
