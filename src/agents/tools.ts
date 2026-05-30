import { searchListings, type SearchParams, type SearchResult } from "../services/search.service";
import { getListingById, getListingReviews } from "../services/listing.service";
import type { ConversationSlots } from "./schemas";

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
    priceMax: slots.budgetMax,
    ratingMin: slots.ratingMin,
    propertyTypes: slots.propertyTypes,
    amenities: slots.mustHaveAmenities,
    page: 1,
    limit: 20,
    includeMapPins: true,
  };
}

export async function searchFromSlots(slots: ConversationSlots): Promise<SearchResult | null> {
  const params = slotsToSearchParams(slots);
  if (!params) return null;
  return searchListings(params);
}

export { getListingById, getListingReviews };
