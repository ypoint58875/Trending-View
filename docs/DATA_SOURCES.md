# Data Sources

## 2026-10-27 RSI first-pullback source reuse

Uses unchanged full-screen-6-15/input.json and signals.json with verified source
b543028a5db9860a9ac262d8bf65cf6df06f8d625afba728d875ce0d0274873e and bars hash.
No quotes were fetched. Current v8 research anchor replaces archived v7 for this
new hypothesis only. Official TradingView/Fidelity methodology URLs and access
date are recorded in TECH_RESEARCH and RSI_FIRST_PULLBACK_DESIGN; output records
source/code identity. Existing raw/source registry entries remain applicable.

## 2026-10-27 shape priority source reuse

The shape-priority experiment reuses the frozen full-screen-6-15/input.json and
signals.json described below, with existing raw backups and source registry.
It verifies source SHA-256, bars hash, ordered decision indexes, v7 anchor targets
and seven regenerated max5 alternatives from output/six-vs-five/summary.json.
No market-data endpoint was refreshed. Official RSI/backtesting references and
access date are recorded in SHAPE_PRIORITY_DESIGN.md; these supply methodology,
not historical quotes. Model/source/code identity accompanies each checkpoint.

## 2026-10-26 completed full-screen overlay source

The local `data/state/screening-engine/batch-f2b3d676fd69574d9437ee1d/`
queue and bars plus its 1293 job `request.json`/`result.json` files supply
the exact full-screen path for 2000 sessions ending 2026-10-26. Access time,
request/result SHA-256, raw/normalized bar and queue hashes, selected plans,
costs and current result model are frozen in
`research/nikkei-overlay-stability/data/full-screen-6-15/input.json` and
`source_registry.jsonl`. Raw bars and queue have separate local backups under
`raw/`. Validate every market prefix and schedule index. No network fetch,
quick-screen substitution or source modification occurs. Inputs are ignored
local reproducibility artifacts.

## 2026-10-25 overlay stability source snapshot

`research/nikkei-overlay-stability/data/input.json` freezes normalized N225 bars
and1293 exact completed ten-session quick-screen plans for2018-08-08..2026-10-23.
Read-only source endpoints are local
`data/state/screening-engine/{job}/request.json` and `result.json`, with shared
batch `bars.bin`. Record per-request/result SHA-256, causal-prefix verification,
quick-library hashes, costs and access timestamp in the frozen input and
`research/nikkei-overlay-stability/data/source_registry.jsonl`. Preserve the
shared binary under `data/raw/bars.bin` within that isolated directory.
No external price download is added. Two candidate fingerprints (159 and171
tuples) occur; their historical training vintages are unverified. Later overlay
evaluation is conditional on those actual supplied selections. Frozen inputs
are local Git-ignored research artifacts; derived tables remain reproducible.

## 2026-10-24 missed-rally study

`research/nikkei-cycle-rallies/data/input.json` freezes normalized ^N225 daily
bars and 298 exact-prefix selected winners from local batch
`4055816d2e7c57dd0388e9fa`. Source request/result SHA-256, full normalized bar
hash, access timestamp, and research URLs are retained alongside it in
`data/source_registry.jsonl` within that research directory. No new market
provider is called. Older 20/40 winners come from the prior frozen conflict
study; full market-prefix equality and that file's SHA-256 are checked and
recorded. Their different optimizer version/strategy ceiling is disclosed.

## 2026-10-24 fixed-primary Nikkei missing-date repair

Yahoo's successful latest response ended at 2026-10-22. Official Nikkei daily
CSV confirmed 2026-10-23. The current fix retains Yahoo as primary and inserts
only missing completed official dates after matching OHLC overlap.

- Endpoint: https://indexes.nikkei.co.jp/nkave/historical/nikkei_stock_average_daily_en.csv.
- Public reference: https://indexes.nikkei.co.jp/en/nkave/archives/data.
- Accessed: 2026-10-24; bounded original wire-row sample:
  `data/raw/nikkei-official-tail-2026-10-24.csv` (2026-10-19 through 2026-10-23).
- `data/source_registry.jsonl` records URL, access time, row range and SHA-256.
- Runtime official source snapshots remain separate in canonical IndexedDB.
  Each inserted bar records `ohlcSource` with official provider and fetched time.
  Yahoo stays the series primary; official missing volume remains zero, ready
  for later same-primary volume enrichment without rewriting OHLC.

## 2026-10-24 Nikkei cycle conflict replay

