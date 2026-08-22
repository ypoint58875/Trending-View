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
import { join } from "node:path";

const MAX_REQUEST_BYTES = 64 * 1024 * 1024;
const RESTART_EXIT_CODE = 75;
const JOB_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

async function readJsonBody(request, maximumBytes = MAX_REQUEST_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes) throw new Error("Request body is too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
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

export function createScreeningEngineCoordinator({ rootDirectory }) {
  const stateDirectory = join(
    rootDirectory,
    "data",
    "state",
    "screening-engine",
  );
  const childScript = join(
    rootDirectory,
    "scripts",
    "screening-engine-child.ts",
  );
  const jobs = new Map();

  function startNextJob() {
    const next = [...jobs.values()].find(
      (candidate) =>
        candidate.status === "queued" &&
        !candidate.child &&
        !candidate.cancelled,
    );
    if (next) startChild(next);
  }

  async function pruneOldJobs() {
    const now = Date.now();
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
      if (!entry.isDirectory() || jobs.has(entry.name)) continue;
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
    if ([...jobs.values()].some((candidate) => candidate.child)) {
      job.status = "queued";
      return;
    }
    job.status = "running";
    job.updatedAt = Date.now();
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
    let stdoutBuffer = "";
    let stderr = "";
    const consumeLine = (line) => {
      if (!line.trim()) return;
      try {
        const event = JSON.parse(line);
        if (event.type === "optimization-progress") {
          job.progress = event.progress;
        } else if (event.type === "validation-progress") {
          job.validationProgress = event.progress;
        } else if (event.type === "completed") {
          job.status = "completed";
        } else if (event.type === "error") {
          job.status = "error";
          job.error = { code: event.code, message: event.message };
        }
        job.updatedAt = Date.now();
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
      job.child = null;
      job.status = "error";
      job.error = { message: error.message };
      job.updatedAt = Date.now();
      setImmediate(startNextJob);
    });
    child.on("exit", (code) => {
      consumeLine(stdoutBuffer);
      job.child = null;
      job.updatedAt = Date.now();
      if (job.cancelled) {
        job.status = "cancelled";
        setImmediate(startNextJob);
        return;
      }
      if (code === RESTART_EXIT_CODE) {
        setImmediate(() => startChild(job));
        return;
      }
      if (job.status !== "completed" && job.status !== "error") {
        job.status = "error";
        job.error = {
          message: stderr.trim() || `Screening child exited with code ${code}`,
        };
      }
      setImmediate(startNextJob);
    });
  }

  async function restoreOrCreateJob(requestPayload) {
    await mkdir(stateDirectory, { recursive: true });
    await pruneOldJobs();
    const jobId = jobIdFor(requestPayload);
    const directory = join(stateDirectory, jobId);
    await mkdir(directory, { recursive: true });
    const requestPath = join(directory, "request.json");
    const temporaryPath = join(directory, `request-${randomUUID()}.tmp`);
    await writeFile(temporaryPath, JSON.stringify(requestPayload));
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
      job = {
        jobId,
        directory,
        status: completed ? "completed" : "queued",
        progress: undefined,
        validationProgress: undefined,
        error: undefined,
        child: null,
        cancelled: false,
        updatedAt: Date.now(),
      };
      jobs.set(jobId, job);
    }
    if (job.status !== "completed" && !job.child) {
      job.cancelled = false;
      job.error = undefined;
      startChild(job);
    }
    return job;
  }

  async function snapshot(job) {
    let outcome;
    if (job.status === "completed") {
      try {
        outcome = JSON.parse(
          await readFile(join(job.directory, "result.json"), "utf8"),
        );
      } catch (error) {
        job.status = "error";
        job.error = {
          message:
            error instanceof Error
              ? error.message
              : "Completed result is unavailable",
        };
      }
    }
    return {
      jobId: job.jobId,
      status: job.status,
      progress: job.progress,
      validationProgress: job.validationProgress,
      outcome,
      error: job.error,
    };
  }

  return {
    health: { screeningEngine: true, screeningEngineVersion: 1 },
    async handle(request, response) {
      if (!request.url?.startsWith("/screening/")) return false;
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
          const payload = await readJsonBody(request);
          if (
            payload?.version !== 1 ||
            !Array.isArray(payload?.bars) ||
            typeof payload?.checkpoint?.key !== "string" ||
            typeof payload?.checkpoint?.signature !== "string"
          ) {
            writeJson(request, response, 400, { error: "INVALID_JOB" });
            return true;
          }
          const job = await restoreOrCreateJob(payload);
          writeJson(request, response, 202, { jobId: job.jobId });
        } catch (error) {
          writeJson(request, response, 500, {
            error: error instanceof Error ? error.message : "JOB_START_FAILED",
          });
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
        writeJson(request, response, 200, await snapshot(job));
        return true;
      }
      if (request.method === "DELETE") {
        job.cancelled = true;
        job.status = "cancelled";
        job.child?.kill();
        writeJson(request, response, 200, { cancelled: true });
        return true;
      }
      writeJson(request, response, 405, { error: "METHOD_NOT_ALLOWED" });
      return true;
    },
  };
}
