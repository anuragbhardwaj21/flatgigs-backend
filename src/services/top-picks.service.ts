import { prisma } from "../lib/prisma";
import { config } from "../config";
import { cacheGet, cacheKey, cacheSet } from "../lib/cache";

export type TopPickItem = {
  id: string;
  name: string;
  photo: string | null;
  propertyType: string;
  roomType: string;
  pricePerNight: number;
  rating: number | null;
  reviewCount: number;
  reviewSummary: string | null;
  city: { slug: string; name: string };
  badge: string;
};

export type TopPicksParams = {
  city?: string;
  limit?: number;
};

function cacheKeyFor(params: TopPicksParams): string {
  return cacheKey("top-picks:v1", { ...params, limit: Math.min(params.limit ?? 12, 30) });
}

function toCard(
  listing: {
    id: string;
    name: string;
    photos: string[];
    propertyType: string;
    roomType: string;
    price: number | null;
    ratingAvg: number | null;
    reviewCount: number;
    reviewSummary: string | null;
    city: { slug: string; name: string };
  },
  badge: string
): TopPickItem {
  return {
    id: listing.id,
    name: listing.name,
    photo: listing.photos[0] ?? null,
    propertyType: listing.propertyType,
    roomType: listing.roomType,
    pricePerNight: listing.price ?? 0,
    rating: listing.ratingAvg,
    reviewCount: listing.reviewCount,
    reviewSummary: listing.reviewSummary,
    city: listing.city,
    badge,
  };
}

export async function getTopPicks(params: TopPicksParams) {
  const limit = Math.min(params.limit ?? 12, 30);
  const cached = await cacheGet<{ picks: TopPickItem[] }>(cacheKeyFor({ ...params, limit }));
  if (cached) {
    return cached;
  }

  const cityFilter = params.city
    ? await prisma.city.findFirst({
        where: { OR: [{ slug: params.city }, { id: params.city }] },
      })
    : null;

  if (params.city && !cityFilter) {
    return null;
  }

  const baseWhere = {
    price: { not: null },
    ratingAvg: { not: null, gte: 4.5 },
    reviewCount: { gte: 10 },
    ...(cityFilter ? { cityId: cityFilter.id } : {}),
  };

  const [topRated, mostReviewed, bestValue] = await Promise.all([
    prisma.listing.findMany({
      where: baseWhere,
      orderBy: [{ ratingAvg: "desc" }, { reviewCount: "desc" }],
      take: limit,
      include: { city: { select: { slug: true, name: true } } },
    }),
    prisma.listing.findMany({
      where: baseWhere,
      orderBy: [{ reviewCount: "desc" }, { ratingAvg: "desc" }],
      take: Math.ceil(limit / 2),
      include: { city: { select: { slug: true, name: true } } },
    }),
    prisma.listing.findMany({
      where: {
        ...baseWhere,
        ratingAvg: { not: null, gte: 4.3 },
      },
      orderBy: [{ price: "asc" }, { ratingAvg: "desc" }],
      take: Math.ceil(limit / 2),
      include: { city: { select: { slug: true, name: true } } },
    }),
  ]);

  const seen = new Set<string>();
  const picks: TopPickItem[] = [];

  const push = (listing: (typeof topRated)[number], badge: string) => {
    if (seen.has(listing.id) || picks.length >= limit) return;
    seen.add(listing.id);
    picks.push(toCard(listing, badge));
  };

  for (const l of topRated.slice(0, Math.ceil(limit * 0.6))) {
    push(l, "Top rated");
  }
  for (const l of mostReviewed) {
    push(l, "Guest favorite");
  }
  for (const l of bestValue) {
    push(l, "Great value");
  }
  for (const l of topRated) {
    push(l, "Top rated");
  }

  if (!picks.length) {
    const fallback = await prisma.listing.findMany({
      where: cityFilter ? { cityId: cityFilter.id } : {},
      orderBy: [{ reviewCount: "desc" }, { ratingAvg: "desc" }],
      take: limit,
      include: { city: { select: { slug: true, name: true } } },
    });
    for (const l of fallback) {
      push(l, "Top pick");
    }
  }

  const result = { picks };
  await cacheSet(cacheKeyFor({ ...params, limit }), result, config.cache.topPicksTtlSeconds);
  return result;
}
