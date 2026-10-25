# Nikkei 2000-session overlay stability

## Expanded grid and segmentation-length selection

The user clarified that100/300 sessions were examples, not fixed lengths.
The new declared `BLOCK_DESIGN.md` uses all13824 EMA/SMA/WMA5..16 and eight
0.025%..0.2% combinations at every training window. Compare equal training /
deployment lengths40,60,80,100,126,160,200,252,300,400,500. Each uses the
preceding window to choose parameters, then deploys one inherited account
on the following block. Every policy shares the same1500-session deployment
range,2020-09-02..2026-10-23. Choose length using its first1000 sessions only;
the final500 are separately reported conditional historical checks.

```powershell
npx tsx research/nikkei-overlay-stability/block-study.ts
npx tsx research/nikkei-overlay-stability/block-report.ts
python research/nikkei-overlay-stability/block-plot.py
npx tsx --test research/nikkei-overlay-stability/block-study.test.ts
```

Read `output/blocks-5-16/report.html` and its full-grid, policies, folds,
parameter-age and cost CSVs. The full2000 best remains EMA8/SMA10/WMA14/0.10%,
166.2851% return versus holding176.7222%. Development selects252-session
blocks, but their final500 return17.0804% trails holding65.8165%; common1500
return60.3530% trails169.5463%. None of the11 declared block policies exceeds
holding over either common1500 or final500. No profitable expiry is established.
Current parameters held fixed return63.0324% over common1500.

Training starts empty per window with full-prefix indicator warm-up; live
deployment never resets holdings/pending sells at parameter changes. Exact
ties prefer current-like settings, with tied counts disclosed. Frozen lifetime
diagnostics are separate accounts and never change historical selection.
`data/block-cache/` holds146 bounded numeric window grids, about46 MiB;
full-grid partial progress commits every512 candidates. Repeating the same
command resumes compatible completed windows; raw sources and earlier research
outputs remain intact. Grid/code/source changes reject stale checkpoints.

Research only; no production preference, strategy or screening queue is changed.
Read `DESIGN.md` before interpreting output. The original user-confirmed run used
quick screening; library fingerprints and incomplete historical-vintage evidence
are explicit limitations, not silently treated as full causal strategy training.

Run from the project root:

```powershell
npx tsx research/nikkei-overlay-stability/analyze.ts
npx tsx research/nikkei-overlay-stability/report.ts
python research/nikkei-overlay-stability/plot.py
npx tsx --test research/nikkei-overlay-stability/analyze.test.ts
npm run typecheck
```

Python chart export requires matplotlib. `output/report.html` is the Chinese
user-facing report; its copy lives in `ui-text.ts`. `output/REPORT.md` and
`output/summary.json` retain the primary declared experiment. `report.ts`
adds explicitly post-hoc one-parameter diagnostics and EMA8 sensitivity,
without silently adding them to development selection. CSVs provide
all fixed candidates, four 500-session segments, all rolling calibration
policies, parameter-age bands, execution/cost sensitivity, selected policy
decisions, and normalized daily equity.

The immutable `data/input.json` freezes the original selected plans, normalized
bars, exact request/result hashes and library identities. `data/raw/bars.bin`
backs up the source. `data/signals.json` checkpoints completed causal signal
extraction. `output/cache/grid-*.bin` checkpoints each complete 128-row grid
chunk; rerun the same command to resume. Incompatible source/design hashes fail
explicitly. Keep frozen input; derived caches can be manually removed to rerun
after an implementation/design change. No automatic deletion or network fetch.

The minimal EMA8-only diagnostic improves historical full-period return from
128.65% to 152.55% and drawdown from -30.38% to -28.49%. It is the best entry
period using the first 1500 sessions alone, and last-500 return is 58.06%
versus 45.82% current. The choice to inspect one-dimensional families is post
hoc, so this remains a forward-testing candidate. The full-grid historical
best returns 166.29%, below holding's 176.72%. The development-selected
756-history/252-update policy returns only 10.02% in the last 500. No automatic
update cadence or universal parameter expiry is established.
