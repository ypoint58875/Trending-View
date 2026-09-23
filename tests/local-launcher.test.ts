import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { GET as getApplicationHealth } from "../app/api/health/route";

const projectRoot = new URL("../", import.meta.url);
const launcherPath = fileURLToPath(
  new URL("scripts/start-local.ps1", projectRoot),
);

function readProjectFile(relativePath: string): string {
  try {
    return readFileSync(new URL(relativePath, projectRoot), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

function quotePowerShell(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function runLauncherFunction(command: string) {
  return spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `. ${quotePowerShell(launcherPath)}; ${command}`,
    ],
    {
      encoding: "utf8",
      timeout: 10_000,
    },
  );
}

test("Windows launcher delegates only to the local PowerShell launcher", () => {
  const launcher = readProjectFile("open-quantscope.bat");

  assert.doesNotMatch(launcher, /chatgpt\.site/i);
  assert.match(launcher, /scripts\\start-local\.ps1/i);
  assert.match(launcher, /powershell\.exe/i);
});

test("proxy relay command preserves the Start-Process parameters", () => {
  const generated = runLauncherFunction(
    `$command = New-QuantScopeServerCommand -Root ${quotePowerShell(fileURLToPath(projectRoot))} -UseMarketRelay $true; $tokens = $null; $errors = $null; $ast = [System.Management.Automation.Language.Parser]::ParseInput($command, [ref]$tokens, [ref]$errors); if ($errors.Count -gt 0) { throw $errors[0].Message }; $commands = @($ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.CommandAst] -and $node.GetCommandName() -eq 'Start-Process' }, $true)); if ($commands.Count -ne 1 -or $commands[0].CommandElements.Count -lt 2) { throw 'Generated Start-Process is missing parameters.' }; Write-Output $command`,
  );

  assert.equal(generated.status, 0, generated.stderr);
  assert.match(
    generated.stdout,
    /\$relayProcess = Start-Process -FilePath 'node\.exe'/,
  );
  assert.match(
    generated.stdout,
    /\$relayScriptPath = Join-Path .*'scripts\\market-relay\.mjs'/,
  );
  assert.match(
    generated.stdout,
    /-ArgumentList @\(\$relayArgument\)/,
  );
  assert.doesNotMatch(
    generated.stdout,
    /\$relayProcess = Start-Process\s*\r?\n\s*-FilePath/,
  );
});

test("runtime port registry contains every persistent loopback listener", () => {
  const result = runLauncherFunction(
    `Write-Output "$($runtimePorts.Application.Role):$($runtimePorts.Application.Port)"; Write-Output "$($runtimePorts.MarketRelay.Role):$($runtimePorts.MarketRelay.Port)"; Write-Output $localUrl; Write-Output $applicationHealthUrl; Write-Output $marketRelayHealthUrl`,
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split(/\r?\n/), [
    "Application:3000",
    "MarketRelay:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3000/api/health",
    "http://127.0.0.1:3001/health",
  ]);
});

test("application health route returns the lightweight launcher contract", async () => {
  const response = getApplicationHealth();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ready: true,
    role: "application",
    version: 1,
  });
});

test("application identity requires this checkout and its fixed runtime arguments", () => {
  const rootPath = fileURLToPath(projectRoot);
  const root = quotePowerShell(rootPath);
  const vinextPath = join(
    rootPath,
    "node_modules",
    ".bin",
    "..",
    "vinext",
    "dist",
    "cli.js",
  );
  const currentCommand = quotePowerShell(
    `node.exe "${vinextPath}" dev -p 3000 -H 127.0.0.1`,
  );
  const wrongPortCommand = quotePowerShell(
    `node.exe "${vinextPath}" dev -p 3010 -H 127.0.0.1`,
  );
  const unrelatedCommand = quotePowerShell(
    "node.exe C:\\other\\node_modules\\vinext\\dist\\cli.js dev -p 3000 -H 127.0.0.1",
  );
  const result = runLauncherFunction(
    `$current = [pscustomobject]@{ Name = 'node.exe'; CommandLine = ${currentCommand}; ParentProcessId = 7001 }; $wrongPort = [pscustomobject]@{ Name = 'node.exe'; CommandLine = ${wrongPortCommand}; ParentProcessId = 7001 }; $unrelated = [pscustomobject]@{ Name = 'node.exe'; CommandLine = ${unrelatedCommand}; ParentProcessId = 7001 }; Write-Output (Test-QuantScopeApplicationProcess -Process $current -Root ${root} -Port 3000); Write-Output (Test-QuantScopeApplicationProcess -Process $wrongPort -Root ${root} -Port 3000); Write-Output (Test-QuantScopeApplicationProcess -Process $unrelated -Root ${root} -Port 3000)`,
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split(/\r?\n/), [
    "True",
    "False",
    "False",
  ]);
});

