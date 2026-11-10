# Strategy replacement turnover research

## Finding

Strategy replacement contributes to short reversals, but none of the seven fixed
cases supports replacing current production rules on this frozen sample.
Baseline has1112 plan changes across1293 screening decisions, yet only134
economic fills: changing the plan does not itself liquidate the inherited account.
There are45 opposite-direction old/new current-date signal conflicts.

Local same-state probes label22 fills as immediately switch-sensitive and31 as
releases of switch-sensitive pending reductions. Another11 are native requests,
65 controller-driven and5 risk exits. These labels are mechanisms, not an additive
causal allocation of profit or proof all such trades are unnecessary.

Of42 consecutive opposite fill pairs separated by at most7 sessions,27 contain
a switch-sensitive leg. Those27 comprise18 sell-buy pairs (14 buy back at a higher
raw close) and9 buy-sell pairs. Pairs overlap; partial allocation changes are not
independent whole-account roundtrips. Six of the10 closed <=7-session rounds have
a switch-sensitive entry or exit. Future outcomes never enter policy decisions.

Baseline returns440.98%, maxDD-10.88%,134 fills, final50099.85%. Requiring old/new
agreement on replacement reductions lowers fills to105 but return to377.52%,
maxDD worsens to-14.67%, final50090.25%. Agreement for both directions yields
221.89%/108 fills. Old-on-conflict yields302.95%/141 fills, unlike the favorable
impression from the older short, overlapping archive without this matched v8
account. Those studies cannot be pooled or compared as equal experiments.

Positive switch allocation changes below10/25pp do not occur at the inherited
controller request boundary here; both minimum-delta cases exactly match baseline.
Equal-target increases MUST remain: they can cancel pending reductions. An
initial diagnostic implementation incorrectly suppressed these zero-size requests,
was corrected as a semantic issue, and its separately identified output is
superseded. The case menu, thresholds and selection criteria were not optimized
using this correction. Only output/latest.json points to the authoritative run.

No candidate passes the declared train/validation criteria. Close-proxy and
next-open full returns both favor baseline. Production, stored accounts, ranking,
winner selection and three-bar policy are unchanged. This is reused historical
research, not a prospective performance claim or validation of China-product fills.

## Files and commands

- DESIGN.md: frozen policies, attribution, selection, bounds and recovery.
- model.ts: request selection, production-controller replay, pending provenance.
- run.ts: source/plan validation, causal signals, checkpoints, audits and reports.
- model.test.ts:7 scope/precedence/band/native-state/risk/recovery/bounds tests.
- audit.py: independent scalar Python accounting for all saved policy ledgers.
- RESULTS.md: generated full comparison and fee/execution sensitivity.

From repository root:

```powershell
npx tsx research/nikkei-switch-turnover/run.ts --limit 2
npx tsx research/nikkei-switch-turnover/run.ts
python research/nikkei-switch-turnover/audit.py
npx tsx --test research/nikkei-switch-turnover/model.test.ts research/nikkei-overlay-stability/rsi-shape-integration.test.ts
npm test
npx eslint research/nikkei-switch-turnover/model.ts research/nikkei-switch-turnover/run.ts research/nikkei-switch-turnover/model.test.ts
```

The first command safely stops after two completed work units. The second resumes
remaining signal derivations then seven policies. A completed rerun validates all
source identities, freshly audits every row and reconstructs the report; it does
not rescreen or launch external jobs. Missing frozen source is an explicit error.

## State and limits

Authoritative identity:
47797501a0c8f317e4086ddbe222579e63ec94a4e3487fb80b7830d882a92753.
Source parsed SHA256:
b543028a5db9860a9ac262d8bf65cf6df06f8d625afba728d875ce0d0274873e.
Raw backups and timestamped machine-readable registry are under ignored
data/<identity>/. Atomic decisions.json stores a hash-validated contiguous prefix
of same-date old/new signals. progress.json records policies, completed/pending
counts, attempts, status, timestamp and last error. Signal checkpoints may be
ahead of the coarse manifest after interruption; the validated prefix is
authoritative. Outputs are separate under ignored output/<identity>/; the complete
manifest and output/latest.json are committed after audits.

Cancellation, crash, reboot or timeout: rerun the same command. At most one
in-flight decision/policy is repeated; no external side effects. Source/code/design
changes select a new identity without deleting old state. Corrupt or copied
incompatible checkpoints fail. Temporary files are never valid progress.

Bounds:10000 bars,2048 decisions,16MiB/JSON,one live plan timeline,one process,
seven policies,1.5GiB RSS ceiling. Measured run RSS251.2MiB. Baseline target and
final-state parity, fresh seven-row metrics,14 truncated-prefix and14 serialized
resume comparisons pass. The actual2-unit stop resumed1291 remaining signal
derivations and all policies. All1293 incoming signals match fresh causal plans.
Next-open sensitivity changes execution prices for the same controller path;
it is not a separate fill-aware controller design.

Independent Python cash/units accounting verifies every actual economic fill and
112 metric groups across seven policies, four time splits, eight250-session
blocks and gross/stress/next-open costs, within1e-7 percentage-point tolerance.
See output/<identity>/python-audit.json. This validates accounting, not future
performance or an independent market sample.

Full application gate passed473 unit tests, production build and4 rendered/source
tests. Final typecheck and scoped ESLint passed. Build advisory warnings concern
the existing proxy environment and large client chunks. All pre-existing
application/library modifications remain byte-identical to their task-start
versions. Linked current-state, feature-map, function, module-pattern, research,
source and debugging documents record this isolated study; architecture and
secrets contracts did not change. No out-of-plan edits were made by this task.
