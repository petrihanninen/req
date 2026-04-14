import http from "http";
import path from "path";
import express from "express";
import { RequestStore } from "./store";
import { WsManager } from "./ws";

const PORT = parseInt(process.env.PORT || "3000", 10);

const app = express();
const store = new RequestStore();

// --- Static files (served before catch-all) ---
app.use("/ui", express.static(path.join(__dirname, "..", "ui")));
app.use(express.static(path.join(__dirname, "..", "public")));

// --- Favicon (prevent it from appearing in the request log) ---
app.get("/favicon.ico", (_req, res) => {
  res.type("image/svg+xml").send(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <text y="0.9em" font-size="80">&#x1F4E1;</text>
    </svg>`
  );
});

// --- API routes ---
app.get("/api/requests", (_req, res) => {
  res.json(store.getAll());
});

app.post("/api/clear", (_req, res) => {
  store.clear();
  wsManager.broadcastClear();
  res.json({ status: "cleared" });
});

// --- Webhook catch-all on /hook/* ---
const rawParser = express.raw({ type: "*/*", limit: "1mb" });

app.all("/hook", rawParser, handleWebhook);
app.all("/hook/*", rawParser, handleWebhook);

function handleWebhook(req: express.Request, res: express.Response): void {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") {
      headers[key] = value;
    } else if (Array.isArray(value)) {
      headers[key] = value.join(", ");
    }
  }

  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value === "string") {
      query[key] = value;
    }
  }

  const captured = store.add({
    method: req.method,
    path: req.path,
    query,
    headers,
    body: Buffer.isBuffer(req.body) ? req.body : undefined,
    sourceIp:
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.ip ||
      "unknown",
  });

  wsManager.broadcast(captured);

  res.json({ status: "received", id: captured.id });
}

// --- Create HTTP server + WebSocket ---
const server = http.createServer(app);
let wsManager: WsManager;

server.listen(PORT, () => {
  console.log(`req listening on http://localhost:${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/hook/...`);
});

wsManager = new WsManager(server, store);

// --- Graceful shutdown ---
function shutdown() {
  console.log("Shutting down...");
  wsManager.close();
  server.close(() => {
    process.exit(0);
  });
  // Force exit after 5s
  setTimeout(() => process.exit(1), 5000);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
