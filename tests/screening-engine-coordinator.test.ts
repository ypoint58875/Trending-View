import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { createScreeningEngineCoordinator } from "../scripts/screening-engine-coordinator.mjs";
import {
  LOCAL_SCREENING_BINARY_CONTENT_TYPE,
  encodeLocalScreeningJobRequest,
} from "../lib/analysis/screening-local-engine-bars";
import type { LocalScreeningJobRequest } from "../lib/analysis/screening-local-engine-protocol";

test("coordinator restarts a stalled child and serves its result lazily", async () => {
  const directory = await mkdtemp(join(tmpdir(), "quantscope-coordinator-"));
  const stateDirectory = join(directory, "state");
  const childScript = join(directory, "fake-child.mjs");
  await writeFile(
    childScript,
    `import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";
const directory = process.argv[2];
const marker = join(directory, "stalled-once");
try {
  await access(marker);
  await writeFile(join(directory, "result.json"), JSON.stringify({ ok: true }));
  process.stdout.write(JSON.stringify({ type: "telemetry", status: { updatedAt: Date.now(), restartCount: 0, evaluationsPerSecond: 1, estimatedRemainingSeconds: 0, residentBytes: 1, heapUsedBytes: 1 } }) + "\\n");
  process.stdout.write(JSON.stringify({ type: "completed" }) + "\\n");
} catch {
  await writeFile(marker, "1");
  setInterval(() => {}, 1000);
}
`,
  );
  const coordinator = createScreeningEngineCoordinator({
    rootDirectory: resolve("."),
    stateDirectoryPath: stateDirectory,
    childScriptPath: childScript,
    stallTimeoutMs: 800,
    watchdogIntervalMs: 50,
    maxStallRestarts: 2,
  });
  const server = createServer(async (request, response) => {
    if (!(await coordinator.handle(request, response))) {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolvePromise) =>
    server.listen(0, "127.0.0.1", resolvePromise),
  );
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const request: LocalScreeningJobRequest = {
      version: 3,
      bars: [
        {
          time: "2026-01-01",
          timestamp: Date.parse("2026-01-01T00:00:00Z"),
          open: 1,
          high: 1,
          low: 1,
          close: 1,
          volume: 1,
          amount: 1,
          amplitude: 0,
          changePercent: 0,
          change: 0,
          turnoverRate: 0,
        },
      ],
      settings: {
        initialCash: 1,
        commissionRate: 0,
        slippageRate: 0,
        interval: "1d",
        executionPolicy: "next-open",
      },
      config: { mode: "sample", periods: [{ sessions: 1, weight: 100 }] },
      checkpoint: { key: "stall", signature: "stall" },
      options: {},
    };
    const createdResponse = await fetch(`${baseUrl}/screening/jobs`, {
      method: "POST",
      headers: { "Content-Type": LOCAL_SCREENING_BINARY_CONTENT_TYPE },
      body: encodeLocalScreeningJobRequest(request),
    });
    assert.equal(createdResponse.status, 202);
    const created = (await createdResponse.json()) as { jobId: string };
    let snapshot: {
      status: string;
      engine?: { restartCount: number };
    } = { status: "queued" };
    for (let attempt = 0; attempt < 100; attempt += 1) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
      snapshot = await fetch(
        `${baseUrl}/screening/jobs/${created.jobId}`,
      ).then((response) => response.json());
      if (snapshot.status === "completed") break;
    }
    assert.equal(snapshot.status, "completed", JSON.stringify(snapshot));
    assert.equal(snapshot.engine?.restartCount, 1);
    const result = await fetch(
      `${baseUrl}/screening/jobs/${created.jobId}/result`,
    ).then((response) => response.json());
    assert.deepEqual(result, { ok: true });
  } finally {
    await new Promise<void>((resolvePromise, reject) =>
      server.close((error) => (error ? reject(error) : resolvePromise())),
    );
    await rm(directory, { recursive: true, force: true });
  }
});
