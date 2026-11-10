# Frozen-v8 strategy replacement turnover study

Declared 2026-11-06 before running the comparisons. Research only; application,
production libraries, saved accounts, ranking and existing archives are read-only.

## Question and competing approaches

Replacing a plan already inherits the account; it does not liquidate on name
changes. Diagnose different current-date signals, their pending reductions, and
subsequent opposite fills. Compare local request consensus versus small allocation
request suppression. Consensus can prevent contradictory switches but discard
useful new information. A minimum allocation delta only removes small requests
but may miss full-position churn. The previous-winner-on-conflict policy is a
control from the existing conflict study, now replayed with current v8 and the
same longer frozen sample. No three-bar confirmation or permanent old-plan lock.

Primary background accessed 2026-11-06:
https://www.aqr.com/-/media/AQR/Documents/Insights/Working-Papers/AQR--Craftsmanship-Alpha.pdf
discusses the turnover versus stale-position opportunity-cost tradeoff. It does
not establish that these particular rules work. Local architecture and prior
evidence: ../nikkei-cycle-conflicts/{README,DELAYED_CONFIRMATION}.md and
../nikkei-chop-filter/{DESIGN,RESULTS}.md.

## Input and execution

Reuse ../nikkei-overlay-stability/data/full-screen-6-15/{input,signals}.json.
Verify parsed input, bar hash, decision indexes, dates, schedule and cached native
signals. Evaluate final 2000 sessions, 2018-08-09..2026-10-26. Baseline must match
every v8 target and final controller state, plus 440.9807031454993% net return.
Recompute preceding winner signals on the SAME current decision date using only
the inclusive completed-bar prefix. Plan changes use strategyCyclePlanKey, not
labels or strategy-family names. Equal-plan snapshots are not replacements.

Use one real production SmaPositionOverlay per replay. Change only requests on
replacement dates; keep the incoming winner selected for future decisions.
Keep native two-bar sequence precedence. Suppressed incoming requests retain
the original hasOriginalSignal flag, avoiding synthetic supplemental entries on
a day originally occupied by a signal. Pre-existing pending requests remain.
Old-on-conflict substitutes the old two-bar signals and their occupancy flag.
The controller still closes EVERY day: early4% stop, ATR shock exit, hold guards,
entry gates and cooldown are unchanged. No filtered baseline-target smoothing.

Main execution is the existing Nikkei close proxy at commission3bps plus
slippage2bps per side. Next-open is a separate execution sensitivity; it replays
the same close-derived controller decisions, not a fill-aware redesign.

## Seven fixed cases

1. baseline: incoming current-date signals.
2. old-on-conflict: old signals only when permitted old/new directions oppose.
3. consensus-both: suppress incoming directional request if old is quiet/opposite.
4. consensus-reduce: same veto only for incoming reductions.
5. consensus-increase: same veto only for incoming increases.
6. small-switch-10pp: suppress request when directionally permitted target delta
   from actual inherited controller allocation is positive and strictly below10
   percentage points. No-op requests are exempt: an equal-target buy can still
   cancel a pending reduction, which is not a small economic rebalance.
7. small-switch-25pp: same with25 points.

All gates require an actual plan replacement; initial selection and equal plans
are exempt. Vetoes create no delayed catch-up orders. No parameters added after
inspection. First1000 development, next500 validation, final500 conditional audit;
continuous inherited state across boundaries. This repeatedly used sample is not
an untouched holdout. Qualification requires train return >=baseline-3pp and DD
>=baseline-2pp; validation return >=baseline and DD>=baseline-1pp; both train and
validation turnover <=95% baseline. Choose highest validation return among
qualified cases, otherwise baseline. Audit/full returns do not select a policy.

## Attribution and metrics

Probe current, old and no-request outputs from identical pre-decision controller
state. A switch-sensitive same-day transition differs from the old-plan probe;
otherwise distinguish native request versus controller-only transitions. Track
the origin of newly changed pending reductions; their later release is labelled
separately when removing that pending request changes the current output.
These are local mechanism diagnostics, not additive causal PnL attribution.

Report actual economic fills and turnover, net/gross/stress20bps-side returns,
max drawdown, final500, eight250-session blocks and next-open sensitivity.
Consecutive opposite economic fills within3/5/7 sessions are descriptive churn
pairs; they can overlap and are not independent roundtrips. Include dates,
allocations, raw close change, matched target turnover and event provenance.
Never use future reversal labels as a trading-time input. Closed <=7-session
flat-to-flat rounds are listed with their entry/exit provenance separately.

## Durability, bounds and verification

One process, one plan timeline at a time. Maximum10000 bars,2048 snapshots,
16MiB per source/derived JSON and1.5GiB RSS. Atomic checkpoint after each old-plan
signal derivation and each policy. Source/design/implementation hashes form the
identity; copied incompatible or corrupt progress fails. SIGINT/SIGTERM and
--limit stop at safe completed units. Resume reuses only validated contiguous
prefixes, repeating at most one interrupted unit. Raw input/backups/registry in
ignored data/<identity>; derived manifests/ledgers in ignored output/<identity>.
Record status, completed/pending units, timestamps, attempts and last error.
Missing sources fail rather than trigger network or new screening. Atomic
manifest is committed complete last. Test source parity, two-bar and switch
scope, hard stops, prefixes, serialized replay resume, checkpoint rejection,
bounded stop/resume, fresh metric audit and measured RSS. Run focused research
tests, typecheck and scoped lint; no production feature is being changed.
