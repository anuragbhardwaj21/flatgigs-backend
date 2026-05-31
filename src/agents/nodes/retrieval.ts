import pLimit from "p-limit";
import { config } from "../../config";
import { getOpenAI, hasOpenAI } from "../../lib/openai";
import type { ConversationState } from "../../services/chat.service";
import type { SearchResult } from "../../services/search.service";
import { searchFromSlots } from "../tools";
import type { ConversationSlots } from "../schemas";
import type { TraceHandle } from "../trace.service";
import { syncStateFromSlots } from "../slots";
import { emitAssistantStatus, type EventSink } from "../status";

export type RetrievalItem = SearchResult["items"][number] & { rationale: string };

export type RetrievalResult = {
  state: ConversationState;
  message: string;
  items: RetrievalItem[];
  total: number;
  mapPins: SearchResult["mapPins"];
  facets: SearchResult["facets"];
};

async function rationaleForItem(
  item: SearchResult["items"][number],
  slots: ConversationSlots,
  trace: TraceHandle
): Promise<string> {
  if (!hasOpenAI()) {
    return `Matches your stay in ${slots.city} with ${slots.adults} adults.`;
  }

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: config.openai.model,
    temperature: config.openai.temperature,
    max_tokens: 80,
    messages: [
      {
        role: "system",
        content: "One factual sentence why this listing fits the trip. No invented amenities.",
      },
      {
        role: "user",
        content: JSON.stringify({
          listing: { name: item.name, type: item.propertyType, rating: item.rating },
          trip: { city: slots.city, checkIn: slots.checkIn, checkOut: slots.checkOut, adults: slots.adults },
        }),
      },
    ],
  });

  const usage = completion.usage;
  if (usage) {
    trace.tokensUsed += (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
  }

  return (
    completion.choices[0]?.message?.content?.trim() ??
    `Well-rated ${item.propertyType} in ${slots.city}.`
  );
}

export async function runRetrieval(
  state: ConversationState,
  trace: TraceHandle,
  sink: EventSink
): Promise<RetrievalResult | null> {
  const slots = state.slots as ConversationSlots;
  const city =
    typeof slots.city === "string" && slots.city.length
      ? slots.city.charAt(0).toUpperCase() + slots.city.slice(1)
      : "your destination";

  emitAssistantStatus(sink, {
    status: "searching",
    label: `Checking availability in ${city}…`,
    agent: "retrieval",
    phase: "searching",
    step: "filter",
    progress: 15,
    requestId: trace.requestId,
  });

  const results = await searchFromSlots(slots);
  if (!results) {
    return null;
  }

  emitAssistantStatus(sink, {
    status: "searching",
    label: `Ranking ${results.total} matches…`,
    agent: "retrieval",
    phase: "searching",
    step: "rank",
    progress: 35,
    detail: `${results.items.length} shortlisted`,
    requestId: trace.requestId,
  });

  const limit = pLimit(3);
  const top = results.items.slice(0, 10);
  let completed = 0;

  const rationales = await Promise.all(
    top.map((item) =>
      limit(async () => {
        const rationale = await rationaleForItem(item, slots, trace);
        completed += 1;
        emitAssistantStatus(sink, {
          status: "searching",
          label: `Explaining picks (${completed}/${top.length})…`,
          agent: "retrieval",
          phase: "searching",
          step: "rationale",
          progress: 35 + Math.round((completed / top.length) * 55),
          detail: item.name,
          requestId: trace.requestId,
        });
        return rationale;
      })
    )
  );

  const items: RetrievalItem[] = results.items.map((item, i) => ({
    ...item,
    rationale: i < rationales.length ? rationales[i] : `Available for your dates in ${slots.city}.`,
  }));

  const total = results.total;
  const message =
    total > 0
      ? `Found ${total} stays matching your trip in ${slots.city}.`
      : `No available stays found for those dates in ${slots.city}. Try different dates.`;

  let next: ConversationState = {
    ...state,
    phase: "answering",
    lastListingIds: items.slice(0, 5).map((i) => i.id),
  };
  next = syncStateFromSlots(next);

  return {
    state: next,
    message,
    items,
    total,
    mapPins: results.mapPins,
    facets: results.facets,
  };
}
