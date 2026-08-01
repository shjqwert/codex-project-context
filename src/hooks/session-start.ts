import { readProjectContext } from "../application/project-context.js";
import { findProjectRoot } from "../infrastructure/files.js";
import { readHookInput, runHook, writeAdditionalContext } from "./hook-io.js";

await runHook(async () => {
  const input = await readHookInput();
  const projectRoot = await findProjectRoot(input.cwd);
  if (projectRoot === undefined) return;

  const context = await readProjectContext(projectRoot);
  writeAdditionalContext(
    "SessionStart",
    [
      "[codex-project-context] This project has durable cross-task context enabled.",
      `Handoff index: ${context.handoffIndex}`,
      "Read only handoff records relevant to the current task; current code and tests remain the source of truth.",
    ].join("\n"),
  );
});
