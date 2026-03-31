# RelayNote Contracts

This document freezes the public data contracts introduced in Stage 1.

These contracts are the stable boundary between:

- the handover core
- local readers
- TouchMux or other external integrations

## Session Directory Layout

Each session lives under:

```text
.relaynote/sessions/<session-id>/
  events.jsonl
  metadata.json
  current_note.json
  current_note.md
  resume_packet.json
```

## Session ID Rules

Session IDs are intentionally restricted to:

- letters
- digits
- `.`
- `_`
- `-`

This prevents path traversal and keeps the on-disk layout predictable.

## Event Log Contract

Each line in `events.jsonl` is one JSON object:

```json
{
  "sessionId": "run-2026-03-31T12-00-00-000Z",
  "ts": "2026-03-31T12:01:00.000Z",
  "kind": "command_finished",
  "source": "processCollector",
  "payload": {
    "command": "npm test",
    "exitCode": 1
  }
}
```

Supported event kinds in Stage 1:

- `session_started`
- `output_chunk`
- `command_started`
- `command_finished`
- `validation_reported`
- `files_changed`
- `artifact_added`
- `status_hint`
- `annotation_added`
- `session_idle`
- `session_stopped`

## current_note.json Contract

`current_note.json` is the main machine-readable handover artifact.

Key fields:

- `sessionId`
- `runtime`
- `source`
- `sourceRef`
- `goal`
- `status`
- `startedAt`
- `updatedAt`
- `lastActivityAt`
- `workingDirectory`
- `summary`
- `recentActions`
- `touchedFiles`
- `diffStat`
- `checks`
- `evidence`
- `blockers`
- `nextActions`
- `risks`
- `resumePrompt`

## resume_packet.json Contract

`resume_packet.json` is a compact handoff payload for the next operator.

Key fields:

- `sessionId`
- `goal`
- `status`
- `summary`
- `blockers`
- `nextActions`
- `touchedFiles`
- `diffStat`
- `checks`
- `resumePrompt`
- `updatedAt`

## Session Snapshot Contract

The API session list and local readers should consume a compact snapshot shape:

- `sessionId`
- `goal`
- `status`
- `runtime`
- `source`
- `sourceRef`
- `createdAt`
- `updatedAt`
- `lastActivityAt`
- `workingDirectory`
- `summary`
- `touchedFilesCount`
- `blockersCount`
- `checksCount`

## HTTP Integration Contract (Stage 3)

Stable endpoints for integration:

- `GET /api/health`
- `GET /api/sessions`
- `GET /api/sessions/:id/note`
- `GET /api/sessions/:id/resume-packet`
- `GET /api/touchmux/v1/sessions`
- `GET /api/touchmux/v1/sessions/:id`

If token auth is enabled, API callers must pass:

- `X-RelayNote-Token` header, or
- `token` query parameter

## Status Contract

Stage 1 keeps the status model intentionally small:

- `running`
- `waiting_for_human`
- `blocked`
- `ready_for_review`
- `ready_to_resume`
- `completed`
- `abandoned`

These values are shared across:

- CLI output
- JSON artifacts
- API responses
- web/mobile readers
