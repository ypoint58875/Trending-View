# Screening skip safety audit

Research only. Audit the strict requested contract: a skipped screen must leave
actual fills, the cash/unit account, pending requests, full v11 risk/controller
state and the carried strategy unchanged. Do not equate a nontrading day with
an irrelevant screen. Exclude decision/report counters from economic identity,
but explicitly include the selected plan used by later decisions.

Reuse the full-screen 10-session/max-six frozen 2000-session source ending
2026-10-26. This is not an export of the current browser account. No market
request, optimizer job, browser write or production change is made.

At each original decision compare the actual winner branch with omitting the
screen and its signals from the same pre-day state. This reproduces production
nondecision behavior; it does not introduce daily old-winner signal checking.
Also test normalized increase/reduce/quiet/opposing-sequence inputs from that
same state as counterexamples to a rule-only signal-independence claim. This
small witness set can disprove independence, never prove it for all possible
optimizer winners. Strategy identity is a separate unconditional dependency:
the production code always accepts a screen's winner, even when no fill occurs.

Historical exact-neutral dates are hindsight labels after screening. They are
not a causal pre-screen skip gate. Never use the actual winner to decide not
to compute that winner. A combined replay removing exact-neutral dates checks
whether those retrospective labels jointly preserve the observed ledger.

```powershell
npx tsx research/nikkei-screening-skip-audit/run.ts --limit 128
npx tsx research/nikkei-screening-skip-audit/run.ts
npx tsx --test research/nikkei-screening-skip-audit/model.test.ts
python research/nikkei-screening-skip-audit/audit.py
```

Raw source/signals and access-time/hash registry live in ignored
data/<identity>/. Atomic progress stores the last completed daily index,
controller/account/plan state, bounded decision rows, attempts and lastError.
Results live in output/<identity>/, located by output/latest.json. Rerun after
cancellation/crash/reboot/timeout; restore the last committed day, with no
duplicate external effects. Source/code changes use a new identity; malformed
state fails. Temporary files never count as completed progress.

Bounds: 10000 bars, 2048 decisions, 16MiB/file, 1.5GiB RSS, one replay at a time;
checkpoint every32 days. --limit pauses after that many new evaluation days.
Validate baseline against production, serialized same-state probes, causal
prefixes, actual stop/resume, combined hindsight replay, and independent Python
count/field comparisons. Online research is unnecessary for this local audit.
