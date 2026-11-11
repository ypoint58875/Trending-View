# Holding-dependent full rescreening

Research only. On a normally skipped strong-downtrend bearish candle, restore
the complete optimizer if the alternative account actually holds units before
that close. Retain all original screening dates and leave strong-uptrend skips
unchanged. Select a new winner, apply its completed two-bar signals, and carry
that plan forward. Preserve current v11 guards, costs and Nikkei close proxy.

Reuse the frozen full-screen 10-session/max-six 2000-session input ending
2026-10-26. Existing original-date winners are independent of live holdings;
reuse those winners, and fully optimize newly eligible dates. This differs
from checking the previous winner's signals. No browser or production change.

Run `npx tsx research/nikkei-holding-rescreen/run.ts`; optional `--limit 1`
stops after one newly computed winner. Repeating the command resumes. Run
`npx tsx --test research/nikkei-holding-rescreen/model.test.ts` for focused tests.
`powershell -NoProfile -File research/nikkei-holding-rescreen/run-background.ps1`
runs the same complete calculation followed by the independent Python audit;
an OS mutex prevents duplicate background supervisors. Use only one runner.
The supervisor requires no persistent service or scheduled task. A host reboot
stops computation;rerun that command to resume durable work. audit.py can also
verify any committed partial prefix without claiming it is a complete result.
On completion report.ts writes same-state new-winner/old-winner/no-screen exit
probes,an independent causal carried-strategy account,first-divergence dates,
daily/monthly/yearly/500-session additive contributions and top positive/negative
months. Contributions must sum to the final return difference. plot.py exports
standalone equity,drawdown,advantage,target-difference and monthly charts with
matplotlib. This comparison is descriptive historical accounting,not a claim
that all later path effects have a unique immediate causal attribution.

The report.test.ts end-to-end self-comparison must produce zero advantage and
reproduce350.5911425933033%/141fills/149checks for the separate carried-strategy
diagnostic. Every account uses a fresh Stepper;initial() snapshots the instance's
controller and must not be called to reset a previously used instance.
The one-time migrate-report-initialization.ts migration is deliberately pinned
to the first run's exact source/code identity. It copies raw/results/progress,
updates namespace metadata and preserves compatible optimizer sections only
after proving that the code difference is the fresh baseline controller fix.
It is not a general checkpoint compatibility bypass;do not rerun it on other
identities. Original artifacts remain retained and the destination must be new.

State and raw backups live in ignored data/<identity>; output/latest.json
locates derived results. Atomic progress commits after durable per-day outputs.
Identity pins source plus optimizer/execution implementation. Stale or corrupt
progress fails. Each new date uses the existing disposable screening child,
including its sectional checkpoints and exit-75 restart protocol. The account
runner remains sequential;prefetch.ts adds a bounded pool of future-date
screening children in isolated research directories,with no live-queue mutation.
No credential, market request or external write is involved.

Bounds: 10000 bars, 2000 evaluation dates, 2048 decisions, 16MiB JSON,
one account child plus up to five prefetch children by default,1.5GiB per parent
RSS and3GiB per prefetch child;existing optimizer memory/checkpoint
policy bounds child work. Interruptions checkpoint the parent and let the
active child reach its next safe persisted restart/completion. Resume uses
only committed progress/results. Raw backups and winning results are retained;
temporary JSON is overwritten on rerun, no raw cleanup is authorized. No timer
or scheduled refresh. Summary and traces are regenerable from saved winners.

## Bounded parallel precomputation

User requested more CPU utilization. Run-background starts prefetch.ts beside
the unchanged main runner. For an already running study,start
`node --import tsx research/nikkei-holding-rescreen/prefetch.ts` once. Its owner
marker prevents duplicate pools;only an abandoned ownership marker is removed.
QUANTSCOPE_PREFETCH_WORKERS defaults5 (allowed1..6),clamped by logical CPUs and
free memory. The measured8-CPU/64GiB host uses5future children plus1main child;
new starts stop below8GiB free memory. Prefetch parent RSS is bounded1.5GiB and
each child3GiB.32future eligible candle candidates bound the lookahead queue;
reserve the main runner's current and immediate next candidate.

All jobs use exactly the main request identity/settings and their own causal
prefix. Future screening is independent of live holdings. Some speculative
dates may ultimately be flat and unused;they never enter the decision calendar
or account. Completed original winners and current work are preserved.

Private work lives in data/<identity>/prefetch/jobs/<index>. Only a complete,
successful result with an exact matching request can be atomically moved to
the main jobs directory. An existing main directory always wins;never overwrite
it. If main work catches an unfinished speculative date,the speculative child
stops and keeps its checkpoints. Main failure/completion stops this pool. Raw
inputs/results are retained;only ownership markers and existing child-managed
derived checkpoints are removed. No economic/model identity changes or stale
result migration occurs. prefetch/status.json records active PIDs,stages,RSS,
publication/collision counts and errors;output/prefetch*.log contains logs.