- Market identity: canonical Nikkei 225 (`index:N225`, Yahoo `^N225` primary
  with the existing validated backups). Live cycle starts request `mode=latest`,
  `interval=1d`, `limit=5` and merge into cached full history; a cache miss uses
  the existing history request capped at 10,000 bars.
- Research uses the local serialized Nikkei bar archive (6,560 sessions,
  2000-01-04 through 2026-10-16) and 1,573 completed cycle winners from
  2025-09-04 through 2026-09-28. Every original request's causal OHLCV prefix
  fingerprint matches; incomplete/non-cycle jobs are excluded. Ranking model
  versions, original costs/options, and source batch are separated in cohorts.
- `research/nikkei-cycle-conflicts/data/input.json` freezes raw normalized bars,
  selected plans, source request/result SHA-256 hashes, and source archive hash.
  Its `data/source_registry.jsonl` records access time; `output/` contains
  derived events and summaries. Existing archives remain untouched.
- Official session references, accessed 2026-10-24:
  https://www.jpx.co.jp/english/equities/trading/domestic/01.html,
  https://www.jpx.co.jp/english/corporate/news/news-releases/1030/20241103-01.html,
  https://english.sse.com.cn/start/trading/schedule/.

## Canonical source policy

Each instrument has one deterministic preferred definition. Provider responses
are persisted separately. Completed canonical bars stay locked. During an
outage, declared backups are tried sequentially: deterministic mappings can be
promoted directly, while uncertain mappings require bounded overlap. Promotion
may append missing dates or replace only an unconfirmed final bar.

Current fixed profiles:

- Shenzhen LOF `164824`: the verified fixed identity is Tencent `sz164824`
  with no-key raw daily history and current quote. Eastmoney `0.164824` raw
  `fqt=0` history is retained as a verified backup. Legacy EODHD
  `164824.SHE`/`OTHER` and Eastmoney records normalize to this profile and an
  incompatible adjusted cache is replaced as one unit. On 2026-09-21 the
  Eastmoney history endpoint returned `rc=102`, while Tencent returned valid
  rows through 2026-09-21 and quote close `1.264`.
- N225: Yahoo `^N225` preferred; official Nikkei CSV, Eastmoney `100.N225`,
  EODHD, Twelve Data, Financial Modeling Prep, Alpha Vantage, and Nasdaq
  ordered backups; FRED `NIKKEI225` close-only reference.
- SOX: Yahoo `^SOX` preferred; Nasdaq `SOX`, EODHD, Twelve Data, Financial
  Modeling Prep, Alpha Vantage, and Eastmoney ordered backups; the
  Eastmoney `251.SOX` result is retained only as an audit candidate because its
  public history can be very short.
- Gold, silver, WTI crude, and copper continuous proxies: Yahoo `GC=F`,
  `SI=F`, `CL=F`, and `HG=F` primary. Gold orders FMP `GCUSD`, AllTick
  `GOLD`, then Eastmoney `101.GC00Y`; the other commodities retain their
  Eastmoney continuous identifiers. Every commodity backup is overlap-gated.
- Other Yahoo-discovered instruments and known index/ETF definitions with a
  deterministic Yahoo symbol use Yahoo as primary. A result without a verified
  Yahoo mapping retains its selected provider. SSE/SZSE indexes try Zhitu
  immediately after the original provider. SSE/SZSE index/ETF recovery can use
  no-key Tencent raw daily history, uses its current quote for latest-only
  work, and reserves Juhe as the final quote-only candidate. Marketstack is
  ETF-only.

Canonical index identity is resolved through the shared Yahoo alias table before
profile validation, search de-duplication, cache lookup, fallback selection, and
saved-shortcut grouping. For example, Eastmoney `NDX100`, Yahoo `^NDX`, and
Nasdaq `NDX` all resolve to `index:NDX`; the same rule covers SPX/GSPC,
SENSEX/BSESN, and SX5E/STOXX50E. Provider-specific Nasdaq requests honor the
profile `secid` rather than reusing the selected provider's alias code.

Runtime browser stores keep canonical series, normalized exact-provider
snapshots, close-only references, source fingerprints, and source health
separately.

## Eastmoney website market data

- Search endpoint: `https://searchapi.eastmoney.com/api/suggest/get`
- Kline endpoint: `https://push2his.eastmoney.com/api/qt/stock/kline/get`
- Accessed: 2026-08-09
- Current parameters: symbol `secid`; `klt` in 1, 5, 15, 30, 60, or 101;
  forward adjustment `fqt=1`; selected OHLCV fields; daily `beg=20000101`;
  and a bounded daily result limit of 10,000.
