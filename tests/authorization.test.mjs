import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  configureSolAdvisorImplicitDelegation,
  getProjectStatus,
} from "../dist/application/project-context.js";
import { makeTempDirectory } from "./helpers/temp-directory.mjs";
import {
  initializeAnalyzedProject as initializeProject,
  synchronizeAnalyzedProject as synchronizeProject,
} from "./helpers/project-analysis.mjs";

const authorizationRelativePath = join(".agent", "authorizations.json");

test("implicit Sol Advisor delegation is enabled by default", async () => {
  const project = await makeTempDirectory("codex-project-context-auth-default-");
  const result = await initializeProject(project);
  assert.equal(result.solAdvisorImplicitDelegation, true);
  assert.equal(
    JSON.parse(await readFile(join(project, authorizationRelativePath), "utf8"))
      .authorizations.solAdvisor.implicitDelegation,
    true,
  );
  assert.match(await readFile(join(project, "AGENTS.md"), "utf8"), /Subagent Orchestration/);

  const status = await getProjectStatus(project);
  assert.equal(status.solAdvisorImplicitDelegation, true);
  assert.equal(status.authorizations.authorizations.solAdvisor.implicitDelegation, true);
});

test("explicit initialization opt-out keeps implicit Sol Advisor delegation disabled", async () => {
  const project = await makeTempDirectory("codex-project-context-auth-opt-out-");
  const result = await initializeProject(project, { solAdvisorImplicitDelegation: false });
  assert.equal(result.solAdvisorImplicitDelegation, false);
  await assertMissing(join(project, authorizationRelativePath));
  assert.doesNotMatch(await readFile(join(project, "AGENTS.md"), "utf8"), /Subagent Orchestration/);

  await synchronizeProject(project);
  await assertMissing(join(project, authorizationRelativePath));
  assert.doesNotMatch(await readFile(join(project, "AGENTS.md"), "utf8"), /Subagent Orchestration/);
});

