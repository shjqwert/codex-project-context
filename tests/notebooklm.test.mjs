import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  configureProjectNotebookLmIndex,
  getProjectNotebookLmIndexStatus,
} from "../dist/application/project-context.js";
import {
  inspectNotebookLmLibrary,
  updateNotebookLmLibraryManifest,
} from "../dist/application/notebooklm-library.js";
import {
  ensureNotebookLmIndexExcluded,
  readNotebookLmIndexStatus,
  restoreNotebookLmIndexExclusion,
  validateNotebookLmProjectIndex,
} from "../dist/application/notebooklm-index.js";
import {
  initializeAnalyzedProject,
  synchronizeAnalyzedProject,
} from "./helpers/project-analysis.mjs";
import { makeTempDirectory } from "./helpers/temp-directory.mjs";

const cli = resolve("dist", "cli", "main.js");
const agentsEntry = "- `.agent/notebooklm-index.json`: NotebookLM reference bindings and document-retrieval state.";

test("NotebookLM index distinguishes unconfigured, disabled, enabled, and invalid states", async () => {
  const project = await makeTempDirectory("codex-notebooklm-index-");
  await mkdir(join(project, ".git", "info"), { recursive: true });
  await writeFile(join(project, ".git", "info", "exclude"), "# local\n", "utf8");
  await initializeAnalyzedProject(project);

  assert.equal((await getProjectNotebookLmIndexStatus(project)).state, "unconfigured");
  let agents = await readFile(join(project, "AGENTS.md"), "utf8");
  assert.equal(agents.includes(agentsEntry), false);

  const disabled = indexFixture("disabled");
  await configureProjectNotebookLmIndex(project, disabled);
  assert.equal((await readNotebookLmIndexStatus(project)).state, "disabled");
  assert.match(await readFile(join(project, ".git", "info", "exclude"), "utf8"), /\/.agent\/notebooklm-index\.json/);
  agents = await readFile(join(project, "AGENTS.md"), "utf8");
  assert.equal(agents.includes(agentsEntry), false);

  const manual = indexFixture("manual");
  await configureProjectNotebookLmIndex(project, manual);
  const firstAgents = await readFile(join(project, "AGENTS.md"), "utf8");
  const firstIndex = await readFile(join(project, ".agent", "notebooklm-index.json"), "utf8");
  assert.equal(firstAgents.split(agentsEntry).length - 1, 1);
  assert.equal((await readNotebookLmIndexStatus(project)).state, "enabled");
  const enabledStatus = await getProjectNotebookLmIndexStatus(project);
  assert.deepEqual(enabledStatus.notebooks, manual.notebooks);
  assert.equal(enabledStatus.schematic, null);
  assert.deepEqual(enabledStatus.advisories, []);

  await configureProjectNotebookLmIndex(project, manual);
  assert.equal(await readFile(join(project, "AGENTS.md"), "utf8"), firstAgents);
  assert.equal(await readFile(join(project, ".agent", "notebooklm-index.json"), "utf8"), firstIndex);
  await assert.rejects(
    configureProjectNotebookLmIndex(project, { ...manual, mode: undefined }),
    /mode/,
  );
  assert.equal(await readFile(join(project, "AGENTS.md"), "utf8"), firstAgents);
  assert.equal(await readFile(join(project, ".agent", "notebooklm-index.json"), "utf8"), firstIndex);

  await writeFile(
    join(project, ".agent", "notebooklm-index.json"),
    JSON.stringify({ schemaVersion: 1, notebooks: [], components: [], notes: [], advisories: [] }),
    "utf8",
  );
  const beforeAgents = await readFile(join(project, "AGENTS.md"), "utf8");
  const beforeContext = await readFile(join(project, ".agent", "context.json"), "utf8");
  const invalid = await getProjectNotebookLmIndexStatus(project);
  assert.equal(invalid.state, "invalid");
  assert.match(invalid.error, /mode/);
  await assert.rejects(synchronizeAnalyzedProject(project), /Invalid NotebookLM project index/);
  await assert.rejects(initializeAnalyzedProject(project), /Invalid NotebookLM project index/);
  assert.equal(await readFile(join(project, "AGENTS.md"), "utf8"), beforeAgents);
  assert.equal(await readFile(join(project, ".agent", "context.json"), "utf8"), beforeContext);
});

