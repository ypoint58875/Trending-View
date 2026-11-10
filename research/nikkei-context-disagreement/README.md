# Six-curve single/multiple-line disagreement study

This study reuses the production causal context curves and three-day state.
It does not change application monitoring, strategy rules or validated accounts.

Primary event: yesterday ended a run of at least three unanimous daily
directions; today exactly one smoothed curve moves in the opposite direction
while the other five retain the old direction. A single flat curve is a
separate cohort. Dates with multiple departing curves are excluded. Repeated
mixed days are not counted again. A new event requires a new qualifying run.

The multiple-line extension covers 1..6 simultaneous reversals. Initial
departure counts are separate from later first visits to each exact count
within an episode. The episode ends at either direction's fresh three-day
confirmation. Flat components are retained in raw event records and excluded
from pure-reversal comparison tables. Six opposite curves on one day do not
constitute a three-day opposite confirmation. All fixed count thresholds are
reported, without selecting a winning threshold from later returns.

At horizons 1/3/5/10/20, report price changes from the event close, executable
next-open to horizon-close changes, recovery of the old six-way direction,
reconfirmation after another three-day run, and opposite retained confirmation.
Recovery and reversal may both occur in a horizon; first-outcome categories
are exclusive. Missing future bars are censored, never treated as failures.

Compare all events with a greedily retained >20-session spaced sensitivity
cohort. Report 2000-2014, 2015-2020, and 2021 onward separately, excluding
outcomes crossing split boundaries. All six metrics, both initial directions,
flat/opposite and every fixed horizon are reported; no best threshold or
preferred curve is selected using later outcomes. Wilson intervals are
descriptive; overlapping market events are not independent trials.

The policy comparison is a separate illustrative long/cash account: retain
the last confirmed state, or exit at the next open on a single-line break and
wait for three fresh unanimous-up days to reenter. No short sales. Five basis
points per executed side; terminal holdings are marked at close. This is not
the application's multi-strategy backtest or an adopted trading rule.

Run from the repository root:

```powershell
npx tsx research/nikkei-context-disagreement/analyze.ts
npx tsx --test tests/market-context-research.test.ts
python research/nikkei-context-disagreement/verify_reference.py
```

Input is a bounded local copy of the BIAS Nikkei CSV (maximum 10000 bars and
4 MiB). Source path, access time and SHA-256 are recorded in data/source_registry.jsonl.
Raw bytes and normalized bars remain in ignored data/; output tables and
machine-readable events stay in ignored output/. Summary findings are recorded
in RESULTS.md. Atomic file replacement prevents partial results from becoming
complete state. The entire bounded study reruns deterministically after an
interruption; it creates no network jobs or growing in-memory queue.

References: the supplied BIAS implementation for SMA3 and daily first
differences; [NIST Wilson proportion intervals](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm).
