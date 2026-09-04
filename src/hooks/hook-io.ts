import { appendFile, mkdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { stdin } from "node:process";

const MAX_DIAGNOSTIC_BYTES = 1_048_576;

export interface HookInput {
  session_id?: string;
  cwd: string;
  hook_event_name: string;
  prompt?: string;
  source?: string;
}

export async function readHookInput(): Promise<HookInput> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const input = JSON.parse(Buffer.concat(chunks).toString("utf8")) as HookInput;
  if (typeof input.cwd !== "string" || typeof input.hook_event_name !== "string") {
    throw new Error("Hook input requires cwd and hook_event_name.");
  }
  return input;
}

export async function writeAdditionalContext(eventName: string, additionalContext: string): Promise<void> {
  const output =
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: eventName,
        additionalContext,
      },
    })}\n`;
  await new Promise<void>((resolve, reject) => {
    process.stdout.once("error", reject);
    process.stdout.write(output, (error) => {
      if (error) { reject(error); return; }
      process.stdout.removeListener("error", reject);
      resolve();
    });
  });
}

export async function runHook(eventName: string, action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    await writeHookDiagnostic(eventName, error).catch(() => undefined);
  }
}

async function writeHookDiagnostic(eventName: string, error: unknown): Promise<void> {
  const configuredPath = process.env.CODEX_PROJECT_CONTEXT_HOOK_LOG?.trim();
  const codexRoot = process.env.CODEX_HOME?.trim() || resolve(homedir(), ".codex");
  const logPath = configuredPath || resolve(codexRoot, "logs", "project-context-hooks.jsonl");
  const record = {
    timestamp: new Date().toISOString(),
    eventName,
    errorName: error instanceof Error ? error.name : "UnknownError",
    message:
      error instanceof SyntaxError
        ? "Invalid JSON input or project metadata."
        : sanitizeErrorMessage(error instanceof Error ? error.message : String(error)),
  };
  await mkdir(dirname(logPath), { recursive: true });
  const line = `${JSON.stringify(record)}\n`;
  try {
    const details = await stat(logPath);
    if (details.size + Buffer.byteLength(line, "utf8") > MAX_DIAGNOSTIC_BYTES) {
      await writeFile(logPath, line, "utf8");
      return;
    }
  } catch (statError) {
    if (!(statError instanceof Error && "code" in statError && statError.code === "ENOENT")) {
      throw statError;
    }
  }
  await appendFile(logPath, line, "utf8");
}

function sanitizeErrorMessage(value: string): string {
  return value.replace(/[\r\n]+/gu, " ").slice(0, 1_000);
}
