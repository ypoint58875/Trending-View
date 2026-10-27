import assert from "node:assert/strict";
import test from "node:test";
import {
  LocalScreeningEngineProtocolError,
  LocalScreeningEngineSubmissionError,
  enqueueScreeningBatchInLocalEngine,
  waitForScreeningBatchInLocalEngine,
} from "../lib/analysis/screening-local-engine-client";
import { LOCAL_SCREENING_ENGINE_VERSION, type LocalScreeningJobBatchUnit } from "../lib/analysis/screening-local-engine-protocol";

function batchUnits(count: number): LocalScreeningJobBatchUnit[] {
  return Array.from({ length: count }, (_, index) => ({ version: LOCAL_SCREENING_ENGINE_VERSION,
    settings: { initialCash: 100000, commissionRate: 0, slippageRate: 0, interval: "1d" },
    config: { mode: "sample", periods: [{ sessions: 10, weight: 100 }] },
    checkpoint: { key: `batch-${index}`, signature: `batch-${index}` }, options: {}, barCount: 1 }));
}

test("ordinary cycle uploads use bounded chunks and preserve deterministic job order", async context => {
  const sizes: number[] = [];
  context.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    const body = init!.body as ArrayBuffer, length = new DataView(body).getUint32(0, true);
    const request = JSON.parse(new TextDecoder().decode(new Uint8Array(body, 4, length)));
    sizes.push(request.jobs.length);
    return new Response(JSON.stringify({ jobIds: request.jobs.map((job: LocalScreeningJobBatchUnit) => job.checkpoint.key) }), { status: 202 });
  });
  const jobs = batchUnits(131);
  assert.deepEqual(await enqueueScreeningBatchInLocalEngine([], jobs), jobs.map(job => job.checkpoint.key));
  assert.deepEqual(sizes, [64, 64, 3]);
});

test("batch submission preserves coordinator HTTP failures instead of masking their cause", async context => {
  context.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ error: "INVALID_JOB_BATCH_UNIT" }), { status: 400 }));
  await assert.rejects(enqueueScreeningBatchInLocalEngine([], batchUnits(1)), error =>
    error instanceof LocalScreeningEngineSubmissionError && error.status === 400 && error.detail === "INVALID_JOB_BATCH_UNIT");
});

test("partial batch failure is safely repeatable and cancellation stops later chunks", async context => {
  let calls = 0;
  context.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    calls++;
    if (calls === 2) return new Response(JSON.stringify({ error: "JOB_BATCH_START_FAILED" }), { status: 500 });
    const body = init!.body as ArrayBuffer, length = new DataView(body).getUint32(0, true);
    const request = JSON.parse(new TextDecoder().decode(new Uint8Array(body, 4, length)));
    return new Response(JSON.stringify({ jobIds: request.jobs.map((job: LocalScreeningJobBatchUnit) => job.checkpoint.key) }), { status: 202 });
  });
  const jobs = batchUnits(131);
  const persisted: Array<{ offset: number; count: number }> = [];
  await assert.rejects(enqueueScreeningBatchInLocalEngine([], jobs, undefined, (ids, offset) => {
    persisted.push({ offset, count: ids.length });
  }), LocalScreeningEngineSubmissionError);
  assert.deepEqual(persisted, [{ offset: 0, count: 64 }]);
  assert.equal(calls, 2);
  assert.deepEqual(await enqueueScreeningBatchInLocalEngine([], jobs), jobs.map(job => job.checkpoint.key));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(enqueueScreeningBatchInLocalEngine([], jobs, controller.signal), { name: "AbortError" });
  assert.equal(calls, 5);
  const paused = new AbortController();
  await assert.rejects(enqueueScreeningBatchInLocalEngine([], jobs, paused.signal, () => paused.abort()), { name: "AbortError" });
  assert.equal(calls, 6);
});

test("batch collection stops on an incompatible coordinator protocol", async (context) => {
  const fetchMock = context.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(JSON.stringify({ error: "INVALID_JOB_STATUS_REQUEST" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
  );

  await assert.rejects(
    waitForScreeningBatchInLocalEngine(
      ["1234567890abcdef12345678"],
      {},
      async () => {},
    ),
    LocalScreeningEngineProtocolError,
  );
  assert.equal(fetchMock.mock.callCount(), 1);
});
