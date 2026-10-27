# RSI and Bollinger flat-entry research

## Frozen scope and menu

User asks if RSI/Bollinger can substitute or complement the SMA20 barrier.
Research only, no live default/indicator/UI changes. Reuse the same frozen
2000 sessions2018-08-09..2026-10-26; final500 from2024-10-04. Require full
return>382.699650763004% and final500>95.508724236275% under identical original
costs. Also disclose full/final500/recent DD and postJuly21 results. This is
historical screening, not future guarantees or untouched validation.

Baseline+10 signals x2 scopes x3 confirmations=61 cases. Source files:
oscillator-entry-study.ts, oscillator-entry-study.test.ts and this design.
Reuse currentRule/ResearchAccount through a per-run context/feature facade,
existing rsi14 and bollingerBands20/2, atomic/metrics/goal helpers. Do not
modify previous research or its checkpoints. Update CODEX_STATE, FEATURE_MAP,
TECH_RESEARCH, DATA_PIPELINE and CACHE_POLICY. No new exit or sizing variants.

## Ten signal profiles

Use Wilder RSI14 and20-close SMA plus/minus2 population standard deviations.
Historical evidence is limited to preceding10 completed bars within the current
actual flat episode, excluding today. Current inputs are completed-close only.
At least one valid prior observation is necessary; unknown inputs disable the
relevant signal. A zero Bollinger width disables percentB, never divides by zero.

Four RSI profiles require currentRSI>previousRSI and:
- rsi30-30: prior minimumRSI<=30, currentRSI>=30.
- rsi30-40: prior minimumRSI<=30, currentRSI>=40.
- rsi35-40: prior minimumRSI<=35, currentRSI>=40.
- rsi40-45: prior minimumRSI<=40, currentRSI>=45.

Four band profiles require currentClose>previousClose and current percentB=
(close-lower)/(upper-lower) at least the specified recovery level:
- bb-close0: a prior completed close<=its own lower band, percentB>=0.
- bb-close25: same prior breach, percentB>=0.25.
- bb-close50: same prior breach, percentB>=0.50 (the middle/SMA20).
- bb-low25: a prior completed low<=its own lower band, percentB>=0.25.

Two combinations use the rsi35-40 and bb-close25 definitions above:
- both: both conditions true now, each with its own preceding evidence.
- either: at least one condition true now.

These are current level/repair tests, not uncancelled queued orders. Crossing
on an original-signal day does not authorize a trade that day; a subsequent
no-signal close must still satisfy all current evidence before history expires.
No previous rebound4%/decline5% condition is added, to measure these indicators
as alternatives rather than merely filtering the earlier sparse three events.

## Scope, confirmation and native priority

Both scopes require actual allocation zero before today's original processing,
no original signals of any direction/conflict, no pending reduction and ended
native cooldown. The below scope additionally requires currentClose<=SMA20;
any scope permits either side of SMA20 to recover a missed one-day turn.

All use current nonnegative WMA7. Confirmations:
- wma: no additional EMA requirement; RSI repair or rising close supplies the
  signal's momentum evidence. It may enter while EMA7 still declines.
- ema1: also currentEMA7 slope>0.
- ema3: also current and preceding two EMA7 slopes>0.

Original entries, ordinary EMA7/SMA20 turn entry, engulfing and native trend
recovery take priority. A fallback cannot add to existing holdings or override
original signals/cooldown. Native SMA20/EMA turn remains unchanged; synthetic
turns activate the existing supplemental path only on valid fallback days.
One actual inherited account executes the existing100% target; no scaled
shadow returns. Keep original hold7, SMA11/WMA exit protections, first-five
cumulative4% close stop, wait5 and native recovery, with no new stop guarantees.

Predeclared primary RSI=rsi30-40/below/ema1; primary band=bb-close25/below/ema1.
Do not silently rename whichever recent winner emerges as the primary.

## Evaluation, persistence and verification

Verify2000 production baseline targets. Report all61 scalar cases, first1500,
final500, four500 blocks, recent, entries/stops/recovery counts and unique paths.
Select first1500 max return subject to no-worse baseline DD, baseline/menu-order
ties. Filter dual goals and count additional all-three improvements. Rank goals
by no-worse fullDD first, then minimum full/final500 relative-wealth gain.
Also report whether any dual goal beats the prior435.7026% total-return frontier.

Selected baseline, goal, best RSI, best band, best combined, development and
best recent goal get full ledgers, doubled costs and next-open against matching
baselines. Common-state forks retain1936 baseline targets throughJuly21. Daily
records include RSI, percentB, prior evidence and native/fallback classification.
Audit the selected goal's extra entries by suppressing only the individual
extra entrance until its next native entry/flat exit, replaying subsequent
actual account state. Retrospective known episode bounds are evaluator-only;
counterfactual impacts are not additive. Report sample concentration honestly.

Atomic10-case scalar checkpoints under data/oscillator-entry/grid.json use
source/code/design/menu/order identities and reject drift. Same-command resume
reuses completed rows; SIGINT/SIGTERM/RSS checks commit completed cases. Bounds
16MiB/source,10000 bars,2048 decisions,61 policies,RSS1.5GiB. Selected ledgers
and final report under output/oscillator-entry remain separate. No fetch,
growing cache, scheduler, raw deletion or replacement of earlier outputs.

Test indicator warmup/prefixes, prior-evidence exclusion of today/future and
held history, zero width, RSI versus band/AND/OR logic, delayed current repair,
scope/momentum controls, native priority, no existing-position adds, unchanged
holding/stops/recovery, all61 prefixes and checkpoint rejection/reuse. Run
typecheck and focused related tests. The previously failing unmodified
coordinator fixture is outside this research; do not claim a clean full suite.
