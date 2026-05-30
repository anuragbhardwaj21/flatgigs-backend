import { redis } from "../lib/redis";
import { config } from "../config";
import { v4 as uuidv4 } from "uuid";

export type ConversationState = {
  conversationId: string;
  phase: "clarifying" | "searching" | "answering";
  slots: Record<string, unknown>;
  missingFields: string[];
  missingMandatory: string[];
  forceSearch: boolean;
  chips: { label: string; value: string }[];
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
};

function stateKey(token: string): string {
  return `chat:state:v1:${token}`;
}

function messagesKey(token: string): string {
  return `chat:messages:v1:${token}`;
}

async function refreshTtl(token: string): Promise<void> {
  const ttl = config.cache.chatTtlSeconds;
  await redis.expire(stateKey(token), ttl);
  await redis.expire(messagesKey(token), ttl);
}

export async function getChatSession(token: string): Promise<{
  state: ConversationState | null;
  messages: ChatMessage[];
}> {
  const [stateRaw, messagesRaw] = await Promise.all([
    redis.get(stateKey(token)),
    redis.get(messagesKey(token)),
  ]);

  if (stateRaw) {
    await refreshTtl(token);
  }

  return {
    state: stateRaw ? (JSON.parse(stateRaw) as ConversationState) : null,
    messages: messagesRaw ? (JSON.parse(messagesRaw) as ChatMessage[]) : [],
  };
}

export async function saveChatSession(
  token: string,
  state: ConversationState,
  messages: ChatMessage[]
): Promise<void> {
  const ttl = config.cache.chatTtlSeconds;
  await redis.setex(stateKey(token), ttl, JSON.stringify(state));
  await redis.setex(messagesKey(token), ttl, JSON.stringify(messages));
}

export function createEmptyState(): ConversationState {
  return {
    conversationId: uuidv4(),
    phase: "clarifying",
    slots: {},
    missingFields: [],
    missingMandatory: ["city", "checkIn", "checkOut", "adults"],
    forceSearch: false,
    chips: [],
    updatedAt: new Date().toISOString(),
  };
}
