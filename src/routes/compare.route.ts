import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { config } from "../config";
import { cacheGet, cacheKey, cacheSet } from "../lib/cache";
import { getOpenAI, hasOpenAI } from "../lib/openai";

export const compareRouter = Router();

compareRouter.post("/compare", async (req, res) => {
  const body = z
    .object({
      listingIds: z.array(z.string()).min(2).max(5),
      checkIn: z.string().optional(),
      checkOut: z.string().optional(),
    })
    .safeParse(req.body);

  if (!body.success) {
    res.fail(400, "Provide 2–5 listingIds");
    return;
  }

  const key = cacheKey("compare:v1", body.data as Record<string, unknown>);
  const cached = await cacheGet<{ listings: unknown[]; verdict: string }>(key);
  if (cached) {
    res.success(cached);
    return;
  }

  const listings = await prisma.listing.findMany({
    where: { id: { in: body.data.listingIds } },
  });

  if (listings.length < 2) {
    res.fail(404, "Listings not found");
    return;
  }

  const cards = listings.map((l) => ({
    id: l.id,
    name: l.name,
    price: l.price,
    rating: l.ratingAvg,
    reviewCount: l.reviewCount,
    amenities: l.amenities,
    reviewSummary: l.reviewSummary,
    aspectScores: l.aspectScores,
  }));

  let verdict = "Compare listings by price, rating, and amenities for your stay.";
  if (hasOpenAI()) {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: config.openai.model,
      temperature: config.openai.temperature,
      messages: [
        {
          role: "system",
          content: "You compare short-term rental listings in 2-3 sentences. Be factual.",
        },
        {
          role: "user",
          content: JSON.stringify(cards),
        },
      ],
    });
    verdict = completion.choices[0]?.message?.content ?? verdict;
  }

  const result = { listings: cards, verdict };
  await cacheSet(key, result, config.cache.compareTtlSeconds);
  res.success(result);
});
