import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import test from "node:test";
import { makeTempDirectory } from "./helpers/temp-directory.mjs";
import { withPromptInjectionReservation } from "../dist/hooks/prompt-injection-state.js";

async function exitedProcessId() {
  const child = spawn(process.execPath, ["-e", "process.exit(0)"], { stdio: "ignore" });
  const pid = child.pid;
  await once(child, "exit");
  assert.equal(typeof pid, "number");
  return pid;
}

function setStateRoot(testContext, directory) {
  const previous = process.env.CODEX_PROJECT_CONTEXT_HOOK_STATE_DIR;
  process.env.CODEX_PROJECT_CONTEXT_HOOK_STATE_DIR = directory;
  testContext.after(() => {
    if (previous === undefined) delete process.env.CODEX_PROJECT_CONTEXT_HOOK_STATE_DIR;
    else process.env.CODEX_PROJECT_CONTEXT_HOOK_STATE_DIR = previous;
  });
}

function reservationDirectory(stateRoot, sessionId, projectRoot) {
  const identity = `${sessionId}\0${resolve(projectRoot)}`;
  return join(stateRoot, createHash("sha256").update(identity).digest("hex"));
}

test("concurrent live Hook reservations emit at most once", async (testContext) => {
  const stateRoot = await makeTempDirectory("prompt-reservation-live-state-");
  const projectRoot = await makeTempDirectory("prompt-reservation-live-project-");
  setStateRoot(testContext, stateRoot);
  let startFirst;
  let finishFirst;
  const started = new Promise((resolveStarted) => { startFirst = resolveStarted; });
  const finish = new Promise((resolveFinish) => { finishFirst = resolveFinish; });
  let emissions = 0;

  const first = withPromptInjectionReservation("session-live", projectRoot, async () => {
    emissions += 1;
    startFirst();
    await finish;
  });
  await started;
  await withPromptInjectionReservation("session-live", projectRoot, async () => { emissions += 1; });
  assert.equal(emissions, 1);
  finishFirst();
  await first;
});

test("a failed Hook output releases its reservation for retry", async (testContext) => {
  const stateRoot = await makeTempDirectory("prompt-reservation-failure-state-");
  const projectRoot = await makeTempDirectory("prompt-reservation-failure-project-");
  setStateRoot(testContext, stateRoot);

  await assert.rejects(
    withPromptInjectionReservation("session-failure", projectRoot, async () => {
      throw new Error("output failed");
    }),
    /output failed/,
  );
  let retried = false;
  await withPromptInjectionReservation("session-failure", projectRoot, async () => { retried = true; });
  assert.equal(retried, true);
  assert.deepEqual((await readdir(reservationDirectory(stateRoot, "session-failure", projectRoot))).sort(), [
    "reservation-1.pending",
    "reservation-1.released",
    "reservation-2.pending",
    "reservation-2.released",
  ]);
});

test("concurrent Hooks recover one generation after a confirmed dead owner", async (testContext) => {
  const stateRoot = await makeTempDirectory("prompt-reservation-dead-state-");
  const projectRoot = await makeTempDirectory("prompt-reservation-dead-project-");
  setStateRoot(testContext, stateRoot);
  const directory = reservationDirectory(stateRoot, "session-dead", projectRoot);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "reservation-1.pending"),
    JSON.stringify({ pid: await exitedProcessId() }),
    "utf8",
  );
  let emissions = 0;

  await Promise.all(Array.from({ length: 8 }, () =>
    withPromptInjectionReservation("session-dead", projectRoot, async () => { emissions += 1; })));

  assert.equal(emissions, 1);
  assert.deepEqual((await readdir(directory)).filter((name) => name.startsWith("reservation-")).sort(), [
    "reservation-1.pending",
    "reservation-2.pending",
    "reservation-2.released",
  ]);
});
