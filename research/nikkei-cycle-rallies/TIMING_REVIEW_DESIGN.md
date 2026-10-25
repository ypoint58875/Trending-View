# Current mixed-overlay timing review

User asked whether entries and clears could be earlier. Keep current cycle10
winners, source history, fees and close-proxy timing fixed. Compare matched
changes within the previous 7..15 period menu: WMA gate13/gate7, SMA exit10,
and exit threshold0.15%, against EMA7/SMA11/WMA14 at0.125%.

Also test a timing-specific supplemental trigger: while flat with no raw original
signal, enter if EMA7 is still rising and WMA14 slope crosses from negative to
nonnegative. This addresses an EMA turn rejected by the slower independent gate;
it is not a queued order, and never enters solely because the gate becomes valid.
Reuse production controller sequencing and gate enforcement. No parameter grid
or per-rally strategy switching is introduced.

Baseline full fills reconcile. Current 91.45% /8.26% drawdown compares with:
gate13 75.04% /7.22%; gate7 75.18% /10.85%; exit10 73.78% /8.47%; threshold
0.15% 65.84% /8.26%; unlock entry83.02% /10.88%. Higher protection threshold
shortens protection but can abandon an ongoing rally: October23,2025 clears
instead of November12 under the current profile. Faster is not universally better.
The unlock adds six entries in its own path and leaves all four monitored rally
coverage/returns unchanged. No production defaults are modified.

One focused test verifies the missed-turn recovery, raw-signal precedence and
prefix causality; typecheck passes. Six bounded sequential replays use verified
frozen inputs, atomic per-profile ledgers and a final summary. Restart the short
script idempotently after interruption. Raw data and active queues stay untouched.
These repeatedly observed data are not independent validation.
