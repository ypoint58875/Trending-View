# Neighborhood and concentration checks for earlier-risk exits

Research only; retain the same four frozen entry models, prices,1293 decision
dates, original costs and continuous2000-session Nikkei-close proxy. Do not
change production, old rules, source snapshots or earlier studies.

Freeze292 cases: per model unchanged baseline; entry-loss thresholds3.5/4/4.5%
through each integer age6..15 crossed with wait0/5 (60); daily decline>=prior
completed WilderATR14 times1.75/2/2.25/2.5 withclose<EMA7, wait0/5 (8); OR/AND
of4%-through10 andATR2, wait0/5 (4). Native4% first-five risk protection remains
active;3.5% is an additional earlier threshold, not removal of native protection.
Preserve prior actual-account exit cleanup and no added automatic recovery.

Reuse ExitPriorityAccount with its baseline method for native processing and
completed-bar evidence; apply a new explicitly parameterized research risk
predicate on that same account. Extra exit requires held before/still held
after native actions; no same-bar new-entry exit. State reset, pending-origin
cancellation, native stop authority, wait0/5 and causal flat boundaries remain
those already tested. No shadow-account masking or intraday fill assumptions.

Validate baseline and age10/ATR2 anchors against prior212-case target hashes
(20 overlaps). Keep total/final500/DD and first1500-only selection distinct.
Choose development parameters only by first1500 returns with no-worse training
DD, stable menu ties. For its forward diagnostic enable risk exits only after
the baseline's first1500 actual targets, asserting identical prefix; inherit
that account into final500. This is a chronology/state check on repeatedly
explored data, not a newly untouched out-of-sample claim.

For prior age10/ATR2 anchors suppress only added risk exits from2022-12-20
through that model's subsequent baseline full exit, then replay the actual
account. These retrospective episode bounds are evaluator-only, never live
rules or a replacement source history. Retain native stops/entries and other
dates. Require the age10 omission to recover the baseline target path; record
ATR2 omission without assuming additive effects. Compare all four500-session
blocks, exact final500 target parity and matched double-cost/next-open results.
Report neighboring parameter paths, sparse-event concentration, OR/AND target
equivalence and all failed cases, not only a new maximum.

Files: risk-exit-validation.ts/test and this design. Atomic20-case scalar
state data/risk-exit-validation/grid.json validates source/code/design/ordered
configuration identities; SIGINT/SIGTERM/RSS guards preserve complete work.
Bounds16MiB/input,10000 bars,2048 decisions,292 cases,RSS1.5GiB. Separate
output/risk-exit-validation holds all scalar rows, selected ledgers, omissions,
forward diagnostic and report. Update CODEX_STATE, FEATURE_MAP, TECH_RESEARCH,
DATA_PIPELINE and CACHE_POLICY. No raw deletion, market fetch, scheduler or
production default change. Tests cover parameter boundaries, combinations,
actual-account cleanup, omission versus prefix and anchor parity.
