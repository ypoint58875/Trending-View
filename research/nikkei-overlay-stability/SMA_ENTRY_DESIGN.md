# SMA14 through SMA20 entry diagnosis

Research only, using the existing frozen full-screen 2000-session input and
signals. Preserve current v5 production behavior, original signal priority,
WMA7 gate, SMA11 exit protection, hold7, first-five cumulative4% stop, wait5,
trend recovery and chronological5% decline/body-engulfing entry.

Freeze28 cases before replay: SMA14..20, each with EMA7 positive-turn event,
positive slope within3 or5 sessions after a turn, or continuously positive
slope. These gates affect only flat/no-original-signal EMA supplements, not
original entries, reversal entries, recovery or adds to an existing position.
Pending-window eligibility is measured from the latest turn, including turns
while held or with original signals, matching the existing research adapter.
It is not an uncancelled standing order. Nonpositive slope blocks eligibility.

Verify SMA20/turn matches every current-v5 production target. Compare full2000,
first1500, final500, pre-cutoff through2026-07-21 and inherited-account returns
strictly after that close. Report buy-and-hold on identical close boundaries,
event dates, daily EMA/SMA/WMA gates and original signal direction. Select a
chronological diagnostic using pre-cutoff return with drawdown no worse than
baseline; do not select on the recent interval alone. This is already explored
history, not independent out-of-sample validation. All results include original
costs and disclose next-open/double-cost sensitivity.

Reuse Context/ResearchAccount without changing their implementation; extend
only the local Context average map. Bound28 cases,10000 bars,2048 decisions,
16MiB per input and1.5GiB RSS. Atomic outputs under output/sma-entry-14-20;
no growing cache, scheduler or new checkpoint. This short finite replay is
idempotently regenerated on rerun; interruption leaves committed outputs and
rerunning replaces derived artifacts only. Preserve frozen inputs and earlier
outputs. Test gate scope, turn-window expiry, original signal priority and
causal prefixes. Run typecheck and focused tests; no product feature changes.
