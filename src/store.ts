import { CapturedRequest } from "./types";

const MAX_REQUESTS = 200;
const MAX_BODY_SIZE = 100 * 1024; // 100KB

export class RequestStore {
  private requests: CapturedRequest[] = [];

  add(raw: {
    method: string;
    path: string;
    query: Record<string, string>;
    headers: Record<string, string>;
    body: Buffer | undefined;
    sourceIp: string;
  }): CapturedRequest {
    const bodyBuffer = raw.body;
    const size = bodyBuffer ? bodyBuffer.length : 0;
    const bodyTruncated = size > MAX_BODY_SIZE;
    const bodyStr =
      bodyBuffer && size > 0
        ? bodyBuffer.subarray(0, MAX_BODY_SIZE).toString("utf-8")
        : null;

    const captured: CapturedRequest = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      method: raw.method,
      path: raw.path,
      query: raw.query,
      headers: raw.headers,
      body: bodyStr,
      bodyTruncated,
      contentType: raw.headers["content-type"] || null,
      sourceIp: raw.sourceIp,
      size,
    };

    this.requests.unshift(captured);

    if (this.requests.length > MAX_REQUESTS) {
      this.requests.pop();
    }

    return captured;
  }

  getAll(): CapturedRequest[] {
    return this.requests;
  }

  clear(): void {
    this.requests = [];
  }
}
