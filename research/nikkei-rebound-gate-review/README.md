# Current-v8 rebound gate review

Research only; no production rule changes. See DESIGN.md for the fixed nine-case
comparison and RESULTS.md for the generated results. The existing frozen source
is required at research/nikkei-overlay-stability/data/full-screen-6-15.

Run from the repository root:

```powershell
npx tsx --test research/nikkei-rebound-gate-review/model.test.ts
npx tsx research/nikkei-rebound-gate-review/run.ts
npx eslint research/nikkei-rebound-gate-review/*.ts
npm run typecheck
```

The runner checks source identity, reproduces production targets and final
controller state, then verifies causal prefixes and serialized resume for every
case. Inputs are limited to 16 MiB each, 10,000 bars and 2,048 decisions. The
runner stops at a case boundary when RSS exceeds 1.5 GiB. Raw input backups and
atomic per-case reports live under ignored data/output directories; input
backups are grouped by identity, and each output records its identity.
After interruption rerun the command: all nine bounded cases are recomputed
deterministically, with no duplicate external effects. A running manifest is
never treated as complete; outputs are replaced and old input backups retained.
The controller's
mid-series resume is tested independently from this whole-study restart.

Historical distinction: archived v1 gated flat-account entries with WMA14;
v2 switched to WMA7 and current v8 retains WMA7. Original adds to an existing
holding bypass that gate. The separate WMA14 all-increase experiment in
research/nikkei-cycle-rallies/wma-add-gate.ts was not deployed. This study's
WMA14 case adds a restriction only to the rebound fallback, not all entries.

Interpretation: the current below-SMA20 fallback adds only one nonoverlapping
entry on this v8 path, a losing June 2022 episode. Removing it improves this
historical full-period result; all nine cases have the same final-500 path.
Changing to above SMA20 performs worse. Four EMA7 rises and extra WMA14 leave
the current path unchanged. A previous-high or nondeclining-SMA20 requirement
removes the same single entry. These are not independent confirmations of a
robust advantage. Differences below 1e-8 percentage points are numerical noise.
There is no candidate improving both full and final-500 returns with no worse
drawdown. Do not automatically adopt a setting from this reused sample.
