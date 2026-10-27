# EMA7 turn or rebound supplement

User-defined rebound is current close divided by the lowest opening price
of the latest five trading sessions, including today, minus one. It is not
an empty-account low, intraday low, five-calendar-day low or EMA trough.
Enter at the existing same-day Nikkei close proxy when rebound is at least
2%, 2.5%, 3%, 3.5%, 4%, 4.5% or 5%, OR the existing EMA7 slope turns positive.
Keep the original-signal priority: supplementary entries require an empty
account and no original signals on that day. The WMA7 nonnegative-slope gate
still applies; pending-reduction protection remains SMA11 slope >0.075%.
Do not replace a positive-turn event with a merely positive slope.

Use the immutable completed full-screen input and signals under
`data/full-screen-6-15/`, retaining the 2000-session account, actual selected
plans, costs and incoming-winner two-bar policy. Compare to the immediately
preceding optimum EMA7/SMA11/WMA7/0.075%, the original pictured settings and
holding. Seven short finite replays are bounded to 10000 source bars and do
not warrant new checkpoint machinery. Existing source state remains intact;
rerunning replays this small study deterministically. Save complete ledgers,
triggers, source/implementation hashes, four continuous 500-day blocks and
net-return ranking under `output/rebound-2-5/`. No external data or refresh.
No production parameter, preference, screening queue or prior output changes.

Verify rolling-window causality (including five-session expiry), inclusive
thresholds, OR behavior, flat-only entry, gate rejection, original-signal
priority, inherited pending reductions and disabled-trigger parity. Verify
complete and summary production ledgers agree. A full-sample best threshold
is a descriptive retrospective maximum, not an independent forward test.
