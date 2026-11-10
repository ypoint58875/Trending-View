# Six-curve increase gates in declining conditions

Research only. User asks whether context curves help in falling phases, and
specifically adds the onset of a decline in the SMA20/60/200 speed's trailing
three-session mean. This onset is speed3[t]<speed3[t-1] AND
speed3[t-1]>=speed3[t-2], even while speed3 remains positive. It is not speed
crossing below zero. Include raw-speed onset as a separate sensitivity.

Freeze190 cases before results: baseline; each20/60/200 period x raw/SMA3
curves x three conditions (BIAS falling, speed falling, speed negative) x
consecutive1/2/3 sessions x scopes flat-entry/holding-add/all-increases (162);
speed-decline onset x3 periods x2 smoothings x3 scopes, one-day event only (18);
all6 smoothed curves falling for1/2/3 sessions x3 scopes (9). Total190.

BIAS falling means its own value drops; speed falling is deceleration; negative
speed means the corresponding raw/SMA3 average speed is negative. SMA3 onset
is the user's final clarification. A turning-day gate blocks only that day;
ongoing-decline gates persist while their conditions hold. No stale signal
queue and no new exit. Scope uses the modified account's actual prior allocation.

Process existing production original orders and overlay close first. If an
increase is gated, restore accepted prior account/entry/risk state, retain the
native original-increase pending-cancellation semantics, advance close/request
indices, and preserve the actual flat window. Do not reset entry age after
blocked adds or leave phantom entries. Native reductions and hard exits pass
unchanged. Later entries need a fresh native opportunity, not automatic retry.

Reuse frozen full-screen-6-15 inputs, current-v8 original winners,2000 sessions
2018-08-09..2026-10-26 and3bps commission/2bps slippage. Main Nikkei close-proxy
and ordinary next-open sensitivity are separate. Require baseline targets AND
final-state identity; each case has causal-prefix and serialized account resume.
Report full/first1500/final500 returns/drawdowns, fills and blocked increases.
Qualification: first1500 return>=baseline-3pp and DD no worse, final500 return
and DD no worse, under both timing conventions, tolerance1e-8. Exclude no-ops.
No parameters selected by final500, no automatic adoption. Dataset has already
been studied; chronological splits are conditional evidence, not fresh holdout.

Bounds: each input/report16MiB, bars10,000, decisions2,048,190 serial cases,
RSS limit1.5GiB at case boundaries. Raw backups and outputs use source/code/design
identity. Atomic per-case reports are checkpoints: rerun skips only completed
matching-identity cases, no external effects. --limit5 tests interruption and
resume; unfinished manifest never means complete. Every new case checks
controller-level mid-series serialized resume. Planned files: this folder and
CODEX_STATE, FEATURE_MAP, FUNCTIONS, MODULE_PATTERNS, TECH_RESEARCH, DATA_SOURCES,
DEBUGGING. No app/library/registry/provider/account/protocol or secret changes.
