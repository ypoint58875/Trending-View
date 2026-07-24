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
  assert.match(html, /\u6700\u65b0\u7b56\u7565\u5efa\u8bae/);
  assert.match(html, /\u7eff\u8272\uff1a\u4e0a\u6da8/);
  assert.match(html, /\u7ea2\u8272\uff1a\u4e0b\u8dcc/);
  assert.match(html, /\u6bcf 60 \u79d2\u81ea\u52a8\u5237\u65b0/);
  assert.match(html, /\u56de\u6d4b\u5feb\u6377\u680f/);
  assert.match(html, />\u4fdd\u5b58</);
  assert.match(html, /\u65e5\u7ecf 225/);
  assert.match(
    html,
    /\u904d\u5386\u5168\u90e8 32 \u7c7b\u7b56\u7565\u7684\u53c2\u6570\u7f51\u683c/,
  );
  assert.match(html, /value="2500"/);
  assert.match(html, /\u4f18\u5316\u76ee\u6807/);
  assert.match(html, /\u6536\u76ca\u56de\u64a4\u7ec4\u5408/);
  assert.match(html, /\u6700\u5927\u6536\u76ca/);
  assert.match(html, /\u6700\u5c0f\u56de\u64a4/);
  assert.match(html, /\u6700\u5927\u590f\u666e/);
  assert.ok(
    html.indexOf("\u56de\u6d4b\u5feb\u6377\u680f") <
      html.indexOf("\u7b56\u7565\u5b9e\u9a8c\u5ba4"),
  );
  assert.match(html, /Channel BreakOut/);
  assert.match(html, /Technical Ratings/);
  assert.match(html, /\u4ec5\u505a\u591a/);
  assert.doesNotMatch(
    html,
    /\u505a\u7a7a|\u591a\u7a7a|\-1 \u7a7a/,
  );
  assert.match(html, /Stoch RSI/);
  assert.match(html, /Supertrend/);
  assert.doesNotMatch(
    html,
    /\u641c\u7d22\u80a1\u7968|\u4e2a\u80a1|688484/,
  );
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});
