# Frozen-v8 whipsaw filter study

Research only. Read DESIGN.md before interpreting the153-case results.
The production v8 controller, execution engine, frozen winners and all browser
accounts remain unchanged. Raw sources and derived large tables are ignored.

Run from the project root:

```powershell
npx tsx research/nikkei-chop-filter/run.ts --limit 2
npx tsx research/nikkei-chop-filter/run.ts
npx tsx research/nikkei-chop-filter/audit.ts
npx tsx research/nikkei-chop-filter/report.ts
npx tsx --test research/nikkei-chop-filter/model.test.ts research/nikkei-overlay-stability/rsi-shape-integration.test.ts
npm run typecheck
```

`--limit` stops after the requested number of newly completed candidates. A
subsequent run resumes the validated prefix in data/<identity>/progress.json.
Identity includes source, design, model, runner and production calculation
dependencies. Changed implementations use separate identity directories;
incompatible/copied checkpoints fail validation without overwriting them.
No automatic deletion of older research data occurs. Production state is never
used as a checkpoint and never reset. Source input and signals have separate
raw JSON backups and hash provenance in each ignored data identity directory.

RESULTS.md contains the compact report; output/grid.csv contains every declared
parameter and train/validation/audit/full metrics. output/summary.json also
contains selected-policy cost/next-open/block details and baseline closed-round
diagnostics. output/audit.json records fresh153-row recomputation, zero-filter
identity, stateful resume, causal prefixes and risk-exit checks.

No family qualifies under the predeclared development/validation conditions;
all fall back to baseline. The validation-return leaders are shown as failed
candidates, not proposed deployments. The best full-sample candidate is labelled
post-hoc and also trails the baseline. All152 alternatives reduce total fills,
but none improves full-period net return on this frozen input.

Trade counts are executed buy/sell/add/reduce sides, not independent roundtrips.
Completed round return is total account-equity change from immediately before
entry through the full-exit close, including costs and partial adjustments.
Terminal open rounds are excluded. Holding<=7 days is a retrospective outcome,
not an executable entry filter. The predeclared entry-time low-width/low-ER label
captures only one of the ten short closed rounds. This cannot locate the exact
date-free screenshot intervals or prove the cause of their losses.

The archived v8 rule and input have been repeatedly studied; the final500-day
audit is conditional historical evidence. The main result retains the Nikkei
close proxy. Ordinary next-open sensitivity is explicitly separate. Actual cost
is3bps commission plus2bps slippage; zero and20bps/side stresses are included.
Missed upward blocks use fixed nonoverlapping20-session price gains>=5%, solely
for retrospective diagnosis. Gross/net gaps include compounding.

Bounds:10000 bars,2048 decisions,16MiB per input JSON,153 compact candidates,
one active replay,1.5GiB process RSS ceiling. Main observed RSS133MiB; fresh-grid
audit172MiB. Atomic progress after each candidate survives interruption; at most
one unfinished2000-bar candidate needs recomputation. Tests and the actual run
verified a2-case stop followed by a151-case resume. No network jobs are submitted.
