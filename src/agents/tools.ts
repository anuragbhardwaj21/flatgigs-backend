import { searchListings, type SearchParams, type SearchResult } from "../services/search.service";
import { getListingById, getListingReviews } from "../services/listing.service";
import type { ConversationSlots, SelectedFacets, VerifiedSearchInputs } from "./schemas";

function toSelectedRecord(values?: string[]): Record<string, true> {
  const out: Record<string, true> = {};
  if (!values?.length) return out;
  for (const v of values) out[v] = true;
  return out;
}

export function buildSelectedFacets(slots: ConversationSlots): SelectedFacets {
  return {
    priceRange: {
      min: slots.priceMin ?? null,
      max: slots.budgetMax && slots.budgetMax > 0 ? slots.budgetMax : null,
    },
    propertyTypes: toSelectedRecord(slots.propertyTypes),
    amenities: toSelectedRecord(slots.mustHaveAmenities),
    ratingMin: slots.ratingMin ?? null,
    city: slots.city ?? null,
    dates: {
      checkIn: slots.checkIn ?? null,
      checkOut: slots.checkOut ?? null,
    },
    guests: {
      adults: slots.adults ?? null,
      children: slots.children ?? null,
      rooms: slots.rooms ?? null,
    },
    vibe: slots.vibe ?? null,
    areaPreference: slots.areaPreference ?? null,
  };
}

export function slotsToSearchParams(slots: ConversationSlots): SearchParams | null {
  if (!slots.city || !slots.checkIn || !slots.checkOut || slots.adults == null) {
    return null;
  }

  return {
    city: slots.city,
    checkIn: slots.checkIn,
    checkOut: slots.checkOut,
    adults: slots.adults,
    children: slots.children ?? 0,
    rooms: slots.rooms ?? 1,
    priceMin: slots.priceMin,
    priceMax: slots.budgetMax && slots.budgetMax > 0 ? slots.budgetMax : undefined,
    ratingMin: slots.ratingMin,
    propertyTypes: slots.propertyTypes,
    amenities: slots.mustHaveAmenities,
    page: 1,
    limit: 20,
    includeMapPins: true,
  };
}

export function buildVerifiedInputs(slots: ConversationSlots): VerifiedSearchInputs | null {
  const params = slotsToSearchParams(slots);
  if (!params) return null;

  const inputs: VerifiedSearchInputs = {
    city: params.city,
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    adults: params.adults ?? 2,
    children: params.children ?? 0,
    rooms: params.rooms ?? 1,
  };

  if (params.priceMin != null) inputs.priceMin = params.priceMin;
  if (params.priceMax != null) inputs.budgetMax = params.priceMax;
  if (params.ratingMin != null) inputs.ratingMin = params.ratingMin;
  if (params.propertyTypes?.length) inputs.propertyTypes = params.propertyTypes;
  if (params.amenities?.length) inputs.amenities = params.amenities;

  return inputs;
}

export async function searchFromSlots(slots: ConversationSlots): Promise<SearchResult | null> {
  const params = slotsToSearchParams(slots);
  if (!params) return null;
  return searchListings(params);
}

export { getListingById, getListingReviews };
