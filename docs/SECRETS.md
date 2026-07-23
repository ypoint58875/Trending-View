# Secrets

The current Eastmoney adapter requires no private credential. Its search token
is a public website request parameter and is not an account secret.

Future licensed provider keys must:

- Be stored in local `.env.local` or the hosted runtime secret store.
- Be represented by placeholder names only in `.env.example`.
- Never be returned to the browser, logged, committed, or included in samples.
- Be rotated immediately if committed.

