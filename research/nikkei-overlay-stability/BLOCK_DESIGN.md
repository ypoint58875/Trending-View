# Expanded 5..16 grid and selection of segmentation length

This supersedes the earlier 7..15 menu only for the new block experiment.
Preserve the earlier outputs and production behavior. The user clarified that
100/300 sessions are illustrative: choose a useful segmentation length as part
of the experiment, rather than assuming either is optimal.

## Declared menu and chronological experiment

- EMA entry, SMA exit and WMA gate periods are independently5..16 inclusive.
  Exit slopes are0.025%..0.2% in0.025 percentage point increments. All three
  controls are on. Exactly13824 parameter combinations per optimization.
- First optimize the complete2000 sessions as a retrospective diagnostic.
- Segment lengths are40,60,80,100,126,160,200,252,300,400,500 trading sessions.
  For each length L, train on the immediately preceding L sessions, freeze
  the winner for the next L sessions, then repeat. A common deployment start
  at offset500 gives every length the same1500-session comparison interval.
  Final partial deployment blocks are retained and explicitly marked.
- Each training account starts empty, using full-prefix indicator warm-up and
  the original causal screening decisions. Training ends before deployment.
  Optimize net return; equal-return ties prefer the smallest normalized
  distance from current parameters, then deterministic parameter ID. Record
  the number of tied optima because many settings can be behaviorally identical.
- One actual deployment account begins empty at offset500. Preserve its target
  and pending sells across every parameter update. Changing parameters does
  not itself force synchronization to a theoretical training holding.
- Choose L on offsets500..1499 using net development return, then lower
  development drawdown and longer L as deterministic tie-breaks. Evaluate
  offsets1500..1999 separately. Each alternative's later result remains a
  diagnostic; never select L using it. Report neighboring L performance,
  completed fold counts, costs and benchmark-relative consistency as well.
- History length and update interval are equal in this declared experiment.
  It selects among equal-length block policies, not every possible unequal
  training/deployment pair in existence.

## Parameter lifetime

For every training winner, also freeze it beyond the normal next block for
up to500 available future sessions. Separate matched empty-start diagnostic
accounts compare it with holding/current settings. Report cumulative net
relative wealth at ages20,40,60,80,100,126,160,200,252,300,400,500, the number
of available vintages, median excess and fraction outperforming holding.
Future horizons never change the historical parameter selection.
Record first gain over holding and subsequent20-consecutive-session loss
after that gain, with right-censoring; do not call this a universal expiry.
Report the same age summaries for vintages whose entire diagnostic horizon
ends before offset1500, so developmental lifetime evidence is distinguishable.

## Evidence and implementation

Two approaches are retained: full-sample fixed-grid optimization explains
historical upper bounds; sequential train-then-deploy evaluates periodic
reoptimization. Only the latter can address the user's practical question.
References rechecked2026-10-25:
https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html
and https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf.
The supplied quick-screen library lacks historical training vintages, and the
sample was previously explored. All results remain conditional historical
research. No independent end-to-end deployment or future-return claim is made.

Reuse the source-hashed frozen input and production-parity-tested research
account. Execute training on bounded local bar slices through the production
allocation ledger, reusing each slice's execution context. Save one compact
numeric grid per complete training window atomically, bounded to13824 rows;
checkpoint full-period search every512 rows. Resume rejects incompatible
source/design/code identities. SIGINT/SIGTERM stop at chunk/window boundaries.
Keep raw inputs and older outputs; new derived caches live under
`data/block-cache/`, compact results under `output/blocks-5-16/`. Bound RSS to
1.5 GiB and grid cache to the finite declared window set (under100 MiB).
No new market requests, queue changes, scheduler or automatic deletion.

Planned files: this design, `block-study.ts`, `block-study.test.ts`,
`block-report.ts`, `block-ui-text.ts`, `block-plot.py`, research README and
linked CODEX_STATE, FEATURE_MAP, TECH_RESEARCH, MODULE_PATTERNS, DATA_PIPELINE
and CACHE_POLICY documentation. Verify grid completeness, chronological
boundaries, production-ledger equivalence, ties, inherited state and resume.
