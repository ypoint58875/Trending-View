# Nikkei 225 multi-moving-average slope study

This directory is an independent research artifact. It does not import, alter,
or register code in the QuantScope application.

## Research question

Estimate the conditional probability and magnitude of subsequent Nikkei 225
moves when one through five moving-average slopes jointly satisfy learned
thresholds. The declared feature universe is:

- SMA, EMA, and WMA;
- 3, 5, 10, 20, 50, 100, and 200 trading sessions;
- one-session normalized slope: `(MA[t] / MA[t-1] - 1) * 100`;
- 5, 10, 20, and 60-session forward horizons;
- at most five simultaneous moving-average conditions.

Thresholds are fitted only in the training period. Combinations are selected
only in the validation period. Results from 2016 onward are an untouched
holdout evaluation and never participate in rule selection.

## Data policy

The script downloads Yahoo Chart data for `^N225` directly to obtain the
longest public OHLC history, then checks the recent overlap against Nikkei's
official three-year CSV. The official response is not retained because
Nikkei's public terms restrict reproduction. The raw Yahoo response and
checkpoint state are local caches excluded by this directory's `.gitignore`.
Final tables include source URLs, access times, hashes, parameters, and the
last accepted date.

Yahoo's early rows have degenerate OHLC values. Close-only event statistics
may use history from 1965, but next-open executable tests begin on 1988-04-08,
the first reliably non-degenerate OHLC regime identified in the source audit.
The Nikkei 225 level is a price index and excludes dividends. It is not itself
a directly tradable instrument.

## Run

```powershell
node research/nikkei-ma-slope/analyze.mjs
node --test research/nikkei-ma-slope/tests/*.test.mjs
```

Use `--refresh` to ignore a raw cache younger than 24 hours. Use `--help` for
the complete command summary.

## Outputs

- `output/report.zh-CN.html`: first-read Chinese research report.
- `output/primary-holdout.csv`: one validation-selected rule per depth.
- `output/selected-holdout-all-horizons.csv`: holdout results for all
  validation-selected probability, return, and balanced variants.
- `output/validation-combination-search.csv`: the complete declared-grid
  combination search after each moving average's threshold is fixed in the
  training sample.
- `output/atomic-thresholds.csv`: training-selected threshold for each moving
  average.
- `output/strategy-cost-sensitivity.csv`: 0/5/10 bps per-side execution
  sensitivity.
- `output/subperiod-stability.csv`: fixed-rule holdout subperiod checks.
- `output/run-manifest.json`: source, configuration, hash, split, and runtime
  provenance.
- `data/processed/nikkei225-normalized.csv`: normalized, reproducible bars.
- `data/source_registry.jsonl`: machine-readable source register for this
  isolated study.

## Interpretation rules

The daily qualifying-event count is descriptive and contains overlapping
forward windows. Executable results use the next session's open and a single
position, so trades do not overlap. Stationary-bootstrap intervals are based
on the non-overlapping trade-return sequence. False-discovery-rate values are
exploratory diagnostics, not proof of a persistent market edge.

The search is exhaustive over all one-through-five combinations of the 21
declared moving averages after each moving average's direction and threshold
are selected in training. It is not exhaustive over every possible numeric
period or threshold in existence.

