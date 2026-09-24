import assert from "node:assert/strict";
import { createServer } from "node:http";
import { access, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  createScreeningEngineCoordinator,
  recommendedScreeningConcurrency,
} from "../scripts/screening-engine-coordinator.mjs";
import {
  LOCAL_SCREENING_BINARY_CONTENT_TYPE,
  encodeLocalScreeningJobBatchRequest,
  encodeLocalScreeningJobRequest,
} from "../lib/analysis/screening-local-engine-bars";
import type {
  LocalScreeningJobBatchRequest,
  LocalScreeningJobRequest,
} from "../lib/analysis/screening-local-engine-protocol";

const GIBIBYTE = 1024 * 1024 * 1024;

test("screening concurrency reserves CPU and memory for the desktop", () => {
  assert.equal(
    recommendedScreeningConcurrency({
      availableCpuCount: 8,
      totalMemoryBytes: 64 * GIBIBYTE,
    }),
    7,
  );
  assert.equal(
    recommendedScreeningConcurrency({
      availableCpuCount: 16,
      totalMemoryBytes: 16 * GIBIBYTE,
    }),
    3,
  );
  assert.equal(
    recommendedScreeningConcurrency({
      availableCpuCount: 4,
      totalMemoryBytes: 8 * GIBIBYTE,
    }),
    1,
  );
  assert.equal(
    recommendedScreeningConcurrency({
      availableCpuCount: 32,
      totalMemoryBytes: 128 * GIBIBYTE,
    }),
    8,
  );
});

test("coordinator cancels unfinished work when the browser lease disconnects", async () => {
  const directory = await mkdtemp(join(tmpdir(), "quantscope-lease-"));
  const stateDirectory = join(directory, "state");
  const childScript = join(directory, "fake-child.mjs");
  await writeFile(childScript, "setInterval(() => {}, 1000);\n");
  const coordinator = createScreeningEngineCoordinator({
    rootDirectory: resolve("."),
    stateDirectoryPath: stateDirectory,
    childScriptPath: childScript,
    stallTimeoutMs: 60_000,
    maximumConcurrency: 1,
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
  const leaseController = new AbortController();
  try {
    const request: LocalScreeningJobRequest = {
      version: 4,
      bars: [{
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
      }],
      settings: {
        initialCash: 1,
        commissionRate: 0,
        slippageRate: 0,
        interval: "1d",
        executionPolicy: "next-open",
      },
      config: { mode: "sample", periods: [{ sessions: 1, weight: 100 }] },
      checkpoint: { key: "lease", signature: "lease" },
      options: {},
    };
    const createdResponse = await fetch(`${baseUrl}/screening/jobs`, {
      method: "POST",
      headers: { "Content-Type": LOCAL_SCREENING_BINARY_CONTENT_TYPE },
      body: encodeLocalScreeningJobRequest(request),
    });
    const created = (await createdResponse.json()) as { jobId: string };
    const leaseResponse = await fetch(`${baseUrl}/screening/job-lease`, {
      method: "POST",
      body: JSON.stringify({ version: 4, jobIds: [created.jobId] }),
      signal: leaseController.signal,
    });
    assert.equal(leaseResponse.status, 200);
    const reader = leaseResponse.body?.getReader();
    assert.ok(reader);
    await reader.read();
    leaseController.abort();
    try {
      await reader.read();
    } catch (error) {
      assert.equal((error as Error).name, "AbortError");
    }
    let status = "running";
    for (let attempt = 0; attempt < 100; attempt += 1) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
      const snapshot = await fetch(
        `${baseUrl}/screening/jobs/${created.jobId}`,
      ).then((response) => response.json()) as { status: string };
      status = snapshot.status;
      if (status === "cancelled") break;
    }
    assert.equal(status, "cancelled");
    await access(join(stateDirectory, created.jobId, "cancelled"));
  } finally {
    leaseController.abort();
    await new Promise<void>((resolvePromise, reject) =>
      server.close((error) => (error ? reject(error) : resolvePromise())),
    );
    await rm(directory, { recursive: true, force: true });
  }
});

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
  const unexpectedMarker = join(directory, "unexpected-once");
  try {
    await access(unexpectedMarker);
    await writeFile(join(directory, "result.json"), JSON.stringify({ ok: true }));
    process.stdout.write(JSON.stringify({ type: "telemetry", status: { updatedAt: Date.now(), restartCount: 0, evaluationsPerSecond: 1, estimatedRemainingSeconds: 0, residentBytes: 1, heapUsedBytes: 1 } }) + "\\n");
    process.stdout.write(JSON.stringify({ type: "completed" }) + "\\n");
  } catch {
    await writeFile(unexpectedMarker, "1");
    process.exitCode = 1;
  }
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
    stallTimeoutMs: 5_000,
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
      version: 4,
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
    for (let attempt = 0; attempt < 600; attempt += 1) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
      snapshot = await fetch(
        `${baseUrl}/screening/jobs/${created.jobId}`,
      ).then((response) => response.json());
      if (snapshot.status === "completed") break;
    }
    assert.equal(snapshot.status, "completed", JSON.stringify(snapshot));
    assert.ok(
      (snapshot.engine?.restartCount ?? 0) >= 2,
      "the test must include both the intentional stall and unexpected exit",
    );
    const result = await fetch(
      `${baseUrl}/screening/jobs/${created.jobId}/result`,
    ).then((response) => response.json());
    assert.deepEqual(result, { ok: true });

    const cachedResponse = await fetch(`${baseUrl}/screening/jobs`, {
      method: "POST",
      headers: { "Content-Type": LOCAL_SCREENING_BINARY_CONTENT_TYPE },
      body: encodeLocalScreeningJobRequest(request),
    });
    assert.equal(cachedResponse.status, 202);
    const cached = (await cachedResponse.json()) as { jobId: string };
    assert.equal(cached.jobId, created.jobId);
    const cachedSnapshot = await fetch(
      `${baseUrl}/screening/jobs/${cached.jobId}`,
    ).then((response) => response.json());
    assert.equal(cachedSnapshot.status, "completed");
  } finally {
    await new Promise<void>((resolvePromise, reject) =>
      server.close((error) => (error ? reject(error) : resolvePromise())),
    );
    await rm(directory, { recursive: true, force: true });
  }
});

