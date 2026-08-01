import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const cli = resolve("dist", "cli", "main.js");

test("CLI initializes, records, reports, and matches project context", async () => {
  const project = await mkdtemp(join(tmpdir(), "codex-project-context-cli-"));
  const initialized = runCli(["init", "--project", project]);
  assert.equal(initialized.status, 0, initialized.stderr);
  assert.equal(JSON.parse(initialized.stdout).ok, true);

  const handoffInput = join(project, "handoff.json");
  await writeFile(
    handoffInput,
    JSON.stringify({
      title: "Router verification",
      summary: "Verified the router entry point.",
      modules: ["router"],
      files: ["src/router.ts"],
      sections: { verification: "Focused test passed." },
    }),
    "utf8",
  );

  const handoff = runCli(["handoff", "--project", project, "--input", handoffInput]);
  assert.equal(handoff.status, 0, handoff.stderr);
  assert.equal(JSON.parse(handoff.stdout).id, "W001");

  const status = runCli(["status", "--project", project]);
  assert.equal(status.status, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).handoffCount, 1);

  const matched = runCli(["match", "--project", project, "--prompt", "Continue src/router.ts"]);
  assert.equal(matched.status, 0, matched.stderr);
  assert.equal(JSON.parse(matched.stdout).matches[0].entry.id, "W001");

  const index = JSON.parse(await readFile(join(project, ".agent", "handoff", "index.json"), "utf8"));
  assert.equal(index.entries.length, 1);
});

function runCli(arguments_) {
  return spawnSync(process.execPath, [cli, ...arguments_], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

