# Nikkei ten-session missed-rally research

## Negative-slope flat-entry gate

Run `npx tsx research/nikkei-cycle-rallies/entry-slope-gate.ts` to compare
SMA3..12 slope >=0 entry gates on original cycle10 and supplement+0.2%-guard
accounts. Read `ENTRY_SLOPE_GATE_DESIGN.md`: only flat entries are restricted;
existing-position adds and exits are unchanged. The combined SMA11 gate gives
83.06%/-8.11% historically versus 74.63%/-11.83% without the gate; neighboring
SMA10/12 give 68.04/72.29%. The isolated best value requires fresh validation.
No production setting or selection is modified. Both baseline ledgers reconcile.

## SMA12-capped deferred exit comparison

Run `npx tsx research/nikkei-cycle-rallies/exit-guard.ts` after the SMA entry
study. Read `EXIT_GUARD_DESIGN.md` for pending-sell semantics and the user cap
of SMA12. The current summary/CSV contains 30 fixed SMA7..12 guards plus four
diagnostics; source bars and all original selected plans remain unchanged.
Baseline fills and returns reconcile with the prior SMA12 ledger. Coverage-
oriented SMA12 slope >0.1% gives 71.35% return/-12.85% drawdown and
68.42/100/78.57/90.91% range coverage. Slope >0.2% returns 74.63%/-11.83%
but covers only 20% of the second rally. These are same-sample experiments,
not an independently validated improvement or a production strategy change.

Research only. Product selection, execution, queues and stored tasks are not modified.

## User-requested SMA7 through SMA12 flat-account entries

`npx tsx research/nikkei-cycle-rallies/sma-flat-entry.ts` replays the original
selected plans on an inherited account with a supplemental full entry only when
empty, the SMA slope crosses from nonpositive to positive, and no original
permitted signals exist that date. Subsequent original signals manage the actual
new holding; there is no daily reset to the independent baseline. Read
`SMA_FLAT_ENTRY_DESIGN.md` for the exact no-signal and skipped-day definitions.

The no-supplement ledger reconciles every original fill. Six variants and
same-source controls are in `output/sma-flat-entry-summary.json`; all fills are
in `output/sma-flat-entry-trades.csv`. Coverage reuses the production monitoring
function, counting inclusive trading dates with positive holding after close,
and is separately reported from interval returns.

Full-period return / drawdown: SMA7 33.82%/-9.20%, SMA8 33.51%/-7.22%,
SMA9 43.62%/-9.55%, SMA10 31.85%/-14.50%, SMA11 36.55%/-13.74%,
SMA12 71.82%/-11.76%. SMA12's retrospective return exceeds both the prior
40/80 prototype (48.89%/-12.16%) and holding (57.32%/-22.70%), but the prior
40/80 prototype has much greater coverage of the four selected rallies.
All six have zero holding coverage in the second interval: slopes were already
positive before the 2025-10-21 clearing and did not turn positive again within
the interval. An event-based turn rule does not continuously force a long state.
SMA12 received seventeen supplemental entries across the whole history; its
high total return is not evidence that it captured all four windows.

These six requested settings remain retrospective selection, with no independent
validation or production deployment. No original screening jobs are rerun.

## Current objective: jointly judged cycle evidence

The user clarified that neither capital splitting nor an assumed future regime
switch is wanted. The current prototype preserves the actual ten-session source,
independently screens longer windows on each known decision date, and combines
their current target states with indicator evidence into one account decision.
Selected strategies vary over time. The earlier blends and fixed detector
studies below are retained experiments, not the current recommendation.

Read `JOINT_DESIGN.md`, `JOINT_GATES_DESIGN.md` and `DIRECTIONAL_DESIGN.md` for
the declared menus/rules and sequential research rationale. Reproduce with:

- `npx tsx research/nikkei-cycle-rallies/joint-cycles.ts`
- `npx tsx research/nikkei-cycle-rallies/joint-confirmation.ts`
- `npx tsx --test research/nikkei-cycle-rallies/*.test.ts`