test("coordinator reconciles an atomically committed result from disk", async () => {
  const directory = await mkdtemp(join(tmpdir(), "quantscope-disk-result-"));
  const stateDirectory = join(directory, "state");
  const childScript = join(directory, "orphan-result-child.mjs");
  await writeFile(
    childScript,
    `import { rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
const directory = process.argv[2];
const temporaryPath = join(directory, "result.tmp");
await writeFile(temporaryPath, JSON.stringify({ recovered: true }));
await rename(temporaryPath, join(directory, "result.json"));
setInterval(() => {}, 1000);
`,
  );
  const coordinator = createScreeningEngineCoordinator({
    rootDirectory: resolve("."),
    stateDirectoryPath: stateDirectory,
    childScriptPath: childScript,
    maximumConcurrency: 1,
  });
  const server = createServer(async (request, response) => {
    if (!(await coordinator.handle(request, response))) response.writeHead(404).end();
  });
  await new Promise<void>((resolvePromise) =>
    server.listen(0, "127.0.0.1", resolvePromise),
  );
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const request: LocalScreeningJobRequest = {
    version: 4,
    bars: [{
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
    }],
    settings: {
      initialCash: 1,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
      executionPolicy: "next-open",
    },
    config: { mode: "sample", periods: [{ sessions: 1, weight: 100 }] },
    checkpoint: { key: "orphan-result", signature: "orphan-result" },
    options: {},
  };
  try {
    const createResponse = await fetch(`${baseUrl}/screening/jobs`, {
      method: "POST",
      headers: { "Content-Type": LOCAL_SCREENING_BINARY_CONTENT_TYPE },
      body: encodeLocalScreeningJobRequest(request),
    });
    assert.equal(createResponse.status, 202);
    const { jobId } = (await createResponse.json()) as { jobId: string };
    let status = "running";
    for (let attempt = 0; attempt < 100; attempt += 1) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
      const snapshot = await fetch(`${baseUrl}/screening/jobs/${jobId}`)
        .then((response) => response.json()) as { status: string };
      status = snapshot.status;
      if (status === "completed") break;
    }
    assert.equal(status, "completed");
    const resultResponse = await fetch(
      `${baseUrl}/screening/jobs/${jobId}/result`,
    );
    assert.equal(resultResponse.status, 200);
    assert.deepEqual(await resultResponse.json(), { recovered: true });
  } finally {
    await new Promise<void>((resolvePromise, reject) =>
      server.close((error) => (error ? reject(error) : resolvePromise())),
    );
    await rm(directory, { recursive: true, force: true });
  }
});

