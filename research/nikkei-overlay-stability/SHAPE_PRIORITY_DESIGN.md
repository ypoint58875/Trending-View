# Shape entry, exit priority and RSI study

Research only; no production rule or screening limit changes. Freeze the
full-screen-6-15 source ending2026-10-26, 2000 sessions and original costs.
Verify source, bar and cached two-bar signal hashes and v7 target parity.
Answer the2023-12-15 max5 missed entry using the seven-date replacement study,
not a claim that all2000 days have been rescreened with max5.

Compare augmenting the existing production account versus replacing its overlay
with an independent shape model. Choose augmentation for attribution: keep the
same winners, execution costs, hard stops, cooldown and native recovery state.
Reuse the production overlay with research-only typed state access for explicit
additional entries/exits. Assert an off-policy path equals production exactly.
This avoids duplicating hundreds of native state-transition lines. No imports
from research are introduced into production.

Primary entry: when previously flat and without native signals, today's close
strictly exceeds all four previous closes. Require a preceding decline of
5,6,7,8,9 or10 percent. Use the most recent minimum close within the previous10
market bars, peak from its preceding10 closes. Separately restrict that low to
the current flat episode as in the existing fallback, to expose scope effects;
today is excluded from the low and four-bar thresholds. Compare fallback after
native entries/recovery versus before supplemental entries. Keep native signals
and stop cooldown ahead of both; compare WMA7 non-decreasing versus unrestricted
shape entry separately rather than calling gate relaxation a priority change.
Alternatives: close above previous four highs and higher-low/previous-high break.
New entries inherit seven-session supplemental protection and early4% stop.

Primary exit: four opens with three strict successive decreases. Evaluate at
the fourth close, never retroactively at its already-observed open. Compare
guarded reduction (no native buy, native hold/WMA/SMA protections retained),
forced exit only without any original signal, and forced risk exit regardless
of original signals. Native early-loss cooldown always survives simultaneous
events. Also test four decreasing highs and close below four prior lows.

RSI uses the shared Wilder14 implementation. Entry: off, rising, above50,
rising within40..70, or recently<=40 then rising. Exit: off, falling, below50,
or recently>=70 then falling. Filters affect only added shape rules, never
existing signals or native risk exits. Test standalone entries, standalone
exits, and a bounded combination stage selected transparently from stage one.
Also cross every primary four-close threshold/RSI filter with all four-open exit
priorities/RSI filters so neither requested shape disappears through shortlist
selection. Separately inspect these entries on the frozen seven-date max5 path.

Primary measures: full2000 return, final500 return, maximum drawdown, fills,
500-session blocks and post2026-07-21 period. Include next-open sensitivity,
first1500-selected/final500 evaluation and event-omission concentration checks.
Full-sample winners are exploratory; repeated historical testing means the
last500 are not truly untouched out-of-sample evidence.

Official references accessed2026-10-27:
https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/RSI
https://www.cmegroup.com/content/dam/cmegroup/education/files/backtesting.pdf
RSI is contextual momentum evidence, not a guaranteed reversal. Multiple-rule
search increases selection bias; do not promote a best historical row directly.

Bound inputs to10000 bars and source files to16MiB, run sequentially and retain
only bounded summary rows. Atomic checkpoints under data/shape-priority/ hold
source/code/menu identity and ordered completed rows. Identity-specific checkpoint
directories preserve previous experiment versions. Same command resumes.
SIGINT/SIGTERM stops between rows; RSS>2GiB aborts preserving committed progress.
Do not delete source backups, engine jobs or earlier research. Results go under
output/shape-priority/. No network price refresh or new heavy optimization job.
