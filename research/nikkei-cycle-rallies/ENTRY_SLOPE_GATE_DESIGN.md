# Flat-entry negative-slope gate

User requests a ten-session selection replay with no new position while the
SMA X slope is negative, X=3..12. Equality at zero is allowed. Test the original
cycle10 account and the current SMA12 supplement + SMA12 slope >0.2% exit guard
account separately. Existing-position increases and all exits are unchanged.
Both original entries and supplemental entries must pass the same gate.

Read only the frozen 298 selections, market bars and compatible signal cache.
No new ranking, strategy switching, production setting or market refresh occurs.
Use the production account state machine and shared cycle-close ledger.
Original signals still block same-day supplementation even if the gate rejects
their entry. A rejected entry is not queued for automatic purchase later;
a later permitted original signal or supplemental turn is required.

SMA_X(t)-SMA_X(t-1) has the sign of close(t)-close(t-X), so use that exact
identity to avoid floating cancellation at zero. Missing warmup blocks entry.
All decisions use completed close data, matching the existing cycle proxy.
Next-open sensitivity preserves decisions and changes fills, not ranking.

Reconcile no-gate targets, prices and return with both saved control ledgers
before writing comparisons. Report all 20 variants, full return/drawdown/fills,
four inclusive holding-day coverages/range returns, fixed subperiods, blocked
entry attempts and their dates. Do not infer future robustness from the best
of ten values on repeatedly examined data. Subperiods are diagnostics, not
fresh holdouts. The gate does not promise lower drawdown or a loss limit.

Inputs are bounded to 32 MiB, 10000 bars and 2048 selections. Sequential small
replays need no new checkpoint; atomic per-variant ledgers and a final summary
can be regenerated idempotently after interruption. Existing weak feature
caches and frozen-source retention apply; never rewrite inputs or live jobs.
