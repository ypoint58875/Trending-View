# Secrets

The Eastmoney, Yahoo, and Nasdaq website adapters require no private
credential. Eastmoney's search token is a public website request parameter and
is not an account secret.

The optional EODHD adapter reads `EODHD_API_TOKEN` only from the server runtime.
Local development may place it in `.env.local`; hosted deployments must use the
runtime secret store. Leaving it unset safely disables EODHD without changing
the public fallback chain. `.env.example` contains an empty placeholder only.

All licensed provider keys must:

- Be stored in local `.env.local` or the hosted runtime secret store.
- Be represented by placeholder names only in `.env.example`.
- Never be returned to the browser, logged, committed, or included in samples.
- Be rotated immediately if committed.
