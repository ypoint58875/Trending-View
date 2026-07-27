# QuantScope Project Rules

## Default autonomous execution

- Proceed autonomously by default once the requested outcome and scope are clear.
- Do not pause for step-by-step confirmation during routine, reversible, in-scope work. Share concise progress updates and continue.
- Stop for confirmation only before high-risk actions, including destructive or difficult-to-reverse changes, secret exposure, external publishing or communication, security or privilege changes, or material scope ambiguity.
- Planning, research, and verification requirements remain mandatory, but they are not approval gates unless a high-risk action is involved.

- Keep source code, tests, logs, and internal documentation in English.
- Keep Chinese user-facing copy in `app/i18n/zh-CN.ts`.
- Add market providers behind `lib/market/` adapters and normalize output to
  `MarketSeries`.
- Add indicators and strategies through the registries in `lib/analysis/`.
- Close-derived target signals are evaluated at bar close and execute no
  earlier than the next bar open. Price-order strategies may place stop orders
  from completed-bar data for execution inside the following bar.
- Never hard-code credentials. The default Eastmoney website adapter requires
  no private credential.
- Run `npm test` before handing off a feature change.
- Update `docs/CODEX_STATE.md` and `docs/FEATURE_MAP.md` when feature status or
  linkage changes.
