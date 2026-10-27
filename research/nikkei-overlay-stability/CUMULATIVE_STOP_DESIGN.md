# Cumulative stop-loss comparison

User explicitly permits cumulative rather than single-day decline. Freeze
1368 stop rules: two bases (production hold5; SMA20 supplemental gate plus
WMA7-negative original-sell confirmation), three measures (entry episode close,
held peak close, previous close),19 thresholds1..10% by0.5%, whole episode /
first five intervals,0/2/5 subsequent-bar cooldown, optional trend recovery.
Keep two no-stop bases separately. Use the same immutable2000-session source.

An entry episode starts whenever target moves from empty to held, including
original buys, EMA supplements and recovery. Loss basis is its initial close,
not weighted cost; add orders do not reset it. Peak means the highest completed
close since entry. Daily means current close versus previous session close.
Stops test only if a position existed before the bar and still exists after
ordinary actions; a position newly opened today cannot suffer today's pre-entry
daily decline. First-five means entry+1 through entry+5 inclusive; whole-episode
continues until exit. Threshold comparisons are inclusive. Stops liquidate at
the observed close proxy with costs, possibly beyond the threshold. They bypass
holding/SMA guards and clear pending sell targets. Never infer intraday fills.

A cooldown ofN blocks all new buys for the nextN completed bars, including
original buys, and resumes at stop+N+1. During cooldown no source signal or
crossing is queued. Optional recovery can then restore the previous target
on a no-original-signal day with EMA7/WMA7 slopes positive and close aboveEMA7.
Original later buys or an ordinary EMA supplement can also reenter after
cooldown; each new episode resets entry/peak marks. Recovery uses the existing
expanded account; cannot occur on the stop day. Supplement quality gates do
not apply to the explicit recovery action.

Rank descriptive candidates that beat the simpler291.022058% base return and
its17.759789% drawdown, showing best entry/peak/daily rule, best overall and
lowest drawdown at preserved return. Development choice uses only first1500
return >= the simple base's first1500 and better development drawdown, then
report final500 separately. Include selected thresholds' adjacent0.5% rows,
full/first1500/final500, four blocks, stop counts, double costs and next-open
target replay. Dates and starting settings are already researched: no untouched
holdout or prospective success claim.

Reuse ExpandedAccount for original sequencing, hold5, gates and trend recovery;
implement only stop basis, episode age and cooldown. Verify baseline parity,
multi-day accumulated loss, profit drawdown, first-five expiry, fresh-entry
exclusion, cooldown/recovery and prefix causality. Keep all1368 metric rows
under `output/cumulative-stops/` and atomic50-row source/design-checked progress
under `data/cumulative-stops/grid.json`. Preserve source and all previous output.
Reject stale resumes. Bound files16MiB, bars10000, decisions2048 and RSS1.5GiB;
retain only scalar metrics and current ledgers. Stop between candidates and
rerun to continue committed rows; uncommitted work safely repeats.