- Raw sample: `data/raw/eastmoney_n225_daily_sample.json`
- Registry: `data/source_registry.jsonl`
- Runtime freshness: full history is cacheable for one hour. A separate
  uncached recent-bar request follows the selected instrument's visible-page
  session policy. Known regular venues refresh every five minutes through 30
  minutes after close. COMEX/NYMEX proxies follow the Sunday-Friday Globex
  session, 30-minute close grace, daily maintenance break, and weekend closure.
  An unknown venue uses 15 minutes. Focus/visibility uses the same minimum
  interval. HTTPS is preferred; after a TLS transport failure only, the
  adapter retries the same Eastmoney host over HTTP.

`fqt=1` output is marked `corporate-action-adjusted`. Volume is retained in the
provider's quote-page unit. The application displays it as provider volume and
does not scale it with price adjustment or silently convert it to shares.
Verified Eastmoney LOF definitions are the bounded exception: daily requests
use `fqt=0`, retain the original `secid`, and report `raw`. Eastmoney
`0.164824` now serves only as a verified backup to fixed Tencent raw history.
A live 2026-09-15 check returned rows beginning 2018-08-01, but a 2026-09-21
probe returned `rc=102`; the guessed Yahoo `164824.SZ` mapping is not used.

These are public website endpoints, not a documented licensed API. They may
change or rate-limit requests. Do not treat them as an authoritative execution
feed.

Across every provider, an initial primary failure immediately advances through
the declared backup chain. A 15-, 30-, then 60-minute retry backoff begins only
after the entire chain fails. Provider errors are normalized to non-sensitive
credential-invalid, access-denied, quota-limited, not-configured, or generic
upstream states before source-health storage; no response body or credential is
stored.

The 2026-07-27 direct coverage matrix returned valid history for N225, CSI 300,
HSI, DAX, FTSE 100, CAC 40, S&P 500, Nasdaq 100, KOSPI, SENSEX, Bovespa,
Euro Stoxx 50, SMI, Taiwan Weighted, and Straits Times; 11 US-listed ETFs; and
the four continuous commodity proxies. Eastmoney market `100` is an overseas
bucket, not an exchange. QuantScope maps known global codes to JPX, HKEX,
XETRA, LSE, Euronext, NYSE, Nasdaq, KRX, BSE, B3, SIX, TWSE, or SGX and leaves
unknown codes as `OTHER`.

## EODHD licensed daily market data

- Product documentation:
  `https://eodhd.com/financial-apis/quick-start-with-our-financial-data-apis`
- Search endpoint: `https://eodhd.com/api/search/{query}`
- Daily endpoint: `https://eodhd.com/api/eod/{symbol}`
- Accessed: 2026-07-27
- Current parameters: server-only `api_token`; `fmt=json`; `period=d`;
  ascending order; `from=2000-01-01` for extended history or a bounded recent
  window for latest refresh; current `to`.
- Raw sample: `data/raw/eodhd_aapl_daily_sample.json`
- Registry: `data/source_registry.jsonl`

EODHD is an optional licensed index/ETF fallback and search source. Runtime use
is disabled unless `EODHD_API_TOKEN` is present on the server. Search accepts
only `INDEX` and `ETF` metadata; individual equities and commodities are
discarded. The adapter uses a 12-second timeout and retries one transient
network, HTTP 429, or 5xx failure after a short delay.

For daily output, every accepted row must have a finite positive
`adjusted_close / close` factor before OHLC is scaled. If any row lacks a valid
factor, all rows remain raw and the series is marked `raw`; volume is never
rescaled. The committed sample uses EODHD's documented demo token and an AAPL
row solely as a reproducible parser fixture. It does not make individual
equities selectable in the product and contains no private credential.

## Official Nikkei 225 CSV

- Download page: `https://indexes.nikkei.co.jp/en/nkave/index?type=download`
- CSV endpoint:
  `https://indexes.nikkei.co.jp/nkave/historical/nikkei_stock_average_daily_en.csv`
- Accessed: 2026-07-28
- Capability: no-key N225 daily open, high, low, and close for the publisher's
  available window.

This is the first N225 backup because publisher identity and index identity are
deterministic. It does not generalize to other indexes. Display, redistribution,
and business use remain subject to the publisher's license terms.

## Twelve Data

- Search endpoint: `https://api.twelvedata.com/symbol_search`
- Daily endpoint: `https://api.twelvedata.com/time_series`
- Accessed: 2026-07-28
- Credential: server-only `TWELVE_DATA_API_KEY`.

