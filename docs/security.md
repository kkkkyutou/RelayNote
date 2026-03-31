# RelayNote Security Notes

RelayNote is a self-hosted engineering tool, not a hardened multi-tenant
service. Even so, Stage 1 introduces a few explicit safety boundaries.

## 1. Session Path Safety

Session IDs are restricted to a safe character set before they are used in
filesystem paths.

This prevents path traversal through commands such as:

- `relaynote note show <id>`
- `relaynote resume <id>`
- `relaynote annotate <id>`

## 2. Default Network Exposure

The built-in server binds to `127.0.0.1` by default.

This keeps the default usage local-only.

When binding to non-loopback hosts, RelayNote now requires `--token`.

If you later expose RelayNote remotely, treat it as internal infrastructure and
put it behind an authenticated boundary such as:

- TouchMux
- a reverse proxy
- Tailscale / ZeroTier
- an SSH tunnel

## 3. Read-Only API Surface

The current HTTP surface is read-only.

It exposes:

- session list
- handover note
- resume packet

This reduces the risk of remote mutation, but it does not make public exposure
safe by itself.

## 3.1 Token Auth

If `--token` is set, all `/api/*` routes require authentication.

Accepted forms:

- `X-RelayNote-Token` header
- `?token=` query parameter

For integration systems, prefer header auth.

## 4. Evidence Handling

RelayNote stores terminal-derived evidence and command summaries on disk.

Do not point it at sensitive environments unless you accept that session notes
and evidence will be persisted locally.

## 5. Current Security Boundary

At this stage, the intended trust model is:

- single user
- self-hosted
- local machine or trusted private network

RelayNote should not yet be treated as an internet-facing public service.

## 6. CORS Boundary

`--allowed-origins` can be used to explicitly allow browser origins for API
requests.

Without this allowlist, browser cross-origin calls are not opened.
