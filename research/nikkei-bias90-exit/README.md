# BIAS20 P90 exit research

Research only. DESIGN.md freezes twelve cases; RESULTS.md contains the generated
table. Raw speed is SMA20[t]-SMA20[t-1], in points/session. Smoothed speed is
the trailing three-session average of raw speed. A decline compares each curve
with its own previous value, not with zero. P90 always uses raw BIAS history,
preceding three calendar years, excluding today and requiring252 observations.

To isolate speed smoothing, compare raw-raw-armed with raw-smooth-armed, or
raw-raw-same-day with raw-smooth-same-day: BIAS input is identical. The other
four cases repeat this with smoothed BIAS. Armed keeps threshold memory until
native flat/additional exit, including same-day activation. Same-day requires
BIAS still above P90 at the exit. Strict-turn is a further timing sensitivity;
negative speed means SMA20 actually declining. Neither is a tuned replacement.

Run from repository root, with the existing frozen full-screen-6-15 inputs:

```powershell
npx tsx research/nikkei-bias90-exit/run.ts
npx tsx research/nikkei-bias90-exit/run.ts --combined
npx tsx research/nikkei-bias90-exit/run.ts --weighted
npx tsx --test research/nikkei-bias90-exit/model.test.ts
npx eslint research/nikkei-bias90-exit/*.ts
npm run typecheck
```

Both production target and final state baseline match. Every variant checks
serialized mid-series resume and future-free prefixes. Controller state follows
the modified account, rather than masking a precomputed baseline target path.
Extra exits bypass native hold/trend guards and clear entry/recovery/pending
state. New entries can be vetoed; no artificial roundtrip is charged at the same
close. Original later buys remain possible, with no new cooldown. Therefore
additional sales and vetoes need not equal the difference in total fills.

Inputs16MiB each; bars10,000; decisions2,048;12/23/37 cases serially; RSS ceiling1.5GiB.
Atomic output reports carry identity; raw backups retain identity directories.
On interruption rerun the bounded deterministic twelve-case command. Outputs
are replaced, input identities retained, external effects absent. A running
manifest is not complete. Initial, combined and weighted output folders are separate.
Interrupted whole-study restart and serialized account
resume are different recovery mechanisms. Per-case yield allows signal handling.

No current quote fetch or production rule changes. This previously studied
historical sample is conditional research, not untouched out-of-sample evidence.
Forward5/10/20 close returns overlap and do not measure avoided account loss.
Next-open sensitivity uses ordinary execution; the main table retains the
existing Nikkei-page close proxy and is not a domestic ETF execution promise.

COMBINED_RESULTS.md covers the later user-authorized23-case combination study,
with32 unique policies across both menus (35 executions including controls).
The combinations require additional weakness, native release guards, or cap
allocation at half. Native guards use the production request/release method,
not copied thresholds. There are zero candidates passing the declared
first1500/final500 return/drawdown conditions under both execution conventions.

Potential descriptive usage, not a validated probability ladder: label hot BIAS
plus raw/smoothed speed decline as high-position momentum deceleration; show
WMA7 direction, EMA7/SMA20 price position and six-curve disagreement alongside.
Do not equate deceleration with reversal or assign an unsupported severity
score. Two declines plus EMA7 break at half allocation reduced historical
drawdown but also materially reduced returns. Its forward price outcomes still
often rose. No additional trading or UI rule has been implemented.

Weighted extension: WEIGHTED_DESIGN.md and WEIGHTED_RESULTS.md freeze and evaluate
37 cases, including18 matched context-point ablations. Scores are additive, with
native intent2, hot-BIAS/deceleration1, EMA7 break plus WMA7 decline jointly1,
four-of-six down1. Raw/SMA3 speed are alternative definitions, not two points.
Threshold3/4/5 and scopes any/native-intent/native-executed-partial-reduction.
Original increase priority is preserved. Context is not mandatory. C0 removes
its point at exactly the same threshold; no-op baseline-equivalent candidates
are excluded from qualification. A lower score is not a calibrated probability.

Some paired contributions improve historical performance. In executed-reduce,
threshold4, adding context raises full close-proxy return416.23% to430.12%,
but baseline is440.98%; final500 remains98.99% versus baseline99.85%, and DD
11.45% versus10.88%. Both speed definitions give the same path here. The added
sale is2020-12-11: native target60% becomes0%, reentry on2020-12-14. This is
one extra action with subsequent inherited state changes, not a direct13.89pp
profit from that trade. Next-open return470.06% exceeds baseline465.36%, but
DD11.24% is worse than9.44% and final500104.06% trails106.91%. Zero weighted
cases pass declared conditions under both timings. Some C1 cases are much
worse than C0, so do not generalize from one improved pair or deploy a score.
