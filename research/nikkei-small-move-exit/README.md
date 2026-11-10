# Small-move full-exit protection research

Both definitions and ten amplitudes were requested by the user. There are21
fixed policies per version, independently replayed under archived v8 and current
v9 cycle execution. No production, stored account, winner or source archive was
modified by this study. The earlier reduction-cooldown experiment stays separate.

## Findings on current v9

Baseline445.34% net,maxDD10.88%,133 fills,final50099.85%.

| Threshold % | Cost-distance net % | Cost-distance maxDD % | Episode-range net % | Episode-range maxDD % |
| --- | ---: | ---: | ---: | ---: |
| 0.5 | 427.94 | 12.69 | 445.34 | 10.88 |
| 1 | 430.79 | 12.42 | 445.34 | 10.88 |
| 1.5 | 431.37 | 15.92 | 445.34 | 10.88 |
| 2 | 406.74 | 15.92 | 454.81 | 10.88 |
| 3 | 391.96 | 13.45 | 458.46 | 10.88 |
| 4 | 418.10 | 15.16 | 416.91 | 15.56 |
| 5 | 439.27 | 13.36 | 446.80 | 10.18 |
| 6 | 448.22 | 14.32 | 414.17 | 11.95 |
| 8 | 396.95 | 18.47 | 437.78 | 12.68 |
| 10 | 391.68 | 18.47 | 482.44 | 11.87 |

Cost-distance rarely improves full return and every nonzero case worsens full
DD. Episode range2/3 improves historical return with unchanged full DD and
final500, but only2/4 protected exit attempts respectively. Range3 protects
2020-07-10,2024-02-07,2024-05-08,2024-06-13, four entry episodes; the first is
development, the remaining three validation. Fills133->129. These are reused
historical observations, not prospective validation.

Range5 lowers fills133->113 and DD10.88->10.18%, but full return rises only
445.34->446.80% and final500 falls99.85->99.12%; development falls85.79->80.51%,
violating the declared3pp tolerance. Range10 has highest post-hoc full482.44%,
but DD11.87%,final500DD8.52% versus7.47%, and development80.20% also fails.
No v9 case meets all predeclared criteria. Range2/3 miss the >=5% development-
turnover reduction criterion, rather than failing return comparison. Sparse
affected episodes remain their practical limit. No threshold adoption.

## Version interaction

V8 baseline440.98%. Its declared selection chooses range5:455.16%,DD10.18%,
114 fills,final50099.12%. Range6 also qualifies by the tolerant train/validation
rules despite lower full/audit return; qualification alone is not evidence for
deployment. V9's next-session add gate changes interactions. Both reports
retain ALL21 rows; do not copy v8's apparent advantage directly into v9.

Concurrent default upgrade was detected by baseline assertion before candidate
comparisons. V8 is explicitly pinned. V9 cycle reads the add restriction with
lag1, matching the production page and445.342093% baseline.444.102592% lag0 was
rejected. Next-open sensitivity in these reports uses the SAME lag1 controller
path at different fill prices, not ordinary v9 lag0 execution.

## Rules and files

- DESIGN.md: pre-result21-case definitions, selection and bounded recovery;
  version addendum repeats identical cases without tuning.
- model.ts: native controller full-exit gate, actual first-entry cost and
  post-entry high/low, controller/cash/episode checkpoints.
- run.ts: source validation, model identities, native/fill parity, atomic cases,
  metrics, causal/resume audit and reports.
- model.test.ts:9 definition/scope/boundary/risk/anchor/pending/resume/bounds tests.
- audit.py: independent cash primitives plus live episode/criterion reconstruction.
- RESULTS.md / RESULTS_V9.md: generated v8/v9 comparisons and sensitivities.
- .gitignore: keep raw/processed/checkpoint artifacts local.

Cost distance=abs(close/first-entry-unit-cost-1). Range=episode high-low divided
by that cost. Buy fee/slippage included; adds retain reference, full flat resets.
Entry-day pre-entry extrema excluded. Protect only ordinary full sales; partial
sells and native early4%/ATR hard exits pass. Protected pending0 survives for
native reconsideration or buy cancellation. Native4% retains its original
first-five-session coverage, not a new lifetime stop. No buy ban or new entry.

## Run and recover

From repository root:

```powershell
npx tsx research/nikkei-small-move-exit/run.ts --limit 3
npx tsx research/nikkei-small-move-exit/run.ts
npx tsx research/nikkei-small-move-exit/run.ts --current --limit 3
npx tsx research/nikkei-small-move-exit/run.ts --current
python research/nikkei-small-move-exit/audit.py
python research/nikkei-small-move-exit/audit.py --current
npx tsx --test research/nikkei-small-move-exit/model.test.ts research/nikkei-reduction-cooldown/model.test.ts research/nikkei-overlay-stability/rsi-shape-integration.test.ts research/nikkei-context-entry-gates/adoption-integration.test.ts
npm run typecheck
```

V8 identity29943202bfc7b2831dd6bd4997000a98f81e4dbfc8e5b835431862a8b36ab0a6;
v9 identity57bdd392fa3566c6f513886624f14a071e18da6c6c2459cd3bdde27f5da7316e.
Each complete21/21,pending0. latest.json/latest-v9.json select separate manifests.
Raw input/signals and timestamped registry: ignored data/<identity>. Processed
case ledgers/audits: ignored output/<identity>. Atomic hashed progress validates
identity/order and case presence. On crash/reboot/cancellation/timeout rerun:
completed policies reused, at most one unfinished case repeats, no external
effects. Missing/corrupt/incompatible files fail; new source/code/design/model
preserves previous identity. Temporary files never count as completed work.

## Verification and limits

25 combined tests passed (9 small-move,9 cooldown,4 archived v8,3 v9 integration),
typecheck and scoped lint pass.42 fresh cases;84 causal prefixes+84 serialized
controller/episode/cash checks pass. Actual3-case stop/18-case resume per version.
Python verifies672 metric groups, all fills and5289 live episode observations.
RSS240.8MiB(v8)/252.3MiB(v9),ceiling1.5GiB. Bounds10000 bars,2048 decisions,
16MiB/JSON,21 serial cases/version,one live replay. Frozen parsed source SHA256:
b543028a5db9860a9ac262d8bf65cf6df06f8d625afba728d875ce0d0274873e.

No full application gate rerun by this isolated study. Concurrent v9 work owns
its production verification; research checks are not a full-app pass. Its edits
were preserved. This task edits only the two declared research directories and
seven linked docs: CODEX_STATE(results),FEATURE_MAP(linkage),FUNCTIONS(helpers),
MODULE_PATTERNS(episode/account rules),TECH_RESEARCH(evidence),DATA_SOURCES
(provenance),DEBUGGING(recovery/version timing). Architecture/secrets unchanged
by this study. Sample2018-08-09..2026-10-26 and rules were repeatedly inspected;
final500 is conditional audit, not untouched validation. No significance or real
China-product execution claim. No production parameter adoption.
