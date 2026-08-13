import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { prepareProjectIndexes } from "../dist/application/project-indexes.js";
import { makeTempDirectory } from "./helpers/temp-directory.mjs";

test("missing CodeGraph and Serena indexes are created once with detected languages", async () => {
  const project = await makeTempDirectory("codex-project-context-indexes-");
  await mkdir(join(project, "Appl", "Source"), { recursive: true });
  await writeFile(join(project, "Appl", "Source", "main.c"), "void main(void) {}\n", "utf8");
  const calls = [];
  const runner = async (command, arguments_, workingDirectory) => {
    calls.push({ command, arguments_, workingDirectory });
    if (command === "codegraph") {
      await mkdir(join(project, ".codegraph"));
    } else {
      await mkdir(join(project, ".serena"));
      await writeFile(join(project, ".serena", "project.yml"), "language_servers:\n- cpp\n", "utf8");
    }
    return { exitCode: 0, stdout: "", stderr: "" };
  };

  const prepared = await prepareProjectIndexes(project, runner);
  assert.equal(prepared.codegraph.status, "created");
  assert.equal(prepared.serena.status, "created");
  assert.deepEqual(calls.map(({ command }) => command), ["codegraph", "serena"]);
  assert.deepEqual(calls[0].arguments_, ["init", project]);
  assert.deepEqual(
    calls[1].arguments_,
    ["project", "create", "--index", "--language", "cpp", project],
  );
  assert.ok(calls.every(({ workingDirectory }) => workingDirectory === project));

  const reused = await prepareProjectIndexes(project, async () => {
    throw new Error("existing indexes must not be rebuilt");
  });
  assert.equal(reused.codegraph.status, "existing");
  assert.equal(reused.serena.status, "existing");
});

test("unavailable index tools are reported without installing or upgrading them", async () => {
  const project = await makeTempDirectory("codex-project-context-index-unavailable-");
  const result = await prepareProjectIndexes(project, async () => ({
    exitCode: null,
    stdout: "",
    stderr: "not found",
    errorCode: "ENOENT",
  }));

  assert.equal(result.ok, true);
  assert.equal(result.codegraph.status, "unavailable");
  assert.equal(result.serena.status, "unavailable");
  assert.match(result.codegraph.message, /not available on PATH/);
  assert.match(result.serena.message, /not available on PATH/);
});
