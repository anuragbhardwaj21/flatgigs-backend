import pLimit from "p-limit";
import { config } from "../../config";
import { cacheGet, cacheSet, stableHash } from "../../lib/cache";
import { getOpenAI, hasOpenAI } from "../../lib/openai";
import type { ConversationState } from "../../services/chat.service";
import type { SearchResult } from "../../services/search.service";
import { searchFromSlots } from "../tools";
import type { ConversationSlots } from "../schemas";
import type { TraceHandle } from "../trace.service";
import { syncStateFromSlots } from "../slots";
import { emitAssistantStatus, type EventSink } from "../status";

export type RetrievalItem = SearchResult["items"][number] & {
  rationale: string;
};

export type RetrievalResult = {
  state: ConversationState;
  message: string;
  items: RetrievalItem[];
  total: number;
  mapPins: SearchResult["mapPins"];
  facets: SearchResult["facets"];
};

function tripHash(slots: ConversationSlots): string {
  return stableHash({
    city: slots.city,
    checkIn: slots.checkIn,
    checkOut: slots.checkOut,
    adults: slots.adults,
    children: slots.children,
    priceMin: slots.priceMin,
    budgetMax: slots.budgetMax,
    ratingMin: slots.ratingMin,
    propertyTypes: slots.propertyTypes?.slice().sort(),
    amenities: slots.mustHaveAmenities?.slice().sort(),
  });
}

function rationaleCacheKey(
  listingId: string,
  slots: ConversationSlots,
): string {
  return `rationale:v1:${listingId}:${tripHash(slots)}`;
}

async function rationaleForItem(
  item: SearchResult["items"][number],
  slots: ConversationSlots,
  trace: TraceHandle,
): Promise<string> {
  const fallback = `Matches your stay in ${slots.city} with ${slots.adults} adults.`;
  const key = rationaleCacheKey(item.id, slots);

  const cached = await cacheGet<string>(key);
  if (cached) {
    return cached;
  }

  if (!hasOpenAI()) {
    return fallback;
  }

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: config.openai.model,
    temperature: config.openai.temperature,
    max_tokens: 80,
    messages: [
      {
        role: "system",
        content: `
          You are a travel recommendation assistant.
          
          Your task is to explain why a specific listing is a good match for the traveler's trip.
          
          Rules:
          - Write exactly 1 concise sentence (15-30 words).
          - Be factual and use only the provided listing data.
          - Mention the strongest relevant factors such as:
            - location
            - property type
            - guest rating
            - review quality
            - amenities
            - suitability for group size
            - value for money
          - Prioritize the factors that best match the trip details.
          - Never invent amenities, features, reviews, locations, prices, or policies.
          - Avoid generic statements like "great option" or "good choice".
          - Sound like a personalized recommendation.
          - Do not use bullet points.
          - Do not mention missing information.
          
          Examples:
          "Highly rated apartment in Dubai with strong guest reviews and amenities suitable for a family stay."
          "Well-reviewed villa offering more space for four adults and excellent guest satisfaction scores."
          "Top-rated property near the requested area with amenities that align well with this trip."
        `,
      },
      {
        role: "user",
        content: JSON.stringify({
          listing: {
            name: item.name,
            type: item.propertyType,
            roomType: item.roomType,
            rating: item.rating,
            reviewCount: item.reviewCount,
            pricePerNight: item.pricePerNight,
            totalForStay: item.totalForStay,
            amenities: item.amenities,
            distanceKm: item.distanceKm,
          },
          trip: {
            city: slots.city,
            checkIn: slots.checkIn,
            checkOut: slots.checkOut,
            adults: slots.adults,
            children: slots.children,
            rooms: slots.rooms,
            budgetMax: slots.budgetMax,
            priceMin: slots.priceMin,
            ratingMin: slots.ratingMin,
            propertyTypes: slots.propertyTypes,
            mustHaveAmenities: slots.mustHaveAmenities,
            vibe: slots.vibe,
            areaPreference: slots.areaPreference,
          },
        }),
      },
    ],
  });

  const usage = completion.usage;
  if (usage) {
    trace.tokensUsed +=
      (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
  }

  const rationale =
    completion.choices[0]?.message?.content?.trim() ??
    `Well-rated ${item.propertyType} in ${slots.city}.`;

  await cacheSet(key, rationale, config.cache.rationaleTtlSeconds);
  return rationale;
}

export async function runRetrieval(
  state: ConversationState,
  trace: TraceHandle,
  sink: EventSink,
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
      }),
    ),
  );

  const items: RetrievalItem[] = results.items.map((item, i) => ({
    ...item,
    rationale:
      i < rationales.length
        ? rationales[i]
        : `Available for your dates in ${slots.city}.`,
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
