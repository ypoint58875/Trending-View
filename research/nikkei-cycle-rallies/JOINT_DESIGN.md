# Joint cycle evidence, one-account decisions

This is the current user objective, superseding both capital allocation blends
and explicit regime-switch recommendations. Keep the actual ten-session model
as a baseline signal source. Continuously combine it with independently screened
longer horizons and indicator evidence; future phase boundaries are unknown.
Different dates may select different strategy families and parameter tuples.
The fixed object is the evidence/decision procedure, never the selected strategy.

## Bounded prototype, declared before replay

Retain the actual 298-decision ten-session account without changing its rules.
For each same historical screening date, independently rank a fixed small menu
of registered causal trend strategies over 20, 40, 60, 80 and 120 sessions.
Include SMA/EMA crossovers, MACD, Donchian, Supertrend, Ichimoku and ROC, using
defaults and a few round standard short/medium/long parameters. The candidate
menu is independent of all future archive winners and of the four rally dates.
Do not infer a future parameter library from winners. This is not the product's
full 57-family/five-strategy exhaustive search. Keep that scope limitation near
the results; missing full-grid results are never represented as actual results.

Ranking reuses the shared daily next-open allocation ledger, as ordinary ranking
does, on the exact causal prefix and trailing window. Current strategy target
states are evidence, not trade commands or capital sleeves. Read those states
daily for the last selected plan even on dates without new screening, to avoid
confusing 'already long' with 'no newly emitted entry'. The original ten-session
source remains its own permitted executed target series.

Test these three longer-horizon pairs: 20/40, 40/80, 60/120. For each pair:

1. Agreement: both longer targets long -> full target; both cash for two closes
   -> accept the current ten-session target; disagreement -> retain the greater
   of previous final target and ten-session target.
2. Weighted 50: score=50*A10 + 20*B + 20*C + 10*T. Score >=50 -> full target;
   score <=20 for two closes -> accept A10; otherwise retain max(previous,A10).
3. Weighted 30: score=30*A10 + 30*B + 30*C + 10*T. Score >=60 -> full target;
   score <=20 for two closes -> accept A10; otherwise retain max(previous,A10).

T=1 when the latest completed close is above SMA20 and SMA20 slope is positive,
otherwise zero. A/B/C are normalized target states, not invested fund weights.
Final target is one scalar (0, 30%, 100%, etc.) in one ledger. Indicator weights
are decision evidence. The score is not interpreted as a target allocation.
All nine rules, returns, costs, drawdowns and per-rally behavior are disclosed.
The already supplied windows remain retrospective diagnostics.

A future-boundary oracle may be calculated only as an explicitly unattainable
diagnostic of the user's economic intuition, and is never ranked with deployable
rules or described as an obtainable strategy return.

## Recovery and limits

Freeze the input/version/menu hash; atomically commit each date's selected
candidates before its screening checkpoint. Reuse matched completed decisions
on resume. Keep at most the bounded candidate timelines plus one decision's
ledger contexts in memory. No live queue, browser task, product policy or market
data changes. Existing frozen raw inputs and outputs are retained.
