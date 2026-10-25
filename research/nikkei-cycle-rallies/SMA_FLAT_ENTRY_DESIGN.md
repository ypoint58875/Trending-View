# SMA slope-turn entries in an empty cycle10 account

User-requested six comparisons: SMA lengths 7, 8, 9, 10, 11, 12. Reuse the
actual 298 selected winners and the same 504-session frozen market input.
Do not rank new strategies, replace selections or change production execution.

## Primary rule, fixed before replay

- SMA is a simple average of completed daily closes. A positive turn means
  SMA(t)-SMA(t-1)>0 and SMA(t-1)-SMA(t-2)<=0. It is not a zero crossing of
  the average price or merely a still-positive slope.
- On original screening dates, resolve the selected incoming winner's original
  last-two-bar signals on the actual inherited account, preserving all sequence
  exceptions and directional clamps. On skipped dates preserve the account.
- After that operation, if allocation is zero, slope turns positive, and there
  are no original signals that date, enter to 100% at that day's close proxy.
  A last-two-bar signal counts even if it could not cause a fill from cash or
  is suppressed by a sequence exception. Skipped dates have no permitted cycle
  execution signal and may receive a supplemental entry.
- Carry the resulting position forward. Later original signals manage that
  same position; never reset it to the independent baseline's empty target.
  There is no additional SMA exit or capital split.
- Charge the same 0.03% commission and 0.02% slippage per side, mark open
  positions without forced final liquidation, and exclude entry-day earlier
  gains. Include next-open sensitivity as a separate matched-convention check.

## Coverage and controls

Use the production monitoring function: inclusive available trading dates,
positive executed holding after the close counts as held; the entry date
counts and the clearing date does not. Also report ongoing-account return
between interval endpoint closes. Coverage is not the fraction of price gains
captured. Include exact held/session counts and all supplemental entry dates.

Reconcile the no-supplement replay's return and all fill dates/targets with
the frozen product baseline. Compare all six variants against that baseline,
buy-and-hold, and the previously reported 40/80 directional-confirmation
prototype (22 trend tuples, not an exhaustive 40/80 engine run).

Source/model/design hashes identify the reproducible experiment. Six bounded
atomic result files and one summary are safely regenerated on rerun. A cached
causal decision-signal file is only reused after input/model hash validation;
it is derived data, not an independent raw source. No network, queue mutation,
market refresh, scheduled work or raw-input deletion is performed. Existing
research retention applies. These are retrospective comparisons, not unseen
forward validation.
