# Bounded rule-variant comparison

Freeze the menu before running. Use the exact completed full-screen input and
signals in `data/full-screen-6-15/`; no new prices or strategy optimization.
Keep EMA7/SMA11 0.075%/WMA7, original two-bar sequencing, original-signal
priority, full-entry only while empty, and the existing close-price proxy and
costs. Do not introduce unconditional exits: extra exit conditions delay only
pending original reductions, retaining their minimum target and cancellation
on fresh original buys. Preserve partial positions.

Independent dimensions (96 total):
- Supplemental entry: original EMA positive turn; EMA slope positive as a
  state; WMA slope positive as a state; both EMA and WMA slopes strictly
  positive for two completed consecutive bars. The WMA nonnegative gate
  remains for all entries, and original signals suppress supplements.
- Reduction confirmation: current SMA guard alone; also require EMA slope
  nonpositive; also require WMA slope negative; also require both EMA
  nonpositive and WMA negative; also require close below EMA7; also require
  WMA negative for two consecutive completed bars. Existing SMA >0.075%
  protection still applies independently.
- Minimum supplemental holding period: 0, 2, 3 or 5 trading-bar intervals.
  A supplemental fill at i is protected until i+N; then any pending reduction
  can execute subject to the selected trend confirmation and existing guard.
  Original entries receive no new holding lock. No future bars are inspected.

Use one empty-start 2000-day account per fixed rule. Rank full-period outcomes
for descriptive maxima, but select the declared development winner by net
return of the first1500 only (ID tie-break), then report its final500 separately.
Also run expanding 500/1000/1500-history selection for the next500 using one
inherited deployment account. Selection uses only fixed-rule hypothetical
paths observed before deployment; retain live holdings, pending sells and
supplement age across rule changes. Compare identical deployment dates with
the baseline. Report all 96 rows, four continuous blocks and the development
winner/full maximum with double commission/slippage sensitivity.

The base settings and dates were already researched using the full history;
none of these segments is an untouched holdout. This does not establish causal
end-to-end profitability or future optimal parameters. Methodology references
and fixed-grid/chronological trade-offs are in docs/TECH_RESEARCH.md.

Reuse `Account` through a feature-view adapter rather than duplicating order
resolution. Prove baseline production parity, pending partial reduction release,
original priority, holding-period boundaries and prefix causality. Keep output
under `output/rule-variants/` with source/design/implementation identities.
Only 96 bounded replays (plus short diagnostics) are performed; no new durable
checkpoint is justified. Each source file is at most16 MiB, bars at most10000,
decisions at most2048, with a1.5 GiB RSS guard and stop checks between candidates.
Rerunning regenerates only this study's outputs; all source and prior output
files are retained. No schedule, live preference or production change.
