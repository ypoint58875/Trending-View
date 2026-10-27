# Dual-return constrained rebound research

## Objective, scope and files

Require both full2000 return>382.699650763004% and final500 return>
95.508724236275% under the same frozen source, boundaries and original costs.
These are historical acceptance criteria, not future guarantees. Report
full/final500/recent drawdowns rather than hiding risk behind higher returns.
Preserve all previous studies and production defaults. No segmentation,
position sizing, second adds, original sequence changes or new market fetch.

Implementation/test: dual-return-study.ts and dual-return-study.test.ts.
Reuse sma20-fallback.ts, its FallbackAccount/Context and unchanged inherited
ResearchAccount. New episode-scoped rule views must not mutate shared context
or earlier source. Update CODEX_STATE, FEATURE_MAP, TECH_RESEARCH, DATA_PIPELINE
and CACHE_POLICY. Outputs remain isolated under output/dual-return.

## Fixed ten extra-entry profiles

All retain existing native original/EMA7-SMA20/engulf/recovery entries and
flat/no-original-signal/no-pending/cooldown/WMA7 gates. Background and lows
reuse causalFlatLow exactly: preceding10 completed flat closes, most recent
minimum,10 completed pre-low closes for peak, current close excluded from low.
Each independent fallback is eligible only while close<=SMA20. No waiting
order survives a veto; current evidence is reassessed at every close.

Profiles, crossed with all exits below:
1. turn4: original hybrid-x4, prior decline5%, rebound4%, fresh EMA7 turn.
2. daily4: independent rebound4%, decline5%, positive EMA7, no extra confirmation.
3. daily4-ema2: same, EMA7 slopes positive on current and preceding close.
4. daily4-ema3: same, three consecutive positive EMA7 slopes.
5. daily4-full2: complete decline/rebound/EMA7/WMA7 conditions hold on current
   and previous close, using each date's own causal low inside this flat episode.
   The original signals veto today's trade, not yesterday's indicator evidence.
6. daily4-high2: daily4 and close exceeds the highs of both preceding bars.
7. daily3-ema2: decline5%, rebound3%, two positive EMA7 slopes.
8. daily2d3-ema2: decline3%, rebound2%, two positive EMA7 slopes.
9. daily2d3-full2: decline3%, rebound2%, two complete confirmations.
10. daily3d3-ema2: decline3%, rebound3%, two positive EMA7 slopes.

Predeclared primary: daily4-ema2 with unchanged exits. This isolates whether
confirmation avoids the observed early entries without optimizing exits.

## Nine exit profiles, only for new added episodes

Tag only actual added flat-to-held rebound/relaxed-turn entries, never ordinary
native entries. Original resolved increases immediately clear the tag, preserving
their priority. Partial reductions retain tags and existing episode entry/peak
marks. Full exits clear tags; native early-stop recoveries remain native and
untagged. Do not retrospectively relabel historical/native positions. Entry
targets remain original100%; local guards cannot increase holdings.

1. baseline: original hold7/WMA7/SMA11 protections.
2. hold3: only shorten tagged supplemental hold7 to3; other protections remain.
3. wma3: hold3; pending original reductions release when WMA7 turns negative,
   without an additional SMA11 slope veto.
4. original3: hold3; pending original reductions release without WMA/SMA11 veto.
5. ema2: independent exit after two closes belowEMA7; no minimum hold override
   delay. A current original signal prevents this independent force exit.
6. trail2: activate after highest held close>=entryClose*1.04; thereafter exit
   when close<=peak*0.98 AND close<EMA7.
7. trail3: same activation, close<=peak*0.97 AND close<EMA7.
8. atr15: activate after peak-entryClose>=entryPriorATR14; exit when
   peak-close>=1.5*priorATR14 AND close<EMA7. Require known positive ATR inputs.
9. age10: independent exit at entry age>=10; entry bar is age0.

Independent exits apply only if a position existed before today's actions,
remains held, no original signals today and no native stop just occurred.
They clear pending intentions, holding marks and recovery; impose the same
five subsequent blocked bars (next eligible at exit+6). No automatic recovery
is invented after a profit/time exit. Native first-five cumulative4% stop,
wait5 and recovery behavior otherwise remain unchanged. Original increases
always outrank local exits. Stops fill at observed close, never at thresholds.

Baseline +10 entries x9 exits =91 cases. Existing native-only control has no
tag, so no otherwise-identical exit-only variants are added. Reference turn4/
baseline and daily4/baseline must match the earlier frozen ledgers exactly.

## Evaluation and selection

Report full/first1500/final500/recent and four500 blocks, fills and added/local
exit counts. Recent is strictly afterJuly21 close; final500 begins2024-10-04.
Hard goal requires full and final500 net returns strictly greater than their
baseline values, not a shifted start date or date-dependent policy. Also report
no-worse fullDD subset. Rank goal candidates by no-worse fullDD first, then
the minimum log relative-wealth improvement across full/final500, menu-order
ties. Separately select first1500-only max return with no-worse baseline DD;
baseline wins ties. Neither full-goal filtering nor first1500 selection creates
new independent validation from already explored data.

Selected baseline, primary, development, recommended goal, full-return goal,
no-worse-DD goal and best recent goal receive complete daily ledgers, actual
equity, doubled-cost and next-open sensitivities against corresponding baseline
metrics. Verify summary/full-ledger parity. Rerun selected cases with changes
disabled throughJuly21 and verify1936 exact prefix targets; this date fork is
retrospective attribution only. Export concrete profile definitions and every
extra entry/local exit. Do not claim success if no case meets both objectives.

## Persistence and tests

Freeze source/code/design/menu identities; scalar progress is atomically
committed every10 completed cases under data/dual-return/grid.json. Reject
identity/config/order drift. Same-command rerun reuses all completed rows;
SIGINT/SIGTERM/RSS checks commit completed work between cases. Bound16MiB per
source,10000 bars,2048 decisions,91 cases,RSS1.5GiB. Keep selected ledgers
separate from scalar checkpoint. No scheduler, growing cache or raw cleanup.

Test EMA2/EMA3/full2 confirmation, unknown inputs, prior-high causality,
scope/native priority, exact hold/exit confirmation, profit activation,
inclusive threshold/observed close behavior, cooldown, no automatic recovery,
causal prefixes for all91, baseline production parity, reference parity and
checkpoint rejection/reuse. Record verification and remaining risks in state.
