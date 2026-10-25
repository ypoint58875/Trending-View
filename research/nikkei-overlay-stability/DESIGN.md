# Nikkei overlay stability: declared research design

Research only. Preserve production controls, screening requests/results and queues.
The user confirmed that the 2000-session, ten-session-window run used quick
screening. Reconstruct its actual completed selections, rather than substituting
the earlier 504-session full-screening study. Freeze the normalized bars, selected
plans, request/result hashes and exact candidate-library fingerprints. Require
complete schedule coverage, matching causal market prefixes and costs.

## Approaches and evidence posture

1. A fixed-parameter retrospective grid explains parameter sensitivity and
   interactions, but choosing its winner with all 2000 sessions overfits the
   evaluation. Retain it as a diagnostic only.
2. Rolling calibration uses only observations preceding each deployment close.
   Compare recent-return selection with a two-half stability score. Keep the
   actual inherited account and pending reductions when parameters change.
   This is the preferred test of update frequency, with more estimation noise
   and trading-path dependence than a fixed rule.

Primary methodology references checked on 2026-10-25:
- https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html
- https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf

These support chronological validation and multiple-testing caution, not any
particular Nikkei parameter. No external prices enter the calculation. The
quick libraries have no verified historical training vintages; report changes
in their fingerprints. Consequently even chronological overlay tests remain
conditional research on the supplied quick-screening path, not an independently
validated end-to-end strategy. The latest 500 sessions overlap prior research.

## Menu frozen before calculation

- Exactly 2000 evaluation sessions, split into four consecutive 500-session
  blocks. Start empty, with no synthetic pre-evaluation position.
- EMA supplemental-entry periods 7..15, SMA pending-exit periods 7..15, WMA
  flat-entry-gate periods 7..15; exit thresholds 0.025%, 0.05%, 0.075%, 0.1%,
  0.125%, 0.15%, 0.175%, 0.2% per session. Keep average types fixed to the
  three pictured controls. Include all eight on/off combinations at current
  EMA7/SMA11/WMA14/0.125% settings. This is 5839 unique configurations.
- Calibration windows: 63, 126, 252, 504, 756 sessions. Update intervals:
  5, 10, 20, 40, 60, 120, 252 sessions. All 70 policies share the same
  evaluation beginning at offset 756; score deployment offsets 756..1499 for
  development selection and report offsets 1500..1999 separately.
- Rank each candidate using its known continuing hypothetical net-equity path
  over the preceding window. Return score is the window log return; stability
  score is twice the smaller half-window log return. This deliberately checks
  whether improvement survives both halves. Deterministic ID tie-breaking.
  All candidates are allowed, including disabling controls. No future labels
  or overlapping forward target enters calibration, so no label gap is needed.
- Deployment at offset d uses training ending at d-1, then evaluates the
  selected rule on completed bar d and trades at that close proxy. Changing
  parameters never resets the actual account or fabricates an entry event.
  Reestimate inside the final block using preceding data, but choose the
  lookback/cadence/score policy using development only.
- Parameter age: every 20 sessions from offset 756 with 252 future sessions
  available, select on past history, freeze the parameters for 252 sessions,
  and compare age bands 1..20, 21..40, 41..60, 61..120, 121..252 against a
  matched current-control account and holding, all starting empty together.
  Vintages overlap; these descriptive means do not establish a universal
  expiry date or independent sample count.
- Preserve same-day Nikkei-close proxy and 3 bps commission plus 2 bps
  slippage per traded side. Test selected rules at next-open execution and
  higher costs, explicitly conditional on the same original selected plans.
  Index returns exclude dividends, domestic ETF tracking, FX and premium.

## Recovery, resources and outputs

New files stay inside this research directory plus the explicitly linked
project documentation. Raw source backup and frozen plans are immutable local
artifacts. Validate source/model/configuration hashes on resume. Cache signals
after each completed 32 decisions; save each complete grid chunk atomically.
Progress commits follow successful output commits. SIGINT/SIGTERM stop between
work units; incomplete units replay. Bound input to 10000 bars, 2048 decisions,
16 MiB per source result and 128 candidate rows per chunk. Grid prefixes occupy
about 94 MiB; expected process memory stays under 1 GiB and a 1.5 GiB RSS guard
stops with an actionable resume error. Retain frozen data; replaceable derived
cache is bounded by this one source/design and may be manually removed. No
automatic cleanup, source refresh or scheduler is introduced.

Verify production parity for every control combination, parameter prefix
causality, previous-day training boundaries, inherited pending state on changes,
range-return compounding, and incompatible checkpoint rejection. Run focused
research tests and type checking; no production feature change is planned.
