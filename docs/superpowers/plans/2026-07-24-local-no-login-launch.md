# Local No-Login Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hosted Windows shortcut with a one-click loopback-only QuantScope launcher that requires no login and keeps saved backtests in local D1 storage.

**Architecture:** Keep the existing vinext application, API routes, D1 schema, and localhost owner fallback unchanged. A small batch entry point delegates to a PowerShell orchestrator, which validates prerequisites, applies local migrations, starts or reuses the loopback vinext server, waits for a verified QuantScope response, and opens the local URL.

**Tech Stack:** Windows batch, PowerShell 5.1+, Node.js 22.13.0+, npm, vinext 0.0.50, Wrangler 4.92.0, Cloudflare local D1, TypeScript Node test runner.

## Global Constraints

- Bind the application to `127.0.0.1:3000`; do not expose it on other network interfaces.
- Never open or fall back to a `chatgpt.site` URL.
- Require Node.js 22.13.0 or newer, matching `package.json`.
- Keep local D1 data under `.wrangler/state` and migrations under `drizzle/`.
- Continue using the existing `local@quantscope.invalid` localhost owner; do not change the saved-backtest schema or payload.
- Keep source code, scripts, tests, logs, and internal documentation in English and ASCII where practical.
- Do not change market data, charts, indicators, strategies, backtesting, screening, or Chinese UI behavior.
- Run `npm test` and `npm run lint` before handoff.
- Update `docs/CODEX_STATE.md` and `docs/FEATURE_MAP.md`.

---

## File Structure

- Create `scripts/start-local.ps1`: own local startup validation, migration,
  process lifecycle, readiness checking, and browser opening.
- Create `wrangler.local.jsonc`: own the local-only D1 binding and migration
  directory used by Wrangler commands.
- Create `tests/local-launcher.test.ts`: own static launcher, command,
  persistence, and localhost-owner contracts.
- Modify `open-quantscope.bat`: remain a minimal Windows double-click entry
  point that delegates to PowerShell.
- Modify `package.json`: expose stable `local:dev` and `local:db:migrate`
  commands consumed by the launcher.
- Modify `README.md`: document one-click and manual local operation.
- Modify `docs/DEBUGGING.md`: document local startup failure recovery.
- Modify `docs/ARCHITECTURE.md`: document the local runtime and persistence
  data flow.
- Modify `docs/DECISIONS.md`: extend the saved-record decision with the local
  identity and storage model.
- Modify `docs/FEATURE_MAP.md`: link the local launcher feature to its
  implementation, test, and documentation.
- Modify `docs/CODEX_STATE.md`: record implementation and fresh verification
  results after verification succeeds.

### Task 1: Build the tested local launcher

**Files:**

- Create: `tests/local-launcher.test.ts`
- Create: `scripts/start-local.ps1`
- Create: `wrangler.local.jsonc`
- Modify: `open-quantscope.bat`
- Modify: `package.json`

**Interfaces:**

- Consumes: `npm ci`, the existing `drizzle/` migrations, the existing
  `app/api/saved-backtests/route.ts` localhost owner fallback, and
  `http://127.0.0.1:3000`.
- Produces: package scripts `local:dev` and `local:db:migrate`; a batch entry
  point; a PowerShell launcher with no parameters and process exit code `0` on
  success or `1` on failure; local Wrangler binding `DB`.

- [ ] **Step 1: Write the failing launcher contract tests**

