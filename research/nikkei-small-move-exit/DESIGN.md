# Small-move ordinary full-exit protection

Declared2026-11-06 before candidate comparisons. User requests BOTH definitions
and multiple amplitudes. Research only; no production/account/winner changes.
Keep the previous reduction-cooldown experiment separate; baseline has no new ban.

## Approaches and fixed cases

1. Cost-distance: abs(close / first-entry unit cost -1)*100. Protect ordinary
   full exit if this is strictly below threshold. A price near its entry can
   still have made a large excursion; this method does not classify that path.
2. Episode range: (highest post-entry high - lowest post-entry low) / first-entry
   unit cost*100. Protect ordinary full exit while this is strictly below
   threshold. A slow narrow trend can accumulate enough range to release it.

Thresholds0.5,1,1.5,2,3,4,5,6,8,10 percent for EACH, plus native baseline:21 cases.
No grid extension after results. Both can reduce churn but delay a useful sale
and increase losses; cost-distance can reactivate after a roundtrip back to cost,
whereas episode range is monotone until flat. Neither adds an early profit exit.
Primary background accessed2026-11-06:
https://www.aqr.com/-/media/AQR/Documents/Insights/Working-Papers/AQR--Craftsmanship-Alpha.pdf
supports evaluating turnover savings together with stale-position opportunity
cost; it does not validate these particular definitions or thresholds.

## Entry, range, signals and risk

Entry reference is the actual first buy of a new invested episode. Unit cost
includes execution slippage and buy commission. Later adds and partial reductions
do NOT reset this anchor or range; it is not moving-average cost. Full flat resets
the episode. Seed high/low with first actual buy fill price; do not use entry-day
high/low that could precede a close entry. On subsequent completed bars, include
the entire observed high/low through today's close before evaluating an exit.
Only causal completed bars are used. Current-close comparison uses entry cost,
not future entry or peak information. No unstated price-band hysteresis.

Process original two-bar requests and native SmaPositionOverlay daily close on
accepted real account state. Only proposed full liquidations from invested to0
are eligible; partial reductions pass. Preserve all native entry/holding/trend
guards and buy priority. Native early4% stop and ATR shock exit always bypass
protection, including simultaneous ordinary exits. Reuse the existing research
hardRisk probe, not a new stop implementation. The native4% rule remains limited
to its existing early-entry age, not a new universal lifetime stop.

For a protected full exit restore prior accepted holding/entry/recovery state,
retain pending target0, advance close and original-request markers. Native rules
may reconsider that pending exit later; it executes only after existing guards
allow it and protection no longer applies, or a hard exit occurs. Original buys
can cancel it. Never use a frozen baseline target path with phantom entries.

Use shared economic ledger for actual episode entry cost/range and compare all
fills with the ordinary close-proxy backtester. Durable cursor: controller,
cash/units, previous/planned allocation, episode entry cost/index/high/low.

## Frozen source, execution and evaluation

Reuse full-screen-6-15 input/signals;6566 bars/1293 decisions; evaluate last2000
sessions2018-08-09..2026-10-26 with current v8/frozen winners and3bps commission
plus2bps slippage. Exact native baseline targets, final state, fills and
440.9807031454993% return are required. No new screening or market-data fetch.
Nikkei close proxy is main timing. Gross/stress20bps-side and next-open are
separate sensitivities of the SAME controller/anchor path, not a redesigned
execution-specific strategy. China-product prices and real fills remain untested.

Report full/train1000/validation500/final500 return, DD, fills, turnover, blocked
ordinary full exits, risk sales, consecutive sell-buy pairs within7 sessions,
eight250-session blocks and fixed20-session price-up>=5% underperformance blocks.
Blocked exit attempts may repeat; they are not counts of independently saved
trades. Reused historical sample and v8 selection preclude untouched-holdout or
significance claims. Qualification fixed: train return>=baseline-3pp/DD>=baseline-2pp;
validation return>=baseline/DD>=baseline-1pp; train AND validation turnover<=95%
baseline, tolerance1e-8pp. Highest validation-return qualified candidate wins;
otherwise baseline. Full and final500 do not select parameters. No automatic adoption.

## Bounded progress and verification

21 serial cases,one live replay;10000 bars,2048 decisions,16MiB/JSON,1.5GiB RSS.
Source/design/implementation hashes scope separate raw data/registry/checkpoints
and processed case ledgers/manifests. Atomic completed rows, identity/hash/order
checks, status/timestamps/attempts/completed/pending/last error. --limit3 or
SIGINT/SIGTERM stops at case boundaries; rerun resumes matching completed prefix
and repeats at most one unfinished unit after crash/reboot/timeout/cancellation.
Missing/corrupt/incompatible files fail; no network fallback or external jobs.
New identity preserves previous data. Complete manifest is committed after audits.

Tests: metric definitions; exact threshold boundary; high/low causality; first
entry versus adds/partial/full reset; no entry-day pre-entry extrema; partial
reductions unaffected; pending retention/cancellation; both native risk bypasses;
native baseline state/path/fill parity; all-case causal prefixes and serialized
controller/episode/cash resume; checkpoint and memory bounds. Independent Python
cash oracle verifies all saved economic fills and metrics. Record observed RSS.

Planned files: this directory plus docs/CODEX_STATE.md,FEATURE_MAP.md,
MODULE_PATTERNS.md,FUNCTIONS.md,TECH_RESEARCH.md,DATA_SOURCES.md,DEBUGGING.md.
Application/library/optimizer/provider/account/archive files are excluded.

## Concurrent default upgrade: version-isolated verification

Before any small-move candidate result was produced, another task adopted v9.
The baseline assertion stopped the run rather than mixing versions. Pin default
research to explicit archived RSI_SHAPE_POSITION_OVERLAY_OPTIONS (v8). Repeat the
EXACT21-case menu independently under v9 via --current; do not tune thresholds.
V9 cycle controller reads its new holding-add flag with lag1, as the current
cycle page does: baseline445.34209325762885%, not the lag0 diagnostic444.10259%.
Version/model identity and separate latest-v9.json/RESULTS_V9.md keep histories
separate. Both get identical audits and qualification within their own baseline.
This adds21 version-sensitivity replays, not new parameter choices. Do not alter
or revert concurrent product work. Prior cooldown remains explicitly v8.
