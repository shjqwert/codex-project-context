import assert from "node:assert/strict";
import { mkdir, readFile, unlink, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { initializeAnalyzedProject as initializeProject, synchronizeAnalyzedProject as synchronizeProject } from "./helpers/project-analysis.mjs";
import { makeTempDirectory } from "./helpers/temp-directory.mjs";
import { createHandoff, getHandoffHistory, matchHandoffs } from "../dist/application/handoffs.js";
import { withProjectWriteLock } from "../dist/infrastructure/project-write-lock.js";

test("init and sync reject missing indexes with current, history or legacy storage before writes", async () => {
  for (const operation of [initializeProject, synchronizeProject]) {
    for (const directory of ["current", "history", "records"]) {
      const project = await makeTempDirectory("context-missing-index-");
      await initializeProject(project);
      const contextPath = join(project, ".agent/context.json");
      const agentsPath = join(project, "AGENTS.md");
      const before = [await readFile(contextPath, "utf8"), await readFile(agentsPath, "utf8")];
      await mkdir(join(project, ".agent/handoff", directory), { recursive: true });
      await writeFile(join(project, ".agent/handoff", directory, "evidence.md"), "Existing evidence");
      await unlink(join(project, ".agent/handoff/index.json"));
      await assert.rejects(operation(project), /Handoff index is missing while records exist/);
      assert.deepEqual([await readFile(contextPath, "utf8"), await readFile(agentsPath, "utf8")], before);
      await assert.rejects(readFile(join(project, ".agent/handoff/index.json")), { code: "ENOENT" });
    }
  }
});

test("sync validates malformed AGENTS before changing context, index or legacy policy", async () => {
  const project = await makeTempDirectory("context-sync-preflight-");
  await initializeProject(project);
  const agentsPath = join(project, "AGENTS.md");
  const original = await readFile(agentsPath, "utf8");
  const malformed = original.replace(/## Sol Advisor Integration\n[\s\S]*?(?=## Handoff Context)/u, "")
    .replace("<!-- PROJECT_CONTEXT_END -->", "");
  await writeFile(agentsPath, malformed);
  const contextPath = join(project, ".agent/context.json");
  const indexPath = join(project, ".agent/handoff/index.json");
  const before = [await readFile(contextPath, "utf8"), await readFile(indexPath, "utf8")];
  await writeFile(join(project, "new-file.txt"), "New inventory evidence");
  await assert.rejects(synchronizeProject(project), /incomplete project-context managed section/);
  assert.deepEqual([await readFile(contextPath, "utf8"), await readFile(indexPath, "utf8")], before);
  assert.equal(await readFile(agentsPath, "utf8"), malformed);
  await assert.rejects(readFile(join(project, ".agent/authorizations.json")), { code: "ENOENT" });
});

test("matching and history repair wait for the writer and reread its committed index", async () => {
  for (const query of [p => matchHandoffs(p, "W001"), p => getHandoffHistory(p, "W001")]) {
    const project = await makeTempDirectory("context-repair-lock-");
    await initializeProject(project);
    await createHandoff(project, { kind: "investigation", title: "Lock evidence", summary: "Committed evidence",
      sections: { objective: "Verify repair locking", currentState: "Committed evidence", remainingWork: "Check repair" } });
    const indexPath = join(project, ".agent/handoff/index.json");
    const committed = await readFile(indexPath, "utf8");
    let pending;
    await withProjectWriteLock(project, async () => {
      await writeFile(indexPath, JSON.stringify({ schemaVersion: 5, entries: [] }));
      await utimes(indexPath, new Date(0), new Date(0));
      const stale = await readFile(indexPath, "utf8");
      let settled = false;
      pending = query(project).finally(() => { settled = true; });
      await new Promise(resolve => setTimeout(resolve, 200));
      assert.equal(settled, false, "query must not repair while another writer holds the lock");
      assert.equal(await readFile(indexPath, "utf8"), stale);
      await writeFile(indexPath, committed);
    });
    const result = await pending;
    assert.equal(Array.isArray(result) ? result[0]?.entry.workId : result.workId, "W001");
    assert.equal(await readFile(indexPath, "utf8"), committed);
  }
});
