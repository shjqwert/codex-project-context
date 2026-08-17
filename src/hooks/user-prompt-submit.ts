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
      .map(({ entry }) => ({
        workId: entry.workId,
        revision: entry.revision,
      }))
      .sort((left, right) => left.workId.localeCompare(right.workId)),
  );
  if (!(await claimPromptInjection(input.session_id, projectRoot, matchIdentity))) return;

  const rendered = renderCards(matches, 900);
  const recordCount = matches.length;

  writeAdditionalContext(
    "UserPromptSubmit",
    [
      "[codex-project-context] Potentially relevant handoff current documents:",
      `Matched ${matches.length} work item(s) and ${recordCount} current document(s).`,
      ...rendered.cards,
      ...(rendered.truncated
        ? ["Hook routing output was truncated by its character budget. Run the handoff match CLI with the current prompt to retrieve the complete reliable match set."]
        : []),
      `Project root: ${relative(input.cwd, projectRoot) || "."}`,
      "Read every reliably relevant current document listed by the complete match result. Read history only for explicit trace, conflict diagnosis, or recovery, then verify claims against current code and tests.",
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
      `${record.workId} revision ${record.revision}: ${record.path} [${record.availableSections.join(", ")}]`
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
