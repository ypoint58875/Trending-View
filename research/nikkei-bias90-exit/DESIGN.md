# BIAS20 P90 and falling SMA20 speed exit

Research only, frozen before results. Reuse the current-v8 frozen 2,000-session
account from 2018-08-09 through 2026-10-26, unchanged original winner signals,
3bps commission and 2bps slippage. Report the Nikkei page's existing close proxy
and ordinary next-open sensitivity separately. No production adoption.

Primary: three-day-smoothed BIAS20 exceeds P90, arm while invested, then clear
the position as soon as three-day-smoothed SMA20 speed falls versus yesterday,
including the arming close. A positive speed declining remains a trigger.
P90 uses the production prior-three-calendar-year RAW BIAS20 distribution,
excluding today, with at least252 observations. Do not fit full-sample levels.

Declare12 cases: baseline; raw/smoothed BIAS crossed with raw/smoothed speed,
each with same-day-over-P90 or armed-until-exit logic (8 cases); two smoothed
strict-turn variants (previous speed change>=0, current change<0); one armed
smoothed negative-speed variant (speed<0, not merely falling).
The strict-turn variants require a new turn at/after arming, whereas the main
variant also exits if speed was already declining at threshold entry.

Run native close processing first. Additional exit has final priority and
bypasses minimum hold/trend protection. Clear pending/recovery/entry state,
retain legitimate existing risk cooldown, introduce no new cooldown. Reset
arming when the native account is flat or the additional exit fires. New
native entries satisfying the rule may be vetoed at the same close; count them
separately from sales of an inherited holding. Subsequent entry rules remain
unchanged. Report fast reentry, not a hidden lockout. Other hard stops remain.

Reuse production context and SmaPositionOverlay checkpoint APIs. Require exact
baseline target/final-state parity, causal prefixes and serialized resume for
every variant. Record both whole-account effects and forward5/10/20-session
price outcomes after actual extra exits; overlapping observations are not
independent. Include full/first1500/final500 performance, maximum drawdown,
fills, turnover and time invested. This is reused historical data, not holdout.

Bounds:16MiB per input,10,000 bars,2,048 original decisions,12 cases serially,
RSS limit1.5GiB checked at safe boundaries. Atomic reports and manifests under
ignored output, source backups by identity under ignored data. Restart reruns
the bounded deterministic cases without external effects; partial manifests
never imply success. Tests cover serialized controller/arming state and causal
prefixes. Preserve all pre-existing changes. Planned files: this folder and
CODEX_STATE, FEATURE_MAP, FUNCTIONS, MODULE_PATTERNS, DEBUGGING, TECH_RESEARCH,
DATA_SOURCES. No application, library, provider, account or protocol edits.

## User-authorized combination extension

After the initial result, user requested combinations with original or similar
new rules, still research only. Freeze23 combination cases: baseline and the
two raw-BIAS armed decline controls; for each raw/smoothed speed, require one
of two consecutive declines, close<EMA7, close<SMA20, falling smoothed SMA60
speed, at least4/6 smoothed context curves down, two declines plus close<EMA7,
WMA7 declining, or original release protection. Also test half-position caps
with close<EMA7 and with two declines plus close<EMA7, for both speeds.

Original-release protection probes the production request/release method,
discarding a rejected probe rather than leaving a stale pending order. It
retains native minimum supplemental hold, WMA7 trend protection, SMA11 growth
protection and original increase priority. No cloned guard calculations.
Partial reductions retain entry/holding age, clear recovery/pending, and can
be restored by native buys later. Count capped entry/add requests separately
from net sales. Forward returns after partial sales describe price only.

Do not tune thresholds after results. To nominate an actionable candidate,
require first1500 return>=baseline-3 percentage points and drawdown no worse,
then final500 return>=baseline and final500 drawdown no worse, within1e-8.
Both timing conventions are inspected. This is a screening condition on reused
data, not proof of prospective advantage. A warning can remain descriptive
without meeting trading adoption criteria. No score or trade rule deployment.
