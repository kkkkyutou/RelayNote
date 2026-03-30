import { spawn } from "node:child_process";
import { initSession, emitEvent, emitStatusHint } from "./session.js";
import type { SessionMetadata } from "./types.js";
import { defaultSessionId, shellQuote } from "./utils.js";

interface RunOptions {
  dataRoot: string;
  goal: string;
  workingDirectory: string;
  command: string[];
}

export async function runCommandWithRelayNote(options: RunOptions): Promise<number> {
  if (options.command.length === 0) {
    throw new Error("no command provided");
  }

  const sessionId = defaultSessionId("run");
  const metadata: Omit<SessionMetadata, "createdAt" | "updatedAt"> = {
    sessionId,
    runtime: "process",
    goal: options.goal,
    workingDirectory: options.workingDirectory,
    source: "run",
    sourceRef: shellQuote(options.command),
  };

  await initSession(options.dataRoot, metadata);
  await emitEvent(options.dataRoot, sessionId, "processCollector", "session_started", {
    command: options.command,
  });
  await emitEvent(options.dataRoot, sessionId, "processCollector", "command_started", {
    command: shellQuote(options.command),
  });

  const child = spawn(options.command[0], options.command.slice(1), {
    cwd: options.workingDirectory,
    env: process.env,
    stdio: ["inherit", "pipe", "pipe"],
  });

  const pendingWrites = new Set<Promise<void>>();
  const enqueueWrite = (promise: Promise<void>): void => {
    pendingWrites.add(promise);
    promise.finally(() => pendingWrites.delete(promise)).catch(() => undefined);
  };

  child.stdout.on("data", (chunk: Buffer) => {
    process.stdout.write(chunk);
    enqueueWrite(emitEvent(options.dataRoot, sessionId, "processCollector", "output_chunk", {
      text: chunk.toString("utf8"),
    }));
  });

  child.stderr.on("data", (chunk: Buffer) => {
    process.stderr.write(chunk);
    enqueueWrite(emitEvent(options.dataRoot, sessionId, "processCollector", "output_chunk", {
      text: chunk.toString("utf8"),
    }));
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });

  await Promise.all([...pendingWrites]);

  await emitEvent(options.dataRoot, sessionId, "processCollector", "command_finished", {
    command: shellQuote(options.command),
    exitCode,
  });
  await emitEvent(options.dataRoot, sessionId, "processCollector", "session_stopped", {
    exitCode,
  });

  if (exitCode === 0) {
    await emitStatusHint(options.dataRoot, sessionId, "completed", "Wrapped command exited successfully.");
  } else {
    await emitStatusHint(options.dataRoot, sessionId, "blocked", "Wrapped command exited with a non-zero status.");
  }

  return exitCode;
}