Create `tests/local-launcher.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

function readProjectFile(relativePath: string): string {
  try {
    return readFileSync(new URL(relativePath, projectRoot), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

test("Windows launcher delegates only to the local PowerShell launcher", () => {
  const launcher = readProjectFile("open-quantscope.bat");

  assert.doesNotMatch(launcher, /chatgpt\.site/i);
  assert.match(launcher, /scripts\\start-local\.ps1/i);
  assert.match(launcher, /powershell\.exe/i);
});

test("local package commands pin loopback and persistent D1 state", () => {
  const packageJson = JSON.parse(readProjectFile("package.json")) as {
    scripts: Record<string, string>;
  };
  const wranglerSource = readProjectFile("wrangler.local.jsonc");

  assert.equal(
    packageJson.scripts["local:dev"],
    "vinext dev -p 3000 -H 127.0.0.1",
  );
  assert.equal(
    packageJson.scripts["local:db:migrate"],
    "wrangler d1 migrations apply DB --local --config wrangler.local.jsonc --persist-to .wrangler/state",
  );
  assert.notEqual(wranglerSource, "");

  const wrangler = JSON.parse(wranglerSource) as {
    d1_databases: Array<{
      binding: string;
      database_id: string;
      migrations_dir: string;
    }>;
  };
  assert.deepEqual(wrangler.d1_databases, [
    {
      binding: "DB",
      database_name: "site-creator-d1",
      database_id: "00000000-0000-4000-8000-000000000000",
      migrations_dir: "drizzle",
    },
  ]);
});

test("PowerShell launcher validates, migrates, verifies, and opens localhost", () => {
  const launcher = readProjectFile("scripts/start-local.ps1");

  assert.notEqual(launcher, "");
  assert.match(launcher, /\[version\]"22\.13\.0"/);
  assert.match(launcher, /npm\.cmd ci/);
  assert.match(launcher, /npm\.cmd run local:db:migrate/);
  assert.match(launcher, /http:\/\/127\.0\.0\.1:3000/);
  assert.match(launcher, /GetActiveTcpListeners/);
  assert.match(launcher, /npm\.cmd run local:dev/);
  assert.match(launcher, /AddSeconds\(60\)/);
  assert.match(launcher, /QuantScope/);
  assert.doesNotMatch(launcher, /chatgpt\.site/i);
});

test("saved-backtest route retains the localhost owner fallback", () => {
  const route = readProjectFile("app/api/saved-backtests/route.ts");

  assert.match(route, /hostname === "localhost"/);
  assert.match(route, /hostname === "127\.0\.0\.1"/);
  assert.match(route, /"local@quantscope\.invalid"/);
});
```

- [ ] **Step 2: Run the launcher test and verify RED**

Run:

```powershell
npx tsx --test tests/local-launcher.test.ts
```

Expected: FAIL. The first test reports that `open-quantscope.bat` still
contains `chatgpt.site`; later tests report missing local scripts and launcher
files. The localhost-owner characterization test passes.

- [ ] **Step 3: Add stable local package commands**

Add these entries under `scripts` in `package.json` without changing existing
commands:

```json
"local:dev": "vinext dev -p 3000 -H 127.0.0.1",
"local:db:migrate": "wrangler d1 migrations apply DB --local --config wrangler.local.jsonc --persist-to .wrangler/state"
```

- [ ] **Step 4: Add the local Wrangler D1 configuration**

Create `wrangler.local.jsonc`:

```json
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "quantscope-local",
  "main": "worker/index.ts",
  "compatibility_date": "2026-07-24",
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "site-creator-d1",
      "database_id": "00000000-0000-4000-8000-000000000000",
      "migrations_dir": "drizzle"
    }
  ]
}
```

- [ ] **Step 5: Replace the hosted batch shortcut**

Replace `open-quantscope.bat` with:

```bat
@echo off
setlocal
set "PROJECT_DIR=%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%scripts\start-local.ps1"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  pause
)

endlocal & exit /b %EXIT_CODE%
```

- [ ] **Step 6: Implement the PowerShell startup orchestrator**

Create `scripts/start-local.ps1`:

```powershell
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$localUrl = "http://127.0.0.1:3000"
$minimumNodeVersion = [version]"22.13.0"

function Stop-WithError {
  param([Parameter(Mandatory = $true)][string]$Message)

  Write-Host ""
  Write-Host "QuantScope could not start: $Message" -ForegroundColor Red
  exit 1
}

function Test-QuantScopeReady {
  try {
    $response = Invoke-WebRequest `
      -UseBasicParsing `
      -Uri $localUrl `
      -TimeoutSec 2
    return $response.StatusCode -eq 200 -and
      $response.Content -match "<title>QuantScope"
  } catch {
    return $false
  }
}

