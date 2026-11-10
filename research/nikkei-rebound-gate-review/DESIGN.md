# Current-v8 rebound gate review

Research only. The questioned close<=SMA20 restriction intentionally isolates
the below-average rebound fallback from the ordinary EMA7-turn/close>SMA20
entry. WMA14 was the archived v1 flat-entry gate; current v8 uses WMA7 and
exempts existing-position original adds. Do not silently restore an old gate
or mistake flat-account fallback entries for adds to an existing holding.

Freeze nine cases: current below-SMA20/EMA3; disable only this fallback; above
SMA20/EMA3; any SMA20 location/EMA3; below plus previous-high break; below plus
nondeclining SMA20; below with four consecutive EMA7 increases; above plus
previous-high break; below plus additional nondeclining WMA14. Other gates,
causal decline>=5%, rebound>=4%, WMA7, stop/recovery/holding and original-signal
priorities remain v8. WMA14 extra applies only to this fallback, not all buys.

Reuse production SmaPositionOverlay. Temporarily exclude only reboundReady by
setting the flat-window start to today for a flat account, so it has no prior
flat low. Restore the real flat-window start after native processing. All
native orders, shape fallback and risk/recovery still run in production.
Inject the candidate rebound only when native processing leaves the account
flat, with no original signal/pending reduction/cooldown. Set exactly the same
entry/holding/stop state as a native fallback. Default-case full state/targets
must reproduce direct production before result interpretation; shared features
and options are never mutated. Native overlapping entries keep priority.

Source: existing hash-pinned full-screen-6-15 input/signals. Evaluate2000
sessions2018-08-09..2026-10-26. Same continuous account, fees3bps/slippage2bps,
Nikkei close proxy; next-open sensitivity separately. Report full/first1500/
last500/maxDD/fills/entered-fallback dates and episode net outcomes. The v8
policy and sample were previously studied; this is conditional historical
evidence. A stricter-looking gate is not assumed safer without metrics.

Bounds:10000 bars,2048 frozen decisions,16MiB per JSON, nine serial cases and
512MiB RSS target with1.5GiB hard ceiling. Atomic per-case outputs and complete
summary last; interrupted short runs deterministically rebuild from raw backups.
No new queue, live cache, production state or credentials. Native checkpoint
state supports direct prefix/resume tests. Never treat a partial summary as
complete. Source and implementation hashes remain in the manifest.

Primary definition reference accessed2026-11-06:
https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/sma
Historical reason: ../nikkei-overlay-stability/SMA20_FALLBACK_DESIGN.md;
current production semantics remain authoritative over archived v5 metrics.