test("unhealthy application cleanup preserves an unrelated port owner", () => {
  const rootPath = fileURLToPath(projectRoot);
  const root = quotePowerShell(rootPath);
  const vinextPath = join(
    rootPath,
    "node_modules",
    ".bin",
    "..",
    "vinext",
    "dist",
    "cli.js",
  );
  const currentCommand = quotePowerShell(
    `node.exe "${vinextPath}" dev -p 3000 -H 127.0.0.1`,
  );
  const unrelatedCommand = quotePowerShell(
    "node.exe C:\\other\\server.js --port 3000",
  );
  const result = runLauncherFunction(
    `$candidates = @{ 201 = [pscustomobject]@{ Name = 'node.exe'; CommandLine = ${currentCommand}; ParentProcessId = 801 }; 202 = [pscustomobject]@{ Name = 'node.exe'; CommandLine = ${unrelatedCommand}; ParentProcessId = 802 } }; $script:stopped = @(); $listeners = { param($port) @(201, 202) }; $lookup = { param($processId) $candidates[[int]$processId] }.GetNewClosure(); $stopper = { param($processId) $script:stopped += [int]$processId }; Remove-UnhealthyQuantScopeRuntimeListener -Runtime $runtimePorts.Application -Root ${root} -ListeningProcessIds $listeners -ProcessLookup $lookup -ProcessStopper $stopper; Write-Output ($script:stopped -join ',')`,
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim().split(/\r?\n/).at(-1), "201");
});

test("stray application cleanup finds fixed-command servers on fallback ports", () => {
  const rootPath = fileURLToPath(projectRoot);
  const root = quotePowerShell(rootPath);
  const vinextPath = join(
    rootPath,
    "node_modules",
    ".bin",
    "..",
    "vinext",
    "dist",
    "cli.js",
  );
  const currentCommand = quotePowerShell(
    `node.exe "${vinextPath}" dev -p 3000 -H 127.0.0.1`,
  );
  const unrelatedCommand = quotePowerShell(
    "node.exe C:\\other\\server.js --port 3002",
  );
  const result = runLauncherFunction(
    `$candidates = @([pscustomobject]@{ ProcessId = 301; Name = 'node.exe'; CommandLine = ${currentCommand}; ParentProcessId = 901 }, [pscustomobject]@{ ProcessId = 302; Name = 'node.exe'; CommandLine = ${unrelatedCommand}; ParentProcessId = 902 }); $script:stopped = @(); Remove-StrayQuantScopeApplicationProcesses -Root ${root} -ProcessCandidates { $candidates }.GetNewClosure() -ProcessStopper { param($processId) $script:stopped += [int]$processId }; Write-Output ($script:stopped -join ',')`,
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim().split(/\r?\n/).at(-1), "301");
});

