# QuantScope Project Rules

- Keep source code, tests, logs, and internal documentation in English.
- Keep Chinese user-facing copy in `app/i18n/zh-CN.ts`.
- Add market providers behind `lib/market/` adapters and normalize output to
  `MarketSeries`.
- Add indicators and strategies through the registries in `lib/analysis/`.
- Strategy signals are evaluated at bar close and executed no earlier than the
  next bar open.
- Never hard-code credentials. The default Eastmoney website adapter requires
  no private credential.
- Run `npm test` before handing off a feature change.
- Update `docs/CODEX_STATE.md` and `docs/FEATURE_MAP.md` when feature status or
  linkage changes.

