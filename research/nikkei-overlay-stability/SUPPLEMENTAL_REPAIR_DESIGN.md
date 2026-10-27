# Explicit-regime and independent supplemental repair proposal

## Objective and scope

User requests a concrete attempted solution, with or without segmentation;
every segmented candidate must have explicit causal entry/exit definitions.
Improve post2026-07-21 behavior without sacrificing baseline full return/DD.
Freeze this menu before evaluating. Reuse full-screen input/signals, same costs
and close proxy,2000 sessions2018-08-09..2026-10-26. No live policy change.

Prior research altered the inherited main account when supplementing, changing
later original signals, risk stops and recovery. Compare a different architecture:
the unchanged v5 main controller produces its continuous shadow target; a small
supplemental sleeve may invest only while that target is zero. One real account
executes the combined target, never leveraged or obtained by scaling returns.
Any positive main target wins immediately and clears supplemental intent/state.
Main early-stop cooldown blocks supplements; local supplemental cooldown never
blocks a later allowed main target. Main virtual signal episode marks remain
the original model's marks, not a broker-average cost. Original absolute target
requests are still authoritative for the main controller.

## Explicit segmentation

Compare no segmentation, range and wide-range. Features use EMA20 and priorATR14:
D1=(EMA20[t]-EMA20[t-3])/(3*ATR14[t-1]); D2=(EMA20[t]-2*EMA20[t-3]+EMA20[t-6])/
(9*ATR14[t-1]); ER20 andER5 use absolute net displacement/absolute daily path.

Range entry requires3 consecutive completed closes with ER20<=0.25 and
abs(D1)<=0.10. Wide-range additionally requires ATR-percent rank>=0.60 in
the preceding252 valid observations (today excluded). Unknown inputs mean
not active and reset confirmation counters. Range exits after either:
-2 consecutive closes with ER20>=0.40 and abs(D1)>=0.15; or
-2 consecutive closes with abs(close[t]-close[t-5])>=2*priorATR14 andER5>=0.60.
Wide-range also exits after3 consecutive ATR-rank<=0.40 closes.
Any absolute daily close move>=2*priorATR14 and>=2% causes immediate regime exit
at that close, even if the minimum residence below has not elapsed. Otherwise
retain at least5 bars after regime entry; exit counters still accumulate.
Enter/exit cannot happen on the same close. Entry allowed only on the next bar
after a completed regime-entry close. Classifier changes never rewrite history.
Segmentation gates new supplemental entries only; an open sleeve follows its
explicit exit rules after leaving the regime, avoiding a forced sale on every
classification change. Export every actual start/end, exit reason and date.

## Supplemental entry candidates

All require main target zero, no original signals today, EMA7 rising, WMA7
nonnegative, close>SMA20, no main/local cooldown and a rearmed entry gate.
Compare3 triggers:
1. Queued turn: a no-original-signal EMA7 positive turn while main is flat
   starts a3-session eligibility window, including the turn day. Cancel on
   EMA7 nonpositive, any resolved original reduction, positive main target,
   expiry or any acquired sleeve. Unlike earlier pending3 research, ordinary
   reductions explicitly cancel intent rather than merely blocking that day.
2. Fresh conjunction: above gates become true after being false on the prior
   close, allowing later price confirmation without an old queued order.
3. Breakout5: close exceeds the highest high of the preceding5 bars plus above
   common gates. An exit disarms entry until common price/trend gates become
   false again; this prevents buying every new high after a reduction.
Original reductions cancel new intent and are never overridden by an entry.

## Sleeve management

Compare allocations25/50/75/100%, time limits10/20 sessions, and two close-based
hard stops: cumulative entry-close loss>=4%; or loss>=min(4% entry close,
1.5*entry priorATR). Risk stops execute at observed closes, not thresholds,
and block new sleeve entries for the next5 completed bars. All time and stop
marks reset only on a fresh sleeve episode. Main entries override sleeves.
Age is index-current entry index: entry close is age0, and time exit occurs at
age>=10 or20. A segmented entry is blocked on a close that confirms regime
exit, even though yesterday's mode had been active.

Compare four exits (hard stop/time limit always have priority):
- Original: exit on any resolved original reduction.
- WMA: original reduction sets durable pending intent; exit when WMA7 negative.
- Curvature: same pending intent; exit if WMA7 negative OR2 consecutive D2<=-0.005
  and current close<previous close. Curvature alone cannot exit without pending
  original reduction intent and observed weakness.
- ATR giveback: original reduction exits immediately; additionally exit after
  highest held close-entry close>=1 entryATR and drawdown from that peak>=1.5
  current ATR with close<EMA7.
For original/WMA/curvature exits,2 consecutive completed closes below EMA7 with
negative WMA7 also close a sleeve independently of original intent. Normal
exits disarm the entry trigger; hard stops additionally impose cooldown.
Unresolved/conflicting original sequences block new entries but do not invent
a reduction or override the baseline two-bar sequencing policy.

## Frozen comparison and selection

Baseline +3 regime modes x3 triggers x4 allocations x2 stops x2 time limits
x4 exits =577 cases. First1500-only selection maximizes return subject to DD
no worse than baseline, baseline/menu-order tie breaks. Report full2000,
first1500/final500,pre/postJuly21, four500 blocks, fills and supplemental counts.
Disclose all full-sample simultaneous-improvement cases but never call them
validated or automatically deploy. Finalists: baseline, development, best full,
best full with no-worse DD, best recent, and best unsegmented if distinct.
Also count candidates that retain baseline full return/DD and improve both
recent and final500 return, so an improvement unrelated to the user's weak
interval is not reported as solving that interval.
For finalists, compare double cost, next-open and a retrospective common-state
fork that suppresses sleeves throughJuly21. Date forks are diagnostics only.
Main target arrays must equal current production on all2000 bars for every case.

## Persistence and verification

Scalar progress commits atomically every20 completed cases under
data/supplemental-repair/grid.json with source/design/code/menu identities.
Resume rejects drift; SIGINT/SIGTERM/RSS checks preserve completed rows. Bound
16MiB/input,10000 bars,2048 decisions,577 cases,RSS1.5GiB. Selected full ledgers,
mode segments, summary, proposal and report live under output/supplemental-repair.
No new source fetch, rescreen, growing cache or scheduler. Preserve all earlier
sources/checkpoints/results. Test hysteresis/exit priority/no backfill, queued
cancellation, rearming, actual allocations, main priority, stops/cooldown,
pending exits, time limits and every candidate's prefix causality. Check ledger
versus summary, full baseline parity, restart reuse and typecheck. No product
feature change; initial verification is focused research tests, not a deployment.
