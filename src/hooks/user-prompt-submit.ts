import { relative } from "node:path";
import { readFile } from "node:fs/promises";
import { matchHandoffs } from "../application/handoffs.js";
import { findProjectRoot } from "../infrastructure/files.js";
import { readHookInput, runHook, writeAdditionalContext } from "./hook-io.js";
import { claimPromptInjection, hasPromptInjection, withPromptInjectionReservation } from "./prompt-injection-state.js";

type Match = Awaited<ReturnType<typeof matchHandoffs>>[number];
interface Card { match: Match; identity: string; text: string }

await runHook("UserPromptSubmit", async () => {
  const input = await readHookInput();
  if (typeof input.prompt !== "string" || input.prompt.trim().length === 0) return;
  const projectRoot = await findProjectRoot(input.cwd);
  if (projectRoot === undefined) return;
  const matches = await matchHandoffs(projectRoot, input.prompt);
  const candidates: Card[] = [];
  for (const match of matches) {
    const identity = JSON.stringify({
      workId: match.entry.workId, revision: match.entry.revision, disposition: match.disposition,
    });
    if (await hasPromptInjection(input.session_id, projectRoot, identity)) continue;
    candidates.push({ match, identity, text: renderCard(match) });
  }
  if (candidates.length === 0) return;
  await withPromptInjectionReservation(input.session_id, projectRoot, async () => {
    const available: Card[] = [];
    for (const card of candidates) {
      // Another Hook may have emitted this card before the reservation was acquired.
      if (!(await hasPromptInjection(input.session_id, projectRoot, card.identity))) available.push(card);
    }
    if (available.length === 0) return;
    const limit = await configuredContextLimit();
    const root = relative(input.cwd, projectRoot) || ".";
    let selected = available;
    let context = renderContext(selected, root, false);
    if (context.length > limit) {
      selected = [];
      for (const candidate of available) {
        // Use a locator fallback only when the full card cannot fit on its own.
        const card = renderContext([candidate], root, true).length <= limit ? candidate : {
          ...candidate, text: `${cardHeader(candidate.match)}\nCurrent: ${candidate.match.entry.currentPath}`,
        };
        const trial = [...selected, card];
        if (renderContext(trial, root, true).length <= limit) selected.push(card);
      }
      context = renderContext(selected, root, selected.length < available.length);
    }
    if (context.length > limit) throw new Error("Hook instructions exceed the configured additionalContextLimit.");
    await writeAdditionalContext("UserPromptSubmit", context);
    // stdout and disk are not transactional: a crash here can cause a later retry.
    for (const card of selected) await claimPromptInjection(input.session_id, projectRoot, card.identity);
  });
});

async function configuredContextLimit(): Promise<number> {
  const config = JSON.parse(await readFile(new URL("../../hooks/hooks.json", import.meta.url), "utf8")) as {
    hooks?: { UserPromptSubmit?: Array<{ hooks?: Array<{ additionalContextLimit?: number }> }> };
  };
  const limit = config.hooks?.UserPromptSubmit?.[0]?.hooks?.[0]?.additionalContextLimit;
  if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit <= 0) {
    throw new Error("UserPromptSubmit requires a positive additionalContextLimit.");
  }
  return limit;
}

function renderContext(cards: Card[], root: string, truncated: boolean): string {
  return [
    "[codex-project-context] Relevant handoff cards (a later revision supersedes an earlier card):",
    ...cards.map((card) => card.text),
    ...(truncated ? ["Hook routing output was truncated by its character budget. Unshown cards remain eligible on a later prompt; use the handoff match CLI for the complete result when needed."] : []),
    `Project root: ${root}`,
    ...(cards.some((card) => card.match.disposition === "reliable")
      ? ["Use the summaries first. Read only current-document sections needed to resolve the present evidence gap; matching does not require loading every body."] : []),
    ...(cards.some((card) => card.match.disposition === "candidate")
      ? ["Candidate-only items have ambiguous objectives. Compare metadata with the user's goal before loading a body."] : []),
    "Read history only for explicit trace, conflict diagnosis, or recovery. Current code, configuration and observed evidence remain authoritative.",
  ].join("\n\n");
}

function renderCard(match: Match): string {
  const { entry } = match;
  const links = [
    ...(entry.routing.planIds ?? []), ...(entry.routing.changeIds ?? []),
    ...(entry.routing.taskRefs ?? []).map((ref) => ref.changeId + "/" + ref.taskId),
  ];
  const header = cardHeader(match);
  const locator = `Current: ${entry.currentPath}`;
  return [
    header + " " + compact(entry.title, 90), compact(entry.summary, 150), locator,
    ...(links.length === 0 ? [] : ["Links: " + compact(links.join(", "), 160)]),
  ].join("\n");
}

function cardHeader({ entry, confidence, disposition }: Match): string {
  return `${entry.workId} revision ${entry.revision} [${entry.status}; ${confidence}${disposition === "candidate" ? "; candidate-only" : ""}]`;
}

function compact(value: string, limit: number): string {
  const line = value.replace(/\s+/gu, " ").trim();
  return line.length <= limit ? line : line.slice(0, limit - 1) + "…";
}
