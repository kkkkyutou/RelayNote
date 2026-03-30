# RelayNote Architecture

## 1. Design Goal

RelayNote should produce a durable handover artifact from noisy coding sessions
without requiring a specific model vendor or IDE.

The system must therefore satisfy four constraints:

- terminal-first
- runtime-agnostic
- interruption-tolerant
- mobile-readable

## 2. System View

```text
tmux / shell / agent runtime
        |
        v
   Collector adapters
        |
        v
   Normalized event bus
        |
        +--> event log (JSONL)
        |
        v
  Handover state reducer
        |
        +--> current_note.json
        +--> current_note.md
        +--> resume_packet.json
        |
        v
  CLI / HTTP API / mobile UI
```

## 3. Main Modules

## 3.1 Collector Adapters

Responsibility:

- ingest runtime observations
- avoid product-specific assumptions in the core

Candidate adapters:

- `tmuxCollector`
- `processCollector`
- `gitCollector`
- `artifactCollector`
- `annotationCollector`

Examples of collected signals:

- pane text delta
- process started/stopped
- exit code
- changed file list
- diff stat
- test artifact path
- human operator tag

## 3.2 Event Schema

Every collector emits normalized events.

Minimal event shape:

```json
{
  "sessionId": "codex-42",
  "ts": "2026-03-30T15:20:00Z",
  "kind": "command_finished",
  "source": "processCollector",
  "payload": {
    "command": "npm test",
    "exitCode": 1
  }
}
```

Core event kinds for v1:

- `session_started`
- `output_chunk`
- `command_started`
- `command_finished`
- `files_changed`
- `artifact_added`
- `status_hint`
- `annotation_added`
- `session_idle`
- `session_stopped`

## 3.3 Handover State Reducer

This is the core of the system.

It consumes events and maintains the current materialized note.

State fields:

- `session`
- `objective`
- `status`
- `summary`
- `recent_actions`
- `touched_files`
- `evidence`
- `blockers`
- `next_actions`
- `risks`
- `resume_prompt`

The reducer should be deterministic in v1. LLM support should be optional and
strictly additive.

## 3.4 Summarization Strategy

Use a two-stage strategy.

### Stage A: deterministic extraction

Derive:

- latest commands
- changed files
- exit codes
- explicit failures
- idle spans
- stop reason

### Stage B: optional semantic compression

Use an LLM only to compress or rewrite the state into:

- a shorter summary
- a cleaner blocker description
- a suggested resume prompt

If the LLM step is unavailable, the system must still remain useful.

## 3.5 Storage Model

Per session directory:

```text
.relaynote/sessions/<session-id>/
  events.jsonl
  current_note.json
  current_note.md
  resume_packet.json
  metadata.json
```

This gives:

- append-only auditability
- easy local backup
- easy inspection with normal shell tools

## 3.6 Delivery Interfaces

### CLI

Main operator surface for v1.

Commands:

- `relaynote watch`
- `relaynote run`
- `relaynote note show`
- `relaynote note export`
- `relaynote resume`
- `relaynote annotate`

### HTTP API

Useful for TouchMux-style readers and phone dashboards.

Suggested read endpoints:

- `GET /sessions`
- `GET /sessions/:id/note`
- `GET /sessions/:id/resume-packet`

### Webhook

For push notifications when status changes:

- `running -> waiting_for_human`
- `running -> blocked`
- `running -> completed`

## 4. Status Model

The status model should be explicit and small.

- `running`
- `waiting_for_human`
- `blocked`
- `ready_for_review`
- `ready_to_resume`
- `completed`
- `abandoned`

Transitions should be triggered by evidence, not just time.

Examples:

- failed test plus no retry plan -> `blocked`
- patch generated plus tests passed -> `ready_for_review`
- session interrupted but next step is clear -> `ready_to_resume`

## 5. Integration with TouchMux

RelayNote is intentionally designed so it can be embedded into TouchMux later.

TouchMux can use RelayNote as:

- a background summarizer for active tmux sessions
- the source of phone-friendly session cards
- the source of resume packets for restarting Codex runs

This avoids turning TouchMux itself into a transcript analysis monolith.

## 6. Example User Flow

1. User starts a Codex session inside tmux.
2. RelayNote begins watching the pane and process context.
3. The session edits files and runs tests.
4. A test fails and no further progress occurs for 15 minutes.
5. RelayNote updates the note:
   - status: `blocked`
   - blocker: failing reconnect test
   - touched files: listed
   - next action: inspect retry path and rerun focused tests
6. On phone, the user reads the note and either:
   - resumes the session
   - hands it to another model
   - asks a collaborator to take over

## 7. Implementation Priorities

## Milestone 1

- stable event schema
- tmux collector
- reducer
- JSON and Markdown note output
- CLI read path

## Milestone 2

- wrapper mode for direct command execution
- git diff integration
- annotations
- resume packet generation

## Milestone 3

- HTTP API
- mobile summary page
- webhook delivery
- optional LLM compression

## 8. Main Technical Risks

### Risk 1: transcript overfitting

If the system depends too much on one agent's output style, it will break
easily.

Mitigation:

- keep core state grounded in commands, files, and exit codes
- treat raw text as supporting evidence, not the single source of truth

### Risk 2: noisy summaries

Over-eager summarization can hide important failure context.

Mitigation:

- preserve direct evidence links
- keep summary and raw evidence separate

### Risk 3: too much scope

If v1 tries to be a full remote IDE, the product will lose focus.

Mitigation:

- keep RelayNote as a sidecar
- optimize for handover, not editing
