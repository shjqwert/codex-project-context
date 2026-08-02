import { relative } from "node:path";
import { matchHandoffs } from "../application/handoffs.js";
import { findProjectRoot } from "../infrastructure/files.js";
import { readHookInput, runHook, writeAdditionalContext } from "./hook-io.js";

await runHook("UserPromptSubmit", async () => {
  const input = await readHookInput();
  if (typeof input.prompt !== "string" || input.prompt.trim().length === 0) return;
  const projectRoot = await findProjectRoot(input.cwd);
  if (projectRoot === undefined) return;

  const matches = await matchHandoffs(projectRoot, input.prompt, 5);
  if (matches.length === 0) return;

  const cards = renderCards(matches, 900);

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

function renderCards(matches: Awaited<ReturnType<typeof matchHandoffs>>, budget: number): string[] {
  const cards: string[] = [];
  let used = 0;
  for (const { entry, score, reasons, confidence, relatedIds, suggestedSections } of matches) {
    const sectionHints = suggestedSections
      .slice(0, 2)
      .map(({ name, summary }) => `${name}: ${summary}`)
      .join(" | ");
    const card = [
      `${entry.id}: ${entry.title} (score ${score}, ${confidence})`,
      `Match: ${reasons.join(", ")}`,
      `Path: ${entry.path}`,
      relatedIds.length > 0 ? `Related handoffs: ${relatedIds.join(", ")}` : undefined,
      sectionHints.length > 0 ? `Suggested sections: ${sectionHints}` : undefined,
    ]
      .filter((line): line is string => line !== undefined)
      .join("\n");
    if (cards.length > 0 && used + card.length > budget) break;
    const boundedCard = card.slice(0, Math.max(0, budget - used));
    if (boundedCard.length === 0) break;
    cards.push(boundedCard);
    used += boundedCard.length;
  }
  return cards;
}