The bounded prototype screens 22 registered trend parameter tuples over each
20/40/60/80/120 window at all 298 causal screening dates. It reuses the ordinary
next-open ranking ledger and reads each last-selected strategy's current target
daily. This is intentionally smaller than the full strategy/combinations engine;
it does not claim to be a completed full-grid 40/80-cycle validation run.

All nine initial joint rules plus twenty-one confirmation/persistence rules
are retained. The best current-close-proxy candidate is 40/80 directional
confirmation: accept full target only while both selected targets are long,
ADX14 >=20 and +DI14 > -DI14; otherwise accept the original cycle10 target.
One final target is executed; evidence weights never allocate capital sleeves.
The candidate returns 48.89% with -12.16% drawdown versus 33.46%/-8.28% for
cycle10 and 57.32%/-22.70% for holding. It captures 3.98%, 4.42%, 11.37%,
14.38% in the four user windows but still fails the primary outperformance goal.
Next-open sensitivity returns 66.62% versus matched holding 60.19%, showing
execution sensitivity rather than proving a deployable edge in the close proxy.

Its daily selected 40/80 plans and final decisions are in
`output/joint-confirmed-decision-plan.csv`; 40-session selections use 18 distinct
tuples, 80-session selections 17. Both choose the identical tuple on 165 of 504
dates, so agreement is not independent evidence. A future-boundary counterfactual
returns 115.27%; it is explicitly untradable, omitted from candidate rankings,
and only illustrates the cost of failing to identify the desired intervals.
Relative to cycle10, the real candidate adds about 38.44% multiplicative return
within the four windows, but loses about 19.42% relative performance outside
them. This explains why recovering four rallies alone does not establish alpha.

All results are retrospective multi-round exploration. No untouched holdout or
future validation exists. No product feature or existing task was changed.

## Design recorded before replay

The user supplied four retrospective rally windows: 2025-04-21 to 2025-06-16,
2025-10-21 to 2025-11-04, 2026-03-30 to 2026-05-12, and 2026-05-20 to
2026-06-03. These windows are diagnostics, not training/validation folds.

Two mainstream approaches are compared:

1. Multiple selection horizons: retain independent short/long selectors and
   combine their target allocations with fixed capital weights. This reduces
   single-horizon dependence but cannot guarantee complementary signals. Local
   older 20/40-session archives have partial coverage and a different ranking
   model; they cannot establish a same-settings full-period comparison.
2. Independent trend core plus short tactical allocation: fixed rules retain
   trend exposure while the ten-session selector handles the tactical portion.
   This is cheap, transparent and testable across the entire current sample.
   It may recover rallies at the cost of higher exposure and drawdowns.

References accessed 2026-10-24:
- AQR, Hurst/Ooi/Pedersen, A Century of Evidence on Trend-Following Investing:
  https://www.aqr.com/insights/research/journal-article/a-century-of-evidence-on-trend-following-investing
- Bailey et al., The Probability of Backtest Overfitting:
  https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf

These references support research design, not a claim that the specific Nikkei
rules below outperform. No external prices are mixed into the frozen source.

Predeclared fixed trend rules: price above SMA20 with two consecutive closes
below SMA20 to exit; price above SMA60 with the same exit convention;
EMA10 above EMA30; 20-session positive close momentum; and close-confirmed
Donchian20-high entry / Donchian10-low exit using previous bars only.
Each trend rule is tested alone, with 30/50/70% trend and the balance in the
current ten-session target, and as a full trend floor. Permanent half exposure
is a control. Two execution diagnostics compare per-decision target alignment
and evaluation of the currently selected plan on skipped screening days.
All variants are disclosed; none is an untouched out-of-sample result.

## Reproduce

`npx tsx research/nikkei-cycle-rallies/analyze.ts`

`npx tsx --test research/nikkei-cycle-rallies/analyze.test.ts`

`npx tsx research/nikkei-cycle-rallies/archived-cycles.ts`

