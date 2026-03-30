# RelayNote Roadmap

## Product Direction

RelayNote should become the handover layer for terminal-first coding agents.

The project should stay focused on one core promise:

- turn long-running sessions into structured, resumable handoff artifacts

It should not drift into a full browser IDE or a vendor-locked agent runtime.

## Near-Term Goals

### 1. Read API

Add a small read-only API so external tools can consume RelayNote output without
reading internal files directly.

Target endpoints:

- `GET /sessions`
- `GET /sessions/:id/note`
- `GET /sessions/:id/resume-packet`

Why it matters:

- makes TouchMux integration cleaner
- enables phone readers and notifications
- keeps the core storage format private and evolvable

### 2. Minimal Mobile Reader

Add a very small mobile-friendly reader focused on:

- session list
- status
- summary
- blockers
- next actions
- resume prompt

Why it matters:

- validates the mobile-first product angle
- gives immediate value beyond CLI output

### 3. Better Status Inference

Improve the reducer so status decisions use more evidence, not just command exit
codes and manual annotations.

Examples:

- infer `ready_for_review` when files changed and validation passed
- infer `blocked` after repeated failures or idle after failure
- infer `waiting_for_human` when a session explicitly asks for approval

### 4. Better Git and Validation Evidence

Expand evidence collection to include:

- diff stats
- changed file counts
- optional named checks such as `test`, `build`, `lint`

Why it matters:

- makes handover notes much more actionable
- reduces the need to inspect raw logs

## Mid-Term Goals

### 1. Runtime Adapters

Add adapters for more terminal-first runtimes:

- Codex CLI
- aider
- generic shell task runners

The core model should remain runtime-agnostic.

### 2. Notification Hooks

Add push hooks for key state changes:

- blocked
- waiting_for_human
- ready_for_review
- completed

### 3. Better Resume Packets

Make resume packets more useful for direct model handoff:

- tighter summary
- explicit next step
- selected evidence snippets
- known risks

## Long-Term Goals

### 1. TouchMux Integration

Use RelayNote as the handover engine behind mobile-first remote workbenches such
as TouchMux.

### 2. Cross-Agent Handoff

Support clean handoff between different agent tools without requiring a shared
vendor format.

### 3. Team-Readable Session Operations

Make RelayNote useful not only for solo users, but also for small teams that
need to audit, resume, and transfer long-running engineering sessions.

## Explicit Non-Goals

RelayNote should not turn into:

- a full IDE
- a hosted closed platform
- a browser terminal replacement
- a tool that only works with one model vendor
