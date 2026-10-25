# Extend WMA14 gate to all exposure increases

User asked whether negative WMA14 slope should reject adds as well as flat
entries. Freeze EMA7 positive-turn supplementation, SMA11 >0.125% deferred
reductions, original cycle10 winners, costs and the close-proxy execution model.
Change only gate scope: no original target increase while WMA14 falls, even
if the inherited account already holds a partial position. Equality allows buys.
Existing exposure is retained; the gate neither forces a sale nor queues a
rejected buy. Preserve original raw-signal priority and cancellation of pending
sells by fresh original increase requests. This isolates scope from sell policy.

The research adapter reuses the production controller. A blocked existing-position
buy is passed at unchanged target to preserve pending-sell cancellation without
adding exposure. Existing flat entries and supplements retain the production gate.
Daily completed averages alone drive decisions. Two sequential bounded replays
need no checkpoint; atomic ledgers precede summary, sources remain untouched.

Current control reconciles all fills and 91.4477169% return. Expanded scope gives
91.0546315%, identical -8.2619391% maximum drawdown, and 44 rather than 45 fills.
Only 2026-08-25's 60% ->100% add is blocked (WMA14 daily slope -0.15467595%).
The original account clears on August 26 at a higher price. Four rally coverage
and range returns remain identical. Next-open sensitivity is 99.40082 ->98.07645%.
One changed historical buy cannot establish a general improvement or deterioration.
Production checkboxes and execution logic are unchanged by this research.
