import type { WebSocket } from "ws";
import type { Envelope } from "../lib/api-response";

export function sendWs<T>(ws: WebSocket, event: string, envelope: Envelope<T>): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ event, envelope }));
  }
}
