import { DurableObject } from "cloudflare:workers";
import { CapturedRequest, Env } from "./types";

const MAX_REQUESTS = 200;
const MAX_BODY_SIZE = 100 * 1024; // 100KB
const MAX_RAW_BODY = 1024 * 1024; // 1MB (mirrors the old express.raw limit)

/**
 * SQLite-backed Durable Object holding the ring buffer of captured
 * requests and the live WebSocket connections (Hibernation API).
 */
export class RequestStore extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS requests (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        query TEXT NOT NULL,
        headers TEXT NOT NULL,
        body TEXT,
        body_truncated INTEGER NOT NULL,
        content_type TEXT,
        source_ip TEXT NOT NULL,
        size INTEGER NOT NULL
      )
    `);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/ws") {
      return this.handleWebSocket();
    }

    if (path === "/api/requests" && request.method === "GET") {
      return Response.json(this.getAll());
    }

    if (path === "/api/clear" && request.method === "POST") {
      this.clear();
      this.broadcast({ type: "clear" });
      return Response.json({ status: "cleared" });
    }

    if (path === "/hook" || path.startsWith("/hook/")) {
      return this.handleWebhook(request, url);
    }

    return new Response("Not Found", { status: 404 });
  }

  // --- Webhook capture ---

  private async handleWebhook(request: Request, url: URL): Promise<Response> {
    const bodyBuffer = new Uint8Array(await request.arrayBuffer());
    if (bodyBuffer.length > MAX_RAW_BODY) {
      // express.raw({ limit: "1mb" }) rejected oversized bodies with 413
      return new Response("request entity too large", { status: 413 });
    }

    const headers: Record<string, string> = {};
    for (const [key, value] of request.headers) {
      headers[key] = value;
    }

    // Mirror Express: only plain single-string values are kept
    // (qs turned repeated keys into arrays, which were dropped).
    const query: Record<string, string> = {};
    for (const key of new Set(url.searchParams.keys())) {
      const values = url.searchParams.getAll(key);
      if (values.length === 1) {
        query[key] = values[0];
      }
    }

    const size = bodyBuffer.length;
    const bodyTruncated = size > MAX_BODY_SIZE;
    const bodyStr =
      size > 0
        ? new TextDecoder().decode(bodyBuffer.subarray(0, MAX_BODY_SIZE))
        : null;

    const captured: CapturedRequest = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      method: request.method,
      path: url.pathname,
      query,
      headers,
      body: bodyStr,
      bodyTruncated,
      contentType: headers["content-type"] || null,
      sourceIp:
        request.headers.get("cf-connecting-ip") ||
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        "unknown",
      size,
    };

    this.add(captured);
    this.broadcast({ type: "new", request: captured });

    return Response.json({ status: "received", id: captured.id });
  }

  // --- Ring buffer (SQLite) ---

  private add(captured: CapturedRequest): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO requests
        (id, timestamp, method, path, query, headers, body, body_truncated, content_type, source_ip, size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      captured.id,
      captured.timestamp,
      captured.method,
      captured.path,
      JSON.stringify(captured.query),
      JSON.stringify(captured.headers),
      captured.body,
      captured.bodyTruncated ? 1 : 0,
      captured.contentType,
      captured.sourceIp,
      captured.size
    );

    // Trim to the newest MAX_REQUESTS rows
    this.ctx.storage.sql.exec(
      `DELETE FROM requests
       WHERE seq NOT IN (SELECT seq FROM requests ORDER BY seq DESC LIMIT ?)`,
      MAX_REQUESTS
    );
  }

  private getAll(): CapturedRequest[] {
    const rows = this.ctx.storage.sql
      .exec(`SELECT * FROM requests ORDER BY seq DESC`)
      .toArray();

    return rows.map((row) => ({
      id: row.id as string,
      timestamp: row.timestamp as string,
      method: row.method as string,
      path: row.path as string,
      query: JSON.parse(row.query as string),
      headers: JSON.parse(row.headers as string),
      body: row.body as string | null,
      bodyTruncated: row.body_truncated === 1,
      contentType: row.content_type as string | null,
      sourceIp: row.source_ip as string,
      size: row.size as number,
    }));
  }

  private clear(): void {
    this.ctx.storage.sql.exec(`DELETE FROM requests`);
  }

  // --- WebSockets (Hibernation API) ---

  private handleWebSocket(): Response {
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);

    // Send current request buffer on connect
    pair[1].send(JSON.stringify({ type: "init", requests: this.getAll() }));

    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  private broadcast(message: object): void {
    const payload = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload);
      } catch {
        // Socket already gone; hibernation API cleans it up
      }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      ws.close();
    } catch {
      // Already closed
    }
  }
}
