import type { WebSocket } from "ws";

const rooms = new Map<string, Set<WebSocket>>();

export function joinRoom(code: string, ws: WebSocket): void {
  if (!rooms.has(code)) rooms.set(code, new Set());
  rooms.get(code)!.add(ws);
}

export function leaveRoom(code: string, ws: WebSocket): void {
  rooms.get(code)?.delete(ws);
}

export function broadcastToRoom(code: string, payload: object): void {
  const clients = rooms.get(code);
  if (!clients) return;
  const msg = JSON.stringify(payload);
  for (const client of clients) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(msg);
    }
  }
}
