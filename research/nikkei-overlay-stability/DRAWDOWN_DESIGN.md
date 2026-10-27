# Drawdown control on the authorized five-bar supplemental holding model

Use the same frozen full-screen winners, source costs and 2000 sessions.
Production adds only the already authorized EMA7 supplemental five-bar lock.
This study does not alter production risk controls or strategy selection.

Freeze 39 configurations before calculation. Supplemental initial allocation
is 50%, 75% or 100%; later original buys retain their original target. Risk
mode is none, close-based 3/5/7% stop below the initial position episode's
entry close, 5/8% trailing stop below that episode's highest completed close,
or early release of the five-bar lock when EMA7 becomes nonpositive / WMA7
becomes negative. Stops apply to every held episode, including original buys,
override both holding and SMA protection, and clear pending sells. They execute
at that day's close proxy with normal costs, not intraday or at the stop level.
Threshold basis is a causal closing-price mark, not a weighted cost basis.
Early lock release creates no new sell and retains the SMA guard.

For the five stop modes, compare no cooldown with five subsequent trading days
without any new entry; entry resumes on the sixth subsequent day. For none
and unlock modes, cooldown is zero. Thus (5*2+3)*3 =39 configurations. Original
signals and EMA turns during cooldown are not queued. Trailing marks reset
when flat; partial positions retain the episode marks. Never change the
original incoming-winner two-bar signal resolution.

Report the full-sample return/drawdown frontier and highest return among rows
with lower drawdown than baseline. Also select lowest development drawdown
using only first1500 rows that retain at least90% of baseline development net
return, deterministic ID tie-break, then inspect final500 separately. Include
whole-period lowest drawdown retaining90% of baseline net return as a descriptive
comparison. No candidate is chosen by future returns for the development rule.
Already researched dates and full-period base tuning prevent an untouched
holdout claim. Compare double costs for selected candidates, retaining the
original winner path rather than claiming a reoptimized high-cost strategy.

Validate production hold5 target parity, old228.4374% result, complete/summary
ledgers, fractional entry, emergency override, cooldown boundary, trailing
reset and prefix causality. Outputs, full grid, selected ledgers and source/code
hashes are isolated in `output/drawdown-hold5/`. The short39-rule study has no
new checkpoint; rerun it deterministically. Source files cap at16 MiB, bars at
10000, decisions at2048, with1.5 GiB RSS guard and stop checks between cases.
Keep all prior inputs/results and production queues intact.
