import assert from "node:assert/strict";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createProjectPlan,
  listProjectPlans,
  transitionProjectPlan,
} from "../dist/application/plan-msg.js";
import { initializeProject } from "../dist/application/project-context.js";

test("plan register is lazy and validates status transitions", async () => {
  const project = await mkdtemp(join(tmpdir(), "codex-project-context-plan-"));
  await initializeProject(project);
  const planPath = join(project, ".agent", "planMsg.md");

  assert.deepEqual((await listProjectPlans(project)).plans, []);
  await assert.rejects(access(planPath), /ENOENT/);

  const created = await createProjectPlan(project, {
    title: "Cross-task context",
    summary: "Keep project-level context deterministic.",
    successCriteria: ["Relevant handoffs are found without loading all history."],
    specRefs: ["openspec/project-context"],
    decisions: ["Use a project-local index."],
  });
  assert.equal(created.id, "P001");
  assert.equal(created.status, "proposed");

  await transitionProjectPlan(project, "P001", "accepted", "User approved the direction.");
  await assert.rejects(
    transitionProjectPlan(project, "P001", "completed", "Skip implementation state."),
    /Invalid project plan transition: accepted -> completed/,
  );
  await transitionProjectPlan(project, "P001", "in-progress", "Implementation started.");
  await transitionProjectPlan(project, "P001", "completed", "All phase checks passed.");
  await assert.rejects(
    transitionProjectPlan(project, "P001", "accepted", "Reopen it."),
    /Invalid project plan transition: completed -> accepted/,
  );

  const plans = (await listProjectPlans(project)).plans;
  assert.equal(plans[0].status, "completed");
  assert.equal(plans[0].transitions.length, 4);
  const markdown = await readFile(planPath, "utf8");
  assert.match(markdown, /## P001 Cross-task context/);
  assert.match(markdown, /Status: `completed`/);
  assert.match(markdown, /openspec\/project-context/);
});

test("concurrent equivalent project plans create one record", async () => {
  const project = await mkdtemp(join(tmpdir(), "codex-project-context-plan-dedupe-"));
  await initializeProject(project);
  const input = {
    title: "Cross-task context",
    summary: "Keep project-level context deterministic.",
    successCriteria: ["Relevant handoffs are found.", "Duplicate plans are rejected."],
    decisions: ["Use a project-local index."],
  };

  const results = await Promise.all(Array.from({ length: 8 }, () => createProjectPlan(project, input)));
  const planPath = join(project, ".agent", "planMsg.md");
  const legacyMarkdown = (await readFile(planPath, "utf8")).replace(
    /\n      "dedupeKey": "sha256:[a-f0-9]{64}",/u,
    "",
  );
  await writeFile(planPath, legacyMarkdown, "utf8");
  const reordered = await createProjectPlan(project, {
    ...input,
    title: "  CROSS-TASK   CONTEXT ",
    successCriteria: ["Duplicate plans are rejected.", "Relevant handoffs are found."],
  });

  assert.deepEqual(new Set(results.map(({ id }) => id)), new Set(["P001"]));
  assert.equal(results.filter(({ deduplicated }) => !deduplicated).length, 1);
  assert.equal(reordered.id, "P001");
  assert.equal(reordered.deduplicated, true);
  const plans = (await listProjectPlans(project)).plans;
  assert.equal(plans.length, 1);
  assert.equal(plans[0].dedupeKey.startsWith("sha256:"), true);
  await assert.rejects(access(join(project, ".agent", ".project-context-write.lock")), /ENOENT/);
});
