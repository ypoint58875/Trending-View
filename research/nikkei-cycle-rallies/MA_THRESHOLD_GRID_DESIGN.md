# Expanded exit threshold comparison

The final user scope is periods 7..15 for all three independent rules, each
SMA/EMA/WMA, with daily normalized exit thresholds 0.025%, 0.05%, 0.075%,
0.1%, 0.125%, 0.15%, 0.175% and the existing 0.2% control. These percentages
are fractional inputs 0.00025..0.002. Strict greater-than protects a pending
reduction; equality releases it. Total count: 157464 configurations.

Reuse the causal semantics in MA_TYPE_DESIGN.md. The expanded scope supersedes
its fixed periods and threshold. The market/winner source, costs and screening
schedule remain frozen. Reconcile the entire current SMA12/SMA12/SMA11 0.2%
ledger before running. This is same-sample exploration, not a holdout or a
claim of future performance. More configurations increase selection risk.

Process thresholds sequentially, keeping only one 19683-row set in memory.
Persist 729-configuration chunks by threshold/type triple, with hashes of input,
design and implementation, expected IDs, finite metrics and source identity.
Restart skips compatible complete chunks. Fail explicitly on incompatible data.
Derived feature arrays are weakly cached by immutable bars, type and period.
Keep only bounded global/threshold/type leaders and fixed controls in the final
index; full compact metrics remain in eight threshold summaries and 216 chunks.
Write selected full ledgers and next-open sensitivity only after selection.
Atomic outputs precede summary/index commits. No raw inputs are deleted and
no queue, page setting, production rule or external source is changed.

Report fixed controls and threshold/period neighborhoods, uniform-type leaders,
drawdowns, fills, four monitored ranges and fixed subperiods. Positive-after-close
holding coverage is not captured return. Next-open sensitivity retains the
same targets and costs; do not mix its execution convention with close-proxy
headline returns. Reruns must produce identical output hashes.
