# Held rolling5..20-close peak comparison

User requests every integer held rolling window5..20 and thresholds2/3/4/5/6%.
Retain the same four explicitly requested native v5, turn4, turn4 RSI35-to40
and daily4-ema3 models, unchanged frozen source/decisions/costs and prior
peak-liquidation semantics. Wait0 and wait5 remain separately reported.
Total644 cases:4 controls+4*16*5*2. No episode-lifetime variants are added here.

Reuse PeakLiquidationAccount unchanged at runtime; widen only PeakPolicy's
window TypeScript type from0|20 to number. Actual rolling maximum uses the
latestN completed closes inside the current held episode, including today,
never prices before entry. Reset on actual full exit, not partial additions.
Forced exits override hold guards, clear pending/old recovery state and reset
flat history. Native early stops retain their own recovery. New peak stops
permit only existing entrances after wait0/5; no added recovery buy. Main
uses Nikkei completed-close proxy, not intraday stop-line fills.

Files: peak-window-study.ts/test, this design and the shared type-only change.
Do not modify production or old numeric results. Old164-row source-hashed
checkpoint remains preserved and will reject changed-code resume; do not
rewrite its hash. Verify all baseline and overlapping rolling20 target hashes
against those frozen old rows, independently of checkpoint compatibility.
New atomic20-case state data/peak-window/grid.json validates exact source/code/
design/menu/order identity. SIGINT/SIGTERM/RSS checks safely commit complete
rows. Bounds16MiB/input,10000 bars,2048 decisions,644 cases,RSS1.5GiB.

Separate output/peak-window contains all scalar cases, full GRID.md and selected
ledgers/report. Show highest full return and lowest DD among actually affected
cases, plus strict higher full/final500 with no-worse fullDD. Report counts of
inactive policies separately. First1500-only selector and selected next-open/
double-cost sensitivities remain visible. Parameters selected on repeatedly
searched history are not untouched validation or future guarantees.
Tests cover exact menu, rolling window expiry, all policy prefix causality,
baseline parity and incompatible progress. Update CODEX_STATE, FEATURE_MAP,
TECH_RESEARCH, DATA_PIPELINE and CACHE_POLICY. No market fetch, scheduler,
raw deletion or changes to older outputs.
