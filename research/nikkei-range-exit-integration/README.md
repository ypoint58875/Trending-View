# Range3/range10 integration rerun

User requested a rerun with existing holding rules AND actual rebalance signals.
Five fixed cases distinguish the original all-ordinary protection from an
explicit base-signal-priority interpretation. No production/account/ranking or
prior research-engine changes. Frozen2000 sessions ending2026-10-26 are reused;
this does not reproduce the newer browser account ending2026-11-05.

## Result

| Contract | Full net % | MaxDD % | Fills | Final500 net % |
| --- | ---: | ---: | ---: | ---: |
| Native v9 | 445.34 | 10.88 | 133 | 99.85 |
| Range3, all ordinary full exits protected | 458.46 | 10.88 | 129 | 99.85 |
| Range10, all ordinary full exits protected | 482.44 | 11.87 | 89 | 101.70 |
| Range3, base signals retain priority | 445.34 | 10.88 | 133 | 99.85 |
| Range10, base signals retain priority | 431.94 | 10.88 | 133 | 99.85 |

The old458.46%/482.44% results reproduce exactly: full target paths, final native
state and every economic fill, not only headline returns. They were already
integrated with v9 holding7, WMA/SMA guards, lag1 BIAS20 add restriction,
supplemental/shape/rebound entries, original two-bar signals, risk and cooldown.
However their new band guard intentionally overrules ordinary original clears.
It is different from preserving original clear instructions as highest priority.

Range3 protects four attempts/four pending spells:3 explicit base clears and1
necessary base-pending clear. Keeping those signals' priority makes range3
completely identical to native. Three spells end when a later native increase
cancels pending0, one ends in an ordinary sale. They are not four universally
profitable avoided roundtrips; detailed dates/price paths are in RESULTS.md.

Range10 all-ordinary protects128 attempts across43 spells, including21 explicit
base clear and95 necessary base-pending attempts. Risk exits inside its band
execute14 times. Five deferred spells encounter close losses>=4% after the
native early-stop age; worst fee-inclusive entry loss during a spell is5.30%.
This is floating loss, not an additive portfolio or realized-loss claim.

With base signals prioritized, range10 protects only one controller exit on
2022-12-19,entry age6,range3.69%. It delays exit until2022-12-20 ATR risk sale.
Price falls2.46% during that one session; entry floating loss reaches4.83%.
Full net return falls445.34->431.94%, without reducing fill count. These are
compounded account returns; do not equate13.41pp with the event's price loss.

No policy is adopted. If preserving original rebalance priority is required,
range3 has no demonstrated incremental benefit and range10 worsens this sample.
Allowing a band to override base clears is a separate business-rule decision,
with greater holding risk and historical sensitivity. Do not silently combine
the favorable return of one contract with the guarantees of another.

## Partial orders and pending lineage

Native accepted partial exits pass. For the priority control, if an original
partial sale executes before native close adds a full liquidation, preserve
that partial and veto only the added full exit. Legacy all-ordinary veto restores
the whole pre-day allocation. Regression tests demonstrate the distinction;
there are ZERO such undone/preserved partial cases in this frozen sample.
Do not describe this synthetic risk as the cause of historical return changes.

Pending lineage survives until native cancellation/release. A base pending0
is exempt only if a same-state no-pending probe leaves nonzero exposure;
redundant base pending does not exempt an independent controller clear. Original
increases cancel pending even when native add rules prevent an economic buy.
Neither priority control forces sales through existing holding/MA guards.

Risk retains native first5-session4% and ATR priority. The new range rule does
not add a lifetime4% stop. Range uses actual first-buy cost including fees,
post-entry OHLC only; adds/partial sales retain it and full flat resets it.

## Files and commands

- DESIGN.md: fixed contracts, diagnostics, verification and recovery bounds.
- model.ts: native/no-original/no-pending probes, priority/partial handling,
  serialized actual controller/episode/lineage/cash and2000 daily trace rows.
- report.ts: deferred spells, their cancellation/exit, source/age/loss diagnostics.
- run.ts: five-case checkpointed replay, prior-engine and real cycle-report
  equality, metrics/fees/timing, fresh/prefix/resume checks, generated RESULTS.
- model.test.ts:10 meaningful priority, pending, partial, risk and recovery tests.
- audit.py: independent scalar accounting, source signals, EMA/ATR risk,
  episode reconstruction, accepted-state chain and deferred-spell boundaries.
- .gitignore: keep raw/processed/checkpoint outputs local.

From repository root:

```powershell
npx tsx research/nikkei-range-exit-integration/run.ts --limit 1
npx tsx research/nikkei-range-exit-integration/run.ts
python research/nikkei-range-exit-integration/audit.py
npx tsx --test research/nikkei-range-exit-integration/model.test.ts research/nikkei-small-move-exit/model.test.ts research/nikkei-context-entry-gates/adoption-integration.test.ts
npm run typecheck
```

No full npm test rerun for this isolated research; no production feature edits.
Current complete app-suite records remain in CODEX_STATE under their own task.
The study itself freshly verifies real buildStrategyCycleRollingReport baseline
445.34209325762885% and ALL133 economic fills against the instrumented replay.

## Durable progress and resource verification

Identitye79c17a309a5b389dbdc0c9415c593e7c919507f2cdebe5459eedd4f7101bf36;
source parsed SHA256b543028a5db9860a9ac262d8bf65cf6df06f8d625afba728d875ce0d0274873e.
Complete5/5,pending0. An actual1-case safe stop resumed the remaining4. Raw
backups/registry/checkpoint in ignored data/<identity>, processed traces and
cash/priority audit in ignored output/<identity>, located by output/latest.json.
Atomic hashed ordered progress validates source/design/code/model and complete
case presence. On crash,reboot,timeout,cancellation rerun; at most one unfinished
case repeats, no network or external effects. New identities preserve old state.
Missing/corrupt/incompatible state fails explicitly; temporary files never count.

Each trace JSON2.87..2.94MiB below16MiB. Maximum10000 bars,2048 decisions,2000
evaluation traces,5 serial cases,one live replay,1.5GiB RSS; observed399.4MiB.
All5 fresh metric audits,10 causal prefixes and10 serialized controller/episode/
lineage/cash resumes pass. Independent Python verifies80 metric groups,10000
daily signal/priority/risk/state traces,6338 episode observations and48 deferred
spells. EMA7/ATR14 independently recomputed; every economic fill matches.
Combined22 tests pass (10 integration audit,9 prior range,3 v9 adoption), as do
project typecheck, scoped ESLint and diff/whitespace checks.

Linked docs: CODEX_STATE(results),FEATURE_MAP(linkage),FUNCTIONS(helpers),
MODULE_PATTERNS(probe/lineage pattern),TECH_RESEARCH(contracts/evidence),
DATA_SOURCES(provenance),DEBUGGING(restart/priority diagnosis). Existing dirty
work preserved, no out-of-plan source edits by this task. Reused sample and
index-close proxy remain limitations; no untouched validation or actual
China-product execution claim. Next-open sensitivity uses the same cycle-lag1
targets/episode path with different fills, not ordinary v9 lag0 execution.
