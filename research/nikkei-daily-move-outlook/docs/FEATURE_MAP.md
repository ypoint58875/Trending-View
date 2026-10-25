# Independent feature map

| Research feature | Implementation | Outputs | Verification |
| --- | --- | --- | --- |
| SOX 200-session frequency comparison | `analyze-sox-blocks.mjs`, `lib/sox-source.mjs`, SOX config/copy; shared `dailyDirectionBlocks` | SOX raw/normalized data, sync state, source registry, `sox-200-session-*` report/tables | INDEX identity, null rejection, locked incremental merge, provenance, source/row aggregation and output hashes |
| Fixed 200-session up/down day proportions | `dailyDirectionBlocks`, `analyze-daily-blocks.mjs`, isolated copy | `daily-200-session-*` report, CSV/JSON, manifest/state | Outside-window and block-boundary comparisons, flat days, partial tail, full-count reconciliation |
| Daily run duration and isolated-day population (latest) | `analyze-singletons.mjs`, `lib/singletons.mjs`, `singleton-config.json` | `singleton-duration-summary.csv`, all runs and isolated-day details | Exact original CSV tie-out, 802/883 strict patterns, exhaustive 1/2/3-plus durations |
| Amplitude terciles linked to SMA context | `singletonGroups`, `classifyRun`, `analyzeSingletons` | Amplitude groups, group/context table, MA sequences and parent interval IDs | Exact edges, count reconciliation, transient/neutral labels, observable denominators |
| Joint Chinese report | `singleton-copy.zh-CN.json`, `lib/singleton-report.mjs` | `singleton-report.zh-CN.html`, results, manifest/state | MA/duration selectors, counts, valid templates, desktop/mobile QA |
| Adaptive partitions (current primary) | `learnPartitions`, `fitAdaptiveCandidates`, `adaptive-config.json` | `adaptive-partitions.csv`, candidates and group/census data | Separate sides, exact edges, minimum counts, ties, early-only fitting |
| Group thresholds and small-reference exclusion | `optimizeAdaptive`, `optimizeAdaptiveFamilies`; optional fields in `relative-exits.mjs` | Validation grid, filtering comparisons, fills, signals and equity | Validation-only selection, prefix invariance, exclusion, next-open prices and fees |
| Prediction and passive comparison | `candidateEvidence`, `buyAndHold`, `annualComparison` | Mature frequencies, accuracy-first fills, costs and annual results | Flat outcomes, sparse fallback, first-open cost, compounding |
| Current report and reproducibility | `analyze-adaptive-thresholds.mjs`, `adaptive-report.mjs`, isolated locale | `adaptive-report.zh-CN.html`, results and manifest/state | Hashes, MA/sample selectors, desktop/mobile, unsuccessful comparisons |
| Adjacent MA interval relative magnitude (current primary) | `adjacentPairs`, `summarizePairs`, `amplitudeBucket` in `lib/relative-intervals.mjs` | `relative-pairs.csv`, group distributions and exclusions | Direct adjacency, valid prior denominator, failed-next inclusion, exact group edges |
| Group-specific relative threshold evidence | `fitRelativeCandidates`, `relativeCrossings` | `relative-ratio-candidates.csv`, first crossings and remaining-interval results | Early-only fitting, disclosed pooling, first observable overshoot, active/end-at-trigger handling |
| Threshold-driven long/flat operation | `signalSchedule`, `simulateRelativeExits`, `evaluateExitGrid` in `lib/relative-exits.mjs` | Full grid, selected schedules, controls, costs, actual signals/trades/equity and group cohorts | Threshold entry instead of MA-only entry, next-open gaps/fees, prefix invariance, pending signal, validation-only selection |
| Relative price report/calculator (current primary) | `relative-copy.zh-CN.json`, `lib/relative-report.mjs`, `analyze-relative-exits.mjs` | `relative-report.zh-CN.html` | Group/MA/sample selectors, percentage-vs-point conversion, invalid inputs, failed comparison disclosure |
| MA direction intervals (primary) | `movingAverageIntervals` in `lib/intervals.mjs`; `interval-config.json` | `ma-interval-completed.csv`, current intervals, SMA chart | Direct SMA sign equivalence, exact flats, prefix invariance, distinct confirmation |
| Interval direction and magnitude census | `intervalSummary` | `ma-interval-statistics.csv` | Price-direction disagreement is retained; complete/active separation |
| Distribution-derived thresholds | `deriveThresholds` | `ma-interval-thresholds.csv` | Only aligned intervals confirmed by calibration end; later observations cannot change thresholds |
| First-crossing reversal study | `thresholdEvents`, `eventOutcome`, `analyzeThresholds` | `ma-interval-events.csv`, every outcome, all horizon/subperiod summaries | Unique first crossing, causal stability, wrong-final-direction interval inclusion, end censoring, non-overlap and sign/anchor checks |
| Revised Chinese research report (primary) | `interval-copy.zh-CN.json`, `lib/interval-report.mjs`, `analyze-intervals.mjs` | `ma-interval-report.zh-CN.html` | Linked period/sample/horizon controls, same server/client renderer, date/source hashes and visual QA |
| Daily magnitude / bins | `lib/core.mjs`, `analyze.mjs` | `daily-distribution.csv`, `conditional-buckets.csv`, daily features | Sign/flat denominators, bin edges, complete endpoint counts |
| Conditional outlook | `features`, `selectHistory`, `forward`, `outlook` | `outlook.csv`, outcome SVG, report | Causal prefix invariance, matured labels, sparse fallback, separate anchors |
| Runs and waves | `runs`, `waves` | Completed-run and confirmed-wave CSVs, unfinished current-wave report | Later confirmation dates, excluded unfinished runs |
| Historical evaluation | `evaluate` | Summary and every origin prediction CSV | Horizon-spaced origins, independently recomputed endpoints/Brier |
| Source and recovery | `analyze.mjs`, `config.json` | Raw snapshots, registry, sync/completion state, run manifest | Hash tie-outs, offline replay and source row counts |
| Chinese presentation | `report-copy.zh-CN.json`, `lib/report.mjs` | `report.zh-CN.html`, standalone SVG charts | Date/template assertions, desktop and mobile visual inspection |

All links resolve within this directory except explicitly read-only historical
seed inputs. No parent app feature linkage or protocol contract changes.

Adaptive grouping and holding comparison is now the primary response. Older
reports are retained prototypes. Percentage thresholds never define SMA intervals;
small-reference exclusion does not merge intervals.
