import http from "node:http";
import { readNote, readResumePacket, listSessionSnapshots } from "./storage.js";
import { renderAppShell, renderErrorPage } from "./web.js";

interface ServerOptions {
  dataRoot: string;
  host: string;
  port: number;
}

function jsonResponse(data: unknown, statusCode = 200): { statusCode: number; body: string; contentType: string } {
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
): { statusCode: number; body: string; contentType: string } {
  return { statusCode, body, contentType };
}

export async function startServer(options: ServerOptions): Promise<void> {
  const server = http.createServer(async (request, response) => {
    try {
      const method = request.method ?? "GET";
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
      if (method !== "GET") {
        const payload = jsonResponse({ error: "method_not_allowed" }, 405);
        response.writeHead(payload.statusCode, {
          "content-type": payload.contentType,
        });
        response.end(payload.body);
        return;
      }

      if (url.pathname === "/" || url.pathname === "/index.html") {
        const payload = textResponse(renderAppShell());
        response.writeHead(payload.statusCode, { "content-type": payload.contentType });
        response.end(payload.body);
        return;
      }

      if (url.pathname === "/api/health") {
        const payload = jsonResponse({ ok: true });
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

      const payload = textResponse(renderErrorPage("Not found"), 404);
      response.writeHead(payload.statusCode, { "content-type": payload.contentType });
      response.end(payload.body);
    } catch (error) {
      const payload = jsonResponse({ error: (error as Error).message }, 500);
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

  console.log(`RelayNote server listening on http://${options.host}:${options.port}`);
}
