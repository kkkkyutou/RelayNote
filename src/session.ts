import path from "node:path";
import { gitChangedFiles } from "./git.js";
import { reduceSession } from "./reducer.js";
import { renderMarkdown } from "./render.js";
import {
  appendEvent,
  readEvents,
  readMetadata,
  writeMetadata,
  writeNote,
  writeResumePacket,
} from "./storage.js";
import type { RelayEvent, SessionMetadata, SessionStatus } from "./types.js";
import { nowIso } from "./utils.js";

export async function initSession(
  dataRoot: string,
  metadata: Omit<SessionMetadata, "createdAt" | "updatedAt">,
): Promise<SessionMetadata> {
  const now = nowIso();
  const full: SessionMetadata = {
    ...metadata,
    createdAt: now,
    updatedAt: now,
  };
  await writeMetadata(dataRoot, full);
  return full;
}

export async function emitEvent(
  dataRoot: string,
  sessionId: string,
  source: string,
  kind: RelayEvent["kind"],
  payload: Record<string, unknown>,
): Promise<void> {
  const event: RelayEvent = {
    sessionId,
    ts: nowIso(),
    kind,
    source,
    payload,
  };
  await appendEvent(dataRoot, event);
  await refreshArtifacts(dataRoot, sessionId);
}

export async function refreshArtifacts(dataRoot: string, sessionId: string): Promise<void> {
  const metadata = await readMetadata(dataRoot, sessionId);
  const updatedMetadata: SessionMetadata = {
    ...metadata,
    updatedAt: nowIso(),
  };
  await writeMetadata(dataRoot, updatedMetadata);
  const events = await readEvents(dataRoot, sessionId).catch(() => []);
  const changedFiles = await gitChangedFiles(updatedMetadata.workingDirectory);
  const { note, resumePacket } = reduceSession(updatedMetadata, events, changedFiles);
  const markdown = renderMarkdown(note);
  await writeNote(dataRoot, note, markdown);
  await writeResumePacket(dataRoot, sessionId, resumePacket);
}

export async function emitStatusHint(
  dataRoot: string,
  sessionId: string,
  status: SessionStatus,
  reason?: string,
): Promise<void> {
  await emitEvent(dataRoot, sessionId, "relaynote", "status_hint", { status, reason });
}

export function deriveWorkingDirectory(cwd: string, provided?: string): string {
  return path.resolve(provided ?? cwd);
}
