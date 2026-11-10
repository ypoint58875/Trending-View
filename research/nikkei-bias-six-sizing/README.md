# BIAS and retained six-curve exposure research

## Follow-up: individual versus joint same-day add gates

GATE_DESIGN.md and GATE_RESULTS.md answer the follow-up independently of the
earlier additive experiment. Keep v10 and replace only its holding-add mask.
Current next-session BIAS458.46%; no gate454.00%; same-close BIAS463.09%;
same-close slope455.65%; AND455.65%; OR463.09%. All maxDD10.88%;all final500
99.85%. BIAS/OR complete controller/account paths match,as do slope/AND.
Current plus slope and current plus AND both459.04%,identical complete paths.
Thus the earlier459.04% is NOT replacement AND performance.

In this sample BIAS alone ties OR for best full return; adding slope creates
no marginal benefit. Same-close BIAS gains4.63 percentage points versus current
but first1000 is89.67% vs90.10%,middle50048.55% vs47.00%,final500unchanged.
Next-open sensitivity496.11% trails current496.58%; historical ranking is not
evidence to adopt a new timing rule. No adoption or production changes.

```powershell
npx tsx research/nikkei-bias-six-sizing/gate-run.ts --limit 2
npx tsx research/nikkei-bias-six-sizing/gate-run.ts
npx tsx --test research/nikkei-bias-six-sizing/gate-model.test.ts
python research/nikkei-bias-six-sizing/gate-audit.py
```

Eight cases pass causal prefixes and serialized controller/account resume;
actual2-case stop/6-case resume.3 new tests plus5 original tests pass,
typecheck/scoped ESLint pass. Python independently recomputes all8 masks,
16000 daily equities,all fills and split/full returns/drawdowns. Per-instance
research feature clones are tested against cache leakage and exact native
v10/current+same-close-BIAS parity. Private derived-feature access is confined
to the research harness and fails if production's shape changes. No shared
pattern or API change. Full npm test was not repeated for this research-only
follow-up; the preceding15-case study's full gate is recorded below.
Ignored gate data/checkpoints and outputs are namespaced under data/gates and
output/gates. Identity9d56f7f9ecb3b8ff9651b2cff299e18e729c3ed244d209e6c93644510f0bde4b;
complete8/8,pending0,peak132.83MiB. Same file/bar/decision/RSS bounds apply.

The user requested three actions on BIAS20 SMA3 falling for three comparisons
AND SMA20 daily slope SMA3 beginning to fall: no holding add, half exposure,
and clear exposure. Also compare weak-regime and strong-regime returns and
smaller weak-state allocations. See DESIGN.md for timing and state boundaries.

Frozen current-v10 sample: 2000 sessions, 2018-08-09..2026-10-26, 1293 frozen
screening decisions; 3bps commission plus 2bps slippage per side. Native result
458.4631387547417% and129 fills reproduce the real production cycle report.
This is NOT the newer browser account through2026-11-05.

Findings:

- Primary strict-turn events:50, with28 invested at the native target close.
- An ADDITIONAL combined-condition holding-add veto changes one add:459.04%
  vs458.46%; both maxDD10.88%,final50099.85%. Same signals at next open reverse
  the small advantage:492.93% vs496.58%. This does not replace the current
  BIAS-only next-session gate and is too sparse to establish improvement.
- Half/clear exposure until next native target increase:317.02%/203.69%;
  both maxDD10.88%. Restore as soon as the exact-turn condition is false:
  447.66%/436.75%,both maxDD10.88%; final50096.78%/93.74% vs99.85%.
  Thus the unfavorable result is not solely caused by slow recovery.
- Weak-state multipliers100/75/50/25/0% of original target return
  458.46/357.16/272.60/202.38/144.32%; maxDD
  10.88/10.16/9.45/10.94/13.13%. A lower allocation does not monotonically
  improve drawdown. Weak50 loses185.86 percentage points of full return for
  1.42 percentage points less maximum drawdown; fills increase129->176.
- Cycle price mean daily strong/weak:+0.0800%/+0.0368%; native strategy:
  +0.0888%/+0.0926%. Native strategy stitched strong/weak contributions:
  +150.01%/+123.37% (multiplicative, not additive). Weak44 runs include29
  positive runs. Raw index weakness is not evidence native exposure loses.
- Long price-only2000..2026 confirms weak-state returns are not uniformly
  negative: daily strong/weak means+0.0387%/+0.0262%. In2021 onward the weak
  mean+0.0715% exceeds strong+0.0669%. These are descriptive state-conditioned
  observations, not proof that the regime causes returns.

Keep current rules on this evidence. Sizing sleeves retain native shadow
entry/risk/range state; a production integrated controller would require
separate validation. No live account, code, UI, protocol or winner changes.

Run from the repository root:

```powershell
npx tsx research/nikkei-bias-six-sizing/run.ts --limit 2
npx tsx research/nikkei-bias-six-sizing/run.ts
npx tsx --test research/nikkei-bias-six-sizing/model.test.ts
python research/nikkei-bias-six-sizing/audit.py
```

The first command is a controlled case-boundary interruption; the second
resumes the same identity and completes15 cases. A complete rerun reuses
verified case files without duplicate trading jobs. Native controller/account
serialized recovery and causal prefixes are asserted for all3 gate modes;
all13 sleeves have causal-prefix checks. The independent Python audit checks
30000 daily equities, all economic fills, all context curves/states across
both datasets, strict-turn conditions, weak targets and forward outcomes.
Five focused tests cover turn/fall distinction, warmup, recovery, retained
state and causal feature behavior.
Full `npm test` passed:492 unit tests,production build,4 rendered tests;
zero failures/skips. Scoped ESLint and typecheck pass. Local full-gate log:
`npm-test.log`. No shared module patterns changed, no out-of-plan edits;
existing dirty worktree changes were preserved. Five project-memory documents
updated:CODEX_STATE,FEATURE_MAP,DEBUGGING,TECH_RESEARCH,DATA_SOURCES.

Progress and input backups: ignored `data/<identity>/`; case results and full
CSV-equivalent daily/fill arrays: ignored `output/<identity>/`. Atomic writes
prevent partial cases being marked complete. Inspect progress status and
lastError after cancellation/crash; rerun the same command. Do not edit saved
completed outputs. Changed code/input creates a new identity. Bounds:10000
bars,2048 decisions,16MiB/file,1.5GiB RSS; observed356.47MiB on final run.
Final identity:50427ff9eca63478f0b7e9553d612a9498a8384c5519e0984ff31a63f6fc2f34.

RESULTS.md lists all15 cases, fixed historical segments,20bps cost stress,
next-open sensitivity and market regimes. Transient policies restore native
target immediately when their condition is false; other event policies wait
for a native target increase. Broad-condition cases are explicitly sensitivity
checks, not interchangeable with first-turn events. No untouched holdout or
domestic ETF execution data is available in this study.