test("enable, sync, and remove preserve authorization and user AGENTS bytes", async () => {
  const project = await makeTempDirectory("codex-project-context-auth-lifecycle-");
  const agentsPath = join(project, "AGENTS.md");
  const original = "# User Rules\r\n\r\nKeep this exact line.  \r\n";
  await writeFile(agentsPath, original, "utf8");
  await initializeProject(project);
  const initialized = await readFile(agentsPath, "utf8");
  const prefix = initialized.slice(0, initialized.indexOf("<!-- PROJECT_CONTEXT_START -->"));

  const enabled = await configureSolAdvisorImplicitDelegation(project, "enable");
  assert.equal(enabled.action, "enabled");
  assert.equal(enabled.solAdvisorImplicitDelegation, true);
  assert.deepEqual(
    JSON.parse(await readFile(join(project, authorizationRelativePath), "utf8")),
    {
      schemaVersion: 1,
      authorizations: { solAdvisor: { implicitDelegation: true } },
    },
  );
  const enabledAgents = await readFile(agentsPath, "utf8");
  assert.equal(enabledAgents.slice(0, enabledAgents.indexOf("<!-- PROJECT_CONTEXT_START -->")), prefix);
  assert.match(enabledAgents, /## Subagent Orchestration/);
  assert.match(enabledAgents, /authorizations\.solAdvisor\.implicitDelegation` exactly `true/);
  assert.match(enabledAgents, /transport wrapper does not count as a Sol Advisor functional child/);
  assert.match(enabledAgents, /do not inspect interim child output/);
  assert.match(enabledAgents, /verify at most two decision-changing locators/);
  assert.match(enabledAgents, /inspect the full diff and run its specified check/);
  assert.match(enabledAgents, /one targeted correction for an incomplete result/);
  assert.match(enabledAgents, /mutually exclusive decisions, source scopes, and failure classes/);
  assert.doesNotMatch(enabledAgents, /two or more files.*Mechanical Editor/);
  assert.equal(enabledAgents.match(/## Subagent Orchestration/g)?.length, 1);

  await configureSolAdvisorImplicitDelegation(project, "enable");
  assert.equal(await readFile(agentsPath, "utf8"), enabledAgents);
  const authorizationBytes = await readFile(join(project, authorizationRelativePath), "utf8");
  await synchronizeProject(project);
  assert.equal(await readFile(join(project, authorizationRelativePath), "utf8"), authorizationBytes);
  assert.equal(await readFile(agentsPath, "utf8"), enabledAgents);

  const removed = await configureSolAdvisorImplicitDelegation(project, "remove");
  assert.equal(removed.action, "removed");
  assert.equal(removed.solAdvisorImplicitDelegation, false);
  await assertMissing(join(project, authorizationRelativePath));
  const removedAgents = await readFile(agentsPath, "utf8");
  assert.equal(removedAgents.slice(0, removedAgents.indexOf("<!-- PROJECT_CONTEXT_START -->")), prefix);
  assert.doesNotMatch(removedAgents, /## Subagent Orchestration/);
  await configureSolAdvisorImplicitDelegation(project, "remove");
  assert.equal(await readFile(agentsPath, "utf8"), removedAgents);
});

test("legacy schema v1 project can enable and remove authorization without rewriting its managed context", async () => {
  const project = await makeTempDirectory("codex-project-context-auth-legacy-");
  await initializeProject(project, { solAdvisorImplicitDelegation: false });
  const contextPath = join(project, ".agent", "context.json");
  const agentsPath = join(project, "AGENTS.md");
  const context = JSON.parse(await readFile(contextPath, "utf8"));
  context.schemaVersion = 1;
  delete context.analysis;
  await writeFile(contextPath, `${JSON.stringify(context, null, 2)}\n`, "utf8");
  const before = await readFile(agentsPath, "utf8");

  await configureSolAdvisorImplicitDelegation(project, "enable");
  const enabled = await readFile(agentsPath, "utf8");
  assert.match(enabled, /## Subagent Orchestration/);
  assert.equal(
    enabled.slice(0, enabled.indexOf("## Subagent Orchestration")),
    before.slice(0, before.indexOf("## Handoff Context")),
  );
  assert.equal(
    enabled.slice(enabled.indexOf("## Handoff Context")),
    before.slice(before.indexOf("## Handoff Context")),
  );

  await configureSolAdvisorImplicitDelegation(project, "remove");
  assert.equal(await readFile(agentsPath, "utf8"), before);
  await assertMissing(join(project, authorizationRelativePath));
});

test("invalid authorization fails closed before synchronization writes", async () => {
  const project = await makeTempDirectory("codex-project-context-auth-invalid-");
  await initializeProject(project);
  const contextPath = join(project, ".agent", "context.json");
  const agentsPath = join(project, "AGENTS.md");
  const beforeContext = await readFile(contextPath, "utf8");
  const beforeAgents = await readFile(agentsPath, "utf8");
  await writeFile(
    join(project, authorizationRelativePath),
    JSON.stringify({
      schemaVersion: 1,
      authorizations: { solAdvisor: { implicitDelegation: false } },
    }),
    "utf8",
  );

  await assert.rejects(getProjectStatus(project), /implicitDelegation must be true/);
  await assert.rejects(synchronizeProject(project), /implicitDelegation must be true/);
  assert.equal(await readFile(contextPath, "utf8"), beforeContext);
  assert.equal(await readFile(agentsPath, "utf8"), beforeAgents);
});

test("multiple managed markers reject enable without partial authorization", async () => {
  const project = await makeTempDirectory("codex-project-context-auth-markers-");
  await initializeProject(project, { solAdvisorImplicitDelegation: false });
  const agentsPath = join(project, "AGENTS.md");
  const agents = await readFile(agentsPath, "utf8");
  await writeFile(agentsPath, `${agents}\n${agents}`, "utf8");

  await assert.rejects(
    configureSolAdvisorImplicitDelegation(project, "enable"),
    /multiple project-context managed sections/,
  );
  await assertMissing(join(project, authorizationRelativePath));
});

test("concurrent authorization commands leave one complete fail-closed state", async () => {
  const project = await makeTempDirectory("codex-project-context-auth-concurrent-");
  await initializeProject(project);
  await Promise.all([
    configureSolAdvisorImplicitDelegation(project, "enable"),
    configureSolAdvisorImplicitDelegation(project, "remove"),
    configureSolAdvisorImplicitDelegation(project, "enable"),
    configureSolAdvisorImplicitDelegation(project, "remove"),
  ]);

  const status = await getProjectStatus(project);
  const agents = await readFile(join(project, "AGENTS.md"), "utf8");
  assert.equal(agents.match(/<!-- PROJECT_CONTEXT_START -->/g)?.length, 1);
  assert.equal(agents.match(/<!-- PROJECT_CONTEXT_END -->/g)?.length, 1);
  assert.equal(agents.includes("## Subagent Orchestration"), status.solAdvisorImplicitDelegation);
});

async function assertMissing(path) {
  await assert.rejects(
    readFile(path, "utf8"),
    (error) => error instanceof Error && "code" in error && error.code === "ENOENT",
  );
}
