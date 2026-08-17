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

test("new projects inherit global Sol Advisor eligibility by default", async () => {
  const project = await makeTempDirectory("codex-project-context-auth-default-");
  const result = await initializeProject(project);
  assert.equal(result.solAdvisorDelegationPolicy, "inherit");
  assert.equal(result.solAdvisorImplicitDelegation, true);
  await assertMissing(join(project, authorizationRelativePath));
  const agents = await readFile(join(project, "AGENTS.md"), "utf8");
  assert.match(agents, /## Sol Advisor Integration/);
  assert.match(agents, /inherits global Sol Advisor eligibility/);

  const status = await getProjectStatus(project);
  assert.equal(status.solAdvisorDelegationPolicy, "inherit");
  assert.equal(status.solAdvisorImplicitDelegation, true);
  assert.equal(status.authorizations, null);
});

test("explicit initialization opt-out writes a durable false override", async () => {
  const project = await makeTempDirectory("codex-project-context-auth-opt-out-");
  const result = await initializeProject(project, { solAdvisorImplicitDelegation: false });
  assert.equal(result.solAdvisorDelegationPolicy, "deny");
  assert.equal(result.solAdvisorImplicitDelegation, false);
  assert.equal(
    JSON.parse(await readFile(join(project, authorizationRelativePath), "utf8"))
      .authorizations.solAdvisor.implicitDelegation,
    false,
  );
  assert.match(await readFile(join(project, "AGENTS.md"), "utf8"), /disables implicit Sol Advisor delegation/);

  await synchronizeProject(project);
  assert.equal(
    JSON.parse(await readFile(join(project, authorizationRelativePath), "utf8"))
      .authorizations.solAdvisor.implicitDelegation,
    false,
  );
});

test("a present authorization file with no Sol Advisor key inherits and remains byte-stable", async () => {
  const project = await makeTempDirectory("codex-project-context-auth-empty-");
  await initializeProject(project);
  const authorizationPath = join(project, authorizationRelativePath);
  const emptyAuthorization = `${JSON.stringify({ schemaVersion: 1, authorizations: {} }, null, 2)}\n`;
  await writeFile(authorizationPath, emptyAuthorization, "utf8");

  const status = await getProjectStatus(project);
  assert.equal(status.solAdvisorDelegationPolicy, "inherit");
  assert.equal(status.solAdvisorImplicitDelegation, true);
  await synchronizeProject(project);
  assert.equal(await readFile(authorizationPath, "utf8"), emptyAuthorization);
});

test("enable, disable, inherit, and sync preserve user AGENTS bytes", async () => {
  const project = await makeTempDirectory("codex-project-context-auth-lifecycle-");
  const agentsPath = join(project, "AGENTS.md");
  const original = "# User Rules\r\n\r\nKeep this exact line.  \r\n";
  await writeFile(agentsPath, original, "utf8");
  await initializeProject(project);
  const initialized = await readFile(agentsPath, "utf8");
  const prefix = initialized.slice(0, initialized.indexOf("<!-- PROJECT_CONTEXT_START -->"));

  const enabled = await configureSolAdvisorImplicitDelegation(project, "enable");
  assert.equal(enabled.action, "enabled");
  assert.equal(enabled.solAdvisorDelegationPolicy, "allow");
  assert.deepEqual(
    JSON.parse(await readFile(join(project, authorizationRelativePath), "utf8")),
    {
      schemaVersion: 1,
      authorizations: { solAdvisor: { implicitDelegation: true } },
    },
  );
  const enabledAgents = await readFile(agentsPath, "utf8");
  assert.equal(enabledAgents.slice(0, enabledAgents.indexOf("<!-- PROJECT_CONTEXT_START -->")), prefix);
  assert.match(enabledAgents, /## Sol Advisor Integration/);
  assert.match(enabledAgents, /explicitly allows implicit Sol Advisor delegation/);
  assert.equal(enabledAgents.match(/## Sol Advisor Integration/g)?.length, 1);

  const authorizationBytes = await readFile(join(project, authorizationRelativePath), "utf8");
  await synchronizeProject(project);
  assert.equal(await readFile(join(project, authorizationRelativePath), "utf8"), authorizationBytes);
  assert.equal(await readFile(agentsPath, "utf8"), enabledAgents);

  const disabled = await configureSolAdvisorImplicitDelegation(project, "disable");
  assert.equal(disabled.action, "disabled");
  assert.equal(disabled.solAdvisorDelegationPolicy, "deny");
  assert.equal(
    JSON.parse(await readFile(join(project, authorizationRelativePath), "utf8"))
      .authorizations.solAdvisor.implicitDelegation,
    false,
  );
  assert.match(await readFile(agentsPath, "utf8"), /disables implicit Sol Advisor delegation/);

  const removedAlias = await configureSolAdvisorImplicitDelegation(project, "remove");
  assert.equal(removedAlias.action, "disabled");
  assert.equal(removedAlias.solAdvisorImplicitDelegation, false);

  const inherited = await configureSolAdvisorImplicitDelegation(project, "inherit");
  assert.equal(inherited.action, "inherited");
  assert.equal(inherited.solAdvisorDelegationPolicy, "inherit");
  assert.equal(inherited.solAdvisorImplicitDelegation, true);
  await assertMissing(join(project, authorizationRelativePath));
  const inheritedAgents = await readFile(agentsPath, "utf8");
  assert.equal(inheritedAgents.slice(0, inheritedAgents.indexOf("<!-- PROJECT_CONTEXT_START -->")), prefix);
  assert.match(inheritedAgents, /inherits global Sol Advisor eligibility/);
});

test("legacy project without an authorization migrates to explicit deny on sync", async () => {
  const project = await makeTempDirectory("codex-project-context-auth-legacy-");
  await initializeProject(project);
  const agentsPath = join(project, "AGENTS.md");
  const current = await readFile(agentsPath, "utf8");
  const legacy = current.replace(/## Sol Advisor Integration\r?\n[\s\S]*?(?=## Handoff Context)/u, "");
  await writeFile(agentsPath, legacy, "utf8");
  await assertMissing(join(project, authorizationRelativePath));

  const synchronized = await synchronizeProject(project);
  assert.equal(synchronized.solAdvisorDelegationPolicy, "deny");
  assert.equal(synchronized.solAdvisorImplicitDelegation, false);
  assert.equal(
    JSON.parse(await readFile(join(project, authorizationRelativePath), "utf8"))
      .authorizations.solAdvisor.implicitDelegation,
    false,
  );
  const migrated = await readFile(agentsPath, "utf8");
  assert.match(migrated, /## Sol Advisor Integration/);
  assert.match(migrated, /disables implicit Sol Advisor delegation/);
});

test("legacy schema v1 project can switch policies without rewriting unrelated managed context", async () => {
  const project = await makeTempDirectory("codex-project-context-auth-schema-v1-");
  await initializeProject(project, { solAdvisorImplicitDelegation: false });
  const contextPath = join(project, ".agent", "context.json");
  const agentsPath = join(project, "AGENTS.md");
  const context = JSON.parse(await readFile(contextPath, "utf8"));
  context.schemaVersion = 1;
  delete context.analysis;
  await writeFile(contextPath, `${JSON.stringify(context, null, 2)}\n`, "utf8");
  const before = await readFile(agentsPath, "utf8");
  const beforeHandoff = before.slice(before.indexOf("## Handoff Context"));

  await configureSolAdvisorImplicitDelegation(project, "enable");
  const enabled = await readFile(agentsPath, "utf8");
  assert.match(enabled, /explicitly allows implicit Sol Advisor delegation/);
  assert.equal(enabled.slice(enabled.indexOf("## Handoff Context")), beforeHandoff);

  await configureSolAdvisorImplicitDelegation(project, "inherit");
  const inherited = await readFile(agentsPath, "utf8");
  assert.match(inherited, /inherits global Sol Advisor eligibility/);
  assert.equal(inherited.slice(inherited.indexOf("## Handoff Context")), beforeHandoff);
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
      authorizations: { solAdvisor: { implicitDelegation: "yes" } },
    }),
    "utf8",
  );

  await assert.rejects(getProjectStatus(project), /implicitDelegation must be boolean/);
  await assert.rejects(synchronizeProject(project), /implicitDelegation must be boolean/);
  assert.equal(await readFile(contextPath, "utf8"), beforeContext);
  assert.equal(await readFile(agentsPath, "utf8"), beforeAgents);
});

test("multiple managed markers reject policy changes without partial authorization", async () => {
  const project = await makeTempDirectory("codex-project-context-auth-markers-");
  await initializeProject(project);
  const agentsPath = join(project, "AGENTS.md");
  const agents = await readFile(agentsPath, "utf8");
  await writeFile(agentsPath, `${agents}\n${agents}`, "utf8");

  await assert.rejects(
    configureSolAdvisorImplicitDelegation(project, "enable"),
    /multiple project-context managed sections/,
  );
  await assertMissing(join(project, authorizationRelativePath));
});

test("concurrent authorization commands leave one complete policy state", async () => {
  const project = await makeTempDirectory("codex-project-context-auth-concurrent-");
  await initializeProject(project);
  await Promise.all([
    configureSolAdvisorImplicitDelegation(project, "enable"),
    configureSolAdvisorImplicitDelegation(project, "disable"),
    configureSolAdvisorImplicitDelegation(project, "inherit"),
    configureSolAdvisorImplicitDelegation(project, "remove"),
  ]);

  const status = await getProjectStatus(project);
  const agents = await readFile(join(project, "AGENTS.md"), "utf8");
  assert.equal(agents.match(/<!-- PROJECT_CONTEXT_START -->/g)?.length, 1);
  assert.equal(agents.match(/<!-- PROJECT_CONTEXT_END -->/g)?.length, 1);
  assert.equal(agents.match(/## Sol Advisor Integration/g)?.length, 1);
  if (status.solAdvisorDelegationPolicy === "inherit") {
    await assertMissing(join(project, authorizationRelativePath));
    assert.match(agents, /inherits global Sol Advisor eligibility/);
  } else {
    const stored = JSON.parse(await readFile(join(project, authorizationRelativePath), "utf8"));
    assert.equal(
      stored.authorizations.solAdvisor.implicitDelegation,
      status.solAdvisorDelegationPolicy === "allow",
    );
  }
});

async function assertMissing(path) {
  await assert.rejects(
    readFile(path, "utf8"),
    (error) => error instanceof Error && "code" in error && error.code === "ENOENT",
  );
}
