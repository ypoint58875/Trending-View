# Moving-average type comparison

Freeze the existing cycle10 winners, 504 evaluation sessions, source hashes,
fees, and incoming-winner conflict policy. Compare all 27 SMA/EMA/WMA triples
in the order supplemental entry / deferred exit / flat-entry gate. Periods
remain 12/12/11 and the daily normalized exit threshold remains strictly 0.002.
This is an exploratory historical comparison, not an independent holdout.

Reuse the indicator registry implementations. EMA uses an initial arithmetic
seed from the full source history; WMA weights the newest close most heavily.
Use actual consecutive averages for EMA/WMA slopes, never the SMA identity.
SMA crossing/sign uses the exact close difference to preserve production ties.
No incomplete or future bars enter decisions. Release pending reductions daily;
fresh original buys cancel pending sells even when the flat-entry gate rejects
them. Original raw signals suppress same-day supplementation. Existing-position
adds are exempt from the entry gate. Rejected entries are not queued.

Reconcile the entire SMA baseline ledger with the existing three-flag result.
Compare uniform replacements and single replacements separately from the
exploratory full grid. Report four monitored ranges, fixed subperiods and
next-open execution sensitivity alongside close-proxy metrics. Coverage counts
any positive allocation and is not the share of rally return captured.

The bounded source (32 MiB, 10000 bars, 2048 snapshots) and 27 sequential
variants require no new durable checkpoint. Each ledger is atomically replaced;
summary is committed last. Reruns are idempotent. Raw input, live queues,
production rules and page preferences remain untouched.
