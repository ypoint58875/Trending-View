# Earlier exits and original-liquidation priority

Research only on the four frozen native v5/turn4/RSI35-to40/daily4-ema3 models.
Keep2000 sessions2018-08-09..2026-10-26, final500 from2024-10-04, recent after
July21, original decisions, entry rules, costs and Nikkei close-proxy execution.
Do not change production, rescreen, fetch data or optimize dates.

Hypothesis1: pending original zero-target sells are delayed unnecessarily by
hold7/SMA11/WMA7 guards. Test conditional priority release, not converting a
partial sell into a full exit. Preserve first pending-zero origin; repeated
requests do not reset age, fresh original increases cancel it. A preexisting
unresolved zero sell can remain eligible on conflict-hold dates, as native
pending release does. Hypothesis2: independent trend weakness, abnormal daily
drop, or extended entry-loss protection can exit without waiting for a sell.

Freeze26 methods crossed with wait0/5, plus control, for each model:212 cases.
Priority methods require actual pending target0 after native processing:
immediate; entry age>=3; WMA7<0; SMA11 slope<=0.075%; EMA7<0;
close<EMA7; two negativeEMA7 slopes; two negativeWMA7 slopes; close<SMA20;
pending age>=2; entry age>=3 andWMA7<0; close<EMA7 andWMA7<0;
entry cumulative loss>=2%; entry cumulative loss>=4%.
Independent methods:
two negativeEMA7 slopes withWMA7<0; two closes below their EMA7 withWMA7<0;
two closes below their SMA20 withWMA7<0; negativeEMA7/EMA20 slopes andclose<EMA7;
close below the previous two completed lows withnegativeEMA7/WMA7;
daily decline>=1/1.5/2 times prior completed WilderATR14 andclose<EMA7;
entry loss>=4% through age10; entry loss>=4% at any age;
entry loss>=3% at any age; entry loss>=5% at any age.

All predicates evaluate completed current/prior bars only. New exits apply
only if held before the bar and still held after native actions. No new-entry
same-bar liquidation. Native stops/exits retain authority. New full exits
override ordinary protection, clear pending/entry/holding/recovery marks and
reset actual flat history. Wait0 allows native entrances next bar, wait5 on
sixth subsequent bar, without adding an automatic recovery buy. Independent
risk exits can override an original add on a held account; priority exits
cannot override a fresh buy that cancels the pending sell.

Baseline diagnostics count pending-zero held days and overlapping protection
causes, not request days or independent lost profits. Record full/recent DD
dates, local exits and pending origins. Compare total/final500 returns, DD,
cost/next-open sensitivity and first1500-only selection. Show highest return,
lowest DD and lower-DD/no-worse-both-returns cases separately. Declare strict
dual-return/no-worse-DD counts, unique paths and failed cases; do not call
repeated historical search independent validation.

Files: exit-priority-study.ts/test and this design; update CODEX_STATE,
FEATURE_MAP, TECH_RESEARCH, DATA_PIPELINE and CACHE_POLICY. Atomic20-case scalar
state data/exit-priority/grid.json validates source/code/design/ordered-menu
identity. SIGINT/SIGTERM/RSS checks commit complete work. Bounds16MiB/input,
10000 bars,2048 decisions,212 cases,RSS1.5GiB. Separate output/exit-priority
retains all scalar cases, selected ledgers and baseline blocked-day diagnostics.
Tests cover native parity, causal prefixes, cancellation, partial sells,
age/ATR boundaries, priority cleanup and wait intervals. No raw deletion,
growing cache, scheduler or production rule changes.
