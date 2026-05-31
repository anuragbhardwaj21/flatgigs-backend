import type { WebSocket } from "ws";
import { ok } from "../lib/api-response";
import { sendWs } from "../ws/ws-response";

export type AssistantAgent = "concierge" | "retrieval" | "review";

export type AssistantStatusKind =
  | "online"
  | "idle"
  | "thinking"
  | "typing"
  | "searching"
  | "summarizing"
  | "error";

export type AssistantStatusPayload = {
  status: AssistantStatusKind;
  label: string;
  agent?: AssistantAgent;
  phase?: "clarifying" | "searching" | "answering";
  step?: string;
  progress?: number;
  detail?: string;
  requestId?: string;
};

export type EventSink = {
  ws: WebSocket;
  token: string;
  lastStatusKey?: string;
};

function statusKey(payload: AssistantStatusPayload): string {
  return JSON.stringify({
    status: payload.status,
    label: payload.label,
    agent: payload.agent,
    phase: payload.phase,
    step: payload.step,
    progress: payload.progress,
    detail: payload.detail,
    requestId: payload.requestId,
  });
}

export function emitAssistantStatus(sink: EventSink, payload: AssistantStatusPayload): void {
  const key = statusKey(payload);
  if (sink.lastStatusKey === key) return;
  sink.lastStatusKey = key;
  sendWs(sink.ws, "assistant.status", ok(payload));
}

export function idleStatus(requestId?: string): AssistantStatusPayload {
  return { status: "idle", label: "Ready", requestId };
}

export function onlineStatus(): AssistantStatusPayload {
  return { status: "online", label: "Connected" };
}
