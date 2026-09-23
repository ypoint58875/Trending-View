import assert from "node:assert/strict";
import test from "node:test";
import {
  replaceFileAtomically,
  type AtomicFileOperations,
} from "../scripts/atomic-file";

function fileError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

test("replaces an existing file through a recoverable backup after Windows EPERM", async () => {
  const files = new Map<string, string>([
    ["manifest.tmp", "new"],
    ["manifest.json", "old"],
  ]);
  let directFailures = 0;
  const operations: AtomicFileOperations = {
    async rename(source, target) {
      if (source === "manifest.tmp" && target === "manifest.json" && directFailures < 2) {
        directFailures += 1;
        throw fileError("EPERM");
      }
      const value = files.get(source);
      if (value === undefined) throw fileError("ENOENT");
      if (files.has(target)) throw fileError("EPERM");
      files.delete(source);
      files.set(target, value);
    },
    async rm(path) {
      files.delete(path);
    },
    async wait() {},
  };

  await replaceFileAtomically("manifest.tmp", "manifest.json", {
    operations,
    attempts: 2,
  });

  assert.equal(files.get("manifest.json"), "new");
  assert.equal(
    [...files.keys()].some((path) => path.includes(".backup-")),
    false,
  );
});

test("restores the previous target when publishing the replacement fails", async () => {
  const files = new Map<string, string>([
    ["manifest.tmp", "new"],
    ["manifest.json", "old"],
  ]);
  let targetWasMoved = false;
  const operations: AtomicFileOperations = {
    async rename(source, target) {
      if (source === "manifest.json" && target.includes(".backup-")) {
        const value = files.get(source);
        assert.ok(value);
        files.delete(source);
        files.set(target, value);
        targetWasMoved = true;
        return;
      }
      if (source === "manifest.tmp" && target === "manifest.json") {
        throw fileError(targetWasMoved ? "EIO" : "EPERM");
      }
      if (source.includes(".backup-") && target === "manifest.json") {
        const value = files.get(source);
        assert.ok(value);
        files.delete(source);
        files.set(target, value);
        return;
      }
      throw fileError("ENOENT");
    },
    async rm(path) {
      files.delete(path);
    },
    async wait() {},
  };

  await assert.rejects(
    replaceFileAtomically("manifest.tmp", "manifest.json", {
      operations,
      attempts: 1,
    }),
    { code: "EIO" },
  );
  assert.equal(files.get("manifest.json"), "old");
  assert.equal(files.get("manifest.tmp"), "new");
});
