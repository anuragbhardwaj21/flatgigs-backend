import type { ChatMessage, ConversationState } from "../services/chat.service";
import { MANDATORY_SLOTS, OPTIONAL_SLOTS, type Chip, type ConversationSlots } from "./schemas";

const FORCE_SEARCH_RE =
  /just show|show me|search now|enough questions|skip questions|stop asking|show listings/i;

const DECLINE_RE =
  /^(no|nope|nah|none|any|all|skip|nothing|whatever|no thanks|not really|no preference)(\s|[,!?.]|$)|^no(\s*,\s*no)+/i;

const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

export function parseForceSearch(text: string): boolean {
  return FORCE_SEARCH_RE.test(text) || isDeclineReply(text);
}

export function isDeclineReply(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (DECLINE_RE.test(t)) return true;
  if (/^no\b/i.test(t) && t.length < 48) return true;
  return false;
}

export function applyDeclineToPendingSlot(
  slots: ConversationSlots,
  pendingSlot: string | null | undefined
): ConversationSlots {
  if (!pendingSlot) return slots;
  const next = { ...slots };
  switch (pendingSlot) {
    case "propertyTypes":
      next.propertyTypes = [];
      break;
    case "mustHaveAmenities":
      next.mustHaveAmenities = [];
      break;
    case "budgetMax":
    case "ratingMin":
    case "vibe":
    case "areaPreference":
      break;
    default:
      break;
  }
  return next;
}

export function missingMandatory(slots: ConversationSlots): string[] {
  return MANDATORY_SLOTS.filter((k) => {
    const v = slots[k];
    return v == null || v === "";
  });
}

export function missingOptional(slots: ConversationSlots): string[] {
  return OPTIONAL_SLOTS.filter((k) => {
    const v = slots[k];
    if (v == null || v === "") return true;
    if (Array.isArray(v) && v.length === 0) return true;
    return false;
  });
}

