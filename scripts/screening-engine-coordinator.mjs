import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { availableParallelism, totalmem } from "node:os";
import { serialize } from "node:v8";

const MAX_REQUEST_BYTES = 64 * 1024 * 1024;
const MAX_BATCH_JOBS = 512;
const RESTART_EXIT_CODE = 75;
const JOB_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const CHILD_STALL_TIMEOUT_MS = 60_000;
const MAX_STALL_RESTARTS = 3;
const MAX_UNEXPECTED_RESTARTS = 3;
const BAR_FIELD_COUNT = 11;
const BINARY_CONTENT_TYPE = "application/vnd.quantscope.screening+binary";
const BATCH_MANIFEST_FILE = "queue.json";
const CANCELLED_MARKER_FILE = "cancelled";
const MAX_AUTO_CONCURRENCY = 8;
const MEMORY_PER_CHILD_BYTES = 4 * 1024 * 1024 * 1024;
const MIN_SYSTEM_MEMORY_RESERVE_BYTES = 2 * 1024 * 1024 * 1024;

export function recommendedScreeningConcurrency({
  availableCpuCount = availableParallelism(),
  totalMemoryBytes = totalmem(),
} = {}) {
  const cpuCount = Math.max(1, Math.floor(availableCpuCount));
  const memoryBytes = Math.max(0, Math.floor(totalMemoryBytes));
  const cpuLimit = Math.max(1, cpuCount - 1);
  const reservedMemoryBytes = Math.max(
    MIN_SYSTEM_MEMORY_RESERVE_BYTES,
    Math.floor(memoryBytes * 0.25),
  );
  const memoryLimit = Math.max(
    1,
    Math.floor(
      Math.max(memoryBytes - reservedMemoryBytes, 0) / MEMORY_PER_CHILD_BYTES,
    ),
  );
  return Math.max(1, Math.min(cpuLimit, memoryLimit, MAX_AUTO_CONCURRENCY));
}

function packMarketBars(bars) {
  const values = new Float64Array(bars.length * BAR_FIELD_COUNT);
  const times = new Array(bars.length);
  bars.forEach((bar, index) => {
    times[index] = bar.time;
    const offset = index * BAR_FIELD_COUNT;
    values[offset] = bar.timestamp;
    values[offset + 1] = bar.open;
    values[offset + 2] = bar.close;
    values[offset + 3] = bar.high;
    values[offset + 4] = bar.low;
    values[offset + 5] = bar.volume;
    values[offset + 6] = bar.amount;
    values[offset + 7] = bar.amplitude;
    values[offset + 8] = bar.changePercent;
    values[offset + 9] = bar.change;
    values[offset + 10] = bar.turnoverRate;
  });
  return { times, values };
}

async function readJsonBody(request, maximumBytes = MAX_REQUEST_BYTES) {
  return JSON.parse((await readBodyBuffer(request, maximumBytes)).toString("utf8"));
}

async function readBodyBuffer(request, maximumBytes = MAX_REQUEST_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes) throw new Error("Request body is too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJobBody(request) {
  if (!request.headers["content-type"]?.startsWith(BINARY_CONTENT_TYPE)) {
    const payload = await readJsonBody(request);
    return { payload, packedBars: packMarketBars(payload?.bars ?? []) };
  }
  const body = await readBodyBuffer(request);
  if (body.length < 4) throw new Error("Binary screening request is truncated");
  const headerLength = body.readUInt32LE(0);
  const valuesOffset = 4 + headerLength;
  if (headerLength <= 0 || valuesOffset > body.length) {
    throw new Error("Binary screening request header is invalid");
  }
  const header = JSON.parse(body.subarray(4, valuesOffset).toString("utf8"));
  const times = Array.isArray(header?.times) ? header.times : [];
  const expectedBytes = times.length * BAR_FIELD_COUNT * Float64Array.BYTES_PER_ELEMENT;
  if (body.length - valuesOffset !== expectedBytes) {
    throw new Error("Binary screening request values are invalid");
  }
  const values = new Float64Array(times.length * BAR_FIELD_COUNT);
  new Uint8Array(values.buffer).set(body.subarray(valuesOffset));
  const payload = { ...header, times: undefined };
  return { payload, packedBars: { times, values } };
}

function jobIdFor(request) {
  return createHash("sha256")
    .update(`${request.checkpoint.key}|${request.checkpoint.signature}`)
    .digest("hex")
    .slice(0, 24);
}

