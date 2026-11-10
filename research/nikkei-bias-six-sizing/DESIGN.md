# BIAS and six-curve sizing comparison

Research only. Preserve current production v10, frozen screening winners and
the Nikkei close proxy. No application/account/optimizer changes.

Primary event: BIAS20 trailing SMA3 strictly decreases on each of three
successive comparisons, AND SMA20 daily point slope trailing SMA3 first
decreases after a nonnegative change. Falling slope is not negative slope.
Also report the broader both-falling condition as a sensitivity.

Compare native v10; BIAS-only gate with same-close timing; additive combined
holding-add veto; and independent allocation sleeves that halve or clear
exposure on each primary event, restoring the sleeve on the next native
increase (not automatically the following day). Native targets are generated
by an independently funded shadow v10 account. These sleeves preserve native
signal/stop/range history, rather than pretending scaled trades reproduce a
newly integrated controller. Gate cases instead replay the native controller.
Also compare transient sleeves that restore native exposure as soon as the
trigger condition is false, to isolate the effect of recovery semantics.

Six-curve regimes use existing retained confirmation: all six SMA3 curves
strictly move in one direction on three successive days; mixed days preserve
the previous confirmed state. A state known at close labels only subsequent
close-to-close returns. Unknown state is separate. Compare weak-state sleeve
multipliers 0.75, 0.5, 0.25 and 0, with native exposure in strong/unknown state.
Also report next-open execution sensitivity and fixed 1000/500/500 segments.
No threshold is selected or optimized; final500 is reused, not a holdout.

Options: integrate every cap into native controller state, or use a separate
exposure sleeve. Integration changes entry age, range protection and recovery,
confounding the question whether existing weak-state exposure earns returns.
Use sleeves for attribution, native replay for add gates. Neither supports
production adoption without a separate integrated-policy validation.

Bounds: <=10000 bars, <=2048 decisions, <=16MiB per file, <=1.5GiB RSS;
fixed case list and sequential execution. Atomically persist completed cases
with input/implementation identity, timestamps and status. Restart resumes
completed cases; --limit supports interruption checks. Pure replay supports
serialized controller/account resume and causal-prefix verification.

References reviewed 2026-11-06: Bailey et al., The Probability of Backtest
Overfitting, https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf . Repeated
historical selection must not be presented as independent future evidence.