The adapter resolves symbol and exchange before accepting index/ETF daily OHLC.
A live search identified `513310` as an SSE ETF, but all tested daily-series
symbol variants returned HTTP 404. Twelve Data therefore remains useful for
other resolved global instruments but is not a `513310` recovery source.

## Financial Modeling Prep

- Search endpoint: `https://financialmodelingprep.com/stable/search-symbol`
- Daily endpoint:
  `https://financialmodelingprep.com/stable/historical-price-eod/full`
- Accessed: 2026-07-28
- Credential: server-only `FMP_API_KEY`, sent in the documented request header.

The live N225 probe returned recent daily OHLC. The same symbol-resolution path
did not find `513310`, so FMP is not used as a verified fallback for that ETF.
The official commodity endpoint accepts `GCUSD`. A read-only live request
returned 1,330 parseable daily OHLCV rows through 2026-07-28. QuantScope maps
that response back to canonical `GC=F` but requires at least five matching
dates and bounded close/OHLC error before promotion; the licensed raw response
is not committed. A ten-date live comparison with Yahoo on 2026-07-28 measured
0.113% mean close error and 0.262% mean OHLC error, below the 2%/3% gate.

## Alpha Vantage

- Search endpoint: `https://www.alphavantage.co/query?function=SYMBOL_SEARCH`
- Daily/index endpoint: `https://www.alphavantage.co/query`
- Accessed: 2026-07-28
- Credential: server-only `ALPHA_VANTAGE_API_KEY`.

Alpha Vantage is overlap-gated rather than identity-trusted. The `513310`
response was sparse and did not establish a reliable exchange-local adjusted
series, so it cannot recover an empty chart and must pass retained-history
overlap before promotion.

## Marketstack

- Ticker endpoint: `https://api.marketstack.com/v2/tickers`
- EOD endpoint: `https://api.marketstack.com/v2/eod`
- Accessed: 2026-07-28
- Credential: server-only `MARKETSTACK_API_KEY`.

The configured plan returned adjusted SPY EOD rows from ARCX. Index-list access
returned HTTP 403 and `513310` EOD returned HTTP 422. Runtime use is therefore
restricted to exchange-verified ETFs; it is not an index or `513310` fallback.

## Zhitu

- Index documentation: `https://www.zhituapi.com/hsindexapi.html`
- Daily endpoint: `https://api.zhituapi.com/hz/latest/fsjy/{symbol}/d`
- Accessed: 2026-07-28
- Credential: server-only `ZHITU_API_KEY`.

The live CSI 300 probe returned recent SSE index daily bars. The adapter is
restricted to SSE/SZSE indexes and caps a request at 1,500 rows. Zhitu's
documented fund endpoints do not provide the required historical ETF OHLC, and
`513310` returned HTTP 404, so the source is not used for ETFs.

## Tencent Finance raw daily history and real-time quote

- Endpoint: `https://qt.gtimg.cn/q={symbol}`
- Daily endpoint: `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get`
- Daily parameters: `{exchange-symbol},day,,,2000,none`
- Accessed: 2026-07-28, 2026-09-15, and 2026-09-21
- Credential: none.
- Capability: up to 2,000 requested raw daily SSE/SZSE index or ETF bars plus
  one current-session quote.

The 2026-09-15 `sz164824` daily probe returned 1,971 rows from 2018-08-01
through 2026-09-15 in about 0.4 seconds while both Eastmoney history hosts
closed TLS connections. A 2026-09-21 probe again returned valid rows through
that Shanghai date plus quote close `1.264`, while Eastmoney returned `rc=102`;
Tencent is therefore the fixed `164824` canonical primary. The `sh513310` live probe returned one current-session quote with open, high,
low, current price, previous close, volume, amount, and timestamp. Because a
single quote cannot establish a historical price scale, latest-only responses
remain temporary overlays. The raw daily response can recover an empty chart
under verified exchange identity and remains subject to canonical immutability
and overlap validation when history already exists.

A live local `513310` refresh on 2026-07-28 returned a 2026-07-28 quote with
close `4.82` and changed the active series from 242 to 243 bars. The canonical
EODHD history remained separate and unchanged.

This is an undocumented public website endpoint with no availability or
redistribution SLA. The ClawHub skill is reference material only; QuantScope
implements its own small adapter and does not install or execute the skill.

## Juhe Data current quote

- Product page: `https://www.juhe.cn/docs/api/id/21`
- PDF reference: `https://www.juhe.cn/docs/download/pdf/21`
- Quote endpoint: `https://web.juhe.cn/finance/stock/hs`
- Accessed: 2026-07-28
- Credential: server-only `JUHE_API_KEY`.
- Current account allowance: 50 calls per Shanghai calendar day.
- Product update frequency: five minutes.
- Capability: one current SSE/SZSE index or ETF quote; no historical K-line
  recovery.

