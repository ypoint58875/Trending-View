# Post-reduction increase cooldown

Declared 2026-11-06 before comparison results. Research only; no production,
saved-account, ranking, source archive, provider or protocol edits.

## Question and alternatives

User proposes no increases for X days after reducing exposure. Compare a strict
accepted-allocation cap with request-only suppression. Request-only suppression
would miss supplemental, shape, rebound and native recovery entries; reject it
as an incomplete implementation. Use the existing production controller and
checkpoint/restore pattern from nikkei-context-entry-gates and nikkei-chop-filter,
plus the shared economic allocation ledger from nikkei-switch-turnover.
Use trading sessions rather than calendar days to make weekends/holidays
consistent. Fixed seven cases: X=0,1,2,3,5,7,10. X=0 is exact baseline.

Primary background checked2026-11-06:
https://www.aqr.com/-/media/AQR/Documents/Insights/Working-Papers/AQR--Craftsmanship-Alpha.pdf
discusses turnover savings versus opportunity cost of stale positions; it does
not establish an optimal cooldown or verify these local cases.

## Exact state and execution rules

Reduction means an actual economic sale, including partial reduction, full exit
and native hard stop. Plan changes and unexecuted pending sell requests do not
start the clock. A sale at completed close d blocks increases at closes d+1
through d+X inclusive; the first eligible decision is d+X+1. Any subsequent sale
resets the clock. There is no new restriction on reductions or exits. X=0 blocks
nothing. Native early4% stop, ATR shock exit, pending sells, holding-age guards
and native stop cooldown still execute; restrictions overlap, never shorten
existing waits. For X longer than native wait, reentry is additionally delayed.

Apply original two-bar requests and native daily close on the real inherited
controller. If the proposed close allocation exceeds its prior accepted target
while cooling, restore accepted entry/age/recovery state and prior allocation,
advance daily progress, preserve original-increase pending cancellation and
last-request semantics as in the existing research pattern. Never leave phantom
entries or reset the age of shares actually held. Equal-target original buys
remain meaningful and can cancel pending sells. Block all increase sources,
including flat reentry, supplemental/shape/rebound and native stop recovery.
No synthetic catch-up order is queued. Once restriction expires, a fresh native
decision (including still-valid native recovery) is necessary. No future prices
or labels influence a decision.

Run the shared cash/units ledger alongside accepted targets. Only an actual sell
arms the extra wait; compare every resulting fill with the ordinary close-proxy
backtester before interpreting results. Durable state includes controller,
last reduction index, cash/units, last planned and previous accepted targets.

Reuse frozen full-screen-6-15 input/signals,6566 bars and1293 decisions, final2000
sessions2018-08-09..2026-10-26. Require exact baseline targets, final controller
state, economic fills and440.9807031454993% close-proxy return. Original winners
and3bps commission plus2bps slippage are frozen. Main Nikkei close proxy remains
separate from next-open sensitivity. The latter changes fill timing for the same
controller path and is NOT a fill-aware next-open cooldown redesign.

## Evaluation fixed before results

Report full/train1000/validation500/final500 return, DD, fills and turnover, eight
250-session blocks, blocked flat entries versus holding adds, native-stop days,
gross/actual/stress20bps-side and next-open sensitivity. Count consecutive
sell-buy fills within3/5/7 sessions; these can overlap and are descriptive only.
Fixed nonoverlapping20-session price-up>=5% blocks show missed-rally exposure
costs versus baseline. No assumption that fewer trades means improvement.

Qualification: train return>=baseline-3pp and DD>=baseline-2pp; validation
return>=baseline and DD>=baseline-1pp; train AND validation turnover<=95% of
baseline. Tolerance1e-8pp. Highest validation return wins among qualified cases,
otherwise baseline. Full/final500 results do not select parameters. Data and v8
have been studied repeatedly: final500 is a conditional historical audit, not an
untouched holdout. No production adoption follows this research automatically.

## Persistence, resource bounds and tests

One live replay, seven cases, no external jobs or network data requests. Bounds:
10000 bars,2048 decisions,16MiB/JSON,1.5GiB RSS. Source/design/implementation
identity scopes raw backups, source registry, progress and outputs. Atomically
replace each completed policy and checkpoint; record status, timestamp, attempts,
completed/pending units and last error. SIGINT/SIGTERM and --limit stop at case
boundaries. Rerun to resume only matching validated contiguous policy prefixes;
repeat at most one unfinished case after crash/reboot/cancellation. Missing or
corrupt state fails explicitly. New identity preserves previous output. Raw
backup and processed ledgers are separate and Git-ignored.

Tests: inclusive wait/end boundaries, repeated reductions, partial/full and risk
sales, pending-only non-trigger, all-source increase cap, preserved entry age,
no synthetic catch-up, X=0 exact native parity, serialized state/ledger resume,
truncated-bar causal prefixes, checkpoint identity/order/bounds rejection. Fresh
audits recompute all cases; independent Python scalar cash/units accounting
checks saved metric and economic-fill records. Measure RSS under full sample.

Planned files: this directory plus docs/CODEX_STATE.md, FEATURE_MAP.md,
MODULE_PATTERNS.md, FUNCTIONS.md, TECH_RESEARCH.md, DATA_SOURCES.md, DEBUGGING.md.
All application/library/account/optimizer/archive files explicitly excluded.

Concurrent default-v9 upgrade detected later: pin this completed design to
explicit archived RSI_SHAPE_POSITION_OVERLAY_OPTIONS(v8), reverify all seven
original targets/metrics. No parameter change. New exit-protection study repeats
v8/v9 independently; never silently change this experiment's baseline. Preserve
concurrent production work.