function isLoopbackRequest(request) {
  const address = request.socket.remoteAddress ?? "";
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address)) {
    return false;
  }
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return ["127.0.0.1", "localhost"].includes(new URL(origin).hostname);
  } catch {
    return false;
  }
}

function allowedOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return "*";
  try {
    const parsed = new URL(origin);
    return ["127.0.0.1", "localhost"].includes(parsed.hostname)
      ? origin
      : "null";
  } catch {
    return "null";
  }
}

function writeJson(request, response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Origin": allowedOrigin(request),
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "application/json",
  });
  response.end(body);
}

export function createScreeningEngineCoordinator({
  rootDirectory,
  stateDirectoryPath,
  childScriptPath,
  stallTimeoutMs = CHILD_STALL_TIMEOUT_MS,
  watchdogIntervalMs = 5_000,
  maxStallRestarts = MAX_STALL_RESTARTS,
  maxUnexpectedRestarts = MAX_UNEXPECTED_RESTARTS,
  maximumConcurrency = recommendedScreeningConcurrency(),
}) {
  const stateDirectory =
    stateDirectoryPath ?? join(rootDirectory, "data", "state", "screening-engine");
  const childScript =
    childScriptPath ?? join(rootDirectory, "scripts", "screening-engine-child.ts");
  const jobs = new Map();
  const concurrency = Math.max(1, Math.floor(maximumConcurrency));
  let hydrationPromise;

  function activeChildCount() {
    return [...jobs.values()].filter((candidate) => candidate.child).length;
  }

  function startQueuedJobs() {
    while (activeChildCount() < concurrency) {
      const next = [...jobs.values()].find(
        (candidate) =>
          candidate.status === "queued" &&
          !candidate.child &&
          !candidate.cancelled,
      );
      if (!next) return;
      startChild(next);
    }
  }

  function restoredJob(jobId, directory, requestPayload, completed, cancelled) {
    const sharedDirectory = requestPayload.sharedBarsPath
      ? dirname(requestPayload.sharedBarsPath)
      : undefined;
    return {
      jobId,
      directory,
      status: completed ? "completed" : cancelled ? "cancelled" : "queued",
      progress: undefined,
      validationProgress: undefined,
      error: undefined,
      child: null,
      cancelled,
      restartCount: 0,
      stallRestartCount: 0,
      unexpectedRestartCount: 0,
      stallRestartRequested: false,
      lastHeartbeatAt: Date.now(),
      engine: undefined,
      sharedDirectory,
      updatedAt: Date.now(),
    };
  }

  async function pathExists(path) {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }

  async function reconcileCompletedResult(job) {
    if (job.cancelled || job.status === "completed") return;
    if (!(await pathExists(join(job.directory, "result.json")))) return;
    job.status = "completed";
    job.error = undefined;
    job.updatedAt = Date.now();
    // A result can be committed by a child that outlived a previous relay.
    // Stop any duplicate work still owned by this relay after accepting the
    // durable, atomically-published result as the source of truth.
    job.child?.kill();
  }

  async function hydrateSubmittedBatches() {
    await mkdir(stateDirectory, { recursive: true });
    let entries = [];
    try {
      entries = await readdir(stateDirectory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith("batch-")) continue;
      let manifest;
      try {
        manifest = JSON.parse(
          await readFile(
            join(stateDirectory, entry.name, BATCH_MANIFEST_FILE),
            "utf8",
          ),
        );
      } catch {
        continue;
      }
      if (manifest?.version !== 1 || !Array.isArray(manifest.jobIds)) continue;
      for (const jobId of manifest.jobIds) {
        if (typeof jobId !== "string" || !/^[a-f0-9]{24}$/.test(jobId)) continue;
        const directory = join(stateDirectory, jobId);
        let requestPayload;
        try {
          requestPayload = JSON.parse(
            await readFile(join(directory, "request.json"), "utf8"),
          );
        } catch {
          continue;
        }
        const completed = await pathExists(join(directory, "result.json"));
        const cancelled = await pathExists(
          join(directory, CANCELLED_MARKER_FILE),
        );
        if (!jobs.has(jobId)) {
          jobs.set(
            jobId,
            restoredJob(jobId, directory, requestPayload, completed, cancelled),
          );
        }
      }
    }
    startQueuedJobs();
  }

  hydrationPromise = hydrateSubmittedBatches();

  async function pruneOldJobs() {
    const now = Date.now();
    const activeSharedDirectories = new Set(
      [...jobs.values()]
        .filter((job) => job.child || job.status === "queued" || job.status === "running")
        .map((job) => job.sharedDirectory)
        .filter(Boolean),
    );
    for (const [jobId, job] of jobs) {
      if (job.child || now - job.updatedAt <= JOB_RETENTION_MS) continue;
      jobs.delete(jobId);
      await rm(job.directory, { recursive: true, force: true });
    }
    let entries = [];
    try {
      entries = await readdir(stateDirectory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (
        !entry.isDirectory() ||
        jobs.has(entry.name) ||
        activeSharedDirectories.has(join(stateDirectory, entry.name))
      ) continue;
      const directory = join(stateDirectory, entry.name);
      try {
        const metadata = await stat(directory);
        if (now - metadata.mtimeMs > JOB_RETENTION_MS) {
          await rm(directory, { recursive: true, force: true });
        }
      } catch {
        // A concurrent cleanup or process may already have removed the entry.
      }
    }
  }

  function startChild(job) {
    if (job.child || job.cancelled) return;
    if (activeChildCount() >= concurrency) {
      job.status = "queued";
      return;
    }
    job.status = "running";
    job.updatedAt = Date.now();
    job.lastHeartbeatAt = Date.now();
    const child = spawn(
      process.execPath,
      ["--import", "tsx", childScript, job.directory],
      {
        cwd: rootDirectory,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    job.child = child;
    const watchdog = setInterval(() => {
      if (!job.child || Date.now() - job.lastHeartbeatAt <= stallTimeoutMs) {
        return;
      }
      job.stallRestartRequested = true;
      job.stallRestartCount += 1;
      job.child.kill();
    }, watchdogIntervalMs);
    watchdog.unref();
    let stdoutBuffer = "";
    let stderr = "";
    const consumeLine = (line) => {
      if (!line.trim()) return;
      try {
        const event = JSON.parse(line);
        if (event.type === "optimization-progress") {
          job.progress = event.progress;
          job.stallRestartCount = 0;
          job.unexpectedRestartCount = 0;
        } else if (event.type === "validation-progress") {
          job.validationProgress = event.progress;
        } else if (event.type === "completed") {
          job.status = "completed";
        } else if (event.type === "telemetry") {
          job.engine = {
            ...event.status,
            checkpointBytes:
              event.status.checkpointBytes ?? job.engine?.checkpointBytes,
            checkpointWriteMilliseconds:
              event.status.checkpointWriteMilliseconds ??
              job.engine?.checkpointWriteMilliseconds,
          };
        } else if (event.type === "error") {
          job.status = "error";
          job.error = { code: event.code, message: event.message };
        }
        job.updatedAt = Date.now();
        job.lastHeartbeatAt = job.updatedAt;
      } catch {
        // Ignore non-protocol child output while retaining stderr diagnostics.
      }
    };
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk;
      let newline = stdoutBuffer.indexOf("\n");
      while (newline >= 0) {
        consumeLine(stdoutBuffer.slice(0, newline));
        stdoutBuffer = stdoutBuffer.slice(newline + 1);
        newline = stdoutBuffer.indexOf("\n");
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-8_192);
    });
    child.on("error", (error) => {
      clearInterval(watchdog);
      job.child = null;
      job.status = "error";
      job.error = { message: error.message };
      job.updatedAt = Date.now();
      setImmediate(startQueuedJobs);
    });
    child.on("exit", (code) => {
      clearInterval(watchdog);
      consumeLine(stdoutBuffer);
      job.child = null;
      job.updatedAt = Date.now();
      if (job.cancelled) {
        job.status = "cancelled";
        setImmediate(startQueuedJobs);
        return;
      }
      if (job.status === "completed") {
        setImmediate(startQueuedJobs);
        return;
      }
      if (job.stallRestartRequested) {
        job.stallRestartRequested = false;
        if (job.stallRestartCount > maxStallRestarts) {
          job.status = "error";
          job.error = { message: "Screening child repeatedly stopped making progress" };
          setImmediate(startQueuedJobs);
          return;
        }
        job.restartCount += 1;
        setImmediate(() => startChild(job));
        return;
      }
      if (code === RESTART_EXIT_CODE) {
        job.restartCount += 1;
        setImmediate(() => startChild(job));
        return;
      }
      if (job.status !== "completed" && job.status !== "error") {
        if (job.unexpectedRestartCount < maxUnexpectedRestarts) {
          job.unexpectedRestartCount += 1;
          job.restartCount += 1;
          setImmediate(() => startChild(job));
          return;
        }
        job.status = "error";
        job.error = {
          message: stderr.trim() || `Screening child exited with code ${code}`,
        };
      }
      setImmediate(startQueuedJobs);
    });
  }

  async function restoreOrCreateJob(
    requestPayload,
    packedBars,
    sharedBarsPath,
    sharedDerivedPath,
  ) {
    await mkdir(stateDirectory, { recursive: true });
    await pruneOldJobs();
    const jobId = jobIdFor(requestPayload);
    const directory = join(stateDirectory, jobId);
    await mkdir(directory, { recursive: true });
    const requestPath = join(directory, "request.json");
    const barsPath = join(directory, "bars.bin");
    const temporaryPath = join(directory, `request-${randomUUID()}.tmp`);
    const persistedRequest = {
      ...requestPayload,
      bars: undefined,
      sharedBarsPath,
      sharedDerivedPath,
    };
    if (!sharedBarsPath) {
      const barsTemporaryPath = join(directory, `bars-${randomUUID()}.tmp`);
      await writeFile(barsTemporaryPath, serialize(packedBars));
      await rename(barsTemporaryPath, barsPath);
    }
    await writeFile(temporaryPath, JSON.stringify(persistedRequest));
    await rename(temporaryPath, requestPath);
    let job = jobs.get(jobId);
    if (!job) {
      let completed = false;
      try {
        await stat(join(directory, "result.json"));
        completed = true;
      } catch {
        completed = false;
      }
      job = restoredJob(jobId, directory, persistedRequest, completed, false);
      jobs.set(jobId, job);
    } else {
      await reconcileCompletedResult(job);
    }
    if (sharedBarsPath) {
      job.sharedDirectory = dirname(sharedBarsPath);
    }
    if (job.status !== "completed" && !job.child) {
      await rm(join(directory, CANCELLED_MARKER_FILE), { force: true });
      job.cancelled = false;
      job.error = undefined;
      startChild(job);
    }
    return job;
  }

  async function snapshot(job) {
    return {
      jobId: job.jobId,
      status: job.status,
      progress: job.progress,
      validationProgress: job.validationProgress,
      engine: job.engine
        ? { ...job.engine, restartCount: job.restartCount }
        : undefined,
      error: job.error,
    };
  }

  return {
    health: {
      screeningEngine: true,
      screeningEngineVersion: 4,
      screeningConcurrency: concurrency,
    },
    async handle(request, response) {
      if (!request.url?.startsWith("/screening/")) return false;
      await hydrationPromise;
      if (!isLoopbackRequest(request)) {
        writeJson(request, response, 403, { error: "LOOPBACK_REQUIRED" });
        return true;
      }
      if (request.method === "OPTIONS") {
        writeJson(request, response, 204, {});
        return true;
      }
      if (request.method === "POST" && request.url === "/screening/jobs") {
        try {
          const { payload, packedBars } = await readJobBody(request);
          if (
            payload?.version !== 4 ||
            !Array.isArray(packedBars?.times) ||
            packedBars.times.length === 0 ||
            typeof payload?.checkpoint?.key !== "string" ||
            typeof payload?.checkpoint?.signature !== "string"
          ) {
            writeJson(request, response, 400, { error: "INVALID_JOB" });
            return true;
          }
          const job = await restoreOrCreateJob(payload, packedBars);
          writeJson(request, response, 202, { jobId: job.jobId });
        } catch (error) {
          writeJson(request, response, 500, {
            error: error instanceof Error ? error.message : "JOB_START_FAILED",
          });
        }
        return true;
      }
      if (request.method === "POST" && request.url === "/screening/job-batches") {
        try {
          const { payload, packedBars } = await readJobBody(request);
          if (
            payload?.version !== 4 ||
            !Array.isArray(packedBars?.times) ||
            packedBars.times.length === 0 ||
            !Array.isArray(payload?.jobs) ||
            payload.jobs.length === 0 ||
            payload.jobs.length > MAX_BATCH_JOBS
          ) {
            writeJson(request, response, 400, { error: "INVALID_JOB_BATCH" });
            return true;
          }
          for (const unit of payload.jobs) {
            if (
              unit?.version !== 4 ||
              !Number.isInteger(unit?.barCount) ||
              unit.barCount <= 0 ||
              unit.barCount > packedBars.times.length ||
              typeof unit?.checkpoint?.key !== "string" ||
              typeof unit?.checkpoint?.signature !== "string"
            ) {
              writeJson(request, response, 400, { error: "INVALID_JOB_BATCH_UNIT" });
              return true;
            }
          }
          const batchId = createHash("sha256")
            .update(
              payload.jobs
                .map((unit) => `${unit.checkpoint.key}|${unit.checkpoint.signature}`)
                .join("\n"),
            )
            .digest("hex")
            .slice(0, 24);
          const batchDirectory = join(stateDirectory, `batch-${batchId}`);
          await mkdir(batchDirectory, { recursive: true });
          const sharedBarsPath = join(batchDirectory, "bars.bin");
          const sharedBarsTemporaryPath = join(
            batchDirectory,
            `bars-${randomUUID()}.tmp`,
          );
          await writeFile(sharedBarsTemporaryPath, serialize(packedBars));
          await rename(sharedBarsTemporaryPath, sharedBarsPath);
          const batchManifestTemporaryPath = join(
            batchDirectory,
            `queue-${randomUUID()}.tmp`,
          );
          const batchJobIds = payload.jobs.map(jobIdFor);
          await writeFile(
            batchManifestTemporaryPath,
            JSON.stringify({ version: 1, jobIds: batchJobIds }),
          );
          await rename(
            batchManifestTemporaryPath,
            join(batchDirectory, BATCH_MANIFEST_FILE),
          );
          const jobIds = [];
          for (const unit of payload.jobs) {
            const job = await restoreOrCreateJob(
              unit,
              undefined,
              sharedBarsPath,
              join(batchDirectory, `derived-${unit.barCount}.bin`),
            );
            jobIds.push(job.jobId);
          }
          writeJson(request, response, 202, { jobIds });
        } catch (error) {
          writeJson(request, response, 500, {
            error: error instanceof Error ? error.message : "JOB_BATCH_START_FAILED",
          });
        }
        return true;
      }
      if (request.method === "POST" && request.url === "/screening/job-statuses") {
        try {
          const payload = await readJsonBody(request, 64 * 1024);
          const jobIds = Array.isArray(payload?.jobIds)
            ? [...new Set(payload.jobIds)]
            : [];
          if (
            payload?.version !== 4 ||
            jobIds.length === 0 ||
            jobIds.length > MAX_BATCH_JOBS ||
            jobIds.some((jobId) =>
              typeof jobId !== "string" || !/^[a-f0-9]{24}$/.test(jobId))
          ) {
            writeJson(request, response, 400, { error: "INVALID_JOB_IDS" });
            return true;
          }
          writeJson(request, response, 200, {
            jobs: await Promise.all(jobIds.map(async (jobId) => {
              const job = jobs.get(jobId);
              if (job) await reconcileCompletedResult(job);
              return job
                ? { jobId, status: job.status, error: job.error }
                : { jobId, status: "error", error: { message: "JOB_NOT_FOUND" } };
            })),
          });
        } catch (error) {
          writeJson(request, response, 400, {
            error: error instanceof Error ? error.message : "JOB_STATUS_READ_FAILED",
          });
        }
        return true;
      }
      const resultMatch = request.url.match(
        /^\/screening\/jobs\/([a-f0-9]{24})\/result$/,
      );
      if (resultMatch && request.method === "GET") {
        const job = jobs.get(resultMatch[1]);
        if (job) await reconcileCompletedResult(job);
        if (!job || job.status !== "completed") {
          writeJson(request, response, 404, { error: "RESULT_NOT_FOUND" });
          return true;
        }
        try {
          writeJson(
            request,
            response,
            200,
            JSON.parse(await readFile(join(job.directory, "result.json"), "utf8")),
          );
        } catch {
          writeJson(request, response, 500, { error: "RESULT_UNAVAILABLE" });
        }
        return true;
      }
      const match = request.url.match(/^\/screening\/jobs\/([a-f0-9]{24})$/);
      if (!match) {
        writeJson(request, response, 404, { error: "NOT_FOUND" });
        return true;
      }
      const job = jobs.get(match[1]);
      if (!job) {
        writeJson(request, response, 404, { error: "JOB_NOT_FOUND" });
        return true;
      }
      if (request.method === "GET") {
        await reconcileCompletedResult(job);
        writeJson(request, response, 200, await snapshot(job));
        return true;
      }
      if (request.method === "DELETE") {
        job.cancelled = true;
        job.status = "cancelled";
        await writeFile(join(job.directory, CANCELLED_MARKER_FILE), "");
        job.child?.kill();
        writeJson(request, response, 200, { cancelled: true });
        return true;
      }
      writeJson(request, response, 405, { error: "METHOD_NOT_ALLOWED" });
      return true;
    },
  };
}