test("stale relay identity requires the QuantScope Node command and no live parent", () => {
  const relayPath = join(
    fileURLToPath(projectRoot),
    "scripts",
    "market-relay.mjs",
  );
  const root = quotePowerShell(fileURLToPath(projectRoot));
  const currentCommand = quotePowerShell(`node.exe "${relayPath}"`);
  const unrelatedCommand = quotePowerShell("node.exe other-relay.mjs");
  const result = runLauncherFunction(
    `$current = [pscustomobject]@{ Name = 'node.exe'; CommandLine = ${currentCommand}; ParentProcessId = 7001 }; $unrelated = [pscustomobject]@{ Name = 'node.exe'; CommandLine = ${unrelatedCommand}; ParentProcessId = 7001 }; Write-Output (Test-QuantScopeMarketRelayProcess -Process $current -Root ${root} -ParentProcessExists { $false }); Write-Output (Test-QuantScopeMarketRelayProcess -Process $current -Root ${root} -ParentProcessExists { $true }); Write-Output (Test-QuantScopeMarketRelayProcess -Process $unrelated -Root ${root} -ParentProcessExists { $false })`,
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split(/\r?\n/), [
    "True",
    "False",
    "False",
  ]);
});

test("unhealthy runtime cleanup stops only identified current-checkout listeners", () => {
  const relayPath = join(
    fileURLToPath(projectRoot),
    "scripts",
    "market-relay.mjs",
  );
  const root = quotePowerShell(fileURLToPath(projectRoot));
  const currentCommand = quotePowerShell(`node.exe "${relayPath}"`);
  const unrelatedCommand = quotePowerShell("node.exe other-relay.mjs");
  const result = runLauncherFunction(
    `$candidates = @{ 101 = [pscustomobject]@{ Name = 'node.exe'; CommandLine = ${currentCommand}; ParentProcessId = 901 }; 102 = [pscustomobject]@{ Name = 'node.exe'; CommandLine = ${unrelatedCommand}; ParentProcessId = 901 }; 103 = [pscustomobject]@{ Name = 'node.exe'; CommandLine = ${currentCommand}; ParentProcessId = 900 } }; $script:stopped = @(); $listeners = { param($port) @(101, 102, 103) }; $lookup = { param($processId) $candidates[[int]$processId] }.GetNewClosure(); $parentExists = { param($processId) $processId -eq 900 }; $stopper = { param($processId) $script:stopped += [int]$processId }; Remove-UnhealthyQuantScopeRuntimeListener -Runtime $runtimePorts.MarketRelay -Root ${root} -ListeningProcessIds $listeners -ProcessLookup $lookup -ParentProcessExists $parentExists -ProcessStopper $stopper; Write-Output ($script:stopped -join ',')`,
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim().split(/\r?\n/).at(-1), "101,103");
});

