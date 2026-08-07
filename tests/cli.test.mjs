import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { buildTestProjectAnalysis } from "./helpers/project-analysis.mjs";

const cli = resolve("dist", "cli", "main.js");

test("CLI initializes, records, reports, and matches project context", async () => {
  const project = await mkdtemp(join(tmpdir(), "codex-project-context-cli-"));
  const inspected = runCli(["inspect", "--project", project]);
  assert.equal(inspected.status, 0, inspected.stderr);
  assert.match(JSON.parse(inspected.stdout).inventory.fingerprint, /^sha256:[a-f0-9]{64}$/u);
  const analysisJson = JSON.stringify(await buildTestProjectAnalysis(project));
  const initialized = runCli(["init", "--project", project, "--input", "-"], analysisJson);
  assert.equal(initialized.status, 0, initialized.stderr);
  const initializedOutput = JSON.parse(initialized.stdout);
  assert.equal(initializedOutput.ok, true);
  assert.ok(initializedOutput.profile);
  assert.equal(typeof initializedOutput.resourceCount, "number");

  const handoffInput = JSON.stringify({
    title: "Router verification",
    summary: "Verified the router entry point.",
    kind: "verification",
    modules: ["router"],
    files: ["src/router.ts"],
    sections: {
      objective: "Preserve the verified router state for continuation.",
      currentState: "The router entry point has been verified.",
      verification: "Focused test passed.",
      remainingWork: "Run the broader router suite.",
    },
  });

  const handoff = runCli(["handoff", "--project", project, "--input", "-"], handoffInput);
  assert.equal(handoff.status, 0, handoff.stderr);
  const handoffOutput = JSON.parse(handoff.stdout);
  assert.equal(handoffOutput.id, "W001");
  assert.equal(handoffOutput.deduplicated, false);
  assert.match(handoffOutput.path.replaceAll("\\", "/"), /\.agent\/handoff\/records\/development\/W001-router-verification\.md$/u);

  const duplicateHandoff = runCli(["handoff", "--project", project, "--input", "-"], handoffInput);
  assert.equal(duplicateHandoff.status, 0, duplicateHandoff.stderr);
  assert.equal(JSON.parse(duplicateHandoff.stdout).id, "W001");
  assert.equal(JSON.parse(duplicateHandoff.stdout).deduplicated, true);

  const status = runCli(["status", "--project", project]);
  assert.equal(status.status, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).handoffCount, 1);

  const matched = runCli(["match", "--project", project, "--prompt", "Continue src/router.ts"]);
  assert.equal(matched.status, 0, matched.stderr);
  assert.equal(JSON.parse(matched.stdout).matches[0].entry.id, "W001");

  const verifiedIndex = runCli(["handoff-index", "--project", project, "--action", "verify"]);
  assert.equal(verifiedIndex.status, 0, verifiedIndex.stderr);
  assert.equal(JSON.parse(verifiedIndex.stdout).entryCount, 1);

  await writeFile(
    join(project, ".agent", "handoff", "index.json"),
    `${JSON.stringify({ schemaVersion: 3, entries: [] }, null, 2)}\n`,
    "utf8",
  );
  const inconsistentIndex = runCli(["handoff-index", "--project", project, "--action", "verify"]);
  assert.equal(inconsistentIndex.status, 1);
  assert.match(inconsistentIndex.stderr, /does not match/);
  const rebuiltIndex = runCli(["handoff-index", "--project", project, "--action", "rebuild"]);
  assert.equal(rebuiltIndex.status, 0, rebuiltIndex.stderr);
  assert.equal(JSON.parse(rebuiltIndex.stdout).entryCount, 1);

  const index = JSON.parse(await readFile(join(project, ".agent", "handoff", "index.json"), "utf8"));
  assert.equal(index.entries.length, 1);
  assert.equal(index.schemaVersion, 3);
  assert.equal(index.entries[0].path, ".agent/handoff/records/development/W001-router-verification.md");
  assert.equal("sectionSummaries" in index.entries[0], false);
  assert.deepEqual(index.entries[0].availableSections, ["objective", "currentState", "verification", "remainingWork"]);

  const planInput = JSON.stringify({
    title: "Durable routing direction",
    summary: "Keep project routing deterministic across tasks.",
    successCriteria: ["A new task can locate relevant evidence."],
  });
  const createdPlan = runCli(
    ["plan", "--project", project, "--action", "create", "--input", "-"],
    planInput,
  );
  assert.equal(createdPlan.status, 0, createdPlan.stderr);
  assert.equal(JSON.parse(createdPlan.stdout).id, "P001");
  assert.equal(JSON.parse(createdPlan.stdout).deduplicated, false);

  const duplicatePlan = runCli(
    ["plan", "--project", project, "--action", "create", "--input", "-"],
    planInput,
  );
  assert.equal(duplicatePlan.status, 0, duplicatePlan.stderr);
  assert.equal(JSON.parse(duplicatePlan.stdout).id, "P001");
  assert.equal(JSON.parse(duplicatePlan.stdout).deduplicated, true);

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
  assert.equal(JSON.parse(listedPlans.stdout).plans.length, 1);
});

function runCli(arguments_, input) {
  return spawnSync(process.execPath, [cli, ...arguments_], {
    cwd: process.cwd(),
    encoding: "utf8",
    input,
  });
}
