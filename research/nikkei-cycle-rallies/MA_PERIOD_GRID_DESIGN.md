# Expanded moving-average period grid

User expanded the type study to every previously tested short average period.
Supplemental entry uses periods 7..15, exit protection 7..15, and flat-entry
gate 7..15. Each independently uses SMA, EMA or WMA: 19683 combinations.
Exit protection remains daily normalized slope strictly greater than 0.002.
The explicit 7..15 request supersedes the earlier 12-session cap. Do not rerank the
frozen strategy winners, or optimize other guard formulations/thresholds.

Reuse MA_TYPE_DESIGN.md semantics and shared research controller. Reconcile
the 12/12/11 SMA control before starting. Report all three uniform-type grids,
single-rule replacements, the global exploratory best, fixed subperiods and
four requested rally windows. No historical best is an independent holdout.
Next-open sensitivity is computed for reported leaders and fixed controls.

Sequentially commit one compact 729-variant chunk per type triple (27 chunks).
Chunks include source/design/model identity; stale or malformed chunks fail
explicitly. Restart the same command to reuse complete compatible chunks.
Only reported leaders need full ledgers, bounding disk and memory use; retain
all compact metrics in the final summary. Summary commits after all chunks.
Existing frozen sources and production preferences/queues remain untouched.
