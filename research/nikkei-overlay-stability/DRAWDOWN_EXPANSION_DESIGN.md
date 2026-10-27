# Simultaneous return and drawdown improvement study

Research only. Production remains the authorized EMA7/SMA11 0.075%/WMA7/hold5
model. Reuse the frozen completed full-screen winners and daily bars. Require
full net return at least228.43739499212467% and drawdown strictly better than
-23.620689197044374% for descriptive eligible alternatives. Retain full original
strategy sequencing and the five-bar supplemental holding rule.

Freeze975 combinations (3*13*25):
- Pending-sell confirmation: current SMA guard; additionally WMA7 negative;
  additionally EMA7 nonpositive. These reuse the prior declared rule account.
- Supplemental quality gate only: none; close above SMA20/50/100; EMA7 daily
  slope at least0.025/0.05/0.1%; WMA7 slope at least0.05/0.1/0.2%; ATR14/close
  at most1.5/2/2.5%. ATR is the simple mean of14 causal true ranges. Original
  buys are not suppressed by these extra quality gates.
- Risk/recovery pair: none (one pair), or twelve risk controls each with no
  extra recovery / trend recovery (24 pairs). Controls are initial-close
  stops3/5/7% (full exit), stops3/5/7% (half reduction), trailing5/8/10%
  (full exit), profit5%-activated trail5% (half), profit10%-activated trail8%
  (half or full). A risk control can override hold5 and SMA protection.

Risk marks use the first close of the current position episode and its highest
completed close, not weighted cost or intraday prices. A risk trigger cuts the
current target by half or to zero once; it clears stale pending sells and the
supplement age. Original future buys may add normally. With trend recovery,
restore up to the pre-cut target on a later no-original-signal bar where both
EMA7 and WMA7 slopes are positive and close is above EMA7; recovery cannot
occur on the cut day. Reset risk marks at recovery. A full risk exit with no
recovery forgets the episode; later original buys or EMA turns can reenter.
Without recovery, partial reductions last until subsequent original actions.
Original sell-to-flat also clears marks and recovery intent. Quality gates
apply to EMA supplements, not explicit risk-recovery entries. At most one
risk cut precedes each recovery or new flat-to-held episode.

Rank eligible full-sample alternatives by return and separately by lowest
drawdown. Select a development candidate using first1500 return >= baseline
first1500 and strictly better first1500 drawdown, highest development return
with ID tie-break; if none qualifies retain baseline. Report subsequent500,
four continuous blocks, double costs and next-open execution sensitivity of
selected fixed target paths. The latter is a conditional replay, not a new
strategy rescreening. Dates/base settings are already explored and not an
independent holdout. Do not claim that975 historical comparisons prove a
future improvement.

Use the existing RuleAccount, shared indicators and production ledgers.
Verify baseline parity, quality rejection, partial/full risk actions, no
same-day recovery, episode resets and prefix causality. Keep output under
`output/drawdown-expansion/`; checkpoint metric rows every50 completed cases
under `data/drawdown-expansion/` using atomic replacement and source/design/
implementation hashes. Rerun to resume matching committed rows; reject stale
identities. Keep only bounded scalar rows plus the current ledger, cap files
at16MiB, bars10000, decisions2048 and RSS1.5GiB. Stop between cases; unfinished
chunks replay. Preserve raw/frozen sources, prior output and all live queues.
