import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, open, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { cpus, freemem } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { replaceFileAtomically } from "../../scripts/atomic-file";
import { buildCheckpointIdentity } from "../../lib/analysis/screening-worker-client";
import { LOCAL_SCREENING_ENGINE_VERSION } from "../../lib/analysis/screening-local-engine-protocol";
import type { BacktestSettings } from "../../lib/analysis/backtest";
import type { MarketBar } from "../../lib/market/types";
import { needsHoldingScreen } from "./model";
import { futureCandidates, publishPrefetchedJob } from "./prefetch-pool";

const root = dirname(fileURLToPath(import.meta.url)), project = resolve(root, "../.."), gib = 1024 ** 3;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
async function bounded(path: string) {
  assert.ok((await stat(path)).size <= 16 * 1024 ** 2);
  return readFile(path, "utf8");
}
async function exists(path: string) {
  try { await stat(path); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}
let latest = JSON.parse(await bounded(join(root, "output/latest.json")));
for (let attempt = 0; attempt < 30 && latest.status !== "running"; attempt++) {
  if (latest.status === "complete") process.exit(0);
  await new Promise<void>(accept => setTimeout(accept, 1000));
  latest = JSON.parse(await bounded(join(root, "output/latest.json")));
}
assert.equal(latest.status, "running");
const data: string = latest.data, identity: string = latest.identity;
assert.equal(resolve(data), resolve(root, "data", identity));
const inputText = await bounded(join(data, "input.json"));
const input = JSON.parse(inputText) as { bars: MarketBar[]; settings: BacktestSettings };
const registry = JSON.parse(await bounded(join(data, "source_registry.jsonl")));
assert.equal(registry.inputHash, sha(inputText)); assert.equal(registry.identity, identity);
const codePaths = (await readdir(join(project, "lib/analysis"), { recursive: true })).filter(p => p.endsWith(".ts")).sort();
const codeHash = sha((await Promise.all([...codePaths.map(p => join(project, "lib/analysis", p)),
  join(root, "run.ts"), join(root, "model.ts"), join(root, "../nikkei-screening-skip-audit/model.ts"),
  join(project, "scripts/screening-engine-child.ts"), join(project, "scripts/atomic-file.ts")].map(bounded))).join("\n"));
assert.equal(codeHash, registry.codeHash, "Optimizer/execution identity changed; do not prefetch incompatible results");
const { bars } = input, start = bars.length - 2000;
const candidates = bars.flatMap((_, i) => i > start && needsHoldingScreen(bars, i, 1) ? [i] : []);
const requested = Number(process.env.QUANTSCOPE_PREFETCH_WORKERS ?? 5);
assert.ok(Number.isInteger(requested) && requested >= 1 && requested <= 6);
const concurrency = Math.min(requested, Math.max(1, cpus().length - 2), Math.max(1, Math.floor((freemem() - 8 * gib) / (3 * gib))));
const area = join(data, "prefetch"), lockPath = join(area, "owner.json"), owner = { pid: process.pid, token: randomUUID() };
await mkdir(join(area, "jobs"), { recursive: true });
try {
  const old = JSON.parse(await bounded(lockPath));
  let alive = false;
  try { process.kill(old.pid, 0); alive = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
  assert.equal(alive, false, `Prefetch owner ${old.pid} already exists`);
  await unlink(lockPath); // Remove only an abandoned process-ownership marker, never job/raw data.
} catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
const lock = await open(lockPath, "wx"); await lock.writeFile(JSON.stringify(owner)); await lock.close();
let stopping = false, published = 0, collisions = 0;
const active = new Map<number, { pid?: number; stage?: string; rss?: number }>();
const completed = new Set<number>(), attempts = new Map<number, number>();
const errors: Array<{ index: number; message: string }> = [];
const delay = (ms: number) => new Promise<void>(accept => setTimeout(accept, ms));
process.on("SIGINT", () => { stopping = true; }); process.on("SIGTERM", () => { stopping = true; });
async function readProgress() {
  const state = JSON.parse(await bounded(join(data, "progress.json")));
  assert.equal(state.identity, identity);
  if (state.status !== "running") stopping = true;
  return state as { status: string; state: { index: number } };
}
async function status() {
  const state = { identity, owner, concurrency, maximumTotalScreeningChildren: concurrency + 1, lookaheadCandidates: 32,
    updatedAt: new Date().toISOString(), status: stopping ? "stopped" : "running", published, collisions,
    active: [...active].map(([index, value]) => ({ index, time: bars[index].time, ...value })), errors };
  const path = join(area, "status.json"); await writeFile(`${path}.tmp`, JSON.stringify(state));
  await replaceFileAtomically(`${path}.tmp`, path);
}
function requestAt(index: number) {
  const prefix = bars.slice(0, index + 1);
  const settings = { initialCash: input.settings.initialCash, commissionRate: input.settings.commissionRate,
    slippageRate: input.settings.slippageRate, interval: "1d" as const, executionPolicy: input.settings.executionPolicy,
    startTime: bars[index - 9].time, endTime: bars[index].time };
  const config = { mode: "sample" as const, periods: [{ sessions: 10, weight: 100 }] };
  const options = { objective: "totalReturn" as const, maxCombinationStrategies: 6 as const,
    checkpointNamespace: `cycle:holding-rescreen:${identity}:${index}:10` };
  return { version: LOCAL_SCREENING_ENGINE_VERSION, settings, config,
    checkpoint: buildCheckpointIdentity(prefix, settings, config, options),
    options: { objective: options.objective, maxCombinationStrategies: 6 }, barCount: index + 1, sharedBarsPath: join(data, "bars.bin") };
}
async function compute(index: number) {
  const job = join(area, "jobs", String(index)), destination = join(data, "jobs", String(index));
  const request = requestAt(index); await mkdir(job, { recursive: true });
  const requestPath = join(job, "request.json");
  if (await exists(requestPath)) assert.deepEqual(JSON.parse(await bounded(requestPath)), request);
  else await writeFile(requestPath, JSON.stringify(request));
  for (let restart = 0; restart < 4096 && !stopping; restart++) {
    if (await exists(destination)) { collisions++; return; }
    if (await exists(join(job, "result.json"))) break;
    const exit = await new Promise<{ code: number | null; superseded: boolean }>((accept, reject) => {
      const child = spawn(process.execPath, ["--import", "tsx", join(project, "scripts/screening-engine-child.ts"), job],
        { cwd: project, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      active.set(index, { pid: child.pid });
      const log = createWriteStream(join(job, "child.jsonl"), { flags: "a" });
      let buffer = "", superseded = false, polling = false;
      const watch = setInterval(() => {
        if (polling) return; polling = true;
        void (async () => {
          try {
            await readProgress();
            if (stopping || await exists(destination)) { superseded = true; child.kill(); }
          } catch (error) { stopping = true; errors.push({ index, message: String(error) }); child.kill(); }
          finally { polling = false; }
        })();
      }, 1000);
      child.stdout.on("data", (chunk: Buffer) => {
        log.write(chunk); buffer += chunk.toString(); const lines = buffer.split("\n"); buffer = lines.pop()!;
        for (const line of lines) {
          if (!line) continue;
          const event = JSON.parse(line), info = active.get(index)!;
          if (event.type === "optimization-progress") info.stage = event.progress.stage;
          if (event.type === "telemetry") {
            info.rss = event.status.residentBytes;
            if (info.rss! > 3 * gib) { stopping = true; errors.push({ index, message: "Child RSS exceeds 3GiB; checkpoints retained" }); child.kill(); }
          }
          if (event.type === "error") errors.push({ index, message: event.message });
        }
      });
      child.stderr.on("data", (chunk: Buffer) => log.write(chunk));
      child.on("error", error => { clearInterval(watch); log.end(); reject(error); });
      child.on("exit", code => { clearInterval(watch); log.end(() => accept({ code, superseded })); });
    });
    if (exit.superseded || stopping) { collisions++; return; }
    if (exit.code === 75) continue;
    assert.equal(exit.code, 0, `Prefetch optimizer failed: ${bars[index].time}`); break;
  }
  if (stopping || !await exists(join(job, "result.json"))) return;
  if (await publishPrefetchedJob(data, index, request)) {
    published++; console.log(`Published ${bars[index].time}; ready=${published}; workers=${concurrency}`);
  } else collisions++;
}
const tasks = new Set<Promise<void>>();
console.log(`Prefetch ${concurrency} workers + 1 sequential account runner; identity=${identity}`);
try {
  while (!stopping) {
    const state = await readProgress();
    if (stopping) break;
    if (process.memoryUsage().rss > 1.5 * gib) throw new Error("Prefetch parent RSS bound exceeded");
    for (const index of futureCandidates(candidates, state.state.index)) {
      if (active.size >= concurrency || freemem() < 8 * gib) break;
      if (active.has(index) || completed.has(index) || await exists(join(data, "jobs", String(index)))) continue;
      if ((attempts.get(index) ?? 0) >= 3) continue;
      attempts.set(index, (attempts.get(index) ?? 0) + 1); active.set(index, {});
      const task = compute(index).then(() => { completed.add(index); }).catch(error => {
        errors.push({ index, message: String(error) }); console.error(`Prefetch ${index}: ${String(error)}`);
      }).finally(() => { active.delete(index); tasks.delete(task); });
      tasks.add(task);
    }
    await status(); await delay(1000);
  }
} finally {
  stopping = true; await Promise.allSettled(tasks); await status();
  const saved = JSON.parse(await bounded(lockPath)); assert.equal(saved.token, owner.token);
  await unlink(lockPath); // Only release this instance's ownership marker; retain all optimizer outputs.
}