The official product covers China, Hong Kong, and US quote data, but it states
that the data is delayed, for learning/research only, and not for external
display. QuantScope therefore restricts this adapter to the existing local
SSE/SZSE index/ETF workspace and treats it as quote-only. It cannot recover an
empty chart, become an effective primary, persist a historical bar, or enter
routine source audits.

During outage recovery the no-key Tencent quote is tried first. Juhe is skipped
when Tencent already returned a valid quote and otherwise remains last so its
small daily allowance is preserved. A local Shanghai-day counter refuses calls
at the configured maximum of 50. `JUHE_API_USAGE_DATE` and
`JUHE_API_USAGE_OFFSET` can account for same-day calls made outside the current
server process. The provider's own quota remains authoritative after a restart.
Official errors for an invalid/expired key, missing entitlement, IP limit,
request limit, and test-key limit are mapped to the shared safe provider-error
states.

A read-only live `sh513310` request on 2026-07-28 returned a valid current
quote. The strict QuantScope route normalized it to one raw daily bar under the
original canonical `513310` identity with source `juhe` and
`latestBarStatus=complete`. No credential or licensed raw response is committed.

## Configured but inactive candidates

- Finnhub symbol lookup resolved `513310.SS`, but the stock-candle endpoint
  returned HTTP 403 under the current entitlement. It is not in the fallback
  chain.
- EIA provides energy statistics, not exchange OHLC bars. It remains a possible
  macro reference source only.
- Sina Finance ZYHub documents
  `https://mcp.finance.sina.com.cn/api-call/globalStockKlineDaily` for China,
  Hong Kong, US, and global-index daily K-lines with `X-Auth-Token`. The
  2026-07-28 strict probe returned `code=-1` and an insufficient-balance
  message. `ZYHUB_API_KEY` is configured locally but the provider remains
  inactive until a successful entitled call and symbol review.
- iTick documents a free, rate-limited personal API with stock and index
  history and a five-calls-per-minute limit, but no key is configured.
- AKShare/AKTools provides no-key wrappers over public sites but would add a
  Python sidecar and duplicate several existing Eastmoney/Sina paths.
- TuShare Pro requires a token and feature-dependent points. No token is
  configured and the required ETF/index access has not been established.

## Yahoo Finance website market data

- Search endpoint: `https://query1.finance.yahoo.com/v1/finance/search`
- Chart endpoint: `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}`
- Backup host: `query2.finance.yahoo.com`
- Accessed: 2026-07-27
- Current parameters: daily `period1=946684800` (2000-01-01 UTC) and dynamic
  `period2`; native `interval=1m&range=5d` for the active one-minute mode;
  no pre/post-market bars; split/dividend events; and bounded local output.
- Raw sample: `data/raw/yahoo_sox_daily_sample.json`
- Runtime freshness: full history is cacheable; recent-bar overlays use
  `no-store`. The newest returned bar may still reflect Yahoo's own publication
  delay.
- Current-bar metadata: finite positive `regularMarketTime`, current price,
  open, day high, and day low may fill only the unconfirmed current daily bar
  when the daily array lags. Date identity and UI timestamps use the explicit
  IANA `Asia/Shanghai` zone; venue-local clocks still control session timing.
- TOPIX search: the deterministic result is Yahoo `1306.T`, explicitly named
  as a TOPIX-linked ETF proxy. Yahoo `^TOPX` had no usable OHLC on 2026-09-15
  and returned HTTP 404 on 2026-09-21. JPX exact current/history delivery is a
  login/licensed service; its free public history is not a continuing current
  feed. None is presented as a current no-key direct TOPIX history feed.