The archived-cycle comparison uses 102 complete shared screening dates over
2025-09-04 to 2026-06-11. Archived 20/40-session winners share identical market
prefixes and costs, but use ranking model 4 / max three strategies versus the
current ten-session model 5 / max five. Its results are exploratory, not a
matched-configuration period experiment. The missing three 20-session dates
in the first batch are recovered from identical-settings archived cohorts;
conflicting duplicate winners would reject the comparison. No first-rally
longer-cycle history is available. Frozen archive SHA-256 identifies the source.

## Findings

All 30 predeclared variants are in `output/summary.json`; detailed ledgers are
in the per-variant files. Current ten-session execution reproduces 33.461580%
and 62 fills over 2024-09-27 to 2026-10-23. Buy-and-hold returns 57.324930%
with a -22.701879% maximum drawdown, versus -8.280888% for cycle10. Rounded
figures should be taken from the machine-readable summary when rerunning.

The four rally price returns are 11.7603%, 4.4228%, 20.9242%, 14.3764%.
Cycle10 is essentially flat throughout each: it clears on 2025-04-21 and only
reenters on 2025-06-16; clears on 2025-10-21; remains empty from 2026-03-17
until 2026-05-12; and is empty from 2026-05-14 through the fourth interval.
Several selected plans are theoretically long with no recent entry event,
but the inherited empty account remains empty. This is the existing event
contract, not a price-data defect. RSI/Bollinger/MFI reversals also produce
exits during sustained rallies. Neither naive target synchronization nor
checking the selected winner daily improves the full-period return.

SMA20 trend exposure recovers 8.83%, 4.42%, 15.94%, 10.84% in the four windows,
but repeated false exits elsewhere reduce its full-period return to 30.52%.
A 70% EMA10/30 trend plus 30% cycle10 candidate returns 40.80%, maximum drawdown
-12.81%, compared with cycle10's 33.46%/-8.28%. A 50% permanent target plus
50% cycle10 returns 46.57%/-14.10%. None of the tested alternatives exceeds
buy-and-hold under the same execution convention. No outperformance promise
or in-sample winner promotion is supported.

## Candidate operation, research only

For the 70/30 candidate, keep cycle10's own inherited allocation state A.
Set B=1 when the completed daily EMA10 exceeds EMA30, else B=0. Calculate
W=0.30*A+0.70*B. EMA lengths are signal parameters, not screening windows.
Calculate this every completed session, including days with no new screen;
A carries forward until its next permitted cycle signal. Place one net
rebalance toward W when W changes, accounting for current holdings and costs.
Do not combine raw return percentages or cancel opposing buy/sell arrows.
The ledger intentionally does not rebalance every day merely to correct
market-value drift when the target is unchanged.

`output/allocation-plan.csv` provides all 504 target rows, the actual pre-trade
allocation on rebalance days, and trade direction for this research account.
The same rule must be frozen before new data arrives. Current UI can display
separate 10/40 period reports but does not calculate a combined target.
An exact matched-model 10/40 study, independent forward data, cost stress,
and an executable China ETF/FX/premium mapping remain necessary before
claiming benchmark-relative alpha or using the research target as a trade.

The first run freezes normalized full history, 298 exact-prefix-verified current
selected plans, costs, and request/result SHA-256 hashes from batch
`4055816d2e7c57dd0388e9fa`. Reads are bounded to 2048 jobs, 10000 bars and
16 MiB per result. Subsequent runs use the frozen input and reject hash/model
mismatches. Each variant is committed atomically with its checkpoint; resumed
runs reuse valid completed variants without repeating them. No queue mutation,
network refresh, scheduling, or automatic deletion of raw input is performed.
Derived output is bounded by the fixed variant menu; `output/` can be regenerated.

The shared allocation ledger charges 0.03% commission and 0.02% slippage per
traded side, marks open positions without forced final liquidation, and uses
the product's explicit Nikkei decision-close proxy. A next-open sensitivity is
also reported. Signals are causal, but rule selection was motivated by already
seen history. Segment returns mark the ongoing account at the start/end close;
they do not restart with hindsight or include the start day's earlier move.
If an endpoint is not a trading date, use the last completed close on/before it.
