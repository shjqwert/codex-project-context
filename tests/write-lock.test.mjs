import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, readdir, utimes, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { makeTempDirectory } from "./helpers/temp-directory.mjs";
import { withProjectWriteLock } from "../dist/infrastructure/project-write-lock.js";

function projectLockPath(root) {
  return join(root, ".agent", ".project-context-write.lock");
}

function owner(pid, token = `owner-${pid}`) {
  return { token, pid, host: hostname(), createdAt: new Date(0).toISOString() };
}

async function exitedProcessId() {
  const child = spawn(process.execPath, ["-e", "process.exit(0)"], { stdio: "ignore" });
  const pid = child.pid;
  await once(child, "exit");
  assert.equal(typeof pid, "number");
  return pid;
}

async function delay(milliseconds) {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

// Exercise the real lock implementation with acquisition errors; no test-only
// production parameters or changes to the lock body are needed.
async function lockWithDeniedAcquisitions(count) {
  let source = await readFile("dist/infrastructure/project-write-lock.js", "utf8");
  source = source.replace(
    /import \{ link, lstat, mkdir, open, readFile, readdir, rename, rm \} from "node:fs\/promises";/u,
    `
      import { link, lstat, mkdir, open as actualOpen, readFile, readdir, rename, rm } from 'node:fs/promises';
      let remaining = ${count};
      async function open(...args) {
        if (remaining-- > 0) throw Object.assign(new Error('acquisition denied'), {code:'EPERM'});
        return actualOpen(...args);
      }
    `,
  ).replace('"./files.js"', JSON.stringify(pathToFileURL(resolve("dist/infrastructure/files.js")).href));
  assert.match(source, /open as actualOpen/);
  return (await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)).withProjectWriteLock;
}

test("a live legacy owner is never evicted because of lock age", async () => {
  const root = await makeTempDirectory("project-lock-live-legacy-");
  const lockPath = projectLockPath(root);
  await mkdir(join(root, ".agent"), { recursive: true });
  await writeFile(lockPath, `${JSON.stringify(owner(process.pid, "live-owner"))}\n`, "utf8");
  await utimes(lockPath, new Date(0), new Date(0));

  let called = false;
  await assert.rejects(
    withProjectWriteLock(root, async () => { called = true; }),
    /Timed out waiting for project-context write lock/,
  );
  assert.equal(called, false);
  assert.equal(JSON.parse(await readFile(lockPath, "utf8")).token, "live-owner");
});

test("a confirmed dead legacy owner is migrated to an immutable generation", async () => {
  const root = await makeTempDirectory("project-lock-dead-legacy-");
  const lockPath = projectLockPath(root);
  await mkdir(join(root, ".agent"), { recursive: true });
  await writeFile(lockPath, `${JSON.stringify(owner(await exitedProcessId(), "dead-owner"))}\n`, "utf8");

  assert.equal(await withProjectWriteLock(root, async () => "acquired"), "acquired");
  assert.deepEqual((await readdir(lockPath)).sort(), [
    "generation-1.pending",
    "generation-1.released",
  ]);
});

test("concurrent legacy recoverers never displace the new generation directory", async () => {
  const root = await makeTempDirectory("project-lock-concurrent-legacy-");
  const lockPath = projectLockPath(root);
  await mkdir(join(root, ".agent"), { recursive: true });
  await writeFile(lockPath, `${JSON.stringify(owner(await exitedProcessId(), "dead-legacy"))}\n`, "utf8");
  let active = 0;
  let maximumActive = 0;

  await Promise.all(Array.from({ length: 6 }, () => withProjectWriteLock(root, async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await delay(10);
    active -= 1;
  })));

  assert.equal(maximumActive, 1);
  assert.equal((await readdir(join(root, ".agent"))).filter((name) => name.startsWith(".project-context-write.lock")).length, 1);
});

test("orphan release markers cannot reuse a published generation number", async () => {
  const root = await makeTempDirectory("project-lock-orphan-release-");
  const lockPath = projectLockPath(root);
  await mkdir(lockPath, { recursive: true });
  await writeFile(join(lockPath, "generation-1.pending"), `${JSON.stringify(owner(await exitedProcessId()))}\n`, "utf8");
  await writeFile(join(lockPath, "generation-2.released"), "", "utf8");

  await withProjectWriteLock(root, async () => undefined);
  assert.ok((await readdir(lockPath)).includes("generation-3.pending"));
});

test("concurrent recoverers advance one dead generation without overlapping writers", async () => {
  const root = await makeTempDirectory("project-lock-dead-generation-");
  const lockPath = projectLockPath(root);
  await mkdir(lockPath, { recursive: true });
  await writeFile(
    join(lockPath, "generation-1.pending"),
    `${JSON.stringify(owner(await exitedProcessId(), "dead-generation"))}\n`,
    "utf8",
  );
  let active = 0;
  let maximumActive = 0;
  let completed = 0;

  const results = await Promise.all(Array.from({ length: 6 }, (_, index) =>
    withProjectWriteLock(root, async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await delay(10);
      active -= 1;
      completed += 1;
      return index;
    })));

  assert.deepEqual(results, [0, 1, 2, 3, 4, 5]);
  assert.equal(completed, 6);
  assert.equal(maximumActive, 1);
  const records = await readdir(lockPath);
  assert.equal(records.filter((name) => name.endsWith(".pending")).length, 7);
  assert.equal(records.filter((name) => name.endsWith(".released")).length, 6);
});

test("a failed protected action releases only its owned generation", async () => {
  const root = await makeTempDirectory("project-lock-action-failure-");
  await assert.rejects(
    withProjectWriteLock(root, async () => { throw new Error("action failed"); }),
    /action failed/,
  );
  assert.equal(await withProjectWriteLock(root, async () => "recovered"), "recovered");
  assert.deepEqual((await readdir(projectLockPath(root))).sort(), [
    "generation-1.pending",
    "generation-1.released",
    "generation-2.pending",
    "generation-2.released",
  ]);
});

test("Windows lock creation retries transient EPERM without running the action twice", { skip: process.platform !== "win32" }, async () => {
  const lock = await lockWithDeniedAcquisitions(2);
  const root = await makeTempDirectory("project-lock-transient-");
  let called = 0;
  assert.equal(await lock(root, async () => ++called), 1);
  assert.equal(called, 1);
  assert.deepEqual((await readdir(projectLockPath(root))).sort(), [
    "generation-1.pending",
    "generation-1.released",
  ]);
});

test("Windows persistent EPERM remains an error and never executes the protected action", { skip: process.platform !== "win32" }, async () => {
  const lock = await lockWithDeniedAcquisitions(1_000_000);
  const root = await makeTempDirectory("project-lock-permission-");
  let called = false;
  const start = Date.now();
  await assert.rejects(lock(root, async () => { called = true; }), { code: "EPERM" });
  assert.equal(called, false);
  assert.ok(Date.now() - start < 15_000, "Permission denial must remain bounded");
  assert.deepEqual(await readdir(projectLockPath(root)), []);
});