Yahoo is the preferred discovery and canonical-history provider for supported
global indexes, ETFs, and `FUTURE` commodity definitions. Search de-duplication
uses Yahoo results first so exchange-specific Yahoo symbols are retained. The
deterministic search catalog keeps the four Eastmoney identifiers above, while
canonical profiles resolve them to Yahoo `GC=F`, `SI=F`, `CL=F`, and `HG=F`.
Live read-only checks on 2026-07-25 returned 1,260 five-year daily bars plus
adjusted-close arrays for all four symbols. The adapter retries the equivalent
query2 host after either a non-success response or a primary-host network/parse
exception, but regional HTTP 403 responses remain possible. A successful Yahoo
fallback series records Yahoo's resolved symbol rather than retaining the
requesting provider's identifier; legacy Eastmoney-shaped identifiers saved
under Yahoo are translated before requesting.
An extended N225 chart request on 2026-07-25 returned 6,627 daily rows from
2000-01-04 through 2026-07-24. The workspace retains at most 10,000 daily bars.
On 2026-07-27 the Yahoo-first strict-provider matrix returned valid history for
16 global indexes, 11 ETFs, and all four commodity aliases. N225 returned 6,506
bars through 2026-07-27, while SOX returned 6,679 bars through 2026-07-24. The
relay binds only to
`127.0.0.1`, accepts only reviewed Yahoo/Eastmoney HTTPS endpoint paths, and
forwards no authorization or cookie headers. It is a local transport path, not
a market-data provider, and does not change canonical-source ownership.
From 2026-09-16, allowlisted Eastmoney and Tencent hosts use a bounded direct
Node HTTP(S) request with no proxy agent, so a system VPN or environment proxy
does not capture those domestic requests. Foreign allowlisted hosts retain the
existing fetch route. Redirects remain allowlisted, TLS verification remains
enabled, requests time out after 15 seconds, and responses are capped at 16 MiB.

On 2026-08-09 a strict N225 one-minute request returned the application maximum
of 1,500 native bars from 2026-08-03 12:39 through 2026-08-07 15:30. The
provider reported zero volume for that index series, so the workspace exposes
volume as unavailable and disables dependent studies. No minute payload is
committed.

On 2026-08-14 at 09:55 Asia/Shanghai, an uncached strict N225 one-minute
request was fetched at `2026-08-14T01:55:22.936Z`; its newest bar timestamp was
`2026-08-14T01:40:25.000Z`, confirming a 15-minute publication lag. Yahoo did
not return a usable `exchangeDataDelayedBy` value for this response. During an
active venue session, the workspace therefore estimates minute-data delay from
the newest bar epoch and the series fetch time, and warns at three minutes or
more. The raw response is not committed.

For daily output, every accepted bar must have a finite positive
`adjclose / raw close` before any OHLC row is scaled. If one factor is missing,
zero, non-finite, or otherwise invalid, every accepted bar retains raw OHLC and
the whole series is marked `raw`; `corporate-action-adjusted` is used only when
every accepted daily bar has a valid factor. Yahoo intraday output remains raw. Yahoo volume is
never rescaled. For an all-adjusted series, provider previous close is scaled
by the first accepted bar factor. When a fetch limit slices normalized bars,
`previousClose` becomes the immediately preceding normalized close when one is
available. Raw and mixed fallback keep provider previous close on the raw
scale.

Yahoo commodity definitions are audited only when the regional network route
is available; Nasdaq is not used for commodity futures. The returned
continuous quote-page series does not provide a complete contract-chain or
roll-accounting model. QuantScope does not model roll schedules,
back-adjustment rules, multipliers, margin, expiry, delivery, or leverage.

## Nasdaq website historical data

- Endpoint: `https://api.nasdaq.com/api/quote/{symbol}/historical`
- Accessed: 2026-07-25
- Current parameters: `assetclass` index or ETF, `fromdate=2000-01-01` for
  extended daily history, current `todate`, and a 10,000-row daily limit.
- Raw sample: `data/raw/nasdaq_sox_daily_sample.json`
- Runtime freshness: recent-bar overlays use `no-store`; Nasdaq remains a
  daily-history fallback rather than an intraday feed.

Nasdaq is marked `raw`. It is an independent SOX and supported-index/ETF daily
audit source. A live 2026-07-27 strict
SOX request returned 6,828 bars from 2000-01-03 through 2026-07-24. The same
endpoint returned 2,514 bars for each tested SPY, QQQ, EEM, EWJ, FXI, VTI,
IWM, GLD, SLV, USO, and DBC request. It is not an intraday or commodity
futures source and may publish no volume for indexes.

Live checks on 2026-08-02 found Yahoo `^NDX` current through 2026-07-31 with
nonzero daily volume, while the Nasdaq `NDX` website history returned zero
volume. Yahoo `^SOX` and Nasdaq `SOX` also returned zero volume. QuantScope does
not invent missing volume. When a refresh updates the same trading session with
zero volume after an earlier accepted source published a positive value, the
merge preserves that same-session positive value; it never copies volume from a
different date.

Runtime volume eligibility requires at least 20 bars and positive volume on at
least 90% of them. A series that fails this check remains valid for price-only
charts and strategies, but VWAP, MFI, CMF, OBV, MFI Reversal, and VWAP
Reversion are disabled. This prevents provider-specific absent volume from
becoming a synthetic neutral or bullish signal. Price history is never combined
with volume from a different provider or date merely to pass this threshold.

