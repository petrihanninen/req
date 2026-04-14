import http from "http";
import WebSocket, { WebSocketServer } from "ws";
import { CapturedRequest } from "./types";
import { RequestStore } from "./store";

const HEARTBEAT_INTERVAL = 30_000;

interface AliveSocket extends WebSocket {
  isAlive: boolean;
}

export class WsManager {
  private wss: WebSocketServer;
  private heartbeatTimer: NodeJS.Timeout;

  constructor(server: http.Server, private store: RequestStore) {
    this.wss = new WebSocketServer({ server, path: "/ws" });

    this.wss.on("connection", (ws: AliveSocket) => {
      ws.isAlive = true;

      ws.on("pong", () => {
        ws.isAlive = true;
      });

      // Send current request buffer on connect
      ws.send(
        JSON.stringify({
          type: "init",
          requests: this.store.getAll(),
        })
      );
    });

    // Heartbeat: ping every 30s, terminate unresponsive clients
    this.heartbeatTimer = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        const alive = ws as AliveSocket;
        if (!alive.isAlive) {
          return alive.terminate();
        }
        alive.isAlive = false;
        alive.ping();
      });
    }, HEARTBEAT_INTERVAL);

    this.wss.on("close", () => {
      clearInterval(this.heartbeatTimer);
    });
  }

  broadcast(request: CapturedRequest): void {
    const message = JSON.stringify({ type: "new", request });
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  broadcastClear(): void {
    const message = JSON.stringify({ type: "clear" });
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  close(): void {
    clearInterval(this.heartbeatTimer);
    this.wss.close();
  }
}
