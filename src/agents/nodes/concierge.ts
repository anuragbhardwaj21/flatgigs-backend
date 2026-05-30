import { config } from "../../config";
import { getOpenAI, hasOpenAI } from "../../lib/openai";
import type { ChatMessage, ConversationState } from "../../services/chat.service";
import {
  applyStayDatesToSlots,
  extractSlotsFallback,
  hasRequiredSearchSlots,
  mergeSlots,
  syncStateFromSlots,
} from "../slots";
import { conciergeTurnSchema, type ConversationSlots, type ConciergeTurn } from "../schemas";
import type { TraceHandle } from "../trace.service";

export type ConciergeResult = {
  state: ConversationState;
  reply: string;
  messageType: "question" | "transition" | "answer";
  readyToSearch: boolean;
};

const SYSTEM_PROMPT = `You are the FlatGigs AI travel concierge — friendly, concise, human.

Rules:
- Supported cities ONLY: lisbon, barcelona.
- Collect trip details through natural conversation (not a rigid form).
- Update "slots" each turn with everything you know so far.
- Defaults if user doesn't say: adults=2, children=0, rooms=1.
- Dates as ISO YYYY-MM-DD. No year given → use ${new Date().getUTCFullYear()} (if that calendar date already passed this year, use next year).
- "next week" / "upcoming week" → checkIn = Monday of next calendar week, checkOut = checkIn + 7 days.
- Set readyToSearch true when you have city + checkIn + checkOut + adults and the user wants to see stays (or says "show me", "search", "that's all", etc.).
- If something essential is missing, ask ONE natural question in "reply" and set readyToSearch false.
- Never invent listing names, prices, or review quotes.
- Optional filters (budget, vibe, property type) only if the user mentions them — never require them.

Respond with JSON only:
{
  "reply": "what you say to the user",
  "messageType": "question" | "transition" | "answer",
  "slots": { city?, checkIn?, checkOut?, adults?, children?, rooms?, budgetMax?, propertyTypes?, vibe?, areaPreference?, mustHaveAmenities?, ratingMin? },
  "readyToSearch": boolean
}`;

function toOpenAIMessages(messages: ChatMessage[]): { role: "user" | "assistant"; content: string }[] {
  return messages
    .filter((m) => m.kind === "text")
    .map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    }));
}

async function runConciergeLLM(
  messages: ChatMessage[],
  state: ConversationState,
  trace: TraceHandle
): Promise<ConciergeTurn | null> {
  const openai = getOpenAI();
  const history = toOpenAIMessages(messages);
  const completion = await openai.chat.completions.create({
    model: config.openai.model,
    temperature: config.openai.temperature,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "system",
        content: `Current known slots: ${JSON.stringify(state.slots)}. Phase: ${state.phase}.`,
      },
      ...history,
    ],
  });

  const usage = completion.usage;
  if (usage) {
    trace.tokensUsed += (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
  }

  const raw = completion.choices[0]?.message?.content;
  if (!raw) return null;

  try {
    return conciergeTurnSchema.parse(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export async function runConcierge(
  state: ConversationState,
  userText: string,
  messages: ChatMessage[],
  trace: TraceHandle
): Promise<ConciergeResult> {
  let slots = state.slots as ConversationSlots;
  slots = applyStayDatesToSlots(slots, userText);
  slots = extractSlotsFallback(userText, slots);

  let reply = "Tell me where and when you'd like to stay — Lisbon or Barcelona works great.";
  let messageType: ConciergeResult["messageType"] = "question";
  let readyToSearch = false;

  if (hasOpenAI()) {
    const turn = await runConciergeLLM(messages, state, trace);
    if (turn) {
      reply = turn.reply;
      messageType = turn.messageType;
      readyToSearch = turn.readyToSearch;
      if (turn.slots) {
        slots = mergeSlots(slots, turn.slots);
        slots = applyStayDatesToSlots(slots, userText);
      }
    }
  } else {
    slots = extractSlotsFallback(userText, slots);
    if (hasRequiredSearchSlots(slots)) {
      readyToSearch = true;
      reply = `Searching stays in ${slots.city} for your dates.`;
      messageType = "transition";
    }
  }

  slots = extractSlotsFallback(userText, slots);
  if (slots.adults == null) slots.adults = 2;

  if (readyToSearch && !hasRequiredSearchSlots(slots)) {
    readyToSearch = false;
    if (!hasOpenAI()) {
      reply = "I still need city, check-in, check-out, and number of adults.";
      messageType = "question";
    }
  }

  let next: ConversationState = {
    ...state,
    slots,
    forceSearch: readyToSearch,
    phase: readyToSearch ? "searching" : "clarifying",
  };
  next = syncStateFromSlots(next);

  if (readyToSearch && hasRequiredSearchSlots(slots)) {
    next.phase = "searching";
  } else {
    next.phase = state.phase === "answering" ? "answering" : "clarifying";
  }

  return { state: next, reply, messageType, readyToSearch: readyToSearch && hasRequiredSearchSlots(slots) };
}
