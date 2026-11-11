# Ordinary full-clear slope sensitivity

Compare the existing SMA11 and WMA7 clearance gate with 24 research
variants. A candidate's slope is 100 times (today's moving average divided
by the preceding trading close's moving average, minus one). A value at
or above the threshold protects the position. The tested thresholds are
-0.075%, 0%, and +0.075%.

* Replace either native moving-average check with EMA7, SMA11, or WMA7
  and leave the other native check in place.
* Add EMA7 to the native checks. Compare requiring all three to allow
  execution with requiring at least two to allow it.

Apply this change only when the inherited account is resolving a full-clear
request. Partial reductions, the minimum supplemental holding period, 3%
range protection, signal cancellation, native risk exits, execution prices
and costs remain unchanged. Do not force any clearance or change entries.

Use the completed 2,000-session holding-rescreen study. Replay each
account chronologically and derive eligibility from its own actual units.
Reuse matching causal-prefix winners. Newly eligible dates without a
cached result use the same full optimizer, with durable per-date
checkpoints and shared in-flight jobs across variants. The variant replays
are bounded and cheap to restart; their outputs commit atomically.

Run `node --import tsx research/nikkei-holding-rescreen/exit-timing.ts --slope`.
Results are in `exit-slope` under the completed study's output directory.
Check exact baseline parity, full/500/250-session returns, first 1,500
sessions, maximum drawdown, and actual changes in clear dates. Treat the
best full-sample setting as exploratory. Also report the trailing
500-session result of the variant selected using only the first 1,500
sessions. The final 250 sessions overlap the final 500.

The research hook changes only a single overlay instance during native
full-clear release; no production configuration or indicator cache changes.
