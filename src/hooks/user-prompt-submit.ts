import { relative } from "node:path";
import { matchHandoffs } from "../application/handoffs.js";
import { findProjectRoot } from "../infrastructure/files.js";
import { readHookInput, runHook, writeAdditionalContext } from "./hook-io.js";
import { claimPromptInjection, hasPromptInjection } from "./prompt-injection-state.js";

await runHook("UserPromptSubmit", async () => {
  const input = await readHookInput();
  if (typeof input.prompt !== "string" || input.prompt.trim().length === 0) return;
  const projectRoot = await findProjectRoot(input.cwd);
  if (projectRoot === undefined) return;
  const matches = await matchHandoffs(projectRoot, input.prompt);
  const cards: string[] = [];
  const emitted: typeof matches = [];
  const identities: string[] = [];
  let used = 0;
  let truncated = false;
  for (const match of matches) {
    const identity = JSON.stringify({
      workId: match.entry.workId, revision: match.entry.revision, disposition: match.disposition,
    });
    if (await hasPromptInjection(input.session_id, projectRoot, identity)) continue;
    const card = renderCard(match);
    const size = card.length + (cards.length === 0 ? 0 : 2);
    if (used + size > 900) { truncated = true; continue; }
    cards.push(card);
    emitted.push(match);
    identities.push(identity);
    used += size;
  }
  if (cards.length === 0 && !truncated) return;
  await writeAdditionalContext("UserPromptSubmit", [
    "[codex-project-context] Relevant handoff cards (a later revision supersedes an earlier card):",
    ...cards,
    ...(truncated ? ["Hook routing output was truncated by its character budget. Unshown cards remain eligible on a later prompt; use the handoff match CLI for the complete result when needed."] : []),
    `Project root: ${relative(input.cwd, projectRoot) || "."}`,
    ...(emitted.some((match) => match.disposition === "reliable")
      ? ["Use the summaries first. Read only current-document sections needed to resolve the present evidence gap; matching does not require loading every body."] : []),
    ...(emitted.some((match) => match.disposition === "candidate")
      ? ["Candidate-only items have ambiguous objectives. Compare metadata with the user's goal before loading a body."] : []),
    "Read history only for explicit trace, conflict diagnosis, or recovery. Current code, configuration and observed evidence remain authoritative.",
  ].join("\n\n"));
  // Record only successfully emitted cards. A failed output leaves them recoverable.
  for (const identity of identities) await claimPromptInjection(input.session_id, projectRoot, identity);
});

function renderCard(match: Awaited<ReturnType<typeof matchHandoffs>>[number]): string {
  const { entry, confidence, disposition } = match;
  const links = [
    ...(entry.routing.planIds ?? []), ...(entry.routing.changeIds ?? []),
    ...(entry.routing.taskRefs ?? []).map((ref) => ref.changeId + "/" + ref.taskId),
  ];
  const header = `${entry.workId} revision ${entry.revision} [${entry.status}; ${confidence}${disposition === "candidate" ? "; candidate-only" : ""}]`;
  const locator = `Current: ${entry.currentPath}`;
  const card = [
    header + " " + compact(entry.title, 90), compact(entry.summary, 150), locator,
    ...(links.length === 0 ? [] : ["Links: " + compact(links.join(", "), 160)]),
  ].join("\n");
  return card.length <= 900 ? card : [header, locator].join("\n");
}

function compact(value: string, limit: number): string {
  const line = value.replace(/\s+/gu, " ").trim();
  return line.length <= limit ? line : line.slice(0, limit - 1) + "…";
}
