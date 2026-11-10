# Range-exit integration and priority audit

Declared2026-11-06 before this rerun. User requests integrating range<3% and
range<10% ordinary full-exit protection with actual holding/rebalance rules.
Research only: production, saved accounts, optimizer and prior studies read-only.

## Fixed cases and interpretation

Main comparison: current-v9 baseline, range3-all, range10-all. Reproduce complete
previous current-v9 native/range3/range10 paths rather than reusing headline
returns. Add two priority controls: range3-base-priority and range10-base-priority.
These never veto a native-accepted explicit original full-clear request, or a
still-active original pending full-clear that is necessary for today's native
exit. Existing native holding/moving-average guards still apply. They protect
only controller-generated ordinary full exits. This is an explicit alternative
priority contract, not an unannounced change to the main all-ordinary policy.
If an original request already executes a PARTIAL reduction before native close
adds a full exit, base-priority preserves that accepted partial reduction and
vetoes only the extra full exit. Legacy all-ordinary restores the entire pre-day
allocation as before. Report this distinction rather than claiming partial-
order preservation from a final-target-only check. Fixed before rerun results.
No new parameters, buy ban, extra stop or reoptimized winners. No adoption.

Use same frozen full-screen-6-15 input/signals:6566 bars,1293 selected decisions,
last2000 sessions2018-08-09..2026-10-26. Baseline445.34209325762885% with current
v9 cycle lag1; retain incoming-winner native two-bar sequence rules, signals on
skipped dates, holding7, WMA/SMA release guards, supplemental/shape/rebound
entries, BIAS20 next-session holding-add gate, early4% stop first5 session ages,
ATR risk exit, native cooldown/recovery and original buy cancellation priority.
Nikkei close proxy stays main,3bps commission+2bps slippage. Source ends2026-10-26;
do not call this the user's newer2006-session browser account through2026-11-05.

Range=(post-entry highest high-lowest low)/actual first-buy fee-inclusive unit
cost*100. Exclude pre-entry extrema on entry day. Adds and partial sells do not
reset range; full flat resets. Protect only native-proposed full liquidations,
never partial reductions. Both native hard risks bypass the band, including
simultaneous ordinary full exits. A veto restores accepted real controller
state, keeps pending0, advances progress/request markers; no phantom position
age, recovery or cost. A later native increase may cancel pending0 even if it
does not cause an economic buy. Do not force delayed sales after cancellation.

## Exact probes and pending provenance

For EVERY day retain before, after-original-request, native-close and accepted
states, original direction/target/selection, range/episode, risk and veto reason.
Native, no-original and no-pending probes start from the SAME accepted state;
restore after each probe. These diagnose mechanism, not independent counterfactual
accounts or additive causal PnL. Explicit original target0 is base-clear.
For later pending releases, retain origin/index/selection of the active minimum
pending request; an original increase clears that lineage. A base pending0 is
necessary only if removing it while replaying today's original request/native
close leaves nonzero exposure. A redundant old pending0 does not exempt a
controller-only exit in the priority control. New explicit clear refreshes base
lineage; duplicate automatic clear does not erase an active base request.

Trace each blocked pending spell from first veto to actual full exit, native
increase cancellation or sample end. Repeated veto days are ONE spell; report
entry age, range, elapsed sessions, original intent, partial fills, eventual
exit/cancellation, close-price MFE/MAE and worse-than4% loss AFTER early-stop age.
These price/episode diagnostics are not summed as avoided portfolio returns.
Report exposure and equity at unchanged actual dates; follow each policy's real
modified account, not a baseline target mask. Separate selected-plan changes
from economic fills. Inspect original clear versus controller/pending sources.

## Metrics and checks

Full/first1000/next500/final500 net return, DD, fills, turnover; eight250-session
blocks; gross/actual/stress20bps-side costs and next-open sensitivity. Next-open
changes fill prices on the SAME cycle-lag1 decisions/anchors, not ordinary v9
lag0 or a redesigned next-open controller. No candidate selection by a new grid.
Chronological splits are reused conditional history, not untouched holdouts.

Require baseline exact target/final-state/fill equality with native production
and the real buildStrategyCycleRollingReport; main range3/10 exact equality with
the archived research replay. Verify partial sells and original buys are not
vetoed, hard risk bypasses, correct base-pending release/cancellation, all-case
causal prefixes, serialized controller/episode/lineage/cash resume, fresh metrics
and independent Python cash/episode/trace checks. Cases remain research-only
regardless of return. This is a local integration audit using documented existing
patterns; no new technical framework or external integration is introduced.

## Bounds and durable state

Five serial cases,one live replay;10000 bars,2048 decisions,2000 traced evaluation
days,16MiB/input or trace JSON,1.5GiB RSS. Durable units are completed policy
files and hashed ordered progress. Atomic replacement, model/source/code/design
identity, timestamp,status,attempts,completed/pending,last error. --limit1 and
signals stop between cases; crash/reboot/timeout/cancellation repeats at most one
unfinished case. Cursor includes controller, economic account, planned/previous
targets, episode and pending lineage. Missing/corrupt/incompatible state fails;
no network or external side effects. Raw backups/registry in ignored data;
processed trace/metrics/audits in separate ignored output. Complete manifest last.

Planned edits: this directory; docs/CODEX_STATE.md,FEATURE_MAP.md,FUNCTIONS.md,
MODULE_PATTERNS.md,TECH_RESEARCH.md,DATA_SOURCES.md,DEBUGGING.md. Explicitly exclude
app/,lib/,existing research engines/archives,account stores,providers,protocols.
