import assert from "node:assert/strict";
import test from "node:test";
import {
  LocalScreeningEngineProtocolError,
  waitForScreeningBatchInLocalEngine,
} from "../lib/analysis/screening-local-engine-client";

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
