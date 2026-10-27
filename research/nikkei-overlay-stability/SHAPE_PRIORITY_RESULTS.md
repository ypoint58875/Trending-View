# Shape priority results

## Scope and reproducibility

Frozen2000-session source:2018-08-09 through2026-10-26, unchanged selected
winners and source account costs. Baseline is the currently adopted v7 overlay,
not archived v6. All main tables use the completed Nikkei close proxy.
The829 exploratory configurations have311 distinct target paths. None improves
both full2000 and final500 returns over baseline under this execution policy.
No production rule, screening limit or validated account was changed.

Run `npx tsx research/nikkei-overlay-stability/shape-priority.ts`; same-command
resume uses data/shape-priority/<identity>/rows.json. Source/bar hashes and
production target parity are asserted; all seven cached max5 alternative signals
are regenerated from their saved plans before replay. Full rows, action events,
next-open sensitivity and omission checks are in output/shape-priority/summary.json.

## Missed2023-12-15 entry

Replacing only the seven six-leg winners with same-date max5 champions leaves
the account flat until2024-01-31, when an original increase signal establishes
full exposure. This is29 available sessions after2023-12-15. The close changes
from32970.5508 to36286.7109, +10.0579%; that index change is not a strategy-profit
attribution. Baseline full return393.1430% becomes351.2707%; final500 stays98.1439%.
This is not a full2000-day max5 rescreen: all other winners remain frozen.

The proposed four-close breakout is already true on2023-12-15, but the largest
qualifying prior decline across this gap is only3.9187% under the stated10-bar
low / preceding10-bar peak definition. Thresholds5..10% therefore do not repair
this particular missed entry; all six still enter on2024-01-31 in max5 replay.

## Added four-close breakout entries

Require no original signal, flat before the day, stop cooldown complete and
non-decreasing WMA7; append after the native three entries/recovery. Prior low
is from10 preceding sessions, with its preceding10-close peak; compare flat-only
low scope separately. Today's close must strictly exceed all four prior closes.

| Prior decline | Full2000 | Final500 | Max drawdown | Added entries |
|---|---:|---:|---:|---:|
| Baseline |393.14%|98.14%|10.88%|0|
|5%|306.24%|72.48%|13.11%|19|
|6%|314.60%|73.53%|13.11%|14|
|7%|330.42%|73.53%|13.11%|9|
|8%|335.91%|80.75%|13.11%|8|
|9%|329.53%|80.75%|13.11%|5|
|10%|329.53%|80.75%|13.11%|5|

Moving this primary entry ahead of native supplements changes rule attribution
but not the target path for the requested threshold/gate combinations. Both
routes target100% and preserve native signals and cooldown. Across all192
paired entry configurations,186 are target-identical; the six differences occur
only in5/6% higher-low variants without WMA protection and remain inferior.
At5%, removing WMA worsens full return306.24% to278.25%, with no final500 gain.

False rebound exposure matters more than signal count. Added5% entries on
2024-07-31,2026-03-18 and2026-07-15 exit after two sessions with close changes
-8.16%,-6.74% and-6.71%. These are individual price moves, not additive portfolio
attributions. Early4% stops are close thresholds, not guaranteed fill prices.

## Four declining opens as an additional exit

Four opens mean three strict decreases. Evaluate at the fourth close; never
retroactively sell at that day's open.

| Priority | Full2000 | Final500 | Max drawdown |
|---|---:|---:|---:|
|Baseline|393.14%|98.14%|10.88%|
|Guarded reduction, native buy wins, existing hold/trend protection|281.49%|79.21%|13.00%|
|Force only without any original signal|265.41%|71.42%|11.18%|
|Risk force regardless of original signal|216.91%|65.99%|10.96%|
|Risk force plus falling RSI14|272.70%|74.80%|10.64%|

The unfiltered risk-force version creates45 additional forced exits. Earlier
selling is not equivalent to lower maximum drawdown: account path and subsequent
reentry differ. Only the RSI-filtered example slightly reduces baseline drawdown,
at a substantial return cost. Native early-stop cooldown wins simultaneous cases.

## RSI and related shapes

RSI rising alone leaves the primary5% breakout path unchanged. At5%, RSI>50
improves306.24%/72.48% to328.97%/75.99%; a recentRSI<=40 then rising gives
335.44%/80.75%. Both retain13.11% drawdown and remain below baseline.
Among primary breakout/RSI candidates ranked by proximity to both return goals,
9/10% decline withRSI>50 gives358.98%/84.42%/DD13.11%, still not an improvement.

Also tested close above four previous highs, higher low plus previous-high
break, four descending highs, and close below four previous lows. A9% decline
plus higher-low/previous-high break reaches391.62%/86.19%/DD13.11%. The two
requested primary shapes combined with their best tested RSI filters remain
inferior: one close9%+RSI>50 / opens4-no-signal-force+RSI<50 row gives
310.71%/68.85%/DD13.11%. Do not interpret shortlisting among bad candidates as
evidence that the shortlisted policy is useful.

## Robustness and execution sensitivity

The first1500-return winner is the9% higher-low entry: first1500 return164.04%
versus baseline148.88%, but final500 falls to86.19% versus98.14%. Omitting its
2020-03-24 shape action lowers full return to356.75%, showing episode dependence.
Last500 has been examined repeatedly and is not truly unseen holdout evidence.

Ordinary next-open execution changes the comparison. Baseline becomes
401.61%/97.42%/DD9.44%; that higher-low candidate becomes
430.76%/99.44%/DD11.93%. Returns improve under that different timing, but drawdown
worsens and this does not rescue the current same-close validation result.
Keep execution regimes separate; do not compare a candidate's next-open return
against a baseline's close-proxy return.

## Assessment

Do not add these rules to production on current evidence. A depth requirement
cannot repair shallow pullback misses such as2023-12-15. Further research should
separate shallow trend resumption from deep rebound entries and test exit shapes
with position P/L or failed-rebound context, rather than indiscriminate forced
exits or progressively more historically fitted filters.