## FRED close-only reference

- Endpoint: `https://fred.stlouisfed.org/graph/fredgraph.csv`
- Series: `NIKKEI225`
- Accessed: 2026-07-27
- Capability: daily close reference only.

FRED values are never expanded into synthetic OHLC bars and never become the
canonical chart. They are stored in the reference snapshot store and compared
only with canonical closes. Availability can lag or be temporarily blocked;
that failure affects health metrics only.

## Reviewed inactive Tiingo candidate and active AllTick gold adapter

Tiingo documentation was accessed on 2026-07-28:

- Overview and limits: `https://www.tiingo.com/documentation/general/overview`
- End-of-day API: `https://www.tiingo.com/documentation/end-of-day`
- Supported symbology:
  `https://www.tiingo.com/documentation/appendix/symbology`

The documented EOD product covers supported US equities, mutual funds, ETFs,
and China equities. It does not establish the global-index or commodity-futures
coverage needed for N225 or gold, so the token is stored locally but no adapter
or fallback definition is enabled. Its current Starter allowance is 50
requests/hour, 1,000 requests/day, 500 unique symbols/month, and 1 GB/month.

AllTick documentation was accessed on 2026-07-28:

- Daily K-line specification:
  `https://github.com/alltick/alltick-realtime-forex-crypto-stock-tick-finance-websocket-api/blob/main/http_interface/kline_query.md`
- Commodity symbol list:
  `https://github.com/alltick/alltick-realtime-forex-crypto-stock-tick-finance-websocket-api/blob/main/product_code_list_commodities_gold.md`
- Official repository:
  `https://github.com/alltick/alltick-realtime-forex-crypto-stock-tick-finance-websocket-api`

The documented commodity request is
`https://quote.alltick.co/quote-b-api/kline`, uses code `GOLD`, daily type `8`,
and permits at most 500 K-lines per request. QuantScope now implements this
exact request behind the shared provider boundary and maps it back to canonical
`GC=F`. It remains overlap-required because the documentation does not prove
identity with Yahoo's continuous futures construction. The initial supplied
token returned HTTP 401. Its replacement seven-day trial token returned nine
daily bars through 2026-07-28. A nine-date Yahoo comparison measured 0.164%
mean close error and 0.268% mean OHLC error, below the 2%/3% promotion gate.
The local expiry timestamp is 2026-08-04T15:04:45+08:00; after it passes,
QuantScope marks the credential expired without making a network request. A
credential 401 starts a 24-hour audit cooldown only for the current page
session, so replacing a key and reloading can validate it immediately.

## Credentialed provider allowance review

Official public allowance pages were reviewed on 2026-07-28. These numbers are
free/starter baselines and must not override a different entitlement shown by a
provider dashboard.

| Provider | Published baseline | Operational note |
| --- | --- | --- |
| EODHD | 20 calls/day and 20 requests/minute | Most endpoints cost one call; heavier endpoints can cost more |
| Twelve Data | 8 API credits/minute and 800/day | Endpoint weight times symbol count determines credit use; daily reset is 00:00 UTC |
| Alpha Vantage | 25 requests/day | Premium-only datasets and paid plans differ |
| Financial Modeling Prep | 250 calls/day | Free reset is 15:00 US Eastern; trailing-30-day bandwidth is 500 MB |
| Finnhub | Dashboard plan limit not publicly fixed | All plans also have a 30 requests/second hard ceiling |
| U.S. EIA | No fixed daily bucket published | Keep sustained requests below about 9,000/hour and bursts below 5/second; complex routes may throttle earlier |
| Marketstack | 100 requests/month | A multi-symbol request consumes one request per symbol |
| Zhitu | Free certificate: 200 requests/day | Free frequency limit is 300 requests/minute |
| Sina Finance ZYHub | No fixed public free allowance found | Current account returned insufficient balance; use the dashboard allowance |
| Tiingo | 50 requests/hour and 1,000/day | Also 500 unique symbols/month and 1 GB/month on Starter |
| AllTick | Seven-day free trial and 10 calls/minute | Current trial has an explicit local expiry |
| Juhe Data | Current stock allowance: 50 calls/day | Product-specific; five-minute data update interval |

Allowance sources:

