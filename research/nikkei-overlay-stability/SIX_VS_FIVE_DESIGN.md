# Six-leg decisions versus same-date five-leg alternatives

Freeze exactly the seven six-leg winning dates from full-screen-6-15/input.json.
Keep each original request's bars prefix, settings, exclusions, objective and
training config. Rerun with only maxCombinationStrategies changed6->5, using
the same current result model. Retain both the overall max5 winner and the
best exactly5 result. Never drop one component from the six-leg winner and
call it the optimal five-leg plan.

Validate source/bar/request/result hashes and recomputed six-leg signals.
Compare two-bar intent (ordered directions and targets), resolved intent,
and v7 final target from the same actual baseline pre-decision account.
Replay prefix accounts independently for each local replacement to avoid
attributing divergent later state to a one-date comparison. Native overlays
can make different raw intents produce identical final account actions.

Inspect all8 dates of six-leg plan duration, but cycle actions apply only on
the7 actual screening dates; do not invent a new decision on a carry date.
Report training returns as training only, not future gains. This seven-date
analysis is not a complete max5 2000-day rescreen or a full-return claim.

Sequential finite jobs: <=10000 bars,7 requests, bounded retained finalists;
completed rows persist atomically after each job under data/six-vs-five/rows.json.
Fingerprint input, ordered requests, code and shared implementation. Same-command
resume skips only exactly matching completed prefixes. Interruption aborts the
active job; resume recomputes at most that unfinished job, never marks it done.
Abort on RSS>2GiB and preserve completed rows. No shared engine queue changes,
raw deletion, production edit, new data fetch or automatic archive cleanup.
Retain the reviewed report/checkpoint until explicitly superseded.
