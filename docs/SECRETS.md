# Secrets

The Eastmoney, Yahoo, and Nasdaq website adapters require no private
credential. Eastmoney's search token is a public website request parameter and
is not an account secret.

Local development keeps every supplied provider credential in the single
Git-ignored `.env.local` file. Hosted deployments must use the runtime secret
store. `.env.example` contains placeholder names only.

The currently recognized local variable names are:

- `EODHD_API_TOKEN`
- `TWELVE_DATA_API_KEY`
- `ALPHA_VANTAGE_API_KEY`
- `FMP_API_KEY`
- `FINNHUB_API_TOKEN`
- `EIA_API_KEY`
- `MARKETSTACK_API_KEY`
- `ZHITU_API_KEY`
- `ZYHUB_API_KEY`
- `TIINGO_API_TOKEN`
- `ALLTICK_API_TOKEN`
- `ALLTICK_TRIAL_API_TOKEN`
- `ALLTICK_API_TOKEN_EXPIRES_AT`
- `JUHE_API_KEY`
- `JUHE_API_DAILY_LIMIT`
- `JUHE_API_USAGE_DATE`
- `JUHE_API_USAGE_OFFSET`

Only providers with implemented adapters consume a value. FMP and AllTick now
consume their server-only values for the overlap-gated gold backup chain.
Juhe consumes its server-only value only as the final SSE/SZSE current-quote
fallback after the no-key Tencent quote has failed.
A configured but unintegrated candidate remains inert; storing a key does not
add it to the fallback chain.

## Documented allowance register

The table records the provider's currently published free or starter baseline,
not a guarantee of the entitlement attached to a particular key. The provider
dashboard remains authoritative for paid, promotional, grandfathered, and
account-specific plans. `Verified` means the allowance was checked against an
official provider page on 2026-07-28; it does not mean QuantScope spent a call
to probe the quota.

| Provider | Documented baseline | Reset or throttle | QuantScope status |
| --- | --- | --- | --- |
| EODHD | Free: 20 calls/day | Free: 20 requests/minute | Integrated recovery/search; use only after earlier sources fail |
| Twelve Data | Basic: 8 API credits/minute and 800/day | Minute credits reset each minute; daily credits reset 00:00 UTC | Integrated recovery; endpoint weights can exceed one credit |
| Alpha Vantage | Free: 25 requests/day | Daily; premium plans differ | Integrated overlap-gated recovery |
| Financial Modeling Prep | Basic: 250 calls/day | Resets at 15:00 US Eastern; 500 MB trailing-30-day bandwidth | Integrated recovery and first credentialed gold backup |
| Finnhub | Account plan not publicly fixed | Public hard ceiling: 30 requests/second; dashboard plan limit also applies | Key stored; symbol lookup only, candle entitlement failed |
| U.S. EIA | No published daily call bucket | Recommended sustained rate below about 9,000/hour and burst below 5/second; route limits may be lower | Key stored; reference statistics only, not OHLC |
| Marketstack | Free: 100 requests/month | One requested symbol consumes one request | Integrated only for exchange-verified ETFs |
| Zhitu | Free certificate: 200 requests/day | 300 requests/minute | Integrated for SSE/SZSE indexes only |
| Sina Finance ZYHub | No fixed public free allowance found | Balance/product allowance shown by the account service | Key stored; inactive because the live entitlement returned insufficient balance |
| Tiingo | Starter: 50 requests/hour and 1,000/day | 500 unique symbols/month; 1 GB/month | Key stored; candidate not in the fallback registry |
| AllTick | Free trial: 10 API calls/minute | Seven-day trial; explicit local expiry is checked before network access | Integrated overlap-gated gold backup |
| Juhe Data | Current stock product: 50 calls/day | Product page updates every five minutes; provider errors report IP/request/test-key limits | Integrated final quote-only SSE/SZSE fallback with a local daily gate |

Primary allowance references are kept in `docs/DATA_SOURCES.md` and
`docs/TECH_RESEARCH.md`. Public website adapters such as Yahoo, Eastmoney,
Nasdaq, and Tencent do not publish account quotas and must still follow the
session-aware refresh, cooldown, and backoff policy.

When an implemented provider is actually called, QuantScope records only a
safe status code. HTTP 401 and explicit invalid/expired-key responses are
marked as credential issues. HTTP 403 access/entitlement denial and HTTP 429
quota limitation are separate states and are not mislabeled as expiration.
This is an on-use runtime check, not a background key probe, so unused keys do
not consume quota.

The 2026-07-28 read-only validation found the configured FMP key usable for
`GCUSD`. The initial AllTick token returned HTTP 401. Its replacement trial
token returned valid `GOLD` bars and is locally marked to expire at
2026-08-04T15:04:45+08:00. QuantScope checks that timestamp before requesting
AllTick and emits the existing credential-invalid/expired status after it.
The configured Juhe stock key returned a valid current `513310` quote. Its
50-call daily gate starts from the optional same-day usage offset and increments
only in the current server process; the provider remains authoritative after a
restart. The real values remain only in `.env.local` and are not reproduced
here.

All licensed provider keys must:

- Be stored in local `.env.local` or the hosted runtime secret store.
- Be represented by placeholder names only in `.env.example`.
- Never be returned to the browser, logged, committed, or included in samples.
- Be rotated immediately if committed.
