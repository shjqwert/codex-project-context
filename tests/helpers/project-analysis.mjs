import { inspectProject } from "../../dist/application/project-discovery.js";
import {
  initializeProject,
  synchronizeProject,
} from "../../dist/application/project-context.js";

export async function buildTestProjectAnalysis(project) {
  const inventory = await inspectProject(project);
  const profile = inventory.profile;
  const values = (items) => (items.length === 0 ? "not detected" : items.join(", "));
  const paths = (items) =>
    items.length === 0 ? "not detected" : items.map((item) => `\`${item}\``).join(", ");
  const references = inventory.resources
    .filter(({ path }) => !path.toLowerCase().replaceAll("\\", "/").split("/").some((segment) => segment === "openspec" || segment === ".openspec"))
    .map((resource) => ({ ...resource, evidencePaths: [resource.path] }));

  return {
    schemaVersion: 1,
    inventoryFingerprint: inventory.fingerprint,
    overview: [
      { text: `Project name: ${profile.name}.`, evidencePaths: ["."] },
      { text: "Project root: `.`.", evidencePaths: ["."] },
      { text: `Detected project types: ${values(profile.projectTypes)}.`, evidencePaths: ["."] },
      { text: `Detected implementation languages: ${values(profile.languages)}.`, evidencePaths: ["."] },
      { text: `Source directories: ${paths(profile.sourceDirectories)}.`, evidencePaths: ["."] },
      { text: `Test directories: ${paths(profile.testDirectories)}.`, evidencePaths: ["."] },
    ],
    buildAndVerification: [
      {
        text: "Do not compile, build, download, flash, or program the target unless the user explicitly requests it.",
        evidencePaths: ["."],
      },
    ],
    codeAnalysis: [
      {
        text: "Use CodeGraph for module relationships, call paths, and impact analysis when it is available.",
        evidencePaths: ["."],
      },
      {
        text: "Use Serena for symbol lookup, reference analysis, local reading, and precise modification when it is available.",
        evidencePaths: ["."],
      },
      {
        text: "If either tool is unavailable, continue with the project's normal tools; do not block the task or initialize tools automatically.",
        evidencePaths: ["."],
      },
    ],
    references,
    referenceGuidance: references.length === 0
      ? []
      : [{ text: "Open only references relevant to the current task.", evidencePaths: ["."] }],
    handoffSubjects: ["features", "modules", "bugs"],
    advisories: [],
  };
}

export async function initializeAnalyzedProject(project) {
  return initializeProject(project, await buildTestProjectAnalysis(project));
}

export async function synchronizeAnalyzedProject(project) {
  return synchronizeProject(project, await buildTestProjectAnalysis(project));
}
