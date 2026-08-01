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
  const initializedOutput = JSON.parse(initialized.stdout);
  assert.equal(initializedOutput.ok, true);
  assert.ok(initializedOutput.profile);
  assert.equal(typeof initializedOutput.resourceCount, "number");

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
  const handoffOutput = JSON.parse(handoff.stdout);
  assert.equal(handoffOutput.id, "W001");
  assert.match(handoffOutput.path.replaceAll("\\", "/"), /\.agent\/handoff\/records\/development\/W001-router-verification\.md$/u);

  const status = runCli(["status", "--project", project]);
  assert.equal(status.status, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).handoffCount, 1);

  const matched = runCli(["match", "--project", project, "--prompt", "Continue src/router.ts"]);
  assert.equal(matched.status, 0, matched.stderr);
  assert.equal(JSON.parse(matched.stdout).matches[0].entry.id, "W001");

  const index = JSON.parse(await readFile(join(project, ".agent", "handoff", "index.json"), "utf8"));
  assert.equal(index.entries.length, 1);
  assert.equal(index.schemaVersion, 2);
  assert.equal(index.entries[0].path, ".agent/handoff/records/development/W001-router-verification.md");

  const planInput = join(project, "plan.json");
  await writeFile(
    planInput,
    JSON.stringify({
      title: "Durable routing direction",
      summary: "Keep project routing deterministic across tasks.",
      successCriteria: ["A new task can locate relevant evidence."],
    }),
    "utf8",
  );
  const createdPlan = runCli([
    "plan",
    "--project",
    project,
    "--action",
    "create",
    "--input",
    planInput,
  ]);
  assert.equal(createdPlan.status, 0, createdPlan.stderr);
  assert.equal(JSON.parse(createdPlan.stdout).id, "P001");

  const acceptedPlan = runCli([
    "plan",
    "--project",
    project,
    "--action",
    "transition",
    "--id",
    "P001",
    "--status",
    "accepted",
    "--reason",
    "Direction approved for phase two.",
  ]);
  assert.equal(acceptedPlan.status, 0, acceptedPlan.stderr);
  assert.equal(JSON.parse(acceptedPlan.stdout).status, "accepted");

  const listedPlans = runCli(["plan", "--project", project, "--action", "list"]);
  assert.equal(listedPlans.status, 0, listedPlans.stderr);
  assert.equal(JSON.parse(listedPlans.stdout).plans[0].status, "accepted");
});

function runCli(arguments_) {
  return spawnSync(process.execPath, [cli, ...arguments_], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}
