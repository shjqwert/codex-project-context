import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { makeTempDirectory } from "./helpers/temp-directory.mjs";
import { initializeProject as initializeProjectWithAnalysis } from "../dist/application/project-context.js";
import { inspectProject } from "../dist/application/project-discovery.js";
import {
  buildTestProjectAnalysis,
  initializeAnalyzedProject as initializeProject,
  synchronizeAnalyzedProject as synchronizeProject,
} from "./helpers/project-analysis.mjs";

const REQUIRED_SECTIONS = [
  "Project Overview",
  "Build and Verification",
  "Code Analysis",
  "Project References",
  "Project Context",
  "Handoff Context",
];

test("new projects receive an evidence-based AGENTS document within 200 lines", async () => {
  const project = await makeTempDirectory("codex-project-context-discovery-");
  await mkdir(join(project, "src"));
  await mkdir(join(project, "tests"));
  await mkdir(join(project, "docs"));
  await mkdir(join(project, "openspec"));
  await mkdir(join(project, "openspec", "specs"));
  await writeFile(join(project, "src", "main.ts"), "export const value = 1;\n", "utf8");
  await writeFile(join(project, "tests", "main.test.ts"), "// focused test\n", "utf8");
  await writeFile(join(project, "docs", "hardware-manual.pdf"), "fixture", "utf8");
  await writeFile(join(project, "tsconfig.json"), "{}\n", "utf8");
  await writeFile(
    join(project, "package.json"),
    JSON.stringify({
      name: "discovery-fixture",
      scripts: { build: "tsc", test: "node --test", lint: "eslint .", typecheck: "tsc --noEmit" },
    }),
    "utf8",
  );
  await writeFile(join(project, "package-lock.json"), "{}\n", "utf8");

  await initializeProject(project);
  const agentsPath = join(project, "AGENTS.md");
  const firstAgents = await readFile(agentsPath, "utf8");
  const lines = firstAgents.trimEnd().split(/\r?\n/u);
  assert.ok(lines.length <= 200, `expected at most 200 lines, received ${lines.length}`);
  for (const section of REQUIRED_SECTIONS) assert.match(firstAgents, new RegExp(`## ${section}`));
  assert.doesNotMatch(firstAgents, /Detected package managers|Build commands|Test commands/);
  assert.match(firstAgents, /Do not compile, build, download, flash, or program the target unless the user explicitly requests it/);
  const buildSection = firstAgents.split("## Build and Verification")[1].split("## Code Analysis")[0];
  assert.equal(buildSection.match(/^- /gmu)?.length, 1);
  const codeAnalysis = firstAgents.split("## Code Analysis")[1].split("## Project References")[0];
  assert.doesNotMatch(codeAnalysis, /OpenSpec/);
  assert.doesNotMatch(firstAgents, /<!-- CODEGRAPH_START -->|codegraph_explore|## CodeGraph/);
  assert.match(firstAgents, /Use Serena for symbol lookup, reference analysis, local reading, and precise modification/);
  assert.doesNotMatch(firstAgents, /## Development Rules|## Specification Routing/);
  assert.doesNotMatch(firstAgents, /SessionStart|UserPromptSubmit|fail open|schemaVersion/);
  assert.doesNotMatch(firstAgents, /project-init.*explicit-only|project-sync.*explicit-only/);
  assert.match(firstAgents, /\.agent\/handoff\//);
  assert.match(firstAgents, /docs/);
  const references = firstAgents.split("## Project References")[1].split("## Project Context")[0];
  assert.doesNotMatch(references, /openspec/i);
  assert.doesNotMatch(firstAgents, /## Completion Rules/);

  const context = JSON.parse(await readFile(join(project, ".agent", "context.json"), "utf8"));
  assert.equal(context.profile.name, "discovery-fixture");
  assert.deepEqual(context.profile.projectTypes, ["Node.js", "TypeScript"]);
  assert.deepEqual(context.profile.sourceDirectories, ["src"]);
  assert.deepEqual(context.profile.testDirectories, ["tests"]);
  assert.deepEqual(context.profile.specificationDirectories, ["openspec", "openspec/specs"]);
  assert.ok(!context.profile.testDirectories.includes("openspec/specs"));
  assert.equal(context.capabilities.openspec, true);
  assert.ok(context.resources.some(({ path }) => path === "docs"));
  assert.ok(context.resources.some(({ path }) => path === "docs/hardware-manual.pdf"));

  await initializeProject(project);
  assert.equal(await readFile(agentsPath, "utf8"), firstAgents);
});

test("Project References is omitted when only OpenSpec resources are detected", async () => {
  const project = await makeTempDirectory("codex-project-context-openspec-only-");
  await mkdir(join(project, "openspec"));
  await mkdir(join(project, "openspec", "specs"));
  await initializeProject(project);
  const agents = await readFile(join(project, "AGENTS.md"), "utf8");
  assert.doesNotMatch(agents, /## Project References/);
  assert.doesNotMatch(agents, /## Development Rules|## Specification Routing|<!-- CODEGRAPH_START -->/);
  assert.match(agents, /## Project Context/);
});

test("existing AGENTS content is preserved and synchronization is byte-stable", async () => {
  const project = await makeTempDirectory("codex-project-context-existing-");
  const original = "# User Rules\r\n\r\nKeep this exact line.  \r\n";
  const agentsPath = join(project, "AGENTS.md");
  await writeFile(agentsPath, original, "utf8");

  await initializeProject(project);
  const initialized = await readFile(agentsPath, "utf8");
  assert.ok(initialized.startsWith(original));
  const prefix = initialized.slice(0, initialized.indexOf("<!-- PROJECT_CONTEXT_START -->"));

  await synchronizeProject(project);
  const synchronized = await readFile(agentsPath, "utf8");
  assert.equal(
    synchronized.slice(0, synchronized.indexOf("<!-- PROJECT_CONTEXT_START -->")),
    prefix,
  );
  await synchronizeProject(project);
  assert.equal(await readFile(agentsPath, "utf8"), synchronized);
});

test("malformed package metadata does not prevent evidence-based initialization", async () => {
  const project = await makeTempDirectory("codex-project-context-malformed-package-");
  await writeFile(join(project, "package.json"), "{ invalid", "utf8");
  await initializeProject(project);
  const context = JSON.parse(await readFile(join(project, ".agent", "context.json"), "utf8"));
  assert.deepEqual(context.profile.projectTypes, ["Node.js"]);
  assert.equal("commands" in context.profile, false);
  assert.equal("packageManagers" in context.profile, false);
});

test("synchronization migrates a readable schema v1 context to Agent-authored schema v2", async () => {
  const project = await makeTempDirectory("codex-project-context-v1-migration-");
  await mkdir(join(project, ".agent", "handoff"), { recursive: true });
  await writeFile(
    join(project, ".agent", "context.json"),
    JSON.stringify({
      schemaVersion: 1,
      projectRoot: ".",
      currentCycle: "development",
      agentsFile: "AGENTS.md",
      handoffIndex: ".agent/handoff/index.json",
      capabilities: { codegraph: false, serena: false, openspec: false },
    }),
    "utf8",
  );
  await writeFile(
    join(project, ".agent", "handoff", "index.json"),
    JSON.stringify({ schemaVersion: 3, entries: [] }),
    "utf8",
  );

  await synchronizeProject(project);
  const context = JSON.parse(await readFile(join(project, ".agent", "context.json"), "utf8"));
  assert.equal(context.schemaVersion, 2);
  assert.match(context.inventoryFingerprint, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(context.analysis.schemaVersion, 1);
  assert.ok(context.analysis.overview.length > 0);
});

test("initialization rejects stale analysis and missing evidence", async () => {
  const project = await makeTempDirectory("codex-project-context-analysis-guard-");
  await writeFile(join(project, "package.json"), JSON.stringify({ name: "analysis-guard" }), "utf8");
  const stale = await buildTestProjectAnalysis(project);
  await writeFile(join(project, "package.json"), JSON.stringify({ name: "analysis-guard-updated" }), "utf8");
  await assert.rejects(
    initializeProjectWithAnalysis(project, stale),
    /analysis input is stale/,
  );

  const missingEvidence = await buildTestProjectAnalysis(project);
  missingEvidence.overview[0].evidencePaths = ["missing-evidence.txt"];
  await assert.rejects(
    initializeProjectWithAnalysis(project, missingEvidence),
    /evidence path does not exist/,
  );
});

test("initialization requires routing for detected analysis tools", async () => {
  const project = await makeTempDirectory("codex-project-context-tool-routing-");
  await mkdir(join(project, ".codegraph"));
  await mkdir(join(project, ".serena"));
  await writeFile(join(project, ".serena", "project.yml"), "language_servers:\n- typescript\n", "utf8");

  const missingSerena = await buildTestProjectAnalysis(project);
  missingSerena.codeAnalysis.find(({ text }) => text.includes("CodeGraph")).evidencePaths = [".codegraph"];
  missingSerena.codeAnalysis = missingSerena.codeAnalysis.filter(({ text }) => !text.includes("Serena"));
  await assert.rejects(
    initializeProjectWithAnalysis(project, missingSerena),
    /must route Serena/,
  );

  const missingCodeGraphEvidence = await buildTestProjectAnalysis(project);
  const codeGraphLine = missingCodeGraphEvidence.codeAnalysis.find(({ text }) => text.includes("CodeGraph"));
  codeGraphLine.evidencePaths = ["."];
  await assert.rejects(
    initializeProjectWithAnalysis(project, missingCodeGraphEvidence),
    /CodeGraph routing must cite \.codegraph/,
  );
});

test("Serena cache changes do not stale the repository inventory", async () => {
  const project = await makeTempDirectory("codex-project-context-serena-cache-");
  await mkdir(join(project, ".serena", "cache"), { recursive: true });
  await writeFile(join(project, ".serena", "project.yml"), "language_servers:\n- typescript\n", "utf8");
  const cachePath = join(project, ".serena", "cache", "symbols.json");
  await writeFile(cachePath, "{\"revision\":1}\n", "utf8");

  const before = await inspectProject(project);
  await writeFile(cachePath, "{\"revision\":2}\n", "utf8");
  const after = await inspectProject(project);

  assert.equal(before.capabilities.serena, true);
  assert.equal(after.capabilities.serena, true);
  assert.equal(after.fingerprint, before.fingerprint);
  assert.ok(after.paths.includes(".serena"));
  assert.ok(after.paths.every((path) => !path.startsWith(".serena/")));
});

test("inventory covers deeply nested embedded sources and ignores temporary metadata", async () => {
  const project = await makeTempDirectory("codex-project-context-deep-embedded-");
  const sourceDirectory = join(
    project,
    "Appl",
    "Sdk",
    "drivers",
    "src",
    "platform",
    "device",
    "generated",
  );
  const sourcePath = join(sourceDirectory, "Device_Register.c");
  await mkdir(sourceDirectory, { recursive: true });
  await writeFile(sourcePath, "const unsigned Device_Register = 1u;\n", "utf8");
  await mkdir(join(project, "tmp", "legacy", ".metadata", "plugins"), { recursive: true });
  await writeFile(join(project, "tmp", "legacy", ".metadata", "plugins", "noise.c"), "noise\n", "utf8");

  const before = await inspectProject(project);
  assert.equal(before.scan.maxDepth, 12);
  assert.equal(before.scan.entryLimit, 50_000);
  assert.equal(before.scan.truncated, false);
  assert.ok(before.scan.observedMaxDepth >= 7);
  assert.ok(before.paths.includes("Appl/Sdk/drivers/src/platform/device/generated/Device_Register.c"));
  assert.ok(before.paths.every((path) => !path.startsWith("tmp/")));

  await writeFile(sourcePath, "const unsigned Device_Register = 2u;\n", "utf8");
  const after = await inspectProject(project);
  assert.notEqual(after.fingerprint, before.fingerprint);
});

test("initialization rejects an inventory truncated by the depth limit", async () => {
  const project = await makeTempDirectory("codex-project-context-depth-limit-");
  let directory = project;
  for (let index = 0; index < 14; index += 1) {
    directory = join(directory, `level-${index}`);
  }
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "deep.c"), "void deep(void) {}\n", "utf8");

  const inventory = await inspectProject(project);
  assert.equal(inventory.scan.truncated, true);
  assert.ok(inventory.scan.truncationReasons.includes("depth-limit"));
  await assert.rejects(initializeProject(project), /Project inventory is incomplete: depth-limit/);
});
