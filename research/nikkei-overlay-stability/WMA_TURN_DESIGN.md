# WMA7 turn and delayed EMA7 supplement comparison

Reuse the frozen 2000-session full-screen winners and causal signals under
`data/full-screen-6-15/`. All accounts start empty on 2018-08-09 and retain
SMA11 >0.075% exit protection, WMA7 nonnegative flat-entry gate, costs and
the same-day Nikkei close proxy. No strategy rescreening or network access.

Compare the current EMA7-turn-only rule with two explicit research variants:

- Delayed EMA: while flat, an EMA7 positive turn blocked by negative WMA7
  creates a pending entry. An original increase signal may coexist with this
  blocked turn; original reductions or conflicting two-bar sequences do not
  create it. Cancel the pending entry when EMA7 becomes nonpositive, an
  original resolved reduction arrives or any position is acquired. Execute
  once WMA7 is strictly positive, while still flat with no original signals.
  A zero WMA slope does not release the pending entry.
- Independent WMA: while flat and without original signals, a WMA7 slope
  crossing from nonpositive to strictly positive is an additional full-entry
  trigger, even without an earlier blocked EMA7 event.

Both retain ordinary EMA7 supplements and original-signal priority. Neither
adds to an existing position. Pending buy intent is separate from the shared
account's pending sell target. No TTL beyond the explicit cancellation rules.
Report net return, drawdown, fills, four continuous 500-session blocks,
additional trigger dates, and the 2021-08-23/24/27 diagnostic. The delayed
variant's first eligible day need not be a screening decision date.

Save complete bounded ledgers and source/design/code hashes under
`output/wma-turn/`. Three short finite replays need no new durable checkpoint;
rerun the same command deterministically. Bound input to 10000 bars/2048
decisions, 16 MiB per file and 1.5 GiB RSS. Preserve existing frozen data,
production source, saved settings, screening queues and previous outputs.
Verify baseline production parity, threshold-crossing semantics, cancellation,
original-signal priority, flat-only behavior and summary/full-ledger agreement.
These retrospective comparisons do not establish future performance.
