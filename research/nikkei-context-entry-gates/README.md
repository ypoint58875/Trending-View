# Six-curve declining-phase increase gates

## Adopted variant after timing clarification

The user subsequently authorized production v9 for smoothed BIAS20 declining
at least3 days, restricting holding adds on the NEXT session. ADOPTION_CHECK.md
and adoption-check.ts/test.ts record the pre-implementation timing verification;
adoption-integration.test.ts checks production parity, resume and archived v8.
The cycle retains close execution for all other rules and reads the prior-close
gate:445.34% frozen return. Ordinary next-open uses its signal-close gate without
double lag:473.38%. This differs from the original same-close gate444.10% below.
The historical190-case study remains pinned explicitly to archived v8.

```powershell
npx tsx research/nikkei-context-entry-gates/adoption-check.ts
npx tsx --test research/nikkei-context-entry-gates/adoption-check.test.ts research/nikkei-context-entry-gates/adoption-integration.test.ts
```

Research only; no trading/UI changes. DESIGN.md freezes190 cases. RESULTS.md
contains the complete grid and explicitly separates the requested SMA-speed
three-session curve beginning to decline from negative speed or ongoing decline.

```powershell
npx tsx research/nikkei-context-entry-gates/run.ts --limit5
npx tsx research/nikkei-context-entry-gates/run.ts
npx tsx --test tests/market-context.test.ts research/nikkei-context-entry-gates/model.test.ts
npx eslint research/nikkei-context-entry-gates/*.ts
npm run typecheck
```

Existing frozen inputs are required under overlay-stability/data/full-screen-6-15.
The runner fails on hash mismatch. Inputs/reports16MiB each, bars10,000,
decisions2,048,190 serial cases, RSS1.5GiB boundary. Raw backups and case
checkpoints use source/code/design identity. output/latest.json locates the
current manifest/summary. An incomplete manifest is never successful completion.
Restart skips verified atomic matching-identity case files and checks target
hashes. Changed code/design starts a separate identity. No external effects.
Controller-level serialized resume and causal prefixes are checked per case.

Completed verification actually stopped after5 cases and resumed185, reusing5.
All190 cases passed controller resume/prefix checks; baseline targets and final
state exactly match current v8. Measured RSS260MiB.12 tests passed (4 research,
8 existing context), scoped ESLint and typecheck passed. No full app suite rerun
for this isolated research-only task.

## Findings and limits

The final user clarification is speed3[t]<speed3[t-1] with
speed3[t-1]>=speed3[t-2]. Positive speed can qualify. Do not reinterpret it as
the underlying moving average beginning to fall below zero speed.

20-session smoothed-speed onset blocking only holding adds gives442.59% full
versus440.98% baseline, with equal10.88% DD. Next-open468.46% vs465.36%.
Only2 increases were blocked:2019-02-01 and2020-09-23, both30% to100% requests
kept at30%. Final500 returns match baseline. The same event blocking flat
entries gives381.85%/DD12.65%, worse than baseline.60-session onset blocking
adds439.87%;200-session441.54%, but next-open461.90% trails465.36%.

Other exploratory candidates: smoothed BIAS20 declining3 consecutive sessions,
holding-add gate444.10%,next-open473.38%,4 blocked adds; raw200-session speed
declining, holding-add gate445.90%,next-open474.85%,3 blocked adds. These are
small reused-sample effects, not independent out-of-sample confirmation. All
their final500 effects are zero. Qualification permits a3pp development-return
shortfall;31 qualifying IDs are not31 superior strategies. Only8 qualifying IDs
improve full returns under both timings; duplicate paths are not independent.

The largest post-hoc close-proxy return458.54% comes from blocking raw BIAS-down
flat entries (20/60/200 share a path). Next-open450.41% trails465.36%, with worse
DD. This timing reversal prevents a universal improvement claim. Broad entry
restrictions can lose recovery opportunities. Holding-add caution has narrower
historical effects and warrants prospective observation, not deployment.

No deferred original buy is invented after a block. Native stops/reductions
always execute. Actual modified allocation defines entry versus add scope.
Blocked adds preserve entry age; blocked flat entries preserve real flat-window
history. Forward price means after blocked opportunities overlap, and are not
avoided-loss estimates. Do not turn these190 repeatedly examined cases into a
claim of robustness or an optimized production parameter choice.