test("coordinator finishes a pre-submitted queue without browser polling", async () => {
  const directory = await mkdtemp(join(tmpdir(), "quantscope-queue-"));
  const stateDirectory = join(directory, "state");
  const childScript = join(directory, "fake-child.mjs");
  await writeFile(
    childScript,
    `import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { deserialize } from "node:v8";
const directory = process.argv[2];
const request = JSON.parse(await readFile(join(directory, "request.json"), "utf8"));
const bars = deserialize(await readFile(request.sharedBarsPath ?? join(directory, "bars.bin")));
const runningPath = join(dirname(directory), "running-" + process.pid);
await writeFile(runningPath, "1");
await new Promise((resolve) => setTimeout(resolve, 500));
const resultTemporaryPath = join(directory, "result.tmp");
await writeFile(resultTemporaryPath, JSON.stringify({ key: request.checkpoint.key, bars: Math.min(request.barCount ?? bars.times.length, bars.times.length), sharedBarsPath: request.sharedBarsPath }));
await rm(runningPath, { force: true });
await rename(resultTemporaryPath, join(directory, "result.json"));
process.stdout.write(JSON.stringify({ type: "completed" }) + "\\n");
`,
  );
  const coordinator = createScreeningEngineCoordinator({
    rootDirectory: resolve("."),
    stateDirectoryPath: stateDirectory,
    childScriptPath: childScript,
    maximumConcurrency: 2,
  });
  assert.equal(coordinator.health.screeningConcurrency, 2);
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
  const request: LocalScreeningJobRequest = {
    version: 4,
    bars: [{
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
    }],
    settings: {
      initialCash: 1,
      commissionRate: 0,
      slippageRate: 0,
      interval: "1d",
      executionPolicy: "next-open",
    },
    config: { mode: "sample", periods: [{ sessions: 1, weight: 100 }] },
    checkpoint: { key: "queue-0", signature: "queue-0" },
    options: {},
  };
  try {
    const batchRequest: LocalScreeningJobBatchRequest = {
      version: 4,
      bars: [
        request.bars[0]!,
        { ...request.bars[0]!, time: "2026-01-02", timestamp: Date.parse("2026-01-02T00:00:00Z") },
        { ...request.bars[0]!, time: "2026-01-03", timestamp: Date.parse("2026-01-03T00:00:00Z") },
      ],
      jobs: Array.from({ length: 3 }, (_, index) => ({
        version: 4,
        settings: request.settings,
        config: request.config,
        checkpoint: {
          key: `queue-${index}`,
          signature: `queue-${index}`,
        },
        options: {},
        barCount: index + 1,
      })),
    };
    const response = await fetch(`${baseUrl}/screening/job-batches`, {
      method: "POST",
      headers: { "Content-Type": LOCAL_SCREENING_BINARY_CONTENT_TYPE },
      body: encodeLocalScreeningJobBatchRequest(batchRequest),
    });
    assert.equal(response.status, 202);
    const jobIds = ((await response.json()) as { jobIds: string[] }).jobIds;
    assert.equal(jobIds.length, 3);

    let completed = false;
    let peakRunningChildren = 0;
    let snapshots: Array<{ status: string }> = [];
    for (let attempt = 0; attempt < 100; attempt += 1) {
      peakRunningChildren = Math.max(
        peakRunningChildren,
        (await readdir(stateDirectory)).filter((entry) => entry.startsWith("running-"))
          .length,
      );
      snapshots = await Promise.all(
        jobIds.map((jobId) =>
          fetch(`${baseUrl}/screening/jobs/${jobId}`).then((response) => response.json()),
        ),
      ) as Array<{ status: string }>;
      completed = snapshots.every((snapshot) => snapshot.status === "completed");
      if (completed) break;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
    }
    assert.equal(completed, true, "the queued jobs did not finish autonomously");
    assert.equal(peakRunningChildren, 2);
    assert.deepEqual(snapshots.map((snapshot) => snapshot.status), [
      "completed",
      "completed",
      "completed",
    ]);
    const batchStatusResponse = await fetch(`${baseUrl}/screening/job-statuses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 4, jobIds }),
    });
    assert.equal(batchStatusResponse.status, 200);
    const batchStatuses = (await batchStatusResponse.json()) as {
      jobs: Array<{ jobId: string; status: string }>;
    };
    assert.deepEqual(
      batchStatuses.jobs.map((job) => [job.jobId, job.status]),
      jobIds.map((jobId) => [jobId, "completed"]),
    );
    const results = await Promise.all(
      jobIds.map((jobId) =>
        fetch(`${baseUrl}/screening/jobs/${jobId}/result`).then((response) => response.json()),
      ),
    ) as Array<{ bars: number; sharedBarsPath: string }>;
    assert.deepEqual(results.map((result) => result.bars), [1, 2, 3]);
    assert.equal(new Set(results.map((result) => result.sharedBarsPath)).size, 1);
    await Promise.all(
      jobIds.map((jobId) =>
        assert.rejects(access(join(stateDirectory, jobId, "bars.bin"))),
      ),
    );

    await rm(join(stateDirectory, jobIds[2]!, "result.json"));
    const recoveredCoordinator = createScreeningEngineCoordinator({
      rootDirectory: resolve("."),
      stateDirectoryPath: stateDirectory,
      childScriptPath: childScript,
      maximumConcurrency: 1,
    });
    const recoveredServer = createServer(async (request, response) => {
      if (!(await recoveredCoordinator.handle(request, response))) {
        response.writeHead(404).end();
      }
    });
    await new Promise<void>((resolvePromise) =>
      recoveredServer.listen(0, "127.0.0.1", resolvePromise),
    );
    const recoveredAddress = recoveredServer.address();
    assert.ok(recoveredAddress && typeof recoveredAddress === "object");
    const recoveredBaseUrl = `http://127.0.0.1:${recoveredAddress.port}`;
    let recoveredStatus = "queued";
    for (let attempt = 0; attempt < 100; attempt += 1) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
      const snapshot = await fetch(
        `${recoveredBaseUrl}/screening/jobs/${jobIds[2]}`,
      ).then((response) => response.json()) as { status: string };
      recoveredStatus = snapshot.status;
      if (recoveredStatus === "completed") break;
    }
    assert.equal(
      recoveredStatus,
      "completed",
      "a submitted batch unit should resume after coordinator restart",
    );
    const cancelledResponse = await fetch(
      `${recoveredBaseUrl}/screening/job-cancellations`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: 4, jobIds: [jobIds[2]] }),
      },
    );
    assert.equal(cancelledResponse.status, 200);
    assert.deepEqual(await cancelledResponse.json(), {
      cancelledJobIds: [jobIds[2]],
    });
    await rm(join(stateDirectory, jobIds[2]!, "result.json"));
    const pausedCoordinator = createScreeningEngineCoordinator({
      rootDirectory: resolve("."),
      stateDirectoryPath: stateDirectory,
      childScriptPath: childScript,
      maximumConcurrency: 1,
    });
    const pausedServer = createServer(async (request, response) => {
      if (!(await pausedCoordinator.handle(request, response))) {
        response.writeHead(404).end();
      }
    });
    await new Promise<void>((resolvePromise) =>
      pausedServer.listen(0, "127.0.0.1", resolvePromise),
    );
    const pausedAddress = pausedServer.address();
    assert.ok(pausedAddress && typeof pausedAddress === "object");
    const pausedSnapshot = await fetch(
      `http://127.0.0.1:${pausedAddress.port}/screening/jobs/${jobIds[2]}`,
    ).then((response) => response.json()) as { status: string };
    assert.equal(
      pausedSnapshot.status,
      "cancelled",
      "an explicitly cancelled batch unit must remain paused after restart",
    );
    await new Promise<void>((resolvePromise, reject) =>
      pausedServer.close((error) =>
        error ? reject(error) : resolvePromise(),
      ),
    );
    await new Promise<void>((resolvePromise, reject) =>
      recoveredServer.close((error) =>
        error ? reject(error) : resolvePromise(),
      ),
    );
  } finally {
    await new Promise<void>((resolvePromise, reject) =>
      server.close((error) => (error ? reject(error) : resolvePromise())),
    );
    await rm(directory, { recursive: true, force: true });
  }
});
