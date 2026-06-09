import http from "http";
import { WebSocketServer } from "ws";
import { parse as parseUrl } from "url";
import app from "./app";
import { logger } from "./lib/logger";
import { joinRoom, leaveRoom } from "./lib/roomBroadcast";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: "/api/ws" });

wss.on("connection", (ws, req) => {
  const query = parseUrl(req.url ?? "", true).query;
  const code = typeof query.room === "string" ? query.room.toUpperCase() : null;

  if (!code) {
    ws.close(1008, "Missing room code");
    return;
  }

  joinRoom(code, ws);
  logger.debug({ code }, "WebSocket client joined room");

  ws.on("close", () => {
    leaveRoom(code, ws);
    logger.debug({ code }, "WebSocket client left room");
  });
});

server.listen(port, () => {
  logger.info({ port }, "Server listening");
});
