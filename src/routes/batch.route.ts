import { Router } from "express";
import { z } from "zod";
import pLimit from "p-limit";
import { prisma } from "../lib/prisma";

export const batchRouter = Router();

batchRouter.post("/batch/summaries", async (req, res) => {
  const body = z.object({ listingIds: z.array(z.string()).max(20) }).safeParse(req.body);
  if (!body.success) {
    res.fail(400, "Up to 20 listingIds allowed");
    return;
  }

  const limit = pLimit(5);
  const summaries = await Promise.all(
    body.data.listingIds.map((id) =>
      limit(async () => {
        const listing = await prisma.listing.findUnique({
          where: { id },
          select: {
            id: true,
            name: true,
            reviewSummary: true,
            ratingAvg: true,
            reviewCount: true,
          },
        });
        return listing
          ? {
              id: listing.id,
              name: listing.name,
              reviewSummary: listing.reviewSummary,
              ratingAvg: listing.ratingAvg,
              reviewCount: listing.reviewCount,
            }
          : { id, error: "not_found" };
      })
    )
  );

  res.success({ summaries });
});
