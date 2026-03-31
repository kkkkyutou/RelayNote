import { spawn } from "node:child_process";
import { emitEvent, emitStatusHint, initSession } from "./session.js";
import type { SessionMetadata } from "./types.js";
import { defaultSessionId, shellQuote } from "./utils.js";

interface RunOptions {
  dataRoot: string;
  goal: string;
  workingDirectory: string;
  command: string[];
}

interface CheckOptions {
  dataRoot: string;
  sessionId: string;
  name: string;
  workingDirectory: string;
  command: string[];
}

async function executeLoggedCommand(
  dataRoot: string,
  sessionId: string,
  source: string,
  command: string[],
  workingDirectory: string,
): Promise<number> {
  const quotedCommand = shellQuote(command);
  await emitEvent(dataRoot, sessionId, source, "command_started", {
    command: quotedCommand,
  });

  const child = spawn(command[0], command.slice(1), {
    cwd: workingDirectory,
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
    enqueueWrite(emitEvent(dataRoot, sessionId, source, "output_chunk", {
      text: chunk.toString("utf8"),
    }));
  });

  child.stderr.on("data", (chunk: Buffer) => {
    process.stderr.write(chunk);
    enqueueWrite(emitEvent(dataRoot, sessionId, source, "output_chunk", {
      text: chunk.toString("utf8"),
    }));
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });

  await Promise.all([...pendingWrites]);

  await emitEvent(dataRoot, sessionId, source, "command_finished", {
    command: quotedCommand,
    exitCode,
  });

  return exitCode;
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

  const exitCode = await executeLoggedCommand(
    options.dataRoot,
    sessionId,
    "processCollector",
    options.command,
    options.workingDirectory,
  );

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

export async function runValidationCheck(options: CheckOptions): Promise<number> {
  if (options.command.length === 0) {
    throw new Error("no command provided");
  }

  const exitCode = await executeLoggedCommand(
    options.dataRoot,
    options.sessionId,
    "validationCollector",
    options.command,
    options.workingDirectory,
  );

  await emitEvent(options.dataRoot, options.sessionId, "validationCollector", "validation_reported", {
    name: options.name,
    command: shellQuote(options.command),
    exitCode,
    status: exitCode === 0 ? "passed" : "failed",
  });

  return exitCode;
}
