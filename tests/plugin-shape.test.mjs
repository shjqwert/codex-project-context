import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("plugin manifest, hooks, and skills expose the first-version contract", async () => {
  const manifest = JSON.parse(await readFile(".codex-plugin/plugin.json", "utf8"));
  assert.equal(manifest.name, "codex-project-context");
  assert.equal(manifest.skills, "./skills/");
  assert.equal("hooks" in manifest, false);

  const hooks = JSON.parse(await readFile("hooks/hooks.json", "utf8"));
  assert.ok(hooks.hooks.SessionStart);
  assert.ok(hooks.hooks.UserPromptSubmit);

  for (const skill of ["project-init", "project-sync", "project-handoff"]) {
    const content = await readFile(`skills/${skill}/SKILL.md`, "utf8");
    assert.match(content, new RegExp(`name: ${skill}`));
  }
});