test("schematic hash drift blocks sync until components are re-extracted and reconfigured", async () => {
  const project = await makeTempDirectory("codex-notebooklm-drift-");
  await writeFile(join(project, "board.pdf"), "revision-1", "utf8");
  await initializeAnalyzedProject(project);
  const first = indexFixture("schematic", {
    schematic: { path: "board.pdf", sha256: sha256("revision-1") },
    components: [],
    lastRefreshedAt: "2026-08-15T00:00:00Z",
  });
  await configureProjectNotebookLmIndex(project, first);
  assert.equal((await getProjectNotebookLmIndexStatus(project)).schematic.changed, false);

  await writeFile(join(project, "board.pdf"), "revision-2", "utf8");
  const changed = await getProjectNotebookLmIndexStatus(project);
  assert.equal(changed.state, "enabled");
  assert.equal(changed.schematic.changed, true);
  assert.equal(changed.schematic.currentSha256, sha256("revision-2"));
  const beforeContext = await readFile(join(project, ".agent", "context.json"), "utf8");
  await assert.rejects(synchronizeAnalyzedProject(project), /schematic PDF changed/);
  assert.equal(await readFile(join(project, ".agent", "context.json"), "utf8"), beforeContext);
  await assert.rejects(
    configureProjectNotebookLmIndex(project, first),
    /sha256 does not match/,
  );

  await configureProjectNotebookLmIndex(project, {
    ...first,
    schematic: { path: "board.pdf", sha256: sha256("revision-2") },
  });
  await synchronizeAnalyzedProject(project);
  const refreshed = await getProjectNotebookLmIndexStatus(project);
  assert.equal(refreshed.schematic.changed, false);
  assert.equal(refreshed.lastRefreshedAt, "2026-08-15T00:00:00Z");
});

test("schematic mode requires one bounded PDF binding and accepts all component categories", async () => {
  const project = await makeTempDirectory("codex-notebooklm-schematic-");
  await writeFile(join(project, "board.pdf"), "%PDF fixture", "utf8");
  const index = indexFixture("schematic", {
    schematic: { path: "board.pdf", sha256: sha256("%PDF fixture") },
    components: [
      {
        refdes: "U1",
        partNumber: "STM32G474RET6",
        category: "mcu",
        package: "LQFP64",
        page: 2,
        confidence: "high",
        sources: [{
          notebookId: "public-notebook",
          sourceId: "source-1",
          title: "ST STM32G4 - Reference Manual",
          documentType: "reference-manual",
          status: "ready",
        }],
      },
    ],
  });
  assert.equal((await validateNotebookLmProjectIndex(project, index)).mode, "schematic");
  await assert.rejects(
    validateNotebookLmProjectIndex(project, { ...index, schematic: { ...index.schematic, path: "../board.pdf" } }),
    /project-relative|inside the project root/,
  );
  await assert.rejects(validateNotebookLmProjectIndex(project, indexFixture("schematic")), /requires a schematic PDF/);
});

test("standalone library scans only PDFs and writes a stable bounded manifest", async () => {
  const root = await makeTempDirectory("codex-notebooklm-library-");
  await mkdir(join(root, "nested"));
  await writeFile(join(root, "mcu.pdf"), "mcu", "utf8");
  await writeFile(join(root, "nested", "driver.PDF"), "driver", "utf8");
  await writeFile(join(root, "notes.md"), "ignore", "utf8");

  const inspected = await inspectNotebookLmLibrary(root);
  assert.equal(inspected.manifestState, "absent");
  assert.deepEqual(inspected.files.map(({ path }) => path), ["mcu.pdf", "nested/driver.PDF"]);
  assert.equal(inspected.files[0].sha256, sha256("mcu"));

  const manifest = {
    schemaVersion: 1,
    publicNotebook: { id: "public-notebook", title: "Embedded Public References" },
    files: inspected.files.map((file, index) => ({
      ...file,
      category: index === 0 ? "mcu" : "driver",
      documentType: "datasheet",
      partNumbers: [index === 0 ? "MCU-1" : "DRV-1"],
      confidence: "high",
      status: "ready",
      sourceId: `source-${index + 1}`,
      sourceTitle: `Vendor Part ${index + 1} - Datasheet`,
    })).reverse(),
  };
  await updateNotebookLmLibraryManifest(root, manifest);
  const first = await readFile(join(root, ".notebooklm-upload-manifest.json"), "utf8");
  await updateNotebookLmLibraryManifest(root, manifest);
  assert.equal(await readFile(join(root, ".notebooklm-upload-manifest.json"), "utf8"), first);
  assert.deepEqual(JSON.parse(first).files.map(({ path }) => path), ["mcu.pdf", "nested/driver.PDF"]);
  assert.equal((await inspectNotebookLmLibrary(root)).manifestState, "valid");

  await assert.rejects(
    updateNotebookLmLibraryManifest(root, {
      ...manifest,
      files: [{ ...manifest.files[0], path: "../escape.pdf" }],
    }),
    /escapes the PDF root/,
  );
  await assert.rejects(
    updateNotebookLmLibraryManifest(root, {
      ...manifest,
      files: [{ ...manifest.files[0], sourceId: undefined, sourceTitle: undefined }],
    }),
    /ready status requires sourceId and sourceTitle/,
  );
  await assert.rejects(
    updateNotebookLmLibraryManifest(root, {
      ...manifest,
      files: [{ ...manifest.files[0], path: "missing.pdf" }],
    }),
    /regular non-symlink PDF/,
  );
  await assert.rejects(
    updateNotebookLmLibraryManifest(root, {
      ...manifest,
      files: [{ ...manifest.files[0], sha256: sha256("stale") }],
    }),
    /sha256 is stale/,
  );
  await assert.rejects(
    updateNotebookLmLibraryManifest(root, {
      ...manifest,
      files: [{ ...manifest.files[0], modifiedAt: "2026-08-15" }],
    }),
    /ISO timestamp/,
  );
});

