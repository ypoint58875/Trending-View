# Supplemental episode sizing and exit study

Research only. Freeze this design before evaluating321 cases on the existing
2000-session full-screen source ending2026-10-26. Current-v5 remains baseline.
Reuse the existing ER20/Wilder14 ATR/preceding252 volatility rank detector.
Compare wide-noise with weak-wide: wide-noise additionally requires yesterday's
close below yesterday's SMA60 at the time of supplemental entry. Both use
previous-close regime state. No known date boundary controls trading.

Compare fixed initial allocation25/50/75% with ATR-percent budgets1/1.5%:
allocation=clamp(budget/previousATRPercent,0.25,1). This is bounded entry sizing,
not a continuously rebalanced volatility-target portfolio. Cash earns zero;
there is no leverage. Unknown lagged volatility skips risk-tag creation.

Freeze baseline plus2 detectors x2 scopes x2 entry modes x5 sizing methods
x2 restoration rules x4 exit rules =321 cases. Scopes: EMA supplements only,
or EMA plus V supplements. Entry modes: current turn, or pending3 eligibility
only while the relevant entry regime is active. Preserve ordinary signals,
SMA20/WMA gates, V definition, early4% stop, wait5 and recovery. Original buys
are not capped. A risk episode starts only from an eligible flat-account
supplement, excludes stop recovery, and persists through regime changes until
flat or an original resolved increase. It is an actual partial account, not
scaled returns from an independent full-allocation shadow strategy.

Restoration rules: none; or restore to100% on a later bar after two consecutive completed closes
above both SMA20/SMA60 with positive current EMA7/WMA7 slopes, no original
signals, no pending sell and no stop on that bar. Restoration keeps episode
entry age/cost basis and hold mark. It does not reset early-stop protection.
An original increase regains authority, ends the risk tag and follows the
existing absolute allocation target. Original reductions remain absolute
targets and cannot increase an already smaller position.

Four exits for tagged supplemental episodes:
- Baseline pending-reduction protection, hold7/SMA11/WMA7.
- WMA-only: retain hold7 and WMA-negative confirmation, remove SMA11 protection.
- EMA-only: retain hold7 and require EMA7 nonpositive, remove SMA11/WMA checks.
- ATR giveback: baseline plus a no-original-signal close-based exit once peak
  close minus episode entry close >= entry ATR and peak close minus current
  close >=1.5 current ATR, with close<EMA7. This emergency exit overrides hold7,
  uses the observed close rather than an inferred threshold fill, waits five
  subsequent bars and requires a fresh ordinary/supplemental entry afterward.
The existing early4% stop takes priority and retains its actual stopped target.

Report full2000,first1500,final500,pre/postJuly21 returns/DD, four500 blocks,
five earlier descriptive analogues, fills and episode counters. Rank all cases
for disclosure; first1500-only return ranking is constrained to no worse DD
than baseline, with baseline then stable menu order breaking ties. Full-sample
simultaneous-improvement candidates are descriptive, not prospective winners.
Do not adopt a recent-only winner. Finalists include baseline, development,
full-best, full-best-no-worse-DD and recent-best for cost/next-open diagnostics.

Bound files16MiB,bars10000,decisions2048,cases321,RSS1.5GiB. Source/bars/design/
implementation hashes and ordered policy IDs validate resume. Atomic scalar
checkpoint every20 completed cases under data/regime-sizing/grid.json; outputs
under output/regime-sizing, with selected ledgers separate from scalar state.
SIGINT/SIGTERM/RSS checks stop between cases and checkpoint completed rows;
rerunning repeats only uncommitted work. Reject incompatible state explicitly.
No scheduled refresh, growing cache or automatic deletion. Preserve raw sources
and earlier studies; derived outputs may be explicitly regenerated. Test actual
partial-position transitions, scope/priority, risk-stop recovery, holding,
restoration, ATR exit, prefix causality and checkpoint identity.
