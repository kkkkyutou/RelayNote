import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { listSessionSnapshots, readNote, writeMetadata, writeNote } from "../storage.js";
import type { HandoverNote, SessionMetadata } from "../types.js";

test("listSessionSnapshots returns newest sessions first", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "relaynote-storage-"));

  const metadataA: SessionMetadata = {
    sessionId: "a",
    runtime: "process",
    goal: "Older goal",
    workingDirectory: "/tmp/a",
    source: "run",
    createdAt: "2026-03-31T00:00:00.000Z",
    updatedAt: "2026-03-31T00:01:00.000Z",
  };
  const noteA: HandoverNote = {
    sessionId: "a",
    runtime: "process",
    source: "run",
    sourceRef: "older",
    goal: "Older goal",
    status: "completed",
    statusReason: "Session stopped without unresolved blockers.",
    confidence: "medium",
    startedAt: metadataA.createdAt,
    updatedAt: "2026-03-31T00:01:00.000Z",
    lastActivityAt: "2026-03-31T00:01:00.000Z",
    workingDirectory: "/tmp/a",
    summary: "older",
    recentActions: [],
    touchedFiles: [],
    checks: [],
    evidence: [],
    blockers: [],
    nextActions: [],
    handoverChecklist: ["Archive the session note or attach it to the final task record."],
    risks: [],
    resumePrompt: "resume older",
    compactSummary: "COMPLETED | goal=Older goal | reason=Session stopped without unresolved blockers.",
  };

  const metadataB: SessionMetadata = {
    sessionId: "b",
    runtime: "tmux",
    goal: "Newer goal",
    workingDirectory: "/tmp/b",
    source: "tmux",
    createdAt: "2026-03-31T00:00:00.000Z",
    updatedAt: "2026-03-31T00:02:00.000Z",
  };
  const noteB: HandoverNote = {
    sessionId: "b",
    runtime: "tmux",
    source: "tmux",
    sourceRef: "tmux:b",
    goal: "Newer goal",
    status: "ready_to_resume",
    statusReason: "An explicit handoff was requested.",
    confidence: "medium",
    startedAt: metadataB.createdAt,
    updatedAt: "2026-03-31T00:02:00.000Z",
    lastActivityAt: "2026-03-31T00:02:00.000Z",
    workingDirectory: "/tmp/b",
    summary: "newer",
    recentActions: [],
    touchedFiles: ["x.ts"],
    checks: [],
    evidence: [],
    blockers: [{ ts: "2026-03-31T00:02:00.000Z", label: "Need review" }],
    nextActions: [],
    handoverChecklist: ["Start a fresh execution session from resume prompt."],
    risks: [],
    resumePrompt: "resume newer",
    compactSummary: "READY_TO_RESUME | goal=Newer goal | reason=An explicit handoff was requested.",
  };

  await writeMetadata(root, metadataA);
  await writeNote(root, noteA, "# A\n");
  await writeMetadata(root, metadataB);
  await writeNote(root, noteB, "# B\n");

  const snapshots = await listSessionSnapshots(root);
  assert.equal(snapshots.length, 2);
  assert.equal(snapshots[0].sessionId, "b");
  assert.equal(snapshots[0].blockersCount, 1);
  assert.equal(snapshots[0].source, "tmux");
  assert.equal(snapshots[1].sessionId, "a");
});

test("readNote rejects unsafe session ids", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "relaynote-storage-safe-"));
  await assert.rejects(() => readNote(root, "../escape"), /unsafe session id/);
});
