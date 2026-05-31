import { prisma } from "../lib/prisma";
import { config } from "../config";
import { cacheGet, cacheSet } from "../lib/cache";

const listingInclude = {
  city: { select: { slug: true, name: true } },
  neighbourhood: { select: { name: true, slug: true } },
} as const;

type ListingWithRelations = NonNullable<Awaited<ReturnType<typeof getListingById>>>;

export type ListingDetail = {
  id: string;
  name: string;
  description: string | null;
  propertyType: string;
  roomType: string;
  accommodates: number;
  bedrooms: number | null;
  beds: number | null;
  bathrooms: number | null;
  price: number | null;
  latitude: number;
  longitude: number;
  amenities: string[];
  photos: string[];
  host: { id: string | null; name: string | null };
  ratingAvg: number | null;
  reviewCount: number;
  reviewSummary: string | null;
  aspectScores: unknown;
  city: { slug: string; name: string };
  neighbourhood: { name: string; slug: string } | null;
  sourceUrl: string | null;
};

export function toListingDetail(listing: ListingWithRelations): ListingDetail {
  return {
    id: listing.id,
    name: listing.name,
    description: listing.description,
    propertyType: listing.propertyType,
    roomType: listing.roomType,
    accommodates: listing.accommodates,
    bedrooms: listing.bedrooms,
    beds: listing.beds,
    bathrooms: listing.bathrooms,
    price: listing.price,
    latitude: listing.latitude,
    longitude: listing.longitude,
    amenities: listing.amenities,
    photos: listing.photos,
    host: { id: listing.hostId, name: listing.hostName },
    ratingAvg: listing.ratingAvg,
    reviewCount: listing.reviewCount,
    reviewSummary: listing.reviewSummary,
    aspectScores: listing.aspectScores,
    city: listing.city,
    neighbourhood: listing.neighbourhood,
    sourceUrl: listing.sourceUrl,
  };
}

export async function getListingById(id: string) {
  return prisma.listing.findUnique({
    where: { id },
    include: listingInclude,
  });
}

export async function getListingDetail(id: string): Promise<ListingDetail | null> {
  const key = `listing:detail:v1:${id}`;
  const cached = await cacheGet<ListingDetail>(key);
  if (cached) return cached;

  const listing = await getListingById(id);
  if (!listing) return null;

  const detail = toListingDetail(listing);
  await cacheSet(key, detail, config.cache.listingTtlSeconds);
  return detail;
}

export type WishlistListing = ListingDetail & { savedAt: string };

export function wishlistCacheKey(token: string): string {
  return `wishlist:v1:${token}`;
}

export async function getWishlistListings(token: string): Promise<WishlistListing[]> {
  const key = wishlistCacheKey(token);
  const cached = await cacheGet<WishlistListing[]>(key);
  if (cached) return cached;

  const items = await prisma.wishlistItem.findMany({
    where: { token },
    orderBy: { createdAt: "desc" },
    select: { listingId: true, createdAt: true },
  });

  if (items.length === 0) {
    await cacheSet(key, [], config.cache.wishlistTtlSeconds);
    return [];
  }

  const listings = await prisma.listing.findMany({
    where: { id: { in: items.map((i) => i.listingId) } },
    include: listingInclude,
  });

  const byId = new Map(listings.map((l) => [l.id, l]));

  const result = items.flatMap((item) => {
    const listing = byId.get(item.listingId);
    if (!listing) return [];
    return [{ ...toListingDetail(listing), savedAt: item.createdAt.toISOString() }];
  });

  await cacheSet(key, result, config.cache.wishlistTtlSeconds);
  return result;
}

export async function getListingCalendar(id: string, from?: string, to?: string) {
  const where: { listingId: string; date?: { gte?: Date; lte?: Date } } = { listingId: id };
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(`${from}T00:00:00.000Z`);
    if (to) where.date.lte = new Date(`${to}T00:00:00.000Z`);
  }

  return prisma.calendarDay.findMany({
    where,
    orderBy: { date: "asc" },
    take: 366,
  });
}

export async function getListingReviews(
  id: string,
  page: number,
  limit: number,
  topic?: string
) {
  const where: { listingId: string; text?: { contains: string; mode: "insensitive" } } = {
    listingId: id,
  };
  if (topic) {
    where.text = { contains: topic, mode: "insensitive" };
  }

  const [items, total] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.review.count({ where }),
  ]);

  return { items, total };
}

export function buildPriceQuote(pricePerNight: number, checkIn: string, checkOut: string) {
  const start = new Date(`${checkIn}T00:00:00.000Z`);
  const end = new Date(`${checkOut}T00:00:00.000Z`);
  const nights = Math.max(0, Math.ceil((end.getTime() - start.getTime()) / 86400000));
  const subtotal = pricePerNight * nights;
  const taxesFeesMock = Math.round(subtotal * 0.12 * 100) / 100;
  const total = subtotal + taxesFeesMock;

  return {
    nights,
    nightlyRate: pricePerNight,
    subtotal,
    taxesFeesMock,
    total,
    currency: "EUR",
  };
}
