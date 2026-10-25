# Defer a vetoed EMA7 supplemental entry until WMA14 turns positive

User asked to remember an EMA7 positive turn rejected by negative WMA14 and
enter after WMA14 becomes positive. Test a literal persistent intent and a
separate invalidation-aware intent. Only a flat account, no raw original signal,
an EMA turn and negative WMA can queue a buy. A newer rejected turn renews the
waiting timestamp. No queue is inferred merely from currently positive averages.
Existing original buys and supplements retain production sequencing. A normal
entry consumes pending intent. Execution requires positive WMA and no raw
original signal that day; zero slope is not sufficient for a deferred fill.

Literal intent persists through intervening EMA weakness and original sells.
The conservative diagnostic cancels when EMA7 slope becomes nonpositive or any
original reduce signal occurs. These are explicitly different policies, not a
silent assumption. SMA11 >0.125% deferred reductions and the ordinary WMA flat
gate remain unchanged after entry. No special holding exemption is introduced.

Frozen cycle10 control fully reconciles91.44772%/8.26194% drawdown/45 fills.
Persistent waiting gives89.37312%/8.26194%/53; invalidation-aware waiting gives
92.35439%/8.26194%/49. All four monitored rally metrics remain unchanged.
Persistent waiting executes August5,2026 but the original strategy clears August6.
Conservative waiting cancels the July31 intent on August3's original sell.
Next-open sensitivity is99.40082 ->91.25488/96.22167%; the small close-proxy
improvement is not robust to execution timing and is same-sample exploration.

Three focused tests verify queuing, no invented queue, selective invalidation
and prefix causality; typecheck passes. Three short bounded replays use atomic
per-mode ledgers then summary, with idempotent whole-run restart and no new
checkpoint. Raw inputs, production UI/rules and active queues remain untouched.
