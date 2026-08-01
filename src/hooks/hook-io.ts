import { stdin } from "node:process";

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

export function writeAdditionalContext(eventName: string, additionalContext: string): void {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: eventName,
        additionalContext,
      },
    })}\n`,
  );
}

export async function runHook(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch {
    // Hooks are advisory in v0.1.0. Fail open so project work is never blocked.
  }
}