test("local package commands pin loopback and persistent D1 state", () => {
  const packageJson = JSON.parse(readProjectFile("package.json")) as {
    scripts: Record<string, string>;
  };
  const wranglerSource = readProjectFile("wrangler.local.jsonc");
  const viteConfig = readProjectFile("vite.config.ts");

  assert.equal(
    packageJson.scripts["local:dev"],
    "vinext dev -p 3000 -H 127.0.0.1",
  );
  assert.equal(
    packageJson.scripts["local:db:migrate"],
    "wrangler d1 migrations apply DB --local --config wrangler.local.jsonc --persist-to .wrangler/state",
  );
  assert.notEqual(wranglerSource, "");
  assert.match(viteConfig, /server:\s*\{\s*strictPort: true,/);

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
  const firstReadyProbe = launcher.indexOf("if (Test-QuantScopeReady)");
  const migrationStart = launcher.indexOf(
    'Write-Host "Applying local database migrations..."',
  );

  assert.notEqual(launcher, "");
  assert.match(launcher, /\[version\]"22\.13\.0"/);
  assert.match(launcher, /npm\.cmd ci/);
  assert.match(launcher, /function Invoke-QuantScopeLocalMigrations/);
  assert.match(
    launcher,
    /\.Arguments = "run local:db:migrate"/,
  );
  assert.match(launcher, /Get-Command `\r?\n\s+\$resolvedNpmCommand/);
  assert.match(launcher, /No migrations to apply!/);
  assert.match(launcher, /Stop-QuantScopeProcessTree -Process \$process/);
  assert.match(launcher, /function Invoke-QuantScopeLoopbackGet/);
  assert.match(launcher, /require\("node:http"\)/);
  assert.match(launcher, /content\.length > 1048576/);
  assert.match(launcher, /http\.get\(target, \{ agent: false \}/);
  assert.match(launcher, /ToBase64String/);
  assert.match(launcher, /eval\(Buffer\.from\(process\.argv\[1\]/);
  assert.match(launcher, /\$env:NO_PROXY = "\$runtimeHost,localhost"/);
  assert.match(launcher, /\$env:no_proxy = \$env:NO_PROXY/);
  assert.match(
    launcher,
    /-Uri \$applicationHealthUrl `\r?\n\s+-TimeoutSeconds 2/,
  );
  assert.match(
    launcher,
    /-Uri \$marketRelayHealthUrl `\r?\n\s+-TimeoutSeconds 2/,
  );
  assert.match(launcher, /\$runtimeHost = "127\.0\.0\.1"/);
  assert.match(launcher, /Application = \[pscustomobject\]@\{/);
  assert.match(launcher, /MarketRelay = \[pscustomobject\]@\{/);
  assert.match(
    launcher,
    /\$localUrl = "http:\/\/\$\{runtimeHost\}:\$\(\$applicationRuntime\.Port\)"/,
  );
  assert.match(launcher, /GetActiveTcpListeners/);
  assert.match(launcher, /NODE_USE_ENV_PROXY = "1"/);
  assert.match(launcher, /\$env:HTTPS_PROXY -or \$env:HTTP_PROXY/);
  assert.match(launcher, /\$useMarketRelay = \$true/);
  assert.match(launcher, /scripts[\\/]market-relay\.mjs/);
  assert.match(launcher, /function Ensure-QuantScopeMarketRelay/);
  assert.match(
    launcher,
    /if \(-not \(Ensure-QuantScopeMarketRelay -Root \$projectRoot\)\)/,
  );
  assert.match(launcher, /function Test-QuantScopeApplicationProcess/);
  assert.match(launcher, /function Test-QuantScopeRuntimeProcess/);
  assert.match(launcher, /function Remove-UnhealthyQuantScopeRuntimeListener/);
  assert.match(launcher, /function Remove-StrayQuantScopeApplicationProcesses/);
  assert.match(launcher, /function Remove-FailedQuantScopeStartup/);
  assert.match(launcher, /function Confirm-QuantScopeRuntimePortAvailable/);
  assert.match(
    launcher,
    /Confirm-QuantScopeRuntimePortAvailable `\r?\n\s+-Runtime \$applicationRuntime/g,
  );
  assert.ok(
    (
      launcher.match(
        /Confirm-QuantScopeRuntimePortAvailable `\r?\n\s+-Runtime \$applicationRuntime/g,
      ) ?? []
    ).length >= 2,
  );
  assert.match(
    launcher,
    /Confirm-QuantScopeRuntimePortAvailable `\r?\n\s+-Runtime \$marketRelayRuntime/,
  );
  assert.match(
    launcher,
    /QUANTSCOPE_LOCAL_MARKET_RELAY_ENABLED = '1'/,
  );
  assert.match(launcher, /npm\.cmd run local:dev/);
  assert.match(launcher, /TimeoutMilliseconds = 60000/);
  assert.match(launcher, /ListeningGraceMilliseconds = 120000/);
  assert.match(launcher, /-OnListening \$openBrowserOnce/);
  assert.match(
    launcher,
    /Remove-FailedQuantScopeStartup `\r?\n\s+-ServerProcess \$serverProcess/g,
  );
  assert.match(launcher, /QuantScope/);
  assert.doesNotMatch(launcher, /chatgpt\.site/i);
  assert.ok(firstReadyProbe >= 0);
  assert.ok(migrationStart >= 0);
  assert.ok(
    firstReadyProbe < migrationStart,
    "an already-running QuantScope server must be reused before D1 migration",
  );
});

test("dependency readiness rejects missing and damaged installs", () => {
  const launcher = readProjectFile("scripts/start-local.ps1");

  assert.match(launcher, /function Test-DependenciesReady/);

  const fixtureRoot = mkdtempSync(join(tmpdir(), "quantscope-dependencies-"));
  const readyNpm = join(fixtureRoot, "npm-ready.cmd");
  const brokenNpm = join(fixtureRoot, "npm-broken.cmd");

  try {
    writeFileSync(readyNpm, "@exit /b 0\r\n", "ascii");
    writeFileSync(brokenNpm, "@exit /b 1\r\n", "ascii");

    const missing = runLauncherFunction(
      `if (Test-DependenciesReady -Root ${quotePowerShell(fixtureRoot)} -NpmCommand ${quotePowerShell(readyNpm)}) { 'ready' } else { 'missing' }`,
    );
    assert.equal(missing.status, 0, missing.stderr);
    assert.equal(missing.stdout.trim(), "missing");

    mkdirSync(join(fixtureRoot, "node_modules"));
    const damaged = runLauncherFunction(
      `if (Test-DependenciesReady -Root ${quotePowerShell(fixtureRoot)} -NpmCommand ${quotePowerShell(brokenNpm)}) { 'ready' } else { 'damaged' }`,
    );
    assert.equal(damaged.status, 0, damaged.stderr);
    assert.equal(damaged.stdout.trim(), "damaged");

    const ready = runLauncherFunction(
      `if (Test-DependenciesReady -Root ${quotePowerShell(fixtureRoot)} -NpmCommand ${quotePowerShell(readyNpm)}) { 'ready' } else { 'damaged' }`,
    );
    assert.equal(ready.status, 0, ready.stderr);
    assert.equal(ready.stdout.trim(), "ready");
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("recovers when a completed no-op Wrangler migration does not exit", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "quantscope-migration-"));
  const hangingNpm = join(fixtureRoot, "npm-hanging.cmd");

  try {
    writeFileSync(
      hangingNpm,
      [
        "@echo off",
        "echo No migrations to apply!",
        "ping 127.0.0.1 -n 30 >nul",
      ].join("\r\n"),
      "ascii",
    );
    const result = runLauncherFunction(
      `$result = Invoke-QuantScopeLocalMigrations -Root ${quotePowerShell(fixtureRoot)} -NpmCommand ${quotePowerShell(hangingNpm)} -TimeoutMilliseconds 5000 -NoOpExitGraceMilliseconds 50 -PollMilliseconds 10; Write-Output "STATUS=$($result.Status);EXIT=$($result.ExitCode)"`,
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /No migrations to apply!/);
    assert.match(result.stdout, /STATUS=RecoveredNoOp;EXIT=/);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("process-tree cleanup tolerates a taskkill child-exit race", () => {
  const result = runLauncherFunction(
    `$process = [pscustomobject]@{ Id = 9999; HasExited = $false }; $process | Add-Member ScriptMethod Refresh { $this.HasExited = $true }; $process | Add-Member ScriptMethod WaitForExit { param($milliseconds) return $true }; Stop-QuantScopeProcessTree -Process $process -ProcessTreeStopper { param($processId) return 128 }; Write-Output 'RECOVERED'`,
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "RECOVERED");
});

test("preserves normal migration success and failure exit codes", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "quantscope-migration-exit-"));
  const successfulNpm = join(fixtureRoot, "npm-success.cmd");
  const failingNpm = join(fixtureRoot, "npm-failure.cmd");

  try {
    writeFileSync(successfulNpm, "@echo migration complete\r\n@exit /b 0\r\n", "ascii");
    writeFileSync(failingNpm, "@echo migration failed 1>&2\r\n@exit /b 7\r\n", "ascii");

    const successful = runLauncherFunction(
      `$result = Invoke-QuantScopeLocalMigrations -Root ${quotePowerShell(fixtureRoot)} -NpmCommand ${quotePowerShell(successfulNpm)} -TimeoutMilliseconds 1000 -PollMilliseconds 10; Write-Output "STATUS=$($result.Status);EXIT=$($result.ExitCode)"`,
    );
    assert.equal(successful.status, 0, successful.stderr);
    assert.match(successful.stdout, /migration complete/);
    assert.match(successful.stdout, /STATUS=Exited;EXIT=0/);

    const failing = runLauncherFunction(
      `$result = Invoke-QuantScopeLocalMigrations -Root ${quotePowerShell(fixtureRoot)} -NpmCommand ${quotePowerShell(failingNpm)} -TimeoutMilliseconds 1000 -PollMilliseconds 10; Write-Output "STATUS=$($result.Status);EXIT=$($result.ExitCode)"`,
    );
    assert.equal(failing.status, 0, failing.stderr);
    assert.match(failing.stdout, /migration failed/);
    assert.match(failing.stdout, /STATUS=Exited;EXIT=7/);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("startup wait reports ready and an exited server without timing out", () => {
  const launcher = readProjectFile("scripts/start-local.ps1");

  assert.match(launcher, /function Wait-QuantScopeStartup/);
  assert.doesNotMatch(launcher, /"-NoExit"/);

  const ready = runLauncherFunction(
    "$result = Wait-QuantScopeStartup -ServerProcess ([pscustomobject]@{ HasExited = $false }) -ReadyProbe { $true } -TimeoutMilliseconds 50 -PollMilliseconds 1; Write-Output $result",
  );
  assert.equal(ready.status, 0, ready.stderr);
  assert.equal(ready.stdout.trim(), "Ready");

  const exited = runLauncherFunction(
    "$result = Wait-QuantScopeStartup -ServerProcess ([pscustomobject]@{ HasExited = $true }) -ReadyProbe { $false } -TimeoutMilliseconds 50 -PollMilliseconds 1; Write-Output $result",
  );
  assert.equal(exited.status, 0, exited.stderr);
  assert.equal(exited.stdout.trim(), "Exited");
});

test("startup wait grants one bounded grace period to a listening server", () => {
  const listening = runLauncherFunction(
    "$script:readyChecks = 0; $script:listeningCalls = 0; $result = Wait-QuantScopeStartup -ServerProcess ([pscustomobject]@{ HasExited = $false }) -ReadyProbe { $script:readyChecks += 1; return $script:readyChecks -ge 3 } -PortInUseProbe { $true } -OnListening { $script:listeningCalls += 1 } -TimeoutMilliseconds 1 -ListeningGraceMilliseconds 1000 -PollMilliseconds 1; Write-Output \"RESULT=$result;CHECKS=$script:readyChecks;LISTENING=$script:listeningCalls\"",
  );
  assert.equal(listening.status, 0, listening.stderr);
  assert.match(listening.stdout, /still compiling/);
  assert.match(
    listening.stdout,
    /RESULT=Ready;CHECKS=[3-9][0-9]*;LISTENING=1/,
  );

  const notListening = runLauncherFunction(
    "$result = Wait-QuantScopeStartup -ServerProcess ([pscustomobject]@{ HasExited = $false }) -ReadyProbe { $false } -PortInUseProbe { $false } -TimeoutMilliseconds 1 -ListeningGraceMilliseconds 100 -PollMilliseconds 1; Write-Output $result",
  );
  assert.equal(notListening.status, 0, notListening.stderr);
  assert.equal(notListening.stdout.trim(), "TimedOut");
});

test("persistent routes share the localhost owner fallback", () => {
  const route = readProjectFile("app/api/saved-backtests/route.ts");
  const screeningRoute = readProjectFile("app/api/screening-runs/route.ts");
  const owner = readProjectFile("app/api/owner.ts");

  assert.match(route, /resolveOwnerEmail/);
  assert.match(screeningRoute, /resolveOwnerEmail/);
  assert.match(owner, /hostname === "localhost"/);
  assert.match(owner, /hostname === "127\.0\.0\.1"/);
  assert.match(owner, /"local@quantscope\.invalid"/);
});