test("NotebookLM local Git exclusion can be rolled back exactly", async () => {
  const project = await makeTempDirectory("codex-notebooklm-exclude-");
  await mkdir(join(project, ".git", "info"), { recursive: true });
  const excludePath = join(project, ".git", "info", "exclude");
  await writeFile(excludePath, "# preserve\r\n", "utf8");
  const snapshot = await ensureNotebookLmIndexExcluded(project);
  assert.equal(snapshot.changed, true);
  assert.match(await readFile(excludePath, "utf8"), /notebooklm-index/);
  await restoreNotebookLmIndexExclusion(snapshot);
  assert.equal(await readFile(excludePath, "utf8"), "# preserve\r\n");

  const absentProject = await makeTempDirectory("codex-notebooklm-exclude-absent-");
  await mkdir(join(absentProject, ".git", "info"), { recursive: true });
  const absentExclude = join(absentProject, ".git", "info", "exclude");
  const absentSnapshot = await ensureNotebookLmIndexExcluded(absentProject);
  assert.equal(absentSnapshot.existed, false);
  await restoreNotebookLmIndexExclusion(absentSnapshot);
  await assert.rejects(readFile(absentExclude, "utf8"), /ENOENT/);
});

test("standalone manifest rejects PDF symbolic links", async (context) => {
  const root = await makeTempDirectory("codex-notebooklm-symlink-");
  const target = join(root, "target.pdf");
  const targetDirectory = join(root, "target-directory");
  const link = join(root, "link.pdf");
  await writeFile(target, "target", "utf8");
  await mkdir(targetDirectory);
  try {
    await symlink(targetDirectory, link, "junction");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EPERM") {
      context.skip("Symlink or junction creation is not permitted on this host.");
      return;
    }
    throw error;
  }
  const inspected = await inspectNotebookLmLibrary(root);
  const targetFile = inspected.files.find(({ path }) => path === "target.pdf");
  assert.ok(targetFile);
  await assert.rejects(
    updateNotebookLmLibraryManifest(root, {
      schemaVersion: 1,
      publicNotebook: { id: "public-notebook", title: "Embedded Public References" },
      files: [{
        ...targetFile,
        path: "link.pdf",
        category: "mcu",
        documentType: "datasheet",
        partNumbers: ["MCU-1"],
        confidence: "high",
        status: "ready",
        sourceId: "source-1",
        sourceTitle: "Vendor MCU-1 - Datasheet",
      }],
    }),
    /regular non-symlink PDF/,
  );
});

test("NotebookLM CLI exposes project and standalone workflows", async () => {
  const project = await makeTempDirectory("codex-notebooklm-cli-project-");
  await initializeAnalyzedProject(project);
  let result = runCli(["notebooklm-index", "--project", project, "--action", "status"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).state, "unconfigured");

  result = runCli(
    ["notebooklm-index", "--project", project, "--action", "configure", "--input", "-"],
    JSON.stringify(indexFixture("disabled")),
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).mode, "disabled");

  const root = await makeTempDirectory("codex-notebooklm-cli-library-");
  await writeFile(join(root, "part.pdf"), "part", "utf8");
  result = runCli(["notebooklm-library", "--root", root, "--action", "inspect"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).fileCount, 1);
});

function indexFixture(mode, overrides = {}) {
  return {
    schemaVersion: 1,
    mode,
    notebooks: mode === "disabled"
      ? []
      : [{ scope: "public", id: "public-notebook", title: "Embedded Public References" }],
    components: [],
    notes: [],
    advisories: [],
    ...overrides,
  };
}

function sha256(content) {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function runCli(arguments_, input) {
  return spawnSync(process.execPath, [cli, ...arguments_], {
    cwd: process.cwd(),
    encoding: "utf8",
    input,
  });
}
