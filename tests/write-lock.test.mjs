import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { makeTempDirectory } from "./helpers/temp-directory.mjs";

// Exercise the real lock implementation with acquisition errors; no test-only
// production parameters or changes to the lock body are needed.
async function lockWithDeniedAcquisitions(count) {
  let source = await readFile("dist/infrastructure/project-write-lock.js", "utf8");
  source = source.replace(/import \{ open, readFile, rm, stat \} from "node:fs\/promises";/u, `
    import { open as actualOpen, readFile, rm, stat } from 'node:fs/promises';
    let remaining = ${count};
    async function open(...args) {
      if (remaining-- > 0) throw Object.assign(new Error('acquisition denied'), {code:'EPERM'});
      return actualOpen(...args);
    }
  `).replace('"./files.js"', JSON.stringify(pathToFileURL(resolve("dist/infrastructure/files.js")).href));
  assert.match(source, /open as actualOpen/);
  return (await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)).withProjectWriteLock;
}

test("Windows lock creation retries transient EPERM without running the action twice", { skip: process.platform !== "win32" }, async () => {
  const lock = await lockWithDeniedAcquisitions(2);
  const root = await makeTempDirectory("project-lock-transient-");
  let called = 0;
  assert.equal(await lock(root, async () => ++called), 1);
  assert.equal(called, 1);
  assert.deepEqual(await readdir(join(root, ".agent")), []);
});

test("Windows persistent EPERM remains an error and never executes the protected action", { skip: process.platform !== "win32" }, async () => {
  const lock = await lockWithDeniedAcquisitions(1000000);
  const root = await makeTempDirectory("project-lock-permission-");
  let called = false;
  const start = Date.now();
  await assert.rejects(lock(root, async () => { called = true; }), { code: "EPERM" });
  assert.equal(called, false);
  assert.ok(Date.now() - start < 15000, "Permission denial must remain bounded");
  assert.deepEqual(await readdir(join(root, ".agent")), []);
});
