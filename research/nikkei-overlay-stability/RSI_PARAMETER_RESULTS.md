# RSI parameter results

## Frozen scope

Complete v7 account plus additional shape filters, unchanged frozen winners and
costs,2000 sessions2018-08-09..2026-10-26. RSI7..20 uses the shared Wilder
calculation. Entry and exit filters, thresholds and historical windows are
independent. No production rule, active validated account or engine queue changed.

28621 single-rule configurations plus64 distinct-path-shortlisted combinations
produce5104 distinct account paths.85 rows improve both full2000 and final500
returns; these represent17 distinct paths, not85 independent discoveries.
Three tested combined configurations also reduce maximum drawdown. The64-row
combination stage is not an exhaustive Cartesian search.

Grid definitions: RSI periods7..20; entry strength30..65 step5, oversold20..45
step5, rising ranges lower30/40/50 to upper60/70/80; exit weakness30..60 step5,
recent overbought55..80 step5; historical windows5/10/14/20 sessions. Recent
extremes exclude today. Native rules are never filtered by the added RSI rules.

## Representative completed-close proxy outcomes

| Additional rules | Full2000 | Final500 | Max drawdown |
|---|---:|---:|---:|
|Baseline|393.14%|98.14%|10.88%|
|Entry E only|427.68%|99.85%|10.88%|
|E + guarded four-high exit, RSI10<35|440.98%|99.85%|10.88%|
|E + five-close no-signal exit, recent RSI8>=80/20|430.44%|100.37%|10.88%|
|E + four-high no-signal force, RSI16<40|415.02%|99.85%|10.10%|
|E + four-high unconditional force, RSI19<45|410.63%|99.85%|10.01%|
|E + four-high no-signal force, RSI14<40|409.32%|99.85%|9.23%|

Entry E: no original signal, flat, native stop waiting complete, WMA7 not
decreasing; prior decline>=9%, current low above previous low, and current close
above previous high. The prior low is the most recent minimum close in the
previous10 market bars; peak is the maximum of the10 closes preceding that low.
Require at least one RSI7<=25 in the preceding5 sessions and RSI7 rising today.
Append after native supplemental entries/recovery; target100%, preserving native
seven-session supplemental protection and early4% stop. Today's RSI need not be
below25, and it need not have just crossed25.

Exit definitions: four highs/five closes mean four/five successively declining
observations, evaluated at the last close. Guarded requests retain native hold,
WMA/SMA protection and native-buy priority; no-signal force requires no original
signal that day; unconditional force overrides original signals but not native
early-stop cooldown state. The five-close example additionally requires RSI8
falling today and a preceding20-session RSI8>=80. Plain RSI<40/<35 exits do not
also require RSI falling unless specified.

## It is not simply a short-RSI effect

RSI7/recent<=25/5-session lookback and RSI14/recent<=35/5-session lookback
produce the same five additional entry dates and account targets for Entry E.
RSI8/recent<=30/5 and RSI15..20/recent<=40/5 can also reproduce that path.
Threshold and historical-window changes matter; period7 is not uniquely optimal.
The earlier RSI14/recent<=40/14 setting was a different rule and should not be
compared as though only the RSI calculation period changed.

The primary proposed four-close breakout after5..10% decline still has zero
double-improving standalone rows. Its full-return leader is the6% decline,
RSI19/recent<=35/5 row:417.66% full but94.20% final500 and11.67% drawdown.
The better candidates above instead use the related higher-low/previous-high
break entry. Do not silently substitute that pattern for the user's first idea.

## Fragility audit

Entry E adds only five dates:2019-01-07,2020-03-24,2024-08-13,2025-04-10 and
2026-07-31. Omitting the2026-07-31 shape action reduces final500 from99.85% to
94.01% for E and the four-high combined candidates, below baseline98.14%.
The high-return440.98% candidate then has425.16%/94.01%; it loses double status.
Thus final500 superiority is concentrated even when the full-return gain survives.

Matched combination-neighbor tests keep all other rules fixed. For the
RSI10<35 guarded-exit candidate,7/9 nearby exit period/threshold configurations
remain double-improving; Entry E's nearby period/threshold grid has3/6. These
are not tests of the exit in isolation. Nearby combinations can also retain
drawdown gains, but they share the same small number of entry episodes.

Next-open timing must use its own matching baseline401.61%/97.42%/DD9.44%.
Entry E becomes450.63%/106.91%/DD9.44%; E plus RSI10<35 guarded exit becomes
465.36%/106.91%/DD9.44%. The close-proxy drawdown9.23% candidate instead becomes
409.81%/106.91%/DD9.50%, losing its drawdown advantage. Do not mix execution regimes.

Selecting only by first1500 return chooses a different combination with
first1500 return173.58%, but final50094.20% versus98.14% baseline. Historical
grid winners are not untouched holdout evidence, and the last500 have been
repeatedly inspected in earlier studies. Do not promote automatically.

## Reproduction

Run npx tsx research/nikkei-overlay-stability/rsi-parameter.ts, then
npx tsx research/nikkei-overlay-stability/rsi-parameter-audit.ts. Full rows are in
data/rsi-parameter/<identity>/single and combined, with128-row hash-checked
chunks and atomic manifests. Outputs are summary.json, audit.json and generated
reports under output/rsi-parameter/. Identity-specific earlier experiments remain
preserved. Resume reuses28621+64 committed rows with matching results.

Fifteen focused tests, typecheck, targeted ESLint, v7 anchor parity and193 legacy
RSI14 account-path checks pass. Numerical ties use1e-9 tolerance so rounding
noise cannot displace a materially higher-return candidate in the shortlist.
The pre-tolerance checkpoint remains separately preserved; final counts above
refer only to the tolerance-aware experiment.
