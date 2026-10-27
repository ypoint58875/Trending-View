# V-bottom and missed-entry research around fixed v4

Freeze the candidate menu implemented by v-recovery-study.ts before running.
Reuse the same frozen full-screen 2000 sessions and incoming-winner two-bar
signals. Primary objective: return above328.0321476%; separately flag drawdown
no worse than12.0186696%. Show single changes and predefined interactions.
Baseline must match every production-v4 target, not just aggregate metrics.

Compare missed-entry mechanisms rather than only adding exit rules:
- V rebound: close crosses above2/3/4/5% over the lowest open in the last5/10
  completed sessions including today. Require a preceding local decline: max
  close over the preceding10 sessions versus that low >=3/5%. Use a fresh
  crossing of each day's rolling rebound boundary. This follows the user's
  earlier lowest-open definition. Test baseline entry gates versus WMA-only,
  SMA20-only or no gates for this additional signal.
- V breakout: close exceeds yesterday's high following a >=3/5% local decline,
  with rising EMA3; compare the same entry gates. Bullish reversal: yesterday
  was down and today opens <= its close, closes above its open and rises;
  require the same local decline and compare gates. All use completed OHLC.
- Delayed EMA entry: after an EMA7 upturn, retain eligibility for3/5/10 sessions
  while EMA7 is rising and ordinary gates pass. Test continuous rising EMA
  separately. Do not retain a crossing during the existing risk cooldown.
- Hold3/5/7/10, SMA20 replacement SMA10/30/none, original reduction WMA/EMA/
  both/no trend confirmation, SMA11 threshold0.025/0.05/0.075/0.1/0.125%.
- Early4% risk stop: wait0/2/3/5/7, full/half exit, recovery on current EMA7+
  WMA7+price rule, additionally close>SMA20, price above prior5 highs, or
  EMA7+price only. Current half exit is a single risk cut per episode; restore
  after its cooldown. Partial positions keep entry age/peak through ordinary
  adds/reductions; recovery starts fresh marks. No stop-day recovery.

All additional V buys are flat-only and no-original-signal-only, honor risk
cooldown, start the configured supplemental hold and retain the early4% stop.
V-only gate bypass never changes original buys or ordinary EMA supplements.
All allocations stay0..1; no leverage. Stop close comparison is inclusive.
Original signals retain priority; pending sell cancellation follows Account.

Main results use the documented Nikkei completed-close proxy; detailed
finalists include twice costs and next-open target replay, full/first1500/
last500 and four500-session blocks. Select a development candidate by first1500
return, constrained to baseline first1500 drawdown; report last500 separately.
The final500 has been explored before and is NOT an untouched holdout. Fixed
parameter menus, neighboring rules and chronological diagnostics reduce some
selection mistakes but do not establish prospective optimality. References
accessed2026-10-26:
https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf
https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html

Reuse Account, Features, shared execution and atomic output. Write only scalar
grid metrics to data/v-recovery/grid.json every25 complete candidates, with
source/design hashes and ordered IDs; resume rejects mismatches. Bound each
file16MiB, bars10000, decisions2048, candidates1000 and RSS1.5GiB; yield after
checkpoints, check SIGINT/SIGTERM and safely rerun uncommitted candidates.
Selected detailed ledgers live separately under output/v-recovery. No growing
cache/scheduler, raw/source deletion, live UI or production model changes.

## Explicit sequential confirmation, after initial292-case exploration

Initial output/v-recovery and data/v-recovery remain preserved. Its best
engulf5% bypass-gates variant returned359.7982%, versus hold7-only348.4375%.
Confirm all original rules with a stricter chronological decline: find the
latest minimum open in the5/10-session lookback and compare only the10 closes
strictly preceding that low. Reject an apparent range caused by a peak after
the low. This is still a known-data check, not a new holdout. Reuse the exact
candidate menu and add declared interactions: engulf with drop3/4/5/6%,
lookback3/5/7, hold5/7/10, wait2/5; and rebound with lookback5/10,
rebound3/4/5%,drop3/5%,hold7/10. Compare the4/6% decline neighbors instead
of claiming a single best threshold is robust. Partial risk cooldown must
also disable EMA supplements if ordinary reductions make a partial account flat.
Store this refined run separately under data/v-recovery-sequenced and
output/v-recovery-sequenced, retaining all earlier artifacts.

Final numerical-definition check: express decline as1-low/priorPeak, a fall
from the prior peak, rather than priorPeak/low-1 (a rise from the low). Keep
the preceding exploratory artifacts; validated results are isolated under
data/v-recovery-confirmed and output/v-recovery-confirmed. Recompute the same
386-rule menu with no added parameter search. This fixes the meaning of the
stated3/4/5/6% declines, rather than selecting a new menu after inspection.
