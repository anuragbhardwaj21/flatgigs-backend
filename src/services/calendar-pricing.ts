import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

export async function getStayNightlyPrices(
  listingIds: string[],
  checkIn: Date,
  checkOut: Date
): Promise<Map<string, number>> {
  if (listingIds.length === 0) {
    return new Map();
  }

  const rows = await prisma.$queryRaw<{ listing_id: string; avg_price: number }[]>`
    SELECT listing_id, AVG(price)::float AS avg_price
    FROM calendar_days
    WHERE listing_id IN (${Prisma.join(listingIds)})
      AND date >= ${checkIn}::date
      AND date < ${checkOut}::date
      AND available = true
      AND price IS NOT NULL
      AND price > 0
    GROUP BY listing_id
  `;

  return new Map(rows.map((r) => [r.listing_id, Number(r.avg_price)]));
}
