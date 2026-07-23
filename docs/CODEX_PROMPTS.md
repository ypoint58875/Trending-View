# Codex Prompts

Use these context-restoration prompts in later tasks.

## Add an indicator

> Read AGENTS.md, CODEX_STATE.md, ARCHITECTURE.md, FEATURE_MAP.md, and
> MODULE_PATTERNS.md. Add the indicator as a pure function, register its UI
> metadata through the locale file, add deterministic tests, and preserve
> aligned null warm-up values.

## Add a data provider

> Read DATA_SOURCES.md and SECRETS.md. Implement a provider adapter that returns
> MarketSeries, add retry and validation behavior, document endpoint and access
> terms, add a raw sample, and do not expose credentials to the client.

## Change backtesting

> Read FUNCTIONS.md and DECISIONS.md. Preserve next-bar execution unless the
> task explicitly changes the fill model. Update metrics, tests, UI disclosure,
> and FEATURE_MAP.md together.

