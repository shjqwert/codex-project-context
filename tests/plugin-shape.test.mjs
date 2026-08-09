import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("plugin manifest, hooks, schemas, and skills expose the functional-completeness contract", async () => {
  const manifest = JSON.parse(await readFile(".codex-plugin/plugin.json", "utf8"));
  const packageMetadata = JSON.parse(await readFile("package.json", "utf8"));
  const cliSource = await readFile("src/cli/main.ts", "utf8");
  assert.equal(manifest.name, "codex-project-context");
  assert.equal(manifest.version.split("+")[0], packageMetadata.version);
  assert.match(cliSource, new RegExp(`const VERSION = "${packageMetadata.version.replaceAll(".", "\\.")}"`));
  assert.equal(manifest.skills, "./skills/");
  assert.equal("hooks" in manifest, false);

  const hooks = JSON.parse(await readFile("hooks/hooks.json", "utf8"));
  assert.ok(hooks.hooks.SessionStart);
  assert.ok(hooks.hooks.UserPromptSubmit);

  for (const skill of ["project-init", "project-sync", "project-handoff", "project-plan-msg"]) {
    const content = await readFile(`skills/${skill}/SKILL.md`, "utf8");
    assert.match(content, new RegExp(`name: ${skill}`));
    const metadata = await readFile(`skills/${skill}/agents/openai.yaml`, "utf8");
    assert.match(metadata, new RegExp(`\\$${skill}`));
  }

  for (const skill of ["project-init", "project-sync"]) {
    const metadata = await readFile(`skills/${skill}/agents/openai.yaml`, "utf8");
    assert.match(metadata, /allow_implicit_invocation: false/);
  }
  for (const skill of ["project-handoff", "project-plan-msg"]) {
    const metadata = await readFile(`skills/${skill}/agents/openai.yaml`, "utf8");
    assert.match(metadata, /allow_implicit_invocation: true/);
  }
  const handoffSkill = await readFile("skills/project-handoff/SKILL.md", "utf8");
  assert.match(handoffSkill, /2-6 concise retrieval aliases/);
  assert.match(handoffSkill, /at least one natural Chinese phrase and one natural English phrase/);

  for (const path of [
    "skills/project-init/references/project-discovery.md",
    "skills/project-init/references/agents-structure.md",
    "skills/project-sync/references/resource-rules.md",
    "skills/project-handoff/references/handoff-format.md",
    "skills/project-handoff/references/examples.md",
    "skills/project-plan-msg/references/plan-msg-format.md",
  ]) {
    assert.ok((await readFile(path, "utf8")).trim().length > 0);
  }

  for (const path of [
    "schemas/context.schema.json",
    "schemas/project-analysis.schema.json",
    "schemas/handoff-index.schema.json",
    "schemas/plan-document.schema.json",
  ]) {
    const schema = JSON.parse(await readFile(path, "utf8"));
    assert.match(schema.$schema, /json-schema/);
  }

  const handoffSchema = JSON.parse(await readFile("schemas/handoff-index.schema.json", "utf8"));
  assert.equal(handoffSchema.properties.schemaVersion.const, 3);
  assert.match(handoffSchema.$defs.entry.properties.dedupeKey.pattern, /sha256/);
  assert.equal("sectionSummaries" in handoffSchema.$defs.entry.properties, false);
  assert.ok(handoffSchema.$defs.routing.properties.aliases);
  assert.equal(handoffSchema.$defs.routing.required.includes("aliases"), false);
  const planSchema = JSON.parse(await readFile("schemas/plan-document.schema.json", "utf8"));
  assert.match(planSchema.$defs.plan.properties.dedupeKey.pattern, /sha256/);
  const contextSchema = JSON.parse(await readFile("schemas/context.schema.json", "utf8"));
  assert.equal(contextSchema.properties.schemaVersion.const, 2);
  assert.ok(contextSchema.required.includes("analysis"));
  assert.equal("context7" in contextSchema.properties.capabilities.properties, false);
  assert.equal("markitdown" in contextSchema.properties.capabilities.properties, false);

  const initSkill = await readFile("skills/project-init/SKILL.md", "utf8");
  assert.match(initSkill, /inspect --project/);
  assert.match(initSkill, /--input -/);
  assert.match(initSkill, /standard input/);
  assert.doesNotMatch(initSkill, /temporary .*JSON/i);
  assert.match(initSkill, /CodeGraph first/);
  assert.match(initSkill, /Context7/);
  assert.match(initSkill, /MarkItDown/);
  assert.match(initSkill, /session-local/);
  assert.match(initSkill, /do not bulk-convert/);
  const syncSkill = await readFile("skills/project-sync/SKILL.md", "utf8");
  assert.match(syncSkill, /inspect --project/);
  assert.match(syncSkill, /--input -/);
  assert.match(syncSkill, /standard input/);
  assert.doesNotMatch(syncSkill, /temporary .*JSON/i);
  assert.match(syncSkill, /Context7/);
  assert.match(syncSkill, /MarkItDown/);
  assert.match(syncSkill, /session-local/);

  const discoveryContract = await readFile("skills/project-init/references/project-discovery.md", "utf8");
  assert.match(discoveryContract, /Context7 and MarkItDown are optional session tools/);
  assert.match(discoveryContract, /cannot supply a project-relative evidence path/);
  assert.match(discoveryContract, /Do not bulk-convert/);

  for (const skill of [handoffSkill, await readFile("skills/project-plan-msg/SKILL.md", "utf8")]) {
    assert.match(skill, /--input -/);
    assert.match(skill, /standard input/);
    assert.doesNotMatch(skill, /temporary .*input/i);
  }
});
