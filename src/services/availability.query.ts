import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

export async function findAvailableListingIds(
  listingIds: string[],
  checkIn: Date,
  checkOut: Date
): Promise<string[]> {
  if (listingIds.length === 0) {
    return [];
  }

  const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / 86400000);
  if (nights <= 0) {
    return [];
  }

  const rows = await prisma.$queryRaw<{ listing_id: string; cnt: bigint }[]>`
    SELECT listing_id, COUNT(*)::bigint AS cnt
    FROM calendar_days
    WHERE listing_id IN (${Prisma.join(listingIds)})
      AND date >= ${checkIn}::date
      AND date < ${checkOut}::date
      AND available = true
    GROUP BY listing_id
    HAVING COUNT(*) = ${nights}
  `;

  return rows.map((r) => r.listing_id);
}
