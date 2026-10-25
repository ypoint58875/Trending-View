# EMA8..14 fallback after an EMA7/WMA14 conflict

User asked to supplement at EMA8..14 when EMA7 conflicts with negative WMA14.
Interpret as seven separate backup positive-turn triggers, not averaging their
votes. Original EMA7 entries remain intact when WMA14 permits them. A flat,
raw-signal-free rejected EMA7 turn records/renews intent; a backup EMA positive
turn can then supplement even if WMA14 remains negative. Original buys still
obey the WMA gate, existing partial adds and SMA11 pending sells stay unchanged.

Separate two timing semantics: same-day backup confirmation is permitted, or
backup confirmation must occur strictly after the latest rejected EMA7 turn.
Also separate persistent intent from cancellation on nonpositive EMA7 or any
original reduce signal. This is28 variants plus one fully reconciled control.
Any normal entry consumes intent; original raw signals suppress supplements.

Control91.44772%/8.26194% drawdown/45 fills fully reconciles. Persistent backup
with same-day confirmation gives EMA8/9/10:75.14%, EMA11:73.04%, EMA12:73.69%,
EMA13/14:77.85%, with11.22-11.23% drawdown. Strictly later gives EMA8:91.45%
(no extra entry), EMA9/10:89.48%, EMA11..14:88.33%, all8.26% drawdown.
With invalidation cancellation, strictly later EMA8..10 equal control;
EMA11..14 give90.29%. No profile beats current. All four rally metrics are
unchanged within numerical tolerance. July31,2026 same-day backups can buy
then clear August3; strict persistent EMA9..14 can buy August5 and clear August6.

Two tests verify selective fallback, no invented intent, same-day versus later
semantics, raw-signal priority and prefix causality across28 variants. Typecheck
passes. Sequential bounded replay writes atomic ledgers then summary; restart
is idempotent without a new checkpoint. No source refresh, production rule,
preference or active screening queue change is introduced. Results remain
same-sample exploration and do not establish future superiority.
