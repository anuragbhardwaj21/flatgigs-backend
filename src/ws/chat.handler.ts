import type { WebSocket } from "ws";
import { validate as uuidValidate } from "uuid";
import { fail, ok } from "../lib/api-response";
import { sendWs } from "./ws-response";
import {
  createEmptyState,
  getChatSession,
  saveChatSession,
  type ChatMessage,
  type ConversationState,
} from "../services/chat.service";
import { searchListings } from "../services/search.service";
import { v4 as uuidv4 } from "uuid";

const MANDATORY = ["city", "checkIn", "checkOut", "adults"] as const;

function missingMandatory(slots: Record<string, unknown>): string[] {
  return MANDATORY.filter((k) => slots[k] == null || slots[k] === "");
}

function parseForceSearch(text: string): boolean {
  const lower = text.toLowerCase();
  return /just show|show me|search now|enough questions/.test(lower);
}

function extractSlots(text: string, slots: Record<string, unknown>): Record<string, unknown> {
  const next = { ...slots };
  const cityMatch = text.match(/\b(lisbon|barcelona)\b/i);
  if (cityMatch) next.city = cityMatch[1].toLowerCase();

  const dateMatch = text.match(/(\d{4}-\d{2}-\d{2})/g);
  if (dateMatch?.length) {
    if (!next.checkIn) next.checkIn = dateMatch[0];
    else if (!next.checkOut && dateMatch[1]) next.checkOut = dateMatch[1];
  }

  const adultsMatch = text.match(/(\d+)\s*(adults?|guests?)/i);
  if (adultsMatch) next.adults = Number(adultsMatch[1]);

  return next;
}

function nextQuestion(missing: string[]): string | null {
  const prompts: Record<string, string> = {
    city: "Which city are you visiting? (lisbon or barcelona)",
    checkIn: "What is your check-in date? (YYYY-MM-DD)",
    checkOut: "What is your check-out date? (YYYY-MM-DD)",
    adults: "How many adults?",
  };
  const first = missing[0];
  return first ? prompts[first] ?? null : null;
}

async function runSearch(state: ConversationState) {
  const slots = state.slots;
  return searchListings({
    city: String(slots.city),
    checkIn: String(slots.checkIn),
    checkOut: String(slots.checkOut),
    adults: Number(slots.adults ?? 2),
    children: Number(slots.children ?? 0),
    rooms: Number(slots.rooms ?? 1),
    page: 1,
    limit: 20,
  });
}

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

  if (event === "connected") {
    sendWs(ws, "connected", ok({ message: "connected" }));
    return;
  }

  if (!token || !uuidValidate(token)) {
    sendWs(ws, "error", fail(401, "Token required"));
    return;
  }

  if (event === "chat.start") {
    const text = String(payload.data?.message ?? "");
    let { state, messages } = await getChatSession(token);
    if (!state) state = createEmptyState();

    const userMsg: ChatMessage = {
      id: uuidv4(),
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    messages = [...messages, userMsg];

    state.slots = extractSlots(text, state.slots);
    state.forceSearch = parseForceSearch(text);
    state.missingMandatory = missingMandatory(state.slots);
    state.updatedAt = new Date().toISOString();

    if (state.missingMandatory.length > 0 && !state.forceSearch) {
      const question = nextQuestion(state.missingMandatory);
      state.phase = "clarifying";
      const assistantMsg: ChatMessage = {
        id: uuidv4(),
        role: "assistant",
        content: question ?? "Please share your travel dates and city.",
        createdAt: new Date().toISOString(),
      };
      messages = [...messages, assistantMsg];
      await saveChatSession(token, state, messages);
      sendWs(ws, "chat.question", ok({ question, state, messages }));
      return;
    }

    if (state.missingMandatory.length > 0) {
      sendWs(ws, "chat.question", ok({ missingMandatory: state.missingMandatory, state }));
      return;
    }

    state.phase = "searching";
    sendWs(ws, "step_started", ok({ step: "retrieval" }));
    const results = await runSearch(state);
    state.phase = "answering";

    const items =
      results?.items.map((item: (typeof results.items)[number]) => ({
        ...item,
        rationale: `Matches your stay in ${state.slots.city} with ${state.slots.adults} adults.`,
      })) ?? [];

    const assistantMsg: ChatMessage = {
      id: uuidv4(),
      role: "assistant",
      content: `Found ${results?.total ?? 0} stays.`,
      createdAt: new Date().toISOString(),
    };
    messages = [...messages, assistantMsg];
    await saveChatSession(token, state, messages);

    sendWs(
      ws,
      "search.results",
      ok({
        items,
        total: results?.total ?? 0,
        mapPins: results?.mapPins ?? [],
        facets: results?.facets,
      })
    );
    return;
  }

  if (event === "chat.message") {
    sendWs(ws, "chat.reply", ok({ message: "Ask about reviews or say chat.start with search details." }));
    return;
  }

  sendWs(ws, "error", fail(400, `Unknown event: ${event}`));
}
