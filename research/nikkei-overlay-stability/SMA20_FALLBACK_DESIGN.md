# SMA20 replacement and flat-account rebound fallback

## Scope and frozen menu

Research only. Reuse frozen full-screen prices/signals for2000 sessions ending
2026-10-26. The user identifies close>SMA20 as the obstacle and requests a
substitute or complementary low-rebound entrance. No regime segmentation,
second-position adds, partial sizing, new exit/stop/hold settings or product
defaults are included. Preserve one inherited actual account. Original signal
sequence priority, WMA7 gate, SMA11 protection, hold7, first-five cumulative4%
close stop, five subsequent blocked bars, recovery and engulfing entry remain.

Freeze20 cases before evaluation:
- Baseline current v5.
- Four turn-only price-gate replacements: close>EMA20, close>EMA14,
  close>0.995*SMA20, or no price gate (equivalent to close>EMA7 on a positive
  EMA7 turn). These never replace WMA7 or original-buy risk gates.
- Three turn-only hybrid gates: SMA20 OR causal low rebound>=2/3/4%.
- Twelve independent fallbacks: rebound>=2/3/4%, crossed with below-SMA20-only
  versus any missed native entry, and trend versus prior-high confirmation.

Primary hypothesis is fallback-below-trend-x3; neighboring thresholds are
sensitivity rather than a license to choose the largest recent profit.
Compare the hybrid with the same threshold to identify the additional value
of removing the requirement for a fresh one-day EMA turn.

## Causal low and decline background

An actual flat episode begins at the close allocation becomes zero, or at
the evaluation start when initially empty. Low is the latest minimum close
among the preceding10 completed bars inside that flat episode, excluding
today. At least one prior flat close is needed. The pre-low peak is the
maximum close in the10 completed bars strictly before that low, including
bars before flat entry if necessary. Require low/peak<=0.95. This proves a
preceding decline rather than labelling any rising price a low rebound.
Rebound=close[t]/low-1; level eligibility permits confirmation on a later
no-signal day even if the threshold was first crossed on a blocked day.
Rolling-out old lows may change eligibility; never use future pivots or
backfill the low. Equal lows use the most recent occurrence.

## Independent fallback eligibility and priority

Require allocation zero before today's original processing; no original
signals of any direction/sequence today; no pending original reduction;
cooldown ended; EMA7 slope strictly positive; WMA7 slope nonnegative; causal
decline/rebound conditions known. Below-only also requires close<=SMA20.
Prior-high confirmation additionally requires close>previous completed high.
No fresh EMA turn is required. There is no waiting order to survive a veto:
each completed close is assessed independently with current evidence.

Native original entries, SMA20/EMA7 turn entries, engulfing and trend recovery
have priority. If any native no-signal entry would occur, do not label it a
fallback. An existing holding cannot be increased by these fallback rules.
Upon entry use the existing100% supplemental target and existing entry-age
marks; this isolates signal changes, not recommended investment sizing.
Do not reset stop/holding marks on existing positions. Original reductions
and stop cooldown cannot be bypassed. Existing v5 stops apply only during
the first five bars; do not misrepresent them as a permanent4% loss cap.

Hybrid cases preserve the fresh EMA-turn requirement and only relax its
SMA20 price test when the same low/decline/rebound background holds. WMA7,
flat/no-original requirements and every other policy remain unchanged.

## Evaluation, diagnosis and verification

Verify baseline parity against production on all2000 target decisions.
Report full/first1500/final500/recent and four500 blocks, fills, stops,
added entries and episode outcomes. Recent means strictly afterJuly21 close.
First1500-only choice maximizes return subject to no-worse baseline DD,
baseline/menu-order tie break. Also disclose simultaneous full return/DD
and recent improvement cases without calling them validated.

For every case report doubled costs and next-open sensitivity. Rerun with
policy changes disabled throughJuly21; verify1936 unchanged prefix targets
and report common-state recent results. This retrospective date fork is an
attribution diagnostic only, never a live date-based rule. Record baseline
flat intervals and blocked EMA turns; later5/10-session returns and episode
MFE/MAE are evaluator-only descriptions, never entry inputs. Added-episode
net equity changes include costs and inherited ordinary trades; they are
not isolated causal alpha or additive differences from baseline.

## Files, reproducibility and bounded work

Implementation/test: sma20-fallback.ts and sma20-fallback.test.ts. Reuse the
existing ResearchAccount through a per-run context/feature facade; do not
modify its source or invalidate earlier research checkpoints. Hash input,
signals, design, core dependencies, settings and ordered policies. Validate
source/bars/decision alignment. Output under output/sma20-fallback contains
atomic per-case ledgers, summary, report, design and baseline diagnostics.
Summary publishes only after all cases and sensitivities finish.

## Explicit post-result audit extension

The initial20-case result shows a4.3912% pre-low decline on2026-09-18, so the
fixed5% background independently excludes that event. Preserve those20
definitions. A separate sma20-fallback-audit.ts compares exactly six additional
cases: hybrid and below/trend fallback, X2/3/4, each with decline3% rather than
5%. All other settings remain unchanged. These are post-result sensitivity,
not predeclared independent validation. The original20 targets must remain
identical when the decline setting becomes explicit in their configurations.

Audit every baseline solely-SMA-blocked turn by removing only that day's price
gate in an otherwise unchanged baseline account. Replays include its subsequent
native behavior and costs, not just favorable forward returns. Also suppress
new entries throughout each known added episode of hybrid-x4 and replay the
whole inherited account. These retrospective event exclusions use evaluator
boundaries only; they are never proposed live rules, and impacts are nonadditive.
Export full/recent drawdown peak/trough dates to expose the extra exposure risk.
Keep audit outputs under output/sma20-fallback-audit, separate from the20 cases.

This20-case short run deliberately has no new durable checkpoint, scheduler
or growing cache. Rerun deterministically after interruption; completed
derived files remain atomic. Bound16MiB per input,10000 bars,2048 decisions,
20 policies and RSS1.5GiB; check graceful interruption between cases. Retain
all raw inputs and earlier outputs. Update CODEX_STATE, FEATURE_MAP,
TECH_RESEARCH, DATA_PIPELINE and CACHE_POLICY. Test causal lows/peaks,
unknown values, native priority, vetoes, unchanged holding/exits, scope,
prefix causality and baseline parity. No live feature changes are planned.
