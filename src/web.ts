function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderAppShell(authToken: string | undefined): string {
  const authLine = authToken
    ? "Token auth is enabled. Add ?token=YOUR_TOKEN to the reader URL or use the X-RelayNote-Token header."
    : "Token auth is disabled. For remote bind, run with --token.";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>RelayNote</title>
    <style>
      :root {
        --bg: #f5f1e8;
        --panel: #fffdf8;
        --line: #d8ccb5;
        --text: #1f1b16;
        --muted: #6b6257;
        --accent: #0f766e;
        --accent-soft: #d9f1ee;
        --danger: #8f2d20;
        --danger-soft: #f7ddd7;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "IBM Plex Sans", "Noto Sans", sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, #f8e7d4 0, transparent 28%),
          radial-gradient(circle at top right, #dff1ef 0, transparent 24%),
          var(--bg);
      }
      .shell {
        max-width: 1100px;
        margin: 0 auto;
        min-height: 100vh;
        padding: 20px 16px 48px;
      }
      .hero { padding: 20px 4px 16px; }
      .eyebrow {
        color: var(--accent);
        font-size: 12px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        font-weight: 700;
      }
      h1 { margin: 8px 0 10px; font-size: clamp(32px, 8vw, 56px); line-height: 0.95; }
      .sub { margin: 0; color: var(--muted); max-width: 780px; font-size: 16px; line-height: 1.6; }
      .security { margin-top: 10px; color: var(--muted); font-size: 13px; }
      .layout {
        display: grid;
        grid-template-columns: 340px minmax(0, 1fr);
        gap: 16px;
        margin-top: 20px;
      }
      .panel {
        background: rgba(255, 253, 248, 0.92);
        border: 1px solid var(--line);
        border-radius: 22px;
        box-shadow: 0 12px 32px rgba(92, 72, 37, 0.08);
        overflow: hidden;
      }
      .panel-header { padding: 14px 16px; border-bottom: 1px solid var(--line); font-weight: 700; }
      .session-list { display: flex; flex-direction: column; gap: 10px; padding: 12px; }
      .session-card { border: 1px solid var(--line); border-radius: 16px; background: #fff; padding: 12px; text-align: left; cursor: pointer; }
      .session-card.active { border-color: var(--accent); background: var(--accent-soft); }
      .session-top { display: flex; justify-content: space-between; gap: 10px; align-items: start; }
      .session-id { font-size: 12px; color: var(--muted); word-break: break-all; }
      .goal { font-size: 15px; font-weight: 700; margin-top: 6px; }
      .meta { margin-top: 8px; font-size: 12px; color: var(--muted); }
      .badge { border-radius: 999px; padding: 4px 10px; font-size: 11px; font-weight: 700; white-space: nowrap; }
      .badge.running, .badge.ready_for_review, .badge.ready_to_resume, .badge.completed { background: var(--accent-soft); color: var(--accent); }
      .badge.blocked, .badge.waiting_for_human, .badge.abandoned { background: var(--danger-soft); color: var(--danger); }
      .detail { padding: 16px; }
      .detail-grid { display: grid; gap: 14px; }
      .section { border: 1px solid var(--line); border-radius: 18px; padding: 14px; background: #fff; }
      .section h2 { margin: 0 0 10px; font-size: 13px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; }
      .summary { font-size: 16px; line-height: 1.6; }
      ul { margin: 0; padding-left: 18px; }
      li { margin: 6px 0; line-height: 1.5; }
      pre { white-space: pre-wrap; word-break: break-word; margin: 0; font-family: "IBM Plex Mono", "Fira Code", monospace; font-size: 13px; line-height: 1.6; }
      .empty { color: var(--muted); padding: 16px; }
      @media (max-width: 840px) { .layout { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <div class="shell">
      <section class="hero">
        <div class="eyebrow">RelayNote Reader</div>
        <h1>Session handover, readable on a phone.</h1>
        <p class="sub">
          This built-in reader is meant for fast supervision and TouchMux-style integration:
          one JSON API, one small mobile UI, no browser IDE baggage.
        </p>
        <p class="security">${escapeHtml(authLine)}</p>
      </section>
      <div class="layout">
        <aside class="panel">
          <div class="panel-header">Sessions</div>
          <div id="session-list" class="session-list"></div>
        </aside>
        <main class="panel">
          <div class="panel-header">Current Handover</div>
          <div id="detail" class="detail"></div>
        </main>
      </div>
    </div>
    <script>
      const sessionListEl = document.getElementById("session-list");
      const detailEl = document.getElementById("detail");
      const queryToken = new URLSearchParams(window.location.search).get("token");
      let currentSessionId = null;

      function escapeHtml(value) {
        return value
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      }

      function apiPath(path) {
        if (!queryToken) {
          return path;
        }
        const connector = path.includes("?") ? "&" : "?";
        return path + connector + "token=" + encodeURIComponent(queryToken);
      }

      async function apiFetch(path) {
        const response = await fetch(apiPath(path), {
          headers: queryToken ? { "X-RelayNote-Token": queryToken } : {}
        });
        if (!response.ok) {
          throw new Error(path + " -> " + response.status);
        }
        return response.json();
      }

      function renderSessionList(sessions) {
        if (!sessions.length) {
          sessionListEl.innerHTML = '<div class="empty">No RelayNote sessions found yet.</div>';
          detailEl.innerHTML = '<div class="empty">Start with <code>relaynote watch</code> or <code>relaynote run</code>.</div>';
          return;
        }
        if (!currentSessionId) {
          currentSessionId = sessions[0].sessionId;
        }
        sessionListEl.innerHTML = sessions.map((session) => \`
          <button class="session-card \${session.sessionId === currentSessionId ? "active" : ""}" data-session-id="\${escapeHtml(session.sessionId)}">
            <div class="session-top">
              <div>
                <div class="session-id">\${escapeHtml(session.sessionId)}</div>
                <div class="goal">\${escapeHtml(session.goal)}</div>
              </div>
              <span class="badge \${escapeHtml(session.status)}">\${escapeHtml(session.status)}</span>
            </div>
            <div class="meta">\${escapeHtml(session.runtime)} · \${escapeHtml(session.updatedAt)}</div>
            <div class="meta">\${escapeHtml(session.summary)}</div>
          </button>
        \`).join("");
        for (const button of sessionListEl.querySelectorAll("[data-session-id]")) {
          button.addEventListener("click", () => {
            currentSessionId = button.getAttribute("data-session-id");
            void refresh();
          });
        }
      }

      function renderList(items) {
        if (!items || !items.length) {
          return "<div class=\\"empty\\">None</div>";
        }
        return "<ul>" + items.map((item) => "<li>" + escapeHtml(String(item)) + "</li>").join("") + "</ul>";
      }

      function renderDetail(note, resumePacket) {
        detailEl.innerHTML = \`
          <div class="detail-grid">
            <section class="section">
              <h2>Summary</h2>
              <div class="summary">\${escapeHtml(note.summary)}</div>
            </section>
            <section class="section">
              <h2>Status</h2>
              <div><strong>\${escapeHtml(note.status)}</strong></div>
              <div class="meta">Runtime: \${escapeHtml(note.runtime)} · Source: \${escapeHtml(note.source)}</div>
              <div class="meta">Working directory: \${escapeHtml(note.workingDirectory)}</div>
              <div class="meta">Updated: \${escapeHtml(note.updatedAt)} · Last activity: \${escapeHtml(note.lastActivityAt)}</div>
            </section>
            <section class="section">
              <h2>Blockers</h2>
              \${renderList((note.blockers || []).map((item) => item.detail ? item.label + ": " + item.detail : item.label))}
            </section>
            <section class="section">
              <h2>Next Actions</h2>
              \${renderList(note.nextActions)}
            </section>
            <section class="section">
              <h2>Touched Files</h2>
              \${renderList(note.touchedFiles)}
            </section>
            <section class="section">
              <h2>Checks</h2>
              \${renderList((note.checks || []).map((check) => check.name + ": " + check.status))}
            </section>
            <section class="section">
              <h2>Resume Prompt</h2>
              <pre>\${escapeHtml(resumePacket.resumePrompt)}</pre>
            </section>
          </div>
        \`;
      }

      async function refresh() {
        const sessions = await apiFetch("/api/sessions");
        renderSessionList(sessions);
        if (!sessions.length) {
          return;
        }
        const active = sessions.find((session) => session.sessionId === currentSessionId) || sessions[0];
        currentSessionId = active.sessionId;
        const [note, resumePacket] = await Promise.all([
          apiFetch("/api/sessions/" + encodeURIComponent(active.sessionId) + "/note"),
          apiFetch("/api/sessions/" + encodeURIComponent(active.sessionId) + "/resume-packet")
        ]);
        renderDetail(note, resumePacket);
      }

      void refresh().catch((error) => {
        detailEl.innerHTML = "<div class=\\"empty\\">Reader error: " + escapeHtml(String(error)) + "</div>";
      });
      setInterval(() => { void refresh().catch(() => undefined); }, 5000);
    </script>
  </body>
</html>`;
}

export function renderErrorPage(message: string): string {
  return `<!doctype html><html><body><pre>${escapeHtml(message)}</pre></body></html>`;
}