export function buildChips(slots: ConversationSlots): Chip[] {
  const chips: Chip[] = [];
  if (slots.city) chips.push({ label: slots.city, value: `city:${slots.city}` });
  if (slots.checkIn && slots.checkOut) {
    chips.push({
      label: `${slots.checkIn} → ${slots.checkOut}`,
      value: `dates:${slots.checkIn}:${slots.checkOut}`,
    });
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
  const slots = { ...(state.slots as ConversationSlots) };
  if (slots.children == null) slots.children = 0;
  if (slots.rooms == null) slots.rooms = 1;
  const missM = missingMandatory(slots);
  const missO = missingOptional(slots);

  return {
    ...state,
    slots,
    missingMandatory: missM,
    missingFields: missO,
    chips: buildChips(slots),
    pendingSlot: null,
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

function padDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function todayUtcParts(): { y: number; m: number; d: number } {
  const now = new Date();
  return { y: now.getUTCFullYear(), m: now.getUTCMonth() + 1, d: now.getUTCDate() };
}

function startOfUtcDay(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d);
}

function inferYear(month: number, day: number): number {
  const { y, m, d } = todayUtcParts();
  let year = y;
  const candidate = startOfUtcDay(year, month, day);
  const today = startOfUtcDay(y, m, d);
  if (candidate < today) year += 1;
  return year;
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return padDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function mondayOfNextCalendarWeek(): string {
  const { y, m, d } = todayUtcParts();
  const today = new Date(Date.UTC(y, m - 1, d));
  const dow = today.getUTCDay();
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  const mondayThisWeek = new Date(today);
  mondayThisWeek.setUTCDate(today.getUTCDate() + diffToMonday);
  const nextMonday = new Date(mondayThisWeek);
  nextMonday.setUTCDate(mondayThisWeek.getUTCDate() + 7);
  return padDate(
    nextMonday.getUTCFullYear(),
    nextMonday.getUTCMonth() + 1,
    nextMonday.getUTCDate()
  );
}

export type StayDateRange = { checkIn?: string; checkOut?: string };

export function parseStayDatesFromText(text: string): StayDateRange {
  const lower = text.toLowerCase();

  if (/next week|upcoming week|following week|week after next/i.test(lower)) {
    const checkIn = mondayOfNextCalendarWeek();
    return { checkIn, checkOut: addDaysIso(checkIn, 7) };
  }

  if (/this week|current week/i.test(lower)) {
    const { y, m, d } = todayUtcParts();
    const today = new Date(Date.UTC(y, m - 1, d));
    const dow = today.getUTCDay();
    const diffToMonday = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(today);
    monday.setUTCDate(today.getUTCDate() + diffToMonday);
    const mondayIso = padDate(
      monday.getUTCFullYear(),
      monday.getUTCMonth() + 1,
      monday.getUTCDate()
    );
    const todayIso = padDate(y, m, d);
    const checkIn = todayIso >= mondayIso ? todayIso : mondayIso;
    return { checkIn, checkOut: addDaysIso(checkIn, 7) };
  }

  const dates = parseDatesFromText(text);
  if (dates.length === 0) return {};

  if (dates.length >= 2) {
    const sorted = [...dates].sort();
    return { checkIn: sorted[0], checkOut: sorted[sorted.length - 1] };
  }

  return { checkIn: dates[0] };
}

export function parseDatesFromText(text: string): string[] {
  const found: string[] = [];
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/g);
  if (iso) found.push(...iso);

  const dmy = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/g);
  if (dmy) {
    for (const m of dmy) {
      const parts = m.split(/[/.-]/).map(Number);
      if (parts[2] > 31) {
        found.push(padDate(parts[2], parts[1], parts[0]));
      } else {
        found.push(padDate(parts[2], parts[0], parts[1]));
      }
    }
  }

  const monthRe =
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\w*(?:\s+(\d{4}))?\b/gi;
  let mm: RegExpExecArray | null;
  while ((mm = monthRe.exec(text)) !== null) {
    const day = Number(mm[1]);
    const month = MONTHS[mm[2].toLowerCase()];
    const year = mm[3] ? Number(mm[3]) : month ? inferYear(month, day) : null;
    if (month && year) found.push(padDate(year, month, day));
  }

  const monthFirst =
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\w*\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/gi;
  while ((mm = monthFirst.exec(text)) !== null) {
    const month = MONTHS[mm[1].toLowerCase()];
    const day = Number(mm[2]);
    const year = mm[3] ? Number(mm[3]) : month ? inferYear(month, day) : null;
    if (month && year) found.push(padDate(year, month, day));
  }

  return [...new Set(found)];
}

export function applyStayDatesToSlots(slots: ConversationSlots, text: string): ConversationSlots {
  const range = parseStayDatesFromText(text);
  if (!range.checkIn && !range.checkOut) return slots;

  const next = { ...slots };
  if (range.checkIn) next.checkIn = range.checkIn;
  if (range.checkOut) next.checkOut = range.checkOut;

  if (next.checkIn && next.checkOut && next.checkOut <= next.checkIn) {
    next.checkOut = addDaysIso(next.checkIn, 7);
  }

  return next;
}

export function applyPendingSlotAnswer(
  slots: ConversationSlots,
  pendingSlot: string | null | undefined,
  text: string
): ConversationSlots {
  if (!pendingSlot) return slots;
  const next = { ...slots };
  const trimmed = text.trim();

  if (pendingSlot === "city") {
    const cityMatch = trimmed.match(/\b(lisbon|barcelona)\b/i);
    if (cityMatch) next.city = cityMatch[1].toLowerCase();
    return next;
  }

  if (pendingSlot === "adults") {
    const adultsMatch = trimmed.match(/(\d+)/);
    if (adultsMatch) next.adults = Number(adultsMatch[1]);
    return next;
  }

  if (pendingSlot === "checkIn" || pendingSlot === "checkOut") {
    return applyStayDatesToSlots(next, trimmed);
  }

  if (pendingSlot === "budgetMax") {
    const n = trimmed.match(/(\d+)/);
    if (n) next.budgetMax = Number(n[1]);
    return next;
  }

  if (pendingSlot === "ratingMin") {
    const n = trimmed.match(/(\d+(?:\.\d+)?)/);
    if (n) next.ratingMin = Number(n[1]);
    return next;
  }

  if (pendingSlot === "children") {
    const n = trimmed.match(/(\d+)/);
    if (n) next.children = Number(n[1]);
    return next;
  }

  if (pendingSlot === "rooms") {
    const n = trimmed.match(/(\d+)/);
    if (n) next.rooms = Number(n[1]);
    return next;
  }

  if (pendingSlot === "propertyTypes") {
    if (isDeclineReply(trimmed)) next.propertyTypes = [];
    else {
      const types = trimmed.split(/,|\band\b/i).map((s) => s.trim()).filter(Boolean);
      if (types.length) next.propertyTypes = types;
    }
    return next;
  }

  if (pendingSlot === "mustHaveAmenities") {
    if (isDeclineReply(trimmed)) next.mustHaveAmenities = [];
    else {
      const items = trimmed.split(/,|\band\b/i).map((s) => s.trim()).filter(Boolean);
      if (items.length) next.mustHaveAmenities = items;
    }
    return next;
  }

  if (pendingSlot === "vibe" || pendingSlot === "areaPreference") {
    if (!isDeclineReply(trimmed)) {
      (next as Record<string, unknown>)[pendingSlot] = trimmed;
    }
    return next;
  }

  return next;
}

export function extractSlotsFallback(text: string, slots: ConversationSlots): ConversationSlots {
  const next = { ...slots };
  const cityMatch = text.match(/\b(lisbon|barcelona)\b/i);
  if (cityMatch) next.city = cityMatch[1].toLowerCase();

  const withDates = applyStayDatesToSlots(next, text);
  Object.assign(next, withDates);

  const adultsMatch = text.match(/(\d+)\s*(adults?|guests?|people|pax)/i);
  if (adultsMatch) next.adults = Number(adultsMatch[1]);
  else if (!next.adults && /^\d{1,2}$/.test(text.trim())) {
    next.adults = Number(text.trim());
  }

  const budgetMatch = text.match(/(?:under|max|budget)\s*€?\s*(\d+)/i);
  if (budgetMatch) next.budgetMax = Number(budgetMatch[1]);

  return next;
}

export function buildIntentContext(messages: ChatMessage[], state: ConversationState): string {
  const recent = messages.slice(-6);
  const lines = recent.map((m) => `${m.role}: ${m.content}`);
  return [
    `Known slots: ${JSON.stringify(state.slots)}`,
    `Still need mandatory: ${state.missingMandatory.join(", ") || "none"}`,
    `Optional not set: ${state.missingFields.join(", ") || "none"}`,
    `Awaiting answer for slot: ${state.pendingSlot ?? "none"}`,
    "Recent messages:",
    ...lines,
  ].join("\n");
}

export function hasRequiredSearchSlots(slots: ConversationSlots): boolean {
  return Boolean(slots.city && slots.checkIn && slots.checkOut && slots.adults != null);
}

export function canSearch(state: ConversationState): boolean {
  return hasRequiredSearchSlots(state.slots as ConversationSlots);
}

