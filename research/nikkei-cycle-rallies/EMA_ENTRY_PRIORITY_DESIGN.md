# EMA7 turn priority over the WMA14 flat-entry veto

User asked whether EMA7 positive-turn supplementation should outrank the WMA14
negative-slope flat-entry prohibition. Interpret narrowly: supplement while flat
with no original raw signal even when WMA14 falls. Original flat entries still
require nonnegative WMA14. Original signal priority, partial adds, SMA11 >0.125%
pending reductions and sell cancellation stay unchanged. No sustained-positive
entry, delayed retry or exit override is introduced.

The research adapter uses the production mixed controller with its flat gate
disabled only in the altered case, externally retaining the same WMA gate for
original flat buys. Rejected original increases pass target0 while flat to keep
pending cancellation and raw-signal precedence. The controller still owns EMA
turn recognition, daily exit release and inherited account target.

Freeze the same cycle10 source/winners/costs. Baseline reconciles every fill and
91.4477169% return. Priority return is70.7010497%, drawdown -13.0224891%,66
fills versus45; twelve supplemental entries bypass negative WMA in its own path.
All four monitored rally coverage/returns remain unchanged. July31,2026 enters
as requested but clears August3 on the original strategy; entry priority does
not prevent an original exit. Next-open sensitivity99.40082 ->86.71881%.

Two tests verify selective bypass, original buy gating, raw-signal precedence
and prefix causality; typecheck passes. Two short bounded replays use atomic
ledger files followed by a final summary and need no new checkpoint. Whole-run
restart is idempotent. Sources, production controls and active queues are unchanged.
This remains same-sample research, not independent performance validation.
