# RelayNote

[中文说明](./README_CN.md)

RelayNote is a self-hosted session handover layer for long-running coding work.
It converts terminal activity into structured artifacts so you can continue a task without replaying full logs.

## Usage Modes

### 1. TouchMux integration (fast path)

Run RelayNote as a local handover API behind TouchMux (or any mobile workbench):

- `GET /api/touchmux/v1/sessions`
- `GET /api/touchmux/v1/sessions/:id`

Also available:

- `GET /api/health`
- `GET /api/sessions`
- `GET /api/sessions/:id/note`
- `GET /api/sessions/:id/resume-packet`

### 2. Standalone use (no TouchMux required)

Use RelayNote directly from CLI/TUI:

- Capture from an existing `tmux` session
- Wrap a command and track execution
- Attach checks and annotations
- Read notes from terminal, TUI, or browser

## Quick Start

### Requirements

- Node.js 22+
- `tmux` (for `watch`)
- `git` (optional, for changed-file/diff summary)

### Install and build

```bash
npm install
npm run build
```

### Run tests

```bash
npm test
```

## Main Commands

### Watch an existing tmux session

```bash
node dist/cli.js watch \
  --tmux codex-42 \
  --goal "Fix flaky auth refresh tests" \
  --cwd /path/to/repo
```

### Run a command under RelayNote

```bash
node dist/cli.js run \
  --goal "Inspect websocket reconnect failures" \
  --cwd /path/to/repo \
  -- bash -lc "npm test"
```

### List sessions

```bash
node dist/cli.js sessions
```

### Show a note

```bash
node dist/cli.js show run-2026-03-31T00-00-00-000Z
```

### Read resume packet

```bash
node dist/cli.js resume run-2026-03-31T00-00-00-000Z
```

Prompt only:

```bash
node dist/cli.js resume run-2026-03-31T00-00-00-000Z --prompt-only
```

### Add validation check

```bash
node dist/cli.js check run-2026-03-31T00-00-00-000Z \
  --name test \
  --cwd /path/to/repo \
  -- bash -lc "npm test"
```

### Add annotation

```bash
node dist/cli.js annotate run-2026-03-31T00-00-00-000Z \
  --type blocker \
  --text "Need a human review before merge"
```

### Start terminal TUI (no browser)

```bash
node dist/cli.js tui
```

### Start API + mobile web reader

```bash
node dist/cli.js serve --host 127.0.0.1 --port 4318
```

TouchMux-oriented setup:

```bash
node dist/cli.js serve \
  --host 127.0.0.1 \
  --port 4318 \
  --token your-strong-token \
  --allowed-origins https://touchmux.example.com
```

## Data Layout

By default:

```text
.relaynote/sessions/<session-id>/
  events.jsonl
  metadata.json
  current_note.json
  current_note.md
  resume_packet.json
```

## Security Defaults

- Refuse non-loopback bind without `--token`
- Token auth for all `/api/*` endpoints (`X-RelayNote-Token` header or `?token=...`)
- Optional origin allowlist via `--allowed-origins`
- Basic hardening headers on server responses

## Minimal Architecture

- Collectors: capture runtime signals from `tmux`, wrapped process, checks, annotations, and git.
- Normalized events: append-only `events.jsonl`.
- Reducer: deterministic status inference and handover synthesis.
- Storage/API/UI: JSON + Markdown artifacts, CLI/TUI, and mobile web/API access.

## Stage Status

- Stage 1 complete: handover contract, status inference, validation evidence, filesystem safety.
- Stage 2 complete: local-first CLI and TUI workflows.
- Stage 3 complete: integration and security surface (TouchMux v1 API, token auth, origin allowlist).
- Stage 4 complete: quality-oriented handover intelligence (`statusReason`, `confidence`, compact summary, checklist).
