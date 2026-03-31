import test from "node:test";
import assert from "node:assert/strict";
import { reduceSession } from "../reducer.js";
import type { RelayEvent, SessionMetadata } from "../types.js";

function reduce(metadata: SessionMetadata, events: RelayEvent[], changedFiles: string[] = []) {
  return reduceSession({
    metadata,
    events,
    changedFiles,
    diffStat: changedFiles.length > 0
      ? {
          changedFiles: changedFiles.length,
          insertions: changedFiles.length,
          deletions: 0,
          summaryLine: `${changedFiles.length} file changed, ${changedFiles.length} insertion(+)`,
        }
      : undefined,
  });
}

test("reduceSession marks failed command as blocked", () => {
  const metadata: SessionMetadata = {
    sessionId: "run-1",
    runtime: "process",
    goal: "Fix the flaky test",
    workingDirectory: "/tmp/demo",
    source: "run",
    sourceRef: "npm test",
    createdAt: "2026-03-31T00:00:00.000Z",
    updatedAt: "2026-03-31T00:10:00.000Z",
  };
  const events: RelayEvent[] = [
    {
      sessionId: "run-1",
      ts: "2026-03-31T00:00:00.000Z",
      kind: "session_started",
      source: "processCollector",
      payload: {},
    },
    {
      sessionId: "run-1",
      ts: "2026-03-31T00:01:00.000Z",
      kind: "command_started",
      source: "processCollector",
      payload: { command: "npm test" },
    },
    {
      sessionId: "run-1",
      ts: "2026-03-31T00:02:00.000Z",
      kind: "command_finished",
      source: "processCollector",
      payload: { command: "npm test", exitCode: 1 },
    },
    {
      sessionId: "run-1",
      ts: "2026-03-31T00:03:00.000Z",
      kind: "session_stopped",
      source: "processCollector",
      payload: { exitCode: 1 },
    },
  ];
  const { note, resumePacket } = reduce(metadata, events, ["src/app.ts"]);
  assert.equal(note.status, "blocked");
  assert.equal(resumePacket.status, "blocked");
  assert.match(note.summary, /Current status: blocked/);
});

test("reduceSession marks clean stopped session with file changes as ready_for_review", () => {
  const metadata: SessionMetadata = {
    sessionId: "run-2",
    runtime: "process",
    goal: "Add retry logic",
    workingDirectory: "/tmp/demo",
    source: "run",
    sourceRef: "npm run build",
    createdAt: "2026-03-31T00:00:00.000Z",
    updatedAt: "2026-03-31T00:10:00.000Z",
  };
  const events: RelayEvent[] = [
    {
      sessionId: "run-2",
      ts: "2026-03-31T00:01:00.000Z",
      kind: "command_started",
      source: "processCollector",
      payload: { command: "npm run build" },
    },
    {
      sessionId: "run-2",
      ts: "2026-03-31T00:02:00.000Z",
      kind: "command_finished",
      source: "processCollector",
      payload: { command: "npm run build", exitCode: 0 },
    },
    {
      sessionId: "run-2",
      ts: "2026-03-31T00:03:00.000Z",
      kind: "validation_reported",
      source: "validationCollector",
      payload: { name: "build", command: "npm run build", exitCode: 0, status: "passed" },
    },
    {
      sessionId: "run-2",
      ts: "2026-03-31T00:04:00.000Z",
      kind: "session_stopped",
      source: "processCollector",
      payload: { exitCode: 0 },
    },
  ];
  const { note } = reduce(metadata, events, ["src/run.ts", "src/session.ts"]);
  assert.equal(note.status, "ready_for_review");
  assert.equal(note.touchedFiles.length, 2);
  assert.equal(note.checks[0]?.status, "passed");
});

test("reduceSession lets blocker annotations override completed hints", () => {
  const metadata: SessionMetadata = {
    sessionId: "run-3",
    runtime: "process",
    goal: "Ship a patch safely",
    workingDirectory: "/tmp/demo",
    source: "run",
    sourceRef: "echo ok",
    createdAt: "2026-03-31T00:00:00.000Z",
    updatedAt: "2026-03-31T00:10:00.000Z",
  };
  const events: RelayEvent[] = [
    {
      sessionId: "run-3",
      ts: "2026-03-31T00:01:00.000Z",
      kind: "session_stopped",
      source: "processCollector",
      payload: { exitCode: 0 },
    },
    {
      sessionId: "run-3",
      ts: "2026-03-31T00:02:00.000Z",
      kind: "status_hint",
      source: "relaynote",
      payload: { status: "completed", reason: "command exited successfully" },
    },
    {
      sessionId: "run-3",
      ts: "2026-03-31T00:03:00.000Z",
      kind: "annotation_added",
      source: "annotationCollector",
      payload: { category: "blocker", text: "Need a human review before handoff" },
    },
  ];
  const { note } = reduce(metadata, events);
  assert.equal(note.status, "waiting_for_human");
  assert.equal(note.blockers.length, 1);
});

test("reduceSession marks repeated failure followed by idle as blocked", () => {
  const metadata: SessionMetadata = {
    sessionId: "run-4",
    runtime: "process",
    goal: "Recover failing tests",
    workingDirectory: "/tmp/demo",
    source: "run",
    sourceRef: "npm test",
    createdAt: "2026-03-31T00:00:00.000Z",
    updatedAt: "2026-03-31T00:10:00.000Z",
  };
  const events: RelayEvent[] = [
    {
      sessionId: "run-4",
      ts: "2026-03-31T00:01:00.000Z",
      kind: "command_finished",
      source: "processCollector",
      payload: { command: "npm test", exitCode: 1 },
    },
    {
      sessionId: "run-4",
      ts: "2026-03-31T00:02:00.000Z",
      kind: "session_idle",
      source: "tmuxCollector",
      payload: { seconds: 30 },
    },
  ];
  const { note } = reduce(metadata, events);
  assert.equal(note.status, "blocked");
});
