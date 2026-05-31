import type { WebSocket } from "ws";
import { ok } from "../lib/api-response";
import { sendWs } from "../ws/ws-response";
import type { EventSink } from "../agents/status";
import { emitAssistantStatus, idleStatus, onlineStatus } from "../agents/status";
import { handleUserTurn } from "../agents/graph";
import {
  createEmptyState,
  getChatSession,
  getChatSessionExpiresAt,
} from "./chat.service";

const cancelledTokens = new Set<string>();

export function cancelTurn(token: string): void {
  cancelledTokens.add(token);
}

export function clearCancel(token: string): void {
  cancelledTokens.delete(token);
}

export function isCancelled(token: string): boolean {
  return cancelledTokens.has(token);
}

export async function replayHistoryIfAny(ws: WebSocket, token: string): Promise<void> {
  const { state, messages } = await getChatSession(token);
  if (!state && messages.length === 0) {
    emitAssistantStatus({ ws, token }, onlineStatus());
    return;
  }

  const expiresAt =
    (await getChatSessionExpiresAt(token)) ??
    new Date(Date.now() + 1200 * 1000).toISOString();

  sendWs(ws, "assistant.history", ok({
    conversationId: state?.conversationId ?? null,
    state,
    messages,
    expiresAt,
  }));

  emitAssistantStatus({ ws, token }, onlineStatus());
}

export async function handleChatStart(
  ws: WebSocket,
  token: string,
  text: string
): Promise<void> {
  clearCancel(token);
  let { state, messages } = await getChatSession(token);
  if (!state) state = createEmptyState();

  const sink: EventSink = { ws, token };
  await handleUserTurn(sink, state, messages, text, true);
}

export async function handleChatMessage(
  ws: WebSocket,
  token: string,
  text: string
): Promise<void> {
  if (isCancelled(token)) {
    clearCancel(token);
    emitAssistantStatus({ ws, token }, idleStatus());
    return;
  }

  let { state, messages } = await getChatSession(token);
  if (!state) state = createEmptyState();

  const sink: EventSink = { ws, token };
  await handleUserTurn(sink, state, messages, text, false);
}

export async function getChatPayload(token: string) {
  const { state, messages } = await getChatSession(token);
  const expiresAt = await getChatSessionExpiresAt(token);
  return {
    conversationId: state?.conversationId ?? null,
    state,
    messages,
    expiresAt,
  };
}