function Test-LocalPortInUse {
  $listeners = [System.Net.NetworkInformation.IPGlobalProperties]::`
    GetIPGlobalProperties().GetActiveTcpListeners()
  return [bool]($listeners | Where-Object { $_.Port -eq 3000 })
}

function Open-QuantScope {
  $edgeCandidates = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
  )

  foreach ($edgePath in $edgeCandidates) {
    if ($edgePath -and (Test-Path -LiteralPath $edgePath)) {
      Start-Process `
        -FilePath $edgePath `
        -ArgumentList @("--new-window", "--start-maximized", $localUrl)
      return
    }
  }

  Start-Process -FilePath $localUrl
}

Set-Location -LiteralPath $projectRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Stop-WithError "Node.js 22.13.0 or newer is not installed or is not on PATH."
}
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  Stop-WithError "npm is not installed or is not on PATH."
}

try {
  $nodeVersion = [version]((& node -p "process.versions.node").Trim())
} catch {
  Stop-WithError "The installed Node.js version could not be read."
}
if ($nodeVersion -lt $minimumNodeVersion) {
  Stop-WithError (
    "Node.js $nodeVersion is installed; version 22.13.0 or newer is required."
  )
}

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "node_modules"))) {
  Write-Host "Installing locked npm dependencies..."
  & npm.cmd ci
  if ($LASTEXITCODE -ne 0) {
    Stop-WithError "npm ci failed."
  }
}

Write-Host "Applying local database migrations..."
$previousCi = $env:CI
try {
  $env:CI = "1"
  & npm.cmd run local:db:migrate
  if ($LASTEXITCODE -ne 0) {
    Stop-WithError "The local D1 migration failed."
  }
} finally {
  $env:CI = $previousCi
}

if (Test-QuantScopeReady) {
  Write-Host "QuantScope is already running at $localUrl."
  Open-QuantScope
  exit 0
}

if (Test-LocalPortInUse) {
  Stop-WithError (
    "Port 3000 is already used by another application. Stop that application and try again."
  )
}

$escapedProjectRoot = $projectRoot.Replace("'", "''")
$serverCommand = @"
Set-Location -LiteralPath '$escapedProjectRoot'
`$Host.UI.RawUI.WindowTitle = 'QuantScope Local Server'
npm.cmd run local:dev
"@
$encodedCommand = [Convert]::ToBase64String(
  [Text.Encoding]::Unicode.GetBytes($serverCommand)
)

Write-Host "Starting the local QuantScope server..."
$serverProcess = Start-Process `
  -FilePath "powershell.exe" `
  -ArgumentList @(
    "-NoExit",
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-EncodedCommand",
    $encodedCommand
  ) `
  -WindowStyle Normal `
  -PassThru

$deadline = [DateTime]::UtcNow.AddSeconds(60)
while ([DateTime]::UtcNow -lt $deadline) {
  if (Test-QuantScopeReady) {
    Write-Host "QuantScope is ready at $localUrl."
    Open-QuantScope
    exit 0
  }
  if ($serverProcess.HasExited) {
    Stop-WithError "The local server exited before it became ready."
  }
  Start-Sleep -Milliseconds 500
}

Stop-WithError (
  "The local server did not become ready within 60 seconds. Check the QuantScope Local Server window."
)
```

- [ ] **Step 7: Validate PowerShell syntax**

Run:

```powershell
$tokens = $null
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile(
  (Resolve-Path "scripts/start-local.ps1"),
  [ref]$tokens,
  [ref]$errors
) > $null
$errors
if ($errors.Count -gt 0) { exit 1 }
```

Expected: no parser errors and exit code `0`.

- [ ] **Step 8: Run the launcher test and verify GREEN**

Run:

```powershell
npx tsx --test tests/local-launcher.test.ts
```

Expected: four passing tests and zero failures.

- [ ] **Step 9: Review and commit the launcher**

Run:

```powershell
git diff --check
git diff -- open-quantscope.bat scripts/start-local.ps1 wrangler.local.jsonc package.json tests/local-launcher.test.ts
git add open-quantscope.bat scripts/start-local.ps1 wrangler.local.jsonc package.json tests/local-launcher.test.ts
git commit -m "Add local no-login launcher"
```

Expected: one commit containing only the five planned launcher files.

### Task 2: Verify the real local workflow and document it

**Files:**

- Modify: `README.md`
- Modify: `docs/DEBUGGING.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DECISIONS.md`
- Modify: `docs/FEATURE_MAP.md`
- Modify: `docs/CODEX_STATE.md`

**Interfaces:**

- Consumes: `open-quantscope.bat`, `scripts/start-local.ps1`,
  `local:db:migrate`, `local:dev`, `/api/saved-backtests`.
- Produces: documented one-click workflow, recovery guidance, architecture
  record, feature linkage, and dated verification state.

- [ ] **Step 1: Verify a clean local migration in temporary state**

Run:

```powershell
$migrationTestRoot = Join-Path `
  ([System.IO.Path]::GetTempPath()) `
  ("quantscope-d1-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $migrationTestRoot | Out-Null
$previousCi = $env:CI
try {
  $env:CI = "1"
  npx wrangler d1 migrations apply DB `
    --local `
    --config wrangler.local.jsonc `
    --persist-to $migrationTestRoot
  if ($LASTEXITCODE -ne 0) { exit 1 }
  npx wrangler d1 execute DB `
    --local `
    --config wrangler.local.jsonc `
    --persist-to $migrationTestRoot `
    --command "SELECT name FROM sqlite_master WHERE type='table' AND name='saved_backtests';"
  if ($LASTEXITCODE -ne 0) { exit 1 }
} finally {
  $env:CI = $previousCi
}
```

Expected: migration `0000_swift_mandroid.sql` applies successfully and the
query returns `saved_backtests`.

After inspecting the output, remove only the uniquely created temporary
directory:

```powershell
$resolvedMigrationTestRoot = (
  Resolve-Path -LiteralPath $migrationTestRoot
).Path
$resolvedSystemTemp = (
  Resolve-Path -LiteralPath ([System.IO.Path]::GetTempPath())
).Path
if (
  -not $resolvedMigrationTestRoot.StartsWith(
    $resolvedSystemTemp,
    [System.StringComparison]::OrdinalIgnoreCase
  ) -or
  -not (
    Split-Path -Leaf $resolvedMigrationTestRoot
  ).StartsWith("quantscope-d1-")
) {
  throw "Refusing to remove an unexpected migration test path."
}
Remove-Item -Recurse -Force -LiteralPath $resolvedMigrationTestRoot
```

- [ ] **Step 2: Launch the actual local application**

Run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/start-local.ps1
```

Expected: pending migrations apply, a visible `QuantScope Local Server`
window starts, the launcher reports `QuantScope is ready at
http://127.0.0.1:3000`, and Edge or the default browser opens that local URL.
No login page or hosted URL appears.

Run the same command a second time while the server remains available:

```powershell
$secondLaunchOutput = powershell.exe `
  -NoProfile `
  -ExecutionPolicy Bypass `
  -File scripts/start-local.ps1 |
  Out-String
if ($secondLaunchOutput -notmatch "already running") {
  throw "The launcher did not reuse the running QuantScope server."
}
```

Expected: the launcher reports that QuantScope is already running, opens the
local URL again, and does not start another server.

- [ ] **Step 3: Verify HTTP readiness and a local saved-record round trip**

Run:

```powershell
$page = Invoke-WebRequest `
  -UseBasicParsing `
  -Uri "http://127.0.0.1:3000" `
  -TimeoutSec 10
if (
  $page.StatusCode -ne 200 -or
  $page.Content -notmatch "<title>QuantScope"
) {
  throw "The local QuantScope page did not pass readiness verification."
}

$verificationPayload = @{
  instrument = @{
    secid = "LOCAL.LAUNCHER.VERIFICATION"
    code = "LOCALVERIFY"
    name = "Local launcher verification"
    exchange = "OTHER"
    assetType = "etf"
    provider = "eastmoney"
  }
  interval = "1d"
  strategyId = "sma-cross"
  parameters = @{
    fast = 5
    slow = 20
  }
  startDate = "2025-01-01"
  endDate = "2026-01-01"
  initialCash = 100000
  commissionPercent = 0.03
  slippagePercent = 0.02
  metrics = @{
    totalReturn = 0
    maxDrawdown = 0
    sharpe = 0
    tradeCount = 0
    score = 0
  }
} | ConvertTo-Json -Depth 6

$created = Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:3000/api/saved-backtests" `
  -ContentType "application/json" `
  -Body $verificationPayload
$verificationId = [int]$created.savedBacktest.id
if ($verificationId -lt 1) {
  throw "The verification saved backtest was not created."
}

$listed = Invoke-RestMethod `
  -Method Get `
  -Uri "http://127.0.0.1:3000/api/saved-backtests"
if (
  -not (
    $listed.savedBacktests |
      Where-Object { $_.id -eq $verificationId }
  )
) {
  throw "The verification saved backtest was not returned."
}

$deleted = Invoke-RestMethod `
  -Method Delete `
  -Uri "http://127.0.0.1:3000/api/saved-backtests?id=$verificationId"
if (-not $deleted.deleted) {
  throw "The verification saved backtest was not removed."
}
```

Expected: the page is HTTP 200, POST creates a local record, GET returns it,
and DELETE removes only the unique verification record.

- [ ] **Step 4: Update README local startup instructions**

Replace the current `## Run locally` section in `README.md` with:

````markdown
## Run locally

Requirements: Windows and Node.js 22.13 or newer.

For one-click local use, double-click `open-quantscope.bat`. The launcher:

- runs QuantScope only at `http://127.0.0.1:3000`;
- initializes the project-local saved-backtest database;
- opens a new maximized Edge window when Edge is available; and
- never requires a ChatGPT or other account.

Keep the `QuantScope Local Server` window open while using the application.
Closing that window stops the local server. Saved backtests remain under
`.wrangler/state` after the server stops.

For manual development:

```bash
npm install
npm run local:db:migrate
npm run local:dev
```

Open `http://127.0.0.1:3000`.
````

- [ ] **Step 5: Add local startup recovery guidance**

Insert this section in `docs/DEBUGGING.md` before the existing market-route
troubleshooting section:

```markdown
## Local launcher does not open QuantScope

1. Confirm `node --version` reports 22.13.0 or newer and `npm --version`
   succeeds.
2. Confirm port 3000 is free. The launcher refuses to open a different
   application that already owns the port.
3. Read the visible `QuantScope Local Server` window for vinext errors.
4. Run `npm run local:db:migrate` if the saved-backtest API reports
   `PERSISTENCE_UNAVAILABLE`.
5. Keep `.wrangler/state` to retain local saved backtests. Removing that
   directory resets local persistence.
6. Run `npm ci` if `node_modules` is missing or dependencies are damaged.

The launcher never falls back to the hosted site. The local UI and saved
records do not require login, but live market-data providers still require
internet access.
```

Replace the existing `## Saved shortcut bar cannot load` section with:

```markdown
## Saved shortcut bar cannot load

1. For local use, confirm `.wrangler/state` exists and run
   `npm run local:db:migrate`.
2. For hosted use, confirm `.openai/hosting.json` declares the `DB` D1 binding.
3. Confirm `drizzle/` contains the `saved_backtests` migration.
4. For hosted use, confirm the request includes the injected user identity
   headers.
5. Inspect `/api/saved-backtests` for `AUTH_REQUIRED`, `INVALID_PAYLOAD`, or
   `PERSISTENCE_UNAVAILABLE`.
6. Do not fall back to browser storage for failed durable writes.
```

- [ ] **Step 6: Document local architecture and ownership**

In the runtime diagram in `docs/ARCHITECTURE.md`, add this path before
`Browser UI`:

```text
Windows one-click local runtime
  -> open-quantscope.bat
  -> scripts/start-local.ps1
  -> 127.0.0.1:3000
  -> local D1 under .wrangler/state
```

Replace the saved-backtest ownership paragraph with:

```markdown
Saved backtests use one owner key in every query. Hosted requests use the
authenticated ChatGPT email header. Requests to `localhost` or `127.0.0.1`
without that header use the fixed local owner `local@quantscope.invalid` and
the project-local D1 state under `.wrangler/state`. One snapshot is retained
per owner, provider, and instrument identifier; saving the same instrument
updates its current snapshot instead of creating duplicates.
```

Append this paragraph to decision `D-008` in `docs/DECISIONS.md`:

```markdown
For one-click local Windows use, retain the same D1 schema and owner-scoped
queries but map unauthenticated loopback requests to
`local@quantscope.invalid`. Persist the local D1 database under
`.wrangler/state`. This local identity is accepted only for `localhost` and
`127.0.0.1`; non-loopback hosted requests still require injected
authentication.
```

- [ ] **Step 7: Update feature linkage and project state**

Replace the Windows launcher row in `docs/FEATURE_MAP.md` with:

```markdown
| Windows local no-login launcher | `open-quantscope.bat`, `scripts/start-local.ps1`, `wrangler.local.jsonc`, local package scripts, existing localhost owner fallback in `/api/saved-backtests` | New maximized Edge window with default-browser fallback at `127.0.0.1:3000` | Launcher contract test, clean local D1 migration, HTTP readiness, saved-record round trip | `README.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `DEBUGGING.md` |
```

Replace the saved-backtest row with:

```markdown
| Saved backtest shortcuts | `saved-backtests.ts`, `db/schema.ts`, `/api/saved-backtests`, hosted email owner and fixed loopback owner | Lower-lab save action and dedicated upper-right shortcut bar in `MarketWorkspace.tsx` | Payload validation, rendered-copy tests, and local create/list/delete round trip | `ARCHITECTURE.md`, `FUNCTIONS.md`, `DECISIONS.md` |
```

Add this bullet under `Implemented:` in `docs/CODEX_STATE.md`:

```markdown
- A one-click Windows local launcher that applies project-local D1
  migrations, binds vinext to `127.0.0.1:3000`, requires no account, reuses an
  already-running QuantScope server, and opens a new maximized Edge window
  when Edge is available.
```

- [ ] **Step 8: Run the full project verification**

Run:

```powershell
npm test
npm run lint
```

Expected: all TypeScript tests, production build, rendered-worker test, and
ESLint pass with exit code `0`.

- [ ] **Step 9: Record the successful verification**

Only after Step 8 passes, add these bullets under `## Verification status` in
`docs/CODEX_STATE.md`:

```markdown
- Local launcher contract tests and PowerShell parser validation: passed on
  2026-07-24.
- Clean temporary D1 migration, local HTTP readiness, and a create/list/delete
  saved-backtest round trip without authentication: passed on 2026-07-24.
- Full test suite, production build, rendered-worker test, and ESLint: passed
  after the local no-login launcher change on 2026-07-24.
```

- [ ] **Step 10: Review and commit documentation**

Run:

```powershell
git diff --check
git diff -- README.md docs/DEBUGGING.md docs/ARCHITECTURE.md docs/DECISIONS.md docs/FEATURE_MAP.md docs/CODEX_STATE.md
git add README.md docs/DEBUGGING.md docs/ARCHITECTURE.md docs/DECISIONS.md docs/FEATURE_MAP.md docs/CODEX_STATE.md
git commit -m "Document local QuantScope runtime"
```

Expected: one documentation commit containing only the six planned files.

### Task 3: Final regression and repository audit

**Files:**

- Verify only; no planned file changes.

**Interfaces:**

- Consumes: the complete local launcher and documentation change set.
- Produces: fresh completion evidence and a clean repository state.

- [ ] **Step 1: Re-run focused and full checks from the final committed tree**

Run:

```powershell
npx tsx --test tests/local-launcher.test.ts
npm test
npm run lint
```

Expected: every command exits `0`; the launcher suite reports four passing
tests; the full suite includes a successful production build and
rendered-worker test.

- [ ] **Step 2: Audit Git state and scope**

Run:

```powershell
git status --short
git log -3 --oneline
git show --stat --oneline HEAD~1
git show --stat --oneline HEAD
```

Expected: the working tree is clean. The two implementation commits contain
only the launcher/test files and the six linked documentation files listed in
this plan. The earlier design and plan commits remain separate.

- [ ] **Step 3: Record the handoff facts**

Report:

- Files changed and why.
- One-click run instructions: double-click `open-quantscope.bat`.
- Manual run and test commands.
- Fresh focused, full, build, rendered-worker, lint, D1, HTTP, and saved-record
  verification results.
- `docs/CODEX_STATE.md` and `docs/FEATURE_MAP.md` updates.
- No `docs/MODULE_PATTERNS.md`, `docs/TECH_RESEARCH.md`, or
  `docs/DATA_SOURCES.md` update because no shared pattern, framework choice,
  or data source changed.
- No out-of-plan changes.
- Remaining risks: public market providers still need internet access;
  deleting `.wrangler/state` removes local saved backtests; port 3000 must be
  available.
