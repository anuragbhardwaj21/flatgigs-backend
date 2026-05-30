import type { ConversationState } from "../services/chat.service";
import { MANDATORY_SLOTS, OPTIONAL_SLOTS, type Chip, type ConversationSlots } from "./schemas";

const FORCE_SEARCH_RE =
  /just show|show me|search now|enough questions|skip questions|stop asking|show listings/i;

const OPTIONAL_PROMPTS: Record<string, string> = {
  budgetMax: "What's your maximum budget per night (EUR)?",
  propertyTypes: "Any preferred property type? (e.g. apartment, house)",
  vibe: "What vibe are you after? (quiet, lively, family-friendly)",
  areaPreference: "Any neighbourhood or area preference?",
  mustHaveAmenities: "Must-have amenities? (e.g. wifi, kitchen)",
  ratingMin: "Minimum guest rating? (e.g. 4.5)",
};

export function parseForceSearch(text: string): boolean {
  return FORCE_SEARCH_RE.test(text);
}

export function missingMandatory(slots: ConversationSlots): string[] {
  return MANDATORY_SLOTS.filter((k) => {
    const v = slots[k];
    return v == null || v === "";
  });
}

export function missingOptional(slots: ConversationSlots): string[] {
  return OPTIONAL_SLOTS.filter((k) => slots[k] == null || slots[k] === "");
}

export function buildChips(slots: ConversationSlots): Chip[] {
  const chips: Chip[] = [];
  if (slots.city) chips.push({ label: slots.city, value: `city:${slots.city}` });
  if (slots.checkIn && slots.checkOut) {
    chips.push({ label: `${slots.checkIn} → ${slots.checkOut}`, value: `dates:${slots.checkIn}:${slots.checkOut}` });
  }
  if (slots.adults != null) {
    chips.push({ label: `${slots.adults} adults`, value: `adults:${slots.adults}` });
  }
  if (slots.budgetMax != null) chips.push({ label: `≤ €${slots.budgetMax}/night`, value: `budget:${slots.budgetMax}` });
  if (slots.propertyTypes?.length) {
    chips.push({ label: slots.propertyTypes.join(", "), value: `types:${slots.propertyTypes.join(",")}` });
  }
  if (slots.ratingMin != null) chips.push({ label: `★ ${slots.ratingMin}+`, value: `rating:${slots.ratingMin}` });
  return chips;
}

export function mergeSlots(
  existing: ConversationSlots,
  incoming: ConversationSlots
): ConversationSlots {
  const merged = { ...existing };
  for (const [k, v] of Object.entries(incoming)) {
    if (v != null && v !== "" && !(Array.isArray(v) && v.length === 0)) {
      (merged as Record<string, unknown>)[k] = v;
    }
  }
  return merged;
}

export function syncStateFromSlots(state: ConversationState): ConversationState {
  const slots = state.slots as ConversationSlots;
  return {
    ...state,
    slots,
    missingMandatory: missingMandatory(slots),
    missingFields: missingOptional(slots),
    chips: buildChips(slots),
    updatedAt: new Date().toISOString(),
  };
}

export function nextMandatoryQuestion(missing: string[]): string | null {
  const prompts: Record<string, string> = {
    city: "Which city are you visiting? (lisbon or barcelona)",
    checkIn: "What is your check-in date? (YYYY-MM-DD)",
    checkOut: "What is your check-out date? (YYYY-MM-DD)",
    adults: "How many adults are travelling?",
  };
  const first = missing[0];
  return first ? (prompts[first] ?? null) : null;
}

export function nextOptionalQuestion(missing: string[]): string | null {
  const first = missing[0];
  return first ? (OPTIONAL_PROMPTS[first] ?? null) : null;
}

export function extractSlotsFallback(text: string, slots: ConversationSlots): ConversationSlots {
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

  const budgetMatch = text.match(/(?:under|max|budget)\s*€?\s*(\d+)/i);
  if (budgetMatch) next.budgetMax = Number(budgetMatch[1]);

  return next;
}

export function canSearch(state: ConversationState): boolean {
  if (state.missingMandatory.length > 0) return false;
  if (state.forceSearch) return true;
  return state.missingFields.length === 0;
}

export function shouldAskOptional(state: ConversationState): boolean {
  return state.missingMandatory.length === 0 && state.missingFields.length > 0 && !state.forceSearch;
}
