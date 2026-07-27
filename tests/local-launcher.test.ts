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
  const firstReadyProbe = launcher.indexOf("if (Test-QuantScopeReady)");
  const migrationStart = launcher.indexOf(
    'Write-Host "Applying local database migrations..."',
  );

  assert.notEqual(launcher, "");
  assert.match(launcher, /\[version\]"22\.13\.0"/);
  assert.match(launcher, /npm\.cmd ci/);
  assert.match(launcher, /npm\.cmd run local:db:migrate/);
  assert.match(launcher, /http:\/\/127\.0\.0\.1:3000/);
  assert.match(launcher, /GetActiveTcpListeners/);
  assert.match(launcher, /npm\.cmd run local:dev/);
  assert.match(launcher, /TimeoutMilliseconds = 60000/);
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
