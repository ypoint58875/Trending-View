import assert from "node:assert/strict";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the QuantScope research workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/i);
  assert.match(html, /<title>QuantScope \| Market Strategy Lab<\/title>/i);
  assert.match(html, /QuantScope/);
  assert.match(html, /\u91cf\u5316\u7b56\u7565\u7814\u7a76\u53f0/);
  assert.match(html, /\u4e00\u952e\u7b5b\u9009/);
  assert.match(html, /\u7b56\u7565\u5b9e\u9a8c\u5ba4/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});
