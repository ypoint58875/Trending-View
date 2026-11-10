# Screening skip safety findings

No production rule has changed. The strict pre-screen, rule-only skip audit
certifies **zero additional dates** under the requested universal condition.
There are **157 retrospectively neutral dates**, but their neutrality depends
on knowing the actual winner and signals. Using these labels as a pre-screen
gate would use the answer to decide not to calculate the answer.

## Sample and comparison

Frozen full-screen 10-session winners, at most six component strategies, 2,000
evaluation sessions from 2018-08-09 to 2026-10-26. Current v11 rules and original
3bps commission plus 2bps slippage are used. This is not a current browser
account export. Original decisions: 1,293; economic rebalances: 128; net return:
463.0922799282711%. All equal the actual production baseline.

For each original screening date, branch from the identical accepted pre-day
state. The actual branch applies that date's saved winner and two-bar signals.
The omitted branch keeps the prior plan and invokes the existing nondecision
close handling without new base signals. It does not introduce daily checks
of the old strategy. Compare cash/units, actual fills, planned/target allocation,
every serialized risk-controller field and the carried plan key. Only audit
and screening counters are excluded from economic identity.

| Increasingly strict comparison | Neutral dates |
|---|---:|
| Same daily economic fills | 1,247 |
| Same fills, account, target and complete risk state | 949 |
| Also the same carried strategy | 157 |
| Certified before screening from existing rules alone | 0 |

Of the 1,247 dates with unchanged fills, 298 still change the risk/controller
state. Of the 949 account/risk-neutral dates, 792 replace the carried strategy.
Overall, actual winners change the carried strategy on 1,113 dates. Only 180
dates repeat the prior plan; 23 of those still change account/risk behavior.

All 157 exact-neutral dates can be omitted together in hindsight: a second
2,000-day replay has identical daily accepted states, actual fills and final
account. That leaves 1,136 historical decisions, a retrospective reduction of
12.14%. This is not an available future speedup or a new safe rule.

## Why rule coverage is insufficient

Examples from the same-state comparisons:

- 2018-08-22 has identical fills but a changed pending request.
- 2018-08-24 has identical fills but changed pending and buy-priority state.
- A quiet winner replacement can leave every account field unchanged while
  changing the strategy used for later signals and conflicts.

| Pre-day category | Dates | Same fills | Same account/risk | Also same plan |
|---|---:|---:|---:|---:|
| Invested | 815 | 793 | 590 | 89 |
| Pending reduction exists | 499 | 492 | 430 | 59 |
| Stop cooldown active | 3 | 3 | 3 | 1 |
| Stop within preceding five sessions | 16 | 16 | 13 | 3 |
| Supplemental entry still within seven-session protection | 126 | 126 | 80 | 10 |

Categories overlap; do not add them. Even all 126 protected-entry dates with
unchanged fills do not imply 126 irrelevant screens. Only ten are fully neutral
after observing their actual winners. Cooldown blocks trading but does not
prevent a new winner from being stored as the carried strategy.

The implementation has no rule gate that locks or discards the selected winner
while a trade guard is active. Therefore rules cannot guarantee carried-plan
identity for an unknown winner. In addition, valid normalized buy/reduce/quiet
signal witnesses refute full controller-state independence on every decision
date. These witnesses are a small disproof set, not exhaustive optimizer
enumeration and not claims about which alternative winner would actually rank
first. No new optimizer calls were made.

## Verification and artifacts

- 24 focused tests pass: three new audit tests plus 21 existing cycle tests.
- Project typecheck and research ESLint pass without warnings.
- Production final controller/account and every economic rebalance match.
- 1,293 serialized same-state accepted branches match fresh probes.
- An actual stop after 128 evaluation days (83 decisions) resumes the remaining
  1,872 days, with the same final state as a fresh replay.
- 1,000 causal-prefix daily states and the 2,000 combined hindsight replay
  states match. These are replay checks; saved winners are not rescreened.
- Independent Python verifies all 1,293 actual/omitted field comparisons,
  plan identities and summary/group counts, and exports date-classification.csv.
- Peak RSS: 128.9MiB; progress file about 3.8MiB, within declared bounds.

Identity: 6654c78a46edb5f8250a274da271cddda8fb3aa4657f81072c21a4187c3c2219.
Raw backups and atomic progress are under ignored data/<identity>; processed
summary, decision branches and date-classification.csv are under output/<identity>.
output/latest.json locates them. README documents commands and recovery.

Production app/lib, browser storage, optimizer queue and previous studies were
not modified. Only this isolated study and five linked project-memory files
were changed. Existing worktree changes were preserved; no out-of-plan edits
were made. No shared pattern changed, so MODULE_PATTERNS needs no update.
No new framework or remote data source was introduced. Full npm test was not
rerun because this task changes no production feature code.
