import fs from "node:fs/promises";
import path from "node:path";
import type {
  HandoverNote,
  RelayEvent,
  ResumePacket,
  SessionMetadata,
  SessionSnapshot,
} from "./types.js";

function sessionDir(dataRoot: string, sessionId: string): string {
  return path.join(dataRoot, "sessions", sessionId);
}

export async function ensureSessionDir(dataRoot: string, sessionId: string): Promise<string> {
  const dir = sessionDir(dataRoot, sessionId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function writeMetadata(
  dataRoot: string,
  metadata: SessionMetadata,
): Promise<void> {
  const dir = await ensureSessionDir(dataRoot, metadata.sessionId);
  await fs.writeFile(
    path.join(dir, "metadata.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
    "utf8",
  );
}

export async function readMetadata(
  dataRoot: string,
  sessionId: string,
): Promise<SessionMetadata> {
  const file = path.join(sessionDir(dataRoot, sessionId), "metadata.json");
  return JSON.parse(await fs.readFile(file, "utf8")) as SessionMetadata;
}

export async function appendEvent(dataRoot: string, event: RelayEvent): Promise<void> {
  const dir = await ensureSessionDir(dataRoot, event.sessionId);
  await fs.appendFile(path.join(dir, "events.jsonl"), `${JSON.stringify(event)}\n`, "utf8");
}

export async function readEvents(dataRoot: string, sessionId: string): Promise<RelayEvent[]> {
  const file = path.join(sessionDir(dataRoot, sessionId), "events.jsonl");
  const content = await fs.readFile(file, "utf8");
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RelayEvent);
}

export async function writeNote(
  dataRoot: string,
  note: HandoverNote,
  markdown: string,
): Promise<void> {
  const dir = await ensureSessionDir(dataRoot, note.sessionId);
  await fs.writeFile(path.join(dir, "current_note.json"), `${JSON.stringify(note, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(dir, "current_note.md"), markdown, "utf8");
}

export async function readNote(dataRoot: string, sessionId: string): Promise<HandoverNote> {
  const file = path.join(sessionDir(dataRoot, sessionId), "current_note.json");
  return JSON.parse(await fs.readFile(file, "utf8")) as HandoverNote;
}

export async function readNoteMarkdown(dataRoot: string, sessionId: string): Promise<string> {
  return fs.readFile(path.join(sessionDir(dataRoot, sessionId), "current_note.md"), "utf8");
}

export async function writeResumePacket(
  dataRoot: string,
  sessionId: string,
  packet: ResumePacket,
): Promise<void> {
  const dir = await ensureSessionDir(dataRoot, sessionId);
  await fs.writeFile(
    path.join(dir, "resume_packet.json"),
    `${JSON.stringify(packet, null, 2)}\n`,
    "utf8",
  );
}

export async function readResumePacket(
  dataRoot: string,
  sessionId: string,
): Promise<ResumePacket> {
  const file = path.join(sessionDir(dataRoot, sessionId), "resume_packet.json");
  return JSON.parse(await fs.readFile(file, "utf8")) as ResumePacket;
}

export async function listSessions(dataRoot: string): Promise<string[]> {
  const dir = path.join(dataRoot, "sessions");
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}

export async function listSessionSnapshots(dataRoot: string): Promise<SessionSnapshot[]> {
  const sessionIds = await listSessions(dataRoot);
  const snapshots = await Promise.all(
    sessionIds.map(async (sessionId) => {
      try {
        const [metadata, note] = await Promise.all([
          readMetadata(dataRoot, sessionId),
          readNote(dataRoot, sessionId),
        ]);
        const snapshot: SessionSnapshot = {
          sessionId,
          goal: note.goal,
          status: note.status,
          runtime: metadata.runtime,
          updatedAt: note.updatedAt,
          workingDirectory: note.workingDirectory,
          summary: note.summary,
          touchedFilesCount: note.touchedFiles.length,
          blockersCount: note.blockers.length,
        };
        return snapshot;
      } catch {
        return null;
      }
    }),
  );

  return snapshots
    .filter((item): item is SessionSnapshot => item !== null)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}
