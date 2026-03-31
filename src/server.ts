import http from "node:http";
import { listSessionSnapshots, readNote, readResumePacket } from "./storage.js";
import { renderAppShell, renderErrorPage } from "./web.js";

interface ServerOptions {
  dataRoot: string;
  host: string;
  port: number;
  authToken?: string;
  allowedOrigins: string[];
}

interface ResponsePayload {
  statusCode: number;
  body: string;
  contentType: string;
}

function jsonResponse(data: unknown, statusCode = 200): ResponsePayload {
  return {
    statusCode,
    body: `${JSON.stringify(data, null, 2)}\n`,
    contentType: "application/json; charset=utf-8",
  };
}

function textResponse(
  body: string,
  statusCode = 200,
  contentType = "text/html; charset=utf-8",
): ResponsePayload {
  return { statusCode, body, contentType };
}

function appendSecurityHeaders(
  response: http.ServerResponse,
  options: ServerOptions,
  request: http.IncomingMessage,
): void {
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-frame-options", "DENY");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("cache-control", "no-store");
  response.setHeader("content-security-policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'");

  const origin = request.headers.origin;
  if (!origin) {
    return;
  }
  if (options.allowedOrigins.includes(origin)) {
    response.setHeader("access-control-allow-origin", origin);
    response.setHeader("vary", "Origin");
    response.setHeader("access-control-allow-methods", "GET,OPTIONS");
    response.setHeader("access-control-allow-headers", "Content-Type, X-RelayNote-Token");
  }
}

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

function isAuthorizedRequest(
  request: http.IncomingMessage,
  url: URL,
  authToken: string | undefined,
): boolean {
  if (!authToken) {
    return true;
  }
  const headerToken = request.headers["x-relaynote-token"];
  const queryToken = url.searchParams.get("token");
  if (typeof headerToken === "string" && headerToken === authToken) {
    return true;
  }
  if (queryToken === authToken) {
    return true;
  }
  return false;
}

function toTouchMuxSession(snapshot: Awaited<ReturnType<typeof listSessionSnapshots>>[number]) {
  return {
    id: snapshot.sessionId,
    goal: snapshot.goal,
    status: snapshot.status,
    runtime: snapshot.runtime,
    source: snapshot.source,
    sourceRef: snapshot.sourceRef,
    updatedAt: snapshot.updatedAt,
    lastActivityAt: snapshot.lastActivityAt,
    summary: snapshot.summary,
    touchedFilesCount: snapshot.touchedFilesCount,
    blockersCount: snapshot.blockersCount,
    checksCount: snapshot.checksCount,
  };
}

function toTouchMuxHandover(note: Awaited<ReturnType<typeof readNote>>, resumePacket: Awaited<ReturnType<typeof readResumePacket>>) {
  return {
    sessionId: note.sessionId,
    goal: note.goal,
    status: note.status,
    updatedAt: note.updatedAt,
    lastActivityAt: note.lastActivityAt,
    summary: note.summary,
    blockers: note.blockers,
    nextActions: note.nextActions,
    touchedFiles: note.touchedFiles,
    diffStat: note.diffStat,
    checks: note.checks,
    resumePrompt: resumePacket.resumePrompt,
  };
}

export async function startServer(options: ServerOptions): Promise<void> {
  if (!isLoopbackHost(options.host) && !options.authToken) {
    throw new Error("refusing non-loopback bind without --token");
  }

  const server = http.createServer(async (request, response) => {
    try {
      appendSecurityHeaders(response, options, request);

      const method = request.method ?? "GET";
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

      if (method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        return;
      }

      if (method !== "GET") {
        const payload = jsonResponse({ error: "method_not_allowed" }, 405);
        response.writeHead(payload.statusCode, {
          "content-type": payload.contentType,
        });
        response.end(payload.body);
        return;
      }

      const requiresAuth = url.pathname.startsWith("/api/");
      if (requiresAuth && !isAuthorizedRequest(request, url, options.authToken)) {
        const payload = jsonResponse({ error: "unauthorized" }, 401);
        response.writeHead(payload.statusCode, { "content-type": payload.contentType });
        response.end(payload.body);
        return;
      }

      if (url.pathname === "/" || url.pathname === "/index.html") {
        const payload = textResponse(renderAppShell(options.authToken));
        response.writeHead(payload.statusCode, { "content-type": payload.contentType });
        response.end(payload.body);
        return;
      }

      if (url.pathname === "/api/health") {
        const payload = jsonResponse({ ok: true, authEnabled: Boolean(options.authToken) });
        response.writeHead(payload.statusCode, { "content-type": payload.contentType });
        response.end(payload.body);
        return;
      }

      if (url.pathname === "/api/sessions") {
        const payload = jsonResponse(await listSessionSnapshots(options.dataRoot));
        response.writeHead(payload.statusCode, { "content-type": payload.contentType });
        response.end(payload.body);
        return;
      }

      const noteMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/note$/);
      if (noteMatch) {
        const sessionId = decodeURIComponent(noteMatch[1]);
        const payload = jsonResponse(await readNote(options.dataRoot, sessionId));
        response.writeHead(payload.statusCode, { "content-type": payload.contentType });
        response.end(payload.body);
        return;
      }

      const resumeMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/resume-packet$/);
      if (resumeMatch) {
        const sessionId = decodeURIComponent(resumeMatch[1]);
        const payload = jsonResponse(await readResumePacket(options.dataRoot, sessionId));
        response.writeHead(payload.statusCode, { "content-type": payload.contentType });
        response.end(payload.body);
        return;
      }

      if (url.pathname === "/api/touchmux/v1/sessions") {
        const snapshots = await listSessionSnapshots(options.dataRoot);
        const payload = jsonResponse({
          version: "touchmux-v1",
          sessions: snapshots.map((snapshot) => toTouchMuxSession(snapshot)),
        });
        response.writeHead(payload.statusCode, { "content-type": payload.contentType });
        response.end(payload.body);
        return;
      }

      const touchmuxDetailMatch = url.pathname.match(/^\/api\/touchmux\/v1\/sessions\/([^/]+)$/);
      if (touchmuxDetailMatch) {
        const sessionId = decodeURIComponent(touchmuxDetailMatch[1]);
        const [note, resumePacket] = await Promise.all([
          readNote(options.dataRoot, sessionId),
          readResumePacket(options.dataRoot, sessionId),
        ]);
        const payload = jsonResponse({
          version: "touchmux-v1",
          handover: toTouchMuxHandover(note, resumePacket),
        });
        response.writeHead(payload.statusCode, { "content-type": payload.contentType });
        response.end(payload.body);
        return;
      }

      const payload = textResponse(renderErrorPage("Not found"), 404);
      response.writeHead(payload.statusCode, { "content-type": payload.contentType });
      response.end(payload.body);
    } catch {
      const payload = jsonResponse({ error: "internal_error" }, 500);
      response.writeHead(payload.statusCode, { "content-type": payload.contentType });
      response.end(payload.body);
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => {
      resolve();
    });
  });

  const authSuffix = options.authToken ? " (token auth enabled)" : "";
  console.log(`RelayNote server listening on http://${options.host}:${options.port}${authSuffix}`);
}
