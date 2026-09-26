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

## Screening-engine protocol linkage

- Treat the local screening-engine protocol as one linked feature boundary.
  Its version has one source of truth in
  `config/screening-engine-protocol.json`; do not introduce numeric protocol
  literals in clients, coordinators, launchers, maintenance scripts, or tests.
- A protocol or endpoint change must inspect and update together, when
  affected: `lib/analysis/screening-local-engine-{protocol,client}.ts`,
  `scripts/screening-engine-{coordinator.mjs,child.ts}`,
  `scripts/market-relay.mjs`, `scripts/start-local.ps1`, cycle-validation
  orchestration and localized errors, maintenance scripts, and their launcher,
  coordinator, client, and route tests.
- Protocol incompatibility must terminate polling with an actionable error.
  It must never leave a UI marked as running without an active child process.
- Before handing off a protocol change, verify the application and relay health
  contracts, stale-relay replacement, incompatible-client failure, queue/result
  recovery, and full `npm test`.
