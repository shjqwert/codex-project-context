import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("plugin manifest, hooks, schemas, and skills expose the functional-completeness contract", async () => {
  const manifest = JSON.parse(await readFile(".codex-plugin/plugin.json", "utf8"));
  assert.equal(manifest.name, "codex-project-context");
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
    "schemas/handoff-index.schema.json",
    "schemas/plan-document.schema.json",
  ]) {
    const schema = JSON.parse(await readFile(path, "utf8"));
    assert.match(schema.$schema, /json-schema/);
  }

  const handoffSchema = JSON.parse(await readFile("schemas/handoff-index.schema.json", "utf8"));
  assert.match(handoffSchema.$defs.entry.properties.dedupeKey.pattern, /sha256/);
  const planSchema = JSON.parse(await readFile("schemas/plan-document.schema.json", "utf8"));
  assert.match(planSchema.$defs.plan.properties.dedupeKey.pattern, /sha256/);
});
