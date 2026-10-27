# Additive held-peak liquidation on four specified strategies

## Scope frozen before evaluation

User clarified four unique strategies, not contribution-study controls:
native v5 (382.6997%/95.5087%); turn4 unfiltered (435.7026%/86.1901%);
turn4 RSI35-to40 (438.3372%/99.8490%); daily4-ema3 (388.5473%/98.1439%).
Use existing FilterAccount with baseline exits and native entry priority.
Preserve frozen full-screen-6-15 prices/signals, decisions, fees and continuous
account. No rescreening, date switches, changes to product or older studies.

For each strategy compare unchanged control and40 additive policies:
two peaks (highest close since this actual entry, or highest close within
the latest20 held bars), ten drawdowns2/3/4/5/6/7/8/10/12/15%, and zero/five
subsequent-bar waits. Total164 cases. Today is included in the completed-close
peak; prices before actual entry are excluded. Partial adds do not reset peak.
Trigger close<=peak*(1-X), inclusively, only if held at the preceding close
and still held after native actions. No prior-profit requirement. Native
exits/stops remain authoritative; the new stop overrides hold/ordinary sell
protection only on a still-held position. Do not fabricate intraday threshold
fills or immediately stop a new entry using pre-entry prices.

Forced exit clears this actual account's allocation, pending sells, supplemental
hold/entry marks and old recovery intent. Reset causal flat boundary to exit
bar. Wait0 permits original/native entries next bar; wait5 blocks the next five
bars and permits the sixth. Neither adds a new automatic recovery/buy rule.
Existing native4% first-five stops retain their own cooldown/recovery policy.
Use the single actual changed account thereafter, never mask a shadow target.

## Reporting, bounds and files

Full2000 sessions2018-08-09..2026-10-26; final500 from2024-10-04; recent after
2026-07-21 close. Report every case's return/drawdown/cuts, distinct target paths,
best full-return case, simultaneous higher full/final500 with no-worse fullDD,
and a first1500-only selector. The best full case can worsen final500/DD; do
not hide that. All selection remains on repeatedly explored history, not
untouched validation or future guarantees. For selected policies show matched
double-cost and next-open target-intent execution sensitivity. Main remains
explicit Nikkei completed-close proxy. Price stop lines are not fill prices.

Files: peak-liquidation-study.ts/test and this design. Atomic20-case scalar
state data/peak-liquidation/grid.json validates source/code/design/ordered
configuration identity and safely resumes. SIGINT/SIGTERM/RSS checks commit
complete work. Bound16MiB/input,10000 bars,2048 decisions,164 cases,RSS1.5GiB;
retain only selected detailed ledgers under output/peak-liquidation, all scalar
cases in summary/report. Test disabled parity, peaks/prefixes, current-entry
exclusion, partial adds, stop override/state cleanup, waits and cache drift.
Update CODEX_STATE, FEATURE_MAP, TECH_RESEARCH, DATA_PIPELINE and CACHE_POLICY.
No scheduler, raw deletion, new market fetch or production rule changes.
