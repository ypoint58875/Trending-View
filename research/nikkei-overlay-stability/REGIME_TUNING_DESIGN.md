# Causal regime diagnosis and limited tuning

Research only; reuse immutable full-screen bars/signals and current v5.
Diagnose the64 sessions strictly after2026-07-21 close, ending2026-10-26.
Separate descriptive whole-interval labels from executable daily detection.

Methods considered: ATR measures fluctuation magnitude but cannot distinguish
trending from sideways prices. Kaufman efficiency ratio (ER) measures net close
movement divided by summed absolute movements and has no directional sign.
Combine ER20 with return/drawdown, daily-sign reversals, SMA20 crossings,
EMA7 positive-run lengths, original signal conflicts, ATR14-percent and close
versus SMA60. ATR here is Wilder-smoothed true range seeded by the first14
observations, not the earlier research's SMA range approximation.

Before results, freeze two executable detectors. Noise enters at ER20<=0.25
and exits at ER20>=0.35, each after two consecutive eligible days. Wide-noise
additionally requires ATR-percent >= the median of preceding252 ATR-percent
observations for entry; ATR rank<0.4 also allows exit. Rank excludes today's
value. Detector state observed at yesterday's close controls today's overlay;
unknown features leave state unchanged and reset confirmation counters.
No date-based live switch or future64-day summary is allowed.

Freeze six actions under each detector plus baseline (13 cases):
1. Delayed supplement eligibility within3 sessions of the latest EMA7 turn.
2. Shorten supplemental/reversal hold7 to hold3 only.
3. Hold3 and allow pending original reductions once WMA7 becomes negative,
   without also waiting for SMA11 protection to disappear.
4. Hold3 and release pending original reductions without SMA11/WMA protection.
5. Delayed3 plus action3.
6. Delayed3 plus action4.
These are changes to existing pending reductions, not automatic regime exits.
All use one continuous account. Original two-bar priority, SMA20 supplemental
gate, V-entry definition, early4% stop, wait5 and recovery remain unchanged.
Leaving a regime restores baseline settings without resetting positions,
pending reductions, turn history, cooldown or entry-age marks. Re-entry history
continues globally; delayed windows are not uncancelled standing orders.

Report full2000/first1500/final500/pre-cutoff/recent returns and drawdowns,
double-cost and next-open sensitivity, daily regime transitions, exposure and
per-case ledgers. First1500 alone selects among candidates no worse than
baseline drawdown; baseline wins ties. Do not select on recent returns.
Report all candidates to show tradeoffs, including recent winners that damage
the full path. Prior research makes every interval retrospective.

Find historical descriptive analogues in nonoverlapping64-session blocks
ending before the cutoff. Distance averages absolute feature differences
scaled by historical interquartile ranges for ER64, ATR-percent, reversal rate,
SMA20 crossing rate and return. Compare nearest five, selected without strategy
PnL, on inherited-account returns; these labels use entire blocks and are
diagnostic only. Separately show chronological252-session performance blocks.

Bound files16MiB,10000 bars,2048 decisions,13 cases and RSS1.5GiB. Source,
bars, design and implementation hashes are recorded. Short finite runs use
atomic outputs under output/regime-tuning, no growing cache or new scheduler.
SIGINT/SIGTERM stop safely between cases; rerun regenerates derived artifacts.
Preserve sources and prior research outputs. Test detector lag/hysteresis,
ATR gaps, prefix causality, state-preserving switches and baseline parity.
No production feature or protocol changes; focused tests and typecheck suffice.