- `https://eodhd.com/financial-apis/quick-start-with-our-financial-data-apis`
- `https://twelvedata.com/pricing`
- `https://support.twelvedata.com/en/articles/5615854-credits`
- `https://www.alphavantage.co/support/`
- `https://site.financialmodelingprep.com/pricing-plans`
- `https://www.finnhub.io/docs/api/country`
- `https://www.eia.gov/opendata/faqs.php`
- `https://marketstack.com/contact`
- `https://zhituapi.com/gettoken.html`
- `https://www.tiingo.com/about/pricing`
- `https://blog.alltick.co/how-to-obtain-a-free-alltick-api-key-for-testing/`
- `https://www.juhe.cn/docs/api/id/21`
- `https://www.juhe.cn/vip`

## Rolling source health

Each request contributes one timestamped success/failure/latency sample. The
browser retains 31 days (bounded at 2,048 samples) and calculates independent
7-day and 30-day availability. Three latest consecutive failures or at least
five 7-day samples below 80% demote the configured source. A backup needs at
least three 7-day attempts at 95%, five 30-day attempts at 90%, no current
demotion, and passing latest-date/gap/OHLC quality. A demoted configured primary
is probed hourly and can return only after seven elapsed days plus a 95%-healthy
7-day window.

## Normalized analysis semantics

`MarketSeries.priceAdjustment` is the authoritative UI metadata. The active
series supplies one normalized `MarketBar[]` to the historical chart,
indicators, strategy reference lines, newest-bar guidance, stability
diagnostic, and backtests.

`MarketSeries.latestBarStatus` records complete, in-progress, or unknown for
the newest daily bar. Yahoo regular-session end metadata takes precedence when
available; other adapters use documented exchange closes and remain
conservative for unknown or special sessions.

For ETFs, an adjusted source reduces mechanical distribution/split gaps. For
indexes, the provider symbol and methodology determine whether the source is a
price index or a total-return index; the adjustment layer does not convert
between them. Commodity history is a futures quote proxy with the limitations
above. QuantScope does not ingest constituent operating-company events or
fundamentals. None of these paths is separate cash-distribution accounting, a
cash-yield calculation, reinvestment, or multi-asset alignment.

## Reproducibility

Runtime responses are kept separate from calculations. The UI receives one
canonical `MarketSeries`; provider-isolated normalized snapshots and
fingerprints are persisted in IndexedDB. Committed raw samples preserve
provider field names and row encoding for parser tests and incident
comparison. The application does not yet archive every literal wire response
or run a raw-data retention/cleanup job.

See `DATA_PIPELINE.md` for current fetch/merge behavior and `CACHE_POLICY.md`
for HTTP caching and in-memory retention.

## Community-script research sources

TradingView community pages are read-only research inputs, never market-data
providers or executable dependencies. The 2026-08-09 review inspected the
application's Editors' picks, Top, and Trending sections plus the public
Support and Resistance Levels with Breaks description. Rankings are mutable;
the access date and scope are recorded in `data/source_registry.jsonl`.
QuantScope implemented only an independent confirmed-pivot concept and did not
copy Pine source, author parameters, alerts, or proprietary code.

- `https://www.tradingview.com/chart/`
- `https://www.tradingview.com/scripts/editors-picks/`
- `https://www.tradingview.com/script/JDFoWQbL-Support-and-Resistance-Levels-with-Breaks-LuxAlgo/`

On 2026-08-11 the user supplied twelve local Pine text files as implementation
research inputs. The files remain outside the repository. QuantScope records
their filenames and declared licenses in `lib/analysis/community/catalog.ts`
and stores only independently maintained TypeScript formulas. The batch adds
nine indicators and three long-only host-adapted strategies. Visual-only
objects, alerts, account sizing, leverage, sessions, and partial exits are not
copied into application business logic. See `COMMUNITY_IMPORTS.md` for the
repeatable intake process and compatibility rules.

On 2026-08-20 a second read-only comparison used the public open-source
TradingView pages for HalfTrend, QQE MOD, Schaff Trend Cycle, Session Volume
Profile, and Anchored VWAP. The local `strategy.txt` was no longer present, so
these author pages became the traceable formula baseline. No Pine source or
page payload is committed; the independent TypeScript ports, parameter
adaptations, and long-only mapping are recorded in the community catalog and
`TECH_RESEARCH.md`.

- `https://www.tradingview.com/script/U1SJ8ubc-HalfTrend/`
- `https://www.tradingview.com/script/TpUW4muw-QQE-MOD/`
- `https://www.tradingview.com/script/dbxXeuw2-Indicator-Schaff-Trend-Cycle-STC/`
- `https://www.tradingview.com/script/uDRS8vr5-Session-Volume-Profile-Open-Source-CantoLab/`
- `https://www.tradingview.com/script/L1tWQjgR-Anchored-VWAP/`
