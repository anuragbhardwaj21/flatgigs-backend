import { prisma } from "../lib/prisma";

export async function getListingById(id: string) {
  return prisma.listing.findUnique({
    where: { id },
    include: {
      city: { select: { slug: true, name: true } },
      neighbourhood: { select: { name: true, slug: true } },
    },
  });
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
