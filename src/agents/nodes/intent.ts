import { config } from "../../config";
import { getOpenAI, hasOpenAI } from "../../lib/openai";
import type { ConversationState } from "../../services/chat.service";
import {
  extractSlotsFallback,
  mergeSlots,
  missingMandatory,
  missingOptional,
  nextMandatoryQuestion,
  nextOptionalQuestion,
  parseForceSearch,
  syncStateFromSlots,
} from "../slots";
import { intentOutputSchema, type ConversationSlots, type IntentOutput } from "../schemas";
import type { TraceHandle } from "../trace.service";

export type IntentResult = {
  state: ConversationState;
  question: string | null;
  transition: string | null;
};

async function parseWithOpenAI(
  text: string,
  currentSlots: ConversationSlots,
  trace: TraceHandle
): Promise<IntentOutput | null> {
  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: config.openai.model,
    temperature: config.openai.temperature,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Extract travel search slots from the user message. Cities: lisbon, barcelona only. Dates ISO YYYY-MM-DD. Return JSON: { "slots": { city?, checkIn?, checkOut?, adults?, children?, rooms?, budgetMax?, priceMin?, propertyTypes?, vibe?, areaPreference?, mustHaveAmenities?, ratingMin? }, "forceSearch": boolean, "nextQuestion": string?, "transitionMessage": string? }. Merge with existing slots: ${JSON.stringify(currentSlots)}. Ask one clarifying question in nextQuestion if needed.`,
      },
      { role: "user", content: text },
    ],
  });

  const usage = completion.usage;
  if (usage) {
    trace.tokensUsed += (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
  }

  const raw = completion.choices[0]?.message?.content;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    return intentOutputSchema.parse(parsed);
  } catch {
    return null;
  }
}

export async function runIntent(
  state: ConversationState,
  userText: string,
  trace: TraceHandle
): Promise<IntentResult> {
  let slots = state.slots as ConversationSlots;
  let forceSearch = state.forceSearch || parseForceSearch(userText);
  let question: string | null = null;
  let transition: string | null = null;

  if (hasOpenAI()) {
    try {
      const output = await parseWithOpenAI(userText, slots, trace);
      if (output) {
        slots = mergeSlots(slots, output.slots);
        if (output.forceSearch) forceSearch = true;
        question = output.nextQuestion ?? null;
        transition = output.transitionMessage ?? null;
      }
    } catch {
      slots = extractSlotsFallback(userText, slots);
    }
  } else {
    slots = extractSlotsFallback(userText, slots);
  }

  if (!hasOpenAI() || (!question && !transition)) {
    slots = extractSlotsFallback(userText, slots);
  }

  let next: ConversationState = {
    ...state,
    slots,
    forceSearch,
    phase: "clarifying",
  };
  next = syncStateFromSlots(next);

  if (next.missingMandatory.length > 0) {
    question =
      question ??
      nextMandatoryQuestion(next.missingMandatory) ??
      "Please share your destination, dates, and number of adults.";
    if (forceSearch) {
      question = `I still need ${next.missingMandatory.join(", ")} — then I'll show listings right away.`;
    }
    return { state: next, question, transition: null };
  }

  if (!forceSearch && next.missingFields.length > 0 && !question) {
    question = nextOptionalQuestion(next.missingFields);
    return { state: next, question, transition: null };
  }

  if (!transition) {
    transition = `Searching stays in ${slots.city} for your dates.`;
  }

  next.phase = "searching";
  return { state: next, question: null, transition };
}
