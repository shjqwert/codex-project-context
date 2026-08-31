import assert from "node:assert/strict";
import { cp, mkdir, readFile, writeFile, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { makeTempDirectory } from "./helpers/temp-directory.mjs";

test("packaging skips empty skill trees without deleting sources and rejects nonempty invalid skills before replacing output", async () => {
  const root = await makeTempDirectory("project-context-package-");
  await mkdir(join(root, "scripts"));
  await cp(resolve("scripts/prepare-local-marketplace.mjs"), join(root, "scripts/prepare-local-marketplace.mjs"));
  for (const name of [".codex-plugin", "dist", "hooks", "schemas", "skills/valid", "skills/retired/references"]) {
    await mkdir(join(root, name), { recursive: true });
  }
  await writeFile(join(root, ".codex-plugin/plugin.json"), JSON.stringify({ interface: { category: "Productivity" } }));
  for (const name of ["package.json", "CHANGELOG.zh-CN.md", "README.md", "skills/valid/SKILL.md"]) {
    await writeFile(join(root, name), name);
  }
  const run = () => spawnSync(process.execPath, [join(root, "scripts/prepare-local-marketplace.mjs")], { encoding: "utf8" });
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  const output = join(root, ".local-marketplace/plugins/codex-project-context");
  assert.equal(await readFile(join(output, "skills/valid/SKILL.md"), "utf8"), "skills/valid/SKILL.md");
  await assert.rejects(access(join(output, "skills/retired")), /ENOENT/);
  await access(join(root, "skills/retired/references"));
  await writeFile(join(output, "sentinel"), "preserve existing package on validation error");
  await writeFile(join(root, "skills/retired/references/custom.txt"), "user content");
  const rejected = run();
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /Nonempty skill directory/);
  await access(join(output, "sentinel"));
  assert.equal(await readFile(join(root, "skills/retired/references/custom.txt"), "utf8"), "user content");
});
