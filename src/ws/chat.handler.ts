import type { WebSocket } from "ws";
import { validate as uuidValidate } from "uuid";
import { fail, ok } from "../lib/api-response";
import { sendWs } from "./ws-response";
import { emitAssistantStatus, idleStatus } from "../agents/status";
import {
  cancelTurn,
  handleChatMessage,
  handleChatStart,
} from "../services/conversation.service";

export async function handleWsMessage(
  ws: WebSocket,
  raw: string,
  token: string | undefined
): Promise<void> {
  let payload: { event?: string; data?: Record<string, unknown> };
  try {
    payload = JSON.parse(raw) as { event?: string; data?: Record<string, unknown> };
  } catch {
    sendWs(ws, "error", fail(400, "Invalid JSON"));
    return;
  }

  const event = payload.event;
  if (!event) {
    sendWs(ws, "error", fail(400, "event is required"));
    return;
  }

  if (event === "ping") {
    sendWs(ws, "pong", ok({}));
    return;
  }

  if (event === "connected") {
    sendWs(ws, "connected", ok({ message: "connected" }));
    return;
  }

  if (!token || !uuidValidate(token)) {
    sendWs(ws, "error", fail(401, "Token required"));
    return;
  }

  if (event === "chat.cancel") {
    cancelTurn(token);
    emitAssistantStatus({ ws, token }, idleStatus());
    return;
  }

  if (event === "chat.start") {
    const text = String(payload.data?.query ?? payload.data?.message ?? "").trim();
    if (!text) {
      sendWs(ws, "error", fail(400, "query or message is required"));
      return;
    }
    await handleChatStart(ws, token, text);
    return;
  }

  if (event === "chat.message") {
    const text = String(payload.data?.message ?? "").trim();
    if (!text) {
      sendWs(ws, "error", fail(400, "message is required"));
      return;
    }
    await handleChatMessage(ws, token, text);
    return;
  }

  if (event === "itinerary.swap") {
    sendWs(ws, "error", fail(501, "Itinerary swap not yet implemented"));
    return;
  }

  sendWs(ws, "error", fail(400, `Unknown event: ${event}`));
}
