# Descending OHLC sequence extension

Research only, supplement the complete v7 account without replacing native
entry, exit, cooldown or recovery rules. Reuse frozen2000-session input ending
2026-10-26 and original costs; verify baseline and cached signal identities.

Compare explicit rolling strict comparisons with candle-pattern libraries.
Choose the existing pure comparator and shared shapeReplay account: no external
dependency or ambiguous named-pattern definition is needed. Extend optional
descending policy metadata without changing any existing shape-menu definition.
Existing research must retain exact target parity, including legacy opens4.

Grid:3,4,5,6 observed sessions times open,close,high,low, times three priorities
(guarded reduction, force only without original signals, unconditional risk
force), times four RSI14 filters (off, falling, below50, recent>=70 then falling).
Include baseline:193 configurations. N sessions mean N prices and N-1 strict
decreases; equality interrupts the sequence. Recheck every rolling window, so a
longer ongoing decline can generate another candidate while the account remains
held. Compare only held accounts; do not manufacture exits from flat accounts.

At day N close, evaluate the full condition. Even open-price patterns do not
retroactively execute at today's open. Main report uses cycle-close proxy;
selected policies also receive ordinary next-open sensitivity. Preserve native
early-stop waiting when risks coincide. RSI filters affect added exits only.

Report full2000/final500 returns and maximum drawdown,16-cell unfiltered risk
force table, matched priority/RSI comparisons, distinct paths, first1500 selection,
four500-session blocks and post2026-07-21 outcomes. Event omission and per-year
new-exit counts inspect concentration for any promising configurations. Repeated
historical selection is exploratory, not untouched holdout validation.

Bound input16MiB,10000 bars,193 rows and RSS2GiB. Atomic identity-keyed completed
rows in data/descending-sequence/<identity>/rows.json allow same-command resume.
Keep previous study checkpoints and raw backups; no TTL deletion, engine queue,
browser account, network market refresh or production change. Results live in
output/descending-sequence/. Existing source/method references remain in
SHAPE_PRIORITY_DESIGN.md; no new data provider is introduced.
