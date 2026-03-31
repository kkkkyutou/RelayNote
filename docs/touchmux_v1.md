# TouchMux Integration Contract (v1)

This document defines the minimal integration contract between TouchMux and
RelayNote in Stage 3.

## Goal

Allow TouchMux to consume RelayNote handover data without reading internal
session files directly.

## Server Expectations

Run RelayNote server:

```bash
node dist/cli.js serve \
  --host 127.0.0.1 \
  --port 4318 \
  --token your-strong-token \
  --allowed-origins https://touchmux.example.com
```

If host is non-loopback, RelayNote requires `--token`.

## Auth

RelayNote accepts either:

- header: `X-RelayNote-Token: <token>`
- query: `?token=<token>`

TouchMux should prefer the header form.

## Endpoints

### Health

`GET /api/health`

Example response:

```json
{
  "ok": true,
  "authEnabled": true
}
```

### Generic Session List

`GET /api/sessions`

Returns session snapshots used by local reader and generic clients.

### Generic Note

`GET /api/sessions/:id/note`

Returns full handover note contract.

### Generic Resume Packet

`GET /api/sessions/:id/resume-packet`

Returns compact resume payload.

### TouchMux Session List (v1)

`GET /api/touchmux/v1/sessions`

Response:

```json
{
  "version": "touchmux-v1",
  "sessions": [
    {
      "id": "run-...",
      "goal": "Fix reconnect retry path",
      "status": "waiting_for_human",
      "runtime": "process",
      "source": "run",
      "sourceRef": "codex exec ...",
      "updatedAt": "2026-03-31T06:00:00.000Z",
      "lastActivityAt": "2026-03-31T05:59:59.000Z",
      "summary": "...",
      "touchedFilesCount": 4,
      "blockersCount": 1,
      "checksCount": 2
    }
  ]
}
```

### TouchMux Handover Detail (v1)

`GET /api/touchmux/v1/sessions/:id`

Response:

```json
{
  "version": "touchmux-v1",
  "handover": {
    "sessionId": "run-...",
    "goal": "...",
    "status": "ready_for_review",
    "updatedAt": "...",
    "lastActivityAt": "...",
    "summary": "...",
    "blockers": [],
    "nextActions": [],
    "touchedFiles": [],
    "diffStat": {
      "changedFiles": 2,
      "insertions": 20,
      "deletions": 5,
      "summaryLine": "2 files changed, 20 insertions(+), 5 deletions(-)"
    },
    "checks": [],
    "resumePrompt": "..."
  }
}
```

## Compatibility Rule

TouchMux should treat unknown fields as additive and ignore them.

RelayNote should not silently change or remove existing v1 fields without a new
versioned endpoint.
