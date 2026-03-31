# RelayNote

[中文说明](./README_CN.md)

RelayNote is a mobile-first, self-hosted session handover layer for long-running
coding agents.

It turns raw terminal activity into a structured handover note and a resume
packet, so another person, another model, or your future self can continue the
work without replaying the entire scrollback.

## Two Ways To Use RelayNote

RelayNote now serves two closely related audiences:

### 1. Fast TouchMux integration

If you already have a remote workbench such as TouchMux, RelayNote can act as a
read-only handover engine behind it.

The built-in API exposes:

- `GET /api/health`
- `GET /api/sessions`
- `GET /api/sessions/:id/note`
- `GET /api/sessions/:id/resume-packet`

This keeps the integration surface small and stable.

### 2. Standalone direct use

If you do not need TouchMux, RelayNote still works as a self-contained tool:

- CLI for `watch`, `run`, `note`, `resume`, `annotate`
- small built-in web server
- mobile-friendly browser reader

## Why RelayNote

Most AI coding tools are good at one of these two things:

- generating code
- streaming terminal output

They are still weak at a third thing that matters in real work:

- handing off an unfinished or just-finished session cleanly

RelayNote focuses on that missing layer.

It does not replace your terminal, editor, or agent runtime. It runs beside
them and continuously records:

- what the session was trying to do
- what changed
- what evidence exists
- what is blocked
- what should happen next

## What Problems It Solves

A long coding session usually leaves behind:

- a huge terminal scrollback
- partial code changes
- unclear status
- unclear next steps

That creates practical failures:

- you cannot review progress quickly on a phone
- a new model wastes context re-reading everything
- a collaborator cannot safely take over
- an overnight run ends with output, but not with a usable handoff

## Core Concepts

RelayNote writes a per-session artifact set:

- `events.jsonl`: append-only normalized event log
- `current_note.json`: structured machine-readable state
- `current_note.md`: human-readable handover note
- `resume_packet.json`: compact handoff payload for the next operator

The current note answers:

- What was the goal?
- What happened recently?
- What files changed?
- What evidence exists?
- Is the session blocked, completed, or ready to resume?
- What should the next operator do?

## Main Use Cases

### 1. Overnight agent runs

Start a coding agent before sleep, and inspect the next morning through a
compact handover note instead of raw logs.

### 2. Phone-first supervision

Read progress, blockers, and next actions from a phone without opening a full
browser IDE.

### 3. Cross-model continuation

Move a task from one model or tool to another without losing the working state.

Examples:

- Codex CLI -> Cline
- aider -> Codex CLI
- local machine -> remote node

### 4. Human collaborator takeover

Hand an unfinished session to another engineer with a compact, structured
context packet.

### 5. Failure recovery

When a run fails, keep a usable recovery artifact instead of only a terminal
transcript.

## Current v0.1 Features

- Watch an existing `tmux` session and refresh handover artifacts continuously
- Wrap a command and capture output, exit status, and note state
- Run named validation checks against an existing session
- List sessions directly from CLI (`relaynote sessions`)
- Read a single handover directly from CLI (`relaynote show`)
- Run a local terminal TUI (`relaynote tui`)
- Track session status as:
  - `running`
  - `waiting_for_human`
  - `blocked`
  - `ready_for_review`
  - `ready_to_resume`
  - `completed`
  - `abandoned`
- Attach manual annotations such as `blocker`, `note`, and `handoff`
- Capture touched files and git diff summaries when available
- Record named validation checks such as `test`, `build`, or `lint`
- Export both JSON and Markdown handover views

## Stage Status

- Stage 1: Core handover contracts, status inference, validation evidence, and
  baseline filesystem safety are implemented.
- Stage 2: local-first CLI and TUI usage is implemented.
- Stage 3: stronger integration surfaces and TouchMux-oriented contracts come
  after that.

## Quick Start

### Requirements

- Node.js 22+
- `tmux` for `watch` mode
- `git` if you want changed-file detection

### Install and build

```bash
npm install
npm run build
```

### Run tests

```bash
npm test
```

## CLI Usage

### Watch an existing tmux session

```bash
node dist/cli.js watch \
  --tmux codex-42 \
  --goal "Fix flaky auth refresh tests" \
  --cwd /path/to/repo
```

### Wrap a command

```bash
node dist/cli.js run \
  --goal "Inspect websocket reconnect failures" \
  --cwd /path/to/repo \
  -- bash -lc "npm test"
```

### Show the latest note

```bash
node dist/cli.js note show run-2026-03-31T00-00-00-000Z
```

### List sessions from CLI

```bash
node dist/cli.js sessions
```

### Show one session from CLI

```bash
node dist/cli.js show run-2026-03-31T00-00-00-000Z
```

### Export JSON

```bash
node dist/cli.js note export run-2026-03-31T00-00-00-000Z --format json
```

### Read the resume packet

```bash
node dist/cli.js resume run-2026-03-31T00-00-00-000Z
```

Only print prompt text:

```bash
node dist/cli.js resume run-2026-03-31T00-00-00-000Z --prompt-only
```

### Add a manual blocker

```bash
node dist/cli.js annotate run-2026-03-31T00-00-00-000Z \
  --type blocker \
  --text "Need a human review before merge"
```

### Attach a named validation check to an existing session

```bash
node dist/cli.js check run-2026-03-31T00-00-00-000Z \
  --name test \
  --cwd /path/to/repo \
  -- bash -lc "npm test"
```

### Start the built-in API and mobile reader

```bash
node dist/cli.js serve --host 127.0.0.1 --port 4318
```

Then open:

- Web reader: `http://127.0.0.1:4318/`
- Sessions API: `http://127.0.0.1:4318/api/sessions`

### Start local TUI (no browser)

```bash
node dist/cli.js tui
```

Keybindings:

- `j/k`: move selection
- `r`: refresh
- `y`: print current resume prompt in-message
- `q`: quit

## Output Layout

By default, RelayNote writes data under:

```text
.relaynote/sessions/<session-id>/
  events.jsonl
  metadata.json
  current_note.json
  current_note.md
  resume_packet.json
```

## Architecture

RelayNote is intentionally small and composable.

### 1. Collectors

Collectors ingest runtime signals from sources such as:

- tmux pane capture
- wrapped process lifecycle
- git change detection
- manual annotations

### 2. Normalized events

Different signals are converted into a common event model, for example:

- `session_started`
- `output_chunk`
- `command_started`
- `command_finished`
- `annotation_added`
- `session_idle`
- `session_stopped`

### 3. Reducer

A deterministic reducer turns the event stream into the current handover state.

### 4. Storage

RelayNote stores:

- an append-only event log
- a materialized current note
- a resume packet for the next operator

## Design Principles

- Terminal-first, not IDE-first
- Self-hosted by default
- Deterministic core behavior before optional LLM compression
- Human-readable and machine-readable outputs
- Useful even when a session ends badly or unexpectedly

## Not In v0.1

This release is intentionally narrow.

- no browser dashboard yet
- no HTTP API yet
- no multi-user permission system
- no vendor-specific agent lock-in
- no mandatory LLM summarization

## Roadmap Direction

The next valuable step is a read-only API and a minimal mobile reader, so tools
such as TouchMux can consume RelayNote output without parsing internal files
directly.

See also:

- [Architecture](./docs/architecture.md)
- [Contracts](./docs/contracts.md)
- [Security Notes](./docs/security.md)
- [Roadmap](./docs/roadmap.md)

## License

MIT
