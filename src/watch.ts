import process from "node:process";
import { initSession, emitEvent, emitStatusHint } from "./session.js";
import { sessionExists, capturePane, diffPaneText } from "./tmux.js";
import type { SessionMetadata } from "./types.js";
import { sanitizeSessionId } from "./utils.js";

interface WatchOptions {
  dataRoot: string;
  tmuxSession: string;
  goal: string;
  workingDirectory: string;
  intervalMs: number;
}

export async function watchTmuxSession(options: WatchOptions): Promise<void> {
  if (!(await sessionExists(options.tmuxSession))) {
    throw new Error(`tmux session not found: ${options.tmuxSession}`);
  }

  const sessionId = sanitizeSessionId(`tmux-${options.tmuxSession}`);
  const metadata: Omit<SessionMetadata, "createdAt" | "updatedAt"> = {
    sessionId,
    runtime: "tmux",
    goal: options.goal,
    workingDirectory: options.workingDirectory,
    source: "tmux",
    sourceRef: options.tmuxSession,
  };

  await initSession(options.dataRoot, metadata);
  await emitEvent(options.dataRoot, sessionId, "tmuxCollector", "session_started", {
    tmuxSession: options.tmuxSession,
  });

  let previous = "";
  let idleSince = Date.now();
  let inFlight = false;

  const loop = async (): Promise<void> => {
    if (inFlight) {
      return;
    }
    inFlight = true;
    try {
    if (!(await sessionExists(options.tmuxSession))) {
      await emitEvent(options.dataRoot, sessionId, "tmuxCollector", "session_stopped", {
        reason: "tmux session no longer exists",
      });
      await emitStatusHint(options.dataRoot, sessionId, "ready_to_resume", "tmux session ended; use the resume packet to continue.");
      process.exit(0);
    }

    const current = await capturePane(options.tmuxSession);
    const delta = diffPaneText(previous, current).trim();
    previous = current;

    if (delta) {
      idleSince = Date.now();
      await emitEvent(options.dataRoot, sessionId, "tmuxCollector", "output_chunk", {
        text: delta,
      });
    } else if (Date.now() - idleSince >= options.intervalMs * 3) {
      idleSince = Date.now();
      await emitEvent(options.dataRoot, sessionId, "tmuxCollector", "session_idle", {
        seconds: Math.floor((options.intervalMs * 3) / 1000),
      });
    }
    } finally {
      inFlight = false;
    }
  };

  await loop();
  const timer = setInterval(() => {
    void loop().catch((error) => {
      console.error(`relaynote watch failed: ${(error as Error).message}`);
      process.exitCode = 1;
      clearInterval(timer);
    });
  }, options.intervalMs);

  const shutdown = async (): Promise<void> => {
    clearInterval(timer);
    await emitEvent(options.dataRoot, sessionId, "relaynote", "session_stopped", {
      reason: "watch process interrupted",
    });
  };

  process.on("SIGINT", () => void shutdown().finally(() => process.exit(130)));
  process.on("SIGTERM", () => void shutdown().finally(() => process.exit(143)));
}
