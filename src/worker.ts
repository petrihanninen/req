import { RequestStore } from "./store";
import { Env } from "./types";

export { RequestStore };

// Single global Durable Object instance holding the ring buffer + sockets.
const INSTANCE_NAME = "global";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Favicon (prevent it from appearing in the request log)
    if (path === "/favicon.ico" && request.method === "GET") {
      return new Response(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <text y="0.9em" font-size="80">&#x1F4E1;</text>
    </svg>`,
        { headers: { "content-type": "image/svg+xml" } }
      );
    }

    const isHook = path === "/hook" || path.startsWith("/hook/");
    const isApi =
      (path === "/api/requests" && request.method === "GET") ||
      (path === "/api/clear" && request.method === "POST");
    const isWs =
      path === "/ws" &&
      request.headers.get("Upgrade")?.toLowerCase() === "websocket";

    if (isHook || isApi || isWs) {
      const stub = env.REQ_STORE.get(env.REQ_STORE.idFromName(INSTANCE_NAME));
      return stub.fetch(request);
    }

    // Static assets are served by the platform assets layer before the
    // worker runs; anything reaching here is unknown.
    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
