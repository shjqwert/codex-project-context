import { relative } from "node:path";
import { matchHandoffs } from "../application/handoffs.js";
import { findProjectRoot } from "../infrastructure/files.js";
import { readHookInput, runHook, writeAdditionalContext } from "./hook-io.js";

await runHook(async () => {
  const input = await readHookInput();
  if (typeof input.prompt !== "string" || input.prompt.trim().length === 0) return;
  const projectRoot = await findProjectRoot(input.cwd);
  if (projectRoot === undefined) return;

  const matches = await matchHandoffs(projectRoot, input.prompt, 3);
  if (matches.length === 0) return;

  const cards = matches.map(({ entry, score, reasons }) =>
    [
      `${entry.id}: ${entry.title} (score ${score})`,
      `Match: ${reasons.join(", ")}`,
      `Path: ${entry.path}`,
      entry.sections.length > 0 ? `Suggested sections: ${entry.sections.join(", ")}` : undefined,
    ]
      .filter((line): line is string => line !== undefined)
      .join("\n"),
  );

  writeAdditionalContext(
    "UserPromptSubmit",
    [
      "[codex-project-context] Potentially relevant handoff records:",
      ...cards,
      `Project root: ${relative(input.cwd, projectRoot) || "."}`,
      "Open only the relevant records and verify their claims against current code and tests.",
    ].join("\n\n"),
  );
});

