import { relative } from "node:path";
import { matchHandoffs } from "../application/handoffs.js";
import { findProjectRoot } from "../infrastructure/files.js";
import { readHookInput, runHook, writeAdditionalContext } from "./hook-io.js";
import { claimPromptInjection } from "./prompt-injection-state.js";

await runHook("UserPromptSubmit", async () => {
  const input = await readHookInput();
  if (typeof input.prompt !== "string" || input.prompt.trim().length === 0) return;
  const projectRoot = await findProjectRoot(input.cwd);
  if (projectRoot === undefined) return;

  const matches = await matchHandoffs(projectRoot, input.prompt);
  if (matches.length === 0) return;
  const matchIdentity = JSON.stringify(
    matches
      .map(({ entry, records }) => ({
        groupKey: entry.groupKey,
        recordIds: records.map(({ id }) => id).sort(),
      }))
      .sort((left, right) => left.groupKey.localeCompare(right.groupKey)),
  );
  if (!(await claimPromptInjection(input.session_id, projectRoot, matchIdentity))) return;

  const rendered = renderCards(matches, 900);
  const recordCount = matches.reduce((count, match) => count + match.records.length, 0);

  writeAdditionalContext(
    "UserPromptSubmit",
    [
      "[codex-project-context] Potentially relevant handoff records:",
      `Matched ${matches.length} work group(s) and ${recordCount} record(s).`,
      ...rendered.cards,
      ...(rendered.truncated
        ? ["Hook routing output was truncated by its character budget. Run the handoff match CLI with the current prompt to retrieve the complete reliable match set."]
        : []),
      `Project root: ${relative(input.cwd, projectRoot) || "."}`,
      "Read every reliably relevant record listed by the complete match result, then verify its claims against current code and tests.",
    ].join("\n\n"),
  );
});

function renderCards(
  matches: Awaited<ReturnType<typeof matchHandoffs>>,
  budget: number,
): { cards: string[]; truncated: boolean } {
  const cards: string[] = [];
  let used = 0;
  for (const { entry, score, reasons, confidence, records } of matches) {
    const recordLines = records.map((record) =>
      `${record.id}: ${record.path} [${record.availableSections.join(", ")}]`
    );
    const card = [
      `${entry.title} (score ${score}, ${confidence})`,
      `Match: ${reasons.join(", ")}`,
      ...recordLines,
    ].join("\n");
    if (used + card.length > budget) return { cards, truncated: true };
    cards.push(card);
    used += card.length;
  }
  return { cards, truncated: false };
}
