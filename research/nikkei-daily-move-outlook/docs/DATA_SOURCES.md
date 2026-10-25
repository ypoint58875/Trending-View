# Data sources

## SOX source added 2026-10-20

- Instrument definition: https://indexes.nasdaq.com/Index/Overview/SOX .
  Total-return XSOX and semiconductor ETFs are not substituted.
- Prices: Yahoo Finance chart `^SOX`, INDEX metadata, America/New_York dates.
  Endpoint: `https://query1.finance.yahoo.com/v8/finance/chart/%5ESOX` with
  `period1`, `period2`, `interval=1d`, `events=history`; the exact timestamp,
  request URL and parameters are in `data/source_registry.jsonl` and SOX sync
  state. Nasdaq identity verification is not a historical-price cross-check.
- Initial history request: 1999-12-01 through 2026-10-13; December supplies the
  preceding close for analysis starting 2000-01-04. Prices are unadjusted closes.
- Raw backup: `data/raw/sox/yahoo-<sha-prefix>.json`; normalized backup:
  `data/processed/sox-daily.csv`; hashes accompany source and report manifests.
- Rejected invalid rows on initial acquisition: zero. Counts are based on
  provider-returned sessions without synthetic calendar fills.

The daily-run/context study uses the identical snapshot and accepted-source
SHA-256, without refreshing prices on 2026-10-20. Data ends 2026-10-13.
Its original daily-run population is checked against `completed-runs.csv`.
`singleton-manifest.json` records source/config/module and output hashes.
All classifications, terciles and forward means are derived calculations.

`adaptive-manifest.json` hashes the unchanged accepted Yahoo-normalized Nikkei
CSV and all relevant computation modules. No market request was made for this
revision; the acquisition times, parameters and official overlap check remain
in the original source registry/manifest. Accepted data ends 2026-10-13.
Partitions, relative ratios, operation returns and passive price-index returns
are derived calculations, not publisher recommendations. The benchmark excludes
dividends and is not an ETF total-return claim. No credentials or orders are used.

`relative-manifest.json` references the exact same source data and source-run
manifest hashes. All adjacent-pair ratios, amplitude groups, order triggers,
fees and policy metrics are derived research calculations, not sourced index
publisher claims. No new data, order API, credentials or account is used.

The revised MA interval study uses this exact accepted snapshot, with no new
market-data request. `ma-interval-manifest.json` records its data hash and the
source run-manifest hash. Interval definitions and candidate quantiles are
derived calculations, not claims supplied by Yahoo or the index publisher.

Access date: 2026-10-15, Asia/Shanghai. Exact UTC request timestamps, parameters
and SHA-256 hashes are recorded in `data/source_registry.jsonl` and
`output/run-manifest.json`.

## Primary history

Instrument: Yahoo `^N225`, Nikkei 225, Japanese-yen price-index levels.
Historical input is a read-only copy of
`../nikkei-ma-slope/data/processed/nikkei225-normalized.csv`, originally obtained
from Yahoo Chart on 2026-10-03T00:26:03.342Z. The seed contains 15,177 rows through
2026-10-01; its exact copied bytes and provenance are retained under `data/raw/`.

Incremental endpoint:
`https://query1.finance.yahoo.com/v8/finance/chart/%5EN225`
with `period1` 14 calendar days before the last accepted date, `period2` current
time plus one day, `interval=1d`, `events=history`. Raw JSON is retained by hash.
The initial update accepts seven new dates through 2026-10-13. The 2026-10-14
row contains null values and is rejected; no zero replacement or forward fill.

Yahoo is a public website endpoint, not a guaranteed licensed data API; availability,
revisions and automated access can change. No credential, cookie, or account is
used. Existing accepted prices are locked, and revisions are disclosed.

## Publisher validation

`https://indexes.nikkei.co.jp/nkave/historical/nikkei_stock_average_daily_en.csv`

The initial validation covers 922 overlapping dates from the publisher's recent
window and identifies its latest complete date as 2026-10-14. Maximum absolute
close error is 0.000005684%; the gate is 0.05%. The CSV is parsed in memory only
and not retained or distributed because of its reproduction notice. Only
aggregate overlap diagnostics and dates are retained. Publisher values are not
merged into the Yahoo canonical history.

Definition and data permissions:
`https://indexes.nikkei.co.jp/en/nkave/index/profile?idx=nk225`
`https://indexes.nikkei.co.jp/nkave/data/index.en.html`

The price index excludes reinvested dividends. This study does not substitute a
currency-hedged index, total-return index, ETF, or futures contract. A theoretical
index return does not include execution costs, tracking error, FX conversion,
or financing. The close-only wave analysis uses confirmed reversal dates and
must not be confused with causal intraday trading signals.
