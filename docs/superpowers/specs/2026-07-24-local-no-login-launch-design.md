# Local No-Login Launch Design

Date: 2026-07-24

## Goal

Make QuantScope a one-click local Windows application:

- Double-clicking `open-quantscope.bat` starts the application on
  `http://127.0.0.1:3000`.
- The launcher never opens the hosted `chatgpt.site` deployment.
- Local use never requires a ChatGPT or other user account.
- Saved backtests remain available after the local server restarts.
- Existing market data, charting, indicators, strategies, backtesting,
  screening, and Chinese UI behavior remain unchanged.

## Current State and Root Cause

The application page does not require authentication. The saved-backtest API
already maps localhost requests without injected ChatGPT headers to the fixed
local owner `local@quantscope.invalid`.

The login experience is caused by `open-quantscope.bat`, which currently opens
the hosted `chatgpt.site` deployment directly. The local vinext development
server and local Cloudflare D1 emulation already exist, but the launcher does
not start or use them and does not ensure the D1 migration has been applied.

## Considered Approaches

### A. One-click local development server with local D1

The launcher initializes the local D1 database, starts `vinext dev` on the
loopback interface, waits for readiness, and opens the browser.

Benefits:

- Smallest application change.
- Source changes are picked up without a manual production rebuild.
- Existing API routes and D1 persistence remain intact.
- The server is not exposed beyond the local computer.

Costs:

- A local server console remains open while QuantScope is running.
- This uses development-mode runtime behavior.

### B. One-click local production build and server

The launcher builds the application before starting `vinext start`.

Benefits:

- Runtime behavior is closer to the deployed build.

Costs:

- First launch and launches after source changes are slower.
- Reliable build freshness detection adds launcher complexity.
- It offers no material product benefit for the requested personal local use.

### C. Browser localStorage persistence

Saved backtests move from the API and D1 to browser localStorage.

Benefits:

- Removes the local database migration step.

Costs:

- Replaces the existing saved-record architecture.
- Data becomes tied to one browser profile and origin.
- Market APIs still require a local server, so it does not remove the backend.

## Decision

Use Approach A. It meets the one-click and no-login requirements while
preserving the existing application and saved-record architecture.

## Architecture

```text
open-quantscope.bat
  -> scripts/start-local.ps1
      -> validate Node.js and npm
      -> install locked dependencies when node_modules is absent
      -> apply pending Drizzle migrations to local D1 state
      -> reuse an already-running QuantScope localhost server, or
      -> start vinext dev on 127.0.0.1:3000
      -> wait for a QuantScope HTML response
      -> open a new maximized Edge window, or the default browser

Browser
  -> http://127.0.0.1:3000
  -> existing API routes
  -> existing localhost owner fallback
  -> local D1 data under .wrangler/state
  -> public market-data providers
```

The HTTP server binds to `127.0.0.1`, not all network interfaces. The launcher
contains no hosted application URL and requires no credential.

## Components and Planned Changes

### Windows entry point

`open-quantscope.bat` becomes a small wrapper that resolves the project
directory and invokes `scripts/start-local.ps1`. It must not contain or open a
`chatgpt.site` URL.

### Local startup orchestration

`scripts/start-local.ps1` will:

1. Resolve the project root from its own location.
2. Verify that Node.js and npm are available and that Node.js is version
   22.13.0 or newer, matching `package.json`.
3. Run `npm ci` only when `node_modules` is absent.
4. Apply pending migrations with Wrangler in non-interactive local mode,
   persisting them in `.wrangler/state`.
5. Check `http://127.0.0.1:3000`.
6. Reuse the server only when the response identifies QuantScope.
7. Report a clear port-conflict error when another application owns port 3000.
8. Otherwise start `npm run dev -- -p 3000 -H 127.0.0.1` in a visible,
   user-controllable server window.
9. Wait up to 60 seconds for a successful QuantScope response.
10. Open the local URL in a new maximized Edge window when Edge is available,
    with the default browser as fallback.

Closing the server window stops the local application. Re-running the launcher
while QuantScope is already available reopens the browser without starting a
second server.

### Local D1 configuration

Add a local-only Wrangler configuration that uses the same `DB` binding,
`00000000-0000-4000-8000-000000000000` local database identifier, and
`drizzle/` migration directory as the existing Vite development environment.
The launcher migration command and vinext server must point to the same
`.wrangler/state` persistence root.

The saved-backtest API and schema remain unchanged. Local requests continue to
use `local@quantscope.invalid`, so all local records belong to one local
workspace without requiring login headers.

### Package commands

Add narrowly scoped package scripts for the local D1 migration and loopback
development server so the launcher uses documented project commands instead
of duplicating long CLI expressions.

### Documentation

Update:

- `README.md` with one-click and manual local startup instructions.
- `docs/DEBUGGING.md` with Node.js, port, startup timeout, migration, and local
  saved-record recovery guidance.
- `docs/CODEX_STATE.md` with the local no-login launch status.
- `docs/FEATURE_MAP.md` with launcher, persistence, tests, and documentation
  linkage.
- `docs/ARCHITECTURE.md` and `docs/DECISIONS.md` to describe the local owner
  and local D1 path alongside the existing hosted identity model.

`docs/MODULE_PATTERNS.md` does not need a shared-pattern change because the
saved-record API pattern remains intact. `docs/TECH_RESEARCH.md` and
`docs/DATA_SOURCES.md` do not change because no framework or data provider is
being selected or added.

## Error Handling

The launcher will stop before opening a browser and display an actionable
message when:

- Node.js or npm is missing.
- The installed Node.js version is below the package requirement.
- Dependency installation fails.
- A local D1 migration fails.
- Port 3000 is occupied by a non-QuantScope process.
- The vinext process exits or QuantScope does not become ready within
  60 seconds.

No error path will fall back to the hosted site. Startup output must not expose
credentials, and no credentials are required by the default data providers.

## Testing Strategy

Implementation will follow test-driven development:

1. Add a failing launcher contract test before changing the launcher.
2. Assert that the Windows entry point contains no hosted URL and delegates to
   the local startup script.
3. Assert that local commands bind to `127.0.0.1:3000`.
4. Assert that local D1 configuration uses the `DB` binding and `drizzle/`
   migrations, and that the migration command uses project-local persistence.
5. Assert that the startup path retains the existing localhost owner behavior.
6. Implement the minimum launcher and configuration required to pass.
7. Run `npm test` and `npm run lint`.
8. Run a clean-state local D1 migration check in a temporary persistence
   directory.
9. Launch the real local application, confirm an HTTP 200 QuantScope page,
   save and reload a backtest, and confirm no login or hosted URL appears.

## Change Boundaries

Planned implementation files:

- `open-quantscope.bat`
- `scripts/start-local.ps1`
- a local Wrangler configuration file
- `package.json`
- launcher-focused tests
- the documentation files listed above

Explicitly out of scope:

- Market provider behavior
- Chart or UI redesign
- Indicator, strategy, backtest, or screening behavior
- Saved-backtest payload or database schema changes
- Hosted deployment removal
- Creation of the currently missing `docs/DATA_PIPELINE.md` and
  `docs/CACHE_POLICY.md`

## Risks and Mitigations

Risk level: low.

- Port 3000 may be occupied. The launcher verifies server identity and reports
  a conflict instead of silently using another port.
- A first-time dependency installation requires network access. The launcher
  skips installation when dependencies already exist and reports installation
  failures.
- Local state can be lost if `.wrangler/state` is deleted. Documentation will
  identify it as the saved-backtest storage location.
- Public market-data endpoints still require internet access even though the
  application and saved records run locally.
