import { Router } from "express";
import { z } from "zod";
import pLimit from "p-limit";
import { prisma } from "../lib/prisma";
import { config } from "../config";
import { cacheGet, cacheSet } from "../lib/cache";

type ListingSummary = {
  id: string;
  name: string;
  reviewSummary: string | null;
  ratingAvg: number | null;
  reviewCount: number;
};

type SummaryResult = ListingSummary | { id: string; error: "not_found" };

function summaryCacheKey(listingId: string): string {
  return `batch:summary:v1:${listingId}`;
}

async function getListingSummary(id: string): Promise<SummaryResult> {
  const key = summaryCacheKey(id);
  const cached = await cacheGet<ListingSummary>(key);
  if (cached) return cached;

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

  if (!listing) {
    return { id, error: "not_found" };
  }

  const summary: ListingSummary = {
    id: listing.id,
    name: listing.name,
    reviewSummary: listing.reviewSummary,
    ratingAvg: listing.ratingAvg,
    reviewCount: listing.reviewCount,
  };

  await cacheSet(key, summary, config.cache.summaryTtlSeconds);
  return summary;
}

export const batchRouter = Router();

batchRouter.post("/batch/summaries", async (req, res) => {
  const body = z.object({ listingIds: z.array(z.string()).max(20) }).safeParse(req.body);
  if (!body.success) {
    res.fail(400, "Up to 20 listingIds allowed");
    return;
  }

  const limit = pLimit(5);
  const summaries = await Promise.all(
    body.data.listingIds.map((id) => limit(() => getListingSummary(id)))
  );

  res.success({ summaries });
});
