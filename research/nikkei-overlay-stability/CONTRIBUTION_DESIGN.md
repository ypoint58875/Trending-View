# Screening and overlay contribution decomposition

## Scope

Research only. Freeze the existing full-screen-6-15 source,1293 decision dates,
2000 evaluation bars, actual two-bar sequence semantics and v6 production
controller. Do not optimize parameters, alter product rules or fetch data.
Full2018-08-09..2026-10-26, final500 from2024-10-04, recent strictly after
2026-07-21 close. Preserve fees/slippage and inherited allocation. Main fills
use the explicit Nikkei completed-close proxy; next-open/double-cost sensitivity
must use matching controls. Never rerank the frozen winners in this study.

## Controls declared before calculation

1. Dynamic frozen screening signals, raw account.
2. Dynamic frozen signals, all current v6 rules.
3. First decision's winning plan held fixed, raw account.
4. Same fixed first plan, v6 rules.
5. Preset SMA10/30 standalone, raw account.
6. Same preset SMA10/30, v6 rules.
7. No original signals, v6 only. This removes ordinary sell requests too;
   standalone supplement rules have no general exit, so disclose that limitation.
8. Dynamic frozen signals with v5, isolating adopted rebound increment.
9. Buy-and-hold starting at the first evaluation close, same fees.

Fixed controls retain the same1293 decision opportunities and production
two-bar signal extraction. The initial winner is known at the first evaluation
close, not chosen from full-period profitability. SMA10/30 is a predetermined
simple sensitivity control, not optimized. Retain its ordinary execution
semantics only through the cycle target/two-bar contract, not touched orders.

For each fixed control compare the2x2 interaction. If A=dynamic raw,B=dynamic
v6,C=fixed raw,D=fixed v6, report A-C,B-D,B-A,D-C and B-A-D+C. Symmetric
order-averaged allocations are0.5*((A-C)+(B-D)) and0.5*((D-C)+(B-A)), summing
to B-C, not to B itself. Also compute additive log-wealth effects. These are
conditional accounting counterfactuals, not independent causal alpha or proof
that rescreening without overlays would select the same winners.

## Diagnostics and persistence

Replay one actual inherited account per case. Record exposure, fills, position
changes, original signal days/hold-conflicts, supplemental empty-account entries,
original reductions still unexecuted at that close, original increases failing
to reach their request, no-original exits, and raw-account path differences.
Supplemental entries include native stop recovery; do not call them new trades
independent of screening. Original-reduction deferral counts are request-days,
not independent orders or proven incremental profit.

Files: contribution-study.ts/test and this design. Outputs under
output/contribution, scalar summary/report plus selected case ledgers. Reuse
frozen raw sources. Two fixed-plan signal caches commit atomically every64 rows
under data/contribution/signals.json with source/implementation/ordered index/
policy identities. Reject drift; never delete or rewrite previous identities.
Bounds:16MiB per input,10000 bars,2048 decisions per control,2 fixed controls,
9 final cases,RSS1.5GiB. SIGINT/SIGTERM commit complete signal rows; unfinished
finite account runs rerun. Keep only selected9 bounded ledgers; no scheduler,
market cache, TTL or raw deletion. Update CODEX_STATE, FEATURE_MAP,
TECH_RESEARCH, DATA_PIPELINE and CACHE_POLICY. Tests cover raw priority,
fixed-signal prefixes, diagnostics, accounting identities and cache drift.
