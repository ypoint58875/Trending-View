# RSI period and threshold extension

Research-only augmentation of complete v7, frozen2000 sessions through2026-10-26.
No independent RSI-only account, production rule, winner reranking or market-data
refresh. Native entries, exits and stops are never filtered; only added shapes.

Compare repeating hand-coded RSI implementations with caching the shared Wilder
RSI by period in ShapeContext. Choose cached shared calculations and optional
per-side ShapeRsiSettings, preserving exact legacy defaults. Entry and exit
settings remain independent in combined candidates. Keep period and historical
lookback separate; today's RSI is excluded from recent extreme history.

Periods7..20 inclusive. Entry filters: rising; RSI above30..65 step5; rising
with current RSI inside lower30/40/50 and upper60/70/80; or past RSI<=20..45
step5 followed by rising today, lookback5/10/14/20. Apply to four-close breakouts
after5..10% declines and high4/higher-low forms after5/7/9%, with WMA protection
and fallback priority fixed. Include unfiltered controls for12 entry shapes.

Exit filters: falling; RSI below30..60 step5; or recent RSI>=55..80 step5 and
falling today, lookback5/10/14/20. Apply to all OHLC descending3..6 sequences,
all three existing exit priorities. Include48 unfiltered exit controls. Together
with baseline this produces28621 single-rule configurations. Comparators remain
strict for above/below, inclusive for historical extremes/range endpoints.

Then combine up to8 distinct-target entry candidates and8 distinct-target exits
selected by proximity to both return goals. Do not spend combination slots on
identical target paths. This is an exploratory shortlist, not an exhaustive
entry/exit Cartesian search or untouched out-of-sample validation.

Primary: full2000/final500 return and max drawdown under the same close proxy.
Also inspect500-session blocks, post2026-07-21, matching next-open sensitivity,
first1500-only selection, nearby RSI periods/thresholds and event omissions.
Count strict double/triple improvements with numerical tolerance. Report the
tested grid explicitly and do not claim a global optimum or guaranteed benefit.

Use identity-versioned128-row chunks plus atomic manifest under data/rsi-parameter/.
Commit chunk before manifest; resume validates hashes, ordered policy identities
and completed prefix. At most one unmanifested chunk is recomputed after crash.
Input<=16MiB, bars<=10000, policies<=30000, metrics cache<=4096, RSS<=2GiB.
Keep bounded summary rows in memory; never retain per-policy target arrays.
SIGINT/SIGTERM flush the current safe chunk before exiting. Preserve prior
experiments and raw source backups; no automatic durable-state deletion.
Outputs: output/rsi-parameter/. Method references: SHAPE_PRIORITY_DESIGN.md.
