import test from "node:test";
import assert from "node:assert/strict";
import { reduceSession } from "../reducer.js";
import type { RelayEvent, SessionMetadata } from "../types.js";

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
  const { note, resumePacket } = reduceSession(metadata, events, ["src/app.ts"]);
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
      kind: "session_stopped",
      source: "processCollector",
      payload: { exitCode: 0 },
    },
  ];
  const { note } = reduceSession(metadata, events, ["src/run.ts", "src/session.ts"]);
  assert.equal(note.status, "ready_for_review");
  assert.equal(note.touchedFiles.length, 2);
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
  const { note } = reduceSession(metadata, events, []);
  assert.equal(note.status, "waiting_for_human");
  assert.equal(note.blockers.length, 1);
});
