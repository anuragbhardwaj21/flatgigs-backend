import { createHash } from "crypto";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { config } from "../config";
import { findAvailableListingIds } from "./availability.query";
import { getStayNightlyPrices } from "./calendar-pricing";

export type SearchParams = {
  city: string;
  checkIn: string;
  checkOut: string;
  adults?: number;
  children?: number;
  rooms?: number;
  priceMin?: number;
  priceMax?: number;
  ratingMin?: number;
  propertyTypes?: string[];
  amenities?: string[];
  sort?: string;
  lat?: number;
  lng?: number;
  bounds?: string;
  page?: number;
  limit?: number;
  includeMapPins?: boolean;
};

function parseDate(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function cacheKey(params: SearchParams): string {
  const normalized = JSON.stringify(params);
  const hash = createHash("sha256").update(normalized).digest("hex").slice(0, 16);
  return `search:v1:${hash}`;
}

export type SearchResult = {
  items: {
    id: string;
    name: string;
    photos: string[];
    propertyType: string;
    roomType: string;
    pricePerNight: number;
    totalForStay: number;
    rating: number | null;
    reviewCount: number;
    amenities: string[];
    latitude: number;
    longitude: number;
    distanceKm?: number;
  }[];
  total: number;
  facets: {
    priceRange: { min: number; max: number };
    propertyTypes: Record<string, number>;
    amenities: Record<string, number>;
  };
  mapPins: {
    id: string;
    lat: number;
    lng: number;
    pricePerNight: number;
    ratingAvg: number;
  }[];
};

export async function searchListings(params: SearchParams): Promise<SearchResult | null> {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 20, 50);
  const includeMapPins = params.includeMapPins !== false;

  const cached = await redis.get(cacheKey(params));
  if (cached) {
    return JSON.parse(cached) as SearchResult;
  }

  const city = await prisma.city.findFirst({
    where: { OR: [{ slug: params.city }, { id: params.city }] },
  });

  if (!city) {
    return null;
  }

  const checkIn = parseDate(params.checkIn);
  const checkOut = parseDate(params.checkOut);

  const baseWhere: Record<string, unknown> = {
    cityId: city.id,
  };

  if (params.priceMin != null || params.priceMax != null) {
    baseWhere.price = {
      ...(params.priceMin != null ? { gte: params.priceMin } : {}),
      ...(params.priceMax != null ? { lte: params.priceMax } : {}),
    };
  }

  if (params.ratingMin != null) {
    baseWhere.ratingAvg = { gte: params.ratingMin };
  }

  if (params.propertyTypes?.length) {
    baseWhere.propertyType = { in: params.propertyTypes };
  }

  if (params.amenities?.length) {
    baseWhere.amenities = { hasEvery: params.amenities };
  }

  const candidates = await prisma.listing.findMany({
    where: baseWhere,
    select: { id: true },
  });

  const candidateIds = candidates.map((c) => c.id);
  const availableIds = await findAvailableListingIds(candidateIds, checkIn, checkOut);

  if (availableIds.length === 0) {
    const empty = {
      items: [],
      total: 0,
      facets: {
        priceRange: { min: 0, max: 0 },
        propertyTypes: {},
        amenities: {},
      },
      mapPins: [],
    };
    await redis.setex(cacheKey(params), config.cache.searchTtlSeconds, JSON.stringify(empty));
    return empty;
  }

  let listings = await prisma.listing.findMany({
    where: { id: { in: availableIds } },
  });

  if (params.bounds) {
    const [neLat, neLng, swLat, swLng] = params.bounds.split(",").map(Number);
    listings = listings.filter(
      (l) => l.latitude <= neLat && l.latitude >= swLat && l.longitude <= neLng && l.longitude >= swLng
    );
  }

  const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / 86400000);
  const nightlyPrices = await getStayNightlyPrices(
    listings.map((l) => l.id),
    checkIn,
    checkOut
  );

  const withMeta = listings.map((l) => {
    const distanceKm =
      params.lat != null && params.lng != null
        ? haversineKm(params.lat, params.lng, l.latitude, l.longitude)
        : undefined;
    const pricePerNight = nightlyPrices.get(l.id) ?? l.price ?? 0;
    return {
      listing: l,
      distanceKm,
      pricePerNight,
      totalForStay: pricePerNight * nights,
    };
  });

  const sort = params.sort ?? "rating";
  withMeta.sort((a, b) => {
    switch (sort) {
      case "price_asc":
        return (a.pricePerNight ?? 0) - (b.pricePerNight ?? 0);
      case "price_desc":
        return (b.pricePerNight ?? 0) - (a.pricePerNight ?? 0);
      case "distance":
        return (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999);
      case "popularity":
        return b.listing.reviewCount - a.listing.reviewCount;
      default:
        return (b.listing.ratingAvg ?? 0) - (a.listing.ratingAvg ?? 0);
    }
  });

  const total = withMeta.length;
  const offset = (page - 1) * limit;
  const pageItems = withMeta.slice(offset, offset + limit);

  const items = pageItems.map(({ listing, distanceKm, pricePerNight, totalForStay }) => ({
    id: listing.id,
    name: listing.name,
    photos: listing.photos,
    propertyType: listing.propertyType,
    roomType: listing.roomType,
    pricePerNight,
    totalForStay,
    rating: listing.ratingAvg,
    reviewCount: listing.reviewCount,
    amenities: listing.amenities,
    latitude: listing.latitude,
    longitude: listing.longitude,
    distanceKm,
  }));

  const facets = buildFacets(
    withMeta.map((w) => ({
      propertyType: w.listing.propertyType,
      amenities: w.listing.amenities,
      price: w.pricePerNight > 0 ? w.pricePerNight : w.listing.price,
    }))
  );

  const mapPins = includeMapPins
    ? withMeta.map(({ listing, pricePerNight }) => ({
        id: listing.id,
        lat: listing.latitude,
        lng: listing.longitude,
        pricePerNight: pricePerNight ?? 0,
        ratingAvg: listing.ratingAvg ?? 0,
      }))
    : [];

  const result = { items, total, facets, mapPins };
  await redis.setex(cacheKey(params), config.cache.searchTtlSeconds, JSON.stringify(result));
  return result;
}

function buildFacets(listings: { propertyType: string; amenities: string[]; price: number | null }[]) {
  const propertyTypes: Record<string, number> = {};
  const amenities: Record<string, number> = {};
  let min = Infinity;
  let max = 0;

  for (const l of listings) {
    propertyTypes[l.propertyType] = (propertyTypes[l.propertyType] ?? 0) + 1;
    for (const a of l.amenities) {
      amenities[a] = (amenities[a] ?? 0) + 1;
    }
    if (l.price != null) {
      min = Math.min(min, l.price);
      max = Math.max(max, l.price);
    }
  }

  return {
    priceRange: { min: min === Infinity ? 0 : min, max },
    propertyTypes,
    amenities,
  };
}
