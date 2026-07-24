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
